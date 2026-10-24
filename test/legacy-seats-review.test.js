// The review fixes of stage S16, the legacy seat freeze (implementation-report.md S16 row; docs/citycoin-master/schema-and-api.md section 3.9:
// "no writer once LEGACY_SEATS=frozen"; the S16 acceptance line "No member loses a role"). One test (or more) per finding:
//   S16-R1 / SEC-S16-1  a founder or manager action below the seat's amount wrote the seats table (grace, or a release after repeated graces)
//                       while frozen, and the skipped job never put the seat back: now refused with 403 below_amount and nothing written
//   SEC-S16-2           a seat, an open application or a squad place blocked an unlink for the whole freeze (resign, withdraw and leave
//                       answer 410): now history, which no longer blocks it; the rows stay as recorded
//   SEC-S16-3 / S16-R5  a LEGACY_SEATS value outside the switch's set reopened every writer: now held frozen (LEGACY_SEATS_VALUE_REFUSED)
//   SEC-S16-4           a seat left on the account by "Remove it" while frozen still let the account act as its founder with the removed
//                       wallet's balance: founder coin actions now need the seat's own wallet on the account while frozen
//   SEC-S16-5 / S16-R6  the test lab's reset deleted seeded seats, an objection and an election while frozen: now a frozen legacy writer
//   SEC-S16-6           one sweep: every route, every role, every balance below its bar, frozen and held: the legacy tables never move
//   S16-R2              the frozen /cities city panel told an old founder rule as current; it now names the manager on record or the rule
//   S16-R4              the admin console called the open election "Country votes open now" and said objections need an admin
//   S16-R7              the frozen home card's "set your home community once" read as a rule that is not built (S13)
// With the switch off every one of these answers is today's (the switch-off cases below). Every wallet, mint and name is a fake test fixture.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import * as W from "./helpers/world.js";
import { seedSeat } from "./helpers/launchpad.js";
import { pagesAsCommitted, pagesBuiltFrozen } from "./helpers/mainswitch.js";
import { openPage } from "./helpers/pagedom.js";
import { UTICA as READY_CITY, fresh, world as readyWorld } from "./helpers/readyworld.js";
import { _resetLpKit } from "../src/lpkit.js";
import { _resetLpAdmin } from "../src/lpadmin.js";
import { _resetLpCoins } from "../src/lpcoins.js";
import { _resetReview } from "../src/coinreview.js";
import { ensureSchema } from "../src/store.js";
import { runJobs } from "../src/jobs.js";
import * as SEATS from "../src/seats.js";
import { _resetPolicyCheck, checkPolicyConfig, legacySeats, legacySeatsFrozen, legacySeatsRefusals } from "../src/v5policy.js";
import { _resetDeploymentCheck } from "../src/maintoken.js";
import { buildPages } from "../scripts/pages/build.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const FROZEN = Object.freeze({ LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "test" });
/** [the state legacySeats answers, the page record it needs, the settings]: accepted, and held (its own input refused, pages not built). */
const STATES = [["frozen", pagesBuiltFrozen, FROZEN], ["held", pagesAsCommitted, { LEGACY_SEATS: "frozen" }]];
const OFF = { LEGACY_SEATS: undefined, DEPLOYMENT_ENV: undefined };
const IN_ALBANY = { lat: 42.65, lon: -73.76, accuracy: 30 };
const IN_SYRACUSE = { lat: 43.05, lon: -76.15, accuracy: 30 };
const UTICA = "5142056", NYC = "5128581", ALBANY = "5106834", SYRACUSE = "5140405";
const CITY_COIN = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const DESIGN = { name: "Utica Coin", pitch: "The Handshake City, on the map.", pair: "SOL", color: "emerald" };
const FROZEN_BELOW_AMOUNT = SEATS.FROZEN_BELOW_AMOUNT;
const BELOW = { ok: false, error: "below_amount", message: FROZEN_BELOW_AMOUNT };

let errors = [];
const realError = console.error;
beforeEach(() => {
  W.useClock("2026-10-24T12:00:00Z");
  pagesAsCommitted(); _resetPolicyCheck(); _resetDeploymentCheck();
  errors = []; console.error = (...a) => errors.push(a.map(String).join(" "));
});
afterEach(() => { console.error = realError; pagesAsCommitted(); W.realClock(); });

const setEnv = (env, vars) => { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete env[k]; else env[k] = v; } };
/** Every row of every table, and the schema. */
async function dump(db) {
  const tables = (await db.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name").all()).results;
  const out = { schema: tables };
  for (const t of tables.filter((x) => x.sql && /^CREATE TABLE/i.test(x.sql))) out[t.name] = (await db.prepare(`SELECT * FROM "${t.name}"`).all()).results.map((r) => JSON.stringify(r)).sort();
  return out;
}
const LEGACY_TABLES = ["windows", "applications", "endorsements", "seats", "squads", "squad_members", "objections", "elections", "election_votes", "manager_terms", "streaks"];
const legacyRows = async (db) => { const d = await dump(db); return Object.fromEntries(LEGACY_TABLES.map((t) => [t, d[t]])); };

/**
 * Every kind of legacy record: Utica's active founder, New York City's founder with an active country-manager term, Syracuse's steward, an
 * open Albany window with an application and an endorsement, a forming squad, an open objection, an open election, a decided one, hold
 * streaks, and a post in Utica's city feed. Every seat's amount is 180,000; the seat holders hold 2,000,000 until a test lowers it.
 */
async function world(extra = {}) {
  const env = W.newWorld({ VICINITY_MINT: W.MINT, ...extra });
  const founder = await W.person(env, { home: W.IN_UTICA, holds: 2_000_000 });
  const manager = await W.person(env, { home: W.IN_NYC, holds: 2_000_000 });
  const steward = await W.person(env, { home: IN_SYRACUSE, holds: 2_000_000 });
  const local = await W.person(env, { home: W.IN_UTICA, holds: 10 });
  const applicant = await W.person(env, { home: IN_ALBANY, holds: 2_000_000 });
  const voter = await W.person(env, { home: IN_ALBANY, holds: 10 });
  const admin = await W.person(env, { home: W.IN_NYC });
  env.ADMIN_WALLETS = admin.w.address;
  const db = env.DB;
  await ensureSchema(db);
  const now = Date.now(), at = (ms) => new Date(now + ms).toISOString();
  const uid = async (p) => (await db.prepare("SELECT id FROM users WHERE wallet = ?").bind(p.w.address).first()).id;
  const ids = { founder: await uid(founder), manager: await uid(manager), steward: await uid(steward), local: await uid(local), applicant: await uid(applicant), voter: await uid(voter) };
  const founderSeat = await seedSeat(env, founder, { city: UTICA, name: "Utica" });
  const managerSeat = await seedSeat(env, manager, { city: NYC, name: "New York City" });
  const stewardSeat = (await db.prepare(`INSERT INTO seats (city_id, city_name, country, user_id, wallet, policy, threshold, status, created_at, probation_until)
    VALUES (?, 'Syracuse', 'US', ?, ?, 5, 180000, 'steward', ?, ?) RETURNING id`).bind(SYRACUSE, ids.steward, steward.w.address, at(-20 * W.DAY), at(70 * W.DAY)).first()).id;
  await db.prepare("INSERT INTO manager_terms (country, seat_id, user_id, wallet, starts_at, ends_at, status) VALUES ('US', ?, ?, ?, ?, ?, 'active')")
    .bind(managerSeat, ids.manager, manager.w.address, at(-10 * W.DAY), at(80 * W.DAY)).run();
  const win = (await db.prepare("INSERT INTO windows (city_id, city_name, country, policy, threshold, opened_at, closes_at) VALUES (?, 'Albany', 'US', 6, 180000, ?, ?) RETURNING id")
    .bind(ALBANY, at(-W.HOUR), at(71 * W.HOUR)).first()).id;
  const app = (await db.prepare("INSERT INTO applications (window_id, city_id, user_id, wallet, pitch, created_at) VALUES (?, ?, ?, ?, 'Albany first', ?) RETURNING id")
    .bind(win, ALBANY, ids.applicant, applicant.w.address, at(-W.HOUR)).first()).id;
  await db.prepare("INSERT INTO endorsements (window_id, user_id, application_id, created_at) VALUES (?, ?, ?, ?)").bind(win, ids.voter, app, at(-W.HOUR)).run();
  const squad = (await db.prepare("INSERT INTO squads (city_id, city_name, country, created_by, status, created_at) VALUES (?, 'Albany', 'US', ?, 'forming', ?) RETURNING id")
    .bind(ALBANY, ids.voter, at(-W.DAY)).first()).id;
  await db.prepare("INSERT INTO squad_members (squad_id, user_id, wallet, joined_at) VALUES (?, ?, ?, ?)").bind(squad, ids.voter, voter.w.address, at(-W.DAY)).run();
  const objection = (await db.prepare("INSERT INTO objections (seat_id, user_id, reason, created_at) VALUES (?, ?, 'not a local, as far as I know', ?) RETURNING id")
    .bind(founderSeat, ids.local, at(-W.HOUR)).first()).id;
  const election = (await db.prepare("INSERT INTO elections (country, policy, opened_at, closes_at) VALUES ('US', 6, ?, ?) RETURNING id").bind(at(-W.DAY), at(6 * W.DAY)).first()).id;
  const result = JSON.stringify({ winner: null, applicants: [] });
  await db.prepare(`INSERT INTO elections (country, policy, opened_at, closes_at, status, decided_at, result, result_hash) VALUES ('CA', 5, ?, ?, 'decided', ?, ?, 'cd')`)
    .bind(at(-60 * W.DAY), at(-53 * W.DAY), at(-53 * W.DAY), result).run();
  await db.prepare("INSERT INTO streaks (wallet, level, above_since) VALUES (?, 180000, ?), (?, 180000, ?)")
    .bind(founder.w.address, at(-40 * W.DAY), applicant.w.address, at(-9 * W.DAY)).run();
  await W.reprove(local);
  const post = (await local.post("/api/posts", { scope: "city", kind: "talk", body: "a post in Utica" })).post;
  assert.ok(post && post.id, "a post to moderate");
  return { env, db, founder, manager, steward, local, applicant, voter, admin, ids, founderSeat, managerSeat, stewardSeat, win, app, squad, objection, election, post };
}
/** What each seat holder's /api/me and the manager's queue say about their roles (the level, the role flags, the seat, the term). */
async function rolesOf(w) {
  const out = {};
  for (const k of ["founder", "manager", "steward"]) {
    const me = await w[k].get("/api/me");
    out[k] = { level: me.level, roles: [me.roles.founder, me.roles.manager, me.roles.steward, me.roles.admin], seat: me.founder.seat && [me.founder.seat.status, me.founder.seat.cityId],
      manager: Boolean(me.national && me.national.manager && me.national.manager.you) };
  }
  out.queue = (await w.manager.get("/api/mod")).role;
  return out;
}

/* ---------------------------------------------------------------- S16-R1 / SEC-S16-1: no seat state transition while frozen */

test("S16-R1 / SEC-S16-1: frozen or held, a founder, steward or manager action below the seat's amount is refused (below_amount) and writes nothing: no grace, no release, every role kept", async () => {
  for (const [state, pages, vars] of STATES) {
    W.useClock("2026-10-24T12:00:00Z");
    pages();
    const w = await world(vars);
    assert.equal(legacySeats(w.env), state);
    for (const p of [w.founder, w.manager, w.steward, w.admin]) await W.reprove(p);
    const roles = await rolesOf(w);
    assert.deepEqual([roles.founder.level, roles.manager.level, roles.steward.level, roles.queue], ["founder", "manager", "founder", "manager"], JSON.stringify(roles));
    for (const p of [w.founder, w.manager, w.steward]) W.setHolding(p.w.address, 10); // below every seat's 180,000
    const before = await legacyRows(w.db);
    const refused = async (res, what) => { assert.deepEqual([res.status, await res.json()], [403, BELOW], `${state}: ${what}`); };
    await refused(await w.founder.send("/api/coins/design", { method: "POST", body: DESIGN }), "the founder's coin design");
    await refused(await w.founder.send("/api/coins/mint", { method: "POST", body: { mint: CITY_COIN } }), "the founder's contract");
    await refused(await w.manager.send("/api/mod/hide", { method: "POST", body: { id: w.post.id, reason: "spam" } }), "a hide by the country manager");
    await refused(await w.manager.send("/api/mod/ban", { method: "POST", body: { userId: w.ids.local, reason: "spam" } }), "a ban proposal by the country manager");
    // a steward's own attempts never add up to a release (two graces in 90 days were the limit: the third released the seat)
    for (let i = 0; i < 4; i++) {
      W.advance(W.HOUR); await W.reprove(w.steward);
      await refused(await w.steward.send("/api/coins/design", { method: "POST", body: DESIGN }), `the steward's attempt ${i + 1}`);
    }
    // a founder who already used up their graces: one more low-balance action released the seat
    await w.db.prepare("UPDATE seats SET graces = ? WHERE id = ?").bind(JSON.stringify([new Date(Date.now() - 20 * W.DAY).toISOString(), new Date(Date.now() - 10 * W.DAY).toISOString()]), w.founderSeat).run();
    const withGraces = await legacyRows(w.db);
    await W.reprove(w.founder);
    await refused(await w.founder.send("/api/coins/design", { method: "POST", body: DESIGN }), "the founder with two graces on record");
    assert.deepEqual(await legacyRows(w.db), withGraces, `${state}: not one seat, term or other legacy row changed`);
    assert.deepEqual({ ...before, seats: null }, { ...withGraces, seats: null });
    // the skipped job never needs to restore anything: nothing was taken. The balances back, every power is there at once
    W.advance(10 * 60_000);
    const job = await runJobs(w.env, Date.now(), W.chain(), () => 0);
    assert.deepEqual([job.seats, job.elections], [{ skipped: "legacy_seats_frozen" }, { skipped: "legacy_seats_frozen" }]);
    for (const p of [w.founder, w.manager, w.steward]) W.setHolding(p.w.address, 2_000_000);
    for (const p of [w.founder, w.manager, w.steward]) await W.reprove(p);
    assert.deepEqual(await rolesOf(w), roles, `${state}: no member lost a role`);
    assert.equal((await w.founder.post("/api/coins/design", DESIGN)).ok, true, "the founder designs the coin");
    assert.equal((await w.manager.post("/api/mod/hide", { id: w.post.id, reason: "spam" })).ok, true, "the manager moderates");
    assert.deepEqual(await legacyRows(w.db), withGraces);
  }
});

test("S16-R1: switch off, the same low-balance action still starts the grace period (and the manager's moderation answers in_grace), as today", async () => {
  const w = await world();
  for (const p of [w.founder, w.manager]) { W.setHolding(p.w.address, 10); await W.reprove(p); }
  assert.deepEqual([(await w.founder.send("/api/coins/design", { method: "POST", body: DESIGN })).status], [403]);
  assert.equal((await w.db.prepare("SELECT status FROM seats WHERE id = ?").bind(w.founderSeat).first()).status, "grace");
  const r = await w.manager.send("/api/mod/hide", { method: "POST", body: { id: w.post.id, reason: "spam" } });
  assert.deepEqual([r.status, await r.json()], [403, { ok: false, error: "in_grace" }]);
  assert.equal((await w.db.prepare("SELECT status FROM seats WHERE id = ?").bind(w.managerSeat).first()).status, "grace");
});

test("S16-R1: the ready-made coin, the coin review and the launch routes: frozen or held, below the amount is refused with nothing written; switch off, today's grace", async () => {
  for (const [state, pages, vars] of [...STATES, ["on", pagesAsCommitted, {}]]) {
    _resetLpKit(); _resetLpAdmin(); _resetLpCoins(); _resetReview();
    pages();
    const w = await readyWorld();
    Object.assign(w.env, vars, { COIN_V2_REVIEW: "on" });
    assert.equal(legacySeats(w.env), state);
    W.setHolding(w.f.w.address, 10); // the seat's amount is 1,000,000
    const seat = () => w.env.DB.prepare("SELECT * FROM seats WHERE city_id = ?").bind(READY_CITY).first();
    const before = await seat();
    const calls = [
      ["Use this coin", () => w.post(w.f, "/api/coins/ready/use", { cityId: READY_CITY, contentHash: "a".repeat(64) })],
      ["a coin change request", () => w.post(w.f, "/api/coins/review/draft", { cityId: READY_CITY, reason: "Locals call the town by this name for years." })],
      ["the launch status (a GET)", async () => { const r = await w.f.send(`/api/lp/launch/status?city=${READY_CITY}&cluster=devnet`, { fetchImpl: w.both }); return { status: r.status, ...(await r.json()) }; }],
      ["the launch transaction", () => w.post(w.f, "/api/lp/launch/tx", { cityId: READY_CITY, cluster: "devnet", mint: fresh() })],
    ];
    for (const [what, call] of calls) {
      const r = await call();
      if (state === "on") {
        assert.deepEqual([r.status, r.error], [403, "in_grace"], `${what}: ${JSON.stringify(r)}`);
        assert.equal((await seat()).status, "grace", `${what}: today, the seat enters its grace period`);
        await w.env.DB.prepare("UPDATE seats SET status = ?, grace_until = ?, graces = ? WHERE id = ?").bind(before.status, before.grace_until, before.graces, before.id).run();
        continue;
      }
      assert.deepEqual([r.status, r.error, r.message], [403, "below_amount", FROZEN_BELOW_AMOUNT], `${state} ${what}: ${JSON.stringify(r)}`);
      assert.deepEqual(await seat(), before, `${state} ${what}: the seat row is untouched`);
    }
  }
});

/* ---------------------------------------------------------------- SEC-S16-2: frozen rows no longer block an unlink */

test("SEC-S16-2: frozen or held, a seat, an open application or a squad place no longer blocks an unlink (the rows stay as recorded, the roles too); switch off, today's 409", async () => {
  for (const [state, pages, vars] of [["on", pagesAsCommitted, {}], ...STATES]) {
    W.useClock("2026-10-24T12:00:00Z");
    pages();
    const w = await world(vars);
    w.env.SIGNUP_FLOW = "v2"; // the live site's sign-up (the wallet routes answer only with it), once the members are made
    assert.equal(legacySeats(w.env), state);
    const before = await legacyRows(w.db);
    for (const who of ["founder", "applicant", "voter"]) {
      await W.reprove(w[who]);
      const r = await w[who].send("/api/me/wallet/unlink", { method: "POST", body: {} });
      if (state === "on") assert.deepEqual([r.status, (await r.json()).error], [409, "seat_or_application"], `switch off: ${who}`);
      else assert.deepEqual([r.status, await r.json()], [200, { ok: true }], `${state}: ${who}`);
    }
    assert.deepEqual(await legacyRows(w.db), before, `${state}: no seat, application, squad place or endorsement changed`);
    if (state === "on") continue;
    const me = await w.founder.get("/api/me");
    assert.deepEqual([me.user.wallet, me.level, me.roles.founder, me.founder.seat.status], [null, "founder", true, "active"], "the founder keeps the title");
    // the seat is backed by a wallet the account no longer has: no founder coin action until that wallet is linked again (SEC-S16-4)
    assert.deepEqual(await w.founder.post("/api/coins/design", DESIGN), { ok: false, error: "no_wallet" });
    assert.equal((await w.voter.get("/api/me")).squad.mine.id, w.squad, "the squad place is still on record");
  }
});

/* ---------------------------------------------------------------- SEC-S16-3 / S16-R5: a value outside the set holds the freeze */

test("SEC-S16-3 / S16-R5: a LEGACY_SEATS value outside the set holds the freeze, named LEGACY_SEATS_VALUE_REFUSED; unset, blank and on stay today's site", async () => {
  for (const env of [{}, { LEGACY_SEATS: "" }, { LEGACY_SEATS: "  " }, { LEGACY_SEATS: "on" }, { LEGACY_SEATS: " On " }, { LEGACY_SEATS: "ON", DEPLOYMENT_ENV: "test" }]) {
    assert.equal(legacySeats(env), "on", JSON.stringify(env));
    assert.deepEqual(legacySeatsRefusals(env), [], JSON.stringify(env));
  }
  for (const v of ["off", "true", "freeze", "1", "yes", "no", "0", "frozen!", "frozen,on", "fro zen"]) {
    for (const extra of [{}, { DEPLOYMENT_ENV: "test" }]) {
      const env = { LEGACY_SEATS: v, ...extra };
      assert.equal(legacySeats(env), "held", JSON.stringify(env));
      assert.equal(legacySeatsFrozen(env), true);
      assert.deepEqual(legacySeatsRefusals(env), ["LEGACY_SEATS_VALUE_REFUSED"], JSON.stringify(env));
    }
  }
  pagesBuiltFrozen();
  assert.deepEqual(legacySeatsRefusals({ LEGACY_SEATS: "off" }), ["LEGACY_SEATS_VALUE_REFUSED", "LEGACY_SEATS_UNSET_PAGES_FROZEN"]);
  pagesAsCommitted();
  // logged by name, once per isolate: the v5 check's own line and the freeze's
  checkPolicyConfig({ LEGACY_SEATS: "freeze", DEPLOYMENT_ENV: "test" }); checkPolicyConfig({ LEGACY_SEATS: "freeze", DEPLOYMENT_ENV: "test" });
  assert.deepEqual(errors, ["policy config refused FLAG_VALUE_INVALID deployment.flags.LEGACY_SEATS", "legacy seats switch refused LEGACY_SEATS_VALUE_REFUSED (held frozen)"]);
  // through the Worker: the writers answer 410 and the job skips its seats and elections steps (a Cloudflare dashboard typo never reopens them)
  const w = await world({ LEGACY_SEATS: "freeze", DEPLOYMENT_ENV: "test" });
  const before = await legacyRows(w.db);
  await W.reprove(w.voter);
  assert.equal((await w.voter.send("/api/seats/endorse", { method: "POST", body: { applicationId: w.app } })).status, 410);
  assert.equal((await W.browser(w.env).get("/api/policy")).legacySeats.state, "frozen");
  W.advance(10 * 60_000);
  const job = await runJobs(w.env, Date.now(), W.chain(), () => 0);
  assert.deepEqual([job.seats, job.elections], [{ skipped: "legacy_seats_frozen" }, { skipped: "legacy_seats_frozen" }]);
  assert.deepEqual(await legacyRows(w.db), before);
});

/* ---------------------------------------------------------------- SEC-S16-4: a seat left by "Remove it" while frozen */
// (test/wallet-disown.test.js runs the whole carry link and "Remove it"; this is the founder side of it)

/* ---------------------------------------------------------------- SEC-S16-5 / S16-R6: the test lab's reset */

test("SEC-S16-5 / S16-R6: the test lab's reset deletes seeded seats, an objection and an election, so it answers 410 while frozen or held, with nothing read or written; switch off, it wipes the seed as today", async () => {
  const w = await world({ SITE_MODE: "preview" });
  await W.reprove(w.admin);
  const seeded = await w.admin.post("/api/admin/test/seed", {});
  assert.equal(seeded.ok, true, JSON.stringify(seeded));
  for (const [state, pages, vars] of STATES) {
    pages(); setEnv(w.env, { ...OFF, ...vars });
    assert.equal(legacySeats(w.env), state);
    const before = await dump(w.db);
    const r = await w.admin.send("/api/admin/test/reset", { method: "POST", body: { confirm: "RESET" } });
    assert.deepEqual([r.status, (await r.json()).error], [410, "seats_frozen"], state);
    assert.deepEqual(await dump(w.db), before, `${state}: the seeded rows and admin_test are untouched`);
  }
  pagesAsCommitted(); setEnv(w.env, OFF);
  await W.reprove(w.admin);
  const r = await w.admin.post("/api/admin/test/reset", { confirm: "RESET" });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.deleted, 20, "8 users, 3 seats, 5 posts, 2 reports, an objection and an election");
});

/* ---------------------------------------------------------------- SEC-S16-6: the sweep */

/** Every /api path written out in the Worker's source, the admin router's cases and the coin review's sub-routes. */
function apiRoutes() {
  const set = new Set();
  for (const f of readdirSync(new URL("../src/", import.meta.url)).filter((x) => x.endsWith(".js"))) {
    for (const m of read(`src/${f}`).matchAll(/"(\/api\/[A-Za-z0-9/_.-]+)"/g)) if (!m[1].endsWith("/")) set.add(m[1]);
  }
  for (const m of read("src/admin.js").matchAll(/case "([a-z0-9/_-]+)":/g)) set.add(`/api/admin/${m[1]}`);
  for (const sub of ["draft", "submit", "cancel", "edit", "reset", "description", "description/review", "description/default"]) set.add(`/api/coins/review/${sub}`);
  // the routes that take the wallet off go last, so the rest run with it; signing out is left out (the roles are read afterwards, signed in)
  const LAST = ["/api/me/wallet/disown", "/api/me/wallet/unlink"];
  return [...[...set].filter((p) => !LAST.includes(p) && p !== "/api/auth/logout").sort(), ...LAST];
}

test("SEC-S16-6: frozen or held, every route by a founder, a steward, a manager, an applicant and the admin (every balance below its seat's amount) leaves the legacy tables byte-identical and every role in place", async () => {
  const routes = apiRoutes();
  assert.ok(routes.length > 150, `${routes.length} routes`);
  for (const r of ["/api/coins/design", "/api/coins/mint", "/api/coins/ready/use", "/api/mod/hide", "/api/lp/launch/status", "/api/lp/launch/tx", "/api/me/wallet/unlink", "/api/admin/test/reset"]) assert.ok(routes.includes(r), r);
  for (const [state, pages, vars] of STATES) {
    W.useClock("2026-10-24T12:00:00Z");
    pages();
    const w = await world({ ...vars, COIN_V2_READY: "on", COIN_V2_REVIEW: "on", PROFILES: "on", NOTIFY: "on", FEED_V2: "on" });
    w.env.SIGNUP_FLOW = "v2"; // the live site's sign-up (the wallet routes answer only with it), once the members are made
    for (const p of [w.founder, w.manager, w.steward, w.admin]) await W.reprove(p);
    const roles = await rolesOf(w);
    for (const p of [w.founder, w.manager, w.steward, w.applicant, w.voter, w.local]) W.setHolding(p.w.address, 10);
    const before = await legacyRows(w.db);
    const body = { ...DESIGN, cityId: UTICA, city: UTICA, id: w.post.id, postId: w.post.id, seatId: w.founderSeat, squadId: w.squad, applicationId: w.app, electionId: w.election,
      userId: w.ids.local, uphold: true, decision: "approve", confirm: "RESET", reason: "spam", note: "the sweep", mint: CITY_COIN, contentHash: "a".repeat(64),
      country: "US", seats: 1, closesInDays: 7, scope: "city", kind: "talk", text: "a sweep line", attestation: null, cluster: "mainnet", draftUpdatedAt: "x", requestId: 1 };
    let sent = 0;
    for (const who of ["founder", "steward", "manager", "applicant", "admin"]) {
      await W.reprove(w[who]);
      for (const path of routes) {
        for (const method of ["POST", "GET"]) {
          const res = await w[who].send(path, { method, body: method === "POST" ? body : undefined });
          await res.arrayBuffer();
          sent++;
        }
      }
    }
    assert.ok(sent > 1500, String(sent));
    assert.deepEqual(await legacyRows(w.db), before, `${state}: not one legacy row moved in ${sent} requests`);
    for (const p of [w.founder, w.manager, w.steward]) W.setHolding(p.w.address, 2_000_000);
    const after = await rolesOf(w);
    // the sweep's own unlink took the wallets off (SEC-S16-2): the roles are what is compared, not the wallet
    assert.deepEqual({ ...after, queue: null }, { ...roles, queue: null }, `${state}: every role in place`);
  }
});

/* ---------------------------------------------------------------- S16-R2: the cities page's country row */

/** renderModerator from public/cities.js, run on a pretend row with `me` as /api/me's answer and `answer` as /api/moderator's. */
async function moderatorRow(me, answer) {
  const js = read("public/cities.js");
  const from = js.indexOf("  const modCache = new Map();"), to = js.indexOf("  /* =================== empty land", from);
  assert.ok(from > 0 && to > from);
  const frozenLine = js.match(/^ {2}const seatsFrozen = \(\) => .*$/m)[0];
  const node = (extra = {}) => ({ hidden: false, className: "", textContent: "", children: [], replaceChildren(...k) { this.children = k; }, append(...k) { this.children.push(...k); }, ...extra });
  const row = node();
  const ctx = {
    $: (s) => (s === "#mod-row" ? row : null),
    el: (tag, cls, text) => node({ tag, className: cls || "", textContent: text == null ? "" : String(text) }),
    countries: { US: "United States" }, fmt: (n) => String(n), solscan: (wallet) => node({ textContent: wallet }),
    document: { createTextNode: (t) => node({ textContent: String(t) }) },
    fetch: async () => { if (answer instanceof Error) throw answer; return { json: async () => answer }; },
    V: () => ({ me: () => me }), mode: "claim",
  };
  vm.createContext(ctx);
  vm.runInContext(`${frozenLine}\nlet selected = null;\n${js.slice(from, to)}\nthis.show = async (c) => { selected = c; await renderModerator(c); };`, ctx);
  await ctx.show({ cc: "US", id: UTICA });
  const text = (n) => (n.children.length ? n.children.map(text).join("") : n.textContent);
  return text(row);
}

test("S16-R2: frozen, the /cities country row names the manager on record (or the frozen rule) and never the old 'city founder who holds the most' rule; today's line is unchanged", async () => {
  const manager = { name: "ZqManager", city: "New York City", endsAt: "2027-01-12T12:00:00.000Z", since: "2026-10-14T12:00:00.000Z" };
  const frozenRule = "No new country manager election opens. A term already under way runs until its end date. Until a country has a manager, the admin covers it.";
  const today = await moderatorRow({ signedIn: false }, { country: "US", rule: "Elected for 90 days by the country's verified locals (votes 50%, service 30%, capped holdings 20%). Until then, the admin covers it.", manager });
  assert.equal(today, "Country moderator (United States): picked at launch. It's the city founder in United States who holds the most $VICINITY.", "switch off: exactly today's line");
  const frozenMe = { signedIn: false, legacySeats: "frozen" };
  const withManager = await moderatorRow(frozenMe, { country: "US", rule: frozenRule, manager });
  assert.match(withManager, /^Country manager \(United States\): ZqManager \(New York City\), term until .+\.$/);
  assert.ok(withManager.includes(new Date(manager.endsAt).toLocaleDateString()), withManager);
  const none = await moderatorRow(frozenMe, { country: "US", rule: frozenRule, manager: null });
  assert.equal(none, `Country manager (United States): none. ${frozenRule}`);
  const failed = await moderatorRow(frozenMe, new Error("offline"));
  assert.equal(failed, "Country manager (United States): couldn't be loaded just now.");
  for (const line of [withManager, none, failed]) assert.doesNotMatch(line, /holds the most|holding the most|picked at launch|\$VICINITY/, line);
});

/* ---------------------------------------------------------------- S16-R4: the admin console */

/** The admin console as the owner, with /api/me answered (site.js) by `me`, and the overview's answers. */
async function adminPage(me, hash = "") {
  const page = await openPage("admin.html", { agreed: "2026-10-01", me });
  const win = page.window, doc = page.doc;
  const A = {
    "/api/admin/me": { ok: true, wallet: "Own3r1111111111111111111111111111111111111", role: "owner" },
    "/api/admin/config": { ok: true, siteMode: "live", flags: {} },
    "/api/admin/overview": { ok: true, users: 12, seats: { active: 2, steward: 1 }, openElections: 1, pendingReports: 0, pendingObjections: 1, pendingLogos: 0, registeredTokens: 0, launchedCityCoins: 0, snapshots: 0 },
    "/api/admin/feedback/count": { ok: true, new: 0, counts: { new: 0, seen: 0, done: 0 } },
    "/api/official": { launchpadV2: false },
    "/api/policy": { policy: { sampling: { maxGapMinutes: 180 } }, balanceHistory: { running: false } },
    "/api/admin/audit": { ok: true, audit: [] },
    "/api/admin/claims": { ok: true, claims: [] }, "/api/admin/reports": { ok: true, reports: [] }, "/api/admin/logos": { ok: true, waiting: 0, logos: [] },
    "/api/admin/objections": { ok: true, objections: [] }, "/api/admin/appeals": { ok: true, appeals: [] },
  };
  win.fetch = async (path) => {
    const body = A[String(path).split("?")[0]] ?? { ok: false, error: "not_found" };
    return { ok: body.ok !== false, status: body.ok === false ? 404 : 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  win.setTimeout = (fn) => { setImmediate(fn); return 0; };
  win.location = { hash, pathname: "/admin", href: `https://vicinity.test/admin${hash}` };
  win.VW = { list: () => [], isMobile: false, KNOWN: [], onChange() {}, safeIcon: () => null, mark: () => doc.createElement("span") };
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  vm.runInContext(read("public/admin-charts.js"), win, { filename: "public/admin-charts.js" });
  vm.runInContext(read("public/admin.js"), win, { filename: "public/admin.js" });
  for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r));
  const card = (label) => doc.querySelectorAll(".adm-metric").find((c) => c.querySelector(".adm-metric__label").textContent === label);
  return { doc, card, src: (label) => card(label).querySelector(".adm-metric__src").textContent };
}

test("S16-R4: frozen, the admin console calls the open election and the objection what they are (on record, closed for changes) and no longer says objections need an admin; today's words unchanged", async () => {
  const signedIn = { ok: true, signedIn: true, user: { handle: "boss", wallet: "Own3r1111111111111111111111111111111111111" } };
  const today = await adminPage(signedIn);
  assert.equal(today.src("Open elections"), "Country votes open now");
  assert.equal(today.src("Seat objections"), "Open objections to a founder seat");
  assert.ok(today.card("Seat objections").classList.contains("is-hot"));
  const todayMod = await adminPage(signedIn, "#moderation");
  assert.match(todayMod.doc.querySelector("#admin-main").textContent, /claims and objections need an admin/);

  const frozenMe = { ...signedIn, legacySeats: "frozen" };
  const frozen = await adminPage(frozenMe);
  assert.equal(frozen.src("Open elections"), "Elections on record, closed for changes");
  assert.equal(frozen.src("Seat objections"), "Objections on record, closed for changes");
  assert.equal(frozen.card("Seat objections").classList.contains("is-hot"), false, "nothing waits on a person: no objection can be decided");
  const text = frozen.doc.querySelector("#admin-main").textContent;
  assert.doesNotMatch(text, /Country votes open now|Open objections to a founder seat/);
  const mod = await adminPage(frozenMe, "#moderation");
  const modText = mod.doc.querySelector("#admin-main").textContent;
  assert.doesNotMatch(modText, /claims and objections need an admin/);
  assert.match(modText, /Everything that waits on a moderator, in one place\. Every decision asks first and is logged\./);
  // the test lab: seeding and reset both closed (both write the seat tables)
  const lab = await adminPage(frozenMe, "#testlab");
  const labText = lab.doc.querySelector("#admin-main").textContent;
  assert.doesNotMatch(labText, /Reset still wipes/);
  assert.deepEqual(lab.doc.querySelectorAll("#admin-main button").map((b) => b.textContent).filter((t) => /Seed test data|Wipe test data/.test(t)), []);
});

/* ---------------------------------------------------------------- S16-R7: the frozen home card */

test("S16-R7: the frozen home card says 'set your home community', with no 'once' that reads as a rule not built yet", () => {
  const html = new Map(buildPages({ legacySeats: "frozen" })).get("index.html");
  assert.match(html, /<p>Sign up and set your home community: its members, holders and feed are in your dashboard\.<\/p>/);
  assert.doesNotMatch(html, /home community once/);
});
