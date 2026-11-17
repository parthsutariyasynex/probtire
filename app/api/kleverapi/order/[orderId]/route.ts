import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { NextResponse } from "next/server";
import { KLEVER_PRINT_ORDER_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";

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

        const totals = o.totals || {};
        // Preserve the REST order shape the detail UI reads.
        const order = {
            entity_id: entityId,
            increment_id: o.order_number,
            status: o.order_status,
            created_at: o.order_date,
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
        };

        return NextResponse.json(order);
    } catch (error: any) {
        return NextResponse.json(
            { message: error.message || "Server error fetching order details" },
            { status: 500 }
        );
    }
}
