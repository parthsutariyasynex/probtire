import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { isValidLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import { GENERATE_CUSTOMER_TOKEN_MUTATION } from "@/src/graphql/mutations";
import { CUSTOMER_QUERY } from "@/src/graphql/queries";
import { KLEVER_SITE_LOGIN_SELECT_MUTATION, KLEVER_SITE_LOGIN_SWITCH_MUTATION } from "@/src/graphql/mutations";
import { siteLoginGraphql } from "@/lib/site-login/server";
import { toStoreCode } from "@/lib/store/website";

/**
 * Resolve the Magento GraphQL endpoint (locale is selected via the `Store` header).
 */
function getMagentoGraphqlUrl(): string {
    const domain = process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "";
    return `${domain}/graphql`;
}


/** 
 * Decode a Magento JWT token to read its expiry time.
...
 * Returns the `exp` timestamp (seconds) or null if unreadable.
 */
function getMagentoTokenExpiry(token: string): number | null {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(
            Buffer.from(parts[1], "base64").toString("utf-8")
        );
        return payload.exp || null;
    } catch {
        return null;
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Magento",
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials, req) {
                if (!credentials) return null;

                const isOtp = !!(credentials as any).otp;
                // Read locale from credentials (passed from login form)
                const credLocale = (credentials as any).locale;
                const locale: Locale = credLocale && isValidLocale(credLocale) ? credLocale : defaultLocale;

                // Forward browser cookies (especially cf_clearance) so Cloudflare WAF
                // treats server-side Magento requests as coming from a verified browser.
                const browserCookies = (req as any)?.headers?.cookie || "";
                // Store view of the selected website for this language (from the
                // `selected_store` cookie, filled from the Site Login API). Customers are
                // scoped per website, so the wrong store view rejects valid credentials.
                const storeCode = toStoreCode(locale, browserCookies);

                // ── Site Login step 2 → kleverSiteLoginSelect(login_key, account_id) ──
                // The login page already verified email/password or mobile/OTP
                // (/api/kleverapi/site-login/verify) and the customer picked a website.
                const loginKey = (credentials as any).login_key;
                const accountId = Number((credentials as any).account_id);
                if (loginKey && Number.isInteger(accountId)) {
                    const requested = String((credentials as any).store_code || "");
                    const selectStore = /^[a-z0-9_]+$/i.test(requested) ? requested : storeCode;
                    try {
                        const data = await siteLoginGraphql(
                            KLEVER_SITE_LOGIN_SELECT_MUTATION,
                            { login_key: String(loginKey), account_id: accountId },
                            { store: selectStore, cookies: browserCookies },
                        );
                        const result = data?.kleverSiteLoginSelect;
                        if (!result?.token) {
                            console.error("Auth (SiteLogin): no token from kleverSiteLoginSelect");
                            return null;
                        }
                        const account = result.account || {};
                        return {
                            id: String(account.account_id ?? accountId),
                            email: (credentials as any).email || "",
                            name: account.name || (credentials as any).email || "",
                            token: String(result.token).trim(),
                            storeCode: account.store_code || selectStore,
                        } as any;
                    } catch (error) {
                        console.error("Auth (SiteLogin) error:", error);
                        return null;
                    }
                }

                // ── Password login → GraphQL generateCustomerToken ──
                // The host's WAF may block server-side requests. Forwarding the user's
                // browser cookies (cf_clearance) bypasses the Cloudflare challenge.
                if (!isOtp) {
                    try {
                        const res = await fetch(getMagentoGraphqlUrl(), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Store: storeCode,
                                ...(browserCookies ? { Cookie: browserCookies } : {}),
                            },
                            body: JSON.stringify({
                                query: GENERATE_CUSTOMER_TOKEN_MUTATION,
                                variables: {
                                    email: (credentials as any).email,
                                    password: (credentials as any).password,
                                },
                            }),
                        });
                        const rawText = await res.text();
                        let json: any;
                        try {
                            json = JSON.parse(rawText);
                        } catch {
                            console.error("Auth: non-JSON response from Magento:", res.status, rawText.slice(0, 300));
                            return null;
                        }
                        if (Array.isArray(json?.errors) && json.errors.length > 0) {
                            console.error("Auth (GraphQL) error:", JSON.stringify(json.errors).slice(0, 150));
                            return null;
                        }
                        const token = json?.data?.generateCustomerToken?.token;
                        if (!token) {
                            console.error("Auth: no token from generateCustomerToken");
                            return null;
                        }

                        // Fetch the customer's real name (native customer query — works via
                        // /graphql even when REST /my-account is WAF-blocked) so the session
                        // shows the name, not the email. Falls back to email on any failure.
                        let displayName = (credentials as any).email || "";
                        try {
                            const meRes = await fetch(getMagentoGraphqlUrl(), {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Store: storeCode,
                                    Authorization: `Bearer ${token}`,
                                    ...(browserCookies ? { Cookie: browserCookies } : {}),
                                },
                                body: JSON.stringify({ query: CUSTOMER_QUERY }),
                            });
                            const meText = await meRes.text();
                            const meJson = JSON.parse(meText);
                            const c = meJson?.data?.customer;
                            const full = `${c?.firstname || ""} ${c?.lastname || ""}`.trim();
                            if (full) displayName = full;
                        } catch { /* keep email fallback */ }

                        return {
                            id: (credentials as any).email,
                            email: (credentials as any).email || "",
                            name: displayName,
                            token: String(token).trim(),
                        };
                    } catch (error) {
                        console.error("Auth (GraphQL) error:", error);
                        return null;
                    }
                }

                // ── OTP login → REST /login/otp ──
                const url = `${process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || ""}/rest/${storeCode}/V1/kleverapi/login/otp`;
                const body = {
                    mobile: (credentials as any).mobile,
                    otp: (credentials as any).otp,
                    countryCode: (credentials as any).countryCode,
                };

                try {
                    const res = await fetch(url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            platform: "web",
                            ...(browserCookies ? { Cookie: browserCookies } : {}),
                        },
                        body: JSON.stringify(body),
                    });

                    // Defensive parse: the upstream may return non-JSON (nginx/Cloudflare HTML
                    // or an empty body) — yield a clean auth failure instead of a SyntaxError.
                    const rawText = await res.text();
                    let data: any = null;
                    try {
                        data = rawText ? JSON.parse(rawText) : null;
                    } catch {
                        console.error("Auth: non-JSON OTP response", res.status, rawText.slice(0, 200));
                        return null;
                    }

                    if (res.ok && data) {
                        const token = data.token || (data.customer && data.customer.token);
                        if (!token) {
                            console.error("No token found in OTP response.");
                            return null;
                        }
                        return {
                            id: (credentials as any).email || (credentials as any).mobile,
                            email: (credentials as any).email || "",
                            name: (credentials as any).email || (credentials as any).mobile,
                            token: String(token).trim(),
                        };
                    }
                    return null;
                } catch (error) {
                    console.error("Auth Error (OTP):", error);
                    return null;
                }
            },
        }),
    ],
    callbacks: {
        async redirect({ url, baseUrl }) {
            console.log("NEXTAUTH REDIRECT:", url);

            if (url.startsWith("/")) return `${baseUrl}${url}`;
            try {
                const parsed = new URL(url);
                // Trust any localhost port — dev server may run on a dynamic port
                if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
                    return url;
                }
                if (parsed.origin === new URL(baseUrl).origin) return url;
            } catch { }
            return baseUrl;
        },
        async jwt({ token, user, trigger, session }) {
            // Website switch — useSession().update({ switchAccountId }) from /select-website.
            // Done server-side with the current Bearer token so the client never sets a token.
            if (trigger === "update" && session?.switchAccountId && token.accessToken) {
                const accountId = Number(session.switchAccountId);
                if (Number.isInteger(accountId)) {
                    try {
                        const data = await siteLoginGraphql(
                            KLEVER_SITE_LOGIN_SWITCH_MUTATION,
                            { account_id: accountId },
                            { store: String(token.storeCode || defaultLocale), token: String(token.accessToken) },
                        );
                        const result = data?.kleverSiteLoginSwitch;
                        if (result?.token) {
                            token.accessToken = String(result.token).trim();
                            token.storeCode = result.account?.store_code || token.storeCode;
                            if (result.account?.name) token.name = result.account.name;
                            token.error = undefined;
                            const exp = getMagentoTokenExpiry(token.accessToken as string);
                            if (exp) token.magentoTokenExp = exp; else delete token.magentoTokenExp;
                        }
                    } catch (error) {
                        console.error("[JWT] kleverSiteLoginSwitch failed:", error);
                    }
                }
            }

            // First login — save the Magento token
            if (user) {
                token.storeCode = (user as any).storeCode;
                token.accessToken = (user as any).token;
                // Store the Magento token expiry so we can detect when it expires
                const exp = getMagentoTokenExpiry((user as any).token);
                if (exp) {
                    token.magentoTokenExp = exp;
                }
            }

            // Check if the Magento token has expired
            if (token.magentoTokenExp) {
                const now = Math.floor(Date.now() / 1000);
                if (now >= (token.magentoTokenExp as number)) {
                    console.warn(`[JWT] MagentoTokenExpired — now=${now} exp=${token.magentoTokenExp} delta=${now - (token.magentoTokenExp as number)}s`);
                    token.accessToken = undefined;
                    token.error = "MagentoTokenExpired";
                }
            }

            return token;
        },
        async session({ session, token }) {
            (session as any).accessToken = token.accessToken;
            (session as any).error = token.error;
            (session as any).storeCode = token.storeCode;
            return session;
        },
    },
    events: {
        signOut: async ({ token }: any) => {
            console.warn(`[SIGNOUT EVENT] accessToken=${!!token?.accessToken} error=${token?.error} exp=${token?.magentoTokenExp}`);
        },
    },
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
    },
    secret: process.env.NEXTAUTH_SECRET || "yoursecret",
};
