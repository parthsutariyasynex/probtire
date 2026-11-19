import { NextRequest, NextResponse } from "next/server";
import { getRequestToken } from "@/lib/api/auth-helper";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { getMagentoWishlistEmptyMessage } from "@/src/lib/magentoOrderView";

// GET — Magento's own "no items in your favourite products" message for the logged-in customer
// in the selected store view, read from Magento's Favourite Products page. 502 when Magento's
// page cannot be read or shows no such message (the page then shows an error state).
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const store = toStoreCode(getLocaleFromRequest(request), request);
        const message = await getMagentoWishlistEmptyMessage(store, `Bearer ${token}`);
        if (!message) return NextResponse.json({ message: "Magento's favourite products message could not be read." }, { status: 502 });
        return NextResponse.json({ message });
    } catch (error: any) {
        console.error("[favorite-products/empty-message] error:", error?.message || error);
        return NextResponse.json({ message: "Magento's favourite products message could not be read." }, { status: 502 });
    }
}
