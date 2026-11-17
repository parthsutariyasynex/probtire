import React from "react";
import type { CmsBanner as Banner } from "@/src/lib/cmsPages";

// Banner image from a Magento CMS page (desktop + optional mobile source).
export default function CmsBanner({ banner, alt, className }: { banner: Banner; alt: string; className: string }) {
    return (
        <div className={className}>
            <picture className="block w-full h-full">
                {banner.mobile && <source srcSet={banner.mobile} media="(max-width: 767px)" />}
                <img src={banner.desktop} alt={alt} className="w-full h-full object-cover" />
            </picture>
        </div>
    );
}
