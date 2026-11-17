import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { getFooterData } from "@/src/lib/magentoFooter";

// Footer of the selected website + language, read from that store view's Magento storefront
// footer (see src/lib/magentoFooter.ts). { footer: null } when Magento has none.

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { body: unknown; expires: number }>();

export async function GET(request: NextRequest) {
    const store = toStoreCode(getLocaleFromRequest(request), request);
    const now = Date.now();
    const hit = cache.get(store);
    if (hit && hit.expires > now) {
        return NextResponse.json(hit.body, { headers: { "Cache-Control": "no-store", "X-Cache": "HIT" } });
    }
    const footer = await getFooterData(store);
    const body = { store, footer };
    // Cache a found footer for 10 min; retry a missing one on the next request.
    if (footer) cache.set(store, { body, expires: now + CACHE_TTL_MS });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store", "X-Cache": "MISS" } });
}
