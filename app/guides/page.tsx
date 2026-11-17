import React from "react";
import { getCurrentStore } from "@/lib/store/store-config";
import { getGuidesPage } from "@/src/lib/cmsPages";
import { serverT } from "@/src/lib/serverDict";
import CmsUnavailable from "@/components/CmsUnavailable";
import GuidesView from "./GuidesView";

// User Guides — banner, title, guide cards and videos come from the Magento CMS page
// "user-guides" of the selected website and language. No page → "content not available".
export const dynamic = "force-dynamic";

export default async function UserGuidesPage() {
    const { store, locale } = await getCurrentStore();
    const page = await getGuidesPage(store);

    if (!page) {
        const t = serverT(locale);
        return <CmsUnavailable title={t("guides.title")} message={t("cms.unavailable")} rtl={locale === "ar"} />;
    }
    return <GuidesView page={page} />;
}
