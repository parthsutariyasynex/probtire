import { NextRequest, NextResponse } from "next/server";
import { getRequestToken } from "@/lib/api/auth-helper";
import { getLocaleFromRequest } from "@/lib/api/magento-url";
// Commented out — kleverTyreSizeRim resolver is not available on the current backend.
// import { KLEVER_TYRE_SIZE_RIM_QUERY } from "@/src/graphql/queries";
import { STANDARD_TYRE_SIZE_AGGREGATION_QUERY } from "@/src/graphql/queries";

// Tyre-size rim options via standard Magento products aggregations.
// Replaces the missing kleverTyreSizeRim resolver.
// Accepts optional ?width= and ?height= params to cascade.
// Response shape kept the same: { status, options: [{ value, label }] }.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { body: any; expires: number }>();

export async function GET(request: NextRequest) {
    const token = await getRequestToken(request);
    const locale = getLocaleFromRequest(request);
    const { searchParams } = new URL(request.url);
    const width = searchParams.get("width") || "";
    const height = searchParams.get("height") || "";

    const now = Date.now();
    const cacheKey = `${locale}|${width}|${height}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > now) {
        return NextResponse.json(cached.body, { headers: { "X-Cache": "HIT" } });
    }

    try {
        const domain = process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "https://altalayi-live.btire.com";

        // Old klever query — resolver doesn't exist on this backend
        // const res = await fetch(`${domain}/graphql`, {
        //     ...headers,
        //     body: JSON.stringify({ query: KLEVER_TYRE_SIZE_RIM_QUERY, variables }),
        // });
        // const raw = json?.data?.kleverTyreSizeRim;

        const variables: Record<string, any> = {};
        if (width) variables.width = { eq: width };
        if (height) variables.height = { eq: height };

        const res = await fetch(`${domain}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Store: locale,
                ...(token && token !== "null" && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({
                query: STANDARD_TYRE_SIZE_AGGREGATION_QUERY,
                variables,
            }),
            cache: "no-store",
        });

        const json = await res.json();
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
            console.error("[tyre-size/rim] GraphQL error:", JSON.stringify(json.errors).slice(0, 300));
            return NextResponse.json({ status: "error", options: [] }, { status: 502 });
        }

        const aggregations = json?.data?.products?.aggregations || [];
        const rimAgg = aggregations.find((a: any) => a.attribute_code === "rim");
        const options = (rimAgg?.options || []).map((o: any) => ({ value: o.label, label: o.label }));

        const body = { status: "success", options };
        cache.set(cacheKey, { body, expires: now + CACHE_TTL_MS });
        return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
    } catch (err: any) {
        console.error("[tyre-size/rim] Fetch exception:", err?.message);
        return NextResponse.json(
            { status: "error", options: [], message: err?.message || "Fetch failed" },
            { status: 500 }
        );
    }
}
