import { NextRequest, NextResponse } from "next/server";
import { getRequestToken } from "@/lib/api/auth-helper";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { getMagentoOrderHistoryLayout, getMagentoStatusText, type OrderHistoryColumnKey } from "@/src/lib/magentoOrderView";
import { KLEVER_MY_ORDERS_QUERY } from "@/src/graphql/queries";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";
const BATCH = 200;

type CustomerOrder = {
    number: string; code: string; label: string;
    /** the order's own values behind Magento's text columns (empty when the order has none) */
    values: Partial<Record<OrderHistoryColumnKey, string>>;
};

/** Every order's status (code + label) and text-column values, from kleverMyOrders. */
async function customerStatuses(store: string, token: string): Promise<CustomerOrder[]> {
    const out: CustomerOrder[] = [];
    for (let p = 1; p <= 100; p++) {
        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query: KLEVER_MY_ORDERS_QUERY, variables: { pageSize: BATCH, currentPage: p } }),
            cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!json || (Array.isArray(json.errors) && json.errors.length > 0)) {
            throw new Error(json?.errors?.[0]?.message || `kleverMyOrders failed (HTTP ${res.status})`);
        }
        const items: any[] = json?.data?.kleverMyOrders?.items ?? [];
        for (const o of items) {
            out.push({
                number: String(o?.increment_id ?? ""), code: String(o?.status ?? ""), label: String(o?.status_label ?? ""),
                values: {
                    company: String(o?.company_name ?? "").trim(),
                    companyCode: String(o?.company_code ?? "").trim(),
                    orderedBy: String(o?.ordered_by ?? "").trim(),
                    sapOrderNumber: String(o?.sap_order_number ?? "").trim(),
                },
            });
        }
        if (items.length < BATCH) break;
    }
    return out;
}

// GET — Magento's own My Orders page for the logged-in customer in the selected store view:
// the columns Magento shows for this account, header + action texts, the filter bar, the
// "no orders" message and the status texts Magento shows. Magento is the only source: when
// any of it cannot be read the route fails (502) and the page shows an error state.
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const store = toStoreCode(getLocaleFromRequest(request), request);
        const auth = `Bearer ${token}`;

        const [layout, statuses] = await Promise.all([
            getMagentoOrderHistoryLayout(store, auth),
            customerStatuses(store, token),
        ]);
        if (!layout) return NextResponse.json({ message: "Magento's My Orders page could not be read." }, { status: 502 });

        // Status text Magento shows for each status label kleverMyOrders returns:
        // first from the rows on Magento's first page (matched by order number), then — for
        // statuses not on it — from Magento's list filtered by that status.
        const statusLabels: Record<string, string> = {};
        const byNumber = new Map(statuses.map((s) => [s.number, s.label]));
        for (const r of layout.rows) {
            const label = byNumber.get(r.number);
            if (label && !statusLabels[label]) statusLabels[label] = r.status;
        }
        const missing = [...new Map(statuses.filter((s) => s.label && !statusLabels[s.label]).map((s) => [s.label, s.code])).entries()];
        const texts = await Promise.all(missing.map(([, code]) => getMagentoStatusText(code, store, auth)));
        missing.forEach(([label], i) => { if (texts[i]) statusLabels[label] = texts[i]!; });

        // What Magento shows in a text column when the order has no value (e.g. Company "N/A"):
        // Magento's rows matched to the same orders by number — where the order's own value is
        // empty but Magento's cell shows text, that text is Magento's empty-value text.
        const emptyTexts: Partial<Record<OrderHistoryColumnKey, string>> = {};
        const orderByNumber = new Map(statuses.map((s) => [s.number, s]));
        for (const r of layout.rows) {
            const o = orderByNumber.get(r.number);
            if (!o) continue;
            for (const [key, value] of Object.entries(o.values) as [OrderHistoryColumnKey, string][]) {
                const cell = r.cells[key];
                if (!emptyTexts[key] && value === "" && cell) emptyTexts[key] = cell;
            }
        }

        return NextResponse.json({
            columns: layout.columns,
            actions: layout.actions,
            status_labels: statusLabels,
            empty_texts: emptyTexts,
            filters: layout.filters,
            empty_message: layout.emptyMessage,
        });
    } catch (error: any) {
        console.error("[my-orders/layout] error:", error?.message || error);
        return NextResponse.json({ message: error?.message || "Magento's My Orders page could not be read." }, { status: 502 });
    }
}
