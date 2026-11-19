// Order details that only Magento's own order page shows — Customer PO Number, Delivery Date,
// delivery comment and Order Comment (no Magento API returns them). Read server-side from Magento's
// storefront "View Order" page of the logged-in customer, labels and values exactly as Magento
// renders them for the store view:
//
//   1. customer's own account id        — REST /V1/customers/me (customer's Bearer token)
//   2. Magento's one-time login link     — kleverSiteLoginSwitch(account_id).login_url
//   3. open it → Magento storefront session (cookies), cached for SESSION_TTL_MS
//   4. <store>/sales/order/view/order_id/<id>/ → read Magento's blocks
//
// Nothing is guessed: a value Magento's page does not show is null.

import { KLEVER_SITE_LOGIN_URL_MUTATION } from "@/src/graphql/mutations";
import { KLEVER_ORDER_UPLOAD_SEARCH_QUERY } from "@/src/graphql/queries";

const MAGENTO_BASE = process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "";
const SESSION_TTL_MS = 10 * 60 * 1000;
const UA = "Mozilla/5.0 (compatible; BTireFrontend)";

export interface MagentoLabeledValue {
    label: string;
    value: string;
}

export interface MagentoOrderViewExtras {
    /** Last line of Magento's Billing Address box, e.g. "Customer PO Number: 5655". */
    po_number: MagentoLabeledValue | null;
    /** Magento's #delivery-date block (shown in the Shipping Method box), e.g. "Delivery Date" / "N/A". */
    delivery_date: MagentoLabeledValue | null;
    /** Magento's #delivery-comment block (shown in the Shipping Method box). */
    delivery_comment: MagentoLabeledValue | null;
    /** Magento's "Order Comment" box. */
    order_comment: MagentoLabeledValue | null;
    /** Magento's "Order Information" block exactly as Magento renders it (title + boxes + their lines). */
    order_info: MagentoOrderInfo | null;
    /** Magento's "Order Check" (confirm order) form — present only when Magento offers it to this login. */
    order_check: MagentoOrderCheck | null;
}

/** Texts of Magento's "Order Check" form (#confirm-order-form), as Magento renders them. */
export interface MagentoOrderCheck {
    title: string | null;
    attachmentLabel: string | null;
    /** "Select files from device" */
    fileTitle: string | null;
    /** "Allowed file types: jpg, jpeg, …" */
    allowedText: string | null;
    /** The extensions listed in allowedText (used to limit the file picker). */
    allowedExtensions: string[];
    multiple: boolean;
    commentLabel: string | null;
    commentRows: number | null;
    button: string | null;
}

function parseOrderCheck(html: string): MagentoOrderCheck | null {
    const formStart = html.search(/<form[^>]*id="confirm-order-form"/);
    if (formStart < 0) return null;
    const formEnd = html.indexOf("</form>", formStart);
    const form = html.slice(formStart, formEnd > 0 ? formEnd : html.length);
    const blockStart = html.lastIndexOf('<div class="block', formStart);
    const head = blockStart >= 0 ? html.slice(blockStart, formStart) : "";
    const text = (m: RegExpMatchArray | null | undefined) => (m ? decodeHtml(m[1]).replace(/\n/g, " ").trim() || null : null);

    const zoneLabel = form.match(/<label[^>]*>\s*<p class="file-title">[\s\S]*?<\/label>/)?.[0] ?? "";
    const allowedText = text(zoneLabel.match(/<\/p>([\s\S]*?)<\/label>/));
    const allowedExtensions = (allowedText?.split(/[:：]/).pop() ?? "")
        .split(/[,،]/).map((e) => e.trim().toLowerCase()).filter((e) => /^[a-z0-9]+$/.test(e));
    const fileInput = form.match(/<input[^>]*type="file"[^>]*>/)?.[0] ?? "";
    const textareaAt = form.search(/<textarea/);
    const commentLabel = textareaAt > 0
        ? form.slice(form.lastIndexOf("<label", textareaAt), textareaAt).match(/<label[^>]*>([\s\S]*?)<\/label>/)
        : null;
    const rows = form.match(/<textarea[^>]*rows="(\d+)"/)?.[1];

    return {
        title: text(head.match(/<div class="block-title">\s*<strong>([\s\S]*?)<\/strong>/)),
        attachmentLabel: text(form.match(/<span[^>]*form-label-custom[^>]*>([\s\S]*?)<\/span>/)),
        fileTitle: text(zoneLabel.match(/<p class="file-title">([\s\S]*?)<\/p>/)),
        allowedText,
        allowedExtensions,
        multiple: /\smultiple(=|\s|>|\/)/.test(fileInput),
        commentLabel: text(commentLabel),
        commentRows: rows ? Number(rows) : null,
        button: text(form.match(/<button[^>]*type="submit"[^>]*>([\s\S]*?)<\/button>/)),
    };
}

/** One line of a Magento box (an address line, "T: 544472854" with its tel: link, …). */
export interface MagentoInfoLine { text: string; href: string | null }

export interface MagentoOrderInfo {
    title: string;
    /** In Magento's order: shipping-address, shipping-method, billing-address, billing-method. */
    boxes: { type: string; title: string; lines: MagentoInfoLine[] }[];
}

function parseOrderInfo(html: string): MagentoOrderInfo | null {
    const starts = [...html.matchAll(/<div class="block block-order-details-view">/g)].map((m) => m.index ?? 0);
    const start = starts.find((i) => /^<div class="block block-order-details-view">\s*<div class="block-title">/.test(html.slice(i, i + 200)));
    if (start === undefined) return null;
    const end = starts.find((i) => i > start) ?? html.length;
    const block = html.slice(start, end);
    const title = block.match(/<div class="block-title">\s*<strong>([\s\S]*?)<\/strong>/)?.[1];
    const boxes = [...block.matchAll(/<div class="box box-order-([a-z-]+)">\s*<strong class="box-title">\s*<span>([\s\S]*?)<\/span>\s*<\/strong>\s*<div class="box-content">([\s\S]*?)<\/div>\s*<\/div>/g)]
        .map((m) => ({
            type: m[1],
            title: decodeHtml(m[2]),
            lines: m[3]
                .replace(/<\/(dt|dd|p|li)>/gi, "<br>")
                .split(/<br\s*\/?>/i)
                .map((part) => ({ text: decodeHtml(part).replace(/\n/g, " ").trim(), href: part.match(/<a[^>]*href="([^"]+)"/)?.[1] ?? null }))
                .filter((l) => l.text !== ""),
        }));
    return title && boxes.length ? { title: decodeHtml(title), boxes } : null;
}

type Session = { cookie: string; base: string; expires: number };
const sessions = new Map<string, Session>();

function decodeHtml(s: string): string {
    return s
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

function collectCookies(res: Response, jar: Map<string, string>) {
    for (const c of res.headers.getSetCookie()) {
        const kv = c.split(";")[0];
        const i = kv.indexOf("=");
        if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
    }
}

async function openSession(store: string, authHeader: string): Promise<Session | null> {
    // 1. the customer's own account id
    const me = await fetch(`${MAGENTO_BASE}/rest/${store}/V1/customers/me`, {
        headers: { Authorization: authHeader, Accept: "application/json" },
        cache: "no-store",
    });
    if (!me.ok) { console.warn(`[magento-page] ${store}: customers/me failed (HTTP ${me.status})`); return null; }
    const accountId = Number((await me.json().catch(() => null))?.id);
    if (!accountId) { console.warn(`[magento-page] ${store}: customers/me returned no account id`); return null; }

    // 2. Magento's one-time login link for that account, in this store view
    const res = await fetch(`${MAGENTO_BASE}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Store: store, Authorization: authHeader },
        body: JSON.stringify({ query: KLEVER_SITE_LOGIN_URL_MUTATION, variables: { account_id: accountId } }),
        cache: "no-store",
    });
    const loginJson = await res.json().catch(() => null);
    const loginUrl: string | undefined = loginJson?.data?.kleverSiteLoginSwitch?.login_url;
    if (!loginUrl) {
        console.warn(`[magento-page] ${store}: no login_url from kleverSiteLoginSwitch:`, loginJson?.errors?.[0]?.message || "empty response");
        return null;
    }
    const base = loginUrl.replace(/\/sitelogin\/token\/login\/.*$/, "");

    // 3. open it (follow Magento's redirects by hand to keep its cookies)
    const jar = new Map<string, string>();
    let url: string | null = loginUrl;
    for (let i = 0; i < 6 && url; i++) {
        const r: Response = await fetch(url, {
            redirect: "manual",
            headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), "User-Agent": UA },
            cache: "no-store",
        });
        collectCookies(r, jar);
        const loc = r.headers.get("location");
        url = loc ? new URL(loc, url).toString() : null;
    }
    if (jar.size === 0) { console.warn(`[magento-page] ${store}: Magento login link set no session cookie`); return null; }
    return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), base, expires: Date.now() + SESSION_TTL_MS };
}

function parseOrderView(html: string): MagentoOrderViewExtras {
    const block = (id: string): MagentoLabeledValue | null => {
        const m = html.match(new RegExp(`<div id="${id}">\\s*<strong>([\\s\\S]*?)</strong>\\s*<span[^>]*>([\\s\\S]*?)</span>`));
        return m ? { label: decodeHtml(m[1]), value: decodeHtml(m[2]) } : null;
    };
    const comment = html.match(/class="box box-order-comment">[\s\S]*?<strong class="box-title">([\s\S]*?)<\/strong>[\s\S]*?<div class="box-content">([\s\S]*?)<\/div>/);
    // Billing Address box: Magento appends "<br>Customer PO Number: 5655" as its last line.
    const billing = html.match(/class="box box-order-billing-address">[\s\S]*?<address>([\s\S]*?)<\/address>/);
    const po = billing?.[1].match(/<br\s*\/?>\s*([^<:]+):\s*([^<]*?)\s*$/);
    return {
        po_number: po ? { label: decodeHtml(po[1]), value: decodeHtml(po[2]) } : null,
        delivery_date: block("delivery-date"),
        delivery_comment: block("delivery-comment"),
        order_comment: comment ? { label: decodeHtml(comment[1]), value: decodeHtml(comment[2]) } : null,
        order_info: parseOrderInfo(html),
        order_check: parseOrderCheck(html),
    };
}

/**
 * HTML of one of the logged-in customer's own Magento storefront pages (path after the store
 * code, e.g. "sales/order/history/"), through the cached Magento session. null when unavailable.
 */
export async function fetchMagentoCustomerPage(path: string, store: string, authHeader: string): Promise<string | null> {
    const key = `${store}|${authHeader}`;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            let session = sessions.get(key);
            if (!session || session.expires < Date.now()) {
                const opened = await openSession(store, authHeader);
                if (!opened) { sessions.delete(key); return null; }
                session = opened;
                for (const [k, v] of sessions) if (v.expires < Date.now()) sessions.delete(k);
                sessions.set(key, session);
            }
            const res = await fetch(`${session.base}/${path.replace(/^\/+/, "")}`, {
                redirect: "manual",
                headers: { Cookie: session.cookie, "User-Agent": UA },
                cache: "no-store",
            });
            if (res.status !== 200) {
                console.warn(`[magento-page] ${store} ${path}: HTTP ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`);
                // session ended (Magento redirects to login) → open a fresh one once
                sessions.delete(key);
                continue;
            }
            return await res.text();
        } catch (err: any) {
            console.warn(`[magento-page] ${store} ${path}:`, err?.message || err);
            sessions.delete(key);
        }
    }
    return null;
}

/** Magento's own order page extras for this customer's order (entity id) in this store view. */
export async function getMagentoOrderViewExtras(orderId: number, store: string, authHeader: string): Promise<MagentoOrderViewExtras | null> {
    const html = await fetchMagentoCustomerPage(`sales/order/view/order_id/${orderId}/`, store, authHeader);
    return html ? parseOrderView(html) : null;
}

// ── My Orders table (sales/order/history) ───────────────────────────────────────────────────

export type OrderHistoryColumnKey =
    | "id" | "sapOrderNumber" | "date" | "grandTotal" | "orderedBy" | "company" | "companyCode" | "status" | "actions";

export interface MagentoOrderHistoryLayout {
    /** Magento's columns, in Magento's order, with Magento's header text. */
    columns: { key: OrderHistoryColumnKey; label: string }[];
    /** Magento's action link texts in the Action column ("View Order", "Reorder"). */
    actions: { view: string | null; reorder: string | null };
    /** Rows on Magento's page: order number → status text exactly as Magento shows it (translated),
     *  plus each column's cell text as Magento shows it (e.g. Company "N/A"). */
    rows: { number: string; status: string; cells: Partial<Record<OrderHistoryColumnKey, string>> }[];
    /** Magento's filter bar above the table (null when Magento's page has none). */
    filters: MagentoOrderFilters | null;
    /** Magento's message when there are no orders to list (e.g. "You have placed no orders."). */
    emptyMessage: string | null;
}

export interface MagentoFilterOption { value: string; label: string }

/** Magento's My Orders filter bar: which filters it shows for this account, their labels/options and button texts. */
export interface MagentoOrderFilters {
    status: { label: string; options: MagentoFilterOption[] } | null;
    order: { label: string } | null;
    /** Any other dropdown Magento shows (e.g. company, for account types that get one). */
    company: { label: string; options: MagentoFilterOption[] } | null;
    /** Any other text field Magento shows (e.g. company code). */
    companyCode: { label: string } | null;
    searchButton: string | null;
    resetButton: string | null;
}

function parseOrderFilters(html: string): MagentoOrderFilters | null {
    const start = html.indexOf('<div class="btn-group">');
    if (start < 0) return null;
    const end = html.indexOf('id="resetButton"', start);
    if (end < 0) return null;
    const group = html.slice(start, html.indexOf("</button>", end) + 9);
    const options = (selectHtml: string): MagentoFilterOption[] =>
        [...selectHtml.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)]
            .map((m) => ({ value: decodeHtml(m[1]), label: decodeHtml(m[2]) }));

    const filters: MagentoOrderFilters = { status: null, order: null, company: null, companyCode: null, searchButton: null, resetButton: null };
    // each <label> belongs to the first <select>/<input> that follows it (before the next <label>)
    const labels = [...group.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)];
    labels.forEach((m, i) => {
        const from = (m.index ?? 0) + m[0].length;
        const to = i + 1 < labels.length ? labels[i + 1].index ?? group.length : group.length;
        const part = group.slice(from, to);
        const label = decodeHtml(m[1]);
        const select = part.match(/<select([^>]*)>([\s\S]*?)<\/select>/);
        const input = part.match(/<input([^>]*)>/);
        if (select && (!input || (select.index ?? 0) < (input.index ?? 0))) {
            if (/filter-by-status/.test(select[1])) filters.status = { label, options: options(select[2]) };
            else if (!filters.company) filters.company = { label, options: options(select[2]) };
        } else if (input) {
            if (/id="search-input"/.test(input[1])) filters.order = { label };
            else if (!filters.companyCode) filters.companyCode = { label };
        }
    });
    filters.searchButton = group.match(/<button[^>]*id="search-button"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? null;
    filters.resetButton = group.match(/<button[^>]*id="resetButton"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? null;
    if (filters.searchButton) filters.searchButton = decodeHtml(filters.searchButton);
    if (filters.resetButton) filters.resetButton = decodeHtml(filters.resetButton);
    return filters;
}

/** Which order field a Magento history column shows — from its class (and, for Magento's shared
 *  "col total" class, from whether its cells hold a price). null = a column we have no data for. */
function historyColumnKey(cls: string, cellHtml: string | undefined, used: Set<string>): OrderHistoryColumnKey | null {
    const c = ` ${cls.toLowerCase()} `;
    if (c.includes(" id ")) return "id";
    if (c.includes("sap")) return "sapOrderNumber";
    if (c.includes(" date ")) return "date";
    if (c.includes(" status ")) return "status";
    if (c.includes(" actions ") || c.includes(" action ")) return "actions";
    if (c.includes("company")) return c.includes("code") ? "companyCode" : "company";
    if (c.includes(" total ")) {
        if (cellHtml !== undefined) return /class="price"/.test(cellHtml) ? "grandTotal" : "orderedBy";
        return used.has("grandTotal") ? "orderedBy" : "grandTotal";
    }
    return null;
}

function parseOrderHistory(html: string): MagentoOrderHistoryLayout | null {
    const emptyMessage = parseEmptyMessage(html);
    const table = html.match(/<table[^>]*id="my-orders-table"[^>]*>([\s\S]*?)<\/table>/)?.[1];
    // No table: Magento lists no orders for this customer/filter — only its message.
    if (!table) return emptyMessage ? { columns: [], actions: { view: null, reorder: null }, rows: [], filters: parseOrderFilters(html), emptyMessage } : null;
    const filters = parseOrderFilters(html);
    const ths = [...(table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "").matchAll(/<th[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/th>/g)];
    const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rowCells = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
        .map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]));
    const tds = rowCells[0] ?? [];
    const used = new Set<string>();
    const columns: MagentoOrderHistoryLayout["columns"] = [];
    // column key of each Magento <th> (null for a column not shown)
    const keyAt: (OrderHistoryColumnKey | null)[] = ths.map(() => null);
    ths.forEach((m, i) => {
        const key = historyColumnKey(m[1], tds.length === ths.length ? tds[i] : undefined, used);
        if (!key || used.has(key)) return;
        used.add(key);
        keyAt[i] = key;
        columns.push({ key, label: decodeHtml(m[2]) });
    });
    if (columns.length === 0) return null;
    // the Action cell: Magento's links there carry their text in a <span> (the Order # link does not)
    const actionsCell = tds.find((td) => /class="action view"[^>]*>\s*<span>/.test(td)) ?? "";
    const linkText = (cls: string) => {
        const m = actionsCell.match(new RegExp(`class="action ${cls}"[^>]*>\\s*<span>([\\s\\S]*?)</span>`));
        return m ? decodeHtml(m[1]) : null;
    };
    const idIdx = ths.findIndex((m) => / id( |$)/.test(` ${m[1]}`));
    const statusIdx = ths.findIndex((m) => / status( |$)/.test(` ${m[1]}`));
    const rows = idIdx < 0 || statusIdx < 0 ? [] : rowCells
        .filter((cells) => cells.length === ths.length)
        .map((cells) => {
            const byKey: Partial<Record<OrderHistoryColumnKey, string>> = {};
            cells.forEach((cell, i) => { const k = keyAt[i]; if (k) byKey[k] = decodeHtml(cell).replace(/\n/g, " ").trim(); });
            return { number: decodeHtml(cells[idIdx]), status: decodeHtml(cells[statusIdx]), cells: byKey };
        })
        .filter((r) => r.number && r.status);
    return { columns, actions: { view: linkText("view"), reorder: linkText("order") }, rows, filters, emptyMessage };
}

function parseEmptyMessage(html: string): string | null {
    const m = html.match(/<div class="message info empty">\s*<span>([\s\S]*?)<\/span>/);
    return m ? decodeHtml(m[1]) : null;
}

/**
 * Magento's own My Orders table layout for this customer in this store view: columns, header and
 * action texts and the filter bar (from the first page of Magento's list), plus Magento's
 * "no orders" message (from Magento's list filtered to an order number that cannot exist).
 */
export async function getMagentoOrderHistoryLayout(store: string, authHeader: string): Promise<MagentoOrderHistoryLayout | null> {
    const [html, emptyHtml] = await Promise.all([
        fetchMagentoCustomerPage("sales/order/history/?limit=50", store, authHeader),
        fetchMagentoCustomerPage(`sales/order/history/?order_number=${encodeURIComponent(`no-match-${Date.now()}`)}`, store, authHeader),
    ]);
    const layout = html ? parseOrderHistory(html) : null;
    if (!layout) return null;
    return { ...layout, emptyMessage: layout.emptyMessage ?? (emptyHtml ? parseEmptyMessage(emptyHtml) : null) };
}

/** Status text exactly as Magento's list shows it in this store view for one status code
 *  (Magento's list filtered by that status); null when Magento lists no order with it. */
export async function getMagentoStatusText(statusCode: string, store: string, authHeader: string): Promise<string | null> {
    const html = await fetchMagentoCustomerPage(`sales/order/history/?order_status=${encodeURIComponent(statusCode)}&limit=10`, store, authHeader);
    return (html ? parseOrderHistory(html) : null)?.rows[0]?.status ?? null;
}

// ── My Order Attachments (orderupload/upload/view) ──────────────────────────────────────────

export type AttachmentColumnKey =
    | "order" | "file" | "company" | "companyCode" | "documentType" | "createdOn" | "invoiceDue" | "payment";

/** Magento's own My Order Attachments page layout for this customer in this store view. */
export interface MagentoAttachmentsLayout {
    title: string | null;
    /** Order search box (placeholder) and its button text. */
    search: { placeholder: string | null; button: string | null } | null;
    /** Company-code box — only when Magento shows one for this account. */
    companyCode: { placeholder: string | null } | null;
    /** Magento's dropdown filters, in Magento's order (Magento's own option values and texts). */
    filters: { key: "doc_type" | "invoice_due" | "company"; label: string; options: MagentoFilterOption[] }[];
    resetButton: string | null;
    /** Magento's columns, in Magento's order, with Magento's header texts. */
    columns: { key: AttachmentColumnKey; label: string }[];
    /** Magento's text when no attachment matches. */
    emptyMessage: string | null;
    /**
     * What Magento shows in a column when the attachment has no value for it (e.g. Company "N/A"),
     * taken from Magento's own rows. A column is missing here when Magento leaves such cells blank.
     */
    emptyTexts: Partial<Record<AttachmentColumnKey, string>>;
}

/** Magento's table rows on its attachments page: per column, the cell text (and whether it is a link/button). */
type MagentoAttachmentRow = Partial<Record<AttachmentColumnKey, { text: string; control: boolean }>>;

function parseAttachmentRows(html: string, keys: (AttachmentColumnKey | null)[]): MagentoAttachmentRow[] {
    const tbody = html.match(/<table[^>]*order-orderupload-table[^>]*>[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    return [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].flatMap((tr) => {
        const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
        if (tds.length !== keys.length) return []; // e.g. the "No records found" row
        const row: MagentoAttachmentRow = {};
        tds.forEach((td, i) => {
            const key = keys[i];
            if (key) row[key] = { text: decodeHtml(td[1]).replace(/\n/g, " ").trim(), control: /<(a|button)\b/i.test(td[1]) };
        });
        return [row];
    });
}

/**
 * Magento's attachments table has no column classes; its template order is fixed:
 *   # Order, File Name, [company columns Magento adds for some accounts], Document Type,
 *   Created On, Invoice Due, Payment
 * so columns are mapped by position from both ends.
 */
function attachmentColumnKeys(count: number): (AttachmentColumnKey | null)[] {
    const tail: AttachmentColumnKey[] = ["documentType", "createdOn", "invoiceDue", "payment"];
    if (count < 2 + tail.length) return Array(count).fill(null);
    const middle = count - 2 - tail.length;
    const middleKeys: (AttachmentColumnKey | null)[] =
        middle === 0 ? [] : middle === 1 ? ["company"] : ["company", "companyCode", ...Array(middle - 2).fill(null)];
    return ["order", "file", ...middleKeys, ...tail];
}

function parseAttachmentsPage(html: string): MagentoAttachmentsLayout | null {
    const table = html.match(/<table[^>]*order-orderupload-table[^>]*>([\s\S]*?)<\/table>/)?.[1];
    if (!table) return null;
    const ths = [...(table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => decodeHtml(m[1]));
    const keys = attachmentColumnKeys(ths.length);
    const columns = ths
        .map((label, i) => ({ key: keys[i], label }))
        .filter((c): c is { key: AttachmentColumnKey; label: string } => c.key !== null);

    const start = html.indexOf('<div class="btn-group">');
    const end = start >= 0 ? html.indexOf('id="resetButton"', start) : -1;
    const group = start >= 0 && end > 0 ? html.slice(start, html.indexOf("</button>", end) + 9) : "";
    const attr = (tag: string | undefined, name: string) => tag?.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
    const searchInput = group.match(/<input[^>]*id="upload-search-input"[^>]*>/)?.[0];
    const searchButton = group.match(/<button[^>]*id="upload-search-button"[^>]*>([\s\S]*?)<\/button>/)?.[1];
    const companyInput = group.match(/<input[^>]*id="company_code"[^>]*>/)?.[0];
    const reset = group.match(/<button[^>]*id="resetButton"[^>]*>([\s\S]*?)<\/button>/)?.[1];

    const filters: MagentoAttachmentsLayout["filters"] = [];
    const labels = [...group.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)];
    labels.forEach((m, i) => {
        const from = (m.index ?? 0) + m[0].length;
        const to = i + 1 < labels.length ? labels[i + 1].index ?? group.length : group.length;
        const select = group.slice(from, to).match(/<select([^>]*)>([\s\S]*?)<\/select>/);
        if (!select) return;
        const key = /filter-by-doc/.test(select[1]) ? "doc_type" : /filter-by-invoice-due/.test(select[1]) ? "invoice_due" : "company";
        if (filters.some((f) => f.key === key)) return;
        filters.push({
            key,
            label: decodeHtml(m[1]),
            options: [...select[2].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)]
                .map((o) => ({ value: decodeHtml(o[1]), label: decodeHtml(o[2]) })),
        });
    });

    const title = html.match(/<span class="base"[^>]*data-ui-id="page-title-wrapper"[^>]*>([\s\S]*?)<\/span>/)?.[1];
    const empty = html.match(/<tr><td colspan="\d+">([^<]*)<\/td><\/tr>/)?.[1];
    return {
        title: title ? decodeHtml(title) : null,
        search: searchInput || searchButton ? { placeholder: attr(searchInput, "placeholder"), button: searchButton ? decodeHtml(searchButton) : null } : null,
        companyCode: companyInput ? { placeholder: attr(companyInput, "placeholder") } : null,
        filters,
        resetButton: reset ? decodeHtml(reset) : null,
        columns,
        emptyMessage: empty ? decodeHtml(empty) : null,
        emptyTexts: {},
    };
}

/** Magento's own My Order Attachments page layout for this customer in this store view. */
export async function getMagentoAttachmentsLayout(store: string, authHeader: string): Promise<MagentoAttachmentsLayout | null> {
    const html = await fetchMagentoCustomerPage("orderupload/upload/view/", store, authHeader);
    const layout = html ? parseAttachmentsPage(html) : null;
    if (!html || !layout) return layout;
    layout.emptyTexts = await attachmentEmptyTexts(html, store, authHeader);
    return layout;
}

/**
 * Magento's text for an empty value, per column: Magento's own rows are matched to the same
 * attachments in kleverOrderUploadSearch (by order number + file name); where the attachment has
 * no value but Magento's cell shows text (e.g. "N/A"), that text is what Magento shows for empty.
 */
async function attachmentEmptyTexts(html: string, store: string, authHeader: string): Promise<Partial<Record<AttachmentColumnKey, string>>> {
    const table = html.match(/<table[^>]*order-orderupload-table[^>]*>([\s\S]*?)<\/table>/)?.[1] ?? "";
    const thCount = [...(table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "").matchAll(/<th[^>]*>/g)].length;
    const rows = parseAttachmentRows(html, attachmentColumnKeys(thCount));
    if (rows.length === 0) return {};

    let items: any[] = [];
    try {
        const res = await fetch(`${MAGENTO_BASE}/graphql`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Store: store, Authorization: authHeader },
            body: JSON.stringify({ query: KLEVER_ORDER_UPLOAD_SEARCH_QUERY, variables: { pageSize: Math.max(rows.length, 50), currentPage: 1 } }),
            cache: "no-store",
        });
        items = (await res.json().catch(() => null))?.data?.kleverOrderUploadSearch?.items ?? [];
    } catch {
        return {};
    }
    const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const byKey = new Map(items.map((it) => [`${norm(it.order_increment_id)}|${norm(it.file_name)}`, it]));
    // the attachment's own value behind each column
    const raw: Partial<Record<AttachmentColumnKey, (it: any) => unknown>> = {
        company: (it) => it.company_name,
        companyCode: (it) => it.company_code,
        documentType: (it) => it.comment,
        createdOn: (it) => it.created_at,
        invoiceDue: (it) => it.invoice_due,
        payment: (it) => it.payment_status,
    };

    const out: Partial<Record<AttachmentColumnKey, string>> = {};
    for (const row of rows) {
        const it = byKey.get(`${norm(row.order?.text)}|${norm(row.file?.text)}`);
        if (!it) continue;
        for (const [key, get] of Object.entries(raw) as [AttachmentColumnKey, (it: any) => unknown][]) {
            const cell = row[key];
            if (out[key] || !cell || cell.control || !cell.text) continue;
            if (norm(get(it)) === "") out[key] = cell.text;
        }
    }
    return out;
}

// ─── Address Book (customer/address/) ──────────────────────────────────────────

/** A link Magento shows for an address (Change … Address, Edit, Delete) and the address it acts on. */
export interface MagentoAddressAction { kind: "edit" | "delete"; label: string; addressId: string }

export interface MagentoAddressBox {
    /** "billing" | "shipping" (from Magento's box-address-<type> class). */
    type: string;
    title: string;
    lines: MagentoInfoLine[];
    /** Only the actions Magento shows (a hidden box-actions is left out). */
    actions: MagentoAddressAction[];
}

export interface MagentoAddressBook {
    title: string | null;
    defaults: { title: string; boxes: MagentoAddressBox[] } | null;
    additional: {
        title: string;
        /** Magento's table header texts, in its order (the actions column included, usually blank). */
        columns: string[];
        rows: { id: string; cells: string[]; actions: MagentoAddressAction[] }[];
        /** Magento's text when there are no other addresses. */
        emptyMessage: string | null;
    } | null;
}

function blockOf(html: string, cls: string): string | null {
    const start = html.indexOf(`<div class="block ${cls}`);
    if (start < 0) return null;
    // a block ends where the next block (or Magento's page-init script) begins
    const ends = [html.indexOf('<div class="block ', start + 10), html.indexOf("<script", start)].filter((i) => i > 0);
    return html.slice(start, ends.length ? Math.min(...ends) : html.length);
}

function addressActions(html: string): MagentoAddressAction[] {
    return [...html.matchAll(/<a([^>]*)>\s*<span>([\s\S]*?)<\/span>\s*<\/a>/g)].flatMap((m): MagentoAddressAction[] => {
        const attrs = m[1];
        const edit = /class="[^"]*action edit/.test(attrs) ? attrs.match(/\/edit\/id\/(\d+)/)?.[1] : null;
        const del = /role="delete-address"|class="[^"]*action delete/.test(attrs) ? attrs.match(/data-address="(\d+)"/)?.[1] : null;
        if (edit) return [{ kind: "edit" as const, label: decodeHtml(m[2]), addressId: edit }];
        if (del) return [{ kind: "delete" as const, label: decodeHtml(m[2]), addressId: del }];
        return [];
    });
}

function infoLines(content: string): MagentoInfoLine[] {
    return content
        .replace(/<\/(dt|dd|p|li|address)>/gi, "<br>")
        .split(/<br\s*\/?>/i)
        .map((part) => ({ text: decodeHtml(part).replace(/\n/g, " ").trim(), href: part.match(/<a[^>]*href="([^"]+)"/)?.[1] ?? null }))
        .filter((l) => l.text !== "");
}

function parseAddressBook(html: string): MagentoAddressBook {
    const title = html.match(/<span class="base"[^>]*data-ui-id="page-title-wrapper"[^>]*>([\s\S]*?)<\/span>/)?.[1];
    const blockTitle = (b: string) => b.match(/<div class="block-title">\s*<strong>([\s\S]*?)<\/strong>/)?.[1];

    let defaults: MagentoAddressBook["defaults"] = null;
    const def = blockOf(html, "block-addresses-default");
    if (def) {
        const starts = [...def.matchAll(/<div class="box box-address-([a-z]+)">/g)];
        const boxes = starts.map((m, i) => {
            const box = def.slice(m.index ?? 0, i + 1 < starts.length ? starts[i + 1].index : def.length);
            const content = box.match(/<div class="box-content">([\s\S]*?)<\/div>/)?.[1] ?? "";
            const actionsHtml = box.match(/<div class="box-actions"([^>]*)>([\s\S]*?)<\/div>/);
            const hidden = !!actionsHtml && /display:\s*none/.test(actionsHtml[1]);
            return {
                type: m[1],
                title: decodeHtml(box.match(/<strong class="box-title">([\s\S]*?)<\/strong>/)?.[1] ?? ""),
                lines: infoLines(content),
                actions: actionsHtml && !hidden ? addressActions(actionsHtml[2]) : [],
            };
        });
        const t = blockTitle(def);
        if (t) defaults = { title: decodeHtml(t), boxes };
    }

    let additional: MagentoAddressBook["additional"] = null;
    const list = blockOf(html, "block-addresses-list");
    if (list) {
        const t = blockTitle(list);
        const table = list.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
        const columns = [...(table.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => decodeHtml(m[1]));
        const rows = [...(table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => {
            const tds = [...r[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
            const actions = tds.flatMap((td) => addressActions(td[2]));
            return {
                id: actions[0]?.addressId ?? "",
                // action cells hold only links → "" here; the links are in `actions`
                cells: tds.map((td) => (addressActions(td[2]).length ? "" : decodeHtml(td[2]).replace(/\n/g, ", "))),
                actions,
            };
        });
        const empty = list.match(/<p class="empty">([\s\S]*?)<\/p>/)?.[1];
        if (t) additional = { title: decodeHtml(t), columns, rows, emptyMessage: empty ? decodeHtml(empty) : null };
    }

    return { title: title ? decodeHtml(title) : null, defaults, additional };
}

/**
 * Magento's own Address Book page for this customer in this store view — every page of its
 * additional-addresses list (Magento pages it with ?p=N). null when the page cannot be read.
 */
export async function getMagentoAddressBook(store: string, authHeader: string): Promise<MagentoAddressBook | null> {
    const html = await fetchMagentoCustomerPage("customer/address/", store, authHeader);
    if (!html) return null;
    const book = parseAddressBook(html);
    if (!book.defaults && !book.additional) return null;
    const pager = html.includes("customer-addresses-toolbar") || /class="pages"/.test(blockOf(html, "block-addresses-list") ?? "");
    if (book.additional && pager) {
        const seen = new Set(book.additional.rows.map((r) => r.id));
        for (let p = 2; p <= 50; p++) {
            const next = await fetchMagentoCustomerPage(`customer/address/?p=${p}`, store, authHeader);
            const rows = next ? parseAddressBook(next).additional?.rows ?? [] : [];
            const fresh = rows.filter((r) => !seen.has(r.id));
            if (fresh.length === 0) break; // Magento repeats its last page past the end
            fresh.forEach((r) => { seen.add(r.id); book.additional!.rows.push(r); });
        }
    }
    return book;
}

// ─── Favourite products (wishlist/) ────────────────────────────────────────────

/**
 * Magento's own message on the customer's Favourite Products page when the list is empty
 * (<div class="message info empty"><span>You have no items in your favourite products.</span></div>),
 * as this store view shows it. null when the page cannot be read or shows no such message.
 */
export async function getMagentoWishlistEmptyMessage(store: string, authHeader: string): Promise<string | null> {
    const html = await fetchMagentoCustomerPage("wishlist/", store, authHeader);
    const m = html?.match(/<div class="message[^"]*\bempty\b[^"]*">([\s\S]*?)<\/div>/);
    const text = m ? decodeHtml(m[1]).replace(/\n/g, " ") : "";
    return text || null;
}

// ─── My Account (customer/account/) ─────────────────────────────────────────────

/** A link Magento shows on its My Account page, mapped to the frontend route that does the same. */
export interface MagentoAccountLink {
    kind: "edit-account" | "change-password" | "business-overview" | "edit-address" | "other";
    label: string;
    /** Locale-less frontend path (the page adds the locale prefix). */
    href: string;
}

export interface MagentoAccountBox {
    /** Magento's box class, e.g. "box-information business-overview", "box-billing-address". */
    type: string;
    title: string;
    /** A link Magento puts in the box title (Business Overview "Edit"). */
    titleAction: MagentoAccountLink | null;
    lines: MagentoInfoLine[];
    /** Targets and Achievements: Magento's year switch, each year with its own lines. */
    years: { year: string; label: string; lines: MagentoInfoLine[]; selected: boolean }[] | null;
    actions: MagentoAccountLink[];
}

export interface MagentoAccountSection {
    /** "info" = boxes (Account Information, Address Book), "credit" = Credit Account Information tiles. */
    kind: "info" | "credit";
    /** Magento's block class, e.g. "block-dashboard-info", "block-dashboard-addresses". */
    type: string;
    title: string;
    boxes: MagentoAccountBox[];
    credit: { title: string; amount: string }[];
}

export interface MagentoAccountPage {
    title: string | null;
    sections: MagentoAccountSection[];
}

/** Cloudflare hides e-mails in served HTML (data-cfemail); this restores the real address. */
function decodeCfEmails(html: string): string {
    return html.replace(/<a[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/a>/gi, (_, hex: string) => {
        const key = parseInt(hex.slice(0, 2), 16);
        let out = "";
        for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
        return out;
    });
}

function accountLink(attrs: string, inner: string): MagentoAccountLink | null {
    const href = attrs.match(/href="([^"]*)"/)?.[1] ?? "";
    const label = decodeHtml(inner).replace(/\n/g, " ").trim();
    if (!label) return null;
    let path = "";
    try { path = new URL(href, "https://x").pathname; } catch { path = href; }
    // drop Magento's store-code segment (e.g. /imdad_ar/customer/account/edit/ → /customer/account/edit)
    path = path.replace(/^\/[a-z]+(_[a-z]+)?(?=\/customer\/)/, "").replace(/\/+$/, "");
    const address = path.match(/\/customer\/address\/edit\/id\/(\d+)/)?.[1];
    if (/change-password/.test(attrs) || /\/changepass\//.test(path)) return { kind: "change-password", label, href: "/customer/account/edit?change=password" };
    if (/business_overview/.test(path) || /business-overview/.test(attrs)) return { kind: "business-overview", label, href: "" };
    if (address) return { kind: "edit-address", label, href: `/customer/address-book/edit/${address}` };
    if (/^\/customer\/account\/edit$/.test(path)) return { kind: "edit-account", label, href: "/customer/account/edit" };
    return { kind: "other", label, href: path || "/" };
}

function parseAccountBox(box: string, type: string): MagentoAccountBox {
    const strong = box.match(/<strong class="box-title[^"]*">([\s\S]*?)<\/strong>/)?.[1] ?? "";
    const titleLink = strong.match(/<a([^>]*)>([\s\S]*?)<\/a>/);
    const content = box.match(/<div class="box-content">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const yearOptions = [...strong.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)];
    const yearParas = [...content.matchAll(/<p[^>]*id="[^"]*?(\d{4})"([^>]*)>([\s\S]*?)<\/p>/g)];
    const years = yearParas.length > 0
        ? yearParas.map((m) => ({
            year: m[1],
            label: decodeHtml(yearOptions.find((o) => o[1] === m[1])?.[2] ?? m[1]),
            lines: infoLines(m[3]),
            selected: !/class="[^"]*\bhide\b/.test(m[2]),
        }))
        : null;
    const actionsHtml = box.match(/<div class="box-actions"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    return {
        type,
        title: decodeHtml(strong.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? ""),
        titleAction: titleLink ? accountLink(titleLink[1], titleLink[2]) : null,
        lines: years ? [] : infoLines(content),
        years,
        actions: [...actionsHtml.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => accountLink(m[1], m[2])).filter((l): l is MagentoAccountLink => !!l),
    };
}

function parseAccountPage(raw: string): MagentoAccountPage | null {
    const html = decodeCfEmails(raw);
    const mainStart = html.indexOf('<div class="column main">');
    if (mainStart < 0) return null;
    const sidebar = html.indexOf('<div class="sidebar sidebar-main">', mainStart);
    const main = html.slice(mainStart, sidebar > 0 ? sidebar : html.length);
    const title = main.match(/<span class="base"[^>]*data-ui-id="page-title-wrapper"[^>]*>([\s\S]*?)<\/span>/)?.[1];

    const starts = [...main.matchAll(/<div class="block (block-dashboard-[a-z-]+)">/g)];
    const sections: MagentoAccountSection[] = starts.map((m, i) => {
        const block = main.slice(m.index ?? 0, i + 1 < starts.length ? starts[i + 1].index : main.length);
        const blockTitle = decodeHtml(block.match(/<div class="block-title">\s*<strong>([\s\S]*?)<\/strong>/)?.[1] ?? "");
        if (/credit_limit_wrap/.test(block)) {
            const credit = [...block.matchAll(/<h2 class="title">([\s\S]*?)<\/h2>\s*<span[^>]*class="price[^"]*"[^>]*>([\s\S]*?)<\/span>/g)]
                .map((c) => ({ title: decodeHtml(c[1]), amount: decodeHtml(c[2]) }));
            return { kind: "credit", type: m[1], title: blockTitle, boxes: [], credit };
        }
        const boxStarts = [...block.matchAll(/<div class="box ([^"]+)">/g)];
        const boxes = boxStarts.map((b, j) =>
            parseAccountBox(block.slice(b.index ?? 0, j + 1 < boxStarts.length ? boxStarts[j + 1].index : block.length), b[1]));
        return { kind: "info", type: m[1], title: blockTitle, boxes, credit: [] };
    });
    return sections.length > 0 ? { title: title ? decodeHtml(title) : null, sections } : null;
}

/** Magento's own My Account page for this login in this store view (blocks, boxes, lines, links). */
export async function getMagentoAccountPage(store: string, authHeader: string): Promise<MagentoAccountPage | null> {
    const html = await fetchMagentoCustomerPage("customer/account/", store, authHeader);
    return html ? parseAccountPage(html) : null;
}

// ─── Dashboard compare (customertarget/customer/dashboard/) ─────────────────────

/** One compare tab (Quarterly / Monthly) exactly as Magento's table shows it. */
export interface MagentoDashboardCompareTab {
    key: string;
    /** Tab button text ("Quarterly Sales Data"). */
    label: string;
    /** Header above the period column ("Quarter" / "Month"). */
    periodHeader: string;
    /** The years compared, in Magento's column order, each with its quantity header ("Qty"). */
    years: { year: string; qtyHeader: string }[];
    /** Rows: Magento's period label ("Q1", "1") and the quantity per year (same order as `years`). */
    rows: { label: string; values: number[] }[];
}

export interface MagentoDashboardCompare {
    /** The "Compare?" checkbox text. */
    compareLabel: string | null;
    /** The text between the two year lists ("vs."). */
    vsText: string | null;
    /** Years in Magento's first list, and the one Magento has selected. */
    searchYears: string[];
    searchYear: string | null;
    /** Years Magento offers in the "vs." list for that first year (Magento leaves the first year out). */
    compareYears: string[];
    compareYear: string | null;
    /** "Compare 2025 with 2026" — only in compare mode. */
    title: string | null;
    tabs: MagentoDashboardCompareTab[];
    /** Magento's dashboard cards (Total Order Qty / Value, Product Group, Tyre Size) — not in compare mode. */
    cards: MagentoDashboardCards | null;
}

/** A tick-box list on Magento's dashboard (Quarter, Months, Product Group): each entry and its number. */
export interface MagentoTickList {
    /** The list button text ("Quarter", "Months", "Cars"). */
    title: string;
    items: { key: string; label: string; value: number; checked: boolean }[];
}

export interface MagentoDashboardCards {
    /** Magento's text when the year has no records ("No record found!.") — cards are then not shown. */
    noRecords: string | null;
    qty: { title: string; years: { year: string; label: string; value: number }[]; quarter: MagentoTickList | null; month: MagentoTickList | null } | null;
    amount: { title: string; years: { year: string; label: string; value: number }[]; quarter: MagentoTickList | null; month: MagentoTickList | null } | null;
    productGroup: { title: string; list: MagentoTickList | null } | null;
    tyreSize: { title: string; items: { label: string; value: number }[] } | null;
}

function parseDashboardCards(html: string): MagentoDashboardCards | null {
    const noRecords = html.match(/<span class="no-records">([\s\S]*?)<\/span>/)?.[1];
    const dashStart = html.indexOf('<div class="customer-dashboard">');
    if (dashStart < 0) return noRecords ? { noRecords: decodeHtml(noRecords), qty: null, amount: null, productGroup: null, tyreSize: null } : null;
    const dash = html.slice(dashStart, html.indexOf("<script", dashStart) > 0 ? html.indexOf("<script", dashStart) : html.length);
    const section = (cls: string) => {
        const i = dash.indexOf(`<div class="row ${cls}">`);
        if (i < 0) return "";
        const next = dash.indexOf('<div class="row ', i + 10);
        return dash.slice(i, next > 0 ? next : dash.length);
    };
    const num = (v: string | undefined) => Number(String(v ?? "").replace(/,/g, "")) || 0;
    const h3 = (part: string) => decodeHtml(part.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const tickList = (part: string, boxId: string, dataAttr: string): MagentoTickList | null => {
        const at = part.indexOf(`id="${boxId}"`);
        if (at < 0) return null;
        // the list's own button: the last drop-toggle before its tick boxes
        const before = part.slice(0, at);
        const toggle = before.slice(before.lastIndexOf('class="drop-toggle"')).match(/class="drop-toggle"[^>]*>([\s\S]*?)<\/span>/)?.[1];
        const box = part.slice(at, part.indexOf("</ul>", at));
        const items = [...box.matchAll(/<input([^>]*)\/?>\s*<label[^>]*>([\s\S]*?)<\/label>/g)].map((m) => {
            const attrs = m[1];
            const get = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];
            return {
                key: get("data-quarter") ?? get("data-product-type") ?? get("id") ?? "",
                label: decodeHtml(m[2]),
                value: num(get(dataAttr) ?? get("value")),
                checked: /\schecked(\s|=|\/|$)/.test(attrs),
            };
        });
        return { title: decodeHtml(toggle ?? ""), items };
    };
    const years = (part: string, selectId: string, dataAttr: string) =>
        [...(part.match(new RegExp(`<select[^>]*id="${selectId}"[^>]*>([\\s\\S]*?)</select>`))?.[1] ?? "")
            .matchAll(new RegExp(`<option[^>]*value="([^"]*)"[^>]*${dataAttr}="([^"]*)"[^>]*>([\\s\\S]*?)</option>`, "g"))]
            .map((m) => ({ year: m[1], label: decodeHtml(m[3]), value: num(m[2]) }));

    const qtyPart = section("per-qty-dropdown");
    const amountPart = section("per-amount-dropdown");
    const typePart = section("type-size");
    const sizeAt = typePart.indexOf("tyre-size-select");
    const groupPart = sizeAt > 0 ? typePart.slice(0, sizeAt) : typePart;
    const sizePart = sizeAt > 0 ? typePart.slice(sizeAt) : "";

    return {
        noRecords: noRecords ? decodeHtml(noRecords) : null,
        qty: qtyPart ? {
            title: h3(qtyPart),
            years: years(qtyPart, "year-qty-selection", "data-qty"),
            quarter: tickList(qtyPart, "select-qty-quarter-checkbox", "data-qty"),
            month: tickList(qtyPart, "select-qty-month-checkbox", "data-qty"),
        } : null,
        amount: amountPart ? {
            title: h3(amountPart),
            years: years(amountPart, "year-amount-selection", "data-amount"),
            quarter: tickList(amountPart, "select-amount-quarter-checkbox", "value"),
            month: tickList(amountPart, "select-amount-month-checkbox", "value"),
        } : null,
        productGroup: groupPart ? { title: h3(groupPart), list: tickList(groupPart, "select-tyre-type-checkbox", "data-qty") } : null,
        tyreSize: sizePart ? {
            title: h3(sizePart),
            items: [...sizePart.matchAll(/<option[^>]*data-qty="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map((m) => ({ label: decodeHtml(m[2]), value: num(m[1]) })),
        } : null,
    };
}

function parseDashboardCompare(html: string): MagentoDashboardCompare | null {
    const select = (id: string) => html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`))?.[1] ?? null;
    const options = (sel: string | null) => [...(sel ?? "").matchAll(/<option([^>]*)value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g)]
        .map((m) => ({ value: decodeHtml(m[2]), selected: /selected/.test(m[1] + m[3]) }));
    const search = select("search-by-year");
    const compare = select("compare-by-year");
    if (search === null) return null;
    const searchOpts = options(search);
    const compareOpts = options(compare);

    const compareLabel = html.match(/<span>([^<]*)<\/span>\s*<span[^>]*>\s*<input[^>]*id="isCompare"/)?.[1];
    const vsText = html.match(/<div class="boxwrap checkbox-box-input mb-0 text-center">([\s\S]*?)<\/div>/)?.[1];

    // compare mode: <h3>Compare … with …</h3> + tab buttons + one table per tab pane
    const dash = html.slice(Math.max(0, html.indexOf('<div class="customer-dashboard">')));
    const hasTabs = /id="compareTab"/.test(dash);
    const title = hasTabs ? dash.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] : null;
    const tabs: MagentoDashboardCompareTab[] = !hasTabs ? [] : [...dash.matchAll(/<button[^>]*data-bs-target="#([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].flatMap((b) => {
        const pane = dash.match(new RegExp(`<div class="tab-pane[^"]*" id="${b[1]}"[^>]*>([\\s\\S]*?)</table>`))?.[1];
        if (!pane) return [];
        const headRows = [...(pane.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "").matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
            .map((r) => [...r[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((c) => decodeHtml(c[1])));
        const yearsRow = (headRows[0] ?? []).slice(1);
        const labelsRow = headRows[1] ?? [];
        const rows = [...(pane.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "").matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => {
            const tds = [...r[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
            const label = decodeHtml(tds.find((td) => /scope="row"/.test(td[1]))?.[2] ?? "");
            // value cells: not the row label, not Magento's mobile-only year captions
            const values = tds.filter((td) => !/scope="row"/.test(td[1]) && !/mobile-only/.test(td[1]))
                .map((td) => Number(decodeHtml(td[2]).replace(/[^\d.-]/g, "")) || 0);
            return { label, values };
        });
        return [{
            key: b[1],
            label: decodeHtml(b[2]),
            periodHeader: labelsRow[0] ?? "",
            years: yearsRow.map((year, i) => ({ year, qtyHeader: labelsRow[i + 1] ?? "" })),
            rows,
        }];
    });

    return {
        compareLabel: compareLabel ? decodeHtml(compareLabel) : null,
        vsText: vsText ? decodeHtml(vsText) : null,
        searchYears: searchOpts.map((o) => o.value),
        searchYear: searchOpts.find((o) => o.selected)?.value ?? searchOpts[0]?.value ?? null,
        compareYears: compareOpts.map((o) => o.value),
        compareYear: compareOpts.find((o) => o.selected)?.value ?? compareOpts[0]?.value ?? null,
        title: title ? decodeHtml(title) : null,
        tabs,
        cards: hasTabs ? null : parseDashboardCards(html),
    };
}

/**
 * Magento's own Dashboard compare box (and, with both years, its compare tables) for this login
 * and store view. Without years: the box as Magento first shows it. null when the page cannot be read.
 */
export async function getMagentoDashboardCompare(store: string, authHeader: string, searchYear?: string, compareYear?: string): Promise<MagentoDashboardCompare | null> {
    const query = searchYear && compareYear
        ? `?compare=yes&search_year=${encodeURIComponent(searchYear)}&compare_year=${encodeURIComponent(compareYear)}`
        : searchYear ? `?search_year=${encodeURIComponent(searchYear)}` : "";
    // (without compare=yes Magento shows its cards for that year)
    const html = await fetchMagentoCustomerPage(`customertarget/customer/dashboard/${query}`, store, authHeader);
    return html ? parseDashboardCompare(html) : null;
}

// ─── My Forecast (orderupload/upload/viewforcast/) ──────────────────────────────

/**
 * Magento's own text on My Forecast when no file was uploaded
 * (<div class="orderupload-item-dv"> No records found</div>), as this store view shows it.
 * null when the page cannot be read or lists files.
 */
export async function getMagentoForecastEmptyMessage(store: string, authHeader: string): Promise<string | null> {
    const html = await fetchMagentoCustomerPage("orderupload/upload/viewforcast/", store, authHeader);
    const m = html?.match(/<div class="orderupload-item-dv">([^<]*)<\/div>/);
    const text = m ? decodeHtml(m[1]).replace(/\n/g, " ").trim() : "";
    return text || null;
}

// ─── Header tyre-size search (Magento's #tyre-size-search-full popup) ───────────

/** One tyre size from Magento's header search list. */
export interface MagentoTyreSize {
    /** "275/50 R20" */
    label: string;
    /** Every way Magento lets you type it: "275/50R20 27550R20 2755020 275/50/20 275 50 20 275/50 R20" */
    lookup: string;
    width: string;
    /** "" when Magento has none for this size (Magento writes "None") */
    height: string;
    rim: string;
}

export interface MagentoTyreSizeSearch {
    sizes: MagentoTyreSize[];
    /** Input placeholder, e.g. "Search Tyre Size e.g 1956515 or 195/65 R15" */
    placeholder: string | null;
    /** Shown under 3 characters: "Please enter 3 or more characters" */
    minCharsText: string | null;
    /** Shown when nothing matches: "No results found" */
    noResultText: string | null;
}

const tyreSizeCache = new Map<string, { value: MagentoTyreSizeSearch; expires: number }>();

/**
 * Magento's own header tyre-size search for this store view: its list of sizes (with the lookup
 * text Magento matches what you type against) and its texts. Read from a customer page header
 * (logged in); cached 10 minutes per store view. null when Magento's page cannot be read.
 */
export async function getMagentoTyreSizeSearch(store: string, authHeader: string): Promise<MagentoTyreSizeSearch | null> {
    const hit = tyreSizeCache.get(store);
    if (hit && hit.expires > Date.now()) return hit.value;
    const html = await fetchMagentoCustomerPage("customer/account/", store, authHeader);
    if (!html) return null;
    const sizes = [...html.matchAll(/<li class="col[^"]*"[^>]*\slabel="([^"]*)"[^>]*\sdata-lookup="([^"]*)"[^>]*\sdata-width="([^"]*)"[^>]*\sdata-height="([^"]*)"[^>]*\sdata-rim="([^"]*)"[^>]*>/g)]
        .map((m) => ({
            label: decodeHtml(m[1]),
            lookup: decodeHtml(m[2]),
            width: decodeHtml(m[3]),
            height: /^none$/i.test(m[4]) ? "" : decodeHtml(m[4]),
            rim: decodeHtml(m[5]),
        }));
    if (sizes.length === 0) return null;
    const text = (id: string) => {
        const m = html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</`));
        return m ? decodeHtml(m[1]).replace(/\n/g, " ").trim() || null : null;
    };
    const value: MagentoTyreSizeSearch = {
        sizes,
        placeholder: (() => { const p = html.match(/id="tyre-size-search-full-input"[^>]*placeholder="([^"]*)"/)?.[1]; return p ? decodeHtml(p) : null; })(),
        minCharsText: text("full-search-3-or-more"),
        noResultText: text("full-search-no-result"),
    };
    tyreSizeCache.set(store, { value, expires: Date.now() + 10 * 60 * 1000 });
    return value;
}
