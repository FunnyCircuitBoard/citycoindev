/**
 * The legacy link window (Citycoin.dev master v5, stage S14; master section 05 BR-03 "Where legacy users have only Google/email records,
 * preserve data but do not infer a wallet from an email or auto-merge. Use the already verified wallet mapping or authenticated legacy-link
 * evidence; mark unresolved ownership as a specific migration case. Do not restore Google as the new dashboard login path", section 18 WP-02
 * "Do not auto-merge by email ... An unlinked legacy record cannot grant a wallet someone else's dashboard"; R1-04; schema-and-api.md 2.2, 3.1, 4.1).
 * Everything here runs only while the window exists (src/v5policy.js legacyLink: "open" or "closed", which needs WALLET_ONLY to count); with the
 * switches unset src/index.js never reaches this file and the site is today's.
 *
 * WHO. A member whose account was made with Google or an e-mail address and still has no wallet (users.wallet NULL, provider google or email;
 * legacy_state legacy_unlinked, or closed_unresolved from an EARLIER window: a later window opens it again, review finding SEC-4). The live
 * site has no such account since the owner's deletion of all member data (24 Oct 2026, 16:56 UTC); Google and e-mail sign-up stay open
 * until WALLET_ONLY counts, so new ones can appear before then. A member with a wallet signs in with it (use_wallet); nobody else exists here (no_account). An account is found ONLY by the
 * login it was made with (its Google account number, or a Google sign-in the member added; its e-mail login address): never by a contact e-mail,
 * never by a wallet, never merged with another account.
 *
 * THE RESTRICTED SESSION (window open). A legacy login works only in its legacy form, which only /connect?mode=legacy asks for:
 *   GET  /api/auth/google/start?legacy=1 → Google (the OAuth cookie's marker "g") → GET /api/auth/google/callback → /connect?mode=legacy&legacy=signed_in
 *   POST /api/auth/email/start { email, legacy: true } → a 6-digit code, filed under its own name (legacy@<address>), mailed only to the address of
 *        an e-mail account (the same answer for any address)
 *   POST /api/auth/email/verify { email, code, legacy: true } → { ok, legacy: true, account, expiresAt, next: "/connect?mode=legacy" }
 * and makes a session row with auth 'legacy_link' and proof LEGACY_PROOF that lasts 15 minutes (LEGACY_SESSION_SECONDS) and carries no wallet.
 * src/auth.js getSession never counts it, whatever WALLET_ONLY says (it refuses the proof marker, and while WALLET_ONLY counts or is held it
 * counts only wallet sessions), so it is signed out everywhere (/api/me, the dashboard, every member route, the admin console), even on a later
 * switch-off. Only getLegacySession below reads it, and only these use it:
 *   POST /api/auth/challenge { purpose: "legacy_link", address }   the text names this account ("Link this wallet to my existing <product> account
 *        @<account>"), bound to this session (ref "l:<session>"), two minutes, once; 409 wallet_taken for a wallet that already has an account
 *   POST /api/me/wallet/link { challengeId, address, message, signature }   ONE D1 batch: the challenge is used, the account takes the wallet (only
 *        while it still has none and no account has this one: wallet_taken otherwise; the UNIQUE index is the last guard), legacy_state becomes
 *        linked_in_window, and the restricted session ends. The answer sends the person to Sign in (/connect?mode=login): the dashboard opens
 *        only after a wallet sign-in, never from a Google or e-mail login (master: "Do not restore Google as the new dashboard login path").
 *   POST /api/pair { purpose: "link" }   a phone's wallet for this browser: a five-minute link pairing (/connect#pair=<code>), approved by the phone
 *        with a legacy_link challenge naming its check number (POST /api/auth/wallet { pair }: src/auth.js), finished here (POST /api/pair/finish:
 *        finishLegacyPairing, the same batch as the link above)
 *   POST /api/auth/logout   ends it, like any session
 * No e-mail goes out after a link (today's "wallet connected" mail offers a "Remove it" this window does not have).
 *
 * AFTER LEGACY_LINK_UNTIL (window closed). Every route above answers 410 { error: "window_closed" } (their non-legacy forms keep the S10 404), a
 * restricted session counts for nothing, and the scheduled job (closeLegacyWindow) marks every account still without a wallet closed_unresolved:
 * its posts, profile, city and Terms receipt stay; no login opens it (src/auth.js getSession refuses it whatever the switches say), only a later
 * window. The person may register a new wallet account (location once). The job closes accounts only after a window was RECORDED OPEN (the
 * settings row WINDOW_KEY, written while the window is open: review finding SEC-4) and that window's own end has passed, so a LEGACY_LINK_UNTIL
 * set in the past by mistake, which never opened a window, closes nobody.
 *
 * Nothing here logs an address, an e-mail, a code or a hash in clear.
 */
import { clearCookie, cookie, getCookie, json, randomToken, readJson, redirect, sha256 } from "./http.js";
import { LEGACY_PROOF, SESSION_COOKIE } from "./session.js";
import { NULL_HOST, mailOrigin, onThisHost, servedHost } from "./hostbind.js";
import { ensureHostSchema, ensureLegacySchema } from "./store.js";
import { IDENTITY_POLICY, legacyLink } from "./v5policy.js";
import { OAUTH_COOKIE, PROVIDERS, cleanEmail, consumeEmailCode, guard, oauthStart, sendEmailCode, validEmail } from "./auth.js";
import { findAccount } from "./logins.js";
import { accountName } from "./walletlink.js";
import { checkChallenge, consumeStatement, usedByFor, usedClause } from "./challenge.js";
import { check, clientKey, limitKey } from "./limits.js";
import { asText } from "./signup-core.js";
import { emailConfigured } from "./mail.js";
import { HOUR, iso } from "./policy.js";

/** A restricted session lasts 15 minutes (R1-04 and the master's S14 row: "a restricted 15-minute session that can only link a wallet"). */
export const LEGACY_SESSION_SECONDS = 15 * 60;
/** sessions.auth of a restricted session. */
export const LEGACY_AUTH = "legacy_link";
/** What a legacy_link challenge is bound to: the restricted session that asked ("l:"), or a link pairing a phone approves ("lp:"). */
export const legacySessionRef = (id) => `l:${id}`;
export const legacyPairRef = (id) => `lp:${id}`;
/** The name a legacy e-mail code is filed under: never usable by another route (cf. src/pwlogin.js resetKey). */
export const legacyCodeKey = (email) => `legacy@${email}`;
/** An account an open window may open (users alias u): no wallet, made with Google or an e-mail address, unlinked, or closed by an EARLIER
 *  window (every use runs only while a window is open: a window open now is a later one than any that closed; review finding SEC-4). */
export const LINKABLE = "u.wallet IS NULL AND u.provider IN ('google', 'email') AND COALESCE(u.legacy_state, 'legacy_unlinked') IN ('legacy_unlinked', 'closed_unresolved')";
/** The settings row that records the end (LEGACY_LINK_UNTIL, ISO) of the window last seen open (review finding SEC-4). */
export const WINDOW_KEY = "legacy_window_open";
/** Record that the window `w` is open (its end), so that closing it later closes accounts (closeLegacyWindow). Never throws on its own failure. */
async function recordOpen(db, w) {
  if (w.state !== "open") return;
  await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(WINDOW_KEY, w.until).run();
}
// tries per hour, counted before the work (src/limits.js)
const LIMITS = { emailStart: { ip: 20, address: 5 }, emailVerify: { ip: 60 }, link: { user: 10, ip: 30 } };
const maskWallet = (w) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/** 410 window_closed (with the instant it closed). */
export const windowClosed = (w) => json({ ok: false, error: "window_closed", until: w.until }, 410);
const unavailable = () => json({ ok: false, error: "unavailable" }, 503);
const slowDown = () => json({ ok: false, error: "slow_down" }, 429);
const perHour = async (env, kind, value, max) => ({ key: await limitKey(env, kind, value), windowMs: HOUR, max });
const fail = (e, what) => console.error(what, String((e && e.message) || e).slice(0, 80));

/* ---------------------------------------------------------------- the account a legacy login opens */

/**
 * The account a verified Google or e-mail login belongs to, for the window: { user } or { error }. `provider` google or email, `id` the Google
 * account number or the e-mail login address (src/logins.js findAccount: the account's own login, or a Google sign-in the member added; never a
 * contact e-mail). Errors: no_account (nobody has this login), use_wallet (the account has a wallet: sign in with it), window_closed (the
 * account was closed when an earlier window ended). The caller has run ensureLegacySchema.
 */
export async function legacyAccount(env, provider, id) {
  const found = await findAccount(env.DB, provider, id);
  if (!found) return { error: "no_account" };
  const u = await env.DB.prepare("SELECT id, handle, name, wallet, provider, legacy_state FROM users WHERE id = ?").bind(found.id).first();
  if (!u) return { error: "no_account" };
  if (u.wallet) return { error: "use_wallet" };
  // (closed_unresolved: closed by an earlier window; this one, open now, opens it again: LINKABLE)
  if (!["google", "email"].includes(u.provider)) return { error: "no_account" };
  return { user: u };
}

/**
 * Make this browser's restricted session for account `userId` (window open; the caller checked the account with legacyAccount). ONE batch: this
 * browser's current session ends (on this host only while the host binding counts), and the new row is written only while the account is still
 * one the window may open. Returns { cookie, expiresAt } or { error } (window_closed: the account changed meanwhile). Throws on a database failure.
 */
export async function startLegacySession(env, request, userId, now) {
  const db = env.DB, served = servedHost(env, request);
  await ensureLegacySchema(db);
  if (served.bound) await ensureHostSchema(db, "sessions");
  const old = getCookie(request, SESSION_COOKIE);
  const oldId = old && old.length <= 100 ? await sha256(old) : null;
  const token = randomToken(32), id = await sha256(token), until = now + LEGACY_SESSION_SECONDS * 1000;
  // (proof LEGACY_PROOF: src/auth.js getSession refuses the row by it whatever WALLET_ONLY says, review finding SEC-1)
  const cols = ["id", "wallet", "user_id", "proof", "created_at", "expires_at", "proven_at", "auth"], vals = ["?", "NULL", "u.id", "?", "?", "?", "NULL", `'${LEGACY_AUTH}'`];
  const args = [id, LEGACY_PROOF, iso(now), iso(until)];
  if (served.bound) { cols.push("host"); vals.push("?"); args.push(served.key); }
  const stmts = [];
  if (oldId) stmts.push(served.bound ? db.prepare("DELETE FROM sessions WHERE id = ? AND COALESCE(host, ?) = ?").bind(oldId, NULL_HOST, served.key)
    : db.prepare("DELETE FROM sessions WHERE id = ?").bind(oldId));
  stmts.push(db.prepare(`INSERT INTO sessions (${cols.join(", ")}) SELECT ${vals.join(", ")} FROM users u WHERE u.id = ? AND ${LINKABLE}`).bind(...args, userId));
  const res = await db.batch(stmts);
  if (!res[res.length - 1].meta.changes) return { error: "window_closed" };
  try { await recordOpen(db, legacyLink(env, now)); } catch (e) { fail(e, "legacy window not recorded"); } // (the job records it too)
  console.log("legacy link login"); // no identifiers
  return { cookie: cookie(SESSION_COOKIE, token, LEGACY_SESSION_SECONDS), expiresAt: iso(until) };
}

/**
 * This browser's restricted session, while the window is open: { id, user, expiresAt } or null (none, another kind of session, run out, made on
 * another host, or an account the window no longer opens). Throws on a database failure (the caller answers 503). A wallet session is never
 * returned here, and src/auth.js getSession never returns this one.
 */
export async function getLegacySession(env, request, now = Date.now()) {
  if (legacyLink(env, now).state !== "open" || !env.DB) return null;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const served = servedHost(env, request);
  if (served.refused) return null;
  await ensureLegacySchema(env.DB);
  if (served.bound) await ensureHostSchema(env.DB, "sessions");
  const row = await env.DB.prepare(`SELECT id, user_id, expires_at, auth${served.bound ? ", host" : ""} FROM sessions WHERE id = ?`).bind(await sha256(token)).first();
  if (!row || row.auth !== LEGACY_AUTH || !row.user_id || !(Date.parse(row.expires_at) > now)) return null;
  if (served.bound && !onThisHost(served, row.host)) return null;
  const user = await env.DB.prepare(`SELECT u.* FROM users u WHERE u.id = ? AND ${LINKABLE}`).bind(row.user_id).first();
  return user ? { id: row.id, user, expiresAt: row.expires_at } : null;
}

/* ---------------------------------------------------------------- the legacy logins (window open) */

/** GET /api/auth/google/start?legacy=1: off to Google, the OAuth cookie marked "g" (only the legacy callback below takes it). */
export async function handleLegacyGoogleStart(request, env) {
  if (!PROVIDERS.google.configured(env) || !env.DB) return redirect("/connect?mode=legacy&error=login_unavailable");
  const go = await oauthStart(request, env, "google", ".g");
  return redirect(go.url, [go.cookie]);
}

/**
 * GET /api/auth/google/callback while the window is open. Only a trip that the legacy start began (the cookie's marker "g") is taken: any other
 * answers what the route answers under WALLET_ONLY alone (404). Every answer goes back to /connect?mode=legacy: legacy=signed_in and the
 * restricted session's cookie, or error=<code> (login_unavailable, login_cancelled, login_expired, login_failed, no_account with login=google,
 * use_wallet, window_closed). The return address is fixed: no open redirect.
 */
export async function handleLegacyGoogleCallback(request, env, fetchImpl = fetch, now = Date.now()) {
  const [cp, state, verifier, marker] = (getCookie(request, OAUTH_COOKIE) || "").split(".");
  if (marker !== "g") return json({ error: "not_found" }, 404);
  const url = new URL(request.url), p = PROVIDERS.google, clear = clearCookie(OAUTH_COOKIE);
  const back = (q, more = []) => redirect(`/connect?mode=legacy&${q}`, [clear, ...more]);
  if (!p.configured(env) || !env.DB) return back("error=login_unavailable");
  if (url.searchParams.get("error")) return back("error=login_cancelled");
  const code = url.searchParams.get("code");
  if (cp !== "google" || !state || state !== url.searchParams.get("state") || !code || !verifier) return back("error=login_expired");
  let who;
  try { who = await p.identity(env, { code, redirectUri: `${servedHost(env, request).origin}/api/auth/google/callback`, verifier }, fetchImpl); }
  catch (e) { fail(e, "legacy google login failed"); return back(`error=${e && e.message === "oauth_unavailable" ? "login_unavailable" : "login_failed"}`); }
  try {
    await ensureLegacySchema(env.DB);
    const a = await legacyAccount(env, "google", who.id);
    if (a.error) return back(`error=${a.error}${a.error === "no_account" ? "&login=google" : ""}`);
    const s = await startLegacySession(env, request, a.user.id, now);
    if (s.error) return back(`error=${s.error}`);
    return back("legacy=signed_in", [s.cookie]);
  } catch (e) { fail(e, "legacy login not recorded"); return back("error=login_unavailable"); }
}

/**
 * POST /api/auth/email/start { email, legacy: true } while the window is open → { ok: true } for every well-formed address. The code is filed
 * under legacy@<address> (no other route can use it) and mailed only when an e-mail account has this login address (with a wallet or without:
 * the verify step says which); any other address does the same database work and gets no mail, so the answer says nothing about an account.
 * Counted per connection (20 an hour) and per address (5 an hour), known and unknown alike.
 */
export async function handleLegacyEmailStart(request, env, body, fetchImpl = fetch, now = Date.now(), ctx = null) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const email = cleanEmail(asText(body && body.email));
  if (!validEmail(email)) return json({ ok: false, error: "bad_email" }, 400);
  if (!emailConfigured(env)) return json({ ok: false, error: "email_unavailable" }, 503);
  try {
    await ensureLegacySchema(env.DB);
    if (!(await check(env, [await perHour(env, "lgsi", clientKey(request), LIMITS.emailStart.ip)], now)).ok) return slowDown();
    if (!(await check(env, [await perHour(env, "lgsa", email, LIMITS.emailStart.address)], now)).ok) return slowDown();
    const user = await env.DB.prepare("SELECT id FROM users WHERE provider = 'email' AND provider_id = ?").bind(email).first();
    const pending = [];
    const waitUntil = (pr) => (ctx && ctx.waitUntil ? ctx.waitUntil(pr) : pending.push(pr));
    const sent = await sendEmailCode(env, email, { fetchImpl, now, kind: "signin", codeKey: legacyCodeKey(email), waitUntil, noSend: !user, origin: mailOrigin(servedHost(env, request)) });
    await Promise.all(pending); // (only without a ctx, in tests: the mail has gone when the answer leaves)
    if (!sent.ok) return json({ ok: false, error: sent.error }, sent.status);
    return json({ ok: true });
  } catch (e) { fail(e, "legacy code not sent"); return unavailable(); }
}

/**
 * POST /api/auth/email/verify { email, code, legacy: true } while the window is open → { ok: true, legacy: true, account: "<account>", expiresAt,
 * next: "/connect?mode=legacy" } and the restricted session's cookie. Errors: bad_code (400), the code's own (code_wrong with left, code_expired:
 * 400; too_many: 429), no_account (404: no account was made with this e-mail address), use_wallet (409), window_closed (410), slow_down (429).
 */
export async function handleLegacyEmailVerify(request, env, body, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const email = cleanEmail(asText(body && body.email));
  const code = asText((body && body.code) || "").replace(/\D/g, "").slice(0, 6);
  if (!validEmail(email) || code.length !== 6) return json({ ok: false, error: "bad_code" }, 400);
  try {
    await ensureLegacySchema(env.DB);
    if (!(await check(env, [await perHour(env, "lgvi", clientKey(request), LIMITS.emailVerify.ip)], now)).ok) return slowDown();
    const v = await consumeEmailCode(env.DB, legacyCodeKey(email), code, now);
    if (!v.ok) return json({ ok: false, error: v.error, ...(v.left != null ? { left: v.left } : {}) }, v.error === "too_many" ? 429 : 400);
    const a = await legacyAccount(env, "email", email);
    if (a.error) return json({ ok: false, error: a.error, ...(a.error === "no_account" ? { login: "email" } : {}) }, a.error === "no_account" ? 404 : a.error === "use_wallet" ? 409 : 410);
    const s = await startLegacySession(env, request, a.user.id, now);
    if (s.error) return json({ ok: false, error: s.error }, 410);
    return json({ ok: true, legacy: true, account: accountName(a.user), expiresAt: s.expiresAt, next: "/connect?mode=legacy" }, 200, { "Set-Cookie": s.cookie });
  } catch (e) { fail(e, "legacy login not recorded"); return unavailable(); }
}

/* ---------------------------------------------------------------- the challenge, the link, the pairing */

/**
 * What POST /api/auth/challenge { purpose: "legacy_link" } needs (src/auth.js handleChallenge): { opts } for src/challenge.js issueChallenge, or
 * { error: Response }. Window closed: 410 window_closed; off: 400 bad_purpose (as under WALLET_ONLY alone). Open, with `pair` (a phone, no session
 * needed): a live link pairing of this host, not yet approved, for an account the window opens (410 pair_expired otherwise), the text naming
 * that account and the check number. Open, without: this browser's restricted session (401 legacy_sign_in), the text naming its account.
 * Either way a wallet that already has an account is refused at once (409 wallet_taken): only a wallet without one can be linked.
 */
export async function legacyChallenge(env, request, body, address, served, now, findPair) {
  const w = legacyLink(env, now);
  if (w.state === "closed") return { error: windowClosed(w) };
  if (w.state !== "open") return { error: json({ ok: false, error: "bad_purpose" }, 400) };
  if (body.handoff != null) return { error: json({ ok: false, error: "bad_request" }, 400) };
  await ensureLegacySchema(env.DB);
  let opts;
  if (body.pair != null) {
    const p = await findPair(env, body.pair, now, served);
    const owner = p && p.purpose === "link" && !p.wallet && p.user_id
      ? await env.DB.prepare(`SELECT u.id, u.handle FROM users u WHERE u.id = ? AND ${LINKABLE}`).bind(p.user_id).first() : null;
    if (!owner) return { error: json({ ok: false, error: "pair_expired" }, 410) };
    opts = { ref: legacyPairRef(p.id), pin: p.pin, account: accountName(owner) };
  } else {
    const s = await getLegacySession(env, request, now);
    if (!s) return { error: json({ ok: false, error: "legacy_sign_in" }, 401) };
    opts = { ref: legacySessionRef(s.id), account: accountName(s.user) };
  }
  if (await env.DB.prepare("SELECT id FROM users WHERE wallet = ?").bind(address).first()) return { error: json({ ok: false, error: "wallet_taken" }, 409) };
  return { opts };
}

/**
 * The statements of a legacy link (one D1 batch, after the gate statement that uses the challenge or the pairing, whose condition `cond` they
 * carry): the account takes the wallet only while it is still one the window opens and no account has this wallet (the UNIQUE index is the last
 * guard), legacy_state becomes linked_in_window, and the restricted session `sessionId` ends, only if the link happened. The account's other
 * sessions (Google or e-mail ones from before the switch) are not touched: they never carried a wallet and stay signed out.
 */
function linkStatements(db, { userId, wallet, via, sessionId, now, cond }) {
  return [
    db.prepare(`UPDATE users SET wallet = ?, wallet_at = ?, wallet_via = ?, wallet_app = NULL, legacy_state = 'linked_in_window'
        WHERE id = ? AND id IN (SELECT u.id FROM users u WHERE ${LINKABLE})
        AND NOT EXISTS (SELECT 1 FROM users o WHERE o.wallet = ?)${cond.sql}`).bind(wallet, iso(now), via, userId, wallet, ...cond.args),
    db.prepare("DELETE FROM sessions WHERE id = ? AND auth = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND wallet = ?)").bind(sessionId, LEGACY_AUTH, userId, wallet),
  ];
}
/** Why a link changed nothing: link_done (the account has a wallet now), wallet_taken (another account has this one), else window_closed. */
async function whyNot(env, userId, wallet) {
  const u = await env.DB.prepare("SELECT wallet FROM users WHERE id = ?").bind(userId).first();
  if (u && u.wallet) return json({ ok: false, error: "link_done" }, 409);
  if (await env.DB.prepare("SELECT id FROM users WHERE wallet = ?").bind(wallet).first()) return json({ ok: false, error: "wallet_taken" }, 409);
  return json({ ok: false, error: "window_closed" }, 410);
}
/** The answer of a link that went through: the restricted session's cookie is cleared, and the person signs in with the wallet next. */
const linked = (wallet, extra = {}) => json({ ok: true, linked: true, wallet, next: "/connect?mode=login", ...extra }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });

/**
 * POST /api/me/wallet/link { challengeId, address, message, signature } while the window is open (src/index.js: 410 closed, 404 off): this browser's
 * restricted session links the wallet that signed a legacy_link challenge issued for it. Errors: 401 legacy_sign_in, every src/challenge.js
 * refusal (wrong_wallet 403 for a challenge of another wallet, signature_mismatch 401, challenge_used 409, challenge_expired 410, wrong_purpose,
 * wrong_site...), 403 wrong_session (a challenge another session asked for), 409 wallet_taken | link_done, 410 window_closed, 429 slow_down,
 * 503 unavailable. Success: { ok, linked: true, wallet, next: "/connect?mode=login" } and the restricted session's cookie cleared.
 */
export async function handleLegacyLink(request, env, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  let s;
  try { s = await getLegacySession(env, request, now); }
  catch (e) { fail(e, "legacy session unreadable"); return unavailable(); }
  if (!s) return json({ ok: false, error: "legacy_sign_in" }, 401);
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "bad_json" }, 400);
  try {
    if (!(await check(env, [await perHour(env, "lgls", s.user.id, LIMITS.link.user), await perHour(env, "lgli", clientKey(request), LIMITS.link.ip)], now)).ok) return slowDown();
  } catch (e) { fail(e, "legacy link limits unavailable"); return unavailable(); }
  const served = servedHost(env, request);
  const c = await checkChallenge(env, body, { served, purposes: ["legacy_link"], now });
  if (c.error) return c.error;
  if (c.row.ref !== legacySessionRef(s.id)) return json({ ok: false, error: "wrong_session" }, 403);
  const wallet = c.row.wallet;
  const usedBy = await usedByFor(`legacy:${s.id}`), cond = usedClause(c.row, usedBy);
  let res;
  try {
    res = await env.DB.batch([consumeStatement(env.DB, c.row, usedBy, now), ...linkStatements(env.DB, { userId: s.user.id, wallet, via: "legacy", sessionId: s.id, now, cond })]);
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) return json({ ok: false, error: "wallet_taken" }, 409);
    fail(e, "legacy link not recorded");
    return unavailable();
  }
  if (!res[0].meta.changes) return json({ ok: false, error: "challenge_used" }, 409);
  if (!res[1].meta.changes) return whyNot(env, s.user.id, wallet);
  console.log("wallet linked (legacy window)", maskWallet(wallet));
  return linked(wallet);
}

/**
 * POST /api/pair { purpose: "link" } while WALLET_ONLY counts (src/auth.js handlePairStart): window open → this browser's restricted session gets a
 * five-minute link pairing for its account: { ok, code, pin, purpose: "link", url: <origin>/connect#pair=<code>, expiresAt } (401 legacy_sign_in
 * without one); closed → 410 window_closed; off → 400 bad_request (as under WALLET_ONLY alone). The code travels only in the link's fragment and
 * in POST bodies. `makePair` is src/auth.js's insert (the host binding included).
 */
export async function legacyPairStart(request, env, now, makePair) {
  const w = legacyLink(env, now);
  if (w.state === "closed") return windowClosed(w);
  if (w.state !== "open") return json({ ok: false, error: "bad_request" }, 400);
  let s;
  try { s = await getLegacySession(env, request, now); }
  catch (e) { fail(e, "legacy session unreadable"); return unavailable(); }
  if (!s) return json({ ok: false, error: "legacy_sign_in" }, 401);
  const p = await makePair({ purpose: "link", userId: s.user.id, life: IDENTITY_POLICY.handoffSeconds });
  return json({ ok: true, code: p.code, pin: p.pin, purpose: "link", url: `${p.origin}/connect#pair=${p.code}`, expiresAt: p.expiresAt });
}

/**
 * POST /api/pair/finish for a link pairing while the window is open (src/auth.js handlePairFinish): only the restricted session of the pairing's
 * own account may finish it (410 expired otherwise); not yet approved → { ok: false, status: "waiting" }; approved → ONE batch: the account takes
 * the wallet the phone approved with (the same statements as handleLegacyLink, via 'legacy_pair', gated on the approved pairing), the pairing
 * goes, the restricted session ends: { ok, status: "done", linked: true, wallet, next: "/connect?mode=login" }. 409 wallet_taken | link_done.
 */
export async function finishLegacyPairing(request, env, p, now) {
  let s;
  try { s = await getLegacySession(env, request, now); }
  catch (e) { fail(e, "legacy session unreadable"); return unavailable(); }
  if (!s || s.user.id !== p.user_id) return json({ ok: false, status: "expired" }, 410);
  if (!p.wallet) return json({ ok: false, status: "waiting" });
  const wallet = p.wallet;
  const cond = { sql: " AND EXISTS (SELECT 1 FROM pairs WHERE id = ? AND purpose = 'link' AND user_id = ? AND wallet = ? AND expires_at > ?)", args: [p.id, p.user_id, wallet, iso(now)] };
  let res;
  try {
    res = await env.DB.batch([
      ...linkStatements(env.DB, { userId: s.user.id, wallet, via: "legacy_pair", sessionId: s.id, now, cond }),
      env.DB.prepare("DELETE FROM pairs WHERE id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND wallet = ?)").bind(p.id, s.user.id, wallet),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e))) return json({ ok: false, error: "wallet_taken" }, 409);
    fail(e, "legacy link not recorded");
    return unavailable();
  }
  if (!res[0].meta.changes) return whyNot(env, s.user.id, wallet);
  console.log("wallet linked (legacy window, pairing)", maskWallet(wallet));
  return linked(wallet, { status: "done" });
}

/* ---------------------------------------------------------------- the scheduled job */

/**
 * The job's step while the window exists (src/jobs.js): the census is written once (ensureLegacySchema), then
 *   open    the window is recorded open (WINDOW_KEY: its end), and a Google or e-mail account without a wallet that has no case yet (made after
 *           the census, during a switch-off) becomes legacy_unlinked;
 *   closed  only once a window was recorded open and that window's recorded end has passed (review finding SEC-4: a LEGACY_LINK_UNTIL in the
 *           past that never opened a window closes nobody): every account the window could still have opened becomes closed_unresolved (its
 *           data stays; no login opens it, only a later window);
 * and either way an account recorded legacy_unlinked that got its wallet outside the window (today's dashboard link, during a switch-off) is
 * wallet_linked. Returns { state, closed, unlinked, linked } (counts of rows changed). Off: nothing runs, { state: "off" }.
 */
export async function closeLegacyWindow(env, now = Date.now()) {
  const w = legacyLink(env, now);
  if (w.state === "off") return { state: "off" };
  await ensureLegacySchema(env.DB);
  const db = env.DB;
  if (w.state === "open") await recordOpen(db, w);
  const res = await db.batch([
    db.prepare("UPDATE users SET legacy_state = 'wallet_linked' WHERE legacy_state = 'legacy_unlinked' AND wallet IS NOT NULL"),
    w.state === "closed"
      ? db.prepare(`UPDATE users SET legacy_state = 'closed_unresolved' WHERE wallet IS NULL AND provider IN ('google', 'email') AND (legacy_state IS NULL OR legacy_state = 'legacy_unlinked')
          AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value <= ?)`).bind(WINDOW_KEY, iso(now))
      : db.prepare("UPDATE users SET legacy_state = 'legacy_unlinked' WHERE wallet IS NULL AND provider IN ('google', 'email') AND legacy_state IS NULL"),
  ]);
  return { state: w.state, linked: res[0].meta.changes, [w.state === "closed" ? "closed" : "unlinked"]: res[1].meta.changes };
}

/* ---------------------------------------------------------------- what the pages are told */

/** The `legacyLink` key of GET /api/me while the window exists ({ open, until }); null when it does not (no key: the S10 answer). */
export function legacyNotice(env, now = Date.now()) {
  const w = legacyLink(env, now);
  return w.state === "off" ? null : { open: w.state === "open", until: w.until };
}

/* ---------------------------------------------------------------- the routes (src/index.js, only while WALLET_ONLY counts) */

/** The legacy forms of the Google and e-mail login paths (WALLET_ONLY_GONE in src/index.js). */
export const LEGACY_LOGIN_PATHS = new Set(["/api/auth/google/start", "/api/auth/google/callback", "/api/auth/email/start", "/api/auth/email/verify"]);

/**
 * One of LEGACY_LOGIN_PATHS while WALLET_ONLY counts: the Response of its legacy form, or null, and src/index.js answers what an unknown path
 * answers (the S10 404, before any method check). Only the legacy form is ever answered: GET /api/auth/google/start?legacy=1, GET
 * /api/auth/google/callback of a trip that form began (the OAuth cookie's marker "g"), and POST /api/auth/email/start or /verify with
 * { legacy: true } in the body. Window open: the handlers above; closed: 410 window_closed; off: null for everything.
 */
export async function routeLegacyLogin(request, env, path, fetchImpl = fetch, ctx = null, now = Date.now()) {
  const w = legacyLink(env, now);
  if (w.state === "off") return null;
  const method = request.method;
  if (path === "/api/auth/google/start") {
    if (method !== "GET" || new URL(request.url).searchParams.get("legacy") !== "1") return null;
    return w.state === "closed" ? windowClosed(w) : handleLegacyGoogleStart(request, env);
  }
  if (path === "/api/auth/google/callback") {
    if (method !== "GET" || (getCookie(request, OAUTH_COOKIE) || "").split(".")[3] !== "g") return null;
    return w.state === "closed" ? windowClosed(w) : handleLegacyGoogleCallback(request, env, fetchImpl, now);
  }
  if (method !== "POST") return null;
  const body = await readJson(request.clone());
  if (!body || body.legacy !== true) return null;
  if (w.state === "closed") return windowClosed(w);
  return path === "/api/auth/email/start" ? handleLegacyEmailStart(request, env, body, fetchImpl, now, ctx) : handleLegacyEmailVerify(request, env, body, now);
}

/**
 * Every /api/me/wallet/* path while WALLET_ONLY counts. /api/me/wallet/link is the legacy link (window open: POST only, 405 otherwise; closed: 410
 * window_closed; off: the unknown-path 404). Every other one (the "Open app" carry routes and "Wasn't you? Remove it") answers the unknown-path
 * 404 for every method: a wallet-only account always has its wallet, a link code made before the switch can no longer link one outside the
 * window, and no restricted session is ever an "older browser" that could remove a wallet (so a wallet that will hold a FounderRecord can never
 * be taken off an account this way). /api/me/wallet/unlink is already gone (src/index.js WALLET_ONLY_GONE).
 */
export async function routeLegacyWallet(request, env, path, now = Date.now()) {
  if (path !== "/api/me/wallet/link") return json({ error: "not_found" }, 404);
  const w = legacyLink(env, now);
  if (w.state === "off") return json({ error: "not_found" }, 404);
  if (w.state === "closed") return windowClosed(w);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  return handleLegacyLink(request, env, now);
}
