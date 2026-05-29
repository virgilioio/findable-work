import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "standardwebhooks";
import { renderAuthEmail, type AuthActionType } from "@/lib/email/auth-templates";

// Supabase Send Email Hook → renders branded email → sends via Resend.
//
// Configure in Supabase Auth → Hooks → "Send Email Hook":
//   URL:    https://findable.work/api/public/auth/email-hook
//   Secret: paste the value of AUTH_EMAIL_HOOK_SECRET (must start with "v1,whsec_")
//
// Reference: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook

interface HookPayload {
  user: {
    id: string;
    email: string;
    new_email?: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: AuthActionType;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: "findable <no-reply@findable.work>",
      to: [args.to],
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
}

export const Route = createFileRoute("/api/public/auth/email-hook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const hookSecret = process.env.AUTH_EMAIL_HOOK_SECRET;
        if (!hookSecret) {
          console.error("[auth-email-hook] AUTH_EMAIL_HOOK_SECRET is not set");
          return new Response(
            JSON.stringify({ error: { message: "Hook secret not configured" } }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const rawBody = await request.text();
        const headers = Object.fromEntries(request.headers.entries());

        // Verify standard-webhooks HMAC signature.
        // Supabase strips the "v1,whsec_" prefix expected by the lib.
        const secretForLib = hookSecret.replace(/^v1,whsec_/, "");
        let payload: HookPayload;
        try {
          const wh = new Webhook(secretForLib);
          payload = wh.verify(rawBody, headers) as HookPayload;
        } catch (err) {
          console.error("[auth-email-hook] signature verification failed", err);
          return new Response(
            JSON.stringify({ error: { message: "Invalid signature" } }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const recipient = payload.user.new_email ?? payload.user.email;
          const { subject, html } = renderAuthEmail({
            actionType: payload.email_data.email_action_type,
            confirmationUrl: payload.email_data.redirect_to
              ? `${payload.email_data.site_url}/auth/v1/verify?token=${payload.email_data.token_hash}&type=${payload.email_data.email_action_type}&redirect_to=${encodeURIComponent(payload.email_data.redirect_to)}`
              : `${payload.email_data.site_url}/auth/v1/verify?token=${payload.email_data.token_hash}&type=${payload.email_data.email_action_type}`,
            token: payload.email_data.token,
            email: payload.user.email,
            newEmail: payload.user.new_email,
            siteUrl: payload.email_data.site_url,
          });

          await sendViaResend({ to: recipient, subject, html });

          console.info("[auth-email-hook] sent", {
            type: payload.email_data.email_action_type,
            to: recipient,
          });

          return new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("[auth-email-hook] send failed", message);
          return new Response(
            JSON.stringify({ error: { http_code: 500, message } }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});