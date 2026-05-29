// Branded HTML email templates for Supabase Auth events.
// Keep all CSS inline — email clients ignore <style> tags inconsistently.
// Light mode only — dark mode rendering across clients is unreliable.

const BRAND = "findable";
const BRAND_COLOR = "#0a0a0a";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BG = "#ffffff";
const BTN_BG = "#0a0a0a";
const BTN_TEXT = "#ffffff";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(opts: {
  preheader: string;
  heading: string;
  intro: string;
  ctaLabel?: string;
  ctaUrl?: string;
  postCta?: string;
  altCodeLabel?: string;
  altCode?: string;
}): string {
  const { preheader, heading, intro, ctaLabel, ctaUrl, postCta, altCodeLabel, altCode } = opts;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND_COLOR};">
  <span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;color:${BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
        <tr><td style="padding:0 0 28px 0;">
          <span style="font-size:20px;font-weight:600;letter-spacing:-0.01em;color:${BRAND_COLOR};">${BRAND}</span>
        </td></tr>
        <tr><td style="border:1px solid ${BORDER};border-radius:14px;padding:36px 32px;background:${BG};">
          <h1 style="margin:0 0 14px 0;font-size:22px;font-weight:600;letter-spacing:-0.015em;color:${BRAND_COLOR};line-height:1.3;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:${BRAND_COLOR};">${intro}</p>
          ${
            ctaLabel && ctaUrl
              ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td style="border-radius:10px;background:${BTN_BG};"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:500;color:${BTN_TEXT};text-decoration:none;border-radius:10px;">${escapeHtml(ctaLabel)}</a></td></tr></table>
              <p style="margin:0 0 8px 0;font-size:12.5px;line-height:1.5;color:${MUTED};">Or paste this link into your browser:</p>
              <p style="margin:0 0 24px 0;font-size:12.5px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(ctaUrl)}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(ctaUrl)}</a></p>`
              : ""
          }
          ${
            altCode
              ? `<p style="margin:0 0 8px 0;font-size:12.5px;color:${MUTED};">${escapeHtml(altCodeLabel ?? "Verification code")}</p>
              <p style="margin:0 0 24px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:22px;letter-spacing:0.18em;font-weight:600;color:${BRAND_COLOR};">${escapeHtml(altCode)}</p>`
              : ""
          }
          ${postCta ? `<p style="margin:0;font-size:13px;line-height:1.55;color:${MUTED};">${postCta}</p>` : ""}
        </td></tr>
        <tr><td style="padding:24px 4px 0 4px;">
          <p style="margin:0;font-size:11.5px;line-height:1.5;color:${MUTED};">
            You're receiving this email because someone (hopefully you) is using ${BRAND}.<br/>
            If this wasn't you, it's safe to ignore this message.
          </p>
          <p style="margin:12px 0 0 0;font-size:11.5px;color:${MUTED};">
            © ${new Date().getFullYear()} Virgilio Technologies LLC · <a href="https://findable.work/privacy" style="color:${MUTED};text-decoration:underline;">Privacy</a> · <a href="https://findable.work/terms" style="color:${MUTED};text-decoration:underline;">Terms</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export type AuthActionType =
  | "signup"
  | "login"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email_change_new"
  | "email"
  | "reauthentication";

export interface AuthEmailInput {
  actionType: AuthActionType;
  confirmationUrl: string;
  token: string; // 6-digit OTP fallback
  email: string;
  newEmail?: string;
  siteUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export function renderAuthEmail(input: AuthEmailInput): RenderedEmail {
  const { actionType, confirmationUrl, token } = input;

  switch (actionType) {
    case "signup":
      return {
        subject: "Confirm your findable account",
        html: shell({
          preheader: "Confirm your email to start using findable.",
          heading: "Confirm your email",
          intro: "Welcome to findable. Click the button below to confirm your email and finish setting up your account.",
          ctaLabel: "Confirm email",
          ctaUrl: confirmationUrl,
          altCodeLabel: "Or use this code",
          altCode: token,
          postCta: "This link expires in 24 hours.",
        }),
      };

    case "magiclink":
    case "login":
      return {
        subject: "Your findable sign-in link",
        html: shell({
          preheader: "One-click sign-in to findable.",
          heading: "Sign in to findable",
          intro: "Click the button below to sign in. No password needed.",
          ctaLabel: "Sign in",
          ctaUrl: confirmationUrl,
          altCodeLabel: "Or use this code",
          altCode: token,
          postCta: "This link expires in 1 hour and can only be used once.",
        }),
      };

    case "recovery":
      return {
        subject: "Reset your findable password",
        html: shell({
          preheader: "Reset the password for your findable account.",
          heading: "Reset your password",
          intro: "We received a request to reset your password. Click the button below to choose a new one.",
          ctaLabel: "Reset password",
          ctaUrl: confirmationUrl,
          altCodeLabel: "Or use this code",
          altCode: token,
          postCta: "If you didn't request this, you can safely ignore this email — your password will stay the same.",
        }),
      };

    case "invite":
      return {
        subject: "You've been invited to findable",
        html: shell({
          preheader: "Accept your invitation to join findable.",
          heading: "You've been invited",
          intro: "Someone invited you to join findable, the AI recruiting assistant. Accept your invitation to get started.",
          ctaLabel: "Accept invitation",
          ctaUrl: confirmationUrl,
          postCta: "This invitation expires in 7 days.",
        }),
      };

    case "email_change":
    case "email_change_new":
    case "email":
      return {
        subject: "Confirm your new findable email",
        html: shell({
          preheader: "Confirm the new email on your findable account.",
          heading: "Confirm your new email",
          intro: input.newEmail
            ? `Click below to confirm that <strong>${escapeHtml(input.newEmail)}</strong> is the new email for your findable account.`
            : "Click below to confirm the new email address on your account.",
          ctaLabel: "Confirm new email",
          ctaUrl: confirmationUrl,
          altCodeLabel: "Or use this code",
          altCode: token,
          postCta: "If you didn't request an email change, please contact support@findable.work right away.",
        }),
      };

    case "reauthentication":
      return {
        subject: "Your findable verification code",
        html: shell({
          preheader: "Use this code to verify it's you.",
          heading: "Verify it's you",
          intro: "Use the code below to confirm this is you. This code expires in 10 minutes.",
          altCodeLabel: "Verification code",
          altCode: token,
          postCta: "If you didn't request this, you can safely ignore this email.",
        }),
      };

    default:
      return {
        subject: "A message from findable",
        html: shell({
          preheader: "A message from findable.",
          heading: "A message from findable",
          intro: "Click the link below to continue.",
          ctaLabel: "Continue",
          ctaUrl: confirmationUrl,
        }),
      };
  }
}