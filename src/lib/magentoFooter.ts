// Footer of the selected website + language, read from the Magento storefront of that
// store view — the same footer Magento shows (e.g. pro.btire.com/roya_en/contact).
//
// Nothing about any website is hardcoded:
//   1. kleverMenuItems (Store header) gives this store view's storefront URLs.
//   2. The first public one (HTTP 200, no login redirect) is loaded and its
//      <footer class="page-footer"> is read: emails, phone numbers, social links,
//      copyright — only the parts Magento actually shows (hidden / commented-out
//      parts of the theme are skipped).
// If Magento has no readable footer for the store view → null (no contact section;
// never another website's details).

import { graphqlFetch } from "@/src/lib/graphqlFetch";
import { KLEVER_MENU_ITEMS_QUERY } from "@/src/graphql/queries";

export interface FooterLink {
    href: string;
    label: string;
}

export interface FooterSocial extends FooterLink {
    /** Network from the URL host (facebook, instagram, twitter, linkedin, …) — used only to pick an icon. */
    network: string;
}

export interface FooterData {
    emails: FooterLink[];
    phones: FooterLink[];
    socials: FooterSocial[];
    copyright: string | null;
    /** Storefront page the footer was read from. */
    source: string;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&", nbsp: " ", copy: "©" };
const decodeEntities = (s: string) => s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Cloudflare e-mail obfuscation (data-cfemail="…") → plain address. */
function decodeCfEmail(hex: string): string {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
}

/** Remove every element styled display:none (with its children) — the theme hides some blocks that way. */
function dropHidden(html: string): string {
    const open = /<([a-z0-9]+)\b[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>/i;
    let m: RegExpExecArray | null;
    while ((m = open.exec(html))) {
        const tagName = m[1].toLowerCase();
        const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
        tags.lastIndex = m.index;
        let depth = 0;
        let t: RegExpExecArray | null;
        let end = -1;
        while ((t = tags.exec(html))) {
            depth += t[0][1] === "/" ? -1 : 1;
            if (depth === 0) { end = tags.lastIndex; break; }
        }
        if (end < 0) break;
        html = html.slice(0, m.index) + html.slice(end);
    }
    return html;
}

function networkOf(url: string): string {
    try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (host === "x.com" || host.endsWith(".x.com")) return "twitter";
        if (host === "wa.me") return "whatsapp";
        return host.split(".").slice(-2, -1)[0] || "link";
    } catch {
        return "link";
    }
}

export function parseStorefrontFooter(footerHtml: string, pageUrl: string): FooterData {
    const html = dropHidden(footerHtml.replace(/<!--[\s\S]*?-->/g, ""));
    const ownHost = (() => { try { return new URL(pageUrl).hostname; } catch { return ""; } })();
    const emails: FooterLink[] = [];
    const phones: FooterLink[] = [];
    const socials: FooterSocial[] = [];
    const seen = new Set<string>();
    const add = <T extends FooterLink>(list: T[], item: T) => {
        if (seen.has(item.href)) return;
        seen.add(item.href);
        list.push(item);
    };

    for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const href = decodeEntities((m[1].match(/\shref=["']([^"']*)["']/i)?.[1] || "").trim());
        const cf = m[2].match(/data-cfemail=["']([0-9a-f]+)["']/i)?.[1] || href.match(/email-protection#([0-9a-f]+)/i)?.[1];
        if (cf) {
            const address = decodeCfEmail(cf);
            if (address.includes("@")) add(emails, { href: `mailto:${address}`, label: address });
        } else if (/^mailto:/i.test(href)) {
            const address = href.replace(/^mailto:/i, "").split("?")[0];
            if (address) add(emails, { href: `mailto:${address}`, label: text(m[2]) || address });
        } else if (/^tel:/i.test(href)) {
            const number = href.replace(/^tel:/i, "");
            if (number) add(phones, { href: `tel:${number}`, label: text(m[2]) || number });
        } else if (/^https?:\/\//i.test(href)) {
            let host = "";
            try { host = new URL(href).hostname; } catch { /* ignore */ }
            // Links to the storefront itself are page links (policies), not social links.
            if (host && host !== ownHost) {
                add(socials, { href, label: text(m[2]) || networkOf(href), network: networkOf(href) });
            }
        }
    }

    // Copyright: an element with class "copyright", else a plain <li><span>…</span></li> line.
    const copyrightHtml =
        html.match(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\bcopyright\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i)?.[2]
        ?? html.match(/<li>\s*<span>([\s\S]*?)<\/span>\s*<\/li>/i)?.[1];
    const copyright = copyrightHtml ? text(copyrightHtml) || null : null;

    return { emails, phones, socials, copyright, source: pageUrl };
}

/** Footer of a store view's Magento storefront, or null if none can be read. */
export async function getFooterData(store: string): Promise<FooterData | null> {
    let urls: string[] = [];
    try {
        const data = await graphqlFetch<{ kleverMenuItems: { url: string | null; sort_order: number | null }[] | null }>({
            query: KLEVER_MENU_ITEMS_QUERY, store,
        });
        urls = (data.kleverMenuItems || [])
            .filter((m) => m?.url && /^https?:\/\//i.test(m.url))
            .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
            .map((m) => m.url as string);
    } catch (err: any) {
        console.warn(`[footer] ${store}: Magento menu unavailable:`, err?.message || err);
        return null;
    }

    for (const url of urls) {
        try {
            const res = await fetch(url, {
                headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; BTireFrontend)" },
                redirect: "manual", // pages that redirect to login are skipped
                cache: "no-store",
            });
            if (res.status !== 200) continue;
            const page = await res.text();
            const footer = page.match(/<footer\b[^>]*class=["'][^"']*\bpage-footer\b[^"']*["'][^>]*>[\s\S]*?<\/footer>/i)?.[0];
            if (footer) return parseStorefrontFooter(footer, url);
        } catch {
            // try the next storefront page
        }
    }
    console.warn(`[footer] ${store}: no public Magento storefront page with a footer`);
    return null;
}
