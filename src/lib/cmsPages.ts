// Content pages (About Us, User Guides, Product Catalogue) read from the Magento CMS
// page of the selected website + language (Store header). Each website keeps its own
// pages in Magento; nothing is hardcoded, and a store without the page gets `null`
// (the page then shows "content not available" — never another website's content).

import { graphqlFetch } from "@/src/lib/graphqlFetch";
import { CMS_PAGE_CONTENT_QUERY } from "@/src/graphql/queries";

export interface CmsBanner {
    desktop: string;
    mobile: string | null;
}

export interface AboutPage {
    title: string;
    banner: CmsBanner | null;
    /** Sanitized HTML of the text block (p, headings, lists, links only). */
    bodyHtml: string;
}

export interface GuideItem {
    id: string;
    title: string;
    image: string | null;
    videoTitle: string;
    videoUrl: string | null;
}

export interface GuidesPage {
    title: string;
    banner: CmsBanner | null;
    items: GuideItem[];
}

export interface CatalogueItem {
    href: string;
    image: string | null;
    title: string;
    subtitle: string;
}

export interface CataloguePage {
    title: string;
    banner: CmsBanner | null;
    items: CatalogueItem[];
}

// ── Magento fetch ─────────────────────────────────────────────────────────────


interface RawCmsPage {
    title: string | null;
    content_heading: string | null;
    content: string | null;
}

async function fetchCmsPage(identifier: string, store: string): Promise<{ html: string; heading: string } | null> {
    try {
        const data = await graphqlFetch<{ cmsPage: RawCmsPage | null }>({
            query: CMS_PAGE_CONTENT_QUERY,
            variables: { identifier },
            store,
            cache: "no-store",
        });
        const page = data?.cmsPage;
        if (!page?.content) return null;
        return { html: normalize(page.content), heading: page.content_heading || page.title || "" };
    } catch (err: any) {
        console.warn(`[cms] "${identifier}" not available for ${store}:`, err?.message || err);
        return null;
    }
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&", nbsp: " " };

function decodeEntities(html: string): string {
    return html
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Page Builder stores the HTML block escaped (&lt;div&gt;…): decode it and drop styles/scripts/SVG icons. */
export function normalize(raw: string): string {
    let html = raw;
    for (let i = 0; i < 2 && /&lt;|&gt;/.test(html); i++) html = decodeEntities(html);
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<svg[\s\S]*?<\/svg>/gi, "");
}

export function text(html: string | undefined): string {
    return decodeEntities((html || "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function attr(tag: string, name: string): string | null {
    return tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, "i"))?.[1] ?? null;
}

/** Real image of an <img>: lazy-loaded `data-src` first, else `src` unless it is a blank placeholder. */
function imageOf(html: string): string | null {
    const img = html.match(/<img\b[^>]*>/i)?.[0];
    if (!img) return null;
    const dataSrc = attr(img, "data-src");
    if (dataSrc) return dataSrc;
    const src = attr(img, "src");
    return src && !/\/blank\.(png|gif|jpe?g)$/i.test(src) ? src : null;
}

function bannerOf(html: string): CmsBanner | null {
    const header = html.match(/class=["'][^"']*\bpage-title\b[^"']*["'][\s\S]*?<\/picture>/i)?.[0] ?? "";
    const sources = [...header.matchAll(/<source\b[^>]*>/gi)].map((m) => m[0]);
    const desktop = sources.find((s) => /min-width/i.test(attr(s, "media") || ""));
    const mobile = sources.find((s) => /max-width/i.test(attr(s, "media") || ""));
    const desktopUrl = (desktop && attr(desktop, "srcset")) || imageOf(header);
    if (!desktopUrl) return null;
    return { desktop: desktopUrl, mobile: (mobile && attr(mobile, "srcset")) || null };
}

function titleOf(html: string, heading: string): string {
    return text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]) || heading;
}

/** Split the content into one chunk per element carrying `className`. */
function blocksOf(html: string, className: string): string[] {
    return html.split(new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`, "i")).slice(1);
}

const ALLOWED_TAGS = new Set(["p", "br", "h2", "h3", "h4", "h5", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a"]);

/** Keep only simple formatting tags (no attributes except a safe http(s)/mailto/tel href). */
function sanitize(html: string): string {
    return html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, name: string) => {
            const lower = name.toLowerCase();
            if (!ALLOWED_TAGS.has(lower)) return "";
            if (tag.startsWith("</")) return `</${lower}>`;
            if (lower === "a") {
                const href = attr(tag, "href");
                return href && /^(https?:|mailto:|tel:)/i.test(href)
                    ? `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">`
                    : "<a>";
            }
            return lower === "br" ? "<br />" : `<${lower}>`;
        })
        .replace(/(<br \/>\s*){2,}/g, "<br />")
        .replace(/>\s+</g, "><")
        .trim();
}

// ── Pages ─────────────────────────────────────────────────────────────────────

/** About Us — Magento CMS page "about-us". */
export async function getAboutPage(store: string): Promise<AboutPage | null> {
    const page = await fetchCmsPage("about-us", store);
    if (!page) return null;
    const { html, heading } = page;
    // Body: the text block if the page uses one, else everything after the title.
    const textBlock = blocksOf(html, "text-block")[0];
    const afterTitle = html.split(/<\/h1>/i).slice(1).join("</h1>");
    const bodyHtml = sanitize(textBlock ? textBlock.replace(/^[^>]*>/, "") : afterTitle);
    if (!text(bodyHtml)) return null;
    return { title: titleOf(html, heading), banner: bannerOf(html), bodyHtml };
}

/** User Guides — Magento CMS page "user-guides" (cards + YouTube video modals). */
export async function getGuidesPage(store: string): Promise<GuidesPage | null> {
    const page = await fetchCmsPage("user-guides", store);
    if (!page) return null;
    const { html, heading } = page;

    // Video modals: <div id="ytVideo001" data-izimodal-title="…" data-izimodal-iframeurl="…">
    const videos = new Map<string, { title: string; url: string | null }>();
    for (const m of html.matchAll(/<div\b[^>]*data-izimodal-iframeurl[^>]*>/gi)) {
        const id = attr(m[0], "id");
        if (id) videos.set(id, { title: text(attr(m[0], "data-izimodal-title") || ""), url: attr(m[0], "data-izimodal-iframeurl") });
    }

    const items: GuideItem[] = blocksOf(html, "video-box").map((block, index) => {
        const opener = block.match(/<a\b[^>]*data-izimodal-open=["']#?([^"']+)["'][^>]*>/i);
        const videoId = opener?.[1] ?? "";
        const video = videos.get(videoId);
        const title = text(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
        return {
            id: videoId || `guide-${index}`,
            title,
            image: imageOf(block),
            videoTitle: video?.title || title,
            videoUrl: video?.url || null,
        };
    }).filter((item) => item.title || item.image);

    if (items.length === 0) return null;
    return { title: titleOf(html, heading), banner: bannerOf(html), items };
}

/** Product Catalogue — Magento CMS page "product-catalogue" (catalogue PDFs + covers). */
export async function getCataloguePage(store: string): Promise<CataloguePage | null> {
    const page = await fetchCmsPage("product-catalogue", store);
    if (!page) return null;
    const { html, heading } = page;
    const items: CatalogueItem[] = [];
    for (const block of blocksOf(html, "video-box")) {
        const href = block.match(/<a\b[^>]*\shref=["']([^"']+)["']/i)?.[1];
        if (!href || /^javascript:/i.test(href)) continue;
        items.push({
            href,
            image: imageOf(block),
            title: text(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]),
            subtitle: text(block.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i)?.[1]),
        });
    }
    if (items.length === 0) return null;
    return { title: titleOf(html, heading), banner: bannerOf(html), items };
}
