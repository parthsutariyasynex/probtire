import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { getRequestToken } from "@/lib/api/auth-helper";
import { toStoreCode } from "@/lib/store/website";
import { KLEVER_SITE_LOGIN_ACCOUNTS_QUERY } from "@/src/graphql/mutations";
import { siteLoginGraphql, cleanAccounts, SiteLoginError } from "@/lib/site-login/server";

// GET — websites the logged-in customer can switch to (GraphQL: kleverSiteLoginAccounts).
// Own account first. Empty list = only one website.
export async function GET(request: NextRequest) {
    try {
        const token = await getRequestToken(request);
        if (!token) return NextResponse.json({ accounts: [] }, { status: 401 });

        const data = await siteLoginGraphql(KLEVER_SITE_LOGIN_ACCOUNTS_QUERY, {}, {
            store: toStoreCode(getLocaleFromRequest(request), request),
            token,
            cookies: request.headers.get("cookie"),
        });
        return NextResponse.json({ accounts: cleanAccounts(data?.kleverSiteLoginAccounts) });
    } catch (error: any) {
        const status = error instanceof SiteLoginError ? error.status : 500;
        return NextResponse.json({ accounts: [], message: error?.message }, { status });
    }
}
