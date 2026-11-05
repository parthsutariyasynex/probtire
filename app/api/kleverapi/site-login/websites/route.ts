import { NextRequest, NextResponse } from "next/server";
import { locales } from "@/lib/i18n/config";
import { KLEVER_SITE_LOGIN_WEBSITES_QUERY } from "@/src/graphql/mutations";
import { siteLoginGraphql } from "@/lib/site-login/server";
import type { StoreCodes } from "@/lib/store/website";

// GET — websites with Site Login on (GraphQL: kleverSiteLoginWebsites), with the store
// view code of each website for every UI language. Public (no login needed).
// Response: { websites: [{ website_id, website_code, label, logo, store_codes: { en, ar } }] }
// Labels/logos are in the requested ?lang (default: first locale).
export async function GET(request: NextRequest) {
    const cookies = request.headers.get("cookie");
    const wanted = request.nextUrl.searchParams.get("lang");
    const displayLang = (locales as readonly string[]).includes(wanted || "") ? wanted! : locales[0];

    try {
        const perLang = await Promise.all(
            locales.map(async (lang) => {
                const data = await siteLoginGraphql(KLEVER_SITE_LOGIN_WEBSITES_QUERY, { lang }, { store: lang, cookies });
                const list = Array.isArray(data?.kleverSiteLoginWebsites) ? data.kleverSiteLoginWebsites : [];
                return { lang, list: list.filter((w: any) => w && w.website_id != null) };
            }),
        );

        const byId = new Map<number, any>();
        for (const { lang, list } of perLang) {
            for (const w of list) {
                const entry = byId.get(w.website_id) || { store_codes: {} as StoreCodes };
                if (lang === displayLang || !entry.website_id) {
                    Object.assign(entry, {
                        website_id: w.website_id,
                        website_code: w.website_code,
                        label: w.label,
                        logo: w.logo,
                    });
                }
                if (w.store_code) entry.store_codes[lang] = w.store_code;
                byId.set(w.website_id, entry);
            }
        }
        return NextResponse.json({ websites: Array.from(byId.values()) });
    } catch (error: any) {
        return NextResponse.json({ websites: [], message: error?.message }, { status: 502 });
    }
}
