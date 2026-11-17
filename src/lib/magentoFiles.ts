// Uploaded checkout files (PO / payment commitment) as Magento returns them.
//
// Magento's kleverGetPoFiles returns [String] file names (e.g. "Screenshot_…-1794913201.png").
// Magento stores each upload under media/orderupload/ in its standard dispersion folders —
// the first two characters of the stored name, lower-cased ("." → "_") — e.g.
//   https://pro.btire.com/media/orderupload/s/c/Screenshot_1948-05-30_at_2.10.12___PM-1794913201.png
// (the link Magento's own checkout opens). A full URL from Magento is used as is.

const ORDER_UPLOAD_DIR = "media/orderupload";

/** Magento's dispersion folders for a stored file name: "Screenshot.png" → "s/c". */
function dispersionPath(fileName: string): string {
    return Array.from(fileName.slice(0, 2))
        .map((c) => (c === "." ? "_" : c.toLowerCase()))
        .join("/");
}

/** Magento URL of an uploaded file (Magento's own link, or its orderupload storage path). */
export function magentoFileUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    const base = (process.env.NEXT_PUBLIC_MAGENTO_BASE_URL || "").replace(/\/+$/, "");
    if (!base) return null;
    // A path on the Magento site, e.g. "/media/…" or "pub/media/…".
    if (/^\/?(pub\/)?media\//i.test(v)) return `${base}/${v.replace(/^\/+/, "").replace(/^pub\//, "")}`;
    // A stored file name → Magento's orderupload location for it.
    if (v.includes("/")) return null;
    return `${base}/${ORDER_UPLOAD_DIR}/${dispersionPath(v)}/${encodeURIComponent(v)}`;
}

/** Name to show for an uploaded file (the file part of a URL, or the name itself). */
export function magentoFileName(value: string): string {
    if (!magentoFileUrl(value)) return value;
    const last = value.split("?")[0].split("/").pop() || value;
    try { return decodeURIComponent(last); } catch { return last; }
}

/** Open the file in a new tab — only when Magento gave a real URL. Returns false otherwise. */
export function openMagentoFile(value: string): boolean {
    const url = magentoFileUrl(value);
    if (!url) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
}

// Upload rules for checkout files (PO + payment commitment) — one list for every page, so the
// checkout and the multi-address review accept the same files. Magento's API does not expose
// these limits; they mirror the file types Magento's own checkout states.
export const UPLOAD_EXTENSIONS = [".jpg", ".jpeg", ".png", ".zip", ".rar", ".docx", ".doc", ".pdf", ".xls", ".xlsx", ".csv", ".msg"];
export const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.join(",");
/** "jpg,jpeg,png,…" — the list shown under the drop area. */
export const UPLOAD_TYPES_TEXT = UPLOAD_EXTENSIONS.map((e) => e.slice(1)).join(",");
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
