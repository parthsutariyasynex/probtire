"use client";

import React from "react";
import { X } from "lucide-react";
import Popup from "./Popup";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    scrollable?: boolean;
    widthClassName?: string;
}

/**
 * Reusable Side Drawer component that slides in from the right.
 * Now powered by Framer Motion for premium smooth animations.
 */
export default function Drawer({ isOpen, onClose, children, title, scrollable = false, widthClassName = "" }: DrawerProps) {
    return (
        <Popup
            isOpen={isOpen}
            onClose={onClose}
            animation="slide-right"
            className={`flex flex-col ${widthClassName}`}
            scrollable={scrollable}
        >
            {/* Close Button Overlay */}
            <button
                onClick={onClose}
                className="absolute ltr:right-3.5 rtl:left-3.5 top-[10px] z-[110] w-9 h-9 bg-white text-black rounded-full shadow-md hover:bg-black hover:text-white transition-all flex items-center justify-center cursor-pointer active:scale-90"
                aria-label="Close drawer"
            >
                <X size={18} strokeWidth={2.5} />
            </button>

            {/* Header if title exists */}
            {title && (
                <div className="bg-brand-yellow h-[56px] px-4 flex items-center justify-between flex-shrink-0">
                    <h2 className="text-xl font-bold text-black">{title}</h2>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {children}
            </div>
        </Popup>
    );
}
