"use client";

import { useState, useMemo } from "react";
import { formatPrice } from "@/utils/helpers";
import { toast } from "react-hot-toast";
import { getAuthToken } from "@/lib/api/api-client";
import Drawer from "./Drawer";
import Price from "./Price";
import { useTranslation } from "@/hooks/useTranslation";


interface ProductEnquiryModalProps {
    productSku: string;
    productName: string;
    productPrice: number | string;
    isOpen: boolean;
    onClose: () => void;
}

export default function ProductEnquiryModal({
    productSku,
    productName,
    productPrice,
    isOpen,
    onClose,
}: ProductEnquiryModalProps) {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        quantity: "1",
        comment: "",
        notifyStock: true,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Derived product details for display
    const productDetails = useMemo(() => {
        if (!productName) return { brand: "N/A", size: "N/A", pattern: "N/A", year: "N/A" };

        const parts = productName.split(" ");
        if (parts.length < 4) {
            return { brand: parts[0] || "N/A", size: "N/A", pattern: "N/A", year: "N/A" };
        }

        const brand = parts[0];
        const year = parts[parts.length - 1];
        const pattern = parts[parts.length - 2];
        const size = parts.slice(1, parts.length - 2).join(" ");

        return { brand, size, pattern, year };
    }, [productName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (parseInt(formData.quantity) <= 0) {
            toast.error(t("inquiry.qtyError"));
            return;
        }

        setIsSubmitting(true);

        try {
            const token = await getAuthToken();

            const payload = {
                productSku,
                productName,
                qty: parseInt(formData.quantity),
                comment: formData.comment,
                notifyStock: formData.notifyStock
            };

            const response = await fetch("/api/kleverapi/enquiry", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Something went wrong");
            }

            toast.success(t("inquiry.enquirySuccess"));
            onClose();
            // Reset form
            setFormData({
                quantity: "1",
                comment: "",
                notifyStock: true,
            });
        } catch (error: any) {
            console.error("Enquiry submission error:", error);
            toast.error(error.message || t("inquiry.failed"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={t("inquiry.title")}
            widthClassName="h-screen w-full md:w-[400px] overflow-x-hidden"
        >
            <div className="flex flex-col h-full bg-white font-rubik text-body">
                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Product Info Section */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-body font-bold text-black uppercase tracking-wide block mb-1">{t("inquiry.name")}</label>
                            <p className="text-body-lg font-semibold text-black/85 leading-snug">
                                {productName}
                            </p>
                        </div>

                        <div>
                            <label className="text-body font-bold text-black uppercase tracking-wide block mb-1">{t("inquiry.price")}</label>
                            <div className="text-[16px] font-bold text-black price currency-riyal">
                                <Price amount={productPrice} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5">
                        {/* Quantity */}
                        <div className="space-y-1.5">
                            <label className="text-body font-bold text-black uppercase tracking-wide block">{t("inquiry.orderQuantity")}</label>
                            <input
                                required
                                type="number"
                                min="1"
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded outline-none focus:border-brand-yellow transition-all text-body font-medium shadow-sm"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            />
                        </div>

                        {/* Comment */}
                        <div className="space-y-1.5">
                            <label className="text-body font-bold text-black uppercase tracking-wide block">{t("inquiry.notesComments")}</label>
                            <textarea
                                rows={4}
                                placeholder={t("inquiry.placeholder")}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded outline-none focus:border-brand-yellow transition-all text-body font-medium resize-none shadow-sm min-h-[100px]"
                                value={formData.comment}
                                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                            />
                        </div>

                        {/* Checkbox */}
                        <div className="py-1">
                            <label className="flex items-center gap-3 cursor-pointer group select-none">
                                <input
                                    type="checkbox"
                                    className="h-4.5 w-4.5 cursor-pointer accent-brand-yellow rounded border-gray-300 transition-all"
                                    checked={formData.notifyStock}
                                    onChange={(e) => setFormData({ ...formData, notifyStock: e.target.checked })}
                                />
                                <span className="text-body-sm font-semibold text-black">
                                    {t("inquiry.notifyStock")}
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* SUBMIT BUTTON */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3.5 bg-brand-yellow hover:bg-black hover:text-white text-black font-bold uppercase tracking-[0.1em] rounded transition-all duration-300 text-body shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[46px] border border-brand-yellow hover:border-black cursor-pointer"
                        >
                            {isSubmitting ? (
                                t("common.loading")
                            ) : (
                                t("inquiry.submitEnquiry")
                            )}
                        </button>
                    </div>

                    {/* <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-4 text-center text-xs font-black text-gray-400 hover:text-gray-900 uppercase tracking-widest transition-colors mt-2 cursor-pointer"
                    >
                        Close Panel
                    </button> */}
                </form>
            </div>
        </Drawer>
    );
}
