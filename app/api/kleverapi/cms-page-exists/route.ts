import { NextRequest, NextResponse } from "next/server";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
import { toStoreCode } from "@/lib/store/website";
import { graphqlFetch, isGraphQLRequestError } from "@/src/lib/graphqlFetch";

// Does the selected website + language have this Magento CMS page?
// Used to show links (e.g. the sidebar "User Guides" button) only where Magento has the page.
//   GET /api/kleverapi/cms-page-exists?identifier=user-guides → { store, identifier, exists }

const QUERY = /* GraphQL */ `
  query CmsPageExists($identifier: String!) {
    cmsPage(identifier: $identifier) { identifier }
  }
`;

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { exists: boolean; expires: number }>();

export async function GET(request: NextRequest) {
    const identifier = new URL(request.url).searchParams.get("identifier") || "";
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(identifier)) {
        return NextResponse.json({ error: "identifier is required" }, { status: 400 });
    }
    const store = toStoreCode(getLocaleFromRequest(request), request);
    const key = `${store}|${identifier}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
        return NextResponse.json({ store, identifier, exists: hit.exists }, { headers: { "X-Cache": "HIT" } });
    }
    try {
        await graphqlFetch({ query: QUERY, variables: { identifier }, store });
        cache.set(key, { exists: true, expires: Date.now() + CACHE_TTL_MS });
        return NextResponse.json({ store, identifier, exists: true });
    } catch (err) {
        const notFound = isGraphQLRequestError(err)
            && err.errors.some((e: any) => e?.extensions?.category === "graphql-no-such-entity");
        if (notFound) {
            cache.set(key, { exists: false, expires: Date.now() + CACHE_TTL_MS });
            return NextResponse.json({ store, identifier, exists: false });
        }
        console.error(`[cms-page-exists] ${store}/${identifier}:`, (err as any)?.message);
        return NextResponse.json({ error: "Magento unavailable" }, { status: 502 });
    }
}
