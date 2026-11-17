import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";

// GET — pickup warehouses of the selected website + language, from Magento's Klever REST
// endpoint /rest/<store>/V1/kleverapi/checkout/pickup-stores (store_id, name, address, city,
// email, phone, latitude, longitude, opening hours …). Passed through unchanged; Magento's
// errors keep their status.
export async function GET(req: Request) {
    try {
        const token = await getRequestToken(req);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const res = await fetch(`${getBaseUrl(req)}/checkout/pickup-stores`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            cache: "no-store",
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            console.error("[pickup-stores] Magento REST error:", res.status, JSON.stringify(data).slice(0, 300));
            return NextResponse.json(data ?? { message: "Pickup warehouses unavailable" }, { status: res.status });
        }
        return NextResponse.json(Array.isArray(data) ? data : Array.isArray(data?.stores) ? data.stores : []);
    } catch (error) {
        console.error("Pickup Stores Error:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
