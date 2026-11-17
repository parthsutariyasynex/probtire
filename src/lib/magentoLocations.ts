// Branch locations of the selected website + language, read from that store view's Magento
// storefront page that lists them (the "Branch Locations" page linked in Magento's own menu).
//
//   1. Magento's menu for the store view (kleverMenuItems, Store header) gives the page URLs.
//   2. The first public one (HTTP 200, no login redirect) containing `.address-box` blocks is
//      parsed: each block's <h5> title, its address lines and its map link; plus the map
//      centre Magento's page uses (google.maps.LatLng(lat, lng)).
// Nothing is hardcoded and no other website's branches are used; null when Magento has none.

import { graphqlFetch } from "@/src/lib/graphqlFetch";
import { KLEVER_MENU_ITEMS_QUERY } from "@/src/graphql/queries";

export interface BranchRegion {
    title: string;
    /** Address lines as Magento shows them. */
    lines: string[];
    /** Magento's map link for the branch ("" when Magento has none). */
    mapLink: string;
}

export interface BranchLocations {
    regions: BranchRegion[];
    /** Map centre from Magento's page, or null. */
    center: { lat: number; lng: number } | null;
    source: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) => s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parseBranchLocations(html: string, pageUrl: string): BranchLocations | null {
    const page = html.replace(/<!--[\s\S]*?-->/g, "");
    const blocks = page.split(/<div\b[^>]*class=["'][^"']*\baddress-box\b[^"']*["'][^>]*>/i).slice(1);
    const regions: BranchRegion[] = [];
    for (const raw of blocks) {
        // The block ends where the next column starts.
        const block = raw.split(/<div\b[^>]*class=["'][^"']*\bcol-/i)[0];
        const title = text(block.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? "");
        const mapLink = (block.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? "").trim();
        const body = (block.match(/<p\b[^>]*>([\s\S]*)/i)?.[1] ?? "")
            .replace(/<div\b[^>]*class=["'][^"']*\bmap-link\b[\s\S]*$/i, "")
            .replace(/<svg[\s\S]*?<\/svg>/gi, "");
        const lines = body.split(/<br\s*\/?>/i).map(text).filter(Boolean);
        if (title || lines.length) regions.push({ title, lines, mapLink });
    }
    if (regions.length === 0) return null;
    const c = page.match(/google\.maps\.LatLng\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
    return { regions, center: c ? { lat: Number(c[1]), lng: Number(c[2]) } : null, source: pageUrl };
}

export async function getBranchLocations(store: string): Promise<BranchLocations | null> {
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
        console.warn(`[branch-locations] ${store}: Magento menu unavailable:`, err?.message || err);
        return null;
    }
    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; BTireFrontend)" },
                redirect: "manual",
                cache: "no-store",
            });
            if (res.status !== 200) continue;
            const parsed = parseBranchLocations(await res.text(), url);
            if (parsed) return parsed;
        } catch { /* try the next menu page */ }
    }
    return null;
}
