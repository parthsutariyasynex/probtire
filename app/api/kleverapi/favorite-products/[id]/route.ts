import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { NextResponse } from 'next/server';
import { getCustomerWishlist } from '@/src/lib/wishlist';
import { REMOVE_PRODUCTS_FROM_WISHLIST_MUTATION } from '@/src/graphql/mutations';
import { toStoreCode } from "@/lib/store/website";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// DELETE — remove a favourite via native removeProductsFromWishlist. The path `id` is the
// wishlist ITEM id (the list route surfaces it as `favorite_id`). Needs the wishlist id, so we
// resolve it first.
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        const locale = getLocaleFromRequest(request);
        if (!authHeader) {
            return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
        }

        // The wishlist that holds this item (a customer can have more than one).
        const wishlist = await getCustomerWishlist(toStoreCode(locale, request), authHeader);
        const wishlistId = wishlist.items.find((it) => it.id === String(id))?.wishlistId;
        if (!wishlistId) {
            return NextResponse.json({ message: 'This favourite is not in the wishlist of the selected website.' }, { status: 404 });
        }

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Store: toStoreCode(locale, request), Authorization: authHeader },
            body: JSON.stringify({
                query: REMOVE_PRODUCTS_FROM_WISHLIST_MUTATION,
                variables: { wishlistId, itemIds: [String(id)] },
            }),
            cache: 'no-store',
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error('[favorite-products/:id DELETE] GraphQL error:', JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ message: json.errors[0]?.message || 'Failed to remove favourite.' }, { status: 400 });
        }
        const out = json?.data?.removeProductsFromWishlist;
        const userErr = out?.user_errors?.[0];
        if (userErr) {
            return NextResponse.json({ message: userErr.message || 'Failed to remove favourite.' }, { status: 400 });
        }
        return NextResponse.json({ success: true, items_count: out?.wishlist?.items_count ?? null });
    } catch (error: any) {
        console.error('[favorite-products/:id DELETE] error:', error.message);
        return NextResponse.json({ message: 'Server-side error removing favourite.' }, { status: 500 });
    }
}
