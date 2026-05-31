import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/findable-icons";
import googleLogo from "@/assets/google-logo.png";

export type AuthReason = "nudge" | "sourcing" | "cap" | "manual";

const REASON_SUBTITLE: Record<AuthReason, { signin: string; signup: string }> = {
  nudge: {
    signup: "Create a free account to save this conversation",
    signin: "Sign in to save this conversation",
  },
  sourcing: {
    signup: "Sign up to unlock sourcing and save this chat",
    signin: "Sign in to unlock sourcing and save this chat",
  },
  cap: {
    signup: "Create an account to keep this conversation going",
    signin: "Sign in to keep this conversation going",
  },
  manual: {
    signup: "Start hiring with your AI recruiter",
    signin: "Sign in to your recruiting workspace",
  },
};

export function AuthDialog({
  open,
  onOpenChange,
  reason,
  dismissible,
  onAuthenticated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: AuthReason;
  dismissible: boolean;
  onAuthenticated: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const subtitle = REASON_SUBTITLE[reason][mode];

  async function onGoogle() {
    setError(null);
    setLoading(true);
    try {
      // Set a flag so the landing page knows to either claim or navigate
      // when Supabase finishes the OAuth code exchange after the redirect.
      try {
        sessionStorage.setItem("findable:claim-pending", "1");
      } catch {
        /* ignore */
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      // Browser will redirect to Google; landing page handles SIGNED_IN on return.
      return;
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
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setError("Check your email to confirm your account, then sign in here.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !dismissible) return;
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="w-full max-w-[440px] gap-0 rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)] p-0 px-10 py-10 shadow-lg sm:rounded-[14px]"
        onPointerDownOutside={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissible) e.preventDefault();
        }}
      >
        <VisuallyHidden>
          <DialogTitle>{mode === "signin" ? "Welcome back" : "Create your account"}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </VisuallyHidden>

        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-[var(--text)]">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--text-mute)]">{subtitle}</p>

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
              autoFocus
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
      </DialogContent>
    </Dialog>
  );
}
