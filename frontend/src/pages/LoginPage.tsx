import { useState } from "react";
import { Activity, AlertCircle, ArrowRight, Eye, EyeOff, FileText, Loader2, Lock, Mail, Phone, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoginPageProps {
  googleLoading: boolean;
  passwordLoading: boolean;
  error: string | null;
  onGoogleSignIn: () => Promise<void>;
  onPasswordSignIn: (identifier: string, password: string) => Promise<void>;
  onPasswordSignUp: (identifier: string, password: string, displayName: string) => Promise<void>;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.73-.07-1.43-.19-2.1H12v3.98h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.51c-.9.6-2.05.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.9a6.01 6.01 0 0 1 0-3.8V7.51H3.07a10 10 0 0 0 0 8.98l3.34-2.6Z" />
      <path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.51l3.34 2.6C7.2 7.74 9.4 5.98 12 5.98Z" />
    </svg>
  );
}

export function LoginPage({ googleLoading, passwordLoading, error, onGoogleSignIn, onPasswordSignIn, onPasswordSignUp }: LoginPageProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submitPasswordForm = async () => {
    setLocalError(null);

    if (!identifier.trim()) {
      setLocalError("Enter your email address or mobile number.");
      return;
    }

    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }

    try {
      if (mode === "signup") {
        await onPasswordSignUp(identifier, password, displayName);
        return;
      }

      await onPasswordSignIn(identifier, password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-bg px-3 py-3 text-ink sm:px-6 sm:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-6xl grid-cols-1 overflow-hidden rounded-lg border border-primary-100 bg-white shadow-xl shadow-primary-100/30 sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="relative hidden bg-primary-900 p-8 text-primary-50 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-400 text-primary-50">
                <Activity size={23} />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">MedInsight AI</h1>
                <p className="text-xs font-bold uppercase tracking-widest text-primary-100">Secure report workspace</p>
              </div>
            </div>

            <div className="max-w-lg">
              <p className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-accent-100">Patient-first clarity</p>
              <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
                Sign in before storing sensitive health reports.
              </h2>
              <p className="mt-5 text-sm font-medium leading-7 text-primary-50/80">
                Your saved reports, file previews, and summaries stay attached to your account.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <ShieldCheck size={20} />, label: "Private history" },
              { icon: <Lock size={20} />, label: "Protected files" },
              { icon: <FileAuthIcon />, label: "Saved previews" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-white/10 bg-white/8 p-4">
                <div className="mb-3 text-accent-100">{item.icon}</div>
                <p className="text-xs font-extrabold leading-5">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-col justify-center p-4 sm:p-8">
          <div className="mb-6 flex min-w-0 items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-400 text-primary-50">
              <Activity size={22} />
            </div>
            <h1 className="truncate text-xl font-extrabold tracking-tight">MedInsight AI</h1>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-[1.7rem]">Access your reports</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-clay">
              Use Google, or create a password account with email/mobile.
            </p>
          </div>

          {(error || localError) && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p>{localError || error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={googleLoading || passwordLoading}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-primary-100 bg-white text-sm font-extrabold text-ink shadow-sm transition-colors hover:bg-primary-50 disabled:opacity-50"
          >
            {googleLoading ? <Loader2 size={18} className="animate-spin text-primary-600" /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-black uppercase tracking-widest text-clay/70">
            <div className="h-px bg-primary-100" />
            <span>or</span>
            <div className="h-px bg-primary-100" />
          </div>

          <div className="mb-4 grid grid-cols-2 rounded-lg border border-primary-100 bg-primary-50/50 p-1">
            {(["signin", "signup"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setLocalError(null);
                }}
                className={cn(
                  "h-9 rounded-md text-sm font-extrabold transition-colors",
                  mode === item ? "bg-white text-primary-600 shadow-sm" : "text-cocoa hover:text-primary-600"
                )}
              >
                {item === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-clay">Name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                  className="h-11 w-full rounded-lg border border-primary-100 bg-white px-3 text-sm font-semibold text-ink outline-none transition-all placeholder:text-clay/50 focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-clay">Email or mobile</span>
              <span className="relative block">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-clay" />
                <Phone size={15} className="absolute left-8 top-1/2 -translate-y-1/2 text-clay/70" />
                <input
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="name@email.com or 9876543210"
                  className="h-11 w-full rounded-lg border border-primary-100 bg-white pl-14 pr-3 text-sm font-semibold text-ink outline-none transition-all placeholder:text-clay/50 focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-clay">Password</span>
              <span className="relative block">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-clay" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 6 characters"
                  className="h-11 w-full rounded-lg border border-primary-100 bg-white pl-10 pr-11 text-sm font-semibold text-ink outline-none transition-all placeholder:text-clay/50 focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-clay transition-colors hover:bg-primary-50 hover:text-primary-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={submitPasswordForm}
            disabled={googleLoading || passwordLoading}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary-400 text-sm font-extrabold text-primary-50 shadow-sm shadow-primary-100 transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {passwordLoading ? <Loader2 size={18} className="animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
            {!passwordLoading && <ArrowRight size={18} />}
          </button>
        </section>
      </div>
    </main>
  );
}

function FileAuthIcon() {
  return <FileText size={20} />;
}
