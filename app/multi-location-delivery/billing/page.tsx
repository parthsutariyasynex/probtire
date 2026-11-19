"use client";

import React, { useEffect, useState } from "react";
import { useCheckout, MultiShippingMethodChoice } from "@/modules/checkout/hooks/useCheckout";
import { useCountryNames } from "@/hooks/useCountryNames";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";
import { MultiLocationBillingSkeleton } from "@/components/skeletons";

const MultiShippingBillingPage: React.FC = () => {
    const router = useRouter();
    const { t } = useTranslation();
    const countryName = useCountryNames();
    const lp = useLocalePath();
    const {
        addresses,
        // Magento's multi-address billing payment methods (kleverMultishippingPaymentMethods) —
        // the same list as Magento's /multishipping/checkout/billing page for this store view.
        multiShippingPaymentMethods: paymentMethods,
        multiShippingPaymentMethodsLoaded: paymentMethodsLoaded,
        multiShippingPaymentMethodsError: paymentMethodsError,
        isLoading: isCheckoutLoading,
        setMultiShippingBillingAddress,
        startMultiShipping,
        assignMultiShipping,
        fetchMultiShippingMethods,
        setMultiShippingMethods,
        fetchMultiShippingPaymentMethods: refetchPaymentMethods
    } = useCheckout();

    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
    const [selectedPaymentCode, setSelectedPaymentCode] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Billing address: the customer's Magento default billing address. Nothing is
    // pre-selected without a default.
    useEffect(() => {
        if (addresses.length > 0 && !selectedAddressId) {
            const saved = localStorage.getItem('multi_shipping_billing_address_id');
            const preferred = addresses.find(a => a.id === saved) || addresses.find(a => a.isDefaultBilling);
            if (preferred) setSelectedAddressId(preferred.id);
        }
    }, [addresses, selectedAddressId]);

    // Magento's multi-address payment methods (after the multi-address checkout is started).
    useEffect(() => {
        refetchPaymentMethods({ startIfNeeded: true });
    }, [refetchPaymentMethods]);

    // Payment methods are exactly Magento's list for this cart and store view. The earlier
    // choice is kept while Magento still offers it; a single method is the only choice.
    useEffect(() => {
        if (paymentMethods.length === 0 || selectedPaymentCode) return;
        const saved = localStorage.getItem('multi_shipping_payment_method');
        if (saved && paymentMethods.some(m => m.code === saved)) setSelectedPaymentCode(saved);
        else if (paymentMethods.length === 1) setSelectedPaymentCode(paymentMethods[0].code);
    }, [paymentMethods, selectedPaymentCode]);

    const handleGoToReview = async () => {
        if (!selectedAddressId || !selectedPaymentCode) {
            toast.error(t("multi.selectBillingError"));
            return;
        }

        try {
            setIsSubmitting(true);

            // Re-initialize session (non-blocking — session may already be active)
            try {
                await startMultiShipping();
            } catch (startErr) {
                console.warn("Multi-shipping start warning (non-blocking):", (startErr as Error).message);
            }
            const savedAssignments = localStorage.getItem('multi_shipping_assignments');
            if (savedAssignments) {
                const assignments = JSON.parse(savedAssignments);
                const apiAssignments: Array<{ quote_item_id: number; customer_address_id: string; qty: number }> = [];
                Object.entries(assignments).forEach(([itemId, addrMap]: [string, any]) => {
                    Object.entries(addrMap).forEach(([addrId, qty]: [string, any]) => {
                        if (qty > 0) apiAssignments.push({ quote_item_id: Number(itemId), customer_address_id: addrId, qty });
                    });
                });
                if (apiAssignments.length > 0) await assignMultiShipping(apiAssignments);
            }

            // Re-apply the delivery method the customer chose on the shipping step for each
            // address (saved by customer address id). The session above was re-started, so the
            // quote address ids are new: map them from Magento's shipping-methods response.
            // Only a method Magento offers for that address is sent — nothing is invented.
            const chosenMethods: Record<string, MultiShippingMethodChoice> = JSON.parse(localStorage.getItem('multi_shipping_methods') || '{}');
            const methodsData = await fetchMultiShippingMethods();
            const methodsToSet: Record<string, MultiShippingMethodChoice> = {};
            for (const a of (Array.isArray(methodsData?.addresses) ? methodsData.addresses : [])) {
                const chosen = chosenMethods[String(a?.customer_address_id)];
                const offered = (Array.isArray(a?.methods) ? a.methods : []).some((m: any) =>
                    m.available !== false && chosen && m.carrier_code === chosen.carrier_code && m.method_code === chosen.method_code);
                if (!offered || a?.quote_address_id == null) {
                    toast.error(t("multi.selectShippingMethod"));
                    router.push(lp('/multi-location-delivery/shipping'));
                    return;
                }
                methodsToSet[String(a.quote_address_id)] = chosen;
            }
            if (Object.keys(methodsToSet).length === 0) {
                toast.error(t("multi.noShippingMethods"));
                router.push(lp('/multi-location-delivery/shipping'));
                return;
            }
            await setMultiShippingMethods(methodsToSet);

            // Set billing address and payment method on the backend
            await setMultiShippingBillingAddress(selectedAddressId, selectedPaymentCode);

            // Store selected payment method for later use in review page
            localStorage.setItem('multi_shipping_payment_method', selectedPaymentCode);
            localStorage.setItem('multi_shipping_billing_address_id', selectedAddressId);

            toast.success(t("multi.billingSaved"));
            router.push(lp('/multi-location-delivery/review'));
        } catch (err: any) {
            console.error("Billing update error:", err);
            toast.error(err.message || t("multi.billingSaveFailed"));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isCheckoutLoading && addresses.length === 0) {
        return <MultiLocationBillingSkeleton />;
    }

    const currentAddress = addresses.find(a => a.id === selectedAddressId);

    return (
        <div className="bg-white min-h-screen font-sans pb-10 md:pb-20">

            <div className="max-w-[1440px] mx-auto pt-8 md:pt-16 px-3 sm:px-4">
                <h1 className="text-h3 sm:text-h2 md:text-h1-sm font-bold text-black text-center uppercase mb-8 md:mb-16 tracking-tight">
                    {t("multi.billingInfo")}
                </h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-8 md:mb-12">
                    {/* Billing Address Block */}
                    <div className="flex flex-col bg-white border border-[#f0f0f0] shadow-sm">
                        <div className="bg-[#e9e9e9] py-3 px-4 md:px-6 text-center">
                            <h2 className="text-label font-black text-black uppercase tracking-widest leading-none">
                                {t("multi.billingAddress")}
                            </h2>
                        </div>
                        <div className="p-5 md:p-10 flex-grow min-h-[200px] md:min-h-[300px]">
                            {currentAddress ? (
                                <div className="text-body md:text-body-lg text-black leading-[1.8] font-medium">
                                    <p className="font-black text-body-lg md:text-body-xl uppercase mb-1" dir="ltr" style={{ unicodeBidi: "isolate" }}>{currentAddress.firstname} {currentAddress.lastname}</p>
                                    <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{currentAddress.company}</p>
                                    <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{currentAddress.street}</p>
                                    <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{currentAddress.city}, {currentAddress.postcode}</p>
                                    <p>{countryName(currentAddress.country_id)}</p>
                                    <p className="mt-4" dir="ltr" style={{ unicodeBidi: "isolate" }}>{t("multi.phonePrefix")} {currentAddress.telephone}</p>

                                </div>
                            ) : (
                                <p className="text-gray-400 italic">{t("multi.noAddress")}</p>
                            )}
                        </div>
                    </div>

                    {/* Payment Method Block */}
                    <div className="flex flex-col bg-white border border-[#f0f0f0] shadow-sm">
                        <div className="bg-[#e9e9e9] py-3 px-4 md:px-6 text-center">
                            <h2 className="text-label font-black text-black uppercase tracking-widest leading-none">
                                {t("multi.paymentMethod")}
                            </h2>
                        </div>
                        <div className="p-5 md:p-10 flex-grow min-h-[200px] md:min-h-[300px]">
                            <div className="space-y-4">
                                {paymentMethods.length > 0 ? (
                                    paymentMethods
                                        .map((method) => (
                                            <label
                                                key={method.code}
                                                className="flex items-center gap-3 cursor-pointer group"
                                            >
                                                <div className="relative flex items-center justify-center">
                                                    <input
                                                        type="radio"
                                                        name="payment_method"
                                                        disabled={isSubmitting}
                                                        checked={selectedPaymentCode === method.code}
                                                        onChange={() => setSelectedPaymentCode(method.code)}
                                                        className="appearance-none w-4 h-4 border-2 border-gray-300 rounded-full checked:border-brand-yellow focus:outline-none transition-all"
                                                    />
                                                    {selectedPaymentCode === method.code && (
                                                        <div className="absolute w-2 h-2 bg-brand-yellow rounded-full" />
                                                    )}
                                                </div>
                                                <span className="text-body md:text-body-lg font-black text-black uppercase tracking-tight group-hover:text-brand-yellow transition-colors mt-0.5">
                                                    {method.title}
                                                </span>
                                            </label>
                                        ))
                                ) : (
                                    paymentMethodsLoaded && (
                                        <p className="text-body md:text-body-lg font-bold text-[#ff0000]">
                                            {paymentMethodsError || t("multi.noPaymentMethods")}
                                        </p>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-surface-muted p-4 sm:p-6 md:p-8 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
                    <button
                        onClick={() => router.push(lp('/multi-location-delivery/shipping'))}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto text-center bg-black text-white px-6 md:px-10 py-3.5 md:py-4 text-label font-bold uppercase tracking-[0.15em] hover:opacity-90 transition-opacity disabled:opacity-50 font-sans"
                    >
                        {t("multi.backToShipping")}
                    </button>

                    <button
                        onClick={handleGoToReview}
                        disabled={isSubmitting || !selectedAddressId || !selectedPaymentCode}
                        className="w-full sm:w-auto justify-center bg-brand-yellow text-black px-8 md:px-12 py-3.5 md:py-4 text-label font-bold uppercase tracking-[0.15em] hover:bg-black hover:text-white transition-all shadow-sm flex items-center gap-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed font-sans"
                    >
                        {t("multi.goToReview")}
                    </button>
                </div>
            </div>

            <style jsx>{`
                .font-sans {
                    font-family: var(--font-rubik), sans-serif;
                }
            `}</style>
        </div>
    );
};

export default MultiShippingBillingPage;
