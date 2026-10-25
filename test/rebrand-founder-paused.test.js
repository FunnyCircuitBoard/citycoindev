// Rebrand review finding RB-1 (Citycoin.dev label migration, S48): under BRAND=citycoin with no token live (no MAIN_TOKEN_V5), the founder
// amount is an amount of the legacy token, which that site measures nowhere (src/official.js tokenMint is null), so every founder and
// manager action was refused as "Your balance is below your founder seat's amount", although the founder held far more than it. The choice
// built here (owner decision 7 in implementation-report.md, rebrand stage; revisable): those actions stay closed while no token is live,
// and say so in their own words and code (403 founder_paused, src/seats.js founderPaused), never a balance that was not read; nothing is
// written; the founder CTAs of the Citycoin.dev pages say the same. With today's label set every answer is today's (test/legacy-seats-review
// .test.js keeps S16's below_amount and grace cases). And RB-3: no holdings or rank promised while no token is live (the wallet badge, the
// dashboard's wallet card). Every wallet, mint and name below is a clearly fake fixture.
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as W from "./helpers/world.js";
import { seedSeat } from "./helpers/launchpad.js";
import { UTICA as READY_CITY, fresh, world as readyWorld } from "./helpers/readyworld.js";
import { openDashboard, memberMe } from "./helpers/dashpage.js";
import { _resetLpKit } from "../src/lpkit.js";
import { _resetLpAdmin } from "../src/lpadmin.js";
import { _resetLpCoins } from "../src/lpcoins.js";
import { _resetReview } from "../src/coinreview.js";
import { _setArtRenderer } from "../src/coinready.js";
import { nodeRenderer } from "../scripts/coin-art/render.mjs";
import { ensureSchema } from "../src/store.js";
import * as SEATS from "../src/seats.js";
import { _pagesBuiltForTests, _resetPolicyCheck, legacySeatsFrozen } from "../src/v5policy.js";
import { _resetDeploymentCheck } from "../src/maintoken.js";
import { legacyHidden, tokenMint } from "../src/official.js";
import { CITYCOIN_BRAND, LEGACY_BRAND } from "../src/brand.js";
import { badgesFor } from "../src/me.js";
import { SAME, wordsOf } from "../src/brandwords.js";
import { buildPages, buildStandalonePages } from "../scripts/pages/build.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
/** The Citycoin.dev switch as the Worker runs it: BRAND with its prerequisite freeze, and pages built for that label set (always frozen). */
const CC = Object.freeze({ BRAND: "citycoin", LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "test" });
const ccBuilt = () => _pagesBuiltForTests({ brand: "citycoin", legacySeats: "frozen" });
const PAUSED_WORDS = "Founder and manager actions are paused until the Citycoin.dev token is live. Nothing was changed.";
const PAUSED = { ok: false, error: "founder_paused", message: PAUSED_WORDS };
const UTICA = "5142056", NYC = "5128581";
const DESIGN = { name: "Utica Coin", pitch: "The Handshake City, on the map.", pair: "SOL", color: "emerald" };
const CITY_COIN = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

before(async () => { _setArtRenderer(await nodeRenderer()); });
after(() => { _setArtRenderer(null); });
let errors = [];
const realError = console.error;
beforeEach(() => {
  W.useClock("2026-10-24T12:00:00Z");
  _pagesBuiltForTests(null); _resetPolicyCheck(); _resetDeploymentCheck();
  errors = []; console.error = (...a) => errors.push(a.map(String).join(" "));
});
afterEach(() => { console.error = realError; _pagesBuiltForTests(null); W.realClock(); });

const LEGACY_TABLES = ["windows", "applications", "endorsements", "seats", "squads", "squad_members", "objections", "elections", "election_votes", "manager_terms", "streaks"];
async function legacyRows(db) {
  const out = {};
  for (const t of LEGACY_TABLES) out[t] = (await db.prepare(`SELECT * FROM "${t}"`).all()).results.map((r) => JSON.stringify(r)).sort();
  return out;
}

/** Utica's founder and New York City's founder with an active country-manager term, both holding 2,000,000 of the legacy mint (every seat's
 *  amount is 180,000), a member's post to moderate, the admin. */
async function world(extra = {}) {
  const env = W.newWorld({ VICINITY_MINT: W.MINT, ...extra });
  const founder = await W.person(env, { home: W.IN_UTICA, holds: 2_000_000 });
  const manager = await W.person(env, { home: W.IN_NYC, holds: 2_000_000 });
  const local = await W.person(env, { home: W.IN_UTICA, holds: 10 });
  const admin = await W.person(env, { home: W.IN_NYC });
  env.ADMIN_WALLETS = admin.w.address;
  const db = env.DB;
  await ensureSchema(db);
  const now = Date.now(), at = (ms) => new Date(now + ms).toISOString();
  const uid = async (p) => (await db.prepare("SELECT id FROM users WHERE wallet = ?").bind(p.w.address).first()).id;
  const ids = { founder: await uid(founder), manager: await uid(manager), local: await uid(local) };
  const founderSeat = await seedSeat(env, founder, { city: UTICA, name: "Utica" });
  const managerSeat = await seedSeat(env, manager, { city: NYC, name: "New York City" });
  await db.prepare("INSERT INTO manager_terms (country, seat_id, user_id, wallet, starts_at, ends_at, status) VALUES ('US', ?, ?, ?, ?, ?, 'active')")
    .bind(managerSeat, ids.manager, manager.w.address, at(-10 * W.DAY), at(80 * W.DAY)).run();
  await W.reprove(local);
  const post = (await local.post("/api/posts", { scope: "city", kind: "talk", body: "a post in Utica" })).post;
  assert.ok(post && post.id, "a post to moderate");
  return { env, db, founder, manager, local, admin, ids, founderSeat, managerSeat, post };
}

test("RB-1: founderPaused holds only under another label set with no token live; today's label set (with or without the freeze) never", () => {
  const env = { VICINITY_MINT: W.MINT };
  assert.equal(SEATS.founderPaused(env), false, "BRAND unset: today's site");
  _pagesBuiltForTests({ legacySeats: "frozen" });
  assert.equal(SEATS.founderPaused({ ...env, LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "test" }), false, "S16's freeze alone: today's label set");
  assert.equal(SEATS.founderPaused({ ...env, ...CC }), false, "BRAND set in the dashboard only, the pages not built with it: today's label set");
  ccBuilt();
  const cc = { ...env, ...CC };
  assert.deepEqual([legacyHidden(cc), tokenMint(cc), legacySeatsFrozen(cc), SEATS.founderPaused(cc)], [true, null, true, true]);
  assert.equal(SEATS.founderPausedWords(cc), PAUSED_WORDS);
  assert.doesNotMatch(SEATS.founderPausedWords(cc), /vicinity/i);
  assert.deepEqual(SEATS.frozenRefusal(cc), { error: "founder_paused", message: PAUSED_WORDS });
  _pagesBuiltForTests({ legacySeats: "frozen" });
  assert.deepEqual(SEATS.frozenRefusal({ ...env, LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "test" }), { error: "below_amount", message: SEATS.FROZEN_BELOW_AMOUNT }, "S16's words, unchanged");
  assert.deepEqual(SEATS.frozenRefusal({ ...env, LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "test" }, "Other words."), { error: "below_amount", message: "Other words." });
});

test("RB-1: under BRAND=citycoin a founder and a country manager holding far above the seat's amount are told the truth (403 founder_paused), and nothing is written", async () => {
  ccBuilt();
  const w = await world(CC);
  for (const p of [w.founder, w.manager, w.admin]) await W.reprove(p);
  const before = await legacyRows(w.db);
  const paused = async (res, what) => { assert.deepEqual([res.status, await res.json()], [403, PAUSED], what); };
  await paused(await w.founder.send("/api/coins/design", { method: "POST", body: DESIGN }), "the founder's coin design");
  await paused(await w.founder.send("/api/coins/mint", { method: "POST", body: { mint: CITY_COIN } }), "the founder's contract");
  await paused(await w.manager.send("/api/mod/hide", { method: "POST", body: { id: w.post.id, reason: "spam" } }), "a hide by the country manager");
  await paused(await w.manager.send("/api/mod/ban", { method: "POST", body: { userId: w.ids.local, reason: "spam" } }), "a ban proposal by the country manager");
  assert.deepEqual(await legacyRows(w.db), before, "not one seat, term or other legacy row changed");
  // the admin still moderates (no founder amount is asked of an admin)
  assert.equal((await w.admin.post("/api/mod/hide", { id: w.post.id, reason: "spam" })).ok, true);
  // every role stays as recorded: the founder is still the founder, the manager still the manager
  const me = await w.founder.get("/api/me"), mm = await w.manager.get("/api/me");
  assert.deepEqual([me.level, me.roles.founder, me.founder.seat && me.founder.seat.status, mm.level, mm.roles.manager], ["founder", true, "active", "manager", true]);
  assert.doesNotMatch(JSON.stringify(errors), /founder check failed/);
});

test("RB-1: the same founder with today's label set and S16's freeze alone still designs the coin (today's answers, word for word)", async () => {
  _pagesBuiltForTests({ legacySeats: "frozen" });
  const w = await world({ LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "test" });
  for (const p of [w.founder, w.manager]) await W.reprove(p);
  assert.equal((await w.founder.post("/api/coins/design", DESIGN)).ok, true);
  assert.equal((await w.manager.post("/api/mod/hide", { id: w.post.id, reason: "spam" })).ok, true);
  W.setHolding(w.founder.w.address, 10);
  const r = await w.founder.send("/api/coins/design", { method: "POST", body: DESIGN });
  assert.deepEqual([r.status, await r.json()], [403, { ok: false, error: "below_amount", message: SEATS.FROZEN_BELOW_AMOUNT }], "S16-R1's answer below the amount");
});

test("RB-1: under BRAND=citycoin the ready-made coin, the coin review and the launch routes answer founder_paused (the card's gate too), with nothing written", async () => {
  _resetLpKit(); _resetLpAdmin(); _resetLpCoins(); _resetReview();
  ccBuilt();
  const w = await readyWorld();
  Object.assign(w.env, CC, { COIN_V2_REVIEW: "on" });
  const seat = () => w.env.DB.prepare("SELECT * FROM seats WHERE city_id = ?").bind(READY_CITY).first();
  const before = await seat();
  const calls = [
    ["the ready-made coin's picture", () => w.post(w.f, "/api/coins/ready/art", { cityId: READY_CITY })],
    ["Use this coin", () => w.post(w.f, "/api/coins/ready/use", { cityId: READY_CITY, contentHash: "a".repeat(64) })],
    ["a coin change request", () => w.post(w.f, "/api/coins/review/draft", { cityId: READY_CITY, reason: "Locals call the town by this name for years." })],
    ["the launch status (a GET)", async () => { const r = await w.f.send(`/api/lp/launch/status?city=${READY_CITY}&cluster=devnet`, { fetchImpl: w.both }); return { status: r.status, ...(await r.json()) }; }],
    ["the launch transaction", () => w.post(w.f, "/api/lp/launch/tx", { cityId: READY_CITY, cluster: "devnet", mint: fresh() })],
  ];
  for (const [what, call] of calls) {
    const r = await call();
    assert.deepEqual([r.status, r.error, r.message], [403, "founder_paused", PAUSED_WORDS], `${what}: ${JSON.stringify(r)}`);
    assert.deepEqual(await seat(), before, `${what}: the seat row is untouched`);
  }
  // the founder's card: the gate says the same, never a balance
  const card = await w.get(w.f, `/api/coins/ready?city=${READY_CITY}`);
  assert.equal(card.ok, true, JSON.stringify(card));
  assert.deepEqual(card.gate && [card.gate.code, card.gate.message], ["founder_paused", PAUSED_WORDS], JSON.stringify(card.gate));
  assert.doesNotMatch(JSON.stringify(card), /below the founder amount|vicinity/i);
});

// (the owner's daily approval round, src/lpbatch.js, which checked the founder's balance too, was deleted by stage S23 with its routes; the
// admin's candidate list that stays reads no balance: src/lpadmin.js candidateList. So no round can call a paused founder's balance low)
test("RB-1: the deleted approval round stays deleted, so no founder check outside src/seats.js reads a balance under another label set", () => {
  assert.equal(existsSync(new URL("../src/lpbatch.js", import.meta.url)), false);
  assert.doesNotMatch(read("src/lpadmin.js"), /holdsFounderAmount|stillFounder|amountsFor|seatBalance/);
});

/* ---------------------------------------------------------------- the Citycoin.dev pages: the founder CTAs say the same */
const ccPages = new Map([...buildPages({ brand: CITYCOIN_BRAND }), ...buildStandalonePages({ brand: CITYCOIN_BRAND })]);
const words = (html) => html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

test("RB-1: the Citycoin.dev Launchpad offers no 'Create your city coin' and says new city coins wait for the token; today's page keeps its button", () => {
  const lp = ccPages.get("launchpad.html");
  assert.doesNotMatch(lp, /Create your city coin|data-create-coin/);
  assert.match(words(lp), /New city coins launch here once the Citycoin\.dev token is live\./);
  assert.match(read("public/launchpad.html"), /<a class="btn btn--primary btn--lg btn--cta-glow has-ring lp4-hero__cta" href="\/connect" id="lp-create" data-create-coin>Create your city coin<\/a>/);
  const frozenToday = new Map(buildPages({ brand: LEGACY_BRAND, legacySeats: "frozen" }));
  assert.match(frozenToday.get("launchpad.html"), /data-create-coin>Create your city coin<\/a>/, "S16's freeze alone keeps it");
});

test("RB-1: the Citycoin.dev home page's step 03 says the founder launches once the token is live; S16's frozen words and today's are unchanged", () => {
  assert.match(ccPages.get("index.html"), /<p>A city's founder launches its one official coin on the Launchpad once the Citycoin\.dev token is live\.<\/p>/);
  const frozenToday = new Map(buildPages({ brand: LEGACY_BRAND, legacySeats: "frozen" }));
  assert.match(frozenToday.get("index.html"), /<p>A city's founder launches its one official coin on the Launchpad\.<\/p>/);
  assert.match(read("public/index.html"), /<p>Locals qualify as City Founder and launch the city's one official coin\.<\/p>/);
});

test("RB-1: on a Citycoin.dev page a founder's card says founder actions are paused and offers no 'Design the city coin'; the dashboard words the server's code", async () => {
  const seat = { id: 3, cityId: "5142056", city: "Utica", country: "US", status: "active", since: "2026-10-10T12:00:00Z", appealUntil: null, graceUntil: null, probationUntil: null, threshold: 100000, policy: 6 };
  for (const status of ["active", "steward"]) {
    const me = memberMe({ wallet: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2", launched: false });
    Object.assign(me, { level: "founder", roles: { ...me.roles, founder: true }, founder: { ...me.founder, seat: { ...seat, status } } });
    const t = await openDashboard({ me, page: ccPages.get("dashboard.html") });
    await t.advance(5000);
    assert.deepEqual(t.scriptErrors, [], status);
    assert.equal(t.doc.getElementById("fcard-note").textContent, "Founder and manager actions are paused until the Citycoin.dev token is live.", status);
    assert.equal(t.doc.getElementById("fcard-go").hidden, true, `${status}: no button`);
    assert.doesNotMatch(t.doc.body.textContent, /Your coin, your call|Add your coin's contract/, `${status}: no coin step offered (the button's static label stays hidden)`);
  }
  // the coin card of the founder's own city (no design yet): no studio on the Citycoin.dev page, the studio on today's page, as before
  const coinApi = async (path) => (path.startsWith("/api/coins?city=") ? { ok: true, coin: null } : undefined);
  const founderMe = (launched) => {
    const me = memberMe({ wallet: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2", launched });
    return Object.assign(me, { level: "founder", roles: { ...me.roles, founder: true }, founder: { ...me.founder, seat },
      community: { ...me.community, seat: { you: true, status: "active", name: "SwiftHarbor10", since: seat.since } } });
  };
  const cc = await openDashboard({ me: founderMe(false), api: coinApi, page: ccPages.get("dashboard.html") });
  await cc.advance(5000);
  assert.deepEqual(cc.scriptErrors, []);
  assert.equal(cc.doc.getElementById("coin-studio").hidden, true, "no studio while founder actions are paused");
  assert.match(cc.doc.body.textContent, /Founder and manager actions are paused until the Citycoin\.dev token is live\./);
  assert.doesNotMatch(cc.doc.body.textContent, /Your coin, your call/);
  const t = await openDashboard({ me: founderMe(true), api: coinApi });
  await t.advance(5000);
  assert.deepEqual(t.scriptErrors, []);
  assert.equal(t.doc.getElementById("coin-studio").hidden, false, "today's page: the founder's studio, as before");
  assert.match(t.doc.body.textContent, /Your coin, your call\. Design Utica's coin below: everyone in Utica will see it\./);
  assert.doesNotMatch(t.doc.body.textContent, /actions are paused/);
  // the server's code, worded by the dashboard (a manager's hide, a studio save): only ever sent under another label set
  assert.match(read("public/dashboard.js"), /founder_paused: \(d\) => d\.message \|\| "Founder and manager actions are paused\. Nothing was changed\.",/);
});

/* ---------------------------------------------------------------- RB-3: no holdings or rank promised while no token is live */
const BADGE_ARGS = { u: { wallet: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2", early: false, home_city: "5142056" }, amount: 0, position: null, seat: null, manager: false, admin: false, checkins: 0, posts: 0, tenure: null, threshold: 100000 };
const walletDetail = (o) => badgesFor({ ...BADGE_ARGS, ...o }).find((b) => b.id === "wallet").detail;

test("RB-3: the wallet badge promises no holdings or rank under another label set with no token live; today's words otherwise", () => {
  const CCW = wordsOf(CITYCOIN_BRAND);
  assert.equal(walletDetail({ launched: false, legacyFrozen: true, bw: CCW }), "A Solana wallet linked to your account with one free signature.");
  assert.equal(walletDetail({ launched: true, legacyFrozen: true, bw: CCW }), "A Solana wallet linked to your account with one free signature. It unlocks holdings, rank and badges.", "a live token: holdings and rank exist");
  assert.equal(walletDetail({ launched: true, legacyFrozen: true, bw: SAME }), "A Solana wallet linked to your account with one free signature. It unlocks holdings, rank and badges.", "S16's words");
  assert.equal(walletDetail({ launched: false, legacyFrozen: true, bw: SAME }), "A Solana wallet linked to your account with one free signature. It unlocks holdings, rank and badges.", "S16's words before a launch");
  assert.equal(walletDetail({ launched: true, legacyFrozen: false, bw: SAME }), "A Solana wallet linked to your account with one free signature. It unlocks holdings, rank, badges and the founder path.", "today's words");
});

test("RB-3: on a Citycoin.dev page the wallet card promises no holdings or rank while the token is not live; today's page keeps its words", async () => {
  const ccDash = new Map(buildPages({ brand: CITYCOIN_BRAND })).get("dashboard.html");
  const folded = { "vicinity:wcard-skip": "1" };
  const cc = await openDashboard({ me: memberMe(), storage: folded, page: ccDash });
  assert.equal(cc.text("#wcard-lead"), "Free, one signature.");
  assert.doesNotMatch(cc.$("#wcard-perks").textContent.replace(/\s+/g, " "), /Your rank in your city(?!, once the Citycoin\.dev token is live)/);
  assert.match(ccDash, /<li>Your rank in <span id="wcard-city">your city<\/span>, once the Citycoin\.dev token is live<\/li>/);
  const today = await openDashboard({ me: memberMe(), storage: folded });
  assert.equal(today.text("#wcard-lead"), "Free, one signature. Unlocks your holdings, rank, badges and the founder path.");
  const frozenToday = new Map(buildPages({ legacySeats: "frozen" })).get("dashboard.html");
  assert.match(frozenToday, /<li>Your rank in <span id="wcard-city">your city<\/span><\/li>/, "S16's frozen words");
  // a wallet just linked: the line names the wallet and promises nothing more there
  assert.match(read("public/dashboard.js"), /is the wallet of your account\.\$\{BRAND && !d\.launched \? "" : ` \$\{seatsFrozen\(d\) \? "Your holdings and rank are live\." : "Your holdings, rank and founder path are live\."\}`\}`/);
});
