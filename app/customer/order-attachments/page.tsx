"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import PortalDropdown from "@/components/PortalDropdown";
import toast from "react-hot-toast";
import { redirectToLogin } from "@/utils/helpers";
import { OrderAttachmentsTableSkeleton } from "@/components/skeletons";
import Pagination from "@/components/Pagination";
import type { MagentoAttachmentsLayout, AttachmentColumnKey } from "@/src/lib/magentoOrderView";

// Fetcher with token
const fetcher = async (url: string, token: string | null) => {
    if (!token) return null;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const error = new Error("An error occurred while fetching the data.");
        // @ts-ignore
        error.info = await res.json();
        // @ts-ignore
        error.status = res.status;
        throw error;
    }
    return res.json();
};

export default function OrderAttachmentsPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const { t, isRtl } = useTranslation();
    const lp = useLocalePath();

    // Filters state
    const [searchText, setSearchText] = useState("");
    const [searchOrderId, setSearchOrderId] = useState("");
    const [documentType, setDocumentType] = useState("All");
    const [invoiceDue, setInvoiceDue] = useState("All");
    const [company, setCompany] = useState("All");
    const [companyCode, setCompanyCode] = useState("");
    const [companyCodeApplied, setCompanyCodeApplied] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [openingFileId, setOpeningFileId] = useState<string | null>(null);
    const [localPaidIds, setLocalPaidIds] = useState<string[]>([]);
    const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
    const [isSubAccountSession, setIsSubAccountSession] = useState(false);
    const [isSalesPerson, setIsSalesPerson] = useState(false);

    // Construct API URL with query params
    const token = (session as any)?.accessToken;

    useEffect(() => {
        if (typeof window !== "undefined") {
            setIsSubAccountSession(localStorage.getItem("isSubAccount") === "true");
        }
    }, []);

    // Auth Guard
    useEffect(() => {
        if (authStatus === "unauthenticated") {
            redirectToLogin(router);
        }
    }, [authStatus, router]);

    // Detect Sales Person role via sessionStorage cache (set by Navbar's account-sidebar fetch).
    // Exact string "Sales Person" avoids the utypid===3 ambiguity with Master Company.
    useEffect(() => {
        if (!token) { setIsSalesPerson(false); return; }
        if (typeof sessionStorage === "undefined") return;
        const ROLE_CACHE = "altalayi_user_type_v1";
        const TOKEN_CACHE = "altalayi_role_token_v1";
        if (sessionStorage.getItem(TOKEN_CACHE) === token) {
            setIsSalesPerson(sessionStorage.getItem(ROLE_CACHE) === "Sales Person");
            return;
        }
        fetch("/api/kleverapi/account-sidebar", {
            headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).then(data => {
            const type = data?.user_type || "Customer";
            sessionStorage.setItem(ROLE_CACHE, type);
            sessionStorage.setItem(TOKEN_CACHE, token);
            setIsSalesPerson(type === "Sales Person");
        }).catch(() => { });
    }, [token]);
    const queryParams = new URLSearchParams();
    if (searchOrderId) queryParams.append("order_id", searchOrderId);
    if (documentType !== "All") queryParams.append("document_type", documentType);
    if (invoiceDue !== "All") queryParams.append("invoice_due", invoiceDue);
    if (company !== "All") queryParams.append("company", company);
    if (companyCodeApplied) queryParams.append("company_code", companyCodeApplied);
    queryParams.append("pageSize", String(pageSize));
    queryParams.append("currentPage", String(currentPage));

    const apiUrl = token ? `/api/kleverapi/order-attachments/search?${queryParams.toString()}` : null;

    // Rows (kleverOrderUploadSearch — the same rows Magento's page lists)
    const { data, error, isLoading, mutate } = useSWR(
        apiUrl ? [apiUrl, token] : null,
        ([url, t]) => fetcher(url, t)
    );

    // Magento's own page layout: title, search box, filters + options, columns, texts.
    // Magento is the only source — if it can't be read, the page shows an error state.
    const { data: layout, error: layoutError, isLoading: layoutLoading, mutate: reloadLayout } = useSWR<MagentoAttachmentsLayout>(
        token ? ["/api/kleverapi/order-attachments/layout", token] : null,
        ([url, t]: [string, string]) => fetcher(url, t)
    );

    // Magento's "All" option has value "" — kept as "All" in our filter state.
    const toOptions = (opts: { value: string; label: string }[]) => opts.map((o) => ({ label: o.label, value: o.value || "All" }));
    const filterState: Record<string, { value: string; set: (v: string) => void }> = {
        doc_type: { value: documentType, set: setDocumentType },
        invoice_due: { value: invoiceDue, set: setInvoiceDue },
        company: { value: company, set: setCompany },
    };
    const changeFilter = (key: string, val: string) => { filterState[key].set(val); setCurrentPage(1); };

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setSearchOrderId(searchText);
        setCompanyCodeApplied(companyCode);
        setCurrentPage(1);
    };

    const handleReset = () => {
        setSearchText("");
        setSearchOrderId("");
        setDocumentType("All");
        setInvoiceDue("All");
        setCompany("All");
        setCompanyCode("");
        setCompanyCodeApplied("");
        setCurrentPage(1);
    };

    const handleViewOrder = (orderId: string) => {
        if (!orderId) return;
        router.push(lp(`/my-orders/${orderId}`));
    };

    const handleMarkAsPaid = async (attachmentId: string, orderId: string) => {
        if (!orderId || orderId === "-") {
            toast.error(t("orderDetails.confirmFailed"));
            return;
        }

        setMarkingPaidId(attachmentId);
        const loadingToast = toast.loading(t("login.pleaseWait") || "Please wait...");

        try {
            const res = await fetch(`/api/kleverapi/order/${orderId}/confirm`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ comment: "Payment confirmed by user" })
            });
            const result = await res.json().catch(() => null);
            // Only Magento's success counts — a failure is reported as a failure.
            if (res.ok && result?.success) {
                setLocalPaidIds(prev => [...prev, String(attachmentId)]);
                toast.success(result?.message || t("orderDetails.confirmSuccess"), { id: loadingToast });
                mutate?.();
            } else {
                toast.error(result?.message || t("orderDetails.confirmFailed"), { id: loadingToast });
            }
        } catch (error) {
            console.error("Error marking as paid:", error);
            toast.error(t("orderDetails.confirmFailed"), { id: loadingToast });
        } finally {
            setMarkingPaidId(null);
        }
    };

    const handleViewFile = (attachment: any) => {
        // kleverOrderUploadSearch returns `file_path` (relative), kleverOrderAttachments returns
        // a full `file_url`. Open the file's PUBLIC media URL directly.
        const raw: string = attachment.file_url || attachment.file_path || "";
        if (!raw) {
            toast.error(t("orderAttachments.unableToOpen"));
            return;
        }
        let href = raw;
        if (!/^https?:\/\//i.test(raw)) {
            // Relative path (e.g. "/i/m/file.png") → public order-upload media URL.
            const origin = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "").replace(/\/$/, "");
            const path = raw.startsWith("/") ? raw : `/${raw}`;
            href = `${origin}/media/orderupload${path}`;
        }
        window.open(href, "_blank", "noopener,noreferrer");
    };

    const attachments: any[] = Array.isArray(data) ? data : data?.attachments || data?.items || [];
    // Paging over Magento's total (kleverOrderUploadSearch total_count)
    const totalItems: number = Number(data?.total_count) || attachments.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const columns = layout?.columns ?? [];
    const labelOf = (key: AttachmentColumnKey) => columns.find((c) => c.key === key)?.label ?? null;

    // Payment cell: Magento's value; "Mark as paid" where the existing account rule allows it.
    // Sales Person only: what Magento shows in a column when the attachment has no value (e.g. "N/A").
    const salesEmptyTexts = isSalesPerson ? layout?.emptyTexts : undefined;

    const paymentCell = (attachment: any, attId: string, compact: boolean) => {
        const isLocallyPaid = localPaidIds.includes(String(attId));
        const displayStatus: string = isLocallyPaid ? "Paid" : (attachment.payment || attachment.payment_status || "");
        if (!displayStatus) return salesEmptyTexts?.payment ?? null;
        const statusLower = displayStatus.toLowerCase();
        const canMark = isSubAccountSession || (!compact && isSalesPerson);
        const isMarkAsPaid = (statusLower === "unpaid" || statusLower.includes("mark")) && canMark;
        if (isMarkAsPaid) {
            const isMarking = markingPaidId === String(attId);
            return (
                <button
                    onClick={() => handleMarkAsPaid(String(attId), attachment.order_id)}
                    disabled={isMarking}
                    className={`text-blue-600 hover:text-brand-yellow hover:underline font-semibold focus:outline-none ${isMarking ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                    {isMarking ? (t("login.pleaseWait") || "Please wait...") : (t("data.Mark as paid") || "Mark as paid")}
                </button>
            );
        }
        return <span className="text-black">{displayStatus}</span>;
    };

    const cell = (attachment: any, attId: string, key: AttachmentColumnKey) => {
        const tdClass = "px-3 py-2 border-r border-gray-200 text-body";
        switch (key) {
            case "order":
                return (
                    <td key={key} className={tdClass}>
                        <button onClick={() => handleViewOrder(attachment.order_id)} className="text-black hover:text-brand-yellow hover:underline font-medium focus:outline-none cursor-pointer">
                            {attachment.order_increment_id || attachment.order_id}
                        </button>
                    </td>
                );
            case "file":
                return (
                    <td key={key} className={`${tdClass} max-w-[260px]`}>
                        <button
                            onClick={() => handleViewFile({ ...attachment, file_url: attachment.file_url || attachment.file_path })}
                            disabled={openingFileId === String(attId)}
                            className="text-black hover:text-brand-yellow hover:underline inline-block break-all ltr:text-left rtl:text-right focus:outline-none font-medium cursor-pointer"
                        >
                            {attachment.file_name}
                        </button>
                    </td>
                );
            case "company":
                return <td key={key} className={tdClass}>{attachment.company_name || salesEmptyTexts?.company}</td>;
            case "companyCode":
                return <td key={key} className={tdClass}>{attachment.company_code || salesEmptyTexts?.companyCode}</td>;
            case "documentType":
                return <td key={key} className={tdClass}>{attachment.comment || attachment.document_type || salesEmptyTexts?.documentType}</td>;
            case "createdOn":
                return <td key={key} className={`${tdClass} whitespace-nowrap`}>{attachment.created_on_label || salesEmptyTexts?.createdOn}</td>;
            case "invoiceDue":
                return <td key={key} className={`${tdClass} whitespace-nowrap`}>{attachment.invoice_due_label || salesEmptyTexts?.invoiceDue}</td>;
            case "payment":
                return <td key={key} className={tdClass}>{paymentCell(attachment, attId, false)}</td>;
        }
    };

    const inputClass = "h-9 border border-gray-200 bg-white px-3 text-body text-black placeholder-gray-400 focus:outline-none focus:border-brand-yellow font-medium";
    const dropdownButtonClass = "flex items-center justify-between gap-2 cursor-pointer transition-all w-full h-9 bg-white text-black border border-gray-200 px-3 text-body ltr:text-left rtl:text-right focus:outline-none focus:border-brand-yellow";

    return (
        <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
            <div className="flex flex-col lg:flex-row flex-1 w-full">
                <Sidebar />

                <main className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white min-w-0" dir={isRtl ? "rtl" : "ltr"}>
                    {layoutError ? (
                        <div className="bg-red-50 border border-red-100 text-red-700 p-4 md:p-8 rounded-md flex flex-col sm:flex-row sm:items-center gap-3">
                            <span className="text-body-lg font-medium flex-1">{t("orderAttachments.magentoUnavailable")}</span>
                            <button
                                onClick={() => reloadLayout()}
                                className="px-4 py-1.5 bg-white border border-red-200 text-body text-red-700 hover:bg-red-100 transition-colors rounded-xs cursor-pointer"
                            >
                                {t("common.tryAgain")}
                            </button>
                        </div>
                    ) : layoutLoading || !layout ? (
                        <OrderAttachmentsTableSkeleton rows={6} />
                    ) : (
                        <>
                            {layout.title && (
                                <h1 className="text-h3 md:text-[26px] font-bold text-black mb-5 uppercase tracking-wide">
                                    {layout.title}
                                </h1>
                            )}

                            {/* Magento's filter bar: search box (+ company code when Magento has it), its dropdowns, Reset */}
                            <form className="mb-5" onSubmit={handleSearch}>
                                {layout.search && (
                                    <div className="flex flex-col sm:flex-row gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={searchText}
                                            onChange={(e) => setSearchText(e.target.value)}
                                            placeholder={layout.search.placeholder ?? undefined}
                                            className={`${inputClass} flex-1`}
                                        />
                                        {layout.companyCode && (
                                            <input
                                                type="text"
                                                value={companyCode}
                                                onChange={(e) => setCompanyCode(e.target.value)}
                                                placeholder={layout.companyCode.placeholder ?? undefined}
                                                className={`${inputClass} w-full sm:w-48`}
                                            />
                                        )}
                                        {layout.search.button && (
                                            <button
                                                type="submit"
                                                className="h-9 px-6 bg-brand-yellow hover:bg-brand-yellow-dark text-black text-body-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap cursor-pointer"
                                            >
                                                {layout.search.button}
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="flex flex-col sm:flex-row gap-2 items-end">
                                    {layout.filters.map((f) => (
                                        <div key={f.key} className="w-full sm:w-48">
                                            <label className="block text-xs font-bold text-black mb-1.5 uppercase tracking-wide">{f.label}</label>
                                            <PortalDropdown
                                                value={filterState[f.key].value}
                                                onChange={(val) => changeFilter(f.key, val)}
                                                options={toOptions(f.options)}
                                                buttonClassName={dropdownButtonClass}
                                            />
                                        </div>
                                    ))}
                                    {layout.resetButton && (
                                        <button
                                            type="button"
                                            onClick={handleReset}
                                            className="h-9 px-6 bg-black hover:bg-gray-800 text-white text-body-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap w-full sm:w-auto cursor-pointer"
                                        >
                                            {layout.resetButton}
                                        </button>
                                    )}
                                </div>
                            </form>

                            {/* Table — Magento's columns and rows, paged */}
                            {error ? (
                                <div className="bg-red-50 border border-red-100 text-red-600 p-4 md:p-8 rounded-md text-center">
                                    <p className="text-xs">{error.message}</p>
                                    <button
                                        onClick={() => mutate()}
                                        className="mt-6 px-10 py-3 bg-red-600 text-white rounded-md font-black text-xs uppercase tracking-widest shadow-md active:scale-95 cursor-pointer"
                                    >
                                        {t("common.tryAgain")}
                                    </button>
                                </div>
                            ) : isLoading ? (
                                <OrderAttachmentsTableSkeleton rows={6} />
                            ) : (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block overflow-x-auto w-full">
                                        <table className="w-full border-collapse border border-[#ddd] bg-white">
                                            <thead>
                                                <tr className="bg-brand-yellow text-label uppercase font-bold tracking-widest text-black">
                                                    {columns.map((c) => (
                                                        <th key={c.key} className="px-3 py-2 border border-[#ddd] ltr:text-left rtl:text-right whitespace-nowrap text-body-sm">{c.label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {attachments.length > 0 ? attachments.map((attachment: any, idx: number) => {
                                                    const attId = String(attachment.id || attachment.attachment_id || idx);
                                                    return (
                                                        <tr key={attId} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-200 hover:bg-gray-50/50 transition-colors`}>
                                                            {columns.map((c) => cell(attachment, attId, c.key))}
                                                        </tr>
                                                    );
                                                }) : (
                                                    <tr>
                                                        <td colSpan={columns.length} className="px-3 py-2 text-body text-black">{layout.emptyMessage}</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Card List — same Magento labels */}
                                    <div className="md:hidden space-y-3">
                                        {attachments.length > 0 ? attachments.map((attachment: any, idx: number) => {
                                            const attId = String(attachment.id || attachment.attachment_id || idx);
                                            const rows: [AttachmentColumnKey, React.ReactNode][] = [
                                                ["order", (
                                                    <button key="order" onClick={() => handleViewOrder(attachment.order_id)} className="text-black hover:text-brand-yellow hover:underline font-bold cursor-pointer">
                                                        {attachment.order_increment_id || attachment.order_id}
                                                    </button>
                                                )],
                                                ["company", attachment.company_name || salesEmptyTexts?.company],
                                                ["companyCode", attachment.company_code || salesEmptyTexts?.companyCode],
                                                ["documentType", attachment.comment || attachment.document_type || salesEmptyTexts?.documentType],
                                                ["createdOn", attachment.created_on_label || salesEmptyTexts?.createdOn],
                                                ["invoiceDue", attachment.invoice_due_label || salesEmptyTexts?.invoiceDue],
                                                ["payment", paymentCell(attachment, attId, true)],
                                            ];
                                            return (
                                                <div key={attId} className="bg-white border border-subtle rounded-md p-4 shadow-sm space-y-1.5 text-body">
                                                    {labelOf("file") && (
                                                        <button
                                                            onClick={() => handleViewFile({ ...attachment, file_url: attachment.file_url || attachment.file_path })}
                                                            className="font-bold text-black hover:text-brand-yellow hover:underline ltr:text-left rtl:text-right break-all cursor-pointer"
                                                        >
                                                            {attachment.file_name}
                                                        </button>
                                                    )}
                                                    {rows.filter(([key, value]) => labelOf(key) && value).map(([key, value]) => (
                                                        <div key={key} className="flex justify-between gap-3">
                                                            <span className="text-gray-500">{labelOf(key)}</span>
                                                            <span className="text-black">{value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }) : (
                                            <div className="border border-subtle p-6 text-body text-black bg-white">{layout.emptyMessage}</div>
                                        )}
                                    </div>

                                    {totalItems > 0 && (
                                        <div className="mt-6">
                                            <Pagination
                                                currentPage={currentPage}
                                                totalPages={totalPages}
                                                totalItems={totalItems}
                                                pageSize={pageSize}
                                                onPageChange={(page: number) => setCurrentPage(page)}
                                                onPageSizeChange={(size: number) => { setPageSize(size); setCurrentPage(1); }}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
