// Server-only helper for the Klever_SiteLogin GraphQL API.
import type { SiteLoginAccount } from "./types";

const MAGENTO_GRAPHQL = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "") + "/graphql";

export class SiteLoginError extends Error {
    constructor(message: string, public status = 401) {
        super(message);
    }
}

/**
 * POST a GraphQL operation to Magento. Forwards the browser's cookies (cf_clearance)
 * so Cloudflare treats the server-side call like the user's verified browser.
 * Throws SiteLoginError with the first GraphQL error message.
 */
export async function siteLoginGraphql<T = any>(
    query: string,
    variables: Record<string, unknown>,
    opts: { store: string; token?: string | null; cookies?: string | null },
): Promise<T> {
    const res = await fetch(MAGENTO_GRAPHQL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Store: opts.store,
            ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
            ...(opts.cookies ? { Cookie: opts.cookies } : {}),
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
    });

    const raw = await res.text();
    let json: any;
    try {
        json = JSON.parse(raw);
    } catch {
        console.error("[site-login] non-JSON response:", res.status, raw.slice(0, 200));
        throw new SiteLoginError("Login service unavailable", 502);
    }
    if (Array.isArray(json?.errors) && json.errors.length > 0) {
        console.error("[site-login] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
        throw new SiteLoginError(json.errors[0]?.message || "Login failed", 401);
    }
    return json?.data as T;
}

/** Keep only well-formed accounts (backend may return nulls in a list). */
export function cleanAccounts(list: unknown): SiteLoginAccount[] {
    return Array.isArray(list)
        ? list.filter((a: any) => a && Number.isInteger(a.account_id))
        : [];
}
