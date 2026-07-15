import type { Metadata } from "next";
import { graphqlFetch } from "@/src/lib/graphqlFetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawMeta {
  title?: string | null;
  description?: string | null;
  keywords?: string | null;
}

interface CmsPageMetaData {
  cmsPage: {
    title: string | null;
    meta_title: string | null;
    meta_description: string | null;
    meta_keywords: string | null;
  } | null;
}

// ── GraphQL query — meta fields only, no CMS content ─────────────────────────

const CMS_META_QUERY = /* GraphQL */ `
  query GetCmsPageMeta($identifier: String!) {
    cmsPage(identifier: $identifier) {
      title
      meta_title
      meta_description
      meta_keywords
    }
  }
`;

// ── Fallbacks for custom pages not backed by a Magento CMS page ───────────────
// These are used when Magento does not return metadata for the given route.

const CUSTOM_FALLBACKS: Record<string, RawMeta> = {
  // Auth
  login: { title: "Customer Login" },
  // Shop
  products: { title: "ATCL B2B" },
  cart: { title: "Shopping Cart" },
  checkout: { title: "Checkout" },
  "checkout-success": { title: "Success Page" },
  // Multi-shipping
  multishipping: { title: "Ship to Multiple Addresses" },
  "multishipping-shipping": { title: "Shipping Method - ATCL B2B" },
  "multishipping-billing": { title: "Billing Information - ATCL B2B" },
  "multishipping-review": { title: "Review Order" },
  "multishipping-success": { title: "Success Page" },
  // Account
  "my-account": { title: "My Account" },
  "my-statement": { title: "My Statement" },
  "manage-accounts": { title: "Manage Accounts" },
  "my-orders": { title: "My Orders" },
  "order-attachments": { title: "My Order Attachments" },
  favourites: { title: "Favourite Products" },
  "address-book": { title: "Address Book" },
  dashboard: { title: "Dashboard" },
  "my-forecast": { title: "My Forecast" },
  notifications: { title: "Notifications" },
};

// ── Internal: fetch CMS page metadata from Magento ───────────────────────────
// Returns null if the page is not found or on any network/GraphQL error.
// Uses cache: "no-store" so Magento Admin changes reflect immediately.

async function fetchCmsPageMeta(identifier: string, store = "en"): Promise<RawMeta | null> {
  try {
    const data = await graphqlFetch<CmsPageMetaData>({
      query: CMS_META_QUERY,
      variables: { identifier },
      store,
      cache: "no-store",
    });
    const page = data?.cmsPage;
    if (!page) return null;
    return {
      title: page.meta_title || page.title || null,
      description: page.meta_description || null,
      keywords: page.meta_keywords || null,
    };
  } catch {
    return null;
  }
}

// ── Internal: build Next.js Metadata from raw + fallback ─────────────────────

function buildMetadata(raw: RawMeta | null, fallback: RawMeta): Metadata {
  const title = raw?.title || fallback.title || "Altalayi";
  const description = raw?.description || fallback.description || undefined;
  const keywords = raw?.keywords || fallback.keywords || undefined;

  const meta: Metadata = {
    title,
    openGraph: {
      title,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
    },
    robots: {
      index: true,
      follow: true,
    },
  };

  if (description) {
    meta.description = description;
    (meta.openGraph as Record<string, unknown>).description = description;
    (meta.twitter as Record<string, unknown>).description = description;
  }

  if (keywords) {
    meta.keywords = keywords;
  }

  return meta;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch metadata for a Magento CMS page by its URL key identifier.
 * Falls back to the provided static fallback if the CMS page is unavailable.
 *
 * Usage (in a Server Component layout):
 *   export async function generateMetadata(): Promise<Metadata> {
 *     return getCmsMetadata("about-us", { title: "About Us" });
 *   }
 */
export async function getCmsMetadata(
  identifier: string,
  fallback: RawMeta,
  store = "en"
): Promise<Metadata> {
  const raw = await fetchCmsPageMeta(identifier, store);
  return buildMetadata(raw, fallback);
}

/**
 * Return static fallback metadata for custom pages (login, cart, checkout, etc.).
 * These pages have no dedicated Magento CMS page.
 *
 * Usage (in a Server Component layout):
 *   export const metadata: Metadata = getStaticMetadata("login");
 */
export function getStaticMetadata(key: keyof typeof CUSTOM_FALLBACKS): Metadata {
  return buildMetadata(null, CUSTOM_FALLBACKS[key] ?? { title: "Altalayi" });
}
