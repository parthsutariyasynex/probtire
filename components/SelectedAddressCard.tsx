"use client";

import React from "react";
import { Check } from "lucide-react";
import { Address } from "@/modules/checkout/hooks/useCheckout";
import { useTranslation } from "@/hooks/useTranslation";
import { useCountryNames } from "@/hooks/useCountryNames";

interface SelectedAddressCardProps {
    address: Address;
    onEdit: () => void;
}

const SelectedAddressCard: React.FC<SelectedAddressCardProps> = ({ address, onEdit }) => {
    const { t } = useTranslation();
    const countryName = useCountryNames();
    return (
        <div className="relative flex items-center justify-between w-full p-4 bg-white border-2 border-[#00A651] rounded-sm transition-all duration-300">
            {/* Green Square Box with Check Icon at Top-Right */}
            <div className="absolute top-0 right-0 bg-[#00A651] w-6 h-6 flex items-center justify-center">
                <Check className="text-white w-3.5 h-3.5" strokeWidth={4} />
            </div>

            {/* Left side: Address Text */}
            <div className="flex-1 pr-4">
                <p className="text-[13px] md:text-[14px] font-[800] text-black leading-relaxed" dir="ltr" style={{ unicodeBidi: "isolate" }}>
                    <span className="font-[800] text-black">{address.firstname} {address.lastname}</span>,{" "}
                    {address.street} {address.city} {address.postcode}{" "}
                    {countryName(address.country_id)} {address.telephone}
                    {[
                        address.custom_attributes?.find(ca => ca.attribute_code === 'store_view')?.value,
                        address.custom_attributes?.find(ca => ca.attribute_code === 'region_ship_to_party')?.value
                    ].filter(Boolean).map(val => ` ${val}`).join("")}
                </p>
            </div>

            {/* Right side: EDIT ADDRESS Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                }}
                className="bg-brand-yellow text-black text-[11px] font-[800] px-5 py-2.5 uppercase tracking-wider hover:bg-black hover:text-white transition-all duration-300 flex-shrink-0 rounded-sm"
            >
                {t("addressBook.editAddress")}
            </button>
        </div>
    );
};

export default SelectedAddressCard;
