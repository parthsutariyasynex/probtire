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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    if (mode === "password") {
      try {
        const res = await signIn("credentials", {
          email,
          password,
          locale,
          redirect: false,
        });

        if (res?.ok) {
          const sess: any = await getSession();
          if (sess?.accessToken) localStorage.setItem("token", sess.accessToken);
          toast.success(t("login.loginSuccess"));
          redirectAfterLogin();
          // Don't setLoading(false) — page is navigating away; the loading
          // overlay covers the UI until the browser unloads this page.
        } else {
          localStorage.removeItem("token");
          toast.error(t("login.loginFailed"));
          setLoading(false);
        }
      } catch {
        toast.error(t("login.loginFailed"));
        setLoading(false);
      }
      // Previously: finally { setLoading(false) } — this reverted the button
      // to "Sign In" while the page was still visible during navigation.
    } else {
      try {
        // signIn("credentials") calls Magento /login/otp via auth-options.ts authorize().
        // Do NOT call /api/login-otp separately — OTPs are single-use and would be
        // consumed before signIn can use them.
        const res = await signIn("credentials", {
          mobile: mobileNumber,
          otp: otp,
          countryCode: countryCode,
          locale,
          redirect: false,
        });

        if (res?.ok) {
          const sess: any = await getSession();
          if (sess?.accessToken) localStorage.setItem("token", sess.accessToken);
          toast.success(t("login.loginSuccess"));
          redirectAfterLogin();
        } else {
          localStorage.removeItem("token");
          toast.error(t("login.invalidOtp"));
          setLoading(false);
        }
      } catch (err) {
        toast.error(t("login.invalidOtp"));
        setLoading(false);
      }
    }
  };

  if (redirecting) {
    return <ProductListingSkeleton />;
  }

  return (
    <div className="flex-1 w-full h-full bg-canvas flex flex-col font-rubik">
      <main className="flex-1 w-full flex justify-center items-start pt-6 sm:pt-8 md:pt-16 pb-8 sm:pb-12 px-4 md:px-0">
        <div className="w-full max-w-[440px] bg-white rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">
          <div className="px-4 sm:px-6 md:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5">
            <div className="text-left">
              <h1 className="text-h4 sm:text-subheading font-semibold tracking-[0.5px] uppercase text-gray-900">
                {t("login.title")}
              </h1>
            </div>
          </div>

          <div className="px-4 sm:px-6 md:px-8">
            <div className="flex w-full rounded-sm overflow-hidden border border-gray-200">
              <button
                type="button"
                className={`flex-1 py-[14px] text-body font-bold uppercase tracking-wider transition-all cursor-pointer ${mode === 'otp' ? 'bg-black text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
                onClick={() => { const cb = searchParams.get("callbackUrl"); const cbParam = cb ? `&callbackUrl=${encodeURIComponent(cb)}` : ""; setMode("otp"); setOtpSent(false); setErrors({}); window.history.replaceState(null, "", lp(`/login?mode=otp${cbParam}`)); }}
              >
                {t("login.modeOtp")}
              </button>
              <button
                type="button"
                className={`flex-1 py-[14px] text-body font-bold uppercase tracking-wider transition-all cursor-pointer border-l border-gray-100 ${mode === 'password' ? 'bg-black text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
                onClick={() => { const cb = searchParams.get("callbackUrl"); const cbParam = cb ? `&callbackUrl=${encodeURIComponent(cb)}` : ""; setMode("password"); setOtpSent(false); setErrors({}); window.history.replaceState(null, "", lp(`/login?mode=password${cbParam}`)); }}
              >
                {t("login.modePassword")}
              </button>
            </div>
          </div>

          <div className="px-4 sm:px-6 md:px-8 pt-4 sm:pt-5 pb-6 sm:pb-8">
            <p className="text-body-sm sm:text-body text-gray-500 font-medium leading-relaxed mb-5">
              {mode === 'password' ? t("login.signInWithEmail") : t("login.signInWithMobile")}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:gap-[14px]" noValidate>
              {mode === 'password' && (
                <>
                  <div className="flex flex-col gap-[5px]">
                    <label className="block text-label font-semibold text-gray-900 uppercase tracking-widest cursor-pointer">
                      {t("login.emailLabel")} <span className="text-red-600 font-bold">*</span>
                    </label>
                    <input
                      id="email-input"
                      type="email"
                      placeholder={t("login.emailPlaceholder")}
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: '' }); }}
                      className={`w-full h-[48px] bg-white px-3 text-sm border transition-all outline-none cursor-text ${errors.email ? 'border-red-500' : 'border-gray-300 focus:border-gray-600'}`}
                    />
                    {errors.email && <span className="text-red-500 text-label font-bold">{errors.email}</span>}
                  </div>

                  <div className="flex flex-col gap-[5px]">
                    <label className="block text-label font-semibold text-gray-900 uppercase tracking-widest cursor-pointer">
                      {t("login.passwordLabel")} <span className="text-red-600 font-bold">*</span>
                    </label>
                    <input
                      id="password-input"
                      type="password"
                      placeholder={t("login.passwordPlaceholder")}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: '' }); }}
                      className={`w-full h-[48px] bg-white px-3 text-sm border transition-all outline-none cursor-text ${errors.password ? 'border-red-500' : 'border-gray-300 focus:border-gray-600'}`}
                    />
                    {errors.password && <span className="text-red-500 text-label font-bold">{errors.password}</span>}
                  </div>
                </>
              )}

              {mode === 'otp' && (
                <>
                  <div className="flex flex-col gap-[5px] relative">
                    <label className="block text-label font-semibold text-gray-900 uppercase tracking-widest">
                      {t("login.mobileNumberLabel")} <span className="text-red-600 font-bold">*</span>
                    </label>
                    <div dir="ltr" className={`flex h-[48px] bg-white border transition-all ${errors.mobile ? 'border-red-500' : 'border-gray-300 focus-within:border-gray-600'}`}>
                      <div
                        className="px-4 flex items-center gap-2 border-r border-gray-100 cursor-pointer min-w-[110px] sm:min-w-[120px] hover:bg-gray-50 transition-colors"
                        onClick={() => setShowDropdown(!showDropdown)}
                      >
                        <span className={`${selectedCountry?.flagClass}`}></span>
                        <span className="font-black text-xs" style={{ color: '#e02b27' }}>{selectedCountry?.code}</span>
                        <span className="text-micro text-gray-400">▼</span>
                      </div>
                      <input
                        id="mobile-input"
                        type="tel"
                        placeholder={t("login.mobilePlaceholder")}
                        value={mobileNumber}
                        onChange={(e) => { setMobileNumber(e.target.value.replace(/\D/g, "")); if (errors.mobile) setErrors({ ...errors, mobile: '' }); }}
                        className="flex-1 px-3 text-sm outline-none bg-transparent cursor-text font-medium"
                      />

                      {showDropdown && (
                        <div className="absolute top-full ltr:left-0 rtl:right-0 w-full min-w-max bg-white border border-gray-100 shadow-[0_15px_60px_-15px_rgba(0,0,0,0.15)] z-[100] rounded-sm mt-1 max-h-60 overflow-y-auto">
                          {COUNTRY_CODES.map((item) => (
                            <div
                              key={item.code}
                              onClick={() => { setCountryCode(item.code); setShowDropdown(false); }}
                              className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between gap-4 group border-b last:border-0 border-gray-50"
                            >
                              <div className="flex items-center gap-3">
                                <span className={`${item.flagClass}`}></span>
                                <span className="text-body-lg" style={{ color: '#e02b27' }}>{item.country} ({item.arCountry})</span>
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
                    <div className="flex flex-col gap-[5px]">
                      <label className="block text-label font-black text-gray-900 uppercase tracking-widest">
                        {t("login.verificationCode")} <span className="text-red-600 font-bold">*</span>
                      </label>
                      <input
                        id="otp-input"
                        type="text"
                        value={otp}
                        onChange={(e) => { setOtp(e.target.value); if (errors.otp) setErrors({ ...errors, otp: '' }); }}
                        className={`w-full h-[48px] bg-white px-3 text-sm border transition-all outline-none text-center font-black tracking-[8px] cursor-text placeholder:font-normal placeholder:tracking-normal ${errors.otp ? 'border-red-500' : 'border-gray-300 focus:border-gray-600'}`}
                        placeholder={t("login.enterOtp")}
                      />
                      {errors.otp && <span className="text-red-500 text-label font-bold">{errors.otp}</span>}
                    </div>
                  )}
                </>
              )}

              <div className="pt-2 flex flex-col gap-3">
                <button
                  id="submit-button"
                  type={mode === 'otp' && !otpSent ? 'button' : 'submit'}
                  disabled={loading || reduxLoading}
                  onClick={mode === 'otp' && !otpSent ? handleSendOtp : undefined}
                  className="w-full h-10 sm:h-[46px] bg-brand-yellow hover:bg-brand-yellow-dark text-black font-black uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-[0.98] tracking-widest text-label sm:text-body-sm rounded-sm"
                >
                  {mode === 'otp' && !otpSent ? t("forgotPassword.sendOtp") : (loading || reduxLoading ? t("login.pleaseWait") : t("login.signIn"))}
                </button>

                <div className="text-right">
                  <Link href={lp("/forgot-password")}>
                    <span className="text-body-sm font-bold text-gray-700 hover:text-black cursor-pointer hover:underline underline-offset-2 py-2 inline-block">
                      {t("login.forgotPassword")}
                    </span>
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}