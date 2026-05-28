import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type AuthReason = "nudge" | "sourcing" | "cap" | "manual";

const COPY: Record<AuthReason, { title: string; body: string }> = {
  nudge: {
    title: "Save this conversation",
    body: "Create a free account to keep this chat and pick up exactly where you left off.",
  },
  sourcing: {
    title: "Create an account to find candidates",
    body: "Sign up to unlock sourcing, job posts, and the rest of your project — we'll keep this conversation.",
  },
  cap: {
    title: "Keep going with a free account",
    body: "We've covered a lot. Create an account to keep this conversation and continue.",
  },
  manual: {
    title: "Sign in or create an account",
    body: "Your conversation will be saved to your account automatically.",
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

  const copy = COPY[reason];

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
        className="max-w-[420px] gap-0 p-0"
        onPointerDownOutside={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissible) e.preventDefault();
        }}
      >
        <DialogHeader className="px-7 pt-7 pb-3 text-left">
          <DialogTitle className="text-[18px] font-semibold tracking-[-0.01em]">
            {copy.title}
          </DialogTitle>
          <DialogDescription className="text-[13.5px] text-[var(--text-mute)]">
            {copy.body}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-2.5 px-7 pb-6">
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

          {error && (
            <p className="rounded-[8px] bg-[var(--bg-input)] px-3 py-2 text-[12.5px] text-[var(--text)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "mt-1.5 h-10 rounded-[10px] bg-[var(--text)] text-[14px] font-medium text-[var(--text-invert)] disabled:opacity-70",
            )}
          >
            {loading
              ? "Working…"
              : mode === "signup"
              ? "Create account & save chat"
              : "Sign in & save chat"}
          </button>

          <div className="mt-2 text-center text-[12.5px] text-[var(--text-mute)]">
            {mode === "signup" ? "Already have an account?" : "New to findable?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError(null);
              }}
              className="font-medium text-[var(--text)] hover:underline"
            >
              {mode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
