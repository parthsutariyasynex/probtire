"use client";

import "intl-tel-input/build/css/intlTelInput.css";
import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signOut, useSession, getSession } from "next-auth/react";
import toast from "react-hot-toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { sendOtp } from "@/store/actions/authActions";
import { RootState } from "@/store/store";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";
import { LoginSkeleton, ProductListingSkeleton } from "@/components/skeletons";
import WebsiteChooser from "@/components/WebsiteChooser";
import type { SiteLoginAccount, SiteLoginVerifyResult } from "@/lib/site-login/types";
import { rememberWebsite } from "@/lib/site-login/client";
import { switchLocale } from "@/components/LanguageSwitcher";
import { localeNames, type Locale } from "@/lib/i18n/config";

const COUNTRY_CODES = [
  { code: "+966", country: "Saudi Arabia", arCountry: "المملكة العربية السعودية", iso: "sa", flagClass: "iti__flag iti__sa" },
  { code: "+91", country: "India", arCountry: "भारत", iso: "in", flagClass: "iti__flag iti__in" },
  { code: "+971", country: "United Arab Emirates", arCountry: "الإمارات العربية المتحدة", iso: "ae", flagClass: "iti__flag iti__ae" },
];

// function safeRedirectUrl(url: string | null | undefined, locale: string): string {
//   if (!url || url.includes("/login") || url === `/${locale}` || url === `/${locale}/`) {
//     return `/${locale}/products`;
//   }
//   return url;
// }


// Validate callbackUrl after login. Falls back to /{locale}/ (root) which
// middleware redirects to the first Magento category page (e.g. /en/all-tyres/car-tyres.html).
// Previously hardcoded to /en/products — that bypassed the category landing entirely.
function safeRedirectUrl(
  url: string | null | undefined,
  locale: string
): string {
  const fallback = `/${locale}/`;

  if (!url || url.trim() === "") {
    return fallback;
  }

  if (url.includes("/login") || url === `/${locale}` || url === `/${locale}/`) {
    return fallback;
  }

  return url;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const lp = useLocalePath();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [redirecting, setRedirecting] = useState(false);

  const locale =
    typeof window !== "undefined" &&
      window.location.pathname.startsWith("/ar")
      ? "ar"
      : "en";

  const redirectAfterLogin = () => {
    const callbackParam = searchParams.get("callbackUrl");
    const finalUrl = safeRedirectUrl(callbackParam, locale);
    console.log("[TEMP DEBUG] Final redirect URL:", finalUrl);
    setRedirecting(true);
    // router.replace caused a login loop when the fallback is /${locale}/ (root).
    // Middleware checks auth server-side on root, but during a soft navigation the
    // session cookie isn't reliably sent yet → checkAuth() returns false → redirects
    // back to /login. A full-page navigation guarantees cookies are always included.
    // router.replace(finalUrl);
    window.location.href = finalUrl;
  };

  if (typeof window !== "undefined") {
    console.log("========== LOGIN PAGE ==========");
    console.log("window.location.href =", window.location.href);
    console.log("window.location.search =", window.location.search);
    console.log("callbackUrl =", searchParams.get("callbackUrl"));
  }

  const { data: session, status } = useSession();
  const dispatch = useAppDispatch();
  const { loading: reduxLoading } = useAppSelector((state: RootState) => state.auth);
  const [loading, setLoading] = useState(false);
  // One-shot guard so the authenticated→landing redirect fires at most once (prevents a
  // reload ping-pong with ProtectedLayout).
  const loginRedirectedRef = useRef(false);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated") {
      const sess = session as any;
      if (sess?.error === "MagentoTokenExpired") {
        console.warn('[LoginPage] MagentoTokenExpired detected — calling signOut');
        signOut({ redirect: false });
        return;
      }
      if (loginRedirectedRef.current) return;
      loginRedirectedRef.current = true;
      redirectAfterLogin();
    }
  }, [status, session, searchParams, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState("+966");
  const [mobileNumber, setMobileNumber] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const qp = searchParams.get("mode");
    if (qp === "otp" || qp === "password") {
      setMode(qp);
    }
  }, [searchParams]);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (mode === "password") {
      if (!email) newErrors.email = "Email is required";
      else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Invalid email format";
      if (!password) newErrors.password = "Password is required";
    } else {
      if (!mobileNumber) newErrors.mobile = "Mobile number is required";
      if (otpSent && !otp) newErrors.otp = "OTP is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendOtp = async (e: React.MouseEvent) => {
    e.preventDefault();
    setErrors({});
    if (!mobileNumber) {
      setErrors({ mobile: t("login.mobileRequired") });
      return;
    }
    dispatch(sendOtp(mobileNumber, countryCode, (err, data) => {
      if (!err) {
        toast.success(t("login.otpSent"));
        setOtpSent(true);
      } else {
        toast.error(err || t("login.failedSendOtp"));
      }
    }));
  };

  // ── Klever Site Login ────────────────────────────────────────────────
  // 1. /api/kleverapi/site-login/verify  → login_key + websites (password or OTP checked once)
  // 2. one website  → open it directly; several → "Choose your website"
  // 3. signIn("credentials", { login_key, account_id }) → authorize() → kleverSiteLoginSelect
  const [siteLogin, setSiteLogin] = useState<SiteLoginVerifyResult | null>(null);
  const [openingAccountId, setOpeningAccountId] = useState<number | null>(null);

  // Websites for the "Forgot your password?" links (Site Login API, labels in UI language).
  const [forgotSites, setForgotSites] = useState<{ website_id: number; label: string; store_codes: Record<string, string> }[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/kleverapi/site-login/websites?lang=${locale}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { websites: [] }))
      .then((d) => { if (alive) setForgotSites(Array.isArray(d?.websites) ? d.websites : []); })
      .catch(() => { if (alive) setForgotSites([]); });
    return () => { alive = false; };
  }, [locale]);

  // Reset the password on the chosen website: remember its store views, then open the page.
  const openForgotPassword = async (site: { website_id: number; store_codes: Record<string, string> }) => {
    await rememberWebsite(site.website_id, site.store_codes?.[locale], locale);
    window.location.href = lp("/forgot-password");
  };

  const failMessage = () => (mode === "password" ? t("login.loginFailed") : t("login.invalidOtp"));

  const resetToForm = () => {
    setSiteLogin(null);
    setOpeningAccountId(null);
    setPassword("");
    setOtp("");
    setOtpSent(false);
    setLoading(false);
  };

  const openWebsite = async (loginKey: string, account: SiteLoginAccount) => {
    setOpeningAccountId(account.account_id);
    // Remember the website's store views (from the API) so every call uses them.
    await rememberWebsite(account.website_id, account.store_code, locale);
    try {
      const res = await signIn("credentials", {
        login_key: loginKey,
        account_id: String(account.account_id),
        store_code: account.store_code || "",
        email: mode === "password" ? email : "",
        locale,
        redirect: false,
      });
      if (res?.ok) {
        const sess: any = await getSession();
        if (sess?.accessToken) localStorage.setItem("token", sess.accessToken);
        toast.success(t("login.loginSuccess"));
        redirectAfterLogin();
        return;
      }
    } catch { /* fall through */ }
    // The login_key works only once — go back to the form to log in again.
    localStorage.removeItem("token");
    toast.error(failMessage());
    resetToForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const payload =
      mode === "password"
        ? { email, password, lang: locale }
        : { mobile: mobileNumber, countryCode, otp, lang: locale };

    try {
      const res = await fetch("/api/kleverapi/site-login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: Partial<SiteLoginVerifyResult> & { message?: string } = await res.json().catch(() => ({}));

      if (!res.ok || !data.login_key || !data.accounts?.length) {
        localStorage.removeItem("token");
        toast.error(data.message || failMessage());
        setLoading(false);
        return;
      }

      if (data.accounts.length === 1) {
        await openWebsite(data.login_key, data.accounts[0]);
        return;
      }

      setSiteLogin({ login_key: data.login_key, accounts: data.accounts });
      setLoading(false);
    } catch {
      toast.error(failMessage());
      setLoading(false);
    }
  };

  if (redirecting) {
    return <ProductListingSkeleton />;
  }

  if (siteLogin) {
    return (
      <div className="flex-1 w-full min-h-screen bg-canvas flex flex-col">
        <WebsiteChooser
          accounts={siteLogin.accounts}
          lang={locale}
          busyAccountId={openingAccountId}
          onSelect={(account) => openWebsite(siteLogin.login_key, account)}
          onUseAnotherAccount={resetToForm}
        />
        <footer className="py-5 text-center text-xs text-gray-500 font-rubik">{t("login.footer")}</footer>
      </div>
    );
  }

  const switchModeTo = (next: "password" | "otp") => {
    const cb = searchParams.get("callbackUrl");
    const cbParam = cb ? `&callbackUrl=${encodeURIComponent(cb)}` : "";
    setMode(next);
    setOtpSent(false);
    setErrors({});
    window.history.replaceState(null, "", lp(`/login?mode=${next}${cbParam}`));
  };

  const otherLocale: Locale = locale === "ar" ? "en" : "ar";

  const tabClass = (active: boolean) =>
    `flex-1 h-10 px-2 rounded-[3px] text-body-sm font-semibold transition-colors cursor-pointer border ${active
      ? "bg-brand-yellow border-brand-yellow text-black"
      : "bg-white border-gray-200 text-gray-700 hover:border-brand-yellow hover:text-black"}`;

  const inputClass = (hasError: boolean) =>
    `w-full h-11 bg-white px-3 text-sm rounded-[3px] border transition-all outline-none cursor-text focus:ring-2 focus:ring-brand-yellow/40 ${hasError ? "border-red-500" : "border-gray-300 focus:border-brand-yellow"}`;

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="flex-1 w-full min-h-screen bg-canvas flex flex-col font-rubik">
      {/* Language link (top corner) */}
      <div className="w-full flex justify-end px-4 sm:px-6 pt-4">
        <button
          type="button"
          onClick={() => switchLocale(otherLocale)}
          className="text-sm font-medium text-gray-600 hover:text-black underline-offset-4 hover:underline decoration-brand-yellow decoration-2 cursor-pointer"
          lang={otherLocale}
        >
          {localeNames[otherLocale]}
        </button>
      </div>

      <main className="flex-1 w-full flex flex-col items-center px-4 pt-6 sm:pt-10 pb-10">
        <img src="/logo/btire-logo-horizontal.svg" alt="BTire" className="h-12 sm:h-14 w-auto" />

        <h1 className="mt-6 text-2xl sm:text-[28px] font-bold text-gray-900 text-center">{t("login.welcomeTitle")}</h1>
        <span className="mt-3 block h-1 w-14 rounded-full bg-brand-yellow" aria-hidden="true" />
        <p className="mt-4 max-w-[520px] text-center text-sm sm:text-base text-gray-600 leading-relaxed">
          {t("login.welcomeSubtitle")}
        </p>

        <div className="mt-8 w-full max-w-[420px] bg-white rounded-[3px] border border-gray-200 shadow-[0_10px_40px_rgba(0,0,0,0.06)] p-5 sm:p-6">
          {/* Login method tabs */}
          <div className="flex gap-2" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "password"} className={tabClass(mode === "password")} onClick={() => switchModeTo("password")}>
              {t("login.tabEmail")}
            </button>
            <button type="button" role="tab" aria-selected={mode === "otp"} className={tabClass(mode === "otp")} onClick={() => switchModeTo("otp")}>
              {t("login.tabOtp")}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4" noValidate>
            {mode === "password" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email-input" className="text-xs font-medium text-gray-700 cursor-pointer">
                    {t("login.emailLabel")} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="email-input"
                    type="email"
                    autoComplete="username"
                    placeholder={t("login.emailPlaceholder")}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: '' }); }}
                    className={inputClass(!!errors.email)}
                  />
                  {errors.email && <span className="text-red-500 text-label font-bold">{errors.email}</span>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password-input" className="text-xs font-medium text-gray-700 cursor-pointer">
                    {t("login.passwordLabel")} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="password-input"
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("login.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: '' }); }}
                    className={inputClass(!!errors.password)}
                  />
                  {errors.password && <span className="text-red-500 text-label font-bold">{errors.password}</span>}
                </div>
              </>
            )}

            {mode === "otp" && (
              <>
                <div className="flex flex-col gap-1.5 relative">
                  <label htmlFor="mobile-input" className="text-xs font-medium text-gray-700">
                    {t("login.mobileNumberLabel")} <span className="text-red-600">*</span>
                  </label>
                  <div dir="ltr" className={`flex h-11 bg-white rounded-[3px] border transition-all focus-within:ring-2 focus-within:ring-brand-yellow/40 ${errors.mobile ? 'border-red-500' : 'border-gray-300 focus-within:border-brand-yellow'}`}>
                    <div
                      className="px-3 flex items-center gap-2 border-r border-gray-200 cursor-pointer min-w-[104px] hover:bg-gray-50 transition-colors"
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      <span className={`${selectedCountry?.flagClass}`}></span>
                      <span className="font-bold text-xs text-gray-900">{selectedCountry?.code}</span>
                      <span className="text-micro text-gray-400">▼</span>
                    </div>
                    <input
                      id="mobile-input"
                      type="tel"
                      autoComplete="tel-national"
                      placeholder={t("login.mobilePlaceholder")}
                      value={mobileNumber}
                      onChange={(e) => { setMobileNumber(e.target.value.replace(/\D/g, "")); if (errors.mobile) setErrors({ ...errors, mobile: '' }); }}
                      className="flex-1 px-3 text-sm outline-none bg-transparent cursor-text font-medium"
                    />

                    {showDropdown && (
                      <div className="absolute top-full left-0 w-full min-w-max bg-white border border-gray-100 shadow-[0_15px_60px_-15px_rgba(0,0,0,0.15)] z-[100] rounded-[3px] mt-1 max-h-60 overflow-y-auto">
                        {COUNTRY_CODES.map((item) => (
                          <div
                            key={item.code}
                            onClick={() => { setCountryCode(item.code); setShowDropdown(false); }}
                            className="px-4 py-2 hover:bg-brand-yellow-light cursor-pointer flex items-center justify-between gap-4 border-b last:border-0 border-gray-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`${item.flagClass}`}></span>
                              <span className="text-body-lg text-gray-900">{item.country} ({item.arCountry})</span>
                            </div>
                            <span className="text-body-lg text-gray-500">{item.code}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {errors.mobile && <span className="text-red-500 text-label font-bold">{errors.mobile}</span>}
                </div>

                {otpSent && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="otp-input" className="text-xs font-medium text-gray-700">
                      {t("login.verificationCode")} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="otp-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={(e) => { setOtp(e.target.value); if (errors.otp) setErrors({ ...errors, otp: '' }); }}
                      className={`${inputClass(!!errors.otp)} text-center font-bold tracking-[8px] placeholder:font-normal placeholder:tracking-normal`}
                      placeholder={t("login.enterOtp")}
                    />
                    {errors.otp && <span className="text-red-500 text-label font-bold">{errors.otp}</span>}
                  </div>
                )}
              </>
            )}

            <button
              id="submit-button"
              type={mode === 'otp' && !otpSent ? 'button' : 'submit'}
              disabled={loading || reduxLoading}
              onClick={mode === 'otp' && !otpSent ? handleSendOtp : undefined}
              className="mt-1 w-full h-11 bg-brand-yellow hover:bg-brand-yellow-dark text-black text-base font-bold rounded-[3px] transition-colors disabled:opacity-50 cursor-pointer active:scale-[0.99]"
            >
              {mode === 'otp' && !otpSent ? t("forgotPassword.sendOtp") : (loading || reduxLoading ? t("login.pleaseWait") : t("login.logIn"))}
            </button>

            {/* Forgot password — per website (websites from the Site Login API) */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Link href={lp("/forgot-password")} className="text-gray-500 hover:text-black">
                {t("login.forgotPasswordFor")}
              </Link>
              {forgotSites.map((site) => (
                <button
                  key={site.website_id}
                  type="button"
                  onClick={() => openForgotPassword(site)}
                  className="font-semibold text-gray-900 underline decoration-brand-yellow decoration-2 underline-offset-4 hover:text-brand-yellow-dark cursor-pointer"
                >
                  {site.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      </main>

      <footer className="py-5 text-center text-xs text-gray-500">{t("login.footer")}</footer>
    </div>
  );
}