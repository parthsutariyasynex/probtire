"use client";

import { useEffect, useState } from "react";
import { getClientLocale } from "@/lib/api/api-client";
import { toStoreCode } from "@/lib/store/website";

// A label exactly as Magento's storefront translates it for the selected website + language
// (e.g. Magento's checkout "Tax" row → "VAT (15%)" / "ضريبة القيمة المضافة 15 %"), from
// /api/kleverapi/magento-translations. Cached per store view and phrase. `initial` is shown
// only until Magento's label has loaded.

const cache = new Map<string, Promise<string | null>>();

export function useMagentoLabel(phrase: string, initial: string): string {
    const [label, setLabel] = useState(initial);
    useEffect(() => {
        const locale = getClientLocale();
        const key = `${toStoreCode(locale, document.cookie)}|${phrase}`;
        if (!cache.has(key)) {
            cache.set(key, fetch(`/api/kleverapi/magento-translations?keys=${encodeURIComponent(phrase)}&lang=${locale}`, { headers: { "x-locale": locale } })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => (typeof d?.translations?.[phrase] === "string" ? d.translations[phrase] : null))
                .catch(() => { cache.delete(key); return null; }));
        }
        let cancelled = false;
        cache.get(key)!.then((v) => { if (!cancelled && v) setLabel(v); });
        return () => { cancelled = true; };
    }, [phrase]);
    return label;
}
