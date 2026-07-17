"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store/store";
import { fetchCustomerInfo } from "@/store/actions/customerActions";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { redirectToLogin } from "@/utils/helpers";
import { AccountSkeleton, SidebarSkeleton } from "@/components/skeletons";
import { api } from "@/lib/api/api-client";
import toast from "react-hot-toast";

const ROLE_CACHE_KEY = "altalayi_user_type_v1";
const TOKEN_CACHE_KEY = "altalayi_role_token_v1";

type CustomAttribute = {
    attribute_code: string;
    value: string;
};

type Address = {
    id?: number | string;
    default_billing?: boolean;
    default_shipping?: boolean;
    firstname?: string;
    lastname?: string;
    street?: string[];
    city?: string;
    postcode?: string;
    country_id?: string;
    telephone?: string;
    company?: string;
    vat_id?: string;
    custom_attributes?: { attribute_code: string; value: string }[];
};

export default function SubAccountMyAccountPage() {
    const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
    const pathname = usePathname();
    const dispatch = useDispatch<AppDispatch>();
    const { data: session, status } = useSession();
    // Parent account data from Redux (for company info — populated by ProtectedLayout syncing the session token)
    const { data: parentCustomer, loading: parentLoading } = useSelector((state: RootState) => state.customer);
    const token = useSelector((state: RootState) => state.auth.token);

    const [isSubAccountSession, setIsSubAccountSession] = useState(false);
    // Sub-account's own customer data (from login response)
    const [subCustomer, setSubCustomer] = useState<any>(null);
    const [subLoading, setSubLoading] = useState(true);
    // Whether the user_type is "Company Sub Account" (direct login path)
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
        }).then(r => r.json()).then(data => {
            const type = data?.user_type || "Customer";
            if (type !== "Guest") {
                sessionStorage.setItem(ROLE_CACHE_KEY, type);
                sessionStorage.setItem(TOKEN_CACHE_KEY, accessToken);
            }
            setUserType(type);
            setRoleLoaded(true);
        }).catch(() => { setRoleLoaded(true); });
    }, [(session as any)?.accessToken]);

    // Check sub-account session & load sub-account customer data
    useEffect(() => {
        if (!roleLoaded) return;
        if (typeof window === "undefined") return;

        const isSub = localStorage.getItem("isSubAccount") === "true";
        const isDirectSubAccount = userType === "Company Sub Account";

        setIsSubAccountSession(isSub);

        if (!isSub && !isDirectSubAccount) {
            router.replace(lp("/customer/account"));
            return;
        }

        if (isSub) {
            // Via "Login as Sub Account" flow: show toast and load from localStorage
            toast.success(t("dashboard.subAccountBanner") || "You are logged as subaccount now.");

            const storedData = localStorage.getItem("subAccountData");
            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    const customerData = parsed.customer || parsed;
                    setSubCustomer(customerData);
                } catch { }
            }
        }

        // Always fetch fresh sub-account profile (works for both direct login and "Login as" flow)
        const fetchSubAccountProfile = async () => {
            try {
                const freshData = await api.get("/kleverapi/my-account");
                if (freshData) {
                    setSubCustomer(freshData);
                    if (isSub) {
                        const storedData = localStorage.getItem("subAccountData");
                        if (storedData) {
                            try {
                                const parsed = JSON.parse(storedData);
                                parsed.customer = freshData;
                                localStorage.setItem("subAccountData", JSON.stringify(parsed));
                            } catch { }
                        }
                    }
                }
            } catch (err) {
                console.error("[SubAccountMyAccountPage] Error fetching fresh profile:", err);
            } finally {
                setSubLoading(false);
            }
        };

        fetchSubAccountProfile();
    }, [pathname, router, roleLoaded, userType]);

    // Fetch parent account data (for company info)
    useEffect(() => {
        if (status === "unauthenticated") {
            redirectToLogin(router);
            return;
        }

        if (status === "authenticated" && token) {
            dispatch(fetchCustomerInfo());
        }
    }, [status, token, dispatch, router]);

    if (!roleLoaded || parentLoading || (!subCustomer && subLoading)) {
        return (
            <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
                <div className="flex flex-col lg:flex-row flex-1 w-full">
                    <SidebarSkeleton />
                    <main className="flex-1 min-w-0">
                        <AccountSkeleton />
                    </main>
                </div>
            </div>
        );
    }

    // Only block render if we've loaded the role and it's not a sub account at all
    if (roleLoaded && userType !== "Company Sub Account" && !isSubAccountSession) return null;

    // Helper: get attribute from PARENT account data (for company info). Safe when parentCustomer is null.
    const getParentAttr = (code: string, fallback: string = "N/A") => {
        if (!parentCustomer) return fallback;
        if ((parentCustomer as any)[code] !== undefined) return (parentCustomer as any)[code];
        if ((parentCustomer as any).extension_attributes?.[code] !== undefined) {
            return (parentCustomer as any).extension_attributes[code];
        }
        const attr = (parentCustomer as any).custom_attributes?.find(
            (a: CustomAttribute) => a.attribute_code === code
        )?.value;
        return attr || fallback;
    };

    // ===== CONTACT INFORMATION (from sub-account login customer) =====
    const contactName = subCustomer
        ? `${subCustomer.firstname || ""} ${subCustomer.lastname || ""}`.trim()
        : (typeof localStorage !== "undefined" ? localStorage.getItem("subAccountName") : null) || "N/A";
    const contactEmail = subCustomer?.email || "N/A";
    const contactMobile = subCustomer?.custom_attributes?.find((a: any) => a.attribute_code === "customer_mobile")?.value
        || subCustomer?.customer_mobile || "";

    // ===== COMPANY INFORMATION (from parent account) =====
    const companyName = getParentAttr("company_name");
    const companyContactName = parentCustomer
        ? `${(parentCustomer as any).firstname || ""} ${(parentCustomer as any).lastname || ""}`.trim() || "N/A"
        : "N/A";
    const companyEmail = (parentCustomer as any)?.email || "N/A";

    // Parent addresses for mobile fallback
    const parentAddresses = (parentCustomer as any)?.addresses as Address[] | undefined;
    const parentDefaultBilling = parentAddresses?.find((a: Address) => a.default_billing);
    const parentDefaultShipping = parentAddresses?.find((a: Address) => a.default_shipping);

    const customerMobile = getParentAttr("mobile") !== "N/A"
        ? getParentAttr("mobile")
        : getParentAttr("mobile_number") !== "N/A"
            ? getParentAttr("mobile_number")
            : getParentAttr("customer_mobile") !== "N/A"
                ? getParentAttr("customer_mobile")
                : parentDefaultBilling?.telephone || parentDefaultShipping?.telephone || parentAddresses?.[0]?.telephone || "N/A";

    const customerCode = getParentAttr("customer_code");

    // ===== ADDRESSES (from sub-account login customer - has vat_id) =====
    const subAddresses = subCustomer?.addresses as Address[] | undefined;
    const defaultBilling = subAddresses?.find((a: Address) => a.default_billing);
    const defaultShipping = subAddresses?.find((a: Address) => a.default_shipping);

    const cardBase = "border border-gray-300 bg-white shadow-sm rounded-none";
    const sectionHeader = "bg-[#f5f5f5] px-3 md:px-4 py-2.5 md:py-3 border-b border-gray-300 text-black font-bold uppercase text-body-sm md:text-body";

    return (
        <div className="min-h-screen flex flex-col w-full bg-surface font-rubik">
            <div className="flex flex-col lg:flex-row flex-1 w-full">
                <Sidebar />

                {/* Right Content */}
                <main className="flex-1 p-4 md:p-8 bg-white min-h-0">



                    <h1 className="text-h3 md:text-[26px] font-bold text-black mb-5 uppercase tracking-wide">
                        MY ACCOUNT
                    </h1>

                    <div className="space-y-6 md:space-y-8">
                        {/* ACCOUNT INFORMATION */}
                        <div>
                            <h2 className="text-body-lg md:text-h3-sm font-bold text-black uppercase mb-2 md:mb-3">ACCOUNT INFORMATION</h2>
                            <hr className="border-gray-200 mb-4 md:mb-6" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                {/* Contact Information - from SUB-ACCOUNT login customer */}
                                <div className={cardBase}>
                                    <div className={sectionHeader}>
                                        CONTACT INFORMATION
                                    </div>
                                    <div className="p-3 md:p-5 text-body text-gray-800 space-y-2 font-normal leading-relaxed">
                                        <p><span className="text-black font-bold">Contact Name:</span> {contactName}</p>
                                        <p><span className="text-black font-bold">Email:</span> {contactEmail}</p>
                                        {contactMobile && <p><span className="text-black font-bold">Customer Mobile:</span> {contactMobile}</p>}
                                        <p><span className="text-black font-bold">Contact Information:</span> {contactEmail}{contactMobile ? ` ,${contactMobile}` : ""}</p>
                                    </div>
                                </div>

                                {/* Company Information - from PARENT account */}
                                <div className={cardBase}>
                                    <div className={sectionHeader}>
                                        COMPANY INFORMATION
                                    </div>
                                    <div className="p-3 md:p-5 text-body text-gray-800 space-y-2 font-normal leading-relaxed">
                                        <p><span className="text-black font-bold">Company Name:</span> {companyName}</p>
                                        <p><span className="text-black font-bold">Company Contact Name:</span> {companyContactName}</p>
                                        <p><span className="text-black font-bold">Company Email:</span> {companyEmail}</p>
                                        <p><span className="text-black font-bold">Customer Mobile:</span> {customerMobile}</p>
                                        <p><span className="text-black font-bold">Customer Code:</span> {customerCode}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ADDRESS BOOK - from SUB-ACCOUNT login customer (has vat_id) */}
                        <div>
                            <h2 className="text-body-lg md:text-h3-sm font-bold text-black uppercase mb-2 md:mb-3">ADDRESS BOOK</h2>
                            <hr className="border-gray-200 mb-4 md:mb-6" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                {/* Default Billing Address */}
                                <div className={cardBase + " flex flex-col"}>
                                    <div className={sectionHeader}>
                                        DEFAULT BILLING ADDRESS
                                    </div>
                                    <div className="p-3 md:p-5 flex flex-col flex-1">
                                        {defaultBilling ? (
                                            <div className="text-body text-gray-800 leading-relaxed space-y-1 font-normal flex-1">
                                                <p>{defaultBilling.firstname} {defaultBilling.lastname}</p>
                                                <p>{defaultBilling.company}</p>
                                                {defaultBilling.street?.map((s: string, i: number) => <p key={i}>{s}</p>)}
                                                <p>{defaultBilling.city}, {defaultBilling.postcode}</p>
                                                <p>{defaultBilling.country_id === 'SA' ? 'Saudi Arabia' : defaultBilling.country_id}</p>
                                                <p>T: {defaultBilling.telephone}</p>
                                                {defaultBilling.vat_id && <p>VAT: {defaultBilling.vat_id}</p>}
                                            </div>
                                        ) : (
                                            <p className="text-body text-gray-500 italic flex-1">No default billing address set.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Default Shipping Address */}
                                <div className={cardBase + " flex flex-col"}>
                                    <div className={sectionHeader}>
                                        DEFAULT SHIPPING ADDRESS
                                    </div>
                                    <div className="p-3 md:p-5 flex flex-col flex-1">
                                        {defaultShipping ? (
                                            <div className="text-body text-gray-800 leading-relaxed space-y-1 font-normal flex-1">
                                                <p>{defaultShipping.firstname} {defaultShipping.lastname}</p>
                                                <p>{defaultShipping.company}</p>
                                                {defaultShipping.street?.map((s: string, i: number) => <p key={i}>{s}</p>)}
                                                <p>{defaultShipping.city}, {defaultShipping.postcode}</p>
                                                <p>{defaultShipping.country_id === 'SA' ? 'Saudi Arabia' : defaultShipping.country_id}</p>
                                                <p>T: {defaultShipping.telephone}</p>
                                                {defaultShipping.vat_id && <p>VAT: {defaultShipping.vat_id}</p>}
                                            </div>
                                        ) : (
                                            <p className="text-body text-gray-500 italic flex-1">No default shipping address set.</p>
                                        )}

                                        <div className="pt-8">
                                            {defaultShipping?.id ? (
                                                <Link
                                                    href={lp(`/customer/address/edit/id/${defaultShipping.id}`)}
                                                    className="btn-primary inline-block w-full sm:w-auto text-center"
                                                >
                                                    EDIT ADDRESS
                                                </Link>
                                            ) : (
                                                <Link
                                                    href={lp("/customer/address")}
                                                    className="btn-primary inline-block w-full sm:w-auto text-center"
                                                >
                                                    EDIT ADDRESS
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
