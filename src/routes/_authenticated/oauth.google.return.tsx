import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { completeGmailConnect } from "@/lib/outreach/gmail.functions";
import { completeCalendarConnect } from "@/lib/outreach/calendar.functions";

export const Route = createFileRoute("/_authenticated/oauth/google/return")({
  component: GoogleOAuthReturn,
});

function GoogleOAuthReturn() {
  const navigate = useNavigate();
  const completeGmail = useServerFn(completeGmailConnect);
  const completeCalendar = useServerFn(completeCalendarConnect);
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Finishing Google connection…");
  const kind =
    (typeof window !== "undefined" &&
      (sessionStorage.getItem("google_oauth_kind") as "gmail" | "calendar" | null)) ||
    "gmail";
  const label = kind === "calendar" ? "Google Calendar" : "Gmail";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") ?? "";
    const state = params.get("state") ?? "";
    const errorParam = params.get("error");
    const back = sessionStorage.getItem("google_oauth_return_to") || "/app";
    const redirectUri = `${window.location.origin}/oauth/google/return`;

    if (errorParam || !code || !state) {
      setStatus("error");
      setMessage(errorParam ?? "Connection cancelled");
      return;
    }
    const fn = kind === "calendar" ? completeCalendar : completeGmail;
    fn({ data: { code, state, redirectUri } })
      .then(() => {
        setStatus("ok");
        setMessage("Connected! Redirecting…");
        setTimeout(() => navigate({ to: back }), 600);
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e?.message ?? "Failed to complete connection");
      });
  }, [completeGmail, completeCalendar, navigate, kind]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="max-w-sm rounded-2xl border border-border bg-bg-elev p-6 text-center">
        <div className="text-[15px] font-semibold tracking-tight text-text">
          {status === "ok"
            ? `${label} connected`
            : status === "error"
              ? "Connection failed"
              : `Connecting ${label}…`}
        </div>
        <div className="mt-2 text-[13px] text-text-mute">{message}</div>
        {status === "error" && (
          <button
            onClick={() => navigate({ to: "/app" })}
            className="mt-4 rounded-lg bg-text px-3 py-1.5 text-[12.5px] font-medium text-text-invert"
          >
            Back to app
          </button>
        )}
      </div>
    </div>
  );
}