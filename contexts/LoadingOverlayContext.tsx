"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface LoadingOverlayContextType {
    showLoading: (message?: string) => void;
    hideLoading: () => void;
}

const LoadingOverlayContext = createContext<LoadingOverlayContextType>({
    showLoading: () => {},
    hideLoading: () => {},
});

export function useLoadingOverlay() {
    return useContext(LoadingOverlayContext);
}

export function LoadingOverlayProvider({ children }: { children: ReactNode }) {
    const [message, setMessage] = useState<string | null>(null);

    const showLoading = useCallback((msg = "PROCESSING...") => {
        setMessage(msg);
    }, []);

    const hideLoading = useCallback(() => {
        setMessage(null);
    }, []);

    return (
        <LoadingOverlayContext.Provider value={{ showLoading, hideLoading }}>
            {children}
            {message !== null && (
                <div className="fixed inset-0 z-[500] bg-black/25 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-5 min-w-[260px]">
                        <div className="w-12 h-12 rounded-full border-4 border-gray-100 border-t-brand-yellow animate-spin" />
                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-800 text-center whitespace-nowrap">
                            {message}
                        </p>
                    </div>
                </div>
            )}
        </LoadingOverlayContext.Provider>
    );
}
