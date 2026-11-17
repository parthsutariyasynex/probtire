"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/utils/helpers";
import { useLocale } from "@/lib/i18n/client";
import { getClientStoreConfig } from "@/lib/store/client-config";
import { toStoreCode } from "@/lib/store/website";

interface PriceProps {
    amount: number | string | null | undefined;
    className?: string;
    symbolClassName?: string;
}

// Display currency of the selected website + language, from Magento
// (storeConfig.default_display_currency_code), cached per store view.
const currencyByStore = new Map<string, string>();

// The Saudi Riyal sign is drawn with the site's icon font (glyph U+E900).
const RIYAL_ICON = "";

export default function Price({ amount, className = "", symbolClassName = "" }: PriceProps) {
    const locale = useLocale();
    // Starts empty on server and client alike (no hydration mismatch); set from Magento after mount.
    const [currency, setCurrency] = useState<string | null>(null);

    useEffect(() => {
        const store = toStoreCode(locale, document.cookie);
        const known = currencyByStore.get(store);
        if (known) { setCurrency(known); return; }
        let cancelled = false;
        getClientStoreConfig(locale).then((cfg) => {
            const code = cfg?.default_display_currency_code || null;
            if (code) currencyByStore.set(store, code);
            if (!cancelled) setCurrency(code);
        });
        return () => { cancelled = true; };
    }, [locale]);

    // formatPrice gives "<prefix> 1,234.56" — only the number part is used here.
    const formatted = formatPrice(amount, locale);
    const parts = formatted.split(" ");
    const value = parts.length > 1 ? parts.slice(1).join(" ") : formatted;

    // If className doesn't specify a font weight, default to font-bold
    const weightClass = className.includes("font-") ? "" : "font-bold";

    return (
        <span dir="ltr" className={`inline-flex items-center gap-1 ${weightClass} ${className}`}>
            {currency === "SAR" && <span className={`currency-riyal ${symbolClassName}`}>{RIYAL_ICON}</span>}
            {currency && currency !== "SAR" && <span className={symbolClassName}>{currency}</span>}
            <span>{value}</span>
        </span>
    );
}
