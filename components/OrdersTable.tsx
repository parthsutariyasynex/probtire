"use client";
import React from "react";
import Link from "next/link";
import Price from "@/app/components/Price";
import type { MagentoOrderFilters } from "@/src/lib/magentoOrderView";

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

/** Column keys of Magento's My Orders table (src/lib/magentoOrderView.ts). */
export type OrderColumnKey =
    | "id" | "sapOrderNumber" | "date" | "grandTotal" | "orderedBy" | "company" | "companyCode" | "status" | "actions";

/** Magento's own My Orders table layout: its columns (in order, with its header texts) and action link texts. */
export interface OrdersTableLayout {
    columns: { key: OrderColumnKey; label: string }[];
    actions: { view: string | null; reorder: string | null };
    /** Status text as Magento's table shows it in this store view, keyed by the order's status label. */
    status_labels?: Record<string, string>;
    /** Magento's filter bar above the table. */
    filters?: MagentoOrderFilters | null;
    /** Magento's message when there are no orders to list. */
    empty_message?: string | null;
    /** What Magento shows in a text column when the order has no value (e.g. Company "N/A"). */
    empty_texts?: Partial<Record<OrderColumnKey, string>>;
}

interface OrdersTableProps {
    orders: Order[];
    onViewOrder: (id: string) => void;
    /** URL of the order's view page — the Order # is a link to it, as on Magento. */
    viewHref: (order: Order) => string;
    onReorder: (order: Order) => void;
    hideReorder?: boolean;
    /** Magento's layout for this customer + store view — the only source of columns and texts. */
    layout: OrdersTableLayout;
}

const OrdersTable: React.FC<OrdersTableProps> = ({ orders, onViewOrder, viewHref, onReorder, hideReorder = false, layout }) => {
    // Everything shown here comes from Magento: columns, header texts, action texts, status texts.
    const columns = layout.columns;
    const viewLabel = layout.actions?.view ?? null;
    const reorderLabel = layout.actions?.reorder ?? null;
    const labelOf = (key: OrderColumnKey) => columns.find((c) => c.key === key)?.label ?? null;
    // Magento's status text for this store view (keyed by the status label Magento's kleverMyOrders returns).
    const statusText = (status: string) => layout.status_labels?.[status] ?? status;
    // A text cell's value, or Magento's own text for an empty value in that column (e.g. "N/A").
    const textOf = (value: string, key: OrderColumnKey) => value || layout.empty_texts?.[key] || "";

    const cell = (order: Order, key: OrderColumnKey) => {
        switch (key) {
            case "id":
                return (
                    <td key={key} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body-lg font-medium">
                        <Link href={viewHref(order)} className="text-black hover:text-brand-yellow hover:underline underline-offset-2 transition-colors">
                            {order.id}
                        </Link>
                    </td>
                );
            case "sapOrderNumber":
                return <td key={key} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body">{textOf(order.sapOrderNumber, key)}</td>;
            case "date":
                return <td key={key} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body whitespace-nowrap text-center">{order.date}</td>;
            case "grandTotal":
                return (
                    <td key={key} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-normal text-body-lg font-normal whitespace-nowrap text-center">
                        <Price amount={order.grandTotal} />
                    </td>
                );
            case "orderedBy":
                return <td key={key} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body text-center">{textOf(order.orderedBy, key)}</td>;
            case "company":
                return <td key={key} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body text-center">{textOf(order.company, key)}</td>;
            case "companyCode":
                return <td key={key} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-black text-body text-center">{textOf(order.companyCode, key)}</td>;
            case "status":
                return (
                    <td key={key} className="px-2 xl:px-4 py-1.5 border-r border-gray-200 text-center">
                        <span className="inline-flex px-2 py-1 border rounded-sm text-caption font-medium uppercase tracking-wider bg-white whitespace-nowrap border-borderStrong text-black">
                            {statusText(order.status)}
                        </span>
                    </td>
                );
            case "actions":
                return (
                    <td key={key} className="px-2 xl:px-4 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-3 text-body-sm font-medium uppercase tracking-wide whitespace-nowrap text-black">
                            {viewLabel && (
                                <button onClick={() => onViewOrder(order.entity_id)} className="text-black hover:text-brand-yellow hover:underline underline-offset-2 transition-colors cursor-pointer">
                                    {viewLabel}
                                </button>
                            )}
                            {!hideReorder && reorderLabel && (
                                <>
                                    <span className="text-black/40 font-normal">|</span>
                                    <button onClick={() => onReorder(order)} className="text-black hover:text-brand-yellow hover:underline underline-offset-2 transition-colors cursor-pointer">
                                        {reorderLabel}
                                    </button>
                                </>
                            )}
                        </div>
                    </td>
                );
        }
    };

    return (
        <div className="w-full">
            {/* Desktop Table — Magento's columns, in Magento's order */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-body text-left border-collapse min-w-[1100px] border border-[#ddd]">
                    <thead>
                        <tr className="bg-brand-yellow text-black text-label uppercase font-bold tracking-widest">
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    className={`px-2 xl:px-4 py-2 border border-[#ddd] ${c.key === "id" || c.key === "sapOrderNumber" ? "" : "text-center"} ${c.key === "date" || c.key === "grandTotal" ? "whitespace-nowrap" : ""}`}
                                >
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {orders.length > 0 ? (
                            orders.map((order, idx) => (
                                <tr key={order.increment_id + idx} className="border-b border-gray-200 hover:bg-gray-50/50 transition-colors">
                                    {columns.map((c) => cell(order, c.key))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400 italic">
                                    {layout.empty_message}
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
                                <Link
                                    href={viewHref(order)}
                                    className="text-body font-medium text-gray-800 hover:text-brand-yellow hover:underline underline-offset-2"
                                >
                                    #{order.id}
                                </Link>
                                {labelOf("date") && <span className="text-body-sm text-gray-500">{order.date}</span>}
                            </div>

                            {labelOf("status") && (
                                <div>
                                    <span className="inline-block text-label uppercase font-semibold tracking-wide bg-brand-yellow/15 text-[#b37a00] px-2.5 py-1 rounded-full">
                                        {statusText(order.status)}
                                    </span>
                                </div>
                            )}

                            {textOf(order.sapOrderNumber, "sapOrderNumber") && labelOf("sapOrderNumber") && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{labelOf("sapOrderNumber")}</span>
                                    <span className="text-gray-600">{textOf(order.sapOrderNumber, "sapOrderNumber")}</span>
                                </div>
                            )}

                            {textOf(order.orderedBy, "orderedBy") && labelOf("orderedBy") && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{labelOf("orderedBy")}</span>
                                    <span className="text-gray-600">{textOf(order.orderedBy, "orderedBy")}</span>
                                </div>
                            )}

                            {textOf(order.company, "company") && labelOf("company") && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{labelOf("company")}</span>
                                    <span className="text-gray-600">{textOf(order.company, "company")}</span>
                                </div>
                            )}

                            {textOf(order.companyCode, "companyCode") && labelOf("companyCode") && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{labelOf("companyCode")}</span>
                                    <span className="text-gray-600">{textOf(order.companyCode, "companyCode")}</span>
                                </div>
                            )}

                            {labelOf("grandTotal") && (
                                <div className="flex justify-between text-body-sm">
                                    <span className="text-gray-400">{labelOf("grandTotal")}</span>
                                    <span className="text-gray-800 font-medium price currency-riyal"><Price amount={order.grandTotal} /></span>
                                </div>
                            )}

                            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 text-body-sm">
                                {viewLabel && (
                                    <button
                                        onClick={() => onViewOrder(order.entity_id)}
                                        className="text-brand-yellow font-medium hover:underline underline-offset-2 transition-colors"
                                    >
                                        {viewLabel}
                                    </button>
                                )}
                                {!hideReorder && reorderLabel && (
                                    <>
                                        <span className="text-gray-300">|</span>
                                        <button
                                            onClick={() => onReorder(order)}
                                            className="text-gray-700 hover:text-brand-yellow hover:underline underline-offset-2 transition-colors"
                                        >
                                            {reorderLabel}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-4 py-10 text-center text-gray-400 italic">
                        {layout.empty_message}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrdersTable;
