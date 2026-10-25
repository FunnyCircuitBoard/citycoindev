/**
 * Wallet-only registration, the part src/auth.js needs too (Citycoin.dev master v5, stage S11; master section 19 WP-03 "Exact registration
 * sequence" steps 4 to 6 and section 18 WP-02 "Enforce a database unique index on canonical wallet public key. Concurrent first signups
 * upsert/return the same account"; docs/citycoin-master/schema-and-api.md sections 3.1 and 4.1). It lives here, and not in src/register.js,
 * so that src/auth.js (the register challenge, the register pairing) never imports the routes that import auth.js. Used only while
 * WALLET_ONLY counts (src/v5policy.js walletOnly); with the switch off nothing here runs.
 *
 * THE ORDER, enforced on the server: the browser's location first (the sign-up's location step: today's checks, src/attest.js checkLocation
 * and src/signup.js handleLocation, keep only the city, never the point), then the Terms (and an optional display name), then the wallet. A
 * register challenge is issued only for a sign-up whose city is resolved and whose Terms are accepted (src/auth.js handleChallenge), and the
 * registration uses the sign-up row alone: its city, country, Terms receipt and display name; never anything the page says.
 *
 * THREE WAYS TO THE WALLET, one batch (register, below):
 *   - this browser's own wallet (an extension, or the wallet app whose browser this is): POST /api/signup/wallet with a register challenge
 *     whose ref names this sign-up and its city ("s:<sign-up>:<city>");
 *   - a register hand-off: Safari or Chrome makes a single-use five-minute code (POST /api/signup/handoff, src/register.js), the wallet
 *     app's browser opens it (the first browser that opens it is its only opener, as with the wallet link's code: src/walletlink.js), signs
 *     a register challenge issued for that code ("h:<hand-off>") and claims it; the code is bound to the sign-up, the city snapshot, the
 *     purpose, the opener and the connection (or, behind a relay, the country);
 *   - a register pairing: a computer shows a code (POST /api/pair { purpose: "register" }), a phone's wallet signs a register challenge
 *     issued for it ("p:<pairing>", the text carries the check number), and the computer finishes (POST /api/pair/finish).
 * Codes travel only in POST bodies, and the links carry them in the fragment (#register=, #pair=), which no browser sends to this site's server or
 * puts in a Referer. One exception by the wallet apps' design (review finding SEC-8): "Open app" wraps the whole link, fragment included, in
 * the wallet vendor's universal link (public/wallets.js), so when the phone does not hand that link to the app (not installed, another in-app
 * browser, "open in browser") the vendor's web server receives the live code in its request line. The vendor is a trusted party there; what
 * protects the code is its five-minute single use, the first-opener binding and the connection (or relay country) binding.
 *
 * THE BATCH (one D1 transaction): the gate (the challenge is used up, or the hand-off, or the pairing, only while the sign-up is alive with
 * its Terms and the very city the gate was made for), then INSERT INTO users ... SELECT ... FROM signups ... ON CONFLICT(wallet) DO NOTHING
 * (users.wallet is UNIQUE: src/store.js), then a 30-day wallet session for `users WHERE wallet = ?` (the new account, or the account the
 * wallet already had), then this browser's previous session, the sign-up, its pairings and its other hand-offs go. A race between two
 * registrations of one wallet makes one account; the loser gets that same account and its city is never changed (existing: true). Every
 * statement after the gate holds only when the gate changed its row in this very batch, so a refused or dead gate makes nothing at all.
 * The account records what the master asks to keep (users.home_city, home_name, home_country, loc_verified_at, loc_policy, loc_method,
 * signup_completed_at; src/store.js IDENTITY_REGISTER_MIGRATION) and never a coordinate; the sign-up's network note (loc_net) dies with it.
 * An expired registration restarts registration (410 signup_expired): it is never turned into a sign-in check.
 */
import { clearCookie, cookie, getCookie, json, randomToken, sha256 } from "./http.js";
import { SESSION_COOKIE, SESSION_SECONDS } from "./session.js";
import { SIGNUP_COOKIE, termsVersion, getSignup } from "./signup-core.js";
import { recheckLocation } from "./signup-finish.js";
import { NULL_HOST, onThisHost, servedHost } from "./hostbind.js";
import { activeMint } from "./official.js";
import { autoUsername } from "./text.js";
import { check, limitKey } from "./limits.js";
import { HOUR, iso } from "./policy.js";
import { IDENTITY_POLICY } from "./v5policy.js";
import { consumeStatement, usedByFor, usedClause } from "./challenge.js";
import { networkCheck } from "./network.js";
import { RELAY_OPEN_MS, carryNet, hostedNetwork, openerHash, relayCountry } from "./walletlink.js";
import { carryRelayOn } from "./flags.js";
import { ensureHostSchema, ensureRegisterSchema } from "./store.js";

const REGISTERS_PER_HOUR = 10; // registration tries per sign-up, whichever way (counted before the work, atomically: src/limits.js)

/** What a register challenge is bound to (auth_challenges.ref): this browser's sign-up and the city its text names, a hand-off, a pairing. */
export const signupRef = (signupId, cityId) => `s:${signupId}:${cityId}`;
export const handoffRef = (id) => `h:${id}`;
export const pairRef = (id) => `p:${id}`;
/** { kind: "s", signupId, city } | { kind: "h", id } | { kind: "p", id } | null. */
export function parseRef(ref) {
  const s = String(ref || "");
  if (s.startsWith("s:")) {
    const i = s.indexOf(":", 2);
    return i > 2 && i < s.length - 1 ? { kind: "s", signupId: s.slice(2, i), city: s.slice(i + 1) } : null;
  }
  if (s.startsWith("h:") && s.length > 2) return { kind: "h", id: s.slice(2) };
  if (s.startsWith("p:") && s.length > 2) return { kind: "p", id: s.slice(2) };
  return null;
}

/** A sign-up's city snapshot for a hand-off or a pairing (handoffs.bind, pairs.bind): the city, its name and country; never a coordinate. */
export const bindOf = (row) => JSON.stringify({ city: row.loc_city, name: row.loc_name, country: row.loc_country });
export function readBind(text) {
  try {
    const b = JSON.parse(text);
    return b && typeof b.city === "string" && b.city ? b : null;
  } catch { return null; }
}

/** Is this sign-up ready for the wallet (its city resolved, the current Terms accepted)? null, or the refusal { error, status }. */
export function notReady(row) {
  if (!row || !row.loc_city) return { error: "location_required", status: 409 };
  if (row.terms_version !== termsVersion()) return { error: "terms_required", status: 409 };
  return null;
}

/** Forget a sign-up's location only (the Terms and the display name stay), as the old finish does when the network no longer matches. */
export const forgetLocation = (env, signupId) => env.DB.prepare(
  "UPDATE signups SET loc_city = NULL, loc_name = NULL, loc_country = NULL, loc_choices = NULL, loc_net = NULL, loc_at = NULL WHERE id = ?").bind(signupId).run();

/** The two-digit check number of a register hand-off code (shown by Safari and by the wallet app; derived from the code, nothing to store). */
export async function registerPin(code) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`register-pin\n${code}`)));
  return String(10 + (((h[0] << 8) | h[1]) % 90));
}

/* ---------------- the gates ---------------- */

/** The condition on the sign-up every gate carries in its own WHERE: alive, its Terms, the city the gate was made for. */
const aliveFrom8 = (signupId, city) => ({ sql: " AND EXISTS (SELECT 1 FROM signups WHERE id = ?8 AND expires_at > ?1 AND terms_version = ?9 AND loc_city = ?10)", args: [signupId, termsVersion(), city] });

/**
 * The gate of a register challenge (this browser, or a hand-off together with handoffGate): the challenge `row` (checked by src/challenge.js
 * checkChallenge) is used up, in the batch, only while the sign-up is alive with its Terms and `city`.
 */
export async function challengeGate(db, row, signupId, city, now) {
  const usedBy = await usedByFor(`register:${signupId}`);
  return {
    stmts: [consumeStatement(db, row, usedBy, now, aliveFrom8(signupId, city))],
    cond: usedClause(row, usedBy),
    failed: (res) => (res[0].meta.changes === 1 ? null : { status: 409, body: { ok: false, error: "challenge_used" } }),
  };
}

/** A hand-off claim: the challenge gate, then the code itself (still opened by this opener, live, for the same city), used up as 'registered'. */
export async function handoffGate(db, row, handoff, signupId, city, wallet, now) {
  const g = await challengeGate(db, row, signupId, city, now);
  const mark = db.prepare(`UPDATE handoffs SET result = 'registered', wallet = ? WHERE id = ? AND kind = 'register' AND result = 'opened' AND opener = ?
      AND expires_at > ? AND bind = ?${g.cond.sql}`).bind(wallet, handoff.id, handoff.opener, iso(now), handoff.bind, ...g.cond.args);
  return {
    stmts: [...g.stmts, mark],
    cond: { sql: `${g.cond.sql} AND EXISTS (SELECT 1 FROM handoffs WHERE id = ? AND result = 'registered' AND wallet = ?)`, args: [...g.cond.args, handoff.id, wallet] },
    failed: (res) => g.failed(res) || (res[1].meta.changes === 1 ? null : { status: 410, body: { ok: false, error: "code_expired" } }),
  };
}

/**
 * A register pairing the phone approved (pairs.wallet set by a used register challenge, src/auth.js): used once, by overwriting its city
 * snapshot with a one-use marker, only while it is live, still for this sign-up, this wallet and this city, and the sign-up is alive.
 */
export async function pairGate(db, p, signupId, city, now) {
  const usedBy = await usedByFor(`pair:${p.id}`);
  return {
    stmts: [db.prepare(`UPDATE pairs SET bind = ? WHERE id = ? AND purpose = 'register' AND wallet = ? AND signup_id = ? AND bind = ? AND expires_at > ?
        AND EXISTS (SELECT 1 FROM signups WHERE id = ? AND expires_at > ? AND terms_version = ? AND loc_city = ?)`)
      .bind(usedBy, p.id, p.wallet, signupId, p.bind, iso(now), signupId, iso(now), termsVersion(), city)],
    cond: { sql: " AND EXISTS (SELECT 1 FROM pairs WHERE id = ? AND bind = ?)", args: [p.id, usedBy] },
    failed: (res) => (res[0].meta.changes === 1 ? null : { status: 410, body: { ok: false, status: "expired" } }),
  };
}

/* ---------------- the batch ---------------- */

/** Why a gate changed nothing: the sign-up ran out (restart registration), its Terms or city changed, or the gate's own reason. */
async function whyNot(env, signupId, city, gateAnswer, now) {
  const s = await env.DB.prepare("SELECT expires_at, terms_version, loc_city FROM signups WHERE id = ?").bind(signupId).first();
  if (!s || !(Date.parse(s.expires_at) > now)) return { status: 410, body: { ok: false, error: "signup_expired" } };
  if (s.terms_version !== termsVersion()) return { status: 409, body: { ok: false, error: "terms_required" } };
  if (s.loc_city !== city) return { status: 409, body: { ok: false, error: "location_changed" } };
  return gateAnswer;
}

/**
 * Register `wallet` from the sign-up `signup` (a live row), behind `gate` (challengeGate, handoffGate or pairGate). Returns { status, body,
 * cookies? }:
 *   200 { ok, existing, wallet, user: { id, handle, city }, next } and the 30-day session cookie (the `vsu` cookie cleared): existing false, a
 *       new account with the sign-up's city; existing true, the wallet already had an account (a lost race, or a second registration): that
 *       account, its city unchanged
 *   410 signup_expired (restart registration) · 409 terms_required, location_changed, username_taken (the display name was taken a moment
 *   ago), wallet_conflict · the gate's own refusal (409 challenge_used, 410 code_expired, 410 { status: "expired" }) · 429 slow_down ·
 *   503 unavailable (the database failed: nothing is accepted)
 * `here`: the session is a wallet app's own browser's (made_by 'wallet', renewed while used); `app`: the wallet app (src/walletlink.js appOf).
 * `newOnly` (a register pairing, finished on ANOTHER device than the wallet's: review finding SEC-3): a wallet that already has an account makes
 * no session there (409 use_sign_in; the gate is used up): the existing-account answer is kept for the signer's own browser only (this browser's
 * wallet, a hand-off claim in the wallet app).
 */
export async function register(env, request, { signup, city, wallet, gate, here = false, app = null, newOnly = false, now = Date.now() }) {
  const db = env.DB, served = servedHost(env, request);
  const at = iso(now);
  try {
    const limit = await check(env, [{ key: await limitKey(env, "regs", signup.id), windowMs: HOUR, max: REGISTERS_PER_HOUR }], now);
    if (!limit.ok) return { status: 429, body: { ok: false, error: "slow_down" } };
    if (served.bound) await ensureHostSchema(db, "sessions");
  } catch (e) {
    console.error("registration not started", String((e && e.message) || e).slice(0, 80));
    return { status: 503, body: { ok: false, error: "unavailable" } };
  }
  if (newOnly) {
    let had;
    try { had = await db.prepare("SELECT id FROM users WHERE wallet = ?").bind(wallet).first(); }
    catch (e) {
      console.error("registration not started", String((e && e.message) || e).slice(0, 80));
      return { status: 503, body: { ok: false, error: "unavailable" } };
    }
    if (had) return { status: 409, body: { ok: false, error: "use_sign_in" } };
  }
  const token = getCookie(request, SESSION_COOKIE);
  const currentId = token && token.length <= 100 ? await sha256(token) : null;
  const newToken = randomToken(32), sid = await sha256(newToken);
  const c = gate.cond, made = { sql: " AND EXISTS (SELECT 1 FROM sessions WHERE id = ?)", args: [sid] };
  // newOnly: the session only for the account this very batch made (created and completed now, from this sign-up's city), never for one the
  // wallet had already (it registered between the check above and this batch)
  const fresh = newOnly ? { sql: " AND created_at = ? AND signup_completed_at = ? AND provider = 'wallet' AND home_city = ?", args: [at, at, city] } : { sql: "", args: [] };
  for (let attempt = 0; ; attempt++) {
    const stmts = [...gate.stmts];
    const iUser = stmts.length;
    let auto;
    try { auto = await autoUsername(db); } catch { return { status: 503, body: { ok: false, error: "unavailable" } }; }
    stmts.push(db.prepare(`INSERT INTO users (wallet, provider, provider_id, handle, name, early, created_at, terms_version, terms_agreed_at,
          home_city, home_name, home_country, home_at, wallet_at, wallet_via, wallet_app, signup_completed_at, loc_verified_at, loc_policy, loc_method)
        SELECT ?, 'wallet', ?, COALESCE(s.display_name, ?), NULL, ?, ?, s.terms_version, s.terms_at,
          s.loc_city, s.loc_name, s.loc_country, ?, ?, 'register', ?, ?, s.loc_at, ?, CASE WHEN s.loc_choices IS NULL THEN 'inside' ELSE 'nearest' END
          FROM signups s WHERE s.id = ? AND s.expires_at > ? AND s.terms_version = ? AND s.loc_city = ?${c.sql}
        ON CONFLICT(wallet) DO NOTHING`)
      .bind(wallet, wallet, auto, activeMint(env) ? 0 : 1, at, at, at, app, at, IDENTITY_POLICY.policyVersion, signup.id, at, termsVersion(), city, ...c.args));
    const cols = ["id", "wallet", "user_id", "proof", "created_at", "expires_at", "proven_at", "auth"], vals = ["?", "wallet", "id", "NULL", "?", "?", "?", "'wallet'"];
    const args = [sid, at, iso(now + SESSION_SECONDS * 1000), at];
    if (here) { cols.push("made_by"); vals.push("'wallet'"); }
    if (served.bound) { cols.push("host"); vals.push("?"); args.push(served.key); }
    const iSession = stmts.length;
    stmts.push(db.prepare(`INSERT INTO sessions (${cols.join(", ")}) SELECT ${vals.join(", ")} FROM users WHERE wallet = ?${fresh.sql}${c.sql}`).bind(...args, wallet, ...fresh.args, ...c.args));
    // this browser's previous session (on this host only), whoever it was: a registration never inherits it
    if (currentId) {
      stmts.push(served.bound
        ? db.prepare(`DELETE FROM sessions WHERE id = ? AND id <> ? AND COALESCE(host, ?) = ?${made.sql}`).bind(currentId, sid, NULL_HOST, served.key, ...made.args)
        : db.prepare(`DELETE FROM sessions WHERE id = ? AND id <> ?${made.sql}`).bind(currentId, sid, ...made.args));
    }
    // the sign-up is spent: its location hand-offs and pairings go with it (the register hand-off that was used stays, so Safari can see it)
    stmts.push(db.prepare(`DELETE FROM handoffs WHERE signup_id = ? AND NOT (kind = 'register' AND result = 'registered')${made.sql}`).bind(signup.id, ...made.args));
    stmts.push(db.prepare(`DELETE FROM pairs WHERE signup_id = ?${made.sql}`).bind(signup.id, ...made.args));
    stmts.push(db.prepare(`DELETE FROM signups WHERE id = ?${made.sql}`).bind(signup.id, ...made.args));
    let res;
    try { res = await db.batch(stmts); }
    catch (e) {
      const msg = String((e && e.message) || e);
      if (/UNIQUE/i.test(msg) && /handle/i.test(msg)) {
        if (signup.display_name) return { status: 409, body: { ok: false, error: "username_taken" } }; // taken a moment ago: the person picks another
        if (attempt < 4) continue; // our own generated name collided: another one
      }
      if (/UNIQUE/i.test(msg)) return { status: 409, body: { ok: false, error: "wallet_conflict" } }; // (a 'wallet' login id held by an account whose wallet changed)
      console.error("registration not recorded", msg.slice(0, 80));
      return { status: 503, body: { ok: false, error: "unavailable" } };
    }
    const refused = gate.failed(res);
    if (refused) return whyNot(env, signup.id, city, refused, now);
    const created = res[iUser].meta.changes === 1;
    if (newOnly && !created) return { status: 409, body: { ok: false, error: "use_sign_in" } }; // (the wallet registered a moment ago elsewhere)
    if (res[iSession].meta.changes !== 1) return { status: 409, body: { ok: false, error: "changed_retry" } }; // cannot happen once the gate held
    const u = await db.prepare("SELECT id, handle, home_city, home_name, home_country FROM users WHERE wallet = ?").bind(wallet).first();
    console.log(created ? "account registered" : "registration found the wallet's account"); // no identifiers
    return {
      status: 200,
      body: { ok: true, existing: !created, wallet, user: { id: u.id, handle: u.handle, city: u.home_city ? { id: u.home_city, name: u.home_name, country: u.home_country } : null },
        next: created ? "/dashboard?welcome=1" : "/dashboard" },
      cookies: [cookie(SESSION_COOKIE, newToken, SESSION_SECONDS), clearCookie(SIGNUP_COOKIE)],
    };
  }
}

/* ---------------- the register hand-off (codes: src/register.js makes them) ---------------- */

/** A live, unused register hand-off by its code, or null. */
export async function findRegisterHandoff(env, code, now) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(code)) return null;
  const row = await env.DB.prepare("SELECT * FROM handoffs WHERE id = ? AND kind = 'register' AND purpose = 'register' AND (result IS NULL OR result = 'opened')")
    .bind(await sha256(code)).first();
  return row && Date.parse(row.expires_at) > now ? row : null;
}

const refuse = (error, status, extra = {}) => ({ error: json({ ok: false, error, ...extra }, status) });

/**
 * A register hand-off this browser may use: { row, signup, bind, relay } or { error: Response }, the same rules as the wallet link's code
 * (src/walletlink.js usableCarry), in order:
 *   410 code_expired      unknown, used, contested or old (one answer: nothing can be probed), made on another host, or a relay code while
 *                         CARRY_RELAY=off
 *   403 code_network      another connection (a relay code: another country, a server or a commercial VPN): nothing is bound; a code nobody
 *                         opened yet is marked (refused_at) so Safari can say so
 *   410 signup_expired    the sign-up that made it ran out: registration restarts in the normal browser
 *   409 location_changed  the sign-up's city is no longer the one the code was made for
 *   403 contested         another browser opened it first: it is dead now (two openers mean the link is out); the first opener is told the
 *                         same afterwards (its own opener nonce), never anyone else
 *   403 not_opened        `mode` "use" (the challenge, the claim) needs a code this very browser opened (POST /api/signup/handoff/info)
 *   410 code_expired      `mode` "open" of a relay code nobody opened within 2 minutes
 * `nonces`: the opener nonces this browser presents (src/walletlink.js presented).
 */
export async function usableHandoff(env, request, code, now, cf, mode, nonces) {
  const row = await findRegisterHandoff(env, code, now);
  if (!row) {
    // the browser that opened it first, after a second one opened it too: told "opened twice" (review finding F7); anyone else: one answer
    const dead = typeof code === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(code)
      ? await env.DB.prepare("SELECT opener, host FROM handoffs WHERE id = ? AND kind = 'register' AND result = 'contested'").bind(await sha256(code)).first() : null;
    if (dead && dead.opener && onThisHost(servedHost(env, request), dead.host) && (await Promise.all(nonces.map(openerHash))).includes(dead.opener)) return refuse("contested", 403);
    return refuse("code_expired", 410);
  }
  if (!onThisHost(servedHost(env, request), row.host)) return refuse("code_expired", 410);
  const relay = row.net === "relay";
  if (relay && !carryRelayOn(env)) return refuse("code_expired", 410, { relay: true });
  if (relay ? relayCountry(cf) !== row.country || hostedNetwork(cf) : row.net !== await carryNet(env, request)) {
    if (!row.opener && !row.refused_at) await env.DB.prepare("UPDATE handoffs SET refused_at = ? WHERE id = ? AND opener IS NULL AND refused_at IS NULL").bind(iso(now), row.id).run();
    return refuse("code_network", 403, relay ? { relay: true } : {});
  }
  const signup = await env.DB.prepare("SELECT * FROM signups WHERE id = ?").bind(row.signup_id).first();
  if (!signup || !(Date.parse(signup.expires_at) > now)) return refuse("signup_expired", 410);
  const bind = readBind(row.bind);
  if (!bind || signup.loc_city !== bind.city || signup.terms_version !== termsVersion()) return refuse("location_changed", 409);
  if (row.opener) {
    if (!(await Promise.all(nonces.map(openerHash))).includes(row.opener)) {
      await env.DB.prepare("UPDATE handoffs SET result = 'contested' WHERE id = ? AND result = 'opened'").bind(row.id).run();
      console.log("register code contested");
      return refuse("contested", 403);
    }
  } else if (mode === "use") return refuse("not_opened", 403);
  else if (relay && now - Date.parse(row.created_at) >= RELAY_OPEN_MS) return refuse("code_expired", 410, { relay: true });
  return { row, signup, bind, relay };
}

/**
 * The location rule for whoever registers through a hand-off, from the connection that claims it (master section 19 step 2: the existing
 * anti-abuse checks). An ordinary code is claimed from the connection that made it, so today's finish check applies as it is (src/signup-
 * finish.js recheckLocation: the same country and network as the location step, no Tor, VPN or hosting network, within 500 km of the city).
 * A relay code (iCloud Private Relay: Safari's connection is not the wallet app's) was already held to Safari's country and refused from a
 * server or a commercial VPN (usableHandoff); here the claimer's own connection must also be in the sign-up's country and pass the network
 * check, without the operator match a relay never gives.
 */
export async function handoffLocationOk(env, h, cf) {
  if (!h.relay) return recheckLocation(env, h.signup, cf);
  return !networkCheck(cf ? { ...cf, latitude: null, longitude: null } : cf, {}, h.signup.loc_country);
}

/* ---------------- the register pairing (src/auth.js handlePairFinish) ---------------- */

/**
 * POST /api/pair/finish of a register pairing (WALLET_ONLY counting): the computer that showed the code, with its own sign-up (the `vsu`
 * cookie of the sign-up the pairing was made for), collects what the phone approved and registers that wallet from its sign-up. Returns
 * { status, body, cookies? }: { ok: false, status: "waiting" } until the phone approved; 410 { status: "expired" } for another browser, a used
 * or dead pairing; 403 location_unverified when this connection no longer matches the location step (the location is forgotten, as by the
 * old finish); 409 use_sign_in when the approving wallet already has an account (nothing is made, no session: the wallet signs in on its own
 * device instead; review finding SEC-3); otherwise register's answers, with status "done" on success.
 */
export async function finishRegisterPairing(env, request, p, now = Date.now(), cf = request.cf) {
  const expired = { status: 410, body: { ok: false, status: "expired" } };
  let signup;
  try {
    await ensureRegisterSchema(env.DB); // (the pairing was made by a request that ran it; this isolate may not have yet)
    signup = await getSignup(env, request, now);
  }
  catch (e) {
    console.error("register pairing: sign-up unreadable", String((e && e.message) || e).slice(0, 80));
    return { status: 503, body: { ok: false, error: "unavailable" } };
  }
  if (!signup || signup.id !== p.signup_id) return expired;
  if (!p.wallet) return { status: 200, body: { ok: false, status: "waiting" } };
  const bind = readBind(p.bind);
  if (!bind) return expired;
  const nr = notReady(signup);
  if (nr) return { status: nr.status, body: { ok: false, error: nr.error } };
  if (signup.loc_city !== bind.city) return { status: 409, body: { ok: false, error: "location_changed" } };
  if (!(await recheckLocation(env, signup, cf))) {
    await forgetLocation(env, signup.id);
    return { status: 403, body: { ok: false, error: "location_unverified" } };
  }
  // newOnly: the computer finishing a phone's approval never gets a session in an account the wallet already had (review finding SEC-3)
  const out = await register(env, request, { signup, city: bind.city, wallet: p.wallet, gate: await pairGate(env.DB, p, signup.id, bind.city, now), newOnly: true, now });
  return out.body.ok ? { ...out, body: { ...out.body, status: "done" } } : out;
}
