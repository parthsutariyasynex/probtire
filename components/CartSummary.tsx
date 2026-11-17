"use client";
import { useLocalePath } from "@/hooks/useLocalePath";
import { useTranslation } from "@/hooks/useTranslation";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Price from "@/app/components/Price";
import { useCart } from "@/modules/cart/hooks/useCart";
import { useMagentoLabel } from "@/hooks/useMagentoLabel";

interface CartSummaryProps {
    subtotal: number;
    taxAmount: number;
    /** Magento's tax rate name(s) — not shown: Magento's cart titles the row with its "Tax" translation. */
    taxLabel?: string;
    grandTotal: number;
    currencyCode: string;
    discountAmount?: number;
    /** Magento's discount label(s) for this cart. */
    discountLabel?: string;
    /** Coupon applied to this website's Magento cart. */
    appliedCoupon?: string | null;
    shippingAmount?: number;
}

const CartSummary: React.FC<CartSummaryProps> = ({
    subtotal,
    taxAmount,
    grandTotal,
    currencyCode,
    discountAmount = 0,
    discountLabel = "",
    appliedCoupon = null,
    shippingAmount,
}) => {
    const router = useRouter();
    const lp = useLocalePath();
    const { t } = useTranslation();
    const [couponCode, setCouponCode] = useState("");
    const [isCouponBusy, setIsCouponBusy] = useState(false);
    const { applyCoupon, removeCoupon } = useCart();

    // Apply / cancel the coupon on this website's Magento cart; Magento's message on failure.
    const handleCoupon = async () => {
        if (isCouponBusy) return;
        if (!appliedCoupon && !couponCode.trim()) return;
        setIsCouponBusy(true);
        try {
            if (appliedCoupon) {
                await removeCoupon();
                setCouponCode("");
                toast.success(t("cart.couponRemoved"));
            } else {
                await applyCoupon(couponCode.trim());
                toast.success(t("cart.couponApplied"));
            }
        } catch (err: any) {
            toast.error(err?.message || t("cart.couponFailed"));
        } finally {
            setIsCouponBusy(false);
        }
    };
    // The tax row title exactly as Magento's cart/checkout shows it: Magento's "Tax" translation
    // for this store view (e.g. "VAT (15%)"), not the tax rate's name.
    const displayTaxLabel = useMagentoLabel("Tax", t("cart.vat"));

    return (
        <div className="sm:sticky sm:top-28 self-start bg-white border border-[#ddd] rounded-sm shadow-sm overflow-hidden">

            {/* Header — centered */}
            <div className="bg-[#e9e9eb] px-6 py-4 border-b border-[#ddd] text-center">
                <h2 className="text-[14px] font-[800] text-black uppercase tracking-widest">
                    {t("m.summary")}
                </h2>
            </div>

            <div className="px-5 pt-2 pb-5 flex flex-col">

                {/* Price rows */}
                <div>

                    {/* Subtotal */}
                    <div className="flex justify-between items-center py-3">
                        <span className="text-[13px] font-[800] text-black tracking-normal">
                            {t("cart.subtotal")}
                        </span>
                        <span className="text-[14px] font-[800] text-black">
                            <Price amount={subtotal} />
                        </span>
                    </div>

                    {/* Discount — only shown when > 0 */}
                    {discountAmount > 0 && (
                        <div className="flex justify-between items-center py-3">
                            <span className="text-[13px] font-[800] text-green-600 tracking-normal">
                                {discountLabel || t("m.discount")}
                            </span>
                            <span className="text-[14px] font-[800] text-green-600">
                                −&nbsp;<Price amount={discountAmount} />
                            </span>
                        </div>
                    )}

                    {/* VAT */}
                    <div className="flex justify-between items-center py-3">
                        <span className="text-[13px] font-[800] text-black tracking-normal">
                            {displayTaxLabel}
                        </span>
                        <span className="text-[14px] font-[800] text-black">
                            <Price amount={taxAmount} />
                        </span>
                    </div>

                    {/* Shipping — only when the cart has a Magento shipping amount (as on Magento's
                        cart page, which shows no shipping line before a method is chosen) */}
                    {shippingAmount != null && (
                        <div className="flex justify-between items-center py-3">
                            <span className="text-[13px] font-[800] text-black tracking-normal">
                                {t("m.shipping")}
                            </span>
                            <span className="text-[14px] font-[800] text-black">
                                <Price amount={shippingAmount} />
                            </span>
                        </div>
                    )}
                </div>

                {/* Grand Total — boxed by borders */}
                <div className="flex justify-between items-center py-3 border-y border-[#ddd] my-2">
                    <span className="text-[13px] font-[800] text-black tracking-normal">
                        {t("common.grandTotal")}
                    </span>
                    <Price
                        amount={grandTotal}
                        symbolClassName="text-[14px] mr-1 font-[800] text-black"
                        className="font-[800] text-black text-[16px] tracking-tight"
                    />
                </div>

                {/* Coupon Code */}
                <div className="mt-3 flex flex-col gap-2">
                    <label className="text-[11px] font-[800] text-black uppercase tracking-wider">
                        {t("m.coupon-code")}
                    </label>
                    <div className="flex items-stretch h-[40px]">
                        <input
                            type="text"
                            value={appliedCoupon ?? couponCode}
                            onChange={(e) => setCouponCode(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCoupon(); }}
                            readOnly={!!appliedCoupon}
                            disabled={isCouponBusy}
                            placeholder={t("m.enter-discount-code")}
                            className="flex-1 min-w-0 px-4 text-xs font-semibold text-black bg-white border border-gray-300 rounded-l-sm focus:border-black focus:outline-none transition-all placeholder:text-gray-400 placeholder:font-normal"
                        />
                        <button
                            type="button"
                            onClick={handleCoupon}
                            disabled={isCouponBusy || (!appliedCoupon && !couponCode.trim())}
                            className="px-5 bg-[#7a7a7a] text-white text-[11px] font-[800] uppercase tracking-wider hover:bg-[#666666] transition-all cursor-pointer rounded-r-sm flex items-center justify-center shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {appliedCoupon ? t("m.cancel") : t("m.apply")}
                        </button>
                    </div>
                </div>

                {/* Proceed to Checkout */}
                <div className="mt-4">
                    <button
                        onClick={() => router.push(lp("/checkout"))}
                        className="w-full py-3.5 bg-brand-yellow text-black text-[13px] font-[800] uppercase tracking-[0.1em] hover:bg-black hover:text-white active:scale-[0.98] transition-all duration-300 shadow-md rounded-sm flex items-center justify-center gap-2"
                    >
                        {t("cart.proceedCheckout")} »
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CartSummary;
