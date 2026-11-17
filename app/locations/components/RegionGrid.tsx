"use client";

import React from "react";
import RegionCard from "./RegionCard";
import { useTranslation } from "@/hooks/useTranslation";
import { useBranchLocations } from "../useBranchLocations";

// Branch regions of the selected website + language, exactly as Magento's Branch Locations
// page lists them (title, address lines, Magento's own map link).
const RegionGrid: React.FC = () => {
    const { t } = useTranslation();
    const { locations, loading } = useBranchLocations();

    if (loading) {
        return (
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
                {[0, 1, 2].map((i) => <div key={i} className="h-40 bg-gray-100 animate-pulse rounded-sm" />)}
            </section>
        );
    }

    if (!locations || locations.regions.length === 0) {
        return <p className="text-center text-body text-gray-600 py-10">{t("cms.unavailable")}</p>;
    }

    return (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {locations.regions.map((region, index) => (
                <RegionCard
                    key={`${region.title}-${index}`}
                    title={region.title}
                    address={region.lines.join("\n")}
                    mapLink={region.mapLink}
                    index={index}
                />
            ))}
        </section>
    );
};

export default RegionGrid;
