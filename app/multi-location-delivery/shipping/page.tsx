"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useCart } from "@/modules/cart/hooks/useCart";
import { useCheckout, Address, MultiShippingMethodChoice } from "@/modules/checkout/hooks/useCheckout";
import { useCountryNames } from "@/hooks/useCountryNames";
import Price from "@/app/components/Price";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { MultiLocationShippingSkeleton } from "@/components/skeletons";

type Assignments = Record<number, Record<string, number>>;

interface AddressGroup {
    address: Address;
    items: Array<{
        name: string;
        qty: number;
        itemId: number;
    }>;
}

const MultiShippingShippingPage: React.FC = () => {
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
    const { cart, isLoading: isCartLoading } = useCart();
    const {
        addresses,
        isLoading: isCheckoutLoading,
        fetchMultiShippingMethods,
        setMultiShippingMethods,
        startMultiShipping
    } = useCheckout(); // Automatically loads addresses on mount

    const [groups, setGroups] = useState<AddressGroup[]>([]);
    const [shippingMethods, setShippingMethods] = useState<Record<string, any[]>>({});
    const [selectedMethods, setSelectedMethods] = useState<Record<string, MultiShippingMethodChoice>>({});
    const countryName = useCountryNames();
    const [isLoading, setIsLoading] = useState(true);

    // Use a ref to prevent infinite loop triggered by isCheckoutLoading changes
    const hasFetched = useRef(false);
    // Maps customer_address_id -> backend quote_address_id (from the shipping-methods
    // response) so step 4 (setMultiShippingMethods) sends dynamic quote_address_id values
    // instead of the customer_address_id the UI groups are keyed by.
    const quoteAddrByCustomerRef = useRef<Record<string, string>>({});

    useEffect(() => {
        const loadInitialData = async () => {
            // Wait for dependencies to be ready
            if (isCartLoading || isCheckoutLoading) return;

            // If already fetched, don't repeat (prevents infinite loop from hook state updates)
            if (hasFetched.current) return;

            // If data is genuinely missing after loading finished
            if (!cart?.items || addresses.length === 0) {
                setIsLoading(false);
                return;
            }

            try {
                const saved = localStorage.getItem('multi_shipping_assignments');
                const savedItems: Array<{ item_id: number; name: string }> = JSON.parse(localStorage.getItem('multi_shipping_items') || '[]');
                if (!saved || savedItems.length === 0) {
                    router.push(lp('/multi-location-delivery'));
                    return;
                }

                hasFetched.current = true;
                setIsLoading(true);

                // 1. Process Assignments into Groups
                const assignments: Assignments = JSON.parse(saved);
                const groupedMap: Record<string, AddressGroup> = {};

                Object.entries(assignments).forEach(([itemIdStr, addrQtyMap]) => {
                    const itemId = parseInt(itemIdStr);
                    const cartItem = savedItems.find(i => i.item_id === itemId);
                    if (!cartItem) return;

                    Object.entries(addrQtyMap).forEach(([addrId, qty]) => {
                        if (qty > 0) {
                            if (!groupedMap[addrId]) {
                                const address = addresses.find(a => a.id === addrId || a.id === addrId.toString());
                                if (!address) return;
                                groupedMap[addrId] = { address, items: [] };
                            }
                            groupedMap[addrId].items.push({
                                name: cartItem.name,
                                qty: qty,
                                itemId: itemId
                            });
                        }
                    });
                });

                const processedGroups = Object.values(groupedMap);
                setGroups(processedGroups);

                // 2. Fetch Shipping Methods
                try {
                    // Magento's shipping methods per quote address: { addresses: [{ customer_address_id,
                    // quote_address_id, methods: [...] }] }. Keyed by customer_address_id (the UI groups),
                    // remembering each quote_address_id for the save step.
                    const methodsData = await fetchMultiShippingMethods();
                    const normalizedMethods: Record<string, any[]> = {};
                    const custToQuoteAddr: Record<string, string> = {};
                    const errors: Record<string, string> = {};
                    const previous: Record<string, MultiShippingMethodChoice> = JSON.parse(localStorage.getItem('multi_shipping_methods') || '{}');
                    const initialSelection: Record<string, MultiShippingMethodChoice> = {};

                    for (const a of (Array.isArray(methodsData?.addresses) ? methodsData.addresses : [])) {
                        const custId = String(a.customer_address_id);
                        const all: any[] = Array.isArray(a.methods) ? a.methods : [];
                        const available = all.filter((m: any) => m.available !== false && m.carrier_code && m.method_code);
                        normalizedMethods[custId] = available;
                        if (a.quote_address_id != null) custToQuoteAddr[custId] = String(a.quote_address_id);
                        if (available.length === 0) {
                            // Magento's own reason, if it gave one.
                            errors[custId] = all.map((m: any) => m.error_message).filter(Boolean).join(" ");
                        }
                        // Keep the customer's earlier choice while Magento still offers it.
                        const prev = previous[custId];
                        const keep = prev && available.find((m: any) => m.carrier_code === prev.carrier_code && m.method_code === prev.method_code);
                        // Otherwise Magento's first available method for this address.
                        const chosen = keep || available[0];
                        if (chosen) initialSelection[custId] = { carrier_code: chosen.carrier_code, method_code: chosen.method_code };
                    }

                    quoteAddrByCustomerRef.current = custToQuoteAddr;
                    setShippingMethods(normalizedMethods);
                    setSelectedMethods(initialSelection);
                    // An address Magento cannot ship to: show Magento's reason.
                    const noMethod = Object.values(errors);
                    if (noMethod.length > 0) toast.error(noMethod.find(Boolean) || t("multi.noShippingMethods"));
                } catch (methodErr) {
                    console.error("Error fetching multi-shipping methods:", methodErr);
                    // No invented methods — tell the customer instead of offering fake ones.
                    toast.error(t("multi.noShippingMethods"));
                    setShippingMethods({});
                }
            } catch (err) {
                console.error("Error processing multi-shipping data:", err);
                toast.error(t("multi.failedLoadState"));
            } finally {
                setIsLoading(false);
            }
        };

        loadInitialData();
    }, [cart, addresses, isCartLoading, isCheckoutLoading, fetchMultiShippingMethods, router]);

    const handleSelectMethod = (addressId: string, method: MultiShippingMethodChoice) => {
        setSelectedMethods(prev => ({ ...prev, [addressId]: method }));
    };

    // Every address needs one of Magento's methods before continuing.
    const allMethodsChosen = groups.length > 0 && groups.every(g => !!selectedMethods[g.address.id]);

    if (isLoading || isCartLoading || isCheckoutLoading) {
        return <MultiLocationShippingSkeleton groups={2} />;
    }

    if (groups.length === 0) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
                <h2 className="text-xl font-bold mb-4">{t("multi.noShipping")}</h2>
                <button
                    onClick={() => router.push(lp('/multi-location-delivery'))}
                    className="bg-brand-yellow text-black px-8 py-3 font-bold uppercase"
                >
                    {t("multi.backToSelection")}
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white min-h-screen font-sans pb-10 md:pb-20">


            <div className="max-w-[1440px] mx-auto pt-6 md:pt-10 px-3 sm:px-4">
                <h1 className="text-subheading sm:text-h3 md:text-h2 font-bold text-black text-center uppercase mb-2 md:mb-3 tracking-tighter">
                    {t("multi.selectShipping")}
                </h1>


                <div className="space-y-4 md:space-y-6">
                    {groups.map((group, index) => {
                        const methods = shippingMethods[group.address.id] || [];
                        const selected = selectedMethods[group.address.id];

                        return (
                            <div key={group.address.id} className="space-y-4">
                                <p className="text-body-sm sm:text-body md:text-body-lg font-bold text-black text-center tracking-tight">
                                    {t("multi.address")} {index + 1} <span className="text-[#cccccc] font-medium">{t("common.of")} {groups.length}</span>
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                    {/* Shipping To Section */}
                                    <div className="bg-surface-muted min-h-[200px] md:min-h-[250px] flex flex-col">
                                        <div className="bg-subtle py-2.5 px-4 md:px-6 text-center">
                                            <h2 className="text-label font-bold text-black uppercase tracking-widest">
                                                {t("multi.shippingTo")}
                                            </h2>
                                        </div>
                                        <div className="p-5 md:p-10 text-body md:text-body-lg text-black leading-[1.6] flex-grow">
                                            <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{group.address.firstname} {group.address.lastname}</p>
                                            {/* <p className="mb-0.5">{group.address.company || "Company Name"}</p> */}
                                            <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{group.address.street}</p>
                                            <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{group.address.city}, {group.address.postcode}</p>
                                            <p className="mb-4">{countryName(group.address.country_id)}</p>
                                            <p dir="ltr" style={{ unicodeBidi: "isolate" }}>{t("multi.phonePrefix")} {group.address.telephone}</p>
                                        </div>
                                    </div>

                                    {/* Items Section */}
                                    <div className="bg-surface-muted min-h-[200px] md:min-h-[250px] flex flex-col">
                                        <div className="bg-subtle py-2.5 px-4 md:px-6 text-center">
                                            <h2 className="text-label font-bold text-black uppercase tracking-widest">
                                                {t("multi.items")}
                                            </h2>
                                        </div>
                                        <div className="p-0 flex-grow">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b border-[#e0e0e0]">
                                                        <th className="py-3 md:py-4 px-4 md:px-6 text-label md:text-body-sm font-black text-black">{t("multi.productName")}</th>
                                                        <th className="py-3 md:py-4 px-4 md:px-6 text-label md:text-body-sm font-black text-black text-right">{t("multi.qty")}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white">
                                                    {group.items.map((item) => (
                                                        <tr key={item.itemId} className="border-b border-surface-muted last:border-b-0">
                                                            <td className="py-3 md:py-4 px-4 md:px-6 text-body-sm md:text-body font-medium text-gray-700">
                                                                {item.name}
                                                            </td>
                                                            <td className="py-3 md:py-4 px-4 md:px-6 text-body-sm md:text-body font-medium text-gray-700 text-right">
                                                                {item.qty}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        );
                    })}
                </div>

                {/* Bottom Actions Bar */}
                <div className="mt-4 md:mt-6 bg-surface-muted p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
                    <button
                        onClick={() => router.push(lp('/multi-location-delivery'))}
                        className="w-full sm:w-auto text-center bg-black text-white px-6 md:px-8 py-3 md:py-3.5 text-label font-bold uppercase tracking-wider hover:opacity-90 transition-opacity font-sans"
                    >
                        {t("multi.backToAddresses")}
                    </button>

                    <button
                        onClick={async () => {
                            try {
                                if (!allMethodsChosen) {
                                    toast.error(t("multi.selectShippingMethod"));
                                    return;
                                }
                                // Selection is keyed by customer_address_id (the UI groups); Magento needs
                                // its quote_address_id from the shipping-methods response.
                                const methodsByQuoteAddr: Record<string, MultiShippingMethodChoice> = {};
                                for (const group of groups) {
                                    const quoteAddrId = quoteAddrByCustomerRef.current[group.address.id];
                                    if (!quoteAddrId) throw new Error(t("multi.noShippingMethods"));
                                    methodsByQuoteAddr[quoteAddrId] = selectedMethods[group.address.id];
                                }
                                await setMultiShippingMethods(methodsByQuoteAddr);
                                localStorage.setItem('multi_shipping_methods', JSON.stringify(selectedMethods));
                                router.push(lp('/multi-location-delivery/billing'));
                            } catch (err: any) {
                                console.error("Error saving shipping methods:", err);
                                toast.error(err.message || t("multi.shippingSaveFailed"));
                            }
                        }}
                        disabled={isLoading || isCheckoutLoading || !allMethodsChosen}
                        className="w-full sm:w-auto text-center bg-brand-yellow text-black px-6 md:px-10 py-3 md:py-3.5 text-label font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-all shadow-sm disabled:opacity-50 font-sans"
                    >
                        {t("multi.continueToBilling")}
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

export default MultiShippingShippingPage;
