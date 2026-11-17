import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { graphqlFetch } from "@/src/lib/graphqlFetch";

// Country names of the selected website + language, from Magento (`countries`,
// Store header) — e.g. SA → "Saudi Arabia" / "المملكة العربية السعودية".
// Returns { store, countries: { [id]: name } }; 502 if Magento cannot be reached.

const COUNTRIES_QUERY = /* GraphQL */ `
  query StoreCountries { countries { id full_name_locale } }
`;

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { countries: Record<string, string>; expires: number }>();

export async function GET(request: NextRequest) {
    const store = toStoreCode(getLocaleFromRequest(request), request);
    const hit = cache.get(store);
    if (hit && hit.expires > Date.now()) {
        return NextResponse.json({ store, countries: hit.countries });
    }
    try {
        const data = await graphqlFetch<{ countries: Array<{ id: string; full_name_locale: string | null }> | null }>({
            query: COUNTRIES_QUERY, store,
        });
        const countries: Record<string, string> = {};
        for (const c of data.countries || []) {
            if (c?.id && c.full_name_locale) countries[c.id] = c.full_name_locale;
        }
        cache.set(store, { countries, expires: Date.now() + CACHE_TTL_MS });
        return NextResponse.json({ store, countries });
    } catch (err: any) {
        console.error(`[countries] ${store}:`, err?.message);
        return NextResponse.json({ message: "Countries unavailable" }, { status: 502 });
    }
}
