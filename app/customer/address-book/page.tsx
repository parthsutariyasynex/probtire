"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import { useDispatch, useSelector } from "react-redux";
import { fetchCustomerInfo } from "@/store/actions/customerActions";
import { RootState } from "@/store/store";
import Addresses from "../../components/Addresses";
import { redirectToLogin } from "@/utils/helpers";
import { AddressBookSkeleton, SidebarSkeleton } from "@/components/skeletons";
import toast from "react-hot-toast";

const ROLE_CACHE_KEY = "altalayi_user_type_v1";
const TOKEN_CACHE_KEY = "altalayi_role_token_v1";

export default function AddressBookPage() {
    const router = useRouter();
    const lp = useLocalePath();
    const { t, isRtl } = useTranslation();
    const dispatch = useDispatch();
    const { data: session, status } = useSession();
    const { data: customer, loading } = useSelector((state: RootState) => state.customer);
    const token = useSelector((state: RootState) => state.auth.token);

    const [userType, setUserType] = useState<string>("");
    const [roleLoaded, setRoleLoaded] = useState(false);

    // Resolve user_type from sessionStorage cache or account-sidebar API
    useEffect(() => {
        const accessToken = (session as any)?.accessToken as string | undefined;
        if (!accessToken) { setRoleLoaded(true); return; }
        if (typeof sessionStorage === "undefined") { setRoleLoaded(true); return; }

        if (sessionStorage.getItem(TOKEN_CACHE_KEY) === accessToken) {
            setUserType(sessionStorage.getItem(ROLE_CACHE_KEY) || "");
            setRoleLoaded(true);
            return;
        }

        fetch("/api/kleverapi/account-sidebar", {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
            .then(r => r.json())
            .then(data => {
                const type = data?.user_type || "Customer";
                if (type !== "Guest") {
                    sessionStorage.setItem(ROLE_CACHE_KEY, type);
                    sessionStorage.setItem(TOKEN_CACHE_KEY, accessToken);
                }
                setUserType(type);
                setRoleLoaded(true);
            })
            .catch(() => { setRoleLoaded(true); });
    }, [(session as any)?.accessToken]);

    // Company Sub Account: show Magento-equivalent warning and redirect to /customer/account
    useEffect(() => {
        if (!roleLoaded) return;
        if (userType === "Company Sub Account") {
            toast.error("You don't have permission to edit account address information.");
            router.replace(lp("/customer/account"));
        }
    }, [roleLoaded, userType]);

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

    if (status === "loading" || loading || !roleLoaded) {
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

    // Block render while redirect is in progress for Company Sub Account
    if (userType === "Company Sub Account") return null;

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
