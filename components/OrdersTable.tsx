"use client";
import React from "react";
import { useTranslation } from "@/hooks/useTranslation";
import Price from "@/app/components/Price";

export interface Order {
    id: string;
    sapOrderNumber: string;
    date: string;
    grandTotal: string;
    orderedBy: string;
    company: string;
    companyCode: string;
    status: string;
    increment_id: string;
    entity_id: string;
}

interface OrdersTableProps {
    orders: Order[];
    onViewOrder: (id: string) => void;
    onReorder: (order: Order) => void;
    hideReorder?: boolean;
}

const OrdersTable: React.FC<OrdersTableProps> = ({ orders, onViewOrder, onReorder, hideReorder = false }) => {
    const { t } = useTranslation();
    return (
        <div className="w-full">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-body text-left border-collapse min-w-[1100px] border border-[#ddd]">
                    <thead>
                        <tr className="bg-brand-yellow text-black text-label uppercase font-bold tracking-widest">
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd]">{t("orders.orderId")}</th>
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd]">{t("orders.sapOrder")}</th>
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd] whitespace-nowrap text-center">{t("orders.date")}</th>
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd] whitespace-nowrap text-center">{t("orders.grandTotal")}</th>
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd] text-center">{t("orders.orderedBy")}</th>
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd] text-center">{t("orders.company")}</th>
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd] text-center">{t("orders.companyCode")}</th>
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd] text-center">{t("orders.status")}</th>
                            <th className="px-2 xl:px-4 py-2 border border-[#ddd] text-center">{t("orders.action")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.length > 0 ? (
                            orders.map((order, idx) => (
                                <tr
                                    key={order.increment_id + idx}
                                    className="border-b border-gray-200 hover:bg-gray-50/50 transition-colors"
                                >
                                    <td
                                        className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body-lg font-medium cursor-pointer"
                                        onClick={() => onViewOrder(order.entity_id)}
                                    >
                                        {order.id}
                                    </td>
                                    <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body">
                                        {order.sapOrderNumber || "—"}
                                    </td>
                                    <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body whitespace-nowrap text-center">
                                        {order.date}
                                    </td>
                                    <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-normal text-body-lg font-normal whitespace-nowrap text-center">
                                        <Price amount={order.grandTotal} />
                                    </td>
                                    <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body text-center">
                                        {order.orderedBy || "—"}
                                    </td>
                                    <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body text-center">
                                        {order.company || "—"}
                                    </td>
                                    <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body text-center">
                                        {order.companyCode || "—"}
                                    </td>
                                    <td className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-center">
                                        <span className="inline-flex px-2 py-1 border rounded-sm text-caption font-medium uppercase tracking-wider bg-white whitespace-nowrap border-borderStrong text-black">
                                            {t(`data.${order.status}`) !== `data.${order.status}` ? t(`data.${order.status}`) : order.status}
                                        </span>
                                    </td>
                                    <td className="px-2 xl:px-4 py-1.5 text-center">
                                        <div className="flex items-center justify-center gap-3 text-body-sm font-medium uppercase tracking-wide whitespace-nowrap text-black">
                                            <button
                                                onClick={() => onViewOrder(order.entity_id)}
                                                className="text-black hover:text-brand-yellow hover:underline underline-offset-2 transition-colors"
                                            >
                                                {t("orders.viewOrder")}
                                            </button>
                                            {!hideReorder && (
                                                <>
                                                    <span className="text-black/40 font-normal">|</span>
                                                    <button
                                                        onClick={() => onReorder(order)}
                                                        className="text-black hover:text-brand-yellow hover:underline underline-offset-2 transition-colors"
                                                    >
                                                        {t("orders.reorder")}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={9} className="px-4 py-10 text-center text-gray-400 italic">
                                    {t("orders.noRecords")}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
                {orders.length > 0 ? (
                    orders.map((order, idx) => (
                        <div
                            key={order.increment_id + idx}
                            className="border border-gray-200 rounded-lg bg-white p-4 space-y-3"
                        >
                            <div className="flex items-center justify-between">
                                <span
                                    className="text-body font-medium text-gray-800 cursor-pointer"
                                    onClick={() => onViewOrder(order.entity_id)}
                                >
                                    #{order.id}
                                </span>
                                <span className="text-body-sm text-gray-500">{order.date}</span>
                            </div>

                            <div>
                                <span className="inline-block text-label uppercase font-semibold tracking-wide bg-brand-yellow/15 text-[#b37a00] px-2.5 py-1 rounded-full">
                                    {t(`data.${order.status}`) !== `data.${order.status}` ? t(`data.${order.status}`) : order.status}
                                </span>
                            </div>

                            {order.sapOrderNumber && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{t("orders.sapOrder")}</span>
                                    <span className="text-gray-600">{order.sapOrderNumber}</span>
                                </div>
                            )}

                            {order.orderedBy && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{t("orders.orderedBy")}</span>
                                    <span className="text-gray-600">{order.orderedBy}</span>
                                </div>
                            )}

                            {order.company && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{t("orders.company")}</span>
                                    <span className="text-gray-600">{order.company}</span>
                                </div>
                            )}

                            {order.companyCode && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{t("orders.companyCode")}</span>
                                    <span className="text-gray-600">{order.companyCode}</span>
                                </div>
                            )}

                            <div className="flex justify-between text-body-sm">
                                <span className="text-gray-400">{t("orders.orderTotal")}</span>
                                <span className="text-gray-800 font-medium price currency-riyal"><Price amount={order.grandTotal} /></span>
                            </div>

                            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 text-body-sm">
                                <button
                                    onClick={() => onViewOrder(order.entity_id)}
                                    className="text-brand-yellow font-medium hover:underline underline-offset-2 transition-colors"
                                >
                                    {t("orders.viewOrder")}
                                </button>
                                {!hideReorder && (
                                    <>
                                        <span className="text-gray-300">|</span>
                                        <button
                                            onClick={() => onReorder(order)}
                                            className="text-gray-700 hover:text-brand-yellow hover:underline underline-offset-2 transition-colors"
                                        >
                                            {t("orders.reorder")}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-4 py-10 text-center text-gray-400 italic">
                        {t("orders.noRecords")}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrdersTable;
