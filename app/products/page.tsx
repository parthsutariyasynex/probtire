"use client";

import { Suspense, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { ShoppingCart, X, Star, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, AlertTriangle, Info, Check, Filter, Search, Image as ImageIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import ProductDialog from "../components/ProductDialog";
import ProductEnquiryModal from "../components/ProductEnquiryModal";
import AddToCartPopup from "../components/AddToCartPopup";
import { checkAuth } from "./api";
import { useCart } from "@/modules/cart/hooks/useCart";
import SidebarFilter from "../components/SidebarFilter";
import HorizontalFilter from "../components/HorizontalFilter";
import Drawer from "../components/Drawer";
import Modal from "../components/Modal";
import { api } from "@/lib/api/api-client";
import { formatPrice, redirectToLogin, formatMagentoQueryParams, parseMagentoQueryParams } from "@/utils/helpers";
import Price from "../components/Price";
import PortalDropdown from "@/components/PortalDropdown";

import { toast } from "react-hot-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";
import { useLocale } from "@/lib/i18n/client";
import { useElementVisibility } from "@/hooks/useElementVisibility";
import { useLoadingOverlay } from "@/contexts/LoadingOverlayContext";

const PAGE_SIZE = 20;

// Translation keys for table headers — resolved inside the component using t().
// The Action column is appended dynamically at runtime when at least one product
// in the current page has `is_action === "Yes"`.
const BASE_HEADER_KEYS = ['m.brand', 'm.size', 'm.pattern', 'm.year', 'm.origin', 'm.image', 'm.offer', 'm.stock', 'm.price'] as const;
const ACTION_HEADER_KEY = 'm.action' as const;
const BASE_COL_WIDTHS = ['8%', '13%', '13%', '6%', '7%', '7%', '9%', '9%', '10%'] as const;
const ACTION_COL_WIDTH = '110px' as const;
const SHIMMER_ROWS = 10;
const ROW_HEIGHT = 'h-auto md:h-[52px]';

function TableColGroup({ widths }: { widths: readonly string[] }) {
  return (
    <colgroup>
      {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
    </colgroup>
  );
}

function ShimmerRows({ columnCount }: { columnCount: number }) {
  return (
    <>
      {Array.from({ length: SHIMMER_ROWS }).map((_, i) => (
        <tr key={`shimmer-${i}`} className={`animate-pulse ${ROW_HEIGHT}`}>
          {Array.from({ length: columnCount }).map((_, j) => (
            <td key={j} className="px-4">
              <div className="h-3 bg-gray-100 rounded w-full"></div>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Tiny wrapper to satisfy Next.js Suspense requirement for useSearchParams
function SearchParamsReader({ onParams }: { onParams: (sp: URLSearchParams) => void }) {
  const sp = useSearchParams();
  useEffect(() => { onParams(sp); }, [sp, onParams]);
  return null;
}

function MobileCardShimmer() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-100 p-2.5 sm:p-3 animate-pulse flex flex-col gap-1.5">
          {/* Top: text left + image right */}
          <div className="flex gap-2.5">
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="h-2 bg-gray-200 rounded w-12"></div>
              <div className="h-3.5 bg-gray-200 rounded w-full max-w-[160px]"></div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="h-2.5 bg-gray-200 rounded w-16"></div>
                <div className="w-4 h-4 bg-gray-200 rounded-full flex-shrink-0"></div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-gray-200 rounded-full flex-shrink-0"></div>
                <div className="h-2 bg-gray-200 rounded w-14"></div>
              </div>
            </div>
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-none flex-shrink-0"></div>
          </div>
          {/* Bottom: price left + [qty][cart][star] right */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 gap-2">
            <div className="h-4 bg-gray-200 rounded-none w-20 flex-shrink-0"></div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="w-9 h-9 bg-gray-200 rounded-none"></div>
              <div className="w-9 h-9 bg-gray-200 rounded-none"></div>
              <div className="w-9 h-9 bg-gray-200 rounded-none"></div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function CardSpinner() {
  return (
    <div className="w-6 h-6 border-2 border-brand-yellow border-t-transparent rounded-full animate-spin" />
  );
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

export default function ProductsPage() {
  const router = useRouter();
  const { t, isRtl } = useTranslation();
  const lp = useLocalePath();
  const locale = useLocale();
  const isFooterVisible = useElementVisibility("footer");
  const { showLoading, hideLoading } = useLoadingOverlay();
  // Authoritative Magento token comes from the NextAuth session (reactive — updates as
  // soon as the session resolves). localStorage is a fallback only. Using the session
  // token directly removes the race where this page loaded before ProtectedLayout had
  // written localStorage.token, leaving products permanently unfetched.
  const { data: session } = useSession();
  const authToken =
    (session as any)?.accessToken ||
    (typeof window !== "undefined" ? localStorage.getItem("token") : null);

  // Decode utypid from the Magento JWT — utypid === 3 = Sales Person.
  const isSalesPerson = useMemo(() => {
    if (!authToken) return false;
    try {
      const payload = JSON.parse(atob(authToken.split(".")[1]));
      return payload.utypid === 3;
    } catch { return false; }
  }, [authToken]);

  // isMultiCompany: read from sessionStorage cache (set by Navbar's account-sidebar fetch).
  // Falls back to its own fetch if the cache isn't populated yet.
  const [isMultiCompany, setIsMultiCompany] = useState(false);
  // Master Company and Company Sub Account share utypid===3 with Sales Person but must see
  // Cart, Actions, and Favourites — same as Navbar behaviour ("always visible").
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

  // shouldHideCartActions: true for Sales Person and Multiple Company User only.
  // Master Company and Company Sub Account share utypid===3 but see Cart, Actions, Favourites.
  const shouldHideCartActions = (isSalesPerson || isMultiCompany) && !isSubOrMasterCompany;

  const [searchParams, setSearchParamsState] = useState<URLSearchParams | null>(null);
  const handleParams = useCallback((sp: URLSearchParams) => setSearchParamsState(sp), []);
  const { cart, addToCart } = useCart();
  const [loadingSkus, setLoadingSkus] = useState<Set<string>>(new Set());
  const loadingRef = useRef(new Set<string>());
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [isAddedPopupOpen, setIsAddedPopupOpen] = useState(false);
  const [addedProduct, setAddedProduct] = useState<any | null>(null);
  const [productQtys, setProductQtys] = useState<Record<string, number>>({});
  const handleQtyChange = useCallback((sku: string, qty: number) => {
    setProductQtys(prev => ({ ...prev, [sku]: qty }));
  }, []);

  const [products, setProducts] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [sortBy, setSortBy] = useState<string>("none");
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [selectedFilterLabels, setSelectedFilterLabels] = useState<Record<string, { value: string; label: string }[]>>({});
  const [apiFilters, setApiFilters] = useState<any[] | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMobileSortOpen, setIsMobileSortOpen] = useState(false);

  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState("");
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [inquiryProduct, setInquiryProduct] = useState<any | null>(null);
  const [previewProduct, setPreviewProduct] = useState<any | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favIds, setFavIds] = useState<number[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem("favourites");
    if (stored) setFavIds(JSON.parse(stored));

  }, []);

  useEffect(() => {
    if (searchParams) {
      // categoryId comes from the URL, then the menu-derived default (sessionStorage).
      // When the menu is unavailable (e.g. WAF-blocked → no defaultCategoryId), fall back
      // to the root catalog category so the list still renders instead of staying empty.
      const DEFAULT_CATEGORY_ID = "5";
      const catId = searchParams.get("categoryId")
        || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("defaultCategoryId") : null)
        || DEFAULT_CATEGORY_ID;
      setCategoryId(catId);
      const { filters, page, sortBy } = parseMagentoQueryParams(searchParams);
      if (Object.keys(filters).length > 0) setSelectedFilters(filters);
      setCurrentPage(page);
      setSortBy(sortBy);
      setIsInitialized(true);
    }
  }, [searchParams]);

  // Sync selectedFilterLabels when selectedFilters or apiFilters change
  useEffect(() => {
    if (!isInitialized) return;
    const nextLabels: Record<string, { value: string; label: string }[]> = {};
    Object.entries(selectedFilters).forEach(([code, values]) => {
      const group = apiFilters?.find((g: any) => (g.code || g.attribute_code) === code);
      nextLabels[code] = values.map(val => {
        const opt = group?.options?.find((o: any) => String(o.value ?? "") === val);
        return {
          value: val,
          label: opt ? (opt.label || opt.value) : val
        };
      });
    });
    setSelectedFilterLabels(nextLabels);
  }, [selectedFilters, apiFilters, isInitialized]);

  useEffect(() => {
    if (!isMounted) return;
    const filterParams = formatMagentoQueryParams(selectedFilters, currentPage, sortBy);

    // categoryId only belongs in the URL when the user is on /products directly.
    // For Magento SEO URLs (/en/all-tyres/car-tyres.html), middleware injects it on
    // every navigation, so we must not duplicate it in the visible browser URL.
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const isMagentoSeoUrl = !/^\/(en|ar)\/products(\/|$)?/.test(path);

    const browserHasCategoryId = (() => {
      if (typeof window === "undefined") return false;
      return new URLSearchParams(window.location.search).has("categoryId");
    })();

    const currentFilterParams = (() => {
      if (!searchParams) return "";
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("categoryId");
      return sp.toString();
    })();
    if (filterParams === currentFilterParams) return;

    const parts: string[] = [];
    // Include categoryId only if we're on /products AND user explicitly had it,
    // OR if it's not a Magento SEO URL (in which case middleware can't inject it).
    if (categoryId && !isMagentoSeoUrl && browserHasCategoryId) {
      parts.push(`categoryId=${categoryId}`);
    }
    if (filterParams) parts.push(filterParams);
    const newUrl = `${path}${parts.length ? `?${parts.join("&")}` : ""}`;
    router.replace(newUrl, { scroll: false });
  }, [selectedFilters, currentPage, sortBy, isMounted, router, searchParams, categoryId]);

  const toggleFavorite = async (product: any) => {
    const { product_id: productId } = product;
    const productSku = product?.sku || product?.item_code || "";
    if (loadingRef.current.has(productSku)) return;
    const stored = localStorage.getItem("favourites");
    const currentFavIds: number[] = stored ? JSON.parse(stored) : [];
    if (!currentFavIds.includes(productId)) {
      currentFavIds.push(productId);
      localStorage.setItem("favourites", JSON.stringify(currentFavIds));
      setFavIds(currentFavIds);
      const token = authToken;
      if (token) {
        loadingRef.current.add(productSku);
        setLoadingSkus(new Set(loadingRef.current));
        showLoading(t("favorites.addingToFavorites") || "ADDING TO FAVORITES...");
        try {
          await api.post("/kleverapi/favorite-products", { product_id: productId, sku: productSku });
          toast.success(t("favorites.cartAdded"));
        } catch (err) {
          console.error("API favorite add error:", err);
          toast.error(t("favorites.syncFailed"));
        } finally {
          loadingRef.current.delete(productSku);
          setLoadingSkus(new Set(loadingRef.current));
          hideLoading();
        }
      }
    }
    router.push(lp("/wishlist"));
  };

  const [debouncedFilters, setDebouncedFilters] = useState(selectedFilters);
  const isFirstRender = useRef(true);
  const prevCategoryIdRef = useRef<string | null>(null);

  // Stable value-key for the debounced filters. `debouncedFilters` changes object
  // identity even when its value is unchanged (e.g. an empty {} replaced by a new
  // empty {}), which previously re-fired the products fetch with identical params
  // (a canceled duplicate request). Depending on this string instead keys the
  // effect on VALUE, eliminating the duplicate (req #11).
  const debouncedFiltersKey = useMemo(() => JSON.stringify(debouncedFilters), [debouncedFilters]);

  useEffect(() => {
    // On first render after init, apply filters immediately (no debounce)
    if (isFirstRender.current && isInitialized) {
      isFirstRender.current = false;
      setDebouncedFilters(selectedFilters);
      return;
    }
    const handler = setTimeout(() => setDebouncedFilters(selectedFilters), 500);
    return () => clearTimeout(handler);
  }, [selectedFilters, isInitialized]);

  // Reset filters immediately when the user navigates to a different category
  useEffect(() => {
    if (prevCategoryIdRef.current !== null && categoryId !== prevCategoryIdRef.current) {
      setSelectedFilters({});
      setSelectedFilterLabels({});
      setDebouncedFilters({});
      setCurrentPage(1);
      setSortBy("none");
      setApiFilters(null);
    }
    prevCategoryIdRef.current = categoryId;
  }, [categoryId]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!categoryId) {
      // No category resolved yet — clear data and show empty state instead of skeleton
      setProducts([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    const abortController = new AbortController();
    const loadProducts = async () => {
      try {
        setLoading(true);
        setError("");
        const token = authToken;
        if (!token) return;
        let fetchLocale = "en";
        if (window.location.pathname.startsWith("/ar")) fetchLocale = "ar";
        else {
          const cookieMatch = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
          if (cookieMatch?.[1] === "ar") fetchLocale = "ar";
        }
        const headers: HeadersInit = { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "x-locale": fetchLocale };
        const queryString = formatMagentoQueryParams(JSON.parse(debouncedFiltersKey), currentPage, sortBy);
        const url = `/api/category-products?${queryString}&categoryId=${categoryId}&pageSize=${PAGE_SIZE}&lang=${fetchLocale}`;
        const __t0 = performance.now();
        const res = await fetch(url, { headers, signal: abortController.signal });
        if (!res.ok) {
          if (res.status === 401) { localStorage.removeItem("token"); redirectToLogin(router); return; }
          throw new Error(`API Error: ${res.status}`);
        }
        const data = await res.json();
        console.log(`[products-timing] category-products → ${res.status} in ${Math.round(performance.now() - __t0)}ms (X-Cache: ${res.headers.get("x-cache") || "n/a"})`);
        const productArray = Array.isArray(data.products) ? data.products : (Array.isArray(data.items) ? data.items : []);
        const total = typeof data.total_count === "number" ? data.total_count : productArray.length;

        const mappedProducts = productArray.map((p: any) => {
          const finalPrice = Number(p.final_price || p.special_price || p.price || 0);
          const potentialOldPrice = Number(p.price || p.regular_price || p.original_price || p.old_price || 0);
          const originalPrice = potentialOldPrice > finalPrice ? potentialOldPrice : 0;
          return { ...p, final_price: finalPrice, original_price: originalPrice };
        });

        if (abortController.signal.aborted) return;
        setProducts(mappedProducts);
        setTotalCount(total);
        if (Array.isArray(data.filters)) setApiFilters(data.filters);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(t("products.noProducts"));
        console.error(err);
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };
    loadProducts();
    return () => abortController.abort();
  }, [router, currentPage, debouncedFiltersKey, sortBy, isInitialized, categoryId, authToken]);


  const handleFilterChange = useCallback(
    (filters: Record<string, string[]>, labels: Record<string, { value: string; label: string }[]>) => {
      setSelectedFilters(filters);
      setSelectedFilterLabels(labels);
      setCurrentPage(1);
    }, [],
  );

  const clearAllFilters = () => { setSelectedFilters({}); setSelectedFilterLabels({}); setIsFavorite(false); setCurrentPage(1); };

  const removeSpecificFilter = (code: string, value: string) => {
    const nextFilters = { ...selectedFilters };
    nextFilters[code] = (nextFilters[code] || []).filter(v => v !== value);
    if (nextFilters[code].length === 0) delete nextFilters[code];
    const nextLabels = { ...selectedFilterLabels };
    if (nextLabels[code]) { nextLabels[code] = nextLabels[code].filter(l => l.value !== value); if (nextLabels[code].length === 0) delete nextLabels[code]; }
    setSelectedFilters(nextFilters);
    setSelectedFilterLabels(nextLabels);
    setCurrentPage(1);
  };

  const handleAddToCart = useCallback(async (product: any) => {
    const sku = product.sku;
    if (loadingRef.current.has(sku)) return;
    loadingRef.current.add(sku);
    setLoadingSkus(new Set(loadingRef.current));
    showLoading(t("cart.processingAddToCart"));
    try {
      const qty = productQtys[sku] || 1;
      await addToCart(sku, qty);
      setAddedProduct(product);
      setIsAddedPopupOpen(true);
      setJustAdded(sku);
      setTimeout(() => setJustAdded(null), 2000);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "401") {
        localStorage.removeItem("token");
        router.replace(lp("/login"));
      } else {
        const msg = err instanceof Error ? err.message : t("cart.updateFailed");
        toast.error(msg);
        console.error("[AddToCart]", msg);
      }
    } finally {
      loadingRef.current.delete(sku);
      setLoadingSkus(new Set(loadingRef.current));
      hideLoading();
    }
  }, [addToCart, router, productQtys, showLoading, hideLoading]);

  const getStockBadge = (product: any) => {
    const label = product?.stock_label === "Available" ? t("stock.available") : product?.stock_label === "Not Available" ? t("stock.not_available") : product?.stock_label === "Limited" ? t("stock.limited") : product?.stock_label || (product?.is_in_stock ? t("stock.available") : t("stock.not_available"));
    const apiColor = product?.stock_color?.toLowerCase() || (product?.is_in_stock ? "green" : "red");
    const colorClass = apiColor === "green" ? "bg-green-500" : apiColor === "yellow" ? "bg-brand-yellow" : "bg-red-500";
    return (
      <div className="flex flex-col items-center justify-center text-center gap-1">
        <span className={`w-4 h-4 rounded-full border border-gray-100 shadow-sm ${colorClass}`} />
        <span className="text-caption font-semibold text-black/80 uppercase leading-none mt-1">
          {label}
        </span>
      </div>
    );
  };

  const SORTABLE_HEADERS: Record<string, "brand" | "size" | "pattern" | "year" | "origin" | "stock" | "price" | null> = {
    "m.brand": "brand",
    "m.size": "size",
    "m.pattern": "pattern",
    "m.year": "year",
    "m.origin": "origin",
    "m.image": null,
    "m.offer": null,
    "m.stock": "stock",
    "m.price": "price",
  };

  const cycleSort = (field: "brand" | "size" | "pattern" | "year" | "origin" | "stock" | "price") => {
    setSortBy(prev => {
      if (prev === `${field}-asc`) return `${field}-desc`;
      if (prev === `${field}-desc`) return "none";
      return `${field}-asc`;
    });
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy === `${field}-asc`) return <ChevronUp size={14} strokeWidth={2.5} className="text-brand-yellow" />;
    if (sortBy === `${field}-desc`) return <ChevronDown size={14} strokeWidth={2.5} className="text-brand-yellow" />;
    return <ChevronsUpDown size={14} strokeWidth={2} className="text-black/30" />;
  };

  const stockTier = (p: any): number => {
    const outOfStock = p.is_in_stock === false
      || p.stock_label === "Not Available"
      || p.stock_status === "Out of Stock"
      || p.stock_status === "Not Available"
      || Number(p.stock_qty || 0) <= 0;
    if (outOfStock) return 2;
    if (Number(p.stock_qty || 0) > 0 && Number(p.stock_qty) <= 10) return 1;
    return 0;
  };

  const cmpStr = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

  const sortedProducts = useMemo(() => {
    let result = [...products];
    if (isFavorite) result = result.filter(p => favIds.includes(p.product_id));
    const selectedOffers = selectedFilters["offers"];
    if (selectedOffers?.length) result = result.filter(p => p?.offer && selectedOffers.some((o: string) => o === p.offer));
    const sw = selectedFilters["width"]?.[0], sh = selectedFilters["height"]?.[0], sr = selectedFilters["rim"]?.[0];
    if (sw || sh || sr) {
      result = result.filter(p => {
        const m = String(p?.tyre_size || "").trim().match(/^(\d+)\/?(\d+)?\s*R?\s*(\d+\.?\d*)?/i);
        if (!m) return false;
        return (!sw || m[1] === sw) && (!sh || m[2] === sh) && (!sr || m[3] === sr);
      });
    }
    switch (sortBy) {
      case "price-asc": return result.sort((a, b) => (a.final_price ?? 0) - (b.final_price ?? 0));
      case "price-desc": return result.sort((a, b) => (b.final_price ?? 0) - (a.final_price ?? 0));
      case "brand-asc": return result.sort((a, b) => cmpStr(a.brand ?? "", b.brand ?? ""));
      case "brand-desc": return result.sort((a, b) => cmpStr(b.brand ?? "", a.brand ?? ""));
      case "size-asc": return result.sort((a, b) => cmpStr(a.tyre_size ?? "", b.tyre_size ?? ""));
      case "size-desc": return result.sort((a, b) => cmpStr(b.tyre_size ?? "", a.tyre_size ?? ""));
      case "pattern-asc": return result.sort((a, b) => cmpStr(a.pattern ?? "", b.pattern ?? ""));
      case "pattern-desc": return result.sort((a, b) => cmpStr(b.pattern ?? "", a.pattern ?? ""));
      case "year-asc": return result.sort((a, b) => cmpStr(a.year ?? "", b.year ?? ""));
      case "year-desc": return result.sort((a, b) => cmpStr(b.year ?? "", a.year ?? ""));
      case "origin-asc": return result.sort((a, b) => cmpStr(a.origin ?? "", b.origin ?? ""));
      case "origin-desc": return result.sort((a, b) => cmpStr(b.origin ?? "", a.origin ?? ""));
      case "stock-asc": return result.sort((a, b) => stockTier(a) - stockTier(b));
      case "stock-desc": return result.sort((a, b) => stockTier(b) - stockTier(a));
      default: return result;
    }
  }, [products, sortBy, isFavorite, favIds, selectedFilters]);

  // Dynamic action-column visibility: include the column only if the current
  // page has at least one product with is_action === "Yes". Otherwise the
  // whole column (header + cells + colgroup width + colSpan) is omitted.
  const showActionColumn = useMemo(
    () => (!shouldHideCartActions || isSalesPerson) && products.some((p: any) => p?.is_action === "Yes"),
    [products, shouldHideCartActions, isSalesPerson]
  );
  const headerKeys: readonly string[] = showActionColumn
    ? [...BASE_HEADER_KEYS, ACTION_HEADER_KEY]
    : BASE_HEADER_KEYS;
  const colWidths: readonly string[] = showActionColumn
    ? [...BASE_COL_WIDTHS, ACTION_COL_WIDTH]
    : BASE_COL_WIDTHS;
  const totalColumns = headerKeys.length;
  const hasSizeFilter = selectedFilters["width"] || selectedFilters["height"] || selectedFilters["rim"];
  const displayCount = hasSizeFilter ? sortedProducts.length : totalCount;
  const totalPages = Math.ceil(displayCount / PAGE_SIZE);

  const handleHorizontalSearch = useCallback((width: string, height: string, rim: string) => {
    setSelectedFilters(prev => {
      const nf = { ...prev };
      if (width) nf["width"] = [width]; else delete nf["width"];
      if (height) nf["height"] = [height]; else delete nf["height"];
      if (rim) nf["rim"] = [rim]; else delete nf["rim"];
      return nf;
    });
    setSelectedFilterLabels(prev => {
      const nl = { ...prev };
      if (width) nl["width"] = [{ value: width, label: width }]; else delete nl["width"];
      if (height) nl["height"] = [{ value: height, label: height }]; else delete nl["height"];
      if (rim) nl["rim"] = [{ value: rim, label: rim }]; else delete nl["rim"];
      return nl;
    });
    setCurrentPage(1);
  }, []);

  /* ══════════════════════════════════════════════════════════════
     MOBILE PRODUCT CARD
  ══════════════════════════════════════════════════════════════ */
  const renderProductCard = (product: any, index: number) => {
    const brandName = product?.brand || (product?.name ? product.name.split(' ')[0] : "N/A");
    const isOutOfStock = product.stock_status === "Not Available" || Number(product?.stock_qty ?? 0) <= 0;
    const stockLabel = product?.stock_label === "Available" ? t("stock.available") : product?.stock_label === "Not Available" ? t("stock.not_available") : product?.stock_label === "Limited" ? t("stock.limited") : product?.stock_label || (product?.is_in_stock ? t("stock.available") : t("stock.not_available"));
    const stockColor = product?.stock_color?.toLowerCase() || (product?.is_in_stock ? "green" : "red");
    const dotColor = stockColor === "green" ? "bg-green-500" : stockColor === "yellow" ? "bg-brand-yellow" : "bg-red-500";

    return (
      <div key={index} className="relative bg-white rounded-lg border border-gray-100 shadow-sm p-2.5 sm:p-3 flex flex-col gap-1.5">
        {/* Top: content left + image right */}
        <div className="flex gap-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-caption font-bold text-gray-400 uppercase tracking-wider">{brandName}</p>
            <p className="text-body-sm md:text-body font-black text-gray-900 leading-tight mt-0.5 truncate">{product?.pattern || product?.name || "—"}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span dir="ltr" className="text-body-sm font-bold text-black">{product?.tyre_size || "—"}</span>
              <div onClick={() => setSelectedProduct(product)} className="w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center text-micro font-bold text-white cursor-pointer hover:bg-brand-yellow hover:text-black transition-all shadow-sm active:scale-95 flex-shrink-0">i</div>
              {product?.origin && <span className="text-label text-gray-400 font-normal">{t(`data.${product.origin}`) !== `data.${product.origin}` ? t(`data.${product.origin}`) : product.origin}</span>}
              {product?.year && <span className="text-label text-gray-400 font-mono font-normal">{product.year}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
              <span className="text-caption font-bold text-gray-600 uppercase">{stockLabel}</span>
            </div>
            {product?.offer && <p className="text-caption font-bold text-red-600 uppercase mt-1">{product.offer}</p>}
          </div>
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 rounded-lg border border-gray-100 overflow-hidden bg-gray-50 flex items-center justify-center cursor-pointer"
            onClick={() => { if (isValidImageUrl(product?.image_url)) { setSelectedImage(product.image_url); setPreviewProduct(product); setIsImageModalOpen(true); } }}
          >
            {isValidImageUrl(product?.image_url) ? (
              <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
            ) : (
              <ImageIcon size={20} className="text-gray-300" />
            )}
          </div>
        </div>
        {/* Bottom: price left + actions right */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex flex-col">
              {product.original_price && product.original_price > product.final_price ? (
                <>
                  <span className="text-caption font-medium text-gray-400">
                    <Price amount={product.original_price} className="font-medium line-through" />
                  </span>
                  <span className="text-body font-bold text-black rubik-sans truncate">
                    <Price amount={product.final_price} />
                  </span>
                </>
              ) : (
                <span className="text-body font-bold text-black rubik-sans truncate">
                  <Price amount={product?.final_price || 0} />
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!shouldHideCartActions && String(product?.is_action).toLowerCase() === "yes" && (
              !isOutOfStock ? (
                <>
                  <input
                    type="text"
                    value={productQtys[product.sku] || 1}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      handleQtyChange(product.sku, parseInt(val) || 1);
                    }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddToCart(product); }}
                    className="w-9 h-9 flex-shrink-0 border border-gray-300 rounded-none text-label font-semibold text-black bg-white text-center outline-none focus:border-brand-yellow transition-colors"
                  />
                  <button
                    onClick={() => handleAddToCart(product)}
                    disabled={loadingSkus.has(product.sku)}
                    className={`w-9 h-9 flex-shrink-0 rounded-none flex items-center justify-center shadow-md active:scale-95 cursor-pointer ${justAdded === product.sku ? "bg-green-500 text-white" : "bg-brand-yellow text-black"}`}
                  >
                    {justAdded === product.sku ? <Check size={14} strokeWidth={3} /> : <ShoppingCart size={15} strokeWidth={2.5} />}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setInquiryProduct(product); setIsInquiryModalOpen(true); }}
                  className="h-9 px-2.5 bg-brand-yellow text-black rounded-none flex items-center gap-1.5 text-label font-black uppercase shadow-sm active:scale-95 cursor-pointer flex-shrink-0"
                >
                  <Info size={14} strokeWidth={2.5} />
                </button>
              )
            )}
            {(!shouldHideCartActions || isSalesPerson) && (
              <button
                onClick={() => toggleFavorite(product)}
                disabled={loadingSkus.has(product.sku)}
                className={`w-9 h-9 rounded-none flex items-center justify-center active:scale-95 cursor-pointer flex-shrink-0 ${favIds.includes(product.product_id) ? "bg-brand-yellow text-black" : "bg-gray-100 text-gray-400"}`}
              >
                <Star size={16} fill={favIds.includes(product.product_id) ? "currentColor" : "none"} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
        {loadingSkus.has(product.sku) && (
          <div className="absolute inset-0 bg-white/80 rounded-lg z-10 flex items-center justify-center">
            <CardSpinner />
          </div>
        )}
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════
     PAGINATION (shared)
  ══════════════════════════════════════════════════════════════ */
  const renderPagination = (compact = false) => {
    const show = !loading && displayCount > 0;
    return (
      <div className={`flex items-center justify-between ${compact ? 'py-3 px-1' : 'px-6 h-[52px] border-t border-gray-100 bg-gray-50/30'} ${show ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
        <span className={`font-bold text-gray-400 uppercase tracking-widest ${compact ? 'text-caption' : 'text-caption'}`}>
          {compact ? `${displayCount} ${t("m.products")}` : <>{t("m.found")} <span className="text-gray-900">{displayCount}</span> {t("m.products")}</>}
        </span>
        <div className="flex items-center gap-1 md:gap-1.5">
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className={`border border-gray-200 rounded-sm bg-white disabled:opacity-30 ${compact ? 'p-1.5' : 'p-2'}`}>{isRtl ? <ChevronRight size={compact ? 14 : 16} /> : <ChevronLeft size={compact ? 14 : 16} />}</button>
          {Array.from({ length: Math.min(5, totalPages || 1) }).map((_, i) => (
            <button key={i} onClick={() => setCurrentPage(i + 1)} className={`rounded-sm font-black ${compact ? 'w-8 h-8 text-label' : 'w-9 h-9 text-xs'} ${currentPage === i + 1 ? "bg-brand-yellow text-black" : "bg-white text-gray-400 border border-gray-200"}`}>{i + 1}</button>
          ))}
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className={`border border-gray-200 rounded-sm bg-white disabled:opacity-30 ${compact ? 'p-1.5' : 'p-2'}`}>{isRtl ? <ChevronLeft size={compact ? 14 : 16} /> : <ChevronRight size={compact ? 14 : 16} />}</button>
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  return (
    <>
      <Suspense fallback={null}><SearchParamsReader onParams={handleParams} /></Suspense>
      <div className="flex">
        {/* Desktop Sidebar Track */}
        <div className="hidden xl:flex flex-col flex-shrink-0 self-stretch bg-white border-r border-gray-200">
          <SidebarFilter
            onFilterChange={handleFilterChange}
            selectedFilters={selectedFilters}
            isCollapsed={isSidebarCollapsed}
            setIsCollapsed={setIsSidebarCollapsed}
            initialFilters={loading && apiFilters === null ? null : apiFilters}
          />
        </div>

        {/* Mobile Filter Drawer */}
        <Drawer isOpen={isMobileFilterOpen} onClose={() => setIsMobileFilterOpen(false)}>
          <div className="flex flex-col h-full" dir={isRtl ? "rtl" : "ltr"}>
            <div className="bg-brand-yellow px-5 py-4 flex items-center justify-between flex-shrink-0">
              <h2 className="text-body-lg font-black text-black uppercase tracking-tight">{t("m.filter-options")}</h2>
              {Object.keys(selectedFilters).length > 0 && (
                <button onClick={() => { clearAllFilters(); setIsMobileFilterOpen(false); }} className="text-label font-bold text-black/70 uppercase underline">{t("m.clear-all")}</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Render SidebarFilter content directly — override its aside wrapper via CSS */}
              <div className="[&>aside]:!w-full [&>aside]:!h-auto [&>aside]:!static [&>aside]:!border-0 [&>aside]:!overflow-visible [&>aside>div]:!static [&>aside>div]:!h-auto [&>aside>div:first-child]:!hidden">
                <SidebarFilter onFilterChange={(f, l) => { handleFilterChange(f, l); setIsMobileFilterOpen(false); }} selectedFilters={selectedFilters} isCollapsed={false} setIsCollapsed={() => { }} initialFilters={loading && apiFilters === null ? null : apiFilters} />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setIsMobileFilterOpen(false)} className="w-full h-[44px] bg-black text-white font-black uppercase text-body-sm tracking-widest rounded-sm active:scale-95 cursor-pointer">
                {t("m.apply-filters")}
              </button>
            </div>
          </div>
        </Drawer>

        {/* Mobile Search Drawer */}
        <Drawer isOpen={isMobileSearchOpen} onClose={() => setIsMobileSearchOpen(false)}>
          <div className="flex flex-col h-full" dir={isRtl ? "rtl" : "ltr"}>
            <div className="bg-brand-yellow px-5 py-4 flex-shrink-0">
              <h2 className="text-body-lg font-black text-black uppercase tracking-tight">{t("m.search-by-size")}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <HorizontalFilter vertical onSearch={(w, h, r) => { handleHorizontalSearch(w, h, r); if (w && h && r) setIsMobileSearchOpen(false); }} initialValues={{ width: debouncedFilters["width"]?.[0] || "", height: debouncedFilters["height"]?.[0] || "", rim: debouncedFilters["rim"]?.[0] || "" }} />
            </div>
          </div>
        </Drawer>

        <div className="flex-1 flex flex-col w-full relative xl:pb-[90px]">

          {/* ── MOBILE CONTROLS ── */}
          <div className="xl:hidden flex flex-col gap-2 mb-3">
            {/* Controls: 2 cols on mobile, 4 cols on tablet */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(!shouldHideCartActions || isSalesPerson) && (
                <button onClick={() => router.push(lp("/wishlist"))} className="h-[44px] bg-white border border-gray-200 rounded-sm flex items-center justify-center gap-2 text-label font-bold uppercase tracking-wider shadow-sm active:scale-95 cursor-pointer">
                  <Star className="w-4 h-4 fill-black text-black" /> {t("m.favourite-products")}
                </button>
              )}
              <button onClick={() => setIsMobileSearchOpen(true)} className="h-[44px] bg-brand-yellow rounded-sm flex items-center justify-center gap-2 text-label font-bold uppercase tracking-wider shadow-sm active:scale-95 cursor-pointer">
                <Search className="w-4 h-4" /> {t("m.search")}
              </button>
              <div className="relative">
                <button onClick={() => setIsMobileSortOpen((prev) => !prev)} className="w-full h-[44px] bg-white border border-gray-200 rounded-sm flex items-center justify-center gap-2 text-label font-bold uppercase tracking-wider shadow-sm active:scale-95 cursor-pointer">
                  <ChevronDown className="w-4 h-4" />
                  <span className="truncate">{sortBy === "none" ? t("products.sortByDefault") : sortBy === "price-asc" ? t("products.sortByLowToHigh") : t("products.sortByHighToLow")}</span>
                </button>
                {isMobileSortOpen && (
                  <>
                    <div className="fixed inset-0 z-[190]" onClick={() => setIsMobileSortOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 w-full min-w-max bg-white rounded-xl shadow-xl border border-gray-100 z-[200] py-1 overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
                      <div className="flex flex-col py-1">
                        {[
                          { value: "none", label: t("products.sortByDefault") },
                          { value: "price-asc", label: t("products.sortByLowToHigh") },
                          { value: "price-desc", label: t("products.sortByHighToLow") },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => { setSortBy(opt.value); setIsMobileSortOpen(false); }}
                            className={`px-4 py-2.5 text-xs font-semibold ltr:text-left rtl:text-right flex items-center justify-between gap-4 transition-colors ${sortBy === opt.value ? "bg-brand-yellow/10 text-black" : "text-gray-700 hover:bg-gray-50"}`}
                          >
                            <span>{opt.label}</span>
                            {sortBy === opt.value && <Check size={14} className="text-brand-yellow" strokeWidth={3} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setIsMobileFilterOpen(true)} className="h-[44px] bg-white border border-gray-200 rounded-sm flex items-center justify-center gap-2 text-label font-bold uppercase tracking-wider shadow-sm active:scale-95 cursor-pointer">
                <Filter className="w-4 h-4" /> {t("m.filter-options")}
                {Object.keys(selectedFilters).length > 0 && <span className="w-5 h-5 bg-brand-yellow rounded-full text-caption font-black flex items-center justify-center">{Object.keys(selectedFilters).length}</span>}
              </button>
            </div>
            {/* Active filter chips */}
            {Object.keys(selectedFilterLabels).length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar-hide py-1">
                {Object.entries(selectedFilterLabels).flatMap(([code, items]) => items.map((item) => (
                  <div key={`${code}-${item.value}`} className="flex items-center gap-1 bg-gray-100 px-2.5 py-1 rounded-full text-caption font-bold text-gray-700 whitespace-nowrap flex-shrink-0">
                    {item.label} <button onClick={() => removeSpecificFilter(code, item.value)} className="text-gray-400"><X size={12} /></button>
                  </div>
                )))}
                <button onClick={clearAllFilters} className="text-caption font-black text-red-500 uppercase whitespace-nowrap flex-shrink-0 px-2">{t("m.clear-all")}</button>
              </div>
            )}
          </div>

          {/* ── MOBILE/TABLET CARD LIST ── */}
          <div className="xl:hidden grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {loading ? <MobileCardShimmer /> : sortedProducts.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-20 col-span-full"><p className="text-xs font-black text-gray-400 uppercase tracking-widest">{t("products.noProducts")}</p></div>
            ) : sortedProducts.map((p, i) => renderProductCard(p, i))}
          </div>
          <div className="xl:hidden">{renderPagination(true)}</div>

          {/* ── DESKTOP CONTROLS + TABLE ── */}
          <div className="hidden xl:flex flex-col bg-white rounded-none md:rounded-r-lg shadow-sm border border-gray-200 border-l-0 overflow-hidden">
            {/* Desktop header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center gap-4 min-h-[60px]">
              <div className="flex items-center gap-4">
                {(!shouldHideCartActions || isSalesPerson) && (
                  <button
                    onClick={() => router.push(lp("/wishlist"))}
                    className="h-10 px-4 bg-white border border-gray-200 text-black flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 cursor-pointer rounded-md shadow-sm"
                  >
                    <Star className="w-4 h-4 fill-black text-black" /> {t("sidebar.favoriteProducts")}
                  </button>
                )}
                <div className="flex flex-1 items-center gap-2 overflow-x-auto custom-scrollbar-hide max-w-[800px]">
                  {isFavorite && (
                    <div className="flex items-center gap-1.5 bg-brand-yellow border border-brand-yellow-dark px-3 py-1.5 rounded-full text-body-sm font-bold text-black shadow-sm flex-shrink-0">
                      {t("sidebar.favoriteProducts")} <button onClick={() => setIsFavorite(false)} className="hover:text-red-700"><X size={14} /></button>
                    </div>
                  )}
                  {Object.entries(selectedFilterLabels).flatMap(([code, items]) => items.map((item) => (
                    <div key={`${code}-${item.value}`} className="flex items-center gap-1 bg-white border border-gray-200 px-4 py-2 rounded-full text-body-sm font-bold text-gray-700 shadow-sm whitespace-nowrap flex-shrink-0">
                      {item.label} <button onClick={() => removeSpecificFilter(code, item.value)} className="hover:text-red-500 text-gray-400"><X size={14} strokeWidth={2.5} /></button>
                    </div>
                  )))}
                </div>
                {Object.keys(selectedFilters).length > 0 && (
                  <button onClick={clearAllFilters} className="text-caption font-black text-red-500 uppercase flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-full flex-shrink-0"><X size={12} strokeWidth={3} /> {t("m.clear")}</button>
                )}
              </div>
              <PortalDropdown
                value={sortBy}
                onChange={setSortBy}
                options={[{ label: t("products.sortByDefault"), value: "none" }, { label: t("products.sortByLowToHigh"), value: "price-asc" }, { label: t("products.sortByHighToLow"), value: "price-desc" }]}
                buttonClassName="h-10 px-4 bg-white border border-gray-200 text-black flex items-center justify-between gap-6 text-xs font-bold hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer rounded-sm shadow-sm whitespace-nowrap"
                minWidth={180}
              />
            </div>

            {/* Desktop table area */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full border-collapse table-fixed min-w-[900px]">
                <TableColGroup widths={colWidths} />
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    {headerKeys.map(key => {
                      const field = SORTABLE_HEADERS[key];
                      if (!field) {
                        return (
                          <th key={key} className="px-2 md:px-4 py-2 md:py-3 text-label font-semibold text-black uppercase tracking-widest text-center">{t(key)}</th>
                        );
                      }
                      return (
                        <th key={key} className="px-2 md:px-4 py-2 md:py-3 text-label font-semibold text-black tracking-widest text-center">
                          <button
                            type="button"
                            onClick={() => cycleSort(field)}
                            className="inline-flex items-center gap-1 select-none hover:text-brand-yellow transition-colors cursor-pointer uppercase tracking-widest"
                            aria-label={`Sort by ${t(key)}`}
                          >
                            <span>{t(key)}</span>
                            <SortIcon field={field} />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <ShimmerRows columnCount={totalColumns} />
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={totalColumns} className="py-24 text-center">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">
                          {t("products.noProducts")}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    sortedProducts.map((product, index) => {
                      const brandName = product?.brand || (product?.name ? product.name.split(' ')[0] : "N/A");
                      const isOutOfStock = product.stock_status === "Not Available" || Number(product?.stock_qty ?? 0) <= 0;
                      return (
                        <tr key={index} className={`h-auto md:h-[52px] border-b border-gray-200 hover:bg-brand-yellow/5 transition-all group ${loadingSkus.has(product.sku) ? "opacity-50 pointer-events-none" : ""}`}>
                          <td className="px-2 md:px-4 text-body-sm font-medium text-black/80 text-center">{t(`data.${brandName}`) !== `data.${brandName}` ? t(`data.${brandName}`) : brandName}</td>
                          <td className="px-2 md:px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <span dir="ltr" className="text-body-sm font-normal text-black">{product?.tyre_size}</span>
                              <div onClick={() => setSelectedProduct(product)} className="w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center text-micro font-bold text-white cursor-pointer hover:bg-brand-yellow hover:text-black transition-all shadow-sm flex-shrink-0">i</div>
                            </div>
                          </td>
                          <td className="px-2 md:px-4 text-body-sm font-medium text-black/80 text-center">{product?.pattern || "—"}</td>
                          <td className="px-2 md:px-4 text-body-sm font-normal text-black/60 text-center font-mono">{product?.year || "—"}</td>
                          <td className="px-2 md:px-4 text-body-sm font-medium text-black/80 text-center">{product?.origin ? (t(`data.${product.origin}`) !== `data.${product.origin}` ? t(`data.${product.origin}`) : product.origin) : "—"}</td>
                          <td className="px-2 md:px-4 text-center">
                            <div className="w-10 h-10 mx-auto">
                              {isValidImageUrl(product?.image_url) ? (
                                <div className="relative w-10 h-10 group/img cursor-pointer" onClick={() => { setSelectedImage(product.image_url); setPreviewProduct(product); setIsImageModalOpen(true); }}>
                                  <img src={product.image_url} alt={product.name} width={40} height={40} className="w-10 h-10 object-contain rounded border border-gray-100 shadow-sm" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-all duration-300 flex items-center justify-center rounded">
                                    <div className="w-5 h-5 bg-brand-yellow rounded-full flex items-center justify-center text-black font-semibold text-caption shadow-lg transform scale-50 group-hover/img:scale-100 transition-transform duration-300">+</div>
                                  </div>
                                </div>
                              ) : (
                                <div className="w-10 h-10 mx-auto flex items-center justify-center bg-gray-50 rounded border border-gray-100 shadow-sm">
                                  <ImageIcon size={18} className="text-gray-300" />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-2 md:px-4 text-center">{product.offer ? <span className="text-red-600 font-semibold text-caption uppercase tracking-tight block max-w-[150px] mx-auto">{product.offer}</span> : <span className="text-black/20">—</span>}</td>
                          <td className="px-2 md:px-4 text-center">{getStockBadge(product)}</td>
                          <td className="px-2 md:px-4 text-center whitespace-nowrap">
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
                                  <Price amount={product?.final_price || 0} />
                                </span>
                              )}
                            </div>
                          </td>
                          {showActionColumn && (
                            <td className="px-2 text-center align-middle min-w-[150px] whitespace-nowrap">
                              {String(product?.is_action).toLowerCase() === "yes" && (
                                loadingSkus.has(product.sku) ? (
                                  <div className="flex items-center justify-center h-8">
                                    <CardSpinner />
                                  </div>
                                ) : (
                                  <div className="flex flex-row items-center justify-center gap-1.5">
                                    {/* Col 1: Qty */}
                                    {!shouldHideCartActions && (
                                      !isOutOfStock ? (
                                        <input
                                          type="text"
                                          value={productQtys[product.sku] || 1}
                                          onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, "");
                                            handleQtyChange(product.sku, parseInt(val) || 0);
                                          }}
                                          className="w-10 h-8 flex-shrink-0 border border-gray-300 rounded-sm text-label font-semibold text-black bg-white shadow-sm text-center outline-none focus:border-brand-yellow transition-colors"
                                          onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0); }}
                                          onClick={(e) => (e.target as HTMLInputElement).select()}
                                          onKeyDown={(e) => { if (e.key === "Enter") handleAddToCart(product); }}
                                        />
                                      ) : (
                                        <div className="w-10 h-8 flex-shrink-0" />
                                      )
                                    )}
                                    {/* Col 2: Cart or Enquiry */}
                                    {!shouldHideCartActions && (
                                      !isOutOfStock ? (
                                        <button onClick={() => handleAddToCart(product)} disabled={loadingSkus.has(product.sku)} className={`w-9 h-8 flex-shrink-0 rounded-sm flex items-center justify-center shadow-md transition-all cursor-pointer ${justAdded === product.sku ? "bg-green-500 text-white" : "bg-brand-yellow hover:bg-brand-yellow-dark text-black"}`}>
                                          {justAdded === product.sku ? <Check size={15} strokeWidth={3} /> : <ShoppingCart size={15} strokeWidth={2.5} />}
                                        </button>
                                      ) : (
                                        <button onClick={() => { setInquiryProduct(product); setIsInquiryModalOpen(true); }} className="w-9 h-8 flex-shrink-0 bg-brand-yellow hover:bg-brand-yellow-dark text-black rounded-sm flex items-center justify-center shadow-md active:scale-95 cursor-pointer"><Info size={15} strokeWidth={2.5} /></button>
                                      )
                                    )}
                                    {/* Col 3: Wishlist */}
                                    <button onClick={() => toggleFavorite(product)} disabled={loadingSkus.has(product.sku)} className={`w-9 h-8 flex-shrink-0 rounded-sm flex items-center justify-center shadow-md cursor-pointer ${favIds.includes(product.product_id) ? "bg-brand-yellow text-black" : "bg-white text-black/50 border border-[#ddd]"}`}>
                                      <Star size={15} fill={favIds.includes(product.product_id) ? "currentColor" : "none"} strokeWidth={2.5} />
                                    </button>
                                  </div>
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {renderPagination()}
          </div>
        </div>

        {/* Desktop bottom search bar */}
        <div className="hidden xl:flex fixed bottom-0 left-0 right-0 z-[40] bg-white border-t-[4px] border-brand-yellow shadow-[0_-10px_30px_rgba(0,0,0,0.12)] h-[90px] items-center transition-all duration-300 translate-y-0">
          <div className={`w-full transition-all duration-300 ${isRtl ? (isSidebarCollapsed ? "pr-[50px] pl-0" : "pr-[300px] pl-0") : (isSidebarCollapsed ? "pl-[50px] pr-0" : "pl-[300px] pr-0")}`}>
            <div className="w-full max-w-[1400px] mx-auto px-4">
              <HorizontalFilter onSearch={handleHorizontalSearch} initialValues={{ width: debouncedFilters["width"]?.[0] || "", height: debouncedFilters["height"]?.[0] || "", rim: debouncedFilters["rim"]?.[0] || "" }} />
            </div>
          </div>
        </div>
      </div>
      <ProductDialog product={selectedProduct} isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} />
      <ProductEnquiryModal isOpen={isInquiryModalOpen} productSku={inquiryProduct?.sku || ""} productName={inquiryProduct?.name || ""} productPrice={inquiryProduct?.final_price || 0} onClose={() => { setIsInquiryModalOpen(false); setInquiryProduct(null); }} />
      <AddToCartPopup isOpen={isAddedPopupOpen} product={addedProduct} onClose={() => { setIsAddedPopupOpen(false); setAddedProduct(null); }} />
      <Drawer isOpen={isImageModalOpen && !!selectedImage} onClose={() => setIsImageModalOpen(false)}>
        <div className="flex flex-col h-full bg-white">
          <div className="bg-brand-yellow px-4 md:px-8 py-4 md:py-6 flex items-center justify-center flex-shrink-0">
            <h2 className="text-body-lg md:text-h4 font-semibold text-black text-center uppercase tracking-tight">
              {previewProduct ? <span dir="ltr">{previewProduct?.pattern || '-'} - {previewProduct?.tyre_size || '-'}</span> : t("m.preview")}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-center">
            <div className="bg-white flex items-center justify-center min-h-[200px] md:min-h-[400px] w-full">
              <img src={selectedImage} alt={previewProduct ? `${previewProduct?.pattern} - ${previewProduct?.tyre_size}` : t("m.preview")} className="max-w-full max-h-[60vh] md:max-h-[75vh] object-contain rounded-lg" />
            </div>
            <button onClick={() => setIsImageModalOpen(false)} className="mt-6 w-full py-3 md:py-4 bg-black text-white font-black uppercase tracking-widest rounded shadow-xl hover:bg-gray-800 text-sm cursor-pointer active:scale-95">{t("m.close")}</button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
