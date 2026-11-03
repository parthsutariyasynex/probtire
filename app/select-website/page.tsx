"use client";
import { useTranslation } from "@/hooks/useTranslation";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLocalePath } from "@/hooks/useLocalePath";
import { redirectToLogin } from "@/utils/helpers";

// ─── Types ──────────────────────────────────────────────────────────────────
// Shape mirrors what the future Magento query (e.g. `kleverCustomerWebsites`)
// should return, so the sample data below can be swapped 1:1 for the API result.
export type AssignedWebsite = {
    websiteId: number;
    /** Magento store code — saved to the `selected_store` cookie. */
    code: string;
    name: { en: string; ar: string };
    description?: { en: string; ar: string };
    /** Locale-less product listing path for this website. */
    productListingPath: string;
};

// ─── Sample data (replace with Magento API) ─────────────────────────────────
// Keyed by the logged-in user's email (session.user.email).
// `default` is used for any user not listed here.
const SAMPLE_USER_WEBSITES: Record<string, AssignedWebsite[]> = {
    default: [
        {
            websiteId: 1,
            code: "altalayi",
            name: { en: "Al Talayi", ar: "الطلايع" },
            description: { en: "Al Talayi tyre catalogue", ar: "كتالوج إطارات الطلايع" },
            productListingPath: "/products",
        },
        {
            websiteId: 2,
            code: "pro_btire",
            name: { en: "Pro BTire", ar: "برو بي تاير" },
            description: { en: "Pro BTire tyre catalogue", ar: "كتالوج إطارات برو بي تاير" },
            productListingPath: "/products",
        },
    ],
    // Example of a user restricted to a single website:
    // "user@example.com": [ { websiteId: 2, code: "pro_btire", ... } ],
};

/**
 * Returns the websites assigned to a user.
 * TODO: replace the body with the Magento GraphQL call — keep the signature.
 */
async function fetchAssignedWebsites(userEmail: string | null | undefined): Promise<AssignedWebsite[]> {
    const key = (userEmail || "").toLowerCase();
    return SAMPLE_USER_WEBSITES[key] ?? SAMPLE_USER_WEBSITES.default;
}

// ─── Page text (local until keys are added to public/locales/*.json) ────────
const TEXT = {
    en: {
        title: "Select Website",
        subtitle: "Choose a website to view its products.",
        open: "View products",
        empty: "No websites are assigned to your account.",
        loading: "Loading websites...",
    },
    ar: {
        title: "اختر الموقع",
        subtitle: "اختر موقعًا لعرض منتجاته.",
        open: "عرض المنتجات",
        empty: "لا توجد مواقع مخصصة لحسابك.",
        loading: "جارٍ تحميل المواقع...",
    },
} as const;

const SELECTED_STORE_COOKIE = "selected_store";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default function SelectWebsitePage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const { locale, isRtl } = useTranslation();
    const lp = useLocalePath();
    const text = TEXT[locale === "ar" ? "ar" : "en"];
    const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";

    const [websites, setWebsites] = useState<AssignedWebsite[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authStatus === "unauthenticated") {
            redirectToLogin(router);
        }
    }, [authStatus, router]);

    const userEmail = session?.user?.email;

    useEffect(() => {
        if (authStatus !== "authenticated") return;
        let cancelled = false;
        setLoading(true);
        fetchAssignedWebsites(userEmail)
            .then((list) => { if (!cancelled) setWebsites(list); })
            .catch(() => { if (!cancelled) setWebsites([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [authStatus, userEmail]);

    // Highlight the previously chosen website (read client-side only).
    const [selectedCode, setSelectedCode] = useState<string | null>(null);
    useEffect(() => {
        const match = document.cookie.match(new RegExp(`(?:^|; )${SELECTED_STORE_COOKIE}=([^;]*)`));
        setSelectedCode(match ? decodeURIComponent(match[1]) : null);
    }, []);

    const handleSelect = (website: AssignedWebsite) => {
        document.cookie = `${SELECTED_STORE_COOKIE}=${encodeURIComponent(website.code)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
        // Full navigation so the new cookie is sent with the next server request.
        window.location.href = lp(website.productListingPath);
    };

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            className="flex-1 flex flex-col min-h-0 bg-white font-rubik"
        >
            <div className="w-full bg-white px-4 md:px-8 py-6 md:py-10">
                <h1 className="text-h3 md:text-[26px] font-bold text-black uppercase tracking-wide">
                    {text.title}
                </h1>
                <p className="mt-2 text-sm md:text-base text-gray-600">{text.subtitle}</p>

                <div className="mt-6 md:mt-8">
                    {authStatus === "loading" || loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label={text.loading}>
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="h-[132px] rounded-[3px] border border-gray-200 bg-gray-100 animate-pulse" />
                            ))}
                        </div>
                    ) : websites.length === 0 ? (
                        <p className="text-gray-600">{text.empty}</p>
                    ) : (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {websites.map((website) => {
                                const isSelected = website.code === selectedCode;
                                return (
                                    <li key={website.websiteId}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(website)}
                                            className={`group w-full h-full flex flex-col justify-between gap-4 rounded-[3px] border p-5 text-start transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow ${
                                                isSelected
                                                    ? "border-brand-yellow bg-brand-yellow-light"
                                                    : "border-gray-200 bg-white hover:border-brand-yellow hover:bg-brand-yellow-light"
                                            }`}
                                        >
                                            <div>
                                                <p className="text-lg font-semibold text-black">{website.name[lang]}</p>
                                                {website.description && (
                                                    <p className="mt-1 text-sm text-gray-600">{website.description[lang]}</p>
                                                )}
                                            </div>
                                            <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase text-black">
                                                {text.open}
                                                <svg
                                                    className={`w-4 h-4 transition-transform ${isRtl ? "rotate-180 group-hover:-translate-x-1" : "group-hover:translate-x-1"}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                    viewBox="0 0 24 24"
                                                    aria-hidden="true"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                </svg>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
