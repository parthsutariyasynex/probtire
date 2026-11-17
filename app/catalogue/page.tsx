import React from "react";
import { getCurrentStore } from "@/lib/store/store-config";
import { getCataloguePage } from "@/src/lib/cmsPages";
import { serverT } from "@/src/lib/serverDict";
import CmsBanner from "@/components/CmsBanner";
import CmsUnavailable from "@/components/CmsUnavailable";

// Product Catalogue — content (banner, title, catalogue PDFs + covers) comes from the
// Magento CMS page "product-catalogue" of the selected website and language.
export const dynamic = "force-dynamic";

export default async function CataloguePage() {
    const { store, locale } = await getCurrentStore();
    const t = serverT(locale);
    const isRtl = locale === "ar";
    const page = await getCataloguePage(store);

    if (!page) {
        return <CmsUnavailable title={t("catalogue.title")} message={t("cms.unavailable")} rtl={isRtl} />;
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Banner Section */}
            {page.banner && (
                <CmsBanner banner={page.banner} alt={page.title} className="w-full h-[300px] md:h-[400px] lg:h-[500px]" />
            )}

            {/* Content Section */}
            <div className="max-w-[1200px] mx-auto px-6 mt-8 sm:mt-12 md:mt-20 pb-10 sm:pb-16 md:pb-20 flex flex-col items-center" dir={isRtl ? "rtl" : "ltr"}>
                <h1 className="text-[22px] sm:text-[26px] md:text-h1 font-black text-center mb-16 tracking-wide text-black uppercase">
                    {page.title}
                </h1>

                {/* Catalogue documents */}
                <div className="w-full mt-4 flex flex-wrap justify-center gap-6">
                    {page.items.map((item) => (
                        <a
                            key={item.href}
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col items-center border-[2px] border-gray-200 bg-white hover:border-gray-300 transition-colors duration-300 w-full sm:max-w-[280px] md:max-w-[300px]"
                        >
                            {item.image && (
                                <div className="w-full p-1 bg-white flex justify-center">
                                    <img src={item.image} alt={item.title} className="w-full h-auto object-contain" />
                                </div>
                            )}
                            <div className="w-full border-t-[2px] border-gray-200 py-3 px-2 flex flex-col items-center text-center bg-white group-hover:bg-gray-50 transition-colors">
                                <span className="text-black font-bold text-body-lg">{item.title}</span>
                                {item.subtitle && <span className="text-gray-600 text-body-sm mt-0.5">{item.subtitle}</span>}
                            </div>
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}
