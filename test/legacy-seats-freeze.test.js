// The legacy seat freeze (Citycoin.dev master v5, stage S16; implementation-report.md S16 row, acceptance rows A05, B12 and V05;
// docs/citycoin-master/schema-and-api.md section 3.9). LEGACY_SEATS=frozen, read only through src/v5policy.js legacySeats: every seat, squad,
// endorsement, objection, resign and election writer answers 410 seats_frozen before it reads or writes anything, the scheduled job skips its
// seats and elections steps, the balance samples stop updating the hold streaks (the samples themselves go on), a founder seat alone no longer
// moderates, and /api/policy, /api/me and /api/moderator stop describing the seven-day, ladder, steward, squad and election rules as current.
// The history reads stay and nobody loses a seat or a term. LEGACY_SEATS unset, blank or "on" is today's site exactly; a "frozen" whose own
// inputs are refused is held frozen (master section 15); a value outside the switch's set is refused by name and is today's site. Every
// wallet, mint and name below is a clearly fake test fixture.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as W from "./helpers/world.js";
import { seedSeat } from "./helpers/launchpad.js";
import { ACCEPTED, pagesAsCommitted, pagesBuiltWithSwitch } from "./helpers/mainswitch.js";
import { handleApi } from "../src/index.js";
import { runJobs } from "../src/jobs.js";
import { advanceSeats, legacySeatsFrozen as seatsModuleFrozen } from "../src/seats.js";
import { advanceElections } from "../src/elections.js";
import { tenure } from "../src/ledger.js";
import { canModerate, moderatesCity, powersOf } from "../src/roles.js";
import { ADMIN_LEGACY_WRITERS } from "../src/admin.js";
import { ensureSchema } from "../src/store.js";
import { LEGACY_SEATS_CODES, _resetPolicyCheck, checkPolicyConfig, legacySeats, legacySeatsFrozen, legacySeatsRefusals, mainTokenV5 } from "../src/v5policy.js";
import { _resetDeploymentCheck } from "../src/maintoken.js";
import { POLICY } from "../src/policy.js";

const FROZEN = Object.freeze({ LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "test" });
const IN_ALBANY = { lat: 42.65, lon: -73.76, accuracy: 30 };
const UTICA = "5142056", NYC = "5128581", ALBANY = "5106834", SYRACUSE = "5140405";
const FAKE_MINT = "FakeMainTokenMint111111111111111111111111111";

let errors = [];
const realError = console.error;
beforeEach(() => {
  W.useClock("2026-10-24T12:00:00Z");
  pagesAsCommitted(); _resetPolicyCheck(); _resetDeploymentCheck();
  errors = []; console.error = (...a) => errors.push(a.map(String).join(" "));
});
afterEach(() => { console.error = realError; pagesAsCommitted(); W.realClock(); });

/** Set (or, with undefined, remove) settings on a live env: the switches are read on every request. */
const setEnv = (env, vars) => { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete env[k]; else env[k] = v; } };
const OFF = { LEGACY_SEATS: undefined, DEPLOYMENT_ENV: undefined };

/** Every row of every table, and the schema. */
async function dump(db) {
  const tables = (await db.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name").all()).results;
  const out = { schema: tables };
  for (const t of tables.filter((x) => x.sql && /^CREATE TABLE/i.test(x.sql))) out[t.name] = (await db.prepare(`SELECT * FROM "${t.name}"`).all()).results.map((r) => JSON.stringify(r)).sort();
  return out;
}
const LEGACY_TABLES = ["windows", "applications", "endorsements", "seats", "squads", "squad_members", "objections", "elections", "election_votes", "manager_terms", "streaks"];
const legacyRows = async (db) => { const d = await dump(db); return Object.fromEntries(LEGACY_TABLES.map((t) => [t, d[t]])); };

/** The D1 binding with a counter in front: how many statements a request prepared or sent. */
function counted(env) {
  const real = env.DB;
  const c = { n: 0 };
  env.DB = new Proxy(real, { get(t, k) { const v = t[k]; return typeof v === "function" && ["prepare", "batch", "exec", "dump"].includes(k) ? (...a) => { c.n++; return v.apply(t, a); } : v; } });
  return { c, restore: () => { env.DB = real; } };
}

/**
 * A world with every kind of legacy record: an active founder (Utica), a country manager with an active term (New York City), a steward whose
 * balance fell (Syracuse), an open window with an application and an endorsement (Albany), a forming squad, an open objection, a decided window
 * and a decided election with published results, an open election, hold streaks, and a post in Utica's city feed.
 */
async function world(extra = {}) {
  const env = W.newWorld({ VICINITY_MINT: W.MINT, ...extra });
  const founder = await W.person(env, { home: W.IN_UTICA, holds: 2_000_000 });
  const manager = await W.person(env, { home: W.IN_NYC, holds: 2_000_000 });
  const steward = await W.person(env, { home: { lat: 43.05, lon: -76.15, accuracy: 30 }, holds: 10 });
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
  await db.prepare(`INSERT INTO manager_terms (country, seat_id, user_id, wallet, starts_at, ends_at, status) VALUES ('US', ?, ?, ?, ?, ?, 'active')`)
    .bind(managerSeat, ids.manager, manager.w.address, at(-10 * W.DAY), at(80 * W.DAY)).run();
  const win = (await db.prepare(`INSERT INTO windows (city_id, city_name, country, policy, threshold, opened_at, closes_at) VALUES (?, 'Albany', 'US', 6, 180000, ?, ?) RETURNING id`)
    .bind(ALBANY, at(-W.HOUR), at(71 * W.HOUR)).first()).id;
  const app = (await db.prepare(`INSERT INTO applications (window_id, city_id, user_id, wallet, pitch, created_at) VALUES (?, ?, ?, ?, 'Albany first', ?) RETURNING id`)
    .bind(win, ALBANY, ids.applicant, applicant.w.address, at(-W.HOUR)).first()).id;
  await db.prepare("INSERT INTO endorsements (window_id, user_id, application_id, created_at) VALUES (?, ?, ?, ?)").bind(win, ids.voter, app, at(-W.HOUR)).run();
  const result = JSON.stringify({ winner: null, applicants: [] });
  const decided = (await db.prepare(`INSERT INTO windows (city_id, city_name, country, policy, threshold, opened_at, closes_at, status, decided_at, result, result_hash)
    VALUES ('999', 'Oldtown', 'US', 5, 100000, ?, ?, 'empty', ?, ?, 'ab') RETURNING id`).bind(at(-30 * W.DAY), at(-27 * W.DAY), at(-27 * W.DAY), result).first()).id;
  const squad = (await db.prepare(`INSERT INTO squads (city_id, city_name, country, created_by, status, created_at) VALUES (?, 'Albany', 'US', ?, 'forming', ?) RETURNING id`)
    .bind(ALBANY, ids.voter, at(-W.DAY)).first()).id;
  await db.prepare("INSERT INTO squad_members (squad_id, user_id, wallet, joined_at) VALUES (?, ?, ?, ?)").bind(squad, ids.voter, voter.w.address, at(-W.DAY)).run();
  const objection = (await db.prepare("INSERT INTO objections (seat_id, user_id, reason, created_at) VALUES (?, ?, 'not a local, as far as I know', ?) RETURNING id")
    .bind(founderSeat, ids.local, at(-W.HOUR)).first()).id;
  const election = (await db.prepare("INSERT INTO elections (country, policy, opened_at, closes_at) VALUES ('US', 6, ?, ?) RETURNING id").bind(at(-W.DAY), at(6 * W.DAY)).first()).id;
  const pastElection = (await db.prepare(`INSERT INTO elections (country, policy, opened_at, closes_at, status, decided_at, result, result_hash)
    VALUES ('CA', 5, ?, ?, 'decided', ?, ?, 'cd') RETURNING id`).bind(at(-60 * W.DAY), at(-53 * W.DAY), at(-53 * W.DAY), result).first()).id;
  await db.prepare("INSERT INTO streaks (wallet, level, above_since) VALUES (?, 180000, ?), (?, 180000, ?)")
    .bind(founder.w.address, at(-40 * W.DAY), applicant.w.address, at(-9 * W.DAY)).run();
  await W.reprove(local);
  const post = (await local.post("/api/posts", { scope: "city", kind: "talk", body: "a post in Utica" })).post;
  assert.ok(post && post.id, "a post to moderate");
  return { env, db, founder, manager, steward, local, applicant, voter, admin, ids, founderSeat, managerSeat, stewardSeat, win, app, decided, squad, objection, election, pastElection, post };
}

/** Every legacy writer, with a body that the switch-off site accepts (or refuses on its own rules): [who, path, body]. */
const writers = (w) => [
  ["applicant", "/api/seats/apply", { attestation: null, pitch: "Albany" }],
  ["applicant", "/api/seats/withdraw", {}],
  ["voter", "/api/seats/endorse", { applicationId: w.app }],
  ["local", "/api/seats/object", { seatId: w.founderSeat, reason: "another reason given here" }],
  ["founder", "/api/seats/resign", {}],
  ["admin", "/api/seats/objections/decide", { id: w.objection, uphold: true, note: "checked" }],
  ["voter", "/api/seats/squad/create", {}],
  ["local", "/api/seats/squad/join", { squadId: w.squad }],
  ["voter", "/api/seats/squad/leave", { squadId: w.squad }],
  ["voter", "/api/seats/squad/apply", { squadId: w.squad, pitch: "together", attestation: null }],
  ["voter", "/api/elections/vote", { electionId: w.election, seatId: w.founderSeat }],
  ["admin", "/api/admin/seats/decide", { id: w.app, decision: "reject", note: "test" }],
  ["admin", "/api/admin/objections/decide", { id: w.objection, uphold: true, note: "test" }],
  ["admin", "/api/admin/elections/create", { country: "CA", seats: 1, closesInDays: 7 }],
  ["admin", "/api/admin/test/seed", {}],
];
const HISTORY = (w) => ["/api/seats", "/api/claims", `/api/seats/results/${w.decided}`, `/api/elections/results/${w.pastElection}`];
const ADMIN_HISTORY = ["/api/admin/seats", "/api/admin/claims", "/api/admin/objections?status=all", "/api/admin/elections"];
const bodyOf = async (res) => ({ status: res.status, body: await res.text() });

/* ---------------------------------------------------------------- the gate */

test("the gate: frozen only with LEGACY_SEATS=frozen; held frozen when its own inputs are refused; unset, on or a refused value is today's site", () => {
  for (const env of [{}, { LEGACY_SEATS: "" }, { LEGACY_SEATS: "  " }, { LEGACY_SEATS: "on" }, { LEGACY_SEATS: " On " }, { LEGACY_SEATS: "on", DEPLOYMENT_ENV: "test" }]) {
    assert.equal(legacySeats(env), "on", JSON.stringify(env));
    assert.equal(legacySeatsFrozen(env), false);
  }
  assert.equal(legacySeats(FROZEN), "frozen");
  assert.equal(legacySeats({ LEGACY_SEATS: " FROZEN ", DEPLOYMENT_ENV: "Preview" }), "frozen", "trimmed, any letter case, as the v5 check reads it");
  assert.deepEqual(legacySeatsRefusals(FROZEN), []);
  // its own inputs refused: held, frozen all the same (master section 15: historical rules never authorize a new action)
  for (const env of [{ LEGACY_SEATS: "frozen" }, { LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "staging" }]) {
    assert.equal(legacySeats(env), "held", JSON.stringify(env));
    assert.equal(legacySeatsFrozen(env), true);
    assert.deepEqual(legacySeatsRefusals(env), ["LEGACY_SEATS_POLICY_REFUSED"]);
  }
  assert.deepEqual([...LEGACY_SEATS_CODES], ["CONFIG_CHECK_FAILED", "DEPLOYMENT_MISSING", "ENVIRONMENT_INVALID", "ENVIRONMENT_UNSET"]);
  // an error in an UNRELATED input never unfreezes it (the lesson of review finding SEC-1 of PR #99)
  for (const bad of [{ OFFICIAL_X_URL: "not a link" }, { OFFICIAL_TELEGRAM_URL: "https://t.me/+invite" }, { MAIN_TOKEN_MINT: "not-a-mint" },
    { MAIN_TOKEN_MINT: "2aVkhRfAEm44tMhFo8oamWvumGGvweFqnUwukRMBkray" }, { LEGACY_LINK_UNTIL: "next week" }, { SITE_ORIGIN: "http://evil.example" },
    { WALLET_ONLY: "on" }, { HOST_REDIRECT: "on" }, { SELECTION_V5: "on" }, { PUBLIC_V5: "maybe" }, { MAIN_TOKEN_V5: "on" }, { FOUNDER_RECORD_CHAIN: "on" }]) {
    const env = { ...FROZEN, ...bad };
    assert.equal(legacySeats(env), "frozen", JSON.stringify(bad));
    assert.deepEqual(legacySeatsRefusals(env), [], JSON.stringify(bad));
  }
  // a value outside the switch's set does not express it: refused by name (FLAG_VALUE_INVALID), and today's site
  for (const v of ["off", "true", "freeze", "1", "yes", "frozen!", "frozen,on"]) {
    assert.equal(legacySeats({ LEGACY_SEATS: v, DEPLOYMENT_ENV: "test" }), "on", v);
    assert.equal(legacySeats({ LEGACY_SEATS: v }), "on", v);
  }
  // never throws: a setting that cannot be read reads as unset
  assert.equal(legacySeats({ get LEGACY_SEATS() { throw new Error("boom"); } }), "on");
  assert.equal(legacySeats(null), "on");
  assert.equal(legacySeats(undefined), "on");
  // the seats module asks the same gate
  assert.equal(seatsModuleFrozen, legacySeatsFrozen);
});

// (The MAIN_TOKEN_V5 branch of legacySeats is belt and braces: the v5 check accepts MAIN_TOKEN_V5 only with LEGACY_SEATS=frozen, so no reachable
// configuration counts the main token with the seats not frozen; this test pins the outcome, not that branch.)
test("MAIN_TOKEN_V5 counting freezes through the same gate, and a switch that does not count adds nothing to the freeze", () => {
  const full = { ...ACCEPTED, VICINITY_MINT: W.MINT, MAIN_TOKEN_MINT: FAKE_MINT };
  assert.equal(mainTokenV5(full), false, "pages not built for the switch");
  assert.equal(legacySeats(full), "frozen", "LEGACY_SEATS=frozen itself");
  pagesBuiltWithSwitch();
  assert.equal(mainTokenV5(full), true);
  assert.equal(legacySeats(full), "frozen");
  // the switch without the seats frozen is refused by the v5 check (MAIN_TOKEN_ON_WITH_LEGACY_SEATS): nothing counts, nothing freezes
  const unfrozen = { ...full, LEGACY_SEATS: undefined };
  assert.equal(mainTokenV5(unfrozen), false);
  assert.equal(legacySeats(unfrozen), "on");
});

test("refusals are logged once per isolate by name; with the switch unset, on or accepted nothing is logged about it", () => {
  checkPolicyConfig({}); checkPolicyConfig({ LEGACY_SEATS: "on" }); checkPolicyConfig(FROZEN); checkPolicyConfig({ ...FROZEN, OFFICIAL_X_URL: "nope" });
  assert.deepEqual(errors.filter((e) => /legacy seats/.test(e)), []);
  assert.deepEqual(errors.filter((e) => /LEGACY_SEATS/.test(e)), []);
  _resetPolicyCheck(); errors = [];
  checkPolicyConfig({ LEGACY_SEATS: "frozen" }); checkPolicyConfig({ LEGACY_SEATS: "frozen" });
  assert.deepEqual(errors, ["policy config refused ENVIRONMENT_UNSET deployment.environment",
    "legacy seats switch refused LEGACY_SEATS_POLICY_REFUSED (held frozen)"], "two lines, codes only, once");
  _resetPolicyCheck(); errors = [];
  checkPolicyConfig({ LEGACY_SEATS: "freeze", DEPLOYMENT_ENV: "test" });
  assert.deepEqual(errors, ["policy config refused FLAG_VALUE_INVALID deployment.flags.LEGACY_SEATS"], "a value outside the set: named, and today's site");
});

/* ---------------------------------------------------------------- the writers */

test("every legacy writer answers 410 seats_frozen before any read or write (not even the session), and nothing in D1 changes", async () => {
  const w = await world({ SITE_MODE: "preview" });
  for (const p of [w.founder, w.manager, w.local, w.applicant, w.voter, w.admin]) await W.reprove(p);
  setEnv(w.env, FROZEN);
  const before = await dump(w.db);
  for (const [who, path, body] of writers(w)) {
    const meter = counted(w.env);
    const res = await w[who].send(path, { method: "POST", body });
    meter.restore();
    assert.equal(res.status, 410, path);
    assert.deepEqual(await res.json(), { ok: false, error: "seats_frozen", message: "Founder seats, squads and elections are closed for changes. Nothing was changed." }, path);
    assert.equal(meter.c.n, 0, `${path}: not one statement prepared`);
    // signed out: the same 410, before the session is looked up (today that is a 401 or 403)
    const anon = counted(w.env);
    const r2 = await W.browser(w.env).send(path, { method: "POST", body });
    anon.restore();
    assert.equal(r2.status, 410, `${path} signed out`);
    assert.equal(anon.c.n, 0, `${path} signed out: not one statement`);
  }
  assert.deepEqual(await dump(w.db), before, "not one row or table changed");
  // the admin list is exactly the admin writers above
  assert.deepEqual([...ADMIN_LEGACY_WRITERS].sort(), writers(w).filter(([, p]) => p.startsWith("/api/admin/")).map(([, p]) => p.slice("/api/admin/".length)).sort());
  // other methods keep their 405; the test lab's reset (fake rows only) is not frozen
  assert.equal((await w.admin.send("/api/admin/seats/decide")).status, 405);
  assert.equal((await w.applicant.send("/api/seats/apply")).status, 405);
  assert.equal((await w.admin.send("/api/admin/test/reset", { method: "POST", body: { confirm: "RESET" } })).status, 200);

  // the same requests with the switch off are today's: none answers 410 (each its own outcome: done, or its own rule)
  setEnv(w.env, OFF);
  for (const p of [w.founder, w.manager, w.local, w.applicant, w.voter, w.admin]) await W.reprove(p);
  for (const [who, path, body] of writers(w)) {
    const res = await w[who].send(path, { method: "POST", body });
    assert.notEqual(res.status, 410, `${path}: ${await res.clone().text()}`);
    assert.notEqual((await res.json()).error, "seats_frozen", path);
  }
});

test("held frozen (LEGACY_SEATS=frozen, DEPLOYMENT_ENV missing) still answers 410; a refused value is today's writer; an unrelated error never unfreezes", async () => {
  const w = await world();
  await W.reprove(w.founder);
  for (const [vars, frozen] of [[{ LEGACY_SEATS: "frozen" }, true], [{ LEGACY_SEATS: "Frozen", DEPLOYMENT_ENV: "nowhere" }, true],
    [{ ...FROZEN, OFFICIAL_X_URL: "nope", MAIN_TOKEN_MINT: "bad" }, true], [{ LEGACY_SEATS: "freeze", DEPLOYMENT_ENV: "test" }, false], [{ LEGACY_SEATS: "off" }, false]]) {
    setEnv(w.env, { ...OFF, OFFICIAL_X_URL: undefined, MAIN_TOKEN_MINT: undefined, ...vars });
    const r = await W.browser(w.env).send("/api/seats/apply", { method: "POST", body: {} });
    assert.equal(r.status, frozen ? 410 : 401, JSON.stringify(vars));
    const job = await runJobs(w.env, Date.now(), W.chain(), () => 0.99);
    assert.equal(job.seats.skipped === "legacy_seats_frozen", frozen, JSON.stringify(vars));
    W.advance(10 * 60_000);
  }
});

/* ---------------------------------------------------------------- the history reads */

test("the history reads answer exactly as with the switch off: the map, the claims, the published results, the admin lists; the squad stays readable", async () => {
  const w = await world();
  const read = async () => {
    const out = {};
    for (const p of HISTORY(w)) out[p] = await bodyOf(await W.browser(w.env).send(p));
    for (const p of ADMIN_HISTORY) out[p] = await bodyOf(await w.admin.send(p));
    return out;
  };
  const off = await read();
  for (const p of Object.keys(off)) assert.equal(off[p].status, 200, p);
  W.advance(31_000); // past the 30-second answer cache of /api/seats
  setEnv(w.env, FROZEN);
  assert.deepEqual(await read(), off);
  const squad = await W.browser(w.env).send(`/api/seats/squad/${w.squad}`);
  assert.equal(squad.status, 200);
  assert.equal((await squad.json()).squad.members.length, 1);
});

/* ---------------------------------------------------------------- the job */

test("the job: seats and elections skipped before any read, no streak started or ended, the balance sample still taken; nobody demoted", async () => {
  const off = await world();
  W.advance(10 * 60_000);
  const offJob = await runJobs(off.env, Date.now(), W.chain(), () => 0);
  assert.equal(offJob.sample.sampled, true);
  assert.equal(offJob.seats.grace, 1, "switch off: the steward under the bar goes into grace, as today");
  assert.ok((await off.db.prepare("SELECT grace_until FROM seats WHERE id = ?").bind(off.stewardSeat).first()).grace_until, "a steward's 48-hour grace");
  assert.ok((await off.db.prepare("SELECT COUNT(*) AS n FROM streaks WHERE above_since IS NOT NULL").first()).n > 2, "switch off: the sample starts streaks");

  const on = await world(FROZEN);
  W.advance(10 * 60_000);
  const before = await legacyRows(on.db);
  const samples = (await on.db.prepare("SELECT COUNT(*) AS n FROM balance_samples").first()).n;
  const job = await runJobs(on.env, Date.now(), W.chain(), () => 0);
  assert.deepEqual([job.seats, job.elections], [{ skipped: "legacy_seats_frozen" }, { skipped: "legacy_seats_frozen" }]);
  assert.equal(job.sample.sampled, true, "the sample is taken: the snapshot and the growth chart read the balance history");
  assert.equal((await on.db.prepare("SELECT COUNT(*) AS n FROM balance_samples").first()).n, samples + 1);
  assert.deepEqual(await legacyRows(on.db), before, "no seat, window, application, endorsement, squad, objection, election, vote, term or streak row moved");
  // eight days on: the open window and election are never closed, the steward is never put in grace, the term still counts
  for (let i = 0; i < 4; i++) { W.advance(2 * W.DAY); await runJobs(on.env, Date.now(), W.chain(), () => 0); }
  assert.deepEqual(await legacyRows(on.db), before);
  assert.deepEqual(await advanceSeats(on.env, Date.now(), W.chain()), { skipped: "legacy_seats_frozen" });
  assert.deepEqual(await advanceElections(on.env, Date.now(), W.chain()), { skipped: "legacy_seats_frozen" });
  const meter = counted(on.env);
  await advanceSeats(on.env, Date.now(), W.chain()); await advanceElections(on.env, Date.now(), W.chain());
  meter.restore();
  assert.equal(meter.c.n, 0, "nothing read");
  // a hold streak is not shown as running while frozen
  assert.equal((await tenure(on.env, on.founder.w.address, 180000, Date.now())).qualified, false);
  assert.equal((await tenure({ VICINITY_MINT: W.MINT, DB: on.db }, on.founder.w.address, 180000, Date.now())).qualified, true, "switch off: the same row counts");
});

/* ---------------------------------------------------------------- roles */

test("roles: the founder branch of canModerate is off while frozen; the seat, the level and the vote weight stay; managers and admins moderate as before", async () => {
  // the rule itself
  const founderPw = { admin: false, managerCountry: null, founderCity: UTICA };
  const cityPost = { scope: "city", place: UTICA, country: "US" };
  assert.equal(canModerate(founderPw, cityPost), true);
  assert.equal(moderatesCity(founderPw), UTICA);
  assert.equal(canModerate({ ...founderPw, founderModeration: false }, cityPost), false);
  assert.equal(moderatesCity({ ...founderPw, founderModeration: false }), null);
  assert.equal(canModerate({ ...founderPw, managerCountry: "US", founderModeration: false }, cityPost), true, "a manager, in their country");
  assert.equal(canModerate({ admin: true, founderModeration: false }, cityPost), true);

  const w = await world();
  const userOf = async (p) => w.db.prepare("SELECT * FROM users WHERE wallet = ?").bind(p.w.address).first();
  const offPw = await powersOf(w.env, await userOf(w.founder), W.chain());
  assert.equal(offPw.founderCity, UTICA);
  assert.ok(!("founderModeration" in offPw), "switch off: no new key");
  setEnv(w.env, FROZEN);
  const pw = await powersOf(w.env, await userOf(w.founder), W.chain());
  assert.deepEqual({ ...pw, founderModeration: undefined }, { ...offPw, founderModeration: undefined }, "the same powers otherwise: seat, level, weight");
  assert.equal(pw.founderModeration, false);
  assert.equal(pw.level, "founder");

  // through the routes: the founder can no longer hide a post in their city, nor sees a moderator queue; the manager and the admin can
  for (const p of [w.founder, w.manager, w.admin]) await W.reprove(p);
  const r = await w.founder.send("/api/mod/hide", { method: "POST", body: { id: w.post.id, reason: "spam" } });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "not_allowed");
  assert.deepEqual(await w.founder.get("/api/mod"), { ok: true, moderator: false });
  const mq = await w.manager.get("/api/mod");
  assert.equal(mq.role, "manager");
  const feed = await w.founder.get("/api/posts?scope=city");
  assert.ok(feed.posts.every((p) => p.canModerate === false), "no moderation control on the founder's feed");
  assert.equal((await w.manager.post("/api/mod/hide", { id: w.post.id, reason: "spam" })).ok, true, "the country manager hides it");
  assert.equal((await w.admin.post("/api/mod/unhide", { id: w.post.id })).ok, true, "the admin undoes it");
  // switch off: the founder moderates their city, as today
  setEnv(w.env, OFF);
  await W.reprove(w.founder);
  assert.equal((await w.founder.get("/api/mod")).role, "founder");
  assert.equal((await w.founder.post("/api/mod/hide", { id: w.post.id, reason: "spam" })).ok, true);
});

/* ---------------------------------------------------------------- the public answers */

test("/api/policy: the key legacySeats while frozen (the policy itself unchanged); none with the switch off", async () => {
  const w = await world();
  const off = await W.browser(w.env).get("/api/policy");
  assert.ok(!("legacySeats" in off));
  assert.deepEqual(off.policy, JSON.parse(JSON.stringify(POLICY)));
  setEnv(w.env, { LEGACY_SEATS: "on" });
  assert.deepEqual(await W.browser(w.env).get("/api/policy"), off, "LEGACY_SEATS=on is today's answer");
  for (const vars of [FROZEN, { LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: undefined }]) {
    setEnv(w.env, vars);
    const on = await W.browser(w.env).get("/api/policy");
    const { legacySeats: status, ...rest } = on;
    assert.deepEqual(rest, off, "nothing else moves");
    assert.equal(status.state, "frozen");
    assert.deepEqual(status.history, ["policy.founder", "policy.voters", "policy.manager"]);
    assert.match(status.statement, /history: no new seat claim, endorsement, objection, squad, resignation or election is accepted/);
  }
});

test("/api/moderator: no election rule described as current while frozen; the manager of a term under way is still shown", async () => {
  const w = await world();
  const off = await W.browser(w.env).get("/api/moderator?country=US");
  assert.match(off.rule, /^Elected for 90 days/);
  assert.equal(off.manager.city, "New York City");
  setEnv(w.env, FROZEN);
  const on = await W.browser(w.env).get("/api/moderator?country=US");
  assert.equal(on.rule, "No new country manager election opens. A term already under way runs until its end date. Until a country has a manager, the admin covers it.");
  assert.deepEqual(on.manager, off.manager, "no member loses a role");
  // a term past its end date stops counting on its own date, frozen or not (managerOf reads the dates)
  W.advance(81 * W.DAY);
  assert.equal((await W.browser(w.env).get("/api/moderator?country=US")).manager, null);
});

test("/api/me while frozen: the key legacySeats, no founder path, no endorsing, voting or squad offered, no Founder-ready badge; seats and terms kept", async () => {
  const w = await world();
  // a member who resigned a seat ten days ago (a 30-day founder cooldown today)
  await w.db.prepare(`INSERT INTO seats (city_id, city_name, country, user_id, wallet, policy, threshold, status, created_at, ended_at, end_reason)
    VALUES ('777', 'Oldtown', 'US', ?, ?, 5, 100000, 'released', ?, ?, 'resigned')`).bind(w.ids.local, w.local.w.address, new Date(Date.now() - 40 * W.DAY).toISOString(), new Date(Date.now() - 10 * W.DAY).toISOString()).run();
  for (const p of [w.founder, w.voter, w.manager, w.local, w.applicant]) await W.reprove(p);
  const offFounder = await w.founder.get("/api/me");
  const offVoter = await w.voter.get("/api/me");
  assert.ok((await w.local.get("/api/me")).founder.cooldownUntil, "switch off: the cooldown is shown");
  assert.equal((await w.applicant.get("/api/me")).squad.joinable.id, w.squad, "switch off: the forming squad is offered");
  assert.ok(!("legacySeats" in offFounder) && !("legacySeats" in offVoter), "switch off: no new key");
  assert.equal(offFounder.progress.steps.length, 6);
  assert.ok(offFounder.badges.some((b) => b.id === "founder_ready"));
  setEnv(w.env, { LEGACY_SEATS: "on" });
  W.advance(1000);
  for (const p of [w.founder, w.voter]) await W.reprove(p);
  const onFounder = await w.founder.get("/api/me");
  assert.deepEqual({ ...onFounder, checkedAt: null }, { ...(await w.founder.get("/api/me")), checkedAt: null });
  assert.ok(!("legacySeats" in onFounder), "LEGACY_SEATS=on: no new key");

  setEnv(w.env, FROZEN);
  assert.equal((await W.browser(w.env).get("/api/me")).legacySeats, "frozen", "signed out too");
  assert.equal((await w.founder.get("/api/me?lite=1")).legacySeats, "frozen");
  const me = await w.founder.get("/api/me");
  assert.equal(me.legacySeats, "frozen");
  assert.equal(me.level, "founder", "the role stays");
  assert.equal(me.roles.founder, true);
  assert.equal(me.founder.seat.status, "active");
  assert.equal(me.founder.seat.cityId, UTICA);
  assert.deepEqual([me.founder.eligible, me.founder.why, me.founder.threshold, me.founder.tenure, me.founder.cooldownUntil, me.founder.homeReadyAt, me.founder.challenging],
    [false, "seats_frozen", null, null, null, null, null]);
  assert.deepEqual(me.progress.steps.map((s) => s.id), ["account", "home"]);
  assert.equal(me.progress.steps[1].label, "Home: Utica");
  assert.ok(!JSON.stringify(me.progress).match(/days|Steward|Claim|Confirmed founder/), JSON.stringify(me.progress));
  assert.ok(!me.badges.some((b) => b.id === "founder_ready"));
  const cf = me.badges.find((b) => b.id === "city_founder");
  assert.deepEqual([cf.earned, cf.name, cf.detail], [true, "City Founder", "A founder seat on record."]);
  assert.ok(!me.lost.includes("founder_ready"));

  const v = await w.voter.get("/api/me");
  assert.equal(v.community.window.id, w.win, "the open window is still shown: history");
  assert.equal(v.community.window.applicants.length, 1);
  assert.deepEqual([v.community.window.canEndorse, v.community.window.whyNot], [false, "seats_frozen"]);
  assert.equal(v.community.window.myEndorsement, w.app, "the endorsement on record");
  assert.deepEqual([v.national.election.id, v.national.election.canVote, v.national.election.whyNot], [w.election, false, "seats_frozen"]);
  assert.equal(v.squad.mine && v.squad.mine.id, w.squad, "the member's own squad stays readable");
  const m = await w.manager.get("/api/me");
  assert.equal(m.level, "manager");
  assert.equal(m.national.manager.you, true);
  const mgr = m.badges.find((b) => b.id === "country_manager");
  assert.deepEqual([mgr.earned, mgr.detail], [true, "A country manager term on record."]);
  // no squad is offered to join or start, and no founder cooldown is described
  assert.deepEqual((await w.applicant.get("/api/me")).squad, { mine: null, joinable: null, canCreate: false });
  const l = await w.local.get("/api/me");
  assert.deepEqual(l.squad, { mine: null, joinable: null, canCreate: false });
  assert.equal(l.founder.cooldownUntil, null);
});

test("member profiles while frozen: no Founder-ready badge; the founder badge stays", async () => {
  const w = await world({ PROFILES: "on" });
  await w.db.prepare("UPDATE users SET handle = 'zq_founder', badges = ? WHERE wallet = ?").bind(JSON.stringify(["founder_ready", "city_founder"]), w.founder.w.address).run();
  const off = (await w.local.get("/api/profile?u=zq_founder")).profile;
  assert.ok(off.badges.some((b) => b.id === "founder_ready" && b.earned), JSON.stringify(off.badges));
  setEnv(w.env, FROZEN);
  const on = (await w.local.get("/api/profile?u=zq_founder")).profile;
  assert.ok(!on.badges.some((b) => b.id === "founder_ready"));
  assert.ok(on.badges.some((b) => b.id === "city_founder" && b.earned));
  assert.equal(on.level, off.level, "the role stays");
});

/* ---------------------------------------------------------------- switch-off parity inside the suite */

test("LEGACY_SEATS unset and LEGACY_SEATS=on give the same answers, the same job and the same D1, request for request", async () => {
  const run = async (extra) => {
    W.useClock("2026-10-24T12:00:00Z");
    const w = await world(extra);
    const out = [];
    for (const p of [w.founder, w.voter, w.manager, w.admin]) await W.reprove(p);
    for (const p of ["/api/me", "/api/policy", "/api/moderator?country=US", "/api/mod", "/api/seats", `/api/seats/squad/${w.squad}`]) {
      for (const who of ["founder", "voter", "manager"]) { const r = await w[who].send(p); out.push([who, p, r.status, (await r.text()).replace(/"checkedAt":"[^"]+"/, "")]); }
    }
    W.advance(10 * 60_000);
    out.push(JSON.stringify(await runJobs(w.env, Date.now(), W.chain(), () => 0)));
    for (const [who, path, body] of writers(w)) { const r = await w[who].send(path, { method: "POST", body }); out.push([who, path, r.status]); }
    const d = await dump(w.db);
    // the rows carry this run's random keys and wallets: compare their shape, the legacy tables and the statuses
    out.push(LEGACY_TABLES.map((t) => [t, d[t].length]));
    out.push((await w.db.prepare("SELECT status, end_reason FROM seats ORDER BY id").all()).results);
    return out.map((x) => JSON.stringify(x).replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "<b58>").replace(/[1-9A-HJ-NP-Za-km-z]{5}\*{5}[1-9A-HJ-NP-Za-km-z]{3}/g, "<masked>")
      .replace(/\b[A-Z][a-z]+[A-Z][a-z]+\d{2}\b/g, "<handle>").replace(/P?g\d+/g, "<g>").replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<t>"));
  };
  assert.deepEqual(await run({ LEGACY_SEATS: "on" }), await run({}));
});
