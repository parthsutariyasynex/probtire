import { NextRequest, NextResponse } from "next/server";
import { getRequestToken } from "@/lib/api/auth-helper";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { getMagentoAttachmentsLayout } from "@/src/lib/magentoOrderView";

// GET — Magento's own My Order Attachments page layout for the logged-in customer in the
// selected store view: title, search box, dropdown filters (Magento's options), reset text,
// columns + header texts and the "no records" text. Magento is the only source: 502 when it
// cannot be read (the page then shows an error state).
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const store = toStoreCode(getLocaleFromRequest(request), request);
        const layout = await getMagentoAttachmentsLayout(store, `Bearer ${token}`);
        if (!layout || layout.columns.length === 0) {
            return NextResponse.json({ message: "Magento's My Order Attachments page could not be read." }, { status: 502 });
        }
        return NextResponse.json(layout);
    } catch (error: any) {
        console.error("[order-attachments/layout] error:", error?.message || error);
        return NextResponse.json({ message: error?.message || "Magento's My Order Attachments page could not be read." }, { status: 502 });
    }
}
