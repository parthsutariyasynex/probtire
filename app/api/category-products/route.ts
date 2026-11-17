import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { KLEVER_CATEGORY_PRODUCTS_WITH_FILTERS_QUERY, STANDARD_FILTERS_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";

// Maps frontend filter param codes → kleverCategoryProducts named arg keys.
// Covers both snake_case (legacy URL params) and camelCase (direct from kleverCategoryFilterOptions codes).
// Multi-value selections (brand[0]=X&brand[1]=Y) are joined as comma-separated strings.
const FILTER_CODE_TO_KLEVER: Record<string, string> = {
    // snake_case legacy keys
    brand: "brand",
    tyre_size: "tyreSize",
    origin: "manufacturer",
    product_group: "productGroup",
    warranty_period: "warrantyPeriod",
    new_arrivals: "newArrivals",
    itemcode: "itemCode",
    types: "types",
    oemmarking: "oemMarking",
    year: "year",
    pattern: "pattern",
    // camelCase / direct keys from kleverCategoryProducts filters block (sidebar)
    color: "color",      // tyre size from kleverCategoryProducts filters uses code "color"
    tyreSize: "tyreSize",
    productGroup: "productGroup",
    warrantyPeriod: "warrantyPeriod",
    newArrivals: "newArrivals",
    itemCode: "itemCode",
    oemMarking: "oemMarking",
};

// Parse filter[0], filter[1] style params → kleverCategoryProducts named args.
function parseFiltersForKlever(searchParams: URLSearchParams): Record<string, string> {
    const SKIP_PARAMS = new Set(["categoryId", "page", "pageSize", "lang", "productsOnly", "sortBy", "sortOrder"]);
    // const CLIENT_SIDE_FILTERS = new Set(["width", "height", "rim", "offers"]);
    const CLIENT_SIDE_FILTERS = new Set(["offers"]);
    const collected: Record<string, string[]> = {};

    for (const [key, value] of searchParams.entries()) {
        const match = key.match(/^([a-zA-Z_]+)\[\d+\]$/);
        if (!match) continue;
        const code = match[1];
        if (SKIP_PARAMS.has(code) || CLIENT_SIDE_FILTERS.has(code)) continue;
        if (!collected[code]) collected[code] = [];
        collected[code].push(value);
    }

    const vars: Record<string, string> = {};
    for (const [code, values] of Object.entries(collected)) {
        const kleverKey = FILTER_CODE_TO_KLEVER[code] || code;
        vars[kleverKey] = values.join(",");
    }
    return vars;
}

// ── Sidebar groups = Magento layered navigation ─────────────────────────────
// kleverCategoryProducts builds its own filter list, which can include groups the
// Magento storefront does not show for a website (e.g. Origin on Roya, whose products
// have no origin value). The storefront's layered navigation is Magento's standard
// `products.aggregations` for the store view + category, so only Klever groups that
// Magento's layered navigation also shows are kept, in Magento's order.
// Groups are matched by attribute code or by store label — nothing is hardcoded.
const LAYERED_NAV_TTL_MS = 2 * 60 * 1000;
const layeredNavCache = new Map<string, { keys: Map<string, number>; expires: number }>();

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "");

async function getLayeredNavKeys(
    domain: string | undefined, store: string, token: string | null, categoryId: string,
): Promise<Map<string, number> | null> {
    const key = `${store}|${token || "guest"}|${categoryId}`;
    const hit = layeredNavCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.keys;
    try {
        const res = await fetch(`${domain}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: store,
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({ query: STANDARD_FILTERS_QUERY, variables: { categoryId } }),
            cache: "no-store",
        });
        const json = await res.json();
        const aggregations = json?.data?.products?.aggregations;
        if (!Array.isArray(aggregations)) {
            console.error("[category-products] layered navigation unavailable:", JSON.stringify(json?.errors || json).slice(0, 300));
            return null;
        }
        // attribute code + store label → position in Magento's layered navigation
        const keys = new Map<string, number>();
        aggregations.forEach((a: any, index: number) => {
            if (!a?.options?.length) return;
            for (const k of [a.attribute_code, a.label]) {
                const n = norm(k);
                if (n && !keys.has(n)) keys.set(n, index);
            }
        });
        layeredNavCache.set(key, { keys, expires: Date.now() + LAYERED_NAV_TTL_MS });
        return keys;
    } catch (err: any) {
        console.error("[category-products] layered navigation fetch failed:", err?.message);
        return null;
    }
}

/** Position of a Klever filter group in Magento's layered navigation, or -1 if Magento does not show it. */
function layeredNavPosition(filter: { code: string; label: string }, keys: Map<string, number>): number {
    for (const k of [filter.code, FILTER_CODE_TO_KLEVER[filter.code], filter.label]) {
        const pos = keys.get(norm(k));
        if (pos !== undefined) return pos;
    }
    return -1;
}

// ── Short-lived response cache ───────────────────────────────────────────────
const CACHE_TTL_MS = 2 * 60 * 1000;
const responseCache = new Map<string, { body: string; expires: number }>();

export async function GET(request: NextRequest) {
    try {
        // Step 1: Get token - try multiple methods
        let token: string | null = null;

        const authHeader = request.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7).replace(/['"]/g, "").trim();
            console.log("[category-products] Token from Auth header:", token ? "found" : "missing");
        }

        if (!token) {
            try {
                const jwtToken = await getToken({
                    req: request,
                    secret: process.env.NEXTAUTH_SECRET,
                });
                token = (jwtToken as any)?.accessToken || null;
                console.log("[category-products] Token from JWT cookie:", token ? "found" : "missing");
            } catch (e) {
                console.error("[category-products] JWT token error:", e);
            }
        }

        if (!token) {
            token = request.cookies.get("auth-token")?.value || null;
            if (token) {
                token = token.replace(/['"]/g, "").trim();
                console.log("[category-products] Token from auth-token cookie:", token ? "found" : "missing");
            }
        }

        if (token === "null" || token === "undefined" || !token) {
            token = null;
        }

        if (!token) {
            console.warn("[category-products] No token found. Proceeding as guest if allowed by Magento.");
        }

        // Step 2: Handle search parameters
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get("categoryId");
        if (!categoryId) {
            return new Response(JSON.stringify({ error: "categoryId is required" }), { status: 400 });
        }
        const page = searchParams.get("page") || "1";
        const pageSize = searchParams.get("pageSize") || "20";

        const resolvedLocale = getLocaleFromRequest(request);
        console.log("[category-products] LOCALE DEBUG: resolved=" + resolvedLocale);

        // Parse sidebar filter params (brand[0]=X, year[0]=Y, etc.) → Klever named args
        const kleverFilters = parseFiltersForKlever(searchParams);
        const filterKey = JSON.stringify(kleverFilters);

        // Map sortBy UI param → Klever sortBy/sortOrder args
        const sortByParam = searchParams.get("sortBy");
        let kleverSort: Record<string, string> = {};
        if (sortByParam === "price-asc") kleverSort = { sortBy: "price", sortOrder: "ASC" };
        else if (sortByParam === "price-desc") kleverSort = { sortBy: "price", sortOrder: "DESC" };

        // ── Cache lookup ─────────────────────────────────────────────────
        const now = Date.now();
        // Keyed by store view — the same category has different products per website.
        const cacheKey = `v4|${toStoreCode(resolvedLocale, request)}|${token || "guest"}|${categoryId}|${page}|${pageSize}|${filterKey}|${sortByParam || ""}`;
        const cached = responseCache.get(cacheKey);
        if (cached && cached.expires > now) {
            console.log("[category-products] cache HIT", cacheKey);
            return new Response(cached.body, {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                    "X-Cache": "HIT",
                },
            });
        }

        const domain = process.env.NEXT_PUBLIC_MAGENTO_BASE_URL;

        const variables: Record<string, any> = {
            categoryId: parseInt(categoryId, 10),
            currentPage: parseInt(page, 10) || 1,
            pageSize: parseInt(pageSize, 10) || 20,
            ...kleverFilters,
            ...kleverSort,
        };

        console.log("[category-products] GraphQL variables:", JSON.stringify(variables));

        const store = toStoreCode(resolvedLocale, request);
        // Layered navigation (which filter groups Magento shows) is fetched in parallel.
        const layeredNavPromise = getLayeredNavKeys(domain, store, token, String(parseInt(categoryId, 10)));

        const res = await fetch(`${domain}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: store,
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({ query: KLEVER_CATEGORY_PRODUCTS_WITH_FILTERS_QUERY, variables }),
            cache: "no-store",
        });

        const json = await res.json();

        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("category-products error:", JSON.stringify(json.errors).slice(0, 500));
            return Response.json(
                { error: "Magento GraphQL error", details: json.errors },
                { status: 502 }
            );
        }

        const result = json?.data?.kleverCategoryProducts;
        if (!result) {
            return Response.json(
                { error: "Magento GraphQL error", message: "Empty products response" },
                { status: 502 }
            );
        }

        // kleverCategoryProducts already returns the full product shape.
        // Normalize is_action to always be "Yes"/"No" (Magento may return any casing).
        // Add stock_status (derived from stock_label) for components that read it.
        const products = (result.products || []).map((p: any) => ({
            ...p,
            is_action: String(p.is_action || "").toLowerCase() === "yes" ? "Yes" : "No",
            stock_status: p.stock_label || (p.is_in_stock ? "Available" : "Not Available"),
        }));
        const actionCount = products.filter((p: any) => p.is_action === "Yes").length;
        console.log(`[category-products] is_action normalization: ${actionCount}/${products.length} products have is_action=Yes`);

        const kleverGroups = ((result.filters || []) as any[])
            .map((f: any) => ({
                code: f.code || "",
                label: f.label || "",
                record_count: f.record_count ?? 0,
                options: (f.options || []).map((o: any) => ({
                    value: o.value,
                    label: o.label,
                    count: o.count,
                })),
            }));

        // Keep only the groups Magento's layered navigation shows for this website, in its order.
        // If Magento's layered navigation cannot be read, no groups are shown (no guessing).
        const layeredNav = await layeredNavPromise;
        const filters = layeredNav
            ? kleverGroups
                .map((f) => ({ f, pos: layeredNavPosition(f, layeredNav) }))
                .filter(({ f, pos }) => {
                    if (pos < 0) console.log(`[category-products] ${store}: hiding "${f.label}" (${f.code}) — not in Magento layered navigation`);
                    return pos >= 0;
                })
                .sort((a, b) => a.pos - b.pos)
                .map(({ f }) => f)
            : [];

        const responseBody = JSON.stringify({
            products,
            filters,
            total_count: result.total_count || 0,
            page_size: result.page_size || parseInt(pageSize, 10),
            current_page: result.current_page || 1,
            total_pages: result.total_pages || 1,
        });

        responseCache.set(cacheKey, { body: responseBody, expires: now + CACHE_TTL_MS });
        if (responseCache.size > 200) {
            for (const [k, v] of responseCache) {
                if (v.expires <= now) responseCache.delete(k);
            }
        }

        return new Response(responseBody, {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "X-Cache": "MISS",
            },
        });

    } catch (error: any) {
        console.error("category-products route error:", error.message);
        return Response.json(
            { error: "Failed to fetch products", message: error.message },
            { status: 500 }
        );
    }
}


