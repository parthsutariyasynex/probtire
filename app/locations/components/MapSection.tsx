"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useBranchLocations } from "../useBranchLocations";

// Map centred where Magento's Branch Locations page centres it (its google.maps.LatLng),
// for the selected website. No map is shown when Magento's page has no position.

const MapSection: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const { t } = useTranslation();
    const { locations } = useBranchLocations();
    const center = locations?.center ?? null;

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.1 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <section
            ref={ref}
            className={`w-full h-[200px] sm:h-[280px] md:h-[350px] relative overflow-hidden transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
            {center && (
                <iframe
                    src={`https://maps.google.com/maps?q=${center.lat},${center.lng}&z=14&output=embed`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={t("locations.mapSection")}
                ></iframe>
            )}
        </section>
    );
};

export default MapSection;
