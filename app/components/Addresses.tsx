"use client";
import { useLocalePath } from "@/hooks/useLocalePath";
import { useTranslation } from "@/hooks/useTranslation";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { fetchAddresses, deleteAddress, setDefaultAddress } from "@/store/actions/addressActions";
import { RootState } from "@/store/store";
import toast from "react-hot-toast";
import Pagination from "@/components/Pagination";
import PortalDropdown from "@/components/PortalDropdown";
import { AddressBookSkeleton } from "@/components/skeletons";

type Address = {
  id: number | string;
  firstname?: string;
  lastname?: string;
  company?: string;
  street?: string[];
  city?: string;
  country_id?: string;
  country_code?: string;
  region?: {
    region?: string;
  };
  postcode?: string;
  telephone?: string;
  default_billing?: boolean;
  default_shipping?: boolean;
};

type AddressCardProps = {
  title: string;
  address?: Address;
  onEdit?: (id: number | string) => void;
  buttonLabel?: string;
  t: (key: string) => string;
  isRtl: boolean;
};

function AddressCard({ title, address, onEdit, buttonLabel, t, isRtl }: AddressCardProps) {
  return (
    <div className="border border-[#ddd] shadow-sm flex flex-col h-full bg-white font-rubik">
      <div className="bg-surfaceHover px-4 py-3 border-b border-[#ddd] uppercase text-label font-bold text-black tracking-widest ltr:text-left rtl:text-right">
        {title}
      </div>
      <div className="p-4 flex flex-col gap-4 flex-grow ltr:text-left rtl:text-right">
        {address ? (
          <div className="space-y-0.5 text-sm text-black">
            <p>
              {address.firstname} {address.lastname}
            </p>
            {address.company && <p>{address.company}</p>}
            <p>{Array.isArray(address.street) ? address.street.join(", ") : address.street}</p>
            <p>
              {address.city}{isRtl ? "،" : ","} <span dir="ltr">{address.postcode}</span>
            </p>
            {(() => {
              // GraphQL source field is `country_code`; the REST-shaped data uses `country_id`.
              const country = address.country_code || address.country_id;
              return country ? <p>{country === 'SA' ? t("addressBook.saudiArabia") : country}</p> : null;
            })()}
            <p>
              {t("addressBook.phone")}: <span dir="ltr">{address.telephone}</span>
            </p>
            {buttonLabel && (
              <div className="pt-4 mt-auto">
                <button
                  type="button"
                  className="bg-brand-yellow hover:bg-[#e0951d] text-black text-body-sm font-bold px-6 py-2 uppercase transition-all shadow-sm tracking-widest active:scale-95 flex items-center gap-2 cursor-pointer"
                  onClick={() => onEdit?.(address.id)}
                >
                  {buttonLabel}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-6 text-gray-400">
            <p className="italic text-xs font-semibold uppercase tracking-widest bg-gray-50 px-4 py-2 border border-gray-100">
              {t("addressBook.noDefaultAddress")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


export default function Addresses() {
  const router = useRouter();
  const lp = useLocalePath();
  const { t, isRtl } = useTranslation();
  const dispatch = useDispatch();
  const { addresses, loading, error } = useSelector((state: RootState) => state.address);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    // @ts-ignore
    dispatch(fetchAddresses());
  }, [dispatch]);


  const handleAddressAction = async (action: string, addressId: number | string) => {
    if (action === "edit") {
      router.push(lp(`/customer/address/edit/id/${addressId}`));
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(t("addressBook.deleteConfirm"));
      if (!confirmed) return;

      setActionLoading(true);
      // @ts-ignore
      dispatch(deleteAddress(addressId, (err) => {
        if (!err) {
          toast.success(t("addressBook.deleted"));
        } else {
          toast.error(err || t("addressBook.deleteFailed"));
        }
        setActionLoading(false);
      }));
      return;
    }

    if (action === "set_default_billing") {
      setActionLoading(true);
      // @ts-ignore
      dispatch(setDefaultAddress({ addressId, type: "billing" }, (err) => {
        if (!err) {
          toast.success(t("addressBook.defaultBillingSet"));
        } else {
          toast.error(err || t("addressBook.defaultBillingFailed"));
        }
        setActionLoading(false);
      }));
      return;
    }

    if (action === "set_default_shipping") {
      setActionLoading(true);
      // @ts-ignore
      dispatch(setDefaultAddress({ addressId, type: "shipping" }, (err) => {
        if (!err) {
          toast.success(t("addressBook.defaultShippingSet"));
        } else {
          toast.error(err || t("addressBook.defaultShippingFailed"));
        }
        setActionLoading(false);
      }));
    }
  };

  const additionalAddresses = addresses.filter((address: any) => !address.default_billing && !address.default_shipping);
  const filteredAddresses = additionalAddresses;

  const defaultBilling = addresses.find((address: any) => address.default_billing);
  const defaultShipping = addresses.find((address: any) => address.default_shipping);

  if (loading && addresses.length === 0) {
    return <AddressBookSkeleton />;
  }

  return (
    <div className="w-full font-rubik space-y-8" dir={isRtl ? "rtl" : "ltr"}>
      {/* Section 1: Default Addresses */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-sm font-bold text-black uppercase tracking-widest whitespace-nowrap">{t("addressBook.defaultAddresses")}</h2>
          <div className="h-[1px] flex-1 bg-gray-300"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AddressCard
            title={t("addressBook.defaultBillingAddress")}
            address={defaultBilling}
            t={t}
            isRtl={isRtl}
          />
          <AddressCard
            title={t("addressBook.defaultShippingAddress")}
            address={defaultShipping}
            onEdit={(id) => handleAddressAction("edit", id)}
            buttonLabel={t("addressBook.editShippingAddress")}
            t={t}
            isRtl={isRtl}
          />
        </div>
      </div>

      {/* Section 2: Additional Addresses */}
      <div>
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-sm font-bold text-black uppercase tracking-widest whitespace-nowrap">{t("addressBook.additionalAddresses")}</h2>
          <div className="h-[1px] flex-1 bg-gray-300"></div>
        </div>

        <div className="hidden md:block overflow-x-auto w-full">
          <table className="w-full border-collapse min-w-[640px] border border-[#ddd] bg-white">
            <thead>
              <tr className="bg-brand-yellow text-label uppercase font-bold tracking-widest text-black">
                <th className="px-3 py-2 border border-[#ddd] ltr:text-left rtl:text-right text-body-sm">{t("addressBook.firstName")}</th>
                <th className="px-3 py-2 border border-[#ddd] ltr:text-left rtl:text-right text-body-sm">{t("addressBook.lastName")}</th>
                <th className="px-3 py-2 border border-[#ddd] ltr:text-left rtl:text-right text-body-sm">{t("addressBook.streetAddress")}</th>
                <th className="px-3 py-2 border border-[#ddd] ltr:text-left rtl:text-right text-body-sm">{t("addressBook.city")}</th>
                <th className="px-3 py-2 border border-[#ddd] ltr:text-left rtl:text-right text-body-sm">{t("addressBook.zipCode")}</th>
                <th className="px-3 py-2 border border-[#ddd] ltr:text-left rtl:text-right text-body-sm">{t("addressBook.phone")}</th>
              </tr>
            </thead>

            <tbody>
              {error && (
                <tr>
                  <td colSpan={6} className="px-3 py-24 text-center border-b border-gray-200">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-red-500 text-xs font-black uppercase tracking-widest">{t("common.error")}</span>
                      <p className="text-gray-500 text-body">{error}</p>
                    </div>
                  </td>
                </tr>
              )}
              {filteredAddresses.length === 0 && !loading && !error && (
                <tr>
                  <td colSpan={6} className="px-3 py-24 text-center border-b border-gray-200">
                    <p className="text-gray-400 text-xs italic tracking-[0.2em] uppercase font-black">
                      {t("addressBook.noAdditionalAddresses")}
                    </p>
                  </td>
                </tr>
              )}

              {filteredAddresses.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((address: any, idx: number) => (
                <tr key={address.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-200 hover:bg-gray-50/50 transition-colors`}>
                  <td className="px-3 py-2 border-r border-gray-200 font-medium text-black uppercase ltr:text-left rtl:text-right text-body">{address.firstname}</td>
                  <td className="px-3 py-2 border-r border-gray-200 font-medium text-black uppercase ltr:text-left rtl:text-right text-body">{address.lastname}</td>
                  <td className="px-3 py-2 border-r border-gray-200 text-gray-500 font-medium ltr:text-left rtl:text-right text-body">{Array.isArray(address.street) ? address.street.join(", ") : address.street || "-"}</td>
                  <td className="px-3 py-2 border-r border-gray-200 uppercase font-medium text-gray-800 ltr:text-left rtl:text-right text-body">{address.city}</td>
                  <td className="px-3 py-2 border-r border-gray-200 font-medium text-gray-700 ltr:text-left rtl:text-right text-body"><span dir="ltr">{address.postcode}</span></td>
                  <td className="px-3 py-2 border-r border-gray-200 ltr:text-left rtl:text-right text-body">
                    <span dir="ltr" className="text-gray-600 font-medium hover:text-brand-yellow cursor-pointer transition-colors duration-200">
                      {address.telephone}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAddresses.length > 0 && (
          <div className="mt-6">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(filteredAddresses.length / pageSize)}
              totalItems={filteredAddresses.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(val) => { setPageSize(val); setCurrentPage(1); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
