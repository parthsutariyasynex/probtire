"use client";
import { useTranslation } from "@/hooks/useTranslation";

import React, { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import FavouriteProducts from "@/app/components/FavouriteProducts";
import Sidebar from "@/components/Sidebar";
import { redirectToLogin } from "@/utils/helpers";

export default function FavoritesPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const { t } = useTranslation();

    useEffect(() => {
        if (authStatus === "unauthenticated") {
            redirectToLogin(router);
        }
    }, [authStatus, router]);

    return (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-white font-rubik">
            <Sidebar />

            <div className="w-full bg-white">
                <FavouriteProducts
                    title={
                        <h1 className="text-h3 md:text-[26px] font-bold text-black uppercase tracking-wide">
                            {t("sidebar.favoriteProducts")}
                        </h1>
                    }
                />
            </div>
        </div>
    );
}
