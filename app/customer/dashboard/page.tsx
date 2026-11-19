"use client";
import { useTranslation } from "@/hooks/useTranslation";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
import type { MagentoDashboardCompare, MagentoTickList } from "@/src/lib/magentoOrderView";

type CustomAttribute = {
    attribute_code: string;
    value: string;
};

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
    // Year selection state — the year Magento's dashboard shows (set from Magento's page on first load).
    const [searchYear, setSearchYear] = useState<number>(0);
    // true once a year was picked in the cards (otherwise Magento's own default year is shown)
    const [yearChosen, setYearChosen] = useState(false);
    // "vs." year — always one of Magento's years other than searchYear (set when comparing).
    const [compareYear, setCompareYear] = useState<number>(0);
    const [isCompare, setIsCompare] = useState(false);

    // Index of the active compare tab (Magento's tabs, in Magento's order).
    const [activeTab, setActiveTab] = useState(0);
    // Magento's tick boxes on the cards (keys of the ticked entries). Quarter and month ticks are
    // shared by Total Order Qty and Total Order Value, as on Magento.
    const [quarterTicks, setQuarterTicks] = useState<string[]>([]);
    const [monthTicks, setMonthTicks] = useState<string[]>([]);
    const [groupTicks, setGroupTicks] = useState<string[]>([]);
    const [tyreSizeIdx, setTyreSizeIdx] = useState(0);

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
        }).catch(() => { });
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

    // Magento's own Dashboard page: its cards, compare box and compare tables (years, texts, numbers).
    const [magentoCompare, setMagentoCompare] = useState<MagentoDashboardCompare | null>(null);
    const [magentoDefaultYear, setMagentoDefaultYear] = useState<number | null>(null);
    const [compareLoading, setCompareLoading] = useState(false);
    const [compareError, setCompareError] = useState(false);
    const [compareAttempt, setCompareAttempt] = useState(0);
    // Magento's years for the first list; the "vs." list is the same years without the first one (as on Magento).
    const magentoYears = (magentoCompare?.searchYears ?? []).map(Number);
    const compareOptions = magentoYears.filter((y) => y !== searchYear);
    const firstOtherYear = (year: number) => magentoYears.find((y) => y !== year) ?? 0;
    const compareKey = isCompare ? `c|${searchYear}|${compareYear}` : yearChosen ? `b|${searchYear}` : "b";
    useEffect(() => {
        if (status !== "authenticated" || !token) return;
        if (isCompare && (!compareYear || compareYear === searchYear)) return;
        let cancelled = false;
        setCompareLoading(true);
        setCompareError(false);
        const params = new URLSearchParams({ view: "compare" });
        if (isCompare) {
            params.set("searchYear", String(searchYear));
            params.set("compareYear", String(compareYear));
        } else if (yearChosen) {
            params.set("searchYear", String(searchYear));
        }
        fetch(`/api/kleverapi/dashboard?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}`, "x-locale": window.location.pathname.startsWith("/ar") ? "ar" : "en" },
        })
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((d: MagentoDashboardCompare) => {
                if (cancelled) return;
                setMagentoCompare(d);
                if (!isCompare && !yearChosen && d.searchYear) {
                    // Magento's own default year
                    setMagentoDefaultYear(Number(d.searchYear));
                    setSearchYear(Number(d.searchYear));
                }
                // Magento's initial ticks / selection on the cards
                const c = d.cards;
                if (c) {
                    const ticked = (l?: { items: { key: string; checked: boolean }[] } | null) => (l?.items ?? []).filter((i) => i.checked).map((i) => i.key);
                    setQuarterTicks(ticked(c.qty?.quarter));
                    setMonthTicks(ticked(c.qty?.month));
                    setGroupTicks(ticked(c.productGroup?.list));
                    setTyreSizeIdx(0);
                }
            })
            .catch(() => { if (!cancelled) setCompareError(true); })
            .finally(() => { if (!cancelled) setCompareLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, token, compareKey, compareAttempt]);

    // Proper financial formatter (comas + 2 decimal places)
    const formatValue = (val: any) => {
        const num = Number(val || 0);
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // First load: wait for Magento's dashboard page (cards / compare box).
    if (loading || (!magentoCompare && !compareError)) {
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

    // Magento's dashboard cards for the shown year (null in compare mode).
    const cards = magentoCompare?.cards ?? null;
    // Sum of the ticked entries of one of Magento's tick lists (Magento adds up what is ticked).
    const tickedSum = (list: MagentoTickList | null | undefined, ticks: string[]) =>
        (list?.items ?? []).filter((i) => ticks.includes(i.key)).reduce((sum, i) => sum + i.value, 0);
    const toggleTick = (setTicks: Dispatch<SetStateAction<string[]>>, key: string) =>
        setTicks((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    const yearOptions = (years: { year: string; label: string }[] | undefined) => (years ?? []).map((y) => ({ label: y.label, value: y.year }));
    const yearValue = (years: { year: string; value: number }[] | undefined) => years?.find((y) => Number(y.year) === searchYear)?.value ?? years?.[0]?.value ?? 0;
    const chooseYear = (val: string) => { setYearChosen(true); setSearchYear(Number(val)); };

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

                    {/* COMPARE SECTION — Magento's own compare box: its label, years and "vs." text */}
                    <section className="bg-white w-full xl:w-[475px] border border-subtle rounded-sm mb-6 overflow-hidden">
                        {/* Header Section */}
                        <div className="bg-gray-50/80 px-4 py-3 border-b border-subtle flex items-center gap-4">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="compare-toggle"
                                    checked={isCompare}
                                    disabled={magentoYears.length < 2}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            if (!compareYear || compareYear === searchYear) setCompareYear(firstOtherYear(searchYear));
                                            setIsCompare(true);
                                        } else {
                                            setIsCompare(false);
                                            // back to Magento's own default view
                                            setYearChosen(false);
                                            if (magentoDefaultYear) setSearchYear(magentoDefaultYear);
                                        }
                                    }}
                                    className="w-[18px] h-[18px] accent-brand-yellow cursor-pointer"
                                />
                                <label htmlFor="compare-toggle" className="text-label font-bold uppercase text-black tracking-widest cursor-pointer select-none">{magentoCompare?.compareLabel}</label>
                            </div>
                        </div>

                        {/* Body Section */}
                        <div className="p-3 md:p-4 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-12">
                            {/* First Selector — Magento's years */}
                            <div className="flex-1 w-full bg-brand-yellow border border-brand-yellow rounded-sm transition-all">
                                <PortalDropdown
                                    value={searchYear}
                                    onChange={(val) => {
                                        const year = Number(val);
                                        setSearchYear(year);
                                        // the "vs." year can never be the same year (Magento leaves it out)
                                        if (!compareYear || compareYear === year) setCompareYear(firstOtherYear(year));
                                        setIsCompare(true);
                                    }}
                                    options={magentoYears.map(y => ({ label: String(y), value: String(y) }))}
                                    buttonClassName="w-full h-11 px-5 flex items-center justify-between gap-2 cursor-pointer transition-all bg-transparent outline-none ltr:text-left rtl:text-right font-bold text-body uppercase tracking-wider text-black"
                                    className="w-full h-full"
                                />
                            </div>

                            {/* Magento's text between the two years */}
                            <div className="flex items-center justify-center">
                                <span className="text-sm font-semibold text-black uppercase tracking-tighter italic">
                                    {magentoCompare?.vsText}
                                </span>
                            </div>

                            {/* Second Selector — Magento's years without the first one */}
                            <div className="flex-1 w-full bg-brand-yellow border border-brand-yellow rounded-sm transition-all">
                                <PortalDropdown
                                    value={compareOptions.includes(compareYear) ? compareYear : (compareOptions[0] ?? "")}
                                    onChange={(val) => {
                                        setCompareYear(Number(val));
                                        setIsCompare(true);
                                    }}
                                    options={compareOptions.map(y => ({ label: String(y), value: String(y) }))}
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
                        compareError ? (
                            <div className="bg-red-50 border border-red-100 text-red-700 p-4 md:p-8 rounded-md flex flex-col sm:flex-row sm:items-center gap-3">
                                <span className="text-body-lg font-medium flex-1">{t("m.sorry-there-has-been-an-error-processing-your-request-please-try-again-later")}</span>
                                <button onClick={() => setCompareAttempt((n) => n + 1)} className="px-4 py-1.5 bg-white border border-red-200 text-body text-red-700 hover:bg-red-100 transition-colors rounded-xs cursor-pointer">
                                    {t("common.tryAgain")}
                                </button>
                            </div>
                        ) : compareLoading || !cards ? (
                            <div className="space-y-6 animate-pulse">
                                {[0, 1].map((i) => (
                                    <div key={i} className="space-y-3">
                                        <div className="h-6 w-48 bg-gray-200 rounded" />
                                        <div className="w-full xl:w-3/4 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                                            {[0, 1, 2].map((j) => <div key={j} className="h-[84px] bg-gray-100 rounded-sm" />)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : !cards.qty ? (
                            /* Magento's text for a year without records */
                            <div className="text-body font-normal text-black mt-4 ltr:text-left rtl:text-right">{cards.noRecords}</div>
                        ) : (
                        <div className="space-y-3 animate-in fade-in duration-700">
                            {/* TOTAL ORDER QTY SECTION — Magento's card */}
                            <section>
                                <h2 className="text-body-lg md:text-h3-sm font-bold text-black uppercase mb-1.5 md:mb-3">{cards.qty.title}</h2>
                                <hr className="border-[#ddd] mb-3 md:mb-6" />
                                <div className="w-full xl:w-3/4 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                                    <SummaryDropdownCard
                                        value={String(searchYear)}
                                        onChange={chooseYear}
                                        options={yearOptions(cards.qty.years)}
                                        placeholder={cards.qty.years[0]?.label ?? ""}
                                        amount={String(yearValue(cards.qty.years))}
                                    />
                                    <TickDropdownCard list={cards.qty.quarter} ticks={quarterTicks} onToggle={(k) => toggleTick(setQuarterTicks, k)}
                                        amount={String(tickedSum(cards.qty.quarter, quarterTicks))} />
                                    <TickDropdownCard list={cards.qty.month} ticks={monthTicks} onToggle={(k) => toggleTick(setMonthTicks, k)}
                                        amount={String(tickedSum(cards.qty.month, monthTicks))} />
                                </div>
                            </section>

                            {/* TOTAL ORDER VALUE SECTION — Magento's card (quarter / month ticks shared with Qty, as on Magento) */}
                            {cards.amount && (
                            <section>
                                <h2 className="text-body-lg md:text-h3-sm font-bold text-black uppercase mb-1.5 md:mb-3">{cards.amount.title}</h2>
                                <hr className="border-[#ddd] mb-3 md:mb-6" />
                                <div className="w-full xl:w-3/4 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
                                    <SummaryDropdownCard
                                        value={String(searchYear)}
                                        onChange={chooseYear}
                                        options={yearOptions(cards.amount.years)}
                                        placeholder={cards.amount.years[0]?.label ?? ""}
                                        amount={formatValue(yearValue(cards.amount.years))}
                                    />
                                    <TickDropdownCard list={cards.amount.quarter} ticks={quarterTicks} onToggle={(k) => toggleTick(setQuarterTicks, k)}
                                        amount={formatValue(tickedSum(cards.amount.quarter, quarterTicks))} />
                                    <TickDropdownCard list={cards.amount.month} ticks={monthTicks} onToggle={(k) => toggleTick(setMonthTicks, k)}
                                        amount={formatValue(tickedSum(cards.amount.month, monthTicks))} />
                                </div>
                            </section>
                            )}

                            {/* BOTTOM FILTERS — Magento's Product Group (tick boxes, summed) and Tyre Size (one choice) */}
                            <section className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                {cards.productGroup && (
                                <div className="flex flex-col gap-4">
                                    <h3 className="text-body font-bold text-black uppercase tracking-widest ltr:text-left rtl:text-right">{cards.productGroup.title}</h3>
                                    <TickDropdownCard list={cards.productGroup.list} ticks={groupTicks} onToggle={(k) => toggleTick(setGroupTicks, k)}
                                        amount={String(tickedSum(cards.productGroup.list, groupTicks))} large />
                                </div>
                                )}

                                {cards.tyreSize && (
                                <div className="flex flex-col gap-4">
                                    <h3 className="text-body font-bold text-black uppercase tracking-widest ltr:text-left rtl:text-right">{cards.tyreSize.title}</h3>
                                    <div className="bg-white border border-[#ddd] rounded-sm overflow-hidden group">
                                        <div className="bg-brand-yellow border-b border-brand-yellow h-10 px-4 flex items-center relative">
                                            <PortalDropdown
                                                value={String(tyreSizeIdx)}
                                                onChange={(val) => setTyreSizeIdx(Number(val))}
                                                options={cards.tyreSize.items.map((ts, i) => ({ label: ts.label, value: String(i) }))}
                                                ltrLabels
                                                searchable
                                                buttonClassName="w-full h-full flex items-center justify-between gap-2 cursor-pointer bg-transparent outline-none ltr:text-left rtl:text-right font-bold text-body-sm uppercase tracking-wider text-black"
                                                className="w-full h-full"
                                            />
                                        </div>
                                        <div className="py-5 px-4 text-center">
                                            <p className="text-3xl font-bold text-black font-rubik tracking-tight">
                                                {cards.tyreSize.items[tyreSizeIdx]?.value ?? 0}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                )}
                            </section>
                        </div>
                        )
                    )}

                    {/* COMPARISON DETAILS SECTION (Chart & Table) */}
                    {!isMultiCompany && isCompare && (
                        <section className="bg-white overflow-hidden animate-in fade-in slide-in-from-bottom duration-500 mb-0">
                            {compareError ? (
                                <div className="bg-red-50 border border-red-100 text-red-700 p-4 md:p-8 rounded-md flex flex-col sm:flex-row sm:items-center gap-3">
                                    <span className="text-body-lg font-medium flex-1">{t("m.sorry-there-has-been-an-error-processing-your-request-please-try-again-later")}</span>
                                    <button onClick={() => setCompareAttempt((n) => n + 1)} className="px-4 py-1.5 bg-white border border-red-200 text-body text-red-700 hover:bg-red-100 transition-colors rounded-xs cursor-pointer">
                                        {t("common.tryAgain")}
                                    </button>
                                </div>
                            ) : compareLoading || !magentoCompare || magentoCompare.tabs.length === 0 ? (
                                <div className="space-y-4 animate-pulse">
                                    <div className="h-7 w-64 bg-gray-200 rounded" />
                                    <div className="h-10 w-96 max-w-full bg-gray-200 rounded" />
                                    <div className="h-[320px] w-full bg-gray-100 rounded" />
                                </div>
                            ) : (() => {
                                const tab = magentoCompare.tabs[Math.min(activeTab, magentoCompare.tabs.length - 1)];
                                const colors = ["#F5B21B", "#111827"];
                                return (<>
                            <div className="py-3 border-b border-[#ddd] bg-gray-50/50">
                                <h2 className="text-lg md:text-xl font-bold text-black uppercase tracking-tight ltr:text-left rtl:text-right">
                                    {magentoCompare.title}
                                </h2>
                            </div>

                            {/* Tabs — Magento's */}
                            <div className="flex pt-4 bg-gray-50/50 flex-col md:flex-row">
                                {magentoCompare.tabs.map((tb, i) => (
                                    <button
                                        key={tb.key}
                                        onClick={() => setActiveTab(i)}
                                        className={`px-6 outline-none py-3 text-sm font-semibold uppercase tracking-widest cursor-pointer transition-all border-t border-x border-[#ddd]
                                            ${tab.key === tb.key ? 'bg-brand-yellow text-black' : 'bg-[#f5f5f5] text-black hover:text-black'}`}
                                    >
                                        {tb.label}
                                    </button>
                                ))}
                            </div>

                            <div className="p-3 border border-[#ddd]">
                                {/* Chart — Magento's quantities for both years */}
                                <div className="w-full h-[320px]" dir="ltr">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={tab.rows.map((r) => ({
                                                name: r.label,
                                                ...Object.fromEntries(tab.years.map((y, i) => [y.year, r.values[i] ?? 0])),
                                            }))}
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
                                                allowDecimals={false}
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
                                            {tab.years.map((y, i) => (
                                                <Bar key={y.year} dataKey={y.year} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} barSize={32} name={y.year} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Table — Magento's headers, period labels and quantities */}
                                <div className="overflow-x-auto mt-6">
                                    <table className="w-full border-collapse border border-[#ddd]">
                                        <thead>
                                            <tr className="bg-brand-yellow text-label uppercase font-bold tracking-widest text-black">
                                                <th className="px-2 xl:px-4 py-2 border border-brand-yellow/30" />
                                                {tab.years.map((y) => (
                                                    <th key={y.year} className="px-2 xl:px-4 py-2 border border-brand-yellow/30 text-label font-bold text-black uppercase tracking-widest text-center">{y.year}</th>
                                                ))}
                                            </tr>
                                            <tr className="bg-brand-yellow text-label uppercase font-bold tracking-widest text-black">
                                                <th className="px-2 xl:px-4 py-2 border border-brand-yellow/30 text-label font-bold text-black uppercase tracking-widest text-center">{tab.periodHeader}</th>
                                                {tab.years.map((y) => (
                                                    <th key={y.year} className="px-2 xl:px-4 py-2 border border-brand-yellow/30 text-label font-bold text-black uppercase tracking-widest text-center">{y.qtyHeader}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 bg-white">
                                            {tab.rows.map((r, idx) => (
                                                <tr key={idx} className="hover:bg-brand-yellow/5 group transition-colors">
                                                    <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 font-bold text-black text-body uppercase text-center">{r.label}</td>
                                                    {tab.years.map((y, i) => (
                                                        <td key={y.year} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-body-lg font-bold text-black text-center">{r.values[i] ?? 0}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                                </>);
                            })()}
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
/**
 * One of Magento's tick-box lists (Quarter, Months, Product Group): its button shows Magento's
 * list text, the panel lists Magento's entries with tick boxes, and the card shows the sum of
 * the ticked entries — the way Magento's dashboard works.
 */
function TickDropdownCard({ list, ticks, onToggle, amount, large = false }: {
    list: MagentoTickList | null | undefined;
    ticks: string[];
    onToggle: (key: string) => void;
    amount: string;
    large?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);
    if (!list) return null;
    return (
        <div ref={ref} className={`relative bg-white rounded-sm ${large ? "border border-[#ddd]" : "border border-brand-yellow"}`}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full h-10 px-4 flex items-center justify-between gap-2 bg-brand-yellow text-black text-body font-medium outline-none cursor-pointer"
            >
                <span className="flex-1 text-center truncate">{list.title}</span>
                <svg className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute z-30 top-10 inset-x-0 bg-white border border-[#ddd] shadow-lg max-h-72 overflow-y-auto">
                    {list.items.map((item) => (
                        <label key={item.key} className="flex items-center gap-2 px-3 py-2 text-body text-black hover:bg-gray-50 cursor-pointer border-b last:border-0 border-gray-50">
                            <input
                                type="checkbox"
                                checked={ticks.includes(item.key)}
                                onChange={() => onToggle(item.key)}
                                className="w-4 h-4 accent-brand-yellow cursor-pointer"
                            />
                            <bdi>{item.label}</bdi>
                        </label>
                    ))}
                </div>
            )}
            <div className={large ? "py-5 px-4 text-center" : "py-3 px-4 text-center"}>
                <p className={large ? "text-3xl font-bold text-black font-rubik tracking-tight" : "text-body-lg text-black"}>{amount}</p>
            </div>
        </div>
    );
}

function SummaryDropdownCard({ value, onChange, options, placeholder, amount }: {
    value: string;
    onChange: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder: string;
    amount: string;
}) {
    return (
        <div className="bg-white border border-brand-yellow rounded-sm">
            <PortalDropdown
                value={value}
                onChange={onChange}
                options={options}
                placeholder={placeholder}
                className="w-full"
                buttonClassName="w-full h-10 px-4 justify-between bg-brand-yellow text-black text-body font-medium outline-none [&>span]:flex-1 [&>span]:text-center [&>svg]:!text-black"
            />
            <div className="py-3 px-4 text-center">
                <p className="text-body-lg text-black">{amount}</p>
            </div>
        </div>
    );
}
