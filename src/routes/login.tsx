import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Wordmark } from "@/components/findable-icons";
import googleLogo from "@/assets/google-logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — findable" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function redirectToApp() {
    console.info("[auth] redirecting to app after successful auth");
    const target = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/app";
    navigate({ to: target });
  }

  async function onGoogle() {
    setError(null);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error));
      if (result.redirected) return;
      redirectToApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    console.info("[auth] login form submitted", { mode, email });
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
          console.info("[auth] signup returned an active session");
          redirectToApp();
        } else {
          console.info("[auth] signup requires email confirmation");
          setError("Check your email to confirm your account, then sign in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        console.info("[auth] sign-in succeeded");
        redirectToApp();
      }
    } catch (err) {
      console.error("[auth] login failed", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 py-10">
      {/* Top-left brand */}
      <div className="absolute left-6 top-6 flex items-center gap-2 text-[var(--text)]">
        <Wordmark height={36} />
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
          <button
            type="button"
            onClick={onGoogle}
            disabled={loading}
            className="flex h-10 items-center justify-center gap-2.5 rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-elev)] text-[13.5px] font-medium text-[var(--text)] transition hover:bg-[var(--bg-hover)] disabled:opacity-60"
          >
            <img src={googleLogo} alt="" aria-hidden="true" className="h-4 w-4" />
            Continue with Google
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
              <a
                href="#"
                className="text-[12.5px] text-[var(--text-mute)] hover:text-[var(--text)]"
              >
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
            {loading ? "Signing in…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-[22px] border-t border-[var(--border)] pt-[18px] text-center text-[13px] text-[var(--text-mute)]">
          {mode === "signin" ? "New to findable?" : "Already have an account?"}{" "}
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
        <span>© 2026 findable</span>
        <span>·</span>
        <a href="#" className="hover:text-[var(--text-mute)]">
          Terms
        </a>
        <a href="#" className="hover:text-[var(--text-mute)]">
          Privacy
        </a>
      </div>
    </div>
  );
}
