import { NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { CUSTOMER_CART_QUERY, KLEVER_FAVORITE_PRODUCTS_ENRICH_QUERY } from "@/src/graphql/queries";
import { clearCustomerCartId } from "@/lib/api/customer-cart";
import { toStoreCode } from "@/lib/store/website";
import { getRequestStoreConfig, getStoreConfig } from "@/lib/store/store-config";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// Canonical empty-cart payload (matches the CartContext shape). Returned for guests and
// for expired/invalid tokens so the UI shows an empty cart instead of an error/logout.
const EMPTY_CART = {
    items: [],
    items_count: 0,
    subtotal: 0,
    tax_amount: 0,
    tax_label: "",
    grand_total: 0,
    cart_id: null,
};

/** Empty cart (no Magento cart yet): currency is the store's display currency (storeConfig). */
async function emptyCart(req: Request) {
    const config = await getRequestStoreConfig(req, getLocaleFromRequest(req));
    return { ...EMPTY_CART, currency_code: config?.default_display_currency_code };
}

// The cart item `id` is the numeric quote item id (also what removeItemFromCart /
// updateCartItems take as cart_item_id). cart_item_uid is its base64 form, returned
// additively for compatibility.
function itemUid(id: number | string): string {
    return Buffer.from(String(id)).toString("base64");
}

// GraphQL product image URLs point at the Magento image CACHE path
// (…/media/catalog/product/cache/<hash>/…) which 404s when the resized variant
// was never generated. Strip the cache segment to the direct media path (the URL
// REST returned), which resolves correctly.
function directImageUrl(url: string | undefined): string {
    if (!url) return "";
    return url.replace(/\/media\/catalog\/product\/cache\/[^/]+\//, "/media/catalog/product/");
}

// Size / pattern / year of the cart items, from Magento's Klever product data
// (kleverCategoryProducts — tyre_size, pattern, year — with the selected website's default
// category and the customer's token; the same source the favourites page uses). The native
// product type has no tyre_size and returns pattern as an option id. Nothing is parsed from
// the product name: without Magento data the lines are left empty.
async function kleverProductData(skus: string[], token: string, store: string, locale: string): Promise<Record<string, any>> {
    const itemCodes = [...new Set(skus.map((sku) => sku.replace(/-\d{4}$/, "") || sku).filter(Boolean))];
    if (itemCodes.length === 0) return {};
    const categoryId = (await getStoreConfig(store, locale))?.default_category_id;
    if (!categoryId) return {};
    const res = await fetch(MAGENTO_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            query: KLEVER_FAVORITE_PRODUCTS_ENRICH_QUERY,
            variables: { categoryId, itemCode: itemCodes.join(","), pageSize: Math.max(10, itemCodes.length * 5) },
        }),
        cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!json || Array.isArray(json.errors)) {
        console.warn("[cart] Klever product data unavailable:", JSON.stringify(json?.errors ?? null).slice(0, 200));
        return {};
    }
    const bySku: Record<string, any> = {};
    for (const p of json?.data?.kleverCategoryProducts?.products ?? []) {
        if (p?.sku) bySku[p.sku] = p;
    }
    return bySku;
}

// GET — customer cart (GraphQL: customerCart). Mapped to the CartContext shape.
export async function GET(req: Request) {
    try {
        const token = await getRequestToken(req);
        // Guest (no token) → empty cart, not 401. The cart UI should render empty, not error.
        if (!token) return NextResponse.json(await emptyCart(req));

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: toStoreCode(getLocaleFromRequest(req), req), Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query: CUSTOMER_CART_QUERY }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            const msg = json.errors.map((e: any) => e?.message || "").join(" ");
            // "The request is allowed for logged in customer" = the token is missing/expired,
            // i.e. an auth state, NOT a server failure. Return an empty cart (200) and drop the
            // stale cached cart id so the UI degrades gracefully instead of 502-ing / logging out.
            if (/logged in customer|not authorized|current customer/i.test(msg)) {
                console.warn("[cart] customer not logged in (expired/invalid token) — returning empty cart");
                clearCustomerCartId(token);
                return NextResponse.json(await emptyCart(req));
            }
            console.error("[cart] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ message: "Magento GraphQL error", details: json.errors }, { status: 502 });
        }

        const cart = json?.data?.customerCart;
        if (!cart) return NextResponse.json(await emptyCart(req));

        const store = toStoreCode(getLocaleFromRequest(req), req);
        const rawItems: any[] = Array.isArray(cart.items) ? cart.items : [];
        const klever = await kleverProductData(rawItems.map((it) => it?.product?.sku ?? ""), token, store, getLocaleFromRequest(req))
            .catch(() => ({} as Record<string, any>));

        const items = rawItems.map((it: any) => {
            const name = it.product?.name ?? "";
            const kp = klever[it.product?.sku ?? ""];
            const size_display = kp ? [kp.tyre_size, kp.year].filter(Boolean).join(" ") : "";
            const pattern_display = kp?.pattern ? String(kp.pattern) : "";
            const item_id = Number(it.id) || 0;          // numeric quote item id (what CartContext + UI use)
            const qty = Number(it.quantity ?? 0);
            const row_total = Number(it.prices?.row_total?.value ?? 0);
            return {
                item_id,
                cart_item_uid: itemUid(it.id),           // base64 form (additive)
                sku: it.product?.sku ?? "",
                name,
                // Magento's unit price.
                price: Number(it.prices?.price?.value ?? (qty > 0 ? row_total / qty : row_total)),
                qty,
                image_url: directImageUrl(it.product?.small_image?.url),
                size_display,
                pattern_display,
                row_total,
            };
        });

        const taxes: any[] = Array.isArray(cart.prices?.applied_taxes) ? cart.prices.applied_taxes : [];
        const discounts: any[] = Array.isArray(cart.prices?.discounts) ? cart.prices.discounts : [];
        const grand_total = Number(cart.prices?.grand_total?.value ?? 0);
        const subtotal = Number(cart.prices?.subtotal_excluding_tax?.value ?? 0);
        return NextResponse.json({
            items,
            items_count: Number(cart.total_quantity ?? items.reduce((s: number, i: any) => s + i.qty, 0)),
            subtotal,
            // Magento's applied tax lines (amount + the label set in Magento, per store view).
            tax_amount: taxes.reduce((sum: number, t: any) => sum + Number(t?.amount?.value ?? 0), 0),
            tax_label: taxes.map((t: any) => String(t?.label ?? "").trim()).filter(Boolean).join(", "),
            // Magento's discount lines and the coupon applied to this website's cart.
            discount_amount: discounts.reduce((sum: number, d: any) => sum + Math.abs(Number(d?.amount?.value ?? 0)), 0),
            discount_label: discounts.map((d: any) => String(d?.label ?? "").trim()).filter(Boolean).join(", "),
            applied_coupon: Array.isArray(cart.applied_coupons) && cart.applied_coupons[0]?.code ? String(cart.applied_coupons[0].code) : null,
            grand_total,
            currency_code: cart.prices?.grand_total?.currency,
            cart_id: cart.id ?? null,
        });
    } catch (error) {
        console.error("Cart GET Error:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
