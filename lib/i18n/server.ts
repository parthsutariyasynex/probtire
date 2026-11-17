// ─── Server-side locale helpers ─────────────────────────────────────────────
// The Magento REST base URL is built per request from the selected website's store
// code (lib/api/magento-url getBaseUrl) — never from the language alone.

import { cookies } from "next/headers";
import {
    LOCALE_COOKIE,
    defaultLocale,
    isValidLocale,
    type Locale,
} from "./config";

/**
 * Get the current locale from cookies.
 */
export async function getLocaleFromCookies(): Promise<Locale> {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get(LOCALE_COOKIE)?.value;
    return localeCookie && isValidLocale(localeCookie)
        ? localeCookie
        : defaultLocale;
}

/**
 * Extract locale from a NextRequest (for use in middleware or API routes
 * that already have the request object).
 */
export function getLocaleFromRequest(request: Request): Locale {
    // Check X-Locale header first (set by middleware)
    const headerLocale = request.headers.get("x-locale");
    if (headerLocale && isValidLocale(headerLocale)) {
        return headerLocale;
    }

    // Fallback: parse cookie from the Cookie header
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`));
    if (match && isValidLocale(match[1])) {
        return match[1] as Locale;
    }

    return defaultLocale;
}
