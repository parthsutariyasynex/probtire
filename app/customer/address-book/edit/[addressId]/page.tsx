"use client";
import { useTranslation } from "@/hooks/useTranslation";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import Sidebar from "@/components/Sidebar";
import { api } from "@/lib/api/api-client";
import { EditAddressSkeleton, SidebarSkeleton } from "@/components/skeletons";

export default function EditAddressPage() {
    return (
        <Suspense fallback={null}>
            <EditAddressPageContent />
        </Suspense>
    );
}

function EditAddressPageContent() {
    const { addressId } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { t } = useTranslation();

    const [formData, setFormData] = useState({
        firstname: "",
        lastname: "",
        telephone: "",
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [addressData, setAddressData] = useState<any>(null);

    useEffect(() => {
        const fetchAddress = async () => {
            try {
                setLoading(true);

                let data = null;

                // Check if this is a sub-account session — address may be in localStorage
                const isSubAccount = typeof window !== "undefined" && localStorage.getItem("isSubAccount") === "true";
                if (isSubAccount) {
                    const storedData = localStorage.getItem("subAccountData");
                    if (storedData) {
                        const parsed = JSON.parse(storedData);
                        const subCustomer = parsed.customer || parsed;
                        const subAddresses = subCustomer.addresses || [];
                        data = subAddresses.find((a: any) => String(a.id) === String(addressId));
                    }
                }

                // If not found in sub-account data, fetch from parent API
                if (!data) {
                    const addresses = await api.get(`/kleverapi/addresses`);
                    data = Array.isArray(addresses)
                        ? addresses.find((a: any) => String(a.id) === String(addressId))
                        : null;
                }

                if (!data) {
                    throw new Error("Address not found");
                }

                setAddressData(data);
                setFormData({
                    firstname: data.firstname || "",
                    lastname: data.lastname || "",
                    telephone: data.telephone || "",
                });
            } catch (err: any) {
                toast.error(err || t("addressBook.addressFetchFailed"));
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (addressId) {
            fetchAddress();
        }
    }, [addressId]);

    const validateForm = () => {
        const tempErrors: Record<string, string> = {};
        if (!formData.firstname.trim()) {
            tempErrors.firstname = t("addressBook.firstNameRequired");
        }
        if (!formData.lastname.trim()) {
            tempErrors.lastname = t("addressBook.lastNameRequired");
        }
        if (!formData.telephone.trim()) {
            tempErrors.telephone = t("addressBook.phoneRequired");
        }
        setErrors(tempErrors);
        return Object.keys(tempErrors).length === 0;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
        if (errors[name]) {
            setErrors((prev) => ({
                ...prev,
                [name]: "",
            }));
        }
    };

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        try {
            setSaving(true);
            const updatePayload = {
                firstname: formData.firstname,
                lastname: formData.lastname,
                telephone: formData.telephone,
                street: addressData?.street || [],
                city: addressData?.city || "",
                country_code: addressData?.country_code || "AE",
                postcode: addressData?.postcode || "",
                region: addressData?.region ? {
                    region_code: addressData.region.region_code || "",
                    region: addressData.region.region || "",
                    region_id: addressData.region.region_id || 0
                } : null,
                default_shipping: addressData?.default_shipping || false,
                default_billing: addressData?.default_billing || false,
            };

            await api.put(`/kleverapi/addresses/${addressId}`, updatePayload);
            toast.success(t("addressBook.addressUpdated"));

            // Redirect back to original page or address book
            const redirectUrl = searchParams.get("redirect") || "/customer/address-book";
            router.push(redirectUrl);
        } catch (err: any) {
            toast.error(err || t("addressBook.addressUpdateFailed"));
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 w-full bg-white font-rubik">
                <SidebarSkeleton />
                <EditAddressSkeleton />
            </div>
        );
    }

    const inputClass = "w-full border border-gray-200 px-4 py-2 text-body-lg focus:border-brand-yellow outline-none transition-all rounded-sm bg-white font-medium text-gray-800 placeholder:text-gray-300 ltr:text-left rtl:text-right";
    const labelClass = "block text-body font-bold text-gray-900 mb-1.5 ltr:text-left rtl:text-right";

    return (
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 w-full bg-white font-rubik">
            <Sidebar />

            <main className="flex-1 w-full min-w-0 px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-5 bg-white">
                <h1 className="text-h3 md:text-h1-sm font-semibold text-black uppercase tracking-tight mb-3 ltr:text-left rtl:text-right">
                    {t("addressBook.editAddress")}
                </h1>

                <div className="bg-white border border-[#ddd] shadow-sm overflow-hidden max-w-4xl">
                    {/* Section Header */}
                    <div className="bg-surfaceHover px-4 py-3 border-b border-[#ddd]">
                        <h2 className="text-label font-bold text-black uppercase tracking-widest ltr:text-left rtl:text-right">
                            {t("addressBook.contactInformation")}
                        </h2>
                    </div>

                    <div className="p-4 md:p-3">
                        <form onSubmit={onSubmit} className="space-y-2 md:space-y-2">
                            {/* First Name */}
                            <div className="space-y-2">
                                <label className={labelClass}>
                                    {t("addressBook.firstName")} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="firstname"
                                    value={formData.firstname}
                                    onChange={handleInputChange}
                                    type="text"
                                    className={`${inputClass} ${errors.firstname ? 'border-red-500' : ''}`}
                                    placeholder={t("addressBook.firstName")}
                                />
                                {errors.firstname && (
                                    <p className="mt-1 text-xs text-red-500 ltr:text-left rtl:text-right">{errors.firstname}</p>
                                )}
                            </div>

                            {/* Last Name */}
                            <div className="space-y-2">
                                <label className={labelClass}>
                                    {t("addressBook.lastName")} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="lastname"
                                    value={formData.lastname}
                                    onChange={handleInputChange}
                                    type="text"
                                    className={`${inputClass} ${errors.lastname ? 'border-red-500' : ''}`}
                                    placeholder={t("addressBook.lastName")}
                                />
                                {errors.lastname && (
                                    <p className="mt-1 text-xs text-red-500 ltr:text-left rtl:text-right">{errors.lastname}</p>
                                )}
                            </div>

                            {/* Phone Number */}
                            <div className="space-y-2">
                                <label className={labelClass}>
                                    {t("addressBook.phoneNumber")} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="telephone"
                                    value={formData.telephone}
                                    onChange={handleInputChange}
                                    type="tel"
                                    dir="ltr"
                                    className={`${inputClass} ${errors.telephone ? 'border-red-500' : ''}`}
                                    placeholder={t("addressBook.phoneNumber")}
                                />
                                {errors.telephone && (
                                    <p className="mt-1 text-xs text-red-500 ltr:text-left rtl:text-right">{errors.telephone}</p>
                                )}
                            </div>

                            {/* Save Button */}
                            <div className="pt-2 ltr:text-left rtl:text-right">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="bg-brand-yellow hover:bg-brand-yellow-dark text-black text-body-sm font-bold px-6 py-2 uppercase transition-all shadow-sm tracking-widest active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                    {saving ? (
                                        t("common.loading")
                                    ) : (
                                        t("addressBook.saveAddress")
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    );
}
