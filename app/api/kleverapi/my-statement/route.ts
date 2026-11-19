import { NextResponse } from "next/server";
import { getBaseUrl, getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_MY_STATEMENT_QUERY, CUSTOMER_CODE_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// GET ?fromDate&toDate&type — the logged-in customer's own statement for the selected website +
// language. Magento is the only source; the PDF is passed through unchanged under Magento's name.
//
// Every statement is checked against the logged-in customer's own account code from Magento
// (customer.customer_code, Store header + customer token) before it is delivered:
//   1. GraphQL kleverMyStatement → pdf_url — used when its PDF is for that account.
//   2. Otherwise Klever REST /rest/<store>/V1/kleverapi/my-statement (same values) — used when its
//      PDF is for that account.
//   3. Otherwise an error: a statement of another account is never delivered.
// No default dates, type, customer or account number.

type Source = "graphql" | "rest";
interface Candidate { source: Source; pdfUrl?: string; pdf?: Response; error?: string }


/** Account the PDF belongs to, as Magento names it (account_statement_<ACCOUNT>_<date>_<time>.pdf). */
function pdfBelongsTo(nameOrUrl: string, accountCode: string): boolean {
    const name = decodeURIComponent((nameOrUrl.split("?")[0].split("/").pop() || ""));
    return name.split(/[_.]/).includes(accountCode);
}

async function fromGraphql(store: string, token: string, fromDate: string, toDate: string, statementType: string): Promise<Candidate> {
    const res = await fetch(MAGENTO_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: KLEVER_MY_STATEMENT_QUERY, variables: { fromDate, toDate, statementType } }),
        cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!json || json.errors?.length) return { source: "graphql", error: json?.errors?.[0]?.message || "GraphQL statement failed" };
    const pdfUrl = json?.data?.kleverMyStatement?.pdf_url;
    return pdfUrl ? { source: "graphql", pdfUrl } : { source: "graphql", error: "No statement" };
}

async function fromRest(req: Request, token: string, fromDate: string, toDate: string, statementType: string): Promise<Candidate> {
    const url = `${getBaseUrl(req)}/my-statement?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&type=${encodeURIComponent(statementType)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf, application/json", platform: "web" }, cache: "no-store" });
    const type = res.headers.get("content-type") || "";
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        return { source: "rest", error: body?.message || `REST statement failed (${res.status})` };
    }
    if (type.includes("application/pdf")) return { source: "rest", pdf: res };
    const body = await res.json().catch(() => null);
    const pdfUrl = body?.pdf_url || (Array.isArray(body) ? body[0]?.pdf_url : undefined);
    return pdfUrl ? { source: "rest", pdfUrl } : { source: "rest", error: body?.message || "No statement" };
}

function fileName(c: Candidate, pdf: Response): string {
    const disp = pdf.headers.get("content-disposition") || "";
    const m = disp.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    if (m) return decodeURIComponent(m[1] || m[2]);
    return c.pdfUrl ? decodeURIComponent(new URL(c.pdfUrl).pathname.split("/").pop() || "") : "";
}

export async function GET(request: Request) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const fromDate = searchParams.get("fromDate") || "";
        const toDate = searchParams.get("toDate") || "";
        const statementType = searchParams.get("type") || "";
        if (!fromDate || !toDate || !statementType) {
            return NextResponse.json({ message: "fromDate, toDate and type are required" }, { status: 400 });
        }
        const store = toStoreCode(getLocaleFromRequest(request), request);

        // The logged-in customer's own account code on this website (Magento).
        const me = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query: CUSTOMER_CODE_QUERY }),
            cache: "no-store",
        }).then((r) => r.json()).catch(() => null);
        if (me?.errors?.some((e: any) => e?.extensions?.category === "graphql-authorization")) {
            return NextResponse.json({ message: me.errors[0].message }, { status: 401 });
        }
        const accountCode: string = String(me?.data?.customer?.customer_code ?? "").trim();

        const tried: Candidate[] = [];
        let chosen: { c: Candidate; pdf: Response; name: string } | null = null;
        for (const load of [
            () => fromGraphql(store, token, fromDate, toDate, statementType),
            () => fromRest(request, token, fromDate, toDate, statementType),
        ]) {
            const c = await load();
            tried.push(c);
            if (c.error) continue;
            const pdf = c.pdf ?? await fetch(c.pdfUrl!, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
            if (!pdf.ok) { c.error = `PDF download failed (${pdf.status})`; continue; }
            const name = fileName(c, pdf);
            // Without an account code from Magento there is nothing to check against: Magento's
            // first statement is used. With one, the PDF must be for that account.
            if (!accountCode || pdfBelongsTo(name, accountCode)) { chosen = { c, pdf, name }; break; }
            c.error = `Statement is for another account (${name})`;
        }

        // TEMPORARY diagnostic (?info=1, logged-in only) — what each Magento API returned. Remove after the check.
        if (searchParams.get("info") === "1") {
            return NextResponse.json({
                checked_at: new Date().toISOString(),
                sent_to_magento: { store, fromDate, toDate, statementType },
                customer_account_code: accountCode || null,
                sources: tried.map((c) => ({ source: c.source, pdf_url: c.pdfUrl ?? null, direct_pdf: !!c.pdf, error: c.error ?? null })),
                delivered_from: chosen?.c.source ?? null,
                delivered_file: chosen?.name ?? null,
            }, { headers: { "Cache-Control": "no-store" } });
        }

        if (!chosen) {
            const wrongAccount = tried.some((c) => c.error?.startsWith("Statement is for another account"));
            console.error(`[my-statement] ${store}: no statement for account ${accountCode || "?"}:`, JSON.stringify(tried.map((c) => ({ s: c.source, e: c.error }))));
            return NextResponse.json(
                { message: wrongAccount ? null : tried.find((c) => c.error)?.error ?? null, code: wrongAccount ? "WRONG_ACCOUNT" : "NO_STATEMENT" },
                { status: wrongAccount ? 409 : 502 },
            );
        }

        return new Response(await chosen.pdf.arrayBuffer(), {
            headers: {
                "Content-Type": chosen.pdf.headers.get("content-type") || "application/pdf",
                "Content-Disposition": chosen.name ? `attachment; filename="${chosen.name.replace(/"/g, "")}"` : "attachment",
                "Cache-Control": "no-store",
            },
        });
    } catch (error: any) {
        console.error("[my-statement] Server error:", error);
        return NextResponse.json({ message: null }, { status: 500 });
    }
}
