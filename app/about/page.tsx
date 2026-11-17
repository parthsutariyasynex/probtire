import React from "react";
import { getCurrentStore } from "@/lib/store/store-config";
import { getAboutPage } from "@/src/lib/cmsPages";
import { serverT } from "@/src/lib/serverDict";
import CmsBanner from "@/components/CmsBanner";
import CmsUnavailable from "@/components/CmsUnavailable";

// About Us — banner, title and text come from the Magento CMS page "about-us" of the
// selected website and language. No page in Magento → "content not available".
export const dynamic = "force-dynamic";

export default async function AboutPage() {
    const { store, locale } = await getCurrentStore();
    const t = serverT(locale);
    const isRtl = locale === "ar";
    const page = await getAboutPage(store);

    if (!page) {
        return <CmsUnavailable title={t("about.title")} message={t("cms.unavailable")} rtl={isRtl} />;
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Banner Section */}
            {page.banner && (
                <CmsBanner banner={page.banner} alt={page.title} className="relative w-full h-[300px] md:h-[400px] lg:h-[500px]" />
            )}

            {/* Content Section */}
            <div className="max-w-[1200px] mx-auto px-6 mt-8 sm:mt-12 md:mt-20 pb-20" dir={isRtl ? "rtl" : "ltr"}>
                <h1 className="text-[22px] sm:text-[26px] md:text-h1 font-bold text-center mb-16 tracking-wide text-black uppercase">
                    {page.title}
                </h1>

                <div
                    className={`text-black font-normal text-body-lg sm:text-body-xl md:text-h3-sm leading-[1.8] max-w-[1000px] mx-auto
                        [&_p]:mb-10 [&_p:last-child]:mb-0 [&_h2]:font-bold [&_h3]:font-bold [&_h4]:font-bold [&_h3]:mb-3
                        [&_ol]:list-decimal [&_ul]:list-disc [&_ol]:ps-6 [&_ul]:ps-6 [&_ol]:mb-10 [&_ul]:mb-10 [&_li]:mb-3
                        [&_a]:underline [&_a]:decoration-brand-yellow
                        ${isRtl ? "text-right" : "text-center md:text-left"}`}
                    // Sanitized in src/lib/cmsPages.ts (formatting tags only).
                    dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
                />
            </div>
        </div>
    );
}
