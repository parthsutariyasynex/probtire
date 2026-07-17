"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useNotifications } from "@/modules/notifications/hooks/useNotifications";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { redirectToLogin } from "@/utils/helpers";
import PortalDropdown from "@/components/PortalDropdown";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";
import { useLocale } from "@/lib/i18n/client";
import Sidebar from "@/components/Sidebar";
import { NotificationsSkeleton, SidebarSkeleton } from "@/components/skeletons";

/**
 * Translate notification text from English to Arabic.
 * Handles patterns like:
 *   "New Order# BT00028701" → "طلب جديد رقم BT00028701"
 *   "New Order# BT00028701 placed successfully" → "تم عمل الطلب رقم BT00028701 بنجاح"
 */
function translateNotificationText(text: string, locale: string): string {
    if (locale !== "ar" || !text) return text;

    // "New Order# XXXXX placed successfully"
    const placedMatch = text.match(/^New Order#?\s*(BT\d+)\s*placed successfully$/i);
    if (placedMatch) return `تم عمل الطلب رقم ${placedMatch[1]} بنجاح`;

    // "New Order# XXXXX"
    const orderMatch = text.match(/^New Order#?\s*(BT\d+)$/i);
    if (orderMatch) return `طلب جديد رقم ${orderMatch[1]}`;

    // "Order# XXXXX has been shipped"
    const shippedMatch = text.match(/^Order#?\s*(BT\d+)\s*has been shipped$/i);
    if (shippedMatch) return `تم شحن الطلب رقم ${shippedMatch[1]}`;

    // "Order# XXXXX has been invoiced"
    const invoicedMatch = text.match(/^Order#?\s*(BT\d+)\s*has been invoiced$/i);
    if (invoicedMatch) return `تمت فوترة الطلب رقم ${invoicedMatch[1]}`;

    // "Order# XXXXX has been canceled"
    const canceledMatch = text.match(/^Order#?\s*(BT\d+)\s*has been cancel/i);
    if (canceledMatch) return `تم إلغاء الطلب رقم ${canceledMatch[1]}`;

    return text;
}

function formatDate(dateStr: string, locale: string): string {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return new Intl.DateTimeFormat("en-US", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: true,
        }).format(date);
    } catch {
        return dateStr;
    }
}

export default function NotificationsPage() {
    const router = useRouter();
    const { t, isRtl } = useTranslation();
    const lp = useLocalePath();
    const locale = useLocale();
    const { status } = useSession();
    const {
        notifications,
        isLoading,
        fetchNotifications,
        markAsRead,
        removeNotification,
        totalCount,
        deletingIds
    } = useNotifications();

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    // useNotifications.isLoading starts FALSE, so without this the page would flash the empty
    // state for one frame before the first fetch flips isLoading. firstLoadDone gates the
    // full-page skeleton until the first fetch settles (data OR confirmed-empty).
    const [firstLoadDone, setFirstLoadDone] = useState(false);

    useEffect(() => {
        if (status === "unauthenticated") {
            redirectToLogin(router);
            return;
        }
        if (status === "authenticated") {
            Promise.resolve(fetchNotifications(pageSize, currentPage)).finally(() => setFirstLoadDone(true));
        }
    }, [status, router, fetchNotifications, pageSize, currentPage]);

    const handleNotificationClick = async (item: any) => {
        if (!item.is_read) {
            await markAsRead(item.notification_id);
        }
    };

    // Extract numeric order ID from URL like "/sales/order/view/order_id/28707"
    // The API needs numeric entity_id, not increment_id like "BT00028707"
    const getOrderLink = (item: any): string | null => {
        const url = item.url || "";
        const urlMatch = url.match(/order_id\/(\d+)/);
        if (urlMatch) return lp(`/my-orders/${urlMatch[1]}`);
        return null;
    };

    const handleLogout = async () => {
        await signOut({ callbackUrl: `${window.location.origin}${lp("/login")}` });
    };

    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const pageNumbers = Array.from({ length: Math.min(6, totalPages) }, (_, i) => i + 1);

    // SINGLE loading owner. Until the first fetch settles, render the EXACT same wrapper the
    // route-level fallback uses (renderSkeletonForPath's top-level notifications branch:
    // w-full py-… → flex-row gap-0 → SidebarSkeleton + main px-… → NotificationsSkeleton). So
    // the auth-loading skeleton, this initial-load skeleton, and the loaded page all share one
    // identical layout → one continuous skeleton, no second flash, no shift. Pagination (after
    // firstLoadDone, data present) keeps the real chrome and only skeletons the table body below.
    if (!firstLoadDone) {
        return (
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 w-full bg-surface font-rubik">
                <SidebarSkeleton />
                <main className="flex-1 w-full min-w-0 px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-surface">
                    <NotificationsSkeleton count={pageSize} />
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col lg:flex-row flex-1 min-h-0 w-full bg-surface font-rubik">
            {/* SIDEBAR */}
            <Sidebar />

            {/* MAIN CONTENT */}
            <main className="flex-1 w-full min-w-0 px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-surface" dir={isRtl ? "rtl" : "ltr"}>
                    <h1 className="text-h3 md:text-h1-sm font-semibold text-black mb-5 uppercase tracking-tight" >
                            {t('notifications.title')}
                        </h1>

                    {(!notifications || notifications.length === 0) && !isLoading ? (
                        <p className="text-body text-[#333333] ltr:text-left rtl:text-right mt-4">
                            {isRtl ? "لا توجد إشعارات متاحة." : "There are no notifications available"}
                        </p>
                    ) : (
                        <div className="border border-[#ddd] rounded-sm overflow-hidden bg-white">
                            {/* Desktop Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse table-fixed min-w-[600px]">
                                    <thead>
                                        <tr className="bg-brand-yellow text-black text-label uppercase font-bold tracking-widest h-10">
                                            <th className="px-4 py-2 border border-[#ddd] ltr:text-left rtl:text-right w-[15%]">{t('common.date')}</th>
                                            <th className="px-4 py-2 border border-[#ddd] ltr:text-left rtl:text-right w-[20%]">{t('m.title')}</th>
                                            <th className="px-4 py-2 border border-[#ddd] ltr:text-left rtl:text-right w-[45%]">{t('m.message')}</th>
                                            <th className="px-4 py-2 border border-[#ddd] text-center w-[20%]">{t('common.action')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                        {(isLoading && (!notifications || notifications.length === 0)) ? (
                                            Array.from({ length: pageSize }).map((_, i) => (
                                                <tr key={`skel-${i}`} className="border-b border-[#ddd]">
                                                    <td className="px-4 py-2.5 border border-[#ddd]"><div className="h-3 w-32 bg-gray-200 rounded animate-pulse" /></td>
                                                    <td className="px-4 py-2.5 border border-[#ddd]"><div className="h-3 w-48 bg-gray-200 rounded animate-pulse" /></td>
                                                    <td className="px-4 py-2.5 border border-[#ddd]"><div className="h-3 w-24 bg-gray-200 rounded animate-pulse" /></td>
                                                    <td className="px-4 py-2.5 border border-[#ddd]"><div className="h-3 w-16 bg-gray-200 rounded animate-pulse mx-auto" /></td>
                                                </tr>
                                            ))
                                        ) : notifications && notifications.length > 0 ? (
                                            notifications.map((item, index) => (
                                                <tr
                                                    key={`${item.notification_id || index}-${index}`}
                                                    className={`border-b border-[#ddd] last:border-0 transition-colors ${!item.is_read ? "bg-[#fcf8ec]" : "bg-white"} hover:bg-brand-yellow/5`}
                                                >
                                                    <td className="px-4 py-2.5 text-body text-[#333333] ltr:text-left rtl:text-right border border-[#ddd] align-middle relative">

                                                        {formatDate(item.date_added_formatted, locale)}
                                                    </td>
                                                    <td className={`px-4 py-2.5 text-body ltr:text-left rtl:text-right border border-[#ddd] align-middle ${!item.is_read ? "font-semibold text-black" : "font-normal text-[#666666]"}`}>
                                                        {getOrderLink(item) ? (
                                                            <Link href={getOrderLink(item)!} className="hover:text-brand-yellow transition-colors cursor-pointer underline-offset-2 hover:underline">
                                                                {translateNotificationText(item.title, locale)}
                                                            </Link>
                                                        ) : translateNotificationText(item.title, locale)}
                                                    </td>
                                                    <td className={`px-4 py-2.5 text-body ltr:text-left rtl:text-right border border-[#ddd] leading-relaxed align-middle ${!item.is_read ? "font-medium text-black" : "text-[#666666]"}`}>
                                                        {translateNotificationText(item.description, locale)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-body text-center border border-[#ddd] align-middle">
                                                        <div className="flex items-center justify-center gap-2 whitespace-nowrap text-[#333333]">
                                                            {!item.is_read && (
                                                                <>
                                                                    <button onClick={(e) => { e.stopPropagation(); markAsRead(item.notification_id); }} className="hover:text-brand-yellow transition-colors font-semibold">{t('m.mark-as-read')}</button>
                                                                    <span className="text-[#cccccc]">|</span>
                                                                </>
                                                            )}
                                                            <button onClick={(e) => { e.stopPropagation(); removeNotification(item.notification_id, item.is_read); }} disabled={deletingIds.includes(item.notification_id)} className="hover:text-brand-yellow cursor-pointer transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                                                                {deletingIds.includes(item.notification_id) ? t('common.loading') : t('m.remove')}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="py-16 text-center text-gray-400 text-body bg-white border border-[#ddd] italic">{t('notifications.empty')}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card List */}
                            <div className="md:hidden">
                                {(isLoading && (!notifications || notifications.length === 0)) ? (
                                    <div className="space-y-2 py-2">
                                        {Array.from({ length: pageSize }).map((_, i) => (
                                            <div key={i} className="bg-white border border-[#ddd] p-3 flex items-start gap-3">
                                                <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                                                <div className="flex-1 space-y-1.5">
                                                    <div className="h-3.5 w-3/4 bg-gray-200 rounded animate-pulse" />
                                                    <div className="h-3 w-1/2 bg-gray-200 rounded animate-pulse" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : notifications && notifications.length > 0 ? (
                                    notifications.map((item, index) => (
                                        <div
                                            key={`mobile-${item.notification_id || index}-${index}`}
                                            className={`py-2.5 px-3.5 border-b border-[#ddd] last:border-0 transition-colors ${!item.is_read ? "bg-[#fcf8ec]" : "bg-white"}`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-2">
                                                    {!item.is_read && <div className="w-2 h-2 bg-brand-yellow rounded-full flex-shrink-0 mt-1"></div>}
                                                    {getOrderLink(item) ? (
                                                        <Link href={getOrderLink(item)!} className={`text-body hover:text-brand-yellow transition-colors hover:underline ${!item.is_read ? "font-semibold text-black" : "font-normal text-[#666666]"}`}>
                                                            {translateNotificationText(item.title, locale)}
                                                        </Link>
                                                    ) : (
                                                        <span className={`text-body ${!item.is_read ? "font-semibold text-black" : "font-normal text-[#666666]"}`}>{translateNotificationText(item.title, locale)}</span>
                                                    )}
                                                </div>
                                                <span className="text-label text-gray-400 flex-shrink-0">{formatDate(item.date_added_formatted, locale)}</span>
                                            </div>
                                            <p className={`text-body-sm leading-relaxed mb-1.5 ${!item.is_read ? "font-medium text-black" : "text-[#666666]"}`}>
                                                {translateNotificationText(item.description, locale)}
                                            </p>
                                            <div className="flex items-center gap-3 text-label font-semibold text-[#333333]">
                                                {!item.is_read && (
                                                    <>
                                                        <button onClick={(e) => { e.stopPropagation(); markAsRead(item.notification_id); }} className="hover:text-brand-yellow transition-colors">{t('m.mark-as-read')}</button>
                                                        <span className="text-[#cccccc]">|</span>
                                                    </>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); removeNotification(item.notification_id, item.is_read); }} disabled={deletingIds.includes(item.notification_id)} className="hover:text-brand-yellow transition-colors disabled:opacity-50">
                                                    {deletingIds.includes(item.notification_id) ? t('common.loading') : t('m.remove')}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-16 text-center text-gray-500 text-body">{t('notifications.empty')}</div>
                                )}
                            </div>

                            {/* PAGINATION PANEL */}
                            <div className="bg-white py-2 px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-black border-t border-[#ddd]">
                                <div className="text-body text-black font-bold order-2 md:order-1">
                                    {t('favorites.items')} {((currentPage - 1) * pageSize) + 1} {t('m.to')} {Math.min(currentPage * pageSize, totalCount)} {t('favorites.of')} {totalCount} {t('favorites.total')}
                                </div>

                                <div className="flex items-center gap-1 order-1 md:order-2">
                                    {currentPage > 1 && (
                                        <button
                                            onClick={() => setCurrentPage(currentPage - 1)}
                                            className="w-8 h-8 flex items-center justify-center text-black hover:text-brand-yellow transition-colors"
                                        >
                                            {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                                        </button>
                                    )}
                                    <div className="flex gap-2">
                                        {pageNumbers.map((num) => (
                                            <button
                                                key={num}
                                                onClick={() => setCurrentPage(num)}
                                                className={`w-8 h-8 flex items-center justify-center text-body-sm font-bold rounded-full border transition-all ${currentPage === num
                                                    ? "bg-brand-yellow border-brand-yellow text-black"
                                                    : "bg-white border-[#ddd] text-black hover:border-brand-yellow hover:text-brand-yellow"
                                                    }`}
                                            >
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                    {currentPage < totalPages && (
                                        <button
                                            onClick={() => setCurrentPage(currentPage + 1)}
                                            className="w-8 h-8 flex items-center justify-center text-black hover:text-brand-yellow transition-colors"
                                        >
                                            {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 text-body text-black font-bold order-3">
                                    <span>{t('favorites.show')}</span>
                                    <PortalDropdown
                                        value={String(pageSize)}
                                        onChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
                                        options={[{ label: "15", value: "15" }, { label: "30", value: "30" }, { label: "50", value: "50" }]}
                                        minWidth={60}
                                        buttonClassName="bg-white border border-gray-300 rounded px-2.5 py-1 text-body font-bold text-black hover:border-gray-400 focus:outline-none flex items-center justify-between gap-1 shadow-sm"
                                    />
                                    <span>{t('common.perPage')}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
        </div>
    );
}
