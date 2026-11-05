"use client";
import { useTranslation } from "@/hooks/useTranslation";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useLocalePath } from "@/hooks/useLocalePath";
import { redirectToLogin } from "@/utils/helpers";
import { rememberWebsite } from "@/lib/site-login/client";
import type { SiteLoginAccount } from "@/lib/site-login/types";
import WebsiteChooser from "@/components/WebsiteChooser";

// Post-login website switcher (Klever_SiteLogin).
//   list   → GET /api/kleverapi/site-login/accounts (kleverSiteLoginAccounts)
//   switch → useSession().update({ switchAccountId }) → jwt callback → kleverSiteLoginSwitch
// The switch runs server-side with the current Bearer token; the new token lands in the session.

const TEXT = {
    en: { single: "Your account is available on one website only.", back: "Continue", failed: "Could not switch website. Please try again." },
    ar: { single: "حسابك متاح على موقع واحد فقط.", back: "متابعة", failed: "تعذر تبديل الموقع. حاول مرة أخرى." },
} as const;

export default function SelectWebsitePage() {
    const { data: session, status: authStatus, update } = useSession();
    const router = useRouter();
    const { locale } = useTranslation();
    const lp = useLocalePath();
    const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";
    const text = TEXT[lang];

    const [accounts, setAccounts] = useState<SiteLoginAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [switchingId, setSwitchingId] = useState<number | null>(null);

    useEffect(() => {
        if (authStatus === "unauthenticated") redirectToLogin(router);
    }, [authStatus, router]);

    const accessToken = (session as any)?.accessToken as string | undefined;

    useEffect(() => {
        if (authStatus !== "authenticated") return;
        let cancelled = false;
        setLoading(true);
        fetch("/api/kleverapi/site-login/accounts", {
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
            cache: "no-store",
        })
            .then((r) => r.json())
            .then((d) => { if (!cancelled) setAccounts(Array.isArray(d?.accounts) ? d.accounts : []); })
            .catch(() => { if (!cancelled) setAccounts([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // Re-fetch only on login state / language change, not on every token refresh.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authStatus, lang]);

    const goHome = () => { window.location.href = lp("/"); };

    const handleSelect = async (account: SiteLoginAccount) => {
        if (account.current) {
            await rememberWebsite(account.website_id, account.store_code, lang);
            goHome();
            return;
        }
        setSwitchingId(account.account_id);
        try {
            const next: any = await update({ switchAccountId: account.account_id });
            if (next?.accessToken && next.accessToken !== accessToken) {
                localStorage.setItem("token", next.accessToken);
                await rememberWebsite(account.website_id, next.storeCode || account.store_code, lang);
                // Full navigation so the new cookie + session are sent with every request.
                goHome();
                return;
            }
        } catch { /* fall through */ }
        toast.error(text.failed);
        setSwitchingId(null);
    };

    if (!loading && authStatus === "authenticated" && accounts.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-canvas px-4 py-16 font-rubik text-center">
                <p className="text-gray-700">{text.single}</p>
                <button type="button" onClick={goHome} className="btn-primary">{text.back}</button>
            </div>
        );
    }

    return (
        <WebsiteChooser
            accounts={accounts}
            lang={lang}
            loading={authStatus === "loading" || loading}
            busyAccountId={switchingId}
            onSelect={handleSelect}
        />
    );
}
