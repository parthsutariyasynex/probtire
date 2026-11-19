"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { redirectToLogin } from "@/utils/helpers";
import Price from "@/app/components/Price";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { toast } from "react-hot-toast";
import { useCart } from "@/modules/cart/context/CartContext";
import { OrderDetailSkeleton } from "@/components/skeletons";
import { useMagentoLabel } from "@/hooks/useMagentoLabel";
import { useCountryNames } from "@/hooks/useCountryNames";

export default function OrderDetailsPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const { t, locale } = useTranslation();

    const lp = useLocalePath();
    const { orderId } = useParams();
    const { refetchCart } = useCart();
    // Labels Magento itself translates for this store view ("" until loaded / when Magento has none).
    const magentoSubtotalLabel = useMagentoLabel("Subtotal", "");
    const magentoTaxLabel = useMagentoLabel("Tax", "");
    const countryName = useCountryNames();
    const [activeTab, setActiveTab] = useState<"items" | "invoices">("items");

    const [order, setOrder] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<any[]>([]);
    const [isAttachmentsLoading, setIsAttachmentsLoading] = useState(false);
    const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [confirmComment, setConfirmComment] = useState("");
    // Files picked in Magento's "Order Check" form (Magento's input takes several: attachment[]).
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isConfirmed, setIsConfirmed] = useState(false);
    const permissionDeniedRef = React.useRef(false);

    const authToken = (session as any)?.accessToken;
    const isSalesPerson = useMemo(() => Number((session as any)?.utypid) === 3, [session]);
    const [isMultiCompany, setIsMultiCompany] = useState(false);
    const [isSubOrMasterCompany, setIsSubOrMasterCompany] = useState(false);
    useEffect(() => {
        if (!authToken) { setIsMultiCompany(false); setIsSubOrMasterCompany(false); return; }
        if (typeof sessionStorage === "undefined") return;
        const ROLE_CACHE = "altalayi_user_type_v1";
        const TOKEN_CACHE = "altalayi_role_token_v1";
        if (sessionStorage.getItem(TOKEN_CACHE) === authToken) {
            const cached = sessionStorage.getItem(ROLE_CACHE) || "Customer";
            setIsMultiCompany(cached === "Multiple Company User");
            setIsSubOrMasterCompany(cached === "Company Sub Account" || cached === "Master Company");
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
        }).catch(() => { });
    }, [authToken]);
    const shouldHideCartActions = (isSalesPerson || isMultiCompany) && !isSubOrMasterCompany;

    // Auth Guard
    useEffect(() => {
        if (authStatus === "unauthenticated") {
            redirectToLogin(router);
        }
    }, [authStatus, router]);

    // API Call
    const fetchOrderDetails = useCallback(async () => {
        const token = (session as any)?.accessToken;
        if (!token || !orderId) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/kleverapi/order/${orderId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": locale,
                },
            });

            if (response.status === 403) {
                if (!permissionDeniedRef.current) {
                    permissionDeniedRef.current = true;
                    toast.error(t("orderDetails.noPermission"));
                    router.replace(lp("/my-orders"));
                }
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to fetch order details");
            }

            const data = await response.json();
            setOrder(data);
        } catch (err: any) {
            setError(err.message || "Something went wrong while fetching order details");
        } finally {
            setIsLoading(false);
        }
    }, [session, orderId]);

    const fetchAttachments = useCallback(async () => {
        const token = (session as any)?.accessToken;
        if (!token || !orderId) return;

        setIsAttachmentsLoading(true);
        setAttachmentsError(null);

        try {
            const response = await fetch(`/api/kleverapi/order/${orderId}/attachments`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": locale,
                },
            });


            const data = await response.json();

            if (!response.ok) {
                // If it's 404, we might just want to show "No attachments available" instead of an error message
                if (response.status === 404) {
                    setAttachments([]);
                    return;
                }
                throw new Error(data.message || "Failed to fetch order attachments");
            }

            const attachmentsList = Array.isArray(data)
                ? data
                : (data?.attachments || data?.items || []);

            setAttachments(attachmentsList);
        } catch (err: any) {
            console.error("Attachment Fetch Error:", err);
            setAttachmentsError(err.message || "Something went wrong while fetching order attachments");
        } finally {
            setIsAttachmentsLoading(false);
        }
    }, [session, orderId]);

    useEffect(() => {
        if (authStatus === "authenticated") {
            fetchOrderDetails();
        }
    }, [authStatus, fetchOrderDetails]);

    useEffect(() => {
        if (order) {
            fetchAttachments();
        }
    }, [order, fetchAttachments]);

    const handlePrintOrder = async () => {
        const token = (session as any)?.accessToken;
        if (!token || !orderId) {
            toast.error(t("orders.sessionNotFound") || "User session not found. Please log in again.");
            return;
        }

        setIsPrinting(true);
        const toastId = toast.loading(t("orderDetails.preparingPdf"));

        try {
            const response = await fetch(`/api/kleverapi/order/${orderId}/pdf`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": locale,
                },
            });


            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || "Failed to fetch order PDF");
            }

            const data = await response.json();

            // Handle base64 from response - checking common field names
            const base64Content = data.pdf_base64 || data.content || data.base64;
            const fileName = data.filename || `Order_${order?.increment_id || orderId}.pdf`;

            if (!base64Content) {
                throw new Error("No PDF content received from server.");
            }

            // Convert base64 → Blob
            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/pdf" });

            // Use URL.createObjectURL
            const url = window.URL.createObjectURL(blob);

            // Trigger download with <a> tag
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();

            // Cleanup
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success(t("orderDetails.downloadSuccess"), { id: toastId });
        } catch (err: any) {
            console.error("Print Error:", err);
            toast.error((typeof err === "string" ? err : err?.message) || t("orderDetails.downloadFailed"), { id: toastId });
        } finally {
            setIsPrinting(false);
        }
    };

    const handleReorder = async () => {
        const token = (session as any)?.accessToken;
        if (!token) {
            toast.error(t("orders.mustLoggedIn"));
            return;
        }

        const toastId = toast.loading(t("quickOrder.addingToCart"));
        try {
            // reorderItems(orderNumber: String!) needs the order NUMBER (increment_id, e.g. "BT…"),
            // not the entity_id / base64 GraphQL id.
            const orderNumber = order?.increment_id || order?.order_number;
            const res = await fetch(`/api/kleverapi/order/${encodeURIComponent(orderNumber)}/reorder`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": locale
                },
            });


            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to reorder");

            await refetchCart();
            toast.success(t("orders.addedToCart"), { id: toastId });
            router.push(lp("/checkout/cart"));
        } catch (err: any) {
            toast.error((typeof err === "string" ? err : err?.message) || t("common.failed"), { id: toastId });
        }
    };

    const handleCancelOrder = async () => {
        const token = (session as any)?.accessToken;
        if (!token) {
            toast.error(t("orders.mustLoggedIn"));
            return;
        }

        const confirmCancel = window.confirm(t("orderDetails.confirmCancel") || "Are you sure you want to cancel this order?");
        if (!confirmCancel) return;

        setIsCancelling(true);
        const toastId = toast.loading(t("orderDetails.cancelling") || "Cancelling order...");
        try {
            const orderIdStr = (Array.isArray(orderId) ? orderId[0] : orderId) || "";
            const res = await fetch(`/api/kleverapi/order/${encodeURIComponent(orderIdStr)}/cancel`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": locale
                },
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to cancel order");
            }

            toast.success(data.message || t("orderDetails.cancelSuccess") || "Order cancelled successfully!", { id: toastId });
            // Refresh page to reflect status change
            window.location.reload();
        } catch (err: any) {
            toast.error((err.message || t("orderDetails.cancelFailed")) || "Failed to cancel order", { id: toastId });
        } finally {
            setIsCancelling(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (picked.length === 0) return;
        // The file types Magento's form lists ("Allowed file types: …").
        const allowedExts: string[] = order?.extra_info?.order_check?.allowedExtensions ?? [];
        const accepted: File[] = [];
        for (const file of picked) {
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (allowedExts.length > 0 && (!ext || !allowedExts.includes(ext))) {
                toast.error(t("orderDetails.invalidFileType") || "Invalid file type");
                continue;
            }
            if (file.size > 10 * 1024 * 1024) {
                toast.error(t("orderDetails.fileTooLarge") || "File size must be less than 10MB");
                continue;
            }
            accepted.push(file);
        }
        if (accepted.length === 0) return;
        const multiple = order?.extra_info?.order_check?.multiple !== false;
        setSelectedFiles((prev) => (multiple ? [...prev, ...accepted] : accepted.slice(0, 1)));
    };

    const handleConfirmOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = (session as any)?.accessToken;
        if (!token) {
            toast.error(t("orders.mustLoggedIn"));
            return;
        }

        setIsConfirming(true);
        const toastId = toast.loading(t("orderDetails.confirming"));
        try {
            const attachmentsPayload: any[] = [];
            for (const file of selectedFiles) {
                const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => {
                        const base64 = (reader.result as string).split(",")[1];
                        resolve(base64);
                    };
                    reader.onerror = (error) => reject(error);
                });

                attachmentsPayload.push({
                    file_name: file.name,
                    file_content: base64Data
                });
            }

            const res = await fetch(`/api/kleverapi/order/${orderId}/confirm`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": locale,
                },
                body: JSON.stringify({
                    comment: confirmComment,
                    attachments: attachmentsPayload
                })
            });

            const data = await res.json().catch(() => null);
            if (!res.ok || data?.success !== true) {
                // Magento's own message when it refuses.
                throw new Error(data?.message || t("orderDetails.confirmFailed"));
            }

            toast.success(data?.message || t("orderDetails.confirmSuccess"), { id: toastId });
            setIsConfirmed(true);
            setSelectedFiles([]);
            setConfirmComment("");

            // Refresh order info and attachments list
            fetchOrderDetails();
            fetchAttachments();
        } catch (err: any) {
            console.error("Order confirmation error:", err);
            toast.error(err.message || t("orderDetails.confirmFailed"), { id: toastId });
        } finally {
            setIsConfirming(false);
        }
    };

    const handleOpenAttachment = async (attachment: any) => {
        const token = (session as any)?.accessToken;
        if (!token) {
            toast.error(t("orderAttachments.unableToOpen"));
            return;
        }

        const attachmentId = attachment.attachment_id || attachment.id;
        setOpeningAttachmentId(attachmentId);

        try {
            const fileUrl = attachment.file_url || "";
            const proxyUrl = `/api/kleverapi/order-attachments/file/${attachmentId}?url=${encodeURIComponent(fileUrl)}`;

            const response = await fetch(proxyUrl, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": locale
                },
            });


            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `Failed to fetch file (${response.status})`);
            }

            const contentType = response.headers.get("content-type") || "application/octet-stream";
            const blob = await response.blob();

            if (blob.size === 0) {
                throw new Error("File is empty");
            }

            const blobUrl = URL.createObjectURL(new Blob([blob], { type: contentType }));
            const link = document.createElement("a");
            link.href = blobUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err: any) {
            console.error("Attachment open error:", err);
            toast.error((typeof err === "string" ? err : err?.message) || t("orderAttachments.unableToOpen"));
        } finally {
            setOpeningAttachmentId(null);
        }
    };

    // Helpers
    const formatStatus = (status: string) => {
        if (!status) return "";
        return status;
    };


    const formatDate = (dateString: string) => {
        if (!dateString) return "-";
        const dateObj = new Date(dateString);
        return dateObj.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    const translateDynamic = (val: string) => {
        if (!val) return "";
        // Try direct key first
        let translated = t(val);
        if (translated !== val) return translated;

        // Try with data. prefix
        const dataKey = `data.${val}`;
        translated = t(dataKey);
        if (translated !== dataKey) return translated;

        return val;
    };




    const formatCurrency = (amount: number | string | undefined | null) => {
        return <Price amount={amount} />;
    };

    if (authStatus === "loading" || (isLoading && !order)) {
        return (
            <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
                <div className="flex flex-col lg:flex-row flex-1 w-full">
                    <Sidebar />
                    <main className="flex-1 min-w-0">
                        <OrderDetailSkeleton />
                    </main>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
                <div className="flex flex-col lg:flex-row flex-1 w-full">
                    <Sidebar />
                    <main className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white">
                        <div className="bg-red-50 border border-red-100 text-red-600 p-4 md:p-8 rounded-lg text-center shadow-sm">
                            <p className="font-bold text-body-lg uppercase tracking-widest mb-2">{t("orderDetails.errorLoading")}</p>

                            <p className="text-xs">{error}</p>
                            <button
                                onClick={fetchOrderDetails}
                                className="mt-6 px-6 md:px-8 py-2.5 bg-red-600 text-white rounded-md font-black text-caption uppercase tracking-widest hover:bg-red-700 transition-all active:scale-95 w-full sm:w-auto"
                            >
                                {t("orderDetails.tryAgain")}

                            </button>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    if (!order) return null;

    const shippingAddress = order.extension_attributes?.shipping_assignments?.[0]?.shipping?.address || order.shipping_address;
    const billingAddress = order.billing_address;
    const paymentMethod = order.payment?.additional_information?.[0] || order.payment?.method || "N/A";
    const statusLower = order.status?.toLowerCase() || "";
    const isCancelable = statusLower.includes("pending") || statusLower.includes("holded");
    // Reorder: Magento's own available_actions for this order (plus the account-type rule).
    const canReorder = !shouldHideCartActions
        && (!Array.isArray(order.available_actions) || order.available_actions.includes("REORDER"));
    const invoices: any[] = Array.isArray(order.invoices) ? order.invoices : [];
    const comments: any[] = Array.isArray(order.comments) ? order.comments : [];
    // Tax row title: Magento's storefront translation of "Tax", else the order's own tax title.
    const taxLabel = magentoTaxLabel
        || (order.totals?.tax_label ? String(order.totals.tax_label).replace(/(\d+)\.0+%/, "$1%") : "")
        || t("orderDetails.vat");
    const subtotalLabel = magentoSubtotalLabel || t("orderDetails.itemsTotal");
    const shippingAmount = Number(order.shipping_amount) || 0;
    const discountAmount = Number(order.discount_amount) || 0;
    // Magento's address line: "City, Region, Postcode"
    const cityLine = (a: any) => [a?.city, a?.region, a?.postcode].filter((v) => v != null && String(v).trim() !== "").join(", ");
    // "Order Check" — shown exactly when Magento's own order page shows its Order Check form to
    // this login (e.g. a Sales Person on an order waiting for the check); texts are Magento's.
    const orderCheck = order.extra_info?.order_check ?? null;
    const isCheckPending = !!orderCheck;
    // Magento's "Order Comment" box (Order Information).
    const orderComment = order.extra_info?.order_comment ?? null;

    return (
        <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
            <div className="flex flex-col lg:flex-row flex-1 w-full">
                {/* Left Sidebar */}
                <Sidebar />

                {/* Right Content */}
                <main className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white min-w-0 text-xs">
                    {/* Header Section */}
                    <div className="flex flex-col mb-10">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-10 border-b-2 border-brand-yellow pb-2 gap-2 sm:gap-0">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                                <h1 className="text-h3 md:text-[26px] font-bold text-black uppercase tracking-tight">
                                    {t("orderDetails.orderHash")} {order.increment_id}
                                </h1>

                                <span className={`inline-flex px-3 py-1 rounded-full text-caption font-black uppercase tracking-widest ${order.status?.toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-700' :
                                    order.status?.toLowerCase().includes('complete') ? 'bg-green-100 text-green-700' :
                                        order.status?.toLowerCase().includes('cancel') ? 'bg-red-100 text-red-700' :
                                            'bg-gray-100 text-gray-700'
                                    }`}>
                                    {order.status_label || formatStatus(order.status)}
                                </span>
                            </div>
                            <div className="text-gray-500 font-bold uppercase tracking-widest text-label">
                                {t("orderDetails.orderDate")} {order.order_date_label || formatDate(order.created_at)}
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-start items-stretch sm:items-center gap-3 w-full">
                            {canReorder && (
                                <button
                                    onClick={handleReorder}
                                    className="bg-brand-yellow hover:bg-brand-yellow-dark text-black font-black py-2.5 px-6 md:px-8 rounded-sm text-label uppercase tracking-widest transition-all shadow-sm active:scale-95 border border-brand-yellow-dark w-full sm:w-auto"
                                >
                                    {t("orderDetails.reorder")}
                                </button>
                            )}

                            {isCancelable && (
                                <button
                                    onClick={handleCancelOrder}
                                    disabled={isCancelling}
                                    className={`bg-brand-yellow hover:bg-brand-yellow-dark text-black font-black py-2.5 px-6 md:px-8 rounded-sm text-label uppercase tracking-widest transition-all shadow-sm active:scale-95 border border-brand-yellow-dark w-full sm:w-auto ${isCancelling ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {isCancelling ? t("orderDetails.cancelling") : t("orderDetails.cancelOrder")}
                                </button>
                            )}

                            <button
                                onClick={handlePrintOrder}
                                disabled={isPrinting}
                                className={`bg-brand-yellow hover:bg-brand-yellow-dark text-black font-black py-2.5 px-6 md:px-8 rounded-md text-label uppercase tracking-widest transition-all border border-brand-yellow-dark shadow-sm flex items-center justify-center gap-2 no-print active:scale-95 w-full sm:w-auto ${isPrinting ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                {isPrinting ? (
                                    <span>{t("common.loading")}</span>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                        <rect x="6" y="14" width="12" height="8"></rect>
                                    </svg>
                                )}
                                {isPrinting ? t("orderDetails.printing") : t("orderDetails.printOrder")}
                            </button>
                        </div>
                    </div>

                    {/* Order Check Section — Magento's own form (#confirm-order-form) and texts */}
                    {isCheckPending && !isConfirmed && (
                        <div className="mb-10 no-print">
                            {orderCheck.title && (
                                <div className="border-b border-[#ccc] pb-2 mb-6">
                                    <h2 className="text-h3-sm md:text-subheading font-black text-black uppercase tracking-tight">
                                        {orderCheck.title}
                                    </h2>
                                </div>
                            )}
                            <form onSubmit={handleConfirmOrder} className="space-y-6">
                                <div className="space-y-2">
                                    {orderCheck.attachmentLabel && (
                                        <span className="block text-body font-bold text-black">{orderCheck.attachmentLabel}</span>
                                    )}
                                    <label className="flex flex-col items-center justify-center gap-1 px-4 py-6 border-2 border-dashed border-[#888] bg-[#ebebeb] text-center cursor-pointer hover:bg-[#e2e2e2] transition-colors">
                                        {orderCheck.fileTitle && <span className="text-body-lg text-black">{orderCheck.fileTitle}</span>}
                                        {orderCheck.allowedText && <span className="text-body text-black">{orderCheck.allowedText}</span>}
                                        <input
                                            type="file"
                                            className="hidden"
                                            multiple={orderCheck.multiple}
                                            onChange={handleFileChange}
                                            accept={orderCheck.allowedExtensions.length > 0 ? orderCheck.allowedExtensions.map((e: string) => `.${e}`).join(",") : undefined}
                                        />
                                    </label>
                                    {selectedFiles.length > 0 && (
                                        <ul className="space-y-1">
                                            {selectedFiles.map((file, i) => (
                                                <li key={`${file.name}-${i}`} className="flex items-center gap-2 text-body text-black bg-gray-50 px-3 py-2 border border-subtle">
                                                    <span className="truncate font-medium"><bdi>{file.name}</bdi></span>
                                                    <span className="text-gray-500" dir="ltr">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedFiles((prev) => prev.filter((_, j) => j !== i))}
                                                        className="ms-auto text-gray-400 hover:text-red-500 p-1 cursor-pointer"
                                                        aria-label="×"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {orderCheck.commentLabel && (
                                        <label htmlFor="order-check-comment" className="block text-body font-bold text-black">
                                            {orderCheck.commentLabel}
                                        </label>
                                    )}
                                    <textarea
                                        id="order-check-comment"
                                        rows={orderCheck.commentRows ?? undefined}
                                        value={confirmComment}
                                        onChange={(e) => setConfirmComment(e.target.value)}
                                        className="w-full border border-[#ccc] p-3 text-body focus:ring-1 focus:ring-brand-yellow focus:border-brand-yellow outline-none transition-all text-black"
                                    />
                                </div>

                                {orderCheck.button && (
                                    <div>
                                        <button
                                            type="submit"
                                            disabled={isConfirming}
                                            className={`bg-brand-yellow hover:bg-brand-yellow-dark text-black font-black py-2.5 px-6 md:px-8 rounded-sm text-label uppercase tracking-widest transition-all border border-brand-yellow-dark shadow-sm inline-flex items-center justify-center gap-2 active:scale-95 cursor-pointer ${isConfirming ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        >
                                            {isConfirming && (
                                                <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            )}
                                            {orderCheck.button}
                                        </button>
                                    </div>
                                )}
                            </form>
                        </div>
                    )}

                    {/* About Your Order — Magento's order comments (shown only when Magento has any) */}
                    {comments.length > 0 && (
                        <div className="mb-10">
                            <div className="border-b-2 border-brand-yellow inline-block pb-1 mb-6">
                                <h2 className="text-h3-sm md:text-subheading font-black text-black uppercase tracking-tight">
                                    {t("orderDetails.aboutYourOrder")}
                                </h2>
                            </div>
                            <div className="space-y-3 text-xs">
                                {comments.map((c: any, i: number) => (
                                    <div key={i} className="border border-subtle rounded-md p-4">
                                        {c.timestamp && <p className="text-gray-500 font-bold mb-1">{c.timestamp}</p>}
                                        <p className="text-black">{c.message}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                
                    
                    {/* Items Ordered Table */}
                    <div className="bg-white rounded-md border border-subtle overflow-hidden mb-10 shadow-sm">
                        <div className="border-b border-subtle px-3 md:px-6 bg-gray-50 flex gap-6">
                            {(["items", ...(invoices.length > 0 ? ["invoices"] : [])] as ("items" | "invoices")[]).map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setActiveTab(tab)}
                                    className={`py-3 md:py-4 text-xs font-black uppercase tracking-widest border-b-2 -mb-px cursor-pointer ${activeTab === tab ? "border-brand-yellow text-black" : "border-transparent text-gray-500 hover:text-black"}`}
                                >
                                    {tab === "items" ? t("orderDetails.itemsOrdered") : t("orderDetails.invoices")}
                                </button>
                            ))}
                        </div>
                        {activeTab === "invoices" && invoices.length > 0 ? (
                            <div className="divide-y divide-subtle">
                                {invoices.map((inv: any) => (
                                    <div key={inv.id || inv.number} className="p-3 md:p-6">
                                        <h3 className="text-xs font-black text-black uppercase tracking-widest mb-4">
                                            {t("orderDetails.invoiceHash")} {inv.number}
                                        </h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left min-w-[500px]">
                                                <thead className="bg-gray-50/50 text-label font-black text-black uppercase border-b border-subtle">
                                                    <tr>
                                                        <th className="px-3 md:px-6 py-3 tracking-widest">{t("orderDetails.productName")}</th>
                                                        <th className="px-3 md:px-6 py-3 tracking-widest text-center">{t("orderDetails.sku")}</th>
                                                        <th className="px-3 md:px-6 py-3 tracking-widest text-center">{t("orderDetails.price")}</th>
                                                        <th className="px-3 md:px-6 py-3 tracking-widest text-center">{t("orderDetails.qtyInvoiced")}</th>
                                                        <th className="px-3 md:px-6 py-3 tracking-widest text-end">{subtotalLabel}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-subtle">
                                                    {(inv.items || []).map((it: any) => (
                                                        <tr key={it.id} className="text-xs">
                                                            <td className="px-3 md:px-6 py-3 text-black font-bold">{it.product_name}</td>
                                                            <td className="px-3 md:px-6 py-3 text-center font-bold">{it.product_sku}</td>
                                                            <td className="px-3 md:px-6 py-3 text-center font-bold">{formatCurrency(it.product_sale_price?.value)}</td>
                                                            <td className="px-3 md:px-6 py-3 text-center font-bold">{Math.round(Number(it.quantity_invoiced) || 0)}</td>
                                                            <td className="px-3 md:px-6 py-3 text-end font-black text-black">{formatCurrency((Number(it.product_sale_price?.value) || 0) * (Number(it.quantity_invoiced) || 0))}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="flex justify-end pt-4">
                                            <div className="w-full max-w-[340px] space-y-3 text-xs">
                                                <div className="flex justify-between"><span className="font-bold uppercase tracking-widest flex-1 text-end me-10">{subtotalLabel}</span><span className="font-black w-[110px] text-end">{formatCurrency(inv.total?.subtotal?.value)}</span></div>
                                                <div className="flex justify-between"><span className="font-bold uppercase tracking-widest flex-1 text-end me-10">{t("orderDetails.shippingHandling")}</span><span className="font-black w-[110px] text-end">{formatCurrency(inv.total?.total_shipping?.value)}</span></div>
                                                {(inv.total?.discounts || []).map((d: any, i: number) => (
                                                    <div key={i} className="flex justify-between"><span className="font-bold uppercase tracking-widest flex-1 text-end me-10">{d.label || t("orderDetails.discount")}</span><span className="font-black w-[110px] text-end">-{formatCurrency(Math.abs(Number(d.amount?.value) || 0))}</span></div>
                                                ))}
                                                <div className="flex justify-between"><span className="font-bold uppercase tracking-widest flex-1 text-end me-10">{taxLabel}</span><span className="font-black w-[110px] text-end">{formatCurrency(inv.total?.total_tax?.value)}</span></div>
                                                <div className="flex justify-between pt-3 border-t border-gray-200 text-body-xl"><span className="font-black uppercase flex-1 text-end me-10">{t("orderDetails.grandTotal")}</span><span className="font-black w-[110px] text-end">{formatCurrency(inv.total?.grand_total?.value)}</span></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (<>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left min-w-[500px]">
                                <thead className="bg-gray-50/50 text-label font-black text-black uppercase border-b border-subtle">
                                    <tr>
                                        <th className="px-3 md:px-6 py-3 md:py-4 tracking-widest">{t("orderDetails.productName")}</th>
                                        <th className="px-3 md:px-6 py-3 md:py-4 tracking-widest text-center">{t("orderDetails.sku")}</th>
                                        <th className="px-3 md:px-6 py-3 md:py-4 tracking-widest text-center">{t("orderDetails.price")}</th>
                                        <th className="px-3 md:px-6 py-3 md:py-4 tracking-widest text-center">{t("orderDetails.qty")}</th>
                                        <th className="px-3 md:px-6 py-3 md:py-4 tracking-widest text-end">{subtotalLabel}</th>

                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-subtle">
                                    {order.items?.map((item: any, idx: number) => (
                                        <tr key={item.item_id || item.id} className={`text-xs hover:bg-brand-yellow/5 transition-colors ${idx % 2 !== 0 ? 'bg-gray-50' : 'bg-white'}`}>
                                            <td className="px-3 md:px-6 py-3 md:py-5 text-black font-bold">
                                                {item.name}
                                            </td>
                                            <td className="px-3 md:px-6 py-3 md:py-5 text-black-400 font-bold text-center">
                                                {item.sku}
                                            </td>
                                            <td className="px-3 md:px-6 py-3 md:py-5 text-black font-bold text-center">
                                                {formatCurrency(item.price)}
                                            </td>
                                            <td className="px-3 md:px-6 py-3 md:py-5 text-center text-black-500 font-bold">
                                                {t("orderDetails.ordered")} {Math.round(item.qty_ordered)}
                                            </td>
                                            <td className="px-3 md:px-6 py-3 md:py-5 text-end font-black text-black">

                                                {formatCurrency(item.row_total)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden divide-y divide-subtle">
                            {order.items?.map((item: any, idx: number) => (
                                <div key={item.item_id || item.id} className={`p-4 text-xs ${idx % 2 !== 0 ? 'bg-gray-50' : 'bg-white'}`}>
                                    <p className="text-black font-black text-sm mb-2">{item.name}</p>
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-caption mb-3">{t("orderDetails.sku")}: {item.sku}</p>

                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-500 font-bold uppercase tracking-widest">{t("orderDetails.price")}</span>

                                        <span className="text-black font-bold">{formatCurrency(item.price)}</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-500 font-bold uppercase tracking-widest">{t("orderDetails.qty")}</span>

                                        <span className="text-gray-500 font-bold">{t("orderDetails.ordered")} {Math.round(item.qty_ordered)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                        <span className="text-black font-black uppercase tracking-widest">{subtotalLabel}</span>

                                        <span className="text-black font-black">{formatCurrency(item.row_total)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Order Summary */}
                        <div className="flex justify-end p-4 md:p-8 bg-gray-50/30 border-t border-subtle">
                            <div className="w-full max-w-[340px] space-y-3">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-black-400 font-bold uppercase tracking-widest flex-1 text-end me-10">{subtotalLabel}</span>


                                    <span className="font-black text-black w-[110px] text-end">

                                        {formatCurrency(order.subtotal)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-black-400 font-bold uppercase tracking-widest flex-1 text-end me-10">{t("orderDetails.shippingHandling")}</span>
                                    <span className="font-black text-black w-[110px] text-end">
                                        {formatCurrency(shippingAmount)}
                                    </span>
                                </div>

                                {discountAmount !== 0 && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-black-400 font-bold uppercase tracking-widest flex-1 text-end me-10">{t("orderDetails.discount")}</span>
                                        <span className="font-black text-black w-[110px] text-end">
                                            -{formatCurrency(Math.abs(discountAmount))}
                                        </span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-black-400 font-bold uppercase tracking-widest flex-1 text-end me-10">{taxLabel}</span>


                                    <span className="font-black text-black w-[110px] text-end">

                                        {formatCurrency(order.tax_amount)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-black pt-4 border-t border-gray-200">
                                    <span className="font-black uppercase tracking-tighter flex-1 text-end me-10 text-body-xl">{t("orderDetails.grandTotal")}</span>
                                    <span className="font-black w-[110px] text-end text-body-xl">

                                        {formatCurrency(order.grand_total)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-label pt-1 pt-4">
                                    <span className="text-black-500 font-black uppercase tracking-widest flex-1 text-end me-10">{t("orderDetails.totalQty")}</span>

                                    <span className="font-black text-black w-[110px] text-end">

                                        {Math.round(order.total_item_count || order.items?.reduce((acc: number, item: any) => acc + (item.qty_ordered || 0), 0))}
                                    </span>
                                </div>
                            </div>
                        </div>
                        </>)}
                    </div>

                    {/* Order Information Section */}
                    <div className="mb-10">
                        <div className="border-b-2 border-brand-yellow inline-block pb-1 mb-10">
                            <h2 className="text-h3-sm md:text-subheading font-black text-black uppercase tracking-tight">
                                {t("orderDetails.orderInfo")}

                            </h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                            {/* Shipping Address */}
                            <div className="bg-white border border-subtle rounded-md shadow-sm overflow-hidden">
                                <div className="bg-gray-50 px-5 py-3 border-b border-subtle">
                                    <h3 className="text-xs font-black text-black uppercase tracking-widest">{t("orderDetails.shippingAddress")}</h3>

                                </div>
                                <div className="p-4 md:p-6 text-xs text-gray-600 leading-relaxed min-h-[140px]">
                                    {shippingAddress ? (
                                        <div className="space-y-1">
                                            <p className="font-black text-black uppercase mb-2" dir="ltr" style={{ unicodeBidi: "isolate" }}>{shippingAddress.firstname} {shippingAddress.lastname}</p>
                                            {shippingAddress.company && <p className="font-medium" dir="ltr" style={{ unicodeBidi: "isolate" }}>{shippingAddress.company}</p>}
                                            <p className="font-medium" dir="ltr" style={{ unicodeBidi: "isolate" }}>{shippingAddress.street?.join(", ")}</p>
                                            <p className="font-medium" dir="ltr" style={{ unicodeBidi: "isolate" }}>{cityLine(shippingAddress)}</p>
                                            <p className="font-medium">{countryName(shippingAddress.country_id)}</p>

                                            <p className="pt-2 text-black font-black" dir="ltr" style={{ unicodeBidi: "isolate" }}>T: <span className="text-gray-600 font-medium">{shippingAddress.telephone}</span></p>
                                        </div>
                                    ) : (
                                        <p className="text-gray-400 italic">{t("orderDetails.noShippingAddress")}</p>

                                    )}
                                </div>
                            </div>

                            {/* Shipping Method */}
                            <div className="bg-white border border-subtle rounded-md shadow-sm overflow-hidden">
                                <div className="bg-gray-50 px-5 py-3 border-b border-subtle">
                                    <h3 className="text-xs font-black text-black uppercase tracking-widest">{t("orderDetails.shippingMethod")}</h3>

                                </div>
                                <div className="p-4 md:p-6 text-xs text-gray-600 leading-relaxed min-h-[140px]">
                                    <p className="font-black text-black uppercase mb-2">{order.shipping_description ? translateDynamic(order.shipping_description) : ""}</p>
                                </div>
                            </div>

                            {/* Billing Address */}
                            <div className="bg-white border border-subtle rounded-md shadow-sm overflow-hidden">
                                <div className="bg-gray-50 px-5 py-3 border-b border-subtle">
                                    <h3 className="text-xs font-black text-black uppercase tracking-widest">{t("orderDetails.billingAddress")}</h3>

                                </div>
                                <div className="p-4 md:p-6 text-xs text-gray-600 leading-relaxed min-h-[140px]">
                                    {billingAddress ? (
                                        <div className="space-y-1">
                                            <p className="font-black text-black uppercase mb-2" dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress.firstname} {billingAddress.lastname}</p>
                                            {billingAddress.company && <p className="font-medium" dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress.company}</p>}
                                            <p className="font-medium" dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress.street?.join(", ")}</p>
                                            <p className="font-medium" dir="ltr" style={{ unicodeBidi: "isolate" }}>{cityLine(billingAddress)}</p>
                                            <p className="font-medium">{countryName(billingAddress.country_id)}</p>

                                            <p className="pt-2 text-black font-black" dir="ltr" style={{ unicodeBidi: "isolate" }}>T: <span className="text-gray-600 font-medium">{billingAddress.telephone}</span></p>
                                        </div>
                                    ) : (
                                        <p className="text-gray-400 italic">{t("orderDetails.noBillingAddress")}</p>

                                    )}
                                </div>
                            </div>

                            {/* Payment Method */}
                            <div className="bg-white border border-subtle rounded-md shadow-sm overflow-hidden">
                                <div className="bg-gray-50 px-5 py-3 border-b border-subtle">
                                    <h3 className="text-xs font-black text-black uppercase tracking-widest">{t("orderDetails.paymentMethod")}</h3>

                                </div>
                                <div className="p-4 md:p-6 text-xs text-gray-600 leading-relaxed min-h-[140px]">
                                    <p className="font-black text-black uppercase mb-1">{translateDynamic(order.payment?.method_title || paymentMethod)}</p>
                                </div>
                            </div>

                            {/* Order Comment — Magento's own box (shown only when Magento shows it) */}
                            {orderComment && (
                                <div className="bg-white border border-subtle rounded-md shadow-sm overflow-hidden">
                                    <div className="bg-gray-50 px-5 py-3 border-b border-subtle">
                                        <h3 className="text-xs font-black text-black uppercase tracking-widest">{orderComment.label}</h3>
                                    </div>
                                    <div className="p-4 md:p-6 text-xs text-black leading-relaxed min-h-[140px] whitespace-pre-line">
                                        <bdi>{orderComment.value}</bdi>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                  

                    {/* Order Attachments Section */}
                    <div className="mb-12">
                        <div className="border-b-2 border-brand-yellow inline-block pb-1 mb-10">
                            <h2 className="text-h3-sm md:text-subheading font-black text-black uppercase tracking-tight">
                                {t("orderDetails.orderAttachments")}

                            </h2>
                        </div>

                        {attachmentsError ? (
                            <div className="bg-red-50 border border-red-100 text-red-600 p-4 md:p-8 rounded-md text-center shadow-sm">
                                <p className="text-xs font-bold uppercase tracking-widest mb-2">{t("orderAttachments.errorLoading")}</p>
                                <p className="text-xs">{attachmentsError}</p>
                            </div>
                        ) : isAttachmentsLoading ? (
                            <div className="bg-white rounded-md border border-subtle p-4 shadow-sm space-y-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2">
                                        <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
                                        <div className="h-3 flex-1 bg-gray-200 rounded animate-pulse" />
                                        <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        ) : attachments.length > 0 ? (
                            <div className="bg-white border border-subtle rounded-md overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs border-collapse">
                                        <thead className="bg-gray-50 border-b border-subtle">
                                            <tr className="h-[50px]">
                                                <th className="px-3 md:px-6 py-3 md:py-4 font-black text-black text-left tracking-widest uppercase">{t("orderDetails.fileName")}</th>
                                                <th className="px-3 md:px-6 py-3 md:py-4 font-black text-black text-center tracking-widest uppercase">{t("orderDetails.documentType")}</th>
                                                <th className="px-3 md:px-6 py-3 md:py-4 font-black text-black text-center tracking-widest uppercase">{t("orderDetails.createdOn")}</th>
                                                <th className="px-3 md:px-6 py-3 md:py-4 font-black text-black text-center tracking-widest uppercase">{t("orderDetails.invoiceDue")}</th>
                                                <th className="px-3 md:px-6 py-3 md:py-4 font-black text-black text-center tracking-widest uppercase">{t("orderDetails.payment")}</th>

                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-subtle">
                                            {attachments.map((attachment: any, idx: number) => {
                                                const formatDateDDMMYYYY = (dateStr: string | undefined | null) => {
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

                                                const currentAttachmentId = attachment.attachment_id || attachment.id || idx;
                                                const isOpening = openingAttachmentId === String(currentAttachmentId);

                                                return (
                                                    <tr key={currentAttachmentId} className={`hover:bg-brand-yellow/5 transition-colors ${idx % 2 !== 0 ? 'bg-gray-50' : 'bg-white'}`}>
                                                        <td className="px-3 md:px-6 py-3 md:py-5 text-left">
                                                            <button
                                                                onClick={() => handleOpenAttachment(attachment)}
                                                                disabled={isOpening}
                                                                className="text-black hover:text-brand-yellow hover:underline underline-offset-4 font-black break-all text-left cursor-pointer inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                                                            >
                                                                {attachment.file_name || "-"}
                                                            </button>
                                                        </td>
                                                        <td className="px-3 md:px-6 py-3 md:py-5 text-center text-black-500 font-bold uppercase">
                                                            {attachment.document_type || attachment.attachment_type || "-"}
                                                        </td>
                                                        <td className="px-3 md:px-6 py-3 md:py-5 text-center text-black-500 font-bold uppercase">
                                                            {formatDateDDMMYYYY(attachment.upload_date)}
                                                        </td>
                                                        <td className="px-3 md:px-6 py-3 md:py-5 text-center text-black-500 font-bold uppercase">
                                                            {attachment.invoice_due ? formatDateDDMMYYYY(attachment.invoice_due) : "-"}
                                                        </td>
                                                        <td className="px-3 md:px-6 py-3 md:py-5 text-center">
                                                            {(() => {
                                                                const paymentStatus = attachment.payment || attachment.payment_status || "";
                                                                if (!paymentStatus || paymentStatus === "-") return "-";

                                                                const statusLower = paymentStatus.toLowerCase();
                                                                const isPaid = statusLower === "paid" || statusLower === "unpaid";
                                                                const isMarkAsPaid = statusLower.includes("mark");

                                                                if (isPaid) {
                                                                    return (
                                                                        <span className="text-black font-semibold text-xs">
                                                                            {t(`data.${paymentStatus}`) !== `data.${paymentStatus}` ? t(`data.${paymentStatus}`) : paymentStatus}
                                                                        </span>
                                                                    );
                                                                } else if (isMarkAsPaid) {
                                                                    return (
                                                                        <span className="text-blue-600 hover:underline font-semibold text-xs cursor-pointer">
                                                                            {t("data.Mark as paid") || "Mark as paid"}
                                                                        </span>
                                                                    );
                                                                }

                                                                return (
                                                                    <span className="text-black font-semibold text-xs">
                                                                        {t(`data.${paymentStatus}`) !== `data.${paymentStatus}` ? t(`data.${paymentStatus}`) : paymentStatus}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border border-subtle p-10 md:p-20 text-center text-gray-400 italic rounded-md shadow-sm text-xs font-bold uppercase tracking-widest">
                                {t("orderDetails.noAttachments")}

                            </div>
                        )}
                    </div>
                </main>
            </div>


            {/* --- Printable Area (Hidden on screen) --- */}
            <div id="printable-order" className="hidden-print-container">
                <div className="printable-header">
                    <div className="comp-info">
                        <p className="font-bold">Btire.com</p>
                        <p>{t("data.Jeddah")}</p>
                        <p>{t("data.Saudi Arabia")}</p>
                        <p>{t("orderDetails.trn")}: </p>
                        <p>{t("orderDetails.phone")}: {shippingAddress?.telephone || "-"}</p>
                        <p>{t("orderDetails.website")}: {process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || ""}/</p>

                    </div>
                    <div className="order-title-box">
                        <h1 className="order-summary-title">{t("orderDetails.orderSummary")}</h1>

                    </div>
                    <div className="order-meta">
                        <img src="/logo/atcl-bridgestone-logo-v1.jpg" alt="Logo" className="print-logo" />
                        <div className="meta-row">
                            <span className="label">{t("orderDetails.orderHash")}</span>

                            <span className="value">{order.increment_id}</span>
                        </div>
                        <div className="meta-row">
                            <span className="label">{t("orderDetails.createdOn")}</span>

                            <span className="value">{formatDate(order.created_at)}</span>
                        </div>
                    </div>
                </div>

                <div className="address-box-container">
                    <div className="address-header-row">
                        <div className="header-cell">{t("orderDetails.billingAddress")}</div>
                        <div className="header-cell">{t("orderDetails.shipTo")}</div>

                    </div>
                    <div className="address-content-row">
                        <div className={`content-cell ${locale === 'ar' ? 'border-l' : 'border-r'} border-black text-start`}>

                            <p className="font-bold" dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress?.firstname} {billingAddress?.lastname}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress?.company || "-"}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress?.street?.join(", ")}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress?.city}, {billingAddress?.postcode}</p>
                            <p>{billingAddress?.country_id === "SA" ? t("data.Saudi Arabia") : billingAddress?.country_id}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{t("orderDetails.phone")}: {billingAddress?.telephone}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>Email: {order.customer_email || "-"}</p>

                        </div>
                        <div className="content-cell">
                            <p className="font-bold" dir="ltr" style={{ unicodeBidi: "isolate" }}>{shippingAddress?.firstname} {shippingAddress?.lastname}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{shippingAddress?.company || "-"}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{shippingAddress?.street?.join(", ")}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{shippingAddress?.city}, {shippingAddress?.postcode}</p>
                            <p>{shippingAddress?.country_id === "SA" ? t("data.Saudi Arabia") : shippingAddress?.country_id}</p>
                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{t("orderDetails.phone")}: {shippingAddress?.telephone}</p>

                        </div>
                    </div>
                </div>

                <table className="items-print-table">
                    <thead>
                        <tr>
                            <th className="text-left">{t("orderDetails.description")}</th>
                            <th className="text-center">{t("orderDetails.qty")}</th>
                            <th className="text-right">{t("orderDetails.unitPrice")}</th>
                            <th className="text-right">{t("orderDetails.total")}</th>

                        </tr>
                    </thead>
                    <tbody>
                        {order.items?.map((item: any) => (
                            <tr key={item.item_id}>
                                <td>
                                    <p className="item-name">{item.name}</p>
                                    <p className="item-sku">{item.sku}</p>
                                </td>
                                <td className="text-center">{Math.round(item.qty_ordered)}</td>
                                <td className="text-right">{formatCurrency(item.price)}</td>
                                <td className="text-right font-bold">{formatCurrency(item.row_total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="totals-print-container">
                    <div className="totals-wrapper">
                        <div className="total-row">
                            <span>{t("orderDetails.subtotal")}</span>

                            <span>{formatCurrency(order.subtotal)}</span>
                        </div>
                        <div className="total-row">
                            <span>{t("orderDetails.vat")}</span>

                            <span>{formatCurrency(order.tax_amount)}</span>
                        </div>
                        <div className="total-row grand-total-row">
                            <span>{t("orderDetails.grandTotal")}</span>

                            <span>{formatCurrency(order.grand_total)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Styles for Printing */}
            <style jsx global>{`
                #printable-order {
                    display: none;
                }

                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #printable-order, #printable-order * {
                        visibility: visible;
                    }
                    #printable-order {
                        display: block !important;
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background: white !important;
                        color: black !important;
                        padding: 20px;
                        font-family: 'Rubik', sans-serif;
                    }
                    
                    /* Reset everything else */
                    .no-print, aside, nav, header, footer {
                        display: none !important;
                    }
                    
                    /* Header Styles */
                    .printable-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 30px;
                    }
                    .comp-info {
                        font-size: 11px;
                        line-height: 1.4;
                    }
                    .order-title-box {
                        flex: 1;
                        text-align: center;
                    }
                    .order-summary-title {
                        font-size: 20px;
                        font-weight: 700;
                        text-decoration: none;
                        display: inline-block;
                        border-bottom: 1.5px solid black;
                        padding-bottom: 2px;
                        margin-top: 10px;
                    }
                    .order-meta {
                        text-align: right;
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .print-logo {
                        height: 40px;
                        width: auto;
                        margin-bottom: 10px;
                        margin-left: auto;
                    }
                    .meta-row {
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        font-weight: 600;
                        gap: 20px;
                    }
                    .meta-row .label { width: 60px; text-align: left; }
                    .meta-row .value { text-align: right; }

                    /* Address Box Styles */
                    .address-box-container {
                        border: 1px solid black;
                        margin-bottom: 30px;
                        border-radius: 2px;
                        overflow: hidden;
                    }
                    .address-header-row {
                        display: flex;
                        background-color: #f0f0f0 !important;
                        -webkit-print-color-adjust: exact;
                        border-bottom: 1px solid black;
                    }
                    .header-cell {
                        flex: 1;
                        padding: 6px 15px;
                        font-size: 11px;
                        font-weight: 700;
                    }
                    .address-content-row {
                        display: flex;
                    }
                    .content-cell {
                        flex: 1;
                        padding: 15px;
                        font-size: 11px;
                        line-height: 1.5;
                        min-height: 120px;
                    }

                    /* Table Styles */
                    .items-print-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 30px;
                    }
                    .items-print-table th {
                        background-color: #f0f0f0 !important;
                        -webkit-print-color-adjust: exact;
                        border: 1px solid black;
                        padding: 8px 15px;
                        font-size: 11px;
                        font-weight: 700;
                    }
                    .items-print-table td {
                        border: 1px solid black;
                        padding: 10px 15px;
                        font-size: 11px;
                        vertical-align: top;
                    }
                    .item-name { font-weight: 700; margin-bottom: 2px; }
                    .item-sku { font-size: 10px; color: #444; }

                    /* Totals Styles */
                    .totals-print-container {
                        display: flex;
                        justify-content: flex-end;
                    }
                    .totals-wrapper {
                        width: 250px;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        font-weight: 700;
                    }
                    .grand-total-row {
                        margin-top: 5px;
                        padding-top: 5px;
                        font-size: 13px;
                        font-weight: 900;
                    }
                }
            `}</style>
        </div>
    );
}
