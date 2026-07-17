import { NextResponse } from 'next/server';
import { CUSTOMER_WISHLIST_QUERY, KLEVER_FAVORITE_PRODUCTS_ENRICH_QUERY } from '@/src/graphql/queries';
import { ADD_PRODUCTS_TO_WISHLIST_MUTATION } from '@/src/graphql/mutations';

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "https://altalayi-live.btire.com") + "/graphql";
const PRODUCTS_CATEGORY_ID = parseInt(process.env.NEXT_PUBLIC_PRODUCTS_CATEGORY_ID || "5", 10);

// Native product images come back as a /cache/<hash>/ path that 404s; the un-cached path works.
function fixImageUrl(url?: string | null): string | null {
    if (!url) return null;
    return url.replace(/\/cache\/[^/]+\//, '/');
}

// Step 1: fetch wishlist items from native Magento customer.wishlists
async function fetchWishlist(authHeader: string, locale: string, currentPage: number, pageSize: number) {
    const res = await fetch(MAGENTO_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Store: locale, Authorization: authHeader },
        body: JSON.stringify({ query: CUSTOMER_WISHLIST_QUERY, variables: { currentPage, pageSize } }),
        cache: 'no-store',
    });
    return res.json();
}

// Step 2: fetch full klever product fields by item codes (comma-separated).
// kleverCategoryProducts with itemCode returns all products whose item_code matches any
// of the comma-separated codes, using the customer's own pricing/stock context.
async function fetchKleverProducts(authHeader: string, locale: string, itemCode: string, pageSize: number) {
    const res = await fetch(MAGENTO_GRAPHQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Store: locale, Authorization: authHeader },
        body: JSON.stringify({
            query: KLEVER_FAVORITE_PRODUCTS_ENRICH_QUERY,
            variables: { categoryId: PRODUCTS_CATEGORY_ID, itemCode, pageSize },
        }),
        cache: 'no-store',
    });
    return res.json();
}

// Merge native wishlist item with Klever product data.
// Klever data is authoritative for all product fields; native provides the fallback
// price/stock/image and — critically — the wishlist item id used for delete.
function mapWishlistItemWithKlever(it: any, kleverMap: Record<string, any>) {
    const p = it?.product || {};
    const sku: string = p.sku || '';
    const itemCode = sku.replace(/-\d{4}$/, '') || sku;

    // Prefer exact-SKU match so the right year variant is shown; fall back to item_code match.
    const kp = kleverMap[sku] || kleverMap[itemCode] || {};

    const fp = Number(kp.final_price ?? p?.price_range?.minimum_price?.final_price?.value ?? 0);
    const rp = Number(kp.regular_price ?? kp.old_price ?? p?.price_range?.minimum_price?.regular_price?.value ?? 0);
    const originalPrice = rp > fp ? rp : 0;

    const imageUrl = kp.image_url || fixImageUrl(p?.image?.url);
    const isInStock = kp.is_in_stock != null
        ? Boolean(kp.is_in_stock)
        : p?.stock_status === 'IN_STOCK';
    const stockQty = Number(kp.stock_qty ?? (isInStock ? 1 : 0));

    return {
        favorite_id: it?.id,
        product_id: kp.product_id || p?.id,
        id: kp.product_id || p?.id,
        sku,
        item_code: kp.item_code || itemCode,
        name: kp.name || p?.name || '',
        url_key: p?.url_key,
        image_url: imageUrl,
        image: imageUrl,
        final_price: fp,
        price: rp || fp,
        original_price: originalPrice,
        stock_status: kp.stock_label || (isInStock ? 'Available' : 'Not Available'),
        stock_qty: stockQty,
        qty: it?.quantity ?? 1,
        brand: kp.brand || '',
        tyre_size: kp.tyre_size || '',
        year: kp.year || '',
        pattern: kp.pattern || '',
        origin: kp.origin || '',
        offer: kp.offer || '',
        is_action: kp.is_action || 'Yes',
        stock_color: kp.stock_color || '',
    };
}

// GET — favourite products via native customer wishlist + klever enrichment.
// Returns { products, total_count }, same shape the favourites UI reads.
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        const locale = request.headers.get('x-locale') || 'en';
        if (!authHeader) {
            return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const currentPage = parseInt(searchParams.get('currentPage') || '1', 10) || 1;
        const pageSize = parseInt(searchParams.get('pageSize') || '10', 10) || 10;

        // Step 1: get wishlist item IDs and SKUs
        const wlJson = await fetchWishlist(authHeader, locale, currentPage, pageSize);
        if (Array.isArray(wlJson?.errors) && wlJson.errors.length > 0) {
            console.warn('[favorite-products GET] wishlist GraphQL error:', JSON.stringify(wlJson.errors).slice(0, 200));
            return NextResponse.json({ products: [], total_count: 0 });
        }

        const wl = wlJson?.data?.customer?.wishlists?.[0];
        const items: any[] = wl?.items_v2?.items ?? [];

        if (items.length === 0) {
            return NextResponse.json({ products: [], total_count: wl?.items_count ?? 0 });
        }

        // Step 2: enrich with klever product data using item codes
        const itemCodes = [...new Set(
            items.map((it: any) => {
                const sku: string = it?.product?.sku || '';
                return sku.replace(/-\d{4}$/, '') || sku;
            }).filter(Boolean)
        )].join(',');

        const kleverMap: Record<string, any> = {};
        try {
            const kleverJson = await fetchKleverProducts(authHeader, locale, itemCodes, pageSize * 3);
            if (!Array.isArray(kleverJson?.errors)) {
                for (const kp of kleverJson?.data?.kleverCategoryProducts?.products ?? []) {
                    // Index by exact SKU for best match
                    if (kp.sku) kleverMap[kp.sku] = kp;
                    // Also index by item_code as fallback (don't overwrite a better exact-SKU match)
                    if (kp.item_code && !kleverMap[kp.item_code]) kleverMap[kp.item_code] = kp;
                }
            }
        } catch (e) {
            // Enrichment failed — fall back to native fields only (brand/size/year stay empty)
            console.warn('[favorite-products GET] klever enrich failed, using native fields only:', e);
        }

        const products = items.map((it: any) => mapWishlistItemWithKlever(it, kleverMap));

        return NextResponse.json({
            products,
            total_count: wl?.items_count ?? items.length,
        });
    } catch (error: any) {
        console.error('[favorite-products GET] error:', error.message);
        return NextResponse.json({ message: error.message || 'Server-side error fetching favourites.' }, { status: 500 });
    }
}

// POST — add to favourites via addProductsToWishlist. Native wishlist add requires a SKU.
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        const locale = request.headers.get('x-locale') || 'en';
        if (!authHeader) {
            return NextResponse.json({ message: 'Authorization required' }, { status: 401 });
        }

        const body = await request.json();
        const sku = body?.sku;
        if (!sku) {
            return NextResponse.json(
                { message: 'sku is required to add to wishlist.' },
                { status: 400 }
            );
        }
        const quantity = Number(body?.qty ?? body?.quantity ?? 1) || 1;

        // Resolve the customer's wishlist id (addProductsToWishlist requires it).
        const wlJson = await fetchWishlist(authHeader, locale, 1, 1);
        const wishlistId = wlJson?.data?.customer?.wishlists?.[0]?.id;
        if (!wishlistId) {
            return NextResponse.json({ message: 'No wishlist available for this customer.' }, { status: 400 });
        }

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Store: locale, Authorization: authHeader },
            body: JSON.stringify({
                query: ADD_PRODUCTS_TO_WISHLIST_MUTATION,
                variables: { wishlistId, items: [{ sku: String(sku), quantity }] },
            }),
            cache: 'no-store',
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error('[favorite-products POST] GraphQL error:', JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ message: json.errors[0]?.message || 'Failed to add favourite.' }, { status: 400 });
        }
        const out = json?.data?.addProductsToWishlist;
        const userErr = out?.user_errors?.[0];
        if (userErr) {
            return NextResponse.json({ message: userErr.message || 'Failed to add favourite.' }, { status: 400 });
        }
        return NextResponse.json({ success: true, items_count: out?.wishlist?.items_count ?? null });
    } catch (error: any) {
        console.error('[favorite-products POST] error:', error.message);
        return NextResponse.json({ message: 'Server-side error adding favourite.' }, { status: 500 });
    }
}
