"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";
import { CheckoutSkeleton } from "@/components/skeletons";
import { useLoadingOverlay } from "@/contexts/LoadingOverlayContext";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Navbar from "@/app/components/Navbar";
import { useCart } from "@/modules/cart/hooks/useCart";
import { useCheckout, Address } from "@/modules/checkout/hooks/useCheckout";
import {
    Search,
    Plus,
    Edit2,
    ChevronDown,
    Upload,
    Truck,
    Warehouse,
    CreditCard,
    Check,
    MapPin,
    Phone,
    User,
    ShoppingBag,
    ArrowLeft,
    Trash2,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import Link from "next/link";
import SelectedAddressCard from "./SelectedAddressCard";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Price from "@/app/components/Price";


// --- Sub-components ---

const SectionHeader = ({ title, step }: { title: string; step?: number }) => (
    <div className="bg-gray-50/80 px-4 py-3 border-b border-subtle flex items-center justify-between h-[50px] rounded-t-sm">
        <div className="flex items-center gap-2.5 min-w-0">
            {step && (
                <span className="w-6 h-6 flex-shrink-0 rounded-full bg-black text-white text-caption font-black flex items-center justify-center shadow-sm leading-none">
                    {step}
                </span>
            )}
            <h3 className="text-caption font-bold text-black uppercase tracking-[0.15em] truncate">
                {title}
            </h3>
        </div>
    </div>
);

const CheckoutPageUI: React.FC = () => {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();

    // Hooks
    const { cart, isLoading: isCartLoading, updateCartItem, clearCart } = useCart();
    const {
        addresses,
        shippingMethods,
        paymentMethods,
        totals,
        isLoading: isCheckoutLoading,
        isTotalsLoading,
        setShippingAddress,
        addAddress,
        placeOrder,
        savePoNumber,
        uploadPoFile,
        getPoUpload,
        deletePoFile,
        setShippingMethod,
        setShippingExtras,
        stores,
        refetchPickupStores,
        fetchPickupTimeSlots,
        getOrderComment,
        saveOrderComment,
    } = useCheckout();

    // --- State ---
    const [selectedAddressId, setSelectedAddressId] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [poNumber, setPoNumber] = useState("");
    const [shippingType, setShippingType] = useState<"delivery" | "pickup">("delivery");
    const [selectedWarehouse, setSelectedWarehouse] = useState("");
    const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
    const [selectedShippingMethodCode, setSelectedShippingMethodCode] = useState("");
    const [isAddressSetOnBackend, setIsAddressSetOnBackend] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState("checkmo");
    const [comment, setComment] = useState("");
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const { showLoading, hideLoading } = useLoadingOverlay();
    const [isPoUploadOpen, setIsPoUploadOpen] = useState(false);
    const [uploadedPOs, setUploadedPOs] = useState<{ fileName: string }[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [isPaymentCommitmentOpen, setIsPaymentCommitmentOpen] = useState(false);
    const [isItemsListOpen, setIsItemsListOpen] = useState(true);
    const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
    // Payment-commitment files support MULTIPLE uploads. Live File objects (this session) are
    // kept in paymentCommitmentFiles; their names are mirrored in paymentCommitmentNames and
    // persisted to localStorage so the uploaded files stay visible after a page refresh (a File
    // object itself can't survive a reload).
    const [paymentCommitmentFiles, setPaymentCommitmentFiles] = useState<File[]>([]);
    const [paymentCommitmentNames, setPaymentCommitmentNames] = useState<string[]>([]);
    const [tempSelectedWarehouse, setTempSelectedWarehouse] = useState<{ id: string; name: string } | null>(null);

    // Pickup Form States
    const [isPickupFormOpen, setIsPickupFormOpen] = useState(false);
    const [pickupName, setPickupName] = useState("");
    const [pickupId, setPickupId] = useState("");
    const [pickupMobile, setPickupMobile] = useState("");
    const [pickupDate, setPickupDate] = useState<Date | null>(null);
    const [pickupTime, setPickupTime] = useState("");
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
    const [availableDates, setAvailableDates] = useState<Date[]>([]);
    const [availableTimeSlots, setAvailableTimeSlots] = useState<{ time: string; label: string; enabled: boolean }[]>([]);
    const [isLoadingTimeSlots, setIsLoadingTimeSlots] = useState(false);
    const timeRef = useRef<HTMLDivElement>(null);
    const dateRef = useRef<HTMLDivElement>(null);
    const datePickerRef = useRef<any>(null);
    const timeDropdownRef = useRef<HTMLUListElement>(null);

    // Close dropdowns on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // The time dropdown list is rendered in a portal (document.body), so it is NOT inside
            // timeRef. Treat clicks inside the portaled list as "inside" too — otherwise this
            // mousedown handler closes the dropdown before a time option's click registers and
            // the selection is swallowed (button keeps showing "Select").
            if (
                timeRef.current && !timeRef.current.contains(target) &&
                (!timeDropdownRef.current || !timeDropdownRef.current.contains(target))
            ) {
                setIsTimeDropdownOpen(false);
            }
            if (dateRef.current && !dateRef.current.contains(event.target as Node)) {
                setIsDateDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Generate next 45 days
    useEffect(() => {
        const dates = [];
        for (let i = 0; i < 45; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            dates.push(date);
        }
        setAvailableDates(dates);

        // Auto-select today by default if nothing is selected
        if (!pickupDate && dates.length > 0) {
            setPickupDate(dates[0]);
        }
    }, [pickupDate]);
    // Fetch stores if pickup is selected
    useEffect(() => {
        if (shippingType === "pickup" && stores.length === 0) {
            refetchPickupStores();
        }
    }, [shippingType, stores.length, refetchPickupStores]);
    // Fetch dynamic time slots
    useEffect(() => {
        const getSlots = async () => {
            if (shippingType === "pickup" && selectedWarehouseId && pickupDate) {
                setIsLoadingTimeSlots(true);
                try {
                    const year = pickupDate.getFullYear();
                    const month = String(pickupDate.getMonth() + 1).padStart(2, '0');
                    const day = String(pickupDate.getDate()).padStart(2, '0');
                    const formattedDate = `${year}-${month}-${day}`;

                    let slots = await fetchPickupTimeSlots(selectedWarehouseId, formattedDate);

                    // If API returns empty or we want to ensure "this type proper" intervals as per user image
                    if (!slots || slots.length === 0) {
                        const generatedSlots = [];
                        for (let h = 0; h < 24; h++) {
                            for (let m = 0; m < 60; m += 30) {
                                let hh = h % 12;
                                if (hh === 0) hh = 12;
                                const ampm = h < 12 ? 'am' : 'pm';
                                const mm = m === 0 ? '00' : '30';
                                const h24 = String(h).padStart(2, '0');
                                const m24 = String(m).padStart(2, '0');
                                generatedSlots.push({
                                    time: `${h24}:${m24}`,
                                    label: `${hh}:${mm}${ampm}`,
                                    enabled: true
                                });
                            }
                        }
                        slots = generatedSlots;
                    }

                    setAvailableTimeSlots(slots);
                } catch (error) {
                    console.error("Failed to fetch time slots:", error);
                    toast.error(t("checkout.failedFetchTimeSlots"));
                } finally {
                    setIsLoadingTimeSlots(false);
                }
            }
        };
        getSlots();
    }, [shippingType, selectedWarehouseId, pickupDate, fetchPickupTimeSlots]);

    // NOTE: intentionally NO effect that clears pickupTime when availableTimeSlots reloads.
    // The slots list can re-fetch and return a different set (e.g. the fallback only spans
    // 9am–9pm), which would wipe a valid selection like "00:30" and revert the button to
    // "Select". The chosen time is the single source of truth and stays until the user changes
    // it; it's re-validated on submit.

    // File inputs refs
    const poUploadRef = useRef<HTMLInputElement>(null);
    const paymentCommitmentRef = useRef<HTMLInputElement>(null);
    // Set once an order is successfully placed, so the empty-cart redirect doesn't fire after
    // clearCart() and steal the navigation to the success page.
    const orderPlacedRef = useRef(false);

    // Auth Guard
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push(lp("/login?callback=/checkout"));
        }
    }, [status, router]);

    // Redirect if cart is empty — but NOT right after placing an order (clearCart() empties the
    // cart on success, and without this guard the empty-cart redirect races the success redirect
    // and bounces the user to /checkout/cart instead of the success page).
    useEffect(() => {
        if (orderPlacedRef.current) return;
        if (!isCartLoading && cart && cart.items.length === 0) {
            toast.error(t("checkout.yourOrderIsEmpty"));
            router.push(lp("/checkout/cart"));
        }
    }, [cart, isCartLoading, router]);

    // Defaults
    useEffect(() => {
        if (addresses.length > 0 && !selectedAddressId) {
            const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];
            setSelectedAddressId(defaultAddr.id);
            setShippingAddress(defaultAddr.id)
                .then(() => setIsAddressSetOnBackend(true))
                .catch(() => { });
        }
    }, [addresses, selectedAddressId, setShippingAddress]);

    // Auto-select first available payment method if current one is invalid
    useEffect(() => {
        if (paymentMethods.length > 0) {
            const isValid = paymentMethods.some(m => m.code === paymentMethod);
            if (!isValid) {
                const creditMethod = paymentMethods.find(m => m.code === 'checkmo');
                setPaymentMethod(creditMethod ? creditMethod.code : paymentMethods[0].code);
            }
        }
    }, [paymentMethods, paymentMethod]);

    // Restore the previously-selected payment-commitment filenames after a refresh.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const saved = localStorage.getItem("payment_commitment_file_names");
        if (saved) {
            try {
                const arr = JSON.parse(saved);
                if (Array.isArray(arr)) setPaymentCommitmentNames(arr.filter((n) => typeof n === "string"));
            } catch { /* ignore malformed value */ }
        }
    }, []);

    // Append one or more files (dedupe by name) and persist the full name list.
    const addPaymentCommitmentFiles = (files: File[]) => {
        if (!files.length) return;
        setPaymentCommitmentFiles((prev) => {
            const existing = new Set(prev.map((f) => f.name));
            const merged = [...prev, ...files.filter((f) => !existing.has(f.name))];
            return merged;
        });
        setPaymentCommitmentNames((prev) => {
            const next = [...prev];
            files.forEach((f) => { if (!next.includes(f.name)) next.push(f.name); });
            localStorage.setItem("payment_commitment_file_names", JSON.stringify(next));
            return next;
        });
        toast.success(files.length > 1 ? t("checkout.filesSelected").replace("{0}", String(files.length)) : t("checkout.fileSelectedSuccess"));
    };

    const handlePaymentCommitmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            addPaymentCommitmentFiles(Array.from(e.target.files));
        }
    };

    const removePaymentCommitment = (name: string) => {
        setPaymentCommitmentFiles((prev) => prev.filter((f) => f.name !== name));
        setPaymentCommitmentNames((prev) => {
            const next = prev.filter((n) => n !== name);
            if (next.length > 0) localStorage.setItem("payment_commitment_file_names", JSON.stringify(next));
            else localStorage.removeItem("payment_commitment_file_names");
            return next;
        });
        if (paymentCommitmentRef.current) {
            paymentCommitmentRef.current.value = "";
        }
        toast.success(t("checkout.fileRemoved"));
    };

    // Auto-select shipping method when they become available or when type changes
    useEffect(() => {
        if (shippingMethods.length > 0) {
            const method = shippingMethods.find(m =>
                shippingType === "pickup" ? m.code.includes("pickup") : !m.code.includes("pickup")
            );

            // Validate current selection
            const currentSelectedMethod = shippingMethods.find(m => m.code === selectedShippingMethodCode);
            const isCorrectType = currentSelectedMethod ?
                (shippingType === "pickup" ? currentSelectedMethod.code.includes("pickup") : !currentSelectedMethod.code.includes("pickup")) :
                false;

            if (method && (!selectedShippingMethodCode || !isCorrectType)) {
                // Only sync if address is confirmed on backend, cart has items, and not loading
                if (isAddressSetOnBackend && !isTotalsLoading && cart && cart.items.length > 0) {
                    console.log("DEBUG: Auto-selecting shipping method:", method.code, "for type:", shippingType);
                    setSelectedShippingMethodCode(method.code);

                    setShippingMethod(method.carrierCode, method.methodCode).catch(err => {
                        console.error("Auto-sync shipping method failed:", err);
                    });
                }
            }
        }
    }, [shippingMethods, shippingType, selectedShippingMethodCode, setShippingMethod, isAddressSetOnBackend, isTotalsLoading, cart]);

    // Fetch existing Order Comment
    useEffect(() => {
        const fetchExistingComment = async () => {
            try {
                const existingComment = await getOrderComment();
                if (existingComment) {
                    setComment(existingComment);
                }
            } catch (err) {
                console.error("Failed to fetch order comment:", err);
            }
        };

        if (status === "authenticated") {
            fetchExistingComment();
        }
    }, [status, getOrderComment]);

    // Re-sync the PO file list from the server (authoritative filenames). Reused on mount AND
    // after every upload/remove so the displayed names always match what the backend stored —
    // otherwise remove-by-name can target a name the server never had and silently no-op.
    const refreshPoFiles = useCallback(async () => {
        try {
            const data = await getPoUpload();

            // Handle common response formats
            let filesArray: any[] = [];
            if (Array.isArray(data)) {
                filesArray = data;
            } else if (data && Array.isArray(data.files)) {
                filesArray = data.files;
            } else if (data && Array.isArray(data.data)) {
                filesArray = data.data;
            } else if (data && (data.fileName || data.filename || data.file)) {
                filesArray = [data];
            }

            // Keep the PO list strictly PO-only. The backend kleverGetPoFiles returns ALL of the
            // customer's uploaded files (PO + Payment share one store). Payment-commitment files
            // are tracked separately under their own localStorage key — exclude any of those names
            // here so a Payment file can never bleed into the PO Number section. Also drop any
            // item explicitly typed "payment" if the backend provides a type.
            let paymentNames = new Set<string>();
            try {
                const arr = JSON.parse(localStorage.getItem("payment_commitment_file_names") || "[]");
                if (Array.isArray(arr)) paymentNames = new Set(arr);
            } catch { /* ignore */ }

            const normalized = filesArray
                .map((item: any) => {
                    if (typeof item === 'string') return { fileName: item, type: "" };
                    return {
                        fileName: item.fileName || item.filename || item.file_name || item.name || item.file || "Unknown File",
                        type: String(item.type || item.file_type || ""),
                    };
                })
                .filter((f) => f.type.toLowerCase() !== "payment" && !paymentNames.has(f.fileName))
                .map(({ fileName }) => ({ fileName }));

            setUploadedPOs(normalized);
        } catch (err) {
            console.error("Failed to fetch PO upload:", err);
        }
    }, [getPoUpload]);

    // Fetch existing PO Upload
    useEffect(() => {
        if (status === "authenticated") {
            refreshPoFiles();
        }
    }, [status, refreshPoFiles]);

    // Memoized filtered addresses
    const filteredAddresses = useMemo(() => {
        return addresses.filter(addr =>
            `${addr.firstname} ${addr.lastname} ${addr.street} ${addr.city}`
                .toLowerCase()
                .includes(searchQuery.toLowerCase())
        );
    }, [addresses, searchQuery]);

    // Handlers
    const handleAddressSelect = async (id: string) => {
        setSelectedAddressId(id);
        try {
            await setShippingAddress(id);
            setIsAddressSetOnBackend(true);
        } catch {
            setIsAddressSetOnBackend(false);
            toast.error(t("checkout.failedUpdateShippingAddress"));
        }
    };

    const handlePlaceOrder = async () => {
        // 0. Cart Validation
        if (!cart || cart.items.length === 0) {
            toast.error(t("checkout.yourOrderIsEmpty"));
            router.push(lp("/checkout/cart"));
            return;
        }

        // 1. Validations with Auto-Repair
        if (!selectedAddressId || !isAddressSetOnBackend) {
            const idToSet = selectedAddressId || (addresses.length > 0 ? (addresses.find(a => a.isDefault)?.id || addresses[0].id) : "");

            if (idToSet) {
                try {
                    console.log("Syncing address to backend before order placement:", idToSet);
                    await setShippingAddress(idToSet);
                    setSelectedAddressId(idToSet);
                    setIsAddressSetOnBackend(true);
                    toast.success(t("checkout.saveBillingInfo"));
                } catch (err) {
                    console.error("Address sync failed:", err);
                    toast.error(t("checkout.failedSyncShippingAddress"));
                    return;
                }
            } else {
                toast.error(t("checkout.selectShippingAddressWarning"));
                document.getElementById('step-1')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }

        // 2. Ensure Shipping Method is selected and SYNCED
        if (!selectedShippingMethodCode) {
            if (shippingMethods.length > 0) {
                const method = shippingMethods.find(m =>
                    shippingType === "pickup" ? m.code.includes("pickup") : !m.code.includes("pickup")
                ) || shippingMethods[0];
                setSelectedShippingMethodCode(method.code);
                try {
                    await setShippingMethod(method.carrierCode, method.methodCode);
                } catch (err) {
                    console.error("Auto-repair shipping method failed:", err);
                }
                toast.success(t("checkout.selectedShipping").replace("{0}", method.title));
            } else {
                toast.error(t("checkout.selectShippingMethodWarning"));
                document.getElementById('step-3')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        } else {
            // Even if already selected in state, re-sync to backend to avoid "shipping method missing" race conditions
            const method = shippingMethods.find(m => m.code === selectedShippingMethodCode);
            if (method) {
                try {
                    console.log("Syncing shipping method to backend before order placement:", method.code);
                    await setShippingMethod(method.carrierCode, method.methodCode);
                } catch (err) {
                    console.error("Final shipping method sync failed:", err);
                    // We continue anyway, maybe it was already set
                }
            }
        }

        if (shippingType === "pickup") {
            if (!selectedWarehouseId) {
                toast.error(t("checkout.selectWarehouseWarning"));
                document.getElementById('step-pickup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (!pickupName || !pickupId || !pickupMobile || !pickupDate || !pickupTime) {
                toast.error(t("checkout.fillPickupDetailsWarning"));
                setIsPickupFormOpen(true);
                return;
            }
        }

        if (uploadedPOs.length > 0 && !poNumber) {
            toast.error(t("checkout.enterPoNumberWarning"));
            const element = document.getElementById('step-2');
            element?.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        setIsPlacingOrder(true);
        showLoading("PLACING ORDER...");
        try {
            // 2. Call Shipping Extras if Pickup
            if (shippingType === "pickup") {
                const year = pickupDate!.getFullYear();
                const month = String(pickupDate!.getMonth() + 1).padStart(2, '0');
                const day = String(pickupDate!.getDate()).padStart(2, '0');
                const formattedDate = `${year}-${month}-${day}`;

                await setShippingExtras({
                    pickupPersonName: pickupName,
                    pickupPersonId: pickupId,
                    pickupMobileNumber: pickupMobile,
                    pickupDate: formattedDate,
                    pickupTime: pickupTime,
                    pickupStore: selectedWarehouseId
                });
            }

            // 3. Save Order Comment
            if (comment) {
                await saveOrderComment(comment);
            }

            // 4. Call Place Order
            const result = await placeOrder({
                address_id: Number(selectedAddressId),
                shipping_method: selectedShippingMethodCode,
                payment_method: paymentMethod,
                cart_id: cart?.cart_id,
                po_number: poNumber,
                comment: comment // Pass it just in case backend expects it here too
            });

            // 4. Handle Success — log the FULL response so the exact id key the backend uses is visible.
            console.log(">>> Place Order Response:", JSON.stringify(result, null, 2));

            // Map the order id from any of the keys the backend might use.
            const orderId = String(
                result?.order_id ??
                result?.order_increment_id ??
                result?.increment_id ??
                result?.order_number ??
                ""
            );

            // Only treat it as a failure when there's NO order id AND an explicit error. A valid
            // order with status "approval_pending" (or any status) is a SUCCESS — never an error.
            if (!orderId && (result?.success === false || result?.error || result?.message)) {
                throw new Error(result?.error || result?.message || "Failed to place order.");
            }

            // Mark placed BEFORE clearing the cart so the empty-cart effect won't hijack navigation.
            orderPlacedRef.current = true;
            toast.success(t("common.success"));

            // Save the order summary (success page fallback) before clearing the cart.
            const orderSummary = {
                order_id: orderId,
                order_increment_id: result?.order_increment_id ?? result?.increment_id ?? result?.order_number ?? orderId,
                grand_total: result?.grand_total,
                currency_code: result?.currency_code,
                status: result?.status
            };
            localStorage.setItem('last_order_summary', JSON.stringify(orderSummary));

            // Hide overlay and reset loading state BEFORE navigation so the success
            // page never mounts while the overlay is still active.
            setIsPlacingOrder(false);
            hideLoading();

            // Navigate to success, then clear cart in the background (fire-and-forget)
            // so the redirect is never blocked by the clearCart request.
            router.push(lp(`/checkout/success?order_id=${encodeURIComponent(orderId)}`));
            clearCart().catch(() => { /* cart will refresh on next visit */ });
        } catch (error: any) {
            console.error("Place Order Error:", error);
            toast.error((typeof error === "string" ? error : error?.message) || t("checkout.failedPlaceOrder"));
        } finally {
            // Safety net for the error path — idempotent when already cleared above.
            setIsPlacingOrder(false);
            hideLoading();
        }
    };

    const handlePoNumberBlur = async () => {
        if (!poNumber) return;
        try {
            await savePoNumber(poNumber);
            toast.success(t("checkout.poNumberSaved"));
        } catch (error: any) {
            toast.error((typeof error === "string" ? error : error?.message) || t("checkout.failedSavePoNumber"));
        }
    };

    const handleCommentBlur = async () => {
        if (!comment) return;
        try {
            await saveOrderComment(comment);
            toast.success(t("common.success"));
        } catch (error: any) {
            toast.error((typeof error === "string" ? error : error?.message) || t("checkout.failedSaveComment"));
        }
    };

    const ALLOWED_TYPES = [
        "image/jpeg", "image/png", "application/zip", "application/x-rar-compressed",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword", "application/pdf", "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv", "application/vnd.ms-outlook"
    ];

    const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".zip", ".rar", ".docx", ".doc", ".pdf", ".xls", ".xlsx", ".csv", ".msg"];

    const validateFile = (file: File) => {
        const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            toast.error(t("checkout.invalidFileType").replace("{0}", file.name).replace("{1}", ALLOWED_EXTENSIONS.join(", ")));
            return false;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error(t("checkout.fileTooLarge").replace("{0}", file.name));
            return false;
        }
        return true;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
        let files: File[] = [];
        if ("files" in e.target && e.target.files) {
            files = Array.from(e.target.files);
        } else if ("dataTransfer" in e && e.dataTransfer.files) {
            files = Array.from(e.dataTransfer.files);
        }

        if (files.length === 0) return;

        const validFiles = files.filter(validateFile);
        if (validFiles.length === 0) return;

        setIsUploading(true);
        try {
            for (const file of validFiles) {
                // Check for duplicates in UI
                if (uploadedPOs.some(p => p.fileName === file.name)) {
                    toast.error(t("checkout.fileAlreadyUploaded").replace("{0}", file.name));
                    continue;
                }

                const formData = new FormData();
                formData.append("file", file);
                formData.append("type", "po");

                await uploadPoFile(formData);
                // Optimistically show the uploaded file immediately (keyed by its own name so
                // remove can target it). Don't refetch the server list here — it may not reflect
                // the new file yet and would make it flicker/vanish.
                setUploadedPOs(prev => prev.some(p => p.fileName === file.name) ? prev : [...prev, { fileName: file.name }]);
                toast.success(t("checkout.uploadedSuccess").replace("{0}", file.name));
            }
        } catch (error: any) {
            toast.error((typeof error === "string" ? error : error?.message) || t("checkout.failedUploadFiles"));
        } finally {
            setIsUploading(false);
            if (poUploadRef.current) poUploadRef.current.value = "";
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        handleFileUpload(e);
    };

    const handleDeletePo = async (fileName: string) => {
        // Remove ONLY this entry from the PO list, immediately. This touches `uploadedPOs` and
        // nothing else — the payment-commitment file (separate `paymentCommitmentFile` state) is
        // untouched, so removing a PO file never deletes the payment file. Kept removed even if
        // the server call fails so the user's remove always reflects in the UI.
        setUploadedPOs(prev => prev.filter(p => p.fileName !== fileName));
        setIsUploading(true);
        try {
            await deletePoFile(fileName);
            toast.success(t("checkout.fileRemovedSuccess"));
        } catch (error: any) {
            toast.error((typeof error === "string" ? error : error?.message) || t("checkout.failedRemoveFile"));
        } finally {
            setIsUploading(false);
        }
    };

    const handleShippingMethodSelect = async (code: string) => {
        const method = shippingMethods.find(m => m.code === code);
        if (!method) return;

        setSelectedShippingMethodCode(code);
        try {
            await setShippingMethod(method.carrierCode, method.methodCode);
        } catch (error: any) {
            toast.error((typeof error === "string" ? error : error?.message) || t("checkout.failedUpdateShippingMethod"));
        }
    };
    if (isCartLoading || status === "loading") {
        return <CheckoutSkeleton />;
    }

    if (!cart || cart.items.length === 0) {
        return (
            <div className="min-h-screen bg-white">
                <div className="max-w-7xl mx-auto py-24 px-6 text-center">
                    <ShoppingBag size={64} className="mx-auto text-gray-200 mb-6" />
                    <h1 className="text-2xl font-black text-black uppercase tracking-widest mb-4">{t("cart.empty")}</h1>
                    <p className="text-gray-500 mb-8 max-w-md mx-auto">{t("common.loading")}</p>
                    <Link href={lp("/products")} className="inline-flex items-center gap-2 bg-brand-yellow text-black font-black px-8 py-4 text-body-sm uppercase tracking-widest hover:bg-black hover:text-white transition-all">
                        {t("m.products")}
                    </Link>
                </div>
            </div>
        );
    }

    const displayTotals = {
        subtotal: totals?.subtotal ?? cart.subtotal,
        tax_amount: totals?.tax_amount ?? cart.tax_amount,
        shipping_amount: totals?.shipping_amount ?? 0,
        grand_total: totals?.grand_total ?? cart.grand_total,
    };

    return (
        <div className="min-h-screen flex flex-col w-full bg-surface font-rubik text-xs italic-none">
            <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-10 pt-2 md:pt-4">
                {/* Header Section */}
                <div className="flex flex-col items-center justify-center text-center gap-4 mb-12 relative">
                    <Link href={lp("/checkout/cart")} className="lg:absolute left-0 top-1/2 lg:-translate-y-1/2 flex items-center gap-2 text-black hover:text-brand-yellow transition-all text-caption font-black uppercase tracking-[0.2em] group mb-4 lg:mb-0">
                        <div className="w-8 h-8 rounded-full border border-black flex items-center justify-center group-hover:border-brand-yellow transition-all">
                            <ArrowLeft size={14} strokeWidth={3} className="group-hover:-translate-x-1 transition-transform" />
                        </div>
                        <span className="hidden sm:inline text-sm mt-0.5">{t("m.back-to-shopping-cart")}</span>
                    </Link>

                    <div className="flex flex-col items-center gap-4">
                        <h1 className="text-h3 sm:text-h2 md:text-[26px] font-bold text-black uppercase tracking-tight">Checkout</h1>
                        <div className="h-[3.5px] w-12 bg-brand-yellow mx-auto"></div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 lg:gap-8 items-start">

                    {/* ═══════════ Left Column ═══════════ */}
                    <div className="lg:col-span-8 xl:col-span-9 space-y-6">

                        <div className="bg-white border border-subtle shadow-sm rounded-sm overflow-hidden transition-all duration-300 hover:shadow-md">
                            <SectionHeader title={t("checkout.shippingAddress")} step={1} />
                            <div className="p-4">
                                {/* Search */}
                                <div className="mb-6">
                                    <input
                                        type="text"
                                        placeholder={t("m.search")}
                                        className="w-full px-4 py-2.5 bg-gray-50/50 border border-subtle rounded-sm outline-none text-body-sm font-medium transition-all placeholder:text-gray-400 focus:bg-white focus:border-brand-yellow shadow-sm focus:ring-4 focus:ring-brand-yellow/10"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                {/* Address List Container */}
                                <div className="max-h-[300px] sm:max-h-[380px] md:max-h-[460px] overflow-y-auto pr-1 card-scrollbar space-y-4">
                                    {filteredAddresses.map((addr) => (
                                        String(selectedAddressId) === String(addr.id) ? (
                                            <SelectedAddressCard
                                                key={addr.id}
                                                address={addr}
                                                onEdit={() => {
                                                    router.push(lp(`/customer/address/edit/id/${addr.id}?redirect=/checkout`));
                                                }}
                                            />
                                        ) : (
                                            <div
                                                key={addr.id}
                                                className="relative flex items-start gap-4 cursor-pointer group pt-3 pb-2 px-4 border border-gray-200 bg-white hover:bg-gray-50/40 transition-all duration-300 rounded-sm"
                                                onClick={() => handleAddressSelect(addr.id)}
                                            >
                                                {/* Selection Indicator */}
                                                <div className="relative flex-shrink-0 mt-1">
                                                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 group-hover:border-gray-400 flex items-center justify-center transition-all duration-300">
                                                    </div>
                                                </div>

                                                {/* Details */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="mb-2">
                                                        <p className="text-[13px] md:text-[14px] text-gray-600 leading-relaxed font-[500]" dir="ltr" style={{ unicodeBidi: "isolate" }}>
                                                            <span className="font-[800] text-black">{addr.firstname} {addr.lastname}</span>{" "}
                                                            {addr.street} {addr.city}, {addr.postcode}{" "}
                                                            {addr.country_id === 'SA' ? t("data.Saudi Arabia") : addr.country_id} {addr.telephone}
                                                            {[
                                                                addr.custom_attributes?.find(ca => ca.attribute_code === 'store_view')?.value,
                                                                addr.custom_attributes?.find(ca => ca.attribute_code === 'region_ship_to_party')?.value
                                                            ].filter(Boolean).map(val => ` ${val}`).join("")}
                                                        </p>
                                                    </div>

                                                    <div className="flex gap-3 pt-1">
                                                        <button
                                                            className="text-[10px] md:text-[11px] font-[800] uppercase tracking-wider px-4 py-2 transition-all duration-300 border bg-black text-white border-black hover:bg-brand-yellow hover:text-black hover:border-brand-yellow rounded-sm active:scale-95 shadow-sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleAddressSelect(addr.id);
                                                            }}
                                                        >
                                                            {t("m.ship-here")}
                                                        </button>
                                                        <button
                                                            className="text-[10px] md:text-[11px] font-[800] uppercase tracking-wider px-4 py-2 bg-white text-[#7f7f7f] border border-gray-200 hover:bg-gray-50 hover:text-black hover:border-gray-300 transition-all duration-300 rounded-sm active:scale-95"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                router.push(lp(`/customer/address/edit/id/${addr.id}?redirect=/checkout`));
                                                            }}
                                                        >
                                                            {t("m.edit")}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    ))}

                                    {filteredAddresses.length === 0 && (
                                        <div className="text-center py-16 bg-white border border-dashed border-gray-200 rounded-sm">
                                            <p className="text-gray-400 text-label font-black uppercase tracking-widest">{t("common.noDataFound")}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. Customer PO Number */}
                        <div className="bg-white border border-subtle shadow-sm rounded-sm transition-all duration-300 hover:shadow-md">
                            <SectionHeader title={t("m.po-number")} step={2} />
                            <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                <div className="space-y-1.5 w-full">
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-gray-50/50 border border-subtle rounded-sm outline-none text-body font-medium transition-all placeholder:text-gray-400 focus:bg-white focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 shadow-sm"
                                        value={poNumber}
                                        onChange={(e) => setPoNumber(e.target.value)}
                                        onBlur={handlePoNumberBlur}
                                        placeholder={t("m.po-number")}
                                    />
                                    {uploadedPOs.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {/* Hidden since it is listed next to/below the drop area */}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1.5 w-full relative">
                                    {/* Transparent spacer label to match PO NUMBER label height and align tops of columns */}
                                    <div className="absolute top-full left-0 right-0 z-50 border border-subtle rounded-sm bg-white shadow-lg">
                                        <div
                                            className={`bg-gray-50/50 px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-white transition-colors rounded-t-sm ${isPoUploadOpen ? "border-b border-subtle" : "rounded-sm"}`}
                                            onClick={() => setIsPoUploadOpen(!isPoUploadOpen)}
                                        >
                                            <span className="text-body font-bold text-black capitalize">{t("m.upload-file")}</span>
                                            <ChevronDown
                                                size={16}
                                                className={`text-gray-400 transition-transform duration-300 ${isPoUploadOpen ? "rotate-180" : ""}`}
                                            />
                                        </div>
                                        {isPoUploadOpen && (
                                            <div className="p-4 bg-white space-y-4 rounded-b-sm">
                                                {/* Drop Area */}
                                                <div
                                                    className={`relative group p-6 border-2 border-dashed rounded-sm transition-all duration-300 flex flex-col items-center justify-center gap-3 cursor-pointer
                                                        ${dragActive ? "border-brand-yellow bg-brand-yellow-light/30 scale-[1.01]" : "border-subtle bg-gray-50/30 hover:bg-white hover:border-gray-300"}`}
                                                    onDragEnter={handleDrag}
                                                    onDragLeave={handleDrag}
                                                    onDragOver={handleDrag}
                                                    onDrop={handleDrop}
                                                    onClick={() => poUploadRef.current?.click()}
                                                >
                                                    <p className="text-body font-medium text-black">{t("m.drop-files-here")}</p>
                                                    <p className="text-caption text-gray-400 text-center">
                                                        {t("m.allowed-file-types")} : <span className="text-gray-600">jpg,jpeg,png,zip,rar,docx,doc,pdf,xls,xlsx,csv,msg</span>
                                                    </p>
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        ref={poUploadRef}
                                                        onChange={handleFileUpload}
                                                        accept=".jpg,.jpeg,.png,.zip,.rar,.docx,.doc,.pdf,.xls,.xlsx,.csv,.msg"
                                                        multiple
                                                    />
                                                </div>

                                                {/* Files List - Image Style */}
                                                {uploadedPOs.length > 0 && (
                                                    <div className="flex flex-wrap gap-x-4 gap-y-3">
                                                        {uploadedPOs.map((po, idx) => (
                                                            <div key={idx} className="flex border border-subtle rounded-sm overflow-hidden group shadow-sm bg-white">
                                                                <div className="px-4 py-2 flex-1 flex items-center min-w-0">
                                                                    <span className="text-body-sm font-black text-black truncate ltr:mr-2 rtl:ml-2">
                                                                        {po.fileName}
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleDeletePo(po.fileName); }}
                                                                    className="bg-red-50 text-red-600 px-4 py-2 text-caption font-black uppercase tracking-widest transition-all hover:bg-red-600 hover:text-white border-l border-subtle active:scale-95"
                                                                    disabled={isUploading}
                                                                >
                                                                    {t("m.remove")}
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 3. Order Comment */}
                        {/* <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
                            <SectionHeader title={t("m.order-comment")} step={3} />
                            <div className="p-4 sm:p-5">
                                <div className="space-y-1.5">
                                    <label className="text-caption font-black text-gray-400 uppercase tracking-widest">{t("checkout.additionalInformation")}</label>
                                    <textarea
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-body font-medium transition-all placeholder:text-gray-300 focus:bg-white focus:border-black min-h-[80px] resize-none"
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        onBlur={handleCommentBlur}
                                        placeholder={t("m.enter-your-comment")}
                                    />
                                </div>
                            </div>
                        </div> */}

                        <div className="bg-white border border-subtle shadow-sm rounded-sm overflow-hidden" id="step-3">
                            <SectionHeader title={t("checkout.shippingMethod")} step={3} />
                            <div className="p-4 sm:px-4 sm:py-6">
                                <div className="space-y-6">
                                    {/* Delivery Option */}
                                    <div
                                        className="flex items-center gap-4 cursor-pointer group"
                                        onClick={() => setShippingType("delivery")}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${shippingType === "delivery" ? "border-black" : "border-gray-400 group-hover:border-gray-600"}`}>
                                            {shippingType === "delivery" && (
                                                <div className="w-2.5 h-2.5 bg-black rounded-full" />
                                            )}
                                        </div>
                                        <span className={`text-body font-bold transition-colors ${shippingType === "delivery" ? "text-black" : "text-[#555]"}`}>
                                            {t("m.delivery")}
                                        </span>
                                    </div>

                                    <div className="border-t border-dotted border-gray-300 w-full" />

                                    {/* Pickup Option */}
                                    <div className="space-y-5">
                                        <div
                                            className="flex items-center gap-4 cursor-pointer group"
                                            onClick={() => setShippingType("pickup")}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${shippingType === "pickup" ? "border-black" : "border-gray-400 group-hover:border-gray-600"}`}>
                                                {shippingType === "pickup" && (
                                                    <div className="w-2.5 h-2.5 bg-black rounded-full" />
                                                )}
                                            </div>
                                            <span className={`text-body font-bold transition-colors ${shippingType === "pickup" ? "text-black" : "text-[#555]"}`}>
                                                {t("m.pickup-from-warehouse")}
                                            </span>
                                        </div>

                                        {shippingType === "pickup" && (
                                            <div className="ml-9 space-y-4">
                                                <div className="flex flex-col items-start gap-4">
                                                    <button
                                                        className="bg-brand-yellow text-black px-6 py-2.5 text-label font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all active:scale-95 border border-transparent shadow-sm"
                                                        onClick={() => {
                                                            setIsWarehouseModalOpen(true);
                                                            setIsPickupFormOpen(!isPickupFormOpen);
                                                        }}
                                                    >
                                                        {t("m.select-warehouse")}
                                                    </button>

                                                    {selectedWarehouse && (
                                                        <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-sm">
                                                            <span className="text-body-sm font-bold text-gray-800 uppercase tracking-widest">
                                                                Selected: <span className="text-black">{selectedWarehouse}</span>
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setIsWarehouseModalOpen(true);
                                                                }}
                                                                className="text-caption text-blue-600 font-bold hover:underline"
                                                            >
                                                                Change
                                                            </button>
                                                            <div className="w-px h-3 bg-gray-300 mx-1" />
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setIsPickupFormOpen(!isPickupFormOpen);
                                                                }}
                                                                className="text-caption text-black font-bold hover:underline"
                                                            >
                                                                {isPickupFormOpen ? t("m.close") : t("m.edit")} Details
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Pickup Details Form */}
                                                {isPickupFormOpen && (
                                                    <div className="p-4 bg-[#F8F9FA] border border-gray-200 rounded-sm space-y-4 animate-in slide-in-from-top-2 duration-300">
                                                        {/* Row 1: Name & ID */}
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="flex flex-col w-full">
                                                                <label className="text-label font-bold text-black uppercase tracking-[0.15em] mb-1.5">Person Name *</label>
                                                                <input
                                                                    type="text"
                                                                    value={pickupName}
                                                                    onChange={(e) => setPickupName(e.target.value)}
                                                                    className="w-full px-4 py-2 bg-white border border-gray-300 outline-none text-body font-medium transition-all focus:border-black hover:border-gray-400 h-11 rounded-none"
                                                                    placeholder={t("m.name")}
                                                                />
                                                            </div>
                                                            <div className="flex flex-col w-full">
                                                                <label className="text-label font-bold text-black uppercase tracking-[0.15em] mb-1.5">Person ID *</label>
                                                                <input
                                                                    type="text"
                                                                    value={pickupId}
                                                                    onChange={(e) => setPickupId(e.target.value)}
                                                                    className="w-full px-4 py-2 bg-white border border-gray-300 outline-none text-body font-medium transition-all focus:border-black hover:border-gray-400 h-11 rounded-none"
                                                                    placeholder={t("m.id")}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Row 2: Mobile Number */}
                                                        <div className="flex flex-col w-full">
                                                            <label className="text-label font-bold text-black uppercase tracking-[0.15em] mb-1.5">Mobile Number *</label>
                                                            <input
                                                                type="tel"
                                                                value={pickupMobile}
                                                                onChange={(e) => setPickupMobile(e.target.value)}
                                                                className="w-full px-4 py-2 bg-white border border-gray-300 outline-none text-body font-medium transition-all focus:border-black hover:border-gray-400 h-11 rounded-none"
                                                                placeholder="Enter Mobile Number"
                                                            />
                                                        </div>

                                                        {/* Row 3: Date & Time */}
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {/* Calendar Date Picker */}
                                                            <div className="flex flex-col w-full">
                                                                <label className="text-label font-bold text-black uppercase tracking-[0.15em] mb-1.5">Pick Up Date *</label>
                                                                <div className="relative w-full pickup-datepicker">
                                                                    <DatePicker
                                                                        ref={datePickerRef}
                                                                        selected={pickupDate}
                                                                        onChange={(date: Date | null) => {
                                                                            if (date) setPickupDate(date);
                                                                        }}
                                                                        minDate={new Date()}
                                                                        dateFormat="MM/dd/yyyy"
                                                                        placeholderText={t("m.select")}
                                                                        className="w-full h-11 px-4 py-2 bg-white border border-gray-300 outline-none text-body font-medium transition-all cursor-pointer hover:border-gray-400 focus:border-black rounded-none"
                                                                        calendarClassName="retro-datepicker"
                                                                        showPopperArrow={false}
                                                                        popperPlacement="bottom-start"
                                                                        renderCustomHeader={({
                                                                            date,
                                                                            decreaseMonth,
                                                                            increaseMonth,
                                                                            prevMonthButtonDisabled,
                                                                            nextMonthButtonDisabled,
                                                                        }) => (
                                                                            <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100">
                                                                                <button
                                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); decreaseMonth(); }}
                                                                                    disabled={prevMonthButtonDisabled}
                                                                                    type="button"
                                                                                    className={`p-1.5 rounded-full hover:bg-gray-100 transition-colors ${prevMonthButtonDisabled ? "opacity-30 cursor-not-allowed" : "text-black"}`}
                                                                                >
                                                                                    <ChevronLeft size={18} />
                                                                                </button>
                                                                                <span className="text-body font-black uppercase tracking-widest text-black">
                                                                                    {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                                                                </span>
                                                                                <button
                                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); increaseMonth(); }}
                                                                                    disabled={nextMonthButtonDisabled}
                                                                                    type="button"
                                                                                    className={`p-1.5 rounded-full hover:bg-gray-100 transition-colors ${nextMonthButtonDisabled ? "opacity-30 cursor-not-allowed" : "text-black"}`}
                                                                                >
                                                                                    <ChevronRight size={18} />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Scrollable Time Picker */}
                                                            <div className="flex flex-col w-full">
                                                                <label className="text-label font-bold text-black uppercase tracking-[0.15em] mb-1.5">Pick Up Time *</label>
                                                                <div className="relative w-full">
                                                                    {isLoadingTimeSlots ? (
                                                                        <div className="w-full h-11 px-4 py-2 bg-white border border-gray-300 flex items-center gap-2">
                                                                            <span className="text-body-sm text-gray-400">{t("common.loading")}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div ref={timeRef} className="relative">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setIsTimeDropdownOpen((prev) => !prev)}
                                                                                className={`w-full h-11 px-4 py-2 bg-white border outline-none text-body font-medium transition-all cursor-pointer hover:border-gray-400 focus:border-black flex items-center justify-between rounded-none ${isTimeDropdownOpen ? "border-brand-yellow" : "border-gray-300"}`}
                                                                            >
                                                                                <span className={pickupTime ? "text-black" : "text-gray-400"}>
                                                                                    {pickupTime
                                                                                        ? availableTimeSlots.find((s) => (s.time || s.label) === pickupTime)?.label || pickupTime
                                                                                        : t("m.select")}
                                                                                </span>
                                                                                <ChevronDown size={14} className={`text-gray-500 transition-transform ${isTimeDropdownOpen ? "rotate-180" : ""}`} />
                                                                            </button>
                                                                            {isTimeDropdownOpen && createPortal(
                                                                                <>
                                                                                    <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setIsTimeDropdownOpen(false)} />
                                                                                    <ul
                                                                                        ref={timeDropdownRef}
                                                                                        className="bg-white border border-gray-300 rounded-sm shadow-xl max-h-48 overflow-y-auto"
                                                                                        style={{
                                                                                            position: "fixed",
                                                                                            zIndex: 9999,
                                                                                            top: timeRef.current ? timeRef.current.getBoundingClientRect().bottom + 4 : 0,
                                                                                            left: timeRef.current ? timeRef.current.getBoundingClientRect().left : 0,
                                                                                            width: timeRef.current ? timeRef.current.getBoundingClientRect().width : "auto",
                                                                                        }}
                                                                                    >
                                                                                        <li
                                                                                            onClick={() => {
                                                                                                setPickupTime("");
                                                                                                setIsTimeDropdownOpen(false);
                                                                                            }}
                                                                                            className={`px-4 py-2 text-body font-medium cursor-pointer transition-colors ${pickupTime === "" ? "bg-brand-yellow text-white" : "hover:bg-gray-100 text-gray-400"}`}
                                                                                        >
                                                                                            Select Time
                                                                                        </li>
                                                                                        {availableTimeSlots.map((slot: any) => (
                                                                                            <li
                                                                                                key={slot.time || slot.label}
                                                                                                onClick={() => {
                                                                                                    setPickupTime(slot.time || slot.label);
                                                                                                    setIsTimeDropdownOpen(false);
                                                                                                }}
                                                                                                className={`px-4 py-2 text-body font-medium cursor-pointer transition-colors ${pickupTime === (slot.time || slot.label) ? "bg-brand-yellow text-white" : "hover:bg-gray-100"}`}
                                                                                            >
                                                                                                {slot.label}
                                                                                            </li>
                                                                                        ))}
                                                                                    </ul>
                                                                                </>,
                                                                                document.body
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-subtle shadow-sm rounded-sm">
                            <SectionHeader title={t("checkout.paymentMethod")} step={4} />

                            <div className="p-5">
                                {(() => {
                                    // Exclusively render Credit Account and Bank Transfer
                                    const methodsToRender = [
                                        { code: "checkmo", title: "Credit Account" },
                                    ];

                                    return (
                                        <div className="space-y-4">
                                            {methodsToRender.map((method) => {
                                                const isSelected = paymentMethod === method.code;
                                                const titleKey = `payment_method.${method.code}`;
                                                const title = t(titleKey) !== titleKey ? t(titleKey) : method.title;

                                                return (
                                                    <div key={method.code} className="space-y-3">
                                                        <label
                                                            className="flex items-center gap-3 cursor-pointer py-1 group"
                                                            onClick={() => {
                                                                setPaymentMethod(method.code);
                                                                if (method.code === "checkmo") {
                                                                    setIsPaymentCommitmentOpen(true);
                                                                } else {
                                                                    setIsPaymentCommitmentOpen(false);
                                                                }
                                                            }}
                                                        >
                                                            <span className="relative flex items-center justify-center">
                                                                <input
                                                                    type="radio"
                                                                    name="payment_method"
                                                                    value={method.code}
                                                                    checked={isSelected}
                                                                    onChange={() => {
                                                                        setPaymentMethod(method.code);
                                                                        if (method.code === "checkmo") {
                                                                            setIsPaymentCommitmentOpen(true);
                                                                        } else {
                                                                            setIsPaymentCommitmentOpen(false);
                                                                        }
                                                                    }}
                                                                    className="appearance-none w-4 h-4 border-2 border-gray-300 rounded-full checked:border-black focus:outline-none transition-all cursor-pointer"
                                                                />
                                                                {isSelected && (
                                                                    <span className="absolute w-2.5 h-2.5 bg-black rounded-full pointer-events-none" />
                                                                )}
                                                            </span>
                                                            <span className="text-body font-bold transition-colors text-black">
                                                                {title}
                                                            </span>
                                                        </label>

                                                        {method.code === "checkmo" && isSelected && (
                                                            <div className="mt-3 relative">
                                                                <div
                                                                    className="w-full px-4 py-2.5 text-sm font-medium text-black bg-white border border-gray-200 rounded focus:border-primary focus:outline-none transition-all placeholder:text-black/40 placeholder:font-normal flex items-center justify-between cursor-pointer select-none"
                                                                    onClick={() => setIsPaymentCommitmentOpen(!isPaymentCommitmentOpen)}
                                                                >
                                                                    <span className="text-body font-bold transition-colors text-black">
                                                                        {t("multi.paymentCommitment")}
                                                                    </span>
                                                                    <ChevronDown
                                                                        size={20}
                                                                        className={`text-black/60 transition-transform duration-300 ${isPaymentCommitmentOpen ? "rotate-180" : ""}`}
                                                                    />
                                                                </div>

                                                                {isPaymentCommitmentOpen && (
                                                                    <div className="p-2 md:p-4 bg-white space-y-3 absolute left-0 top-full w-full border border-[#ddd] rounded-b-lg select-none z-[10]">
                                                                        <div
                                                                            className={`w-full py-6 md:py-10 border-2 border-dashed border-gray-300 bg-gray-50/50 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-300 hover:border-black hover:bg-white rounded-xl ${dragActive ? "border-black bg-white" : ""}`}
                                                                            onClick={() => paymentCommitmentRef.current?.click()}
                                                                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                                                            onDragLeave={() => setDragActive(false)}
                                                                            onDrop={(e) => {
                                                                                e.preventDefault();
                                                                                setDragActive(false);
                                                                                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                                                                    addPaymentCommitmentFiles(Array.from(e.dataTransfer.files));
                                                                                }
                                                                            }}
                                                                        >
                                                                            <div className="text-center px-3 md:px-6">
                                                                                <p className="text-h3 text-black font-bold mb-3 tracking-tight">{t("m.drop-files-here")}</p>
                                                                                <p className="text-body-lg text-black/80 font-medium">
                                                                                    {t("m.allowed-file-types")} : jpg,jpeg,png,zip,rar,docx,doc,pdf,xls,xlsx,csv,msg
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <input
                                                                            type="file"
                                                                            className="hidden"
                                                                            multiple
                                                                            ref={paymentCommitmentRef}
                                                                            onChange={handlePaymentCommitmentChange}
                                                                            accept=".jpg,.jpeg,.png,.zip,.rar,.docx,.doc,.pdf,.xls,.xlsx,.csv,.msg"
                                                                        />

                                                                        {/* File List */}
                                                                        {paymentCommitmentNames.length > 0 && (
                                                                            <div className="flex flex-wrap gap-x-4 gap-y-3 pt-2">
                                                                                {paymentCommitmentNames.map((name) => (
                                                                                    <div key={name} className="flex border border-subtle rounded-sm overflow-hidden group shadow-sm bg-white">
                                                                                        <div className="px-6 py-3 flex-1 flex items-center min-w-0">
                                                                                            <span className="text-body font-black text-black truncate ltr:mr-2 rtl:ml-2">
                                                                                                {name}
                                                                                            </span>
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); removePaymentCommitment(name); }}
                                                                                            className="bg-red-50 text-red-600 px-6 py-3 text-label font-black uppercase tracking-widest transition-all hover:bg-red-600 hover:text-white border-l border-subtle active:scale-95"
                                                                                        >
                                                                                            {t("m.remove")}
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* ═══════════ Right Column (Order Summary) ═══════════ */}
                    <div className="lg:col-span-4 xl:col-span-3 space-y-6">
                        <div className="sticky top-24 overflow-hidden bg-white border border-[#ddd] rounded-sm transition-all duration-300">
                            {/* Header exactly as per image */}
                            <div className="bg-gray-50/80 p-3 border-b border-[#ddd] flex items-center gap-2.5 h-[50px]">
                                <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                                    <Check size={12} strokeWidth={4} className="text-white" />
                                </div>
                                <h3 className="text-label font-bold text-black uppercase tracking-[0.15em]">
                                    {t("m.order-summary")}
                                </h3>
                            </div>

                            <div className="p-0">
                                {/* Collapsible Item Count Header */}
                                <div
                                    className="px-4 py-3 flex items-center justify-between border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => setIsItemsListOpen(!isItemsListOpen)}
                                >
                                    <span className="text-body font-bold text-black">
                                        {cart?.items_count || 0} {t("cart.itemsInCart")}
                                    </span>
                                    <ChevronDown
                                        size={20}
                                        className={`text-black transition-transform duration-300 ${isItemsListOpen ? "rotate-180" : ""}`}
                                    />
                                </div>

                                {/* Collapsible Product List */}
                                <div
                                    className={`overflow-hidden transition-all duration-500 ease-in-out ${isItemsListOpen ? "max-height-none border-b border-gray-100" : "max-h-0"}`}
                                    style={{ maxHeight: isItemsListOpen ? "1000px" : "0" }}
                                >
                                    <div className="space-y-3 sm:space-y-3 md:space-y-4 p-4">
                                        {cart?.items?.map((item) => (
                                            <div key={item.item_id} className="flex gap-4 items-start pb-3 border-b border-[#ddd] last:border-0 last:pb-0">
                                                <div className="w-13 h-13 flex-shrink-0 border border-[#ddd] rounded-sm overflow-hidden bg-gray-50 p-1">
                                                    <img
                                                        src={item.image_url || "/images/tyre-sample.png"}
                                                        alt={item.name}
                                                        className="w-full h-full object-contain"
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0 pt-0.5">
                                                    <h4 className="text-body font-semibold text-black leading-tight mb-1.5 uppercase">
                                                        {item.name}
                                                    </h4>

                                                    {/* Qty and Price side-by-side horizontally matching the reference image */}
                                                    <div className="flex items-center gap-4 text-body mt-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-black">{t("m.qty")} :</span>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                value={item.qty}
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value);
                                                                    if (val > 0) updateCartItem(item.item_id, val);
                                                                }}
                                                                className="w-10 h-7 border border-subtle rounded-sm text-center text-body-sm font-semibold focus:outline-none focus:border-brand-yellow bg-gray-50/50"
                                                            />
                                                        </div>
                                                        <div className="text-body font-semibold text-black price currency-riyal">
                                                            <Price amount={item.row_total} />
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Totals Section */}
                                <div className="px-4 py-3 space-y-2.5 sm:space-y-3">
                                    <div className="flex justify-between items-center text-body-lg">
                                        <span className="text-body md:text-body-lg font-semibold text-black uppercase tracking-tight">{t("cart.subtotal")}</span>
                                        <span className="text-body md:text-body-lg font-semibold text-black price">
                                            <Price amount={displayTotals.subtotal} />
                                        </span>
                                    </div>

                                    {totals?.discount_amount && totals.discount_amount !== 0 ? (
                                        <div className="flex justify-between items-center text-body-lg">
                                            <span className="text-body md:text-body-lg font-semibold text-green-600 uppercase tracking-tight">{t("m.discount")}</span>
                                            <span className="text-body md:text-body-lg font-semibold text-green-600">
                                                - <Price amount={Math.abs(totals.discount_amount)} />
                                            </span>
                                        </div>
                                    ) : null}

                                    <div className="flex justify-between items-center">
                                        <span className="text-body md:text-body-lg font-semibold text-black uppercase tracking-tight">{t("cart.vat")}</span>
                                        <span className="text-body md:text-body-lg font-semibold text-black">
                                            <Price amount={displayTotals.tax_amount} />
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <span className="text-body md:text-body-lg font-semibold text-black uppercase tracking-tight">{t("m.shipping")}</span>
                                        <span className="text-body md:text-body-lg font-semibold text-black">
                                            <Price amount={displayTotals.shipping_amount} />
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center pt-3 border-t border-[#ddd]">
                                        <span className="text-body-lg md:text-h3-sm font-semibold text-black uppercase tracking-tight">{t("common.grandTotal")}</span>
                                        <span className="text-body-lg md:text-h3-sm font-semibold text-black">
                                            <Price amount={displayTotals.grand_total} />
                                        </span>
                                    </div>
                                </div>

                                {/* Order Comment */}
                                <div className="px-4 py-3 border-t border-[#ddd]">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-semibold text-black uppercase tracking-widest mb-2 block">
                                            {t("m.order-comment")}
                                        </label>
                                        <textarea
                                            placeholder={t("m.enter-your-comment")}
                                            className="w-full min-h-[70px] resize-none px-4 py-2.5 text-sm font-medium text-black bg-white border border-gray-200 rounded focus:border-primary focus:outline-none transition-all placeholder:text-black/40 placeholder:font-normal"
                                            onChange={(e) => setComment(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Place Order Button */}
                                <div className="px-4 pb-3">
                                    <button
                                        onClick={handlePlaceOrder}
                                        className={`w-full px-2 py-3 xl:py-4 text-sm font-semibold uppercase tracking-normal xl:tracking-[0.2em] leading-tight transition-all duration-300 shadow-md rounded text-center border ${isPlacingOrder
                                            ? "bg-gray-100 text-gray-400 cursor-not-allowed border-subtle"
                                            : "bg-brand-yellow text-black hover:bg-black hover:text-white border-brand-yellow hover:border-black active:scale-[0.98]"
                                            }`}
                                    >
                                        {isPlacingOrder ? (
                                            t("common.loading")
                                        ) : (
                                            <>
                                                {t("common.placeOrder")}
                                                <span className="hidden xl:inline"> ➜</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Warehouse Selection Modal */}
            {isWarehouseModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-200">
                        {/* Modal Header */}
                        <div className="bg-black py-4 px-6 flex justify-end items-center">
                            <button
                                onClick={() => setIsWarehouseModalOpen(false)}
                                className="text-white hover:text-brand-yellow transition-colors"
                            >
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-2 sm:p-2 max-h-[70vh] overflow-y-auto space-y-3 bg-gray-50/30">
                            {stores.length > 0 ? (
                                stores.map((wh) => (
                                    <div
                                        key={wh.id}
                                        className={`py-0 pr-0 pl-4 border transition-all cursor-pointer bg-white group ${tempSelectedWarehouse?.id === wh.id ? "border-black ring-1 ring-black shadow-md" : "border-gray-200 hover:border-gray-400"}`}
                                        onClick={() => setTempSelectedWarehouse({ id: wh.id, name: wh.name })}
                                    >
                                        <h4 className="text-h3-sm font-bold text-black uppercase mb-0 tracking-wide">{wh.name}</h4>
                                        <div className="space-y-1 text-body tracking-[1px] pb-[2px]">
                                            <p className="flex items-start gap-2">
                                                <span className="font-bold text-black min-w-[66px] flex-shrink-0">Address:</span>
                                                <span className="text-gray-700">{wh.address}</span>
                                            </p>
                                            <p className="flex items-start gap-2">
                                                <span className="font-bold text-black min-w-[66px] flex-shrink-0">E-Mail:</span>
                                                {wh.email && (
                                                    <a href={`mailto:${wh.email}`} className="text-blue-600 hover:underline font-bold" onClick={(e) => e.stopPropagation()}>{wh.email}</a>
                                                )}
                                            </p>
                                            <p className="flex items-start gap-2">
                                                <span className="font-bold text-black min-w-[66px] flex-shrink-0">GPS Location:</span>
                                                <a href={wh.gps_location} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold" onClick={(e) => e.stopPropagation()}>
                                                    {t("m.view-on-maps")}
                                                </a>
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="py-6 space-y-3">
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} className="border border-subtle rounded-lg p-4 space-y-2">
                                            <div className="h-3.5 w-1/3 bg-gray-200 rounded animate-pulse" />
                                            <div className="h-3 w-2/3 bg-gray-200 rounded animate-pulse" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-white">
                            <button
                                className={`px-10 py-3 text-body font-black uppercase tracking-widest transition-all ${tempSelectedWarehouse ? "bg-brand-yellow text-black hover:bg-black hover:text-white shadow-md" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                                onClick={() => {
                                    if (tempSelectedWarehouse) {
                                        setSelectedWarehouse(tempSelectedWarehouse.name);
                                        setSelectedWarehouseId(tempSelectedWarehouse.id);
                                        setIsWarehouseModalOpen(false);
                                        setIsPickupFormOpen(true);
                                        toast.success(t("checkout.selectedWarehouse").replace("{0}", tempSelectedWarehouse.name));
                                    }
                                }}
                                disabled={!tempSelectedWarehouse}
                            >
                                {t("m.pick-up-here")}
                            </button>
                            <button
                                className="px-10 py-3 bg-black text-white text-body font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-md"
                                onClick={() => setIsWarehouseModalOpen(false)}
                            >
                                {t("m.close")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CheckoutPageUI;
