"use client";

import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import PortalDropdown from "@/components/PortalDropdown";
import { StatementSkeleton, SidebarSkeleton } from "@/components/skeletons";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { redirectToLogin } from "@/utils/helpers";
import { useTranslation } from "@/hooks/useTranslation";
import { getClientLocale } from "@/lib/api/api-client";
import { getClientStoreConfig } from "@/lib/store/client-config";

// Today in the given timezone (Magento's store timezone), `monthsBack` calendar months earlier,
// as YYYY-MM-DD. A day that doesn't exist in the earlier month rolls over (31 Mar − 1 month →
// 3 Mar), the same way PHP's "-1 month" does on Magento's side.
function dateInTimezone(timeZone: string, monthsBack = 0): string {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const d = new Date(Date.UTC(get("year"), get("month") - 1 - monthsBack, get("day")));
    return d.toISOString().slice(0, 10);
}

export default function MyStatementPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const { t } = useTranslation();

    // As Magento's form: the period is pre-filled from the same day one month ago up to today
    // (e.g. 18-10-2026 → 18-11-2026), "today" being in Magento's store timezone (storeConfig.timezone).
    // The type starts on the first of Magento's statement types.
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    React.useEffect(() => {
        let cancelled = false;
        getClientStoreConfig(getClientLocale()).then((cfg) => {
            if (cancelled || !cfg?.timezone) return;
            setStartDate((prev) => prev || dateInTimezone(cfg.timezone!, 1));
            setEndDate((prev) => prev || dateInTimezone(cfg.timezone!, 0));
        });
        return () => { cancelled = true; };
    }, []);
    const [statementType, setStatementType] = useState("");
    const [statementTypes, setStatementTypes] = useState<{ value: string; label: string }[]>([]);
    const [typesLoaded, setTypesLoaded] = useState(false);

    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch Statement Types
    React.useEffect(() => {
        const fetchTypes = async () => {
            const token = (session as any)?.accessToken;
            if (!token) return;

            try {
                const res = await fetch("/api/kleverapi/my-statement/types", {
                    headers: { Authorization: `Bearer ${token}`, "x-locale": getClientLocale() },
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    setError(data?.message || t("statement.downloadFailed"));
                    return;
                }
                // Magento's statement types exactly ({ code, label }, Magento's order). As Magento's form,
                // the first type in Magento's list is selected (e.g. "Account Statement").
                const rawTypes: any[] = Array.isArray(data) ? data : [];
                const types = rawTypes
                    .filter((ty) => ty?.code)
                    .map((ty) => ({ value: String(ty.code), label: String(ty.label ?? ty.code) }));
                setStatementTypes(types);
                setStatementType((prev) => (prev && types.some((ty) => ty.value === prev) ? prev : types[0]?.value ?? ""));
            } catch (err) {
                console.error("Failed to fetch statement types:", err);
                setError(t("statement.downloadFailed"));
            } finally {
                setTypesLoaded(true);
            }
        };

        if (authStatus === "authenticated") {
            fetchTypes();
        }
    }, [authStatus, session, t]);

    // Auth Guard
    if (authStatus === "unauthenticated") {
        redirectToLogin(router);
        return null;
    }

    if (authStatus === "loading") {
        return (
            <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
                <div className="flex flex-col lg:flex-row flex-1 w-full">
                    <SidebarSkeleton />
                    <main className="flex-1 min-w-0"><StatementSkeleton /></main>
                </div>
            </div>
        );
    }

    const handleGetStatement = async () => {
        const token = (session as any)?.accessToken;
        if (!token) {
            toast.error(t("orders.mustLoggedIn"));
            return;
        }

        setIsDownloading(true);
        setError(null);
        // toast.loading("Download Started...", { id: "statement-download" });

        try {
            const queryParams = new URLSearchParams({
                fromDate: startDate,
                toDate: endDate,
                type: statementType,
            });

            const response = await fetch(`/api/kleverapi/my-statement?${queryParams.toString()}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
            });

            if (!response.ok) {
                // Magento's own message when it gives one.
                const data = await response.json().catch(() => null);
                // Magento only returned another account's statement: never shown.
                if (data?.code === "WRONG_ACCOUNT") throw new Error(t("statement.wrongAccount"));
                throw new Error(data?.message || t("statement.downloadFailed"));
            }

            const contentType = response.headers.get("content-type");

            if (contentType && contentType.includes("application/pdf")) {
                const blob = await response.blob();

                // --- Proper Download Solve ---
                const fileUrl = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.style.display = "none";
                a.href = fileUrl;
                // Magento's file name (from the PDF response), as Magento's own download uses.
                const disposition = response.headers.get("content-disposition") || "";
                const nameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
                const magentoName = nameMatch ? decodeURIComponent(nameMatch[1] || nameMatch[2]) : "";
                if (magentoName) a.download = magentoName; else a.download = "";

                document.body.appendChild(a);
                a.click();

                // Cleanup
                setTimeout(() => {
                    window.URL.revokeObjectURL(fileUrl);
                    document.body.removeChild(a);
                }, 100);

                toast.success(t("common.success"), { id: "statement-download" });
            } else {
                // Handle JSON fallback (if backend didn't follow the URL)
                const data = await response.json();
                if (data.pdf_url) {
                    const link = document.createElement("a");
                    link.href = data.pdf_url;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast.success(t("common.success"), { id: "statement-download" });
                } else {
                    throw new Error(t("statement.downloadFailed"));
                }
            }
        } catch (err: any) {
            setError(err.message || t("statement.downloadFailed"));
            toast.error(err.message || t("statement.downloadFailed"), { id: "statement-download" });
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white">


            <div className="flex flex-col lg:flex-row flex-1 min-h-0 w-full">
                {/* Left Sidebar */}
                <Sidebar />

                {/* Right Content */}
                <main className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white min-w-0">
                    <h1 className="text-h3 sm:text-h3 md:text-[26px] font-bold text-black mb-5 uppercase tracking-wide">
                        {t("statement.title")}
                    </h1>

                    <div className="max-w-[700px] bg-white border border-gray-200 shadow-sm overflow-hidden">
                        {/* Card Header */}
                        <div className="bg-surface-muted px-4 py-3 border-b border-gray-200">
                            <h2 className="text-body-lg font-bold text-black uppercase tracking-wide">
                                {t("m.get-your-statement")}
                            </h2>
                        </div>

                        {/* Card Body */}
                        <div className="p-3 md:p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-4">
                                {/* Start Date */}
                                <div>
                                    <label className="block text-body font-bold text-gray-800 mb-2">
                                        {t("m.start-date")}
                                    </label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full h-[45px] px-4 border border-gray-300 text-body-lg text-gray-700 focus:outline-none focus:border-brand-yellow transition-colors"
                                    />
                                </div>

                                {/* End Date */}
                                <div>
                                    <label className="block text-body font-bold text-gray-800 mb-2">
                                        {t("m.end-date")}
                                    </label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full h-[45px] px-4 border border-gray-300 text-body-lg text-gray-700 focus:outline-none focus:border-brand-yellow transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Statement Type */}
                            <div className="mb-6 md:mb-10">
                                <label className="block text-body font-bold text-gray-800 mb-2">
                                    {t("statement.statementType")}
                                </label>
                                <PortalDropdown
                                    value={statementType}
                                    onChange={(val) => setStatementType(val)}
                                    options={statementTypes}
                                    placeholder={typesLoaded ? t("m.select") : t("common.loading")}
                                    buttonClassName="w-full h-[45px] px-4 border border-gray-300 text-body-lg text-gray-700 focus:outline-none focus:border-brand-yellow transition-colors bg-white font-medium shadow-sm flex items-center justify-between cursor-pointer"
                                />
                            </div>

                            {/* Download Button */}
                            <div className="flex flex-col gap-4">
                                <button
                                    onClick={handleGetStatement}
                                    disabled={isDownloading || !typesLoaded || !startDate || !endDate || !statementType}
                                    className={`w-full sm:w-auto bg-brand-yellow text-black px-6 sm:px-10 py-3 md:py-3.5 font-bold text-body-lg uppercase tracking-widest hover:bg-brand-yellow-dark transition-all rounded-sm flex items-center justify-center gap-3 ${isDownloading || !typesLoaded || !startDate || !endDate || !statementType ? 'opacity-70 cursor-not-allowed grayscale' : ''}`}
                                >
                                    {isDownloading ? (
                                        t("common.loading")
                                    ) : (
                                        t("m.get-statement")
                                    )}
                                </button>

                                {error && (
                                    <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                                        <p className="text-body font-bold mb-1">{t("common.error")}</p>
                                        <p className="text-body-sm">{error}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
