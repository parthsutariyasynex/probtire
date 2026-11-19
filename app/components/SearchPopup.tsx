"use client";

import React, { useState } from "react";
import Popup from "./Popup";
import { Search, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useRouter } from "next/navigation";
import { useLocalePath } from "@/hooks/useLocalePath";

interface SearchPopupProps {
    isOpen: boolean;
    onClose: () => void;
}

// Parse tyre size string like "195", "19565", "1956515", "195/65R15", "195/65 R15"
function parseTyreSize(input: string): { width: string; height: string; rim: string } {
    const cleaned = input.replace(/\s+/g, "").toUpperCase();

    // Format with slash: 195/65R15 or 195/65 R 15 or 195/65
    const slashMatch = cleaned.match(/^(\d{3})\/(\d{2})?R?(\d{2,3})?$/i);
    if (slashMatch) {
        return { width: slashMatch[1] || "", height: slashMatch[2] || "", rim: slashMatch[3] || "" };
    }

    // Pure digits or digits with R: 1956515, 19565R15, 19565, 195
    const matchNoSlash = cleaned.match(/^(\d{3})(\d{2})?R?(\d{2,3})?$/i);
    if (matchNoSlash && matchNoSlash[1]) {
        return {
            width: matchNoSlash[1] || "",
            height: matchNoSlash[2] || "",
            rim: matchNoSlash[3] || "",
        };
    }

    const digits = cleaned.replace(/\D/g, "");
    if (digits.length >= 7) {
        return { width: digits.slice(0, 3), height: digits.slice(3, 5), rim: digits.slice(5) };
    }
    if (digits.length >= 5) {
        return { width: digits.slice(0, 3), height: digits.slice(3, 5), rim: "" };
    }
    if (digits.length >= 3) {
        return { width: digits.slice(0, 3), height: "", rim: "" };
    }

    return { width: digits, height: "", rim: "" };
}

/** Magento's header tyre-size search (src/lib/magentoOrderView.ts → getMagentoTyreSizeSearch). */
type TyreSize = { label: string; lookup: string; width: string; height: string; rim: string };
type TyreSizeSearch = { sizes: TyreSize[]; placeholder: string | null; minCharsText: string | null; noResultText: string | null };
// Magento shows matches only from 3 typed characters (its "Please enter 3 or more characters").
const MIN_CHARS = 3;

const SearchPopup: React.FC<SearchPopupProps> = ({ isOpen, onClose }) => {
    const { isRtl, locale } = useTranslation();
    const router = useRouter();
    const lp = useLocalePath();
    const [query, setQuery] = useState("");
    // Magento's size list + texts for the selected website and language (loaded when the popup opens)
    const [magento, setMagento] = useState<TyreSizeSearch | null>(null);
    const [loadedFor, setLoadedFor] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);

    const handleClose = () => {
        setQuery("");
        onClose();
    };

    // Clear search query whenever popup closes or opens
    React.useEffect(() => {
        if (!isOpen) setQuery("");
    }, [isOpen]);

    // Load Magento's tyre-size list once per website + language (store cookie / locale decide it)
    React.useEffect(() => {
        if (!isOpen) return;
        const key = `${locale}|${typeof document !== "undefined" ? document.cookie.match(/selected_store=([^;]*)/)?.[1] ?? "" : ""}`;
        if (loadedFor === key && magento) return;
        let cancelled = false;
        setIsLoading(true);
        setLoadError(false);
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        fetch(`/api/kleverapi/quick-order/search?view=tyre-sizes`, {
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-locale": locale },
            cache: "no-store",
        })
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((d: TyreSizeSearch) => { if (!cancelled) { setMagento(d); setLoadedFor(key); } })
            .catch(() => { if (!cancelled) setLoadError(true); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, locale, loadedFor, magento]);

    // Same rule as Magento's popup: a size matches when its lookup text contains what was typed.
    const typed = query.toLowerCase();
    const suggestions = React.useMemo(
        () => (magento && typed.length >= MIN_CHARS ? magento.sizes.filter((s) => s.lookup.toLowerCase().includes(typed)) : []),
        [magento, typed]
    );
    const tooShort = query.length > 0 && typed.length < MIN_CHARS;
    const noResults = !!magento && typed.length >= MIN_CHARS && suggestions.length === 0;

    const handleSearch = (e?: React.FormEvent, term?: string) => {
        if (e) e.preventDefault();
        const searchVal = term || query;
        if (!searchVal.trim()) return;

        const parsed = parseTyreSize(searchVal.trim());

        // Build URL with width/height/rim params for the products page
        const params = new URLSearchParams();
        if (parsed.width) params.set("width", parsed.width);
        if (parsed.height) params.set("height", parsed.height);
        if (parsed.rim) params.set("rim", parsed.rim);
        if (!parsed.width) params.set("search", searchVal.trim());

        router.push(lp(`/products?${params.toString()}`));
        handleClose();
    };

    // A size picked from Magento's list → products filtered by its width / height / rim (as Magento does).
    const handleSuggestionClick = (size: TyreSize) => {
        const params = new URLSearchParams();
        if (size.width) params.set("width", size.width);
        if (size.height) params.set("height", size.height);
        if (size.rim) params.set("rim", size.rim);

        router.push(lp(`/products?${params.toString()}`));
        handleClose();
    };


    return (
        <Popup
            isOpen={isOpen}
            onClose={handleClose}
            maxWidth="max-w-3xl"
            className="!rounded-2xl overflow-visible h-fit"
            scrollable={false}
            closeOnOverlayClick={true}
        >
            <div className="relative p-6 md:p-10" dir={isRtl ? "rtl" : "ltr"}>
                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className={`absolute -top-3 ${isRtl ? "-left-3" : "-right-3"} w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 hover:border-red-600 transition-all duration-300 z-[1001] cursor-pointer group hover:scale-110 active:scale-90`}
                >
                    <X size={16} className="text-gray-900 group-hover:text-white transition-colors" />
                </button>

                <div className="flex flex-col gap-0">
                    {/* Search Input */}
                    <form dir="ltr" onSubmit={(e) => handleSearch(e)} className="flex items-stretch gap-0 bg-white border-2 border-brand-yellow rounded-xl overflow-hidden shadow-sm h-14 md:h-16 transition-all relative z-20 flex-shrink-0">
                        <input
                            type="text"
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={magento?.placeholder ?? ""}
                            className="flex-1 px-6 md:px-10 text-base md:text-lg font-bold text-black outline-none placeholder:text-[#b2b2b2] placeholder:font-medium bg-transparent min-w-0 text-left"
                        />
                        <button
                            type="submit"
                            className="bg-brand-yellow hover:bg-brand-yellow-dark text-[#1c1c1c] w-14 md:w-20 flex items-center justify-center transition-all duration-300 cursor-pointer active:scale-95 flex-shrink-0"
                        >
                            <Search size={22} strokeWidth={3} />
                        </button>
                    </form>

                    {/* Suggestions — Magento's tyre sizes matching what was typed, with Magento's texts */}
                    {(query.length > 0 || loadError) && (isLoading || loadError || tooShort || noResults || suggestions.length > 0) && (
                        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl max-h-[300px] overflow-y-auto shadow-lg">
                            {isLoading && (
                                <div className="p-3 space-y-2">
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} className="px-3 py-2">
                                            <div className="h-4 w-1/3 bg-gray-200 rounded animate-pulse" />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!isLoading && loadError && (
                                <div className="px-6 md:px-10 py-6 text-center text-red-600 text-sm font-medium">
                                    <button type="button" onClick={() => { setLoadedFor(null); setMagento(null); }} className="underline cursor-pointer">↻</button>
                                </div>
                            )}
                            {!isLoading && !loadError && tooShort && magento?.minCharsText && (
                                <div className="px-6 md:px-10 py-6 text-center text-gray-400 text-sm font-medium">{magento.minCharsText}</div>
                            )}
                            {!isLoading && !loadError && noResults && (
                                <div className="px-6 md:px-10 py-6 text-center text-gray-400 text-sm font-medium">{magento?.noResultText}</div>
                            )}
                            {!isLoading && !loadError && suggestions.map((size) => (
                                <div
                                    key={size.label}
                                    onClick={() => handleSuggestionClick(size)}
                                    className="px-6 md:px-10 py-3.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                                >
                                    <span dir="ltr" className="text-body-xl font-bold text-black">{size.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Popup>
    );
};

export default SearchPopup;
