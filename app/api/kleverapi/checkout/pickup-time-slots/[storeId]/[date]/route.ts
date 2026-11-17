import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";

// GET — pickup time slots of a warehouse + date for the selected website + language, from
// Magento's Klever REST endpoint /rest/<store>/V1/kleverapi/checkout/pickup-time-slots/{id}/{date}
// (the same slots and labels Magento's pickup form shows). Returned as
// [{ time, label, enabled }] with Magento's own values; nothing is added or invented.
export async function GET(
    req: Request,
    { params }: { params: Promise<{ storeId: string; date: string }> }
) {
    try {
        const token = await getRequestToken(req);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const { storeId, date } = await params;
        if (!/^\d+$/.test(storeId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json({ message: "Invalid warehouse or date" }, { status: 400 });
        }

        const res = await fetch(`${getBaseUrl(req)}/checkout/pickup-time-slots/${storeId}/${date}`, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            console.error("[pickup-time-slots] Magento REST error:", res.status, JSON.stringify(data).slice(0, 300));
            return NextResponse.json(data ?? { message: "Pickup times unavailable" }, { status: res.status });
        }

        const list: any[] = Array.isArray(data) ? data
            : Array.isArray(data?.slots) ? data.slots
            : Array.isArray(data?.time_slots) ? data.time_slots : [];
        const slots = list.map((s: any) => {
            if (typeof s === "string") return { time: s, label: s, enabled: true };
            const time = String(s?.time ?? s?.value ?? "");
            const enabled = typeof s?.enabled === "boolean" ? s.enabled
                : typeof s?.available === "boolean" ? s.available
                : true;
            return { time, label: String(s?.label ?? s?.time ?? s?.value ?? ""), enabled };
        }).filter((s) => s.time || s.label);
        return NextResponse.json(slots);
    } catch (error) {
        console.error("Pickup Time Slots Error:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
