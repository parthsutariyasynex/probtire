// Server-only: per-store-view configuration from Magento (storeConfig + category tree).
// Everything here is fetched by Store header, so each website + language gets its own
// values and a newly added Magento website/category works without code changes.
import { graphqlFetch } from "@/src/lib/graphqlFetch";
import {
    STORE_CONFIG_QUERY,
    URL_RESOLVER_QUERY,
    KLEVER_MENU_ITEMS_QUERY,
} from "@/src/graphql/queries";
import { KLEVER_SITE_LOGIN_WEBSITES_QUERY } from "@/src/graphql/mutations";
import { magentoUrlToAppPath, toStoreCode } from "@/lib/store/website";
import { isValidLocale, defaultLocale, type Locale } from "@/lib/i18n/config";

export type StoreConfig = {
    store_code: string;
    store_name: string | null;
    website_id: number | null;
    website_code: string | null;
    website_name: string | null;
    locale: string | null;
    root_category_id: number | null;
    default_title: string | null;
    title_prefix: string | null;
    title_suffix: string | null;
    default_description: string | null;
    default_keywords: string | null;
    base_currency_code: string | null;
    default_display_currency_code: string | null;
    /** Category the storefront menu lands on (null if Magento has no menu category). */
    default_category_id: number | null;
    /** Website logo + label from Magento (kleverSiteLoginWebsites), null if Magento has none. */
    website_logo: string | null;
    website_label: string | null;
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { value: StoreConfig; expires: number }>();
const inflight = new Map<string, Promise<StoreConfig | null>>();

/** Default category = the category the storefront menu lands on (Magento kleverMenuItems). */
async function resolveDefaultCategory(store: string, locale: Locale): Promise<number | null> {
    try {
        const menu = await graphqlFetch<{ kleverMenuItems: { url?: string; is_visible?: boolean; sort_order?: number }[] }>({
            query: KLEVER_MENU_ITEMS_QUERY, store,
        });
        const items = [...(menu?.kleverMenuItems || [])]
            .filter((m) => m && m.is_visible !== false && String(m.url || "").endsWith(".html"))
            .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
        for (const item of items) {
            // /roya_en/all-tyres/x.html → all-tyres/x.html (what urlResolver expects)
            const appPath = magentoUrlToAppPath(item.url, store, locale);
            const slug = appPath.split("/").slice(2).join("/");
            if (!slug) continue;
            const r = await graphqlFetch<{ urlResolver: { type: string; id: number } | null }>({
                query: URL_RESOLVER_QUERY, variables: { url: slug }, store,
            });
            if (r?.urlResolver?.type === "CATEGORY" && r.urlResolver.id) return Number(r.urlResolver.id);
        }
    } catch (err: any) {
        console.warn(`[store-config] menu lookup failed for ${store}:`, err?.message || err);
    }
    return null;
}

/** Logo + label of this website, as Magento lists it in kleverSiteLoginWebsites (matched by website_id). */
async function resolveWebsiteBranding(websiteId: number | null, locale: Locale, store: string): Promise<{ logo: string | null; label: string | null } | null> {
    if (websiteId == null) return null;
    try {
        const data = await graphqlFetch<{ kleverSiteLoginWebsites: { website_id: number; label: string | null; logo: string | null }[] | null }>({
            query: KLEVER_SITE_LOGIN_WEBSITES_QUERY, variables: { lang: locale }, store,
        });
        return (data?.kleverSiteLoginWebsites || []).find((w) => Number(w.website_id) === Number(websiteId)) ?? null;
    } catch (err: any) {
        console.warn(`[store-config] website branding lookup failed for website ${websiteId}:`, err?.message || err);
        return null;
    }
}

async function load(store: string, locale: Locale): Promise<StoreConfig | null> {
    try {
        const data = await graphqlFetch<{ storeConfig: Omit<StoreConfig, "default_category_id" | "website_logo" | "website_label"> }>({
            query: STORE_CONFIG_QUERY, store,
        });
        const sc = data?.storeConfig;
        if (!sc) return null;
        const [defaultCategoryId, website] = await Promise.all([
            resolveDefaultCategory(store, locale),
            resolveWebsiteBranding(sc.website_id, locale, store),
        ]);
        return {
            ...sc,
            default_category_id: defaultCategoryId,
            website_logo: website?.logo || null,
            website_label: website?.label || null,
        };
    } catch (err: any) {
        console.warn(`[store-config] storeConfig failed for ${store}:`, err?.message || err);
        return null;
    }
}

/** Store config for a store view code (cached per store code, 10 min). Null if Magento is unreachable. */
export async function getStoreConfig(store: string, locale?: string | null): Promise<StoreConfig | null> {
    const lang: Locale = locale && isValidLocale(locale) ? locale : defaultLocale;
    const key = `${store}|${lang}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    if (!inflight.has(key)) {
        inflight.set(key, load(store, lang).then((value) => {
            if (value) cache.set(key, { value, expires: Date.now() + TTL_MS });
            return value;
        }).finally(() => inflight.delete(key)));
    }
    return inflight.get(key)!;
}

/** Store config for an incoming API request (selected website + UI language). */
export async function getRequestStoreConfig(request: Request, locale: string): Promise<StoreConfig | null> {
    return getStoreConfig(toStoreCode(locale, request), locale);
}

/** Store view code + UI language of the current server-component render (reads cookies/headers). */
export async function getCurrentStore(): Promise<{ store: string; locale: Locale }> {
    const { cookies, headers } = await import("next/headers");
    const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
    const fromHeader = headerList.get("x-locale");
    const fromCookie = cookieStore.get("NEXT_LOCALE")?.value;
    const locale = [fromHeader, fromCookie].find((v): v is Locale => !!v && isValidLocale(v)) ?? defaultLocale;
    const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
    return { store: toStoreCode(locale, cookieHeader), locale };
}

/** Store config for the current server-component render (reads cookies/headers). */
export async function getCurrentStoreConfig(): Promise<StoreConfig | null> {
    const { store, locale } = await getCurrentStore();
    return getStoreConfig(store, locale);
}
