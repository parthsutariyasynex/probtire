import { NextRequest } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
// Commented out — kleverCategoryProducts resolver is not available on the current backend.
// import { KLEVER_CATEGORY_FILTER_OPTIONS_FROM_PRODUCTS_QUERY } from "@/src/graphql/queries";
import { STANDARD_FILTERS_QUERY } from "@/src/graphql/queries";

// Layered-navigation filter options for a category, served via Magento GraphQL.
// Now uses standard Magento `products` query aggregations instead of the missing
// kleverCategoryProducts resolver.

// GraphQL aggregation `attribute_code` → the snake_case codes the frontend expects
function normalizeCode(code: string): string {
    switch (code) {
        case "tyreSize": return "tyre_size";
        case "color": return "tyre_size";
        case "productGroup": return "product_group";
        case "warrantyPeriod": return "warranty_period";
        case "newArrivals": return "new_arrivals";
        case "manufacturer": return "origin";
        case "mgs_brand": return "brand";
        default: return code;
    }
}

// ── Short-lived response cache ───────────────────────────────────────────────
const CACHE_TTL_MS = 2 * 60 * 1000;
const responseCache = new Map<string, { body: string; expires: number }>();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get("categoryId");
        if (!categoryId || !/^\d+$/.test(categoryId)) {
            return Response.json({ error: "categoryId (numeric) is required" }, { status: 400 });
        }

        const token = await getRequestToken(request);
        const locale = getLocaleFromRequest(request);

        // ── Cache lookup ─────────────────────────────────────────────────
        const now = Date.now();
        const cacheKey = `${locale}|${token || "guest"}|${categoryId}`;
        const cached = responseCache.get(cacheKey);
        if (cached && cached.expires > now) {
            console.log("[category-filter-options] cache HIT", cacheKey);
            return new Response(cached.body, {
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Cache": "HIT" },
            });
        }

        const domain = process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "https://altalayi-live.btire.com";
        console.log("[category-filter-options] GraphQL categoryId:", categoryId, "locale:", locale);

        const res = await fetch(`${domain}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: locale,
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({
                query: STANDARD_FILTERS_QUERY,
                variables: { categoryId: String(categoryId) },
            }),
            cache: "no-store",
        });

        const json = await res.json();

        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("category-filter-options error:", JSON.stringify(json.errors).slice(0, 500));
            return Response.json({ error: "Magento GraphQL error", details: json.errors }, { status: 502 });
        }

        // Standard query returns data.products.aggregations (not data.kleverCategoryProducts.filters)
        const aggregations = json?.data?.products?.aggregations;
        if (!aggregations) {
            return Response.json(
                { error: "Magento GraphQL error", message: "Empty filter-options response" },
                { status: 502 }
            );
        }

        // ── Old filter logic (no exclusion, no ordering) ────────────────────
        // Commented out — replaced with exclusion + ordering logic to match live site sidebar.
        // const filters = aggregations
        //     .filter((a: any) => !["category_id", "category_uid"].includes(a.attribute_code))
        //     .map((a: any) => ({
        //         code: normalizeCode(a.attribute_code),
        //         label: a.label,
        //         record_count: a.count,
        //         options: (a.options || []).map((o: any) => ({
        //             value: o.value,
        //             label: o.label,
        //             count: o.count,
        //         })),
        //     }));

        // Aggregations to exclude from the sidebar:
        // category_id/category_uid — internal Magento grouping
        // parts_category — always single value, not useful
        // width/height/rim — used by HorizontalFilter bar, not the sidebar
        const EXCLUDE_CODES = new Set([
            "category_id", "category_uid",
            "parts_category", "width", "height", "rim",
        ]);

        // Sidebar order matching the live site
        const SIDEBAR_ORDER: string[] = [
            "item_code", "brand", "product_group", "tyre_size",
            "pattern", "year", "origin", "runflat", "oem_marking",
            "new_arrivals", "warranty_period",
        ];

        const mapped = aggregations
            .filter((a: any) => !EXCLUDE_CODES.has(a.attribute_code))
            .map((a: any) => ({
                code: normalizeCode(a.attribute_code),
                label: a.label,
                record_count: a.count,
                options: (a.options || []).map((o: any) => ({
                    value: o.value,
                    label: o.label,
                    count: o.count,
                })),
            }));

        const orderIndex = (code: string) => {
            const i = SIDEBAR_ORDER.indexOf(code);
            return i >= 0 ? i : SIDEBAR_ORDER.length;
        };
        const filters = mapped.sort((a: any, b: any) => orderIndex(a.code) - orderIndex(b.code));

        const responseBody = JSON.stringify({ filters });

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
        console.error("category-filter-options route error:", error.message);
        return Response.json(
            { error: "Failed to fetch filter options", message: error.message },
            { status: 500 }
        );
    }
}
