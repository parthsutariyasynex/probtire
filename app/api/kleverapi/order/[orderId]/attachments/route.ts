import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_PRINT_ORDER_QUERY, KLEVER_ORDER_UPLOAD_SEARCH_QUERY } from "@/src/graphql/queries";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "https://altalayi-live.btire.com") + "/graphql";

// GET — attachments for a single order.
// Replaces the broken native kleverOrderAttachments query (which crashes Magento backend with 500 error)
// with the working kleverOrderUploadSearch query.
// Returns { attachments: [...] } mapping to the frontend order-detail page shape.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const { orderId } = await params;
        const locale = getLocaleFromRequest(request);

        let entityId: number | null = null;
        let incrementId: string | null = null;

        // Resolve orderId from parameters: could be entity ID, base64-encoded entity ID, or increment ID
        if (/^\d+$/.test(orderId)) {
            entityId = parseInt(orderId, 10);
        } else {
            try {
                const decoded = Buffer.from(decodeURIComponent(orderId), "base64").toString("utf8");
                if (/^\d+$/.test(decoded)) {
                    entityId = parseInt(decoded, 10);
                } else {
                    incrementId = decoded;
                }
            } catch {
                incrementId = orderId;
            }
        }

        // If we resolved a numeric entity ID, fetch order details to retrieve the order number/increment ID
        if (entityId !== null && !Number.isNaN(entityId)) {
            const printRes = await fetch(MAGENTO_GRAPHQL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Store: locale,
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ query: KLEVER_PRINT_ORDER_QUERY, variables: { orderId: entityId } }),
                cache: "no-store",
            });

            if (printRes.ok) {
                const printJson = await printRes.json();
                if (printJson?.data?.kleverPrintOrder?.order_number) {
                    incrementId = printJson.data.kleverPrintOrder.order_number;
                }
            }
        }

        // If we still don't have an increment ID, use orderId as a fallback
        if (!incrementId) {
            incrementId = orderId;
        }

        // Fetch attachments using kleverOrderUploadSearch query
        const variables = {
            orderIncrementId: incrementId,
            pageSize: 100,
            currentPage: 1,
        };

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: locale,
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query: KLEVER_ORDER_UPLOAD_SEARCH_QUERY, variables }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("[order/:id/attachments] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ message: json.errors[0]?.message || "Failed to fetch order attachments" }, { status: 502 });
        }

        const items = json?.data?.kleverOrderUploadSearch?.items || [];
        const attachments = items.map((item: any) => ({
            attachment_id: item.id,
            id: item.id,
            file_name: item.file_name,
            file_url: item.file_path,
            upload_date: item.created_at,
            created_at: item.created_at,
            document_type: item.comment || "-",
            attachment_type: item.comment || "-",
            comment: item.comment,
            payment: item.payment_status || "-",
            payment_status: item.payment_status || "-",
            invoice_due: item.invoice_due,
        }));

        return NextResponse.json({ attachments });
    } catch (error: any) {
        console.error("[order/:id/attachments] error:", error.message);
        return NextResponse.json({ message: error.message || "Server error fetching order attachments" }, { status: 500 });
    }
}
