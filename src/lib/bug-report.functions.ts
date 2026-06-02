import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendBrandedEmail } from "@/lib/email/send.server";

const SUPPORT_EMAIL = "support@findable.work";

const AREAS = [
  "General",
  "Chat",
  "Job & posts",
  "Sourcing",
  "Candidates",
  "Outreach",
  "Interviews",
  "Billing & credits",
] as const;

const schema = z.object({
  area: z.enum(AREAS),
  summary: z.string().min(1).max(140),
  description: z.string().min(1).max(4000),
  pageUrl: z.string().max(500).optional(),
  includeTech: z.boolean().optional().default(true),
  userAgent: z.string().max(500).optional(),
  clientTimestamp: z.string().max(40).optional(),
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const sendBugReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { claims, userId } = context;
    const email = (claims?.email as string | undefined) ?? "unknown";
    const when = new Date().toISOString();

    const tech = data.includeTech !== false;

    const text = [
      `Bug report from findable`,
      ``,
      `Area: ${data.area}`,
      `Summary: ${data.summary}`,
      `User: ${email}`,
      ``,
      `What happened:`,
      data.description,
      ``,
      tech ? `--- Technical details ---` : null,
      tech ? `User ID: ${userId}` : null,
      tech ? `Server time: ${when}` : null,
      tech && data.clientTimestamp ? `Client time: ${data.clientTimestamp}` : null,
      tech && data.pageUrl ? `Page: ${data.pageUrl}` : null,
      tech && data.userAgent ? `User agent: ${data.userAgent}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #111;">
        <h2 style="margin:0 0 12px;">Bug report from findable</h2>
        <p style="margin:4px 0;"><strong>Area:</strong> ${escapeHtml(data.area)}</p>
        <p style="margin:4px 0;"><strong>Summary:</strong> ${escapeHtml(data.summary)}</p>
        <p style="margin:4px 0;"><strong>User:</strong> ${escapeHtml(email)}</p>
        <hr style="margin:16px 0; border:none; border-top:1px solid #eee;" />
        <h3 style="margin:0 0 8px; font-size:13px;">What happened</h3>
        <pre style="white-space:pre-wrap; font-family: inherit; margin:0;">${escapeHtml(data.description)}</pre>
        ${
          tech
            ? `<hr style="margin:16px 0; border:none; border-top:1px solid #eee;" />
        <h3 style="margin:0 0 8px; font-size:13px; color:#555;">Technical details</h3>
        <p style="margin:4px 0;"><strong>User ID:</strong> ${escapeHtml(userId)}</p>
        <p style="margin:4px 0;"><strong>Server time:</strong> ${escapeHtml(when)}</p>
        ${data.clientTimestamp ? `<p style="margin:4px 0;"><strong>Client time:</strong> ${escapeHtml(data.clientTimestamp)}</p>` : ""}
        ${data.pageUrl ? `<p style="margin:4px 0;"><strong>Page:</strong> ${escapeHtml(data.pageUrl)}</p>` : ""}
        ${data.userAgent ? `<p style="margin:4px 0;"><strong>User agent:</strong> ${escapeHtml(data.userAgent)}</p>` : ""}`
            : ""
        }
      </div>
    `;

    await sendBrandedEmail({
      to: SUPPORT_EMAIL,
      subject: `[Bug][${data.area}] ${data.summary} — ${email}`,
      html,
      text,
      replyTo: typeof email === "string" && email.includes("@") ? email : undefined,
    });

    return { sent: true };
  });