import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { KLEVER_LOGIN_AS_SUBACCOUNT_MUTATION, KLEVER_LOGIN_AS_SALESPERSON_ACCOUNT_MUTATION } from "@/src/graphql/mutations";
import { toStoreCode } from "@/lib/store/website";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

// POST — log in as / impersonate an account.
// ?type=sales_person → kleverLoginAsSalespersonAccount (Sales Person role, variable: customerId)
// default             → kleverLoginAsSubaccount (Master Company role, variable: subaccountId)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ message: "Authorization required" }, { status: 401 });

        const { id } = await params;
        const accountId = parseInt(id, 10);
        if (Number.isNaN(accountId)) {
            return NextResponse.json({ message: "Invalid account id" }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const isSalesPerson = searchParams.get("type") === "sales_person";

        const res = await fetch(MAGENTO_GRAPHQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: toStoreCode(getLocaleFromRequest(request), request),
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(
                isSalesPerson
                    ? { query: KLEVER_LOGIN_AS_SALESPERSON_ACCOUNT_MUTATION, variables: { customerId: accountId } }
                    : { query: KLEVER_LOGIN_AS_SUBACCOUNT_MUTATION, variables: { subaccountId: accountId } }
            ),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("[subaccounts/:id/login] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ message: json.errors[0]?.message || "Failed to log in as account" }, { status: 400 });
        }

        return NextResponse.json(
            isSalesPerson
                ? (json?.data?.kleverLoginAsSalespersonAccount ?? {})
                : (json?.data?.kleverLoginAsSubaccount ?? {})
        );
    } catch (error: any) {
        console.error("[subaccounts/:id/login] error:", error.message);
        return NextResponse.json({ message: "Server-side error logging into account." }, { status: 500 });
    }
}
