// Wallet-only sign-in (Citycoin.dev master v5, stage S10; master section 18 WP-02 "Sign in proves an existing wallet and opens its dashboard
// without geolocation; an unknown wallet returns to browser registration instead of creating an incomplete account", "When the wallet switches,
// clear the old session", section 05 BR-03 "Do not restore Google as the new dashboard login path"; acceptance A01, A02, A04 (login part),
// A14 (identity part) and D04; src/auth.js). While WALLET_ONLY counts: only a wallet challenge signs in; an unknown wallet gets no_account and
// nothing is made; a proof by any wallet ends this browser's session first; the tiny-transfer proof and the Google, e-mail and password logins
// answer 404 before any method check; /api/me reports the wallet as the only provider; only wallet-bound sessions count; the admin console
// signs in and re-proves with its own challenge; logout is unchanged. Every account and its history stay as they are, the Google-only member's
// included (its wallet link is the legacy link window of stage S14). With the switch off, or set but refused: today's site. Fake wallets only.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as W from "./helpers/world.js";
import { handleApi } from "../src/index.js";
import { dumpAll, fakeGoogle, member, memberWithWallet, one, outbox, rows, userOf, GOOD_PASSWORD } from "./helpers/signup.js";
import { _resetPolicyCheck } from "../src/v5policy.js";
import { sha256 } from "../src/http.js";

beforeEach(() => { W.useClock("2026-10-24T12:00:00Z"); _resetPolicyCheck(); });
after(() => W.realClock());

const ON = Object.freeze({ WALLET_ONLY: "on", DEPLOYMENT_ENV: "test", SITE_ORIGIN: W.ORIGIN, SITE_ORIGINS: W.ORIGIN });
const on = (env, extra = {}) => Object.assign(env, ON, extra);
const off = (env) => { for (const k of Object.keys(ON)) delete env[k]; return env; };
const count = async (env, sql) => (await one(env.DB, `SELECT COUNT(*) AS n FROM ${sql}`)).n;
const answer = async (res) => [res.status, await res.json()];
async function signed(b, w, purpose = "login", extra = {}) {
  const c = await b.post("/api/auth/challenge", { purpose, address: w.address, ...extra });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message) };
}
const signIn = async (b, w, purpose = "login", extra = {}) => b.send("/api/auth/wallet", { method: "POST", body: { ...(await signed(b, w, purpose)), ...extra } });
/** The session row a Set-Cookie answer made (only a hash of the token is stored). */
async function sessionOf(env, res) {
  const c = res.headers.getSetCookie().find((x) => x.startsWith("vs=") && !/Max-Age=0$/.test(x));
  return c ? one(env.DB, "SELECT * FROM sessions WHERE id = ?", await sha256(decodeURIComponent(c.slice(3).split(";")[0]))) : null;
}
/** "Log in with Google" (no sign-up marker): where Google's answer lands. */
async function googleLogin(b, sub) {
  const st = await b.send("/api/auth/google/start");
  const state = new URL(st.headers.get("location")).searchParams.get("state");
  const cb = await b.send(`/api/auth/google/callback?code=c&state=${state}`, { fetchImpl: fakeGoogle(sub) });
  return cb.headers.get("location");
}
/** Today's population, made by today's sign-up before the switch: two members with a wallet (M1), one Google-only member (M3). */
async function population(env, box) {
  const a = await memberWithWallet(env, box, { via: "google" });
  const b = await memberWithWallet(env, box, { via: "email" });
  const g = await member(env, box, { via: "google" }); // Google only, no wallet: the legacy-link case of the census
  const post = await a.b.post("/api/posts", { kind: "talk", body: "hello from a" });
  assert.equal(post.ok, true, JSON.stringify(post));
  return { a, b, g };
}

/* ---------------------------------------------------------------- sign in */

test("a registered wallet signs in with a login challenge: a 30-day wallet session, its dashboard, no location asked", async () => {
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const b = W.browser(env);
  const res = await signIn(b, a.w);
  assert.deepEqual(await answer(res), [200, { ok: true, wallet: a.w.address, next: "/dashboard" }]);
  assert.match(res.headers.getSetCookie()[0], /^vs=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
  const row = await sessionOf(env, res);
  const user = await userOf(env, a);
  assert.deepEqual({ ...row, id: "x" }, { id: "x", wallet: a.w.address, user_id: user.id, proof: null, created_at: "2026-10-24T12:00:00.000Z", expires_at: "2026-11-23T12:00:00.000Z",
    proven_at: "2026-10-24T12:00:00.000Z", made_by: null, host: "vicinity.test", auth: "wallet" });
  const me = await b.get("/api/me?lite=1");
  assert.deepEqual([me.signedIn, me.user.id, me.fresh, me.providers, me.walletOnly], [true, user.id, true, { wallet: true }, true]);
  // the same account on a second device: one account per wallet (A01)
  const phone = W.browser(env);
  assert.equal((await signIn(phone, a.w, "login", { inApp: true })).status, 200);
  assert.equal((await phone.get("/api/me?lite=1")).user.id, user.id);
  assert.equal((await one(env.DB, "SELECT made_by FROM sessions WHERE auth = 'wallet' ORDER BY rowid DESC LIMIT 1")).made_by, "wallet", "a wallet app's own browser: renewed while used");
  assert.equal(await count(env, "users"), 3, "no account was made");
});

test("an unknown wallet: 404 no_account, no account, no session, no cookie (A04: nothing incomplete is made)", async () => {
  const env = W.V2(), box = outbox();
  await population(env, box);
  on(env);
  const before = { users: await count(env, "users"), sessions: await count(env, "sessions") };
  const b = W.browser(env), stranger = await W.wallet();
  const res = await signIn(b, stranger);
  assert.deepEqual(await answer(res), [404, { ok: false, error: "no_account" }]);
  assert.deepEqual(res.headers.getSetCookie(), []);
  assert.deepEqual({ users: await count(env, "users"), sessions: await count(env, "sessions") }, before);
  assert.equal(await count(env, `users WHERE wallet = '${stranger.address}'`), 0);
  assert.equal(await count(env, "auth_challenges WHERE used_at IS NOT NULL"), 1, "the proof is spent, whatever it found");
  assert.deepEqual(await b.get("/api/me"), { signedIn: false, providers: { wallet: true }, signupFlow: "v2", walletOnly: true });
});

test("wallet switch (A02): a proof by another wallet ends this browser's session first; the old account's dashboard is gone from it", async () => {
  const env = W.V2(), box = outbox();
  const { a, b: other } = await population(env, box);
  on(env);
  const b = W.browser(env);
  const first = await signIn(b, a.w);
  const aRow = await sessionOf(env, first);
  const aCookie = b.jar.get("vs");
  assert.equal((await b.get("/api/me?lite=1")).user.id, (await userOf(env, a)).id);
  // signed in as A, the wallet of B signs: A's session row is deleted in the same batch, B's is made
  const second = await signIn(b, other.w);
  assert.equal(second.status, 200);
  assert.equal(await one(env.DB, "SELECT id FROM sessions WHERE id = ?", aRow.id), null);
  assert.equal((await b.get("/api/me?lite=1")).user.id, (await userOf(env, other)).id);
  // A's old cookie, kept by someone, opens nothing any more
  const copy = W.browser(env); copy.jar.set("vs", aCookie);
  assert.equal((await copy.get("/api/me")).signedIn, false);
  // signed in as B, an unknown wallet signs: B's session ends too, the cookie is cleared, nothing is made
  const bRow = await sessionOf(env, second);
  const third = await signIn(b, await W.wallet());
  assert.deepEqual(await answer(third), [404, { ok: false, error: "no_account" }]);
  assert.match(third.headers.getSetCookie()[0], /^vs=; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0$/);
  assert.equal(await one(env.DB, "SELECT id FROM sessions WHERE id = ?", bRow.id), null);
  assert.equal((await b.get("/api/me")).signedIn, false);
  // the same wallet again: the session is replaced, never doubled
  const s1 = await sessionOf(env, await signIn(b, a.w));
  const s2 = await sessionOf(env, await signIn(b, a.w));
  assert.notEqual(s1.id, s2.id);
  assert.equal(await one(env.DB, "SELECT id FROM sessions WHERE id = ?", s1.id), null);
});

test("pairing: a phone approves a computer's sign-in with a login challenge naming the check number; the computer finishes; single use", async () => {
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const computer = W.browser(env), phone = W.browser(env);
  const pair = await computer.post("/api/pair");
  const status = await phone.post("/api/pair/status", { code: pair.code });
  assert.equal(status.status, "waiting");
  const c = await phone.post("/api/auth/challenge", { purpose: "login", address: a.w.address, pair: pair.code });
  assert.equal(c.statement, `Sign in to Vicinity on my other device (check number ${pair.pin}). Free, not a transaction, cannot move funds.`);
  const body = { challengeId: c.challengeId, address: a.w.address, message: c.message, signature: await a.w.sign(c.message), pair: pair.code };
  // the approval's text (it names the other device's check number) cannot sign in the phone's own browser instead
  const { pair: _p, ...noPair } = body;
  assert.deepEqual(await phone.post("/api/auth/wallet", noPair), { ok: false, error: "bad_message" });
  assert.deepEqual(await phone.post("/api/auth/wallet", body), { ok: true, paired: true });
  assert.equal(phone.has("vs"), false, "the phone itself is not signed in");
  assert.deepEqual(await phone.post("/api/auth/wallet", body), { ok: false, error: "challenge_used" });
  const fin = await computer.send("/api/pair/finish", { method: "POST", body: { code: pair.code } });
  assert.deepEqual(await fin.json(), { ok: true, status: "done", wallet: a.w.address, next: "/dashboard" });
  assert.equal((await sessionOf(env, fin)).auth, "wallet");
  assert.equal((await computer.get("/api/me?lite=1")).user.id, (await userOf(env, a)).id);
  // a pairing approved by an unknown wallet: nothing is made on the computer
  const pc = W.browser(env), stranger = await W.wallet();
  const p2 = await pc.post("/api/pair");
  const c2 = await phone.post("/api/auth/challenge", { purpose: "login", address: stranger.address, pair: p2.code });
  await phone.post("/api/auth/wallet", { challengeId: c2.challengeId, address: stranger.address, message: c2.message, signature: await stranger.sign(c2.message), pair: p2.code });
  assert.deepEqual(await answer(await pc.send("/api/pair/finish", { method: "POST", body: { code: p2.code } })), [404, { ok: false, error: "no_account" }]);
  // no link pairing while wallet-only (the legacy link window is stage S14)
  assert.deepEqual(await answer(await computer.send("/api/pair", { method: "POST", body: { purpose: "link" } })), [400, { ok: false, error: "bad_request" }]);
  // an admin challenge cannot approve a pairing
  const p3 = await W.browser(env).post("/api/pair");
  const ad = await signed(phone, a.w, "admin");
  assert.deepEqual(await answer(await phone.send("/api/auth/wallet", { method: "POST", body: { ...ad, pair: p3.code } })), [400, { ok: false, error: "wrong_purpose" }]);
});

test("SEC-5: a login pairing is finished only by the browser that asked for it; whoever saw the code gets the dead-code answer and no session", async () => {
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const computer = W.browser(env), phone = W.browser(env), onlooker = W.browser(env);
  const res = await computer.send("/api/pair", { method: "POST", body: {} });
  const pair = await res.json();
  assert.match(res.headers.getSetCookie().find((c) => c.startsWith("__Host-vpr=")) || "", /^__Host-vpr=[A-Za-z0-9_-]{32}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=300$/);
  const row = await one(env.DB, "SELECT requester FROM pairs WHERE id = ?", await sha256(pair.code));
  assert.match(row.requester, /^[A-Za-z0-9_-]{43}$/, "a SHA-256");
  assert.notEqual(row.requester, computer.jar.get("__Host-vpr"), "only the nonce's hash is stored");
  const c = await phone.post("/api/auth/challenge", { purpose: "login", address: a.w.address, pair: pair.code });
  assert.deepEqual(await phone.post("/api/auth/wallet", { challengeId: c.challengeId, address: a.w.address, message: c.message, signature: await a.w.sign(c.message), pair: pair.code }), { ok: true, paired: true });
  // someone who saw the QR code polls the status (it is ready) and races to finish: refused, nothing made, the pairing still there
  assert.equal((await onlooker.post("/api/pair/status", { code: pair.code })).status, "ready");
  const stolen = await onlooker.send("/api/pair/finish", { method: "POST", body: { code: pair.code } });
  assert.deepEqual(await answer(stolen), [410, { ok: false, status: "expired" }]);
  assert.deepEqual(stolen.headers.getSetCookie(), []);
  assert.equal((await onlooker.get("/api/me?lite=1")).signedIn, false);
  // a copied nonce of another pairing does not help either
  onlooker.jar.set("__Host-vpr", "x".repeat(32));
  assert.equal((await onlooker.send("/api/pair/finish", { method: "POST", body: { code: pair.code } })).status, 410);
  // the computer that asked finishes it, and the nonce is spent with it
  const fin = await computer.send("/api/pair/finish", { method: "POST", body: { code: pair.code } });
  assert.deepEqual(await fin.json(), { ok: true, status: "done", wallet: a.w.address, next: "/dashboard" });
  assert.ok(fin.headers.getSetCookie().includes("__Host-vpr=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"));
  assert.equal((await computer.get("/api/me?lite=1")).user.id, (await userOf(env, a)).id);
});

/* ---------------------------------------------------------------- the old ways in are gone */

const GONE = ["/api/auth/transfer", "/api/auth/transfer/check", "/api/auth/google/start", "/api/auth/google/callback", "/api/auth/email/start",
  "/api/auth/email/verify", "/api/auth/email/login", "/api/auth/password/reset/start", "/api/auth/password/reset", "/api/me/password",
  "/api/me/google/add", "/api/me/google/remove", "/api/me/wallet/unlink"];

test("the tiny-transfer proof, the Google, e-mail and password logins and unlink answer 404 before any method check, like an unknown path", async () => {
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const b = W.browser(env);
  await signIn(b, a.w); // signed in or not, the same answer
  for (const who of [b, W.browser(env)]) for (const path of GONE) for (const method of ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
    const body = method === "POST" || method === "PUT" ? { address: a.w.address, email: "x@example.com", code: "123456", password: GOOD_PASSWORD } : undefined;
    const res = await who.send(path + (path.endsWith("callback") ? "?code=c&state=s" : ""), { method, body });
    const unknown = await who.send("/api/no-such-route-zq", { method, body });
    assert.deepEqual([res.status, await res.text(), res.headers.getSetCookie()], [404, await unknown.text(), []], `${method} ${path}`);
  }
  assert.equal(await count(env, "sessions WHERE proof IS NOT NULL"), 0, "no transfer proof was started");
});

test("switch off: the same routes are today's: Google, e-mail and password sign-in and the transfer proof still work", async () => {
  for (const extra of [{}, { ...ON, WALLET_ONLY: "off" }, { ...ON, WALLET_ONLY: "" }]) {
    _resetPolicyCheck();
    const env = W.V2(extra), box = outbox();
    const { a, b: e } = await population(env, box);
    // Google log-in of a member who has it
    const g = W.browser(env);
    assert.equal(await googleLogin(g, a.sub), "/dashboard", JSON.stringify(extra));
    // e-mail and password
    const p = W.browser(env);
    const pw = await p.post("/api/auth/email/login", { email: e.email, password: GOOD_PASSWORD });
    assert.equal(pw.ok, true, JSON.stringify(pw));
    // the tiny-transfer proof starts
    const t = await W.browser(env).post("/api/auth/transfer", { address: a.w.address });
    assert.equal(t.ok, true);
    // today's signed message signs in; the challenge route is unknown
    const w = W.browser(env);
    assert.deepEqual(await w.post("/api/auth/wallet", await W.loginBody(a.w)), { ok: true, wallet: a.w.address, next: "/dashboard" });
    assert.equal((await w.send("/api/auth/challenge", { method: "POST", body: { purpose: "login", address: a.w.address } })).status, 404);
    assert.deepEqual((await w.get("/api/me?lite=1")).providers, { google: true, email: true });
    assert.equal("walletOnly" in (await w.get("/api/me")), false);
    assert.ok(!(await rows(env.DB, "SELECT name FROM sqlite_master WHERE name = 'auth_challenges'")).length);
  }
});

test("GET /api/message: a sign-in or link text comes only from the challenge while the switch counts; the public verify text stays", async () => {
  W.realClock(); // /api/message dates its text with the real clock (today's code)
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const b = W.browser(env);
  for (const action of ["login", "link"]) {
    assert.deepEqual(await answer(await b.send(`/api/message?address=${a.w.address}&action=${action}`)), [400, { error: "use_challenge" }]);
  }
  const v = await b.get(`/api/message?address=${a.w.address}&action=verify`);
  assert.match(v.message, /^vicinity\.test wants you to sign in with your Solana account:\n/);
  const signature = await a.w.sign(v.message);
  const r = await b.post("/api/verify", { address: a.w.address, message: v.message, signature });
  assert.equal(r.verified, true);
  assert.deepEqual(await b.post("/api/verify", { address: a.w.address, message: v.message, signature }), { verified: false, error: "replayed" });
  // today's login text, made earlier, is not accepted at the re-proof route either
  await signIn(b, a.w);
  assert.deepEqual(await b.post("/api/auth/reprove", await W.loginBody(a.w)), { ok: false, error: "challenge_required" });
});

/* ---------------------------------------------------------------- sessions made before the switch */

test("only wallet-bound sessions count: a wallet-proven session stays signed in; Google, e-mail or password ones and pending rows read as signed out, never deleted", async () => {
  const env = W.V2(), box = outbox();
  const { a, b: e, g } = await population(env, box);
  // a Google login of a wallet member that never proved the wallet in that browser
  const gl = W.browser(env);
  assert.equal(await googleLogin(gl, a.sub), "/dashboard");
  assert.equal((await gl.get("/api/me?lite=1")).signedIn, true);
  // a pending transfer proof (a session without an account)
  const pend = W.browser(env);
  await pend.post("/api/auth/transfer", { address: a.w.address });
  assert.ok((await pend.get("/api/me")).proof);
  const rowsBefore = await rows(env.DB, "SELECT id, user_id, proven_at FROM sessions ORDER BY id");
  // the switch goes on; the host binding counts with it (SITE_ORIGINS names the test host), so the rows made before (host NULL) are read where
  // they belong, on vicinity.city
  on(env, { SITE_ORIGINS: `${W.ORIGIN} https://vicinity.city` });
  const meOn = async (jar) => (await handleApi(new Request("https://vicinity.city/api/me?lite=1", { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } }), env)).json();
  const me = await meOn(a.b.jar);
  assert.deepEqual([me.signedIn, me.providers, me.walletOnly], [true, { wallet: true }, true], "M1 proven in this browser: still signed in, no new proof needed");
  assert.equal((await meOn(e.b.jar)).signedIn, true, "the e-mail member who linked and proved the wallet here too");
  assert.equal((await meOn(gl.jar)).signedIn, false, "a Google login never proven by the wallet");
  assert.equal((await meOn(g.b.jar)).signedIn, false, "the Google-only member: no wallet, so no wallet-bound session");
  const pending = await meOn(pend.jar);
  assert.deepEqual([pending.signedIn, "pending" in pending, "proof" in pending], [false, false, false]);
  assert.deepEqual(await rows(env.DB, "SELECT id, user_id, proven_at FROM sessions ORDER BY id"), rowsBefore, "no session row was touched");
  // the switch goes off again: every one of them is today's again (the rollback)
  off(env);
  assert.equal((await gl.get("/api/me?lite=1")).signedIn, true);
  assert.equal((await g.b.get("/api/me?lite=1")).signedIn, true);
  assert.ok((await pend.get("/api/me")).proof);
});

test("nobody loses an account or its history: accounts, posts, cities and logins stay byte for byte; the Google-only member keeps everything", async () => {
  const env = W.V2(), box = outbox();
  const { a, g } = await population(env, box);
  const keep = async () => ({ users: await rows(env.DB, "SELECT * FROM users ORDER BY id"), posts: await rows(env.DB, "SELECT * FROM posts ORDER BY id") });
  const before = await keep();
  on(env);
  // every way in that is gone, tried by the Google-only member, and wallet sign-ins by others
  await g.b.send("/api/auth/google/start");
  await g.b.send("/api/auth/email/login", { method: "POST", body: { email: "x@example.com", password: GOOD_PASSWORD } });
  const stranger = await W.wallet();
  await signIn(W.browser(env), stranger);
  await signIn(W.browser(env), a.w);
  await W.tick(env);
  const after = await keep();
  // the only change a sign-in makes to an account is today's badge refresh on /api/me; nothing here asked for it
  assert.deepEqual(after, before);
  const gu = await userOf(env, g);
  assert.equal(gu.wallet, null, "no wallet is attached to the Google-only account by any sign-in");
  assert.ok(gu.home_city && gu.provider === "google", "its city and its login identifier stay as data");
  assert.equal(await count(env, `users WHERE wallet = '${stranger.address}'`), 0);
});

/* ---------------------------------------------------------------- re-proof and the admin console */

test("re-proof: a 'reprove' challenge issued for this session and this account's wallet makes it fresh; any other is refused", async () => {
  const env = W.V2(), box = outbox();
  const { a, b: other } = await population(env, box);
  on(env);
  const b = W.browser(env), b2 = W.browser(env);
  await signIn(b, a.w);
  await signIn(b2, a.w);
  W.advance(31 * 60_000);
  assert.equal((await b.get("/api/me?lite=1")).fresh, false);
  // a re-proof challenge from the other browser of the same member is bound to that session
  const foreign = await signed(b2, a.w, "reprove");
  assert.deepEqual(await answer(await b.send("/api/auth/reprove", { method: "POST", body: foreign })), [403, { ok: false, error: "wrong_session" }]);
  // the right one
  const mine = await signed(b, a.w, "reprove");
  const ok = await b.post("/api/auth/reprove", mine);
  assert.deepEqual(ok, { ok: true, provenAt: "2026-10-24T12:31:00.000Z" });
  assert.equal((await b.get("/api/me?lite=1")).fresh, true);
  assert.deepEqual(await b.post("/api/auth/reprove", mine), { ok: false, error: "challenge_used" });
  // another member's wallet, and signed out
  assert.deepEqual(await answer(await b.send("/api/auth/challenge", { method: "POST", body: { purpose: "reprove", address: other.w.address } })), [403, { ok: false, error: "wrong_wallet" }]);
  assert.deepEqual(await answer(await W.browser(env).send("/api/auth/reprove", { method: "POST", body: mine })), [401, { ok: false, error: "sign_in" }]);
  // expired
  const late = await signed(b, a.w, "reprove");
  W.advance(121_000);
  assert.deepEqual(await answer(await b.send("/api/auth/reprove", { method: "POST", body: late })), [410, { ok: false, error: "challenge_expired" }]);
});

test("the admin console signs in and re-proves with its own 'admin' challenge; a wallet without a role is refused and nothing is made", async () => {
  const env = W.V2(), box = outbox();
  const { a, b: other } = await population(env, box);
  on(env, { ADMIN_WALLETS: a.w.address });
  const admin = W.browser(env);
  const res = await signIn(admin, a.w, "admin");
  assert.deepEqual(await answer(res), [200, { ok: true, wallet: a.w.address, next: "/dashboard" }]);
  assert.equal((await sessionOf(env, res)).auth, "wallet");
  assert.deepEqual(await admin.get("/api/admin/me"), { ok: true, wallet: a.w.address, role: "owner" });
  // a member without a role: 403, no session, the challenge is not used
  const plain = W.browser(env);
  const s = await signed(plain, other.w, "admin");
  assert.deepEqual(await answer(await plain.send("/api/auth/wallet", { method: "POST", body: s })), [403, { ok: false, error: "forbidden" }]);
  assert.equal(plain.has("vs"), false);
  assert.equal((await one(env.DB, "SELECT used_at FROM auth_challenges WHERE id = ?", s.challengeId)).used_at, null);
  // an admin wallet that has no account: no_account, nothing made (no account is ever made from a signature)
  const ghost = await W.wallet();
  env.ADMIN_WALLETS = `${a.w.address},${ghost.address}`;
  assert.deepEqual(await answer(await signIn(W.browser(env), ghost, "admin")), [404, { ok: false, error: "no_account" }]);
  assert.equal(await count(env, `users WHERE wallet = '${ghost.address}'`), 0);
  // a change in the console after 30 minutes needs a fresh proof: the console's admin challenge, bound to this session
  W.advance(31 * 60_000);
  const grant = { wallet: other.w.address, role: "moderator" };
  assert.deepEqual(await admin.post("/api/admin/roles/grant", grant), { ok: false, error: "reprove" });
  assert.deepEqual(await admin.post("/api/auth/reprove", await signed(admin, a.w, "admin")), { ok: true, provenAt: "2026-10-24T12:31:00.000Z" });
  assert.deepEqual(await admin.post("/api/admin/roles/grant", grant), { ok: true, wallet: other.w.address, role: "moderator" });
});

test("the console's owner bootstrap from a half-done wallet sign-in never happens while wallet-only: no pending session counts", async () => {
  const env = W.newWorld(), w = await W.wallet(); // the v1 world: a wallet proof without an account leaves a 30-minute pending session
  env.ADMIN_WALLETS = w.address;
  const b = W.browser(env);
  assert.deepEqual(await b.post("/api/auth/wallet", await W.loginBody(w)), { ok: true, wallet: w.address, next: "social" });
  on(env, { SITE_ORIGINS: `${W.ORIGIN} https://vicinity.city` });
  const res = await handleApi(new Request("https://vicinity.city/api/admin/me", { headers: { cookie: `vs=${b.jar.get("vs")}` } }), env);
  assert.deepEqual(await res.json(), { ok: false, error: "sign_in" });
  assert.equal(await count(env, "users"), 0, "no owner row is provisioned from a signature");
});

/* ---------------------------------------------------------------- logout, and the switch's own logs */

test("logout is unchanged: the row goes, the cookie is cleared, the next request is signed out", async () => {
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const b = W.browser(env);
  const row = await sessionOf(env, await signIn(b, a.w));
  const res = await b.send("/api/auth/logout", { method: "POST", body: {} });
  assert.deepEqual(await answer(res), [200, { ok: true }]);
  assert.deepEqual(res.headers.getSetCookie(), ["vs=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"]);
  assert.equal(await one(env.DB, "SELECT id FROM sessions WHERE id = ?", row.id), null);
  assert.equal((await b.get("/api/me")).signedIn, false);
});

test("no location is read anywhere in a wallet sign-in: no attestation, no city lookup, no coordinates stored (A04, login part)", async () => {
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const before = await dumpAll(env.DB);
  const asked = [];
  const b = W.browser(env);
  b.net.tap = async ({ path }) => asked.push(path);
  // the city resolver is broken (assets unavailable): sign-in does not care
  const assets = env.ASSETS;
  env.ASSETS = { fetch: async () => { throw new Error("resolver down"); } };
  try {
    assert.equal((await signIn(b, a.w)).status, 200);
    assert.equal((await b.get("/api/me?lite=1")).signedIn, true);
  } finally { env.ASSETS = assets; }
  assert.deepEqual(asked, ["/api/auth/challenge", "/api/auth/wallet", "/api/me?lite=1"]);
  const after = await dumpAll(env.DB);
  assert.ok(!/"lat"|"lon"|latitude|longitude/.test(after.slice(before.length)), "nothing location-like was written");
});
