// Build parity (Citycoin.dev master v5, stage S02; rebrand-inventory.md section 6 "build parity test"): with BRAND unset, the page
// build gives the committed public/*.html byte for byte, and every product name the layout writes comes from src/brand.js. Nothing
// visible changes until a configuration pull request sets BRAND.
// The label migration (stage S48, area a: the pages; owner directive 24 Oct 2026, "there should be no existence of vicinity. only
// citycoin."): the pages built with BRAND=citycoin say "vicinity" nowhere, in any letter case, show nothing of the main token while it is
// not live (no address, price, Buy, holders or social account), keep every link working, and change the Terms and Rules only in the name
// apart from the clauses listed for the owner (scratchpad rebrand-terms-diff.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { LOOKS, MAIN_TOKEN_PAGES, PAGES_BUILT_FILE, brandAddressGroups, brandBlocks, brandFill, brandResidue, buildPages, buildStandalonePages, deployedVars, lookOf,
  pageBrand, pageBrandPrerequisites, pageLegacySeats, pageSocials, pageWalletOnly, pagesBuiltSource, settingsFor } from "../scripts/pages/build.mjs";
import { FROZEN_COPY } from "../scripts/pages/frozen-copy.mjs";
import { BRANDS, CITYCOIN_BRAND, LEGACY_BRAND, brandLabels, brandOf } from "../src/brand.js";
import { SOCIAL_PROFILES, officialAddresses, socialProfiles } from "../src/official.js";
import { escBrand } from "../src/footer-social.js";
import { DEFAULT_SITE, siteConfig } from "../src/site-config.js";
import { committedFile, committedIsToday, realWrangler } from "./helpers/today-build.mjs";
import * as MAIL from "../src/mail.js";
import * as SOL from "../src/solana.js";
import * as META from "../src/coinmeta.js";
import * as MARKET from "../src/marketlive.js";
import * as FEES from "../src/fees.js";
import * as SCREEN from "../src/screen.js";
import { POLICY } from "../src/policy.js";
import * as COINDEFAULTS from "../src/coindefaults.js";
import * as COINREADY from "../src/coinready.js";
import * as COINREVIEW from "../src/coinreview.js";
import * as COINS from "../src/coins.js";
import * as TAKEDOWN from "../src/cointakedown.js";
import * as LPCOINS from "../src/lpcoins.js";
import { decodeConfig } from "../src/sol/dbc.js";
import { EXPECTED_POOL_CONFIG } from "../src/sol/dbc-config-data.js";
import { fromBase64 } from "../src/sol/bytes.js";
import { _pagesBuiltForTests } from "../src/v5policy.js";
import { PROBE_ENVS, probe } from "./helpers/legacyprobe.js";

const committed = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url));
const sources = readdirSync(new URL("../scripts/pages/src/", import.meta.url)).filter((f) => f.endsWith(".html")).sort();
const all = (opts) => [...buildPages(opts), ...buildStandalonePages(opts)];
const sameBytes = (pages, why) => {
  assert.deepEqual(pages.map(([f]) => f).sort(), sources, "one page per source file");
  for (const [f, html] of pages) assert.ok(Buffer.from(html, "utf8").equals(committed(f)), `public/${f} differs from the build (${why})`);
};

test("BRAND is not set in wrangler.jsonc: the pages are built with today's label set", () => {
  assert.equal(Object.hasOwn(deployedVars(), "BRAND"), false);
  const b = pageBrand();
  assert.equal(b.value, "");
  assert.equal(b.problem, null);
  for (const k of Object.keys(LEGACY_BRAND)) assert.equal(b[k], LEGACY_BRAND[k], k);
  assert.deepEqual(Object.keys(BRANDS), ["", "citycoin"], "today's label set and the Citycoin.dev one (label migration S48)");
});

test("with BRAND unset, every built page is byte-identical to the committed public/ file (main and standalone pages)", () => {
  sameBytes(all(), "default build");
  for (const env of [{}, { BRAND: "" }, { BRAND: "   " }, { BRAND: undefined }]) sameBytes(all({ brand: brandOf(env) }), `BRAND=${JSON.stringify(env.BRAND)}`);
  sameBytes(all({ brand: LEGACY_BRAND }), "LEGACY_BRAND");
});

// The live site, pinned without git: sha256 over every built page (its file name, a NUL, its bytes, a NUL, in file-name order) and over
// src/pages-built.js. Taken at c5df86a (main when the label migration started); main edabab5 (S16, live since 24 Oct 2026, the base this
// branch is rebased on) builds the same bytes, because the legacy seat freeze changes no page while LEGACY_SEATS is unset. The label
// migration keeps today's site byte for byte while BRAND is unset, so these never change during it (owner directive 24 Oct 2026; a change
// that should alter today's pages is not a label stage). The suite reads today's build whichever build is committed
// (test/helpers/today-build.mjs); the committed build itself is checked against the committed wrangler.jsonc below.
const C5DF86A_PAGES_SHA256 = "8aebe569e8b35d12eedf848a28527e1868c5a79f9cc189c35d8d4dfd2801bb8d";
const C5DF86A_PAGES_BUILT_SHA256 = "2df6c123113a794e45b40a454928ae423641f307e6e6ed85974e3081d08d9025";
const sha256 = (...parts) => { const h = createHash("sha256"); for (const p of parts) h.update(p); return h.digest("hex"); };
test("with BRAND unset, the built pages and src/pages-built.js are the live site's, byte for byte (c5df86a, the same bytes at edabab5)", () => {
  const digest = (pages) => sha256(...[...pages].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).flatMap(([f, html]) => [`${f}\0`, Buffer.from(html, "utf8"), "\0"]));
  assert.equal(digest(all()), C5DF86A_PAGES_SHA256, "the default build");
  assert.equal(digest(sources.map((f) => [f, committed(f).toString("utf8")])), C5DF86A_PAGES_SHA256, "the committed public/*.html");
  const record = readFileSync(new URL("../src/pages-built.js", import.meta.url));
  assert.equal(sha256(record), C5DF86A_PAGES_BUILT_SHA256, "the committed src/pages-built.js");
  assert.equal(pagesBuiltSource(), record.toString("utf8"), "the record the build writes for wrangler.jsonc");
  assert.match(record.toString("utf8"), /export const PAGES_BUILT = Object\.freeze\(\{ mainTokenV5: false, brand: "", pagesReachWorker: false \}\);/);
});

// The Worker's own words (the label migration, area c: e-mails, wallet statements, new coins' JSON, market attribution, fee words, the
// screener's explanations, the policy, the message tables callers rename): with today's label set they are c5df86a's, byte for byte. The
// fingerprint is computed the same way from the c5df86a tree (the same calls, which take no label set there), so any change to today's
// words fails here. A BRAND that the pages were not built with changes nothing (src/brand.js brandOf, fail closed). Stage S23 (PR #103,
// main 4a50794, the base this branch is rebased on) changed today's words on purpose (the deleted approval round's gates and the coin review's
// city-list words), so the fingerprint was computed again from the 4a50794 tree with the same calls: f850adc9... (the c5df86a and 5150529
// trees both give 4dd8a201447e08ec7561abf4b16461ea3e3721e5bfb20745ede759037d67b2a5, the value before S23; src/lpbatch.js's CHECKS, pinned
// on their own until then, went with that file).
const C5DF86A_WORKER_WORDS_SHA256 = "f850adc94c22af7327c3e00049c8ac78ee5e60cf830223c84c3512ef6d740387";
function workerWords(env) {
  const e = env === undefined ? [] : [env];
  const out = { mail: [] };
  // (no origin: the e-mails as they were before stage S06 gave them the served host, src/hostbind.js mailOrigin; the label set fourth)
  for (const kind of ["signin", "signup", "reset", "other", undefined]) out.mail.push(MAIL.verificationEmail("123456", kind, undefined, ...e));
  out.mail.push(MAIL.verificationEmail("<b>&", "signin", undefined, ...e));
  for (const app of ["phantom", "solflare", "backpack", "nope", undefined]) out.mail.push(MAIL.walletLinkedEmail("Abcd…wxyz", app, undefined, ...e));
  out.mail.push(MAIL.googleAddedEmail(undefined, ...e));
  const ADDR = "8VEEtD3E9ZkHZZw6WT37DE1nYbVEtnDJ9DRGgBDkPuCk";
  const ACTIONS = [["verify", {}], ["claim", { cityId: "5142056", country: "US" }], ["add", { name: "Utica", country: "US" }], ["login", {}], ["login", { pin: "42" }], ["link", { handle: "zq_fixture" }], ["link", { handle: "zq_fixture", pin: "42" }]];
  out.statements = [SOL.MESSAGE_STATEMENT, ...ACTIONS.map(([a, o]) => {
    const statement = SOL.statementFor(a, o);
    const message = SOL.buildMessage({ host: "vicinity.city", address: ADDR, nonce: "abcdefghijklmnop", issuedAt: "2026-10-24T00:00:00.000Z", statement });
    return [statement, SOL.parseMessage(message)];
  })];
  const coin = { mint: ADDR, name: "Utica", symbol: "UTICA", pitch: "A fixture pitch.", city: { id: "5142056", name: "Utica", country: "US", ticker: "UTICA" } };
  out.meta = [META.coinMetadataJson(coin), META.coinMetadataJson({ ...coin, pitch: undefined }),
    META.versionJson({ mint: ADDR, city_id: "5142056" }, { name: "Utica", symbol: "UTICA" }, { description: "The city coin of Utica.", art_sha256: "a".repeat(64), content: { city: { name: "Utica", country: "US", region: "New York", countryName: "United States" } } })];
  out.attribution = [];
  for (const used of [["chain"], ["jupiter", "chain"], ["raydium"], ["dexscreener_pool"], ["dexscreener"], []]) for (const holders of [false, true]) for (const trades of [false, true])
    out.attribution.push(MARKET.attributionFor(new Set(used), { holders, trades }));
  out.attributionTable = MARKET.ATTRIBUTION;
  const S = FEES.feeSchedule(decodeConfig(fromBase64(EXPECTED_POOL_CONFIG)), { address: "EZVHCgxKZhvXmUGMXJMEw8tZHiTmoHPyM9mNNQ5u1kSP", readAt: Date.parse("2026-10-16T14:03:00Z") });
  out.fees = [FEES.feeWords(S), FEES.feeWords(S, "coin"), FEES.feeWords(S, "launch"), FEES.meteoraWords(S), FEES.meteoraWords(S, { past: true }), FEES.poolSplitWords(S), FEES.halvesWords()];
  out.screen = Object.keys(SCREEN.MESSAGES).map((c) => [SCREEN.explain(c, "Utica"), SCREEN.explain(c)]);
  out.policy = POLICY;
  out.tables = [COINDEFAULTS, COINREADY, COINREVIEW, COINS, TAKEDOWN, LPCOINS].map((m) => Object.fromEntries(["SOURCE", "DEFAULT_GATES", "GATES", "REASONS", "LEGACY_REJECTED", "SYSTEM_TEXT_LAUNCHED", "CHECKS", "LP_VENUE", "NO_CHART", "NO_TRADES"].filter((k) => k in m).map((k) => [k, m[k]])));
  return sha256(JSON.stringify(out));
}
test("switch off (area c): the Worker's e-mails, statements, coin JSON and message texts are today's (4a50794), byte for byte", () => {
  for (const env of [undefined, {}, { BRAND: "" }, { BRAND: "citycoin" }, { BRAND: "citycoin", SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://example.test https://vicinity.city" }])
    assert.equal(workerWords(env), C5DF86A_WORKER_WORDS_SHA256, `env ${JSON.stringify(env)}`);
  // a build made with BRAND=citycoin while BRAND is unset (or another value) in the Worker: the pages' words, never today's inside pages that
  // show the other name (BRAND_PAGES_MISMATCH; review finding F12)
  _pagesBuiltForTests({ brand: "citycoin" });
  try { const ccWords = workerWords({ BRAND: "citycoin" }); for (const env of [{}, { BRAND: "other" }]) assert.equal(workerWords(env), ccWords, `env ${JSON.stringify(env)}`); }
  finally { _pagesBuiltForTests(null); }
  // and the sensitivity of the fingerprint: the label set's own words differ
  _pagesBuiltForTests({ brand: "citycoin" });
  try { assert.notEqual(workerWords({ BRAND: "citycoin" }), C5DF86A_WORKER_WORDS_SHA256); }
  finally { _pagesBuiltForTests(null); }
});

// The legacy token's answers (the label migration, area d: the official list and its addresses, the social accounts, the link checker over
// every input a visitor may paste, the main-token mint and cache tag, the badge texts, the portfolio's, Send's, the swap's and the coin page's
// allow-lists, the balance history's day key, the policy; test/helpers/legacyprobe.js): with today's label set they are c5df86a's, byte for
// byte. The fingerprint is the same probe run on the c5df86a tree. Area d hides the legacy token only under a label set the pages were built
// with: a BRAND set only in the Cloudflare dashboard changes none of them; a build for another label set hides it whatever BRAND says (F12).
// Stage S06 (PR #104, main 46c5825, the base this branch is rebased on) changed today's answers on purpose (citycoin.dev on the official list,
// so the checker calls it and www.citycoin.dev official), so the fingerprint was computed again with the same probe from the 46c5825 tree:
// aa2d68a2... (the same probe on the 4a50794 tree gives a58d2745..., the value before S06). Stage S55 changed today's answers on purpose again:
// vicinity.city, vicinitycity.com and vicinitycity.net left the official list (domain-cutover.md section 0, item 6), so the list is
// ["citycoin.dev"] and the checker answers "vicinitycity.net" as a former address (a warning, never official). The same probe, with the suite's
// stand-in, on a git archive of the go-live head 0606956 gives aa2d68a2... and on this tree 469e35bd...; those are the only differences
// (implementation-report.md section 11, stage S55).
const C5DF86A_LEGACY_ANSWERS_SHA256 = "469e35bdeea81f7f21d3071ca6eb0e95bef4841a16163dd2976f7f749e756ad7";
const ROOT = new URL("../", import.meta.url);
const legacyAnswers = async (extra = {}) => { const out = []; for (const env of PROBE_ENVS) out.push(await probe(ROOT, { ...env, ...extra })); return sha256(JSON.stringify(out)); };
test("switch off (area d): the legacy token's answers (official list, checker, socials, badges, allow-lists, policy) are c5df86a's, byte for byte", async () => {
  for (const extra of [{}, { BRAND: "" }, { BRAND: "citycoin" }, { BRAND: "other" }]) assert.equal(await legacyAnswers(extra), C5DF86A_LEGACY_ANSWERS_SHA256, JSON.stringify(extra));
  // a build made with BRAND=citycoin while BRAND is unset (or another value) in the Worker: the pages' answers, so the legacy token stays
  // hidden in pages that show it nowhere (BRAND_PAGES_MISMATCH; review finding F12)
  _pagesBuiltForTests({ brand: "citycoin" });
  try {
    const hidden = await legacyAnswers({ BRAND: "citycoin" });
    // the sensitivity of the fingerprint: under the label set the pages were built with, the legacy token is hidden
    assert.notEqual(hidden, C5DF86A_LEGACY_ANSWERS_SHA256);
    for (const extra of [{}, { BRAND: "other" }]) assert.equal(await legacyAnswers(extra), hidden, JSON.stringify(extra));
  } finally { _pagesBuiltForTests(null); }
});

// what the switch's configuration pull request commits: public/ and src/pages-built.js exactly as its wrangler.jsonc builds them (review finding
// F2: the suite must pass with either build committed). Read past the suite's stand-in for today's build (test/helpers/today-build.mjs).
const parseWrangler = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
test("the committed build is exactly what the committed wrangler.jsonc builds, whichever switches it sets (read past the suite's stand-in)", () => {
  const w = parseWrangler(realWrangler()), vars = w.vars || {}, assets = w.assets || {};
  const brand = pageBrand(vars);
  assert.deepEqual(pageBrandPrerequisites(vars), { ok: true });
  const opts = { brand, socials: pageSocials(vars, brand), site: siteConfig(vars), legacySeats: pageLegacySeats(vars).legacySeats, walletOnly: pageWalletOnly(vars).walletOnly };
  const built = [...buildPages(opts), ...buildStandalonePages(opts)];
  assert.deepEqual(built.map(([f]) => f).sort(), sources);
  for (const [f, html] of built) assert.ok(Buffer.from(html, "utf8").equals(committedFile(`public/${f}`)), `public/${f} is what wrangler.jsonc builds (npm run pages)`);
  assert.equal(committedFile("src/pages-built.js", "utf8"), pagesBuiltSource(vars, assets), "src/pages-built.js is the record of that build");
  const digest = sha256(...[...built].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).flatMap(([f, html]) => [`${f}\0`, Buffer.from(html, "utf8"), "\0"]));
  if (committedIsToday) {
    assert.equal(brand.key, "", "BRAND is not set in wrangler.jsonc: the live site");
    assert.equal(digest, C5DF86A_PAGES_SHA256, "today's committed build is the live site's, byte for byte");
  } else {
    // a configuration pull request that turned a switch on: its build is not today's, and today's build (the stand-in) still is
    assert.notEqual(digest, C5DF86A_PAGES_SHA256);
    if (brand.key) for (const [f, html] of built) assert.match(html, new RegExp(`<html lang="en" data-brand="${brand.key}"`), f);
  }
});

test("the shell's environment never reaches the page build (every build of a commit is the same)", () => {
  const before = process.env.BRAND;
  process.env.BRAND = "citycoin";
  try { sameBytes(all(), "BRAND set in the shell only"); } finally { if (before === undefined) delete process.env.BRAND; else process.env.BRAND = before; }
});

test("today's labels are exactly the strings the layout wrote before src/brand.js", () => {
  const L = brandLabels(LEGACY_BRAND);
  assert.equal(L.homeTitle, "Vicinity — One city. One coin. One community.");
  assert.equal(L.pageTitle("Token"), "Token · Vicinity");
  assert.equal(L.homeLink, "Vicinity home");
  assert.equal(L.headerName, "Vicinity");
  assert.equal(L.copyright, "Vicinity.city © 2026. All rights reserved.");
  assert.equal(L.socialList, "Vicinity on social media");
  assert.equal(L.socialLink("X", "@VicinityCitySOL"), "Vicinity on X (@VicinityCitySOL), opens in a new tab");
  assert.equal(L.safety, "Vicinity never asks for your recovery phrase or private key.");
});

test("every product name in the layout and the page sources comes from src/brand.js: a fake label set moves exactly those positions and nothing else", () => {
  // clearly fake test values; replacing them back must give the committed bytes, so no other byte of any page moved. A fake set has no
  // look (it is not a key of BRANDS), so its pages take today's branch of every brand block and today's layout.
  const FAKE = { key: "zqkey", productName: "Zqfakebrand", shortName: "Zqshort", domain: "zqfake.example", siteLabel: "Zqfakesite.example", senderName: "Zqsender", tagline: "Zq fake tagline." };
  assert.equal(lookOf(FAKE), null);
  const pages = all({ brand: FAKE });
  assert.deepEqual(pages.map(([f]) => f).sort(), sources);
  for (const [f, html] of pages) {
    const before = committed(f).toString("utf8");
    for (const v of Object.values(FAKE)) assert.ok(!before.includes(v), `precondition: ${v} is not in public/${f}`);
    assert.notEqual(html, before, `public/${f} carries the layout's labels`);
    const count = (s, t = html) => t.split(s).length - 1;
    // the source's own label fills: its body (today's branch) once each, its settings line's title and description twice each (<title> and
    // og:title, the description meta and og:description; the home page's title is the layout's)
    const src = readFileSync(new URL(`../scripts/pages/src/${f}`, import.meta.url), "utf8");
    const line = JSON.parse(src.slice(4, src.indexOf("-->\n")));
    const body = brandBlocks(f, src.slice(src.indexOf("-->\n") + 4), FAKE);
    const fills = (name) => count(`{{${name}}}`, body) + 2 * count(`{{${name}}}`, line.description || "") + (line.page === "home" ? 0 : 2 * count(`{{${name}}}`, line.title || ""));
    // the layout: title, og:title, the header link's label and text, the social list label, one label per social account, the security line
    assert.equal(count(FAKE.productName), 6 + SOCIAL_PROFILES.length + fills("productName"), `${f}: product-name positions`);
    assert.equal(count(FAKE.siteLabel), 1 + fills("siteLabel"), `${f}: the copyright line`);
    assert.equal(count(FAKE.domain), fills("domain"), `${f}: the address labels`);
    assert.equal(count(FAKE.shortName), fills("shortName"), `${f}: short names`);
    assert.equal(count(FAKE.tagline), (f === "index.html" ? 2 : 0) + fills("tagline"), `${f}: the home title and its og:title`);
    const back = html.replaceAll(FAKE.siteLabel, LEGACY_BRAND.siteLabel).replaceAll(FAKE.domain, LEGACY_BRAND.domain).replaceAll(FAKE.tagline, LEGACY_BRAND.tagline)
      .replaceAll(FAKE.shortName, LEGACY_BRAND.shortName).replaceAll(FAKE.productName, LEGACY_BRAND.productName);
    assert.ok(Buffer.from(back, "utf8").equals(committed(f)), `${f}: only label positions changed`);
  }
  // the fills are real: the Terms write the product's name through them
  assert.ok(readFileSync(new URL("../scripts/pages/src/terms.html", import.meta.url), "utf8").split("{{productName}}").length > 30);
});

test("labels are escaped where the layout writes them into markup", () => {
  const brand = { ...LEGACY_BRAND, productName: 'Zq "<b>&', siteLabel: "Zq<i>" };
  const html = new Map(buildPages({ brand })).get("token.html");
  assert.doesNotMatch(html, /<b>|<i>/);
  assert.match(html, /<title>[^<]* · Zq &quot;&lt;b&gt;&amp;<\/title>/);
  assert.match(html, /aria-label="Zq &quot;&lt;b&gt;&amp; home"/);
  assert.match(html, /> Zq&lt;i&gt; © 2026\. All rights reserved\.<\/p>/);
});

test("an unknown BRAND stops the page build instead of shipping today's labels under a new switch value", () => {
  assert.throws(() => pageBrand({ BRAND: "citycoin.dev" }), /BRAND="citycoin\.dev" is not a label set of src\/brand\.js \(BRAND_UNKNOWN\)/);
  assert.throws(() => pageBrand({ BRAND: "vicinity" }), /BRAND_UNKNOWN/);
  assert.throws(() => brandLabels({ ...LEGACY_BRAND, productName: " " }), /productName must be a non-empty string/);
  // BRAND=citycoin is a label set: the build takes it from wrangler.jsonc whatever the last build recorded (it writes the record)
  const b = pageBrand({ BRAND: "citycoin" });
  assert.equal(b.problem, null);
  assert.equal(b.productName, "Citycoin.dev");
});

/* ---------------------------------------------------------------- the label migration (S48, area a): brand blocks and label fills */
const LEG = LEGACY_BRAND, CC = CITYCOIN_BRAND;
const LEGACY_MINT = "2aVkhRfAEm44tMhFo8oamWvumGGvweFqnUwukRMBkray"; // the legacy $VICINITY mint (wrangler.jsonc VICINITY_MINT; history only)
test("brand blocks: the part for the label set; a marker alone on its line goes with its line; inline markers go in place", () => {
  const text = "a\n<!--@if citycoin-->\nB\n<!--@else-->\nC\n<!--@end-->\nd <!--@if !citycoin-->e<!--@end--> f\n  <!--@if citycoin-->g<!--@end-->\nh<!--@if citycoin-->i<!--@else-->j<!--@end-->k\n";
  assert.equal(brandBlocks("t", text, LEG), "a\nC\nd e f\n  \nhjk\n");
  assert.equal(brandBlocks("t", text, CC), "a\nB\nd  f\n  g\nhik\n");
  assert.equal(brandBlocks("t", text, { ...LEG, key: "zqkey" }), brandBlocks("t", text, LEG), "a set that is not citycoin takes today's branch");
  assert.equal(brandBlocks("t", "x <!--@if citycoin-->y<!--@end-->", LEG), "x ", "a marker at the end of the text without a newline");
  assert.equal(brandBlocks("t", "    <!--@if citycoin-->   \nY\n    <!--@end-->\t\nz", CC), "Y\nz", "spaces and tabs around an own-line marker");
  for (const [bad, why] of [
    ["<!--@if citycoin-->a<!--@if citycoin-->b<!--@end--><!--@end-->", /inside a brand block/],
    ["<!--@if vicinity-->a<!--@end-->", /names no label set/],
    ["<!--@if -->a<!--@end-->", /malformed brand marker <!--@if -->/],
    ["<!--@if citycoin -->a<!--@end-->", /malformed brand marker/],
    ["<!--@else -->", /malformed brand marker/],
    ["a<!--@else-->b", /outside a brand block/],
    ["a<!--@end-->", /outside a brand block/],
    ["<!--@if citycoin-->a<!--@else-->b<!--@else-->c<!--@end-->", /outside a brand block/],
    ["<!--@if citycoin-->a", /not closed/],
  ]) assert.throws(() => brandBlocks("t", bad, CC), why, bad);
});

test("label fills: {{name}} is the escaped label of the set; an unknown name or a stray brace stops the build", () => {
  assert.equal(brandFill("t", "{{productName}} · {{domain}} · {{siteLabel}} · {{shortName}} · {{tagline}}", escBrand(LEG)), "Vicinity · vicinity.city · Vicinity.city · Vicinity · One city. One coin. One community.");
  assert.equal(brandFill("t", "{{productName}} · {{domain}}", escBrand(CC)), "Citycoin.dev · Citycoin.dev");
  assert.equal(brandFill("t", "{{productName}}", escBrand({ ...LEG, productName: 'Zq "<b>' })), "Zq &quot;&lt;b&gt;");
  assert.throws(() => brandFill("t", "{{senderName}}", escBrand(CC)), /unknown label \{\{senderName\}\}/);
  assert.throws(() => brandFill("t", "{{ productName }}", escBrand(CC)), /not of the form/);
  assert.throws(() => brandFill("t", "a }} b", escBrand(CC)), /not of the form/);
});

test("a page's settings for a label set: its \"brand\" entry counts only for a look's label set, and must name one", () => {
  const own = { title: "T", description: "D", page: "p", scripts: ["x"], brand: { citycoin: { description: "C", scripts: [] } } };
  assert.deepEqual(settingsFor("p", own, LEG), { title: "T", description: "D", page: "p", scripts: ["x"] });
  assert.deepEqual(settingsFor("p", own, { ...LEG, key: "zqkey" }), { title: "T", description: "D", page: "p", scripts: ["x"] });
  assert.deepEqual(settingsFor("p", own, CC), { title: "T", description: "C", page: "p", scripts: [] });
  assert.throws(() => settingsFor("p", { brand: { "": {} } }, CC), /names no label set/);
  assert.throws(() => settingsFor("p", { brand: { vicinity: {} } }, CC), /names no label set/);
  assert.throws(() => settingsFor("p", { brand: ["citycoin"] }, CC), /must be an object/);
  assert.equal(lookOf(CC), LOOKS.citycoin);
  for (const b of [LEG, { ...LEG, key: "zqkey" }, { ...CC, key: "__proto__" }, null]) assert.equal(lookOf(b), null);
});

/* ---------------------------------------------------------------- the label migration: the pages built with BRAND=citycoin */
// (built for today's host, DEFAULT_SITE, and without the wallet-only copy: these tests are about the label set itself. The go-live build that
// wrangler.jsonc commits, SITE_ORIGIN=https://citycoin.dev with the wallet-only copy, is checked by the committed-build test above and by
// test/golive-config.test.js)
const ccPages = (opts = {}) => all({ brand: CC, site: DEFAULT_SITE, walletOnly: false, ...opts });
const cc = new Map(ccPages());
const PAGE_FILES = new Set(readdirSync(new URL("../public/", import.meta.url)));

test("BRAND=citycoin: no built page says vicinity, in any letter case, anywhere (text, attributes, head, comments, links)", () => {
  assert.deepEqual([...cc.keys()].sort(), sources, "every page builds with the Citycoin.dev label set, the build's own residue check passing");
  assert.deepEqual(brandResidue([...cc]), []);
  for (const [f, html] of cc) {
    assert.doesNotMatch(html, /vicinity/i, f);
    assert.doesNotMatch(html.replace(/^<!-- Generated by [^\n]*-->\n/m, ""), /<!--/, `${f}: the page's comments are not shipped`);
    assert.doesNotMatch(html, /\{\{|\}\}|<!--@/, `${f}: every fill and brand block is resolved`);
    assert.match(html, /Citycoin\.dev/, f);
    // citycoin.dev does not serve the site yet: no text or link sends anyone there (the brand name "Citycoin.dev" is not an address)
    assert.doesNotMatch(html, /citycoin\.dev\/|https?:\/\/(www\.)?citycoin\.dev|\bcitycoin\.dev\b(?!")/, `${f}: never an address of citycoin.dev`);
  }
});

test("BRAND=citycoin: a label set that still carries the old name, or a page that still says it, stops the build", () => {
  assert.throws(() => buildPages({ brand: { ...CC, productName: "Vicinity Two" } }), /BRAND=citycoin: these pages still say "vicinity": .*index\.html/);
  assert.throws(() => buildStandalonePages({ brand: { ...CC, siteLabel: "VICINITY" } }), /still say "vicinity".*profile\.html/);
  const left = brandResidue([["a.html", "x Vicinity y vicinity.city"], ["b.html", "clean"]]);
  assert.deepEqual(left.map((r) => [r.file, r.count]), [["a.html", 2]]);
  // today's label set is never checked: its pages are today's
  assert.doesNotThrow(() => buildPages({ brand: LEG }));
});

test("BRAND=citycoin: the head and the layout carry the Citycoin.dev assets, and every asset they name exists", () => {
  for (const [f, html] of cc) {
    assert.match(html, /^<!doctype html>\n<!-- Generated by [^\n]*\n<html lang="en" data-brand="citycoin" data-brand-name="Citycoin\.dev" data-brand-domain="Citycoin\.dev" data-terms="2026-10-25">\n/, f);
    assert.match(html, /<meta name="theme-color" content="#071426">/, f);
    assert.match(html, /<meta property="og:site_name" content="Citycoin\.dev">/, f);
    assert.match(html, /<meta name="twitter:card" content="summary">/, `${f}: no social image while SITE_ORIGIN names today's host`);
    assert.doesNotMatch(html, /og:image|twitter:image/, f);
    for (const l of LOOKS.citycoin.icons) assert.ok(html.includes(`  ${l}\n`), `${f}: ${l}`);
    assert.doesNotMatch(html, /href="\/favicon\.svg"|src="\/logo\.svg"/, `${f}: the old pin is gone`);
    assert.match(html, /<link rel="stylesheet" href="\/brand\/citycoin\.css">\n  <script src="\/theme\.js"><\/script>/, `${f}: the brand stylesheet loads last`);
    assert.match(html, /<a class="brand" href="\/" aria-label="Citycoin\.dev home">\n {8}<img class="brand__lockup brand__lockup--dark" src="\/brand\/citycoin-lockup-dark\.svg" alt="" width="149" height="28">\n {8}<img class="brand__lockup brand__lockup--light" src="\/brand\/citycoin-lockup\.svg" alt="" width="157" height="28">\n {6}<\/a>/, f);
    assert.match(html, /<p class="site-footer__copy"><img src="\/brand\/favicon\.svg" alt="" width="20" height="20"> Citycoin\.dev © 2026\. All rights reserved\.<\/p>/, f);
    assert.match(html, /<p class="site-footer__safe">Citycoin\.dev never asks for your recovery phrase or private key\.<\/p>/, f);
    for (const m of html.matchAll(/(?:src|href)="\/(brand\/[^"#?]+)"/g)) assert.ok(existsSync(new URL(`../public/${m[1]}`, import.meta.url)), `${f}: /${m[1]} exists`);
  }
  // the manifest and the stylesheet the look names
  const manifest = JSON.parse(readFileSync(new URL("../public/brand/citycoin.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "Citycoin.dev");
  assert.equal(manifest.display, "browser", "an installed icon opens the site in the browser: nothing presented as an app");
  for (const i of manifest.icons) assert.ok(existsSync(new URL(`../public${i.src}`, import.meta.url)), i.src);
  const css = readFileSync(new URL("../public/brand/citycoin.css", import.meta.url), "utf8");
  assert.match(css, /:root\[data-brand="citycoin"\] \.cc-off \{ display: none !important; \}/);
  assert.match(css, /:root\[data-brand="citycoin"\] \.tabbar \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
  assert.doesNotMatch(css + JSON.stringify(manifest), /vicinity/i);
  // with BRAND unset no page names any of it
  for (const f of sources) assert.doesNotMatch(committed(f).toString("utf8"), /\/brand\/|data-brand|og:site_name|twitter:/, f);
});

test("BRAND=citycoin: <html> carries the label set the client scripts read (area b), straight from src/brand.js and escaped", () => {
  // the scripts' brand`…` texts take the product's names from these three attributes only: one source for the labels, src/brand.js
  for (const [f, html] of cc) {
    const tag = html.match(/<html [^>]*>/)[0];
    const attr = (k) => { const m = tag.match(new RegExp(` ${k}="([^"]*)"`)); return m ? m[1] : null; };
    assert.deepEqual([attr("data-brand"), attr("data-brand-name"), attr("data-brand-domain")], [CC.key, CC.productName, CC.domain], f);
  }
  // a label set with markup in its names: escaped like every other label the layout writes
  const odd = { ...CC, productName: 'Zq "<b>&', domain: "Zq<i>" };
  const tag = new Map(buildPages({ brand: odd, allowResidue: true })).get("token.html").match(/<html [^>]*>/)[0];
  assert.equal(tag, '<html lang="en" data-brand="citycoin" data-brand-name="Zq &quot;&lt;b&gt;&amp;" data-brand-domain="Zq&lt;i&gt;" data-terms="2026-10-25">');
  // today's pages: none of the three, so every script shows its own words exactly as written
  for (const f of sources) assert.match(committed(f).toString("utf8"), /^<!doctype html>\n<!-- Generated by [^\n]*\n<html lang="en">\n/, f);
});

test("BRAND=citycoin: the social image is written only once SITE_ORIGIN names a host other than today's (a clearly fake fixture host)", () => {
  const fixture = siteConfig({ SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://example.test" });
  const home = new Map(buildPages({ brand: CC, site: fixture })).get("index.html");
  assert.match(home, /<meta property="og:image" content="https:\/\/example\.test\/brand\/og-default-1200x630\.png">\n  <meta property="og:image:width" content="1200">\n  <meta property="og:image:height" content="630">\n  <meta property="og:image:alt" content="Citycoin\.dev logo">/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(home, /<meta name="twitter:image" content="https:\/\/example\.test\/brand\/og-default-1200x630\.png">/);
  for (const site of [siteConfig({}), siteConfig({ SITE_ORIGIN: "https://www.vicinity.city", SITE_ORIGINS: "https://www.vicinity.city" })]) {
    assert.doesNotMatch(new Map(buildPages({ brand: CC, site })).get("index.html"), /og:image/, site.origin);
  }
});

test("BRAND=citycoin: nothing of the main token shows while it is not live: no Token tab, no social account, no address; the link checker is on /official", () => {
  // the legacy token's own addresses (its mint, the team's lock and wallets) are on no page; the fee wallet stays, under Fees
  const legacyGroups = officialAddresses(deployedVars(), false).filter((g) => g.id === "vicinity" || g.id === "team");
  const fee = new Set(officialAddresses(deployedVars(), false).filter((g) => g.id === "fees").flatMap((g) => g.rows.map((r) => r.address)));
  const legacyAddresses = [LEGACY_MINT, ...legacyGroups.flatMap((g) => g.rows.map((r) => r.address))].filter((a) => !fee.has(a));
  assert.ok(legacyAddresses.length >= 2, "the check is real: the legacy mint and the team lock at least");
  for (const [f, html] of cc) {
    const tabbar = html.slice(html.indexOf('<nav class="tabbar"'), html.indexOf("</nav>", html.indexOf('<nav class="tabbar"')));
    assert.equal((tabbar.match(/<a href=/g) || []).length, 4, `${f}: four tabs`);
    assert.doesNotMatch(tabbar, /href="\/token"/, f);
    // "Check a link" opens the checker on /official (review finding F9): /token is the plain "not live yet" page there
    assert.match(html, /<nav class="site-footer__links" aria-label="Legal and data">\n {8}<a href="\/terms">Terms<\/a><a href="\/rules">Rules<\/a><a href="\/official">Official addresses<\/a><a href="\/credits">Data<\/a><a href="\/official#check">Check a link<\/a>\n {6}<\/nav>/, f);
    assert.doesNotMatch(html, /site-footer__social|x\.com\/|twitter\.com\/|t\.me\//, `${f}: no official account is shown before the main-token switch verifies one (amendment 01 section 4.4)`);
    assert.doesNotMatch(html, /\$VICINITY/, f);
    for (const a of legacyAddresses) assert.ok(!html.includes(a), `${f}: ${a}`);
  }
  // wrangler.jsonc configures OFFICIAL_X_URL (main ec1e838) with an incomplete verification record: not shown by this switch
  assert.equal(deployedVars().OFFICIAL_X_URL, "https://x.com/CityCoinDev");
  assert.deepEqual(pageSocials(deployedVars(), CC), [], "no official account before the main-token switch (amendment 01 section 4.4): none under the Citycoin.dev brand");
  // the checker itself is on /official, in that label set only
  const official = cc.get("official.html");
  assert.match(official, /<section class="credits__group" id="check" aria-labelledby="off-link-check">/);
  assert.match(official, /<form class="checker card" id="checker" novalidate>/);
  assert.match(official, /<script src="\/official\.js" defer><\/script>/);
  assert.doesNotMatch(committed("official.html").toString("utf8"), /id="checker"/, "today's /official: no checker (it is on /token)");
  assert.equal(pageSocials(deployedVars(), LEG), SOCIAL_PROFILES, "today's brand: today's footer");
  // /token answers a plain page: no token script, no Buy panel, no holders, the honest line
  const token = cc.get("token.html");
  assert.match(token, /<title>Token · Citycoin\.dev<\/title>/);
  assert.match(token, /<h1 class="notfound__title">The Citycoin\.dev token is not live yet\.<\/h1>/);
  assert.match(token, /There is no official token address, price or Buy button yet\./);
  assert.deepEqual([...token.matchAll(/<script src="\/([^"]+)\.js"/g)].map((m) => m[1]), ["theme", "site", "feedback"]);
  assert.doesNotMatch(token, /data-address|data-copy|id="holders"|swap|buy-slot/i);
  // the parts of the dashboard, the connect page and the profile that belong to the main token stay in the markup (their scripts find
  // their elements) but carry .cc-off, which public/brand/citycoin.css hides whatever a script does
  const dash = cc.get("dashboard.html"), off = (html, re) => assert.match(html, re);
  off(dash, /<section class="standing cc-off" id="standing"/);
  off(dash, /<section class="card trade cc-off" id="trade"/);
  off(dash, /<section class="card rk cc-off" id="rankings-card"/);
  off(dash, /<a class="btn btn--primary btn--sm cc-off" id="wt-buy"/);
  off(dash, /The Citycoin\.dev token is not live yet, so there are no rankings yet\./);
  off(cc.get("connect.html"), /<a class="alt cc-off" href="\/token#verify" id="alt-check">/);
  off(cc.get("profile.html"), /<section class="card prof-hold cc-off"/);
  // every link to /token that is not hidden lands on the plain page above
  for (const [f, html] of cc) for (const m of html.matchAll(/<a [^>]*href="\/token[^"]*"[^>]*>/g)) {
    const hidden = /cc-off/.test(m[0]) || /cc-off/.test(html.slice(html.lastIndexOf("<section", m.index), m.index).split("\n")[0]);
    if (!hidden) assert.ok(cc.has("token.html"), `${f}: ${m[0]}`);
  }
});

test("BRAND=citycoin: the footers show no account before the main-token switch, even a configured one; with the switch, only the configured ones (clearly fake fixtures), never the former one", () => {
  const FX = "https://x.com/ZqFakeTestX", FT = "https://t.me/ZqFakeTestGroup";
  const vars = { ...deployedVars(), OFFICIAL_X_URL: FX, OFFICIAL_TELEGRAM_URL: FT };
  assert.deepEqual(pageSocials(vars, CC), [], "configured, but not verified by a switch yet (amendment 01 sections 4.3 and 4.4)");
  // the switch's footers (MAIN_TOKEN_V5 counting: src/official.js socialProfiles with the switch on), as a test stand-in
  const socials = socialProfiles(vars, true);
  assert.deepEqual(socials.map((p) => [p.network, p.handle, p.url]), [["X", "@ZqFakeTestX", FX], ["Telegram", "@ZqFakeTestGroup", FT]]);
  assert.equal(pageSocials(vars, LEG), SOCIAL_PROFILES, "today's brand: today's footer, whatever the new settings hold (they count only with the switch there)");
  assert.deepEqual(pageSocials({ ...deployedVars(), OFFICIAL_X_URL: "https://x.com/VicinityCitySOL" }, CC), [], "the former account as the new link is refused");
  const pages = all({ brand: CC, socials });
  for (const [f, html] of pages) {
    assert.match(html, new RegExp(`<a class="social-link" href="${FX}" target="_blank" rel="noopener me" aria-label="Citycoin\\.dev on X \\(@ZqFakeTestX\\), opens in a new tab">`), f);
    assert.match(html, new RegExp(`<a class="social-link" href="${FT}" target="_blank" rel="noopener me" aria-label="Citycoin\\.dev on Telegram \\(@ZqFakeTestGroup\\), opens in a new tab">`), f);
    assert.doesNotMatch(html, /vicinity/i, f);
  }
});

test("BRAND=citycoin: every internal link and asset of every page answers (a page, a public file or a Worker route)", () => {
  const routes = new Set([...sources.map((f) => (f === "index.html" ? "/" : `/${f.replace(/\.html$/, "")}`)), "/404"]);
  for (const [f, html] of cc) {
    for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      const path = m[1].split(/[?#]/)[0];
      if (routes.has(path) || /^\/api\/|^\/coin-meta\/|^\/official-coins\.csv$/.test(path)) continue;
      assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)) || (path.startsWith("/fonts/") || path.startsWith("/vendor/")), `${f}: ${m[1]} answers`);
    }
  }
  assert.ok(PAGE_FILES.has("token.html"), "/token keeps answering (a page, never a 500)");
});

test("BRAND=citycoin: /official lists the deployed programs, the fee wallet and the curve settings, not the legacy token's groups", () => {
  const groups = [
    { id: "programs", title: "Programs", rows: [{ label: "Launchpad program", address: "A", note: "vicinity_launchpad. It creates every official city coin." }, { label: "Rewards program", address: "B", note: "vicinity_rewards." }] },
    { id: "fees", title: "Fees", rows: [{ label: "Fee wallet", address: "C", note: "Vicinity's share of city-coin fees goes to this wallet. It is also the team's public wallet, listed under Team." }] },
    { id: "vicinity", title: "$VICINITY", rows: [{ label: "$VICINITY token", address: "D", note: "x" }] },
    { id: "team", title: "Team", rows: [{ label: "Team lock", address: "E", note: "60,000,000 $VICINITY locked" }] },
    // MAIN_TOKEN_V5's legacy group (src/official.js mainTokenAddressGroups; area d): the legacy token is shown nowhere under another label set
    { id: "legacy", title: "Legacy", rows: [{ label: "$VICINITY (legacy token)", address: "F", note: "History only." }] },
  ];
  assert.equal(brandAddressGroups(groups, LEG), groups, "today's label set: as they are");
  const out = brandAddressGroups(groups, CC);
  assert.deepEqual(out.map((g) => g.id), ["programs", "fees"]);
  assert.deepEqual(out.flatMap((g) => g.rows.map((r) => [r.address, r.note])), [["A", "It creates every official city coin."], ["B", null], ["C", "Citycoin.dev's share of city-coin fees goes to this wallet."]]);
  const page = cc.get("official.html");
  assert.match(page, /<h2 class="credits__h" id="off-programs">Programs<\/h2>/);
  assert.doesNotMatch(page, /off-team|off-vicinity|Team lock|60,000,000/);
});

test("BRAND=citycoin: the Terms and the Rules change only the name, except the clauses recorded for the owner", () => {
  // compared with today's label set built the same way: with the legacy seat freeze, which a Citycoin.dev build always has (its own changes
  // to the Rules are S16's frozen copy, tested in test/legacy-seats-copy.test.js and recorded for the owner with these)
  const legacy = new Map(all({ brand: LEG, legacySeats: "frozen" }));
  const decode = (t) => t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const blocks = (html) => [...html.slice(html.indexOf('<main id="main"'), html.indexOf("</main>")).matchAll(/<(p|li|h[1-6]|summary|dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => decode(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()).filter(Boolean);
  const swap = (t) => t.replace(/\$VICINITY/g, "Citycoin.dev token").replace(/vicinity\.city/g, "Citycoin.dev").replace(/Vicinity/g, "Citycoin.dev");
  const norm = (t) => t.replace(/Citycoin\.dev tokens\b/g, "Citycoin.dev token");
  // (and the edition line of each: the Citycoin.dev Rules are version 7 and its Terms version 2026-10-25, both in effect since 25 Oct 2026,
  // src/editions.js; owner decision 2, the owner's go of 25 Oct 2026)
  const EXCEPTIONS = {
    "terms.html": [/^Updated October 25, 2026 · Version 2026-10-25$/, /use of the Citycoin\.dev website and all related pages.*through the Feedback and support form on the Website to any person/, /contact us through the Feedback and support form on the Website with a description of the material/,
      /Informal resolution\. .*contacting us through the Feedback and support form on the Website/, /^Questions about these Terms or the Services: contact us through the Feedback and support form on the Website\.$/],
    // (the tie-break formula, whose seat prefix was a clause for the owner, is not on the frozen Rules: S16's copy removes the scoring)
    "rules.html": [/^Rules & fairness · version 7 · in effect since 2026-10-25$/],
  };
  for (const f of ["terms.html", "rules.html"]) {
    const a = blocks(legacy.get(f)), b = blocks(cc.get(f));
    assert.equal(a.length, b.length, `${f}: the same blocks`);
    const beyond = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x !== y && norm(swap(x)) !== norm(y));
    assert.equal(beyond.length, EXCEPTIONS[f].length, `${f}: ${JSON.stringify(beyond.map(([, y]) => y.slice(0, 80)))}`);
    beyond.forEach(([, y], i) => assert.match(y, EXCEPTIONS[f][i], f));
    assert.ok(a.some((x, i) => x !== b[i]), `${f}: the name does change`);
  }
  const tl = cc.get("terms.html");
  assert.match(tl, /<title>Terms of Use · Citycoin\.dev<\/title>/);
  assert.match(tl, /<p><strong>By using Citycoin\.dev you agree to these Terms\.<\/strong><\/p>/);
});

test("BRAND=citycoin: the page build records it, and the main-token switch is still refused under it (MAIN_TOKEN_PAGES)", () => {
  // the brand's prerequisites (pageBrandPrerequisites; review findings F3 and F7), with a clearly fake sender address
  const vars = { ...deployedVars(), BRAND: "citycoin", LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production", EMAIL_FROM: "Citycoin.dev <noreply@example.com>",
    WALLET_ONLY: "on", SITE_ORIGIN: "https://citycoin.dev", SITE_ORIGINS: "https://citycoin.dev https://vicinity.city" };
  assert.match(pagesBuiltSource(vars), /export const PAGES_BUILT = Object\.freeze\(\{ mainTokenV5: false, brand: "citycoin", pagesReachWorker: false, legacySeats: "frozen", walletOnly: true \}\);/);
  assert.equal(MAIN_TOKEN_PAGES, false);
  assert.throws(() => pageSocials({ ...vars, MAIN_TOKEN_V5: "on" }), /MAIN_TOKEN_V5=on in wrangler\.jsonc/);
  // the Worker's reading follows that record (src/brand.js): with it, the Citycoin.dev labels; without it, today's
  assert.equal(brandOf({ BRAND: "citycoin" }, { brand: "citycoin" }).productName, "Citycoin.dev");
  assert.equal(brandOf({ BRAND: "citycoin" }).productName, "Vicinity");
});

test("the legacy seat freeze (stage S16): unset in wrangler.jsonc, every page and src/pages-built.js are today's bytes; the shell never reaches it", () => {
  assert.equal(Object.hasOwn(deployedVars(), "LEGACY_SEATS"), false, "LEGACY_SEATS is not set in wrangler.jsonc");
  assert.deepEqual(pageLegacySeats(), { legacySeats: "on" });
  sameBytes(all(), "default build");
  sameBytes(all({ legacySeats: "on" }), "legacySeats on");
  const before = process.env.LEGACY_SEATS;
  process.env.LEGACY_SEATS = "frozen";
  try { sameBytes(all(), "LEGACY_SEATS=frozen set in the shell only"); } finally { if (before === undefined) delete process.env.LEGACY_SEATS; else process.env.LEGACY_SEATS = before; }
  // the record the Worker reads: the same four lines as before the freeze existed (the key is written only for pages built frozen)
  const file = readFileSync(PAGES_BUILT_FILE, "utf8");
  assert.equal(file, pagesBuiltSource());
  assert.equal(file, [
    "// Written by scripts/pages/build.mjs from the settings of wrangler.jsonc; do not edit (test/build-parity.test.js checks it).",
    "// What the deployed pages in public/ were built with, and whether wrangler.jsonc sends them through the Worker (run_worker_first true).",
    "// src/v5policy.js counts MAIN_TOKEN_V5 only when mainTokenV5 is true here, and HOST_REDIRECT only when pagesReachWorker is true.",
    "export const PAGES_BUILT = Object.freeze({ mainTokenV5: false, brand: \"\", pagesReachWorker: false });",
    "",
  ].join("\n"));
  // frozen, only the pages the frozen copy names change (the others stay today's bytes); an unknown value never builds
  const frozen = all({ legacySeats: "frozen" });
  for (const [f, html] of frozen) assert.equal(Buffer.from(html, "utf8").equals(committed(f)), !Object.hasOwn(FROZEN_COPY, f), f);
  assert.throws(() => buildPages({ legacySeats: "maybe" }), /legacySeats must be "on" or "frozen"/);
});
