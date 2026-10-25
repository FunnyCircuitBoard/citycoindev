/**
 * Outgoing e-mail for sign-in codes. Two ways to send, first one configured wins:
 *   1. Gmail: GMAIL_USER + GMAIL_APP_PASSWORD (a Google "app password", 2 minutes to make).
 *      The worker talks SMTP (port 587 + STARTTLS) straight to smtp.gmail.com — no new
 *      service, no domain verification.
 *   2. Resend: RESEND_API_KEY (REST API), EMAIL_FROM sets the sender.
 *
 * `deps.smtpImpl` lets tests fake the whole SMTP conversation; `deps.fetchImpl` fakes Resend.
 *
 * The product's name (the label migration, stage S48): the sender's display name and every word of the e-mails come from the label set
 * (src/brand.js brandOf, fail closed: the Citycoin.dev labels only with pages built for them). With today's label set every e-mail, its
 * sender and its SMTP greeting are exactly today's. Under another label set:
 *   - no address of the old name is shown: when the address the mail would go out from carries it (Resend: EMAIL_FROM, or the default
 *     noreply@vicinity.city; Gmail: GMAIL_USER), e-mail counts as not configured (emailConfigured false, sendMail "email_unavailable"):
 *     the pages then offer no e-mail step, as they do whenever no sender is set, until the owner sets a sender of the new name
 *     (a domain the mail provider has verified);
 *   - the words name the product, never a host to type: the links are the buttons, on the origin the request was served as
 *     (src/hostbind.js mailOrigin, stage S06) or else src/site-config.js's canonical origin, never written out in the text;
 *   - the SMTP greeting names the canonical host only when it is not an old name, else an address literal.
 */
import { brandOf } from "./brand.js";
import { LEGACY_HOSTS, siteConfig } from "./site-config.js";

const SMTP_TIMEOUT_MS = 12_000;

const b64 = (s) => btoa(String(s).replace(/[^\x00-\xff]/g, "?"));

class Smtp {
  constructor(socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
    this.buf = "";
  }
  async readLine() {
    for (;;) {
      const i = this.buf.indexOf("\r\n");
      if (i >= 0) { const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2); return line; }
      const { value, done } = await this.reader.read();
      if (done) throw new Error("smtp_eof");
      this.buf += new TextDecoder().decode(value);
    }
  }
  async expect(...codes) {
    let line;
    do { line = await this.readLine(); } while (/^\d{3}-/.test(line)); // multi-line replies
    if (!codes.includes(Number(line.slice(0, 3)))) throw new Error("smtp_" + line.slice(0, 60));
    return line;
  }
  async cmd(text, codes) {
    await this.writer.write(new TextEncoder().encode(text + "\r\n"));
    return this.expect(...[].concat(codes));
  }
  async startTls() {
    this.reader.releaseLock();
    this.writer.releaseLock();
    await this.socket.startTls();
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
    this.buf = "";
  }
  async data(message) {
    const stuffed = message.split("\r\n").map((l) => (l.startsWith(".") ? "." + l : l)).join("\r\n");
    await this.writer.write(new TextEncoder().encode(stuffed + "\r\n.\r\n"));
    await this.expect(250);
  }
  close() {
    try { this.reader.releaseLock(); } catch {}
    try { this.writer.releaseLock(); } catch {}
    try { this.socket.close(); } catch {}
  }
}

function mimeMessage({ from, to, subject, text, html }) {
  const safe = (s) => String(s).replace(/[\r\n]+/g, " ").slice(0, 200);
  const head = ["From: " + safe(from), "To: " + safe(to), "Subject: " + safe(subject),
    "MIME-Version: 1.0", "Content-Type: multipart/alternative; boundary=\"vicinity-boundary\"",
    "Content-Transfer-Encoding: 8bit", ""].join("\r\n");
  const part = (ct, body) => ["--vicinity-boundary", `Content-Type: ${ct}; charset=utf-8`, "", body].join("\r\n");
  return head + part("text/plain", text) + "\r\n" + part("text/html", html) + "\r\n--vicinity-boundary--\r\n";
}

function rawMessage({ from, to, subject, text }) {
  const safe = (s) => String(s).replace(/[\r\n]+/g, " ").slice(0, 200);
  return ["From: " + safe(from), "To: " + safe(to), "Subject: " + safe(subject),
    "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", text].join("\r\n");
}

/** The host the SMTP greeting (EHLO) names: today's "vicinity.city" under today's label set; under another, the canonical host unless it is
 *  an old name, else "[127.0.0.1]" (an address literal, which RFC 5321 allows a client without a name of its own to send). */
export function ehloName(env) {
  if (!brandOf(env).key) return "vicinity.city";
  const host = siteConfig(env).host;
  return LEGACY_HOSTS.includes(host) ? "[127.0.0.1]" : host;
}
/** Would the mail's visible sender carry the old name under a label set other than today's? (Today's label set: never asked: false.) */
export function senderShowsOldName(env) {
  const b = brandOf(env);
  if (!b.key) return false;
  const gmail = Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
  const from = gmail ? `${b.senderName} <${env.GMAIL_USER}>` : env.EMAIL_FROM || `${b.senderName} <noreply@vicinity.city>`;
  return /vicinity/i.test(String(from));
}

async function sendViaGmail(env, { to, subject, text, html }, smtpImpl) {
  if (senderShowsOldName(env)) return { ok: false, error: "email_unavailable" };
  const user = env.GMAIL_USER;
  const pass = String(env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) return { ok: false, error: "email_unavailable" };
  if (smtpImpl) return smtpImpl({ user, pass, from: user, to, subject, text, html });

  let conn = null;
  const fail = (e) => { console.error("gmail smtp failed", String(e && e.message || e)); return { ok: false, error: "email_unavailable" }; };
  try {
    const { connect } = await import("cloudflare:sockets");
    const done = (async () => {
      conn = new Smtp(connect({ hostname: "smtp.gmail.com", port: 587 }));
      await conn.expect(220);
      await conn.cmd(`EHLO ${ehloName(env)}`, 250);
      await conn.cmd("STARTTLS", 220);
      await conn.startTls();
      await conn.cmd(`EHLO ${ehloName(env)}`, 250);
      await conn.cmd("AUTH LOGIN", 334);
      await conn.cmd(b64(user), 334);
      await conn.cmd(b64(pass), 235);
      await conn.cmd(`MAIL FROM:<${user}>`, 250);
      await conn.cmd(`RCPT TO:<${to}>`, [250, 251]);
      await conn.cmd("DATA", 354);
      const from = `${brandOf(env).senderName} <${user}>`; // the display name from src/brand.js ("Vicinity" while BRAND is unset)
      await conn.data(html ? mimeMessage({ from, to, subject, text, html })
                           : rawMessage({ from, to, subject, text }));
      await conn.cmd("QUIT", 221);
      return { ok: true };
    })();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("smtp_timeout")), SMTP_TIMEOUT_MS));
    return await Promise.race([done, timeout]);
  } catch (e) { return fail(e); }
  finally { if (conn) conn.close(); }
}

export async function sendViaResend(env, { to, subject, text, html }, fetchImpl) {
  if (!env.RESEND_API_KEY || senderShowsOldName(env)) return { ok: false, error: "email_unavailable" };
  // the display name follows src/brand.js; the address stays on vicinity.city until the mail provider verifies another sending domain
  const from = env.EMAIL_FROM || `${brandOf(env).senderName} <noreply@vicinity.city>`;
  const body = { from, to: [to], subject, text };
  if (html) body.html = html;
  let res;
  try {
    res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000), // a stuck mail service answers "email_unavailable" in 8 s instead of holding the request
    });
  } catch (e) { console.error("code e-mail failed", String(e)); return { ok: false, error: "email_unavailable" }; }
  if (!res.ok) { console.error("code e-mail failed", res.status); return { ok: false, error: "email_unavailable" }; }
  return { ok: true };
}

export async function sendMail(env, { to, subject, text, html }, deps = {}) {
  // Defense in depth: whatever the caller checked, never let control characters, spaces or angle brackets
  // reach the SMTP "RCPT TO" line or a mail header.
  if (typeof to !== "string" || !to || /[\u0000-\u0020\u007f-\u009f<>]/.test(to)) return { ok: false, error: "bad_email" };
  if (senderShowsOldName(env)) return { ok: false, error: "email_unavailable" }; // never a sender of the old name under another label set
  const fetchImpl = deps.fetchImpl || fetch;
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) return sendViaGmail(env, { to, subject, text, html }, deps.smtpImpl || null);
  return sendViaResend(env, { to, subject, text, html }, fetchImpl);
}

/** E-mail sign-in is on when either sender is configured (and, under a label set other than today's, its address does not carry the old name). */
export const emailConfigured = (env) => Boolean((env.GMAIL_USER && env.GMAIL_APP_PASSWORD) || env.RESEND_API_KEY) && !senderShowsOldName(env);

/** What the code is for: the one phrase of the e-mail that changes. "signin" (the default) is the e-mail as it has always been. */
const KINDS = {
  signin: { name: "sign-in code", Name: "Your sign-in code", finish: "finish signing in" },
  signup: { name: "verification code", Name: "Your verification code", finish: "finish creating your account" },
  reset: { name: "password reset code", Name: "Your password reset code", finish: "set a new password" },
};

/** The origin the e-mails name when no other is given: today's site, the address every mail has always named. */
export const MAIL_ORIGIN = "https://vicinity.city";
/**
 * The site an e-mail names: { origin, host, eo, eh } (eo and eh HTML-escaped). `origin` is the origin the request was served as
 * (src/hostbind.js mailOrigin: an allowlist entry while the host binding counts, else MAIL_ORIGIN), so a sign-up or session made on
 * citycoin.dev, which is found only there, gets links to citycoin.dev (stage S06 review, finding R3). Anything that is not exactly an
 * http(s) origin with a plain host name (or address) and optional port falls back to `fallback` (MAIL_ORIGIN for today's e-mails; the
 * configured canonical origin for the e-mails of another label set, mailLook below); with MAIL_ORIGIN every e-mail is byte for byte what
 * it was.
 */
function mailSite(origin, fallback = MAIL_ORIGIN) {
  let u = null;
  try { u = typeof origin === "string" ? new URL(origin) : null; } catch { u = null; }
  const ok = u && (u.protocol === "https:" || u.protocol === "http:") && u.origin === origin && /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d+)?$/.test(u.host);
  const site = ok ? { origin: u.origin, host: u.host } : { origin: fallback, host: new URL(fallback).host };
  const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  return { ...site, eo: esc(site.origin), eh: esc(site.host) };
}

/**
 * The verification-code e-mail, branded like the site. Returns { subject, text, html }. The subject is the same for every kind.
 * `origin`: the site the code is to be entered on (mailSite above); left out, today's https://vicinity.city.
 * `env`: the label set (src/brand.js; left out, or with today's label set, today's e-mail for that origin) and, under another label set
 * when no usable origin is given, the configured canonical origin the button opens (src/site-config.js).
 */
export function verificationEmail(code, kind = "signin", origin = undefined, env = {}) {
  const look = mailLook(env, origin);
  return look ? brandedVerificationEmail(code, kind, look) : legacyVerificationEmail(code, kind, origin);
}
/** Today's verification-code e-mail, byte for byte for an origin (S06: the host the code was asked on). */
function legacyVerificationEmail(code, kind, origin) {
  const k = KINDS[kind] || KINDS.signin;
  const site = mailSite(origin);
  const subject = `${code} is your Vicinity code`;
  const text = `Your Vicinity ${k.name} is ${code}.\n\nEnter it at ${site.origin}/connect — it expires in 10 minutes.\nIf you didn't ask for this, just ignore this email.\n\n— Vicinity · One city. One coin. One community.`;
  const esc = String(code).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#060C17;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Vicinity ${k.name} is ${esc}. It expires in 10 minutes.</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#060C17;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background-color:#0A1322;border:1px solid #1B2A44;border-radius:16px;">
<tr><td align="center" style="padding:36px 32px 8px;">
<div style="font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:6px;color:#FFFFFF;">VICINITY<span style="color:#FF5A36;">.</span></div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#8A97AD;margin-top:10px;">ONE CITY &middot; ONE COIN &middot; ONE COMMUNITY</div>
</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#E8EDF5;">${k.Name}</div>
</td></tr>
<tr><td align="center" style="padding:12px 32px;">
<table cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="background-color:#0F1C31;border:1px solid #FFC857;border-radius:12px;padding:18px 36px;">
<div style="display:inline-block;font-family:'Courier New',Courier,monospace;font-size:44px;font-weight:700;letter-spacing:10px;padding-left:10px;color:#FFC857;">${esc}</div>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:14px 48px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#8A97AD;">Enter this code on ${site.eh} to ${k.finish}.<br>It expires in <b style="color:#E8EDF5;">10 minutes</b>.</div>
</td></tr>
<tr><td align="center" style="padding:18px 32px 36px;">
<a href="${site.eo}/connect" style="display:inline-block;background-color:#FF5A36;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:13px 40px;border-radius:999px;">Enter code</a>
</td></tr>
<tr><td align="center" style="padding:0 48px 32px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#5A6B87;">If you didn't request this code, you can safely ignore this email.<br>&copy; 2026 Vicinity &middot; <a href="${site.eo}" style="color:#5B8CFF;text-decoration:none;">${site.eh}</a></div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

/** The wallet app ids a link can be remembered with (src/walletlink.js WALLET_APPS), by the name people know. */
const APP_NAMES = { phantom: "Phantom", solflare: "Solflare", backpack: "Backpack", okx: "OKX Wallet", coinbase: "Coinbase Wallet", trust: "Trust Wallet",
  bitget: "Bitget Wallet", magiceden: "Magic Eden", exodus: "Exodus", jupiter: "Jupiter", binance: "Binance Wallet", nightly: "Nightly", coin98: "Coin98",
  tokenpocket: "TokenPocket", safepal: "SafePal", brave: "Brave Wallet" };

/**
 * "A wallet was connected to your Vicinity account": sent when a wallet joins an account from ANOTHER browser (a wallet app's own
 * browser, or a pairing), so the owner can say "that wasn't me" within 7 days (src/walletlink.js handleDisown). It holds only the wallet
 * masked ("Abcd…wxyz"), the app it was connected in (a name from the list above, else "A wallet app") and the dashboard link. Returns
 * { subject, text, html }, branded like the code e-mail. `origin`: the site the dashboard link opens; `env`: the label set (both as
 * verificationEmail's).
 */
export function walletLinkedEmail(masked, app, origin = undefined, env = {}) {
  const look = mailLook(env, origin);
  return look ? brandedWalletLinkedEmail(masked, app, look) : legacyWalletLinkedEmail(masked, app, origin);
}
/** Today's wallet notice, byte for byte for an origin. */
function legacyWalletLinkedEmail(masked, app, origin) {
  const who = APP_NAMES[app] || null;
  const site = mailSite(origin);
  const subject = "A wallet was connected to your Vicinity account";
  const what = who ? `${who} (wallet ${masked}) was connected to your Vicinity account.` : `The wallet ${masked} was connected to your Vicinity account.`;
  const text = `${what} If that was you, there's nothing to do.\n\nIf it wasn't you, open your dashboard on ${site.origin}/dashboard within 7 days and tap “Remove it”.\n\n— Vicinity · One city. One coin. One community.`;
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#060C17;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#060C17;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background-color:#0A1322;border:1px solid #1B2A44;border-radius:16px;">
<tr><td align="center" style="padding:36px 32px 8px;">
<div style="font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:6px;color:#FFFFFF;">VICINITY<span style="color:#FF5A36;">.</span></div>
</td></tr>
<tr><td align="center" style="padding:24px 40px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#E8EDF5;">${esc(what)}</div>
</td></tr>
<tr><td align="center" style="padding:10px 48px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#8A97AD;">If that was you, there's nothing to do.<br>If it wasn't you, open your dashboard within <b style="color:#E8EDF5;">7 days</b> and tap “Remove it”.</div>
</td></tr>
<tr><td align="center" style="padding:18px 32px 36px;">
<a href="${site.eo}/dashboard" style="display:inline-block;background-color:#FF5A36;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:13px 40px;border-radius:999px;">Open my dashboard</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

/**
 * "Google sign-in was added to your Vicinity account": sent when a member adds Google as a way to log in (src/logins.js googleNotice), so
 * an owner who did not add it hears of it the same day. It names no Google account (we keep only Google's account number, and never put
 * it in a mail) and says the two ways to take it off: Remove in the Profile, or a new password ("Forgot or never set a password?"), which
 * also logs out every browser. Returns { subject, text, html }, branded like the code e-mail. `origin`: the site its links open; `env`:
 * the label set (both as verificationEmail's).
 */
export function googleAddedEmail(origin = undefined, env = {}) {
  const look = mailLook(env, origin);
  return look ? brandedGoogleAddedEmail(look) : legacyGoogleAddedEmail(origin);
}
/** Today's Google notice, byte for byte for an origin. */
function legacyGoogleAddedEmail(origin) {
  const site = mailSite(origin);
  const subject = "Google sign-in was added to your Vicinity account";
  const what = "Google sign-in was added to your Vicinity account: from now on, “Log in with Google” with that Google account opens it.";
  const fix = `If it wasn't you, set a new password: on ${site.origin}/connect tap Log in, then “Forgot or never set a password?”. That logs out every browser and removes this Google sign-in. Or open your dashboard, Profile, Google sign-in, and tap “Remove”.`;
  const text = `${what} If that was you, there's nothing to do.\n\n${fix}\n\n— Vicinity · One city. One coin. One community.`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#060C17;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#060C17;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background-color:#0A1322;border:1px solid #1B2A44;border-radius:16px;">
<tr><td align="center" style="padding:36px 32px 8px;">
<div style="font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:6px;color:#FFFFFF;">VICINITY<span style="color:#FF5A36;">.</span></div>
</td></tr>
<tr><td align="center" style="padding:24px 40px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#E8EDF5;">${what}</div>
</td></tr>
<tr><td align="center" style="padding:10px 48px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#8A97AD;">If that was you, there's nothing to do.<br>If it wasn't you, set a new password: on ${site.eh} tap Log in, then “Forgot or never set a password?”. That logs out every browser and removes this Google sign-in.</div>
</td></tr>
<tr><td align="center" style="padding:18px 32px 36px;">
<a href="${site.eo}/connect?mode=login" style="display:inline-block;background-color:#FF5A36;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:13px 40px;border-radius:999px;">Open Vicinity</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

/* ---------------------------------------------------------------- the e-mails under another label set (BRAND=citycoin) */
const escHtml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
/**
 * How the e-mails look under a label set other than today's, or null for today's (src/brand.js brandOf, fail closed): the product's name, its
 * wordmark (the name in lower case with its last part, ".dev", in the brand's gold, as the logo writes it), the tagline, the Civic Atlas
 * colours (navy text on gold buttons: never white on gold), and the links of the buttons: on the origin the request was served as (`origin`,
 * src/hostbind.js mailOrigin, as today's e-mails since S06, so a sign-up made on citycoin.dev is mailed links to citycoin.dev), else on the
 * configured canonical origin (src/site-config.js). The words never write a host out.
 */
function mailLook(env, origin) {
  const b = brandOf(env || {});
  if (!b.key) return null;
  const name = b.productName, dot = name.lastIndexOf(".");
  const lower = name.toLowerCase();
  const wordmark = dot > 0 ? `${escHtml(lower.slice(0, dot))}<span style="color:#F8C13A;">${escHtml(lower.slice(dot))}</span>` : escHtml(lower);
  origin = mailSite(origin, siteConfig(env).origin).origin;
  return { name, esc: escHtml(name), wordmark, tagline: b.tagline, origin, gold: "#F8C13A", onGold: "#0C2344" };
}
/** The frame every branded e-mail shares: the wordmark, the tagline, the body rows, one button, the closing line. */
function brandedHtml(look, { preheader = "", rows, button, closing }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#060C17;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>\n` : ""}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#060C17;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background-color:#0A1322;border:1px solid #1B2A44;border-radius:16px;">
<tr><td align="center" style="padding:36px 32px 8px;">
<div style="font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;letter-spacing:1px;color:#FFFFFF;">${look.wordmark}</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#8A97AD;margin-top:10px;">${escHtml(look.tagline.toUpperCase().replace(/\.\s*/g, " · ").replace(/ · $/, ""))}</div>
</td></tr>
${rows}
<tr><td align="center" style="padding:18px 32px 36px;">
<a href="${escHtml(button.href)}" style="display:inline-block;background-color:${look.gold};color:${look.onGold};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:13px 40px;border-radius:999px;">${escHtml(button.text)}</a>
</td></tr>
${closing ? `<tr><td align="center" style="padding:0 48px 32px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#5A6B87;">${closing}</div>
</td></tr>
` : ""}</table>
</td></tr></table>
</body></html>`;
}
const signature = (look) => `— ${look.name} · ${look.tagline}`;

/** The verification-code e-mail under another label set: the same code and kinds, the product's name, no host written out. */
function brandedVerificationEmail(code, kind, look) {
  const k = KINDS[kind] || KINDS.signin;
  const subject = `${code} is your ${look.name} code`;
  const text = `Your ${look.name} ${k.name} is ${code}.\n\nEnter it on ${look.name}, where you asked for it. It expires in 10 minutes.\nIf you didn't ask for this, just ignore this email.\n\n${signature(look)}`;
  const esc = escHtml(code);
  const html = brandedHtml(look, {
    preheader: `Your ${look.esc} ${k.name} is ${esc}. It expires in 10 minutes.`,
    rows: `<tr><td align="center" style="padding:28px 32px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#E8EDF5;">${k.Name}</div>
</td></tr>
<tr><td align="center" style="padding:12px 32px;">
<table cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="background-color:#0F1C31;border:1px solid ${look.gold};border-radius:12px;padding:18px 36px;">
<div style="display:inline-block;font-family:'Courier New',Courier,monospace;font-size:44px;font-weight:700;letter-spacing:10px;padding-left:10px;color:${look.gold};">${esc}</div>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:14px 48px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#8A97AD;">Enter this code on ${look.esc} to ${k.finish}.<br>It expires in <b style="color:#E8EDF5;">10 minutes</b>.</div>
</td></tr>`,
    button: { href: `${look.origin}/connect`, text: "Enter code" },
    closing: `If you didn't request this code, you can safely ignore this email.<br>&copy; 2026 ${look.esc}`,
  });
  return { subject, text, html };
}

/** The wallet notice under another label set. */
function brandedWalletLinkedEmail(masked, app, look) {
  const who = APP_NAMES[app] || null;
  const subject = `A wallet was connected to your ${look.name} account`;
  const what = who ? `${who} (wallet ${masked}) was connected to your ${look.name} account.` : `The wallet ${masked} was connected to your ${look.name} account.`;
  const text = `${what} If that was you, there's nothing to do.\n\nIf it wasn't you, open your ${look.name} dashboard within 7 days and tap “Remove it”.\n\n${signature(look)}`;
  const html = brandedHtml(look, {
    rows: `<tr><td align="center" style="padding:24px 40px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#E8EDF5;">${escHtml(what)}</div>
</td></tr>
<tr><td align="center" style="padding:10px 48px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#8A97AD;">If that was you, there's nothing to do.<br>If it wasn't you, open your dashboard within <b style="color:#E8EDF5;">7 days</b> and tap “Remove it”.</div>
</td></tr>`,
    button: { href: `${look.origin}/dashboard`, text: "Open my dashboard" },
  });
  return { subject, text, html };
}

/** The Google notice under another label set. */
function brandedGoogleAddedEmail(look) {
  const subject = `Google sign-in was added to your ${look.name} account`;
  const what = `Google sign-in was added to your ${look.name} account: from now on, “Log in with Google” with that Google account opens it.`;
  const fix = `If it wasn't you, set a new password: on ${look.name} tap Log in, then “Forgot or never set a password?”. That logs out every browser and removes this Google sign-in. Or open your dashboard, Profile, Google sign-in, and tap “Remove”.`;
  const text = `${what} If that was you, there's nothing to do.\n\n${fix}\n\n${signature(look)}`;
  const html = brandedHtml(look, {
    rows: `<tr><td align="center" style="padding:24px 40px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#E8EDF5;">${escHtml(what)}</div>
</td></tr>
<tr><td align="center" style="padding:10px 48px 4px;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#8A97AD;">If that was you, there's nothing to do.<br>If it wasn't you, set a new password: on ${look.esc} tap Log in, then “Forgot or never set a password?”. That logs out every browser and removes this Google sign-in.</div>
</td></tr>`,
    button: { href: `${look.origin}/connect?mode=login`, text: `Open ${look.name}` },
  });
  return { subject, text, html };
}
