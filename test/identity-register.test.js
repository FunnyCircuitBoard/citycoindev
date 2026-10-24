// Wallet-only first-time registration (Citycoin.dev master v5, stage S11; master section 19 WP-03 "Exact registration sequence" and its
// acceptance "First signup uses browser location before wallet ... Test denied/cancelled location, stale/duplicate handoff, wrong-wallet
// return, concurrent signup", section 18 WP-02 "Concurrent first signups upsert/return the same account", acceptance A01 (race), A03 (order,
// no coordinates kept), A04 (returning login never locates); src/register.js, src/register-core.js). While WALLET_ONLY counts: the browser's
// location first, then the Terms and an optional display name, then the wallet (this browser's, a five-minute hand-off code for the wallet
// app's browser, or a register pairing); one batch makes the account from the sign-up row, keyed by the wallet (users.wallet UNIQUE); a lost
// race gets the same account, its city unchanged. With the switch off, or set but refused: today's sign-up. Fake wallets only.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as W from "./helpers/world.js";
import { TERMS, dumpAll, member, memberWithWallet, one, outbox, rows, userOf } from "./helpers/signup.js";
import { _resetPolicyCheck } from "../src/v5policy.js";
import { sha256 } from "../src/http.js";
import { parseRef, readBind } from "../src/register-core.js";

beforeEach(() => { W.useClock("2026-10-24T12:00:00Z"); _resetPolicyCheck(); });
after(() => W.realClock());

const ON = Object.freeze({ WALLET_ONLY: "on", DEPLOYMENT_ENV: "test", SITE_ORIGIN: W.ORIGIN, SITE_ORIGINS: W.ORIGIN });
const on = (env, extra = {}) => Object.assign(env, ON, extra);
const count = async (env, sql) => (await one(env.DB, `SELECT COUNT(*) AS n FROM ${sql}`)).n;
const answer = async (res) => [res.status, await res.json()];
const FREE = "Free, not a transaction, cannot move funds.";

/** Location (default: inside Utica), then the Terms (and, with `name`, a display name): a registration ready for the wallet. */
async function ready(b, { point = W.IN_UTICA, choice, terms = true, name } = {}) {
  const start = await b.post("/api/signup/start");
  assert.equal(start.ok, true, JSON.stringify(start));
  const loc = await b.post("/api/signup/location", { location: point, country: "US" });
  assert.equal(loc.ok, true, JSON.stringify(loc));
  if (choice) assert.equal((await b.post("/api/signup/location/choice", { id: choice })).ok, true);
  if (terms) assert.equal((await b.post("/api/signup/terms", { version: TERMS })).ok, true);
  if (name) assert.equal((await b.post("/api/signup/name", { displayName: name })).ok, true);
  return loc;
}
async function challenge(b, w, extra = {}) {
  const c = await b.post("/api/auth/challenge", { purpose: "register", address: w.address, ...extra });
  assert.equal(c.ok, true, JSON.stringify(c));
  return c;
}
const answerOf = async (c, w, signer = w) => ({ challengeId: c.challengeId, address: w.address, message: c.message, signature: await signer.sign(c.message) });
async function registerHere(b, w, extra = {}) {
  const c = await challenge(b, w);
  return b.send("/api/signup/wallet", { method: "POST", body: { ...(await answerOf(c, w)), ...extra } });
}
const loginWith = async (b, w) => {
  const c = await b.post("/api/auth/challenge", { purpose: "login", address: w.address });
  return b.send("/api/auth/wallet", { method: "POST", body: await answerOf(c, w) });
};
const sessionOf = async (env, res) => {
  const c = res.headers.getSetCookie().find((x) => x.startsWith("vs=") && !/Max-Age=0$/.test(x));
  return c ? one(env.DB, "SELECT * FROM sessions WHERE id = ?", await sha256(decodeURIComponent(c.slice(3).split(";")[0]))) : null;
};
/** Today's population (made by today's sign-up before the switch): a member with a wallet, one Google-only member. */
async function population(env, box) {
  const a = await memberWithWallet(env, box, { via: "google" });
  const g = await member(env, box, { via: "google" });
  return { a, g };
}

/* ---------------------------------------------------------------- the order (A03) */

test("A03 order: no wallet step before the location, then none before the Terms; the state says location → terms → wallet", async () => {
  const env = W.V2(), box = outbox();
  await population(env, box);
  on(env);
  const b = W.browser(env), w = await W.wallet();
  const start = await b.post("/api/signup/start");
  assert.deepEqual(start.state, { terms: { done: false, version: TERMS }, location: { done: false }, name: null, next: "location" });
  const refusedAll = async (error) => {
    assert.deepEqual(await answer(await b.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: w.address } })), [409, { ok: false, error }]);
    assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: { challengeId: "0".repeat(32), address: w.address, message: "x", signature: "x" } })), [409, { ok: false, error }]);
    assert.deepEqual(await answer(await b.send("/api/signup/handoff", { method: "POST", body: { app: "phantom" } })), [409, { ok: false, error }]);
    assert.deepEqual(await answer(await b.send("/api/pair", { method: "POST", body: { purpose: "register" } })), [409, { ok: false, error }]);
  };
  await refusedAll("location_required");
  // a denied or cancelled location (the page sends nothing, or nothing usable): today's answer, and still nothing further is possible
  assert.deepEqual(await answer(await b.send("/api/signup/location", { method: "POST", body: { country: "US" } })), [400, { ok: false, error: "location_required" }]);
  assert.deepEqual(await answer(await b.send("/api/signup/location", { method: "POST", body: { location: { lat: 43.1, lon: -75.23, accuracy: 50_000 }, country: "US" } })),
    [403, { ok: false, error: "location_unverified" }], "too imprecise: the existing accuracy check");
  await refusedAll("location_required");
  // the Terms before the location are accepted (today's route) but the wallet still waits for the location
  assert.equal((await b.post("/api/signup/terms", { version: TERMS })).state.next, "location");
  await refusedAll("location_required");
  const loc = await b.post("/api/signup/location", { location: W.IN_UTICA, country: "US" });
  assert.deepEqual(loc, { ok: true, community: { id: "5142056", name: "Utica", country: "US" } });
  assert.equal((await b.get("/api/signup/state")).state.next, "wallet");
  // a fresh browser: location, then the Terms are still open
  const b2 = W.browser(env);
  await ready(b2, { terms: false });
  assert.equal((await b2.get("/api/signup/state")).state.next, "terms");
  const terms = async (error) => assert.deepEqual(await answer(await b2.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: w.address } })), [409, { ok: false, error }]);
  await terms("terms_required");
  assert.equal(await count(env, "auth_challenges"), 0, "no register challenge was ever issued before the location and the Terms");
});

/* ---------------------------------------------------------------- this browser's own wallet */

test("first registration in this browser: one account with the sign-up's city, Terms and display name, a wallet session, no coordinate kept anywhere", async () => {
  const env = W.V2(), box = outbox();
  await population(env, box);
  on(env);
  const logs = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
  let res, b, w;
  try {
    b = W.browser(env); w = await W.wallet();
    await ready(b, { name: "Riverwalker" });
    assert.deepEqual((await b.get("/api/signup/state")).state, { terms: { done: true, version: TERMS }, location: { done: true, community: { id: "5142056", name: "Utica", country: "US" } },
      name: "Riverwalker", next: "wallet" });
    const c = await challenge(b, w);
    assert.equal(c.statement, `Register this wallet on Vicinity for Utica, US. ${FREE}`);
    const signupRow = await one(env.DB, "SELECT * FROM signups ORDER BY created_at DESC LIMIT 1");
    res = await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(c, w) });
  } finally { Object.assign(console, orig); }
  const body = await res.json();
  const u = await one(env.DB, "SELECT * FROM users WHERE wallet = ?", w.address);
  assert.deepEqual([res.status, body], [200, { ok: true, existing: false, wallet: w.address, user: { id: u.id, handle: "Riverwalker", city: { id: "5142056", name: "Utica", country: "US" } }, next: "/dashboard?welcome=1" }]);
  const cookies = res.headers.getSetCookie();
  assert.match(cookies[0], /^vs=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
  assert.match(cookies[1], /^vsu=; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0$/);
  const now = "2026-10-24T12:00:00.000Z";
  assert.deepEqual({ provider: u.provider, provider_id: u.provider_id, name: u.name, home: [u.home_city, u.home_name, u.home_country, u.home_at], terms: [u.terms_version, u.terms_agreed_at],
    wallet: [u.wallet_at, u.wallet_via, u.wallet_app], completed: u.signup_completed_at, loc: [u.loc_verified_at, u.loc_policy, u.loc_method], password: u.password_hash },
  { provider: "wallet", provider_id: w.address, name: null, home: ["5142056", "Utica", "US", now], terms: [TERMS, now], wallet: [now, "register", null], completed: now,
    loc: [now, "citycoin-master-v5", "inside"], password: null });
  const s = await sessionOf(env, res);
  assert.deepEqual({ ...s, id: "x" }, { id: "x", wallet: w.address, user_id: u.id, proof: null, created_at: now, expires_at: "2026-11-23T12:00:00.000Z", proven_at: now,
    made_by: null, host: "vicinity.test", auth: "wallet" });
  assert.equal(await count(env, "signups"), 0, "the sign-up is spent");
  const me = await b.get("/api/me");
  assert.deepEqual([me.signedIn, me.user.id, me.user.home.name, me.user.provider, me.walletOnly], [true, u.id, "Utica", "wallet", true]);
  // no coordinate anywhere: no column for one, no value in any row, nothing in any log line
  for (const t of ["users", "signups", "handoffs", "sessions", "pairs", "auth_challenges"]) {
    const cols = (await rows(env.DB, `PRAGMA table_info(${t})`)).map((r) => r.name);
    assert.deepEqual(cols.filter((n) => /^(lat|lon|lng|latitude|longitude|accuracy|coords?|gps|point)$/i.test(n) || /_(lat|lon|lng)$/i.test(n)), [], t);
  }
  const all = await dumpAll(env.DB);
  for (const v of ["43.1", "-75.23", "75.23"]) assert.ok(!all.includes(v), `no coordinate ${v} in the database`);
  assert.deepEqual(logs, ["account registered"], "the only log line names no one and nothing");
  // the signed-up wallet now signs in anywhere with a login challenge (A01), with no location step (A04)
  const phone = W.browser(env);
  assert.equal((await loginWith(phone, w)).status, 200);
  assert.equal((await phone.get("/api/me?lite=1")).user.id, u.id);
});

test("in empty land: one of the three nearest, recorded as 'nearest'; an auto-made name when none was given", async () => {
  const env = W.V2();
  on(env);
  const b = W.browser(env), w = await W.wallet();
  const loc = await b.post("/api/signup/start") && await b.post("/api/signup/location", { location: W.EMPTY, country: "US" });
  assert.ok(Array.isArray(loc.choices) && loc.choices.length, JSON.stringify(loc));
  assert.deepEqual(await answer(await b.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: w.address } })), [409, { ok: false, error: "location_required" }],
    "the choice is part of the location step");
  assert.equal((await b.post("/api/signup/location/choice", { id: loc.choices[0].id })).ok, true);
  assert.equal((await b.post("/api/signup/terms", { version: TERMS })).ok, true);
  const res = await registerHere(b, w);
  assert.equal(res.status, 200);
  const u = await one(env.DB, "SELECT * FROM users WHERE wallet = ?", w.address);
  assert.deepEqual([u.home_city, u.loc_method, u.provider], [loc.choices[0].id, "nearest", "wallet"]);
  assert.match(u.handle, /^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/);
});

test("registration works whatever SIGNUP_FLOW says (unset: today's v1 sign-up when the switch is off)", async () => {
  const env = W.newWorld();
  assert.deepEqual(await answer(await W.browser(env).send("/api/signup/start", { method: "POST", body: {} })), [404, { ok: false, error: "not_enabled" }], "switch off: today's v1");
  on(env);
  const b = W.browser(env), w = await W.wallet();
  await ready(b);
  assert.equal((await registerHere(b, w)).status, 200);
  assert.equal((await one(env.DB, "SELECT home_city FROM users WHERE wallet = ?", w.address)).home_city, "5142056");
});

/* ---------------------------------------------------------------- A01: one account per wallet */

test("A01 race: two registrations of one wallet at once (two browsers, two cities) make ONE account; both answers name it; its city is the winner's", async () => {
  const env = W.V2(), box = outbox();
  await population(env, box);
  on(env);
  const users = await count(env, "users");
  const w = await W.wallet(), x = W.browser(env), y = W.browser(env);
  await ready(x, { point: W.IN_UTICA });
  await ready(y, { point: W.IN_NYC });
  const [bx, by] = [await answerOf(await challenge(x, w), w), await answerOf(await challenge(y, w), w)];
  const [rx, ry] = await Promise.all([x.send("/api/signup/wallet", { method: "POST", body: bx }), y.send("/api/signup/wallet", { method: "POST", body: by })]);
  const [ax, ay] = [await rx.json(), await ry.json()];
  assert.deepEqual([rx.status, ry.status], [200, 200]);
  assert.deepEqual([ax.existing, ay.existing].sort(), [false, true], "one made it, the other found it");
  assert.equal(ax.user.id, ay.user.id, "the same account in both answers");
  assert.equal(await count(env, "users"), users + 1);
  const winner = ax.existing ? ay : ax, loser = ax.existing ? ax : ay;
  assert.deepEqual(loser.user.city, winner.user.city, "the loser's answer shows the account's own city");
  const u = await one(env.DB, "SELECT home_city FROM users WHERE wallet = ?", w.address);
  assert.equal(u.home_city, winner.user.city.id, "the city is the first registration's, never overwritten");
  assert.equal(await count(env, `sessions WHERE user_id = ${ax.user.id} AND auth = 'wallet'`), 2, "both browsers are signed in to that one account");
  assert.equal(await count(env, "signups"), 0, "both sign-ups are spent");
});

test("A01: the same wallet registering again from another device returns the same account, city unchanged; another wallet gets its own", async () => {
  const env = W.V2();
  on(env);
  const w = await W.wallet(), first = W.browser(env);
  await ready(first, { point: W.IN_UTICA, name: "FirstOne" });
  const made = await (await registerHere(first, w)).json();
  const again = W.browser(env);
  await ready(again, { point: W.IN_NYC, name: "SecondTry" });
  const r = await (await registerHere(again, w)).json();
  assert.deepEqual([r.ok, r.existing, r.user.id, r.user.handle, r.user.city.name, r.next], [true, true, made.user.id, "FirstOne", "Utica", "/dashboard"]);
  const u = await one(env.DB, "SELECT home_city, handle, signup_completed_at FROM users WHERE wallet = ?", w.address);
  assert.deepEqual(u, { home_city: "5142056", handle: "FirstOne", signup_completed_at: "2026-10-24T12:00:00.000Z" });
  const other = await W.wallet(), third = W.browser(env);
  await ready(third, { point: W.IN_NYC });
  const o = await (await registerHere(third, other)).json();
  assert.deepEqual([o.existing, o.user.city.name], [false, "New York City"]);
  assert.notEqual(o.user.id, made.user.id);
  // signup_completed_at is set once and never changed (the trigger of the migration)
  await assert.rejects(env.DB.prepare("UPDATE users SET signup_completed_at = ? WHERE wallet = ?").bind("2030-01-01T00:00:00.000Z", w.address).run(), /signup_completed_at_immutable/);
});

/* ---------------------------------------------------------------- refusals */

test("wrong-wallet return and wrong binding: refused by name, nothing used, nothing made", async () => {
  const env = W.V2();
  on(env);
  const b = W.browser(env), w1 = await W.wallet(), w2 = await W.wallet();
  await ready(b);
  const c = await challenge(b, w1);
  // the wallet that comes back is not the one the challenge was issued for
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(c, w1, w2) })), [401, { ok: false, error: "signature_mismatch" }]);
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: { ...(await answerOf(c, w1, w2)), address: w2.address } })), [403, { ok: false, error: "wrong_wallet" }]);
  // a register challenge issued for another browser's sign-up is not this one's
  const other = W.browser(env);
  await ready(other);
  const theirs = await challenge(other, w1);
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(theirs, w1) })), [403, { ok: false, error: "wrong_signup" }]);
  // a login challenge never registers; a register challenge never signs in
  const login = await b.post("/api/auth/challenge", { purpose: "login", address: w1.address });
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(login, w1) })), [400, { ok: false, error: "wrong_purpose" }]);
  assert.deepEqual(await answer(await b.send("/api/auth/wallet", { method: "POST", body: await answerOf(c, w1) })), [400, { ok: false, error: "wrong_purpose" }]);
  // a city changed after the challenge was issued: the challenge named Utica, the sign-up now says New York City
  assert.equal((await b.post("/api/signup/location", { location: W.IN_NYC, country: "US" })).ok, true);
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(c, w1) })), [403, { ok: false, error: "wrong_signup" }]);
  assert.equal(await count(env, "users"), 0);
  assert.equal(await count(env, "auth_challenges WHERE used_at IS NOT NULL"), 0, "nothing was used up");
  // and the right answer still works
  const fresh = await challenge(b, w1);
  assert.equal(fresh.statement, `Register this wallet on Vicinity for New York City, US. ${FREE}`);
  assert.equal((await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(fresh, w1) })).status, 200);
});

test("an expired registration restarts registration (it is never a login check); an expired challenge makes nothing", async () => {
  const env = W.V2();
  on(env);
  const b = W.browser(env), w = await W.wallet();
  await ready(b);
  const c = await challenge(b, w);
  W.advance(121_000);
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(c, w) })), [410, { ok: false, error: "challenge_expired" }]);
  // the sign-up itself runs out (an hour after its last request): this browser starts over, at the location
  const c2 = await challenge(b, w);
  await env.DB.prepare("UPDATE signups SET expires_at = ?").bind("2026-10-24T12:01:00.000Z").run();
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(c2, w) })), [401, { ok: false, error: "no_signup" }]);
  assert.deepEqual((await b.post("/api/signup/start")).state.next, "location");
  assert.equal(await count(env, "users"), 0);
  assert.deepEqual(await answer(await loginWith(W.browser(env), w)), [404, { ok: false, error: "no_account" }], "the wallet still has no account: nothing incomplete was made");
});

test("the connection must still match the location step: a mismatch forgets the location only (403 location_unverified), nothing is used", async () => {
  const env = W.V2();
  on(env);
  const home = { ip: "198.51.100.7", cf: { country: "US", asn: 7922, asOrganization: "Comcast", latitude: 43.1, longitude: -75.2 } };
  const b = W.browser(env, home), w = await W.wallet();
  await ready(b);
  const c = await challenge(b, w);
  b.net.cf = { country: "US", asn: 16509, asOrganization: "Amazon.com, Inc.", latitude: 43.1, longitude: -75.2 }; // a hosting network now
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(c, w) })), [403, { ok: false, error: "location_unverified" }]);
  const s = (await b.get("/api/signup/state")).state;
  assert.deepEqual([s.location.done, s.terms.done, s.next], [false, true, "location"]);
  assert.equal(await count(env, "auth_challenges WHERE used_at IS NOT NULL"), 0);
  assert.equal(await count(env, "users"), 0);
});

test("display name: the username rules; one taken between the step and the wallet answers username_taken and the challenge stays usable", async () => {
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const taken = (await userOf(env, a)).handle;
  const b = W.browser(env), w = await W.wallet();
  await ready(b);
  const name = (displayName) => b.send("/api/signup/name", { method: "POST", body: { displayName } });
  assert.deepEqual(await answer(await name("x")), [400, { ok: false, error: "bad_username" }]);
  assert.deepEqual(await answer(await name("Admin_Team")), [400, { ok: false, error: "username_reserved" }]);
  assert.deepEqual(await answer(await name(taken.toUpperCase())), [409, { ok: false, error: "username_taken" }]);
  assert.deepEqual(await answer(await name(taken.replace(/l/g, "1").replace(/o/g, "0") === taken ? `${taken}_` : taken.replace(/l/g, "1").replace(/o/g, "0"))), [409, { ok: false, error: "username_similar" }]);
  assert.equal((await (await name("Harbor_Light")).json()).state.name, "Harbor_Light");
  assert.equal((await (await name("")).json()).state.name, null, "cleared");
  assert.equal((await (await name("Harbor_Light")).json()).ok, true);
  const c = await challenge(b, w);
  // someone takes the name a moment before the wallet answers
  await env.DB.prepare("UPDATE users SET handle = 'Harbor_Light' WHERE id = ?").bind((await userOf(env, a)).id).run();
  assert.deepEqual(await answer(await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(c, w) })), [409, { ok: false, error: "username_taken" }]);
  assert.equal(await count(env, "auth_challenges WHERE used_at IS NOT NULL"), 0, "the whole batch rolled back");
  assert.equal((await (await name("Harbor_Light2")).json()).ok, true);
  const r = await (await b.send("/api/signup/wallet", { method: "POST", body: await answerOf(c, w) })).json();
  assert.deepEqual([r.ok, r.user.handle], [true, "Harbor_Light2"]);
});

/* ---------------------------------------------------------------- the register hand-off */

const PHONE = { ip: "198.51.100.7", cf: { country: "US", asn: 21928, asOrganization: "T-Mobile USA, Inc.", latitude: 43.1, longitude: -75.2 } };
const handoff = async (b, app = "phantom") => (await b.send("/api/signup/handoff", { method: "POST", body: { app } })).json();
const info = (b, code, extra = {}) => b.send("/api/signup/handoff/info", { method: "POST", body: { code, ...extra } });
const status = async (b, ref) => (await b.send("/api/signup/handoff/status", { method: "POST", body: { ref } })).json();
async function claim(app, code, w, extra = {}) {
  const c = await challenge(app, w, { handoff: code });
  return app.send("/api/signup/handoff/claim", { method: "POST", body: { code, ...(await answerOf(c, w)), ...extra } });
}

test("hand-off: Safari makes a five-minute code; the wallet app's browser opens it, signs a register challenge for it and is signed in there; Safari sees 'registered'", async () => {
  const env = W.V2();
  on(env);
  const safari = W.browser(env, PHONE), app = W.browser(env, PHONE), w = await W.wallet();
  await ready(safari, { name: "Phonewalker" });
  const logs = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a) => logs.push(a.join(" ")); console.error = (...a) => logs.push(a.join(" "));
  let made, shown, c, res;
  try {
    made = await handoff(safari);
    shown = await info(app, made.code);
    c = await challenge(app, w, { handoff: made.code });
    assert.deepEqual(await status(safari, made.ref), { ok: true, status: "opened" });
    res = await app.send("/api/signup/handoff/claim", { method: "POST", body: { code: made.code, ...(await answerOf(c, w)), app: "phantom" } });
  } finally { Object.assign(console, orig); }
  assert.deepEqual(Object.keys(made).sort(), ["code", "expiresAt", "ok", "pin", "ref", "url"]);
  assert.equal(made.url, `${W.ORIGIN}/connect#register=${made.code}`, "the code rides in the fragment: never sent to a server, never in a Referer");
  assert.equal(made.expiresAt, "2026-10-24T12:05:00.000Z", "five minutes (policy identity.handoff_seconds)");
  assert.match(made.code, /^[A-Za-z0-9_-]{32}$/);
  const row = await one(env.DB, "SELECT * FROM handoffs WHERE kind = 'register'");
  assert.equal(row.id, await sha256(made.code), "only the hash of the code is stored");
  assert.deepEqual(readBind(row.bind), { city: "5142056", name: "Utica", country: "US" });
  assert.equal(shown.status, 200);
  const sb = await shown.json();
  assert.deepEqual({ ...sb, opener: "x" }, { ok: true, pin: made.pin, community: { name: "Utica", country: "US" }, terms: TERMS, expiresAt: made.expiresAt, relay: false, opener: "x" });
  assert.match(shown.headers.getSetCookie()[0], /^__Host-vlo=[A-Za-z0-9_-]{32}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=300$/);
  assert.equal(c.statement, `Register this wallet on Vicinity for Utica, US. ${FREE}`);
  assert.deepEqual(parseRef((await one(env.DB, "SELECT ref FROM auth_challenges WHERE id = ?", c.challengeId)).ref), { kind: "h", id: row.id });
  const body = await res.json();
  assert.deepEqual([res.status, body.ok, body.existing, body.user.handle, body.user.city.name], [200, true, false, "Phonewalker", "Utica"]);
  const s = await sessionOf(env, res);
  assert.deepEqual([s.made_by, s.auth, s.wallet], ["wallet", "wallet", w.address], "the wallet app's own browser: renewed while used");
  assert.ok(res.headers.getSetCookie().some((x) => /^__Host-vlo=; .*Max-Age=0$/.test(x)), "the opener nonce is cleared");
  assert.equal((await app.get("/api/me?lite=1")).user.handle, "Phonewalker");
  assert.equal((await one(env.DB, "SELECT wallet_app FROM users WHERE wallet = ?", w.address)).wallet_app, "phantom");
  // Safari: registered (no session moves between browsers: it signs in with the wallet itself)
  assert.deepEqual(await status(safari, made.ref), { ok: true, status: "registered" });
  assert.equal((await safari.get("/api/me")).signedIn, false);
  assert.equal(await count(env, "signups"), 0);
  // no code, no coordinate and no address in any log line
  const text = logs.join("\n");
  for (const secret of [made.code, row.id, w.address, "43.1", "75.2"]) assert.ok(!text.includes(secret), `log carries ${secret.slice(0, 6)}`);
});

test("stale and duplicate hand-off: a used code, a code after five minutes, a replaced code and an unknown one answer code_expired; nothing is made", async () => {
  const env = W.V2();
  on(env);
  const safari = W.browser(env, PHONE), w = await W.wallet();
  await ready(safari);
  // duplicate: the same code claimed twice (the second time it cannot even get a challenge, and an old challenge cannot use it again)
  const made = await handoff(safari);
  const app = W.browser(env, PHONE);
  await info(app, made.code);
  const c = await challenge(app, w, { handoff: made.code });
  const body = { code: made.code, ...(await answerOf(c, w)) };
  assert.equal((await app.send("/api/signup/handoff/claim", { method: "POST", body })).status, 200);
  assert.deepEqual(await answer(await app.send("/api/signup/handoff/claim", { method: "POST", body })), [410, { ok: false, error: "code_expired" }]);
  assert.deepEqual(await answer(await app.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: w.address, handoff: made.code } })), [410, { ok: false, error: "code_expired" }]);
  assert.equal(await count(env, "users"), 1);
  // stale: five minutes and the code is dead
  const s2 = W.browser(env, PHONE), w2 = await W.wallet();
  await ready(s2);
  const old = await handoff(s2);
  W.advance(300_000);
  assert.deepEqual(await answer(await info(W.browser(env, PHONE), old.code)), [410, { ok: false, error: "code_expired" }]);
  assert.deepEqual(await status(s2, old.ref), { ok: true, status: "expired" });
  // replaced: a second code makes the first one unknown
  const first = await handoff(s2), second = await handoff(s2);
  assert.deepEqual(await answer(await info(W.browser(env, PHONE), first.code)), [410, { ok: false, error: "code_expired" }]);
  assert.deepEqual(await status(s2, first.ref), { ok: true, status: "expired" });
  assert.equal((await info(W.browser(env, PHONE), second.code)).status, 200);
  for (const code of ["", "x".repeat(32), 7, null]) assert.deepEqual(await answer(await info(W.browser(env, PHONE), code)), [410, { ok: false, error: "code_expired" }], String(code));
  assert.equal(await count(env, `users WHERE wallet = '${w2.address}'`), 0);
});

test("hand-off binding: a second browser that opens the code kills it; a challenge before opening is refused; another connection gets code_network and binds nothing", async () => {
  const env = W.V2();
  on(env);
  const safari = W.browser(env, PHONE), w = await W.wallet();
  await ready(safari);
  // use before open
  const made = await handoff(safari);
  const app = W.browser(env, PHONE);
  assert.deepEqual(await answer(await app.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: w.address, handoff: made.code } })), [403, { ok: false, error: "not_opened" }]);
  // another connection: refused, nothing bound, Safari can tell
  const elsewhere = W.browser(env, { ip: "203.0.113.50", cf: { country: "US", asn: 7018, asOrganization: "AT&T" } });
  assert.deepEqual(await answer(await info(elsewhere, made.code)), [403, { ok: false, error: "code_network" }]);
  assert.deepEqual(await status(safari, made.ref), { ok: true, status: "refused" });
  // the right browser opens it; a second browser on the same connection opening it too kills it for both
  assert.equal((await info(app, made.code)).status, 200);
  const nosy = W.browser(env, PHONE);
  assert.deepEqual(await answer(await info(nosy, made.code)), [403, { ok: false, error: "contested" }]);
  assert.deepEqual(await answer(await nosy.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: w.address, handoff: made.code } })),
    [410, { ok: false, error: "code_expired" }], "the second browser gets no challenge");
  assert.deepEqual(await status(safari, made.ref), { ok: true, status: "contested" });
  // the first opener (its own opener nonce) is told the truth, "opened twice", and still gets nothing (review finding F7); anyone else: one answer
  assert.deepEqual(await answer(await app.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: w.address, handoff: made.code, opener: "x" } })), [403, { ok: false, error: "contested" }]);
  assert.deepEqual(await answer(await info(app, made.code)), [403, { ok: false, error: "contested" }]);
  assert.deepEqual(await answer(await info(W.browser(env, PHONE), made.code)), [410, { ok: false, error: "code_expired" }]);
  // a challenge issued for this browser's sign-up (no hand-off) cannot claim a code, and a hand-off challenge cannot register in Safari
  const fresh = await handoff(safari);
  const app2 = W.browser(env, PHONE);
  await info(app2, fresh.code);
  const own = await challenge(safari, w);
  assert.deepEqual(await answer(await app2.send("/api/signup/handoff/claim", { method: "POST", body: { code: fresh.code, ...(await answerOf(own, w)) } })), [403, { ok: false, error: "wrong_signup" }]);
  const theirs = await challenge(app2, w, { handoff: fresh.code });
  assert.deepEqual(await answer(await safari.send("/api/signup/wallet", { method: "POST", body: await answerOf(theirs, w) })), [403, { ok: false, error: "wrong_signup" }]);
  assert.equal(await count(env, "users"), 0);
});

test("hand-off: the sign-up running out restarts registration (410 signup_expired); its city changing kills the code (409 location_changed)", async () => {
  const env = W.V2();
  on(env);
  const safari = W.browser(env, PHONE), w = await W.wallet();
  await ready(safari);
  const made = await handoff(safari);
  const app = W.browser(env, PHONE);
  await info(app, made.code);
  const c = await challenge(app, w, { handoff: made.code });
  assert.equal((await safari.post("/api/signup/location", { location: W.IN_NYC, country: "US" })).ok, true);
  assert.deepEqual(await answer(await app.send("/api/signup/handoff/claim", { method: "POST", body: { code: made.code, ...(await answerOf(c, w)) } })), [409, { ok: false, error: "location_changed" }]);
  const again = await handoff(safari);
  await info(app, again.code);
  const c2 = await challenge(app, w, { handoff: again.code });
  await env.DB.prepare("UPDATE signups SET expires_at = ?").bind("2026-10-24T12:00:30.000Z").run();
  W.advance(60_000);
  assert.deepEqual(await answer(await app.send("/api/signup/handoff/claim", { method: "POST", body: { code: again.code, ...(await answerOf(c2, w)) } })), [410, { ok: false, error: "signup_expired" }]);
  assert.equal(await count(env, "users"), 0);
});

test("relay hand-off (iCloud Private Relay): a country-bound code for a wallet app with a real app link; the wallet app on mobile data claims it; another country cannot", async () => {
  const env = W.V2();
  on(env);
  const near = { country: "US", latitude: 43.1, longitude: -75.2 };
  const RELAY = { ip: "172.224.226.5", cf: { ...near, asn: 54113, asOrganization: "Fastly, Inc." } };
  const CARRIER = { ip: "198.51.100.9", cf: { ...near, asn: 21928, asOrganization: "T-Mobile USA, Inc." } };
  const ABROAD = { ip: "203.0.113.50", cf: { country: "DE", asn: 3320, asOrganization: "Deutsche Telekom AG" } };
  const safari = W.browser(env, RELAY), w = await W.wallet();
  await ready(safari);
  assert.deepEqual(await answer(await safari.send("/api/signup/handoff", { method: "POST", body: { app: "trust" } })), [409, { ok: false, error: "handoff_relay" }], "no real app link: the pairing");
  const made = await handoff(safari, "phantom");
  assert.deepEqual([made.relay, made.openBy], [true, "2026-10-24T12:02:00.000Z"]);
  assert.deepEqual(await answer(await info(W.browser(env, ABROAD), made.code)), [403, { ok: false, error: "code_network", relay: true }]);
  const app = W.browser(env, CARRIER);
  assert.equal((await info(app, made.code)).status, 200);
  const res = await claim(app, made.code, w);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.equal((await one(env.DB, "SELECT home_city FROM users WHERE wallet = ?", w.address)).home_city, "5142056");
  env.CARRY_RELAY = "off";
  const s2 = W.browser(env, RELAY);
  await ready(s2);
  assert.deepEqual(await answer(await s2.send("/api/signup/handoff", { method: "POST", body: { app: "phantom" } })), [409, { ok: false, error: "handoff_relay" }], "the emergency switch");
});

/* ---------------------------------------------------------------- the register pairing */

test("register pairing: a computer shows a code; a phone's wallet approves with a register challenge naming the check number; the computer finishes signed in; single use", async () => {
  const env = W.V2();
  on(env);
  const computer = W.browser(env), phone = W.browser(env), w = await W.wallet();
  await ready(computer, { name: "DeskUser" });
  const pair = await computer.post("/api/pair", { purpose: "register" });
  assert.deepEqual(Object.keys(pair).sort(), ["code", "expiresAt", "ok", "pin", "purpose", "url"]);
  assert.deepEqual([pair.purpose, pair.url, pair.expiresAt], ["register", `${W.ORIGIN}/connect#pair=${pair.code}`, "2026-10-24T12:05:00.000Z"]);
  assert.deepEqual(await phone.post("/api/pair/status", { code: pair.code }), { status: "waiting", pin: pair.pin, purpose: "register" });
  // a login challenge is never issued for it, and the computer gets nothing before the phone approved
  assert.deepEqual(await answer(await phone.send("/api/auth/challenge", { method: "POST", body: { purpose: "login", address: w.address, pair: pair.code } })), [410, { ok: false, error: "pair_expired" }]);
  assert.deepEqual(await answer(await computer.send("/api/pair/finish", { method: "POST", body: { code: pair.code } })), [200, { ok: false, status: "waiting" }]);
  const c = await challenge(phone, w, { pair: pair.code });
  assert.equal(c.statement, `Register this wallet on Vicinity for Utica, US on my other device (check number ${pair.pin}). ${FREE}`);
  // the approval's text cannot register the phone's own browser, nor approve without its pairing
  assert.deepEqual(await answer(await phone.send("/api/signup/wallet", { method: "POST", body: await answerOf(c, w) })), [401, { ok: false, error: "no_signup" }]);
  const { pair: _p, ...bare } = { ...(await answerOf(c, w)), pair: pair.code };
  void _p;
  assert.deepEqual(await answer(await phone.send("/api/auth/wallet", { method: "POST", body: bare })), [400, { ok: false, error: "wrong_purpose" }]);
  assert.deepEqual(await phone.post("/api/auth/wallet", { ...(await answerOf(c, w)), pair: pair.code }), { ok: true, paired: true });
  assert.equal(phone.has("vs"), false, "the phone itself is not signed in");
  // another browser cannot finish it; the computer can, once
  assert.deepEqual(await answer(await W.browser(env).send("/api/pair/finish", { method: "POST", body: { code: pair.code } })), [410, { ok: false, status: "expired" }]);
  const fin = await computer.send("/api/pair/finish", { method: "POST", body: { code: pair.code } });
  const fb = await fin.json();
  assert.deepEqual([fin.status, fb.ok, fb.status, fb.existing, fb.user.handle, fb.user.city.name], [200, true, "done", false, "DeskUser", "Utica"]);
  assert.equal((await computer.get("/api/me?lite=1")).user.handle, "DeskUser");
  assert.deepEqual(await answer(await computer.send("/api/pair/finish", { method: "POST", body: { code: pair.code } })), [410, { ok: false, status: "expired" }]);
  assert.equal(await count(env, "pairs"), 0);
  assert.equal(await count(env, "users"), 1);
  // a login pairing is never approved by a register challenge
  const loginPair = await W.browser(env).post("/api/pair");
  assert.deepEqual(await answer(await phone.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: w.address, pair: loginPair.code } })), [410, { ok: false, error: "pair_expired" }]);
});

test("SEC-3: a register pairing approved by a wallet that already has an account never signs the computer in to it, and binds nothing", async () => {
  const env = W.V2(), box = outbox();
  const { a } = await population(env, box);
  on(env);
  const victimId = (await userOf(env, a)).id;
  // the attacker's computer: location, Terms, a register pairing
  const attacker = W.browser(env);
  await ready(attacker);
  const pair = await attacker.post("/api/pair", { purpose: "register" });
  // the victim's phone wallet (a member) is asked for a register challenge naming that pairing: refused at once, nothing to sign
  const phone = W.browser(env);
  assert.deepEqual(await answer(await phone.send("/api/auth/challenge", { method: "POST", body: { purpose: "register", address: a.w.address, pair: pair.code } })),
    [409, { ok: false, error: "use_sign_in" }]);
  // the race: the wallet's account exists by the time the computer finishes (the challenge was issued before; here the pairing is approved and the
  // account made afterwards): the finish makes no session in the existing account
  const newcomer = await W.wallet();
  const c = await challenge(phone, newcomer, { pair: pair.code });
  assert.deepEqual(await phone.post("/api/auth/wallet", { ...(await answerOf(c, newcomer)), pair: pair.code }), { ok: true, paired: true });
  const own = W.browser(env);
  await ready(own);
  assert.equal((await registerHere(own, newcomer)).status, 200, "the wallet registers itself elsewhere meanwhile");
  const ownerId = (await one(env.DB, "SELECT id FROM users WHERE wallet = ?", newcomer.address)).id;
  const fin = await attacker.send("/api/pair/finish", { method: "POST", body: { code: pair.code } });
  assert.deepEqual(await answer(fin), [409, { ok: false, error: "use_sign_in" }]);
  assert.ok(!fin.headers.getSetCookie().some((x) => x.startsWith("vs=") && !/Max-Age=0$/.test(x)), "no session cookie");
  assert.equal((await attacker.get("/api/me?lite=1")).signedIn, false);
  assert.equal(await count(env, `sessions WHERE user_id IN (${victimId}, ${ownerId}) AND auth = 'wallet'`), 1, "only the owner's own session");
  // the in-batch guard too: an account made between the check and the batch (the check passes, the INSERT finds the wallet taken)
  const env2 = W.V2(), box2 = outbox();
  await population(env2, box2);
  on(env2);
  const comp = W.browser(env2), ph = W.browser(env2), wl = await W.wallet();
  await ready(comp);
  const p2 = await comp.post("/api/pair", { purpose: "register" });
  const c2 = await challenge(ph, wl, { pair: p2.code });
  assert.deepEqual(await ph.post("/api/auth/wallet", { ...(await answerOf(c2, wl)), pair: p2.code }), { ok: true, paired: true });
  const realFirst = env2.DB.prepare.bind(env2.DB);
  let injected = false;
  env2.DB.prepare = (sql) => {
    const st = realFirst(sql);
    if (!injected && /^SELECT id FROM users WHERE wallet = \?$/.test(sql)) {
      injected = true; // the check runs first: the account is made right after it, before the batch
      return { bind: (...a) => ({ first: async () => { const r = await st.bind(...a).first(); await realFirst("INSERT INTO users (wallet, provider, provider_id, handle, created_at) VALUES (?, 'wallet', ?, 'RacerOne', '2026-10-24T11:00:00.000Z')").bind(wl.address, wl.address).run(); return r; } }) };
    }
    return st;
  };
  const f2 = await comp.send("/api/pair/finish", { method: "POST", body: { code: p2.code } });
  env2.DB.prepare = realFirst;
  assert.ok(injected);
  assert.deepEqual(await answer(f2), [409, { ok: false, error: "use_sign_in" }]);
  assert.equal((await comp.get("/api/me?lite=1")).signedIn, false);
  assert.equal(await count(env2, `users WHERE wallet = '${wl.address}'`), 1);
});

/* ---------------------------------------------------------------- the switch */

test("superseded routes answer 404 under the switch, before any method check; with the switch off they are today's; set but refused, 503", async () => {
  const env = W.V2(), box = outbox();
  // a sign-up location hand-off made before the switch (today's v2 sign-up, inside a wallet app)
  const early = W.browser(env);
  await early.post("/api/signup/start");
  const old = await early.post("/api/signup/location/handoff");
  assert.equal(old.ok, true);
  const RETIRED = ["/api/signup/email", "/api/signup/email/verify", "/api/signup/account/reset", "/api/signup/finish", "/api/signup/location/handoff",
    "/api/signup/location/handoff/info", "/api/signup/location/handoff/complete", "/api/signup/location/handoff/claim", "/api/signup/zq-unknown"];
  const before = {};
  for (const p of RETIRED) before[p] = await answer(await W.browser(env).send(p, { method: "POST", body: {} }));
  on(env, { DEPLOYMENT_ENV: "" }); // set but refused (no environment): fail closed, never today's sign-up (review finding SEC-1)
  for (const p of [...RETIRED, "/api/signup/wallet"]) assert.deepEqual(await answer(await W.browser(env).send(p, { method: "POST", body: {} })), [503, { ok: false, error: "unavailable" }], `refused: ${p}`);
  for (const k of Object.keys(ON)) delete env[k]; _resetPolicyCheck(); // off: today's
  for (const p of RETIRED) assert.deepEqual(await answer(await W.browser(env).send(p, { method: "POST", body: {} })), before[p], `off: ${p}`);
  on(env);
  for (const p of RETIRED) for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    assert.deepEqual(await answer(await W.browser(env).send(p, { method, body: method === "GET" || method === "DELETE" ? undefined : {} })), [404, { error: "not_found" }], `${method} ${p}`);
  }
  // the old link, opened in a phone's browser through today's page route: dead
  assert.deepEqual(await answer(await W.browser(env).send("/api/locate/handoff/complete", { method: "POST", body: { code: old.code, location: W.IN_UTICA, country: "US" } })), [410, { ok: false, error: "expired" }]);
  // the new routes: their method only
  assert.deepEqual(await answer(await W.browser(env).send("/api/signup/wallet")), [405, { error: "method_not_allowed" }]);
  assert.deepEqual(await answer(await W.browser(env).send("/api/signup/name", { method: "POST", body: {}, origin: "https://evil.example" })), [403, { ok: false, error: "wrong_origin" }]);
  void box;
});

test("switch off: today's v2 sign-up, byte for byte in its state, and no registration column or route exists", async () => {
  const env = W.V2(), box = outbox();
  const b = W.browser(env);
  const s = await b.post("/api/signup/start");
  assert.deepEqual(s.state, { terms: { done: false, version: TERMS }, location: { done: false }, account: { done: false }, next: "location" });
  for (const p of ["/api/signup/name", "/api/signup/wallet", "/api/signup/handoff", "/api/signup/handoff/info", "/api/signup/handoff/claim", "/api/signup/handoff/status"]) {
    assert.deepEqual(await answer(await b.send(p, { method: "POST", body: {} })), [404, { error: "not_found" }], p);
  }
  assert.deepEqual(await answer(await b.send("/api/pair", { method: "POST", body: { purpose: "register" } })), [400, { ok: false, error: "bad_request" }], "today's answer to an unknown purpose");
  await member(env, box, { via: "email" });
  const cols = (await rows(env.DB, "PRAGMA table_info(users)")).map((r) => r.name);
  for (const c of ["signup_completed_at", "loc_verified_at", "loc_policy", "loc_method"]) assert.ok(!cols.includes(c), c);
  assert.ok(!(await rows(env.DB, "PRAGMA table_info(signups)")).some((r) => r.name === "display_name"));
  assert.equal(await one(env.DB, "SELECT id FROM schema_migrations WHERE id = '2026-10-24-identity-register'"), null);
  assert.equal(await one(env.DB, "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'users_signup_completed_once'"), null);
});
