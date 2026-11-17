// Magento's own storefront translations for a store view (its public js-translation.json —
// the file Magento's checkout uses to translate labels such as the "Tax" row title).
//
//   1. Magento's menu for the store view (kleverMenuItems, Store header) gives public pages.
//   2. The first public page's static path (/static/version…/frontend/<Vendor>/<theme>/<locale>)
//      locates that store view's theme + locale.
//   3. <static path>/js-translation.json is read.
// Nothing is hardcoded; null when Magento's file can't be reached.

import { graphqlFetch } from "@/src/lib/graphqlFetch";
import { KLEVER_MENU_ITEMS_QUERY } from "@/src/graphql/queries";

const STATIC_PATH = /https?:\/\/[^"'\s]+\/static\/(?:version\d+\/)?frontend\/[^/"'\s]+\/[^/"'\s]+\/[a-z]{2}_[A-Z]{2}/;

export async function getMagentoJsTranslations(store: string): Promise<Record<string, string> | null> {
    let urls: string[] = [];
    try {
        const data = await graphqlFetch<{ kleverMenuItems: { url: string | null; sort_order: number | null }[] | null }>({
            query: KLEVER_MENU_ITEMS_QUERY, store,
        });
        urls = (data.kleverMenuItems || [])
            .filter((m) => m?.url && /^https?:\/\//i.test(m.url))
            .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
            .map((m) => m.url as string);
    } catch (err: any) {
        console.warn(`[magento-translations] ${store}: Magento menu unavailable:`, err?.message || err);
        return null;
    }
    for (const url of urls) {
        try {
            const page = await fetch(url, {
                headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; BTireFrontend)" },
                redirect: "manual",
                cache: "no-store",
            });
            if (page.status !== 200) continue;
            const base = (await page.text()).match(STATIC_PATH)?.[0];
            if (!base) continue;
            const res = await fetch(`${base}/js-translation.json`, {
                headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; BTireFrontend)" },
                cache: "no-store",
            });
            if (!res.ok) continue;
            const json = await res.json().catch(() => null);
            if (json && typeof json === "object") return json as Record<string, string>;
        } catch { /* try the next menu page */ }
    }
    return null;
}
