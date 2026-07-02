// "use client";

// import React, { useState, useEffect } from "react";
// import { ArrowUp } from "lucide-react";

// export default function ScrollToTop() {
//     const [isVisible, setIsVisible] = useState(false);

//     useEffect(() => {
//         const handleScroll = () => setIsVisible(window.scrollY > 300);
//         window.addEventListener("scroll", handleScroll, { passive: true });
//         return () => window.removeEventListener("scroll", handleScroll);
//     }, []);

//     const scrollToTop = () => {
//         window.scrollTo({ top: 0, behavior: "smooth" });
//     };

//     if (!isVisible) return null;

//     return (
//         <div className="fixed bottom-24 right-8 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
//             <button
//                 onClick={scrollToTop}
//                 className="w-12 h-12 bg-white border-2 border-brand-yellow rounded-full shadow-lg flex items-center justify-center text-gray-400 hover:text-black hover:border-black transition-all group active:scale-90"
//                 aria-label="Scroll to top"
//             >
//                 <ArrowUp size={24} strokeWidth={1.5} className="group-hover:-translate-y-1 transition-transform" />
//             </button>
//         </div>
//     );
// }


"use client";

import React, { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
    const [isVisible, setIsVisible] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            const scrollTop = window.scrollY;
            const docHeight =
                document.documentElement.scrollHeight - window.innerHeight;

            const scrollProgress =
                docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

            setProgress(scrollProgress);
            setIsVisible(scrollTop > 300);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();

        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    if (!isVisible) return null;

    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="fixed bottom-24 right-8 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button
                onClick={scrollToTop}
                aria-label="Scroll to top"
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg hover:scale-105 transition-transform active:scale-95"
            >
                <svg
                    className="absolute inset-0 -rotate-90"
                    width="56"
                    height="56"
                >
                    {/* Background Ring */}
                    <circle
                        cx="28"
                        cy="28"
                        r={radius}
                        stroke="#E5E7EB"
                        strokeWidth="3"
                        fill="none"
                    />

                    {/* Progress Ring */}
                    <circle
                        cx="28"
                        cy="28"
                        r={radius}
                        stroke="#F5B21B"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        style={{
                            transition: "stroke-dashoffset 0.15s linear",
                        }}
                    />
                </svg>

                <ArrowUp
                    size={22}
                    strokeWidth={2}
                    className="relative z-10 text-black transition-transform group-hover:-translate-y-1"
                />
            </button>
        </div>
    );
}
