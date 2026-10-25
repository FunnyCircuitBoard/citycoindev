// The rebrand stage's review findings (Citycoin.dev label migration, S48; owner directive 24 Oct 2026: "there should be no existence of
// vicinity. only citycoin."), one regression test each: CRAWL-1 (a new coin's metadata never stores the old host), CRAWL-2 and F3 (no
// founder amount, hold period or holder tier in a token that is not live), CRAWL-4 (the owner's summary box), F7 and F3 (what the switch
// needs in the same pull request), F8 (theme colour, pass mark), F9 (the link checker on /official), F10 (no Token page link), F2 (the
// switch tried in CI). Every wallet, mint, name and address below is a clearly fake fixture; example.com is a placeholder sender.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildPages, buildStandalonePages, deployedVars, pageBrandPrerequisites, pageLegacySeats, pageV5Config } from "../scripts/pages/build.mjs";
import { TRIAL_SETTINGS, trialPlan, varsOf, withTrialSettings } from "../scripts/brand/switch-trial.mjs";
import { CITYCOIN_BRAND, LEGACY_BRAND } from "../src/brand.js";
import { SAME, wordsOf } from "../src/brandwords.js";
import { _pagesBuiltForTests } from "../src/v5policy.js";
import { coinMetadataJson, handleCoinMeta, metadataUriFor, provisionalJson } from "../src/coinmeta.js";
import { _resetLpCoins } from "../src/lpcoins.js";
import { _resetLpKit } from "../src/lpkit.js";
import { referralAccountsOf } from "../src/lpadmin.js";
import { metadataAddress } from "../src/sol/metaplex.js";
import { newWorld } from "./helpers/world.js";
import { seedCoin } from "./helpers/launchpad.js";
import { DEMOV, DEMOV_CITY, LP_ON, METAPLEX, lpChain, metaplexData } from "./helpers/lpchain.js";
import { openDashboard, memberMe } from "./helpers/dashpage.js";
import { openPage } from "./helpers/pagedom.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const CC = { BRAND: "citycoin" };
const CCW = wordsOf(CITYCOIN_BRAND);
const ccPages = new Map([...buildPages({ brand: CITYCOIN_BRAND }), ...buildStandalonePages({ brand: CITYCOIN_BRAND })]);
/** A page's words as a visitor reads them: no comments, scripts, styles or tags. */
const words = (html) => html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

beforeEach(() => { _resetLpCoins(); _resetLpKit(); _pagesBuiltForTests(null); });
afterEach(() => { _pagesBuiltForTests(null); });

/* ---------------------------------------------------------------- CRAWL-1: a new coin's metadata JSON */
const get = (env, chain, path) => handleCoinMeta(new Request(`https://vicinity.city${path}`, { headers: { "cf-connecting-ip": "198.51.100.7" } }), env, chain.fetchImpl, Date.now());
async function coinWorld(extra) {
  const env = { ...newWorld(), ...LP_ON, ...extra };
  const chain = lpChain({ accounts: { [await metadataAddress(DEMOV)]: { owner: METAPLEX, lamports: 5_616_720, data: metaplexData({ mint: DEMOV, name: "Demo City Coin", symbol: "DEMOV", uri: metadataUriFor(DEMOV) }) } } });
  await seedCoin(env.DB, { city: DEMOV_CITY, name: "Demo City", country: "US", coin: "Demo City Coin", pitch: "A city that tests things.", user: 1, seat: 1 });
  return { env, chain };
}
// the program-compiled picture prefix (https://vicinity.city/coin-meta/<mint>.png) is the deployed program's, out of this stage
const withoutImage = (j) => JSON.stringify({ ...j, image: undefined });

test("CRAWL-1: under BRAND=citycoin while the site is served from vicinity.city, a new coin's JSON names no host and is rebuilt once SITE_ORIGIN names the new one", async () => {
  _pagesBuiltForTests({ brand: "citycoin" });
  const { env, chain } = await coinWorld(CC);
  const r = await get(env, chain, `/coin-meta/${DEMOV}.json`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "public, max-age=300", "kept by wallets for minutes, not an hour, while it is waiting for the new host");
  const j = await r.json();
  assert.doesNotMatch(withoutImage(j), /vicinity/i, "no field but the compiled picture prefix names the old host");
  assert.equal(j.image, `https://vicinity.city/coin-meta/${DEMOV}.png`, "(the program's own prefix: out of this stage)");
  for (const k of ["external_url", "createdOn", "launchpadLogo", "website"]) assert.ok(!Object.hasOwn(j, k), `${k}: no link to a host that is not the site's new one`);
  assert.deepEqual([j.name, j.symbol, j.launchpad, j.description], ["Demo City Coin", "DEMOV", "Citycoin.dev", "A city that tests things. Launched on Citycoin.dev on Solana."]);
  const stored = (await env.DB.prepare("SELECT meta_json FROM lp_coins WHERE mint = ?").bind(DEMOV).first()).meta_json;
  assert.ok(provisionalJson(stored), "stored as provisional (no createdOn), never with the old host for good");
  assert.doesNotMatch(stored.replace(`https://vicinity.city/coin-meta/${DEMOV}.png`, ""), /vicinity/i);
  // a second read: the stored JSON, still for minutes, no chain read
  const reads = chain.S.log.length;
  const again = await get(env, chain, `/coin-meta/${DEMOV}.json`);
  assert.deepEqual([again.headers.get("cache-control"), await again.json()], ["public, max-age=300", j]);
  assert.equal(chain.S.log.length, reads);
  // the cutover: SITE_ORIGIN names citycoin.dev; the next read rebuilds it once from the recorded name and symbol (no chain read)
  const moved = { ...env, SITE_ORIGIN: "https://citycoin.dev", SITE_ORIGINS: "https://citycoin.dev https://vicinity.city" };
  const after = await get(moved, chain, `/coin-meta/${DEMOV}.json`);
  assert.equal(after.headers.get("cache-control"), "public, max-age=3600");
  const k = await after.json();
  assert.deepEqual([k.external_url, k.createdOn, k.launchpadLogo, k.website], [`https://citycoin.dev/coin?mint=${DEMOV}`, "https://citycoin.dev", "https://citycoin.dev/brand/icon-512.png", `https://citycoin.dev/coin?mint=${DEMOV}`]);
  assert.doesNotMatch(withoutImage(k), /vicinity/i);
  assert.equal(chain.S.log.length, reads, "rebuilt from the database's row");
  const kept = (await env.DB.prepare("SELECT meta_json FROM lp_coins WHERE mint = ?").bind(DEMOV).first()).meta_json;
  assert.equal(provisionalJson(kept), false);
  assert.deepEqual(JSON.parse(kept), k, "stored for good from now on");
});

test("CRAWL-1: with BRAND unset the coin JSON is today's (the legacy brand, stored for good, an hour in caches)", async () => {
  const { env, chain } = await coinWorld({});
  const r = await get(env, chain, `/coin-meta/${DEMOV}.json`);
  assert.equal(r.headers.get("cache-control"), "public, max-age=3600");
  assert.deepEqual(await r.json(), coinMetadataJson({ mint: DEMOV, name: "Demo City Coin", symbol: "DEMOV", pitch: "A city that tests things.", city: { id: DEMOV_CITY, name: "Demo City", country: "US", ticker: "DEMOV" } }));
  assert.equal(provisionalJson((await env.DB.prepare("SELECT meta_json FROM lp_coins WHERE mint = ?").bind(DEMOV).first()).meta_json), false);
});

test("CRAWL-1, BRAND unset: every stored coin JSON is served exactly as at 5150529, also one without the legacy brand's fields (an hour in caches, the stored bytes)", async () => {
  // a stored JSON that holds neither "launchpad" nor "createdOn" (it reads as provisional under another label set): the parity sweep of the
  // final check found it served for 5 minutes instead of an hour with BRAND unset
  const stored = JSON.stringify({ name: "Demo City Coin", symbol: "DEMOV", description: "A fixture JSON with no launchpad fields." });
  assert.equal(provisionalJson(stored), true);
  for (const extra of [{}, { BRAND: "" }, CC]) { // (BRAND=citycoin with today's pages is today's label set: src/brand.js BRAND_PAGES_MISMATCH)
    const { env, chain } = await coinWorld(extra);
    await get(env, chain, `/coin-meta/${DEMOV}.json`); // builds and stores the coin's JSON
    await env.DB.prepare("UPDATE lp_coins SET meta_json = ? WHERE mint = ?").bind(stored, DEMOV).run();
    _resetLpCoins();
    const r = await get(env, chain, `/coin-meta/${DEMOV}.json`);
    assert.equal(r.status, 200, JSON.stringify(extra));
    assert.equal(r.headers.get("cache-control"), "public, max-age=3600", JSON.stringify(extra));
    assert.equal(await r.text(), stored, JSON.stringify(extra));
    assert.equal((await env.DB.prepare("SELECT meta_json FROM lp_coins WHERE mint = ?").bind(DEMOV).first()).meta_json, stored, "never rewritten");
  }
});

/* ---------------------------------------------------------------- CRAWL-2 and F3: no founder rules in a token that is not live */
// the old founder rules as numbers and terms (master section 15; the S16 list in test/legacy-seats-copy.test.js covers the words)
const FOUNDER_NUMBERS = [/\b100K\b/, /\b1M\b/, /100,000/, /1,000,000/, /10,000,000/, /founder amount/i, /stake ladder/i, /\b7 days\b/i, /seven days/i, /qualif/i, /Seed Steward/i, /holdings count/i];

test("CRAWL-2/F3: the Citycoin.dev pages state no founder amount, hold period, Stake Ladder or holder tier (built with the freeze, the only way they ship)", () => {
  for (const [f, html] of ccPages) {
    if (f === "terms.html") continue; // the owner's legal text: changed only in the name, recorded for the owner
    const w = words(html).replace(/Top · 7 days/g, " "); // (the feed's weekly sort of posts: not a founder rule, as test/legacy-seats-copy.test.js allows)
    for (const re of FOUNDER_NUMBERS) assert.doesNotMatch(w, re, `${f}: ${re}`);
    assert.doesNotMatch(w, /Citycoin\.dev tokens?\b[^.]{0,40}\b(?:hold|founder|bar)\b|\bhold\b[^.]{0,40}Citycoin\.dev tokens?/i, `${f}: no holding asked in the token that is not live`);
  }
  // the Rules: the founders' fold says what is on record, in S16's reviewed words
  assert.match(words(ccPages.get("rules.html")), /City founders Closed for changes Seats: founder seats, squads and elections are closed for changes\./);
  // today's pages do state them (the check reads what it should)
  const today = words(read("public/rules.html") + read("public/index.html"));
  for (const re of [/100K/, /stake ladder/i, /seven days/i]) assert.match(today, re);
});

test("F3/F7: BRAND=citycoin is built only with LEGACY_SEATS=frozen and an EMAIL_FROM without the old name, in the same pull request", () => {
  const live = deployedVars();
  assert.deepEqual(pageBrandPrerequisites(live), { ok: true }, "today's wrangler.jsonc: BRAND unset, nothing needed");
  const base = { ...live, BRAND: "citycoin" };
  assert.throws(() => pageBrandPrerequisites(base), /BRAND=citycoin in wrangler\.jsonc needs, in the same pull request: LEGACY_SEATS=frozen \(with DEPLOYMENT_ENV\).*; EMAIL_FROM without the old name \(it is "Vicinity <noreply@vicinity\.city>"\)/);
  assert.throws(() => pageBrandPrerequisites({ ...base, LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production" }), /EMAIL_FROM without the old name/);
  assert.throws(() => pageBrandPrerequisites({ ...base, EMAIL_FROM: "Citycoin.dev <noreply@example.com>" }), /LEGACY_SEATS=frozen/);
  assert.throws(() => pageBrandPrerequisites({ ...base, LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production", EMAIL_FROM: "" }), /EMAIL_FROM without the old name \(it is unset\)/);
  assert.throws(() => pageBrandPrerequisites({ ...base, LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production", EMAIL_FROM: "Team <hi@VICINITY.example>" }), /EMAIL_FROM/);
  assert.deepEqual(pageBrandPrerequisites({ ...base, LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production", EMAIL_FROM: "Citycoin.dev <noreply@example.com>" }), { ok: true });
});

test("CRAWL-2: a founder on a Citycoin.dev page sees no holding bar, no founder amount and no grace top-up, whatever /api/me says", async () => {
  const seat = { id: 3, cityId: "5142056", city: "Utica", country: "US", status: "active", since: "2026-10-10T12:00:00Z", appealUntil: null, graceUntil: null, probationUntil: null, threshold: 100000, policy: 6 };
  for (const status of ["active", "grace", "steward"]) {
    const me = memberMe({ wallet: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2", launched: false });
    const s = { ...seat, status, graceUntil: status === "grace" ? "2026-10-31T00:04:00Z" : null, probationUntil: status === "steward" ? "2027-01-08T12:00:00Z" : null };
    Object.assign(me, { level: "founder", roles: { ...me.roles, founder: true }, founder: { ...me.founder, seat: s } }); // (no legacySeats key: the page alone decides)
    const t = await openDashboard({ me, page: ccPages.get("dashboard.html") });
    await t.advance(5000);
    assert.deepEqual(t.scriptErrors, [], status);
    const text = t.doc.body.textContent.replace(/\s+/g, " ");
    for (const re of [/Your holding vs your bar/, /100,000/, /Keep [\d,]+/, /Hold [\d,]+ /, /below it, moderation pauses/, /Top up/]) assert.doesNotMatch(text, re, `${status}: ${re}`);
  }
  // the scripts read the freeze from the page's label set too (frozen from the first paint, before /api/me answers)
  for (const [f, re] of [["public/cities.js", /const seatsFrozen = \(\) => Boolean\(BRAND\) \|\| /], ["public/dashboard-roles.js", /const frozenSeats = \(d\) => Boolean\(BRAND\) \|\| /],
    ["public/dashboard-v2.js", /const frozenSeats = \(d\) => Boolean\(BRAND\) \|\| /], ["public/dashboard.js", /const seatsFrozen = \(d = me\) => Boolean\(BRAND\) \|\| /], ["public/admin.js", /return Boolean\(BRAND\) \|\| /]]) assert.match(read(f), re, f);
});

/* ---------------------------------------------------------------- CRAWL-4: the owner's summary box */
test("CRAWL-4: the setup summary's legacy fee account is 'legacyToken' under BRAND=citycoin, 'vicinity' today; the preflight reads either", () => {
  const ref = [{ exists: true, account: "WsoLFeeAcct111111111111111111111111111111111" }, { exists: true, account: "LegacyFeeAcct11111111111111111111111111111111" }];
  assert.deepEqual(referralAccountsOf(ref, SAME), { wsol: ref[0].account, vicinity: ref[1].account });
  assert.deepEqual(referralAccountsOf(ref, CCW), { wsol: ref[0].account, legacyToken: ref[1].account });
  assert.deepEqual(referralAccountsOf([{ exists: false }, { exists: false }], CCW), { wsol: null, legacyToken: null });
  assert.doesNotMatch(JSON.stringify(referralAccountsOf(ref, CCW)), /vicinity/i);
  assert.match(read("scripts/mainnet-preflight.mjs"), /ra\.vicinity !== undefined \? ra\.vicinity : ra\.legacyToken/);
});

/* ---------------------------------------------------------------- F9 and F10: the link checker on /official, no Token page link */
test("F9: under BRAND=citycoin the footer's 'Check a link' opens the checker on /official, which works there; today's pages keep /token#check", async () => {
  for (const [f, html] of ccPages) {
    assert.match(html, /<a href="\/official#check">Check a link<\/a>/, f);
    assert.doesNotMatch(html, /href="\/token#check"/, f);
  }
  assert.match(read("public/index.html"), /<a href="\/token#check">Check a link<\/a>/, "today's footer");
  // the checker on the Citycoin.dev /official: the answer the Worker gives, in the page's own words
  const p = await openPage("official.html", { html: ccPages.get("official.html") });
  const asked = [];
  p.window.fetch = async (path) => {
    asked.push(String(path));
    const body = String(path).startsWith("/api/check") ? { verdict: "warning", kind: "website", message: "This is the address planned for Citycoin.dev. It does not serve the site yet, so nothing there is official until it does." } : { ok: true };
    return { ok: true, status: 200, json: async () => body };
  };
  vm.runInContext(read("public/official.js"), p.window, { filename: "public/official.js" });
  p.$("#check-input").value = "citycoin.dev";
  const submit = new p.window.CustomEvent("submit");
  p.$("#checker").dispatchEvent(submit);
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(asked.filter((a) => a.startsWith("/api/check")), ["/api/check?q=citycoin.dev"]);
  const result = p.$("#check-result");
  assert.equal(result.hidden, false);
  assert.match(result.getAttribute("class"), /check-result--warning/);
  assert.equal(result.textContent.replace(/\s+/g, " ").trim(), "!Be carefulThis is the address planned for Citycoin.dev. It does not serve the site yet, so nothing there is official until it does.");
  // today's /official has no checker, and official.js does nothing more there
  assert.doesNotMatch(read("public/official.html"), /id="checker"/);
});

test("F10: the Citycoin.dev roles list names no Token page (it is the plain 'not live yet' page there); today's still links it", () => {
  const roles = (html) => html.slice(html.indexOf('id="roles"'), html.indexOf("</section>", html.indexOf('id="roles"')));
  assert.doesNotMatch(roles(ccPages.get("dashboard.html")), /href="\/token/);
  assert.match(roles(ccPages.get("dashboard.html")), /<li>Publishes the only official contract address once the token is live\.<\/li>/);
  assert.match(roles(read("public/dashboard.html")), /<a href="\/token">Token page<\/a>/);
});

/* ---------------------------------------------------------------- F8: theme colour and the pass mark */
function themeOn({ brand }) {
  const metas = { 'meta[name="theme-color"]': { content: brand ? "#071426" : "#070E19" }, 'meta[name="color-scheme"]': { content: "dark" } };
  const root = { dataset: {}, getAttribute: (k) => (k === "data-brand" && brand ? brand : null) };
  const store = new Map();
  const document = { documentElement: root, querySelector: (s) => metas[s] || null, querySelectorAll: () => [], addEventListener() {} };
  class CustomEvent { constructor(type, o) { this.type = type; this.detail = o && o.detail; } }
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  vm.runInNewContext(read("public/theme.js"), { document, window: { dispatchEvent() {}, addEventListener() {} }, localStorage, CustomEvent, setTimeout: () => 0 });
  return metas['meta[name="theme-color"]'].content;
}
test("F8: a Citycoin.dev page keeps its own dark canvas colour (#071426); today's pages keep #070E19; the pass shows the Citycoin.dev icon", () => {
  assert.equal(themeOn({ brand: "citycoin" }), "#071426");
  assert.equal(themeOn({ brand: null }), "#070E19");
  assert.match(ccPages.get("index.html"), /<meta name="theme-color" content="#071426">/);
  assert.match(read("public/brand/citycoin.css"), /:root\[data-brand="citycoin"\] \.pass__mark \{ background: url\("\/brand\/favicon\.svg"\) center \/ contain no-repeat;/);
});

/* ---------------------------------------------------------------- F2: the switch, tried in CI */
test("F2: the CI trial writes the switch and its prerequisites into a copy of wrangler.jsonc, and the page build accepts exactly that", () => {
  const text = read("wrangler.jsonc");
  const trial = withTrialSettings(text);
  const vars = JSON.parse(trial.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars;
  for (const [k, v] of Object.entries(TRIAL_SETTINGS)) assert.equal(vars[k], v, k);
  assert.equal(TRIAL_SETTINGS.EMAIL_FROM, "Citycoin.dev <noreply@example.com>", "a clearly fake placeholder sender");
  assert.deepEqual(pageBrandPrerequisites(vars), { ok: true });
  assert.deepEqual(pageLegacySeats(vars), { legacySeats: "frozen" });
  assert.deepEqual(pageV5Config(vars), { ok: true });
  assert.throws(() => withTrialSettings(trial), /trial's own placeholder sender/, "never applied twice");
  // the job itself: the same build and suite as the main job, after the trial settings
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /brand-switch-trial:\n[\s\S]*- run: node scripts\/brand\/switch-trial\.mjs\n {6}- run: npm run build\n?/);
  // and the suite reads today's site whichever build is committed (test/helpers/today-build.mjs), loaded before every test file
  assert.match(read("package.json"), /"test": "node --import \.\/test\/helpers\/today-build\.mjs --test test\/\*\.test\.js"/);
});

/* ---------------------------------------------------------------- final check finding 2: the trial once the switch is committed */
// The trial must stay green on the configuration pull request that sets BRAND=citycoin and on every pull request after it, and still fail
// on a half-set or inconsistent configuration. Every sender below is a clearly fake fixture (example.org, example.com).
const WRANGLER = read("wrangler.jsonc");
const TODAY_FROM = '"EMAIL_FROM": "Vicinity <noreply@vicinity.city>",';
const OWNER_FROM = "Citycoin.dev <owner-supplied@mail.example.org>";
const committed = (extra, from = TODAY_FROM) => {
  assert.ok(WRANGLER.includes(TODAY_FROM), "today's sender line is where the fixtures put their settings");
  return WRANGLER.replace(TODAY_FROM, [from, ...extra.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)].join("\n"));
};
const ownerFrom = `"EMAIL_FROM": ${JSON.stringify(OWNER_FROM)},`;
const SWITCHED = committed([["BRAND", "citycoin"], ["LEGACY_SEATS", "frozen"], ["DEPLOYMENT_ENV", "production"]], ownerFrom);
const cli = (text) => {
  const dir = mkdtempSync(join(tmpdir(), "switch-trial-"));
  try {
    const path = join(dir, "wrangler.jsonc");
    writeFileSync(path, text);
    const r = spawnSync(process.execPath, [new URL("../scripts/brand/switch-trial.mjs", import.meta.url).pathname, "--local", "--wrangler", path], { encoding: "utf8", env: { ...process.env, CI: "" } });
    return { status: r.status, out: r.stdout, err: r.stderr, text: readFileSync(path, "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

test("final check finding 2: wrangler.jsonc already carrying BRAND=citycoin with its prerequisites is a no-op (exit 0, one clear line, nothing written)", () => {
  const vars = varsOf(SWITCHED);
  assert.deepEqual(pageBrandPrerequisites(vars), { ok: true }, "the committed switch is one the page build accepts");
  const p = trialPlan(SWITCHED);
  assert.equal(p.action, "noop");
  assert.match(p.line, /^switch-trial: wrangler\.jsonc already sets the switch with its prerequisites \(BRAND=citycoin, LEGACY_SEATS=frozen, DEPLOYMENT_ENV=production, EMAIL_FROM without the old name\): nothing to try and nothing written/);
  assert.throws(() => withTrialSettings(SWITCHED), /already sets the switch/);
  // the letter case the Worker accepts (trimmed, any case) counts the same
  assert.equal(trialPlan(SWITCHED.replace('"BRAND": "citycoin"', '"BRAND": " CityCoin "')).action, "noop");
  const r = cli(SWITCHED);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /already sets the switch with its prerequisites/);
  assert.equal(r.err, "");
  assert.equal(r.text, SWITCHED, "nothing written");
});

test("final check finding 2: a half-set or inconsistent wrangler.jsonc still fails the trial (exit 1, with the reason)", () => {
  const fails = [
    ["BRAND=citycoin without LEGACY_SEATS", committed([["BRAND", "citycoin"]], ownerFrom), /LEGACY_SEATS=frozen \(with DEPLOYMENT_ENV\)/],
    ["BRAND=citycoin with today's sender", committed([["BRAND", "citycoin"], ["LEGACY_SEATS", "frozen"], ["DEPLOYMENT_ENV", "production"]]), /EMAIL_FROM without the old name/],
    ["BRAND=citycoin and the freeze without DEPLOYMENT_ENV", committed([["BRAND", "citycoin"], ["LEGACY_SEATS", "frozen"]], ownerFrom), /ENVIRONMENT_UNSET/],
    ["the freeze without DEPLOYMENT_ENV, no BRAND", committed([["LEGACY_SEATS", "frozen"]]), /ENVIRONMENT_UNSET/],
    ["a BRAND that names no label set", committed([["BRAND", "nope"]]), /BRAND_UNKNOWN/],
    ["a LEGACY_SEATS outside the switch's values", committed([["LEGACY_SEATS", "freeze"]]), /refused by the page build/],
    ["the trial's own result, applied twice or committed", withTrialSettings(WRANGLER), /trial's own placeholder sender/],
  ];
  for (const [name, text, why] of fails) {
    const p = trialPlan(text);
    assert.equal(p.action, "fail", name);
    assert.match(p.reason, why, name);
    assert.throws(() => withTrialSettings(text), why, name);
  }
  const r = cli(fails[0][1]);
  assert.equal(r.status, 1);
  assert.match(r.err, /^switch-trial: the committed wrangler\.jsonc is refused by the page build: BRAND=citycoin in wrangler\.jsonc needs, in the same pull request: LEGACY_SEATS=frozen/);
  assert.equal(r.text, fails[0][1], "nothing written");
  // and never outside CI or a scratch copy
  const bare = spawnSync(process.execPath, [new URL("../scripts/brand/switch-trial.mjs", import.meta.url).pathname], { encoding: "utf8", env: { ...process.env, CI: "" } });
  assert.equal(bare.status, 1);
  assert.match(bare.stderr, /Run it in CI, or with --local on a scratch copy/);
});

test("final check finding 2: prerequisites committed before BRAND (the freeze, DEPLOYMENT_ENV, a new sender) are kept, and the trial still tries the switch on top", () => {
  const cases = [
    ["the freeze switched on alone", committed([["LEGACY_SEATS", "frozen"], ["DEPLOYMENT_ENV", "production"]]), ["LEGACY_SEATS", "DEPLOYMENT_ENV"]],
    ["DEPLOYMENT_ENV set for another switch", committed([["DEPLOYMENT_ENV", "production"]]), ["DEPLOYMENT_ENV"]],
    ["the owner's new sender first", WRANGLER.replace(TODAY_FROM, ownerFrom), ["EMAIL_FROM"]],
    ["a blank BRAND line", committed([["BRAND", ""]]), []],
  ];
  for (const [name, text, kept] of cases) {
    const p = trialPlan(text);
    assert.equal(p.action, "write", name);
    const vars = varsOf(p.text);
    assert.equal(vars.BRAND, "citycoin", name);
    assert.equal(vars.LEGACY_SEATS, "frozen", name);
    assert.equal(vars.DEPLOYMENT_ENV, "production", name);
    assert.equal(vars.EMAIL_FROM, kept.includes("EMAIL_FROM") ? OWNER_FROM : TRIAL_SETTINGS.EMAIL_FROM, name);
    for (const k of Object.keys(TRIAL_SETTINGS)) assert.equal(p.text.split(`"${k}":`).length - 1, 1, `${name}: one ${k} line`);
    assert.deepEqual(pageBrandPrerequisites(vars), { ok: true }, name);
    assert.deepEqual(pageV5Config(vars), { ok: true }, name);
    if (kept.length) assert.match(p.line, new RegExp(`kept as committed: ${kept.join(", ")}\\)$`), name);
    // every other line of wrangler.jsonc is untouched
    const strip = (t) => t.split("\n").filter((l) => !/^\s*"(EMAIL_FROM|BRAND|LEGACY_SEATS|DEPLOYMENT_ENV)"\s*:/.test(l)).join("\n");
    assert.equal(strip(p.text), strip(text), name);
  }
  // the committed file of today, as the CI job sees it: written, exit 0
  const r = cli(WRANGLER);
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /^switch-trial: wrangler\.jsonc now sets EMAIL_FROM=Citycoin\.dev <noreply@example\.com>, BRAND=citycoin, LEGACY_SEATS=frozen, DEPLOYMENT_ENV=production \(this copy only\)/);
  assert.equal(r.text, withTrialSettings(WRANGLER));
});

test("today's label set needs nothing and builds today's pages (the prerequisites never touch BRAND unset)", () => {
  assert.deepEqual(pageBrandPrerequisites({}), { ok: true });
  assert.deepEqual(pageBrandPrerequisites({ BRAND: "" }), { ok: true });
  assert.equal(LEGACY_BRAND.key, "");
});
