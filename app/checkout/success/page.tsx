"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Package, ArrowRight, Home, ShoppingBag } from "lucide-react";
import { useCheckout } from "@/modules/checkout/hooks/useCheckout";
import { toast } from "react-hot-toast";
import { CheckoutSuccessSkeleton } from "@/components/skeletons";

const CheckoutSuccessPage = () => {
    return (
        <Suspense fallback={<CheckoutSuccessSkeleton />}>
            <CheckoutSuccessContent />
        </Suspense>
    );
};

const CheckoutSuccessContent = () => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
    const orderId = searchParams.get("order_id");
    const { fetchCheckoutSuccess } = useCheckout({ skipInitialFetch: true });
    const [orderData, setOrderData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [hasFetched, setHasFetched] = useState(false);

    useEffect(() => {
        if (hasFetched) return;

        // If the order_id is missing from the URL (e.g. the place-order response didn't include
        // one), DON'T bounce to home when we have a just-placed order saved in localStorage —
        // show the success page from that instead. Only redirect home if there's truly nothing.
        if (!orderId) {
            const saved = localStorage.getItem('last_order_summary');
            if (saved) {
                try { setOrderData(JSON.parse(saved)); } catch { /* ignore */ }
                setIsLoading(false);
                localStorage.removeItem('last_order_summary');
                setHasFetched(true);
            } else {
                router.push(lp("/"));
            }
            return;
        }

        // Try to load from localStorage first for instant display
        const savedData = localStorage.getItem('last_order_summary');
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                if (String(parsed.order_id) === String(orderId)) {
                    setOrderData(parsed);
                    setIsLoading(false);
                }
            } catch (e) {
                console.error("Error parsing saved order data", e);
            }
        }

        const getSuccessData = async () => {
            setHasFetched(true);
            try {
                const data = await fetchCheckoutSuccess(orderId);
                setOrderData(data);
                localStorage.removeItem('last_order_summary');
            } catch (error: any) {
                console.error("Success Data Error:", error);
                if (!orderData) toast.error(t("orderDetails.failedLoadDetails"));
            } finally {
                setIsLoading(false);
            }
        };

        getSuccessData();
    }, [orderId, fetchCheckoutSuccess, router, hasFetched, orderData]);

    if (isLoading) {
        return <CheckoutSuccessSkeleton />;
    }

    return (
        <div className="bg-white min-h-screen font-sans flex flex-col">


            <main className="flex-grow flex flex-col items-center justify-center px-4 py-8 sm:py-12 md:py-20 text-center">
                <div className="max-w-2xl mx-auto space-y-4 sm:space-y-5 md:space-y-6">
                    <h1 className="text-h2 sm:text-h1-sm md:text-h1 lg:text-h1-lg font-bold text-black uppercase tracking-tight leading-tight">
                        {t("checkoutSuccess.thankYou")}
                    </h1>

                    <div className="space-y-2">
                        <p className="text-body-lg sm:text-h3-sm md:text-subheading text-black">
                            {t("checkoutSuccess.orderNumber")} <span className="font-bold">{orderData?.order_increment_id || "..."}</span>.
                        </p>
                        <p className="text-body sm:text-body-lg md:text-h3-sm text-[#555] font-medium max-w-lg mx-auto leading-relaxed">
                            {t("checkoutSuccess.orderConfirmation")}
                        </p>
                    </div>

                    <div className="pt-4 sm:pt-6 md:pt-8">
                        <Link
                            href={lp("/products")}
                            className="inline-block w-full sm:w-auto px-6 sm:px-12 py-3 sm:py-3.5 bg-brand-yellow text-black text-body font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-all shadow-sm rounded-sm"
                        >
                            {t("checkoutSuccess.continueShopping")}
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default CheckoutSuccessPage;
