"use client";

import React from "react";
import type { SiteLoginAccount } from "@/lib/site-login/types";

// "Choose your website" box (Klever_SiteLogin) — used after login and on /select-website.
// Layout follows the Magento landing page; colours follow the BTire yellow theme.

const TEXT = {
    en: {
        title: "Choose your website",
        subtitle: "Your account is available on these websites. Click a website to open it.",
        current: "Current",
        another: "Use another account",
        opening: "Opening…",
    },
    ar: {
        title: "اختر الموقع",
        subtitle: "حسابك متاح على هذه المواقع. اضغط على موقع لفتحه.",
        current: "الحالي",
        another: "استخدام حساب آخر",
        opening: "جارٍ الفتح…",
    },
} as const;

type Props = {
    accounts: SiteLoginAccount[];
    lang: "en" | "ar";
    onSelect: (account: SiteLoginAccount) => void;
    /** account_id currently being opened — shows a spinner and disables the grid. */
    busyAccountId?: number | null;
    /** account_id to mark as "Current" (e.g. the selected_store website). */
    currentAccountId?: number | null;
    onUseAnotherAccount?: () => void;
    loading?: boolean;
};

export default function WebsiteChooser({
    accounts,
    lang,
    onSelect,
    busyAccountId = null,
    currentAccountId = null,
    onUseAnotherAccount,
    loading = false,
}: Props) {
    const text = TEXT[lang];
    const busy = busyAccountId !== null;

    return (
        <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex-1 w-full bg-canvas font-rubik">
            <div className="mx-auto w-full max-w-[760px] px-4 pt-10 sm:pt-14 pb-12 flex flex-col items-center text-center">
                <img src="/logo/btire-logo-horizontal.svg" alt="BTire" className="h-12 sm:h-14 w-auto" />

                <h1 className="mt-6 text-2xl sm:text-[28px] font-bold text-gray-900">{text.title}</h1>
                <span className="mt-3 block h-1 w-14 rounded-full bg-brand-yellow" aria-hidden="true" />
                <p className="mt-4 max-w-[480px] text-sm sm:text-base text-gray-600 leading-relaxed">
                    {text.subtitle}
                </p>

                <ul className="mt-8 w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {loading
                        ? [0, 1, 2].map((i) => (
                            <li key={i} className="h-[184px] rounded-[3px] border border-gray-200 bg-white animate-pulse" />
                        ))
                        : accounts.map((account) => {
                            const isCurrent = account.current || account.account_id === currentAccountId;
                            const isBusy = account.account_id === busyAccountId;
                            return (
                                <li key={account.account_id}>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => onSelect(account)}
                                        className={`relative w-full h-full flex flex-col items-center gap-3 rounded-[3px] border-2 bg-white px-4 pt-6 pb-5 transition-all cursor-pointer
                                            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow focus-visible:ring-offset-2
                                            disabled:cursor-wait
                                            ${isCurrent || isBusy
                                                ? "border-brand-yellow shadow-[0_6px_20px_rgba(245,178,27,0.25)]"
                                                : "border-gray-200 hover:border-brand-yellow hover:shadow-[0_6px_20px_rgba(245,178,27,0.2)] hover:-translate-y-0.5"}
                                            ${busy && !isBusy ? "opacity-50" : ""}`}
                                    >
                                        {isCurrent && (
                                            <span className="absolute top-2 end-2 rounded-sm bg-brand-yellow px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                                                {text.current}
                                            </span>
                                        )}
                                        <div className="flex h-[72px] w-[150px] items-center justify-center rounded-[3px] border border-gray-100 bg-white p-2">
                                            {account.logo ? (
                                                <img
                                                    src={account.logo}
                                                    alt={account.label || ""}
                                                    className="max-h-full max-w-full object-contain"
                                                />
                                            ) : (
                                                <span className="text-lg font-bold text-gray-400">
                                                    {(account.label || "?").slice(0, 2).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-base font-bold text-gray-900">{account.label || account.website_code}</p>
                                        {isBusy ? (
                                            <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                                                <span className="h-3.5 w-3.5 rounded-full border-2 border-brand-yellow border-t-transparent animate-spin" />
                                                {text.opening}
                                            </span>
                                        ) : (
                                            account.name && <p className="text-xs text-gray-500 -mt-1">{account.name}</p>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                </ul>

                {onUseAnotherAccount && (
                    <button
                        type="button"
                        onClick={onUseAnotherAccount}
                        disabled={busy}
                        className="mt-6 text-sm font-semibold text-gray-900 underline decoration-brand-yellow decoration-2 underline-offset-4 hover:text-brand-yellow-dark cursor-pointer disabled:opacity-50"
                    >
                        {text.another}
                    </button>
                )}
            </div>
        </div>
    );
}
