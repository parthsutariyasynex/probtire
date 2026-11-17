import enDict from "@/public/locales/en.json";
import arDict from "@/public/locales/ar.json";
import type { Locale } from "@/lib/i18n/config";

const DICT: Record<Locale, Record<string, string>> = { en: enDict, ar: arDict };

/** Translate a UI key in a server component (same files as useTranslation). */
export function serverT(locale: Locale): (key: string) => string {
    return (key) => DICT[locale]?.[key] ?? key;
}
