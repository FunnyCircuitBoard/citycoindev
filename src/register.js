/**
 * Wallet-only first-time registration: the routes (Citycoin.dev master v5, stage S11; master section 19 WP-03 "Exact registration sequence",
 * section 18 WP-02; docs/citycoin-master/schema-and-api.md section 4.1). src/index.js sends /api/signup/* here only while WALLET_ONLY counts
 * (src/v5policy.js walletOnly), whatever SIGNUP_FLOW says; with the switch off these paths are today's (src/signup.js routeV2, or 404
 * not_enabled). The batch that makes the account is src/register-core.js register.
 *
 *   POST /api/signup/start                          a fresh registration (cookie `vsu`), or the current one       (src/signup.js, as today)
 *   GET  /api/signup/state                          { state }: location, terms, name, next (location → terms → wallet)
 *   POST /api/signup/location { location, country? } 1. the browser's location FIRST: today's checks; only the city is kept, never the point
 *   POST /api/signup/location/choice { id }         one of the three nearest, in empty land (as today)
 *   POST /api/signup/terms { version }              2. the Terms of Use
 *   POST /api/signup/name { displayName }           2b. an optional display name (the username rules; "" or null clears it)
 *   POST /api/signup/wallet { challengeId, address, message, signature, inApp?, app? }
 *                                                   3. this browser's own wallet signs a register challenge (POST /api/auth/challenge
 *                                                      { purpose: "register", address }) and the account is made (existing: true when the
 *                                                      wallet already had one: that account, its city unchanged)
 *   POST /api/signup/handoff { app? }               3'. Safari or Chrome: a single-use five-minute code for the wallet app's browser
 *                                                      ({ code, pin, ref, url: <origin>/connect#register=<code>, expiresAt })
 *   POST /api/signup/handoff/info { code, opener? } the wallet app's page: the check number and the city (nothing private); the FIRST
 *                                                   browser that asks is the code's only opener (the __Host-vlo nonce, as for a link code)
 *   POST /api/signup/handoff/claim { code, opener?, challengeId, address, message, signature, app? }
 *                                                   that browser registers the wallet it signed with (a register challenge issued with
 *                                                   { handoff: code, opener }) and gets its own session there
 *   POST /api/signup/handoff/status { ref }         Safari asks what became of its code: waiting | opened | registered | contested |
 *                                                   refused | expired (registered: "sign in with your wallet here too": no session moves)
 * The register pairing (a computer and a phone's wallet) is POST /api/pair { purpose: "register" } (src/auth.js). Every other path under
 * /api/signup/ (the account step with Google or e-mail and a password, the old finish, the location hand-off into a wallet app) answers what
 * an unknown path answers (404), before any method check. Codes travel only in POST bodies and links carry them in the fragment: never in a
 * URL this site's server sees, its log or a Referer (the one exception, the wallet vendor's universal link of "Open app", is in
 * src/register-core.js: review finding SEC-8). Nothing here logs a code, an address or a coordinate.
 */
import { cookie, getCookie, json, randomToken, readJson, sha256 } from "./http.js";
import { checkChallenge } from "./challenge.js";
import { clientKey } from "./limits.js";
import { iso } from "./policy.js";
import { isRelayNetwork } from "./network.js";
import { carryRelayOn } from "./flags.js";
import { IDENTITY_POLICY } from "./v5policy.js";
import { SIGNUP_COOKIE, guardV2 } from "./signup-core.js";
import { handleChoice, handleLocation, handleStart, handleState, handleTerms, limited, needSignup, perHour, registerState, reload } from "./signup.js";
import { recheckLocation } from "./signup-finish.js";
import { ensureHostSchema, ensureRegisterSchema } from "./store.js";
import { hostWrite, onThisHost, servedHost } from "./hostbind.js";
import { brandReserve, nameSkeleton, reservedUsername, validUsername } from "./me.js";
import { OPENER_COOKIE, RELAY_OPEN_MS, UL_APPS, appOf, carryNet, openerHash, presented, relayAsn, relayCountry } from "./walletlink.js";
import { bindOf, challengeGate, forgetLocation, handoffGate, handoffLocationOk, handoffRef, notReady, parseRef, register, registerPin, usableHandoff } from "./register-core.js";

// How many tries, per hour (counted BEFORE the work, atomically: src/limits.js). The registration batch's own limit is in src/register-core.js.
const LIMITS = {
  name: { signup: 20, ip: 60 },     // display names tried (each reads every username once, for the look-alike rule)
  handoff: { signup: 10, ip: 30 },  // codes made (a relay code counts per sign-up only: strangers share one relay exit)
  info: { ip: 60 },                 // codes looked at
  claim: { ip: 30 },                // codes tried (a code is 192 random bits: this only keeps the noise down)
};
const badJson = () => json({ ok: false, error: "bad_json" }, 400);
const answer = (out, extra = []) => json(out.body, out.status, out.cookies || extra.length ? { "Set-Cookie": [...(out.cookies || []), ...extra] } : {});
const ready = (row) => { const nr = notReady(row); return nr ? json({ ok: false, error: nr.error }, nr.status) : null; };
/** A short handle on a code (a prefix of its stored hash), so Safari can ask what became of it. */
const codeRef = (id) => String(id).slice(0, 12);

/* ---------------- 2b. the optional display name ---------------- */

/**
 * POST /api/signup/name { displayName } → { ok, state }: the handle the account gets (else one is made up at registration, as today). The
 * username rules of the Profile (src/me.js handleUsername): 3 to 20 characters, a letter first; not the project or its staff
 * (username_reserved); not anyone's name in any casing (username_taken) nor a look-alike of one (username_similar). "" or null clears it.
 * The name is checked again when the account is made: one taken in between answers username_taken then.
 */
async function handleName(request, env, x) {
  const c = await needSignup(request, env, x.now);
  if (c.error) return c.error;
  const body = await readJson(request);
  if (!body) return badJson();
  const over = await limited(env, x.now, [
    await perHour(env, "rnms", c.row.id, LIMITS.name.signup),
    await perHour(env, "rnmi", clientKey(request), LIMITS.name.ip),
  ]);
  if (over) return over;
  const raw = body.displayName;
  let name = null;
  if (raw != null && raw !== "") {
    name = typeof raw === "string" ? raw.trim() : "";
    if (!validUsername(name)) return json({ ok: false, error: "bad_username" }, 400);
    if (reservedUsername(name, brandReserve(env))) return json({ ok: false, error: "username_reserved" }, 400);
    if (await env.DB.prepare("SELECT id FROM users WHERE lower(handle) = lower(?)").bind(name).first()) return json({ ok: false, error: "username_taken" }, 409);
    const skeleton = nameSkeleton(name);
    const others = (await env.DB.prepare("SELECT handle FROM users WHERE handle IS NOT NULL").all()).results;
    if (others.some((o) => nameSkeleton(o.handle) === skeleton)) return json({ ok: false, error: "username_similar" }, 409);
  }
  const r = await env.DB.prepare("UPDATE signups SET display_name = ? WHERE id = ? AND expires_at > ?").bind(name, c.row.id, iso(x.now)).run();
  if (!r.meta.changes) return json({ ok: false, error: "no_signup" }, 401);
  return c.reply({ ok: true, state: registerState(await reload(env, c.row.id)) });
}

/* ---------------- 3. this browser's own wallet ---------------- */

/**
 * POST /api/signup/wallet { challengeId, address, message, signature, inApp?, app? }: the register challenge this browser asked for (its ref
 * names this sign-up and its city), signed by the wallet; the connection must still match the location step (src/signup-finish.js
 * recheckLocation: on a mismatch only the location is forgotten, 403 location_unverified). Then the batch (src/register-core.js register).
 * Refusals besides the batch's: 409 location_required, terms_required (the order is the server's), 403 wrong_signup (a challenge issued for
 * another sign-up, city, hand-off or pairing), and every src/challenge.js checkChallenge refusal (wrong_purpose, wrong_wallet, expired...).
 */
async function handleWallet(request, env, x) {
  const c = await needSignup(request, env, x.now);
  if (c.error) return c.error;
  const body = await readJson(request);
  if (!body) return badJson();
  const notYet = ready(c.row);
  if (notYet) return notYet;
  const served = servedHost(env, request);
  const chk = await checkChallenge(env, body, { served, purposes: ["register"], now: x.now });
  if (chk.error) return chk.error;
  const ref = parseRef(chk.row.ref);
  if (!ref || ref.kind !== "s" || ref.signupId !== c.row.id || ref.city !== c.row.loc_city) return json({ ok: false, error: "wrong_signup" }, 403);
  if (!(await recheckLocation(env, c.row, x.cf))) {
    await forgetLocation(env, c.row.id);
    return json({ ok: false, error: "location_unverified" }, 403);
  }
  const gate = await challengeGate(env.DB, chk.row, c.row.id, c.row.loc_city, x.now);
  return answer(await register(env, request, { signup: c.row, city: c.row.loc_city, wallet: chk.row.wallet, gate, here: body.inApp === true, app: appOf(body.app), now: x.now }));
}

/* ---------------- 3'. the register hand-off: Safari or Chrome → the wallet app's browser ---------------- */

/**
 * POST /api/signup/handoff { app? }: the code that opens registration inside the wallet app `app` (a known wallet id). Only once the
 * location and the Terms are done (409 location_required, terms_required). On an ordinary connection the code is bound to it; behind a relay
 * (iCloud Private Relay, WARP: their own network numbers) with a known country, for a wallet app with a real app link, it is a relay code
 * bound to the country instead, to be opened within 2 minutes (relay: true, openBy); otherwise 409 handoff_relay (the page offers the
 * pairing). One live code per sign-up: a new one replaces the one before. It lives five minutes (policy identity.handoff_seconds).
 */
async function handleHandoffStart(request, env, x) {
  const c = await needSignup(request, env, x.now);
  if (c.error) return c.error;
  const notYet = ready(c.row);
  if (notYet) return notYet;
  const body = (await readJson(request)) || {};
  let relay = false, country = null;
  if (isRelayNetwork(x.cf)) {
    country = relayCountry(x.cf);
    if (!carryRelayOn(env) || !relayAsn(x.cf) || !country || !UL_APPS.has(appOf(body.app))) return json({ ok: false, error: "handoff_relay" }, 409);
    relay = true;
  }
  const over = await limited(env, x.now, [
    await perHour(env, "rhos", c.row.id, LIMITS.handoff.signup),
    ...(relay ? [] : [await perHour(env, "rhoi", clientKey(request), LIMITS.handoff.ip)]),
  ]);
  if (over) return over;
  const code = randomToken(24), id = await sha256(code), until = x.now + IDENTITY_POLICY.handoffSeconds * 1000, served = servedHost(env, request);
  if (served.bound) await ensureHostSchema(env.DB, "handoffs"); // handoffs.host (src/hostbind.js)
  const host = hostWrite(env.DB, "handoffs", id, served);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM handoffs WHERE kind = 'register' AND ((signup_id = ? AND (result IS NULL OR result IN ('opened', 'contested'))) OR expires_at < ?)").bind(c.row.id, iso(x.now)),
    env.DB.prepare("INSERT INTO handoffs (id, kind, user_id, signup_id, purpose, net, country, bind, created_at, expires_at) VALUES (?, 'register', NULL, ?, 'register', ?, ?, ?, ?, ?)")
      .bind(id, c.row.id, relay ? "relay" : await carryNet(env, request), country, bindOf(c.row), iso(x.now), iso(until)),
    ...(host ? [host] : []), // (while the host binding counts: the code is good on this host only)
  ]);
  // the link the wallet app opens: the allowlist entry's origin (src/hostbind.js), the code in the fragment (never sent to this site's server;
  // "Open app" wraps it in the wallet vendor's universal link, whose server can see it when the app does not take the link: SEC-8)
  return c.reply({ ok: true, code, pin: await registerPin(code), ref: codeRef(id), url: `${served.origin}/connect#register=${code}`, expiresAt: iso(until),
    ...(relay ? { relay: true, openBy: iso(x.now + RELAY_OPEN_MS) } : {}) });
}

/**
 * POST /api/signup/handoff/info { code, opener? }: what the wallet app's page shows before anything happens: the check number Safari shows and
 * the city and country being registered (nothing else about anyone), the Terms version already accepted, when the code ends. The first
 * browser that asks becomes the code's only opener, atomically and only after every check passed (its nonce: the __Host-vlo cookie and
 * `opener` in the answer, for wallet browsers that drop cookies). Refusals: src/register-core.js usableHandoff.
 */
async function handleHandoffInfo(request, env, x) {
  const body = await readJson(request);
  if (!body) return badJson();
  const over = await limited(env, x.now, [await perHour(env, "rhvi", clientKey(request), LIMITS.info.ip)]);
  if (over) return over;
  const nonces = presented(request, body.opener);
  const h = await usableHandoff(env, request, body.code, x.now, x.cf, "open", nonces);
  if (h.error) return h.error;
  const mine = nonces[0] || randomToken(24);
  if (!h.row.opener) {
    const oh = await openerHash(mine);
    const bound = await env.DB.prepare(`UPDATE handoffs SET opener = ?1, result = COALESCE(result, 'opened') WHERE id = ?2 AND opener IS NULL AND (result IS NULL OR result = 'opened')
        AND expires_at > ?3 AND (net <> 'relay' OR created_at > ?4)`).bind(oh, h.row.id, iso(x.now), iso(x.now - RELAY_OPEN_MS)).run();
    if (bound.meta.changes !== 1) {
      const now = await env.DB.prepare("SELECT opener FROM handoffs WHERE id = ?").bind(h.row.id).first();
      if (!now || !now.opener) return json({ ok: false, error: "code_expired", ...(h.relay ? { relay: true } : {}) }, 410);
      if (now.opener !== oh) { // another browser was faster by a hair: two openers mean the link is out
        await env.DB.prepare("UPDATE handoffs SET result = 'contested' WHERE id = ? AND result = 'opened'").bind(h.row.id).run();
        return json({ ok: false, error: "contested" }, 403);
      }
    }
  }
  return json({ ok: true, pin: await registerPin(body.code), community: { name: h.bind.name, country: h.bind.country }, terms: h.signup.terms_version,
    expiresAt: h.row.expires_at, relay: h.relay, opener: mine }, 200, { "Set-Cookie": cookie(OPENER_COOKIE, mine, IDENTITY_POLICY.handoffSeconds) });
}

/**
 * POST /api/signup/handoff/claim { code, opener?, challengeId, address, message, signature, app? }: the browser that opened the code, after
 * the wallet signed a register challenge issued for this code (ref "h:<hand-off>"; another challenge: 403 wrong_signup). The claimer's
 * connection must pass the location rule (src/register-core.js handoffLocationOk; 403 location_unverified, nothing used). Then one batch:
 * the challenge and the code are used up, the account is made from the sign-up that made the code (or the wallet's existing account is
 * returned), and this browser gets its own 30-day session, made by the wallet in its own browser (renewed while used).
 */
async function handleHandoffClaim(request, env, x) {
  const body = await readJson(request);
  if (!body) return badJson();
  const over = await limited(env, x.now, [await perHour(env, "rhci", clientKey(request), LIMITS.claim.ip)]);
  if (over) return over;
  const h = await usableHandoff(env, request, body.code, x.now, x.cf, "use", presented(request, body.opener));
  if (h.error) return h.error;
  const served = servedHost(env, request);
  const chk = await checkChallenge(env, body, { served, purposes: ["register"], now: x.now });
  if (chk.error) return chk.error;
  if (chk.row.ref !== handoffRef(h.row.id)) return json({ ok: false, error: "wrong_signup" }, 403);
  if (!(await handoffLocationOk(env, h, x.cf))) return json({ ok: false, error: "location_unverified" }, 403);
  const gate = await handoffGate(env.DB, chk.row, h.row, h.signup.id, h.bind.city, chk.row.wallet, x.now);
  const out = await register(env, request, { signup: h.signup, city: h.bind.city, wallet: chk.row.wallet, gate, here: true, app: appOf(body.app), now: x.now });
  return answer(out, out.body.ok ? [cookie(OPENER_COOKIE, "", 0)] : []);
}

/**
 * POST /api/signup/handoff/status { ref }: Safari (its `vsu` cookie: the sign-up that made the code, even after the registration ended it)
 * asks what became of its code: waiting (nobody opened it yet), opened (the wallet app has it), registered (the account exists: Safari says
 * "registered in the wallet app; sign in with your wallet here too": no session moves between browsers), contested (two browsers opened it:
 * make a new one), refused (opened from another connection: the pairing is the way), expired (unknown, replaced or out of time).
 */
async function handleHandoffStatus(request, env, x) {
  const body = await readJson(request);
  if (!body) return badJson();
  const token = getCookie(request, SIGNUP_COOKIE);
  if (!token || token.length > 100 || typeof body.ref !== "string" || !/^[A-Za-z0-9_-]{12}$/.test(body.ref)) return json({ ok: true, status: "expired" });
  // (SELECT *: handoffs.host exists only once the host binding has counted; a row without it reads as vicinity.city: src/hostbind.js)
  const rows = (await env.DB.prepare("SELECT * FROM handoffs WHERE kind = 'register' AND signup_id = ?").bind(await sha256(token)).all()).results;
  const row = rows.find((r) => codeRef(r.id) === body.ref && onThisHost(servedHost(env, request), r.host));
  if (!row) return json({ ok: true, status: "expired" });
  if (row.result === "registered") return json({ ok: true, status: "registered" });
  if (!(Date.parse(row.expires_at) > x.now)) return json({ ok: true, status: "expired" });
  if (row.result === "contested") return json({ ok: true, status: "contested" });
  if (row.result === "opened") return json({ ok: true, status: "opened" });
  return json({ ok: true, status: row.refused_at ? "refused" : "waiting" });
}

/* ---------------- routing ---------------- */

const ROUTES = {
  "/api/signup/start": ["POST", handleStart],
  "/api/signup/state": ["GET", handleState],
  "/api/signup/location": ["POST", handleLocation],
  "/api/signup/location/choice": ["POST", handleChoice],
  "/api/signup/terms": ["POST", handleTerms],
  "/api/signup/name": ["POST", handleName],
  "/api/signup/wallet": ["POST", handleWallet],
  "/api/signup/handoff": ["POST", handleHandoffStart],
  "/api/signup/handoff/info": ["POST", handleHandoffInfo],
  "/api/signup/handoff/claim": ["POST", handleHandoffClaim],
  "/api/signup/handoff/status": ["POST", handleHandoffStatus],
};

/** The registration routes (src/index.js calls this only while WALLET_ONLY counts). x = { fetchImpl, ctx, now, cf }. */
export async function routeRegister(request, env, fetchImpl = fetch, ctx = null, now = Date.now()) {
  const route = ROUTES[new URL(request.url).pathname];
  if (!route) return json({ error: "not_found" }, 404); // the retired sign-up routes too, before any method check: nothing can be probed
  if (request.method !== route[0]) return json({ error: "method_not_allowed" }, 405);
  const blocked = await guardV2(request, env);
  if (blocked) return blocked;
  try { await ensureRegisterSchema(env.DB); }
  catch (e) {
    console.error("registration tables unavailable", String((e && e.message) || e).slice(0, 80));
    return json({ ok: false, error: "signup_unavailable" }, 503);
  }
  return route[1](request, env, { fetchImpl, ctx, now, cf: request.cf });
}
