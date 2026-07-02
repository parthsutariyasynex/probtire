"use client";
import { useTranslation } from "@/hooks/useTranslation";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import { useDispatch, useSelector } from "react-redux";
import { fetchCustomerInfo } from "@/store/actions/customerActions";
import { RootState } from "@/store/store";
import Link from "next/link";
import Addresses from "../../components/Addresses";
import { redirectToLogin } from "@/utils/helpers";
import { AddressBookSkeleton, SidebarSkeleton } from "@/components/skeletons";

export default function AddressBookPage() {
    const router = useRouter();
    const { t, isRtl } = useTranslation();
    const dispatch = useDispatch();
    const { data: session, status } = useSession();
    const { data: customer, loading } = useSelector((state: RootState) => state.customer);
    const token = useSelector((state: RootState) => state.auth.token);

    useEffect(() => {
        if (status === "unauthenticated") {
            redirectToLogin(router);
            return;
        }

        if (status === "authenticated" && token) {
            // @ts-ignore
            dispatch(fetchCustomerInfo());
        }
    }, [dispatch, status, router, token]);

    if (status === "loading" || loading) {
        return (
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 w-full bg-white font-rubik">
                <SidebarSkeleton />
                <main className="flex-1 w-full min-w-0 px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white">
                    <div className="flex items-center gap-4 mb-6">
                        <h1 className="text-h3 md:text-h1-sm font-semibold text-black uppercase tracking-tight whitespace-nowrap">
                            {t("addressBook.title")}
                        </h1>
                    </div>
                    <AddressBookSkeleton />
                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 w-full">
            {/* Left Sidebar */}
            <Sidebar />

            {/* Right Content */}
            <main className="flex-1 w-full min-w-0 px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white" dir={isRtl ? "rtl" : "ltr"}>
                <div className="flex items-center gap-4 mb-6">
                    <h1 className="text-h3 md:text-h1-sm font-semibold text-black uppercase tracking-tight whitespace-nowrap">
                        {t("addressBook.title")}
                    </h1>
                </div>
                <Addresses />
            </main>
        </div>
    );
}
