import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_ORDER_UPLOAD_SEARCH_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";
import { getStoreConfig } from "@/lib/store/store-config";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// GET — order-upload attachments search (GraphQL: kleverOrderUploadSearch).
// Replaces REST /orderupload/search. Maps the legacy query params: order_id →
// orderIncrementId, document_type → documents, invoice_due → invoiceDue, plus paging.
// Returns { items, total_count, page_size, current_page, total_pages } unchanged.
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized", items: [], total_count: 0 }, { status: 401 });

        const sp = new URL(request.url).searchParams;
        const pageSize = parseInt(sp.get("pageSize") || "10", 10) || 10;
        const currentPage = parseInt(sp.get("currentPage") || "1", 10) || 1;
        const orderId = sp.get("order_id");
        const documentType = sp.get("document_type");
        const invoiceDue = sp.get("invoice_due");
        const company = sp.get("company");
        const companyCode = sp.get("company_code");

        const variables: Record<string, any> = { pageSize, currentPage };
        if (orderId) variables.orderIncrementId = orderId;
        if (documentType && documentType !== "All") variables.documents = documentType;
        if (invoiceDue && invoiceDue !== "All") variables.invoiceDue = invoiceDue;

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: toStoreCode(getLocaleFromRequest(request), request),
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query: KLEVER_ORDER_UPLOAD_SEARCH_QUERY, variables }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("[order-attachments/search] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ message: json.errors[0]?.message || "Failed to search attachments", items: [], total_count: 0 }, { status: 502 });
        }

        const r = json?.data?.kleverOrderUploadSearch;
        let items: any[] = Array.isArray(r?.items) ? r.items : [];

        // Client-side filtering for company/company_code (GraphQL query has no these variables)
        const filteredLocally = (company && company !== "All") || !!companyCode;
        if (company && company !== "All") {
            const companyLower = company.toLowerCase();
            items = items.filter((item: any) => {
                const name = (item.company_name || "").toLowerCase();
                const code = (item.company_code || "").toLowerCase();
                return name === companyLower || code === companyLower || name.includes(companyLower);
            });
        }
        if (companyCode) {
            const codeLower = companyCode.toLowerCase().trim();
            items = items.filter((item: any) =>
                (item.company_code || "").toLowerCase().includes(codeLower)
            );
        }

        // Magento's "Created On" ("10-10-2026"): created_at is UTC, shown in Magento's store timezone.
        const store = toStoreCode(getLocaleFromRequest(request), request);
        const tz = (await getStoreConfig(store, getLocaleFromRequest(request)))?.timezone ?? null;
        // Magento shows Created On and Invoice Due as "dd-mm-yyyy" in its store timezone.
        const createdOn = (utc: string | null | undefined): string | null => {
            if (!utc || !tz) return null;
            const d = new Date(/\dT\d|Z$/.test(utc) ? utc : `${utc.replace(" ", "T")}Z`);
            if (Number.isNaN(d.getTime())) return null;
            const parts = Object.fromEntries(
                new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz })
                    .formatToParts(d).map((p) => [p.type, p.value]),
            );
            return `${parts.day}-${parts.month}-${parts.year}`;
        };
        items = items.map((item: any) => ({
            ...item,
            created_on_label: createdOn(item.created_at),
            invoice_due_label: createdOn(item.invoice_due),
        }));

        return NextResponse.json({
            items,
            // Magento's total across all pages (the page's own length only when company filters
            // were applied here, since Magento cannot filter by company itself).
            total_count: filteredLocally ? items.length : (r?.total_count ?? items.length),
            page_size: r?.page_size ?? pageSize,
            current_page: r?.current_page ?? currentPage,
            total_pages: r?.total_pages ?? 0,
        });
    } catch (error: any) {
        console.error("[order-attachments/search] error:", error.message);
        return NextResponse.json({ message: error.message || "Server error searching attachments", items: [], total_count: 0 }, { status: 500 });
    }
}
