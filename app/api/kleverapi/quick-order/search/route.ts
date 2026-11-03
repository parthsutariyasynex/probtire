import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_QUICK_ORDER_SEARCH_QUERY, PRODUCTS_SEARCH_QUERY } from "@/src/graphql/queries";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// GET — quick-order product search route.
// Tries kleverQuickOrderSearch if user token is provided, falling back to standard Magento products search.
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get("query") || "";
        const pageSize = parseInt(searchParams.get("pageSize") || "20", 10) || 20;

        if (!query || query.length < 2) {
            return NextResponse.json({ items: [], total_count: 0 });
        }

        const token = await getRequestToken(request);
        const locale = getLocaleFromRequest(request);

        // 1. Try kleverQuickOrderSearch if token exists
        if (token && token !== "null") {
            try {
                const res = await fetch(MAGENTO_GRAPHQL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Store: locale,
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        query: KLEVER_QUICK_ORDER_SEARCH_QUERY,
                        variables: { query, pageSize },
                    }),
                    cache: "no-store",
                });

                if (res.ok) {
                    const json = await res.json();
                    if (!json.errors || json.errors.length === 0) {
                        const r = json?.data?.kleverQuickOrderSearch;
                        if (r && Array.isArray(r.items) && r.items.length > 0) {
                            return NextResponse.json({
                                items: r.items,
                                total_count: r.total_count ?? r.items.length,
                            });
                        }
                    }
                }
            } catch (err: any) {
                console.warn("[quick-order/search] kleverQuickOrderSearch failed, falling back to products query:", err.message);
            }
        }

        // 2. Fallback to standard Magento products search query (works for guest & authenticated users)
        const fallbackRes = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: locale,
                ...(token && token !== "null" ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                query: PRODUCTS_SEARCH_QUERY,
                variables: { search: query, pageSize, currentPage: 1 },
            }),
            cache: "no-store",
        });

        if (fallbackRes.ok) {
            const json = await fallbackRes.json();
            const productsData = json?.data?.products;
            const rawItems = Array.isArray(productsData?.items) ? productsData.items : [];
            const mappedItems = rawItems.map((item: any) => ({
                product_id: item.id,
                sku: item.sku,
                name: item.name,
                image_url: item.small_image?.url || "",
                is_in_stock: true,
            }));

            return NextResponse.json({
                items: mappedItems,
                total_count: productsData?.total_count ?? mappedItems.length,
            });
        }

        return NextResponse.json({ items: [], total_count: 0 });
    } catch (error: any) {
        console.error("[quick-order/search] Error:", error.message);
        return NextResponse.json({ error: "Search failed", items: [], total_count: 0 }, { status: 500 });
    }
}
