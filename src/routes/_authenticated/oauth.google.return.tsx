import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { completeGmailConnect } from "@/lib/outreach/gmail.functions";

export const Route = createFileRoute("/_authenticated/oauth/google/return")({
  component: GoogleOAuthReturn,
});

function GoogleOAuthReturn() {
  const navigate = useNavigate();
  const complete = useServerFn(completeGmailConnect);
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Finishing Gmail connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success") === "true";
    const connectionId = params.get("connection_id") ?? "";
    const back = sessionStorage.getItem("gmail_return_to") || "/app";

    if (!success || !connectionId) {
      setStatus("error");
      setMessage(params.get("error") ?? "Connection cancelled");
      return;
    }
    complete({ data: { connectionId } })
      .then(() => {
        setStatus("ok");
        setMessage("Connected! Redirecting…");
        setTimeout(() => navigate({ to: back }), 600);
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e?.message ?? "Failed to complete connection");
      });
  }, [complete, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="max-w-sm rounded-2xl border border-border bg-bg-elev p-6 text-center">
        <div className="text-[15px] font-semibold tracking-tight text-text">
          {status === "ok" ? "Gmail connected" : status === "error" ? "Connection failed" : "Connecting Gmail…"}
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