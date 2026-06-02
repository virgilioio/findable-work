import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendBrandedEmail } from "@/lib/email/send.server";

const SUPPORT_EMAIL = "support@findable.work";

const schema = z.object({
  description: z.string().min(1).max(4000),
  pageUrl: z.string().max(500).optional(),
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

    const text = [
      `Bug report from findable`,
      ``,
      `User: ${email}`,
      `User ID: ${userId}`,
      `When: ${when}`,
      data.pageUrl ? `Page: ${data.pageUrl}` : null,
      ``,
      `Description:`,
      data.description,
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; color: #111;">
        <h2 style="margin:0 0 12px;">Bug report from findable</h2>
        <p style="margin:4px 0;"><strong>User:</strong> ${escapeHtml(email)}</p>
        <p style="margin:4px 0;"><strong>User ID:</strong> ${escapeHtml(userId)}</p>
        <p style="margin:4px 0;"><strong>When:</strong> ${escapeHtml(when)}</p>
        ${data.pageUrl ? `<p style="margin:4px 0;"><strong>Page:</strong> ${escapeHtml(data.pageUrl)}</p>` : ""}
        <hr style="margin:16px 0; border:none; border-top:1px solid #eee;" />
        <pre style="white-space:pre-wrap; font-family: inherit; margin:0;">${escapeHtml(data.description)}</pre>
      </div>
    `;

    await sendBrandedEmail({
      to: SUPPORT_EMAIL,
      subject: `[Bug] Report from ${email}`,
      html,
      text,
      replyTo: typeof email === "string" && email.includes("@") ? email : undefined,
    });

    return { sent: true };
  });