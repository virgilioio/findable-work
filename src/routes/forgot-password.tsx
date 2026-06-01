import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/findable-icons";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset your password — findable" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t, tf } = useLanguage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
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
          {sent ? t("auth.forgot.sent.title", "Check your inbox") : t("auth.forgot.title", "Reset your password")}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[var(--text-mute)]">
          {sent
            ? tf("auth.forgot.sent.subtitle", "We've sent a reset link to {email}. The link expires in 1 hour.", { email })
            : t("auth.forgot.subtitle", "Enter the email for your findable account and we'll send you a reset link.")}
        </p>

        {!sent ? (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-2.5">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--text-mute)]">
              {t("auth.email", "Email")}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.email_placeholder", "you@company.com")}
                required
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
              className="mt-1.5 h-10 rounded-[10px] bg-[var(--text)] text-[14px] font-medium text-[var(--text-invert)] disabled:opacity-70"
            >
              {loading ? t("auth.forgot.sending", "Sending…") : t("auth.forgot.submit", "Send reset link")}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="mt-6 h-10 w-full rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg-elev)] text-[14px] font-medium text-[var(--text)] hover:bg-[var(--bg-hover)]"
          >
            {t("auth.forgot.different", "Send to a different email")}
          </button>
        )}

        <div className="mt-[22px] border-t border-[var(--border)] pt-[18px] text-center text-[13px] text-[var(--text-mute)]">
          {t("auth.forgot.remembered", "Remembered it?")}{" "}
          <Link to="/login" className="font-medium text-[var(--text)] hover:underline">
            {t("auth.back_to_signin", "Back to sign in")}
          </Link>
        </div>
      </div>
    </div>
  );
}
