import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/gio-icons";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Gio AI" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await router.invalidate();
          navigate({ to: "/app", replace: true });
        } else {
          setError("Check your email to confirm your account, then sign in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await router.invalidate();
        navigate({ to: "/app", replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 py-10">
      {/* Top-left brand */}
      <div className="absolute left-6 top-6 flex items-center gap-2 text-[14px] text-[var(--text)]">
        <Logo size={20} />
        <span className="font-semibold tracking-[-0.01em]">Gio AI</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-[380px] rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)] px-8 py-9">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-[var(--text)]">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--text-mute)]">
          {mode === "signin"
            ? "Sign in to your recruiting workspace"
            : "Start hiring with your AI recruiter"}
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-2.5">
          {/* SSO (visual only — Google/Apple wiring optional later) */}
          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex h-10 cursor-not-allowed items-center justify-center gap-2.5 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-elev)] text-[13.5px] font-medium text-[var(--text)] opacity-60"
          >
            <span className="mono inline-flex h-3.5 w-3.5 items-center justify-center text-[13px] font-bold">
              G
            </span>
            Continue with Google
          </button>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex h-10 cursor-not-allowed items-center justify-center gap-2.5 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-elev)] text-[13.5px] font-medium text-[var(--text)] opacity-60"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M14.5 10.6c0-2.4 1.95-3.55 2.04-3.6-1.11-1.62-2.84-1.84-3.45-1.87-1.47-.15-2.86.86-3.6.86-.74 0-1.89-.84-3.1-.82-1.6.02-3.07.93-3.89 2.36-1.66 2.88-.43 7.13 1.19 9.46.79 1.14 1.74 2.41 2.98 2.37 1.2-.05 1.66-.77 3.1-.77 1.45 0 1.86.77 3.13.75 1.29-.02 2.11-1.16 2.9-2.3.91-1.32 1.29-2.6 1.31-2.67-.03-.01-2.51-.96-2.53-3.81Z M12.3 3.5c.66-.79 1.1-1.89.98-2.99-.94.04-2.09.63-2.77 1.42-.6.7-1.13 1.81-.99 2.89 1.05.08 2.12-.53 2.78-1.32Z" />
            </svg>
            Continue with Apple
          </button>

          <div className="my-1 flex items-center gap-2.5">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[11.5px] uppercase tracking-[0.08em] text-[var(--text-faint)]">
              or
            </span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--text-mute)]">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="h-[38px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--text)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--text-mute)]">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="h-[38px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--text)]"
            />
          </label>

          {mode === "signin" && (
            <div className="-mt-1 mb-1 text-right">
              <a href="#" className="text-[12.5px] text-[var(--text-mute)] hover:text-[var(--text)]">
                Forgot password?
              </a>
            </div>
          )}

          {error && (
            <p className="rounded-[8px] bg-[var(--bg-input)] px-3 py-2 text-[12.5px] text-[var(--text)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1.5 h-10 rounded-[10px] bg-[var(--text)] text-[14px] font-medium text-[var(--text-invert)] disabled:opacity-70"
          >
            {loading
              ? "Signing in…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <div className="mt-[22px] border-t border-[var(--border)] pt-[18px] text-center text-[13px] text-[var(--text-mute)]">
          {mode === "signin" ? "New to Gio?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="font-medium text-[var(--text)] hover:underline"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </div>
      </div>

      <div className="absolute bottom-5 flex items-center gap-3.5 text-[12px] text-[var(--text-faint)]">
        <span>© 2026 Gio AI</span>
        <span>·</span>
        <a href="#" className="hover:text-[var(--text-mute)]">Terms</a>
        <a href="#" className="hover:text-[var(--text-mute)]">Privacy</a>
      </div>
    </div>
  );
}