"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { useEffect, useState, useMemo } from "react";
import { useCart } from "@/modules/cart/hooks/useCart";
import { useCheckout } from "@/modules/checkout/hooks/useCheckout";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import toast from "react-hot-toast";
import { MultiLocationDeliverySkeleton } from "@/components/skeletons";

/**
 * State structure for quantity assignments:
 * assignments[itemId][addressId] = quantity
 */
type Assignments = Record<number, Record<string, number>>;

// Items and addresses exactly as Magento's multi-address checkout returns them
// (kleverMultishippingStart, Store header = selected website + language).
interface MultiItem { item_id: number; name: string; sku: string; qty: number }
interface MultiAddress { id: string; street: string; city: string; region: string; postcode: string; country_id: string }

const MultiLocationDeliveryPage: React.FC = () => {
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
    const { cart, isLoading: isCartLoading, refetchCart } = useCart();
    const {
        addresses,
        refetchAddresses,
        isLoading: isCheckoutLoading,
        assignMultiShipping,
        startMultiShipping
    } = useCheckout({ skipInitialFetch: true });

    const [isAssigning, setIsAssigning] = useState(false);

    const [assignments, setAssignments] = useState<Assignments>({});

    const [isInitialized, setIsInitialized] = useState(false);
    const [startRequested, setStartRequested] = useState(false);
    const [isStarting, setIsStarting] = useState(true);
    const [startError, setStartError] = useState<string | null>(null);
    const [items, setItems] = useState<MultiItem[]>([]);
    const [msAddresses, setMsAddresses] = useState<MultiAddress[]>([]);

    useEffect(() => {
        refetchCart();
        refetchAddresses();
    }, [refetchCart, refetchAddresses]);

    // Start Magento's multi-address checkout once the cart has items. Magento decides
    // whether the cart can be shipped to multiple addresses and which items/addresses
    // take part; its error (e.g. quantity limits) is shown as-is.
    useEffect(() => {
        if (startRequested || isCartLoading) return;
        if (!cart?.items || cart.items.length === 0) { setIsStarting(false); return; }
        setStartRequested(true);
        startMultiShipping()
            .then((data: any) => {
                if (!Array.isArray(data?.items) || data.items.length === 0) throw new Error(t("multi.startFailed"));
                setItems((data.items || []).map((i: any) => ({
                    item_id: Number(i.quote_item_id), name: i.name || "", sku: i.sku || "", qty: Number(i.qty) || 0,
                })));
                setMsAddresses((data.addresses || []).map((a: any) => ({
                    id: String(a.customer_address_id), street: a.street || "", city: a.city || "",
                    region: a.region || "", postcode: a.postcode || "", country_id: a.country_id || "",
                })));
                if (!Array.isArray(data.addresses) || data.addresses.length === 0) {
                    setStartError(t("multi.noAddresses"));
                }
            })
            .catch((err: Error) => setStartError(err.message || t("multi.startFailed")))
            .finally(() => setIsStarting(false));
    }, [startMultiShipping, cart, isCartLoading, startRequested, t]);

    // Like Magento: every unit starts on the customer's default shipping address. Without
    // a default address nothing is pre-assigned — the customer assigns the quantities.
    useEffect(() => {
        if (isInitialized || items.length === 0 || msAddresses.length === 0 || isCheckoutLoading) return;
        const defaultId = addresses.find(a => a.isDefault)?.id;
        const initial: Assignments = {};
        items.forEach(item => {
            initial[item.item_id] = {};
            msAddresses.forEach(addr => {
                initial[item.item_id][addr.id] = addr.id === defaultId ? item.qty : 0;
            });
        });
        setAssignments(initial);
        setIsInitialized(true);
    }, [items, msAddresses, addresses, isCheckoutLoading, isInitialized]);

    const handleQtyChange = (itemId: number, addressId: string, value: string) => {
        const prevVal = assignments[itemId]?.[addressId] ?? 0;

        // Remove non-numeric characters
        let cleanedValue = value.replace(/[^0-9]/g, "");

        // Logic to replace 0: if previous was 0 and we have a new digit, take the new digit
        if (prevVal === 0 && cleanedValue.length > 0) {
            // If the user typed something and it was 0, we want to replace the 0
            // E.g. "01" -> "1", "10" -> "1"
            if (cleanedValue.length > 1) {
                // Find the character that isn't the original '0'
                // Or more simply: if it has '0', strip it once
                cleanedValue = cleanedValue.replace("0", "");
            }
        }

        const numVal = parseInt(cleanedValue) || 0;

        setAssignments(prev => ({
            ...prev,
            [itemId]: {
                ...(prev[itemId] || {}),
                [addressId]: numVal
            }
        }));
    };

    const handleAddressSelect = (itemId: number, addressId: string) => {
        setAssignments(prev => {
            const newAssignments: Record<string, number> = {};

            // Set all to 0 first
            msAddresses.forEach(addr => {
                newAssignments[addr.id] = 0;
            });

            // The whole quantity of the item goes to the clicked address
            newAssignments[addressId] = items.find(i => i.item_id === itemId)?.qty ?? 0;

            return {
                ...prev,
                [itemId]: newAssignments
            };
        });
    };

    const validation = useMemo(() => {
        if (items.length === 0 || msAddresses.length === 0) return { isValid: false, perItem: {} };

        let allValid = true;
        const perItem: Record<number, boolean> = {};

        items.forEach(item => {
            const itemAssignments = assignments[item.item_id] || {};
            const totalAssigned = Object.values(itemAssignments).reduce((sum, q) => sum + q, 0);
            const isItemValid = totalAssigned === item.qty;
            perItem[item.item_id] = isItemValid;
            if (!isItemValid) {
                allValid = false;
            }
        });

        return { isValid: allValid, perItem };
    }, [items, msAddresses, assignments]);

    const handleProceed = async () => {
        if (!validation.isValid || items.length === 0) return;

        try {
            setIsAssigning(true);

            // Format assignments for API
            const apiAssignments: Array<{ quote_item_id: number, customer_address_id: number | string, qty: number }> = [];

            items.forEach(item => {
                const itemAssignments = assignments[item.item_id] || {};
                Object.entries(itemAssignments).forEach(([addressId, qty]) => {
                    if (qty > 0) {
                        apiAssignments.push({
                            quote_item_id: item.item_id,
                            customer_address_id: addressId,
                            qty: qty
                        });
                    }
                });
            });

            if (apiAssignments.length === 0) {
                toast.error(t("multi.assignError"));
                return;
            }

            await assignMultiShipping(apiAssignments);

            // On success — keep what Magento accepted for the next steps
            localStorage.setItem('multi_shipping_assignments', JSON.stringify(assignments));
            localStorage.setItem('multi_shipping_items', JSON.stringify(items));
            localStorage.removeItem('multi_shipping_methods');
            toast.success(t("multi.assignSuccess"));
            router.push(lp('/multi-location-delivery/shipping'));
        } catch (err: any) {
            console.error("Assignment error:", err);
            toast.error(err.message || t("multi.assignFailed"));
        } finally {
            setIsAssigning(false);
        }
    };

    const isReadyToProceed = validation.isValid && !isAssigning;
    // The error column exists only while at least one row's assigned qty is wrong (as Magento).
    const hasQtyError = items.some(item => validation.perItem[item.item_id] === false);

    if (isCartLoading || isStarting || (isCheckoutLoading && !isAssigning)) {
        return <MultiLocationDeliverySkeleton />;
    }

    // EMPTY CART STATE - Matching User Screenshot exactly
    if (!cart?.items || cart.items.length === 0) {
        return (
            <div className="bg-white min-h-screen font-sans">

                <div className="max-w-[1440px] mx-auto py-12 md:py-24 px-3 sm:px-4 flex flex-col items-center text-center">
                    <h1 className="text-h3 sm:text-h2 md:text-h1-sm font-black text-black uppercase mb-8 md:mb-12 tracking-wide">
                        {t("multi.shoppingCart")}
                    </h1>

                    <div className="relative mb-8">
                        <ShoppingCart size={60} strokeWidth={1.5} className="text-black sm:w-[80px] sm:h-[80px]" />
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
                            <div className="bg-white border-2 border-black rounded-full w-8 h-8 flex items-center justify-center font-black text-black text-subheading">
                                !
                                <div className="absolute inset-0 rounded-full border border-white"></div>
                            </div>
                        </div>
                    </div>

                    <h2 className="text-body sm:text-body-xl md:text-h4 font-bold text-black uppercase tracking-tight mb-6 md:mb-8">
                        {t("multi.emptyCart")}
                    </h2>

                    <Link
                        href={lp("/")}
                        className="bg-brand-yellow text-black px-8 sm:px-10 md:px-12 py-3.5 md:py-4 text-label sm:text-body-sm md:text-body font-black uppercase tracking-[0.1em] hover:bg-black hover:text-white transition-all shadow-md"
                    >
                        {t("multi.continueShopping")}
                    </Link>
                </div>
            </div>
        );
    }

    // Location label of the address column, as Magento's multi-address page shows it (the
    // address city from Magento's start response) — no placeholder text.
    const getAddressLocation = (addr: MultiAddress) => addr.city;

    if (startError) {
        return (
            <div className="bg-white min-h-screen font-sans">
                <div className="max-w-[1440px] mx-auto py-12 md:py-24 px-3 sm:px-4 flex flex-col items-center text-center">
                    <h1 className="text-subheading sm:text-[22px] md:text-[26px] font-black text-black uppercase tracking-normal mb-6">
                        {t("multi.shipToMultiple")}
                    </h1>
                    <p className="text-body md:text-body-lg font-bold text-[#ff0000] mb-8 max-w-2xl">{startError}</p>
                    <Link
                        href={lp("/checkout/cart")}
                        className="bg-black text-white px-6 md:px-10 py-3.5 md:py-4 text-label font-black uppercase tracking-[0.1em] hover:bg-zinc-900 transition-colors"
                    >
                        {t("multi.backToCart")}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white min-h-screen font-sans pb-16 md:pb-32">


            <div className="max-w-[1920px] mx-auto py-6 sm:py-8 md:py-12 px-3 sm:px-6 lg:px-10">
                {/* Heading Block */}
                <div className="text-center mb-6 md:mb-10">
                    <h1 className="text-subheading sm:text-[22px] md:text-[26px] font-black text-black uppercase tracking-normal mb-1">
                        {t("multi.shipToMultiple")}
                    </h1>
                    <p className="text-body-sm sm:text-body md:text-body-lg text-black font-medium">
                        {t("multi.assignNote")}
                    </p>
                </div>

                {/* Main Table Structure */}
                <div className="relative border border-gray-300 overflow-hidden bg-white">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse border-spacing-0 min-w-max">
                            <thead>
                                {/* Top Header Row */}
                                <tr>
                                    <th
                                        className="py-3 md:py-4 px-3 md:px-5 text-left text-label sm:text-body-sm md:text-body font-black uppercase text-black border-r border-b border-gray-300 w-[160px] md:w-[220px] bg-white align-middle"
                                    >
                                        {t("multi.product")}
                                    </th>
                                    <th className="py-3 md:py-4 px-2 md:px-4 text-center text-label sm:text-body-sm md:text-body font-black uppercase text-black border-r border-b border-gray-300 w-[80px] md:w-[110px] bg-white">
                                        {t("multi.cartQty")}
                                    </th>
                                    <th
                                        className="py-3 md:py-4 px-2 md:px-4 text-center text-label sm:text-body-sm md:text-body font-black uppercase text-black border-b border-gray-300 bg-white"
                                        colSpan={msAddresses.length + (hasQtyError ? 1 : 0)}
                                    >
                                        {t("multi.assignQty")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const isItemValid = validation.perItem[item.item_id];
                                    return (
                                        <tr key={item.item_id} className="group">
                                            {/* Column 1: Product Information */}
                                            <td className="py-3 md:py-6 px-3 md:px-5 border-r border-b group-last:border-b-0 border-gray-300 align-middle">
                                                <span className="text-body-sm md:text-body-lg font-bold text-black leading-tight max-w-[200px] uppercase block">
                                                    {item.name}
                                                </span>
                                            </td>

                                            {/* Column 2: Cart Qty Box */}
                                            <td className="py-3 md:py-6 px-2 md:px-4 border-r border-b group-last:border-b-0 border-gray-300 align-middle">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-caption md:text-label font-bold text-black mb-1.5 md:mb-2 uppercase tracking-tighter">{t("multi.qty")}</span>
                                                    <div className="w-[40px] md:w-[50px] h-[34px] md:h-[38px] flex items-center justify-center border border-gray-300 text-gray-400 font-bold bg-white text-body md:text-body-lg">
                                                        {item.qty}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Dynamic Address Columns */}
                                            {msAddresses.map((addr, addrIndex) => {
                                                const currentVal = assignments[item.item_id]?.[addr.id] ?? 0;
                                                const cityLabel = getAddressLocation(addr);
                                                return (
                                                    <td
                                                        key={addr.id}
                                                        className={`py-3 md:py-6 px-2 md:px-4 border-b group-last:border-b-0 border-gray-300 ${addrIndex < msAddresses.length - 1 ? 'border-r' : ''} align-middle cursor-pointer transition-colors ${currentVal > 0 ? 'bg-brand-yellow/5' : 'hover:bg-gray-50'}`}
                                                        onClick={() => handleAddressSelect(item.item_id, addr.id)}
                                                    >
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-caption md:text-label font-bold text-black mb-1.5 md:mb-2 uppercase tracking-tighter">{cityLabel}</span>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={currentVal === 0 ? "0" : currentVal}
                                                                onChange={(e) => handleQtyChange(item.item_id, addr.id, e.target.value)}
                                                                onFocus={(e) => {
                                                                    if (currentVal === 0) {
                                                                        // Instead of clearing, we can select the text so typing replaces it
                                                                        e.target.select();
                                                                    }
                                                                }}
                                                                onBlur={(e) => {
                                                                    if (e.target.value === "" || isNaN(parseInt(e.target.value))) {
                                                                        handleQtyChange(item.item_id, addr.id, "0");
                                                                    }
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`w-[40px] md:w-[50px] h-[34px] md:h-[38px] text-center text-body md:text-body-lg font-bold border transition-all rounded-none outline-none focus:ring-1 focus:ring-black
                                                                    ${currentVal > 0 ? 'border-black bg-white' : 'border-gray-300 bg-gray-50'}`}
                                                            />
                                                        </div>
                                                    </td>
                                                );
                                            })}

                                            {/* Validation Row Message */}
                                            {/* Error box only on a row whose assigned qty differs from the cart qty (as Magento);
                                                without any wrong row the column is not rendered, so no empty space remains. */}
                                            {hasQtyError && (
                                                <td className={`py-3 md:py-6 px-2 md:px-4 align-middle bg-white w-[140px] md:w-[300px] ${!isItemValid ? 'border-l border-b group-last:border-b-0 border-gray-300' : ''}`}>
                                                    {!isItemValid && (
                                                        <div className="text-[#ff0000] text-label font-bold leading-[1.3] text-center whitespace-pre-line uppercase tracking-tight">
                                                            {t("multi.qtyMismatch")}
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer Section */}
                <div className="mt-6 md:mt-8 bg-surface-muted p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6 border border-gray-100">
                    <Link
                        href={lp("/checkout/cart")}
                        className="w-full sm:w-auto text-center bg-black text-white px-6 md:px-10 py-3.5 md:py-4 text-label font-black uppercase tracking-[0.1em] hover:bg-zinc-900 transition-colors"
                    >
                        {t("multi.backToCart")}
                    </Link>

                    <button
                        onClick={handleProceed}
                        disabled={!isReadyToProceed || isAssigning}
                        className={`w-full sm:w-auto justify-center px-6 md:px-10 py-3.5 md:py-4 text-label font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2
                            ${isReadyToProceed
                                ? 'bg-brand-yellow text-black hover:bg-black hover:text-white cursor-pointer'
                                : 'bg-brand-yellow/60 text-black/40 cursor-not-allowed'
                            }
                        `}
                    >
                        {isAssigning ? (
                            <>
                                {t("multi.processing")}
                            </>
                        ) : (
                            t("multi.proceedToShipping")
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MultiLocationDeliveryPage;

