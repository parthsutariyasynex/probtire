"use client";

import React from "react";
import Link from "next/link";
import { Mail, Share2, Facebook, Instagram, Twitter, Linkedin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

const Footer: React.FC = () => {
    const { t } = useTranslation();
    const lp = useLocalePath();
    return (
        <footer id="footer" className="bg-black text-white py-6 sm:py-8 font-rubik">
            <div className="max-w-[1920px] mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 text-center pb-5 border-b border-gray-800/40">

                    {/* Left: Email Section */}
                    <div className="flex flex-col items-center group">
                        <div className="mb-2 text-white group-hover:scale-110 transition-transform duration-300">
                            <Mail className="w-8 h-8 md:w-10 md:h-10" strokeWidth={1.2} />
                        </div>
                        <h3 className="text-sm sm:text-lg font-bold mb-1 tracking-tight">{t("footer.email")}</h3>
                        <a
                            href="mailto:btire@al-talayi.com.sa"
                            className="text-gray-400 hover:text-brand-yellow transition-colors text-xs sm:text-base font-bold"
                        >
                            btire@al-talayi.com.sa
                        </a>
                    </div>

                    {/* Right: Social Section */}
                    <div className="flex flex-col items-center group">
                        <div className="mb-2 text-white group-hover:scale-110 transition-transform duration-300">
                            <Share2 className="w-8 h-8 md:w-10 md:h-10" strokeWidth={1.2} />
                        </div>
                        <h3 className="text-sm sm:text-lg font-bold mb-1 tracking-tight">{t("footer.socialConnect")}</h3>
                        <div className="flex items-center gap-3">
                            <Link href="https://www.facebook.com/BridgestoneKSA/" target="_blank" rel="noopener noreferrer" className="w-8 h-8 sm:w-9 sm:h-9 bg-white text-black rounded-full flex items-center justify-center hover:bg-brand-yellow hover:text-white transition-all transform hover:scale-110">
                                <Facebook size={15} fill="currentColor" />
                            </Link>
                            <Link href="https://www.instagram.com/bridgestone_ksa/" target="_blank" rel="noopener noreferrer" className="w-8 h-8 sm:w-9 sm:h-9 bg-white text-black rounded-full flex items-center justify-center hover:bg-brand-yellow hover:text-white transition-all transform hover:scale-110">
                                <Instagram size={15} />
                            </Link>
                            <Link href="https://twitter.com/bridgestone_KSA" target="_blank" rel="noopener noreferrer" className="w-8 h-8 sm:w-9 sm:h-9 bg-white text-black rounded-full flex items-center justify-center hover:bg-brand-yellow hover:text-white transition-all transform hover:scale-110">
                                <Twitter size={15} fill="currentColor" />
                            </Link>
                            <Link href="https://www.linkedin.com/company/altalayi" target="_blank" rel="noopener noreferrer" className="w-8 h-8 sm:w-9 sm:h-9 bg-white text-black rounded-full flex items-center justify-center hover:bg-brand-yellow hover:text-white transition-all transform hover:scale-110">
                                <Linkedin size={15} fill="currentColor" />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="mt-5 flex flex-col items-center gap-3 text-center">
                    <p className="text-gray-500 text-[10px] sm:text-xs font-semibold">
                        {t("footer.copyright")}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                        <Link href={lp("/privacy-policy")} className="text-white hover:text-brand-yellow transition-colors">{t("footer.privacyPolicy")}</Link>
                        <Link href={lp("/return-exchange-policy")} className="text-white hover:text-brand-yellow transition-colors">{t("footer.returnExchangePolicy")}</Link>
                        <Link href={lp("/terms-conditions")} className="text-white hover:text-brand-yellow transition-colors">{t("footer.termsConditions")}</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
