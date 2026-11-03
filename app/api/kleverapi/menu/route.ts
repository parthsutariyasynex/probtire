import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_MENU_ITEMS_QUERY } from "@/src/graphql/queries";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// Returns the Magento URL's pathname + search as-is, preserving `.html` and the CMS slug,
// so the navbar links to SEO URLs the middleware resolves without changing the browser URL.
function magentoUrlToPath(url: string): string {
    if (!url) return "#";
    try {
        const parsed = new URL(url);
        return (parsed.pathname || "#") + parsed.search;
    } catch {
        return url;
    }
}

// ── Caches ───────────────────────────────────────────────────────────────────
const menuCache = new Map<string, { items: any[]; expires: number }>();
const MENU_CACHE_TTL_MS = 60 * 60 * 1000; // 60 min

// Quick check for Sales Person tokens (utypid === 3) to use a separate cache key.
// quick_order menu item is is_visible=true only for Sales Persons — mixing cache
// keys would cause the guest menu to hide Quick Order for Sales Persons.
function isSalesPersonJwt(token: string | null): boolean {
    if (!token) return false;
    try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        return payload?.utypid === 3;
    } catch {
        return false;
    }
}

async function getPersistentCachePath(locale: string): Promise<string> {
    const os = await import("node:os");
    const path = await import("node:path");
    return path.join(os.tmpdir(), `altalayi-menu-cache-${locale}.json`);
}
async function readPersistentMenu(locale: string): Promise<any[] | null> {
    try {
        const fs = await import("node:fs/promises");
        const raw = await fs.readFile(await getPersistentCachePath(locale), "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}
async function writePersistentMenu(locale: string, items: any[]): Promise<void> {
    try {
        const fs = await import("node:fs/promises");
        await fs.writeFile(await getPersistentCachePath(locale), JSON.stringify(items));
    } catch (err: any) {
        console.warn(`[menu] Persistent cache write failed:`, err?.message || err);
    }
}

// GET — storefront navigation menu (GraphQL: kleverMenuItems — the klever custom menu,
// now exposed on the schema and reachable via /graphql, unlike the WAF-blocked REST /menu).
// Token-optional (public menu). Maps each item to the Navbar shape; filters hidden items;
// sorts by sort_order. Falls back to cache, then empty [], so it never errors/loops.
export async function GET(request: NextRequest) {
    const locale = request.headers.get("x-locale") || getLocaleFromRequest(request);
    try {
        const now = Date.now();
        const token = await getRequestToken(request);
        // Use a separate cache slot for Sales Person tokens — quick_order is
        // is_visible=true only for Sales Persons, so their menu must not be
        // served from (or stored into) the guest/regular-customer cache slot.
        const cacheKey = isSalesPersonJwt(token) ? `${locale}_sp` : locale;
        const cached = menuCache.get(cacheKey);
        if (cached && cached.expires > now) {
            return new Response(JSON.stringify(cached.items), {
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Cache": "HIT" },
            });
        }

        // Pass the customer token when present (menu may include account-specific items),
        // but the query also works for guests.

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: locale,
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({ query: KLEVER_MENU_ITEMS_QUERY }),
            cache: "no-store",
        });
        const json = await res.json();

        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.warn("[menu] GraphQL error — serving cache/empty:", JSON.stringify(json.errors).slice(0, 200));
            const persisted = await readPersistentMenu(locale);
            return new Response(JSON.stringify(persisted || []), {
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Cache": "MISS-ERR" },
            });
        }

        const raw = Array.isArray(json?.data?.kleverMenuItems) ? json.data.kleverMenuItems : [];
        const items = raw
            .filter((m: any) => m?.is_visible !== false && m?.code !== "quick_order")
            .map((m: any) => ({
                code: m.code,
                label: m.label,
                href: magentoUrlToPath(m.url || ""),
                magentoUrl: m.url || "",
                is_visible: m.is_visible !== false,
                sort_order: Number(m.sort_order) || 0,
            }))
            .sort((a: any, b: any) => a.sort_order - b.sort_order);

        if (items.length > 0) {
            menuCache.set(cacheKey, { items, expires: now + MENU_CACHE_TTL_MS });
            void writePersistentMenu(locale, items);
        }

        return new Response(JSON.stringify(items), {
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate", "X-Cache": "MISS" },
        });
    } catch (error: any) {
        console.warn("[menu] error — serving cache/empty:", error?.message);
        const persisted = await readPersistentMenu(locale);
        return new Response(JSON.stringify(persisted || []), {
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
    }
}
