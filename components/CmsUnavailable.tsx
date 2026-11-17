import React from "react";
import { AlertTriangle } from "lucide-react";

// Shown when the selected website has no Magento CMS page for this content.
// Never falls back to another website's content.
export default function CmsUnavailable({ title, message, rtl }: { title: string; message: string; rtl: boolean }) {
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 bg-white px-6 text-center font-rubik" dir={rtl ? "rtl" : "ltr"}>
            <AlertTriangle className="h-10 w-10 text-brand-yellow" aria-hidden="true" />
            <h1 className="text-xl font-bold text-black">{title}</h1>
            <p className="text-gray-600">{message}</p>
        </div>
    );
}
