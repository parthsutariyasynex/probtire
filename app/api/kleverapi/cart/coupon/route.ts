import { NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { getCustomerCartId } from "@/lib/api/customer-cart";
import { toStoreCode } from "@/lib/store/website";
import { APPLY_COUPON_TO_CART_MUTATION, REMOVE_COUPON_FROM_CART_MUTATION } from "@/src/graphql/mutations";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// Coupon code on the customer's cart of the selected website + language (Magento
// applyCouponToCart / removeCouponFromCart). Magento validates the code for that website;
// its message is returned as-is on failure.
//   POST   { code } → apply      DELETE → remove

async function run(req: Request, query: string, variables: Record<string, unknown>) {
    const token = await getRequestToken(req);
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const store = toStoreCode(getLocaleFromRequest(req), req);
    const cartId = await getCustomerCartId(token, store);
    if (!cartId) return NextResponse.json({ message: "No active cart" }, { status: 404 });

    const res = await fetch(MAGENTO_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables: { cartId, ...variables } }),
        cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!json || (Array.isArray(json.errors) && json.errors.length > 0)) {
        return NextResponse.json({ message: json?.errors?.[0]?.message || "Coupon request failed" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const code = String(body?.code ?? "").trim();
        if (!code) return NextResponse.json({ message: "Coupon code is required" }, { status: 400 });
        return await run(req, APPLY_COUPON_TO_CART_MUTATION, { couponCode: code });
    } catch (error: any) {
        console.error("[cart/coupon POST] error:", error?.message);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        return await run(req, REMOVE_COUPON_FROM_CART_MUTATION, {});
    } catch (error: any) {
        console.error("[cart/coupon DELETE] error:", error?.message);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
