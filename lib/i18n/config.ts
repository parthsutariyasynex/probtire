// ─── i18n Configuration ─────────────────────────────────────────────────────
// Supported locales and default settings for Magento multi-store integration.

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Direction mapping for each locale */
export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
    en: "ltr",
    ar: "rtl",
};

/** Display names for each locale (used in the language switcher) */
export const localeNames: Record<Locale, string> = {
    en: "English",
    ar: "العربية",
};


/**
 * Check if a string is a valid locale.
 */
export function isValidLocale(value: string): value is Locale {
    return locales.includes(value as Locale);
}
