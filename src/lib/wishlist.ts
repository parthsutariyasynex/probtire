// Customer favourites (Magento wishlist) of the selected website + language.
// The Store header decides the website: Magento only returns the wishlist items that
// belong to that website's store views. Nothing is filtered or added here.
//
// Magento exposes the items through two fields, and they do not always agree:
//   items_v2 — paged, current field
//   items    — older field; it can contain items that items_v2 leaves out
//              (this is how items_count = 7 but items_v2 = 6 happens)
// Both are read in full and merged by wishlist item id, so the list is exactly the set
// of items Magento holds for this website, and the count is that list's length.

import { CUSTOMER_WISHLIST_LEGACY_ITEMS_QUERY, CUSTOMER_WISHLIST_ALL_ITEMS_QUERY } from "@/src/graphql/queries";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";
const V2_PAGE_SIZE = 100;


export interface WishlistItem {
    id: string;
    wishlistId: string;
    quantity: number;
    product: any;
}

export interface CustomerWishlist {
    /** Every item Magento returns for this website, in Magento's order. */
    items: WishlistItem[];
    /** Sum of Magento's items_count over the customer's wishlists (for diagnostics). */
    magentoItemsCount: number;
    wishlistIds: string[];
}

export class WishlistError extends Error {}

async function gql(query: string, variables: Record<string, unknown>, store: string, authHeader: string) {
    const res = await fetch(MAGENTO_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Store: store, Authorization: authHeader },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!json || (Array.isArray(json.errors) && json.errors.length > 0)) {
        throw new WishlistError(json?.errors?.[0]?.message || `Magento wishlist request failed (HTTP ${res.status})`);
    }
    return json.data;
}

export async function getCustomerWishlist(store: string, authHeader: string): Promise<CustomerWishlist> {
    // items_v2, every page of every wishlist
    const byWishlist = new Map<string, { count: number; items: WishlistItem[] }>();
    for (let page = 1; ; page++) {
        const data = await gql(CUSTOMER_WISHLIST_ALL_ITEMS_QUERY, { currentPage: page, pageSize: V2_PAGE_SIZE }, store, authHeader);
        const lists: any[] = data?.customer?.wishlists ?? [];
        let more = false;
        for (const w of lists) {
            const id = String(w?.id ?? "");
            const entry = byWishlist.get(id) ?? { count: Number(w?.items_count ?? 0), items: [] };
            for (const it of w?.items_v2?.items ?? []) {
                if (it?.product) entry.items.push({ id: String(it.id), wishlistId: id, quantity: Number(it.quantity ?? 1), product: it.product });
            }
            byWishlist.set(id, entry);
            if (Number(w?.items_v2?.page_info?.total_pages ?? 1) > page) more = true;
        }
        if (!more) break;
    }

    // Older `items` field — adds what items_v2 left out (same wishlist, same website).
    const legacy = await gql(CUSTOMER_WISHLIST_LEGACY_ITEMS_QUERY, {}, store, authHeader);
    for (const w of legacy?.customer?.wishlists ?? []) {
        const id = String(w?.id ?? "");
        const entry = byWishlist.get(id) ?? { count: Number(w?.items_count ?? 0), items: [] };
        const seen = new Set(entry.items.map((i) => i.id));
        for (const it of w?.items ?? []) {
            if (it?.product && !seen.has(String(it.id))) {
                entry.items.push({ id: String(it.id), wishlistId: id, quantity: Number(it.qty ?? 1), product: it.product });
            }
        }
        byWishlist.set(id, entry);
    }

    const lists = [...byWishlist.entries()];
    return {
        items: lists.flatMap(([, w]) => w.items),
        magentoItemsCount: lists.reduce((sum, [, w]) => sum + w.count, 0),
        wishlistIds: lists.map(([id]) => id),
    };
}
