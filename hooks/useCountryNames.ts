"use client";

import { useEffect, useState } from "react";
import { getClientLocale } from "@/lib/api/api-client";
import { toStoreCode } from "@/lib/store/website";

// Country names (id → name) of the selected website + language, from Magento via
// /api/kleverapi/countries. Until they load — or if Magento has no name for a code —
// countryName() returns "" (nothing is guessed).

const loaded = new Map<string, Record<string, string>>();

export function useCountryNames() {
    const locale = getClientLocale();
    const store = typeof document !== "undefined" ? toStoreCode(locale, document.cookie) : locale;
    const [countries, setCountries] = useState<Record<string, string>>(() => loaded.get(store) ?? {});

    useEffect(() => {
        if (loaded.has(store)) { setCountries(loaded.get(store)!); return; }
        let cancelled = false;
        fetch(`/api/kleverapi/countries?lang=${locale}`, { headers: { "x-locale": locale } })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d) => {
                const map: Record<string, string> = d?.countries ?? {};
                loaded.set(store, map);
                if (!cancelled) setCountries(map);
            })
            .catch((err) => console.warn("[countries] unavailable:", err?.message || err));
        return () => { cancelled = true; };
    }, [store, locale]);

    return (code: string | null | undefined) => (code ? countries[code] ?? "" : "");
}
