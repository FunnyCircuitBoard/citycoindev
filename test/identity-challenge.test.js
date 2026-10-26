// The server's wallet challenges (Citycoin.dev master v5, stage S09; master section 18 WP-02: "Sign a human-readable challenge bound to origin,
// cluster, wallet, nonce, purpose and expiry. Use one-use nonces and two-minute challenges. Verify on the server", section 05 BR-03 "Old-domain
// signed challenges and replayed callbacks cannot silently authorize new-domain sessions"; acceptance A02 and D04; src/challenge.js).
// WALLET_ONLY counts only while its own preconditions hold (src/v5policy.js walletOnly: DEPLOYMENT_ENV, SITE_ORIGIN, SITE_ORIGINS): with it off,
// POST /api/auth/challenge is an unknown path and nothing is written; set but refused, it answers 503 (the Worker fails closed, review finding
// SEC-1) and nothing is written. With it counting: the text is the server's, the row keeps hashes only, and
// a challenge is used once, inside the batch that makes the session; replay, expiry, wrong purpose, host, cluster or wallet, a changed text and
// a database that cannot answer are each refused by name. Every wallet here is a fake made in this process; no request leaves it.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../src/index.js";
import * as W from "./helpers/world.js";
import { dumpAll, journey, memberWithWallet, one, outbox, rows } from "./helpers/signup.js";
import { slowDb } from "./helpers/slowdb.js";
import { IDENTITY_POLICY, _resetPolicyCheck, checkPolicyConfig, walletOnly, walletOnlyHeld, walletOnlyRefusals } from "../src/v5policy.js";
import { FREE, ISSUED_PURPOSES, PURPOSES, buildChallengeMessage, challengeStatement } from "../src/challenge.js";
import { LEGACY_BRAND, brandOf } from "../src/brand.js";
import { sha256 } from "../src/http.js";
import { checkSigned } from "../src/signed.js";
import { base58Encode, buildMessage, statementFor } from "../src/solana.js";
import { runJobs } from "../src/jobs.js";
import { IDENTITY_MIGRATION, IDENTITY_SESSION_MIGRATION } from "../src/store.js";

beforeEach(() => { W.useClock("2026-10-24T12:00:00Z"); _resetPolicyCheck(); });
after(() => W.realClock());

/** The switch as a deployment would set it: an environment, the site's own origin (the test host) and the allowlist. */
const ON = Object.freeze({ WALLET_ONLY: "on", DEPLOYMENT_ENV: "test", SITE_ORIGIN: W.ORIGIN, SITE_ORIGINS: W.ORIGIN });
const on = (env, extra = {}) => Object.assign(env, ON, extra);
const world = (extra = {}) => W.V2(extra);
const columns = async (env, table) => (await rows(env.DB, `PRAGMA table_info(${table})`)).map((c) => c.name);
const tableNames = async (env) => (await rows(env.DB, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((r) => r.name);
const count = async (env, sql) => (await one(env.DB, `SELECT COUNT(*) AS n FROM ${sql}`)).n;

/** A browser on `origin` (the world's browser is fixed to the test host): its own cookies, Origin like a real page, the same API. */
function at(env, origin, { jar = new Map() } = {}) {
  const send = async (path, { method = "GET", body, from = origin } = {}) => {
    const headers = new Headers();
    if (from) headers.set("origin", from);
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await handleApi(new Request(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, W.chain(), null);
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split("; "); const i = pair.indexOf("="); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    return res;
  };
  return { jar, send, get: async (p) => (await send(p)).json(), post: async (p, body = {}) => (await send(p, { method: "POST", body })).json() };
}
/** Ask for a challenge and sign it with `w` (a fake wallet): the body the page would send back. */
async function signed(b, w, purpose = "login", extra = {}) {
  const c = await b.post("/api/auth/challenge", { purpose, address: w.address, ...extra });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message), issued: c };
}
const bodyOf = ({ issued, ...body }) => body;
const answer = async (res) => [res.status, await res.json()];

/* ---------------------------------------------------------------- the switch */

test("WALLET_ONLY counts only with every precondition; each missing one is named; a value outside its set holds closed", () => {
  assert.equal(walletOnly({}), false);
  assert.equal(walletOnly({ WALLET_ONLY: "on" }), false);
  assert.deepEqual(walletOnlyRefusals({ WALLET_ONLY: "on" }), ["WALLET_ONLY_SITE_REFUSED", "WALLET_ONLY_POLICY_REFUSED"]);
  assert.deepEqual(walletOnlyRefusals({ WALLET_ONLY: "on", DEPLOYMENT_ENV: "test" }), ["WALLET_ONLY_SITE_REFUSED", "WALLET_ONLY_POLICY_REFUSED"], "no site origins");
  assert.deepEqual(walletOnlyRefusals({ ...ON, DEPLOYMENT_ENV: "" }), ["WALLET_ONLY_POLICY_REFUSED"], "no environment (ENVIRONMENT_UNSET)");
  assert.deepEqual(walletOnlyRefusals({ ...ON, SITE_ORIGINS: "" }), ["WALLET_ONLY_SITE_REFUSED", "WALLET_ONLY_POLICY_REFUSED"], "SITE_ORIGIN outside today's allowlist");
  assert.deepEqual(walletOnlyRefusals({ ...ON, SITE_ORIGIN: "http://vicinity.test" }), ["WALLET_ONLY_SITE_REFUSED", "WALLET_ONLY_POLICY_REFUSED"]);
  // an error in another input refuses only its own feature, never wallet-only sign-in (review finding SEC-1)
  for (const extra of [{ LEGACY_LINK: "on" }, { LEGACY_LINK: "on", LEGACY_LINK_UNTIL: "2026-12-31 00:00" }, { OFFICIAL_X_URL: "x.com/citycoin" },
    { MAIN_TOKEN_MINT: "not-a-mint" }, { LEGACY_LINK: "maybe" }]) {
    assert.deepEqual(walletOnlyRefusals({ ...ON, ...extra }), [], JSON.stringify(extra));
    assert.equal(walletOnly({ ...ON, ...extra }), true, JSON.stringify(extra));
    assert.equal(walletOnlyHeld({ ...ON, ...extra }), false, JSON.stringify(extra));
  }
  assert.deepEqual(walletOnlyRefusals(ON), []);
  // set on but refused by its own inputs: held (fail closed); unset or off: neither
  for (const env of [{ WALLET_ONLY: "on" }, { ...ON, DEPLOYMENT_ENV: "" }, { ...ON, SITE_ORIGINS: "" }, { ...ON, SITE_ORIGIN: "http://vicinity.test" }]) {
    assert.equal(walletOnlyHeld(env), true, JSON.stringify(env));
    assert.equal(walletOnly(env), false, JSON.stringify(env));
  }
  for (const env of [{}, { ...ON, WALLET_ONLY: "off" }, ON]) assert.equal(walletOnlyHeld(env), false, JSON.stringify(env));
  // a value outside the switch's set ("true", a typo) holds closed, like LEGACY_SEATS (go-live review finding GL-SAFE-2; before, it read as off)
  for (const v of ["true", "yes", "1"]) {
    assert.equal(walletOnlyHeld({ ...ON, WALLET_ONLY: v }), true, v);
    assert.equal(walletOnly({ ...ON, WALLET_ONLY: v }), false, v);
    assert.ok(walletOnlyRefusals({ ...ON, WALLET_ONLY: v }).includes("WALLET_ONLY_VALUE_REFUSED"), v);
  }
  for (const v of ["on", " ON ", "On"]) assert.equal(walletOnly({ ...ON, WALLET_ONLY: v }), true, v);
  for (const v of ["off", "true", "1", "yes", "", undefined]) assert.equal(walletOnly({ ...ON, WALLET_ONLY: v }), false, String(v));
  const throwing = new Proxy({}, { get: () => { throw new Error("boom"); } });
  assert.equal(walletOnly(throwing), false);
  assert.equal(walletOnlyHeld(throwing), false, "a switch that cannot be read reads as unset");
  assert.deepEqual(IDENTITY_POLICY, { challengeSeconds: 120, handoffSeconds: 300, challengeSingleUse: true, challengeBinds: ["origin", "cluster", "wallet", "nonce", "purpose", "expiry"],
    policyVersion: "citycoin-master-v5" }); // (stage S11: the version a verified location records)
});

test("a switch set on but refused says why, once per isolate, as codes only; unset says nothing", () => {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  checkPolicyConfig({}, { log });
  assert.deepEqual(lines, []);
  checkPolicyConfig({ WALLET_ONLY: "on" }, { log });
  checkPolicyConfig({ WALLET_ONLY: "on" }, { log });
  assert.ok(lines.includes("wallet-only switch refused WALLET_ONLY_SITE_REFUSED"), lines.join("\n"));
  assert.ok(lines.includes("wallet-only switch refused WALLET_ONLY_POLICY_REFUSED"));
  assert.ok(lines.some((l) => l.startsWith("policy config refused ENVIRONMENT_UNSET")) && lines.some((l) => l.startsWith("policy config refused MISSING_SITE_ORIGINS")));
  assert.equal(lines.filter((l) => l === "wallet-only switch refused WALLET_ONLY_POLICY_REFUSED").length, 1, "once per isolate");
  _resetPolicyCheck(); lines.length = 0;
  checkPolicyConfig(ON, { log });
  assert.deepEqual(lines, [], "an accepted deployment logs nothing");
});

test("switch off: POST /api/auth/challenge is an unknown path for every method, and nothing is written", async () => {
  // (a value outside the switch's set, such as "true", is held now, not off: the 503 test below; go-live review finding GL-SAFE-2)
  for (const extra of [{}, { ...ON, WALLET_ONLY: "off" }]) {
    const env = world(extra), b = W.browser(env), w = await W.wallet();
    const before = await tableNames(env);
    for (const method of ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
      const body = method === "POST" || method === "PUT" ? { purpose: "login", address: w.address } : undefined;
      const res = await b.send("/api/auth/challenge", { method, body });
      const unknown = await b.send("/api/no-such-route-zq", { method, body });
      assert.deepEqual([res.status, await res.text(), [...res.headers]], [unknown.status, await unknown.text(), [...unknown.headers]], `${JSON.stringify(extra)} ${method}`);
      assert.equal(res.status, 404);
    }
    assert.deepEqual(await tableNames(env), before);
    assert.ok(!(await tableNames(env)).includes("auth_challenges"));
    assert.ok(!(await columns(env, "sessions")).includes("auth"), "no new column");
  }
});

test("set on but refused (review finding SEC-1): the sign-in routes fail closed with 503 for every method, never today's; nothing is written", async () => {
  for (const extra of [{ WALLET_ONLY: "on" }, { ...ON, DEPLOYMENT_ENV: "" }, { WALLET_ONLY: "on", DEPLOYMENT_ENV: "test" }, { ...ON, WALLET_ONLY: "true" }]) {
    const env = world(extra), b = W.browser(env), w = await W.wallet();
    const before = await tableNames(env);
    for (const path of ["/api/auth/challenge", "/api/auth/wallet", "/api/auth/reprove", "/api/pair", "/api/pair/status", "/api/pair/finish", "/api/signup/start", "/api/signup/location"]) {
      for (const method of ["GET", "POST", "PUT", "DELETE"]) {
        const body = method === "POST" || method === "PUT" ? { purpose: "login", address: w.address } : undefined;
        const res = await b.send(path, { method, body });
        assert.deepEqual([res.status, await res.json()], [503, { ok: false, error: "unavailable" }], `${JSON.stringify(extra)} ${method} ${path}`);
      }
    }
    assert.deepEqual(await tableNames(env), before);
  }
});

/* ---------------------------------------------------------------- the text and the row */

test("the challenge is the server's exact human-readable text: origin, cluster, wallet, purpose, nonce, expiry, free and not a transaction", async () => {
  const env = on(world()), b = W.browser(env), w = await W.wallet();
  const c = await b.post("/api/auth/challenge", { purpose: "login", address: w.address });
  assert.deepEqual(Object.keys(c).sort(), ["challengeId", "expiresAt", "message", "ok", "purpose", "statement"]);
  assert.match(c.challengeId, /^[0-9a-f]{32}$/);
  assert.equal(c.statement, "Sign in to Vicinity with this wallet. Free, not a transaction, cannot move funds.");
  assert.equal(c.expiresAt, "2026-10-24T12:02:00.000Z", "two minutes");
  const lines = c.message.split("\n");
  const nonce = lines[8].slice("Nonce: ".length);
  assert.match(nonce, /^[1-9A-HJ-NP-Za-km-z]{16,24}$/);
  assert.equal(c.message, [
    "vicinity.test wants you to sign in with your Solana account:",
    w.address,
    "",
    "Sign in to Vicinity with this wallet. Free, not a transaction, cannot move funds.",
    "",
    "URI: https://vicinity.test",
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${nonce}`,
    "Issued At: 2026-10-24T12:00:00.000Z",
    "Expiration Time: 2026-10-24T12:02:00.000Z",
    "Request ID: login",
  ].join("\n"));
  // the row: hashes of the nonce and of the text, never either of them
  const row = await one(env.DB, "SELECT * FROM auth_challenges WHERE id = ?", c.challengeId);
  assert.deepEqual(row, { id: c.challengeId, nonce_hash: await sha256(nonce), purpose: "login", host: "vicinity.test", cluster: "mainnet", wallet: w.address, ref: null,
    message_hash: await sha256(c.message), created_at: "2026-10-24T12:00:00.000Z", expires_at: "2026-10-24T12:02:00.000Z", used_at: null, used_by: null });
  const dump = await dumpAll(env.DB);
  assert.ok(!dump.includes(nonce) && !dump.includes("Sign in to Vicinity"), "neither the nonce nor the text is stored");
  // the migration records itself, and sessions gets its nullable sign-in kind
  assert.deepEqual((await rows(env.DB, "SELECT id FROM schema_migrations WHERE id LIKE '2026-10-24-identity%' ORDER BY id")).map((r) => r.id), [IDENTITY_MIGRATION.id, IDENTITY_SESSION_MIGRATION.id]);
  assert.ok((await columns(env, "sessions")).includes("auth"));
  // and the policy's two minutes are the only lifetime
  assert.equal(Date.parse(c.expiresAt) - Date.now(), IDENTITY_POLICY.challengeSeconds * 1000);
});

test("each purpose's statement comes from the product's labels and keeps today's 'Free, not a transaction' sentence", () => {
  const b = brandOf({});
  assert.equal(b.productName, LEGACY_BRAND.productName);
  assert.equal(FREE, "Free, not a transaction, cannot move funds.");
  assert.equal(challengeStatement("login", b), `Sign in to Vicinity with this wallet. ${FREE}`);
  assert.equal(challengeStatement("login", b, { pin: "42" }), `Sign in to Vicinity on my other device (check number 42). ${FREE}`);
  assert.equal(challengeStatement("register", b, { city: "Utica", country: "US" }), `Register this wallet on Vicinity for Utica, US. ${FREE}`);
  assert.equal(challengeStatement("reprove", b), `Confirm this wallet again on Vicinity for a sensitive action. ${FREE}`);
  assert.equal(challengeStatement("admin", b), `Use this wallet for the Vicinity admin console. ${FREE}`);
  // a later label set flips every statement (the label migration S48 adds one); a line break can never enter the text
  const other = { ...LEGACY_BRAND, productName: "Example\nProduct" };
  assert.equal(challengeStatement("login", other), `Sign in to Example Product with this wallet. ${FREE}`);
  assert.equal(challengeStatement("register", b, { city: "Bad\nCity\u2028", country: "U\rS" }), `Register this wallet on Vicinity for Bad City, U S. ${FREE}`);
  assert.throws(() => challengeStatement("legacy_link", b), /unknown purpose/);
  assert.throws(() => challengeStatement("verify", b), /unknown purpose/);
  assert.deepEqual(PURPOSES, ["login", "register", "reprove", "admin", "legacy_link"]);
  assert.deepEqual(ISSUED_PURPOSES, ["login", "register", "reprove", "admin"]);
  // today's statements are untouched (pinned for the legacy window: test/persist-guard.test.js)
  assert.equal(statementFor("login"), `Sign in to Vicinity with this wallet. ${FREE}`);
  const m = buildChallengeMessage({ host: "h.test", origin: "https://h.test", address: "A", statement: "S", cluster: "devnet", nonce: "N", issuedAt: "I", expiresAt: "E", purpose: "admin" });
  assert.deepEqual(m.split("\n").slice(5), ["URI: https://h.test", "Version: 1", "Chain ID: devnet", "Nonce: N", "Issued At: I", "Expiration Time: E", "Request ID: admin"]);
});

test("purposes: login (optionally for a live login pairing), admin, reprove (signed in, own wallet), register (city resolved first); others refused", async () => {
  const env = world(), box = outbox(), w = await W.wallet();
  const m = await memberWithWallet(env, box, { via: "google" }); // a member made by today's sign-up, before the switch
  on(env);
  const b = W.browser(env);
  const ask = (body, who = b) => who.send("/api/auth/challenge", { method: "POST", body });
  assert.deepEqual(await answer(await ask({ purpose: "legacy_link", address: w.address })), [400, { ok: false, error: "bad_purpose" }], "the legacy link window is stage S14");
  for (const purpose of ["verify", "link", "", 7, null, "LOGIN"]) assert.deepEqual(await answer(await ask({ purpose, address: w.address })), [400, { ok: false, error: "bad_purpose" }], String(purpose));
  assert.deepEqual(await answer(await ask({ purpose: "login", address: "not-an-address" })), [400, { ok: false, error: "bad_address" }]);
  assert.deepEqual(await answer(await ask({ purpose: "admin", address: w.address, pair: "x" })), [400, { ok: false, error: "bad_request" }]);
  assert.deepEqual(await answer(await ask({ purpose: "reprove", address: w.address })), [401, { ok: false, error: "sign_in" }]);
  assert.deepEqual(await answer(await ask({ purpose: "register", address: w.address })), [409, { ok: false, error: "location_required" }]);
  assert.deepEqual(await answer(await ask({ purpose: "login", address: w.address, pair: "no-such-pairing-code-zq" })), [410, { ok: false, error: "pair_expired" }]);
  assert.deepEqual(await answer(await b.send("/api/auth/challenge", { method: "POST", body: { purpose: "login", address: w.address }, origin: "https://evil.example" })), [403, { ok: false, error: "wrong_origin" }]);
  assert.deepEqual(await answer(await b.send("/api/auth/challenge", { method: "POST", body: { purpose: "login", address: w.address }, origin: null })), [403, { ok: false, error: "wrong_origin" }]);
  // register: only once the browser's sign-up has its city and the Terms (stage S11: the order is the server's); the text names the city, and
  // the row is bound to that sign-up and that city
  const r = W.browser(env);
  await journey(r, box, { until: "location" });
  assert.deepEqual(await answer(await ask({ purpose: "register", address: w.address }, r)), [409, { ok: false, error: "terms_required" }]);
  assert.equal((await r.post("/api/signup/terms", { version: "2026-10-01" })).ok, true);
  const reg = await (await ask({ purpose: "register", address: w.address }, r)).json();
  assert.equal(reg.statement, `Register this wallet on Vicinity for Utica, US. ${FREE}`);
  const signup = await one(env.DB, "SELECT id FROM signups ORDER BY created_at DESC LIMIT 1");
  assert.equal((await one(env.DB, "SELECT ref FROM auth_challenges WHERE id = ?", reg.challengeId)).ref, `s:${signup.id}:5142056`);
  // reprove: the signed-in member's own wallet only, bound to the session
  const login = await signed(m.b, m.w);
  assert.equal((await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(login) })).status, 200);
  assert.deepEqual(await answer(await ask({ purpose: "reprove", address: w.address }, m.b)), [403, { ok: false, error: "wrong_wallet" }]);
  const rp = await (await ask({ purpose: "reprove", address: m.w.address }, m.b)).json();
  const sid = (await one(env.DB, "SELECT id FROM sessions WHERE user_id IS NOT NULL AND auth = 'wallet'")).id;
  assert.equal((await one(env.DB, "SELECT ref FROM auth_challenges WHERE id = ?", rp.challengeId)).ref, sid);
  // admin: anyone may ask (the role is checked when the answer comes back); signed in with this wallet it is bound to the session too
  const ad = await (await ask({ purpose: "admin", address: m.w.address }, m.b)).json();
  assert.equal(ad.statement, `Use this wallet for the Vicinity admin console. ${FREE}`);
  assert.equal((await one(env.DB, "SELECT ref FROM auth_challenges WHERE id = ?", ad.challengeId)).ref, sid);
  const anon = await (await ask({ purpose: "admin", address: w.address })).json();
  assert.equal((await one(env.DB, "SELECT ref FROM auth_challenges WHERE id = ?", anon.challengeId)).ref, null);
});

test("the cluster comes from the deployment's configuration; a challenge issued for one cluster is refused under another", async () => {
  const env = world({ LAUNCHPAD_CLUSTER: "devnet" }), box = outbox();
  const m = await memberWithWallet(env, box, { via: "google" });
  on(env);
  const s = await signed(m.b, m.w);
  assert.match(s.message, /\nChain ID: devnet\n/);
  assert.equal((await one(env.DB, "SELECT cluster FROM auth_challenges WHERE id = ?", s.challengeId)).cluster, "devnet");
  env.LAUNCHPAD_CLUSTER = "mainnet";
  assert.deepEqual(await answer(await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })), [400, { ok: false, error: "wrong_cluster" }]);
  delete env.LAUNCHPAD_CLUSTER; // unset: mainnet, the network of the main token and the swap
  const t = await signed(m.b, m.w);
  assert.match(t.message, /\nChain ID: mainnet\n/);
  assert.equal((await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(t) })).status, 200);
});

/* ---------------------------------------------------------------- the use: once, in time, for what it says */

test("replay: a challenge works once; the same signed answer again is challenge_used and makes no second session", async () => {
  const env = world(), box = outbox();
  const m = await memberWithWallet(env, box, { via: "google" });
  on(env);
  const s = await signed(m.b, m.w);
  const first = await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) });
  assert.deepEqual(await answer(first), [200, { ok: true, wallet: m.w.address, next: "/dashboard" }]);
  const row = await one(env.DB, "SELECT used_at, used_by FROM auth_challenges WHERE id = ?", s.challengeId);
  assert.equal(row.used_at, "2026-10-24T12:00:00.000Z");
  assert.match(row.used_by, /^[A-Za-z0-9_-]{43}$/);
  const sessions = await count(env, "sessions WHERE auth = 'wallet'");
  for (const who of [m.b, W.browser(env)]) {
    assert.deepEqual(await answer(await who.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })), [409, { ok: false, error: "challenge_used" }]);
  }
  assert.equal(await count(env, "sessions WHERE auth = 'wallet'"), sessions);
});

test("expiry: two minutes from issue; at 119 seconds it works, at 120 and after it is challenge_expired and makes nothing", async () => {
  const env = world(), box = outbox();
  const m = await memberWithWallet(env, box, { via: "google" });
  on(env);
  const ok = await signed(m.b, m.w);
  W.advance(119_000);
  assert.equal((await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(ok) })).status, 200);
  const late = await signed(m.b, m.w);
  W.advance(120_000);
  const b = W.browser(env);
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: bodyOf(late) })), [410, { ok: false, error: "challenge_expired" }]);
  W.advance(3600_000);
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: bodyOf(late) })), [410, { ok: false, error: "challenge_expired" }]);
  assert.equal(b.has("vs"), false);
  assert.equal((await one(env.DB, "SELECT used_at FROM auth_challenges WHERE id = ?", late.challengeId)).used_at, null);
});

test("wrong purpose: a register, reprove or admin challenge never signs in as login, and a login challenge never re-proves", async () => {
  const env = world(), box = outbox();
  const m = await memberWithWallet(env, box, { via: "google" });
  on(env);
  assert.equal((await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(await signed(m.b, m.w)) })).status, 200);
  // register (a browser whose city is resolved) answered at the sign-in route
  const r = W.browser(env);
  await journey(r, box, { until: "terms" });
  const reg = await signed(r, m.w, "register");
  assert.deepEqual(await answer(await r.send("/api/auth/wallet", { method: "POST", body: bodyOf(reg) })), [400, { ok: false, error: "wrong_purpose" }]);
  // reprove answered at the sign-in route; login answered at the re-proof route
  const rp = await signed(m.b, m.w, "reprove");
  assert.deepEqual(await answer(await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(rp) })), [400, { ok: false, error: "wrong_purpose" }]);
  const li = await signed(m.b, m.w, "login");
  assert.deepEqual(await answer(await m.b.send("/api/auth/reprove", { method: "POST", body: bodyOf(li) })), [400, { ok: false, error: "wrong_purpose" }]);
  // a login challenge cannot approve a pairing it was not issued for (the text names the pairing's check number)
  const computer = W.browser(env);
  const pair = await computer.post("/api/pair");
  assert.deepEqual(await answer(await m.b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(await signed(m.b, m.w)), pair: pair.code } })), [400, { ok: false, error: "bad_message" }]);
  assert.equal(await count(env, `auth_challenges WHERE used_at IS NOT NULL`), 1, "only the first sign-in used a challenge");
});

test("wrong host (D04): a challenge issued on one host is refused on every other, the legacy host included", async () => {
  const env = world(), box = outbox();
  const m = await memberWithWallet(env, box, { via: "google" });
  on(env, { SITE_ORIGINS: `${W.ORIGIN} https://citycoin.test` });
  const s = await signed(m.b, m.w); // issued on vicinity.test
  // the legacy host is an accepted host only while SITE_ORIGINS lists vicinity.city (stage S55, src/site-config.js servesLegacy): with this
  // list it is refused before any route (421 wrong_host; until S55 it was accepted and answered wrong_site), and with vicinity.city listed it
  // refuses the signature by its text, like any other host. Either way nothing is signed in or used there.
  for (const [origin, refusal, extra] of [["https://citycoin.test", [400, { ok: false, error: "wrong_site" }]],
    ["https://vicinity.city", [421, { error: "wrong_host", origin: W.ORIGIN }]],
    ["https://vicinity.city", [400, { ok: false, error: "wrong_site" }], { SITE_ORIGINS: `${W.ORIGIN} https://citycoin.test https://vicinity.city` }]]) {
    if (extra) on(env, extra);
    const other = at(env, origin);
    assert.deepEqual(await answer(await other.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })), refusal, `${origin} ${JSON.stringify(extra || {})}`);
    assert.equal(other.jar.size, 0);
  }
  on(env, { SITE_ORIGINS: `${W.ORIGIN} https://citycoin.test` });
  // a challenge issued on citycoin.test names it, and works there only
  const cc = at(env, "https://citycoin.test");
  const c = await cc.post("/api/auth/challenge", { purpose: "login", address: m.w.address });
  assert.match(c.message, /^citycoin\.test wants you to sign in with your Solana account:\n[\s\S]*\nURI: https:\/\/citycoin\.test\n/);
  const body = { challengeId: c.challengeId, address: m.w.address, message: c.message, signature: await m.w.sign(c.message) };
  assert.deepEqual(await answer(await m.b.send("/api/auth/wallet", { method: "POST", body })), [400, { ok: false, error: "wrong_site" }]);
  assert.equal((await cc.send("/api/auth/wallet", { method: "POST", body })).status, 200);
  assert.equal((await one(env.DB, "SELECT host FROM sessions WHERE auth = 'wallet'")).host, "citycoin.test");
  // and the original is still good on its own host
  assert.equal((await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })).status, 200);
});

test("wrong wallet, spoofed address, changed text: refused by name, nothing used", async () => {
  const env = world(), box = outbox();
  const a = await memberWithWallet(env, box, { via: "google" }), b2 = await memberWithWallet(env, box, { via: "google" });
  on(env);
  const s = await signed(a.b, a.w);
  const b = W.browser(env);
  // another wallet answers (its own signature over the text issued for the first)
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), address: b2.w.address, signature: await b2.w.sign(s.message) } })), [403, { ok: false, error: "wrong_wallet" }]);
  // the right address with another wallet's signature (spoofed address)
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), signature: await b2.w.sign(s.message) } })), [401, { ok: false, error: "signature_mismatch" }]);
  // a changed text, signed by the right wallet
  const changed = s.message.replace("Chain ID: mainnet", "Chain ID: devnet");
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), message: changed, signature: await a.w.sign(changed) } })), [400, { ok: false, error: "bad_message" }]);
  // the text of another challenge under this id
  const t = await signed(a.b, a.w);
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), message: t.message, signature: t.signature } })), [400, { ok: false, error: "bad_message" }]);
  // broken shapes
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), signature: "!!" } })), [400, { ok: false, error: "bad_signature" }]);
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), message: "x".repeat(1201) } })), [400, { ok: false, error: "bad_message" }]);
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), challengeId: "0".repeat(32) } })), [400, { ok: false, error: "challenge_unknown" }]);
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), challengeId: "' OR 1=1 --" } })), [400, { ok: false, error: "challenge_unknown" }]);
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: { ...bodyOf(s), address: "x" } })), [400, { ok: false, error: "bad_address" }]);
  // today's signed message (no challenge) is not accepted while the switch counts
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: await W.loginBody(a.w) })), [400, { ok: false, error: "challenge_required" }]);
  assert.equal(await count(env, "auth_challenges WHERE used_at IS NOT NULL"), 0);
  assert.equal(b.has("vs"), false);
  // and the untouched challenge still signs its own wallet in
  assert.equal((await b.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })).status, 200);
});

test("race: two requests with one signed answer make exactly one session; the other is challenge_used", async () => {
  const base = world(), box = outbox();
  const m = await memberWithWallet(base, box, { via: "google" });
  on(base);
  const env = { ...base, DB: slowDb(base.DB, 3) };
  const s = await signed(m.b, m.w);
  const one1 = W.browser(env), two = W.browser(env);
  const [x, y] = await Promise.all([one1.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) }), two.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })]);
  const results = [[x.status, await x.json()], [y.status, await y.json()]].sort((p, q) => p[0] - q[0]);
  assert.deepEqual(results, [[200, { ok: true, wallet: m.w.address, next: "/dashboard" }], [409, { ok: false, error: "challenge_used" }]]);
  assert.equal(await count(base, "sessions WHERE auth = 'wallet'"), 1);
  assert.equal([one1, two].filter((b) => b.has("vs")).length, 1);
  // ten at once: still one
  const t = await signed(m.b, m.w);
  const many = await Promise.all(Array.from({ length: 10 }, () => W.browser(env).send("/api/auth/wallet", { method: "POST", body: bodyOf(t) })));
  assert.deepEqual(many.map((r) => r.status).sort(), [200, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
  assert.equal(await count(base, "sessions WHERE auth = 'wallet'"), 2);
});

/* ---------------------------------------------------------------- fail closed */

/** A database whose statements on `match` fail (like a D1 outage on that table), everything else as usual. */
function failing(db, match, { when = () => true } = {}) {
  const bad = (sql) => match.test(sql) && when(sql);
  const wrap = (stmt) => ({
    sql: stmt.sql, inner: stmt, bind: (...p) => wrap(stmt.bind(...p)),
    first: async (...a) => { if (bad(stmt.sql)) throw new Error("D1_ERROR: simulated"); return stmt.first(...a); },
    run: async () => { if (bad(stmt.sql)) throw new Error("D1_ERROR: simulated"); return stmt.run(); },
    all: async () => { if (bad(stmt.sql)) throw new Error("D1_ERROR: simulated"); return stmt.all(); },
  });
  return { ...db, prepare: (sql) => wrap(db.prepare(sql)), batch: async (list) => { if (list.some((s) => bad(s.sql))) throw new Error("D1_ERROR: simulated"); return db.batch(list.map((s) => s.inner || s)); } };
}

test("D1 failure fails closed: no challenge is issued, read or used while the database cannot answer, and nothing is made", async () => {
  const base = world(), box = outbox();
  const m = await memberWithWallet(base, box, { via: "google" });
  on(base);
  const s = await signed(m.b, m.w);
  const quiet = console.error; console.error = () => {};
  try {
    // issuing: the insert fails
    const noInsert = { ...base, DB: failing(base.DB, /INSERT INTO auth_challenges/) };
    assert.deepEqual(await answer(await W.browser(noInsert).send("/api/auth/challenge", { method: "POST", body: { purpose: "login", address: m.w.address } })), [503, { ok: false, error: "unavailable" }]);
    // checking: the read fails
    const noRead = { ...base, DB: failing(base.DB, /SELECT \* FROM auth_challenges/) };
    const b = W.browser(noRead);
    assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })), [503, { ok: false, error: "unavailable" }]);
    // using: the batch that uses it and makes the session fails as a whole
    const noUse = { ...base, DB: failing(base.DB, /UPDATE auth_challenges/) };
    assert.deepEqual(await answer(await W.browser(noUse).send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })), [503, { ok: false, error: "unavailable" }]);
    // the session insert fails: the challenge is not used either (one transaction)
    const noSession = { ...base, DB: failing(base.DB, /INSERT INTO sessions/) };
    assert.deepEqual(await answer(await W.browser(noSession).send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })), [503, { ok: false, error: "unavailable" }]);
    assert.equal((await one(base.DB, "SELECT used_at FROM auth_challenges WHERE id = ?", s.challengeId)).used_at, null);
    assert.equal(await count(base, "sessions WHERE auth = 'wallet'"), 0);
    // the identity tables cannot be made at all (a fresh database whose migration fails): refused, never accepted unchecked
    const fresh = on(world());
    const broken = { ...fresh, DB: failing(fresh.DB, /auth_challenges|ADD COLUMN auth/) };
    assert.deepEqual(await answer(await W.browser(broken).send("/api/auth/challenge", { method: "POST", body: { purpose: "login", address: m.w.address } })), [503, { ok: false, error: "unavailable" }]);
    assert.deepEqual(await answer(await W.browser(broken).send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })), [503, { ok: false, error: "unavailable" }]);
  } finally { console.error = quiet; }
  // once the database answers again the same challenge works (it was never used)
  assert.equal((await m.b.send("/api/auth/wallet", { method: "POST", body: bodyOf(s) })).status, 200);
});

test("today's signed-message check: with the switch off a used-message store that cannot answer lets the message through as before; while it counts, refused", async () => {
  const quiet = console.error; console.error = () => {};
  try {
    const w = await W.wallet();
    const nonce = base58Encode(crypto.getRandomValues(new Uint8Array(16)));
    const message = buildMessage({ host: W.HOST, address: w.address, nonce, issuedAt: new Date(Date.now()).toISOString() });
    const body = { address: w.address, message, signature: await w.sign(message) };
    const req = new Request(W.ORIGIN + "/api/verify", { method: "POST" });
    const bad = (error, status = 400) => ({ error: { error, status } });
    const db = failing(W.newWorld().DB, /used_nonces/);
    const today = await checkSigned(body, req, Date.now(), ["verify"], bad, db, W.HOST);
    assert.equal(today.parsed.address, w.address, "switch off: accepted as always (fail-open kept)");
    assert.deepEqual((await checkSigned(body, req, Date.now(), ["verify"], bad, db, W.HOST, {})).parsed.address, w.address);
    assert.deepEqual(await checkSigned(body, req, Date.now(), ["verify"], bad, db, W.HOST, { strict: true }), { error: { error: "unavailable", status: 503 } });
    // through the route: /api/verify with the store failing
    for (const [extra, status] of [[{}, 200], [ON, 503]]) {
      const env = { ...world(extra), DB: failing(W.newWorld().DB, /used_nonces/) };
      const res = await W.browser(env).send("/api/verify", { method: "POST", body });
      assert.equal(res.status, status, JSON.stringify(extra));
    }
  } finally { console.error = quiet; }
});

/* ---------------------------------------------------------------- housekeeping */

test("the scheduled job deletes expired challenges while the switch counts, and touches nothing of it while it is off", async () => {
  const env = world(), box = outbox();
  const m = await memberWithWallet(env, box, { via: "google" });
  on(env);
  await signed(m.b, m.w);
  const keep = await signed(m.b, m.w);
  await env.DB.prepare("UPDATE auth_challenges SET expires_at = '2026-10-24T11:00:00.000Z' WHERE id != ?").bind(keep.challengeId).run();
  await W.tick(env);
  assert.deepEqual((await rows(env.DB, "SELECT id FROM auth_challenges")).map((r) => r.id), [keep.challengeId]);
  const off = world();
  await runJobs(off, Date.now(), W.chain(), () => 0.99);
  assert.ok(!(await tableNames(off)).includes("auth_challenges"));
});
