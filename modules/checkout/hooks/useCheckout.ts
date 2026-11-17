"use client";

import { useState, useCallback, useEffect } from "react";
import { getClientLocale, getAuthToken } from "@/lib/api/api-client";

export interface CustomAttribute {
    attribute_code: string;
    value: string;
}

export interface Address {
    id: string;
    firstname: string;
    lastname: string;
    company?: string;
    street: string;
    city: string;
    region?: string;
    postcode?: string;
    country_id: string;
    telephone: string;
    isDefault?: boolean;
    /** Magento default billing address. */
    isDefaultBilling?: boolean;
    custom_attributes?: CustomAttribute[];
}

/** A Magento shipping method, identified exactly as Magento does (carrier + method). */
export interface MultiShippingMethodChoice {
    carrier_code: string;
    method_code: string;
}

export interface ShippingMethod {
    code: string;
    carrierCode: string;
    methodCode: string;
    title: string;
    description: string;
    price: number;
    currency: string;
}

/**
 * Whether a shipping method Magento returned is its warehouse-pickup method, so the checkout
 * shows the warehouse / pickup-details form under it. Magento's API has no flag for this; the
 * only signal is Magento's own carrier/method code. It never adds a method: only methods
 * Magento returned are listed.
 */
export function isPickupMethod(m: Pick<ShippingMethod, "carrierCode" | "methodCode">): boolean {
    return /pickup/i.test(`${m.carrierCode}_${m.methodCode}`);
}

export interface PaymentMethod {
    code: string;
    title: string;
}

/** A Magento pickup warehouse (Klever REST checkout/pickup-stores). */
export interface Store {
    id: string;
    name: string;
    address: string;
    city: string;
    email: string;
    /** Google Maps link at Magento's latitude/longitude; "" when Magento has no coordinates. */
    gps_location: string;
}

export interface CheckoutTotals {
    subtotal: number;
    tax_amount: number;
    /** Magento applied tax lines (label + amount) of the cart. */
    taxes?: Array<{ label: string; amount: number }>;
    /** Magento's selected shipping method amount; null when no method is selected yet. */
    shipping_amount?: number | null;
    discount_amount?: number;
    /** Magento's discount label(s). */
    discount_label?: string;
    grand_total: number;
    currency_code: string;
}

/**
 * Formats Magento error messages that contain placeholders like %1, %2
 */
function formatMagentoError(data: any): string {
    if (!data) return "An unknown error occurred";

    let message = data.message || "An unknown error occurred";

    // Magento positional placeholders (%1, %2)
    if (data.parameters) {
        if (Array.isArray(data.parameters)) {
            data.parameters.forEach((param: any, index: number) => {
                message = message.replace(`%${index + 1}`, String(param));
            });
        } else if (typeof data.parameters === 'object') {
            // Sometimes it's key-value
            Object.keys(data.parameters).forEach(key => {
                message = message.replace(`%${key}`, String(data.parameters[key]));
            });
        }
    }

    // Append child errors
    if (data.errors && Array.isArray(data.errors)) {
        const details = data.errors
            .map((e: any) => e.message || JSON.stringify(e))
            .join(". ");
        if (details) message = `${message}. Details: ${details}`;
    }

    return message;
}

export interface UseCheckoutOptions {
    skipInitialFetch?: boolean;
}

export function useCheckout(options: UseCheckoutOptions = {}) {
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [totals, setTotals] = useState<CheckoutTotals | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    // True once Magento's payment-method list has been requested at least once (it may be empty).
    const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
    // Multi-address checkout: Magento's billing-step payment methods (kleverMultishippingPaymentMethods).
    const [multiShippingPaymentMethods, setMultiShippingPaymentMethods] = useState<PaymentMethod[]>([]);
    const [multiShippingPaymentMethodsLoaded, setMultiShippingPaymentMethodsLoaded] = useState(false);
    const [multiShippingPaymentMethodsError, setMultiShippingPaymentMethodsError] = useState<string | null>(null);
    // True once Magento's pickup warehouses have been requested (the list may be empty).
    const [pickupStoresLoaded, setPickupStoresLoaded] = useState(false);
    const [isTotalsLoading, setIsTotalsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ─── Fetch Checkout Totals ───
    const fetchTotals = useCallback(async () => {
        try {
            setIsTotalsLoading(true);
            const token = await getAuthToken();
            if (!token) return;

            const res = await fetch("/api/kleverapi/checkout/totals", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale()
                },
                cache: "no-store",
            });
            const data = await res.json();

            if (res.ok) {
                setTotals(data);
            }
        } catch (err) {
            console.error("Fetch Totals Error:", err);
        } finally {
            setIsTotalsLoading(false);
        }
    }, []);

    // ─── Fetch Customer Addresses ───
    const fetchAddresses = useCallback(async () => {
        try {
            setIsLoading(true);
            const token = await getAuthToken();
            if (!token) return;

            const res = await fetch("/api/kleverapi/addresses", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale()
                },
            });
            const data = await res.json();

            // The 'addresses' endpoint usually returns an array of addresses directly,
            // or an object with an 'addresses' field if it's the customer info.
            const addressesData = Array.isArray(data) ? data : (data.addresses || []);

            if (res.ok) {
                const mapped: Address[] = addressesData.map((addr: any) => ({
                    id: (addr.id || addr.entity_id || "").toString(),
                    firstname: addr.firstname || "",
                    lastname: addr.lastname || "",
                    company: addr.company || "",
                    street: Array.isArray(addr.street) ? addr.street.join(", ") : (addr.street || ""),
                    city: addr.city || "",
                    region: typeof addr.region === 'string' ? addr.region : (addr.region?.region || addr.region?.region_code || ""),
                    postcode: addr.postcode || "",
                    country_id: addr.country_id || "",
                    telephone: addr.telephone || "",
                    isDefault: !!(addr.default_shipping || addr.is_default_shipping),
                    isDefaultBilling: !!(addr.default_billing || addr.is_default_billing),
                    custom_attributes: addr.custom_attributes || [],
                }));
                setAddresses(mapped);
            }
        } catch (err) {
            console.error("Fetch Addresses Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ─── Fetch Shipping Methods ───
    const fetchShippingMethods = useCallback(async () => {
        // Only Magento's methods: if it returns none (or fails), the list is empty and
        // checkout asks the customer to select a method — nothing is invented.

        try {
            const token = await getAuthToken();
            if (!token) return;

            const res = await fetch("/api/kleverapi/checkout/shipping-methods", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale()
                },
            });

            if (res.ok) {
                const data = await res.json();
                // Normalize — API may return array or object with methods key
                const methods = Array.isArray(data) ? data : (data.methods || data.shipping_methods || []);
                const mapped: ShippingMethod[] = methods.map((m: any) => ({
                    code: m.code || `${m.carrier_code}_${m.method_code}`,
                    carrierCode: m.carrier_code || m.carrierCode || m.code?.split('_')[0] || "",
                    methodCode: m.method_code || m.methodCode || m.code?.split('_')[1] || m.code || "",
                    title: m.method_title || m.carrier_title || m.title || "",
                    description: m.carrier_title || m.description || "",
                    price: Number(m.amount ?? m.price ?? 0),
                    currency: m.base_currency_code ?? m.currency,
                }));
                if (mapped.length > 0) {
                    setShippingMethods(mapped);
                    return;
                }
                // Empty methods array — fall through to fallback
            } else {
                // Backend returned an error response (e.g. empty cart, no shipping configured).
                // Read the message via .text() to avoid Next.js dev overlay flagging a thrown Error.
                const body = await res.text().catch(() => "");
                const msg = body.toLowerCase();
                if (!msg.includes("empty cart") && !msg.includes("retrieving shipping methods")) {
                    console.warn(`[shipping-methods] HTTP ${res.status}: ${body.slice(0, 200)}`);
                }
            }
            setShippingMethods([]);
        } catch (err) {
            // Network failure or unexpected runtime error
            console.warn("[shipping-methods] network error, using fallback:", err);
            setShippingMethods([]);
        }
    }, []);

    // ─── Fetch Payment Methods ───
    const fetchPaymentMethods = useCallback(async () => {
        try {
            const token = await getAuthToken();
            if (!token) {
                console.warn("No token available for fetchPaymentMethods");
                return;
            }

            const res = await fetch("/api/kleverapi/checkout/payment-methods", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale()
                },
            });

            if (res.ok) {
                const data = await res.json();
                const methods = Array.isArray(data) ? data : (data.methods || data.payment_methods || []);
                const mapped: PaymentMethod[] = methods
                    .filter((m: any) => m.is_available !== false) // Only show available methods
                    .map((m: any) => ({
                        code: m.code || m.method_code || "",
                        title: m.title || m.method_title || "",
                    }));
                if (mapped.length > 0) {
                    setPaymentMethods(mapped);
                    return;
                }
            }
            // No invented methods — only what Magento offers for this store/cart.
            setPaymentMethods([]);
        } catch (err) {
            // Silently handle "empty cart" errors during background fetch
            if (err instanceof Error && err.message.toLowerCase().includes("empty cart")) {
                console.warn("Background fetch payment methods skipped: cart is empty");
            } else {
                console.error("Fetch Payment Methods Error:", err);
            }
            setPaymentMethods([]);
        } finally {
            setPaymentMethodsLoaded(true);
        }
    }, []);

    // ─── Fetch Pickup Stores ───
    const fetchPickupStores = useCallback(async () => {
        try {
            const token = await getAuthToken();
            if (!token) return;

            const res = await fetch("/api/kleverapi/checkout/pickup-stores", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale()
                },
            });

            if (res.status === 401) {
                console.warn("[useCheckout] 401 Unauthorized for pickup stores — skipping (session managed by ProtectedLayout)");
                return;
            }

            if (res.ok) {
                const data = await res.json();
                const storesData = Array.isArray(data) ? data : (data.stores || []);
                // GPS link: Magento's saved link (field `gps_location`, the link its popup shows,
                // e.g. goo.gl/maps/…) once Magento's pickup-stores API returns it. Until then,
                // Google Maps at Magento's own latitude/longitude.
                const coord = (v: unknown) => (v == null ? "" : String(v).trim());
                const mapped: Store[] = storesData.map((s: any) => {
                    const lat = coord(s.latitude);
                    const lng = coord(s.longitude);
                    return {
                        id: s.id?.toString() || s.store_id?.toString() || "",
                        name: String(s.name || s.store_name || "").trim(),
                        address: String(s.address || "").trim(),
                        city: String(s.city || "").trim(),
                        email: String(s.email || "").trim(),
                        gps_location: String(s.gps_location || "").trim()
                            || (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : ""),
                    };
                });
                setStores(mapped);
            }
        } catch (err) {
            console.error("Fetch Pickup Stores Error:", err);
        } finally {
            setPickupStoresLoaded(true);
        }
    }, []);

    // ─── Fetch Pickup Time Slots ───
    const fetchPickupTimeSlots = useCallback(async (storeId: string, date: string) => {
        try {
            const token = await getAuthToken();
            if (!token) return [];

            const res = await fetch(`/api/kleverapi/checkout/pickup-time-slots/${storeId}/${date}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale()
                },
            });

            if (res.ok) {
                const data = await res.json();
                // Normalize response: Expecting array of { time, label, enabled }
                let slots = Array.isArray(data) ? data : (data.slots || data.time_slots || []);

                // If API returns strings instead of objects, convert them
                slots = slots.map((s: any) => {
                    if (typeof s === 'string') {
                        return { time: s, label: s, enabled: true };
                    }
                    return {
                        time: s.time || s.value || "",
                        label: s.label || s.time || s.value || "",
                        enabled: typeof s.enabled === 'boolean' ? s.enabled : true
                    };
                });

                // Only Magento's slots for this warehouse + date (may be none).
                return slots;
            }
            return [];
        } catch (err) {
            console.error("Fetch Pickup Time Slots Error:", err);
            return [];
        }
    }, []);

    // ─── Set Shipping Address (also refreshes totals + methods) ───
    const setShippingAddress = useCallback(async (addressId: string) => {
        try {
            setIsTotalsLoading(true);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/checkout/shipping-address", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify({ address_id: Number(addressId) }),
            });

            if (!res.ok) {
                const data = await res.json();
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }

            const data = await res.json();

            // If the API returns shipping methods or payment methods alongside, use them
            if (data.shipping_methods && Array.isArray(data.shipping_methods)) {
                const mapped: ShippingMethod[] = data.shipping_methods.map((m: any) => ({
                    code: m.code || `${m.carrier_code}_${m.method_code}`,
                    carrierCode: m.carrier_code || m.carrierCode || "",
                    methodCode: m.method_code || m.methodCode || "",
                    title: m.method_title || m.carrier_title || m.title || "",
                    description: m.carrier_title || m.description || "",
                    price: Number(m.amount ?? m.price ?? 0),
                    currency: m.base_currency_code ?? m.currency,
                }));
                if (mapped.length > 0) setShippingMethods(mapped);
            }

            if (data.payment_methods && Array.isArray(data.payment_methods)) {
                const mapped = data.payment_methods.map((m: any) => ({
                    code: m.code || m.method_code || "",
                    title: m.title || m.method_title || "",
                }));
                if (mapped.length > 0) setPaymentMethods(mapped);
            }

            // Refresh totals and shipping methods after address change
            await fetchTotals();
            await fetchShippingMethods();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to set shipping address");
            throw err;
        } finally {
            setIsTotalsLoading(false);
        }
    }, [fetchTotals, fetchShippingMethods]);

    // ─── Add New Address ───
    const addAddress = useCallback(async (addressData: Partial<Address>) => {
        try {
            setIsLoading(true);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/my-account", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify({ address: addressData }),
            });
            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            await fetchAddresses();
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add address");
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [fetchAddresses]);

    // ─── Save PO Number ───
    const savePoNumber = useCallback(async (poNumber: string) => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/checkout/po-number", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify({ poNumber }),
            });
            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save PO number");
            throw err;
        }
    }, []);

    // ─── Set Order Comment ───
    const saveOrderComment = useCallback(async (comment: string) => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/checkout/order-comment", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify({ comment }),
            });
            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save order comment");
            throw err;
        }
    }, []);

    // ─── Get Order Comment ───
    const getOrderComment = useCallback(async () => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/checkout/order-comment", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to get order comment");

            // Handle different resonse formats: { comment: "..." } or "..." or { data: { comment: "..." } }
            // If common Magento responses return just the string
            if (typeof data === 'string') return data;
            return data.comment || data.order_comment || "";
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to get order comment");
            throw err;
        }
    }, []);

    // ─── Upload PO File ───
    const uploadPoFile = useCallback(async (formData: FormData) => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/checkout/po-upload", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to upload PO file");
            throw err;
        }
    }, []);

    // ─── Get PO Upload ───
    const getPoUpload = useCallback(async () => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/checkout/po-upload", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to get PO upload");
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to get PO upload");
            throw err;
        }
    }, []);

    // ─── Delete PO File ───
    const deletePoFile = useCallback(async (filename: string) => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch(`/api/kleverapi/checkout/po-upload/${encodeURIComponent(filename)}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
            });
            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete PO file");
            throw err;
        }
    }, []);

    // ─── Set Shipping Method ───
    const setShippingMethod = useCallback(async (carrierCode: string, methodCode: string) => {
        try {
            setIsTotalsLoading(true);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            console.log(">>> Set Shipping Method Payload:", { carrier_code: carrierCode, method_code: methodCode });

            const res = await fetch("/api/kleverapi/checkout/shipping-method", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify({
                    carrier_code: carrierCode,
                    method_code: methodCode
                }),
            });

            const data = await res.json();
            console.log("<<< Set Shipping Method Response Status:", res.status, data);
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }

            // Refresh totals and payment methods after selection
            await fetchTotals();
            await fetchPaymentMethods();
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to set shipping method");
            throw err;
        } finally {
            setIsTotalsLoading(false);
        }
    }, [fetchTotals, fetchPaymentMethods]);

    // ─── Set Shipping Extras (Pickup details) ───
    const setShippingExtras = useCallback(async (extras: {
        pickupStore: string;
        pickupDate: string;
        pickupTime: string;
        pickupPersonName: string;
        pickupPersonId: string;
        pickupMobileNumber: string;
    }) => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/checkout/shipping-extras", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify(extras),
            });
            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to set shipping extras");
            throw err;
        }
    }, []);

    // ─── Place Order ───
    const placeOrder = useCallback(async (orderData: {
        address_id: number;
        shipping_method: string;
        payment_method: string;
        cart_id?: number | string | null;
        po_number?: string;
        comment?: string;
    }) => {
        try {
            setIsLoading(true);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/checkout/place-order", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify(orderData),
            });
            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to place order");
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ─── Multi-Shipping Payment Methods (Magento's multi-address billing list) ───
    // kleverMultishippingPaymentMethods for this website's cart. Only methods Magento marks
    // is_available === true are offered — nothing is added. Magento's message is kept on failure.
    // `startIfNeeded`: when Magento refuses because the multi-address checkout isn't started, start
    // it (kleverMultishippingStart) and ask once more — used by the billing step only.
    const requestMultiShippingPaymentMethods = async (token: string) => {
        const res = await fetch("/api/kleverapi/multishipping/payment-methods", {
            headers: { Authorization: `Bearer ${token}`, "x-locale": getClientLocale() },
            cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        return { res, data };
    };
    const fetchMultiShippingPaymentMethods = useCallback(async (options?: { startIfNeeded?: boolean }) => {
        try {
            setMultiShippingPaymentMethodsError(null);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");
            let { res, data } = await requestMultiShippingPaymentMethods(token);
            // 400 = Magento refused the request (not an authorization problem), e.g. not started.
            if (res.status === 400 && options?.startIfNeeded) {
                const started = await fetch("/api/kleverapi/multishipping/start", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "x-locale": getClientLocale() },
                });
                if (started.ok) ({ res, data } = await requestMultiShippingPaymentMethods(token));
            }
            if (!res.ok) throw new Error(formatMagentoError(data));
            const list: any[] = Array.isArray(data?.methods) ? data.methods : [];
            setMultiShippingPaymentMethods(list
                .filter((m) => m.is_available !== false)
                .map((m) => ({ code: String(m.code), title: String(m.title ?? "") })));
        } catch (err) {
            setMultiShippingPaymentMethods([]);
            setMultiShippingPaymentMethodsError(err instanceof Error ? err.message : "Payment methods unavailable");
        } finally {
            setMultiShippingPaymentMethodsLoaded(true);
        }
    }, []);

    // ─── Start Multi-Shipping ───
    const startMultiShipping = useCallback(async () => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/multishipping/start", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
            });

            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to start multi-shipping";
            throw new Error(msg);
        }
    }, []);

    // ─── Assign Multi-Shipping ───
    const assignMultiShipping = useCallback(async (assignments: Array<{ quote_item_id: number, customer_address_id: number | string, qty: number }>) => {
        try {
            setIsLoading(true);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/multishipping/assign", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify({
                    request: {
                        assignments: assignments
                    }
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to assign multi-shipping addresses";
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ─── Fetch Multi-Shipping Shipping Methods ───
    const fetchMultiShippingMethods = useCallback(async () => {
        try {
            setIsLoading(true);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const res = await fetch("/api/kleverapi/multishipping/shipping-methods", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                }
            });

            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to fetch multi-shipping shipping methods";
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ─── Set Multi-Shipping Shipping Methods ───
    // methodsByQuoteAddress: { [quote_address_id]: { carrier_code, method_code } } — the codes
    // exactly as Magento returned them (never split from a joined string).
    const setMultiShippingMethods = useCallback(async (methodsByQuoteAddress: Record<string, MultiShippingMethodChoice>) => {
        try {
            setIsLoading(true);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const formattedMethods = Object.entries(methodsByQuoteAddress).map(([addrId, m]) => ({
                quoteAddressId: Number(addrId),
                carrierCode: m.carrier_code,
                methodCode: m.method_code,
            }));
            if (formattedMethods.length === 0 || formattedMethods.some(m => !(m.quoteAddressId > 0) || !m.carrierCode || !m.methodCode)) {
                throw new Error("Invalid shipping method selection");
            }

            const res = await fetch("/api/kleverapi/multishipping/shipping-methods", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify({
                    request: {
                        methods: formattedMethods
                    }
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to set multi-shipping shipping methods";
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ─── Set Multi-Shipping Billing Address ───
    const setMultiShippingBillingAddress = useCallback(async (addressId: number | string, paymentMethodCode?: string) => {
        try {
            setIsLoading(true);
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const bodyData: any = { addressId: Number(addressId) };
            if (paymentMethodCode) {
                bodyData.paymentMethod = { method: paymentMethodCode };
            }

            const res = await fetch("/api/kleverapi/multishipping/billing-address", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "x-locale": getClientLocale(),
                },
                body: JSON.stringify(bodyData),
            });

            const data = await res.json();
            if (!res.ok) {
                const errorMsg = formatMagentoError(data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to set multi-shipping billing address";
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ─── Fetch Checkout Success ───
    const fetchCheckoutSuccess = useCallback(async (orderId: string) => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Not authenticated");

            const pathLocale = typeof window !== "undefined" && window.location.pathname.startsWith("/ar") ? "ar" : "en";
            const res = await fetch(`/api/kleverapi/checkout/success/${orderId}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "x-locale": pathLocale,
                },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to get order success data");
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to get order success data");
            throw err;
        }
    }, []);

    // ─── Initial Load ───
    useEffect(() => {
        if (options.skipInitialFetch) return;

        fetchAddresses();
        fetchTotals();
        fetchShippingMethods();
        fetchPaymentMethods();
    }, [fetchAddresses, fetchTotals, fetchShippingMethods, fetchPaymentMethods, options.skipInitialFetch]);

    return {
        addresses,
        shippingMethods,
        paymentMethods,
        stores,
        totals,
        isLoading,
        isTotalsLoading,
        error,
        refetchAddresses: fetchAddresses,
        refetchTotals: fetchTotals,
        paymentMethodsLoaded,
        multiShippingPaymentMethods,
        multiShippingPaymentMethodsLoaded,
        multiShippingPaymentMethodsError,
        fetchMultiShippingPaymentMethods,
        pickupStoresLoaded,
        refetchShippingMethods: fetchShippingMethods,
        refetchPaymentMethods: fetchPaymentMethods,
        refetchPickupStores: fetchPickupStores,
        fetchPickupTimeSlots,
        setShippingAddress,
        addAddress,
        placeOrder,
        placeMultiShippingOrder: async (orderData: any) => {
            // NOTE: Do NOT set global isLoading here — it triggers the review page's
            // loadReviewData effect which clears localStorage and causes a redirect loop
            try {
                const token = await getAuthToken();
                if (!token) throw new Error("Not authenticated");

                const res = await fetch("/api/kleverapi/multishipping/place-order", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                        "x-locale": getClientLocale(),
                    },
                    body: JSON.stringify(orderData),
                });
                const data = await res.json();
                if (!res.ok) {
                    const errorMsg = formatMagentoError(data);
                    throw new Error(errorMsg);
                }
                return data;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to place multi-shipping order");
                throw err;
            }
        },
        fetchMultiShippingSuccess: async (orderId: string) => {
            try {
                const token = await getAuthToken();
                if (!token) throw new Error("Not authenticated");

                const res = await fetch(`/api/kleverapi/multishipping/success/${orderId}`, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "x-locale": getClientLocale(),
                    },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || "Failed to get order success data");
                return data;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to get multi-shipping order success data");
                throw err;
            }
        },
        savePoNumber,
        uploadPoFile,
        getPoUpload,
        deletePoFile,
        setShippingMethod,
        setShippingExtras,
        fetchCheckoutSuccess,
        startMultiShipping,
        assignMultiShipping,
        fetchMultiShippingMethods,
        setMultiShippingMethods,
        setMultiShippingBillingAddress,
        getOrderComment,
        saveOrderComment,
    };
}
