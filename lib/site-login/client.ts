"use client";
// Client helper: remember the chosen website's store view codes in the cookie.
import { SELECTED_WEBSITE_COOKIE, SELECTED_WEBSITE_MAX_AGE, serializeStoreCodes, type StoreCodes } from "@/lib/store/website";
import type { Locale } from "@/lib/i18n/config";

/**
 * Save the store view codes of `websiteId` for every UI language, looked up from
 * kleverSiteLoginWebsites. If that lookup fails, `knownStoreCode` (from the
 * account the API just returned) is saved for the current language.
 */
export async function rememberWebsite(
    websiteId: number | null | undefined,
    knownStoreCode: string | null | undefined,
    lang: Locale,
): Promise<void> {
    let codes: StoreCodes = knownStoreCode ? { [lang]: knownStoreCode } : {};
    if (websiteId != null) {
        try {
            const res = await fetch("/api/kleverapi/site-login/websites", { cache: "no-store" });
            const data = await res.json();
            const site = (data?.websites || []).find((w: any) => w.website_id === websiteId);
            if (site?.store_codes) codes = { ...site.store_codes, ...codes };
        } catch { /* keep knownStoreCode */ }
    }
    const value = serializeStoreCodes(codes);
    forgetWebsiteCaches();
    document.cookie = value
        ? `${SELECTED_WEBSITE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${SELECTED_WEBSITE_MAX_AGE}; samesite=lax`
        : `${SELECTED_WEBSITE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("website-changed"));
    }
}

/**
 * Drop browser caches that belong to the previously selected website: the Navbar
 * menu (navmenu_*), the menu-derived default category and the checkout state of
 * that website's cart. They are rebuilt for the new website on the next page load.
 */
export function forgetWebsiteCaches(): void {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith("navmenu_")) localStorage.removeItem(key);
        }
    } catch { /* storage unavailable */ }
    try {
        sessionStorage.removeItem("defaultCategoryId");
    } catch { /* storage unavailable */ }
    // Checkout state of the previous website's cart (multi-address steps, chosen methods,
    // which uploaded files are PO / payment) — each website has its own Magento cart.
    try {
        for (const key of [
            "multi_shipping_assignments",
            "multi_shipping_items",
            "multi_shipping_methods",
            "multi_shipping_billing_address_id",
            "multi_shipping_payment_method",
            "payment_commitment_file_names",
            "po_file_names",
        ]) localStorage.removeItem(key);
    } catch { /* storage unavailable */ }
}
