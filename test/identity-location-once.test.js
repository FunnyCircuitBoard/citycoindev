// Location once (Citycoin.dev master v5, stage S13; master section 19 WP-03 "Use location once to assign a new wallet's city and country ...
// Never request it again as a login, posting, founder, launch or manager-application requirement", "Permanent assignment": no relocation,
// no repeated GPS, no hidden location requirement in posts, votes or applications, and "If a legacy wallet has never had any verified
// location, completing its initial registration is allowed to request location once. Keep ordinary login available to already registered
// wallets even during resolver outages"; acceptance A04). While WALLET_ONLY counts: /api/home only for an account that never had a city,
// once; /api/locate and its hand-off only for that (purpose home; five-minute codes); no new check-in post (old ones stay readable); a town
// request, a founder or squad application and a vote ask for no location. With the switch off: today's rules. Fake wallets only.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as W from "./helpers/world.js";
import { memberWithWallet, one, outbox, userOf } from "./helpers/signup.js";
import { _resetPolicyCheck } from "../src/v5policy.js";
import { voterProblem } from "../src/access.js";
import { ensureSchema } from "../src/store.js";
import { _resetCityCache } from "../src/cities.js";

beforeEach(() => { W.useClock("2026-10-24T12:00:00Z"); _resetPolicyCheck(); });
after(() => W.realClock());

const ON = Object.freeze({ WALLET_ONLY: "on", DEPLOYMENT_ENV: "test", SITE_ORIGIN: W.ORIGIN, SITE_ORIGINS: W.ORIGIN });
const on = (env, extra = {}) => Object.assign(env, ON, extra);
const off = (env) => { for (const k of Object.keys(ON)) delete env[k]; return env; };
const answer = async (res) => [res.status, await res.json()];
const answerOf = async (c, w) => ({ challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message) });
/** Sign in with a wallet-only login challenge (sessions made before the switch belong to another host in these tests: a fresh one). */
async function signIn(b, w) {
  b.jar.clear();
  const c = await b.post("/api/auth/challenge", { purpose: "login", address: w.address });
  const r = await b.send("/api/auth/wallet", { method: "POST", body: await answerOf(c, w) });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
}
async function reproveWith(b, w) {
  const c = await b.post("/api/auth/challenge", { purpose: "reprove", address: w.address });
  assert.equal((await b.post("/api/auth/reprove", await answerOf(c, w))).ok, true);
}
const locate = (b, purpose, point = W.IN_UTICA) => b.send("/api/locate", { method: "POST", body: { location: point, purpose, country: "US" } });

/* ---------------------------------------------------------------- /api/home */

test("a located member: /api/locate and /api/home answer location_fixed before anything is read or used; with the switch off, today's weekly rule", async () => {
  const env = W.V2(), box = outbox();
  const m = await memberWithWallet(env, box, { via: "google" }); // made by today's sign-up: home Utica
  // switch off: a home a week old may move (today's rule)
  W.advance(8 * W.DAY);
  const att = (await (await locate(m.b, "home", W.IN_NYC)).json()).attestation;
  assert.ok(att);
  on(env);
  await signIn(m.b, m.w);
  assert.deepEqual(await answer(await locate(m.b, "home", W.IN_NYC)), [409, { ok: false, error: "location_fixed" }]);
  assert.deepEqual(await answer(await m.b.send("/api/home", { method: "POST", body: { attestation: att } })), [409, { ok: false, error: "location_fixed" }]);
  assert.equal((await userOf(env, m)).home_city, "5142056", "the city stays as registered");
  off(env);
  _resetPolicyCheck();
  const signedInOff = W.browser(env);
  await signedInOff.post("/api/auth/wallet", await W.loginBody(m.w));
  const moved = await signedInOff.post("/api/home", { attestation: att });
  assert.equal(moved.ok, true, `switch off: today's relocation: ${JSON.stringify(moved)}`);
});

test("a wallet-linked member who never had a city (M2) shares a location once: recorded like a registration, then fixed; two tabs racing set it once", async () => {
  const env = W.newWorld(); // today's v1 sign-up: wallet and Google, no city yet
  const p = await W.person(env);
  assert.equal((await one(env.DB, "SELECT home_city FROM users WHERE wallet = ?", p.w.address)).home_city, null);
  on(env);
  await signIn(p, p.w);
  for (const purpose of ["apply", "checkin", "request"]) assert.deepEqual(await answer(await locate(p, purpose)), [400, { ok: false, error: "bad_request" }], purpose);
  const a1 = (await (await locate(p, "home")).json()).attestation;
  const a2 = (await (await locate(p, "home")).json()).attestation;
  const [r1, r2] = await Promise.all([p.send("/api/home", { method: "POST", body: { attestation: a1 } }), p.send("/api/home", { method: "POST", body: { attestation: a2 } })]);
  const outs = [await answer(r1), await answer(r2)].sort((x, y) => x[0] - y[0]);
  assert.deepEqual(outs, [[200, { ok: true, home: { id: "5142056", name: "Utica", country: "US" }, joinedNearby: false }], [409, { ok: false, error: "location_fixed" }]]);
  const u = await one(env.DB, "SELECT home_city, home_name, home_country, home_at, loc_verified_at, loc_policy, loc_method FROM users WHERE wallet = ?", p.w.address);
  assert.deepEqual(u, { home_city: "5142056", home_name: "Utica", home_country: "US", home_at: "2026-10-24T12:00:00.000Z", loc_verified_at: "2026-10-24T12:00:00.000Z",
    loc_policy: "citycoin-master-v5", loc_method: "inside" });
  assert.deepEqual(await answer(await locate(p, "home", W.IN_NYC)), [409, { ok: false, error: "location_fixed" }], "never a second time");
  W.advance(8 * W.DAY);
  assert.deepEqual(await answer(await locate(p, "home", W.IN_NYC)), [409, { ok: false, error: "location_fixed" }], "not after a week either: no relocation");
});

test("the location hand-off (a wallet app's browser without GPS): home only, for an account that never had a city, five minutes", async () => {
  const env = W.newWorld();
  const p = await W.person(env);
  const located = await W.person(env, { home: W.IN_NYC });
  on(env);
  await signIn(p, p.w);
  await signIn(located, located.w);
  assert.deepEqual(await answer(await p.send("/api/locate/handoff", { method: "POST", body: { purpose: "apply" } })), [400, { ok: false, error: "bad_request" }]);
  assert.deepEqual(await answer(await located.send("/api/locate/handoff", { method: "POST", body: { purpose: "home" } })), [409, { ok: false, error: "location_fixed" }]);
  const h = await p.post("/api/locate/handoff", { purpose: "home" });
  assert.equal(h.expiresAt, "2026-10-24T12:05:00.000Z");
  const phoneBrowser = W.browser(env);
  const done = await phoneBrowser.post("/api/locate/handoff/complete", { code: h.code, location: W.IN_UTICA, country: "US" });
  assert.equal(done.ok, true, JSON.stringify(done));
  const got = await p.post("/api/locate/handoff/claim", { code: h.code });
  assert.equal((await p.post("/api/home", { attestation: got.attestation })).ok, true);
  assert.equal((await one(env.DB, "SELECT home_city FROM users WHERE wallet = ?", p.w.address)).home_city, "5142056");
});

/* ---------------------------------------------------------------- posting, town requests, votes, applications */

test("no new check-in: kind checkin is refused (no location asked); old check-ins stay readable; ordinary posts need no location", async () => {
  const env = W.newWorld();
  const p = await W.person(env, { home: W.IN_UTICA });
  const old = await p.post("/api/posts", { kind: "checkin", attestation: await W.attest(p, W.IN_UTICA, "checkin") });
  assert.equal(old.ok, true, JSON.stringify(old));
  on(env);
  await signIn(p, p.w);
  assert.deepEqual(await answer(await p.send("/api/posts", { method: "POST", body: { kind: "checkin" } })), [400, { ok: false, error: "bad_kind" }]);
  assert.equal((await p.post("/api/posts", { kind: "talk", body: "hello from the city" })).ok, true);
  const feed = await p.get("/api/posts?scope=city&kind=checkin");
  assert.deepEqual([feed.kind, feed.posts.map((x) => x.id)], ["checkin", [old.post.id]], "the old check-in is history, still readable");
});

test("town request: no location asked; it carries the registered city and country; reviewers read 'not location-checked'", async () => {
  const env = W.newWorld();
  const p = await W.person(env, { home: W.IN_UTICA });
  const admin = await W.person(env, { home: W.IN_NYC });
  env.ADMIN_WALLETS = admin.w.address;
  const homeless = await W.person(env);
  on(env);
  await signIn(p, p.w);
  await signIn(admin, admin.w);
  await signIn(homeless, homeless.w);
  assert.deepEqual(await answer(await homeless.send("/api/towns", { method: "POST", body: { name: "Clinton" } })), [409, { ok: false, error: "no_home" }]);
  const r = await p.post("/api/towns", { name: "New Hartford" });
  assert.deepEqual(r, { ok: true, request: { id: r.request.id, name: "New Hartford", country: "US", near: "registered in Utica, not location-checked", status: "waiting" } });
  const row = await one(env.DB, "SELECT country, near_id, near_name, near_km, inside FROM town_requests WHERE id = ?", r.request.id);
  assert.deepEqual(row, { country: "US", near_id: "5142056", near_name: "Utica", near_km: null, inside: 0 });
  await reproveWith(admin, admin.w);
  const q = await admin.get("/api/mod");
  assert.equal(q.towns.find((t) => t.id === r.request.id).near, "registered in Utica, not location-checked");
});

test("votes: the check-in clause is left out while the switch counts (it needed a location); the account, home and ban rules stay", async () => {
  const env = W.newWorld();
  await ensureSchema(env.DB);
  const u = { id: 999999, home_city: "5142056", home_country: "US", created_at: "2026-10-01T00:00:00.000Z", home_at: "2026-10-01T00:00:00.000Z" };
  const opened = "2026-10-24T00:00:00.000Z";
  assert.equal(await voterProblem(env, u, { scope: "city", place: "5142056", openedAt: opened }), "needs_checkin", "switch off: today's rule");
  on(env);
  assert.equal(await voterProblem(env, u, { scope: "city", place: "5142056", openedAt: opened }), null);
  assert.equal(await voterProblem(env, { ...u, home_at: "2026-10-23T00:00:00.000Z" }, { scope: "city", place: "5142056", openedAt: opened }), "home_too_new");
  assert.equal(await voterProblem(env, u, { scope: "city", place: "5140405", openedAt: opened }), "not_local");
});

test("founder application: no location asked while the switch counts; the city is the member's registered one", async () => {
  W.useClock("2026-10-01T12:00:00Z");
  const env = W.newWorld({ VICINITY_MINT: W.MINT });
  const p = await W.person(env, { home: W.IN_UTICA, holds: 2_000_000 });
  await W.tick(env); await W.passTime(env, 15 * W.DAY);
  // switch off: today's application needs an attestation from inside the city
  await W.reprove(p);
  assert.deepEqual(await answer(await p.send("/api/seats/apply", { method: "POST", body: { pitch: "I love this city" } })), [400, { ok: false, error: "location_required" }]);
  on(env);
  await signIn(p, p.w);
  await reproveWith(p, p.w);
  const r = await p.post("/api/seats/apply", { pitch: "I love this city" });
  assert.equal(r.steward, true, JSON.stringify(r));
  assert.equal(r.seat.cityId, "5142056");
});

/* ---------------------------------------------------------------- A04: the login never locates */

test("A04: a registered wallet signs in while the city resolver is down (nothing about the login reads a location or the city list)", async () => {
  const env = W.V2(), box = outbox();
  const m = await memberWithWallet(env, box, { via: "google" });
  on(env);
  let cityReads = 0;
  const assets = env.ASSETS;
  env.ASSETS = { fetch: async () => { cityReads++; void assets; throw new Error("resolver down"); } };
  _resetCityCache(); // nothing cached either: any read of the city list would hit the outage
  const b = W.browser(env);
  await signIn(b, m.w);
  const me = await b.get("/api/me?lite=1");
  assert.deepEqual([me.signedIn, me.user.home.name], [true, "Utica"]);
  assert.equal(cityReads, 0, "the sign-in never touched the city data");
  // the registration's location step, by contrast, needs it: there the outage is visible, and nothing is made
  const r = W.browser(env);
  await r.post("/api/signup/start");
  assert.deepEqual(await answer(await r.send("/api/signup/location", { method: "POST", body: { location: W.IN_UTICA, country: "US" } })), [503, { ok: false, error: "cities_unavailable" }]);
});
