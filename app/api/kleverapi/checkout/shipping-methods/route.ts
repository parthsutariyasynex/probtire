import { NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { getCustomerCartId } from "@/lib/api/customer-cart";
import { CART_SHIPPING_METHODS_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// GET — available shipping methods (GraphQL: cart.shipping_addresses[0].available_shipping_methods).
// The consumer maps carrier_code/method_code/titles and reads `amount` as a NUMBER,
// but GraphQL returns amount {value,currency} — so we flatten amount → amount.value.
// Returns an array (consumer reads data.methods || data.shipping_methods || array).
export async function GET(req: Request) {
    try {
        const token = await getRequestToken(req);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const locale = getLocaleFromRequest(req);
        const cartId = await getCustomerCartId(token, toStoreCode(locale, req));
        if (!cartId) return NextResponse.json([]); // no cart → empty (consumer has fallback)

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: toStoreCode(locale, req), Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query: CART_SHIPPING_METHODS_QUERY, variables: { cartId } }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("[shipping-methods] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ message: json.errors[0]?.message || "Shipping methods unavailable" }, { status: 502 });
        }
        const addresses = json?.data?.cart?.shipping_addresses ?? [];
        const raw = addresses[0]?.available_shipping_methods ?? [];
        // Flatten Money {value,currency} → number so consumer's `m.amount` is a price.
        const methods = raw.map((m: any) => ({
            carrier_code: m.carrier_code,
            method_code: m.method_code,
            carrier_title: m.carrier_title,
            method_title: m.method_title,
            amount: m.amount?.value ?? null,
            currency: m.amount?.currency,
            available: m.available,
        }));
        return NextResponse.json(methods);
    } catch (error) {
        console.error("Shipping Methods Error:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
