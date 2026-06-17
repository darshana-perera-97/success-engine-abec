import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "./Button";
import { saveLoginSession } from "../authSession";
import { changeStudentDefaultPassword, loginAdmin } from "../authApi";
import { COMPANY_NAME, PRODUCT_TAGLINE } from "../companyConfig";

const inputClass =
  "w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-gray-200 rounded-lg outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15";

const labelClass = "text-xs font-semibold text-slate-700 mb-1.5 block";

const LoginScreen = ({ onLoggedIn }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [pendingCurrentPassword, setPendingCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedEmail || !normalizedPassword) {
      setError("Please enter your email and password.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await loginAdmin(normalizedEmail, normalizedPassword);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.user?.role === "Student" && result.user?.mustChangePassword) {
        setPendingUser(result.user);
        setPendingCurrentPassword(normalizedPassword);
        return;
      }
      saveLoginSession(result.user);
      onLoggedIn(result.user);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeDefaultPassword = async (e) => {
    e.preventDefault();
    setPasswordChangeError("");
    const pw = String(newPassword || "").trim();
    const pw2 = String(confirmPassword || "").trim();
    if (!pw || pw.length < 6) {
      setPasswordChangeError("New password must be at least 6 characters.");
      return;
    }
    if (pw !== pw2) {
      setPasswordChangeError("Passwords do not match.");
      return;
    }
    if (!pendingUser?.email || !pendingCurrentPassword) {
      setPasswordChangeError("Session expired. Please sign in again.");
      return;
    }
    setIsChangingPassword(true);
    try {
      const result = await changeStudentDefaultPassword(
        String(pendingUser.email || "").trim().toLowerCase(),
        pendingCurrentPassword,
        pw
      );
      if (!result.ok) {
        setPasswordChangeError(result.error || "Failed to update password.");
        return;
      }
      const nextUser = { ...pendingUser, mustChangePassword: false };
      saveLoginSession(nextUser);
      onLoggedIn(nextUser);
      setPendingUser(null);
      setPendingCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-900 font-sans">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-indigo-100/60 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-slate-200/50 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-slate-900/5">
          <div className="grid lg:grid-cols-[1.05fr_1fr]">
            <aside className="relative hidden overflow-hidden border-r border-gray-100 bg-gradient-to-br from-indigo-50 via-slate-50 to-white px-10 py-12 text-slate-900 lg:flex lg:flex-col lg:justify-between">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_55%)]" />
              <div className="relative">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  {PRODUCT_TAGLINE}
                </p>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{COMPANY_NAME}</h1>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
                  Your workspace for student success, counseling workflows, and team collaboration — all in one place.
                </p>
              </div>

              <ul className="relative mt-10 space-y-4">
                {[
                  "Secure access for your entire organization",
                  "Real-time updates across counseling pipelines",
                  "Built for counselors, managers, and students",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                      <CheckCircle2 size={14} className="text-indigo-600" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="relative mt-10 flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck size={14} className="text-indigo-500" />
                <span>Encrypted sign-in · Role-based access</span>
              </div>
            </aside>

            <div className="flex flex-col">
              <div className="border-b border-gray-100 bg-slate-50/70 px-6 py-5 sm:px-8 lg:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
                  {PRODUCT_TAGLINE}
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{COMPANY_NAME}</h1>
              </div>

              <div className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
                  <p className="mt-1.5 text-sm text-slate-500">
                    Sign in with your {COMPANY_NAME} account to continue.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-1 flex-col space-y-5">
                  {error ? (
                    <div
                      role="alert"
                      className="rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
                    >
                      {error}
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="login-email" className={labelClass}>
                      Email address
                    </label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={16}
                        strokeWidth={2}
                      />
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@organization.com"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label htmlFor="login-password" className={labelClass}>
                        Password
                      </label>
                      <Link
                        to="/forgot-password"
                        className="text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={16}
                        strokeWidth={2}
                      />
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 transition-colors hover:text-slate-600"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Keep me signed in on this device
                  </label>

                  <Button
                    type="submit"
                    className="group w-full justify-center gap-2 py-3 shadow-sm"
                    size="lg"
                    isLoading={isLoading}
                  >
                    Sign in
                    {!isLoading ? <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /> : null}
                  </Button>
                </form>

                <div className="mt-8 flex items-center justify-center gap-2 border-t border-gray-100 pt-6 text-[11px] text-slate-400">
                  <span className="leading-none">Powered by</span>
                  <img
                    src="/MainLogo.png"
                    alt="NexgenAI"
                    className="block h-4 w-auto shrink-0 object-contain opacity-90 sm:h-5"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pendingUser ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="border-b border-gray-100 bg-slate-50/70 px-6 py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Set a new password</h2>
              <p className="mt-1 text-sm text-slate-500">
                For security, choose a new password before entering the portal.
              </p>
            </div>

            <form onSubmit={handleChangeDefaultPassword} className="space-y-4 p-6">
              {passwordChangeError ? (
                <div className="rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  {passwordChangeError}
                </div>
              ) : null}

              <div>
                <label htmlFor="new-password" className={labelClass}>
                  New password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                    strokeWidth={2}
                  />
                  <input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 transition-colors hover:text-slate-600"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className={labelClass}>
                  Confirm password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={16}
                    strokeWidth={2}
                  />
                  <input
                    id="confirm-password"
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className={inputClass}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full justify-center py-3" size="lg" isLoading={isChangingPassword}>
                Update password
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export { LoginScreen };
