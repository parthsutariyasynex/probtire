"use client";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import { redirectToLogin } from "@/utils/helpers";
import { ManageAccountsSkeleton, SidebarSkeleton } from "@/components/skeletons";
import Drawer from "@/app/components/Drawer";

type SubAccount = {
    entity_id: number | string;
    firstname: string;
    lastname: string;
    email: string;
    is_active?: boolean | number;
    [key: string]: any;
};

const ROLE_CACHE = "altalayi_user_type_v1";
const TOKEN_CACHE = "altalayi_role_token_v1";

export default function ManageSubAccountsPage() {
    const router = useRouter();
    const { t, isRtl } = useTranslation();
    const lp = useLocalePath();
    const { data: session, status } = useSession();
    const token = (session as any)?.accessToken as string | undefined;

    const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loggingInId, setLoggingInId] = useState<string | number | null>(null);
    const [selectedSubAccount, setSelectedSubAccount] = useState<SubAccount | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [inputText, setInputText] = useState("");

    // Read role from sessionStorage synchronously so we get it right on first render
    // if Navbar has already populated it. Falls back to false until the API call completes.
    const [isSalesPerson, setIsSalesPerson] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return sessionStorage.getItem(ROLE_CACHE) === "Sales Person";
    });
    const [roleReady, setRoleReady] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        // Role is ready if we have a cached token that matches the current session.
        // We don't have the token here yet, so conservatively mark not-ready and
        // resolve in the effect below. The synchronous isSalesPerson read above
        // means we still start with the correct value in most cases.
        return false;
    });

    useEffect(() => {
        if (status === "unauthenticated") {
            redirectToLogin(router);
            return;
        }
    }, [status, router]);

    // Detect user role. Reads from sessionStorage cache written by Navbar; falls back to
    // calling the account-sidebar API. Sets roleReady so the fetch effect knows to proceed.
    useEffect(() => {
        const accessToken = (session as any)?.accessToken as string | undefined;
        if (!accessToken) return;

        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(TOKEN_CACHE) === accessToken) {
            setIsSalesPerson(sessionStorage.getItem(ROLE_CACHE) === "Sales Person");
            setRoleReady(true);
            return;
        }

        fetch("/api/kleverapi/account-sidebar", {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
            .then(r => r.json())
            .then(data => {
                const type = data?.user_type || "Customer";
                if (typeof sessionStorage !== "undefined") {
                    sessionStorage.setItem(ROLE_CACHE, type);
                    sessionStorage.setItem(TOKEN_CACHE, accessToken);
                }
                setIsSalesPerson(type === "Sales Person");
                setRoleReady(true);
            })
            .catch(() => setRoleReady(true));
    }, [(session as any)?.accessToken]);

    // Fetch accounts list — waits for role detection before choosing the right query.
    useEffect(() => {
        if (!token || !roleReady) return;

        const fetchSubAccounts = async () => {
            try {
                setLoading(true);
                setError(null);
                const url = isSalesPerson
                    ? "/api/kleverapi/subaccounts?type=sales_person"
                    : "/api/kleverapi/subaccounts";
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });

                const data = await res.json();

                if (!res.ok) {
                    setError(data.message || t("common.failed"));
                    return;
                }

                const all = Array.isArray(data) ? data : data.items || data.data || [];
                setSubAccounts(all);
            } catch (err: any) {
                setError(err.message || t("common.failed"));
            } finally {
                setLoading(false);
            }
        };

        fetchSubAccounts();
    }, [token, roleReady, isSalesPerson]);

    const handleLoginAsSubAccount = async (subAccount: SubAccount) => {
        if (!token) return;

        const subAccountId = subAccount.customer_id || subAccount.entity_id || subAccount.id || subAccount.sub_account_id;

        if (!subAccountId) {
            setError(t("common.error"));
            return;
        }
        setLoggingInId(subAccountId);
        setError(null);

        try {
            const loginUrl = isSalesPerson
                ? `/api/kleverapi/subaccounts/${subAccountId}/login?type=sales_person`
                : `/api/kleverapi/subaccounts/${subAccountId}/login`;

            const res = await fetch(loginUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || t("common.failed"));
                setLoggingInId(null);
                return;
            }

            // Fetch sub-account's own profile using their token to get customer_mobile.
            let subMobile = "";
            try {
                const profileRes = await fetch("/api/kleverapi/my-account", {
                    headers: { Authorization: `Bearer ${data.token}` },
                });
                if (profileRes.ok) {
                    const profile = await profileRes.json();
                    subMobile = profile?.custom_attributes?.find(
                        (a: any) => a.attribute_code === "customer_mobile"
                    )?.value || "";
                }
            } catch { }

            localStorage.setItem("isSubAccount", "true");
            localStorage.setItem("subAccountName", `${subAccount.firstname || ""} ${subAccount.lastname || ""}`.trim());
            localStorage.setItem("subAccountId", String(subAccountId));
            localStorage.setItem("subAccountData", JSON.stringify({
                token: data.token,
                customer: {
                    email: subAccount.email,
                    firstname: subAccount.firstname,
                    lastname: subAccount.lastname,
                    customer_code: (subAccount as any).customer_code,
                    company_name: (subAccount as any).company_name,
                    customer_mobile: subMobile,
                },
            }));

            router.push(lp("/subaccount/my-account"));
        } catch (err: any) {
            setError(err.message || t("common.failed"));
            setLoggingInId(null);
        }
    };

    // Client-side search filter for Sales Person (by code, company, name)
    const filteredAccounts = useMemo(() => {
        if (!isSalesPerson || !searchQuery.trim()) return subAccounts;
        const q = searchQuery.trim().toLowerCase();
        return subAccounts.filter(a => {
            const code = ((a as any).customer_code || "").toLowerCase();
            const company = ((a as any).company_name || "").toLowerCase();
            const name = ((a as any).name || `${a.firstname || ""} ${a.lastname || ""}`).toLowerCase();
            return code.includes(q) || company.includes(q) || name.includes(q);
        });
    }, [subAccounts, searchQuery, isSalesPerson]);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
                <div className="flex flex-col lg:flex-row flex-1 w-full">
                    <SidebarSkeleton />
                    <main className="flex-1 min-w-0"><ManageAccountsSkeleton /></main>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
            <div className="flex flex-col lg:flex-row flex-1 w-full">
                <Sidebar />

                <main className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white">
                    {/* As Magento: no heading when there are no accounts, only the notice below */}
                    {!(filteredAccounts.length === 0 && !error && !searchQuery) && (
                        <h1 className="text-h3 md:text-[26px] font-bold text-black mb-5 uppercase tracking-wide">
                            {isSalesPerson ? t("subaccounts.salesPersonTitle") : t("subaccounts.manageTitle")}
                        </h1>
                    )}

                    {/* Search — Sales Person only */}
                    {isSalesPerson && (
                        <div className="flex flex-col sm:flex-row gap-2 mb-5">
                            <input
                                type="text"
                                value={inputText}
                                onChange={e => {
                                    setInputText(e.target.value);
                                    if (!e.target.value) {
                                        setSearchQuery("");
                                    }
                                }}
                                onKeyDown={e => {
                                    if (e.key === "Enter") {
                                        setSearchQuery(inputText);
                                    }
                                }}
                                placeholder="Search by Code, Company or Name"
                                className="h-9 flex-1 max-w-[500px] border border-gray-200 bg-white px-3 text-body text-black placeholder-gray-400 focus:outline-none focus:border-brand-yellow font-medium"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSearchQuery(inputText)}
                                    className="h-9 px-6 bg-brand-yellow hover:bg-brand-yellow-dark text-black text-body-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap cursor-pointer"
                                >
                                    {t("m.search") || "SEARCH"}
                                </button>
                                {(inputText || searchQuery) && (
                                    <button
                                        onClick={() => {
                                            setInputText("");
                                            setSearchQuery("");
                                        }}
                                        className="h-9 px-6 bg-black hover:bg-gray-800 text-white text-body-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                        {t("m.reset") || "RESET"}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 p-4 md:p-8 rounded-sm text-center mb-6" role="alert">
                            <p className="font-black text-xs uppercase mb-2">{t("common.error")}</p>
                            <p className="text-xs">{error}</p>
                        </div>
                    )}

                    {filteredAccounts.length === 0 && !error ? (
                        // Magento's notice: yellow warning box with a warning icon
                        <div role="status" className="flex items-center gap-3 bg-[#fdf0d5] text-[#6f4400] px-4 py-3.5 rounded-sm text-body">
                            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-[#c07600]" aria-hidden="true" />
                            <span>{t("subaccounts.noSubaccounts")}</span>
                        </div>
                    ) : (
                        <>
                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-3">
                                {filteredAccounts.map((account, idx) => {
                                    const accountId = account.customer_id || account.entity_id || account.id || account.sub_account_id;
                                    const displayName = (account as any).name || `${account.firstname || ""} ${account.lastname || ""}`.trim() || "N/A";
                                    const customerCode = (account as any).customer_code;
                                    const companyName = (account as any).company_name;
                                    return (
                                        <div key={accountId || idx} className="bg-white border border-gray-200 rounded-md p-4 shadow-sm">
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="min-w-0">
                                                    {customerCode && <p className="text-caption text-gray-400 font-medium">{customerCode}</p>}
                                                    {companyName && <p className="text-body-sm text-gray-600 font-medium">{companyName}</p>}
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-body font-bold text-black uppercase">{displayName}</p>
                                                    </div>
                                                    <p className="text-body-sm text-gray-500 font-medium mt-1 break-all">{account.email || "N/A"}</p>
                                                </div>
                                                {!isSalesPerson && (
                                                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-caption font-bold uppercase tracking-wider flex-shrink-0 ${account.is_active !== false && account.is_active !== 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                        {account.is_active !== false && account.is_active !== 0 ? t("m.active") : t("m.inactive")}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleLoginAsSubAccount(account)}
                                                disabled={loggingInId === accountId}
                                                className="w-full bg-brand-yellow hover:bg-brand-yellow-dark text-black text-label font-black px-4 py-2.5 uppercase tracking-widest transition-colors rounded-sm shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
                                            >
                                                {loggingInId === accountId ? t("common.loading") : t("m.sign-in")}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-body text-left border-collapse min-w-[900px] border border-gray-100 bg-white">
                                    <thead>
                                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                                            {isSalesPerson ? (
                                                <>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">Customer Code</th>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">Company Name</th>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">{t("m.name")}</th>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">{t("m.email")}</th>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">{t("m.action")}</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">{t("m.name")}</th>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">{t("m.email")}</th>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">{t("m.status")}</th>
                                                    <th className="px-3 py-3 text-label font-semibold text-black uppercase tracking-widest text-center">{t("m.action")}</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredAccounts.map((account, idx) => {
                                            const accountId = account.customer_id || account.entity_id || account.id || account.sub_account_id;
                                            const displayName = (account as any).name || `${account.firstname || ""} ${account.lastname || ""}`.trim() || "N/A";
                                            const customerCode = (account as any).customer_code;
                                            const companyName = (account as any).company_name;
                                            return (
                                                <tr key={accountId || idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-brand-yellow/5 transition-all duration-200`}>
                                                    {isSalesPerson ? (
                                                        <>
                                                            <td className="px-3 py-4 text-body-sm font-medium text-gray-700 text-center">{customerCode || "—"}</td>
                                                            <td className="px-3 py-4 text-body-sm font-medium text-gray-700 text-center">{companyName || "—"}</td>
                                                            <td className="px-3 py-4 text-center">
                                                                <p className="text-body font-bold text-black uppercase">{displayName}</p>
                                                            </td>
                                                            <td className="px-3 py-4 text-body-sm font-medium text-gray-600 text-center">{account.email || "N/A"}</td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="px-3 py-4 text-center">
                                                                <p className="text-body font-bold text-black uppercase">{displayName}</p>
                                                                {customerCode && <p className="text-caption text-gray-400 mt-1">{customerCode}</p>}
                                                                {companyName && <p className="text-body-sm text-gray-600 mt-0.5">{companyName}</p>}
                                                            </td>
                                                            <td className="px-3 py-4 text-body-sm font-medium text-gray-600 text-center">{account.email || "N/A"}</td>
                                                            <td className="px-3 py-4 text-center">
                                                                <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-caption font-bold uppercase tracking-wider ${account.is_active !== false && account.is_active !== 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                                    {account.is_active !== false && account.is_active !== 0 ? t("m.active") : t("m.inactive")}
                                                                </span>
                                                            </td>
                                                        </>
                                                    )}
                                                    <td className="px-3 py-4 text-center">
                                                        <button
                                                            onClick={() => handleLoginAsSubAccount(account)}
                                                            disabled={loggingInId === accountId}
                                                            className="bg-brand-yellow hover:bg-brand-yellow-dark text-black text-caption font-black px-4 py-2 uppercase tracking-widest transition-colors rounded-sm shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
                                                        >
                                                            {loggingInId === accountId ? t("common.loading") : t("m.login")}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* Details Drawer */}
                    <Drawer
                        isOpen={!!selectedSubAccount}
                        onClose={() => setSelectedSubAccount(null)}
                    >
                        {selectedSubAccount && (() => {
                            const account = selectedSubAccount;
                            const displayName = (account as any).name || `${account.firstname || ""} ${account.lastname || ""}`.trim() || "N/A";
                            const customerCode = (account as any).customer_code;
                            const companyName = (account as any).company_name;
                            const subAccountId = account.customer_id || account.entity_id || account.id || account.sub_account_id;

                            const details = [
                                { label: t("orders.companyCode") || "Customer Code", value: customerCode },
                                { label: t("m.company-name") || "Company Name", value: companyName },
                                { label: t("addressBook.firstName") || "First Name", value: account.firstname },
                                { label: t("addressBook.lastName") || "Last Name", value: account.lastname },
                                { label: t("m.email") || "Email", value: account.email },
                                {
                                    label: t("m.status") || "Status",
                                    value: (
                                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-caption font-bold uppercase tracking-wider ${account.is_active !== false && account.is_active !== 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                            {account.is_active !== false && account.is_active !== 0 ? t("m.active") : t("m.inactive")}
                                        </span>
                                    )
                                }
                            ];

                            return (
                                <div className="flex flex-col h-full bg-white" dir={isRtl ? "rtl" : "ltr"}>
                                    {/* Yellow Header */}
                                    <div className="bg-brand-yellow px-4 md:px-8 py-4 md:py-6 flex items-center justify-center relative flex-shrink-0">
                                        <h2 className="text-body-lg md:text-h4 font-semibold text-black text-center tracking-tight uppercase">
                                            {displayName}
                                        </h2>
                                    </div>

                                    {/* Body Section */}
                                    <div className="bg-white px-4 md:px-8 py-5 md:py-8 font-rubik flex-1 overflow-y-auto">
                                        <div className="space-y-0">
                                            {details.map((row, index) => (
                                                <div
                                                    key={index}
                                                    className="flex justify-between items-center py-3 md:py-4 border-b border-gray-100 last:border-0 gap-4"
                                                >
                                                    <span className="text-body-sm md:text-body-lg font-bold text-gray-800 flex-shrink-0">
                                                        {row.label}
                                                    </span>
                                                    <span className="text-body-sm md:text-body-lg font-normal text-black ltr:text-right rtl:text-left truncate">
                                                        {row.value || "-"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-6 md:mt-10 py-4 md:py-6 border-t border-gray-100 flex flex-col gap-3">
                                            <button
                                                onClick={() => {
                                                    handleLoginAsSubAccount(account);
                                                    setSelectedSubAccount(null);
                                                }}
                                                disabled={loggingInId === subAccountId}
                                                className="w-full py-3 md:py-4 bg-brand-yellow hover:bg-brand-yellow-dark text-black text-body-sm md:text-body-lg font-bold uppercase tracking-widest rounded shadow-lg transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                                            >
                                                {loggingInId === subAccountId ? t("common.loading") : t("m.sign-in") || "SIGN IN"}
                                            </button>

                                            <button
                                                onClick={() => setSelectedSubAccount(null)}
                                                className="w-full py-3 md:py-4 bg-gray-900 text-white text-body-sm md:text-body-lg font-bold uppercase tracking-widest rounded shadow-lg hover:bg-black transition-all cursor-pointer"
                                            >
                                                {t("productDialog.closeDetails") || "CLOSE DETAILS"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </Drawer>
                </main>
            </div>
        </div>
    );
}
