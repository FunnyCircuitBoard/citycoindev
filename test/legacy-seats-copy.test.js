// The legacy seat freeze, its page and dashboard copy (Citycoin.dev master v5, stage S16; implementation-report.md S16 row, acceptance rows
// A05, B12 and V05; master section 15 "Replace earlier work", section 17). With LEGACY_SEATS=frozen in wrangler.jsonc the page build replaces
// the copy that presents the old founder rules as current (the seven qualifying days, the Stake Ladder, the Seed Steward, squads, founder
// windows, endorsements, country-manager elections) with neutral words (scripts/pages/frozen-copy.mjs) and records it in src/pages-built.js;
// the dashboards follow /api/me's legacySeats, so no client offers a claim, an endorsement, a squad, a vote or a resignation while frozen. With
// the switch unset the pages are today's, byte for byte (test/build-parity.test.js), and so is every script's behaviour. Every wallet and
// name below is a clearly fake test fixture.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as W from "./helpers/world.js";
import { openDashboard, memberMe, ADDR } from "./helpers/dashpage.js";
import { pagesAsCommitted } from "./helpers/mainswitch.js";
import { FROZEN_COPY } from "../scripts/pages/frozen-copy.mjs";
import { PAGES_BUILT_FILE, buildPages, buildStandalonePages, deployedVars, frozenCopy, frozenFor, pageLegacySeats, pagesBuiltSource } from "../scripts/pages/build.mjs";
import { LEGACY_BRAND } from "../src/brand.js";
import { _resetPolicyCheck } from "../src/v5policy.js";

const committed = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
const FROZEN_VARS = { LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production" };
const frozenPages = () => new Map([...buildPages({ legacySeats: "frozen" }), ...buildStandalonePages({ legacySeats: "frozen" })]);

let errors = [];
const realError = console.error;
beforeEach(() => { W.useClock("2026-10-24T12:00:00Z"); pagesAsCommitted(); _resetPolicyCheck(); errors = []; console.error = (...a) => errors.push(a.map(String).join(" ")); });
afterEach(() => { console.error = realError; pagesAsCommitted(); W.realClock(); });

/* ---------------------------------------------------------------- the page build */

test("the build reads the freeze from wrangler.jsonc only: unset is today's pages; frozen needs the switch's own inputs; the record names it only then", () => {
  assert.equal(Object.hasOwn(deployedVars(), "LEGACY_SEATS"), false, "not set in wrangler.jsonc: the live site");
  assert.deepEqual(pageLegacySeats(), { legacySeats: "on" });
  for (const v of [{}, { LEGACY_SEATS: "" }, { LEGACY_SEATS: "on" }, { LEGACY_SEATS: " On " }]) assert.deepEqual(pageLegacySeats(v), { legacySeats: "on" }, JSON.stringify(v));
  assert.deepEqual(pageLegacySeats(FROZEN_VARS), { legacySeats: "frozen" });
  assert.deepEqual(pageLegacySeats({ LEGACY_SEATS: " FROZEN ", DEPLOYMENT_ENV: "preview" }), { legacySeats: "frozen" }, "read as the Worker reads it");
  // never built for a freeze the Worker would only hold (master: "never deploy a switch that does not count")
  assert.throws(() => pageLegacySeats({ LEGACY_SEATS: "frozen" }), /LEGACY_SEATS=frozen in wrangler\.jsonc with a configuration the Worker refuses \(LEGACY_SEATS_POLICY_REFUSED: ENVIRONMENT_UNSET\)/);
  assert.throws(() => pageLegacySeats({ LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "staging" }), /LEGACY_SEATS_POLICY_REFUSED/);
  // the shell's environment never reaches the build
  const before = process.env.LEGACY_SEATS;
  process.env.LEGACY_SEATS = "frozen";
  try { assert.deepEqual(pageLegacySeats(), { legacySeats: "on" }); } finally { if (before === undefined) delete process.env.LEGACY_SEATS; else process.env.LEGACY_SEATS = before; }
  // src/pages-built.js: today's bytes with the switch unset; the key and one line more only when the pages carry the freeze
  assert.equal(readFileSync(PAGES_BUILT_FILE, "utf8"), pagesBuiltSource());
  assert.doesNotMatch(pagesBuiltSource(), /legacySeats/);
  const src = pagesBuiltSource({ ...deployedVars(), ...FROZEN_VARS });
  assert.match(src, /^\/\/ legacySeats "frozen": built with LEGACY_SEATS=frozen \(no old founder copy\); src\/v5policy\.js holds the freeze if the Worker's setting differs\.$/m);
  assert.match(src, /export const PAGES_BUILT = Object\.freeze\(\{ mainTokenV5: false, brand: "", pagesReachWorker: false, legacySeats: "frozen" \}\);/);
  assert.equal(src.split("\n").length, pagesBuiltSource().split("\n").length + 1);
  // the record is never written for a freeze the Worker would refuse: a configuration of the test's own, the committed settings without an
  // environment (wrangler.jsonc names DEPLOYMENT_ENV=production since stage S06, so the committed file alone no longer shows the refusal)
  const { DEPLOYMENT_ENV, ...noEnvironment } = deployedVars();
  assert.equal(DEPLOYMENT_ENV, "production", "stage S06: the production Worker names its environment");
  assert.throws(() => pagesBuiltSource({ ...noEnvironment, LEGACY_SEATS: "frozen" }), /LEGACY_SEATS_POLICY_REFUSED/);
  assert.throws(() => pagesBuiltSource({ ...deployedVars(), LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "staging" }), /LEGACY_SEATS_POLICY_REFUSED/);
  // with the committed environment the freeze's own input is there: setting LEGACY_SEATS=frozen alone builds the frozen record
  assert.equal(pagesBuiltSource({ ...deployedVars(), LEGACY_SEATS: "frozen" }), src);
});

test("the frozen copy: every passage applies once; only the pages it names change; a source edited without its frozen copy stops the build", () => {
  const frozen = frozenPages();
  const named = Object.keys(FROZEN_COPY).sort();
  assert.deepEqual(named, ["cities.html", "connect.html", "dashboard.html", "index.html", "rules.html", "token.html"]);
  assert.ok(!named.includes("terms.html"), "the Terms of Use are the owner's legal text (E12): not changed by the build");
  for (const [f, html] of frozen) {
    if (named.includes(f)) assert.notEqual(html, committed(f), `${f}: the frozen copy applies`);
    else assert.equal(html, committed(f), `${f}: untouched by the freeze`);
  }
  for (const f of named) {
    // (the table as today's label set reads it: brand blocks and label fills resolved, scripts/pages/build.mjs frozenFor)
    const d = frozenFor(f, FROZEN_COPY[f], LEGACY_BRAND);
    if (d.description) assert.match(frozen.get(f), new RegExp(`<meta name="description" content="${d.description.replace(/[$.()]/g, "\\$&")}">`), `${f}: its frozen description`);
    assert.equal(d.replace.length, FROZEN_COPY[f].replace.length, `${f}: every passage is today's label set's`);
    for (const [old] of d.replace) assert.ok(committed(f).includes(old), `${f}: the passage is today's copy, as built`);
  }
  // a passage that is gone, or there twice, stops the build (a typo never ships half old, half new)
  const t = { "x.html": { description: null, replace: [["a\n", "b\n"]] } };
  assert.equal(frozenCopy("x.html", "q\na\nz", t), "q\nb\nz");
  assert.throws(() => frozenCopy("x.html", "q\nz", t), /x\.html: frozen copy passage 1 is not in the source exactly once/);
  assert.throws(() => frozenCopy("x.html", "a\na\n", t), /exactly once/);
  assert.equal(frozenCopy("y.html", "unchanged", t), "unchanged", "a page the table does not name");
});

/** A page's words as a visitor reads them: no comments, scripts or tags. */
const words = (html) => html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
// the old founder rules, as the pages wrote them (master section 15: no seven-day rule, stake ladder or holding-duration requirement; the
// seat, steward, squad, endorsement and election structures are history)
const OLD_RULES = [/seven days/i, /\b7 days in a row\b/i, /7-day/i, /\bfor 7 days\b/i, /held for/i, /qualif/i, /founder amount/i, /stake ladder/i, /seed steward/i,
  /\bsquads? (?:of|can|founding|is forming)\b/i, /pool (?:their )?holdings/i, /endorse (?:who|the|a)/i, /endorsements? (?:from|force|share)/i, /\belected\b/i, /election (?:you run|the steward|closes)/i, /Election open/,
  /probation/i, /objection period/i, /\bchosen by (?:locals|the city)\b/i, /applications? open/i, /apply to found/i, /hold to found/i, /to found their/i, /founding it/i,
  /holdings count/i, /90-day/i, /72-hour/i, /\bclaim(?:ing)? (?:your|a) city\b/i, /\bopen seat\b/i, /seat waiting/i, /founder path/i];
// words that stay true while frozen, on pages that are not about the founder rules (each with the reason)
const ALLOWED = [
  [/Top · 7 days/, "the feed's weekly sort (post votes), not a founder rule"],
];

test("no page built with the freeze presents the old founder rules as current (the Terms of Use aside: the owner's legal text)", () => {
  for (const [f, html] of frozenPages()) {
    if (f === "terms.html") continue;
    let text = words(html);
    for (const [re] of ALLOWED) text = text.replace(re, " ");
    for (const re of OLD_RULES) assert.doesNotMatch(text, re, `${f}: ${re}`);
  }
  // and today's pages do say them: the check reads what it should (its sensitivity)
  const today = words(committed("index.html") + committed("rules.html") + committed("cities.html") + committed("dashboard.html") + committed("token.html"));
  for (const re of [/seven days/i, /founder amount/i, /stake ladder/i, /seed steward/i, /\belected\b/i, /probation/i, /founder path/i, /apply to found/i]) assert.match(today, re, String(re));
});

test("the frozen pages say what replaced the rules in plain words, and promise nothing new (no selection, snapshot or cycle is described)", () => {
  const p = frozenPages();
  const CLOSED = "Founder seats, squads and elections are closed for changes";
  for (const f of ["index.html", "rules.html", "cities.html", "dashboard.html"]) assert.ok(words(p.get(f)).toLowerCase().includes(CLOSED.toLowerCase()), `${f}: ${CLOSED}`);
  assert.match(words(p.get("rules.html")), /City founders Closed for changes/);
  assert.match(words(p.get("rules.html")), /a term already under way runs until its end date\. Until a country has a manager, the admin covers it\./i, "the same rule /api/moderator gives (stage S16 server side)");
  assert.match(p.get("rules.html"), /<li id="coins"><strong>The city's coin:<\/strong>/, "the coin's rule stays, and its anchor (/rules#coins)");
  assert.match(p.get("rules.html"), /<details class="card" id="founders">/, "the anchor the pages link (/rules#founders) still opens a fold");
  for (const id of ["ladder", "steward", "squads", "managers"]) assert.doesNotMatch(p.get("rules.html"), new RegExp(`id="${id}"`), id);
  const all = words([...p.values()].join(" "));
  for (const re of [/six-hour/i, /largest (?:main-token )?holder/i, /snapshot (?:cycle|selection)/i, /selection (?:cycle|engine)/i, /permanent founder/i]) assert.doesNotMatch(all, re, `nothing about the new selection: ${re}`);
  // the cities page: no requirements list, no applications pill, no "choosing" key; the map's key reads "No founder"
  const cities = p.get("cities.html");
  for (const id of ["claim-reqs", "cs-status", "cs-choosing"]) assert.doesNotMatch(cities, new RegExp(`id="${id}"`), id);
  assert.match(cities, /<span class="dot dot--open" aria-hidden="true"><\/span> No founder<\/span>/);
  assert.match(cities, /<h1 class="page-title">Find your city\.<\/h1>/);
  // the dashboard: no founder amount row, path, steps, window, squad, rank note, clock, probation link or danger zone; the founder and election
  // notice toggles go (the stored "founder" and "election" preferences stay readable: src/notify.js)
  const dash = p.get("dashboard.html");
  for (const id of ["ca-threshold", "p-pct", "p-bar", "p-steps", "p-window", "squad", "fs-rank", "fcard-clock-row", "fcard-meter", "danger-zone", "ntp-founder", "ntp-election"]) assert.doesNotMatch(dash, new RegExp(`id="${id}"`), id);
  for (const id of ["progress", "p-city", "p-panel", "fs-state", "fcard", "national", "nc-election", "community", "cc-founder", "role-home"]) assert.match(dash, new RegExp(`id="${id}"`), `${id}: kept (the scripts write it)`);
});

/* ---------------------------------------------------------------- the server's ladder figures */

test("frozen, the rank check and the map's seats carry no Stake Ladder figure (its own cache keys); unset, exactly today's", async () => {
  const H = "Hdr1111111111111111111111111111111111111111";
  W.setHolding(H, 150_000);
  const env = W.newWorld({ VICINITY_MINT: W.MINT });
  const read = async () => ({ rank: await W.browser(env).get(`/api/rank?address=${H}`), seats: await W.browser(env).get("/api/seats") });
  const off = await read();
  assert.equal(off.rank.founderMin, 100_000);
  assert.equal(off.seats.founderAmount, 100_000);
  Object.assign(env, FROZEN_VARS);
  const on = await read(); // (the 30-second answer caches: the frozen answers have keys of their own, so no today's answer is served)
  assert.equal("founderMin" in on.rank, false);
  assert.equal("founderAmount" in on.seats, false);
  const { founderMin, updatedAt: _a, ...rankRest } = off.rank, { updatedAt: _b, ...onRest } = on.rank; // (the balance-only answer is stamped with the time)
  assert.deepEqual(onRest, rankRest, "nothing else in the rank check moves");
  const { founderAmount, ...seatsRest } = off.seats;
  assert.deepEqual(on.seats, seatsRest, "the seats and windows themselves stay: history");
  void founderMin; void founderAmount;
  const unlaunched = W.newWorld({});
  assert.equal((await W.browser(unlaunched).get(`/api/rank?address=${H}`)).founderMin, 100_000);
  Object.assign(unlaunched, FROZEN_VARS);
  assert.equal("founderMin" in (await W.browser(unlaunched).get(`/api/rank?address=${H}`)), false);
});

test("frozen, the wallet badge no longer promises a founder path (the founder and manager badges keep their holders)", async () => {
  const env = W.newWorld({ VICINITY_MINT: W.MINT, ...FROZEN_VARS });
  const p = await W.person(env, { home: W.IN_UTICA, holds: 10 });
  const me = await p.get("/api/me");
  assert.equal(me.legacySeats, "frozen");
  assert.equal(me.badges.find((b) => b.id === "wallet").detail, "A Solana wallet linked to your account with one free signature. It unlocks holdings, rank and badges.");
  for (const b of me.badges) assert.doesNotMatch(`${b.name} ${b.detail}`, /founder path|7 days|founder amount|probation|elected/i, b.id);
  const off = await W.person(W.newWorld({ VICINITY_MINT: W.MINT }), { home: W.IN_UTICA, holds: 10 });
  assert.match((await off.get("/api/me")).badges.find((b) => b.id === "wallet").detail, /and the founder path\.$/, "unset: today's words");
});

/* ---------------------------------------------------------------- the dashboard follows /api/me */

const SEAT_CITY = { id: "5142056", name: "Utica", country: "US" };
/** /api/me as src/me.js answers it while frozen: the founder path is not worked out, the legacy records are as recorded (an open window and an
 *  open election nobody may act in, a squad, a seat), and `legacySeats` says so. `seat`: the member's own seat; `cityseat`: someone else's. */
function frozenMe({ seat = null, cityseat = null, application = null, level = "holder", manager = null } = {}) {
  const m = memberMe({ wallet: ADDR, launched: true, amount: 250_000, rank: 3 });
  const frozenFounder = { threshold: null, tenure: null, amount: 250_000, eligible: false, why: "seats_frozen", whyNot: null, challenging: null, homeReadyAt: null, cooldownUntil: null, application, seat };
  return {
    ...m, legacySeats: "frozen", level, founder: frozenFounder,
    roles: { ...m.roles, founder: Boolean(seat && ["active", "steward"].includes(seat.status)), steward: Boolean(seat && seat.status === "steward"), manager: level === "manager", weight: level === "manager" ? 3 : seat ? 2 : 1 },
    badges: m.badges.filter((b) => b.id !== "founder_ready"),
    community: { ...m.community, rank: 2, holders: 9, seat: cityseat,
      window: { id: 7, openedAt: "2026-10-23T12:00:00Z", closesAt: "2026-10-26T12:00:00Z", threshold: 180000, applicants: [{ id: 3, name: "ZqApplicant", pitch: "Utica first", endorsements: 4, you: false }], myEndorsement: null, canEndorse: false, whyNot: "seats_frozen" },
      lastResult: { windowId: 2 } },
    national: { ...m.national, manager, election: { id: 4, openedAt: "2026-10-23T12:00:00Z", closesAt: "2026-10-30T12:00:00Z", myVote: null, canVote: false, whyNot: "seats_frozen",
      candidates: [{ seatId: 11, name: "ZqCandidate", city: "Albany", votes: 2, you: false }] } },
    squad: { mine: { id: 5, status: "forming", ready: true, members: [{ name: "ZqOne", qualified: true, contribution: 90000 }], min: 3, max: 5, pooled: 270000, threshold: 180000 }, joinable: null, canCreate: false },
    progress: { percent: 100, steps: [{ id: "account", label: "Account verified, wallet linked", done: true }, { id: "home", label: "Home: Utica", done: true }] },
  };
}
/** Every button and link a member can press, by its words (visible ones only), and the words a member reads in a part of the page. */
const pressable = (page) => page.$$("button, a").filter((e) => page.visible(e)).map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
const shownText = (e) => (!e || e.hidden ? "" : typeof e.data === "string" ? e.data : (e.childNodes || []).map(shownText).join(" "));
const LEGACY_ACTIONS = /^(Apply|Apply to found|Challenge|Endorse|Vote|Start a squad|Join this squad|Apply as a squad|Leave the squad|Resign|Object to this founder|Withdraw my application|Founder path)\b/;
const LEGACY_WORDS = /7 days|7-day|founder amount|Seed Steward on probation|probation|endorsement|election|Election open|squad|qualif|objection|grace|Path to founder|road to founding|chosen by locals|Locals' endorsements/i;
const CLOSED_LINE = /Founder seats, squads and elections are closed for changes\.?/g; // (the one neutral line that names them, to say they are closed)
const frozenDashboard = () => frozenPages().get("dashboard.html");
/** Every tab in turn; what can be pressed on any of them. */
const allTabs = async (page) => {
  const seen = new Set(pressable(page));
  for (const tab of ["home", "wallet", "city", "community", "rankings", "founder", "profile"]) { const t = page.$(`#tab-${tab}`); if (t && page.visible(t)) { await page.tap(t); await page.advance(100); for (const b of pressable(page)) seen.add(b); } }
  return [...seen];
};

test("frozen dashboard (a holder; a steward seat, an open window, an open election and a squad on record): nothing offers a legacy action or tells an old rule", async () => {
  const me = frozenMe({ cityseat: { id: 9, name: "ZqSteward", handle: "ZqSteward", wallet: "Zq111*****111", status: "steward", since: "2026-10-01T12:00:00Z", probationUntil: "2026-12-30T12:00:00Z", quorum: null, openObjections: 1 },
    application: { id: 3, windowId: 7, cityId: SEAT_CITY.id, since: "2026-10-23T12:00:00Z", closesAt: "2026-10-26T12:00:00Z" } });
  for (const html of [frozenDashboard(), null]) { // the pages built with the freeze, and today's pages (a switch the build has not caught up with: held)
    const page = await openDashboard({ me, html });
    assert.deepEqual(page.scriptErrors, []);
    await page.advance(2000);
    const buttons = await allTabs(page);
    assert.ok(buttons.length > 20, "the tabs were walked");
    for (const b of buttons) assert.doesNotMatch(b, LEGACY_ACTIONS, `a ${html ? "frozen" : "today's"} page offers "${b}"`);
    for (const sel of ["#role-home", "#today", "#progress", "#community", "#national", "#city-about", "#fcard"]) {
      const text = shownText(page.$(sel)).replace(/\s+/g, " ").replace(CLOSED_LINE, "");
      assert.doesNotMatch(text, LEGACY_WORDS, `${html ? "frozen" : "today's"} page, ${sel}: "${text.slice(0, 200)}"`);
    }
    assert.equal(page.visible(page.$("#nc-election")), false, "an open election on record is not shown as one to vote in");
    assert.equal(page.$("#p-window") ? page.visible(page.$("#p-window")) : false, false, "nor an open window to endorse in");
    assert.equal(page.$("#squad") ? page.visible(page.$("#squad")) : false, false, "nor a squad to apply with");
    assert.match(page.text("#p-panel"), /Your application to found Utica is on record\..*Founder: ZqSteward \(Seed Steward\) since .*Founder seats, squads and elections are closed for changes\./);
    assert.equal(page.text("#cc-founder"), "ZqSteward (steward)");
    assert.equal(page.text("#nc-manager"), "None: the admin covers it");
    assert.ok(!page.callsTo("/api/seats/apply").length && !page.callsTo("/api/seats/endorse").length && !page.callsTo("/api/elections/vote").length, "no legacy writer is called");
  }
});

test("frozen dashboard (a founder on record): the seat keeps its title and coin tools; no clock, meter, moderator tile, Resign or danger zone", async () => {
  const seat = { id: 9, cityId: SEAT_CITY.id, city: "Utica", country: "US", status: "active", since: "2026-10-01T12:00:00Z", appealUntil: null, graceUntil: null, probationUntil: null, threshold: 180000, policy: 6 };
  const me = frozenMe({ seat, cityseat: { ...seat, name: "SwiftHarbor10", handle: "SwiftHarbor10", you: true, quorum: null }, level: "founder" });
  const page = await openDashboard({ me, html: frozenDashboard() });
  assert.deepEqual(page.scriptErrors, []);
  await page.advance(2000);
  const buttons = await allTabs(page);
  const role = shownText(page.$("#role-home")).replace(/\s+/g, " ");
  assert.match(role, /City Founder of Utica/);
  assert.match(role, /On record/);
  assert.match(role, /Your founder seat for Utica is on record\. You design its coin and your vote counts ×2\. Founder seats, squads and elections are closed for changes\./);
  assert.doesNotMatch(role, /moderat|Keep 180,000|holding vs your bar/i, "a seat alone no longer moderates (src/roles.js), and no bar is told");
  for (const b of buttons) assert.doesNotMatch(b, /^(Resign|Moderator tools)\b/, b);
  assert.equal(page.$("#danger-zone"), null);
  assert.match(page.text("#fcard-state"), /^On record$/);
  assert.equal(page.$("#fcard-clock-row"), null);
  assert.match(page.text("#p-panel"), /Your founder seat for Utica is on record, since/);
});

test("today's dashboard (no legacySeats key) still offers the window's Endorse and the election's Vote: the checks above see what they look for", async () => {
  const me = frozenMe({});
  delete me.legacySeats;
  me.founder = memberMe({ wallet: ADDR, launched: true }).founder;
  me.community.window.canEndorse = true; me.community.window.whyNot = null;
  me.national.election.canVote = true; me.national.election.whyNot = null;
  const page = await openDashboard({ me });
  await page.advance(2000);
  const buttons = await allTabs(page);
  assert.ok(buttons.includes("Endorse"), buttons.join(" | "));
  assert.ok(buttons.includes("Vote"), buttons.join(" | "));
  assert.match(shownText(page.$("#national")), /Election open/);
});

test("frozen dashboard (the admin, an open objection on record): the objection is not counted as waiting and no Uphold or Dismiss is offered; today's page still counts it", async () => {
  const mod = { ok: true, moderator: true, role: "admin", scope: "everywhere", posts: [], proposals: [], appeals: [], towns: [],
    objections: [{ id: 1, founder: "ZqFounder", city: "Utica", seatStatus: "active", reason: "not a local", at: "2026-10-24T11:00:00Z" }] };
  for (const frozen of [true, false]) {
    const me = frozenMe({ level: "admin" });
    me.roles = { ...me.roles, admin: true };
    if (!frozen) { delete me.legacySeats; me.founder = memberMe({ wallet: ADDR, launched: true }).founder; }
    const page = await openDashboard({ me, html: frozen ? frozenDashboard() : null, api: async (path) => (path === "/api/mod" ? mod : path === "/api/coins?waiting=1" ? { ok: true, waiting: [] } : undefined) });
    assert.deepEqual(page.scriptErrors, []);
    await page.advance(2000);
    const waiting = `${page.text("#role-queue")} ${shownText(page.$("#today"))}`.replace(/\s+/g, " ");
    const buttons = await allTabs(page);
    if (frozen) {
      assert.doesNotMatch(waiting, /objection/i, waiting);
      for (const b of buttons) assert.doesNotMatch(b, /^(Uphold|Dismiss)\b/, b);
    } else {
      assert.match(page.text("#role-queue"), /Waiting for you: 1 objection/);
      assert.match(shownText(page.$("#today")), /1 objection/);
    }
  }
});
