import type { Metadata } from "next";
import { graphqlFetch } from "@/src/lib/graphqlFetch";
import { CMS_META_QUERY } from "@/src/graphql/queries";
import { getCurrentStoreConfig, type StoreConfig } from "@/lib/store/store-config";
import { isValidLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import enDict from "@/public/locales/en.json";
import arDict from "@/public/locales/ar.json";

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

// ── Custom pages not backed by a Magento CMS page ─────────────────────────────
// Page names are translated via public/locales/{lang}.json ("meta.<key>"); the site
// name / description / keywords come from Magento storeConfig of the selected website
// and language. Nothing about a website is hardcoded here.
const STATIC_PAGES = [
  "login", "products", "cart", "checkout", "checkout-success",
  "multishipping", "multishipping-shipping", "multishipping-billing", "multishipping-review", "multishipping-success",
  "my-account", "my-statement", "manage-accounts", "my-orders", "order-attachments",
  "favourites", "address-book", "dashboard", "my-forecast", "notifications",
] as const;
type StaticPageKey = (typeof STATIC_PAGES)[number];

// Pages whose title has historically carried the site name ("Shipping Method - <site>").
const TITLE_WITH_SITE_NAME = new Set<string>(["multishipping-shipping", "multishipping-billing"]);

const DICTIONARIES: Record<Locale, Record<string, string>> = { en: enDict, ar: arDict };

function pageName(key: string, lang: Locale): string | null {
  return DICTIONARIES[lang][`meta.${key}`] ?? null;
}

/** Locale + Magento store config of the current request. */
async function currentStore(): Promise<{ lang: Locale; config: StoreConfig | null }> {
  const config = await getCurrentStoreConfig();
  const fromConfig = config?.locale?.slice(0, 2);
  const lang: Locale = fromConfig && isValidLocale(fromConfig) ? fromConfig : defaultLocale;
  return { lang, config };
}

/** Apply Magento's title prefix/suffix (Content > Design > HTML Head). */
function decorateTitle(title: string, config: StoreConfig | null): string {
  const prefix = config?.title_prefix ? `${config.title_prefix} ` : "";
  const suffix = config?.title_suffix ? ` ${config.title_suffix}` : "";
  return `${prefix}${title}${suffix}`;
}

// ── Internal: fetch CMS page metadata from Magento ───────────────────────────
// Returns null if the page is not found or on any network/GraphQL error.
// Uses cache: "no-store" so Magento Admin changes reflect immediately.

async function fetchCmsPageMeta(identifier: string, store: string): Promise<RawMeta | null> {
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

function buildMetadata(meta: RawMeta, config: StoreConfig | null): Metadata {
  const title = meta.title ? decorateTitle(meta.title, config) : undefined;
  const siteName = config?.default_title || undefined;

  const result: Metadata = {
    ...(title ? { title } : {}),
    openGraph: {
      ...(title ? { title } : {}),
      ...(siteName ? { siteName } : {}),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      ...(title ? { title } : {}),
    },
    robots: {
      index: true,
      follow: true,
    },
  };

  if (meta.description) {
    result.description = meta.description;
    (result.openGraph as Record<string, unknown>).description = meta.description;
    (result.twitter as Record<string, unknown>).description = meta.description;
  }

  if (meta.keywords) {
    result.keywords = meta.keywords;
  }

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Metadata of a Magento CMS page (by URL key) for the selected website + language —
 * exactly what Magento has (cmsPage meta_title/title, meta_description, meta_keywords).
 * No page in Magento → no page-specific metadata (the root layout's site title applies).
 *
 * Usage (in a Server Component layout):
 *   export async function generateMetadata(): Promise<Metadata> {
 *     return getCmsMetadata("about-us");
 *   }
 */
export async function getCmsMetadata(identifier: string): Promise<Metadata> {
  const { config } = await currentStore();
  const raw = config?.store_code ? await fetchCmsPageMeta(identifier, config.store_code) : null;
  return raw ? buildMetadata(raw, config) : {};
}

/**
 * Metadata for custom pages (login, cart, checkout, …) that have no Magento CMS page:
 * the page name from public/locales/{lang}.json ("meta.<key>").
 *
 * Usage (in a Server Component layout):
 *   export async function generateMetadata(): Promise<Metadata> {
 *     return getStaticMetadata("login");
 *   }
 */
export async function getStaticMetadata(key: StaticPageKey): Promise<Metadata> {
  const { lang, config } = await currentStore();
  const name = pageName(key, lang);
  const title = name && TITLE_WITH_SITE_NAME.has(key) && config?.default_title ? `${name} - ${config.default_title}` : name;
  return title ? buildMetadata({ title }, config) : {};
}

/** Root layout: the selected website's title, description and keywords from Magento storeConfig. */
export async function getSiteMetadata(): Promise<Metadata> {
  const { config } = await currentStore();
  return buildMetadata({
    title: config?.default_title,
    description: config?.default_description,
    keywords: config?.default_keywords,
  }, config);
}
