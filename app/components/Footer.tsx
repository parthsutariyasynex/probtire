"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Phone, Share2, Facebook, Instagram, Twitter, Linkedin, Youtube, Link2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";
import { usePathname } from "next/navigation";
import { toStoreCode } from "@/lib/store/website";
import type { FooterData } from "@/src/lib/magentoFooter";

// Footer of the selected website + language. Email, phone, social links and the copyright
// come from that store view's Magento storefront footer (/api/kleverapi/footer →
// src/lib/magentoFooter.ts). A website without one shows no contact section — never
// another website's details. Section headings and policy links are UI labels.

const SOCIAL_ICONS: Record<string, React.ComponentType<{ size?: number; fill?: string }>> = {
    facebook: Facebook,
    instagram: Instagram,
    twitter: Twitter,
    linkedin: Linkedin,
    youtube: Youtube,
};

// Per store view, for this browser tab (the footer is on every page).
const footerCache = new Map<string, FooterData | null>();

const Footer: React.FC = () => {
    const { t, locale } = useTranslation();
    const lp = useLocalePath();
    const pathname = usePathname();
    // Pages with the fixed "Search by size" bar at the bottom (xl): /products and the SEO
    // category URLs that middleware rewrites to it (e.g. /en/all-tyres/car-tyres.html).
    // The footer gets bottom padding there so the bar never covers it.
    const isProductsPage = Boolean(pathname?.includes("/products") || pathname?.endsWith(".html"));

    const store = typeof document !== "undefined" ? toStoreCode(locale, document.cookie) : locale;
    const [footer, setFooter] = useState<FooterData | null>(() => footerCache.get(store) ?? null);

    useEffect(() => {
        if (footerCache.has(store)) {
            setFooter(footerCache.get(store) ?? null);
            return;
        }
        let cancelled = false;
        setFooter(null);
        fetch(`/api/kleverapi/footer?lang=${locale}`, { headers: { "x-locale": locale }, cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d) => {
                const data: FooterData | null = d?.footer ?? null;
                footerCache.set(store, data);
                if (!cancelled) setFooter(data);
            })
            .catch((err) => console.warn("[Footer] contact details unavailable:", err?.message || err));
        return () => { cancelled = true; };
    }, [store, locale]);

    const contactSections = [
        footer?.emails.length ? "email" : null,
        footer?.phones.length ? "phone" : null,
        footer?.socials.length ? "social" : null,
    ].filter(Boolean) as string[];

    return (
        <footer id="footer" className={`bg-black text-white py-6 sm:py-8 font-rubik transition-all duration-300 ${isProductsPage ? "xl:pb-[110px]" : ""}`}>
            <div className="max-w-[1920px] mx-auto px-6">
                {contactSections.length > 0 && (
                    <div
                        className={`grid grid-cols-1 gap-6 md:gap-12 text-center pb-5 border-b border-gray-800/40 ${
                            contactSections.length === 3 ? "md:grid-cols-3" : contactSections.length === 2 ? "md:grid-cols-2" : ""
                        }`}
                    >
                        {/* Phone */}
                        {footer!.phones.length > 0 && (
                            <div className="flex flex-col items-center group">
                                <div className="mb-2 text-white group-hover:scale-110 transition-transform duration-300">
                                    <Phone className="w-8 h-8 md:w-10 md:h-10" strokeWidth={1.2} />
                                </div>
                                <h3 className="text-sm sm:text-lg font-bold mb-1 tracking-tight">{t("footer.callUs")}</h3>
                                {footer!.phones.map((p) => (
                                    <a key={p.href} href={p.href} dir="ltr" className="text-gray-400 hover:text-brand-yellow transition-colors text-xs sm:text-base font-bold">
                                        {p.label}
                                    </a>
                                ))}
                            </div>
                        )}

                        {/* Email */}
                        {footer!.emails.length > 0 && (
                            <div className="flex flex-col items-center group">
                                <div className="mb-2 text-white group-hover:scale-110 transition-transform duration-300">
                                    <Mail className="w-8 h-8 md:w-10 md:h-10" strokeWidth={1.2} />
                                </div>
                                <h3 className="text-sm sm:text-lg font-bold mb-1 tracking-tight">{t("footer.email")}</h3>
                                {footer!.emails.map((e) => (
                                    <a key={e.href} href={e.href} className="text-gray-400 hover:text-brand-yellow transition-colors text-xs sm:text-base font-bold">
                                        {e.label}
                                    </a>
                                ))}
                            </div>
                        )}

                        {/* Social */}
                        {footer!.socials.length > 0 && (
                            <div className="flex flex-col items-center group">
                                <div className="mb-2 text-white group-hover:scale-110 transition-transform duration-300">
                                    <Share2 className="w-8 h-8 md:w-10 md:h-10" strokeWidth={1.2} />
                                </div>
                                <h3 className="text-sm sm:text-lg font-bold mb-1 tracking-tight">{t("footer.socialConnect")}</h3>
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    {footer!.socials.map((s) => {
                                        const Icon = SOCIAL_ICONS[s.network] || Link2;
                                        return (
                                            <a
                                                key={s.href}
                                                href={s.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={s.label}
                                                title={s.label}
                                                className="w-8 h-8 sm:w-9 sm:h-9 bg-white text-black rounded-full flex items-center justify-center hover:bg-brand-yellow hover:text-white transition-all transform hover:scale-110"
                                            >
                                                <Icon size={15} />
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Bottom Bar */}
                <div className={`${contactSections.length > 0 ? "mt-5" : ""} flex flex-col items-center gap-3 text-center`}>
                    {footer?.copyright && (
                        <p className="text-gray-500 text-[10px] sm:text-xs font-semibold">{footer.copyright}</p>
                    )}
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                        <Link href={lp("/privacy-policy")} className="text-white hover:text-brand-yellow transition-colors">{t("footer.privacyPolicy")}</Link>
                        <Link href={lp("/return-exchange-policy")} className="text-white hover:text-brand-yellow transition-colors">{t("footer.returnExchangePolicy")}</Link>
                        <Link href={lp("/terms-conditions")} className="text-white hover:text-brand-yellow transition-colors">{t("footer.termsConditions")}</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
