"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { redirectToLogin } from "@/utils/helpers";
import Price from "@/app/components/Price";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Filters from "@/components/Filters";
import OrdersTable, { Order, OrdersTableLayout } from "@/components/OrdersTable";
import Pagination from "@/components/Pagination";
import { MyOrdersSkeleton, SidebarSkeleton, OrdersTableSkeleton } from "@/components/skeletons";
import { useCart } from "@/modules/cart/context/CartContext";
import { toast } from "react-hot-toast";

function mapOrder(item: any): Order {
    const id = item.increment_id || "";
    const sapOrderNumber = item.sap_order_number || "";
    // Magento's date in its store timezone (formatted by the route).
    const date = item.date_label || "";
    const grandTotal = item.grand_total;

    let orderedBy = (item.ordered_by || "").trim();
    if (!orderedBy && item.billing_address) {
        orderedBy = `${item.billing_address.firstname || ""} ${item.billing_address.lastname || ""}`.trim();
    }
    if (!orderedBy && (item.customer_firstname || item.customer_lastname)) {
        orderedBy = `${item.customer_firstname || ""} ${item.customer_lastname || ""}`.trim();
    }

    const company = (item.company_name || "").trim();
    const companyCode = (item.company_code || "").trim();
    // Magento's status label for the store view (kleverMyOrders.status_label).
    const status = item.status || "";

    return {
        id,
        sapOrderNumber,
        date,
        grandTotal,
        orderedBy,
        company,
        companyCode,
        status,
        increment_id: item.increment_id || "",
        entity_id: (item.entity_id || item.order_id || item.increment_id || "").toString(),
    };
}

export default function MyOrdersPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
                <div className="flex flex-col lg:flex-row flex-1 w-full">
                    <SidebarSkeleton />
                    <main className="flex-1 min-w-0"><MyOrdersSkeleton /></main>
                </div>
            </div>
        }>
            <MyOrdersPageContent />
        </Suspense>
    );
}

function MyOrdersPageContent() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
    const searchParams = useSearchParams();
    const { refetchCart } = useCart();

    const [orders, setOrders] = useState<Order[]>([]);
    const [allOrdersForCounts, setAllOrdersForCounts] = useState<any[]>([]);
    const [totalItems, setTotalItems] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);

    const authToken = (session as any)?.accessToken;
    const isSalesPerson = useMemo(() => Number((session as any)?.utypid) === 3, [session]);
    const [isMultiCompany, setIsMultiCompany] = useState(false);
    const [isSubOrMasterCompany, setIsSubOrMasterCompany] = useState(false);
    // Magento's account type is exactly "Sales Person" (utypid 3 is shared with Master Company).
    const [isSalesPersonType, setIsSalesPersonType] = useState(false);
    useEffect(() => {
        if (!authToken) { setIsMultiCompany(false); setIsSubOrMasterCompany(false); setIsSalesPersonType(false); return; }
        if (typeof sessionStorage === "undefined") return;
        const ROLE_CACHE = "altalayi_user_type_v1";
        const TOKEN_CACHE = "altalayi_role_token_v1";
        if (sessionStorage.getItem(TOKEN_CACHE) === authToken) {
            const cached = sessionStorage.getItem(ROLE_CACHE) || "Customer";
            setIsMultiCompany(cached === "Multiple Company User");
            setIsSubOrMasterCompany(cached === "Company Sub Account" || cached === "Master Company");
            setIsSalesPersonType(cached === "Sales Person");
            return;
        }
        fetch("/api/kleverapi/account-sidebar", {
            headers: { Authorization: `Bearer ${authToken}` },
        }).then(r => r.json()).then(data => {
            const type = data?.user_type || "Customer";
            sessionStorage.setItem(ROLE_CACHE, type);
            sessionStorage.setItem(TOKEN_CACHE, authToken);
            setIsMultiCompany(type === "Multiple Company User");
            setIsSubOrMasterCompany(type === "Company Sub Account" || type === "Master Company");
            setIsSalesPersonType(type === "Sales Person");
        }).catch(() => { });
    }, [authToken]);
    const shouldHideCartActions = false;

    // Magento's own My Orders table layout (columns, header + action texts) for this customer and store view.
    // Magento is the only source: if it can't be read, the page shows an error state (no local UI).
    const [tableLayout, setTableLayout] = useState<OrdersTableLayout | null>(null);
    const [layoutSettled, setLayoutSettled] = useState(false);
    const [layoutError, setLayoutError] = useState<string | null>(null);
    const [layoutAttempt, setLayoutAttempt] = useState(0);
    useEffect(() => {
        if (!authToken) return;
        let cancelled = false;
        setLayoutSettled(false);
        setLayoutError(null);
        fetch("/api/kleverapi/my-orders/layout", {
            headers: { Authorization: `Bearer ${authToken}`, "x-locale": window.location.pathname.startsWith("/ar") ? "ar" : "en" },
        })
            .then(async (r) => {
                const d = await r.json().catch(() => null);
                if (!r.ok || !Array.isArray(d?.columns)) throw new Error(d?.message || `HTTP ${r.status}`);
                return d as OrdersTableLayout;
            })
            .then((d) => { if (!cancelled) setTableLayout(d); })
            .catch((err) => {
                console.error("[my-orders] Magento layout unavailable:", err?.message || err);
                if (!cancelled) { setTableLayout(null); setLayoutError(err?.message || "error"); }
            })
            .finally(() => { if (!cancelled) setLayoutSettled(true); });
        return () => { cancelled = true; };
    }, [authToken, layoutAttempt]);
    const showCompanyFilters = true;

    // Filter states - derived from URL
    const searchInput = searchParams.get("orderNumber") || "All";
    const statusInput = searchParams.get("status") || "All";
    const companyInput = searchParams.get("companyCode") || "All";
    const currentPage = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "10", 10);

    // Local states for inputs to handle debounce
    const [localSearch, setLocalSearch] = useState(searchInput);
    const [localStatus, setLocalStatus] = useState(statusInput);
    const [localCompany, setLocalCompany] = useState(companyInput);
    const [localCompanyCode, setLocalCompanyCode] = useState("");

    // Effective company: typed code takes precedence over dropdown selection
    const effectiveCompany = useMemo(() => {
        if (localCompanyCode.trim()) return localCompanyCode.trim();
        if (localCompany !== "All") return localCompany;
        return "All";
    }, [localCompany, localCompanyCode]);

    // Sync local state when URL changes
    useEffect(() => {
        setLocalSearch(searchInput);
        setLocalStatus(statusInput);
        setLocalCompany(companyInput);
    }, [searchInput, statusInput, companyInput]);

    useEffect(() => {
        if (authStatus === "unauthenticated") {
            redirectToLogin(router);
        }
    }, [authStatus, router]);

    // Calculate counts dynamically from all orders
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { "All": allOrdersForCounts.length };
        allOrdersForCounts.forEach(order => {
            // Count by status_code (the route normalizes the native status LABEL → the filter
            // dropdown's CODE, e.g. "Check Pending" → "approval_pending"), so counts key on the
            // same value the dropdown uses. Fall back to a lowercased status if code is absent.
            const code = order.status_code || (order.status || "").toLowerCase();
            if (!code) return;
            counts[code] = (counts[code] || 0) + 1;
        });
        return counts;
    }, [allOrdersForCounts]);

    const fetchAllOrdersForCounts = useCallback(async () => {
        const token = (session as any)?.accessToken;
        if (!token) return;
        try {
            // Fetch a large enough page size to get all orders for counts
            const res = await fetch(`/api/kleverapi/my-orders?pageSize=1000&currentPage=1`, {
                headers: { Authorization: `Bearer ${token}`, "x-locale": typeof window !== "undefined" && window.location.pathname.startsWith("/ar") ? "ar" : "en" },
            });
            const data = await res.json();
            if (res.ok) {
                setAllOrdersForCounts(data.items || []);
            }
        } catch (err) {
            console.error("Failed to fetch all orders for counts", err);
        }
    }, [session]);

    const fetchOrders = useCallback(async (search: string, status: string, page: number, size: number, company: string) => {
        const token = (session as any)?.accessToken;
        if (!token) return;

        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                pageSize: size.toString(),
                currentPage: page.toString(),
            });
            if (status !== "All") {
                params.append("status", status);
            }
            if (search && search !== "All") {
                params.append("orderNumber", search);
            }
            if (company && company !== "All") params.append("companyCode", company);

            const res = await fetch(`/api/kleverapi/my-orders?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}`, "x-locale": window.location.pathname.startsWith("/ar") ? "ar" : "en" },
                cache: "no-store",
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to fetch orders");

            const items: any[] = data.items || [];
            // The /my-orders route already returns orders globally sorted newest-first and
            // sliced to this page, so render as-is.
            setOrders(items.map(mapOrder));
            setTotalItems(data.total_count || items.length);
        } catch (err: any) {
            setError(err.message || t("orders.exportFailed"));
        } finally {
            setIsLoading(false);
            setHasFetched(true);
        }
    }, [session]);

    // Initial fetch
    useEffect(() => {
        if (authStatus === "authenticated") {
            fetchOrders(searchInput, statusInput, currentPage, pageSize, companyInput);
            fetchAllOrdersForCounts();
        }
    }, [authStatus, fetchOrders, fetchAllOrdersForCounts, searchInput, statusInput, currentPage, pageSize, companyInput]);

    // Update URL helper
    const updateURLParams = useCallback((newSearch: string, newStatus: string, newPage: number, newSize: number = pageSize, newCompany: string = companyInput) => {
        const params = new URLSearchParams(searchParams.toString());

        // Handle Toast if no data for selected status
        if (newStatus !== "All" && (statusCounts[newStatus.toLowerCase()] === 0 || statusCounts[newStatus] === 0)) {
            toast.error(t("orders.noOrdersForStatus"));
        }

        if (newSearch && newSearch !== "All") params.set("orderNumber", newSearch);
        else params.delete("orderNumber");

        if (newStatus && newStatus !== "All") params.set("status", newStatus);
        else params.delete("status");

        if (newCompany && newCompany !== "All") params.set("companyCode", newCompany);
        else params.delete("companyCode");

        if (newPage > 1) params.set("page", newPage.toString());
        else params.delete("page");

        if (newSize !== 10) params.set("pageSize", newSize.toString());
        else params.delete("pageSize");

        router.push(lp(`/my-orders?${params.toString()}`));
    }, [router, searchParams, statusCounts, pageSize, companyInput]);

    // Auto search with debounce
    useEffect(() => {
        if (localSearch === searchInput && localStatus === statusInput && effectiveCompany === companyInput) return;

        const timer = setTimeout(() => {
            updateURLParams(localSearch, localStatus, 1, pageSize, effectiveCompany);
        }, 500);

        return () => clearTimeout(timer);
    }, [localSearch, localStatus, effectiveCompany, updateURLParams, searchInput, statusInput, companyInput, pageSize]);

    const handleSearchClick = () => {
        updateURLParams(localSearch, localStatus, 1, pageSize, effectiveCompany);
    };

    const handleResetClick = () => {
        toast.dismiss();
        setLocalSearch("All");
        setLocalStatus("All");
        setLocalCompany("All");
        setLocalCompanyCode("");
        router.push(lp("/sales/order/history"));
    };

    const handlePageChange = (page: number) => {
        updateURLParams(localSearch, localStatus, page, pageSize, companyInput);
    };

    const handlePageSizeChange = (size: number) => {
        updateURLParams(localSearch, localStatus, 1, size, companyInput);
    };

    const handleViewOrder = async (entityId: string) => {
        const token = (session as any)?.accessToken;
        if (!token) return;
        try {
            const res = await fetch(`/api/kleverapi/order/${entityId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": window.location.pathname.startsWith("/ar") ? "ar" : "en",
                },
            });
            if (res.status === 403) {
                toast.error(t("orderDetails.noPermission"));
                return;
            }
        } catch {
            // On network error fall through and navigate — detail page will handle it
        }
        router.push(lp(`/sales/order/view/order_id/${entityId}`));
    };

    const handleReorder = async (order: Order) => {
        const token = (session as any)?.accessToken;
        if (!token) {
            toast.error(t("orders.mustLoggedIn"));
            return;
        }

        const toastId = toast.loading(t("m.add-to-cart"));
        try {
            // reorderItems(orderNumber: String!) needs the order NUMBER (increment_id, e.g. "BT…"),
            // NOT the entity_id (which is now the base64 GraphQL order id).
            const orderNumber = order.increment_id || order.id;
            const res = await fetch(`/api/kleverapi/order/${encodeURIComponent(orderNumber)}/reorder`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to reorder");

            await refetchCart();
            toast.success(t("orders.addedToCart"), { id: toastId });
            router.push(lp("/checkout/cart"));
        } catch (err: any) {
            toast.error(err.message || t("orders.exportFailed"), { id: toastId });
        }
    };

    const handleExportOrders = async () => {
        const token = (session as any)?.accessToken;
        if (!token) {
            toast.error(t("orders.mustLoggedInExport"));
            return;
        }

        setIsExporting(true);
        const toastId = toast.loading(t("orders.exporting"));

        try {
            const response = await fetch("/api/kleverapi/orders/export", {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Failed to export orders");

            const base64Content = data.pdf_base64 || data.content || data.base64 || data.csv_base64;
            if (!base64Content) throw new Error("No file content received from server");

            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "text/csv" });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = data.filename || `Orders_Export_${new Date().getTime()}.csv`;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);

            toast.success(t("orders.exportSuccess"), { id: toastId });
        } catch (err: any) {
            console.error("Export Error:", err);
            toast.error(err.message || t("orders.exportFailed"), { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    const totalPages = Math.ceil(totalItems / pageSize);
    const isFiltered = !!(localSearch !== "All" || localStatus !== "All" || effectiveCompany !== "All" || searchParams.get("orderNumber") || searchParams.get("status") || searchParams.get("companyCode"));

    if (authStatus === "loading") {
        return (
            <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
                <div className="flex flex-col lg:flex-row flex-1 w-full">
                    <SidebarSkeleton />
                    <main className="flex-1 min-w-0">
                        <MyOrdersSkeleton />
                    </main>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
            <div className="flex flex-col lg:flex-row flex-1 w-full">
                <Sidebar />

                <main className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                            <h1 className="text-h3 md:text-[26px] font-bold text-black uppercase tracking-wide whitespace-nowrap">
                                {t("orders.title")}
                            </h1>
                        </div>
                        <button
                            onClick={handleExportOrders}
                            disabled={isExporting}
                            className={`w-full sm:w-auto flex-shrink-0 justify-center flex items-center gap-2 border-2 border-brand-yellow text-black text-body-sm font-bold px-5 py-2 uppercase tracking-wide hover:bg-brand-yellow transition-colors rounded-sm ${isExporting ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isExporting ? (
                                <>
                                    {t("orders.exporting")}
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    {t("orders.exportOrders")}
                                </>
                            )}
                        </button>
                    </div>

                    {tableLayout?.filters && (
                        <Filters
                            status={localStatus}
                            search={localSearch}
                            onStatusChange={setLocalStatus}
                            onSearchChange={setLocalSearch}
                            onApplySearch={handleSearchClick}
                            onReset={handleResetClick}
                            isFiltered={isFiltered}
                            statusCounts={statusCounts}
                            company={localCompany}
                            onCompanyChange={setLocalCompany}
                            companyCode={localCompanyCode}
                            onCompanyCodeChange={setLocalCompanyCode}
                            showCompanyFilters={showCompanyFilters}
                            magento={tableLayout.filters}
                        />
                    )}

                    {/* Loading (initial mount or fetch) with no data yet → show the table skeleton
                        in-place. The real chrome (sidebar/heading/export/filters) stays rendered,
                        so the layout is the full page and there's no shift when data arrives. */}
                    {layoutError ? (
                        <div className="py-12 bg-white border border-gray-100 rounded-lg shadow-sm px-4 md:px-10">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-red-50 border border-red-100 p-4 rounded-md text-red-700">
                                <span className="text-body-lg font-medium flex-1">{t("orders.magentoUnavailable")}</span>
                                <button
                                    onClick={() => setLayoutAttempt((n) => n + 1)}
                                    className="px-4 py-1.5 bg-white border border-red-200 text-body text-red-700 hover:bg-red-100 transition-colors rounded-xs cursor-pointer"
                                >
                                    {t("orderDetails.tryAgain")}
                                </button>
                            </div>
                        </div>
                    ) : (((isLoading || !hasFetched) && orders.length === 0) || !layoutSettled || !tableLayout) ? (
                        <OrdersTableSkeleton rows={pageSize} />
                    ) : (hasFetched && orders.length === 0 && !isLoading) ? (
                        <div className="py-12 bg-white border border-gray-100 rounded-lg shadow-sm px-4 md:px-10">
                            {tableLayout.filters?.resetButton && (
                                <div className="mb-4">
                                    <button
                                        onClick={handleResetClick}
                                        className="px-4 py-1.5 bg-[#f0f0f0] border border-gray-300 text-body text-black hover:bg-gray-200 transition-colors rounded-xs"
                                    >
                                        {tableLayout.filters.resetButton}
                                    </button>
                                </div>
                            )}
                            <div className="flex items-center gap-3 bg-[#fef9c3] border border-[#fef08a] p-4 rounded-md text-[#854d0e]">
                                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="text-body-lg font-medium">{tableLayout.empty_message}</span>
                            </div>
                        </div>
                    ) : (
                        <div className={`transition-opacity duration-200 `}>
                            <OrdersTable
                                orders={orders}
                                onViewOrder={handleViewOrder}
                                viewHref={(o) => lp(`/sales/order/view/order_id/${o.entity_id}`)}
                                onReorder={handleReorder}
                                hideReorder={shouldHideCartActions}
                                layout={isSalesPersonType ? tableLayout : { ...tableLayout, empty_texts: undefined }}
                            />
                            {totalItems > 0 && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    totalItems={totalItems}
                                    pageSize={pageSize}
                                    onPageChange={handlePageChange}
                                    onPageSizeChange={handlePageSizeChange}
                                />
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
