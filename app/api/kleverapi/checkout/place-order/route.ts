import { NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_PLACE_ORDER_MUTATION, SET_PAYMENT_METHOD_ON_CART_MUTATION } from "@/src/graphql/mutations";
import { toStoreCode } from "@/lib/store/website";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

async function gql(query: string, variables: Record<string, unknown>, token: string, store: string) {
    const res = await fetch(MAGENTO_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
    });
    return res.json();
}

export async function POST(req: Request) {
    try {
        const token = await getRequestToken(req);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const cartId = String(body.cart_id ?? body.cartId ?? "");
        if (!cartId) {
            return NextResponse.json({ message: "cart_id is required" }, { status: 400 });
        }

        const paymentMethod = String(body.payment_method ?? body.paymentMethod ?? "");
        const store = toStoreCode(getLocaleFromRequest(req), req);

        // Step 1: set payment method on cart before placing order
        if (paymentMethod) {
            const pmJson = await gql(SET_PAYMENT_METHOD_ON_CART_MUTATION, { cartId, code: paymentMethod }, token, store);
            if (Array.isArray(pmJson?.errors) && pmJson.errors.length > 0) {
                return NextResponse.json({ message: pmJson.errors[0]?.message || "Failed to set payment method" }, { status: 400 });
            }
        }

        // Step 2: place the order
        const json = await gql(KLEVER_PLACE_ORDER_MUTATION, { cartId }, token, store);
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            return NextResponse.json({ message: json.errors[0]?.message || "Failed to place order" }, { status: 400 });
        }

        const placeOrderResult = json?.data?.placeOrder;
        if (placeOrderResult?.errors?.length > 0) {
            return NextResponse.json({ message: placeOrderResult.errors[0]?.message || "Failed to place order" }, { status: 400 });
        }

        const orderV2 = placeOrderResult?.orderV2;

        // Decode GraphQL base64 id → numeric entity_id (format: "CustomerOrder:123456")
        let order_id: string | null = null;
        if (orderV2?.id) {
            try {
                const decoded = Buffer.from(orderV2.id, "base64").toString("utf8");
                const match = decoded.match(/:(\d+)$/);
                order_id = match ? match[1] : orderV2.id;
            } catch {
                order_id = orderV2.id;
            }
        }

        return NextResponse.json({
            order_id,
            order_increment_id: orderV2?.number ?? null,
            grand_total: orderV2?.total?.grand_total?.value ?? null,
            currency_code: orderV2?.total?.grand_total?.currency ?? null,
            status: orderV2?.status ?? null,
        });
    } catch (error) {
        console.error("Place Order Error:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
