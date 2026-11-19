import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_STATEMENT_TYPES_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// GET — statement types (GraphQL: kleverStatementTypes) → array of { code, label }
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: toStoreCode(getLocaleFromRequest(request), request),
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query: KLEVER_STATEMENT_TYPES_QUERY }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("[my-statement-types] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            const err = json.errors[0];
            const unauthorized = err?.extensions?.category === "graphql-authorization";
            return NextResponse.json({ message: err?.message || null }, { status: unauthorized ? 401 : 502 });
        }
        // Preserve the existing REST shape: array of { code, label }.
        return NextResponse.json(json?.data?.kleverStatementTypes ?? []);
    } catch (error: any) {
        console.error("[my-statement-types] Catch error:", error);
        return NextResponse.json({ message: null }, { status: 500 });
    }
}
