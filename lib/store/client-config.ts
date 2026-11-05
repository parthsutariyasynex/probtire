"use client";
// Client: configuration of the selected website + language, from /api/kleverapi/store-config.
// Memoized per store code for the page's lifetime (a website switch reloads the page).
import { toStoreCode } from "@/lib/store/website";
import type { StoreConfig } from "@/lib/store/store-config";

const memo = new Map<string, Promise<StoreConfig | null>>();

export function getClientStoreConfig(locale: string): Promise<StoreConfig | null> {
    const key = toStoreCode(locale, typeof document !== "undefined" ? document.cookie : "");
    if (!memo.has(key)) {
        const p = fetch("/api/kleverapi/store-config", { headers: { "x-locale": locale }, cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .then((cfg: StoreConfig | null) => {
                if (!cfg) memo.delete(key); // retry next time instead of caching a failure
                return cfg;
            });
        memo.set(key, p);
    }
    return memo.get(key)!;
}

/** Default (landing) category of the selected website, as a string id, or null. */
export async function getDefaultCategoryId(locale: string): Promise<string | null> {
    const cfg = await getClientStoreConfig(locale);
    return cfg?.default_category_id != null ? String(cfg.default_category_id) : null;
}
