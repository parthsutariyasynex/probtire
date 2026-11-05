import { CUSTOMER_CART_ID_QUERY } from "@/src/graphql/queries";
import { CREATE_EMPTY_CART_MUTATION } from "@/src/graphql/mutations";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

async function gql(query: string, token: string, store: string): Promise<any> {
    const res = await fetch(MAGENTO_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Store: store, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query }),
        cache: "no-store",
    });
    return res.json();
}

// Resolves the logged-in customer's masked cart id (the `cart_id` that Magento-native
// cart queries/mutations require) via `customerCart { id }`, cached briefly per token
// so cart-dependent checkout routes don't each pay a round trip. The id is stable for
// the active quote; it changes when the quote is replaced (e.g. after an order), so the
// short TTL bounds staleness, and callers can clearCustomerCartId(token) explicitly.
const CART_ID_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { id: string; expires: number }>();

// Keyed per store view: each website has its own quote for the same customer.
const cacheKey = (token: string, store: string) => `${store}|${token}`;

export function clearCustomerCartId(token?: string) {
    if (!token) return cache.clear();
    for (const key of cache.keys()) {
        if (key.endsWith(`|${token}`)) cache.delete(key);
    }
}

/** `store` is the full Magento store view code (en, roya_ar, …) — see lib/store/website. */
export async function getCustomerCartId(token: string, store: string): Promise<string | null> {
    const now = Date.now();
    const hit = cache.get(cacheKey(token, store));
    if (hit && hit.expires > now) return hit.id;

    try {
        // Primary: the customer's existing cart id.
        const json = await gql(CUSTOMER_CART_ID_QUERY, token, store);
        let id: string | null = json?.data?.customerCart?.id ?? null;

        // Fallback: no cart yet → createEmptyCart (idempotent for logged-in customers;
        // returns the existing/created cart id without wiping items).
        if (!id) {
            const created = await gql(CREATE_EMPTY_CART_MUTATION, token, store);
            id = created?.data?.createEmptyCart ?? null;
        }

        if (id) cache.set(cacheKey(token, store), { id, expires: now + CART_ID_TTL_MS });
        return id;
    } catch (err) {
        console.error("[getCustomerCartId] error:", err);
        return null;
    }
}
