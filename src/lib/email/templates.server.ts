// Branded transactional email templates. Match the auth email visual style:
// white background, Alice wordmark + spark SVG header, Findable footer.

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SPARK_SVG = `<svg width="20" height="20" viewBox="0 137 73 73" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;margin-right:8px;" aria-hidden="true"><path d="M 72.648438 174.03125 C 45.804688 185.953125 48.335938 183.417969 36.417969 210.265625 C 24.496094 183.417969 27.027344 185.949219 0.183594 174.03125 C 27.027344 162.113281 24.496094 164.644531 36.417969 137.800781 C 48.335938 164.644531 45.804688 162.113281 72.648438 174.03125 Z" fill="#0a0a0a"/></svg>`;

function shell({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escape(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Alice&display=swap" rel="stylesheet">
  </head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
            <tr>
              <td style="padding:0 0 32px 0;">
                <div style="font-size:24px;font-weight:400;letter-spacing:-0.01em;color:#0a0a0a;font-family:'Alice',Georgia,'Times New Roman',serif;">${SPARK_SVG}<span style="vertical-align:middle;">findable</span></div>
              </td>
            </tr>
            ${body}
            <tr>
              <td style="padding:24px 0 0 0;border-top:1px solid #e5e5e5;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#a3a3a3;">
                  <a href="https://findable.work" style="color:#a3a3a3;text-decoration:none;">findable.work</a>
                  &nbsp;·&nbsp;
                  <a href="https://findable.work/terms" style="color:#a3a3a3;text-decoration:none;">Terms</a>
                  &nbsp;·&nbsp;
                  <a href="https://findable.work/privacy" style="color:#a3a3a3;text-decoration:none;">Privacy</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function heading(text: string): string {
  return `<tr><td style="padding:0 0 16px 0;"><h1 style="margin:0;font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.3;color:#0a0a0a;">${escape(text)}</h1></td></tr>`;
}

function paragraph(html: string): string {
  return `<tr><td style="padding:0 0 16px 0;"><p style="margin:0;font-size:15px;line-height:1.6;color:#525252;">${html}</p></td></tr>`;
}

function buttonRow(href: string, label: string): string {
  return `<tr><td style="padding:8px 0 32px 0;"><a href="${escape(href)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-size:15px;font-weight:500;">${escape(label)}</a></td></tr>`;
}

// ------------------------- Applicant confirmation -------------------------

export function applicationConfirmationHtml(opts: {
  candidateName: string;
  jobTitle: string;
  company: string;
}): { html: string; text: string; subject: string } {
  const first = opts.candidateName.split(/\s+/)[0] || "there";
  const subject = `We received your application for ${opts.jobTitle}`;
  const body =
    heading(`Thanks, ${first} — we got it.`) +
    paragraph(
      `Your application for <strong>${escape(opts.jobTitle)}</strong>${opts.company ? ` at <strong>${escape(opts.company)}</strong>` : ""} is in. The hiring team will review it and reach out if there's a fit.`,
    ) +
    paragraph(`No action needed from you right now — just keep an eye on this inbox.`);
  const text = [
    `Thanks, ${first} — we got it.`,
    "",
    `Your application for ${opts.jobTitle}${opts.company ? ` at ${opts.company}` : ""} is in.`,
    "The hiring team will review it and reach out if there's a fit.",
    "",
    "— findable",
  ].join("\n");
  return { html: shell({ title: subject, body }), text, subject };
}

// ------------------------- New applicant (instant) -------------------------

export function newApplicantInstantHtml(opts: {
  recruiterFirstName: string;
  applicantName: string;
  jobTitle: string;
  appUrl: string;
}): { html: string; text: string; subject: string } {
  const subject = `New applicant: ${opts.applicantName} for ${opts.jobTitle}`;
  const body =
    heading(`New applicant for ${opts.jobTitle}`) +
    paragraph(
      `<strong>${escape(opts.applicantName)}</strong> just applied. Open the candidate in Findable to review and decide next steps.`,
    ) +
    buttonRow(opts.appUrl, "Review applicant");
  const text = [
    `New applicant for ${opts.jobTitle}`,
    "",
    `${opts.applicantName} just applied.`,
    `Review: ${opts.appUrl}`,
  ].join("\n");
  return { html: shell({ title: subject, body }), text, subject };
}

// ------------------------- Daily digest -------------------------

export type DigestGroup = {
  jobTitle: string;
  applicants: { name: string; appUrl: string }[];
};

export function newApplicantDigestHtml(opts: {
  recruiterFirstName: string;
  groups: DigestGroup[];
}): { html: string; text: string; subject: string } {
  const total = opts.groups.reduce((n, g) => n + g.applicants.length, 0);
  const subject = `${total} new applicant${total === 1 ? "" : "s"} on Findable today`;

  const groupsHtml = opts.groups
    .map((g) => {
      const items = g.applicants
        .map(
          (a) =>
            `<li style="margin:0 0 6px 0;"><a href="${escape(a.appUrl)}" style="color:#0a0a0a;text-decoration:underline;font-weight:500;">${escape(a.name)}</a></li>`,
        )
        .join("");
      return `<tr><td style="padding:0 0 20px 0;">
        <div style="font-size:13px;font-weight:600;color:#0a0a0a;margin-bottom:8px;">${escape(g.jobTitle)} <span style="color:#a3a3a3;font-weight:400;">· ${g.applicants.length}</span></div>
        <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#525252;">${items}</ul>
      </td></tr>`;
    })
    .join("");

  const body =
    heading(
      `${total} new applicant${total === 1 ? "" : "s"} in the last 24 hours`,
    ) +
    paragraph(`Here's the recap from yesterday, grouped by job.`) +
    groupsHtml;

  const text = [
    `${total} new applicant${total === 1 ? "" : "s"} on Findable today`,
    "",
    ...opts.groups.flatMap((g) => [
      `${g.jobTitle} (${g.applicants.length})`,
      ...g.applicants.map((a) => `  - ${a.name}: ${a.appUrl}`),
      "",
    ]),
  ].join("\n");

  return { html: shell({ title: subject, body }), text, subject };
}