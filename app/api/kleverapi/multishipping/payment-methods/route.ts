import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_MULTISHIPPING_PAYMENT_METHODS_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// GET — payment methods of Magento's multi-address billing step for the selected website +
// language (GraphQL kleverMultishippingPaymentMethods; call after multishipping start).
// Magento's list, titles and is_available are returned unchanged; Magento's errors
// (e.g. "Multishipping not started…") are passed on. Returns { methods[{ code, title, is_available }] }.
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const store = toStoreCode(getLocaleFromRequest(request), request);
        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query: KLEVER_MULTISHIPPING_PAYMENT_METHODS_QUERY }),
            cache: "no-store",
        });
        const json = await res.json().catch(() => null);

        // TEMPORARY diagnostic (?raw=1, logged-in only): Magento's raw answers for this store view —
        // GraphQL kleverMultishippingPaymentMethods (above) and REST multishipping/payment-methods —
        // with the endpoint, store and cache headers. Remove after the check.
        if (new URL(request.url).searchParams.get("raw") === "1") {
            const base = process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "";
            const restUrl = `${base}/rest/${store}/V1/kleverapi/multishipping/payment-methods`;
            const rest = await fetch(restUrl, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
                .then(async (r) => ({ status: r.status, cache: r.headers.get("cf-cache-status"), body: await r.json().catch(() => null) }))
                .catch((e) => ({ status: 0, cache: null, body: String(e) }));
            return NextResponse.json({
                checked_at: new Date().toISOString(),
                store,
                token_sent: `${token.slice(0, 6)}…`,
                graphql: { endpoint: MAGENTO_GRAPHQL, status: res.status, cache: res.headers.get("cf-cache-status"), body: json },
                rest: { endpoint: restUrl, ...rest },
            }, { headers: { "Cache-Control": "no-store" } });
        }

        if (!json || (Array.isArray(json.errors) && json.errors.length > 0)) {
            const err = json?.errors?.[0];
            const unauthorized = err?.extensions?.category === "graphql-authorization";
            console.error(`[multishipping/payment-methods] ${store}:`, JSON.stringify(json?.errors ?? null).slice(0, 300));
            return NextResponse.json({ message: err?.message || "Payment methods unavailable" }, { status: unauthorized ? 401 : 400 });
        }
        const list = json?.data?.kleverMultishippingPaymentMethods;
        const methods = (Array.isArray(list) ? list : [])
            .filter((m: any) => m?.code)
            .map((m: any) => ({ code: String(m.code), title: String(m.title ?? ""), is_available: m.is_available === true }));
        return NextResponse.json({ methods });
    } catch (error: any) {
        console.error("[multishipping/payment-methods] error:", error?.message);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
