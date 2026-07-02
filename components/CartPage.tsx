"use client";

import React from "react";
import CartItem from "./CartItem";
import CartSummary from "./CartSummary";
import CartActions from "./CartActions";
import Navbar from "@/app/components/Navbar";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { useCart } from "@/modules/cart/hooks/useCart";
import { useCheckout } from "@/modules/checkout/hooks/useCheckout";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";
import { CartPageSkeleton } from "@/components/skeletons";
import { useLoadingOverlay } from "@/contexts/LoadingOverlayContext";

const CartPage: React.FC = () => {
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
    const { cart, isLoading, error, removeFromCart, updateCartItem, clearCart, refetchCart } = useCart();
    const { startMultiShipping } = useCheckout({ skipInitialFetch: true });
    const [pendingQtys, setPendingQtys] = React.useState<Record<number, number>>({});
    const [isStartingMultiShipping, setIsStartingMultiShipping] = React.useState(false);
    const { showLoading, hideLoading } = useLoadingOverlay();

    const handleUpdateQty = (id: number, qty: number) => {
        setPendingQtys(prev => ({ ...prev, [id]: qty }));
    };

    const handleRemove = async (id: number) => {
        showLoading("REMOVING ITEM...");
        try {
            await removeFromCart(id);
            if (pendingQtys[id]) {
                const newPending = { ...pendingQtys };
                delete newPending[id];
                setPendingQtys(newPending);
            }
            toast.success(t("cart.itemRemoved"));
        } catch (err) {
            toast.error(t("cart.itemRemovalFailed"));
        } finally {
            hideLoading();
        }
    };

    const handleUpdateCart = async () => {
        const updateIds = Object.keys(pendingQtys);
        showLoading("UPDATING CART...");
        try {
            if (updateIds.length === 0) {
                await refetchCart();
                toast.success(t("cart.updated"));
                return;
            }
            for (const id of updateIds) {
                await updateCartItem(Number(id), pendingQtys[Number(id)]);
            }
            setPendingQtys({});
            await refetchCart();
            toast.success(t("cart.updated"));
        } catch (err) {
            toast.error(t("cart.updateFailed"));
        } finally {
            hideLoading();
        }
    };

    const handleClearCart = async () => {
        showLoading("CLEARING CART...");
        try {
            await clearCart();
            toast.success(t("cart.cartCleared"));
        } catch (err) {
            toast.error(t("cart.updateFailed"));
        } finally {
            hideLoading();
        }
    };

    const handleStartMultiShipping = async () => {
        if (!cart?.items || cart.items.length === 0) return;
        showLoading("PROCESSING...");
        try {
            setIsStartingMultiShipping(true);
            await startMultiShipping();
        } catch (err: any) {
            console.warn("Multi-shipping start warning (proceeding):", err.message);
        } finally {
            hideLoading();
        }
        toast.success(t("cart.startingMultiLocation"));
        router.push(lp("/multi-location-delivery"));
        setIsStartingMultiShipping(false);
    };

    if (isLoading) {
        return <CartPageSkeleton />;
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
                <h2 className="text-xl font-bold text-red-600 mb-2">{t("checkout.error")}</h2>
                <p className="text-gray-500 mb-6">{error}</p>
                <button onClick={refetchCart} className="bg-black text-white px-6 py-2 rounded font-bold">{t("common.tryAgain")}</button>
            </div>
        );
    }

    const hasItems = cart && cart.items && cart.items.length > 0;

    if (!hasItems) {
        return (
            <div className="bg-white min-h-screen">
                <div className="max-w-7xl mx-auto py-12 md:py-24 px-4 md:px-6 text-center">
                    <ShoppingBag size={64} className="mx-auto text-gray-200 mb-6" />
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 uppercase tracking-widest mb-4">
                        {t("cart.noItems")}
                    </h1>
                    <Link href={lp("/products")} className="inline-flex items-center gap-2 text-yellow-600 font-bold hover:underline">
                        {t("cart.goToProducts")}
                        <ArrowRight size={16} />
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FDFDFD] pb-4 lg:pb-10">
            {/* Main Content Container */}
            <div className="w-full px-3 lg:px-12 pt-4 md:pt-8">

                {/* Breadcrumbs & Title Section */}
                <div className="mb-4 md:mb-8 text-center">
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 uppercase tracking-tight mb-2">
                        {t("cart.title")}
                    </h1>
                    <div className="h-1 w-12 bg-yellow-400 mx-auto"></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-16 items-start">

                    {/* Left Column (Items & Actions) */}
                    <div className="lg:col-span-8 xl:col-span-9 flex flex-col min-w-0">

                        <div className="flex flex-col h-full">
                            {/* Table Header (Sticky Top) */}
                            <div className="hidden lg:flex sticky top-0 z-20 bg-white border border-[#ddd] rounded-sm items-center py-4 px-10 mb-3 shadow-sm">
                                <div className="w-[45%] text-caption font-bold text-black uppercase tracking-widest">{t("cart.itemDescription")}</div>
                                <div className="w-[15%] text-caption font-bold text-black uppercase tracking-widest text-center">{t("cart.price")}</div>
                                <div className="w-[20%] text-caption font-bold text-black uppercase tracking-widest text-center">{t("cart.qty")}</div>
                                <div className="w-[20%] text-caption font-bold text-black uppercase tracking-widest text-right">{t("cart.total")}</div>
                            </div>

                            {/* Scrollable Items Container */}
                            <div className="flex-1 custom-scrollbar space-y-3 pb-4">
                                {cart.items.map((item) => (
                                    <CartItem
                                        key={item.item_id}
                                        item={item}
                                        currencyCode={cart.currency_code}
                                        onUpdateQty={handleUpdateQty}
                                        onRemove={handleRemove}
                                    />
                                ))}
                            </div>

                            {/* Actions Bar */}
                            <div className="mt-6">
                                <div className="space-y-4">
                                    <CartActions
                                        itemsCount={cart.items_count}
                                        onClearCart={handleClearCart}
                                        onUpdateCart={handleUpdateCart}
                                    />

                                    {/* Multiple Address Section Bar */}
                                    <div className="border border-[#FFC107] bg-white rounded-sm flex flex-col md:flex-row items-stretch justify-between overflow-hidden shadow-xl shadow-yellow-400/5">
                                        <div className="px-6 py-4 flex items-center bg-gray-50/50 flex-1">
                                            <h4 className="text-caption font-bold text-gray-900 uppercase tracking-wider">{t("cart.multiAddressShipping")}</h4>
                                        </div>
                                        <button
                                            onClick={handleStartMultiShipping}
                                            disabled={isStartingMultiShipping}
                                            className="bg-[#FFC107] text-black font-bold py-4 px-10 uppercase tracking-widest text-caption hover:bg-black hover:text-white transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed w-full md:w-auto shadow-none"
                                        >
                                            {isStartingMultiShipping ? (
                                                t("common.loading")
                                            ) : (
                                                t("cart.shipToMultiple")
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column (Summary): lg:col-span-4 or 3 */}
                    <div className="lg:col-span-4 xl:col-span-3 z-10 w-full">
                        <CartSummary
                            subtotal={cart.subtotal}
                            taxAmount={cart.tax_amount}
                            taxLabel={cart.tax_label}
                            grandTotal={cart.grand_total}
                            currencyCode={cart.currency_code}
                        />
                    </div>
                </div>
            </div>


            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f9fafb;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e5e7eb;
                    border-radius: 10px;
                    border: 2px solid #f9fafb;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #d1d5db;
                }
            `}</style>
        </div>
    );
};

export default CartPage;
