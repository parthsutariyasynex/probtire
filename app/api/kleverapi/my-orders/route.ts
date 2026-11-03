import { NextRequest, NextResponse } from "next/server";
import { getRequestToken } from "@/lib/api/auth-helper";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { KLEVER_MY_ORDERS_QUERY, KLEVER_ORDER_FILTER_OPTIONS_QUERY } from "@/src/graphql/queries";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// kleverMyOrders only accepts pageSize + currentPage — no status/companyCode/orderNumber args.
// Filtering is done in-memory after fetching all pages.
const BATCH = 200;

// Status label → code map (cached 1h). Needed to normalise status for the dropdown filter.
let _statusMapCache: { value: Record<string, string>; expires: number } | null = null;

async function getStatusLabelToCode(token: string, store: string): Promise<Record<string, string>> {
    const now = Date.now();
    if (_statusMapCache && _statusMapCache.expires > now) return _statusMapCache.value;
    const map: Record<string, string> = {};
    try {
        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query: KLEVER_ORDER_FILTER_OPTIONS_QUERY }),
            cache: "no-store",
        });
        const json = await res.json();
        for (const o of json?.data?.kleverOrderFilterOptions?.status_options ?? []) {
            if (o?.label && o?.value) map[String(o.label).trim()] = String(o.value);
        }
        _statusMapCache = { value: map, expires: now + 60 * 60 * 1000 };
    } catch { /* fall back to empty map */ }
    return map;
}

const statusToCode = (label: any, map: Record<string, string>): string => {
    const l = String(label ?? "").trim();
    return map[l] ?? l.toLowerCase().replace(/\s+/g, "_");
};

// GET — role-aware order list via kleverMyOrders GraphQL resolver.
// Sales Person → company orders, Master Company → sub-account orders, Customer → own orders.
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized", items: [], total_count: 0 }, { status: 401 });

        const sp = new URL(request.url).searchParams;
        const pageSize = parseInt(sp.get("pageSize") || "10", 10) || 10;
        const currentPage = parseInt(sp.get("currentPage") || "1", 10) || 1;
        const statusFilter = sp.get("status") && sp.get("status") !== "All" ? sp.get("status")! : null;
        const orderNumberFilter = sp.get("orderNumber")?.trim() || null;
        const companyCodeFilter = sp.get("companyCode") && sp.get("companyCode") !== "All" ? sp.get("companyCode")! : null;

        const store = getLocaleFromRequest(request);
        const isAuthError = (msg: string) => /not authoriz|isn't authoriz|unauthor|invalid token|token expired|graphql-auth/i.test(msg || "");

        // Fetch ALL pages from kleverMyOrders (resolver handles role scoping).
        const allItems: any[] = [];
        for (let p = 1; p <= 100; p++) {
            const res = await fetch(MAGENTO_GRAPHQL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Store: store,
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ query: KLEVER_MY_ORDERS_QUERY, variables: { pageSize: BATCH, currentPage: p } }),
                cache: "no-store",
            });
            const json = await res.json();

            if (Array.isArray(json?.errors) && json.errors.length > 0) {
                const msg = json.errors[0]?.message || "";
                console.error("[my-orders] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
                if (isAuthError(msg)) {
                    return NextResponse.json({ message: "Session expired — please sign in again.", items: [], total_count: 0 }, { status: 401 });
                }
                return NextResponse.json({ message: msg, items: [], total_count: 0 }, { status: 502 });
            }

            const batch: any[] = Array.isArray(json?.data?.kleverMyOrders?.items) ? json.data.kleverMyOrders.items : [];
            allItems.push(...batch);
            if (batch.length < BATCH) break;
        }

        const [statusMap] = await Promise.all([getStatusLabelToCode(token, store)]);

        // In-memory filters (resolver has no filter args).
        let filtered = allItems;
        if (statusFilter) {
            filtered = filtered.filter(o => statusToCode(o.status, statusMap) === statusFilter);
        }
        if (orderNumberFilter) {
            filtered = filtered.filter(o => String(o.increment_id || "").includes(orderNumberFilter));
        }
        if (companyCodeFilter) {
            filtered = filtered.filter(o => o.company_code === companyCodeFilter);
        }

        const total = filtered.length;

        // Sort newest-first.
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        // Paginate.
        const start = (currentPage - 1) * pageSize;
        const pageItems = filtered.slice(start, start + pageSize);

        const items = pageItems.map((o: any) => ({
            entity_id: o.order_id,
            increment_id: o.increment_id,
            created_at: o.created_at,
            order_date: o.created_at,
            status: o.status_label ?? o.status,
            status_code: statusToCode(o.status, statusMap),
            grand_total: o.grand_total ?? 0,
            currency: o.currency_code ?? null,
            total_item_count: o.total_item_count ?? 0,
            company_code: o.company_code ?? null,
            company_name: o.company_name ?? null,
            ordered_by: o.ordered_by ?? null,
            sap_order_number: o.sap_order_number ?? null,
        }));

        return NextResponse.json({ items, total_count: total });
    } catch (error: any) {
        console.error("[my-orders] error:", error.message);
        return NextResponse.json({ message: error.message || "Server error fetching orders", items: [], total_count: 0 }, { status: 500 });
    }
}
