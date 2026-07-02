"use client";
import { useTranslation } from "@/hooks/useTranslation";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store/store";
import { fetchCustomerInfo } from "@/store/actions/customerActions";
import Sidebar from "@/components/Sidebar";
import { useSession } from "next-auth/react";
import { redirectToLogin } from "@/utils/helpers";
import PortalDropdown from "@/components/PortalDropdown";
import { ForecastSkeleton, SidebarSkeleton } from "@/components/skeletons";

/**
 * Proper data structures for the Forecast API
 */
interface ForecastFile {
    forecast_id?: string | number;
    file_name?: string;
    filename?: string;
    name?: string;
    file_url?: string;
    uploaded_date?: string;
    created_at?: string;
    updated_at?: string;
    uploaded_at?: string;
    date?: string;
    entity_id?: string | number;
    file_id?: string | number;
    id?: string | number;
}

interface ForecastResponse {
    items: ForecastFile[];
    total_count: number;
    page_size: number;
    current_page: number;
    total_pages: number;
}

export default function MyForecastPage() {
    const router = useRouter();
    const { t, isRtl } = useTranslation();
    const dispatch = useDispatch<AppDispatch>();
    const { data: session, status } = useSession();
    const { data: customer, loading } = useSelector((state: RootState) => state.customer);
    const token = useSelector((state: RootState) => state.auth.token);

    const [isSubAccountSession, setIsSubAccountSession] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [forecasts, setForecasts] = useState<ForecastFile[]>([]);
    const [loadingForecasts, setLoadingForecasts] = useState(true);
    const [uploading, setUploading] = useState(false);

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalItems, setTotalItems] = useState(0);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setIsSubAccountSession(localStorage.getItem("isSubAccount") === "true");
        }
    }, []);

    useEffect(() => {
        if (status === "unauthenticated") {
            redirectToLogin(router);
            return;
        }

        if (status === "authenticated" && token) {
            dispatch(fetchCustomerInfo());
            pullForecasts(currentPage, pageSize);
        }
    }, [status, token, dispatch, router, currentPage, pageSize]);

    const [downloadingId, setDownloadingId] = useState<string | number | null>(null);

    const pullForecasts = async (page: number, size: number) => {
        try {
            setLoadingForecasts(true);
            const response = await fetch(`/api/kleverapi/forecast?pageSize=${size}&currentPage=${page}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data: ForecastResponse = await response.json();
                const items = data.items || (Array.isArray(data) ? data : []);
                const total = data.total_count || items.length;
                setForecasts(items);
                setTotalItems(total);
            }
        } catch (err) {
            console.error("[Forecast List Error]:", err);
        } finally {
            setLoadingForecasts(false);
        }
    };

    const handleDownload = async (file: ForecastFile) => {
        const id = file.forecast_id || file.entity_id || file.id || file.file_id;
        const name = file.file_name || "forecast_file";
        const fileUrl = file.file_url;

        if (!id) {
            console.warn("[Forecast] Missing ID in file object:", file);
            alert(t("forecast.missingId"));
            return;
        }

        try {
            setDownloadingId(id);
            let proxyUrl = `/api/kleverapi/forecast/file/${id}?file_name=${encodeURIComponent(name)}`;

            if (fileUrl) {
                proxyUrl += `&url=${encodeURIComponent(fileUrl)}`;
            }

            const response = await fetch(proxyUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || t("forecast.downloadError"));
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            console.error("[Forecast Download Error]:", err);
            alert(err.message || t("forecast.downloadError"));
        } finally {
            setDownloadingId(null);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            alert(t("forecast.selectFile"));
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch('/api/kleverapi/forecast', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                alert(t("forecast.uploadSuccess"));
                setSelectedFile(null);
                pullForecasts(currentPage, pageSize);
            } else {
                alert(t("forecast.uploadFailed"));
            }
        } catch (err) {
            console.error("[Forecast Upload Error]:", err);
            alert(t("forecast.uploadError"));
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const getProperDate = (file: any) => {
        const rawDate = file.uploaded_date || file.created_at || file.uploaded_at ||
            file.date || file.upload_date || file.updated_at ||
            file.creation_time || file.createdDate;

        const locale = 'en-US';
        const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };

        if (rawDate) {
            try {
                const parsedDate = new Date(rawDate.replace(' ', 'T'));
                if (!isNaN(parsedDate.getTime())) {
                    return parsedDate.toLocaleDateString(locale, options);
                }
                return rawDate;
            } catch (e) {
                return rawDate;
            }
        }

        return new Date().toLocaleDateString(locale, options);
    };

    if (loading || loadingForecasts) {
        return (
            <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
                <div className="flex flex-col lg:flex-row flex-1 w-full">
                    <SidebarSkeleton />
                    <main className="flex-1 min-w-0"><ForecastSkeleton /></main>
                </div>
            </div>
        );
    }

    if (!customer) return null;

    return (
        <div className="flex flex-col lg:flex-row min-h-screen">
            <Sidebar />

            <main className="flex-1 px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-surface min-h-screen" dir={isRtl ? "rtl" : "ltr"}>
                {/* Header with Refresh */}
                <div className="flex justify-between items-center mb-5">
                    <h1 className="text-h3 md:text-h1-sm font-semibold text-black uppercase tracking-tight">
                        {t("forecast.title")}
                    </h1>
                    <button
                        onClick={() => pullForecasts(currentPage, pageSize)}
                        className="bg-white border border-[#ddd] text-label md:text-body-sm font-semibold px-3 md:px-4 py-1.5 uppercase hover:bg-gray-100 transition-all flex items-center gap-2 text-black"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
                        {t("forecast.refresh")}
                    </button>
                </div>

                {/* Section: Upload */}
                <h2 className="text-body-lg md:text-h3-sm font-bold text-black uppercase mb-1.5 md:mb-3">
                    {t("forecast.uploadForecast")}
                </h2>

                <div className="bg-white border border-[#ddd] rounded-sm mb-6 overflow-hidden">
                    <div className="p-3 md:p-4">
                        <div className="border border-dashed border-[#ccc] rounded-sm bg-[#fcfcfc] px-4 py-4 md:py-6 flex flex-col items-center gap-3 md:gap-4">
                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                                <span className="text-body md:text-body-lg font-semibold text-black">{t("forecast.dropFiles")}</span>
                                <input
                                    type="file"
                                    id="file-upload"
                                    className="hidden"
                                    accept=".jpg,.jpeg,.png,.zip,.rar,.docx,.doc,.pdf,.xls,.xlsx,.csv,.msg"
                                    onChange={handleFileChange}
                                />
                                <label
                                    htmlFor="file-upload"
                                    className="bg-white border border-[#ddd] px-4 py-1.5 text-body-sm md:text-body font-semibold text-black cursor-pointer hover:bg-gray-50 transition-colors rounded-xs"
                                >
                                    {t("forecast.chooseFile")}
                                </label>
                            </div>
                            {selectedFile && (
                                <span className="text-body-sm md:text-body text-black font-semibold truncate max-w-full">
                                    {selectedFile.name}
                                </span>
                            )}
                            <div className="text-center">
                                <span className="text-label md:text-body-sm font-semibold text-[#888] leading-relaxed">
                                    {t("forecast.allowedFileTypes")}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className={`bg-white px-3 md:px-4 pb-3 md:pb-4 flex justify-center ${isRtl ? 'md:justify-start' : 'md:justify-end'}`}>
                        <button
                            onClick={handleUpload}
                            disabled={uploading}
                            className="w-full sm:w-auto bg-brand-yellow text-black text-body-sm md:text-body font-semibold px-6 md:px-8 py-2 uppercase tracking-wider hover:bg-black hover:text-white transition-all disabled:opacity-50"
                        >
                            {uploading ? t("forecast.uploading") : t("forecast.submit")}
                        </button>
                    </div>
                </div>

                {/* Desktop and Mobile Table Header & List */}
                <div className="overflow-x-auto border border-[#ddd] rounded-sm">
                    <table className="w-full text-body text-left border-collapse">
                        <thead>
                            <tr className="bg-brand-yellow text-black text-label uppercase font-bold tracking-widest h-10">
                                <th className="px-4 py-2 border border-[#ddd] ltr:text-left rtl:text-right">{t("forecast.fileName")}</th>
                                <th className="px-4 py-2 border border-[#ddd] text-center w-[150px] sm:w-[200px]">{t("forecast.uploadedDate")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {forecasts.length > 0 ? forecasts.map((file, idx) => {
                                const fileId = file.forecast_id || file.entity_id || file.id || file.file_id;
                                return (
                                    <tr key={fileId || idx} className="hover:bg-brand-yellow/5 group transition-colors">
                                        <td className="px-4 py-1.5 border-r border-gray-200 text-black text-body-lg font-bold">
                                            <button
                                                onClick={() => handleDownload(file)}
                                                disabled={downloadingId !== null && downloadingId === fileId}
                                                className="text-body text-black font-semibold hover:underline ltr:text-left rtl:text-right disabled:opacity-50 break-all"
                                            >
                                                {file.file_name || file.filename || file.name || t("m.name")}
                                            </button>
                                        </td>
                                        <td className="px-4 py-1.5 text-center text-black text-body font-semibold">
                                            {getProperDate(file)}
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={2} className="py-16 md:py-20 text-center text-gray-400 text-body md:text-body-lg bg-white italic">
                                        {t("forecast.noRecords")}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="bg-surface-muted mt-5 py-3 px-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-black border border-[#ddd] rounded-sm">
                    <div className="flex items-center gap-4 sm:gap-6">
                        <span className="text-label md:text-body-sm font-semibold">{totalItems} {t("forecast.items")}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-label md:text-body-sm font-semibold">{t("forecast.show")}</span>
                            <PortalDropdown
                                value={String(pageSize)}
                                onChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
                                options={[{ label: "10", value: "10" }, { label: "20", value: "20" }, { label: "50", value: "50" }]}
                                minWidth={55}
                            />
                            <span className="text-label md:text-body-sm font-semibold">{t("forecast.perPage")}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-3 sm:px-4 py-1.5 bg-white border border-[#ddd] text-label md:text-body-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-all rounded-sm"
                        >
                            {t("forecast.prev")}
                        </button>
                        <span className="text-label md:text-body-sm font-semibold text-black text-center uppercase tracking-tight">
                            {t("forecast.page")} {currentPage}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            disabled={forecasts.length < pageSize}
                            className="px-3 sm:px-4 py-1.5 bg-white border border-[#ddd] text-label md:text-body-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-all rounded-sm"
                        >
                            {t("forecast.next")}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
