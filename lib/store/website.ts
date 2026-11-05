// ─── Selected website → Magento store view code (fully dynamic) ─────────────
// Websites and their store view codes come from the Klever_SiteLogin API
// (kleverSiteLoginVerify / kleverSiteLoginAccounts / kleverSiteLoginWebsites).
// Nothing about the websites (names, codes, prefixes) is hardcoded here.
//
// When the customer opens a website, the store view code of that website for every
// UI language is saved in the `selected_store` cookie, e.g.
//     selected_store = "en=roya_en&ar=roya_ar"
// Every backend call then picks the code for the current UI language (NEXT_LOCALE).
// No cookie → the plain language code (Magento's default store view for it).
//
// Edge-safe: no `next/headers` import, so it can be used from middleware.

import { locales, type Locale } from "@/lib/i18n/config";

export const SELECTED_WEBSITE_COOKIE = "selected_store";
export const SELECTED_WEBSITE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Store view code per UI language, as saved in the cookie. */
export type StoreCodes = Partial<Record<Locale, string>>;

const STORE_CODE_RE = /^[a-z0-9_]+$/i;

function isLocale(value: unknown): value is Locale {
    return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Serialize store codes for the cookie value (invalid codes are dropped). */
export function serializeStoreCodes(codes: StoreCodes): string {
    const params = new URLSearchParams();
    for (const lang of locales) {
        const code = codes[lang];
        if (code && STORE_CODE_RE.test(code)) params.set(lang, code);
    }
    return params.toString();
}

/** Parse the cookie value back into store codes (unknown/old formats → {}). */
export function parseStoreCodes(value: string | null | undefined): StoreCodes {
    const codes: StoreCodes = {};
    if (!value || !value.includes("=")) return codes;
    const params = new URLSearchParams(value);
    for (const lang of locales) {
        const code = params.get(lang);
        if (code && STORE_CODE_RE.test(code)) codes[lang] = code;
    }
    return codes;
}

/** Read the saved store codes from a raw `Cookie` header value. */
export function getStoreCodesFromCookieHeader(cookieHeader: string | null | undefined): StoreCodes {
    const match = (cookieHeader || "").match(new RegExp(`(?:^|;\\s*)${SELECTED_WEBSITE_COOKIE}=([^;]+)`));
    if (!match) return {};
    try {
        return parseStoreCodes(decodeURIComponent(match[1]));
    } catch {
        return {};
    }
}

/**
 * Magento store view code for a UI language + the selected website.
 *
 *   toStoreCode("ar", request)        → "roya_ar"  (cookie: en=roya_en&ar=roya_ar)
 *   toStoreCode("ar", cookieHeader)   → same, from a raw Cookie header string
 *   toStoreCode("en", null)           → "en"       (no website chosen)
 *
 * A value that is already a store code (not a UI language) is returned as-is,
 * so it is safe to wrap any existing `Store` value.
 */
export function toStoreCode(
    locale: string | null | undefined,
    source: Request | string | null | undefined,
): string {
    if (locale && !isLocale(locale) && STORE_CODE_RE.test(locale)) return locale;
    const lang: Locale = isLocale(locale) ? locale : locales[0];

    const cookieHeader = typeof source === "string" ? source : source?.headers.get("cookie");
    const codes = getStoreCodesFromCookieHeader(cookieHeader);
    // Right website beats right language: if this language's code is missing, keep
    // the chosen website's other store view rather than falling back to the default site.
    return codes[lang] || Object.values(codes)[0] || lang;
}

/** Shortcut: full store code for an incoming request + its language. */
export function getStoreCodeFromRequest(request: Request, locale: string): string {
    return toStoreCode(locale, request);
}

/**
 * Turn a Magento storefront URL into an app path for the current UI language.
 *
 * Magento puts the store view code in the URL path when "Add Store Code to URLs"
 * is on, e.g. Roya: https://pro.btire.com/roya_en/all-tyres/car-tyres.html.
 * The app's first path segment is the UI language, and Magento's urlResolver only
 * knows the path without the store code, so `/roya_en/…` must become `/en/…`.
 *
 * Only the exact store code that was sent in the Store header is replaced — no
 * website names or codes are assumed. A store code equal to the language (e.g.
 * `en`) is already a valid app path and is left as-is.
 *
 *   magentoUrlToAppPath("https://x/roya_en/all-tyres/a.html", "roya_en", "en") → "/en/all-tyres/a.html"
 *   magentoUrlToAppPath("https://x/en/all-tyres/a.html",      "en",      "en") → "/en/all-tyres/a.html"
 */
export function magentoUrlToAppPath(
    url: string | null | undefined,
    store: string | null | undefined,
    locale: string | null | undefined,
): string {
    if (!url) return "#";
    let pathname = url;
    let search = "";
    try {
        const parsed = new URL(url);
        pathname = parsed.pathname || "/";
        search = parsed.search;
    } catch { /* already a relative path */ }

    const lang: Locale = isLocale(locale) ? locale : locales[0];
    const segments = pathname.split("/");
    if (store && segments[1] === store && store !== lang) {
        segments[1] = lang;
    }
    return (segments.join("/") || "#") + search;
}
