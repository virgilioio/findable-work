import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/findable-icons";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set a new password — findable" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase emits PASSWORD_RECOVERY when the user lands here from the email link.
  // It also restores any existing recovery session on initial getSession().
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setReady(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setLinkError(null);
      }
    });
    // If after a beat there's still no session, the link is bad/expired.
    const timer = setTimeout(() => {
      if (!cancelled && !ready) {
        supabase.auth.getSession().then(({ data }) => {
          if (!data.session) {
            setLinkError(
              t("auth.reset.invalid", "This reset link is invalid or has expired. Request a new one to continue."),
            );
          }
        });
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("auth.reset.too_short", "Use at least 8 characters."));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.reset.mismatch", "Passwords don't match."));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/app" }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.something_wrong", "Something went wrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 py-10">
      <div className="absolute left-6 top-6 flex items-center gap-2 text-[var(--text)]">
        <Wordmark height={36} />
      </div>

      <div className="w-full max-w-[380px] rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)] px-8 py-9">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-[var(--text)]">
          {done ? t("auth.reset.done.title", "Password updated") : t("auth.reset.title", "Set a new password")}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--text-mute)]">
          {done
            ? t("auth.reset.done.subtitle", "You're signed in. Taking you to your workspace…")
            : t("auth.reset.subtitle", "Choose a new password for your findable account.")}
        </p>

        {linkError ? (
          <div className="mt-6">
            <p className="rounded-[8px] bg-[var(--bg-input)] px-3 py-2 text-[12.5px] text-[var(--text)]">
              {linkError}
            </p>
            <Link
              to="/forgot-password"
              className="mt-3 flex h-10 items-center justify-center rounded-[10px] bg-[var(--text)] text-[14px] font-medium text-[var(--text-invert)]"
            >
              {t("auth.reset.request_new", "Request a new link")}
            </Link>
          </div>
        ) : !done ? (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-2.5">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--text-mute)]">
              {t("auth.reset.new_password", "New password")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={!ready}
                className="h-[38px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--text)] disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--text-mute)]">
              {t("auth.reset.confirm", "Confirm password")}
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                disabled={!ready}
                className="h-[38px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[14px] text-[var(--text)] outline-none focus:border-[var(--text)] disabled:opacity-60"
              />
            </label>

            {error && (
              <p className="rounded-[8px] bg-[var(--bg-input)] px-3 py-2 text-[12.5px] text-[var(--text)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !ready}
              className="mt-1.5 h-10 rounded-[10px] bg-[var(--text)] text-[14px] font-medium text-[var(--text-invert)] disabled:opacity-70"
            >
              {!ready
                ? t("auth.reset.verifying", "Verifying link…")
                : loading
                  ? t("auth.reset.updating", "Updating…")
                  : t("auth.reset.submit", "Update password")}
            </button>
          </form>
        ) : null}

        <div className="mt-[22px] border-t border-[var(--border)] pt-[18px] text-center text-[13px] text-[var(--text-mute)]">
          <Link to="/login" className="font-medium text-[var(--text)] hover:underline">
            {t("auth.back_to_signin", "Back to sign in")}
          </Link>
        </div>
      </div>
    </div>
  );
}
