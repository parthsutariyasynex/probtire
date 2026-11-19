"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCheckout } from "@/modules/checkout/hooks/useCheckout";
import { MultiLocationSuccessSkeleton } from "@/components/skeletons";

interface OrderRow {
    order_id: string;
    order_increment_id: string;
    shipping_address: string;
}

const MultiShippingSuccessPage = () => {
    return (
        <Suspense fallback={<MultiLocationSuccessSkeleton />}>
            <MultiShippingSuccessContent />
        </Suspense>
    );
};

const MultiShippingSuccessContent = () => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
    const orderId = searchParams.get("order_id"); // comma-separated entity_ids like "28675,28676,28677"
    const { fetchMultiShippingSuccess } = useCheckout({ skipInitialFetch: true });
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasFetched, setHasFetched] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (hasFetched) return;
        if (!orderId) {
            router.push(lp("/"));
            return;
        }

        const getSuccessData = async () => {
            setHasFetched(true);

            try {
                // Call success API with comma-separated entity_ids
                // e.g. /api/kleverapi/multishipping/success/28675,28676,28677
                // Magento: { message, orders[{ order_id, order_increment_id, shipping_address }] }
                const data = await fetchMultiShippingSuccess(orderId);
                setMessage(data?.message || "");
                setOrders((Array.isArray(data?.orders) ? data.orders : [])
                    .filter((o: any) => o?.order_id && o?.order_increment_id)
                    .map((o: any) => ({
                        order_id: String(o.order_id),
                        order_increment_id: String(o.order_increment_id),
                        shipping_address: o.shipping_address || "",
                    })));
            } catch (error) {
                // Nothing is made up: the page says the details could not be loaded.
                console.error("Multi-Shipping Success API Error:", error);
            }
            setIsLoading(false);
        };

        getSuccessData();
    }, [orderId, fetchMultiShippingSuccess, router, hasFetched]);

    if (isLoading) {
        return <MultiLocationSuccessSkeleton />;
    }

    return (
        <div className="bg-white min-h-screen font-sans pb-20">
            <div className="max-w-[1200px] mx-auto pt-10 md:pt-20 px-4">

                {/* Header */}
                <div className="text-center mb-10 md:mb-16">
                    <h1 className="text-h2 md:text-h1 font-bold text-black uppercase tracking-tight mb-4">
                        {t("multi.thankYou")}
                    </h1>
                    {message && (
                        <p className="text-body md:text-body-lg text-black font-medium max-w-4xl mx-auto leading-relaxed">
                            {message}
                        </p>
                    )}
                </div>

                {/* Successfully ordered */}
                <div className="mb-6 text-center">
                    <h2 className="text-body-xl md:text-h3-sm font-bold text-black tracking-tight">
                        {t("multi.successOrdered")}
                    </h2>
                </div>

                <div className="border border-gray-200 shadow-sm overflow-hidden">
                    {/* Table Header */}
                    <div className="flex bg-surface-muted border-b border-gray-200 py-3 px-6">
                        <div className="w-[180px] md:w-[220px] flex-shrink-0 text-body-sm md:text-body font-bold text-black">{t("multi.orderId")}</div>
                        <div className="flex-1 text-body-sm md:text-body font-bold text-black">{t("multi.shipTo")}</div>
                    </div>

                    {/* Table Body */}
                    <div className="bg-white">
                        {orders.length > 0 ? orders.map((order) => (
                            <div
                                key={order.order_id}
                                className="flex border-b border-gray-100 last:border-b-0 border-l-4 border-l-brand-yellow py-5 px-6 items-start bg-[#fafafa]"
                            >
                                <div className="w-[180px] md:w-[220px] flex-shrink-0">
                                    <Link href={lp(`/my-orders/${order.order_id}`)} className="text-body md:text-body-lg font-black text-black underline hover:text-brand-yellow">
                                        {order.order_increment_id}
                                    </Link>
                                </div>
                                <div className="flex-1">
                                    <p className="text-body md:text-body-lg text-gray-700 font-medium">
                                        {order.shipping_address}
                                    </p>
                                </div>
                            </div>
                        )) : (
                            <div className="py-10 text-center text-gray-400 text-body-lg">
                                {t("multi.noOrderDetails")}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="bg-surface-muted p-4 flex justify-end">
                        <Link
                            href={lp("/products")}
                            className="bg-brand-yellow text-black px-8 md:px-12 py-3 text-label font-black uppercase tracking-[0.1em] hover:bg-black hover:text-white transition-all shadow-sm"
                        >
                            {t("multi.continueShopping")}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MultiShippingSuccessPage;
