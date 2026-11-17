import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { getBranchLocations } from "@/src/lib/magentoLocations";

// Branch locations of the selected website + language, from that store view's Magento page
// (src/lib/magentoLocations.ts). { locations: null } when Magento has none.

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { body: unknown; expires: number }>();

export async function GET(request: NextRequest) {
    const store = toStoreCode(getLocaleFromRequest(request), request);
    const now = Date.now();
    const hit = cache.get(store);
    if (hit && hit.expires > now) {
        return NextResponse.json(hit.body, { headers: { "Cache-Control": "no-store", "X-Cache": "HIT" } });
    }
    const locations = await getBranchLocations(store);
    const body = { store, locations };
    if (locations) cache.set(store, { body, expires: now + CACHE_TTL_MS });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store", "X-Cache": "MISS" } });
}
