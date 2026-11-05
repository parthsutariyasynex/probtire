import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_MENU_ITEMS_QUERY } from "@/src/graphql/queries";
import { toStoreCode, magentoUrlToAppPath } from "@/lib/store/website";
import { isValidLocale, defaultLocale } from "@/lib/i18n/config";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "https://pro.btire.com") + "/graphql";

// Map each store view to its live Magento storefront URL for exact live menu discovery
const LIVE_WEBSITE_URLS: Record<string, string> = {
    en: "https://altalayi-live.btire.com/en/customer/account/login",
    ar: "https://altalayi-live.btire.com/ar/customer/account/login",
    roya_en: "https://roya.btire.com/en/customer/account/login",
    roya_ar: "https://roya.btire.com/ar/customer/account/login",
    afaq_en: "https://afaq.btire.com/en/customer/account/login",
    afaq_ar: "https://afaq.btire.com/ar/customer/account/login",
};

// Fallback contact page URLs if login page redirects
const LIVE_WEBSITE_BACKUP_URLS: Record<string, string> = {
    en: "https://altalayi-live.btire.com/en/contact",
    ar: "https://altalayi-live.btire.com/ar/contact",
    roya_en: "https://roya.btire.com/en/contact",
    roya_ar: "https://roya.btire.com/ar/contact",
    afaq_en: "https://afaq.btire.com/en/contact",
    afaq_ar: "https://afaq.btire.com/ar/contact",
};

const CATEGORY_TREE_QUERY = /* GraphQL */ `
  query GetCategoryTree {
    categoryList {
      id
      name
      url_key
      url_path
      position
      level
      include_in_menu
      children {
        id
        name
        url_key
        url_path
        position
        level
        include_in_menu
        children {
          id
          name
          url_key
          url_path
          position
          level
          include_in_menu
        }
      }
    }
  }
`;

// Extract active menu items directly from the live Magento website HTML
async function fetchLiveWebsiteMenu(store: string): Promise<{ label: string; url: string }[] | null> {
    const primaryUrl = LIVE_WEBSITE_URLS[store];
    if (!primaryUrl) return null;

    const urlsToTry = [primaryUrl, LIVE_WEBSITE_BACKUP_URLS[store]].filter(Boolean);

    for (const url of urlsToTry) {
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
                cache: "no-store",
            });
            if (!res.ok) continue;
            const html = await res.text();
            const navMatch = html.match(/<nav[^>]*id=["']navigation["'][^>]*>([\s\S]*?)<\/nav>/i);
            if (!navMatch) continue;

            // Strip HTML comments to exclude items commented out in the Magento theme (e.g. on Roya / Afaq)
            const cleanNavHtml = navMatch[1].replace(/<!--[\s\S]*?-->/g, "");

            const items: { label: string; url: string }[] = [];
            const liMatches = [...cleanNavHtml.matchAll(/<li[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/li>/gi)];
            for (const match of liMatches) {
                const a = match[2].match(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
                if (a) {
                    const href = a[1].trim();
                    const label = a[2].replace(/<[^>]+>/g, "").trim();
                    if (label && href) {
                        items.push({ label, url: href });
                    }
                }
            }

            if (items.length > 0) {
                return items;
            }
        } catch {
            // Try next url
        }
    }

    return null;
}

// Flatten category tree into an indexed lookup table
interface CategoryNode {
    id: number;
    name: string;
    url_path?: string | null;
    position?: number | null;
    parentId?: number | null;
    children?: CategoryNode[];
}

function flattenCategories(node: any, parentId: number | null = null, out: CategoryNode[] = []): CategoryNode[] {
    if (!node) return out;
    if (node.id !== 2 && node.id !== 1) { // Skip Magento root category
        out.push({
            id: Number(node.id),
            name: node.name || "",
            url_path: node.url_path || null,
            position: Number(node.position) || 0,
            parentId,
        });
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            flattenCategories(child, Number(node.id), out);
        }
    }
    return out;
}

// In-memory cache with very short TTL (30s) to absorb concurrent page load spikes without stale state
const menuCache = new Map<string, { items: any[]; expires: number }>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

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
        return new Response(JSON.stringify(cached.items), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-Cache": "HIT",
            },
        });
    }

    try {
        const token = await getRequestToken(request);

        // Fetch category tree directly from Magento GraphQL for this store view
        let allCategories: CategoryNode[] = [];
        try {
            const catRes = await fetch(MAGENTO_GRAPHQL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Store: store,
                    ...(token && { Authorization: `Bearer ${token}` }),
                },
                body: JSON.stringify({ query: CATEGORY_TREE_QUERY }),
                cache: "no-store",
            });
            const catJson = await catRes.json();
            const root = catJson?.data?.categoryList?.[0];
            allCategories = flattenCategories(root);
        } catch (catErr: any) {
            console.warn("[menu] categoryList fetch warning:", catErr?.message);
        }

        // Fetch live menu items directly from the live Magento website
        let liveItems = await fetchLiveWebsiteMenu(store);

        // If live HTML extraction is unavailable, query Magento GraphQL kleverMenuItems
        if (!liveItems || liveItems.length === 0) {
            const res = await fetch(MAGENTO_GRAPHQL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Store: store,
                    ...(token && { Authorization: `Bearer ${token}` }),
                },
                body: JSON.stringify({ query: KLEVER_MENU_ITEMS_QUERY }),
                cache: "no-store",
            });
            const json = await res.json();
            const raw = Array.isArray(json?.data?.kleverMenuItems) ? json.data.kleverMenuItems : [];
            
            // Respect website-specific live rules:
            // Roya live site hides about_us & user_guides
            // Afaq live site hides user_guides
            const isRoya = store.startsWith("roya");
            const isAfaq = store.startsWith("afaq");

            liveItems = raw
                .filter((m: any) => {
                    if (m?.is_visible === false || m?.code === "quick_order") return false;
                    if (isRoya && (m?.code === "about_us" || m?.code === "user_guides")) return false;
                    if (isAfaq && m?.code === "user_guides") return false;
                    return true;
                })
                .map((m: any) => ({ label: m.label, url: m.url }));
        }

        // Map live menu items with Magento dynamic category hierarchy, URLs, IDs and sort order
        let defaultSort = 10;
        const items = (liveItems || []).map((item) => {
            const magentoUrl = item.url || "";
            let categoryId: string | null = null;
            let children: { categoryId: string; label: string; href: string; sort_order: number }[] | undefined = undefined;

            let pathNoExt = "";
            try {
                const urlObj = new URL(magentoUrl);
                pathNoExt = urlObj.pathname.replace(/^\/[^\/]+\//, "").replace(/\.html$/, "");
            } catch {
                pathNoExt = magentoUrl.replace(/^\/[^\/]+\//, "").replace(/\.html$/, "");
            }

            // Match against Magento category tree
            const matchedCat = allCategories.find((c) =>
                c.url_path === pathNoExt || (c.url_path && pathNoExt.startsWith(c.url_path))
            );

            if (matchedCat) {
                categoryId = String(matchedCat.id);
                // Attach dynamic subcategories (parent-child relationship)
                const subCats = allCategories.filter((c) => c.parentId === matchedCat.id);
                if (subCats.length > 0) {
                    children = subCats.map((sc) => ({
                        categoryId: String(sc.id),
                        label: sc.name,
                        href: `/${locale}/${sc.url_path || "products"}.html`,
                        sort_order: sc.position || 0,
                    }));
                }
            }

            const appPath = magentoUrlToAppPath(magentoUrl, store, locale);

            const result = {
                label: item.label,
                href: appPath,
                magentoUrl,
                categoryId,
                children,
                sort_order: defaultSort,
                is_visible: true,
            };
            defaultSort += 10;
            return result;
        });

        if (items.length > 0) {
            menuCache.set(cacheKey, { items, expires: now + CACHE_TTL_MS });
        }

        return new Response(JSON.stringify(items), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-Cache": "MISS",
            },
        });
    } catch (error: any) {
        console.error("[menu] Route error:", error?.message);
        return NextResponse.json({ error: "Failed to fetch menu" }, { status: 500 });
    }
}
