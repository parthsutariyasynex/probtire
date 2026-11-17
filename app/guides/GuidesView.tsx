"use client";
// User Guides view — cards and videos come from the Magento CMS page "user-guides"
// (loaded in ./page.tsx for the selected website + language). Nothing is hardcoded here.
import { useTranslation } from "@/hooks/useTranslation";
import React, { useState, useEffect, useCallback } from "react";
import { X, AlertCircle } from "lucide-react";
import type { GuidesPage, GuideItem } from "@/src/lib/cmsPages";
import CmsBanner from "@/components/CmsBanner";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

function VideoModal({
    isOpen,
    onClose,
    videoUrl,
    title,
    unavailableText,
}: {
    isOpen: boolean;
    onClose: () => void;
    videoUrl: string | null;
    title: string;
    unavailableText: string;
}) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        },
        [onClose]
    );

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            document.body.style.overflow = "";
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, handleKeyDown]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-8"
                >
                    {/* Backdrop - gray overlay like reference */}
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        data-video-modal
                        className="relative w-full max-w-[960px] z-10 shadow-2xl"
                    >
                        {/* Header - black bar */}
                        <div className="flex items-center justify-between bg-[#1a1a1a] px-4 py-2">
                            <span className="text-white text-body font-normal truncate pr-4">
                                {title}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {/* Fullscreen icon in circle */}
                                <button
                                    onClick={() => {
                                        const modal = document.querySelector('[data-video-modal]');
                                        if (modal) {
                                            if (document.fullscreenElement) {
                                                document.exitFullscreen();
                                            } else {
                                                (modal as HTMLElement).requestFullscreen();
                                            }
                                        }
                                    }}
                                    className="w-6 h-6 rounded-full border border-gray-500 flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-colors"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
                                    </svg>
                                </button>
                                {/* Close X in circle */}
                                <button
                                    onClick={onClose}
                                    className="w-6 h-6 rounded-full border border-gray-500 flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Video player */}
                        <div className="relative w-full aspect-video bg-[#282828]">
                            {videoUrl ? (
                                <iframe
                                    src={videoUrl}
                                    title={title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                    className="absolute inset-0 w-full h-full"
                                    style={{ border: 0 }}
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                                    <AlertCircle className="w-12 h-12 text-gray-500 stroke-[1.5]" />
                                    <p className="text-gray-300 text-base">{unavailableText}</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}

export default function GuidesView({ page }: { page: GuidesPage }) {
    const { t, isRtl } = useTranslation();
    const [activeVideo, setActiveVideo] = useState<GuideItem | null>(null);

    return (
        <div className="min-h-screen bg-white">
            {/* Banner Section */}
            {page.banner && (
                <CmsBanner banner={page.banner} alt={page.title} className="w-full h-[300px] md:h-[400px] lg:h-[500px]" />
            )}

            {/* Content Section */}
            <div
                className="max-w-[1200px] mx-auto px-6 mt-16 md:mt-20 pb-10 sm:pb-16 md:pb-20"
                dir={isRtl ? "rtl" : "ltr"}
            >
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-center mb-16 tracking-tight text-black uppercase">
                    {page.title}
                </h1>

                {/* Guides Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 w-full max-w-[1000px] mx-auto">
                    {page.items.map((guide) => (
                        <div
                            key={guide.id}
                            className="w-full flex justify-center"
                            onClick={() => setActiveVideo(guide)}
                        >
                            <div className="w-full border-[2px] border-gray-200 bg-white hover:border-gray-300 transition-colors duration-300 flex flex-col group cursor-pointer shadow-sm">
                                <div className="relative w-full aspect-[16/9] bg-[#1a1a1e] flex items-center justify-center overflow-hidden">
                                    {guide.image && (
                                        <img
                                            src={guide.image}
                                            alt={guide.title}
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform group-hover:scale-110 duration-300">
                                        <div className="w-14 h-14 bg-brand-yellow rounded-full flex items-center justify-center shadow-md">
                                            <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1"></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full border-t-[2px] border-gray-200 py-4 px-2 flex justify-center text-center bg-white">
                                    <span className="text-black font-bold text-body-xl">
                                        {guide.title}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Video Popup Modal */}
            <VideoModal
                isOpen={!!activeVideo}
                onClose={() => setActiveVideo(null)}
                videoUrl={activeVideo?.videoUrl ?? null}
                title={activeVideo?.videoTitle || ""}
                unavailableText={t("guides.videoUnavailable")}
            />
        </div>
    );
}
