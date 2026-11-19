import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_CUSTOMER_TARGET_DASHBOARD_QUERY } from "@/src/graphql/queries";
import { toStoreCode } from "@/lib/store/website";
import { getMagentoDashboardCompare } from "@/src/lib/magentoOrderView";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// GET — customer target dashboard (GraphQL: kleverCustomerTargetDashboard)
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const searchYear = searchParams.get("searchYear");
        const compareYear = searchParams.get("compareYear");

        // ?view=compare — Magento's own Dashboard compare box and compare tables (years, texts and
        // quantities exactly as Magento's page shows them for this login and store view).
        if (searchParams.get("view") === "compare") {
            const data = await getMagentoDashboardCompare(
                toStoreCode(getLocaleFromRequest(request), request), `Bearer ${token}`,
                searchYear || undefined, compareYear || undefined,
            );
            if (!data) return NextResponse.json({ message: "Magento's Dashboard page could not be read." }, { status: 502 });
            return NextResponse.json(data);
        }
        const variables: Record<string, number> = {};
        if (searchYear) variables.searchYear = parseInt(searchYear, 10);
        if (compareYear) variables.compareYear = parseInt(compareYear, 10);

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: toStoreCode(getLocaleFromRequest(request), request),
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ query: KLEVER_CUSTOMER_TARGET_DASHBOARD_QUERY, variables }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("[dashboard] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ message: "Magento GraphQL error", details: json.errors }, { status: 502 });
        }
        // Preserve the existing REST shape: dashboard fields at the top level.
        return NextResponse.json(json?.data?.kleverCustomerTargetDashboard ?? {});
    } catch (error: any) {
        console.error("[dashboard] Error:", error.message);
        return NextResponse.json({ message: "Internal Server Error", error: error.message }, { status: 500 });
    }
}
