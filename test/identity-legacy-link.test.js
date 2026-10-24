// The legacy link window (Citycoin.dev master v5, stage S14; master section 05 BR-03 "Where legacy users have only Google/email records,
// preserve data but do not infer a wallet from an email or auto-merge. Use the already verified wallet mapping or authenticated legacy-link
// evidence; mark unresolved ownership as a specific migration case. Do not restore Google as the new dashboard login path", section 18 WP-02
// "An unlinked legacy record cannot grant a wallet someone else's dashboard"; acceptance A14 (identity part) and D04; R1-04; src/legacy.js).
// LEGACY_LINK=on with LEGACY_LINK_UNTIL, under WALLET_ONLY: a Google- or e-mail-only member logs in once in the legacy form, gets a restricted
// 15-minute session that can only ask a legacy_link challenge and link a wallet to that same account (never the dashboard, never any other
// route), a wallet that already has an account is refused, nothing is matched by e-mail, legacy_state is recorded; after LEGACY_LINK_UNTIL the
// routes answer 410 and the accounts still without a wallet become closed_unresolved, their data kept (only once a window was recorded open:
// review finding SEC-4; a later window opens them again). With the switches unset: today's site. WALLET_ONLY set but refused fails closed, and an
// error in another input never brings Google back (review finding SEC-1). Fake wallets and a fake Google only.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as W from "./helpers/world.js";
import { handleApi } from "../src/index.js";
import { fakeGoogle, member, memberWithWallet, one, outbox, rows, userOf } from "./helpers/signup.js";
import { _resetPolicyCheck, checkPolicyConfig, legacyLink, legacyLinkRefusals, legacyLinkUntil, walletOnly } from "../src/v5policy.js";
import { pageLegacyLink } from "../scripts/pages/build.mjs";
import { sha256 } from "../src/http.js";
import { readFileSync } from "node:fs";

beforeEach(() => { W.useClock("2026-10-24T12:00:00Z"); _resetPolicyCheck(); });
after(() => W.realClock());

const UNTIL = "2026-12-01T00:00:00Z", UNTIL_ISO = "2026-12-01T00:00:00.000Z";
const WALLET = Object.freeze({ WALLET_ONLY: "on", DEPLOYMENT_ENV: "test", SITE_ORIGIN: W.ORIGIN, SITE_ORIGINS: W.ORIGIN });
const LEGACY = Object.freeze({ ...WALLET, LEGACY_LINK: "on", LEGACY_LINK_UNTIL: UNTIL });
const on = (env, extra = LEGACY) => Object.assign(env, extra);
const answer = async (res) => [res.status, await res.json()];
const count = async (env, sql) => (await one(env.DB, `SELECT COUNT(*) AS n FROM ${sql}`)).n;
const hasColumn = async (env, table, col) => (await rows(env.DB, `PRAGMA table_info(${table})`)).some((c) => c.name === col);
const cookieOf = (res, name = "vs") => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) || null;

/** Today's population, made by today's sign-up before the switch: two members with a wallet (M1), the Google-only member (M3), an e-mail-only one. */
async function population(env, box) {
  const a = await memberWithWallet(env, box, { via: "google" });
  const b = await memberWithWallet(env, box, { via: "email" });
  const g = await member(env, box, { via: "google" });
  const e = await member(env, box, { via: "email" });
  for (const [m, text] of [[a, "hello from a"], [g, "hello from g"]]) {
    const post = await m.b.post("/api/posts", { kind: "talk", body: text });
    assert.equal(post.ok, true, JSON.stringify(post));
  }
  return { a, b, g, e };
}
/** The legacy Google log-in, in the legacy form only /connect?mode=legacy asks for: where Google's answer lands, and the restricted session's cookie. */
async function googleLegacy(br, sub) {
  const st = await br.send("/api/auth/google/start?legacy=1");
  assert.equal(st.status, 302);
  const state = new URL(st.headers.get("location")).searchParams.get("state");
  const cb = await br.send(`/api/auth/google/callback?code=c&state=${state}`, { fetchImpl: fakeGoogle(sub) });
  return { cb, to: cb.headers.get("location"), cookie: cookieOf(cb) };
}
/** The legacy e-mail log-in: the code from the mailbox, then the verify answer. */
async function emailLegacy(br, box, email) {
  const s = await br.send("/api/auth/email/start", { method: "POST", body: { email, legacy: true }, fetchImpl: box.fetch });
  assert.deepEqual(await s.json(), { ok: true });
  const code = box.codeFor(email);
  return br.send("/api/auth/email/verify", { method: "POST", body: { email, code, legacy: true } });
}
async function legacySigned(br, w, extra = {}) {
  const c = await br.post("/api/auth/challenge", { purpose: "legacy_link", address: w.address, ...extra });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message), statement: c.statement };
}
const link = async (br, w) => { const { statement, ...body } = await legacySigned(br, w); return br.send("/api/me/wallet/link", { method: "POST", body }); };
async function walletSignIn(br, w) {
  const c = await br.post("/api/auth/challenge", { purpose: "login", address: w.address });
  return br.post("/api/auth/wallet", { challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message) });
}
/** Every column of a users row but the ones a legacy link writes (and the badge text /api/me refreshes). */
const kept = (u) => { const { wallet, wallet_at, wallet_via, wallet_app, legacy_state, badges, ...rest } = u; return rest; };

/* ---------------------------------------------------------------- the switch */

test("the window: open only under WALLET_ONLY with LEGACY_LINK on and LEGACY_LINK_UNTIL ahead; closed once that instant has passed; otherwise off", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const cases = [
    [{}, "off", ["LEGACY_LINK_WALLET_ONLY_OFF"]],
    [{ LEGACY_LINK: "on", LEGACY_LINK_UNTIL: UNTIL }, "off", ["LEGACY_LINK_WALLET_ONLY_OFF", "LEGACY_LINK_POLICY_REFUSED"]], // no WALLET_ONLY
    // LEGACY_LINK_UNTIL missing or malformed: only the window is refused; wallet-only sign-in still counts (review finding SEC-1)
    [{ ...WALLET, LEGACY_LINK: "on" }, "off", ["LEGACY_LINK_POLICY_REFUSED"]],
    [{ ...WALLET, LEGACY_LINK: "on", LEGACY_LINK_UNTIL: "1 December" }, "off", ["LEGACY_LINK_POLICY_REFUSED"]],
    [{ ...WALLET, LEGACY_LINK: "on", LEGACY_LINK_UNTIL: UNTIL, DEPLOYMENT_ENV: "" }, "off", ["LEGACY_LINK_WALLET_ONLY_OFF"]], // WALLET_ONLY held
    [{ ...LEGACY, OFFICIAL_X_URL: "x.com/citycoin" }, "open", []],                                   // another input's error: not the window's
    [{ ...LEGACY, MAIN_TOKEN_MINT: "not-a-mint" }, "open", []],
    [LEGACY, "open", []],
    [{ ...LEGACY, LEGACY_LINK: " ON " }, "open", []],
    [{ ...LEGACY, LEGACY_LINK: "true" }, "off", null],                                              // not "on": the window is not asked for
    [{ ...LEGACY, LEGACY_LINK_UNTIL: "2026-10-24T11:59:59Z" }, "closed", ["LEGACY_LINK_UNTIL_PASSED"]], // a date in the past never opens it
    [{ ...WALLET, LEGACY_LINK_UNTIL: "2026-10-01" }, "off", null],                                  // a date alone is no window, open or closed (SEC-4)
    [{ ...WALLET, LEGACY_LINK_UNTIL: UNTIL }, "off", null],                                         // a date alone opens nothing
  ];
  for (const [env, state, refusals] of cases) {
    _resetPolicyCheck();
    assert.equal(legacyLink(env, now).state, state, JSON.stringify(env));
    if (refusals) assert.deepEqual(legacyLinkRefusals(env, now), refusals, JSON.stringify(env));
  }
  assert.deepEqual(legacyLink(LEGACY, now), { state: "open", until: UNTIL_ISO });
  // a bare date closes the window at the START of that day (UTC): the pages show the exact instant
  assert.equal(new Date(legacyLinkUntil({ LEGACY_LINK_UNTIL: "2026-12-31" })).toISOString(), "2026-12-31T00:00:00.000Z");
  assert.equal(legacyLink({ ...LEGACY, LEGACY_LINK_UNTIL: "2026-12-31" }, Date.parse("2026-12-30T23:59:59Z")).state, "open");
  assert.equal(legacyLink({ ...LEGACY, LEGACY_LINK_UNTIL: "2026-12-31" }, Date.parse("2026-12-31T00:00:00Z")).state, "closed");
  for (const bad of ["", "  ", "soon", "2026-13-45", "2026-12-01 10:00", 20261201]) assert.equal(legacyLinkUntil({ LEGACY_LINK_UNTIL: bad }), null, String(bad));
  // anything odd reads as off, never throws
  assert.equal(legacyLink(null).state, "off");
  assert.equal(legacyLink({ get WALLET_ONLY() { throw new Error("x"); } }).state, "off");
});

test("a refused or closed window says why once per isolate (codes only, never a value); unset logs nothing", () => {
  const lines = [], log = (...a) => lines.push(a.join(" "));
  checkPolicyConfig({}, { log });
  assert.deepEqual(lines, []);
  checkPolicyConfig({ ...WALLET, LEGACY_LINK: "on" }, { log });
  checkPolicyConfig({ ...WALLET, LEGACY_LINK: "on" }, { log });
  assert.ok(!lines.includes("legacy link switch refused LEGACY_LINK_WALLET_ONLY_OFF"), "wallet-only still counts: only the window is refused (SEC-1)");
  assert.ok(lines.includes("legacy link switch refused LEGACY_LINK_POLICY_REFUSED"), lines.join("\n"));
  assert.ok(!lines.some((l) => l.startsWith("wallet-only switch refused")), "a LEGACY_LINK error never refuses WALLET_ONLY");
  assert.ok(lines.includes("policy config refused MISSING_LEGACY_LINK_UNTIL deployment.inputs.LEGACY_LINK_UNTIL"));
  assert.equal(lines.filter((l) => l === "legacy link switch refused LEGACY_LINK_POLICY_REFUSED").length, 1, "once per isolate");
  _resetPolicyCheck(); lines.length = 0;
  checkPolicyConfig({ ...LEGACY, LEGACY_LINK_UNTIL: "2026-10-01T00:00:00Z" }, { log });
  assert.deepEqual(lines, ["legacy link switch refused LEGACY_LINK_UNTIL_PASSED"]);
  _resetPolicyCheck(); lines.length = 0;
  checkPolicyConfig(LEGACY, { log });
  assert.deepEqual(lines, [], "an open window logs nothing");
});

test("the page build refuses LEGACY_LINK=on in wrangler.jsonc unless the Worker would open the window (missing, malformed or past date, no wallet-only)", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  assert.deepEqual(pageLegacyLink({}, now), { legacyLink: false });
  // a past date stops the build whatever LEGACY_LINK says (review finding SEC-4); a future one alone has nothing to refuse
  assert.throws(() => pageLegacyLink({ LEGACY_LINK_UNTIL: "2026-10-01" }, now), /LEGACY_LINK_UNTIL in wrangler\.jsonc is in the past \(LEGACY_LINK_UNTIL_PASSED\)/);
  assert.throws(() => pageLegacyLink({ ...WALLET, LEGACY_LINK_UNTIL: "2025-12-01" }, now), /LEGACY_LINK_UNTIL_PASSED/);
  assert.deepEqual(pageLegacyLink({ LEGACY_LINK_UNTIL: UNTIL }, now), { legacyLink: false });
  assert.deepEqual(pageLegacyLink(LEGACY, now), { legacyLink: true, until: UNTIL_ISO });
  for (const [vars, code] of [[{ ...LEGACY, LEGACY_LINK_UNTIL: "" }, "MISSING_LEGACY_LINK_UNTIL"], [{ ...LEGACY, LEGACY_LINK_UNTIL: "next month" }, "LEGACY_LINK_UNTIL_INVALID"],
    [{ ...LEGACY, LEGACY_LINK_UNTIL: "2026-10-24T11:00:00Z" }, "LEGACY_LINK_UNTIL_PASSED"], [{ LEGACY_LINK: "on", LEGACY_LINK_UNTIL: UNTIL }, "LEGACY_LINK_WITHOUT_WALLET_ONLY"],
    [{ ...LEGACY, DEPLOYMENT_ENV: "" }, "ENVIRONMENT_UNSET"]]) {
    assert.throws(() => pageLegacyLink(vars, now), new RegExp(`LEGACY_LINK=on in wrangler\\.jsonc .*${code}`), JSON.stringify(vars));
  }
  // the committed wrangler.jsonc sets neither name
  const vars = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.ok(!/"LEGACY_LINK"|"LEGACY_LINK_UNTIL"|"WALLET_ONLY"/.test(vars));
});

/* ---------------------------------------------------------------- the switches off: today's site */

test("switches off, or LEGACY_LINK set without WALLET_ONLY: the legacy forms are today's routes, /api/me has no new key, and no column is added", async () => {
  for (const extra of [{}, { LEGACY_LINK: "on", LEGACY_LINK_UNTIL: UNTIL }, { LEGACY_LINK: "on" }]) {
    _resetPolicyCheck();
    const env = W.V2(), box = outbox();
    const { g, e } = await population(env, box);
    on(env, extra);
    const br = W.browser(env);
    // Google with ?legacy=1 is today's log-in (the parameter means nothing): today's cookie marker, and the Google-only member is signed in fully
    const st = await br.send("/api/auth/google/start?legacy=1");
    assert.ok(/^vo=google\.[^.]+\.[^.;]+;/.test(cookieOf(st, "vo")), `${JSON.stringify(extra)}: no legacy marker`);
    const r = await googleLegacy(br, g.sub);
    assert.equal(r.to, "/dashboard", JSON.stringify(extra));
    assert.equal((await br.get("/api/me?lite=1")).signedIn, true);
    // the e-mail code route with { legacy: true } is today's sign-in
    const v = await emailLegacy(W.browser(env), box, e.email);
    assert.deepEqual((await v.json()).next, "/dashboard");
    const me = await br.get("/api/me");
    assert.equal("legacyLink" in me, false); assert.equal("walletOnly" in me, false);
    assert.equal(await hasColumn(env, "users", "legacy_state"), false, JSON.stringify(extra));
    assert.equal((await rows(env.DB, "SELECT id FROM schema_migrations WHERE id LIKE '%legacy%'")).length, 0);
  }
});

test("WALLET_ONLY alone: every legacy form answers what an unknown path answers (the S10 404), a legacy_link challenge is bad_purpose, no column is added", async () => {
  const env = W.V2(), box = outbox();
  const { g, e } = await population(env, box);
  on(env, WALLET);
  const br = W.browser(env), unknown = async (method, body) => { const r = await br.send("/api/no-such-route-zq", { method, body }); return [r.status, await r.text()]; };
  for (const [path, method, body] of [["/api/auth/google/start?legacy=1", "GET"], ["/api/auth/google/callback?code=c&state=s", "GET"],
    ["/api/auth/email/start", "POST", { email: e.email, legacy: true }], ["/api/auth/email/verify", "POST", { email: e.email, code: "123456", legacy: true }],
    ["/api/me/wallet/link", "POST", {}], ["/api/me/wallet/link", "GET"], ["/api/me/wallet/carry", "POST", {}], ["/api/me/wallet/carry/info", "POST", {}],
    ["/api/me/wallet/carry/claim", "POST", {}], ["/api/me/wallet/carry/status", "GET"], ["/api/me/wallet/disown", "POST", {}]]) {
    const r = await br.send(path, { method, body });
    assert.deepEqual([r.status, await r.text()], await unknown(method, body), `${method} ${path}`);
  }
  const w = await W.wallet();
  assert.deepEqual(await answer(await br.send("/api/auth/challenge", { method: "POST", body: { purpose: "legacy_link", address: w.address } })), [400, { ok: false, error: "bad_purpose" }]);
  assert.deepEqual(await answer(await br.send("/api/pair", { method: "POST", body: { purpose: "link" } })), [400, { ok: false, error: "bad_request" }]);
  assert.equal("legacyLink" in (await br.get("/api/me")), false);
  assert.equal(await hasColumn(env, "users", "legacy_state"), false);
  assert.equal((await userOf(env, g)).wallet, null);
});

/* ---------------------------------------------------------------- in the window */

test("in the window (Google): the Google-only member logs in once, gets a restricted 15-minute session, links a wallet, then signs in with it to the same account", async () => {
  const env = W.V2(), box = outbox();
  const { a, b, g } = await population(env, box);
  const before = await userOf(env, g);
  const postsBefore = await rows(env.DB, "SELECT * FROM posts ORDER BY id");
  on(env);
  const br = W.browser(env);
  // the page learns of the window from /api/me (signed out or in)
  assert.deepEqual((await br.get("/api/me")).legacyLink, { open: true, until: UNTIL_ISO });
  const r = await googleLegacy(br, g.sub);
  assert.equal(r.to, "/connect?mode=legacy&legacy=signed_in");
  assert.match(r.cookie, /^vs=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=900$/);
  assert.ok(r.cb.headers.getSetCookie().includes("vo=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"));
  const row = await one(env.DB, "SELECT * FROM sessions WHERE id = ?", await sha256(br.jar.get("vs")));
  // (proof 'legacy_link': src/auth.js getSession refuses the row by it whatever WALLET_ONLY says, review finding SEC-1)
  assert.deepEqual({ ...row, id: "x" }, { id: "x", wallet: null, user_id: before.id, proof: "legacy_link", created_at: "2026-10-24T12:00:00.000Z", expires_at: "2026-10-24T12:15:00.000Z",
    proven_at: null, made_by: null, host: "vicinity.test", auth: "legacy_link" });
  // the census was written once, into the new column: M1 wallet_linked, the Google- and e-mail-only accounts legacy_unlinked
  assert.deepEqual(await rows(env.DB, "SELECT id, legacy_state FROM users ORDER BY id"), [
    { id: (await userOf(env, a)).id, legacy_state: "wallet_linked" }, { id: (await userOf(env, b)).id, legacy_state: "wallet_linked" },
    { id: before.id, legacy_state: "legacy_unlinked" }, { id: before.id + 1, legacy_state: "legacy_unlinked" }]);
  // the restricted session is signed out everywhere else: no dashboard
  assert.equal((await br.get("/api/me")).signedIn, false);
  // its one job: a challenge naming this account, then the link
  const w = await W.wallet();
  const s = await legacySigned(br, w);
  assert.equal(s.statement, `Link this wallet to my existing Vicinity account @${before.handle}. Free, not a transaction, cannot move funds.`);
  assert.match(s.message, /\nRequest ID: legacy_link$/);
  const { statement, ...body } = s;
  const res = await br.send("/api/me/wallet/link", { method: "POST", body });
  assert.deepEqual(await answer(res), [200, { ok: true, linked: true, wallet: w.address, next: "/connect?mode=login" }]);
  assert.deepEqual(res.headers.getSetCookie(), ["vs=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"], "the restricted session ends with the link");
  assert.equal(await one(env.DB, "SELECT id FROM sessions WHERE id = ?", row.id), null);
  const now = await userOf(env, g);
  assert.deepEqual([now.wallet, now.wallet_via, now.wallet_at, now.legacy_state], [w.address, "legacy", "2026-10-24T12:00:00.000Z", "linked_in_window"]);
  assert.deepEqual(kept(now), kept(before), "nothing else of the account changed: its city, name, handle, Terms receipt and login identifier stay");
  assert.deepEqual(await rows(env.DB, "SELECT * FROM posts ORDER BY id"), postsBefore, "every post stays");
  // the dashboard opens only after a wallet sign-in, to the same account
  assert.deepEqual(await walletSignIn(br, w), { ok: true, wallet: w.address, next: "/dashboard" });
  const me = await br.get("/api/me?lite=1");
  assert.deepEqual([me.signedIn, me.user.id, me.user.handle], [true, before.id, before.handle]);
  // the same restricted session cannot be used again, and a second log-in of the now linked account is refused (use the wallet)
  assert.deepEqual(await answer(await W.browser(env).send("/api/me/wallet/link", { method: "POST", body })), [401, { ok: false, error: "legacy_sign_in" }]);
  assert.equal((await googleLegacy(W.browser(env), g.sub)).to, "/connect?mode=legacy&error=use_wallet");
});

test("in the window (e-mail): the code is filed under its own name and mailed only to an e-mail account's login address; the contact e-mail never logs in", async () => {
  const env = W.V2(), box = outbox();
  const { g, e } = await population(env, box);
  const m2 = await member(env, box, { via: "email" }), withWallet = await memberWithWallet(env, box, { via: "email" });
  // the Google-only member's contact e-mail (verified or not) is never a way into any account
  await env.DB.prepare("UPDATE users SET contact_email = 'g-contact@example.com' WHERE id = ?").bind((await userOf(env, g)).id).run();
  on(env);
  const br = W.browser(env);
  const sent = box.sent.length;
  for (const email of ["nobody-zq@example.com", "g-contact@example.com"]) {
    const s = await br.send("/api/auth/email/start", { method: "POST", body: { email, legacy: true }, fetchImpl: box.fetch });
    assert.deepEqual(await answer(s), [200, { ok: true }], "the same answer for any address");
  }
  assert.equal(box.sent.length, sent, "no mail to an address no e-mail account logs in with");
  assert.ok(await one(env.DB, "SELECT email FROM email_codes WHERE email = 'legacy@nobody-zq@example.com'"), "the same database work");
  assert.deepEqual(await answer(await br.send("/api/auth/email/verify", { method: "POST", body: { email: "g-contact@example.com", code: "123456", legacy: true } })),
    [400, { ok: false, error: "code_wrong", left: 4 }]);
  // the e-mail-only member
  const v = await emailLegacy(br, box, e.email);
  assert.equal(box.last().to, e.email);
  assert.ok(await one(env.DB, "SELECT email FROM email_codes WHERE email = ?", `legacy@${e.email}`) === null, "the code is used up");
  const eu = await userOf(env, e);
  assert.deepEqual(await answer(v), [200, { ok: true, legacy: true, account: eu.handle, expiresAt: "2026-10-24T12:15:00.000Z", next: "/connect?mode=legacy" }]);
  assert.match(cookieOf(v), /Max-Age=900$/);
  assert.equal((await br.get("/api/me")).signedIn, false);
  const w = await W.wallet();
  assert.equal((await link(br, w)).status, 200);
  assert.deepEqual([(await userOf(env, e)).wallet, (await userOf(env, e)).legacy_state], [w.address, "linked_in_window"]);
  // the wrong code, and a code used twice
  const b2 = W.browser(env);
  await b2.send("/api/auth/email/start", { method: "POST", body: { email: m2.email, legacy: true }, fetchImpl: box.fetch });
  assert.deepEqual(await answer(await b2.send("/api/auth/email/verify", { method: "POST", body: { email: m2.email, code: "000000", legacy: true } })), [400, { ok: false, error: "code_wrong", left: 4 }]);
  const code = box.codeFor(m2.email);
  assert.equal((await b2.send("/api/auth/email/verify", { method: "POST", body: { email: m2.email, code, legacy: true } })).status, 200);
  assert.deepEqual(await answer(await b2.send("/api/auth/email/verify", { method: "POST", body: { email: m2.email, code, legacy: true } })), [400, { ok: false, error: "code_expired" }]);
  // an account that has a wallet: the code goes to its owner, and the answer says to use the wallet
  const vw = await emailLegacy(W.browser(env), box, withWallet.email);
  assert.deepEqual(await answer(vw), [409, { ok: false, error: "use_wallet" }]);
  assert.equal(cookieOf(vw), null);
});

test("wrong wallet: a challenge of one wallet signed by another, another session's challenge, a login challenge, and a member who has a wallet are all refused", async () => {
  const env = W.V2(), box = outbox();
  const { a, g, e } = await population(env, box);
  on(env);
  const gb = W.browser(env), eb = W.browser(env);
  await googleLegacy(gb, g.sub);
  await emailLegacy(eb, box, e.email);
  const w1 = await W.wallet(), w2 = await W.wallet();
  const c = await gb.post("/api/auth/challenge", { purpose: "legacy_link", address: w1.address });
  // signed by another wallet
  assert.deepEqual(await answer(await gb.send("/api/me/wallet/link", { method: "POST", body: { challengeId: c.challengeId, address: w1.address, message: c.message, signature: await w2.sign(c.message) } })),
    [401, { ok: false, error: "signature_mismatch" }]);
  // another wallet's address with this challenge
  assert.deepEqual(await answer(await gb.send("/api/me/wallet/link", { method: "POST", body: { challengeId: c.challengeId, address: w2.address, message: c.message, signature: await w2.sign(c.message) } })),
    [403, { ok: false, error: "wrong_wallet" }]);
  // a challenge the other member's restricted session asked for (it names that account): refused here, unused
  const foreign = await legacySigned(eb, w1);
  const { statement, ...fb } = foreign;
  assert.deepEqual(await answer(await gb.send("/api/me/wallet/link", { method: "POST", body: fb })), [403, { ok: false, error: "wrong_session" }]);
  assert.equal((await one(env.DB, "SELECT used_at FROM auth_challenges WHERE id = ?", foreign.challengeId)).used_at, null);
  // a login challenge is not a link
  const lc = await gb.post("/api/auth/challenge", { purpose: "login", address: w1.address });
  assert.deepEqual(await answer(await gb.send("/api/me/wallet/link", { method: "POST", body: { challengeId: lc.challengeId, address: w1.address, message: lc.message, signature: await w1.sign(lc.message) } })),
    [400, { ok: false, error: "wrong_purpose" }]);
  // and a legacy_link challenge never signs anyone in
  const lk = await legacySigned(gb, w1);
  const { statement: _s, ...lkb } = lk;
  assert.deepEqual(await answer(await gb.send("/api/auth/wallet", { method: "POST", body: lkb })), [400, { ok: false, error: "wrong_purpose" }]);
  // nothing was linked
  assert.equal((await userOf(env, g)).wallet, null); assert.equal((await userOf(env, e)).wallet, null);
  assert.equal(await count(env, `users WHERE wallet IN ('${w1.address}', '${w2.address}')`), 0);
  // a member who has a wallet cannot get a restricted session: sign in with the wallet
  const ar = await googleLegacy(W.browser(env), a.sub);
  assert.deepEqual([ar.to, ar.cookie], ["/connect?mode=legacy&error=use_wallet", null]);
  // nobody has this Google account: nothing is made
  const nr = await googleLegacy(W.browser(env), "g-nobody-zq");
  assert.deepEqual([nr.to, nr.cookie], ["/connect?mode=legacy&error=no_account&login=google", null]);
  assert.equal(await count(env, "sessions WHERE auth = 'legacy_link'"), 2);
});

test("wallet taken: a wallet that has an account is refused at once; one taken meanwhile is refused at the link; two accounts racing for one wallet: one wins", async () => {
  const env = W.V2(), box = outbox();
  const { a, g, e } = await population(env, box);
  on(env);
  const gb = W.browser(env), eb = W.browser(env);
  await googleLegacy(gb, g.sub);
  await emailLegacy(eb, box, e.email);
  // a's wallet (M1): refused before anything is signed
  assert.deepEqual(await answer(await gb.send("/api/auth/challenge", { method: "POST", body: { purpose: "legacy_link", address: a.w.address } })), [409, { ok: false, error: "wallet_taken" }]);
  // a wallet that gets an account between the challenge and the link (another member registers it): refused at the link, nothing changes
  const w = await W.wallet();
  const s = await legacySigned(gb, w);
  const { statement, ...body } = s;
  await env.DB.prepare("UPDATE users SET wallet = ? WHERE id = ?").bind(w.address, (await userOf(env, e)).id).run();
  assert.deepEqual(await answer(await gb.send("/api/me/wallet/link", { method: "POST", body })), [409, { ok: false, error: "wallet_taken" }]);
  assert.equal((await userOf(env, g)).wallet, null);
  assert.equal((await userOf(env, g)).legacy_state, "legacy_unlinked");
  assert.ok(gb.has("vs"), "the restricted session stays: another wallet may be tried");
  await env.DB.prepare("UPDATE users SET wallet = NULL WHERE id = ?").bind((await userOf(env, e)).id).run();
  // two restricted sessions, one wallet, at the same moment: exactly one account gets it
  const v = await W.wallet();
  const [sg, se] = [await legacySigned(gb, v), await legacySigned(eb, v)];
  const strip = ({ statement: _x, ...rest }) => rest;
  const [rg, re] = await Promise.all([gb.send("/api/me/wallet/link", { method: "POST", body: strip(sg) }), eb.send("/api/me/wallet/link", { method: "POST", body: strip(se) })]);
  const outcomes = [await answer(rg), await answer(re)].map(([st, d]) => (d.ok ? "linked" : `${st} ${d.error}`)).sort();
  assert.deepEqual(outcomes, ["409 wallet_taken", "linked"]);
  assert.equal(await count(env, `users WHERE wallet = '${v.address}'`), 1);
});

test("the restricted session reaches no route but its own: every /api route answers it exactly as a signed-out browser; it runs out after 15 minutes", async () => {
  const env = W.V2(), box = outbox();
  const { g } = await population(env, box);
  on(env);
  const legacy = W.browser(env, { ip: "198.51.100.7" });
  await googleLegacy(legacy, g.sub);
  const cookie = legacy.jar.get("vs");
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const own = new Set(["/api/auth/challenge", "/api/me/wallet/link", "/api/pair", "/api/pair/finish", "/api/auth/logout", "/api/auth/email/start", "/api/auth/email/verify",
    "/api/auth/google/start", "/api/auth/google/callback"]);
  const routes = [...new Set([...src.matchAll(/["'](\/api\/[a-z0-9/_-]+)["']/g)].map((m) => m[1]))].filter((r) => !own.has(r) && !r.endsWith("/")).sort();
  assert.ok(routes.length > 90, `${routes.length} routes`);
  const shape = async (res) => {
    const text = await res.text();
    let d = null; try { d = JSON.parse(text); } catch { /* not JSON */ }
    return [res.status, d && typeof d === "object" ? { error: d.error ?? null, signedIn: d.signedIn ?? null, ok: d.ok ?? null } : text.length];
  };
  let i = 0;
  for (const r of routes) for (const method of ["GET", "POST"]) {
    i++;
    const ip = `203.0.113.${(i % 250) + 1}`; // the same connection for both, a fresh one per route (attempt limits count alike)
    const body = method === "POST" ? {} : undefined;
    const anon = W.browser(env, { ip });
    const as = await shape(await anon.send(r, { method, body }));
    const lb = W.browser(env, { ip }); lb.jar.set("vs", cookie);
    const ls = await shape(await lb.send(r, { method, body }));
    assert.deepEqual(ls, as, `${method} ${r}`);
  }
  // the dashboard's own reads and writes: signed out
  assert.equal((await legacy.get("/api/me")).signedIn, false);
  for (const [path, body] of [["/api/posts", { kind: "talk", body: "x" }], ["/api/me/username", { username: "Zq_Name" }], ["/api/auth/reprove", {}], ["/api/home", {}],
    ["/api/me/terms", { version: "2026-10-01" }], ["/api/seats/apply", {}], ["/api/towns", { name: "Zq" }]]) {
    const res = await legacy.send(path, { method: body ? "POST" : "GET", body });
    assert.equal(res.status, 401, path);
  }
  assert.deepEqual(await legacy.get("/api/admin/me"), { ok: false, error: "sign_in" });
  // still its own job for 15 minutes, then nothing
  W.advance(14 * 60_000);
  assert.equal((await legacy.post("/api/auth/challenge", { purpose: "legacy_link", address: (await W.wallet()).address })).ok, true);
  W.advance(60_000);
  assert.deepEqual(await answer(await legacy.send("/api/auth/challenge", { method: "POST", body: { purpose: "legacy_link", address: (await W.wallet()).address } })),
    [401, { ok: false, error: "legacy_sign_in" }]);
  assert.equal((await userOf(env, g)).wallet, null);
});

test("a phone's wallet for the restricted session: a five-minute link pairing, approved with a legacy_link challenge naming the check number, finished by that session only", async () => {
  const env = W.V2(), box = outbox();
  const { a, g } = await population(env, box);
  on(env);
  const computer = W.browser(env), phone = W.browser(env);
  // without a restricted session there is no link pairing
  assert.deepEqual(await answer(await W.browser(env).send("/api/pair", { method: "POST", body: { purpose: "link" } })), [401, { ok: false, error: "legacy_sign_in" }]);
  await googleLegacy(computer, g.sub);
  const p = await computer.post("/api/pair", { purpose: "link" });
  assert.deepEqual(Object.keys(p).sort(), ["code", "expiresAt", "ok", "pin", "purpose", "url"]);
  assert.deepEqual([p.purpose, p.url, p.expiresAt], ["link", `${W.ORIGIN}/connect#pair=${p.code}`, "2026-10-24T12:05:00.000Z"]);
  const gu = await userOf(env, g);
  const st = await phone.post("/api/pair/status", { code: p.code });
  assert.deepEqual([st.status, st.purpose, st.pin, st.handle], ["waiting", "link", p.pin, `${gu.handle.slice(0, 2)}•••`]);
  // a wallet that has an account cannot be offered
  assert.deepEqual(await answer(await phone.send("/api/auth/challenge", { method: "POST", body: { purpose: "legacy_link", address: a.w.address, pair: p.code } })), [409, { ok: false, error: "wallet_taken" }]);
  const w = await W.wallet();
  // a login challenge cannot approve a link pairing
  const lc = await phone.post("/api/auth/challenge", { purpose: "login", address: w.address, pair: p.code });
  assert.deepEqual(lc, { ok: false, error: "pair_expired" });
  const s = await legacySigned(phone, w, { pair: p.code });
  assert.equal(s.statement, `Link this wallet to my existing Vicinity account @${gu.handle} on my other device (check number ${p.pin}). Free, not a transaction, cannot move funds.`);
  const { statement, ...body } = s;
  // a legacy_link challenge never approves a login pairing (its text names another pairing: bad_message), and it stays unused
  const login = await W.browser(env).post("/api/pair");
  assert.deepEqual(await answer(await phone.send("/api/auth/wallet", { method: "POST", body: { ...body, pair: login.code } })), [400, { ok: false, error: "bad_message" }]);
  assert.deepEqual(await phone.post("/api/auth/wallet", { ...body, pair: p.code }), { ok: true, paired: true });
  assert.equal(phone.has("vs"), false, "the phone is not signed in");
  // only the restricted session of the pairing's own account finishes it
  assert.deepEqual(await answer(await W.browser(env).send("/api/pair/finish", { method: "POST", body: { code: p.code } })), [410, { ok: false, status: "expired" }]);
  const fin = await computer.send("/api/pair/finish", { method: "POST", body: { code: p.code } });
  assert.deepEqual(await answer(fin), [200, { ok: true, linked: true, wallet: w.address, next: "/connect?mode=login", status: "done" }]);
  assert.deepEqual(fin.headers.getSetCookie(), ["vs=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"]);
  const now = await userOf(env, g);
  assert.deepEqual([now.wallet, now.wallet_via, now.legacy_state], [w.address, "legacy_pair", "linked_in_window"]);
  assert.equal(await count(env, "pairs WHERE purpose = 'link'"), 0);
  assert.equal(await count(env, "sessions WHERE auth = 'legacy_link'"), 0);
  assert.deepEqual(await walletSignIn(W.browser(env), w), { ok: true, wallet: w.address, next: "/dashboard" });
});

/* ---------------------------------------------------------------- after the window */

test("after LEGACY_LINK_UNTIL: every legacy route answers 410, the restricted session counts for nothing, the unlinked accounts become closed_unresolved with their data kept", async () => {
  const env = W.V2(), box = outbox();
  const { a, g, e } = await population(env, box);
  on(env);
  const gb = W.browser(env);
  await googleLegacy(gb, g.sub);
  const w = await W.wallet();
  const s = await legacySigned(gb, w);
  // the census runs at the first legacy request; then the window closes
  const users = async () => rows(env.DB, "SELECT * FROM users ORDER BY id");
  const before = await users();
  const postsBefore = await rows(env.DB, "SELECT * FROM posts ORDER BY id");
  W.useClock("2026-12-01T00:00:00Z");
  const closed = [410, { ok: false, error: "window_closed", until: UNTIL_ISO }];
  const { statement, ...body } = s;
  // the Google start opened before (its OAuth cookie) comes back too late
  const st = await W.browser(env).send("/api/auth/google/start");
  assert.equal(st.status, 404, "the non-legacy form stays the S10 404");
  assert.deepEqual(await answer(await gb.send("/api/auth/google/start?legacy=1")), closed);
  const lateCb = W.browser(env); lateCb.jar.set("vo", "google.st8.ver1fier.g");
  assert.deepEqual(await answer(await lateCb.send("/api/auth/google/callback?code=c&state=st8")), closed);
  assert.deepEqual(await answer(await gb.send("/api/auth/email/start", { method: "POST", body: { email: e.email, legacy: true } })), closed);
  assert.deepEqual(await answer(await gb.send("/api/auth/email/verify", { method: "POST", body: { email: e.email, code: "123456", legacy: true } })), closed);
  assert.equal((await gb.send("/api/auth/email/start", { method: "POST", body: { email: e.email } })).status, 404);
  assert.deepEqual(await answer(await gb.send("/api/auth/challenge", { method: "POST", body: { purpose: "legacy_link", address: w.address } })), closed);
  assert.deepEqual(await answer(await gb.send("/api/me/wallet/link", { method: "POST", body })), closed);
  assert.deepEqual(await answer(await gb.send("/api/me/wallet/link", { method: "GET" })), closed);
  assert.deepEqual(await answer(await gb.send("/api/pair", { method: "POST", body: { purpose: "link" } })), closed);
  assert.deepEqual((await gb.get("/api/me")).legacyLink, { open: false, until: UNTIL_ISO });
  assert.equal((await gb.get("/api/me")).signedIn, false);
  // the job closes the cases: the two accounts without a wallet; the rest stays as it was
  const run = await W.tick(env);
  assert.deepEqual(run.legacyLink, { state: "closed", linked: 0, closed: 2 });
  const after = await users();
  assert.deepEqual(after.map((u) => u.legacy_state), ["wallet_linked", "wallet_linked", "closed_unresolved", "closed_unresolved"]);
  assert.deepEqual(after.map(({ legacy_state, badges, ...u }) => u), before.map(({ legacy_state, badges, ...u }) => u), "every account's data is kept");
  assert.deepEqual(await rows(env.DB, "SELECT * FROM posts ORDER BY id"), postsBefore);
  assert.deepEqual((await W.tick(env)).legacyLink, { state: "closed", linked: 0, closed: 0 }, "idempotent");
  // no way in: no legacy log-in, no wallet; a wallet sign-in of anyone else's wallet opens nothing of theirs
  assert.equal((await userOf(env, g)).wallet, null);
  assert.deepEqual(await walletSignIn(W.browser(env), w), { ok: false, error: "no_account" });
  assert.deepEqual(await walletSignIn(W.browser(env), a.w), { ok: true, wallet: a.w.address, next: "/dashboard" }, "members with a wallet sign in as before");
  // the configuration takes LEGACY_LINK off (and removes the date): the S10 404, and the accounts stay closed_unresolved; no login opens them
  delete env.LEGACY_LINK; _resetPolicyCheck();
  assert.equal((await gb.send("/api/auth/google/start?legacy=1")).status, 404);
  assert.deepEqual((await W.tick(env)).legacyLink, undefined, "no window: no job step");
  assert.deepEqual((await rows(env.DB, "SELECT legacy_state FROM users ORDER BY id")).map((u) => u.legacy_state), ["wallet_linked", "wallet_linked", "closed_unresolved", "closed_unresolved"]);
  // a later window opens a closed account again (review finding SEC-4: closed_unresolved is final only until the owner opens a new window)
  Object.assign(env, { LEGACY_LINK: "on", LEGACY_LINK_UNTIL: "2027-01-01T00:00:00Z" }); _resetPolicyCheck();
  const again = W.browser(env);
  assert.equal((await googleLegacy(again, g.sub)).to, "/connect?mode=legacy&legacy=signed_in");
  const w2 = await W.wallet();
  assert.deepEqual(await answer(await link(again, w2)), [200, { ok: true, linked: true, wallet: w2.address, next: "/connect?mode=login" }]);
  assert.equal((await userOf(env, g)).legacy_state, "linked_in_window");
  assert.deepEqual(await walletSignIn(W.browser(env), w2), { ok: true, wallet: w2.address, next: "/dashboard" });
});

test("a past LEGACY_LINK_UNTIL never opens a window: the legacy routes answer 410 from the first request", async () => {
  const env = W.V2(), box = outbox();
  const { g } = await population(env, box);
  on(env, { ...LEGACY, LEGACY_LINK_UNTIL: "2026-10-20" });
  const br = W.browser(env);
  const sessions = await count(env, "sessions");
  assert.deepEqual(await answer(await br.send("/api/auth/google/start?legacy=1")), [410, { ok: false, error: "window_closed", until: "2026-10-20T00:00:00.000Z" }]);
  assert.equal(await count(env, "sessions"), sessions);
  assert.equal((await userOf(env, g)).wallet, null);
});

test("SEC-4: a mistyped past LEGACY_LINK_UNTIL closes nobody; the window opened later with the right date still lets the Google-only member link", async () => {
  const env = W.V2(), box = outbox();
  const { g } = await population(env, box);
  // the reviewer's case: WALLET_ONLY on, a past date prepared ahead of the window, LEGACY_LINK not on yet: no window at all, no job step
  on(env, { ...WALLET, LEGACY_LINK_UNTIL: "2025-12-01" });
  assert.equal(legacyLink(env).state, "off");
  assert.equal((await W.tick(env)).legacyLink, undefined);
  // the same typo with LEGACY_LINK on: closed (410), but no window was ever recorded open, so the job closes nobody
  on(env, { ...LEGACY, LEGACY_LINK_UNTIL: "2025-12-01" }); _resetPolicyCheck();
  assert.deepEqual((await W.tick(env)).legacyLink, { state: "closed", linked: 0, closed: 0 });
  assert.equal((await userOf(env, g)).legacy_state, "legacy_unlinked", "not closed_unresolved: nothing is lost");
  // the corrected date opens the window: the member logs in and links
  on(env, LEGACY); _resetPolicyCheck();
  const br = W.browser(env);
  assert.equal((await googleLegacy(br, g.sub)).to, "/connect?mode=legacy&legacy=signed_in");
  const w = await W.wallet();
  assert.equal((await link(br, w)).status, 200);
  assert.equal((await userOf(env, g)).wallet, w.address);
  // a window shortened to a moment already past, before it was seen open with that date, never closes accounts early: the recorded end rules
  const env2 = W.V2(), box2 = outbox();
  const p2 = await population(env2, box2);
  on(env2, LEGACY);
  assert.deepEqual((await W.tick(env2)).legacyLink, { state: "open", linked: 0, unlinked: 0 }, "the job records the open window (its end)");
  on(env2, { ...LEGACY, LEGACY_LINK_UNTIL: "2026-10-01" }); _resetPolicyCheck();
  assert.deepEqual((await W.tick(env2)).legacyLink, { state: "closed", linked: 0, closed: 0 }, "the recorded end (1 December) has not passed");
  W.useClock("2026-12-01T00:00:01Z");
  assert.deepEqual((await W.tick(env2)).legacyLink, { state: "closed", linked: 0, closed: 2 }, "once it has, the job closes the cases");
  assert.equal((await userOf(env2, p2.g)).legacy_state, "closed_unresolved");
});

test("SEC-1: an error in another input never re-enables Google login or revives an old session; WALLET_ONLY refused fails closed", async () => {
  const env = W.V2(), box = outbox();
  const { a, g } = await population(env, box);
  // before the switch: a Google session of the wallet member (never proven by the wallet), kept by its browser
  const old = W.browser(env);
  const st0 = await old.send("/api/auth/google/start");
  const state0 = new URL(st0.headers.get("location")).searchParams.get("state");
  assert.equal((await old.send(`/api/auth/google/callback?code=c&state=${state0}`, { fetchImpl: fakeGoogle(a.sub) })).headers.get("location"), "/dashboard");
  assert.equal((await old.get("/api/me?lite=1")).signedIn, true);
  on(env);
  // the Google-only member's restricted session in the open window
  const lb = W.browser(env);
  assert.equal((await googleLegacy(lb, g.sub)).to, "/connect?mode=legacy&legacy=signed_in");
  for (const typo of [{ OFFICIAL_X_URL: "x.com/citycoin" }, { MAIN_TOKEN_MINT: "not-a-mint" }, { OFFICIAL_TELEGRAM_URL: "t.me" }]) {
    Object.assign(env, typo); _resetPolicyCheck();
    assert.equal(walletOnly(env), true, JSON.stringify(typo));
    assert.equal((await lb.get("/api/me?lite=1")).signedIn, false, `${JSON.stringify(typo)}: the restricted session stays restricted`);
    assert.equal((await old.get("/api/me?lite=1")).signedIn, false, `${JSON.stringify(typo)}: the old Google session stays retired`);
    assert.equal((await W.browser(env).send("/api/auth/google/start")).status, 404, `${JSON.stringify(typo)}: no Google login`);
    for (const k of Object.keys(typo)) delete env[k];
  }
  // WALLET_ONLY set but refused by its own input (DEPLOYMENT_ENV gone): fail closed, never today's site
  env.DEPLOYMENT_ENV = ""; _resetPolicyCheck();
  assert.equal((await lb.get("/api/me?lite=1")).signedIn, false);
  assert.equal((await old.get("/api/me?lite=1")).signedIn, false);
  const me = await W.browser(env).get("/api/me");
  assert.deepEqual([me.walletOnly, me.providers, "legacyLink" in me], [true, { wallet: true }, false]);
  for (const path of ["/api/auth/google/start", "/api/auth/google/start?legacy=1", "/api/auth/google/callback?code=c&state=s"]) assert.equal((await W.browser(env).send(path)).status, 404, path);
  assert.equal((await W.browser(env).send("/api/auth/email/login", { method: "POST", body: { email: "x@example.com", password: "x" } })).status, 404);
  assert.deepEqual(await answer(await W.browser(env).send("/api/auth/wallet", { method: "POST", body: {} })), [503, { ok: false, error: "unavailable" }]);
  // a wallet session made under the switch keeps working while held (it is a wallet-bound session)
  env.DEPLOYMENT_ENV = "test"; _resetPolicyCheck();
  const wb = W.browser(env);
  assert.equal((await walletSignIn(wb, a.w)).ok, true);
  env.DEPLOYMENT_ENV = ""; _resetPolicyCheck();
  assert.equal((await wb.get("/api/me?lite=1")).signedIn, true);
  // WALLET_ONLY taken off on purpose (the documented rollback): today's site, but the restricted session row is still never a session
  for (const k of Object.keys(LEGACY)) delete env[k];
  _resetPolicyCheck();
  assert.equal((await lb.get("/api/me?lite=1")).signedIn, false, "a restricted legacy session never becomes a dashboard session");
  assert.equal((await old.get("/api/me?lite=1")).signedIn, true, "today's site: the old Google session counts again on a deliberate rollback");
});

/* ---------------------------------------------------------------- the census and the job */

test("the job: the census once, a later Google- or e-mail account without a wallet becomes legacy_unlinked, one that got a wallet outside the window wallet_linked", async () => {
  const env = W.V2(), box = outbox();
  const { g } = await population(env, box);
  on(env);
  assert.equal(await hasColumn(env, "users", "legacy_state"), false, "nothing before the first request or job that needs it");
  const first = await W.tick(env);
  assert.deepEqual(first.legacyLink, { state: "open", linked: 0, unlinked: 0 });
  assert.deepEqual((await rows(env.DB, "SELECT legacy_state FROM users ORDER BY id")).map((r) => r.legacy_state), ["wallet_linked", "wallet_linked", "legacy_unlinked", "legacy_unlinked"]);
  // a Google account made during a switch-off (no case yet), and the Google-only member linking a wallet from today's dashboard meanwhile
  await env.DB.prepare("INSERT INTO users (provider, provider_id, handle, name, created_at) VALUES ('google', 'g-later-zq', 'LaterOne', 'L', ?)").bind(new Date(Date.now()).toISOString()).run();
  await env.DB.prepare("UPDATE users SET wallet = ? WHERE id = ?").bind((await W.wallet()).address, (await userOf(env, g)).id).run();
  assert.deepEqual((await W.tick(env)).legacyLink, { state: "open", linked: 1, unlinked: 1 });
  assert.equal((await userOf(env, g)).legacy_state, "wallet_linked");
  assert.equal((await one(env.DB, "SELECT legacy_state FROM users WHERE handle = 'LaterOne'")).legacy_state, "legacy_unlinked");
  // the census never runs twice: a wallet registration made later keeps NULL (never a legacy case)
  assert.equal((await rows(env.DB, "SELECT id FROM schema_migrations WHERE id = '2026-10-24-identity-legacy'")).length, 1);
});

/* ---------------------------------------------------------------- hosts, logs */

test("a restricted session is bound to the host it was made on (D04): unknown on another host of the allowlist", async () => {
  const env = W.V2(), box = outbox();
  const { g } = await population(env, box);
  on(env, { ...LEGACY, SITE_ORIGINS: `${W.ORIGIN} https://vicinity.city` });
  const br = W.browser(env);
  const r = await googleLegacy(br, g.sub);
  assert.equal(r.to, "/connect?mode=legacy&legacy=signed_in");
  assert.equal((await one(env.DB, "SELECT host FROM sessions WHERE auth = 'legacy_link'")).host, "vicinity.test");
  const w = await W.wallet();
  const req = (host) => new Request(`https://${host}/api/auth/challenge`, { method: "POST", headers: { origin: `https://${host}`, cookie: `vs=${br.jar.get("vs")}`, "content-type": "application/json" },
    body: JSON.stringify({ purpose: "legacy_link", address: w.address }) });
  assert.deepEqual(await answer(await handleApi(req("vicinity.city"), env)), [401, { ok: false, error: "legacy_sign_in" }]);
  assert.equal((await handleApi(req("vicinity.test"), env)).status, 200);
});

test("no log line carries an e-mail address, a wallet address, a code or a token", async () => {
  const env = W.V2(), box = outbox();
  const { g, e } = await population(env, box);
  on(env);
  const lines = [], keep = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(keep)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  let w, code;
  try {
    const gb = W.browser(env);
    await googleLegacy(gb, g.sub);
    w = await W.wallet();
    await link(gb, w);
    const eb = W.browser(env);
    await eb.send("/api/auth/email/start", { method: "POST", body: { email: e.email, legacy: true }, fetchImpl: box.fetch });
    code = box.codeFor(e.email);
    await eb.send("/api/auth/email/verify", { method: "POST", body: { email: e.email, code, legacy: true } });
    await W.tick(env);
  } finally { Object.assign(console, keep); }
  const all = lines.join("\n");
  assert.ok(lines.some((l) => l === "legacy link login"), all);
  assert.ok(lines.some((l) => /^wallet linked \(legacy window\) [1-9A-HJ-NP-Za-km-z]{4}…[1-9A-HJ-NP-Za-km-z]{4}$/.test(l)), all);
  for (const secret of [e.email, w.address, code, g.sub]) assert.ok(!all.includes(secret), `a log line names ${secret}`);
});
