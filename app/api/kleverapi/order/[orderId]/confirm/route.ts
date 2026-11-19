import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_CONFIRM_ORDER_MUTATION } from "@/src/graphql/mutations";
import { toStoreCode } from "@/lib/store/website";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// POST — confirm an order (GraphQL: kleverConfirmOrder(orderId: Int!, input: KleverConfirmOrderInput)).
// Accepts an optional body { comment, attachments } (or { input: { comment, attachments } });
// only provided fields are forwarded into the input object. Returns normalized
// { success, message?, data? } where data carries the raw mutation result (ids + attachments).
// NOT executed during this migration — order-modifying; schema-validated + tsc only.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

        const { orderId } = await params;
        // orderId may be a numeric entity_id ("222") or a base64 GraphQL order id ("MjIy" → "222").
        const id = /^\d+$/.test(orderId) ? parseInt(orderId, 10) : parseInt(Buffer.from(decodeURIComponent(orderId), "base64").toString("utf8"), 10);
        if (Number.isNaN(id)) {
            return NextResponse.json({ success: false, message: "Invalid order id" }, { status: 400 });
        }

        // Body is optional; accept either { comment, attachments } or { input: {...} }.
        const body = await request.json().catch(() => ({}));
        const src = body?.input ?? body ?? {};
        // Magento's KleverConfirmOrderInput: { comment?, attachments?: [{ file_name!, file_content! (base64) }] }
        const input: Record<string, any> = {};
        if (typeof src.comment === "string" && src.comment.trim()) input.comment = src.comment;
        const files = (Array.isArray(src.attachments) ? src.attachments : [])
            .filter((a: any) => a?.file_name && a?.file_content)
            .map((a: any) => ({ file_name: String(a.file_name), file_content: String(a.file_content) }));
        if (files.length > 0) input.attachments = files;

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: toStoreCode(getLocaleFromRequest(request), request),
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query: KLEVER_CONFIRM_ORDER_MUTATION, variables: { orderId: id, input } }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("[order/:id/confirm] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ success: false, message: json.errors[0]?.message || "Failed to confirm order" }, { status: 400 });
        }

        const result = json?.data?.kleverConfirmOrder;
        return NextResponse.json({
            success: result?.success ?? false,
            message: result?.message,
            data: result ?? null,
        });
    } catch (error: any) {
        console.error("[order/:id/confirm] error:", error.message);
        return NextResponse.json({ success: false, message: error.message || "Server error confirming order" }, { status: 500 });
    }
}
