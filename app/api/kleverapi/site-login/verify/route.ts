import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { KLEVER_SITE_LOGIN_VERIFY_MUTATION } from "@/src/graphql/mutations";
import { siteLoginGraphql, cleanAccounts, SiteLoginError } from "@/lib/site-login/server";

// POST — Site Login step 1 (GraphQL: kleverSiteLoginVerify).
// Body: { email, password } or { mobile, countryCode, otp }, optional { lang }.
// Returns { login_key, accounts[] }. The login_key is then exchanged for a token by
// NextAuth (authorize → kleverSiteLoginSelect), so the password/OTP is used only once.
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const lang = body?.lang === "ar" || body?.lang === "en" ? body.lang : getLocaleFromRequest(request);

        const isOtp = !!body?.otp;
        const input = isOtp
            ? { mobile: body?.mobile, country_code: body?.countryCode || body?.country_code, otp: body?.otp, lang }
            : { email: body?.email || body?.username, password: body?.password, lang };

        if (isOtp ? !input.mobile || !(input as any).otp : !(input as any).email || !(input as any).password) {
            return NextResponse.json({ message: "Missing login details" }, { status: 400 });
        }

        const data = await siteLoginGraphql(KLEVER_SITE_LOGIN_VERIFY_MUTATION, { input }, {
            // Verify checks every website — the Store header only sets the default language.
            store: lang,
            cookies: request.headers.get("cookie"),
        });

        const result = data?.kleverSiteLoginVerify;
        const accounts = cleanAccounts(result?.accounts);
        if (!result?.login_key || accounts.length === 0) {
            return NextResponse.json({ message: "Login failed" }, { status: 401 });
        }
        return NextResponse.json({ login_key: result.login_key, accounts });
    } catch (error: any) {
        const status = error instanceof SiteLoginError ? error.status : 500;
        return NextResponse.json({ message: error?.message || "Login failed" }, { status });
    }
}
