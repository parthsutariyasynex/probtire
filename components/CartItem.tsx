"use client";

import React, { useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { CartItem as CartItemType } from "@/modules/cart/hooks/useCart";
import Price from "@/app/components/Price";


import toast from "react-hot-toast";
import { useTranslation } from "@/hooks/useTranslation";

interface CartItemProps {
    item: CartItemType;
    currencyCode: string;
    onUpdateQty: (id: number, qty: number) => void;
    onRemove: (id: number) => void;
}

const CartItem: React.FC<CartItemProps> = ({ item, currencyCode, onUpdateQty, onRemove }) => {
    const { t } = useTranslation();
    const [localQty, setLocalQty] = useState(item.qty);

    const handleQtyChange = (newQty: number) => {
        if (newQty < 1) return;
        setLocalQty(newQty);
        onUpdateQty(item.item_id, newQty);
    };

    // Update local state if the prop changes (e.g. after a successful batch update)
    React.useEffect(() => {
        setLocalQty(item.qty);
    }, [item.qty]);


    return (
        <div className="relative bg-white border border-[#ddd] rounded-sm p-2 hover:shadow-xl hover:shadow-gray-100/50 transition-all duration-500 group/item">
            {/* Remove Button */}
            <button
                onClick={() => {
                    onRemove(item.item_id);
                    toast.success(t("cart.itemRemoved"), {
                        style: {
                            borderRadius: '12px',
                            background: '#fffafaff',
                            color: '#000',
                            fontSize: '9px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                        },
                    });
                }}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-gray-50 text-gray-400 rounded-full transition-all z-10 cursor-pointer hover:bg-[#FF4444] hover:text-white hover:scale-110 active:scale-95 opacity-0 group-hover/item:opacity-100 shadow-sm border border-gray-100"
                title={t("m.remove-item")}
            >
                <X size={10} strokeWidth={4} />
            </button>

            {/* Mobile Layout */}
            <div className="lg:hidden">
                <div className="flex gap-4">
                    <div className="w-20 h-20 bg-white border border-[#ddd] p-2 flex items-center justify-center rounded-lg shadow-sm">
                        <img src={item.image_url || "/images/tyre-sample.png"} alt={item.name} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                        <span className="text-caption font-bold text-yellow-600 uppercase tracking-widest mb-1 block">{t("quickOrder.title")}</span>
                        <h3 className="text-sm font-bold text-gray-900 leading-tight uppercase tracking-tight overflow-hidden text-ellipsis whitespace-nowrap" dir="ltr" style={{ unicodeBidi: "isolate" }}>{item.name}</h3>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {item.size_display && (
                                <div dir="ltr" style={{ unicodeBidi: "isolate" }} className="text-caption font-bold text-gray-500 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
                                    {item.size_display}
                                </div>
                            )}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-base font-bold text-black">
                                <Price amount={item.price} />
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-4 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <button
                            onClick={() => handleQtyChange(localQty - 1)}
                            disabled={localQty <= 1}
                            className="w-8 h-8 flex items-center justify-center hover:bg-yellow-400 font-bold transition-all disabled:opacity-20"
                        >
                            <Minus size={12} strokeWidth={3} />
                        </button>
                        <span className="w-10 h-8 flex items-center justify-center text-xs font-bold text-black">
                            {localQty}
                        </span>
                        <button
                            onClick={() => handleQtyChange(localQty + 1)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-yellow-400 font-bold transition-all disabled:opacity-20"
                        >
                            <Plus size={12} strokeWidth={3} />
                        </button>
                    </div>

                    <div className="text-right">
                        <span className="text-sm font-bold text-black">
                            <Price amount={item.row_total} />
                        </span>
                    </div>
                </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden lg:flex items-center">
                {/* Product: Image + Name (45%) */}
                <div className="w-[45%] flex items-center gap-4">
                    <div className="w-12 h-12 bg-white flex items-center justify-center flex-shrink-0">
                        <img
                            src={item.image_url || "/images/tyre-sample.png"}
                            alt={item.name}
                            className="max-w-full max-h-full object-contain"
                        />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-xs xl:text-sm font-bold text-black uppercase tracking-wide overflow-hidden text-ellipsis whitespace-nowrap" dir="ltr" style={{ unicodeBidi: "isolate" }}>{item.name}</h3>
                        {(item.size_display || item.pattern_display) && (
                            <div className="flex flex-wrap gap-1.5 mt-1 single-line-attributes">
                                {item.size_display && (
                                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-sm uppercase">
                                        {t("m.size")}: <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{item.size_display}</span>
                                    </span>
                                )}
                                {item.pattern_display && (
                                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-sm uppercase">
                                        {t("m.pattern")}: {item.pattern_display}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Price (15%) */}
                <div className="w-[15%] text-center">
                    <span className="text-xs xl:text-sm font-bold text-black">
                        <Price amount={item.price} />
                    </span>
                </div>

                {/* Qty (20%) */}
                <div className="w-[20%] flex justify-center items-center">
                    <div className="flex items-center border border-gray-200 bg-white rounded-sm shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-yellow-400 transition-all">
                        <button
                            onClick={() => handleQtyChange(localQty - 1)}
                            disabled={localQty <= 1}
                            className="w-7 h-7 flex items-center justify-center hover:bg-yellow-400 text-black transition-all disabled:opacity-20 active:scale-95"
                        >
                            <Minus size={11} strokeWidth={3} />
                        </button>
                        <div className="w-8 h-7 flex items-center justify-center border-x border-gray-50">
                            <span className="text-xs font-bold text-gray-900">{localQty}</span>
                        </div>
                        <button
                            onClick={() => handleQtyChange(localQty + 1)}
                            className="w-7 h-7 flex items-center justify-center hover:bg-yellow-400 text-black transition-all disabled:opacity-20 active:scale-95"
                        >
                            <Plus size={11} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {/* Total (20%) */}
                <div className="w-[20%] text-right pr-4">
                    <span className="text-sm xl:text-base font-bold text-black">
                        <Price amount={item.row_total} />
                    </span>
                </div>
            </div>
        </div>
    );
};

export default CartItem;
