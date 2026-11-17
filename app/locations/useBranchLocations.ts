"use client";

import { useEffect, useState } from "react";
import { getClientLocale } from "@/lib/api/api-client";
import { toStoreCode } from "@/lib/store/website";
import type { BranchLocations } from "@/src/lib/magentoLocations";

// Branch locations of the selected website + language (from Magento, via
// /api/kleverapi/branch-locations), shared by the map and the region cards. Cached per store.

const byStore = new Map<string, Promise<BranchLocations | null>>();

function load(locale: string): Promise<BranchLocations | null> {
    const store = toStoreCode(locale, document.cookie);
    if (!byStore.has(store)) {
        byStore.set(store, fetch(`/api/kleverapi/branch-locations?lang=${locale}`, { headers: { "x-locale": locale }, cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => (d?.locations ?? null) as BranchLocations | null)
            .catch(() => { byStore.delete(store); return null; }));
    }
    return byStore.get(store)!;
}

export function useBranchLocations(): { locations: BranchLocations | null; loading: boolean } {
    const [state, setState] = useState<{ locations: BranchLocations | null; loading: boolean }>({ locations: null, loading: true });
    useEffect(() => {
        let cancelled = false;
        load(getClientLocale()).then((locations) => { if (!cancelled) setState({ locations, loading: false }); });
        return () => { cancelled = true; };
    }, []);
    return state;
}
