import { NextRequest, NextResponse } from "next/server";
import { getRequestToken } from "@/lib/api/auth-helper";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { getMagentoAddressBook } from "@/src/lib/magentoOrderView";

// GET — Magento's own Address Book page for the logged-in customer in the selected store view:
// page title, the Default Addresses boxes (titles, address lines, the actions Magento shows) and
// the Additional Address Entries list (header texts, rows, Edit/Delete texts, "no other address"
// text). Magento is the only source: 502 when it cannot be read (the page shows an error state).
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        const store = toStoreCode(getLocaleFromRequest(request), request);
        const book = await getMagentoAddressBook(store, `Bearer ${token}`);
        if (!book) return NextResponse.json({ message: "Magento's Address Book page could not be read." }, { status: 502 });
        return NextResponse.json(book);
    } catch (error: any) {
        console.error("[address-book] error:", error?.message || error);
        return NextResponse.json({ message: error?.message || "Magento's Address Book page could not be read." }, { status: 502 });
    }
}
