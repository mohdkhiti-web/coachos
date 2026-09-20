import type { Mail } from "@/lib/mail";

/**
 * Transactional emails. Plain, table-free HTML with inline styles (email clients ignore
 * stylesheets) in the "Playbook" paper/ink palette. English for now; locale-aware templates
 * arrive with the user's stored locale.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(opts: {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footer: string;
}) {
  const paras = opts.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#17150f">${esc(p)}</p>`,
    )
    .join("");
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#c2410c;color:#fff8f0;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px">${esc(opts.cta.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#5e584b">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(opts.cta.url)}</span></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f1e7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #d9d0bc;border-radius:8px;padding:32px">
<p style="margin:0 0 24px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#c2410c;font-weight:700">CoachOS</p>
<h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;color:#17150f">${esc(opts.heading)}</h1>
${paras}${cta}
<hr style="border:none;border-top:1px solid #d9d0bc;margin:24px 0">
<p style="margin:0;font-size:12px;line-height:1.5;color:#5e584b">${esc(opts.footer)}</p>
</div></body></html>`;
}

function text(opts: {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footer: string;
}) {
  return [
    opts.heading,
    "",
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    ...(opts.cta ? [`${opts.cta.label}: ${opts.cta.url}`, ""] : []),
    opts.footer,
  ].join("\n");
}

function build(to: string, subject: string, opts: Parameters<typeof layout>[0]): Mail {
  return { to, subject, text: text(opts), html: layout(opts) };
}

const IGNORE = "If you didn't expect this email, you can safely ignore it.";

export function verifyEmailMail(to: string, name: string, url: string): Mail {
  return build(to, "Verify your CoachOS email", {
    heading: `Welcome to CoachOS, ${name}`,
    paragraphs: [
      "Confirm your email address to finish creating your account. This link works once and expires in 1 hour.",
    ],
    cta: { label: "Verify email", url },
    footer: IGNORE,
  });
}

export function resetPasswordMail(to: string, name: string, url: string): Mail {
  return build(to, "Reset your CoachOS password", {
    heading: "Reset your password",
    paragraphs: [
      `Hi ${name}, we received a request to reset your password. This link works once and expires in 1 hour.`,
      "For your security, all other signed-in devices will be signed out after you reset it.",
    ],
    cta: { label: "Choose a new password", url },
    footer: IGNORE,
  });
}

export function existingAccountMail(to: string, name: string, signInUrl: string): Mail {
  return build(to, "Someone tried to register with your email", {
    heading: "You already have a CoachOS account",
    paragraphs: [
      `Hi ${name}, someone just tried to create a CoachOS account with this email address. Because you already have one, nothing changed.`,
      "If that was you, just sign in — or use “Forgot password” if you can't remember it.",
    ],
    cta: { label: "Sign in", url: signInUrl },
    footer: "If this wasn't you, no action is needed.",
  });
}

export function changeEmailConfirmMail(
  to: string,
  name: string,
  newEmail: string,
  url: string,
): Mail {
  return build(to, "Approve your CoachOS email change", {
    heading: "Approve email change",
    paragraphs: [
      `Hi ${name}, a request was made to change your CoachOS email to ${newEmail}. Approve it to continue — we'll then ask the new address to confirm.`,
    ],
    cta: { label: "Approve change", url },
    footer: "If you didn't request this, ignore this email and consider changing your password.",
  });
}

export function passwordChangedMail(to: string, name: string): Mail {
  return build(to, "Your CoachOS password was changed", {
    heading: "Password changed",
    paragraphs: [
      `Hi ${name}, the password for your CoachOS account was just changed.`,
      "If this was you, there's nothing to do. If it wasn't, reset your password immediately and review your active sessions in Settings → Security.",
    ],
    footer: "This is a security notification.",
  });
}
