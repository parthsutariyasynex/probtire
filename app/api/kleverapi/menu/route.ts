import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_MENU_ITEMS_QUERY } from "@/src/graphql/queries";
import { graphqlFetch, isGraphQLRequestError } from "@/src/lib/graphqlFetch";
import { toStoreCode, magentoUrlToAppPath } from "@/lib/store/website";
import { isValidLocale, defaultLocale } from "@/lib/i18n/config";

// Main menu of the selected website + language — fully from Magento, no website list,
// no storefront URLs, no per-website rules in code.
//
//   1. kleverMenuItems (Store header) → items, labels, order, is_visible.
//   2. Each item's target is checked in the same store view with urlResolver:
//        CATEGORY  → shown (its category id is passed along)
//        CMS_PAGE  → shown only if the CMS page exists for this store view
//                    (e.g. Roya/Arkan have no "about-us" page → no About Us link,
//                    exactly like their live storefronts)
//        none      → shown (a Magento route such as /contact, not a CMS page)
//
// If Magento cannot be reached the route returns 502 (the Navbar keeps its last menu);
// nothing is guessed.

const MENU_URL_RESOLVER_QUERY = /* GraphQL */ `
  query MenuUrlResolver($url: String!) {
    urlResolver(url: $url) { type id relative_url }
  }
`;

const CMS_PAGE_EXISTS_QUERY = /* GraphQL */ `
  query MenuCmsPageExists($identifier: String!) {
    cmsPage(identifier: $identifier) { identifier }
  }
`;

interface MagentoMenuItem {
    code: string | null;
    label: string | null;
    url: string | null;
    is_visible: boolean | null;
    sort_order: number | null;
}

interface MenuItem {
    code: string;
    label: string;
    href: string;
    magentoUrl: string;
    categoryId: string | null;
    sort_order: number;
    is_visible: true;
}

const CACHE_TTL_MS = 60 * 1000;
const menuCache = new Map<string, { items: MenuItem[]; expires: number }>();

function isNotFound(err: unknown): boolean {
    return isGraphQLRequestError(err)
        && err.errors.some((e: any) => e?.extensions?.category === "graphql-no-such-entity");
}

/** Magento path of a menu URL in this store view, without the language segment ("/en/about-us" → "about-us"). */
function magentoPath(appPath: string): string {
    return appPath.split("?")[0].split("/").filter(Boolean).slice(1).join("/");
}

/** null = hide the item (its CMS page does not exist in this store view). */
async function resolveItem(item: MagentoMenuItem, store: string, locale: string): Promise<MenuItem | null> {
    const magentoUrl = item.url || "";
    const href = magentoUrlToAppPath(magentoUrl, store, locale);
    const path = magentoPath(href);
    const base = {
        code: item.code || "",
        label: item.label || "",
        href,
        magentoUrl,
        sort_order: Number(item.sort_order) || 0,
        is_visible: true as const,
    };
    if (!path) return { ...base, categoryId: null };

    const { urlResolver } = await graphqlFetch<{ urlResolver: { type: string; id: number | null; relative_url: string | null } | null }>({
        query: MENU_URL_RESOLVER_QUERY, variables: { url: path }, store,
    });

    if (urlResolver?.type === "CATEGORY") {
        return { ...base, categoryId: urlResolver.id ? String(urlResolver.id) : null };
    }
    if (urlResolver?.type === "CMS_PAGE") {
        const identifier = (urlResolver.relative_url || path).replace(/^\/+|\/+$/g, "");
        try {
            await graphqlFetch({ query: CMS_PAGE_EXISTS_QUERY, variables: { identifier }, store });
        } catch (err) {
            if (isNotFound(err)) return null;
            throw err;
        }
    }
    return { ...base, categoryId: null };
}

export async function GET(request: NextRequest) {
    const requestedLocale = request.headers.get("x-locale") || getLocaleFromRequest(request);
    const locale = isValidLocale(requestedLocale) ? requestedLocale : defaultLocale;
    const requestedStore = request.headers.get("x-store");
    const store = (requestedStore && /^[a-z0-9_]+$/i.test(requestedStore))
        ? requestedStore
        : toStoreCode(locale, request);

    const cacheKey = `${store}|${locale}`;
    const now = Date.now();
    const cached = menuCache.get(cacheKey);
    if (cached && cached.expires > now) {
        return NextResponse.json(cached.items, {
            headers: { "Cache-Control": "no-cache, no-store, must-revalidate", "X-Cache": "HIT" },
        });
    }

    try {
        const token = await getRequestToken(request);
        const data = await graphqlFetch<{ kleverMenuItems: MagentoMenuItem[] | null }>({
            query: KLEVER_MENU_ITEMS_QUERY, store, token,
        });

        const visible = (data.kleverMenuItems || [])
            .filter((m) => m && m.is_visible !== false && m.url)
            .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));

        const resolved = await Promise.all(visible.map((m) => resolveItem(m, store, locale)));
        const items = resolved.filter((m): m is MenuItem => m !== null);

        menuCache.set(cacheKey, { items, expires: now + CACHE_TTL_MS });
        return NextResponse.json(items, {
            headers: { "Cache-Control": "no-cache, no-store, must-revalidate", "X-Cache": "MISS" },
        });
    } catch (error: any) {
        console.error(`[menu] ${store}: Magento menu unavailable:`, error?.message);
        return NextResponse.json({ error: "Menu unavailable" }, { status: 502 });
    }
}
