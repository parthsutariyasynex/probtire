"use client";
import { useTranslation } from "@/hooks/useTranslation";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store/store";
import { fetchCustomerInfo } from "@/store/actions/customerActions";
import Sidebar from "@/components/Sidebar";
import PortalDropdown from "@/components/PortalDropdown";
import { DashboardSkeleton, SidebarSkeleton } from "@/components/skeletons";
import { useSession } from "next-auth/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { redirectToLogin } from "@/utils/helpers";

type CustomAttribute = {
    attribute_code: string;
    value: string;
};

const MONTH_KEYS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_KEYS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const QUARTER_KEYS_EN = ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'];
const QUARTER_KEYS_AR = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'];

export default function DashboardPage() {
    const router = useRouter();
    const { t, isRtl } = useTranslation();
    const pathname = usePathname();
    const dispatch = useDispatch<AppDispatch>();
    const { data: session, status } = useSession();
    const { data: customer, loading } = useSelector((state: RootState) => state.customer);
    const token = useSelector((state: RootState) => state.auth.token);

    const [isSubAccountSession, setIsSubAccountSession] = useState(false);
    const [isMultiCompany, setIsMultiCompany] = useState(false);
    const [userType, setUserType] = useState<string>(() => {
        if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
            return sessionStorage.getItem("altalayi_user_type_v1") || "";
        }
        return "";
    });
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [loadingDashboard, setLoadingDashboard] = useState(true);

    // Year selection state
    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);
    const [searchYear, setSearchYear] = useState<number>(currentYear);
    const [compareYear, setCompareYear] = useState<number>(currentYear - 1);
    const [isCompare, setIsCompare] = useState(false);

    // Selected items for display cards
    const [selectedProductGroup, setSelectedProductGroup] = useState("");
    const [selectedTyreSize, setSelectedTyreSize] = useState("");
    const [availableYears, setAvailableYears] = useState<number[]>([2026, 2025, 2024]);
    const [activeTab, setActiveTab] = useState<'quarterly' | 'monthly'>('quarterly');

    const monthNames = isRtl ? MONTH_KEYS_AR : MONTH_KEYS_EN;
    const quarterNames = isRtl ? QUARTER_KEYS_AR : QUARTER_KEYS_EN;

    useEffect(() => {
        if (typeof window !== "undefined") {
            setIsSubAccountSession(localStorage.getItem("isSubAccount") === "true");
        }
    }, [pathname]);

    useEffect(() => {
        const accessToken = (session as any)?.accessToken as string | undefined;
        if (!accessToken) { setIsMultiCompany(false); return; }
        if (typeof sessionStorage === "undefined") return;
        const ROLE_CACHE = "altalayi_user_type_v1";
        const TOKEN_CACHE = "altalayi_role_token_v1";
        if (sessionStorage.getItem(TOKEN_CACHE) === accessToken) {
            const cachedType = sessionStorage.getItem(ROLE_CACHE) || "";
            setUserType(cachedType);
            setIsMultiCompany(cachedType === "Multiple Company User");
            return;
        }
        fetch("/api/kleverapi/account-sidebar", {
            headers: { Authorization: `Bearer ${accessToken}` },
        }).then(r => r.json()).then(data => {
            const type = data?.user_type || "Customer";
            setUserType(type);
            if (type !== "Guest") {
                sessionStorage.setItem(ROLE_CACHE, type);
                sessionStorage.setItem(TOKEN_CACHE, accessToken);
            }
            setIsMultiCompany(type === "Multiple Company User");
        }).catch(() => {});
    }, [(session as any)?.accessToken]);

    useEffect(() => {
        if (status === "unauthenticated") {
            redirectToLogin(router);
            return;
        }

        if (status === "authenticated" && token) {
            dispatch(fetchCustomerInfo());
        }
    }, [status, token, dispatch, router]);

    // Fetch dashboard data whenever year or compare settings change
    useEffect(() => {
        if (status === "authenticated" && token) {
            fetchDashboard();
        }
    }, [status, token, searchYear, compareYear, isCompare]);

    // Proper financial formatter (comas + 2 decimal places)
    const formatValue = (val: any) => {
        const num = Number(val || 0);
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const fetchDashboard = async () => {
        try {
            setLoadingDashboard(true);

            const params = new URLSearchParams();
            params.append('searchYear', String(searchYear));
            if (isCompare) {
                params.append('compareYear', String(compareYear));
            }

            const response = await fetch(`/api/kleverapi/dashboard?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-locale': window.location.pathname.startsWith("/ar") ? "ar" : "en"
                }
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();
            if (data) {
                setDashboardData(data);
                if (data.available_years) setAvailableYears(data.available_years);

                // Dynamically set defaults from the API response using correct keys
                if (data.product_groups?.length > 0 && !selectedProductGroup) {
                    setSelectedProductGroup(data.product_groups[0].product_group);
                }
                if (data.tyre_sizes?.length > 0 && !selectedTyreSize) {
                    setSelectedTyreSize(data.tyre_sizes[0].size_pattern);
                }
            }
        } catch (err) {
            console.error("Dashboard data fetch error:", err);
            setDashboardData(null);
        } finally {
            setLoadingDashboard(false);
        }
    };

    if (loading || loadingDashboard) {
        return (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 w-full bg-surface font-rubik">
                <SidebarSkeleton />
                <main className="flex-1 min-w-0">
                    <DashboardSkeleton />
                </main>
            </div>
        );
    }

    if (!customer) return null;

    const getAttr = (code: string) => {
        return (customer as any).custom_attributes?.find(
            (a: CustomAttribute) => a.attribute_code === code
        )?.value || "N/A";
    }

    const qty = dashboardData?.total_order_qty || { year: '0', quarter: '0', months: '0' };
    const value = dashboardData?.total_order_value || { year: '0.00', quarter: '0.00', months: '0.00' };

    // Translate API data values using data.* keys
    const translateData = (val: string) => {
        if (!val) return val;
        const translated = t(`data.${val}`);
        return translated !== `data.${val}` ? translated : val;
    };

    return (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
            <Sidebar />

            {/* Right Content Area */}
            <main className="flex-1 px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-surface min-h-0 font-rubik" dir={isRtl ? "rtl" : "ltr"}>
                <div className="w-full space-y-12">

                    {/* Sub-account Identity Banner */}
                    {isSubAccountSession && (
                        <div className={`bg-green-50/80 ${isRtl ? 'border-r-4' : 'border-l-4'} border-green-500 text-green-800 p-4 mb-8 ${isRtl ? 'rounded-l-lg' : 'rounded-r-lg'} flex items-center gap-3 animate-in fade-in slide-in-from-top duration-500 shadow-sm border border-gray-100`} role="alert">
                            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-caption font-bold">&#10004;</div>
                            <p className="text-body-lg font-bold tracking-tight uppercase">{t("dashboard.subAccountBanner")}</p>
                        </div>
                    )}

                    <div className="flex items-center gap-4 mb-5">
                        <h1 className="text-h3 md:text-h1-sm font-semibold text-black uppercase tracking-tight">
                            {t("dashboard.title")}
                        </h1>
                    </div>

                    {/* COMPARE SECTION — visible for all roles */}
                    <section className="bg-white w-full xl:w-[475px] border border-subtle rounded-sm mb-6 overflow-hidden">
                        {/* Header Section */}
                        <div className="bg-gray-50/80 px-4 py-3 border-b border-subtle flex items-center gap-4">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="compare-toggle"
                                    checked={isCompare}
                                    onChange={(e) => {
                                        setIsCompare(e.target.checked);
                                        if (!e.target.checked) {
                                            setSearchYear(new Date().getFullYear());
                                        }
                                    }}
                                    className="w-[18px] h-[18px] accent-brand-yellow cursor-pointer"
                                />
                                <label htmlFor="compare-toggle" className="text-label font-bold uppercase text-black tracking-widest cursor-pointer select-none">{t("dashboard.compare")}</label>
                            </div>
                        </div>

                        {/* Body Section */}
                        <div className="p-3 md:p-4 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-12">
                            {/* First Selector */}
                            <div className="flex-1 w-full bg-brand-yellow border border-brand-yellow rounded-sm transition-all">
                                <PortalDropdown
                                    value={searchYear}
                                    onChange={(val) => {
                                        setSearchYear(Number(val));
                                        setIsCompare(true);
                                    }}
                                    options={availableYears.map(y => ({ label: String(y), value: String(y) }))}
                                    buttonClassName="w-full h-11 px-5 flex items-center justify-between gap-2 cursor-pointer transition-all bg-transparent outline-none ltr:text-left rtl:text-right font-bold text-body uppercase tracking-wider text-black"
                                    className="w-full h-full"
                                />
                            </div>

                            {/* Constant "vs." label */}
                            <div className="flex items-center justify-center">
                                <span className="text-sm font-semibold text-black uppercase tracking-tighter italic">
                                    {isRtl ? "مقابل" : "vs."}
                                </span>
                            </div>

                            {/* Second Selector */}
                            <div className="flex-1 w-full bg-brand-yellow border border-brand-yellow rounded-sm transition-all">
                                <PortalDropdown
                                    value={compareYear}
                                    onChange={(val) => {
                                        setCompareYear(Number(val));
                                        setIsCompare(true);
                                    }}
                                    options={availableYears.map(y => ({ label: String(y), value: String(y) }))}
                                    buttonClassName="w-full h-11 px-5 flex items-center justify-between gap-2 cursor-pointer transition-all bg-transparent outline-none ltr:text-left rtl:text-right font-bold text-body uppercase tracking-wider text-black"
                                    className="w-full h-full"
                                />
                            </div>
                        </div>
                    </section>

                    {/* For sub-accounts, if NOT comparing, show "No record found!." */}
                    {(isSubAccountSession || userType === "Company Sub Account") && !isCompare && (
                        <div className="text-body font-normal text-black mt-4 ltr:text-left rtl:text-right">
                            {isRtl ? "لم يتم العثور على نتائج." : "No record found!."}
                        </div>
                    )}

                    {/* Summary Sections - Hide when comparing or if sub-account */}
                    {!isMultiCompany && !isCompare && !(isSubAccountSession || userType === "Company Sub Account") && (
                        <div className="space-y-3 animate-in fade-in duration-700">
                            {/* TOTAL ORDER QTY SECTION */}
                            <section>
                                <h2 className="text-body-lg md:text-h3-sm font-bold text-black uppercase mb-1.5 md:mb-3">{t("m.total-order-qty")}</h2>
                                <hr className="border-[#ddd] mb-3 md:mb-6" />
                                <div className="w-full xl:w-3/4 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                                    <QtyCard
                                        label={`${t("dashboard.year")} - ${searchYear}`}
                                        value={dashboardData?.yearly_summary?.[0]?.qty || "0"}
                                        isRtl={isRtl}
                                    />
                                    <QtyCard
                                        label={t("m.quarter")}
                                        value={dashboardData?.quarterly_summary?.[0]?.qty || "0"}
                                        isRtl={isRtl}
                                    />
                                    <QtyCard
                                        label={t("m.months")}
                                        value={dashboardData?.monthly_summary?.[0]?.qty || "0"}
                                        isRtl={isRtl}
                                    />
                                </div>
                            </section>

                            {/* TOTAL ORDER VALUE SECTION */}
                            <section>
                                <h2 className="text-body-lg md:text-h3-sm font-bold text-black uppercase mb-1.5 md:mb-3">{t("m.total-order-value")}</h2>
                                <hr className="border-[#ddd] mb-3 md:mb-6" />
                                <div className="w-full xl:w-3/4 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                                    <ValueCard
                                        label={`${t("dashboard.year")} - ${searchYear}`}
                                        value={formatValue(dashboardData?.yearly_summary?.[0]?.amount)}
                                        isRtl={isRtl}
                                    />
                                    <ValueCard
                                        label={t("m.quarter")}
                                        value={formatValue(dashboardData?.quarterly_summary?.[0]?.amount)}
                                        isRtl={isRtl}
                                    />
                                    <ValueCard
                                        label={t("m.months")}
                                        value={formatValue(dashboardData?.monthly_summary?.[0]?.amount)}
                                        isRtl={isRtl}
                                    />
                                </div>
                            </section>

                            {/* BOTTOM FILTERS */}
                            <section className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                {/* Product Group Filter */}
                                <div className="flex flex-col gap-4">
                                    <h3 className="text-body font-bold text-black uppercase tracking-widest ltr:text-left rtl:text-right">{t("dashboard.productGroupLabel")}</h3>
                                    <div className="bg-white border border-[#ddd] rounded-sm overflow-hidden group">
                                        <div className="bg-brand-yellow border-b border-brand-yellow h-10 px-4 flex items-center relative">
                                            <PortalDropdown
                                                value={selectedProductGroup}
                                                onChange={(val) => setSelectedProductGroup(val)}
                                                options={
                                                    (!dashboardData?.product_groups || dashboardData.product_groups.length === 0)
                                                        ? [{ label: t("common.noDataFound"), value: "" }]
                                                        : dashboardData.product_groups.map((pg: any) => ({ label: translateData(pg.product_group), value: pg.product_group }))
                                                }
                                                ltrLabels
                                                placeholder={t("m.select")}
                                                buttonClassName="w-full h-full flex items-center justify-between gap-2 cursor-pointer bg-transparent outline-none ltr:text-left rtl:text-right font-bold text-body-sm uppercase tracking-wider text-black"
                                                className="w-full h-full"
                                            />
                                        </div>
                                        <div className="py-5 px-4 text-center">
                                            <p className="text-3xl font-bold text-black font-rubik tracking-tight">
                                                {dashboardData?.product_groups?.find((pg: any) => pg.product_group === selectedProductGroup)?.qty || "0"}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Tyre Size Filter */}
                                <div className="flex flex-col gap-4">
                                    <h3 className="text-body font-bold text-black uppercase tracking-widest ltr:text-left rtl:text-right">{t("dashboard.tyreSizeLabel")}</h3>
                                    <div className="bg-white border border-[#ddd] rounded-sm overflow-hidden group">
                                        <div className="bg-brand-yellow border-b border-brand-yellow h-10 px-4 flex items-center relative">
                                            <PortalDropdown
                                                value={selectedTyreSize}
                                                onChange={(val) => setSelectedTyreSize(val)}
                                                options={
                                                    (!dashboardData?.tyre_sizes || dashboardData.tyre_sizes.length === 0)
                                                        ? [{ label: t("common.noDataFound"), value: "" }]
                                                        : dashboardData.tyre_sizes.map((ts: any) => ({ label: translateData(ts.size_pattern), value: ts.size_pattern }))
                                                }
                                                ltrLabels
                                                placeholder={t("m.select")}
                                                buttonClassName="w-full h-full flex items-center justify-between gap-2 cursor-pointer bg-transparent outline-none ltr:text-left rtl:text-right font-bold text-body-sm uppercase tracking-wider text-black"
                                                className="w-full h-full"
                                            />
                                        </div>
                                        <div className="py-5 px-4 text-center">
                                            <p className="text-3xl font-bold text-black font-rubik tracking-tight">
                                                {dashboardData?.tyre_sizes?.find((ts: any) => ts.size_pattern === selectedTyreSize)?.qty || "0"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {/* COMPARISON DETAILS SECTION (Chart & Table) */}
                    {isCompare && (
                        <section className="bg-white overflow-hidden animate-in fade-in slide-in-from-bottom duration-500 mb-0">
                            <div className="py-3 border-b border-[#ddd] bg-gray-50/50">
                                <h2 className="text-lg md:text-xl font-bold text-black uppercase tracking-tight ltr:text-left rtl:text-right">
                                    {isRtl ? `مقارنة ${searchYear} مع ${compareYear}` : `COMPARE ${searchYear} WITH ${compareYear}`}
                                </h2>
                            </div>

                            {/* Tabs */}
                            <div className="flex pt-4 bg-gray-50/50 flex-col md:flex-row">
                                <button
                                    onClick={() => setActiveTab('quarterly')}
                                    className={`px-6 outline-none py-3 text-sm font-semibold uppercase tracking-widest cursor-pointer transition-all
                                        ${activeTab === 'quarterly'
                                            ? 'bg-brand-yellow text-black border-t border-l border-[#ddd]'
                                            : 'bg-[#f5f5f5] text-black hover:text-black border-t border-l border-[#ddd]'}`}
                                >
                                    {t("dashboard.quarterlySalesData")}
                                </button>
                                <button
                                    onClick={() => setActiveTab('monthly')}
                                    className={`px-6 outline-none py-3 text-sm font-semibold uppercase tracking-widest cursor-pointer transition-all
                                        ${activeTab === 'monthly'
                                            ? 'bg-brand-yellow text-black border-t border-r border-[#ddd]'
                                            : 'bg-[#f5f5f5] text-black hover:text-black border-t border-r border-[#ddd]'}`}
                                >
                                    {t("dashboard.monthlySalesData")}
                                </button>
                            </div>

                            <div className="p-3 border border-[#ddd]">
                                {/* Chart Implementation */}
                                <div className="w-full h-[320px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={activeTab === 'quarterly' ?
                                                [1, 2, 3, 4].map(q => ({
                                                    name: quarterNames[q - 1],
                                                    [searchYear]: dashboardData?.compare_quarterly?.find((d: any) => d.year === searchYear && d.period === q)?.qty || 0,
                                                    [compareYear]: dashboardData?.compare_quarterly?.find((d: any) => d.year === compareYear && d.period === q)?.qty || 0
                                                })) :
                                                [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({
                                                    name: monthNames[m - 1],
                                                    [searchYear]: dashboardData?.compare_monthly?.find((d: any) => d.year === searchYear && d.period === m)?.qty || 0,
                                                    [compareYear]: dashboardData?.compare_monthly?.find((d: any) => d.year === compareYear && d.period === m)?.qty || 0
                                                }))
                                            }
                                            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                            <XAxis
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 700 }}
                                                dy={15}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 600 }}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase' }}
                                                cursor={{ fill: '#f9fafb' }}
                                            />
                                            <Legend
                                                verticalAlign="top"
                                                align="right"
                                                iconType="circle"
                                                wrapperStyle={{ paddingBottom: '40px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                                            />
                                            <Bar dataKey={searchYear} fill="#F5B21B" radius={[4, 4, 0, 0]} barSize={32} name={searchYear.toString()} />
                                            <Bar dataKey={compareYear} fill="#111827" radius={[4, 4, 0, 0]} barSize={32} name={compareYear.toString()} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Data Table */}
                                <div className="overflow-x-auto mt-6">
                                    <table className="w-full border-collapse border border-[#ddd]">
                                        <thead>
                                            <tr className="bg-brand-yellow text-label uppercase font-bold tracking-widest text-black">
                                                <th className="px-2 xl:px-4 py-2 border border-brand-yellow/30 text-label font-bold text-black uppercase tracking-widest text-center">{activeTab === 'quarterly' ? t("dashboard.quarter") : t("dashboard.month")}</th>
                                                <th className="px-2 xl:px-4 py-2 border border-brand-yellow/30 text-label font-bold text-black uppercase tracking-widest text-center">{searchYear} QTY</th>
                                                <th className="px-2 xl:px-4 py-2 border border-brand-yellow/30 text-label font-bold text-black uppercase tracking-widest text-center">{compareYear} QTY</th>
                                                <th className="px-2 xl:px-4 py-2 border border-brand-yellow/30 text-label font-bold text-black uppercase tracking-widest text-center">{isRtl ? 'التغيير' : 'CHANGE'}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 bg-white">
                                            {(activeTab === 'quarterly' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map((p, idx) => {
                                                const val1 = (activeTab === 'quarterly' ? dashboardData?.compare_quarterly : dashboardData?.compare_monthly)
                                                    ?.find((d: any) => d.year === searchYear && d.period === p)?.qty || 0;
                                                const val2 = (activeTab === 'quarterly' ? dashboardData?.compare_quarterly : dashboardData?.compare_monthly)
                                                    ?.find((d: any) => d.year === compareYear && d.period === p)?.qty || 0;

                                                const label = activeTab === 'quarterly'
                                                    ? (isRtl ? `ر${p}` : `Q${p}`)
                                                    : (isRtl ? monthNames[p - 1] : p.toString());

                                                const change = val2 > 0 ? ((val1 - val2) / val2 * 100).toFixed(1) : (val1 > 0 ? "100" : "0");

                                                return (
                                                    <tr key={p} className="hover:bg-brand-yellow/5 group transition-colors">
                                                        <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 font-bold text-black text-body uppercase text-center">{label}</td>
                                                        <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-body-lg font-bold text-black text-center">{val1}</td>
                                                        <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-body-lg font-bold text-black/50 group-hover:text-black transition-colors text-center">{val2}</td>
                                                        <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-center">
                                                            <span className={`text-label font-bold px-2 py-1 rounded ${Number(change) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                                                                {Number(change) >= 0 ? '+' : ''}{change}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}

/**
 * Reusable Card Components
 */
function QtyCard({ label, value, isRtl }: { label: string; value: string; isRtl: boolean }) {
    return (
        <div className="bg-white border border-[#ddd] rounded-sm overflow-hidden group">
            <div className="bg-brand-yellow h-10 px-4 flex justify-between items-center text-black border-b border-brand-yellow group-hover:bg-brand-yellow transition-colors">
                <span className="text-xs font-bold uppercase tracking-widest text-black">{label}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
            </div>
            <div className="py-5 px-4 text-center">
                <p className="text-4xl font-bold text-black tracking-tighter">{value}</p>
            </div>
        </div>
    );
}

function ValueCard({ label, value, isRtl }: { label: string; value: string; isRtl: boolean }) {
    return (
        <div className="bg-white border border-[#ddd] rounded-sm overflow-hidden group">
            <div className="bg-brand-yellow h-10 px-4 flex justify-between items-center text-black border-b border-brand-yellow group-hover:bg-brand-yellow transition-colors">
                <span className="text-xs font-bold uppercase tracking-widest text-black">{label}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
            </div>
            <div className="py-5 px-4 text-center">
                <p className="text-2xl font-bold text-black tracking-tight">{value}</p>
            </div>
        </div>
    );
}
