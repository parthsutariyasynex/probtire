import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { getMagentoJsTranslations } from "@/src/lib/magentoTranslations";

// GET ?keys=Tax,… — Magento's storefront translations of those phrases for the selected website +
// language (src/lib/magentoTranslations.ts). Only phrases Magento translates are returned.

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { dict: Record<string, string>; expires: number }>();

export async function GET(request: NextRequest) {
    const store = toStoreCode(getLocaleFromRequest(request), request);
    const keys = (new URL(request.url).searchParams.get("keys") || "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 50);
    const now = Date.now();
    const hit = cache.get(store);
    let dict = hit && hit.expires > now ? hit.dict : null;
    if (!dict) {
        dict = await getMagentoJsTranslations(store);
        if (!dict) return NextResponse.json({ message: "Magento translations unavailable", store }, { status: 502 });
        cache.set(store, { dict, expires: now + CACHE_TTL_MS });
    }
    const translations: Record<string, string> = {};
    for (const k of keys) if (typeof dict[k] === "string") translations[k] = dict[k];
    return NextResponse.json({ store, translations });
}
