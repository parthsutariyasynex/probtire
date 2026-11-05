import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestStoreConfig } from "@/lib/store/store-config";
import { isValidLocale, defaultLocale } from "@/lib/i18n/config";

// GET — configuration of the selected website + language (storeConfig + default category).
// Public. Used by client pages for the default category and currency.
export async function GET(request: NextRequest) {
    const requested = request.headers.get("x-locale") || getLocaleFromRequest(request);
    const locale = isValidLocale(requested) ? requested : defaultLocale;
    const config = await getRequestStoreConfig(request, locale);
    if (!config) {
        return NextResponse.json({ message: "Store configuration unavailable" }, { status: 502 });
    }
    return NextResponse.json(config, { headers: { "Cache-Control": "no-store" } });
}
