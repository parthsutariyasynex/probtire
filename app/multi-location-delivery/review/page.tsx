"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useCart } from "@/modules/cart/hooks/useCart";
import { useCheckout, Address, MultiShippingMethodChoice } from "@/modules/checkout/hooks/useCheckout";
import { useMagentoLabel } from "@/hooks/useMagentoLabel";
import { useCountryNames } from "@/hooks/useCountryNames";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { magentoFileUrl, UPLOAD_ACCEPT, UPLOAD_TYPES_TEXT, UPLOAD_EXTENSIONS, UPLOAD_MAX_BYTES } from "@/src/lib/magentoFiles";
import Price from "@/app/components/Price";
import { MultiLocationReviewSkeleton } from "@/components/skeletons";

type Assignments = Record<number, Record<string, number>>;

interface AddressGroup {
    address: Address;
    items: Array<{
        name: string;
        qty: number;
        price: number;
        itemId: number;
    }>;
    poNumber?: string;
    orderComment?: string;
}

const MultiShippingReviewPage: React.FC = () => {
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
    const { cart, isLoading: isCartLoading, refetchCart } = useCart();
    const {
        addresses,
        // Magento's multi-address billing payment methods (same list as the billing step)
        multiShippingPaymentMethods: paymentMethods,
        multiShippingPaymentMethodsLoaded: paymentMethodsLoaded,
        fetchMultiShippingPaymentMethods,
        isLoading: isCheckoutLoading,
        placeMultiShippingOrder,
        fetchMultiShippingMethods,
        refetchTotals,
        totals,
        uploadPoFile,
        getPoUpload,
        deletePoFile
    } = useCheckout();
    const countryName = useCountryNames();
    const taxTitle = useMagentoLabel("Tax", t("cart.vat"));
    // Shipping method + amount per customer address, from Magento's quote addresses.
    const [shippingByAddress, setShippingByAddress] = useState<Record<string, { title: string; amount: number }>>({});
    const loadedRef = useRef(false);

    useEffect(() => {
        fetchMultiShippingPaymentMethods();
    }, [fetchMultiShippingPaymentMethods]);

    // Payment Commitment Upload — files are stored in Magento (kleverUploadPoFile with
    // type "payment"); the list is always re-read from Magento so names match what it stored.
    const [paymentFiles, setPaymentFiles] = useState<Array<{ name: string; url: string | null }>>([]);
    const [isUploadingPayment, setIsUploadingPayment] = useState(false);
    const paymentInputRef = useRef<HTMLInputElement>(null);


    const refreshPaymentFiles = useCallback(async () => {
        try {
            const raw: any = await getPoUpload();
            // Magento may send the list as JSON text.
            let data: any = raw;
            if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { data = [raw]; } }
            // What Magento sends for the uploaded files (to check which link it gives).
            console.info("[review] Magento payment commitment files:", data);
            const list: any[] = Array.isArray(data) ? data
                : Array.isArray(data?.files) ? data.files
                : Array.isArray(data?.data) ? data.data
                : data && typeof data === "object" ? Object.values(data) : [];

            const base = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "").replace(/\/+$/, "");
            // A link from Magento: a full address, or a path on the Magento site (/media/…).
            const toUrl = (value: unknown): string | null => {
                if (typeof value !== "string" || !value) return null;
                if (/^https?:\/\//i.test(value)) return value;
                if (/^\/?(pub\/)?media\//i.test(value) && base) return `${base}/${value.replace(/^\/+/, "").replace(/^pub\//, "")}`;
                return null;
            };
            const fileNameOf = (value: string) => decodeURIComponent(value.split("?")[0].split("/").pop() || value);
            const magentoUrl = (item: any): string | null => {
                for (const key of ["file_url", "url", "fileUrl", "link", "download_url", "src", "path", "file_path", "file"]) {
                    const url = toUrl(item?.[key]);
                    if (url) return url;
                }
                for (const value of Object.values(item || {})) {
                    const url = toUrl(value);
                    if (url) return url;
                }
                return null;
            };
            const entries = list.map((item: any) => {
                if (typeof item === "string") {
                    const url = toUrl(item);
                    return { name: url ? fileNameOf(item) : item, type: "", url };
                }
                const url = magentoUrl(item);
                const name = String(item?.fileName || item?.filename || item?.file_name || item?.name || item?.label || (url ? fileNameOf(url) : ""));
                return { name, type: String(item?.type || item?.file_type || ""), url };
            });
            // When Magento says which upload a file belongs to, show only the payment ones.
            const typed = entries.some(e => e.type);
            setPaymentFiles(entries
                .filter(e => e.name && (!typed || e.type.toLowerCase() === "payment"))
                .map(e => ({ name: e.name, url: e.url || magentoFileUrl(e.name) })));
        } catch (err) {
            console.error("Failed to load payment commitment files:", err);
        }
    }, [getPoUpload]);

    useEffect(() => { refreshPaymentFiles(); }, [refreshPaymentFiles]);

    // Same upload rules as the checkout (file type + size).
    const isAllowedFile = (file: File) => {
        const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        if (!UPLOAD_EXTENSIONS.includes(ext)) {
            toast.error(t("checkout.invalidFileType").replace("{0}", file.name).replace("{1}", UPLOAD_EXTENSIONS.join(", ")));
            return false;
        }
        if (file.size > UPLOAD_MAX_BYTES) {
            toast.error(t("checkout.fileTooLarge").replace("{0}", file.name));
            return false;
        }
        return true;
    };

    const handlePaymentFiles = async (allFiles: File[]) => {
        const files = allFiles.filter(isAllowedFile);
        if (files.length === 0) return;
        setIsUploadingPayment(true);
        try {
            for (const file of files) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("type", "payment");
                await uploadPoFile(formData);
                toast.success(t("checkout.uploadedSuccess").replace("{0}", file.name));
            }
        } catch (error: any) {
            toast.error((typeof error === "string" ? error : error?.message) || t("checkout.failedUploadFiles"));
        } finally {
            setIsUploadingPayment(false);
            if (paymentInputRef.current) paymentInputRef.current.value = "";
            await refreshPaymentFiles();
        }
    };

    const handleRemovePaymentFile = async (name: string) => {
        setIsUploadingPayment(true);
        try {
            await deletePoFile(name);
            toast.success(t("checkout.fileRemovedSuccess"));
        } catch (error: any) {
            toast.error((typeof error === "string" ? error : error?.message) || t("checkout.failedRemoveFile"));
        } finally {
            setIsUploadingPayment(false);
            await refreshPaymentFiles();
        }
    };

    const [groups, setGroups] = useState<AddressGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [orderPlaced, setOrderPlaced] = useState(false);

    // Billing info from localStorage or selections
    const [billingAddress, setBillingAddress] = useState<Address | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<{ code: string, title: string } | null>(null);

    useEffect(() => {
        const loadReviewData = async () => {
            if (orderPlaced || isPlacingOrder || loadedRef.current) return;
            if (isCartLoading || isCheckoutLoading) return;
            if (!cart?.items || addresses.length === 0 || !paymentMethodsLoaded) return;
            loadedRef.current = true;

            try {
                const savedAssignments = localStorage.getItem('multi_shipping_assignments');
                const savedItems: Array<{ item_id: number; name: string }> = JSON.parse(localStorage.getItem('multi_shipping_items') || '[]');
                const savedPaymentCode = localStorage.getItem('multi_shipping_payment_method');
                const savedBillingId = localStorage.getItem('multi_shipping_billing_address_id');

                if (!savedAssignments || savedItems.length === 0) {
                    router.push(lp('/multi-location-delivery'));
                    return;
                }

                // Billing address and payment method must be the ones chosen on the billing
                // step and still offered by Magento — otherwise go back and choose again.
                const bAddr = addresses.find(a => a.id === savedBillingId);
                const pMethod = paymentMethods.find(m => m.code === savedPaymentCode);
                if (!bAddr || !pMethod) {
                    toast.error(t("multi.missingBilling"));
                    router.push(lp('/multi-location-delivery/billing'));
                    return;
                }
                setBillingAddress(bAddr);
                setPaymentMethod(pMethod);

                setIsLoading(true);

                // 1. Groups: the quantities assigned in Magento on step 1; names from Magento's
                //    multi-address item list, prices from the Magento cart.
                const assignments: Assignments = JSON.parse(savedAssignments);
                const groupedMap: Record<string, AddressGroup> = {};

                Object.entries(assignments).forEach(([itemIdStr, addrQtyMap]) => {
                    const itemId = parseInt(itemIdStr);
                    const msItem = savedItems.find(i => i.item_id === itemId);
                    const cartItem = cart?.items.find(i => i.item_id === itemId);
                    if (!msItem || !cartItem) return;

                    Object.entries(addrQtyMap).forEach(([addrId, qty]) => {
                        if (qty > 0) {
                            if (!groupedMap[addrId]) {
                                const address = addresses.find(a => a.id === addrId);
                                if (!address) return;
                                groupedMap[addrId] = { address, items: [] };
                            }
                            groupedMap[addrId].items.push({
                                name: msItem.name,
                                qty: qty,
                                price: cartItem.price,
                                itemId: itemId
                            });
                        }
                    });
                });

                setGroups(Object.values(groupedMap));

                // 2. Shipping method + amount of each address, as set on Magento's quote.
                const chosen: Record<string, MultiShippingMethodChoice> = JSON.parse(localStorage.getItem('multi_shipping_methods') || '{}');
                const methodsData = await fetchMultiShippingMethods();
                const byAddress: Record<string, { title: string; amount: number }> = {};
                for (const a of (Array.isArray(methodsData?.addresses) ? methodsData.addresses : [])) {
                    const custId = String(a.customer_address_id);
                    const c = chosen[custId];
                    const m = c && (a.methods || []).find((x: any) => x.carrier_code === c.carrier_code && x.method_code === c.method_code);
                    if (m) byAddress[custId] = { title: [m.carrier_title, m.method_title].filter(Boolean).join(" - "), amount: Number(m.amount ?? 0) };
                }
                setShippingByAddress(byAddress);

                await refetchTotals();

            } catch (err) {
                console.error("Error loading review data:", err);
                toast.error(t("multi.failedLoad"));
            } finally {
                setIsLoading(false);
            }
        };

        loadReviewData();
    }, [cart, addresses, paymentMethods, paymentMethodsLoaded, isCartLoading, isCheckoutLoading, refetchTotals, fetchMultiShippingMethods, router, isPlacingOrder, orderPlaced]);

    // Per-address group inputs state
    const [groupData, setGroupData] = useState<Record<string, { poNumber: string, comment: string }>>({});
    const [generalComment, setGeneralComment] = useState("");

    const handleDataChange = (addrId: string, field: 'poNumber' | 'comment', value: string) => {
        setGroupData(prev => ({
            ...prev,
            [addrId]: {
                ...prev[addrId] || { poNumber: '', comment: '' },
                [field]: value
            }
        }));
    };

    const handlePlaceOrder = async () => {
        if (!billingAddress || !paymentMethod) {
            toast.error(t("multi.missingBilling"));
            return;
        }

        try {
            setIsPlacingOrder(true);

            const savedMethodsForPayload: Record<string, MultiShippingMethodChoice> = JSON.parse(localStorage.getItem('multi_shipping_methods') || '{}');
            // Every address needs a method the customer chose from Magento's list — never
            // submit an invented one.
            if (groups.some(group => !savedMethodsForPayload[group.address.id])) {
                toast.error(t("multi.noShippingMethods"));
                setIsPlacingOrder(false);
                return;
            }
            const shippingInformation = groups.map(group => ({
                address_id: String(group.address.id),
                shipping_method: `${savedMethodsForPayload[group.address.id].carrier_code}_${savedMethodsForPayload[group.address.id].method_code}`,
                po_number: groupData[group.address.id]?.poNumber || "",
                order_comment: groupData[group.address.id]?.comment || ""
            }));

            const payload = {
                billing_address_id: String(billingAddress.id),
                payment_method: paymentMethod.code,
                general_comment: generalComment || "",
                shipping_information: shippingInformation
            };

            const result = await placeMultiShippingOrder(payload);

            // Magento must confirm the orders: success flag + the created order ids.
            if (!result?.success || !Array.isArray(result.order_ids) || result.order_ids.length === 0) {
                throw new Error(t("multi.orderFailed"));
            }

            // Mark order as placed BEFORE clearing localStorage to prevent effect re-triggering
            setOrderPlaced(true);
            toast.success(t("multi.orderPlaced"));

            // Magento's order entity ids → success page (/success?order_id=28675,28676)
            const entityIds: string[] = result.order_ids.map((id: any) => String(id));

            // Magento closes the quote when the orders are placed — reload the (new) cart.
            try { await refetchCart(); window.dispatchEvent(new Event("cart-updated")); } catch { /* refreshed on next visit */ }

            // Clean up localStorage for this flow
            localStorage.removeItem('multi_shipping_assignments');
            localStorage.removeItem('multi_shipping_methods');
            localStorage.removeItem('multi_shipping_billing_address_id');
            localStorage.removeItem('multi_shipping_payment_method');
            localStorage.removeItem('multi_shipping_items');

            // Redirect with comma-separated entity_ids — success page will call the API
            router.push(lp(`/multi-location-delivery/success?order_id=${entityIds.join(",")}`));
        } catch (err: any) {
            console.error("Multi-Shipping Place Order Error:", err);
            toast.error(err.message || t("multi.orderFailed"));
        } finally {
            setIsPlacingOrder(false);
        }
    };

    if (isLoading || isCartLoading || isCheckoutLoading) {
        return <MultiLocationReviewSkeleton groups={1} />;
    }


    return (
        <div className="bg-white min-h-screen font-sans pb-10 md:pb-20">
            <div className="max-w-[1440px] mx-auto pt-6 md:pt-10 px-3 sm:px-4">
                <h1 className="text-h3 sm:text-h2 md:text-h1-sm font-bold text-black text-center uppercase mb-3 md:mb-4 tracking-tight">
                    {t("multi.reviewOrder")}
                </h1>
                <h2 className="text-body-lg md:text-body-xl font-bold text-black text-center mb-6 md:mb-8">
                    {t("multi.billingInformation")}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-8 md:mb-12">
                    {/* Billing Address */}
                    <div className="flex flex-col bg-surface-muted border border-gray-100">
                        <div className="bg-[#e2e2e2] py-3 md:py-3.5 px-4 md:px-6 text-center">
                            <h2 className="text-label font-[900] text-black uppercase tracking-widest">
                                {t("multi.billingAddress")}
                            </h2>
                        </div>
                        <div className="p-5 md:p-8 text-body md:text-body-lg text-black leading-[1.7]">
                            {billingAddress ? (
                                <>
                                    <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress.firstname} {billingAddress.lastname}</p>
                                    <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress.company}</p>
                                    <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress.street}</p>
                                    <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{billingAddress.city}, {billingAddress.postcode}</p>
                                    <p className="mb-0.5">{countryName(billingAddress.country_id)}</p>
                                    <p className="mt-3" dir="ltr" style={{ unicodeBidi: "isolate" }}>{t("multi.phonePrefix")} {billingAddress.telephone}</p>
                                </>
                            ) : <p className="text-gray-400">{t("multi.loadingBilling")}</p>}
                        </div>
                    </div>

                    {/* Payment Method & Commitment */}
                    <div className="flex flex-col bg-surface-muted border border-gray-100">
                        <div className="bg-[#e2e2e2] py-3 md:py-3.5 px-4 md:px-6 text-center">
                            <h2 className="text-label font-[900] text-black uppercase tracking-widest">
                                {t("multi.paymentMethod")}
                            </h2>
                        </div>
                        <div className="p-5 md:p-8 space-y-4 md:space-y-6">
                            <div className="text-center">
                                <p className="text-body md:text-body-lg font-bold text-black uppercase tracking-tight">
                                    {paymentMethod?.title}
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <p className="text-body-sm md:text-body text-black mb-2">{t("multi.paymentCommitment")}</p>
                                    <label
                                        className={`border-2 border-dashed border-gray-400 bg-white p-6 md:p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-gray-500 transition-colors ${isUploadingPayment ? "opacity-60 pointer-events-none" : ""}`}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => { e.preventDefault(); handlePaymentFiles(Array.from(e.dataTransfer.files || [])); }}
                                    >
                                        <input
                                            ref={paymentInputRef}
                                            type="file"
                                            multiple
                                            accept={UPLOAD_ACCEPT}
                                            className="hidden"
                                            onChange={(e) => handlePaymentFiles(Array.from(e.target.files || []))}
                                        />
                                        <p className="text-body md:text-body-xl text-gray-800 mb-2">{t("multi.dropFiles")}</p>
                                        <p className="text-caption md:text-body-sm text-gray-700 whitespace-pre-wrap">
                                            {t("m.allowed-file-types")} : {UPLOAD_TYPES_TEXT}
                                        </p>
                                    </label>
                                    {paymentFiles.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {paymentFiles.map(({ name, url }) => (
                                                <div
                                                    key={name}
                                                    role={url ? "link" : undefined}
                                                    title={url ? name : undefined}
                                                    onClick={() => { if (url) window.open(url, "_blank", "noopener,noreferrer"); }}
                                                    className={`flex items-stretch border border-dashed border-gray-400 bg-white text-body-sm ${url ? "cursor-pointer hover:border-black" : ""}`}
                                                >
                                                    <span className={`px-2.5 py-2 break-all ${url ? "hover:underline" : ""}`}>{name}</span>
                                                    <button
                                                        type="button"
                                                        disabled={isUploadingPayment}
                                                        onClick={(e) => { e.stopPropagation(); handleRemovePaymentFile(name); }}
                                                        className="px-2 bg-[#e02b27] text-white hover:opacity-90 disabled:opacity-50"
                                                    >
                                                        {t("m.remove")}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className="text-body-sm md:text-body font-bold text-black mb-2">{t("multi.leaveComment")}</p>
                                    <textarea
                                        value={generalComment}
                                        onChange={(e) => setGeneralComment(e.target.value)}
                                        className="w-full border border-gray-300 p-3 md:p-4 min-h-[80px] md:min-h-[100px] outline-none focus:ring-1 focus:ring-black rounded-none resize-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <hr className="border-transparent my-2 md:my-4" />

                {/* Shipping Information Header */}
                <h3 className="text-h4 sm:text-subheading md:text-h3 font-bold text-black text-center mb-4 uppercase tracking-tighter">
                    {t("multi.shippingInformation")}
                </h3>

                {/* Groups iteration */}
                {groups.map((group, index) => {
                    const itemTotal = group.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
                    const shipping = shippingByAddress[group.address.id];

                    return (
                        <div key={group.address.id} className="mb-12 md:mb-24 last:mb-0">
                            <p className="text-body md:text-body-lg font-bold text-black text-center mb-6 md:mb-10 tracking-tight">
                                {t("multi.address")} {index + 1} <span className="text-gray-400 font-normal">{t("common.of")} {groups.length}</span>
                            </p>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
                                {/* Column 1: Shipping To */}
                                <div className="flex flex-col bg-surface-muted">
                                    <div className="bg-subtle py-2.5 px-4 md:px-6 text-center">
                                        <h2 className="text-label font-[900] text-black uppercase tracking-widest">{t("multi.shippingTo")}</h2>
                                    </div>
                                    <div className="p-5 md:p-8 text-body md:text-body-lg text-black leading-[1.7] flex-grow">
                                        <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{group.address.firstname} {group.address.lastname}</p>
                                        <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{group.address.company}</p>
                                        <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{group.address.street}</p>
                                        <p className="mb-0.5" dir="ltr" style={{ unicodeBidi: "isolate" }}>{group.address.city}, {group.address.postcode}</p>
                                        <p className="mb-0.5">{countryName(group.address.country_id)}</p>
                                        <p className="mt-3" dir="ltr" style={{ unicodeBidi: "isolate" }}>{t("multi.phonePrefix")} {group.address.telephone}</p>
                                        {group.address.custom_attributes?.find(a => a.attribute_code === 'vat_number')?.value && (
                                            <p>{t("multi.vatNumber")} {group.address.custom_attributes.find(a => a.attribute_code === 'vat_number')?.value}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Column 2: PO Number & Upload */}
                                <div className="flex flex-col bg-surface-muted">
                                    <div className="bg-subtle py-2.5 px-4 md:px-6 text-center">
                                        <h2 className="text-label font-[900] text-black uppercase tracking-widest">{t("multi.customerPo")}</h2>
                                    </div>
                                    <div className="p-5 md:p-8 space-y-4 md:space-y-6 flex-grow">
                                        <div>
                                            <p className="text-label font-bold text-black uppercase mb-2">{t("multi.poNumber")}</p>
                                            <input
                                                type="text"
                                                value={groupData[group.address.id]?.poNumber || ""}
                                                onChange={(e) => handleDataChange(group.address.id, 'poNumber', e.target.value)}
                                                className="w-full border border-gray-300 p-3 h-[42px] outline-none bg-white rounded-none"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-label font-bold text-black uppercase mb-2">{t("multi.uploadPo")}</p>
                                            <div className="border-2 border-dashed border-gray-300 bg-white p-5 md:p-8 flex flex-col items-center justify-center text-center">
                                                <p className="text-body md:text-body-lg font-bold text-gray-800 mb-2">{t("multi.dropFiles")}</p>
                                                <p className="text-micro text-gray-400 font-medium uppercase tracking-tighter">
                                                    {t("m.allowed-file-types")} : {UPLOAD_TYPES_TEXT}
                                                </p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-label font-bold text-black uppercase mb-2">{t("multi.orderComment")}</p>
                                            <textarea
                                                value={groupData[group.address.id]?.comment || ""}
                                                onChange={(e) => handleDataChange(group.address.id, 'comment', e.target.value)}
                                                className="w-full border border-gray-300 p-3 min-h-[80px] bg-white rounded-none resize-none outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Column 3: Items Table */}
                                <div className="flex flex-col bg-surface-muted">
                                    <div className="p-0 flex-grow">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-transparent">
                                                    <th className="py-3 md:py-4 px-2 md:px-4 text-caption md:text-body-sm font-bold text-black uppercase">{t("item")}</th>
                                                    <th className="py-3 md:py-4 px-2 md:px-3 text-caption md:text-body-sm font-bold text-black uppercase text-right">{t("price")}</th>
                                                    <th className="py-3 md:py-4 px-2 md:px-3 text-caption md:text-body-sm font-bold text-black uppercase text-center">{t("qty")}</th>
                                                    <th className="py-3 md:py-4 px-2 md:px-4 text-caption md:text-body-sm font-bold text-black uppercase text-right">{t("multi.itemsTotal")}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-transparent">
                                                {group.items.map((item) => (
                                                    <tr key={item.itemId}>
                                                        <td className="py-3 md:py-4 px-2 md:px-4 text-label md:text-body font-medium text-gray-600 align-top uppercase leading-tight">
                                                            {item.name}
                                                        </td>
                                                        <td className="py-3 md:py-4 px-2 md:px-3 text-label md:text-body font-bold text-black text-right align-top whitespace-nowrap">
                                                            <Price amount={item.price} />
                                                        </td>
                                                        <td className="py-3 md:py-4 px-2 md:px-3 text-label md:text-body font-bold text-black text-center align-top">
                                                            {item.qty}
                                                        </td>
                                                        <td className="py-3 md:py-4 px-2 md:px-4 text-label md:text-body font-bold text-black text-right align-top whitespace-nowrap">
                                                            <Price amount={item.price * item.qty} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colSpan={3} className="py-2 px-2 md:px-4 text-right text-caption md:text-body-sm font-[900] text-black uppercase">{t("multi.itemsTotal")}</td>
                                                    <td className="py-2 px-2 md:px-4 text-right text-caption md:text-body-sm font-bold text-black whitespace-nowrap"><Price amount={itemTotal} /></td>
                                                </tr>
                                                {shipping && (
                                                    <tr>
                                                        <td colSpan={3} className="py-2 px-2 md:px-4 text-right text-caption md:text-body-sm font-[900] text-black uppercase">{shipping.title}</td>
                                                        <td className="py-2 px-2 md:px-4 text-right text-caption md:text-body-sm font-bold text-black whitespace-nowrap"><Price amount={shipping.amount} /></td>
                                                    </tr>
                                                )}
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Order totals — exactly Magento's cart totals (all addresses, incl. Magento's tax lines) */}
                {totals && (
                    <div className="mt-8 md:mt-12 mb-6 md:mb-8 flex justify-center md:justify-end">
                        <div className="w-full max-w-md space-y-2">
                            <div className="flex justify-between text-body md:text-body-lg font-bold text-black">
                                <span className="uppercase">{t("multi.itemsTotal")}</span>
                                <Price amount={totals.subtotal} />
                            </div>
                            {Object.keys(shippingByAddress).length > 0 && (
                                <div className="flex justify-between text-body md:text-body-lg font-bold text-black">
                                    <span className="uppercase">{t("multi.shippingTotal")}</span>
                                    <Price amount={Object.values(shippingByAddress).reduce((sum, m) => sum + m.amount, 0)} />
                                </div>
                            )}
                            {/* One tax row, titled as Magento's checkout titles it */}
                            <div className="flex justify-between text-body md:text-body-lg font-bold text-black">
                                <span>{taxTitle}</span>
                                <Price amount={totals.tax_amount} />
                            </div>
                            <div className="flex justify-between text-h3-sm sm:text-subheading md:text-h3 font-bold text-black uppercase pt-2">
                                <span>{t("multi.grandTotal")}</span>
                                <Price amount={totals.grand_total} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Final Actions */}
                <div className="bg-surface-muted p-4 sm:p-6 md:p-8 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
                    <button
                        onClick={() => router.push(lp('/multi-location-delivery/billing'))}
                        className="w-full sm:w-auto bg-black text-white px-6 md:px-10 py-3.5 md:py-4 text-label font-bold uppercase tracking-[0.15em] hover:opacity-90 transition-opacity text-center font-sans"
                    >
                        {t("multi.backToBilling")}
                    </button>

                    <button
                        onClick={handlePlaceOrder}
                        disabled={isPlacingOrder}
                        className="w-full sm:w-auto bg-brand-yellow text-black px-10 md:px-16 py-3.5 md:py-4 text-label font-bold uppercase tracking-[0.15em] hover:bg-black hover:text-white transition-all shadow-sm flex items-center justify-center gap-2 font-sans"
                    >
                        {t("multi.placeOrder")}
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

export default MultiShippingReviewPage;
