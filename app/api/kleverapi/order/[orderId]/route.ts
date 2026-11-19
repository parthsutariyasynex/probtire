import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { NextResponse } from "next/server";
import { KLEVER_PRINT_ORDER_QUERY, ORDER_CHECK_PERMISSION_QUERY, CUSTOMER_ORDER_VIEW_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";
import { getStoreConfig } from "@/lib/store/store-config";
import { getMagentoOrderViewExtras } from "@/src/lib/magentoOrderView";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// Map a kleverPrintOrder flat address → the REST order-address shape the detail UI reads
function mapOrderAddress(a: any) {
    if (!a) return null;
    return {
        firstname: a.name ?? "",
        lastname: "",
        company: a.company ?? null,
        street: Array.isArray(a.street) ? a.street : a.street ? [a.street] : [],
        city: a.city ?? null,
        region: a.region ?? null,
        postcode: a.postcode ?? null,
        country_id: a.country_id ?? null,
        telephone: a.telephone ?? null,
    };
}

// GET — order detail via kleverPrintOrder (keyed by entity_id).
/**
 * Magento's Order Check permission for this order (kleverPrintOrder.can_confirm_order).
 * false when Magento says no — or does not expose the field yet (then Magento's own rule cannot be
 * known, so the step is not offered; it appears as soon as Magento returns true).
 */
async function orderCheckAllowed(orderId: number, store: string, authHeader: string): Promise<boolean> {
    try {
        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: store, Authorization: authHeader },
            body: JSON.stringify({ query: ORDER_CHECK_PERMISSION_QUERY, variables: { orderId } }),
            cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        return json?.data?.kleverPrintOrder?.can_confirm_order === true;
    } catch {
        return false;
    }
}

/**
 * Magento's own order view data (customer.orders, scope WEBSITE): status label, allowed actions,
 * invoices, comments. null when Magento does not return the order.
 */
async function orderView(number: string, store: string, authHeader: string): Promise<any | null> {
    try {
        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: store, Authorization: authHeader },
            body: JSON.stringify({ query: CUSTOMER_ORDER_VIEW_QUERY, variables: { number } }),
            cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.warn("[order/:id GET] customer.orders:", json.errors[0]?.message);
        }
        return json?.data?.customer?.orders?.items?.[0] ?? null;
    } catch {
        return null;
    }
}

/**
 * The order date as Magento's order page shows it ("October 10, 2026"): the store view's locale
 * and timezone from Magento's storeConfig. Magento GraphQL dates are UTC "Y-m-d H:i:s".
 */
function magentoDateLabel(date: string | null | undefined, cfg: { locale: string | null; timezone: string | null } | null, alreadyLocal = false): string | null {
    if (!date || !cfg?.locale || !cfg?.timezone) return null;
    const d = new Date(/\dT\d|Z$/.test(date) ? date : `${date.replace(" ", "T")}Z`);
    if (Number.isNaN(d.getTime())) return null;
    try {
        return new Intl.DateTimeFormat(`${cfg.locale.replace("_", "-")}-u-ca-gregory`, {
            year: "numeric", month: "long", day: "numeric", timeZone: alreadyLocal ? "UTC" : cfg.timezone,
        }).format(d);
    } catch {
        return null;
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        const { orderId } = await params;
        let entityId: number;
        if (/^\d+$/.test(orderId)) {
            entityId = parseInt(orderId, 10);
        } else {
            try { entityId = parseInt(Buffer.from(decodeURIComponent(orderId), "base64").toString("utf8"), 10); }
            catch { entityId = NaN; }
        }
        if (Number.isNaN(entityId)) {
            return NextResponse.json({ message: "Invalid order id" }, { status: 400 });
        }

        const authHeader = request.headers.get("Authorization");
        const locale = getLocaleFromRequest(request);
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: toStoreCode(locale, request), Authorization: authHeader },
            body: JSON.stringify({ query: KLEVER_PRINT_ORDER_QUERY, variables: { orderId: entityId } }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            const msg = json.errors[0]?.message || "Magento GraphQL error";
            console.error("[order/:id GET] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            if (/permission|not authorized|authoriz/i.test(msg)) {
                return NextResponse.json({ message: msg, permission_denied: true }, { status: 403 });
            }
            return NextResponse.json({ message: msg }, { status: 502 });
        }

        const o = json?.data?.kleverPrintOrder;
        if (!o) {
            return NextResponse.json({ message: "Order not found" }, { status: 404 });
        }

        const items = Array.isArray(o.items)
            ? o.items.map((it: any, i: number) => ({
                item_id: i,
                id: i,
                name: it.name,
                sku: it.sku,
                price: it.price,
                qty_ordered: it.qty_ordered,
                row_total: it.subtotal,
                subtotal: it.subtotal,
            }))
            : [];

        const store = toStoreCode(locale, request);
        const [view, storeConfig, canConfirm, extra] = await Promise.all([
            orderView(String(o.order_number ?? ""), store, authHeader),
            getStoreConfig(store, locale),
            orderCheckAllowed(entityId, store, authHeader),
            getMagentoOrderViewExtras(entityId, store, authHeader),
        ]);

        const totals = o.totals || {};
        // Preserve the REST order shape the detail UI reads.
        const order = {
            entity_id: entityId,
            increment_id: o.order_number,
            status: o.order_status,
            // Magento's status label for this store view ("Processing", "Check Pending", …).
            status_label: view?.status ?? null,
            created_at: o.order_date,
            // customer.orders.order_date is already in the store's timezone (UTC 10:04 → "13:04")
            order_date_label: magentoDateLabel(view?.order_date, storeConfig, true),
            // Actions Magento offers on this order (e.g. ["REORDER"]); null when unknown.
            available_actions: Array.isArray(view?.available_actions) ? view.available_actions : null,
            invoices: Array.isArray(view?.invoices) ? view.invoices : [],
            comments: Array.isArray(view?.comments) ? view.comments : [],
            subtotal: totals.subtotal ?? 0,
            grand_total: totals.grand_total ?? 0,
            tax_amount: totals.tax ?? 0,
            discount_amount: totals.discount ?? 0,
            shipping_amount: totals.shipping ?? 0,
            order_currency_code: totals.currency_code ?? null,
            shipping_description: o.shipping_method ?? null,
            payment: {
                method: o.payment_method ?? null,
                method_title: o.payment_method ?? null,
                additional_information: o.payment_method ? [o.payment_method] : [],
            },
            billing_address: mapOrderAddress(o.billing_address),
            shipping_address: mapOrderAddress(o.shipping_address),
            items,
            total_item_count: items.reduce((acc: number, it: any) => acc + (Number(it.qty_ordered) || 0), 0),
            totals,
            // Magento decides whether "Order Check" (Confirm Order) is offered for this order and customer.
            can_confirm_order: canConfirm,
            // Customer PO Number / Delivery Date / delivery comment / Order Comment, label + value
            // exactly as Magento's own order page shows them (src/lib/magentoOrderView.ts).
            extra_info: extra,
        };

        return NextResponse.json(order);
    } catch (error: any) {
        return NextResponse.json(
            { message: error.message || "Server error fetching order details" },
            { status: 500 }
        );
    }
}
