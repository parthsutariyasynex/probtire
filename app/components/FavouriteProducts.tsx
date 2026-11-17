"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, X, Info, Star, Trash2, ChevronsUpDown, ChevronUp, ChevronDown, Image as ImageIcon } from "lucide-react";
import { formatPrice, redirectToLogin } from "@/utils/helpers";
import { toast } from "react-hot-toast";
import ProductEnquiryModal from "./ProductEnquiryModal";
import ProductDialog from "./ProductDialog";
import Drawer from "./Drawer";
import Modal from "./Modal";
import Price from "./Price";
import AddToCartPopup from "./AddToCartPopup";
import { FavouriteProductsSkeleton } from "@/components/skeletons";

import { api } from "@/lib/api/api-client";
import { useTranslation } from "@/hooks/useTranslation";
import { getDefaultCategoryId } from "@/lib/store/client-config";
import Pagination, { PageSizeSelect } from "@/components/Pagination";
import { useCart } from "@/modules/cart/context/CartContext";
import { useSession } from "next-auth/react";
import { useLoadingOverlay } from "@/contexts/LoadingOverlayContext";
import PortalDropdown from "@/components/PortalDropdown";

interface Product {
    product_id: number;
    name: string;
    sku: string;
    tyre_size: string;
    pattern: string;
    year: string;
    origin: string;
    image_url: string;
    stock_qty: number;
    stock_status: string;
    price?: number;
    final_price: number;
    original_price?: number;
    offer?: string;
    brand?: string;
    favorite_id?: number | string;
    is_action?: string;
}

function isValidImageUrl(url: any): boolean {
    if (!url || typeof url !== "string") return false;
    const cleanUrl = url.trim().toLowerCase();
    if (
        cleanUrl === "" ||
        cleanUrl === "no" ||
        cleanUrl === "image no" ||
        cleanUrl === "imade no" ||
        cleanUrl === "no_image" ||
        cleanUrl === "none" ||
        cleanUrl === "null" ||
        cleanUrl === "undefined"
    ) {
        return false;
    }
    if (
        cleanUrl.includes("placeholder/image.jpg") ||
        cleanUrl.includes("placeholder/small_image.jpg") ||
        cleanUrl.includes("placeholder/thumbnail.jpg")
    ) {
        return false;
    }
    return true;
}

const BASE_HEADER_KEYS = ['m.brand', 'm.size', 'm.pattern', 'm.year', 'm.origin', 'm.image', 'm.offer', 'm.stock', 'm.price'] as const;
const ACTION_HEADER_KEY = 'm.action';
const BASE_COL_WIDTHS = ['8%', '13%', '13%', '6%', '7%', '7%', '9%', '9%', '10%'] as const;
const ACTION_COL_WIDTH = '110px';

export default function FavouriteProducts({ title }: { title?: React.ReactNode }) {
    const router = useRouter();
    const { t } = useTranslation();
    const { data: session } = useSession();
    const authToken = (session as any)?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    const { refetchCart } = useCart();

    const [favProducts, setFavProducts] = useState<Product[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [addingToCart, setAddingToCart] = useState<string | null>(null);
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [removing, setRemoving] = useState<number | null>(null);
    const { showLoading, hideLoading } = useLoadingOverlay();

    const isSalesPerson = useMemo(() => Number((session as any)?.utypid) === 3, [session]);
    const [isMultiCompany, setIsMultiCompany] = useState(false);
    const [isSubOrMasterCompany, setIsSubOrMasterCompany] = useState(false);

    useEffect(() => {
        if (!authToken) { setIsMultiCompany(false); setIsSubOrMasterCompany(false); return; }
        if (typeof sessionStorage === "undefined") return;
        const ROLE_CACHE = "altalayi_user_type_v1";
        const TOKEN_CACHE = "altalayi_role_token_v1";
        if (sessionStorage.getItem(TOKEN_CACHE) === authToken) {
            const cached = sessionStorage.getItem(ROLE_CACHE) || "Customer";
            setIsMultiCompany(cached === "Multiple Company User");
            setIsSubOrMasterCompany(cached === "Company Sub Account" || cached === "Master Company");
            return;
        }
        fetch("/api/kleverapi/account-sidebar", {
            headers: { Authorization: `Bearer ${authToken}` },
        }).then(r => r.json()).then(data => {
            const type = data?.user_type || "Customer";
            sessionStorage.setItem(ROLE_CACHE, type);
            sessionStorage.setItem(TOKEN_CACHE, authToken);
            setIsMultiCompany(type === "Multiple Company User");
            setIsSubOrMasterCompany(type === "Company Sub Account" || type === "Master Company");
        }).catch(() => { });
    }, [authToken]);

    const shouldHideCartActions = (isSalesPerson || isMultiCompany) && !isSubOrMasterCompany;

    const [isAddedPopupOpen, setIsAddedPopupOpen] = useState(false);
    const [addedProduct, setAddedProduct] = useState<any | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
    const [inquiryProduct, setInquiryProduct] = useState<Product | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

    const [sortField, setSortField] = useState<'brand' | 'tyre_size' | 'pattern' | 'year' | 'origin' | 'stock' | 'price' | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const handleSort = (field: 'brand' | 'tyre_size' | 'pattern' | 'year' | 'origin' | 'stock' | 'price') => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const sortedProducts = useMemo(() => {
        if (!sortField) return favProducts;

        return [...favProducts].sort((a, b) => {
            let valA: any = "";
            let valB: any = "";

            if (sortField === 'brand') {
                valA = a.brand || "";
                valB = b.brand || "";
            } else if (sortField === 'tyre_size') {
                valA = a.tyre_size || "";
                valB = b.tyre_size || "";
            } else if (sortField === 'pattern') {
                valA = a.pattern || a.name || "";
                valB = b.pattern || b.name || "";
            } else if (sortField === 'year') {
                valA = a.year || "";
                valB = b.year || "";
            } else if (sortField === 'origin') {
                valA = a.origin || "";
                valB = b.origin || "";
            } else if (sortField === 'stock') {
                const getStockScore = (p: Product) => {
                    const isOutOfStock = p.stock_status === "Out of Stock" || p.stock_status === "Not Available" || Number(p.stock_qty || 0) <= 0;
                    const isLimited = p.stock_qty > 0 && p.stock_qty <= 10;
                    if (isOutOfStock) return 0;
                    if (isLimited) return 1;
                    return 2;
                };
                valA = getStockScore(a);
                valB = getStockScore(b);
            } else if (sortField === 'price') {
                valA = a.final_price || 0;
                valB = b.final_price || 0;
            }

            if (typeof valA === 'string') {
                return sortDirection === 'asc'
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            } else {
                return sortDirection === 'asc'
                    ? valA - valB
                    : valB - valA;
            }
        });
    }, [favProducts, sortField, sortDirection]);

    const loadFavourites = useCallback(async () => {
        setLoading(true);
        try {
            // Using centralized api client which handles tokens and sessions
            const data = await api.get(`/kleverapi/favorite-products?currentPage=${currentPage}&pageSize=${pageSize}`);

            // Handle different API response formats
            const rawItems = Array.isArray(data.products) ? data.products : (Array.isArray(data.items) ? data.items : []);

            // Map items with all fields needed for ProductDialog popup
            const items = rawItems.map((p: any) => {
                const finalPrice = Number(p.final_price || p.special_price || p.price || 0);
                // In Magento, 'price' is often the original/old price if 'final_price' is different
                const potentialOldPrice = Number(p.price || p.regular_price || p.original_price || p.old_price || 0);

                // Only show as old price if it's strictly greater than the final price
                const originalPrice = potentialOldPrice > finalPrice ? potentialOldPrice : 0;
                const hasDiscount = originalPrice > finalPrice;
                const offerLabel = p.offer || p.discount_label || "";

                return {
                    ...p,
                    product_id: p.product_id || p.id,
                    name: p.name || p.sku || "N/A",
                    image_url: p.image_url || p.image || "/placeholder-tyre.png",
                    final_price: finalPrice,
                    original_price: originalPrice,
                    offer: offerLabel,
                    stock_qty: Number(p.stock_qty || 0),
                    brand: p.brand || "",
                    tyre_size: p.tyre_size || "—",
                    favorite_id: p.favorite_id || p.id,
                    item_code: p.item_code || p.sku,
                    product_group: p.product_group || "",
                    tyre_type: p.tyre_type || "",
                    oem_marking: p.oem_marking || "",
                };
            });

            const total = typeof data.total_count === "number" ? data.total_count : items.length;

            setFavProducts(items);
            setTotalCount(total);

            const initialQtys: Record<number, number> = {};
            items.forEach((p: Product) => {
                initialQtys[p.product_id] = 1;
            });
            setQuantities(prev => ({ ...prev, ...initialQtys }));
        } catch (err) {
            console.error("Failed to load favourites", err);
            // Don't show toast error if it's just empty or loading
            if (err !== "Unauthorized" && err !== "Something went wrong") {
                toast.error(t("favorites.errorLoading"));
            }
        } finally {
            setLoading(false);
        }
    }, [currentPage, pageSize]);

    useEffect(() => {
        // Trigger load even if session is loading/null (it will check localStorage fallback)
        loadFavourites();
    }, [loadFavourites]);

    // Scroll and Layout shift is now managed internally by the Modal/Drawer component

    const handleQtyChange = (productId: number, val: string) => {
        const num = parseInt(val) || 1;
        setQuantities(prev => ({ ...prev, [productId]: Math.max(1, num) }));
    };

    const handleRemove = async (product: Product) => {
        setRemoving(product.product_id);
        showLoading("REMOVING FROM FAVORITES...");
        try {
            const stored = localStorage.getItem("favourites");
            const favIds: number[] = stored ? JSON.parse(stored) : [];
            const updated = favIds.filter(id => id !== product.product_id);
            localStorage.setItem("favourites", JSON.stringify(updated));

            const deleteId = product.favorite_id || product.product_id;
            await api.delete(`/kleverapi/favorite-products/${deleteId}`);

            const remainingOnPage = favProducts.filter(p => p.product_id !== product.product_id).length;
            const remainingTotal = Math.max(0, totalCount - 1);
            setFavProducts(prev => prev.filter(p => p.product_id !== product.product_id));
            setTotalCount(remainingTotal);
            toast.success(t("favorites.removeSuccess"));
            // Keep the pages consistent: an emptied page goes back one page; otherwise
            // reload so the next favourite moves up from the following page.
            if (remainingOnPage === 0 && currentPage > 1) {
                setCurrentPage(currentPage - 1);
            } else if (remainingTotal >= currentPage * pageSize) {
                loadFavourites();
            }
        } catch (err) {
            toast.error(t("favorites.removeFailed"));
        } finally {
            setRemoving(null);
            hideLoading();
        }
    };

    const onAddToCart = async (product: Product) => {
        const qty = quantities[product.product_id] || 1;
        setAddingToCart(product.sku);
        showLoading(t("cart.processingAddToCart") || "PROCESSING ADD TO CART...");
        try {
            await api.post("/kleverapi/cart/add", { sku: product.sku, qty });
            await refetchCart();
            setAddedProduct(product);
            setIsAddedPopupOpen(true);
        } catch (err) {
            if (err === "Unauthorized") {
                redirectToLogin(router);
            }
            toast.error(t("cart.updateFailed"));
        } finally {
            setAddingToCart(null);
            hideLoading();
        }
    };

    // Fetch full product details for the popup (to get item_code, product_group, tyre_type, oem_marking)
    const handleShowProductDetail = async (product: Product) => {
        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
            const fetchLocale = typeof window !== "undefined" && window.location.pathname.startsWith("/ar") ? "ar" : "en";
            const headers: HeadersInit = { "Content-Type": "application/json", "x-locale": fetchLocale };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            // Extract item code from SKU (remove year suffix e.g. "PSR02347-2025" → "PSR02347")
            const itemCode = product.sku?.replace(/-\d{4}$/, "") || product.sku;

            // Selected website's default category (from Magento) — no hardcoded id.
            const categoryId = await getDefaultCategoryId(fetchLocale);
            if (!categoryId) throw new Error("No default category for the selected website");
            const res = await fetch(`/api/category-products?categoryId=${categoryId}&page=1&pageSize=5&itemCode=${encodeURIComponent(itemCode)}`, { headers });
            if (res.ok) {
                const data = await res.json();
                const items = data.products || data.items || [];
                // Find exact match by SKU
                const match = items.find((p: any) => p.sku === product.sku) || items[0];
                if (match) {
                    setSelectedProduct({ ...product, ...match });
                } else {
                    setSelectedProduct(product);
                }
            } else {
                setSelectedProduct(product);
            }
        } catch (err) {
            console.error("Failed to fetch product details for popup:", err);
            setSelectedProduct(product);
        } finally {
        }
    };

    const startItem = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const endItem = Math.min(currentPage * pageSize, totalCount);

    if (loading && favProducts.length === 0) {
        return <FavouriteProductsSkeleton count={10} />;
    }

    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <div className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white min-w-0">

            <div className="mb-5">
                {typeof title === 'string' ? (
                    <h1 className="text-h3 md:text-h1-sm font-semibold text-black uppercase tracking-tight">
                        {title}
                    </h1>
                ) : title || (
                    <h1 className="text-h3 md:text-h1-sm font-semibold text-black uppercase tracking-tight">
                        {t("nav.favouriteProducts")}
                    </h1>
                )}
            </div>

            {/* Mobile/Tablet Card List */}
            <div className="xl:hidden flex items-center justify-between mb-4 bg-gray-50 p-2.5 rounded-sm border border-gray-200">
                <span className="text-body-sm font-semibold text-gray-700">{t("common.sortBy") || "Sort By"}</span>
                <select
                    value={sortField ? `${sortField}-${sortDirection}` : ""}
                    onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                            setSortField(null);
                        } else {
                            const [field, dir] = val.split('-');
                            setSortField(field as any);
                            setSortDirection(dir as any);
                        }
                    }}
                    className="bg-white border border-gray-200 rounded-sm px-2 py-1 text-body-sm font-semibold outline-none text-gray-900 focus:border-brand-yellow cursor-pointer"
                >
                    <option value="">{t("common.default") || "Default"}</option>
                    <option value="brand-asc">{t("m.brand") || "Brand"} (A-Z)</option>
                    <option value="brand-desc">{t("m.brand") || "Brand"} (Z-A)</option>
                    <option value="tyre_size-asc">{t("m.size") || "Size"} (A-Z)</option>
                    <option value="tyre_size-desc">{t("m.size") || "Size"} (Z-A)</option>
                    <option value="pattern-asc">{t("m.pattern") || "Pattern"} (A-Z)</option>
                    <option value="pattern-desc">{t("m.pattern") || "Pattern"} (Z-A)</option>
                    <option value="year-asc">{t("m.year") || "Year"} (A-Z)</option>
                    <option value="year-desc">{t("m.year") || "Year"} (Z-A)</option>
                    <option value="origin-asc">{t("m.origin") || "Origin"} (A-Z)</option>
                    <option value="origin-desc">{t("m.origin") || "Origin"} (Z-A)</option>
                    <option value="stock-desc">{t("m.stock") || "Stock"} ({t("stock.available") || "Available"} First)</option>
                    <option value="price-asc">{t("m.price") || "Price"} ({t("common.lowToHigh") || "Low to High"})</option>
                    <option value="price-desc">{t("m.price") || "Price"} ({t("common.highToLow") || "High to Low"})</option>
                </select>
            </div>

            <div className="xl:hidden grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {loading && favProducts.length === 0 ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col gap-2 animate-pulse">
                            <div className="flex gap-3">
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="h-2.5 bg-gray-200 rounded w-16" />
                                    <div className="h-3 bg-gray-200 rounded w-32" />
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-3 bg-gray-200 rounded w-20" />
                                        <div className="h-4 w-4 bg-gray-200 rounded-full" />
                                        <div className="h-2.5 bg-gray-200 rounded w-12" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-2 w-2 bg-gray-200 rounded-full" />
                                        <div className="h-2.5 bg-gray-200 rounded w-16" />
                                    </div>
                                </div>
                                <div className="w-14 h-14 bg-gray-200 rounded-lg flex-shrink-0" />
                            </div>
                            <div className="flex items-center justify-between border-t border-gray-100 pt-2.5 mt-1 gap-2">
                                <div className="h-3.5 bg-gray-200 rounded w-16" />
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <div className="h-9 w-12 bg-gray-200 rounded-lg" />
                                    <div className="h-9 w-9 bg-gray-200 rounded-lg" />
                                </div>
                            </div>
                        </div>
                    ))
                ) : sortedProducts.length === 0 ? (
                    <div className="py-16 text-center text-gray-400 italic text-body">{t("favorites.empty")}</div>
                ) : sortedProducts.map((product) => {
                    const brandName = product.brand || "—";
                    const isOutOfStock = product.stock_status === "Out of Stock" || product.stock_status === "Not Available" || Number(product.stock_qty || 0) <= 0;
                    const isLimited = product.stock_qty > 0 && product.stock_qty <= 10;
                    const dotColor = isOutOfStock ? "bg-red-500" : isLimited ? "bg-brand-yellow" : "bg-green-500";
                    const stockLabel = isOutOfStock ? t("stock.not_available") : isLimited ? t("stock.limited") : t("stock.available");

                    return (
                        <div key={product.product_id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col gap-2">
                            <div className="flex gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-caption font-bold text-gray-400 uppercase tracking-wider">{t(`data.${brandName}`) !== `data.${brandName}` ? t(`data.${brandName}`) : brandName}</p>
                                    <p className="text-body-sm font-black text-gray-900 leading-tight mt-0.5 truncate">{product.pattern || product.name || "—"}</p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <span dir="ltr" className="text-body-sm font-bold text-black">{product.tyre_size || "—"}</span>
                                        <div onClick={() => handleShowProductDetail(product)} className="w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center text-micro font-bold text-white cursor-pointer active:scale-95 flex-shrink-0">i</div>
                                        {product.origin && <span className="text-label text-gray-400">{t(`data.${product.origin}`) !== `data.${product.origin}` ? t(`data.${product.origin}`) : product.origin}</span>}
                                        {product.year && <span className="text-label text-gray-400 font-mono">{product.year}</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                                        <span className="text-caption font-bold text-gray-600 uppercase">{stockLabel}</span>
                                    </div>
                                    {product.offer && <p className="text-caption font-bold text-red-600 uppercase mt-1">{product.offer}</p>}
                                </div>
                                <div className="w-14 h-14 flex-shrink-0 rounded-lg border border-gray-100 overflow-hidden bg-gray-50 flex items-center justify-center cursor-pointer" onClick={() => { if (isValidImageUrl(product.image_url)) { setSelectedImage(product.image_url); setPreviewProduct(product); setIsImageModalOpen(true); } }}>
                                    {isValidImageUrl(product.image_url) ? (
                                        <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
                                    ) : (
                                        <ImageIcon size={20} className="text-gray-300" />
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-gray-100 pt-2.5 mt-1 gap-2">
                                <div className="flex flex-col">
                                    {product.original_price && product.original_price > product.final_price ? (
                                        <>
                                            <span className="text-caption font-bold text-gray-400">
                                                <Price amount={product.original_price} className="font-bold line-through" />
                                            </span>
                                            <span className="text-body font-black text-black rubik-sans">
                                                <Price amount={product.final_price} />
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-body font-black text-black rubik-sans">
                                            <Price amount={product.final_price} />
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {!shouldHideCartActions && (
                                        !isOutOfStock ? (
                                            <button onClick={() => onAddToCart(product)} disabled={addingToCart === product.sku} className="h-9 px-2.5 rounded-sm flex items-center gap-1.5 text-label font-black uppercase shadow-sm active:scale-95 cursor-pointer flex-shrink-0 bg-brand-yellow text-black">
                                                <ShoppingCart size={14} strokeWidth={2.5} />
                                            </button>
                                        ) : (
                                            <button onClick={() => { setInquiryProduct(product); setIsInquiryModalOpen(true); }} className="h-9 px-2.5 bg-brand-yellow text-black rounded-sm flex items-center gap-1.5 text-label font-black uppercase shadow-sm active:scale-95 cursor-pointer flex-shrink-0">
                                                <Info size={14} strokeWidth={2.5} />
                                            </button>
                                        )
                                    )}
                                    <button onClick={() => handleRemove(product)} disabled={removing === product.product_id} className={`w-9 h-9 rounded-sm flex items-center justify-center active:scale-95 cursor-pointer flex-shrink-0 ${removing === product.product_id ? "bg-gray-100 text-gray-400" : "bg-white text-gray-400 border border-gray-100 hover:text-red-500"}`}>
                                        <Trash2 size={16} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="hidden xl:flex flex-col bg-white rounded-sm shadow-sm border border-subtle overflow-hidden transition-all duration-300 hover:shadow-md">
                <div className="flex-1 overflow-x-auto">
                    <table className="w-full border-collapse table-fixed min-w-[900px]">
                        <colgroup>
                            {BASE_COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
                            <col style={{ width: ACTION_COL_WIDTH }} />
                        </colgroup>
                        <thead className="sticky top-0 z-20">
                            <tr className="bg-gray-50/80 text-black text-label font-semibold uppercase tracking-widest border-b border-[#ddd]">
                                {BASE_HEADER_KEYS.map(key => {
                                    let sortKey: 'brand' | 'tyre_size' | 'pattern' | 'year' | 'origin' | 'stock' | 'price' | null = null;
                                    if (key === 'm.brand') sortKey = 'brand';
                                    else if (key === 'm.size') sortKey = 'tyre_size';
                                    else if (key === 'm.pattern') sortKey = 'pattern';
                                    else if (key === 'm.year') sortKey = 'year';
                                    else if (key === 'm.origin') sortKey = 'origin';
                                    else if (key === 'm.stock') sortKey = 'stock';
                                    else if (key === 'm.price') sortKey = 'price';

                                    if (sortKey) {
                                        const isSorted = sortField === sortKey;
                                        return (
                                            <th key={key} className="px-2 md:px-3 py-2 md:py-3 text-label font-semibold text-black tracking-widest text-center whitespace-nowrap cursor-pointer select-none hover:text-brand-yellow transition-colors uppercase" onClick={() => handleSort(sortKey!)}>
                                                <button type="button" className="inline-flex items-center justify-center gap-1.5 mx-auto transition-colors cursor-pointer select-none">
                                                    {t(key)}
                                                    {isSorted ? (
                                                        sortDirection === 'asc' ? <ChevronUp size={13} className="text-brand-yellow font-black flex-shrink-0" /> : <ChevronDown size={13} className="text-brand-yellow font-black flex-shrink-0" />
                                                    ) : (
                                                        <ChevronsUpDown size={13} className="text-gray-300 hover:text-gray-500 flex-shrink-0" />
                                                    )}
                                                </button>
                                            </th>
                                        );
                                    }
                                    return (
                                        <th key={key} className="px-2 md:px-3 py-2 md:py-3 text-label font-semibold text-black tracking-widest text-center whitespace-nowrap uppercase">
                                            {t(key)}
                                        </th>
                                    );
                                })}
                                <th className="px-2 md:px-3 py-2 md:py-3 text-label font-semibold text-black tracking-widest text-center whitespace-nowrap uppercase">
                                    {t(ACTION_HEADER_KEY)}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading && favProducts.length === 0 ? (
                                Array.from({ length: 10 }).map((_, i) => (
                                    <tr key={i} className="h-[52px] animate-pulse">
                                        <td className="px-2 md:px-3 text-center"><div className="h-3.5 bg-gray-200 rounded w-12 mx-auto" /></td>
                                        <td className="px-2 md:px-3 text-center"><div className="h-3 bg-gray-200 rounded w-16 mx-auto" /></td>
                                        <td className="px-2 md:px-3 text-center"><div className="h-3.5 bg-gray-200 rounded w-20 mx-auto" /></td>
                                        <td className="px-2 md:px-3 text-center"><div className="h-3 bg-gray-200 rounded w-8 mx-auto" /></td>
                                        <td className="px-2 md:px-3 text-center"><div className="h-3 bg-gray-200 rounded w-10 mx-auto" /></td>
                                        <td className="px-2 md:px-3 text-center"><div className="w-12 h-12 bg-gray-200 mx-auto rounded border border-gray-100 shadow-sm" /></td>
                                        <td className="px-2 md:px-3 text-center"><div className="h-3 bg-gray-200 rounded w-10 mx-auto" /></td>
                                        <td className="px-2 md:px-3 text-center">
                                            <div className="flex flex-col items-center justify-center gap-1.5">
                                                <div className="w-3.5 h-3.5 bg-gray-200 rounded-full" />
                                                <div className="h-2.5 bg-gray-200 rounded w-10" />
                                            </div>
                                        </td>
                                        <td className="px-2 md:px-3 text-center"><div className="h-3.5 bg-gray-200 rounded w-14 mx-auto" /></td>
                                        <td className="px-2 md:px-3 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <div className="w-10 h-9 bg-gray-200 rounded-sm" />
                                                <div className="w-8 h-8 bg-gray-200 rounded-sm" />
                                                <div className="w-8 h-8 bg-gray-200 rounded-sm" />
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : sortedProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-5 py-24 text-center">
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">{t("favorites.empty")}</p>
                                    </td>
                                </tr>
                            ) : (
                                sortedProducts.map((product) => {
                                    const brandName = product.brand || "—";
                                    const patternName = product.pattern || product.name || "—";
                                    const isOutOfStock = product.stock_status === "Out of Stock" || product.stock_status === "Not Available" || Number(product.stock_qty || 0) <= 0;
                                    const isLimited = product.stock_qty > 0 && product.stock_qty <= 10;
                                    const stockColor = isOutOfStock ? "bg-red-500" : isLimited ? "bg-brand-yellow" : "bg-green-500";
                                    const stockLabel = isOutOfStock ? t("stock.not_available") : isLimited ? t("stock.limited") : t("stock.available");

                                    return (
                                        <tr key={product.product_id} className="hover:bg-brand-yellow/5 transition-colors group h-auto">
                                            {/* 1. BRAND */}
                                            <td className="py-1 px-2 md:px-3 text-body-sm font-medium text-black/80 text-center">
                                                {t(`data.${brandName}`) !== `data.${brandName}` ? t(`data.${brandName}`) : brandName}
                                            </td>

                                            {/* 2. SIZE */}
                                            <td className="py-1 px-2 md:px-3 text-body-sm font-normal text-black text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span dir="ltr" className="text-body-sm font-normal text-black">{product.tyre_size || "—"}</span>
                                                    <div
                                                        onClick={() => handleShowProductDetail(product)}
                                                        className="w-3.5 h-3.5 bg-gray-900 rounded-full flex items-center justify-center text-[8px] font-black text-white cursor-pointer hover:bg-brand-yellow hover:text-black transition-all shadow-sm flex-shrink-0"
                                                    >
                                                        i
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 3. PATTERN */}
                                            <td className="py-1 px-2 md:px-3 text-body-sm font-medium text-black/80 text-center">
                                                <span className="uppercase tracking-tight leading-snug break-words">{patternName}</span>
                                            </td>

                                            {/* 4. YEAR */}
                                            <td className="py-1 px-2 md:px-3 text-body-sm font-normal text-black/60 text-center font-mono">
                                                {product.year || "—"}
                                            </td>

                                            {/* 5. ORIGIN */}
                                            <td className="py-1 px-2 md:px-3 text-body-sm font-medium text-black/80 text-center">
                                                {product.origin ? (t(`data.${product.origin}`) !== `data.${product.origin}` ? t(`data.${product.origin}`) : product.origin) : "—"}
                                            </td>

                                            {/* 6. IMAGE */}
                                            <td className="py-1 px-2 md:px-3 text-center">
                                                <div className="w-12 h-12 mx-auto text-center">
                                                    {isValidImageUrl(product.image_url) ? (
                                                        <div
                                                            className="relative w-12 h-12 group/img cursor-pointer"
                                                            onClick={() => {
                                                                setSelectedImage(product.image_url);
                                                                setPreviewProduct(product);
                                                                setIsImageModalOpen(true);
                                                            }}
                                                        >
                                                            <img
                                                                src={product.image_url}
                                                                alt={product.name}
                                                                className="w-12 h-12 object-contain rounded border border-gray-100 shadow-sm"
                                                            />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center rounded">
                                                                <div className="w-5 h-5 bg-brand-yellow rounded-full flex items-center justify-center text-black font-bold text-caption shadow-lg transform scale-50 group-hover/img:scale-100 transition-transform duration-300">+</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-12 h-12 mx-auto flex items-center justify-center bg-gray-50 rounded border border-gray-100 shadow-sm">
                                                            <ImageIcon size={20} className="text-gray-300" />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 7. OFFER */}
                                            <td className="py-1 px-2 md:px-3 text-center">
                                                {product.offer ? (
                                                    <span className="text-red-600 font-semibold text-caption uppercase tracking-tight block max-w-[150px] mx-auto">{product.offer}</span>
                                                ) : (
                                                    <span className="text-black/20">—</span>
                                                )}
                                            </td>

                                            {/* 8. STOCK */}
                                            <td className="py-1 px-3 text-center">
                                                <div className="flex flex-col items-center justify-center text-center gap-1">
                                                    <span className={`w-4 h-4 rounded-full border border-gray-100 shadow-sm ${stockColor}`}></span>
                                                    <span className="text-caption font-semibold text-black/80 uppercase leading-none mt-1">{stockLabel}</span>
                                                </div>
                                            </td>

                                            {/* 9. PRICE */}
                                            <td className="py-1 px-3 text-center whitespace-nowrap">
                                                <div className="flex flex-col items-center justify-center">
                                                    {product.original_price && product.original_price > product.final_price ? (
                                                        <>
                                                            <span className="text-caption font-semibold text-black/50 mb-0.5">
                                                                <Price amount={product.original_price} className="font-semibold line-through" />
                                                            </span>
                                                            <span className="text-body-sm font-semibold text-black tracking-tight rubik-sans">
                                                                <Price amount={product.final_price} />
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="text-body-sm font-semibold text-black tracking-tight rubik-sans">
                                                            <Price amount={product.final_price} />
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 10. ACTION */}
                                            <td className="py-1 px-2 text-center align-middle">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {!shouldHideCartActions && (
                                                        !isOutOfStock ? (
                                                            <div className="w-10 h-9 border border-gray-200 rounded-sm focus-within:border-brand-yellow flex items-center justify-center text-label font-semibold text-black bg-white overflow-hidden">
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={quantities[product.product_id] || 1}
                                                                    onChange={(e) => handleQtyChange(product.product_id, e.target.value)}
                                                                    className="w-full bg-transparent text-center text-body-sm font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="w-10 h-9" />
                                                        )
                                                    )}
                                                    {!shouldHideCartActions && (
                                                        !isOutOfStock ? (
                                                            <button
                                                                onClick={() => onAddToCart(product)}
                                                                disabled={addingToCart === product.sku}
                                                                className="w-8 h-8 bg-brand-yellow hover:bg-brand-yellow-dark text-black rounded-sm flex items-center justify-center shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                                                                title={t("m.add-to-cart")}
                                                            >
                                                                <ShoppingCart size={15} strokeWidth={2.5} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => { setInquiryProduct(product); setIsInquiryModalOpen(true); }}
                                                                className="w-8 h-8 bg-brand-yellow hover:bg-brand-yellow-dark text-black rounded-sm flex items-center justify-center shadow-sm transition-all cursor-pointer"
                                                            >
                                                                <Info size={15} strokeWidth={2.5} />
                                                            </button>
                                                        )
                                                    )}
                                                    <button
                                                        onClick={() => handleRemove(product)}
                                                        disabled={removing === product.product_id}
                                                        className={`w-8 h-8 rounded-sm flex items-center justify-center active:scale-95 cursor-pointer border transition-colors ${removing === product.product_id ? "bg-gray-100 text-gray-400 border-gray-100" : "bg-white text-gray-400 border-gray-200 hover:text-red-500 hover:border-red-100"}`}
                                                        title={t("m.remove-from-wishlist")}
                                                    >
                                                        <Trash2 size={16} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom Pagination — shown whenever there are favourites (like My Orders / Addresses),
                so the page-size selector and "x of y" are always available. */}
            {
                totalCount > 0 && (
                    <div className="mt-0 w-full">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={Math.ceil(totalCount / pageSize)}
                            totalItems={totalCount}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(val: number) => { setPageSize(val); setCurrentPage(1); }}
                        />
                    </div>
                )
            }
            {/* Inquiry Modal */}
            {
                inquiryProduct && (
                    <ProductEnquiryModal
                        isOpen={isInquiryModalOpen}
                        onClose={() => {
                            setIsInquiryModalOpen(false);
                            setInquiryProduct(null);
                        }}
                        productSku={inquiryProduct?.sku || ""}
                        productName={inquiryProduct?.name || ""}
                        productPrice={inquiryProduct?.final_price || 0}
                    />
                )
            }

            {/* Product Details Modal */}
            <ProductDialog
                product={selectedProduct}
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
            />

            <AddToCartPopup
                isOpen={isAddedPopupOpen}
                product={addedProduct}
                onClose={() => {
                    setIsAddedPopupOpen(false);
                    setAddedProduct(null);
                }}
            />

            {/* Image Preview - Side Drawer */}
            <Drawer
                isOpen={isImageModalOpen && !!selectedImage}
                onClose={() => setIsImageModalOpen(false)}
            >
                <div className="flex flex-col h-full bg-white">
                    <div className="bg-brand-yellow px-4 md:px-8 py-4 md:py-6 flex items-center justify-center relative flex-shrink-0">
                        <h2 className="text-body-lg md:text-h4 font-semibold text-black text-center uppercase tracking-tight">
                            {previewProduct ? <span dir="ltr">{previewProduct.pattern || '-'} - {previewProduct.tyre_size || '-'}</span> : t("m.preview")}
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-center">
                        <div className="p-2 md:p-4 bg-white flex items-center justify-center min-h-[200px] md:min-h-[400px] w-full">
                            <img src={selectedImage || ''} alt={previewProduct ? `${previewProduct.pattern} - ${previewProduct.tyre_size}` : t("m.preview")} className="max-w-full max-h-[60vh] md:max-h-[75vh] object-contain rounded-lg" />
                        </div>
                        <div className="mt-6 md:mt-10 w-full">
                            <button onClick={() => setIsImageModalOpen(false)} className="w-full py-3 md:py-4 bg-black text-white text-body-sm md:text-sm font-black uppercase tracking-widest rounded shadow-xl hover:bg-gray-800 transition-all cursor-pointer active:scale-95">Close Preview</button>
                        </div>
                    </div>
                </div>
            </Drawer>
        </div>
    );
}
