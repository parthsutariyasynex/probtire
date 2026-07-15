"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import PortalDropdown from "@/components/PortalDropdown";
import Pagination from "@/components/Pagination";
import toast from "react-hot-toast";
import { redirectToLogin } from "@/utils/helpers";
import { OrderAttachmentsTableSkeleton } from "@/components/skeletons";

// Helper to normalize options (strings or objects) to {label, value} format
function normalizeOptions(options: any[]): { label: string; value: string }[] {
    return options.map((opt) => {
        if (typeof opt === "string") return { label: opt, value: opt };
        const label = opt.label || opt.name || opt.status || "";
        const value = opt.value || opt.id || label;
        return { label, value: String(value) };
    });
}

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
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [openingFileId, setOpeningFileId] = useState<string | null>(null);

    // Auth Guard
    useEffect(() => {
        if (authStatus === "unauthenticated") {
            redirectToLogin(router);
        }
    }, [authStatus, router]);

    // Construct API URL with query params
    const token = (session as any)?.accessToken;
    const queryParams = new URLSearchParams();
    if (searchOrderId) queryParams.append("order_id", searchOrderId);
    if (documentType !== "All") queryParams.append("document_type", documentType);
    if (invoiceDue !== "All") queryParams.append("invoice_due", invoiceDue);
    queryParams.append("pageSize", pageSize.toString());
    queryParams.append("currentPage", currentPage.toString());

    const apiUrl = token
        ? `/api/kleverapi/order-attachments/search${queryParams.toString() ? `?${queryParams.toString()}` : ""}`
        : null;

    // SWR for data fetching
    const { data, error, isLoading, mutate } = useSWR(
        apiUrl ? [apiUrl, token] : null,
        ([url, t]) => fetcher(url, t)
    );

    // Filter Options
    const { data: filterOptionsData } = useSWR(
        token ? [`/api/kleverapi/order-attachments/filter-options`, token] : null,
        ([url, t]) => fetcher(url, t)
    );

    const docTypeOptions = filterOptionsData?.document_type_options || filterOptionsData?.document_types || [];
    const invoiceDueOptions = filterOptionsData?.invoice_due_options || filterOptionsData?.invoice_due || [];

    // Helper to ensure "All" is present and at the start, translate labels
    const getOptionsWithAll = (options: any[]) => {
        const allOption = { label: t("m.all") || "All", value: "All" };
        if (!options || options.length === 0) return [allOption];
        const normalized = normalizeOptions(options);
        const hasAll = normalized.some(opt => opt.value.toLowerCase() === "all" || opt.label.toLowerCase() === "all");
        if (hasAll) {
            return normalized.map(opt =>
                opt.value.toLowerCase() === "all" || opt.label.toLowerCase() === "all"
                    ? { ...opt, label: t("m.all") || "All" }
                    : opt
            );
        }
        return [allOption, ...normalized];
    };

    const finalDocTypes = getOptionsWithAll(docTypeOptions);
    const finalInvoiceDues = getOptionsWithAll(invoiceDueOptions);

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setSearchOrderId(searchText);
        setCurrentPage(1);
    };

    const handleReset = () => {
        setSearchText("");
        setSearchOrderId("");
        setDocumentType("All");
        setInvoiceDue("All");
        setCurrentPage(1);
    };

    const handleViewOrder = (orderId: string) => {
        if (!orderId) return;
        router.push(lp(`/my-orders/${orderId}`));
    };

    const handleViewFile = (attachment: any) => {
        const fileName = attachment.file_name || attachment.label || "file";
        // kleverOrderUploadSearch returns `file_path` (relative), kleverOrderAttachments returns
        // a full `file_url`. Open the file's PUBLIC media URL directly — no /file/:id proxy
        // (that endpoint can't stream the binary and 404s).
        const raw: string = attachment.file_url || attachment.file_path || "";
        console.log("[ORDER ATTACHMENT] attachment_id:", attachment.attachment_id || attachment.id,
            "| file_name:", fileName, "| file_url/path:", raw);

        if (!raw) {
            toast.error(t("orderAttachments.unableToOpen"));
            return;
        }

        let href = raw;
        if (!/^https?:\/\//i.test(raw)) {
            // Relative path (e.g. "/i/m/file.png", "/api/file.pdf") → public order-upload media URL.
            const origin = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "https://altalayi-live.btire.com").replace(/\/$/, "");
            const path = raw.startsWith("/") ? raw : `/${raw}`;
            href = `${origin}/media/orderupload${path}`;
        }

        window.open(href, "_blank", "noopener,noreferrer");
    };

    const getDocTypeLabel = (fileName: string, origType: string) => {
        if (origType && origType !== "-") return origType;
        if (!fileName) return "documents";
        const ext = fileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'pdf': return "PDF";
            case 'jpg':
            case 'jpeg':
            case 'png': return "image";
            case 'doc':
            case 'docx': return "Word";
            case 'xls':
            case 'xlsx': return "Excel";
            default: return "documents";
        }
    };

    const formatDate = (dateStr: string | undefined | null) => {
        if (!dateStr) return "-";
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        } catch {
            return dateStr;
        }
    };

    const attachments = Array.isArray(data) ? data : data?.attachments || data?.items || [];
    const totalItems = data?.total_count || attachments.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    const handlePageChange = (page: number) => setCurrentPage(page);
    const handlePageSizeChange = (size: number) => { setPageSize(size); setCurrentPage(1); };

    return (
        <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
            <div className="flex flex-col lg:flex-row flex-1 w-full">
                <Sidebar />

                <main className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white min-w-0" dir={isRtl ? "rtl" : "ltr"}>
                    <h1 className="text-h3 md:text-[26px] font-bold text-black mb-5 uppercase tracking-wide">
                        {t("orderAttachments.title")}
                    </h1>

                    <form className="mb-5" onSubmit={handleSearch}>
                        {/* Search Row */}
                        <div className="flex flex-col sm:flex-row gap-2 mb-2">
                            <input
                                type="text"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                placeholder={t("orderAttachments.searchPlaceholder") || "Search Order..."}
                                className="h-9 flex-1 border border-gray-200 bg-white px-3 text-body text-black placeholder-gray-400 focus:outline-none focus:border-brand-yellow font-medium"
                            />
                            <button
                                type="submit"
                                className="h-9 px-6 bg-brand-yellow hover:bg-brand-yellow-dark text-black text-body-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
                            >
                                {t("m.search")}
                            </button>
                        </div>

                        {/* Filters Row */}
                        <div className="flex flex-col sm:flex-row gap-2 items-center">
                            <div className="w-full sm:w-48">
                                <PortalDropdown
                                    value={documentType}
                                    onChange={(val) => { setDocumentType(val); setCurrentPage(1); }}
                                    options={finalDocTypes}
                                    buttonClassName="flex items-center justify-between gap-2 cursor-pointer transition-all w-full h-9 bg-white text-black border border-gray-200 px-3 text-body ltr:text-left rtl:text-right focus:outline-none focus:border-brand-yellow"
                                />
                            </div>

                            <div className="w-full sm:w-48">
                                <PortalDropdown
                                    value={invoiceDue}
                                    onChange={(val) => { setInvoiceDue(val); setCurrentPage(1); }}
                                    options={finalInvoiceDues}
                                    buttonClassName="flex items-center justify-between gap-2 cursor-pointer transition-all w-full h-9 bg-white text-black border border-gray-200 px-3 text-body ltr:text-left rtl:text-right focus:outline-none focus:border-brand-yellow"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handleReset}
                                className="h-9 px-6 bg-black hover:bg-gray-800 text-white text-body-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap w-full sm:w-auto cursor-pointer"
                            >
                                {t("m.reset")}
                            </button>
                        </div>
                    </form>

                    {/* Table Section */}
                    {error ? (
                        <div className="bg-red-50 border border-red-100 text-red-600 p-4 md:p-8 rounded-md text-center">
                            <p className="font-black text-xs uppercase mb-2">{t("common.error")}</p>
                            <p className="text-xs">{error.message}</p>
                            <button
                                onClick={() => mutate()}
                                className="mt-6 px-10 py-3 bg-red-600 text-white rounded-md font-black text-xs uppercase tracking-widest shadow-md active:scale-95"
                            >
                                {t("common.tryAgain")}
                            </button>
                        </div>
                    ) : isLoading ? (
                        <OrderAttachmentsTableSkeleton rows={6} />
                    ) : attachments.length > 0 ? (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-x-auto w-full">
                                <table className="w-full border-collapse min-w-[640px] border border-[#ddd] bg-white">
                                    <thead>
                                        <tr className="bg-brand-yellow text-label uppercase font-bold tracking-widest text-black">
                                            <th className="px-3 py-2 border border-[#ddd] text-center whitespace-nowrap text-body-sm">{t("orders.orderId")}</th>
                                            <th className="px-3 py-2 border border-[#ddd] ltr:text-left rtl:text-right text-body-sm">{t("m.file-name")}</th>
                                            <th className="px-3 py-2 border border-[#ddd] text-center whitespace-nowrap text-body-sm">{t("m.document-type")}</th>
                                            <th className="px-3 py-2 border border-[#ddd] text-center whitespace-nowrap text-body-sm">{t("m.created-at")}</th>
                                            <th className="px-3 py-2 border border-[#ddd] text-center whitespace-nowrap text-body-sm">{t("m.invoice-due")}</th>
                                            <th className="px-3 py-2 border border-[#ddd] text-center whitespace-nowrap text-body-sm">{t("m.payment")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attachments.map((attachment: any, idx: number) => {
                                            const attId = attachment.id || attachment.attachment_id || String(idx);
                                            const isOpening = openingFileId === String(attId);
                                            const orderDisplay = attachment.order_increment_id || attachment.order_id || "-";
                                            const fileName = attachment.file_name || attachment.label || t("m.download");
                                            const docTypeLabel = getDocTypeLabel(fileName, attachment.comment || attachment.document_type || attachment.attachment_type);
                                            const createdAt = formatDate(attachment.created_at || attachment.upload_date);
                                            const invoiceDueVal = attachment.invoice_due ? formatDate(attachment.invoice_due) : "";
                                            const paymentStatus = attachment.payment || attachment.payment_status || "";

                                            return (
                                                <tr key={attId} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-200 hover:bg-gray-50/50 transition-colors`}>
                                                    <td className="px-3 py-2 border-r border-gray-200 text-center text-body">
                                                        <button onClick={() => handleViewOrder(attachment.order_id)} className="text-black hover:underline font-medium focus:outline-none">{orderDisplay}</button>
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200 text-body max-w-[240px]">
                                                        <div className="flex items-center gap-3">
                                                            <button onClick={() => { const useUrl = attachment.file_url || attachment.file_path; handleViewFile({ ...attachment, file_url: useUrl, attachment_id: attId }); }} disabled={isOpening} className={`text-black hover:text-brand-yellow hover:underline inline-block break-all ltr:text-left rtl:text-right focus:outline-none font-medium ${isOpening ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>{fileName}</button>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200 text-center text-body uppercase">{t(`m.${docTypeLabel.toLowerCase()}`) !== `m.${docTypeLabel.toLowerCase()}` ? t(`m.${docTypeLabel.toLowerCase()}`) : (t(`data.${docTypeLabel}`) !== `data.${docTypeLabel}` ? t(`data.${docTypeLabel}`) : docTypeLabel)}</td>
                                                    <td className="px-3 py-2 border-r border-gray-200 text-center text-body whitespace-nowrap">{createdAt}</td>
                                                    <td className="px-3 py-2 border-r border-gray-200 text-center text-body whitespace-nowrap">{invoiceDueVal || "-"}</td>
                                                    <td className="px-3 py-2 border-r border-gray-200 text-center text-body">
                                                        {paymentStatus ? (
                                                            <span className={`inline-flex px-2 py-1 border rounded-sm text-caption font-medium uppercase tracking-wider whitespace-nowrap ${paymentStatus.toLowerCase().includes('paid') ? 'text-black border-gray-200' : 'text-yellow-700 border-yellow-200'}`}>
                                                                {t(`data.${paymentStatus}`) !== `data.${paymentStatus}` ? t(`data.${paymentStatus}`) : paymentStatus}
                                                            </span>
                                                        ) : "-"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card List */}
                            <div className="md:hidden space-y-3">
                                {attachments.map((attachment: any, idx: number) => {
                                    const attId = attachment.id || attachment.attachment_id || String(idx);
                                    const isOpening = openingFileId === String(attId);
                                    const orderDisplay = attachment.order_increment_id || attachment.order_id || "-";
                                    const fileName = attachment.file_name || attachment.label || t("m.download");
                                    const docTypeLabel = getDocTypeLabel(fileName, attachment.comment || attachment.document_type || attachment.attachment_type);
                                    const createdAt = formatDate(attachment.created_at || attachment.upload_date);
                                    const invoiceDueVal = attachment.invoice_due ? formatDate(attachment.invoice_due) : "";
                                    const paymentStatus = attachment.payment || attachment.payment_status || "";

                                    return (
                                        <div key={attId} className="bg-white border border-subtle rounded-md p-4 shadow-sm">
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="min-w-0 flex-1">
                                                    <button
                                                        onClick={() => { const useUrl = attachment.file_url || attachment.file_path; handleViewFile({ ...attachment, file_url: useUrl, attachment_id: attId }); }}
                                                        disabled={isOpening}
                                                        className={`text-body font-bold text-black hover:text-yellow-600 ltr:text-left rtl:text-right break-all ${isOpening ? 'opacity-50' : ''}`}
                                                    >
                                                        {fileName}
                                                    </button>
                                                    <p className="text-label text-gray-500 font-medium mt-1 uppercase tracking-wider">{t(`m.${docTypeLabel.toLowerCase()}`) !== `m.${docTypeLabel.toLowerCase()}` ? t(`m.${docTypeLabel.toLowerCase()}`) : (t(`data.${docTypeLabel}`) !== `data.${docTypeLabel}` ? t(`data.${docTypeLabel}`) : docTypeLabel)}</p>
                                                </div>
                                                <span className={`px-2 py-1 rounded-md font-black uppercase text-caption flex-shrink-0 ${paymentStatus.toLowerCase().includes('paid') ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {paymentStatus ? (t(`data.${paymentStatus}`) !== `data.${paymentStatus}` ? t(`data.${paymentStatus}`) : paymentStatus) : "-"}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-label text-gray-500 font-medium border-t border-gray-100 pt-2.5">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-black text-black uppercase text-caption">{t("m.order")}:</span>
                                                    <button onClick={() => handleViewOrder(attachment.order_id)} className="text-black hover:text-yellow-600 font-bold">{orderDisplay}</button>
                                                </div>
                                                <span>{createdAt}</span>
                                                {invoiceDueVal && <span>{t("m.invoice-due")}: {invoiceDueVal}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Pagination */}
                            {totalItems > 0 && (
                                <div className="mt-6">
                                    <Pagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        totalItems={totalItems}
                                        pageSize={pageSize}
                                        onPageChange={handlePageChange}
                                        onPageSizeChange={handlePageSizeChange}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="border border-subtle p-8 md:p-24 text-center rounded-md bg-white shadow-sm">
                            <p className="text-gray-400 italic text-xs uppercase tracking-widest">{t("orderAttachments.noRecords")}</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
