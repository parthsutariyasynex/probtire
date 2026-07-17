"use client";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocalePath } from "@/hooks/useLocalePath";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { forgotPassword } from "@/store/actions/authActions";
import { RootState } from "@/store/store";

const COUNTRY_CODES = [
  { code: "+966", country: "Saudi Arabia", iso: "sa", flagClass: "iti__flag iti__sa" },
  { code: "+91", country: "India", iso: "in", flagClass: "iti__flag iti__in" },
  { code: "+971", country: "United Arab Emirates", iso: "ae", flagClass: "iti__flag iti__ae" },
];

export default function ForgotPasswordPage() {
  const router = useRouter();
    const { t } = useTranslation();
    const lp = useLocalePath();
  const dispatch = useAppDispatch();
  const { loading: reduxLoading } = useAppSelector((state: RootState) => state.auth);

  // Flow State: 'input' | 'otp' | 'reset'
  const [step, setStep] = useState<"input" | "otp" | "reset">("input");
  // Reset Mode: 'email' | 'mobile'
  const [resetMode, setResetMode] = useState<"email" | "mobile">("email");

  // Form Data
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+966");
  const [mobileNumber, setMobileNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");

  // UI State
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDropdown, setShowDropdown] = useState(false);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (step === "input") {
      if (resetMode === "email") {
        if (!email) newErrors.email = t("forgotPassword.emailRequired");
        else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = t("forgotPassword.emailInvalid");
      } else {
        if (!mobileNumber) newErrors.mobile = t("forgotPassword.mobileRequired");
        // else if (mobileNumber.length !== 10) newErrors.mobile = "Mobile number must be 10 digits";
      }
    } else if (step === "otp") {
      if (!otp) newErrors.otp = t("forgotPassword.otpRequired");
      else if (otp.length < 4) newErrors.otp = t("forgotPassword.otpInvalid");
    } else if (step === "reset") {
      if (!newPassword) newErrors.password = t("forgotPassword.passwordRequired");
      else if (newPassword.length < 6) newErrors.password = t("forgotPassword.passwordMinLength");
      if (newPassword !== confirmPassword) newErrors.confirmPassword = t("forgotPassword.passwordMismatch");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };


  const handleSendEmailReset = async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(t("forgotPassword.resetLinkSent"));
        router.push(lp("/login"));
      } else {
        toast.error(data.message || t("forgotPassword.resetLinkFailed"));
      }

    } catch (error) {
      toast.error(t("forgotPassword.unexpectedError"));
    }

    setLoading(false);
  };

  const handleSendMobileOtp = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mobile: mobileNumber,
          countryCode: countryCode,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(t("forgotPassword.otpSentSuccess"));
        setStep("otp");
      } else {
        toast.error(data.message || t("forgotPassword.otpSentFailed"));
      }
    } catch (err: any) {
      toast.error(t("forgotPassword.otpSentFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "/api/kleverapi/forget-password-mobile/verify-otp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            mobile: mobileNumber,
            otp: otp,
            countryCode: countryCode
          })
        }
      );

      const data = await res.json();
      console.log(">>> VERIFY OTP CLIENT DATA:", data);

      if (res.ok) {
        toast.success(t("forgotPassword.otpVerified"));
        const token = typeof data === "string" ? data : (data.resetToken || data.token || "");
        setResetToken(token);
        setStep("reset");
      } else {
        toast.error(data.message || t("forgotPassword.otpVerifyFailed"));
      }
    } catch (error) {
      toast.error(t("forgotPassword.otpVerifyFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setLoading(true);
    setErrors({});

    // 1. Prepare only the required fields as per specifications
    const payload = {
      resetToken: resetToken,
      newPassword: newPassword,
      confirmPassword: confirmPassword,
    };

    console.log(">>> RESET PASSWORD: Submitting request...", payload);

    try {
      // 2. Send POST request to the reset API
      const res = await fetch("/api/kleverapi/forget-password-mobile/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log(">>> RESET PASSWORD: Response status:", res.status);
      console.log(">>> RESET PASSWORD: Response data:", data);

      if (res.ok) {
        // 3. Success handling
        toast.success(t("forgotPassword.passwordResetSuccess"));
        console.log(">>> RESET PASSWORD: Success");

        // Brief delay before redirecting to login
        setTimeout(() => {
          router.push(lp("/login"));
        }, 1500);
      } else {
        // 4. API Error handling
        const errorMessage = data.message || data.error || t("forgotPassword.passwordResetFailed");
        toast.error(errorMessage);
        console.error(">>> RESET PASSWORD: API Error:", errorMessage);
      }
    } catch (error: any) {
      // 5. Network or unexpected error handling
      console.error(">>> RESET PASSWORD: Exception occurred:", error);
      toast.error(t("forgotPassword.unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (step === "input") {
      if (resetMode === "email") handleSendEmailReset();
      else handleSendMobileOtp();
    } else if (step === "otp") {
      handleVerifyOtp();
    } else if (step === "reset") {
      handleResetPassword();
    }
  };

  return (
    <div className="flex-1 w-full h-full bg-canvas flex flex-col font-rubik">
      <main className="flex-1 w-full flex justify-center items-start pt-6 sm:pt-8 md:pt-16 pb-8 sm:pb-12 px-4 md:px-0">
        <div className="w-full max-w-[440px] bg-white rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-gray-100 overflow-hidden">

          {/* Header */}
          <div className="px-4 sm:px-6 md:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5">
            <h1 className="text-h4 sm:text-subheading font-semibold tracking-[0.5px] uppercase text-gray-900">
              {step === 'input' ? t("forgotPassword.title") : step === 'otp' ? t("forgotPassword.verifyOtp") : t("forgotPassword.resetPassword")}
            </h1>
          </div>

          {/* Mode tabs — step 1 only */}
          {step === 'input' && (
            <div className="px-4 sm:px-6 md:px-8">
              <div className="flex w-full rounded-sm overflow-hidden border border-gray-200">
                <button
                  type="button"
                  className={`flex-1 py-[14px] text-body font-bold uppercase tracking-wider transition-all cursor-pointer ${resetMode === 'mobile' ? 'bg-black text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
                  onClick={() => { setResetMode("mobile"); setErrors({}); }}
                >
                  {t("login.modeOtp")}
                </button>
                <button
                  type="button"
                  className={`flex-1 py-[14px] text-body font-bold uppercase tracking-wider transition-all cursor-pointer border-l border-gray-100 ${resetMode === 'email' ? 'bg-black text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
                  onClick={() => { setResetMode("email"); setErrors({}); }}
                >
                  {t("login.modePassword")}
                </button>
              </div>
            </div>
          )}

          {/* Form Content */}
          <div className="px-4 sm:px-6 md:px-8 pt-4 sm:pt-5 pb-6 sm:pb-8">
            <p className="text-body-sm sm:text-body text-gray-500 font-medium leading-relaxed mb-5">
              {step === 'input'
                ? (resetMode === 'email' ? t("forgotPassword.emailSubtitle") : t("forgotPassword.mobileSubtitle"))
                : step === 'otp' ? `${t("forgotPassword.otpSubtitle")} ${countryCode} ${mobileNumber}`
                  : t("forgotPassword.resetSubtitle")}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:gap-[14px]" noValidate>

              {/* Step: Input */}
              {step === "input" && (
                <>
                  {resetMode === "email" ? (
                    <div className="flex flex-col gap-[5px]">
                      <label className="block text-label font-semibold text-gray-900 uppercase tracking-widest cursor-pointer">
                        {t("forgotPassword.email")} <span className="text-red-600 font-bold">*</span>
                      </label>
                      <input
                        id="email-input"
                        type="email"
                        placeholder={t("login.emailPlaceholder")}
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: "" }); }}
                        className={`w-full h-[48px] bg-white px-3 text-sm border transition-all outline-none cursor-text ${errors.email ? 'border-red-500' : 'border-gray-300 focus:border-gray-600'}`}
                      />
                      {errors.email && <span className="text-red-500 text-label font-medium leading-none">{errors.email}</span>}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-[5px] relative">
                      <label className="block text-label font-semibold text-gray-900 uppercase tracking-widest cursor-pointer">
                        {t("forgotPassword.mobileNumber")} <span className="text-red-600 font-bold">*</span>
                      </label>
                      <div className={`flex h-[48px] bg-white border transition-all overflow-visible ${errors.mobile ? 'border-red-500' : 'border-gray-300 focus-within:border-gray-600'}`}>
                        <div
                          className="bg-[#f5f5f5] px-3 flex items-center gap-2 border-r border-gray-200 cursor-pointer min-w-[75px] sm:min-w-[100px] hover:bg-gray-200 transition-colors"
                          onClick={() => setShowDropdown(!showDropdown)}
                        >
                          <span className={`${selectedCountry?.flagClass} scale-110`}></span>
                          <span className="text-[#e02b27] font-bold text-xs">{selectedCountry?.code}</span>
                          <span className="text-[8px] text-gray-500">▼</span>
                        </div>
                        <input
                          id="mobile-input"
                          type="tel"
                          placeholder={t("login.mobilePlaceholder")}
                          value={mobileNumber}
                          onChange={(e) => { setMobileNumber(e.target.value.replace(/\D/g, "")); if (errors.mobile) setErrors({ ...errors, mobile: '' }); }}
                          className="flex-1 px-3 text-sm outline-none cursor-text"
                        />
                        {showDropdown && (
                          <div className="absolute top-full mt-1 left-0 w-full bg-white border border-gray-300 shadow-2xl z-[9999] overflow-hidden">
                            {COUNTRY_CODES.map((item) => (
                              <div
                                key={item.code}
                                onClick={() => { setCountryCode(item.code); setShowDropdown(false); }}
                                className="p-3.5 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b last:border-0 border-gray-100 transition-colors"
                              >
                                <span className={item.flagClass}></span>
                                <span className="text-xs font-bold text-black">{item.code}</span>
                                <span className="text-caption text-gray-400 italic">{item.country}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {errors.mobile && <span className="text-red-500 text-label font-medium leading-none">{errors.mobile}</span>}
                    </div>
                  )}
                </>
              )}

              {/* Step: OTP */}
              {step === "otp" && (
                <div className="flex flex-col gap-[5px]">
                  <label className="block text-label font-semibold text-gray-900 uppercase tracking-widest cursor-pointer">
                    {t("login.verificationCode")} <span className="text-red-600 font-bold">*</span>
                  </label>
                  <input
                    id="otp-input"
                    type="text"
                    placeholder={t("login.enterOtp")}
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value); if (errors.otp) setErrors({ ...errors, otp: "" }); }}
                    className={`w-full h-[48px] bg-white px-3 text-sm border transition-all outline-none cursor-text text-center font-bold tracking-[6px] sm:tracking-[8px] placeholder:tracking-normal placeholder:font-normal ${errors.otp ? 'border-red-500' : 'border-gray-300 focus:border-gray-600'}`}
                  />
                  {errors.otp && <span className="text-red-500 text-label font-medium leading-none">{errors.otp}</span>}
                  <button
                    type="button"
                    onClick={handleSendMobileOtp}
                    className="text-amber-600 text-label font-semibold text-right mt-1 hover:underline cursor-pointer"
                  >
                    {t("forgotPassword.resendCode")}
                  </button>
                </div>
              )}

              {/* Step: Reset */}
              {step === "reset" && (
                <>
                  <div className="flex flex-col gap-[5px]">
                    <label className="block text-label font-semibold text-gray-900 uppercase tracking-widest cursor-pointer">
                      {t("forgotPassword.newPassword")} <span className="text-red-600 font-bold">*</span>
                    </label>
                    <input
                      id="new-password-input"
                      type="password"
                      placeholder={t("login.passwordPlaceholder")}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: "" }); }}
                      className={`w-full h-[48px] bg-white px-3 text-sm border transition-all outline-none cursor-text ${errors.password ? 'border-red-500' : 'border-gray-300 focus:border-gray-600'}`}
                    />
                    {errors.password && <span className="text-red-500 text-label font-medium leading-none">{errors.password}</span>}
                  </div>

                  <div className="flex flex-col gap-[5px]">
                    <label className="block text-label font-semibold text-gray-900 uppercase tracking-widest cursor-pointer">
                      {t("forgotPassword.confirmPassword")} <span className="text-red-600 font-bold">*</span>
                    </label>
                    <input
                      id="confirm-password-input"
                      type="password"
                      placeholder={t("forgotPassword.confirmPassword")}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: "" }); }}
                      className={`w-full h-[48px] bg-white px-3 text-sm border transition-all outline-none cursor-text ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300 focus:border-gray-600'}`}
                    />
                    {errors.confirmPassword && <span className="text-red-500 text-label font-medium leading-none">{errors.confirmPassword}</span>}
                  </div>
                </>
              )}

              <div className="pt-2 flex flex-col gap-3">
                <button
                  id="submit-button"
                  type="submit"
                  disabled={loading || reduxLoading}
                  className="w-full h-10 sm:h-[46px] bg-brand-yellow hover:bg-brand-yellow-dark text-black font-black uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-[0.98] tracking-widest text-label sm:text-body-sm rounded-sm"
                >
                  {loading || reduxLoading ? t("forgotPassword.sending") : (
                    step === 'input' ? (resetMode === 'email' ? t("forgotPassword.sendResetLink") : t("forgotPassword.sendOtp")) :
                      step === 'otp' ? t("forgotPassword.verifyOtpButton") : t("forgotPassword.resetPasswordButton")
                  )}
                </button>

                <div className="flex justify-between items-center">
                  <Link href={lp("/login")}>
                    <span className="text-body-sm font-bold text-gray-700 hover:text-black cursor-pointer hover:underline underline-offset-2 py-2 inline-block">
                      {t("forgotPassword.backToLogin")}
                    </span>
                  </Link>
                  {step !== 'input' && (
                    <button
                      type="button"
                      onClick={() => setStep('input')}
                      className="text-gray-500 text-sm font-normal cursor-pointer hover:underline"
                    >
                      {t("forgotPassword.changeMethod")}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}