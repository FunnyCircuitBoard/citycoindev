/**
 * Accounts and sign-in. One person = ONE wallet + ONE Google login or verified e-mail, so
 * nobody can run a crowd of accounts to spam their city.
 *
 * New person (today's flow, SIGNUP_FLOW unset):
 *   1. prove the wallet: sign a free message (or, for apps that can't sign, send yourself a tiny
 *      exact amount of SOL; or sign on your phone for this computer by scanning a code)
 *   2. sign in with Google or verify an e-mail address with a code → the two are linked for
 *      good → dashboard
 * New person (SIGNUP_FLOW=v2, src/signup.js): location → Terms + Google or e-mail with a password → the account
 *   is created in one atomic step the moment the login is verified (src/signup-finish.js, called from the Google
 *   callback here), with no wallet: the wallet is linked later from the dashboard (src/walletlink.js). In v2 this
 *   file itself never creates an account: an unknown Google id or e-mail answers "no_account" here, and only signs
 *   people in.
 * Returning person: either the wallet OR the linked Google login / verified e-mail signs them
 * straight in (and, in v2, an e-mail account may also use its password: src/pwlogin.js). In v2 a member may also ADD Google to
 * an existing account from their Profile ("Google sign-in": handleGoogleAdd, then the callback with the link marker "l"), and
 * from then on "Log in with Google" signs them in to that account (src/logins.js findAccount). A Google login is never matched to
 * an account by an e-mail address: Google gives us only an account number (scope "openid profile").
 * When nobody has the login, v2 answers "no_account" and says which login it was, so the page names it: a Google login lands on
 * /connect?error=no_account&login=google, an e-mail answer carries { login: "email" }, a wallet's answer carries nothing (the page's
 * default words are the wallet's).
 * THE ONE RULE for a proven wallet in v2 (walletProven, below): a proof made FOR THE LINK (a signed LINK statement that names
 *   the account, a link pairing a phone approved, or a tiny transfer started with { link: true }) by a browser logged in to an
 *   account WITHOUT a wallet links that wallet (src/walletlink.js); a plain LOGIN proof by such a browser links nothing
 *   (400 use_link: a signature that promised a sign-in never binds a wallet to an account); logged in WITH the same wallet any
 *   proof re-proves; WITH another wallet → wrong_wallet; not logged in → a linked wallet signs its owner in, an unknown one
 *   gets "no_account" (nothing is made, no cookie). A member's session is never dropped by a proof. With the switch off
 *   everything here is as it always was (pending sessions, next "social").
 *
 * Only a hash of the session cookie is stored. From Google we keep the account id and first
 * name; from e-mail we keep the address (a code proves it). A password exists only in v2, only
 * for e-mail accounts, and only as a salted hash (src/password.js). Passwords are never logged.
 *
 * Settings (Cloudflare → Workers → vicinity-map → Settings → Variables and secrets):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   Google sign-in
 *   GMAIL_USER, GMAIL_APP_PASSWORD            e-mail codes, sent straight from Gmail (simplest);
 *                                             or RESEND_API_KEY (Resend); EMAIL_FROM sets the sender
 * Redirect address to register with Google: https://vicinity.city/api/auth/google/callback (and, once SITE_ORIGINS lists citycoin.dev and
 * Google sign-in must work there, https://citycoin.dev/api/auth/google/callback: the address is built on the allowlist entry of the host
 * the person is on, src/hostbind.js, never on the request's own text).
 * Host binding (stage S04, src/hostbind.js): once SITE_ORIGINS lists a second host, a session, a pairing and a sign-up are bound to the
 * host they were made on and are unknown on any other; with SITE_ORIGINS unset everything here is exactly as before.
 * Wallet-only sign-in (Citycoin.dev master v5, stages S09 and S10; only while WALLET_ONLY counts, src/v5policy.js walletOnly; otherwise every
 * line here is today's): a wallet signs a server challenge (POST /api/auth/challenge, handleChallenge; src/challenge.js), and /api/auth/wallet
 * takes only a challenge of the purpose "login" (or "admin", the console's own, for a wallet that holds an admin role), used up in the same D1
 * batch that makes the session. An unknown wallet gets 404 no_account and nothing is made; a proof by any wallet while signed in ends this
 * browser's session first (another wallet never inherits it); /api/auth/reprove takes a "reprove" (or "admin") challenge bound to the session
 * that asked for it. A session no wallet ever proved (Google, e-mail, password, a half-done v1 sign-in) is not a session then (getSession), and
 * the Google, e-mail, password and tiny-transfer routes answer 404 (src/index.js). Logout is unchanged.
 * Wallet-only registration (stage S11, the same switch; src/register.js, src/register-core.js): a "register" challenge is issued for this
 * browser's sign-up once its city and Terms are done (ref "s:<sign-up>:<city>"), for a register hand-off code the wallet app's browser opened
 * ({ handoff, opener }: "h:<hand-off>"), or for a register pairing a computer shows ({ pair }: "p:<pairing>", with its check number); a phone
 * approves a register pairing with that challenge at /api/auth/wallet { pair }, and the computer finishes it at /api/pair/finish, which
 * registers the wallet from the computer's own sign-up. A register pairing lives five minutes and exists only while the switch counts.
 * The legacy link window (stage S14, src/legacy.js; only while src/v5policy.js legacyLink says "open"): a "legacy_link" challenge is issued for a
 * restricted legacy session, or for a link pairing a phone approves (src/legacy.js legacyChallenge); POST /api/pair { purpose: "link" } is that
 * session's pairing and POST /api/pair/finish its finish. Once the window closes they answer 410 window_closed.
 */
import { b64url, clearCookie, cookie, getCookie, json, randomToken, readJson, redirect, sameSite, sha256 } from "./http.js";
import { checkSigned } from "./signed.js";
import { isSolanaAddress, isWalletKey } from "./solana.js";
import { emailConfigured, sendMail, verificationEmail } from "./mail.js";
import { ensureHostSchema, ensureOnboardSchema, ensureSchema, ensureSignupSchema } from "./store.js";
import { findTransfer } from "./chain.js";
import { activeMint } from "./official.js";
import { DAY, POLICY } from "./policy.js";
import { autoUsername } from "./text.js";
import { v2On } from "./flags.js";
import { check, clientKey, hits, limitKey, peek, refund } from "./limits.js";
import { TERMS_VERSION, asText, endSignup, getSignup, recordIdentity } from "./signup-core.js";
import { finishCore } from "./signup-finish.js";
import { LEGACY_PROOF, SESSION_COOKIE, SESSION_SECONDS } from "./session.js";
import { accountName, linkLocked, linkNotice, linkWallet, lockedAnswer, maskName } from "./walletlink.js";
import { addGoogle, findAccount, googleAdded, googleNotice } from "./logins.js";
import { checkCurrentPassword } from "./pwlogin.js";
import { NULL_HOST, hostWrite, onThisHost, servedHost, sessionDelete } from "./hostbind.js";
import { walletOnly, walletOnlyHeld } from "./v5policy.js";
import { adminWallets } from "./roles.js";
import { ensureIdentitySchema, ensureHostSignupSchema } from "./store.js";
import { ISSUED_PURPOSES, checkChallenge, consumeStatement, issueChallenge, usedByFor, usedClause } from "./challenge.js";
import { ensurePairRequesterSchema, ensureRegisterSchema } from "./store.js";
import { IDENTITY_POLICY } from "./v5policy.js";
import { presented } from "./walletlink.js";
import { bindOf, finishRegisterPairing, handoffRef, notReady, pairRef, readBind, signupRef, usableHandoff } from "./register-core.js";
import { finishLegacyPairing, legacyChallenge, legacyPairRef, legacyPairStart } from "./legacy.js";
import { legacyLink } from "./v5policy.js";

export { SESSION_COOKIE, SESSION_SECONDS };
export const OAUTH_COOKIE = "vo";
const OAUTH_SECONDS = 10 * 60;       // the trip to Google and back: the OAuth cookie lives 10 minutes
export const PENDING_SECONDS = 30 * 60;     // wallet proven, Google / e-mail still to link: 30 minutes
const PAIR_SECONDS = 10 * 60;        // "sign in with my phone" codes: 10 minutes
/** wallet-only (review finding SEC-5): the browser that asked for a login pairing holds this nonce (host-only, HttpOnly); only it can finish. */
export const PAIR_COOKIE = "__Host-vpr";
const requesterHash = (nonce) => sha256(`vpr\n${nonce}`);

const iso = (ms) => new Date(ms).toISOString();
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

function jwtPayload(token) {
  const part = String(token).split(".")[1] || "";
  const bin = atob(part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

const OAUTH_TIMEOUT_MS = 8_000;
export const PROVIDERS = {
  google: {
    configured: (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    authorize: (env, { redirectUri, state, challenge }) => "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", scope: "openid profile",
      state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
    }),
    async identity(env, { code, redirectUri, verifier }, fetchImpl) {
      let res;
      try { // 8 s, like every other outbound call: a stuck Google must not hold the request (and the person) for a minute
        res = await fetchImpl("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
          signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
        });
      } catch (e) { throw new Error("oauth_unavailable"); }
      const tok = await res.json().catch(() => ({}));
      if (!res.ok || !tok.id_token) throw new Error("google_token_" + res.status);
      // The token comes straight from Google over https, so its contents can be trusted as is.
      const c = jwtPayload(tok.id_token);
      if (c.aud !== env.GOOGLE_CLIENT_ID || !["https://accounts.google.com", "accounts.google.com"].includes(c.iss) || !c.sub) throw new Error("google_bad_token");
      return { id: String(c.sub), handle: null, name: cleanName(c.given_name || c.name) || "Google member" };
    },
  },
};
export const providers = (env) => ({
  google: Boolean(PROVIDERS.google.configured(env)),
  email: emailConfigured(env),
});

/* ---------------- sessions ---------------- */

/**
 * `madeBy` "wallet" (v2 only, after ensureOnboardSchema: sessions.made_by): a wallet signed in in this very browser, so it is renewed while used.
 * `served` (src/hostbind.js servedHost of the request): while the host binding counts, the session records the host it is made on, in the
 * same transaction as its row; otherwise (and without `served`) the statement is exactly today's.
 */
export async function createSession(env, { wallet = null, userId = null, proof = null, provenAt = null, madeBy = null, served = null }, seconds, now) {
  const token = randomToken(32);
  const id = await sha256(token);
  const values = [id, wallet, userId, proof, iso(now), iso(now + seconds * 1000), provenAt];
  const insert = madeBy
    ? env.DB.prepare("INSERT INTO sessions (id, wallet, user_id, proof, created_at, expires_at, proven_at, made_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(...values, madeBy)
    : env.DB.prepare("INSERT INTO sessions (id, wallet, user_id, proof, created_at, expires_at, proven_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(...values);
  if (served && served.bound) {
    await ensureHostSchema(env.DB, "sessions");
    await env.DB.batch([insert, hostWrite(env.DB, "sessions", id, served)]);
  } else await insert.run();
  if (Math.random() < 0.02) { // tidy up now and then
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(iso(now)),
      env.DB.prepare("DELETE FROM pairs WHERE expires_at < ?").bind(iso(now)),
    ]);
  }
  return cookie(SESSION_COOKIE, token, seconds);
}

/**
 * The signed-in session for this request: { id, wallet, user_id, proof, user } or null. While the host binding counts (src/hostbind.js), a
 * session made on another host is not this request's (a cookie copied to another host is signed out there); a session made before the
 * binding (host NULL) belongs to vicinity.city. Otherwise the session is found by its token alone, as always.
 * While WALLET_ONLY counts (src/v5policy.js walletOnly; master sections 05 BR-03 and 18 WP-02), or is set on but refused (walletOnlyHeld: the
 * Worker fails closed, review finding SEC-1), only a wallet-bound session is one: it belongs to an account, a wallet proved it (proven_at), it
 * carries that account's wallet, and it was made by a wallet challenge or before the switch (sessions.auth 'wallet' or NULL). A pending row, or a
 * session a Google, e-mail or password login made and no wallet ever proved, reads as signed out, and so does any session while the sign-in kind
 * cannot be read (fails closed). Whatever the switch says, a restricted legacy link session (stage S14: sessions.proof LEGACY_PROOF) is never a
 * session here, and neither is a session of an account the legacy window closed (users.legacy_state 'closed_unresolved': nothing opens it; the
 * column exists only once the window ran, so with the switches unset neither rule reads anything new). Otherwise: exactly as before.
 */
export async function getSession(env, request, now = Date.now()) {
  if (!env.DB) return null;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const served = servedHost(env, request);
  if (served.refused) return null;
  await ensureSchema(env.DB);
  if (served.bound) await ensureHostSchema(env.DB, "sessions"); // sessions.host only: a hand-off or pairing column never stops a sign-in
  const only = walletOnly(env) || walletOnlyHeld(env);
  if (only) {
    try { await ensureIdentitySchema(env.DB); } // sessions.auth
    catch (e) { console.error("session kind unreadable: signed out", String((e && e.message) || e).slice(0, 80)); return null; }
  }
  const cols = `id, wallet, user_id, proof, created_at, expires_at, proven_at${served.bound ? ", host" : ""}${only ? ", auth" : ""}`;
  const row = await env.DB.prepare(`SELECT ${cols} FROM sessions WHERE id = ?`).bind(await sha256(token)).first();
  if (!row || Date.parse(row.expires_at) <= now) return null;
  if (row.proof === LEGACY_PROOF) return null; // a restricted legacy link session (src/legacy.js) never opens anything here
  let s = row;
  if (served.bound) {
    const { host, ...rest } = row;
    if (!onThisHost(served, host)) return null;
    s = rest;
  }
  if (only) {
    const { auth, ...rest } = s;
    if (!rest.user_id || !rest.proven_at || !rest.wallet || (auth != null && auth !== "wallet")) return null;
    s = rest;
  }
  const user = s.user_id ? await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(s.user_id).first() : null;
  if (s.user_id && !user) return null;
  if (user && user.legacy_state === "closed_unresolved") return null; // closed when the legacy window ended (src/legacy.js): no way in
  if (only && user.wallet !== s.wallet) return null; // the account's own wallet, never a wallet it had before
  return { ...s, user };
}
export const dropSession = (env, id) => env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
/** However much a session is used, it ends this long after it was made (the person signs in again: one signature in the wallet app). */
export const SESSION_MAX_DAYS = 90;
/**
 * A session a WALLET made inside a wallet app's own browser on a phone (sessions.made_by = 'wallet': the wallet app's claim of a link code,
 * a wallet's sign-in there, which the page marks { inApp: true }) is renewed while it is used: once it has less than 15 of its 30 days
 * left, the next /api/me (v2) pushes it back to 30 days (never past 90 days from when it was made) and sends the same cookie again with a
 * fresh Max-Age. So a person who shops inside Phantom every week signs in there again only every 90 days. Every other session keeps its 30
 * days, whatever it proves later: a computer's sign-in with a browser extension (a shared or public computer must not stay signed in
 * longer than it always did: audit SEC-3), a Google, e-mail or password login (also once it re-proves the wallet or links one on the
 * page), a pairing finished on another device. Only while the session carries the account's wallet. Returns the Set-Cookie value, or null.
 */
export async function renewSession(env, request, s, now = Date.now()) {
  if (!s || !s.user || !s.proven_at || !s.wallet || s.wallet !== s.user.wallet) return null;
  if (Date.parse(s.expires_at) - now > SESSION_SECONDS * 500) return null; // more than half (15 days) left
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const until = Math.min(now + SESSION_SECONDS * 1000, Date.parse(s.created_at) + SESSION_MAX_DAYS * DAY);
  if (until <= Date.parse(s.expires_at)) return null; // at its 90 days already
  await ensureOnboardSchema(env.DB); // sessions.made_by (the marker is read inside the statement: a session not made by a wallet changes nothing)
  const r = await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ? AND user_id = ? AND made_by = 'wallet'").bind(iso(until), s.id, s.user.id).run();
  return r.meta.changes === 1 ? cookie(SESSION_COOKIE, token, Math.round((until - now) / 1000)) : null;
}
/**
 * End the session this request's cookie names. While the host binding counts (src/hostbind.js), only if it belongs to this host: a cookie
 * copied to another host never ends the session on the host that made it (signing out or signing in there deletes nothing of the other
 * host's). Otherwise by its token alone, exactly as before.
 */
export async function dropCurrent(env, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return;
  const served = servedHost(env, request);
  if (!served.bound) return void await dropSession(env, await sha256(token));
  await ensureHostSchema(env.DB, "sessions");
  const del = sessionDelete(env.DB, await sha256(token), served);
  if (del) await del.run();
}

/**
 * The wallet is proven. A linked wallet signs straight in; a new one has 30 minutes to link Google or an e-mail
 * (next: "social") or, in the v2 sign-up, to finish it (next: "signup").
 */
async function signInWallet(env, wallet, now, served) {
  const user = await env.DB.prepare("SELECT id FROM users WHERE wallet = ?").bind(wallet).first();
  const provenAt = iso(now);
  if (user) return { cookie: await createSession(env, { wallet, userId: user.id, provenAt, served }, SESSION_SECONDS, now), next: "/dashboard" };
  return { cookie: await createSession(env, { wallet, provenAt, served }, PENDING_SECONDS, now), next: v2On(env) ? "signup" : "social" };
}

/**
 * The Set-Cookie value(s) for a finished wallet sign-in. In v2, a wallet that already has an account signs straight
 * in and the half-done sign-up of this browser is discarded with it (its cookie is cleared). With the switch off, or for a
 * new wallet, this is the plain session cookie, exactly as before.
 */
async function walletCookies(env, request, c, next) {
  // (wallet-only, stage S11: the same, whatever SIGNUP_FLOW says: a registration half done in this browser ends when its wallet signs in)
  if (!(v2On(env) || walletOnly(env)) || !next.startsWith("/dashboard")) return c;
  const clear = await endSignup(env, request);
  return clear.length ? [c, ...clear] : c;
}

/**
 * THE ONE RULE: what a proven wallet does, with the switch on. `session` is this browser's session (or null), `wallet` the
 * address that was just proven (a signed message checked, a pairing collected, a transfer found), `link` whether that proof
 * was made FOR THE LINK: a signed LINK statement naming this account (handleWalletLogin checks the name), a link pairing
 * (handlePairFinish), a transfer started with { link: true } (handleTransferCheck). A plain login proof carries no such intent.
 * `via` says how the link was made (src/walletlink.js linkWallet: 'page' a statement signed in this browser, 'pair' a link pairing a
 * wallet app approved, 'transfer' a tiny transfer): a pairing gets the 7 days of "Wasn't you? Remove it" on the account's older browsers.
 * Returns { status, body, cookies? }: the answer to send.
 *   logged in, no wallet, a link proof       → the wallet is linked (src/walletlink.js linkWallet) and this session is proven:
 *                                              { ok, linked: true, wallet, next: "/dashboard?linked=1" } (409 wallet_taken | has_wallet)
 *   logged in, no wallet, a login proof      → 400 use_link: nothing is linked. The signer saw "Sign in to Vicinity", not a binding
 *                                              to an account, so a phished login signature can never capture a wallet this way
 *   logged in, the same wallet               → re-proven (any proof): { ok, wallet, reproven: true, next: "/dashboard" }
 *   logged in, another wallet                → 403 wrong_wallet (log out first: one account, one wallet)
 *   not logged in, the wallet has an account → signs in (a 30-day session; a half-done sign-up in this browser ends)
 *   not logged in, nobody has it             → 404 no_account, no cookie, no pending session (the page says how to join)
 * With the switch off: today's behaviour (a pending 30-minute session and next "social" for a new wallet).
 */
export async function walletProven(env, request, wallet, now, session, { link = false, via = "page", here = false } = {}) {
  const served = servedHost(env, request);
  if (walletOnly(env)) {
    // wallet-only (stage S10): no proof links a wallet here (the legacy link window is stage S14); a login proof ends this browser's
    // session first, then signs in an account that has this wallet, or answers no_account and makes nothing
    if (link) return { status: 400, body: { ok: false, error: "bad_request" } };
    try {
      await ensureIdentitySchema(env.DB);
      if (served.bound) await ensureHostSchema(env.DB, "sessions");
    } catch (e) {
      console.error("wallet-only tables unavailable", String((e && e.message) || e).slice(0, 80));
      return unavailable();
    }
    return walletOnlySignIn(env, request, wallet, now, { here, served });
  }
  if (!v2On(env)) {
    await dropCurrent(env, request);
    const { cookie: c, next } = await signInWallet(env, wallet, now, served);
    return { status: 200, body: { ok: true, wallet, next }, cookies: c };
  }
  const s = session === undefined ? await getSession(env, request, now) : session;
  if (s && s.user) {
    if (s.user.wallet && s.user.wallet !== wallet) return { status: 403, body: { ok: false, error: "wrong_wallet" } };
    if (!s.user.wallet && !link) return { status: 400, body: { ok: false, error: "use_link" } }; // a sign-in promise binds nothing
    const r = await linkWallet(env, s, wallet, now, via);
    if (r.error) return { status: r.status, body: { ok: false, error: r.error, ...(r.wallet ? { wallet: r.wallet } : {}) } };
    if (r.already) return { status: 200, body: { ok: true, wallet, reproven: true, next: "/dashboard", provenAt: iso(now) } };
    return { status: 200, body: { ok: true, linked: true, wallet, next: "/dashboard?linked=1", provenAt: iso(now), fresh: true } };
  }
  const user = await env.DB.prepare("SELECT id FROM users WHERE wallet = ?").bind(wallet).first();
  if (!user) return { status: 404, body: { ok: false, error: "no_account" } };
  await dropCurrent(env, request);
  if (here) await ensureOnboardSchema(env.DB); // sessions.made_by
  // `here`: the wallet signed in THIS browser, and that browser is a wallet app's own on a phone (renewed while used: renewSession); not
  // a computer's extension, a pairing or a transfer finished elsewhere
  const c = await createSession(env, { wallet, userId: user.id, provenAt: iso(now), madeBy: here ? "wallet" : null, served }, SESSION_SECONDS, now);
  return { status: 200, body: { ok: true, wallet, next: "/dashboard" }, cookies: await walletCookies(env, request, c, "/dashboard") };
}
const answer = (out) => json(out.body, out.status, out.cookies ? { "Set-Cookie": out.cookies } : {});
/** The answer of a wallet-only step whose database failed: nothing is accepted (503). */
const unavailable = () => ({ status: 503, body: { ok: false, error: "unavailable" } });

/**
 * Wallet-only sign-in (WALLET_ONLY counting; stage S10; master section 18 WP-02): one D1 batch that
 *   1. uses up the challenge `row` (when the proof is a challenge: src/challenge.js consumeStatement),
 *   2. ends this browser's current session, if it has one (on this host only, src/hostbind.js; whoever it belonged to: a proof by another
 *      wallet never inherits it, and a proof by the same wallet replaces it),
 *   3. makes a 30-day session for the account whose wallet this is (sessions.auth 'wallet'; the host while the host binding counts; made_by
 *      'wallet' for a wallet app's own browser, which renews it while used: renewSession),
 * steps 2 and 3 holding only when step 1 changed the row in this very batch. Answers { status, body, cookies }:
 *   200 { ok, wallet, next: "/dashboard" } and the session cookie (a half-done v2 sign-up in this browser ends, as today)
 *   404 no_account: no account has this wallet; nothing is made (the current session still ends: its cookie is cleared)
 *   409 challenge_used: another request used the challenge first; nothing changes · 503 unavailable: the database failed; nothing is accepted
 * The caller has run ensureIdentitySchema (and ensureHostSchema(db, "sessions") while the host binding counts).
 */
async function walletOnlySignIn(env, request, wallet, now, { row = null, here = false, served }) {
  const db = env.DB;
  const token = getCookie(request, SESSION_COOKIE);
  const currentId = token && token.length <= 100 ? await sha256(token) : null;
  const newToken = randomToken(32);
  const id = await sha256(newToken);
  const usedBy = row ? await usedByFor(`session:${id}`) : null;
  const cond = row ? usedClause(row, usedBy) : { sql: "", args: [] };
  let user;
  try {
    user = await db.prepare("SELECT id FROM users WHERE wallet = ?").bind(wallet).first();
    if (user && here) await ensureOnboardSchema(db); // sessions.made_by
  } catch (e) {
    console.error("wallet sign-in lookup failed", String((e && e.message) || e).slice(0, 80));
    return unavailable();
  }
  const stmts = [];
  if (row) stmts.push(consumeStatement(db, row, usedBy, now));
  if (currentId) {
    stmts.push(served.bound
      ? db.prepare(`DELETE FROM sessions WHERE id = ? AND COALESCE(host, ?) = ?${cond.sql}`).bind(currentId, NULL_HOST, served.key, ...cond.args)
      : db.prepare(`DELETE FROM sessions WHERE id = ?${cond.sql}`).bind(currentId, ...cond.args));
  }
  if (user) {
    const cols = ["id", "wallet", "user_id", "proof", "created_at", "expires_at", "proven_at", "auth"], vals = ["?", "wallet", "id", "NULL", "?", "?", "?", "'wallet'"];
    const args = [id, iso(now), iso(now + SESSION_SECONDS * 1000), iso(now)];
    if (here) { cols.push("made_by"); vals.push("'wallet'"); }
    if (served.bound) { cols.push("host"); vals.push("?"); args.push(served.key); }
    stmts.push(db.prepare(`INSERT INTO sessions (${cols.join(", ")}) SELECT ${vals.join(", ")} FROM users WHERE wallet = ?${cond.sql}`).bind(...args, wallet, ...cond.args));
  }
  let res = [];
  try { if (stmts.length) res = await db.batch(stmts); }
  catch (e) {
    console.error("wallet sign-in not recorded", String((e && e.message) || e).slice(0, 80));
    return unavailable();
  }
  if (row && !(res[0] && res[0].meta && res[0].meta.changes === 1)) return { status: 409, body: { ok: false, error: "challenge_used" } };
  const made = user && res.length && res[res.length - 1].meta && res[res.length - 1].meta.changes === 1;
  if (!made) return { status: 404, body: { ok: false, error: "no_account" }, ...(currentId ? { cookies: clearCookie(SESSION_COOKIE) } : {}) };
  const c = cookie(SESSION_COOKIE, newToken, SESSION_SECONDS);
  return { status: 200, body: { ok: true, wallet, next: "/dashboard" }, cookies: await walletCookies(env, request, c, "/dashboard") };
}

/** Does this wallet hold an admin role: the owner (ADMIN_WALLETS) or a grant in admin_roles? The same answer as src/admin.js adminRoleOf
 *  being non-null (read here, not imported: src/admin.js imports this file), asked only when an "admin" challenge comes back. */
async function hasAdminRole(env, wallet) {
  if (adminWallets(env).includes(wallet)) return true;
  const r = await env.DB.prepare("SELECT role FROM admin_roles WHERE wallet = ?").bind(wallet).first();
  return Boolean(r && ["moderator", "admin", "owner"].includes(r.role));
}

/**
 * POST /api/auth/challenge { purpose, address, pair? } (WALLET_ONLY counting only; src/index.js answers 404 otherwise) → { ok, challengeId,
 * message, statement, purpose, expiresAt }: the exact text the wallet signs (src/challenge.js), valid 120 seconds, once.
 *   login     anyone; with `pair` (the code a computer shows), a phone approving that pairing: the text carries its check number, and only
 *             that live login pairing of this host, not yet approved, can take the answer (410 pair_expired otherwise)
 *   admin     anyone (the console's sign-in; the role is checked when the answer comes back); signed in with this wallet, it is also the
 *             console's fresh proof for this session
 *   reprove   the signed-in member, for the account's own wallet (401 sign_in, 403 wrong_wallet), bound to this session
 *   register  (stage S11) a browser whose sign-up (vsu cookie, this host) has its city resolved and the Terms accepted (409 location_required,
 *             terms_required otherwise): the text names the city and country, bound to that sign-up and city; or, with `handoff` (and
 *             `opener`), the wallet app's browser that opened that register hand-off code (src/register-core.js usableHandoff refusals): bound
 *             to the code, naming its city; or, with `pair`, a phone approving a live register pairing (410 pair_expired otherwise): bound to
 *             the pairing, naming its city and its check number (409 use_sign_in for a wallet that already has an account: a register pairing
 *             never signs the other device in to it, review finding SEC-3). src/register.js and src/auth.js handlePairFinish use it.
 *   legacy_link  (stage S14) only while the legacy link window is open (src/legacy.js legacyChallenge): this browser's restricted legacy session
 *             (401 legacy_sign_in), or, with `pair`, a phone approving a live link pairing (410 pair_expired); the text names the account (and the
 *             check number); 409 wallet_taken for a wallet that has an account. Window closed: 410 window_closed; no window: 400 bad_purpose.
 * Errors: 400 bad_json, bad_purpose, bad_address (not a key that can sign: a small-order or non-canonical point is refused), bad_request (a `pair` for a purpose other than login, register or legacy_link, a `handoff` for
 * any other purpose, or both); 403 wrong_origin; 503 unavailable.
 */
export async function handleChallenge(request, env, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "bad_json" }, 400);
  const purpose = typeof body.purpose === "string" ? body.purpose : "";
  if (!ISSUED_PURPOSES.includes(purpose) && purpose !== "legacy_link") return json({ ok: false, error: "bad_purpose" }, 400);
  const address = body.address;
  // (a key that can sign: a canonical curve point not of small order; review finding SEC-2)
  if (!isWalletKey(address)) return json({ ok: false, error: "bad_address" }, 400);
  const served = servedHost(env, request);
  if (purpose === "legacy_link") { // the legacy link window (stage S14): src/legacy.js decides, and says why not
    try {
      const l = await legacyChallenge(env, request, body, address, served, now, findPair);
      if (l.error) return l.error;
      return json({ ok: true, ...(await issueChallenge(env, { purpose, address, served, ...l.opts }, now)) });
    } catch (e) {
      console.error("challenge not issued", String((e && e.message) || e).slice(0, 80));
      return json({ ok: false, error: "unavailable" }, 503);
    }
  }
  if (body.pair != null && purpose !== "login" && purpose !== "register") return json({ ok: false, error: "bad_request" }, 400);
  if (body.handoff != null && (purpose !== "register" || body.pair != null)) return json({ ok: false, error: "bad_request" }, 400);
  try {
    const opts = { purpose, address, served };
    if (purpose === "login" && body.pair != null) {
      const p = await findPair(env, body.pair, now, served);
      if (!p || p.wallet || p.purpose === "link" || p.purpose === "register") return json({ ok: false, error: "pair_expired" }, 410);
      Object.assign(opts, { ref: p.id, pin: p.pin });
    }
    if (purpose === "reprove" || purpose === "admin") {
      const s = await getSession(env, request, now);
      if (purpose === "reprove" && (!s || !s.user)) return json({ ok: false, error: "sign_in" }, 401);
      if (purpose === "reprove" && s.user.wallet !== address) return json({ ok: false, error: "wrong_wallet" }, 403);
      if (s && s.user && s.user.wallet === address) opts.ref = s.id;
    }
    if (purpose === "register") {
      await ensureRegisterSchema(env.DB); // the sign-up tables, handoffs.bind, pairs.signup_id and pairs.bind
      if (served.bound) await ensureHostSignupSchema(env.DB);
      if (body.pair != null) {
        // a phone approving a computer's registration: the live register pairing, not yet approved, names the city and the check number
        const p = await findPair(env, body.pair, now, served);
        const bind = p && p.purpose === "register" && !p.wallet ? readBind(p.bind) : null;
        if (!bind) return json({ ok: false, error: "pair_expired" }, 410);
        // a wallet that already has an account never approves another device's registration: that would hand the computer that showed the
        // code a session in the existing account under registration words (review finding SEC-3). It signs in instead.
        if (await env.DB.prepare("SELECT id FROM users WHERE wallet = ?").bind(address).first()) return json({ ok: false, error: "use_sign_in" }, 409);
        Object.assign(opts, { ref: pairRef(p.id), pin: p.pin, city: bind.name, country: bind.country });
      } else if (body.handoff != null) {
        // the wallet app's browser that opened a register hand-off code (src/register.js handoff/info)
        const h = await usableHandoff(env, request, body.handoff, now, request.cf, "use", presented(request, body.opener));
        if (h.error) return h.error;
        Object.assign(opts, { ref: handoffRef(h.row.id), city: h.bind.name, country: h.bind.country });
      } else {
        const row = await getSignup(env, request, now);
        const nr = notReady(row);
        if (nr) return json({ ok: false, error: nr.error }, nr.status);
        Object.assign(opts, { ref: signupRef(row.id, row.loc_city), city: row.loc_name, country: row.loc_country });
      }
    }
    return json({ ok: true, ...(await issueChallenge(env, opts, now)) });
  } catch (e) {
    console.error("challenge not issued", String((e && e.message) || e).slice(0, 80));
    return json({ ok: false, error: "unavailable" }, 503);
  }
}

/**
 * POST /api/auth/wallet while WALLET_ONLY counts: { challengeId, address, message, signature, pair?, inApp? }. A "login" challenge (or the
 * console's "admin" one, for a wallet that holds an admin role: 403 forbidden otherwise, nothing used) signs in (walletOnlySignIn); with
 * `pair`, a "login" challenge issued for that pairing approves it, in the same batch that uses the challenge up ({ ok, paired }). Today's
 * signed messages are refused (400 challenge_required); every other refusal is src/challenge.js checkChallenge's.
 */
async function walletOnlyLogin(request, env, now, body) {
  const served = servedHost(env, request);
  if (body.challengeId == null) return json({ ok: false, error: "challenge_required" }, 400);
  try {
    await ensureIdentitySchema(env.DB);
    if (served.bound) await ensureHostSchema(env.DB, "sessions");
  } catch (e) { console.error("wallet-only tables unavailable", String((e && e.message) || e).slice(0, 80)); return json({ ok: false, error: "unavailable" }, 503); }
  const pairing = body.pair != null;
  // (a pairing is approved by a login challenge, or, for a register pairing, by a register challenge issued for it: stage S11; or, for a link
  // pairing while the legacy link window is open, by a legacy_link challenge issued for it: stage S14)
  const legacyOpen = pairing && legacyLink(env, now).state === "open";
  const c = await checkChallenge(env, body, { served, purposes: pairing ? (legacyOpen ? ["login", "register", "legacy_link"] : ["login", "register"]) : ["login", "admin"], now });
  if (c.error) return c.error;
  const wallet = c.row.wallet;
  if (pairing) {
    if (typeof body.pair !== "string" || body.pair.length > 64) return json({ ok: false, error: "bad_pair" }, 400);
    let p;
    try { p = await findPair(env, body.pair, now, served); }
    catch (e) { console.error("pairing lookup failed", String((e && e.message) || e).slice(0, 80)); return json({ ok: false, error: "unavailable" }, 503); }
    if (!p || p.wallet || (p.purpose === "link" && c.row.purpose !== "legacy_link")) return json({ ok: false, error: "pair_expired" }, 410);
    // a challenge issued for another pairing, or for none; a login challenge never approves a register or link pairing, nor the other way round
    const forThis = c.row.purpose === "register" ? p.purpose === "register" && c.row.ref === pairRef(p.id)
      : c.row.purpose === "legacy_link" ? p.purpose === "link" && c.row.ref === legacyPairRef(p.id)
        : p.purpose !== "register" && p.purpose !== "link" && c.row.ref === p.id;
    if (!forThis) return json({ ok: false, error: "bad_message" }, 400);
    const usedBy = await usedByFor(`pair:${p.id}`), cond = usedClause(c.row, usedBy);
    let res;
    try {
      res = await env.DB.batch([consumeStatement(env.DB, c.row, usedBy, now),
        env.DB.prepare(`UPDATE pairs SET wallet = ? WHERE id = ? AND wallet IS NULL AND expires_at > ?${cond.sql}`).bind(wallet, p.id, iso(now), ...cond.args)]);
    } catch (e) { console.error("pairing not approved", String((e && e.message) || e).slice(0, 80)); return json({ ok: false, error: "unavailable" }, 503); }
    if (!res[0].meta.changes) return json({ ok: false, error: "challenge_used" }, 409);
    if (!res[1].meta.changes) return json({ ok: false, error: "pair_expired" }, 410);
    return json({ ok: true, paired: true });
  }
  // a phone's approval for another device (its text names that pairing's check number) never signs in the phone's own browser
  if (c.row.purpose === "login" && c.row.ref) return json({ ok: false, error: "bad_message" }, 400);
  if (c.row.purpose === "admin") {
    let admin = false;
    try { admin = await hasAdminRole(env, wallet); }
    catch (e) { console.error("admin role unreadable", String((e && e.message) || e).slice(0, 80)); return json({ ok: false, error: "unavailable" }, 503); }
    if (!admin) return json({ ok: false, error: "forbidden" }, 403);
  }
  return answer(await walletOnlySignIn(env, request, wallet, now, { row: c.row, here: body.inApp === true, served }));
}

/**
 * POST /api/auth/reprove while WALLET_ONLY counts: { challengeId, address, message, signature }: a "reprove" challenge (or the console's
 * "admin" one) issued for THIS session and its account's wallet, used up in the same batch that marks the session proven now.
 */
async function walletOnlyReprove(request, env, now, s, body) {
  const served = servedHost(env, request);
  if (body.challengeId == null) return json({ ok: false, error: "challenge_required" }, 400);
  const c = await checkChallenge(env, body, { served, purposes: ["reprove", "admin"], now });
  if (c.error) return c.error;
  if (c.row.wallet !== s.user.wallet) return json({ ok: false, error: "wrong_wallet" }, 403);
  if (c.row.ref !== s.id) return json({ ok: false, error: "wrong_session" }, 403); // asked for by another session (or by none)
  const usedBy = await usedByFor(`reprove:${s.id}`), cond = usedClause(c.row, usedBy);
  let res;
  try {
    res = await env.DB.batch([consumeStatement(env.DB, c.row, usedBy, now),
      env.DB.prepare(`UPDATE sessions SET proven_at = ? WHERE id = ?${cond.sql}`).bind(iso(now), s.id, ...cond.args)]);
  } catch (e) { console.error("re-proof not recorded", String((e && e.message) || e).slice(0, 80)); return json({ ok: false, error: "unavailable" }, 503); }
  if (!res[0].meta.changes) return json({ ok: false, error: "challenge_used" }, 409);
  if (!res[1].meta.changes) return json({ ok: false, error: "sign_in" }, 401);
  return json({ ok: true, provenAt: iso(now) });
}

/**
 * Is this session fresh enough for a sensitive action (username, password, apply, endorse, vote, moderate)? The wallet was proven in
 * this session within the last 30 minutes. For an account WITHOUT a wallet (onboarding v3: Google or e-mail first, the wallet linked
 * later from the dashboard) the Google / e-mail login itself IS the identity, and such an account holds nothing a wallet proof would
 * protect (no holdings, no rank, no seat, no squad): its session counts as fresh for the 30 minutes after it was made (the login).
 * The moment a wallet is linked, only a proof by that wallet counts again.
 */
export const isFresh = (session, now = Date.now()) => {
  if (!session) return false;
  if (isProven(session, now)) return true;
  const window = POLICY.freshProofMinutes * 60_000;
  return Boolean(session.user && !session.user.wallet && session.created_at && now - Date.parse(session.created_at) <= window);
};
/** The stricter half of isFresh: the WALLET was proven in this session within the last 30 minutes (the login alone never counts). */
export const isProven = (session, now = Date.now()) => Boolean(session && session.proven_at && now - Date.parse(session.proven_at) <= POLICY.freshProofMinutes * 60_000);

/**
 * POST /api/auth/reprove { address, message, signature } → "it's still me": the signed-in person signs
 * a login message with THEIR wallet again, which unlocks sensitive actions for 30 minutes.
 */
export async function handleReprove(request, env, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const s = await getSession(env, request, now);
  if (!s || !s.user) return json({ ok: false, error: "sign_in" }, 401);
  if (!s.user.wallet) return json({ ok: false, error: "no_wallet" }, 403); // nothing to re-prove: link a wallet from the dashboard first
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "bad_json" }, 400);
  if (walletOnly(env)) return walletOnlyReprove(request, env, now, s, body); // a server challenge bound to this session (stage S10)
  const r = await checkSigned(body, request, now, ["login"], badSigned, env.DB, servedHost(env, request).host);
  if (r.error) return r.error;
  if (r.parsed.pin || r.parsed.address !== s.user.wallet) return json({ ok: false, error: "wrong_wallet" }, 403);
  await env.DB.prepare("UPDATE sessions SET proven_at = ? WHERE id = ?").bind(iso(now), s.id).run();
  return json({ ok: true, provenAt: iso(now) });
}

export const guard = async (request, env) => {
  if (!sameSite(request, env)) return json({ ok: false, error: "wrong_origin" }, 403);
  if (!env.DB) return json({ ok: false, error: "accounts_unavailable" }, 503);
  await ensureSchema(env.DB);
  return null;
};
const badSigned = (error, status = 400) => ({ error: json({ ok: false, error }, status) });

/* ---------------- 1. prove the wallet ---------------- */

/**
 * POST /api/auth/wallet { address, message, signature, pair?, inApp? } — a signed "login" message, or (v2, signed in without a wallet)
 * a signed "link" message that names the account. With `pair`, a wallet app approving for another device: a login statement
 * with the check number for a login pairing, a link statement with it (and the owner's account) for a link pairing.
 */
export async function handleWalletLogin(request, env, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "bad_json" }, 400);
  if (walletOnly(env)) return walletOnlyLogin(request, env, now, body); // a server challenge, used up with the session it makes (stage S10)
  const served = servedHost(env, request);
  // sessions.host (src/hostbind.js) before the signed text is used up: a migration that fails answers 500 and leaves the signature usable
  if (served.bound) await ensureHostSchema(env.DB, "sessions");
  // a signed message works once, and only on the host it names (an allowlist entry while the host binding counts: src/hostbind.js)
  const r = await checkSigned(body, request, now, v2On(env) ? ["login", "link"] : ["login"], badSigned, env.DB, served.host);
  if (r.error) return r.error;
  const wallet = r.parsed.address;

  if (body.pair != null) {
    // a phone approving for another device (the computer, or Safari, that showed the code)
    if (typeof body.pair !== "string" || body.pair.length > 64) return json({ ok: false, error: "bad_pair" }, 400);
    const pair = await env.DB.prepare("SELECT * FROM pairs WHERE id = ?").bind(await sha256(body.pair)).first();
    // (a pairing made on another host, while the host binding counts, is unknown here: src/hostbind.js)
    if (!pair || pair.wallet || Date.parse(pair.expires_at) <= now || !onThisHost(served, pair.host)) return json({ ok: false, error: "pair_expired" }, 410);
    // (a register pairing exists only while WALLET_ONLY counts, stage S11: one left over from a switch-off is never approved here)
    if (pair.purpose === "register") return json({ ok: false, error: "pair_expired" }, 410);
    if (r.parsed.pin !== pair.pin) return json({ ok: false, error: "pin_mismatch" }, 400);
    if (pair.purpose === "link") {
      // a link pairing is approved with the link statement that names the account it is for: a login signature cannot approve it
      const owner = pair.user_id ? await env.DB.prepare("SELECT id, handle FROM users WHERE id = ?").bind(pair.user_id).first() : null;
      if (!owner || r.parsed.action !== "link" || r.parsed.handle !== accountName(owner)) return json({ ok: false, error: "bad_message" }, 400);
    } else if (r.parsed.action !== "login") return json({ ok: false, error: "bad_message" }, 400);
    await env.DB.prepare("UPDATE pairs SET wallet = ? WHERE id = ? AND wallet IS NULL").bind(wallet, pair.id).run();
    return json({ ok: true, paired: true });
  }
  if (r.parsed.pin) return json({ ok: false, error: "bad_message" }, 400);
  const session = await getSession(env, request, now);
  if (r.parsed.action === "link") {
    // the statement names an account: only that account's own, signed-in browser may use it (the rule below does the rest)
    if (!session || !session.user) return json({ ok: false, error: "sign_in" }, 401);
    if (r.parsed.handle !== accountName(session.user)) return json({ ok: false, error: "bad_message" }, 400);
  }
  // { inApp: true }: the page is a wallet app's own browser on a phone (public/connect.js, VW.inWalletApp()). The page's word only: it can
  // only lengthen the requester's own new session (renewSession), never anyone else's
  return answer(await walletProven(env, request, wallet, now, session, { link: r.parsed.action === "link", via: "page", here: body.inApp === true }));
}

/**
 * POST /api/pair { purpose? } → a code for the other device (shown as a QR code or opened in the wallet app) and a 2-digit check
 * number. purpose "login" (default): the device that shows the code signs in with the wallet the phone approves. purpose "link"
 * (v2, signed in without a wallet): the account of the device that shows the code gets the wallet the phone approves; such a
 * pairing can never sign anyone in, and a login pairing can never link.
 */
export async function handlePairStart(request, env, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const body = (await readJson(request)) || {};
  if (body.purpose === "register" && walletOnly(env)) return registerPairStart(request, env, now);
  let purpose = "login", userId = null;
  if (body.purpose === "link" && walletOnly(env)) {
    // while WALLET_ONLY counts a link pairing exists only in the legacy link window, for a restricted legacy session (stage S14, src/legacy.js)
    return legacyPairStart(request, env, now, (o) => insertPair(request, env, now, o));
  }
  if (body.purpose === "link") {
    if (!v2On(env)) return json({ ok: false, error: "bad_request" }, 400);
    const s = await getSession(env, request, now);
    if (!s || !s.user) return json({ ok: false, error: "sign_in" }, 401);
    if (s.user.wallet) return json({ ok: false, error: "has_wallet" }, 409);
    try { await ensureOnboardSchema(env.DB); }
    catch (e) { console.error("wallet link tables unavailable", String((e && e.message) || e)); return json({ ok: false, error: "link_unavailable" }, 503); }
    purpose = "link";
    userId = s.user.id;
  } else if (body.purpose != null && body.purpose !== "login") return json({ ok: false, error: "bad_request" }, 400);
  const code = randomToken(18);
  const pin = String(10 + (crypto.getRandomValues(new Uint8Array(1))[0] % 90));
  const id = await sha256(code), served = servedHost(env, request);
  // wallet-only (stage S12): a login pairing lives five minutes (policy identity.handoff_seconds) and its link carries the code in the
  // fragment (never sent to a server, never in a Referer), like the register pairing; otherwise today's ten minutes and ?pair=
  const only = walletOnly(env), life = only ? IDENTITY_POLICY.handoffSeconds : PAIR_SECONDS;
  // wallet-only (review finding SEC-5): the pairing is bound to this browser (a nonce in a host-only HttpOnly cookie, its hash on the row), so
  // only the browser that shows the code can finish it; whoever sees the QR code or the link cannot take the session
  let nonce = null;
  if (only) {
    try { await ensurePairRequesterSchema(env.DB); }
    catch (e) { console.error("pairing tables unavailable", String((e && e.message) || e).slice(0, 80)); return json({ ok: false, error: "unavailable" }, 503); }
    nonce = randomToken(24);
  }
  const insert = purpose === "link"
    ? env.DB.prepare("INSERT INTO pairs (id, pin, created_at, expires_at, purpose, user_id) VALUES (?, ?, ?, ?, 'link', ?)").bind(id, pin, iso(now), iso(now + life * 1000), userId)
    : nonce ? env.DB.prepare("INSERT INTO pairs (id, pin, created_at, expires_at, requester) VALUES (?, ?, ?, ?, ?)").bind(id, pin, iso(now), iso(now + life * 1000), await requesterHash(nonce))
      : env.DB.prepare("INSERT INTO pairs (id, pin, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(id, pin, iso(now), iso(now + life * 1000));
  if (served.bound) { // the pairing is bound to this host (src/hostbind.js), in the same transaction as its row
    await ensureHostSchema(env.DB, "pairs");
    await env.DB.batch([insert, hostWrite(env.DB, "pairs", id, served)]);
  } else await insert.run();
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM pairs WHERE expires_at < ?").bind(iso(now)).run();
  // the QR code's address: the allowlist entry's origin (src/hostbind.js), never the request's own host text
  return json({ ok: true, code, pin, purpose, url: `${served.origin}/connect${only ? "#" : "?"}pair=${code}`, expiresAt: iso(now + life * 1000) }, 200,
    nonce ? { "Set-Cookie": cookie(PAIR_COOKIE, nonce, life) } : {});
}

/**
 * A link pairing for the legacy link window (stage S14, src/legacy.js legacyPairStart): { purpose: "link", userId, life } → { code, pin, origin,
 * expiresAt }, written with this host (src/hostbind.js) in the same transaction, the code in the link's fragment only.
 */
async function insertPair(request, env, now, { userId, life }) {
  const code = randomToken(18), pin = String(10 + (crypto.getRandomValues(new Uint8Array(1))[0] % 90));
  const id = await sha256(code), served = servedHost(env, request), until = iso(now + life * 1000);
  await ensureOnboardSchema(env.DB); // pairs.purpose, pairs.user_id
  if (served.bound) await ensureHostSchema(env.DB, "pairs");
  const host = hostWrite(env.DB, "pairs", id, served);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM pairs WHERE purpose = 'link' AND (user_id = ? OR expires_at < ?)").bind(userId, iso(now)), // one live link pairing per account
    env.DB.prepare("INSERT INTO pairs (id, pin, created_at, expires_at, purpose, user_id) VALUES (?, ?, ?, ?, 'link', ?)").bind(id, pin, iso(now), until, userId),
    ...(host ? [host] : []),
  ]);
  return { code, pin, origin: served.origin, expiresAt: until };
}

/**
 * POST /api/pair { purpose: "register" } while WALLET_ONLY counts (stage S11): a computer whose registration is ready for the wallet (its own
 * sign-up, the vsu cookie: city resolved, Terms accepted; 401 no_signup, 409 location_required, terms_required; 409 already_signed_in for a
 * signed-in browser) shows a code for a phone's wallet: { ok, code, pin, purpose: "register", url: <origin>/connect#pair=<code>, expiresAt }.
 * The pairing is bound to that sign-up and its city (pairs.signup_id, pairs.bind) and lives five minutes (policy identity.handoff_seconds);
 * a new one replaces the sign-up's earlier ones. The phone signs a register challenge issued for it, the computer finishes it
 * (handlePairFinish): the account is made there, from the computer's sign-up, on the computer's own connection.
 */
async function registerPairStart(request, env, now) {
  const s = await getSession(env, request, now);
  if (s && s.user) return json({ ok: false, error: "already_signed_in" }, 409);
  const served = servedHost(env, request);
  let row;
  try {
    await ensureRegisterSchema(env.DB);
    if (served.bound) { await ensureHostSignupSchema(env.DB); await ensureHostSchema(env.DB, "pairs"); }
    row = await getSignup(env, request, now);
  } catch (e) { console.error("register pairing tables unavailable", String((e && e.message) || e).slice(0, 80)); return json({ ok: false, error: "unavailable" }, 503); }
  if (!row) return json({ ok: false, error: "no_signup" }, 401);
  const nr = notReady(row);
  if (nr) return json({ ok: false, error: nr.error }, nr.status);
  const code = randomToken(18), pin = String(10 + (crypto.getRandomValues(new Uint8Array(1))[0] % 90));
  const id = await sha256(code), until = iso(now + IDENTITY_POLICY.handoffSeconds * 1000);
  const host = hostWrite(env.DB, "pairs", id, served);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM pairs WHERE purpose = 'register' AND (signup_id = ? OR expires_at < ?)").bind(row.id, iso(now)),
    env.DB.prepare("INSERT INTO pairs (id, pin, created_at, expires_at, purpose, signup_id, bind) VALUES (?, ?, ?, ?, 'register', ?, ?)").bind(id, pin, iso(now), until, row.id, bindOf(row)),
    ...(host ? [host] : []),
  ]);
  // the code travels in the fragment of the address the QR code shows (never sent to a server) and in POST bodies only
  return json({ ok: true, code, pin, purpose: "register", url: `${served.origin}/connect#pair=${code}`, expiresAt: until });
}

async function findPair(env, code, now, served) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  const p = await env.DB.prepare("SELECT * FROM pairs WHERE id = ?").bind(await sha256(code)).first(); // (purpose, user_id exist only after the onboarding migration: a login pairing either way)
  // (while the host binding counts, a pairing made on another host is unknown here: src/hostbind.js; pairs.host NULL reads as vicinity.city)
  return p && Date.parse(p.expires_at) > now && onThisHost(served, p.host) ? p : null;
}

/**
 * GET /api/pair?code= → { status: waiting | ready | expired, pin, purpose } (no side effects: the phone reads the pin here). A link
 * pairing also says whose account it is for, masked ("Sa•••"), its community, and that the Terms are already accepted on that
 * account (so the wallet app's page asks nothing else).
 */
export async function handlePairStatus(request, env, now = Date.now()) {
  if (!env.DB) return json({ status: "expired" });
  await ensureSchema(env.DB);
  return pairStatus(env, request, new URL(request.url).searchParams.get("code"), now);
}

/**
 * POST /api/pair/status { code } while WALLET_ONLY counts (stage S12; src/index.js answers what an unknown path answers otherwise): the same
 * answer as GET /api/pair?code=, with the code in the body, so the wallet-only pages never put a pairing code in a URL a server sees (master
 * section 19 WP-03 step 4: the hand-off token is kept out of logs and referrers; R1-08). Same-site only (403 wrong_origin).
 */
export async function handlePairStatusPost(request, env, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "bad_json" }, 400);
  if (!env.DB) return json({ status: "expired" });
  await ensureSchema(env.DB);
  return pairStatus(env, request, body.code, now);
}

/** What GET and POST /api/pair/status answer for a pairing code (the caller has run ensureSchema). */
async function pairStatus(env, request, code, now) {
  const p = await findPair(env, code, now, servedHost(env, request));
  if (!p) return json({ status: "expired" });
  // (a register pairing, stage S11, says so and nothing about its sign-up)
  const out = { status: p.wallet ? "ready" : "waiting", pin: p.pin, purpose: p.purpose === "link" ? "link" : p.purpose === "register" ? "register" : "login" };
  if (p.purpose === "link" && p.user_id) {
    const o = await env.DB.prepare("SELECT handle, name, home_name, home_country FROM users WHERE id = ?").bind(p.user_id).first();
    if (o) Object.assign(out, { name: maskName(o.name || o.handle), handle: maskName(o.handle), community: o.home_name ? { name: o.home_name, country: o.home_country } : null, terms: TERMS_VERSION });
  }
  return json(out);
}

/**
 * POST /api/pair/finish { code } → the device that showed the code collects what the phone approved: a login pairing signs it in
 * (the one rule: not while signed in), a link pairing links the wallet to the account that made it (only that account's own
 * browser, signed in). A login pairing can never link and a link pairing can never sign anyone in. The row is used once. A link
 * made this way is recorded as via 'pair' (a wallet app approved it: whoever held the code could have), so the account's older
 * browsers get "Wasn't you? Remove it" for 7 days and an e-mail account gets an e-mail (src/walletlink.js).
 */
export async function handlePairFinish(request, env, now = Date.now(), ctx = null, fetchImpl = fetch) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const body = await readJson(request);
  const p = await findPair(env, body && body.code, now, servedHost(env, request));
  if (!p) return json({ ok: false, status: "expired" }, 410);
  let session;
  if (walletOnly(env)) {
    // wallet-only: only a login pairing finishes (it signs this device in, ending whatever session it had: walletProven), or a register pairing
    // (stage S11: the computer's own sign-up registers the wallet the phone approved, src/register-core.js finishRegisterPairing), or, while the
    // legacy link window is open, a link pairing in the restricted session of its own account (stage S14, src/legacy.js finishLegacyPairing)
    if (p.purpose === "link") return legacyLink(env, now).state === "open" ? finishLegacyPairing(request, env, p, now) : json({ ok: false, status: "expired" }, 410);
    if (p.purpose === "register") return answer(await finishRegisterPairing(env, request, p, now, request.cf));
    // a login pairing: only the browser that asked for it (its __Host-vpr nonce; review finding SEC-5). One answer otherwise, as for a dead code
    const nonce = getCookie(request, PAIR_COOKIE);
    if (!p.requester || typeof nonce !== "string" || nonce.length > 100 || p.requester !== await requesterHash(nonce)) return json({ ok: false, status: "expired" }, 410);
  } else if (p.purpose === "register") {
    return json({ ok: false, status: "expired" }, 410); // (made while WALLET_ONLY counted: never finished as a login once it is off)
  } else if (v2On(env)) {
    session = await getSession(env, request, now);
    const mine = session && session.user ? p.purpose === "link" && p.user_id === session.user.id : p.purpose !== "link";
    if (!mine) return json({ ok: false, status: "expired" }, 410);
  }
  if (!p.wallet) return json({ ok: false, status: "waiting" });
  const del = await env.DB.prepare("DELETE FROM pairs WHERE id = ? AND wallet IS NOT NULL").bind(p.id).run();
  if (!del.meta?.changes) return json({ ok: false, status: "expired" }, 410); // someone was faster
  const out = await walletProven(env, request, p.wallet, now, session, { link: p.purpose === "link", via: "pair" }); // a login pairing never links
  if (out.body.ok && out.body.linked && session && session.user) await linkNotice(env, session.user, p.wallet, null, ctx, fetchImpl);
  // (wallet-only: the pairing's nonce is spent with it)
  const cookies = p.requester ? [...(out.cookies ? [].concat(out.cookies) : []), clearCookie(PAIR_COOKIE)] : out.cookies;
  return answer({ ...out, cookies, body: out.body.ok ? { ...out.body, status: "done" } : out.body });
}

/**
 * POST /api/auth/transfer { address } → "send exactly 0.00XXXX SOL to anyone (yourself is easiest)".
 * For wallets inside apps that can't sign messages (FOMO, exchange wallets...). Costs only the
 * network fee when sent to yourself.
 */
export async function handleTransferStart(request, env, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const body = await readJson(request);
  const address = body && body.address;
  if (!isSolanaAddress(address)) return json({ ok: false, error: "bad_address" }, 400);
  const r = crypto.getRandomValues(new Uint16Array(1))[0];
  const lamports = (1001 + (r % 8999)) * 1000; // 0.001001 – 0.009999 SOL, six decimals
  const proof = JSON.stringify({ address, lamports, since: now });
  const out = { ok: true, address, lamports, sol: (lamports / 1e9).toFixed(6), expiresAt: iso(now + PENDING_SECONDS * 1000) };
  // Already signed in and proving "it's still me" (app wallets can't sign), or (v2, no wallet on the account yet) linking the
  // wallet that sends the transfer: keep the session, add the proof. The check (below) applies the one rule to what it finds.
  const current = body.reprove || body.link ? await getSession(env, request, now) : null;
  if (current && current.user) {
    if (current.user.wallet ? address !== current.user.wallet : !(v2On(env) && body.link)) return json({ ok: false, error: "wrong_wallet" }, 403);
    // the proof remembers what it is for: a found transfer links the wallet only when the person asked for the link (the one rule)
    const mine = current.user.wallet ? proof : JSON.stringify({ address, lamports, since: now, link: true });
    await env.DB.prepare("UPDATE sessions SET proof = ? WHERE id = ?").bind(mine, current.id).run();
    return json({ ...out, reprove: Boolean(current.user.wallet), link: !current.user.wallet });
  }
  await dropCurrent(env, request);
  const c = await createSession(env, { proof, served: servedHost(env, request) }, PENDING_SECONDS, now);
  return json(out, 200, { "Set-Cookie": c });
}

/** POST /api/auth/transfer/check → looks for that exact transfer on the blockchain. */
export async function handleTransferCheck(request, env, now = Date.now(), fetchImpl = fetch) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const s = await getSession(env, request, now);
  if (!s || !s.proof) return json({ ok: false, error: "no_proof" }, 400);
  const p = JSON.parse(s.proof);
  // The amount was good for 30 minutes (the page said so). A re-proof rides on a 30-day session, so the proof itself
  // has to run out: a stale one is dropped and the page starts over, instead of a blockchain look every 10 seconds for a month.
  if (now - p.since > PENDING_SECONDS * 1000) {
    await env.DB.prepare("UPDATE sessions SET proof = NULL WHERE id = ?").bind(s.id).run();
    return json({ ok: false, error: "expired" }, 410);
  }
  // at most one blockchain look every 8 seconds per person (the page asks every 10)
  if (p.lastCheck && now - p.lastCheck < 8000) return json({ ok: false, error: "not_found_yet" });
  await env.DB.prepare("UPDATE sessions SET proof = ? WHERE id = ?").bind(JSON.stringify({ ...p, lastCheck: now }), s.id).run();
  let found;
  try { found = await findTransfer(env, p.address, p.lamports, p.since, fetchImpl); }
  catch (e) { console.error("transfer check failed", String(e)); return json({ ok: false, error: "chain_unavailable" }, 503); }
  if (!found) return json({ ok: false, error: "not_found_yet" });
  if (s.user) {
    if (!v2On(env)) {
      await env.DB.prepare("UPDATE sessions SET proven_at = ?, proof = NULL WHERE id = ?").bind(iso(now), s.id).run();
      return json({ ok: true, wallet: p.address, reproven: true });
    }
    await env.DB.prepare("UPDATE sessions SET proof = NULL WHERE id = ?").bind(s.id).run(); // the proof is spent either way
    return answer(await walletProven(env, request, p.address, now, s, { link: Boolean(p.link), via: "transfer" })); // links (asked for), re-proves, or wrong_wallet
  }
  await dropSession(env, s.id); // the pending proof is spent: what follows is the rule for a wallet proven by a browser that is not logged in
  return answer(await walletProven(env, request, p.address, now, null));
}

/* ---------------- 2. Google ---------------- */

/**
 * GET /api/auth/google/start → off to Google (PKCE, with a one-time state).
 * With ?signup=1 (v2 only) the person is creating an account: the Terms must be accepted in their sign-up first, and the
 * cookie gets a 4th part "s" so the callback records the Google login in that sign-up. Without it, the callback only
 * signs existing people in.
 */
export async function handleOAuthStart(request, env, provider) {
  const p = PROVIDERS[provider];
  if (!p) return json({ error: "not_found" }, 404);
  if (!p.configured(env) || !env.DB) return redirect("/connect?error=login_unavailable");
  let marker = "";
  if (v2On(env) && new URL(request.url).searchParams.get("signup") === "1") {
    let row;
    try { await ensureSignupSchema(env.DB); row = await getSignup(env, request); }
    catch (e) { console.error("sign-up lookup failed", String((e && e.message) || e)); return redirect("/connect?error=login_unavailable"); }
    if (!row || row.terms_version !== TERMS_VERSION) return redirect("/connect?error=terms_required");
    marker = ".s";
  }
  const go = await oauthStart(request, env, provider, marker);
  return redirect(go.url, [go.cookie]);
}

/**
 * The trip to Google: a one-time state and a PKCE verifier, kept in the OAuth cookie (10 minutes) with the marker of what the trip is
 * for: "" a log-in, ".s" a sign-up, ".l.<when>.<grant>" adding Google to the signed-in account (addGrant), ".g" a legacy link login (stage S14,
 * src/legacy.js; only while the legacy window is open, and only its own callback takes it). `state` may be chosen by the
 * caller (the grant names it). { url, cookie }.
 */
export async function oauthStart(request, env, provider, marker = "", state = randomToken(16)) {
  const verifier = randomToken(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  // the return address: the allowlist entry's origin (src/hostbind.js), never the request's own host text
  const redirectUri = `${servedHost(env, request).origin}/api/auth/${provider}/callback`;
  return { url: PROVIDERS[provider].authorize(env, { redirectUri, state, challenge }), cookie: cookie(OAUTH_COOKIE, `${provider}.${state}.${verifier}${marker}`, OAUTH_SECONDS) };
}

/**
 * The server's own word, in the OAuth cookie, that the Add of THIS session (`s`) passed its check at `when` (base-36 milliseconds) for THIS
 * trip to Google (`state`): an HMAC under the site's secret salt (src/limits.js limitKey), so a browser can't make one up for itself, nor
 * move one to another session or another trip. The cookie names no account. 22 characters.
 */
const addGrant = async (env, s, state, when) => (await limitKey(env, "gadd", s.id, String(s.user.id), "google", state, when)).split(":")[1];

/**
 * POST /api/me/google/add { current? } (v2: the Profile's "Google sign-in", Add) → { ok, url }: the page goes to `url`, Google's own page,
 * where the person picks their Google account; the callback then adds it as a way to log in to THIS account (src/logins.js addGoogle).
 * Who may: a signed-in member, from this site's own page (Origin), whose session is not one a wallet from another app made in the last
 * 7 days (linkLocked: 403 link_new, like the other identity changes), whose account has no Google sign-in yet (409 has_google: made
 * with Google, or one added: remove it first), and who passes THE PASSWORD RULE (src/pwlogin.js handleSetPassword): a way to log in is as
 * much a key to the account as its password, and the login itself is what a stolen session IS, so
 *   - an account with a password: the current password, typed here (`current`; wrong: 401 bad_credentials, counted like a password
 *     change), or the wallet proven in this browser in the last 30 minutes;
 *   - an account with a wallet and no password: the wallet proven in this browser in the last 30 minutes;
 *   - an account with neither: its login in this browser in the last 30 minutes (nothing else proves it is them).
 * Else 403 reprove, with what the page should ask for: password (type it), relogin (log in again); neither means the wallet.
 * Nothing is written here: the OAuth cookie gets the marker "l", when, and the grant (addGrant), and the callback adds nothing unless that
 * same session is still signed in there and the grant is genuine and at most 10 minutes old.
 */
export async function handleGoogleAdd(request, env, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  if (!PROVIDERS.google.configured(env)) return json({ ok: false, error: "login_unavailable" }, 503);
  const s = await getSession(env, request, now);
  if (!s || !s.user) return json({ ok: false, error: "sign_in" }, 401);
  const u = s.user;
  if (linkLocked(s, now)) return lockedAnswer(u);
  if (u.provider === "google" || (await googleAdded(env.DB, u.id))) return json({ ok: false, error: "has_google" }, 409);
  const body = (await readJson(request)) || {};
  const typed = body.current == null || body.current === "" ? null : body.current;
  if (typed !== null && u.password_hash) {
    const wrong = await checkCurrentPassword(env, request, u, typed, now);
    if (wrong) return wrong;
  } else if (!(u.password_hash ? isProven(s, now) : isFresh(s, now))) {
    return json({ ok: false, error: "reprove", ...(u.password_hash ? { password: true } : u.wallet ? {} : { relogin: true }) }, 403);
  }
  const state = randomToken(16), when = now.toString(36);
  const go = await oauthStart(request, env, "google", `.l.${when}.${await addGrant(env, s, state, when)}`, state);
  return json({ ok: true, url: go.url }, 200, { "Set-Cookie": go.cookie });
}

/**
 * Back from Google with the link marker: add that Google account to the signed-in account, or say why not. Every answer goes back
 * to the Profile (/dashboard?google=<code>#profile): linked, already, google_taken, has_google, link_new, login_expired, login_unavailable.
 * It never signs anyone in, never makes an account and never ends a session. Signed out meanwhile: the log-in page's login_expired
 * (nothing was added). The marker sits in a cookie this browser could have edited, so it counts only with a genuine grant (addGrant) for
 * this very session and trip, made by an Add in the last 10 minutes (the OAuth cookie's life): the check that Add made (the password rule)
 * is not made again here, the grant says it passed. A new Google sign-in is mailed to the owner (googleNotice).
 */
async function finishGoogleAdd(env, session, state, when, grant, who, now, clear, ctx, fetchImpl) {
  const back = (code) => redirect(`/dashboard?google=${code}#profile`, [clear]);
  if (!session || !session.user) return redirect("/connect?error=login_expired", [clear]);
  if (!v2On(env)) return back("login_unavailable");
  // the session that asked, for this trip, in the last 10 minutes (logged out and in again, another member logged in on this browser
  // meanwhile, a marker typed into the cookie, or an old one: nothing is added)
  const at = /^[0-9a-z]{1,12}$/.test(when || "") ? parseInt(when, 36) : NaN;
  if (!grant || !(now - at >= 0 && now - at <= OAUTH_SECONDS * 1000) || !safeEqual(grant, await addGrant(env, session, state, when))) return back("login_expired");
  if (linkLocked(session, now)) return back("link_new");
  let r;
  try { r = await addGoogle(env.DB, session.user.id, who.id, now); }
  catch (e) { console.error("google sign-in not added", String((e && e.message) || e).slice(0, 120)); return back("login_unavailable"); }
  if (r.error) return back(r.error);
  if (r.already) return back("already");
  console.log("google sign-in added"); // no identifiers
  await googleNotice(env, session.user, ctx, fetchImpl); // "Google sign-in was added": the owner hears of it, whoever added it
  return back("linked");
}

/**
 * GET /api/auth/google/callback → link the login to the proven wallet (v1), or sign a returning person in.
 * v2: a known Google id signs in (its account's main login, or a Google sign-in a member added: src/logins.js findAccount); an
 * unknown one is recorded in the sign-up (when the person started from the sign-up page)
 * and the account is made right here, in the same request (finishCore), landing on /dashboard?welcome=1; a refusal of the
 * finish lands on /connect?error=<code> (location_unverified, social_taken, terms_required: the page shows the right step) or
 * /connect?step=finish (anything else: the page runs the finish once more and shows the precise reason). A login attempt
 * (no sign-up marker) with an unknown id is refused with "no_account", and the page is told it was a Google login
 * (/connect?error=no_account&login=google: it speaks of the Google account, not of a wallet).
 * With the link marker "l" (the Profile's Add, handleGoogleAdd) the Google account is added to the signed-in account instead, and
 * every answer goes back to the Profile (finishGoogleAdd).
 */
export async function handleOAuthCallback(request, env, provider, fetchImpl = fetch, now = Date.now(), ctx = null) {
  const url = new URL(request.url);
  const p = PROVIDERS[provider];
  if (!p) return json({ error: "not_found" }, 404);
  const clear = clearCookie(OAUTH_COOKIE);
  const [cp, state, verifier, marker, when, grant] = (getCookie(request, OAUTH_COOKIE) || "").split(".");
  const adding = marker === "l"; // adding Google from the Profile: the person goes back there, whatever happens
  const fail = (error) => redirect(adding ? `/dashboard?google=${error}#profile` : `/connect?error=${error}`, [clear]);
  if (!p.configured(env) || !env.DB) return fail("login_unavailable");
  if (url.searchParams.get("error")) return fail("login_cancelled");
  const code = url.searchParams.get("code");
  if (cp !== provider || !state || state !== url.searchParams.get("state") || !code || !verifier) return fail("login_expired");

  let who;
  const served = servedHost(env, request); // the same return address the start sent to Google (src/hostbind.js)
  try { who = await p.identity(env, { code, redirectUri: `${served.origin}/api/auth/${provider}/callback`, verifier }, fetchImpl); }
  catch (e) { console.error("login failed", provider, String(e)); return fail(e && e.message === "oauth_unavailable" ? "login_unavailable" : "login_failed"); }

  await ensureSchema(env.DB);
  const session = await getSession(env, request, now);
  if (adding) return provider === "google" ? finishGoogleAdd(env, session, state, when, grant, who, now, clear, ctx, fetchImpl) : fail("login_expired");
  const v2 = v2On(env) ? { onNew: marker === "s" ? () => recordIdentity(env, request, provider, who, now) : () => ({ error: "no_account" }) } : null;
  const r = await linkIdentity(env, session, provider, who, now, v2, served);
  // no account for this Google login: the page must speak of the Google account (not of a wallet) and say how to add Google to theirs
  if (r.error === "no_account") return redirect(`/connect?error=no_account&login=${provider}`, [clear]);
  if (r.error) return fail(r.error);
  if (r.recorded) {
    // the login is verified and in the sign-up: the account is made now, in this very request
    const fin = await finishCore(env, r.row, request, now, request.cf);
    if (fin.ok) return redirect("/dashboard?welcome=1", [clear, ...fin.cookies]);
    const shown = ["location_unverified", "social_taken", "terms_required"].includes(fin.error);
    // (a missing community: the page's location step; anything else: the finish step, which names what it waits for)
    return redirect(shown ? `/connect?error=${fin.error}` : `/connect?step=${fin.error === "location_required" ? "location" : "finish"}`, [clear, r.cookie]);
  }
  const cookies = r.cookie ? [clear, r.cookie] : [clear];
  // An existing person signed in: any half-done sign-up in this browser is over.
  if (v2 && r.cookie) cookies.push(...await endSignup(env, request));
  return redirect(r.to, cookies);
}

/**
 * The shared "this login is verified" step: link it to the proven wallet (creating the
 * account), or sign a returning person straight in. Returns { to, cookie, isNew } or { error }.
 *
 * v2 = { onNew() } (the sign-up v2): an identity that belongs to nobody yet is handed to onNew() instead of creating an
 * account here, so this function can only ever SIGN IN in v2 (the account is made by finish in src/signup.js, after
 * the Terms and the location). With v2 === null (the switch off) it is exactly the original, with one addition: a Google sign-in a
 * member added while v2 was on still finds their account (src/logins.js findAccount only reads, whatever the switch says), so switching
 * back to v1 locks nobody out; taking it off then waits until v2 is on again (docs/DEPLOY.md, "Switch back").
 */
export async function linkIdentity(env, session, provider, who, now, v2 = null, served = null) {
  // the account this login belongs to: its main login, or (Google only) a Google sign-in a member added from their Profile
  const linked = await findAccount(env.DB, provider, who.id);
  // Signing in with Google / e-mail alone doesn't prove the wallet: sensitive actions ask for it again.
  const start = async (userId, wallet, to, isNew) => {
    if (session) await dropSession(env, session.id);
    const provenAt = session && session.wallet === wallet ? session.proven_at : null;
    return { to, isNew, cookie: await createSession(env, { wallet, userId, provenAt, served }, SESSION_SECONDS, now) };
  };

  if (session && session.user) return { to: "/dashboard", isNew: false, cookie: null };

  if (session && session.wallet) {
    // The wallet was proven a moment ago: link this login to it, for good.
    if (linked) {
      if (linked.wallet !== session.wallet) return { error: "social_taken" };
      return start(linked.id, linked.wallet, "/dashboard", false);
    }
    if (await env.DB.prepare("SELECT id FROM users WHERE wallet = ?").bind(session.wallet).first()) return { error: "wallet_taken" };
    if (v2) return v2.onNew();
    // A handle can collide with the (case-insensitive) unique index when someone takes it between the check and the
    // INSERT: that is not the person's problem, so pick another name and go on. wallet / provider_id collisions are.
    for (let attempt = 0; ; attempt++) {
      const handle = attempt === 0 && who.handle ? who.handle : await autoUsername(env.DB);
      try {
        const ins = await env.DB.prepare("INSERT INTO users (wallet, provider, provider_id, handle, name, early, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(session.wallet, provider, who.id, handle, who.name, activeMint(env) ? 0 : 1, iso(now)).run();
        console.log("account created", provider, session.wallet.slice(0, 4) + "…" + session.wallet.slice(-4));
        return start(ins.meta.last_row_id, session.wallet, "/dashboard?welcome=1", true);
      } catch (e) {
        if (!/UNIQUE/i.test(String(e))) throw e;
        const handleTaken = await env.DB.prepare("SELECT id FROM users WHERE lower(handle) = lower(?)").bind(handle).first();
        if (!handleTaken || attempt >= 4) return { error: "social_taken" };
      }
    }
  }

  // No wallet proven in this browser: a returning person signs in with their login alone.
  if (linked) return start(linked.id, linked.wallet, "/dashboard", false);
  return v2 ? v2.onNew() : { error: "wallet_first" };
}

/**
 * POST /api/auth/logout. In v2 a deliberate sign-out also kills the person's pending "Open app" link codes (src/walletlink.js: a code
 * is bound to the person and the connection, not to a session, so without this a code made a minute ago would still link a wallet
 * and mint a session in the wallet app's browser after the person logged out of Safari on a shared phone).
 */
export async function handleLogout(request, env, now = Date.now()) {
  if (!sameSite(request, env)) return json({ ok: false, error: "wrong_origin" }, 403);
  if (env.DB) {
    try {
      await ensureSchema(env.DB);
      if (v2On(env)) await dropCarryCodes(env, request, now);
      await dropCurrent(env, request);
    } catch (e) {
      // while the host binding counts, a database failure (a host column that cannot be added yet) never keeps a browser signed in: the
      // cookie is cleared all the same, and the row ends by itself. With the binding off: exactly as before (the error answers 500)
      if (!servedHost(env, request).bound) throw e;
      console.error("sign-out: session row not removed", String((e && e.message) || e).slice(0, 120));
    }
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
}
/** The live link codes of the person signing out (unused or opened): gone, so the wallet app's claim answers carry_expired. */
async function dropCarryCodes(env, request, now) {
  const s = await getSession(env, request, now);
  if (!s || !s.user) return;
  try {
    await ensureSignupSchema(env.DB); // handoffs lives in the sign-up tables (the first v2 request made them)
    await env.DB.prepare("DELETE FROM handoffs WHERE kind = 'carry' AND user_id = ? AND (result IS NULL OR result = 'opened')").bind(s.user.id).run();
  } catch (e) { console.error("link codes not cleared on logout", String((e && e.message) || e).slice(0, 120)); }
}

/* ---------------- 3. e-mail codes ---------------- */

const CODE_SECONDS = 10 * 60;       // a code lives 10 minutes
const CODE_RESEND_SECONDS = 60;     // wait a minute between sends to the same address
const CODE_MAX_SENDS = 5;           // sends per rolling hour, per address
const CODE_MAX_ATTEMPTS = 5;        // wrong guesses before the code is thrown away
const GLOBAL_MAX_SENDS = 2000;      // codes mailed per rolling hour across the whole site (override: EMAIL_MAX_PER_HOUR)
const HOUR_MS = 3600_000;
// v2 only (SIGNUP_FLOW=v2). Without these, five sends an hour times five guesses was 600 guesses a day at one address, for any
// e-mail account, through the old sign-in routes (a right code signs the person in; no password is asked).
const MAIL_PER_DAY = 20;                                  // mails per address per 24 hours, whatever the code is for
const OLD_ROUTE = { start: { kind: "oes", max: 20 }, verify: { kind: "oev", max: 60 } };  // tries per connection per hour on the old routes

const cleanEmail = (s) => String(s || "").trim().toLowerCase().slice(0, 254);
// Loose shape check (the code that arrives is the real proof) that also refuses control characters and
// angle brackets, so nothing odd can ever reach the mail server.
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !/[\u0000-\u001f\u007f-\u009f<>]/.test(e);
export { cleanEmail, validEmail };

/**
 * Check a 6-digit e-mail code and burn it. Returns { ok: true } or
 * { ok: false, error, left? }. Shared by sign-in and contact-e-mail verification.
 *
 * Every guess is counted by ONE atomic statement before it is compared, so a flood of parallel guesses
 * can't all read "0 attempts so far": only the first CODE_MAX_ATTEMPTS guesses on a live code ever get
 * compared. A dead code (expired or out of guesses) keeps its row so the resend limits below survive;
 * a used code is deleted by a single DELETE, so two requests carrying the right code can't both win.
 */
export async function consumeEmailCode(db, email, code, now = Date.now()) {
  const row = await db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND attempts < ? AND expires_at > ? RETURNING code_hash, attempts")
    .bind(email, CODE_MAX_ATTEMPTS, iso(now)).first();
  if (!row) {
    const old = await db.prepare("SELECT expires_at, attempts FROM email_codes WHERE email = ?").bind(email).first();
    if (old && Date.parse(old.expires_at) > now && old.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, error: "too_many" };
    return { ok: false, error: "code_expired" };
  }
  if (!safeEqual(await sha256(code), row.code_hash)) return { ok: false, error: "code_wrong", left: CODE_MAX_ATTEMPTS - row.attempts };
  const used = await db.prepare("DELETE FROM email_codes WHERE email = ? AND code_hash = ?").bind(email, row.code_hash).run();
  return used.meta.changes ? { ok: true } : { ok: false, error: "code_expired" };
}

/** Constant-time compare for hex digests (no timing leak on wrong guesses). */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function sixDigits() {
  const b = crypto.getRandomValues(new Uint8Array(3));
  return String(100000 + ((b[0] * 65536 + b[1] * 256 + b[2]) % 900000));
}

async function sendCodeEmail(env, to, code, fetchImpl, mailer = {}, kind = "signin") {
  const { subject, text, html } = verificationEmail(code, kind);
  return sendMail(env, { to, subject, text, html }, { fetchImpl, smtpImpl: mailer.smtpImpl || null });
}

/**
 * Claim a send slot for this address and e-mail it a 6-digit code (shared by /api/auth/email/start and the v2 routes).
 * The slot (one a minute, five an hour per address) is claimed by ONE atomic statement BEFORE the mail goes out, so
 * parallel requests can't all pass the checks and mail the same person dozens of times. A site-wide hourly cap
 * (EMAIL_MAX_PER_HOUR, default 2000) keeps one caller from burning the mail quota. If the mail never left, the slot is
 * given back and the code is killed, so a mail-service hiccup doesn't lock the person out.
 *   kind     what the e-mail says the code is for: "signin" (default), "signup" or "reset"
 *   waitUntil  (optional) a function that keeps a promise alive after the answer is sent, like ctx.waitUntil: the mail is then
 *            sent (and the slot given back on failure) in the background, so the answer does not wait for the mail server
 *   noSend   (optional) claim the slot and write the code, but send nothing: the same database work as a real send
 *   codeKey  (optional) the name the code is filed under (default: the address). The mail still goes to `email`. A code can
 *            only be used under the name it was filed under, so a sign-in code can never serve as a password reset code
 * Returns { ok: true } or { ok: false, error: "bad_email" | "email_unavailable" | "too_many" | "too_soon" | "slow_down", status }.
 * ("slow_down" = v2 only: 20 mails to this address in the last 24 hours.)
 */
export async function sendEmailCode(env, email, { fetchImpl = fetch, now = Date.now(), mailer = {}, kind = "signin", waitUntil = null, noSend = false, codeKey = email } = {}) {
  if (!validEmail(email)) return { ok: false, error: "bad_email", status: 400 };
  if (!emailConfigured(env)) return { ok: false, error: "email_unavailable", status: 503 };

  const hourAgo = iso(now - HOUR_MS);
  const cap = Number(env.EMAIL_MAX_PER_HOUR) > 0 ? Number(env.EMAIL_MAX_PER_HOUR) : GLOBAL_MAX_SENDS;
  const total = await env.DB.prepare("SELECT COALESCE(SUM(send_count), 0) AS n FROM email_codes WHERE window_start > ?").bind(hourAgo).first();
  if (total && total.n >= cap) return { ok: false, error: "too_many", status: 429 };
  // v2: 20 mails per address in 24 hours, for every kind of code. It counts mails that were really claimed (below), never tries that
  // a minute or hour rule refused, so a stranger cannot use it up with a burst of requests. A refusal here touches no code.
  let dayKey = null;
  if (v2On(env)) {
    await ensureSignupSchema(env.DB); // the counters live in the sign-up tables (the old routes only ensure the old ones)
    dayKey = await limitKey(env, "mail", email);
    if ((await peek(env, dayKey, 24 * HOUR_MS, now)) >= MAIL_PER_DAY) return { ok: false, error: "slow_down", status: 429 };
  }

  const code = sixDigits();
  const hash = await sha256(code);
  const claimed = await env.DB.prepare(`INSERT INTO email_codes (email, code_hash, created_at, expires_at, attempts, send_count, window_start, last_sent_at)
      VALUES (?, ?, ?, ?, 0, 1, ?, ?)
      ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at,
        expires_at = excluded.expires_at, attempts = 0,
        send_count = CASE WHEN window_start IS NOT NULL AND window_start > ? THEN send_count + 1 ELSE 1 END,
        window_start = CASE WHEN window_start IS NOT NULL AND window_start > ? THEN window_start ELSE excluded.window_start END,
        last_sent_at = excluded.last_sent_at
      WHERE (last_sent_at IS NULL OR last_sent_at <= ?) AND (window_start IS NULL OR window_start <= ? OR send_count < ?)
      RETURNING send_count`)
    .bind(codeKey, hash, iso(now), iso(now + CODE_SECONDS * 1000), iso(now), iso(now), hourAgo, hourAgo, iso(now - CODE_RESEND_SECONDS * 1000), hourAgo, CODE_MAX_SENDS).first();
  if (!claimed) {
    const row = await env.DB.prepare("SELECT last_sent_at FROM email_codes WHERE email = ?").bind(codeKey).first();
    const soon = row && row.last_sent_at && now - Date.parse(row.last_sent_at) < CODE_RESEND_SECONDS * 1000;
    return { ok: false, error: soon ? "too_soon" : "too_many", status: 429 };
  }
  if (dayKey) await hits(env, [{ key: dayKey, windowMs: 24 * HOUR_MS }], now);

  // The mail never left: give the slot back (and kill the code nobody received).
  const giveBack = async () => {
    await env.DB.prepare("UPDATE email_codes SET last_sent_at = NULL, send_count = MAX(send_count - 1, 0), expires_at = ? WHERE email = ? AND code_hash = ?").bind(iso(now), codeKey, hash).run();
    if (dayKey) await refund(env, [dayKey]);
  };
  const deliver = async () => {
    const sent = await sendCodeEmail(env, email, code, fetchImpl, mailer, kind);
    if (!sent.ok) await giveBack();
    return sent;
  };
  if (noSend) { /* nothing is sent */ }
  else if (waitUntil) {
    waitUntil(deliver().catch(async (e) => {
      console.error("code e-mail failed", String((e && e.message) || e));
      try { await giveBack(); } catch { /* the slot frees itself after a minute anyway */ }
    }));
  } else {
    const sent = await deliver();
    if (!sent.ok) return { ...sent, status: 503 };
  }
  // Tidy now and then: only rows whose code AND hourly counters are both over.
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM email_codes WHERE expires_at < ? AND (window_start IS NULL OR window_start < ?)").bind(iso(now), hourAgo).run();
  return { ok: true };
}

/**
 * v2 only: the old e-mail routes (they only sign people in now) count tries per connection, like the new sign-up routes. Switch off:
 * nothing is counted and nothing changes. Returns a Response to send, or null. `spec` is one of OLD_ROUTE.
 */
async function oldRouteLimit(env, request, spec, now) {
  if (!v2On(env)) return null;
  try { await ensureSignupSchema(env.DB); }
  catch (e) {
    console.error("sign-up tables unavailable", String((e && e.message) || e));
    return json({ ok: false, error: "signup_unavailable" }, 503);
  }
  const r = await check(env, [{ key: await limitKey(env, spec.kind, clientKey(request)), windowMs: HOUR_MS, max: spec.max }], now);
  return r.ok ? null : json({ ok: false, error: "slow_down" }, 429);
}

/** POST /api/auth/email/start { email } → send a 6-digit code. */
export async function handleEmailStart(request, env, fetchImpl = fetch, now = Date.now(), mailer = {}) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const slow = await oldRouteLimit(env, request, OLD_ROUTE.start, now);
  if (slow) return slow;
  const body = await readJson(request);
  const r = await sendEmailCode(env, cleanEmail(asText(body && body.email)), { fetchImpl, now, mailer });
  if (!r.ok) return json({ ok: false, error: r.error }, r.status);
  return json({ ok: true });
}

/**
 * POST /api/auth/email/verify { email, code } → link the e-mail to the proven wallet, or sign in.
 * v2: this route only signs existing e-mail accounts in. An unknown address answers "no_account" (the sign-up page
 * has its own route, /api/signup/email/verify, which needs the Terms and the location first).
 */
export async function handleEmailVerify(request, env, fetchImpl = fetch, now = Date.now()) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  const slow = await oldRouteLimit(env, request, OLD_ROUTE.verify, now);
  if (slow) return slow;
  const body = await readJson(request);
  // asText: only strings and numbers count as text; anything else is "" (String() of {"toString":1} throws).
  const email = cleanEmail(asText(body && body.email));
  const code = asText((body && body.code) || "").replace(/\D/g, "").slice(0, 6);
  if (!validEmail(email) || code.length !== 6) return json({ ok: false, error: "bad_code" }, 400);

  const v = await consumeEmailCode(env.DB, email, code, now);
  if (!v.ok) return json({ ok: false, error: v.error, ...(v.left != null ? { left: v.left } : {}) }, v.error === "too_many" ? 429 : 400);

  await ensureSchema(env.DB);
  const session = await getSession(env, request, now);
  const v2 = v2On(env) ? { onNew: () => ({ error: "no_account" }) } : null;
  const r = await linkIdentity(env, session, "email", { id: email, handle: null, name: "E-mail member" }, now, v2, servedHost(env, request));
  // (no_account says it was an e-mail login: the page speaks of the e-mail, not of a wallet)
  if (r.error) return json({ ok: false, error: r.error, ...(r.error === "no_account" ? { login: "email" } : {}) }, 400);
  const headers = r.cookie ? { "Set-Cookie": r.cookie } : {};
  if (v2 && r.cookie) { // signed in as an existing person: a half-done sign-up in this browser is over
    const clear = await endSignup(env, request);
    if (clear.length) headers["Set-Cookie"] = [r.cookie, ...clear];
  }
  return json({ ok: true, next: r.to, isNew: r.isNew }, 200, headers);
}
