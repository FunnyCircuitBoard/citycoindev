// The brand and site adapters (Citycoin.dev master v5, stage S02): src/site-config.js (SITE_ORIGIN, SITE_ORIGINS) and src/brand.js
// (BRAND). Unset, both give today's values byte for byte, and the Worker call sites that read them answer exactly as before.
// The label migration (stage S48) adds BRAND=citycoin, the Citycoin.dev label set; the Worker counts it only while the deployed pages were
// built with it (src/pages-built.js), so a BRAND set only in the Cloudflare dashboard renames nothing.
// Every non-default site value here is a clearly fake fixture (example.test, example.org); none is a real Citycoin.dev setting.
// The client scripts (area b of the label migration): they read the product's names from the page's own <html> (the page build writes
// them from src/brand.js), so today's pages show every text exactly as before and a page built with BRAND=citycoin names Citycoin.dev.
// The Worker's words (area c): e-mails, the wallet statements, API messages and notices, new coins' metadata and picture, admin texts, all
// through src/brandwords.js; today's label set gives every one exactly as before (test/build-parity.test.js pins them against c5df86a).
// The legacy token (area d): under BRAND=citycoin $VICINITY is shown nowhere (no token page, Buy, holders, team lock or wallets, contract
// card, balance, portfolio entry or old social account); without a verified main token no token is live, with one (MAIN_TOKEN_V5) the S02A
// path shows it instead. Today's label set keeps every answer (test/build-parity.test.js pins them against c5df86a too).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import worker from "../src/index.js";
import { DEFAULT_SITE, DEFAULT_SITE_ORIGIN, LEGACY_FORWARD_HOSTS, USER_AGENT, isAcceptedHost, isForwardHost, normalizeOrigin, siteConfig, userAgent } from "../src/site-config.js";
import { BRANDS, CITYCOIN_BRAND, LEGACY_BRAND, brandFromSettings, brandLabels, brandOf } from "../src/brand.js";
import { PAGES_BUILT } from "../src/pages-built.js";
import { ehloName, emailConfigured, googleAddedEmail, sendMail, sendViaResend, senderShowsOldName, verificationEmail, walletLinkedEmail } from "../src/mail.js";
import { SAME, brandWords, siteOrigin, statementName, statementNames, wordsOf } from "../src/brandwords.js";
import { _pagesBuiltForTests } from "../src/v5policy.js";
import { MESSAGE_STATEMENT, buildMessage, messageStatement, parseMessage, statementFor } from "../src/solana.js";
import { VICINITY_BRAND, coinImageUrl, coinMetadataJson, metaBrand, metaBrandFor, versionJson } from "../src/coinmeta.js";
import { TEMPLATES, templateFor } from "../src/coinart.js";
import { templateOf } from "../src/coinready.js";
import { DEFAULT_GATES, SOURCE, coinDefaults } from "../src/coindefaults.js";
import { GATES } from "../src/coinready.js";
import { REASONS } from "../src/coinreview.js";
import { LEGACY_REJECTED } from "../src/coins.js";
import { SYSTEM_TEXT_LAUNCHED } from "../src/cointakedown.js";
import { LP_VENUE, NO_CHART, NO_TRADES } from "../src/lpcoins.js";
import { ATTRIBUTION, attributionFor } from "../src/marketlive.js";
import { MESSAGES, explain } from "../src/screen.js";
import { LEGACY_NEVER, POLICY } from "../src/policy.js";
import { badgesFor } from "../src/me.js";
import { committedIsToday } from "./helpers/today-build.mjs";
import { OFFICIAL, SOCIAL_PROFILES as SOCIAL_PROFILES_TODAY, checkOfficial, configuredSocialProfiles, legacyHidden, mainCacheTag, socialProfiles, tokenMint, withMint } from "../src/official.js";
import { _resetPortfolio, mintsFor } from "../src/portfolio.js";
import { supportedAssets } from "../src/walletsend.js";
import { _resetSwap } from "../src/swap.js";
import { _resetLaunchpad } from "../src/launchpad.js";
import { _resetCoin } from "../src/coin.js";
import { dayKey, latestBalances, ledgerStatus, maybeSample, tenure } from "../src/ledger.js";
import { isSolanaAddress } from "../src/solana.js";
import { providers } from "../src/auth.js";
import { USER_AGENT as SOURCES_USER_AGENT } from "../src/sources.js";
import { buildPages, buildStandalonePages } from "../scripts/pages/build.mjs";
import { brandTexts, lex, scanServer, scanVicinity } from "./helpers/brandscan.js";
import { memberMe, openDashboard } from "./helpers/dashpage.js";
import { openConnect } from "./helpers/connectpage.js";
import { openPage } from "./helpers/pagedom.js";
import * as W from "./helpers/world.js";
import { ACCEPTED } from "./helpers/mainswitch.js";
import { CHECK_INPUTS, LEGACY_MINT } from "./helpers/legacyprobe.js";
// src/lpbatch.js (COIN_V2_BATCH) is deleted by stage S23: read only while it exists, so whichever of the two merges second needs no change here
const { CHECKS = null } = existsSync(new URL("../src/lpbatch.js", import.meta.url)) ? await import("../src/lpbatch.js") : {};

/* ---------------------------------------------------------------- src/site-config.js */
test("site config unset is today's hard-coded values", () => {
  for (const env of [undefined, {}, { SITE_ORIGIN: "" }, { SITE_ORIGIN: "  ", SITE_ORIGINS: "" }, { SITE_ORIGINS: [] }]) {
    const s = siteConfig(env);
    assert.equal(s, DEFAULT_SITE);
    assert.equal(s.origin, "https://vicinity.city");
    assert.equal(s.host, "vicinity.city");
    assert.deepEqual([...s.origins], ["https://vicinity.city"]);
    assert.deepEqual([...s.hosts], ["vicinity.city"]);
    assert.deepEqual([...s.forwardHosts], ["www.vicinity.city", "vicinitycity.net", "www.vicinitycity.net"]);
    assert.equal(s.configured, false);
    assert.deepEqual([...s.problems], []);
  }
  assert.equal(DEFAULT_SITE_ORIGIN, "https://vicinity.city");
  assert.deepEqual([...LEGACY_FORWARD_HOSTS], ["www.vicinity.city", "vicinitycity.net", "www.vicinitycity.net"]);
  assert.ok(Object.isFrozen(DEFAULT_SITE) && Object.isFrozen(DEFAULT_SITE.origins) && Object.isFrozen(DEFAULT_SITE.forwardHosts));
});

test("site config: a valid setting is used whole", () => {
  const s = siteConfig({ SITE_ORIGINS: "https://vicinity.city, https://example.test" });
  assert.equal(s.origin, "https://vicinity.city", "SITE_ORIGIN unset keeps today's canonical origin");
  assert.deepEqual([...s.hosts], ["vicinity.city", "example.test"]);
  assert.equal(s.configured, true);
  const t = siteConfig({ SITE_ORIGIN: "https://Example.Test", SITE_ORIGINS: ["https://example.test", "https://vicinity.city", "https://www.vicinity.city"] });
  assert.equal(t.origin, "https://example.test");
  assert.equal(t.host, "example.test");
  assert.deepEqual([...t.forwardHosts], ["vicinitycity.net", "www.vicinitycity.net"], "a host served in place is never forwarded");
  assert.ok(isAcceptedHost(t, "WWW.vicinity.city") && !isForwardHost(t, "www.vicinity.city"));
  assert.ok(!isAcceptedHost(t, "evil-example.test") && !isAcceptedHost(t, "x.example.test"), "exact host match, never a suffix");
});

test("site config: anything malformed falls back to today's values whole and names the refusal", () => {
  const cases = [
    [{ SITE_ORIGIN: "http://example.test", SITE_ORIGINS: "http://example.test" }, ["SITE_ORIGIN_INVALID", "SITE_ORIGINS_INVALID"]],
    [{ SITE_ORIGIN: "https://example.test/" }, ["SITE_ORIGIN_INVALID"]],
    [{ SITE_ORIGIN: "https://example.test" }, ["SITE_ORIGIN_NOT_ALLOWED"]],
    [{ SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://vicinity.city" }, ["SITE_ORIGIN_NOT_ALLOWED"]],
    [{ SITE_ORIGINS: "https://vicinity.city https://example.test/path" }, ["SITE_ORIGINS_INVALID"]],
    [{ SITE_ORIGINS: "https://vicinity.city,https://example.test:8443" }, ["SITE_ORIGINS_INVALID"]],
    [{ SITE_ORIGINS: ["https://vicinity.city", 42] }, ["SITE_ORIGINS_INVALID"]],
    [{ SITE_ORIGIN: "https://user@example.test", SITE_ORIGINS: "https://example.test" }, ["SITE_ORIGIN_INVALID"]],
    [{ SITE_ORIGIN: "https://localhost", SITE_ORIGINS: "https://localhost" }, ["SITE_ORIGIN_INVALID", "SITE_ORIGINS_INVALID"]],
  ];
  for (const [env, problems] of cases) {
    const s = siteConfig(env);
    assert.deepEqual([...s.problems], problems, JSON.stringify(env));
    assert.equal(s.configured, false);
    for (const k of ["origin", "host"]) assert.equal(s[k], DEFAULT_SITE[k], `${JSON.stringify(env)} ${k}`);
    for (const k of ["origins", "hosts", "forwardHosts"]) assert.deepEqual([...s[k]], [...DEFAULT_SITE[k]], `${JSON.stringify(env)} ${k}`);
  }
  for (const bad of ["https://exa mple.test", "https://example.test?x=1", "https://example.test#x", "https://-x.example", "ftp://example.test", "https://", "https://example", null, 7])
    assert.equal(normalizeOrigin(bad), null, String(bad));
});

test("site config never reads a request: it takes the environment only", () => {
  const src = readFileSync(new URL("../src/site-config.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\brequest\b|headers|\.get\(\s*["']host["']/i);
  assert.equal(siteConfig({ HOST: "evil.example", host: "evil.example" }), DEFAULT_SITE, "no setting named like a header changes it");
});

test("the User-Agent the Worker sends is today's, from src/site-config.js", () => {
  assert.equal(USER_AGENT, "vicinity.city/1.0 (+https://vicinity.city)");
  assert.equal(SOURCES_USER_AGENT, USER_AGENT);
  assert.equal(userAgent(), USER_AGENT);
  assert.equal(userAgent(siteConfig({ SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://example.test" })), "example.test/1.0 (+https://example.test)");
  const swap = readFileSync(new URL("../src/swap.js", import.meta.url), "utf8");
  assert.match(swap, /"user-agent": USER_AGENT,/);
  assert.doesNotMatch(swap, /vicinity\.city\/1\.0/, "no second copy of the agent string");
});

test("the old-name redirect: unset settings answer exactly as before; the target is today's host, never the request or SITE_ORIGIN", async () => {
  const go = async (url, env = {}) => { const r = await worker.fetch(new Request(url), env); return [r.status, r.headers.get("location"), r.headers.get("cache-control")]; };
  for (const host of LEGACY_FORWARD_HOSTS) {
    assert.deepEqual(await go(`https://${host}/a/b?c=1`), [301, "https://vicinity.city/a/b?c=1", "public, max-age=3600"]);
    assert.deepEqual(await go(`https://${host}/a`, { SITE_ORIGIN: "nonsense" }), [301, "https://vicinity.city/a", "public, max-age=3600"], "a malformed setting changes nothing");
  }
  assert.equal((await go("https://evil.example/api/health"))[0], 200, "an unknown host is served in place as today, never a redirect target");
  // a fixture configuration (clearly fake): SITE_ORIGIN alone never makes the permanent redirect cross domains (that is HOST_REDIRECT's,
  // stage S03, with its own policy check), so the old names forward to vicinity.city, and only while vicinity.city itself is served in place
  // (stage S55, src/site-config.js servesLegacy: until S55 this fixture, which lists www.vicinity.city but not vicinity.city, still forwarded
  // vicinitycity.net there; now it refuses it, 421 with no Location, never a redirect anywhere); a host listed in SITE_ORIGINS is served in place
  const env = { SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://example.test https://www.vicinity.city" };
  assert.deepEqual(await go("https://vicinitycity.net/x", env), [421, null, "no-store"], "vicinity.city not served: its old names are not forwarded to it");
  assert.deepEqual(await go("https://vicinitycity.net/x", { ...env, SITE_ORIGINS: "https://example.test https://www.vicinity.city https://vicinity.city" }), [301, "https://vicinity.city/x", "public, max-age=3600"]);
  assert.deepEqual(await go("http://www.vicinity.city/x?y=1", { SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://example.test https://vicinity.city" }),
    [301, "https://vicinity.city/x?y=1", "public, max-age=3600"], "the review's case: not a 301 to the configured origin");
  assert.deepEqual(await go("https://vicinitycity.net/x", { SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://example.test https://vicinity.city", HOST_REDIRECT: "on", DEPLOYMENT_ENV: "test" }),
    [301, "https://vicinity.city/x", "public, max-age=3600"], "not even with HOST_REDIRECT set: the configured target is stage S03's");
  assert.equal((await go("https://www.vicinity.city/api/health", env))[0], 200);
});

/* ---------------------------------------------------------------- src/brand.js */
test("BRAND unset is today's label set; an unknown value keeps it and names the refusal", () => {
  assert.deepEqual(Object.keys(BRANDS), ["", "citycoin"]);
  assert.deepEqual({ ...LEGACY_BRAND }, { key: "", productName: "Vicinity", shortName: "Vicinity", domain: "vicinity.city", siteLabel: "Vicinity.city", senderName: "Vicinity", tagline: "One city. One coin. One community." });
  assert.ok(Object.isFrozen(LEGACY_BRAND) && Object.isFrozen(BRANDS) && Object.isFrozen(CITYCOIN_BRAND));
  for (const env of [undefined, {}, { BRAND: "" }, { BRAND: "  " }, { BRAND: null }]) {
    for (const b of [brandOf(env), brandFromSettings(env)]) {
      assert.equal(b.problem, null);
      assert.equal(b.value, "");
      for (const k of Object.keys(LEGACY_BRAND)) assert.equal(b[k], LEGACY_BRAND[k]);
    }
  }
  for (const BRAND of ["citycoin.dev", "vicinity", "constructor", "toString", "__proto__", "hasOwnProperty"]) {
    for (const b of [brandOf({ BRAND }), brandOf({ BRAND }, { brand: BRAND }), brandFromSettings({ BRAND })]) {
      assert.equal(b.problem, "BRAND_UNKNOWN", BRAND);
      assert.equal(b.senderName, "Vicinity");
      assert.equal(b.productName, "Vicinity");
    }
  }
});

test("BRAND=citycoin is the Citycoin.dev label set: no visible label names vicinity, and none is a host to open", () => {
  assert.deepEqual({ ...CITYCOIN_BRAND }, { key: "citycoin", productName: "Citycoin.dev", shortName: "Citycoin", domain: "Citycoin.dev", siteLabel: "Citycoin.dev", senderName: "Citycoin.dev", tagline: "One city. One coin. One community." });
  assert.equal(BRANDS.citycoin, CITYCOIN_BRAND);
  for (const BRAND of ["citycoin", " CITYCOIN ", "CityCoin"]) {
    const b = brandFromSettings({ BRAND });
    assert.equal(b.problem, null, BRAND);
    assert.equal(b.value, "citycoin");
    for (const k of Object.keys(CITYCOIN_BRAND)) assert.equal(b[k], CITYCOIN_BRAND[k], k);
  }
  const L = brandLabels(CITYCOIN_BRAND);
  const words = [...Object.values(CITYCOIN_BRAND), L.homeTitle, L.pageTitle("Rules"), L.homeLink, L.headerName, L.copyright, L.socialList, L.socialLink("X", "@example"), L.safety];
  for (const w of words) {
    assert.doesNotMatch(w, /vicinity/i, w);
    assert.doesNotMatch(w, /citycoin\.dev\//, `${w}: never an address to open (citycoin.dev does not serve the site yet)`);
  }
  assert.equal(L.homeTitle, "Citycoin.dev — One city. One coin. One community.");
  assert.equal(L.copyright, "Citycoin.dev © 2026. All rights reserved.");
  assert.equal(L.safety, "Citycoin.dev never asks for your recovery phrase or private key.");
});

test("the Worker's reading of BRAND follows the deployed pages: the Citycoin.dev labels only with pages built for them (src/pages-built.js), and with those pages whatever BRAND says (F12)", () => {
  // today's build record: brand "" (BRAND is not set in wrangler.jsonc; a committed build of the switch is stood in for by today's one,
  // test/helpers/today-build.mjs, and checked against its wrangler.jsonc by test/build-parity.test.js)
  if (committedIsToday) assert.equal(PAGES_BUILT.brand, "");
  for (const BRAND of ["citycoin", " CityCoin "]) {
    const b = brandOf({ BRAND });
    assert.equal(b.problem, "BRAND_PAGES_MISMATCH", "a BRAND set only in the Cloudflare dashboard renames nothing");
    assert.equal(b.value, "citycoin");
    for (const k of Object.keys(LEGACY_BRAND).filter((x) => x !== "key")) assert.equal(b[k], LEGACY_BRAND[k], k);
  }
  // a build made with BRAND=citycoin (a stand-in record): the Worker then speaks Citycoin.dev, and BRAND unset is the mismatch
  const built = { mainTokenV5: false, brand: "citycoin", pagesReachWorker: false };
  const b = brandOf({ BRAND: "citycoin" }, built);
  assert.equal(b.problem, null);
  assert.equal(b.productName, "Citycoin.dev");
  assert.equal(b.senderName, "Citycoin.dev");
  // review finding F12: pages built with the Citycoin.dev labels and a Worker setting that differs (removed in the dashboard, a typo) keep
  // the pages' label set, never today's words and the legacy token's data inside pages that show neither; the refusal is still named
  for (const env of [{}, { BRAND: "" }, { BRAND: "other" }]) {
    const unset = brandOf(env, built);
    assert.equal(unset.problem, env.BRAND === "other" ? "BRAND_UNKNOWN" : "BRAND_PAGES_MISMATCH");
    assert.equal(unset.productName, "Citycoin.dev", "the pages' label set");
    assert.equal(unset.key, "citycoin");
  }
  // the page build reads the setting itself (it writes the record): BRAND=citycoin is accepted whatever the last record says
  assert.equal(brandFromSettings({ BRAND: "citycoin" }).problem, null);
});

test("the mail sender keeps today's display name and address while BRAND is unset", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); };
  await sendViaResend({ RESEND_API_KEY: "rk-test" }, { to: "a@example.org", subject: "s", text: "t" }, fetchImpl);
  // BRAND=citycoin without pages built for it (today's src/pages-built.js): src/brand.js brandOf fails closed to today's sender
  await sendViaResend({ RESEND_API_KEY: "rk-test", BRAND: "citycoin" }, { to: "a@example.org", subject: "s", text: "t" }, fetchImpl);
  await sendViaResend({ RESEND_API_KEY: "rk-test", EMAIL_FROM: "Fixture <noreply@example.org>" }, { to: "a@example.org", subject: "s", text: "t" }, fetchImpl);
  assert.deepEqual(sent.map((b) => b.from), ["Vicinity <noreply@vicinity.city>", "Vicinity <noreply@vicinity.city>", "Fixture <noreply@example.org>"]);
  const mail = readFileSync(new URL("../src/mail.js", import.meta.url), "utf8");
  assert.match(mail, /const from = `\$\{brandOf\(env\)\.senderName\} <\$\{user\}>`;/, "the Gmail sender's display name comes from src/brand.js too");
  assert.doesNotMatch(mail, /from: `Vicinity </);
});


/* ---------------------------------------------------------------- the client scripts (label migration, area b) */
const PUBLIC = new URL("../public/", import.meta.url);
const SCRIPTS = readdirSync(PUBLIC).filter((f) => f.endsWith(".js")).sort();
const script = (f) => readFileSync(new URL(f, PUBLIC), "utf8");
const scans = new Map(SCRIPTS.map((f) => [f, scanVicinity(script(f))]));
// the brand helper of a script: its two declarations (BRAND, read from <html>; brand`…`, the tag), as one block of source
const helperOf = (src) => {
  const a = src.indexOf("  const BRAND = (() => {");
  const b = src.indexOf("\n", src.indexOf("  const brand = (s, ...v) =>"));
  return a < 0 || b < 0 ? null : src.slice(a, b + 1);
};
const HELPED = SCRIPTS.filter((f) => helperOf(script(f)));
const HELPER = helperOf(script(HELPED[0]));
// a document as a browser gives it to the script: <html> with these attributes (or a stand-in that is missing parts of it)
const docWith = (attrs) => ({ documentElement: { getAttribute: (k) => (Object.hasOwn(attrs, k) ? attrs[k] : null) } });
// (its answer crosses back from the script's realm as plain data)
const runHelper = (globals, code) => { const r = vm.runInContext(`${HELPER}\n;(${code})`, vm.createContext({ ...globals })); return r === undefined ? r : JSON.parse(JSON.stringify(r)); };
// the attributes of the BRAND=citycoin build's <html> (what a browser hands the scripts on those pages)
const ccPages = new Map([...buildPages({ brand: CITYCOIN_BRAND }), ...buildStandalonePages({ brand: CITYCOIN_BRAND })]);
const CC_ATTRS = Object.fromEntries([...ccPages.get("index.html").match(/<html [^>]*>/)[0].matchAll(/ (data-brand[\w-]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

test("client scripts: one brand helper, the same in every script that names the product, reading only the page's <html>", () => {
  // every script whose words name the product (a brand`…` text or a today's branch of BRAND) carries the helper, byte for byte the same
  for (const f of SCRIPTS) {
    const named = scans.get(f).some((x) => x.kind === "brand" || x.kind === "legacy");
    assert.equal(Boolean(helperOf(script(f))), named, `${f}: the helper exactly where the words need it`);
  }
  assert.ok(HELPED.length >= 20, `the scripts of area b (${HELPED.length})`);
  for (const f of HELPED) assert.equal(helperOf(script(f)), HELPER, `${f}: the canonical helper`);
  // a classic script's top-level functions share no constants: each one that uses BRAND or brand`…` declares the helper itself (a
  // script of several, public/launchpad.js, keeps it in the one that names the product; elsewhere today's page would throw)
  for (const f of SCRIPTS) {
    for (const seg of script(f).split(/\n(?=\((?:async )?\(\) => \{\n)/)) {
      const own = helperOf(seg), rest = own ? seg.replace(own, "") : seg;
      const uses = lex(rest).some((x) => (x.t === "id" && (x.v === "BRAND" || x.v === "brand")) || (x.t === "tpl" && x.tag === "brand"));
      if (uses) assert.ok(own, `${f}: a top-level function uses the brand helper without declaring it: ${seg.slice(0, 80)}…`);
    }
  }
  // it reads the three attributes the page build writes, and nothing else: no fetch, no storage, no label of its own
  assert.deepEqual([...HELPER.matchAll(/at\("([\w-]+)"\)/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i), ["data-brand", "data-brand-name", "data-brand-domain"]);
  assert.match(HELPER, /document\.documentElement/);
  assert.doesNotMatch(HELPER, /fetch|Storage|cookie|\/api\//);
  // no script carries a copy of the new labels in its words (src/brand.js is the one source, through the page), nor draws the old pin
  for (const f of SCRIPTS) {
    const words = lex(script(f)).filter((x) => x.t === "str" || x.t === "tpl").map((x) => x.v);
    assert.deepEqual(words.filter((w) => /Citycoin\.dev|\bcitycoin\b/i.test(w)), [], `${f}: no second source of the label set`);
    assert.doesNotMatch(script(f), /logo\.svg|favicon\.svg/, `${f}: the old pin is drawn by no script`);
  }
  assert.deepEqual(CC_ATTRS, { "data-brand": CITYCOIN_BRAND.key, "data-brand-name": CITYCOIN_BRAND.productName, "data-brand-domain": CITYCOIN_BRAND.domain });
});

test("client scripts, BRAND unset: on today's pages brand`…` gives every text exactly as written", () => {
  const CASES = "[brand`a`, brand`Couldn't reach Vicinity. Check your connection and try again.`, brand`Counted by vicinity.city`, brand`Not counted yet: vicinity.city counts every 10 minutes.`, "
    + "brand`x ${1} y ${null} z ${undefined} ${'Vicinity'} ${{ toString() { return 'T'; } }} ${[1, 2]} ${0.5}`, brand`${'a'}${'b'}`, brand``, brand`\\u00b7 \\n \\t ${'·'}`, "
    + "brand`$${'UTICA'} · Vicinity`, brand`Hold any $VICINITY`, brand`${`nested ${'Vicinity'}`} Vicinity's design`]";
  const plain = JSON.parse(JSON.stringify(vm.runInContext(CASES.replace(/brand`/g, "`"), vm.createContext({})))); // the same texts untagged
  const pages = [
    ["no document (node, a worker)", {}],
    ["a document without <html>", { document: {} }],
    ["today's <html>: no attribute", { document: docWith({}) }],
    ["a key without the names", { document: docWith({ "data-brand": "citycoin" }) }],
    ["names without the key", { document: docWith({ "data-brand-name": "Zq", "data-brand-domain": "zq.example" }) }],
    ["an <html> whose reading throws", { document: { get documentElement() { throw new Error("no"); } } }],
  ];
  for (const [why, globals] of pages) {
    assert.deepEqual(runHelper(globals, CASES), plain, why);
    assert.equal(runHelper(globals, "BRAND"), null, why);
  }
  // the built pages: today's carry none of the attributes, so this is what every visitor's browser runs today
  for (const f of readdirSync(PUBLIC).filter((x) => x.endsWith(".html"))) assert.doesNotMatch(readFileSync(new URL(f, PUBLIC), "utf8"), /data-brand/, f);
});

test("client scripts, BRAND=citycoin: brand`…` names Citycoin.dev in a text's own words, never in a value put into it", () => {
  const cc = { document: docWith(CC_ATTRS) };
  assert.deepEqual(runHelper(cc, "BRAND"), { key: "citycoin", name: "Citycoin.dev", domain: "Citycoin.dev" });
  const out = runHelper(cc, "[brand`Couldn't reach Vicinity. Check your connection and try again.`, brand`Counted by vicinity.city (pools and team wallets excluded)`, "
    + "brand`I'm repping ${'Vicinity Heights'} on Vicinity. Join us: ${'https://vicinity.city/connect'}`, brand`${'Dashboard'} · Vicinity`, brand`Vicinity's design`, brand`Hold any $VICINITY`]");
  assert.deepEqual(out, [
    "Couldn't reach Citycoin.dev. Check your connection and try again.",
    "Counted by Citycoin.dev (pools and team wallets excluded)",
    "I'm repping Vicinity Heights on Citycoin.dev. Join us: https://vicinity.city/connect", // a city's name, a link: values, never renamed
    "Dashboard · Citycoin.dev",
    "Citycoin.dev's design",
    "Hold any $VICINITY", // never renamed into a token that is not live: area d keeps every text naming it in today's branch of BRAND
  ]);
  // a label with replacement patterns is put in as it is
  assert.equal(runHelper({ document: docWith({ "data-brand": "x", "data-brand-name": "A$&B$1", "data-brand-domain": "d$'" }) }, "brand`Vicinity at vicinity.city`"), "A$&B$1 at d$'");
  // every brand`…` text of every script, as a BRAND=citycoin page shows it, says vicinity nowhere and never names citycoin.dev as an address
  let n = 0;
  for (const f of HELPED) {
    const chunks = brandTexts(script(f));
    const shown = vm.runInContext(`${HELPER}\n;CHUNKS.map((c) => brand([c]))`, vm.createContext({ ...cc, CHUNKS: chunks }));
    shown.forEach((t, i) => { n++; assert.doesNotMatch(t, /vicinity/i, `${f}: ${chunks[i]}`); assert.doesNotMatch(t, /citycoin\.dev\//i, `${f}: ${t}`); });
  }
  assert.ok(n >= 200, `every brand text checked (${n})`);
});

// The words that still say "vicinity" in a client script outside brand`…`, today's branch of BRAND and internal names. Area d (the legacy
// token) brought every script's count to zero but one: public/token.js, the legacy token page's script, which no page built for another label
// set loads (its /token is the plain "not live yet" page: test below and test/build-parity.test.js). A new one anywhere fails here.
const AREA_D_TEXTS = Object.freeze({ "token.js": 16 });
// the regular expressions that read the word: the helper's own two, and two that read words written elsewhere (never shown): the Worker's
// "Counted by vicinity.city" source line (launchpad.js, which also takes the label set's form under BRAND) and a tool label's icon match
// (dashboard-roles.js, area d's "Get $VICINITY")
const PARSERS = new Set(["/vicinity\\.city/g", "/Vicinity/g", "/^Counted by vicinity\\.city/", "/^(Buy & swap|Get \\$VICINITY)/"]);
test("client scripts: every \"vicinity\" left is renamed by brand`…`, today's branch of BRAND, an internal name, or a main-token text of area d", () => {
  const counts = {};
  for (const [f, found] of scans) {
    const src = script(f).split("\n");
    for (const x of found) {
      if (x.kind === "name" || x.kind === "key" || x.kind === "brand") continue;
      if (x.kind === "legacy") { assert.ok(HELPED.includes(f), `${f}:${x.line}: a BRAND branch needs the helper`); continue; }
      if (x.kind === "parser") { assert.ok(PARSERS.has(x.token), `${f}:${x.line}: a regular expression that reads "vicinity": ${x.token}`); continue; }
      // "text": only the legacy token page's script (loaded by no page of another label set)
      assert.equal(f, "token.js", `${f}:${x.line}: a visible "vicinity" outside brand\`…\` and today's branch of BRAND: ${x.token} (${src[x.line - 1].trim().slice(0, 80)})`);
      counts[f] = (counts[f] || 0) + 1;
    }
  }
  assert.deepEqual(counts, AREA_D_TEXTS, "only the legacy token page's script still names the legacy token outside today's branch");
  for (const [f, html] of ccPages) assert.doesNotMatch(html, /src="\/token\.js"/, `${f}: no page built for another label set loads the legacy token page's script`);
});

/* the visible words of a page in node: text and the attributes a person meets (alt, aria-label, title, placeholder), outside anything hidden
   (the hidden attribute, or .cc-off, which public/brand/citycoin.css hides on a BRAND=citycoin page) */
function visibleWords(doc) {
  const out = [];
  const walk = (e) => {
    if (!e || !e.tagName || e.hasAttribute("hidden") || /\bcc-off\b/.test(e.getAttribute("class") || "") || /^(SCRIPT|STYLE|TEMPLATE)$/.test(e.tagName)) return;
    for (const a of ["alt", "aria-label", "title", "placeholder"]) if (e.getAttribute(a)) out.push(e.getAttribute(a));
    for (const n of e.childNodes) if (n.tagName) walk(n); else if (String(n.data).trim()) out.push(String(n.data).trim());
  };
  walk(doc.body);
  return out;
}
const vicinityIn = (words) => words.filter((w) => /vicinity/i.test(w));

test("client scripts, BRAND=citycoin: the member dashboard names Citycoin.dev and never vicinity (area d: nothing of the legacy token is left)", async () => {
  // the badges as the Worker words them for that label set (src/me.js badgesFor with the label set's words and unit)
  const ccBadges = (launched, amount) => badgesFor({ u: { early: 0, wallet: amount ? "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2" : null, home_city: "5142056" }, launched, amount,
    position: null, seat: null, manager: false, admin: false, checkins: 0, posts: 0, tenure: null, threshold: 100_000, unit: "Citycoin.dev tokens", bw: CCW });
  const cc = (o) => ({ ...memberMe(o), badges: ccBadges(Boolean(o && o.launched), (o && o.amount) || 0) });
  for (const [why, me] of [["no wallet", cc()], ["a wallet, the token not live (the Worker's launched false)", cc({ wallet: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2" })],
    ["a wallet, a main token live (MAIN_TOKEN_V5)", cc({ wallet: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2", launched: true })],
    ["a holder of a live main token", cc({ wallet: "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2", launched: true, amount: 250_000, rank: 3 })]]) {
    const t = await openDashboard({ me, page: ccPages.get("dashboard.html") });
    await t.advance(5000);
    assert.deepEqual(t.scriptErrors, [], why);
    assert.equal(t.doc.title, "Dashboard · Citycoin.dev", why);
    const words = visibleWords(t.doc);
    assert.deepEqual(vicinityIn(words), [], why);
    // no Early member claim the Worker did not make (this member has not earned it), and nothing sends anyone to the legacy token page
    assert.ok(!words.some((w) => /Early member badge (unlocked|is already yours)|You're in before launch/.test(w)), `${why}: no Early member claim`);
    for (const a of t.doc.querySelectorAll("a")) {
      if (!/^\/token/.test(a.getAttribute("href") || "")) continue;
      let e = a, shown = true;
      for (; e && e.tagName; e = e.parentNode) if (e.hasAttribute("hidden") || /\bcc-off\b/.test(e.getAttribute("class") || "")) { shown = false; break; }
      assert.ok(!shown, `${why}: a visible link to ${a.getAttribute("href")}: ${a.textContent}`);
    }
    // today's page, the same member: today's words
    const today = await openDashboard({ me });
    await today.advance(5000);
    assert.equal(today.doc.title, "Dashboard · Vicinity", why);
  }
});

test("client scripts, BRAND=citycoin: a launchpad coin's page and the connect page name Citycoin.dev and never vicinity", async () => {
  const MINT = "M1nt1111111111111111111111111111111111111111";
  const answer = { ok: true, asOf: new Date().toISOString(), mint: MINT,
    coin: { kind: "city", ticker: "UTICA", name: "Utica Coin", city: { id: "5142056", name: "Utica", country: "US" }, pair: { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" }, color: "gold", logo: null },
    facts: null, holders: null, trades: { rows: [] }, samples: [],
    market: { launchpad: "vicinity", curve: null, lpCurve: { stage: "curve", symbol: "SOL", raised: 21.25, target: 85, progressPct: 25, pool: MINT }, sources: {}, missing: {} },
    links: { raydium: null, jupiter: null, dexscreener: null, solscan: `https://solscan.io/token/${MINT}`, here: `/coin?mint=${MINT}` } };
  const coinPage = async (html) => {
    const page = await openPage("coin.html", { agreed: "2026-10-01", html });
    const win = page.window;
    Object.assign(win, { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, history: { replaceState() {} }, Intl, VSwap: { open() {} } });
    win.location = { href: `https://example.test/coin?mint=${MINT}`, pathname: "/coin", search: `?mint=${MINT}`, host: "example.test", origin: "https://example.test" };
    win.fetch = async (path) => {
      const p = String(path).split("?")[0];
      const body = p === "/api/coin" ? answer : p === "/api/official" ? { ok: true, swap: true } : { ok: false, error: "not_found" };
      return { ok: body.ok !== false, status: body.ok === false ? 404 : 200, json: async () => body };
    };
    win.V.official = Promise.resolve({ ok: true, swap: true });
    const chart = new Proxy({}, { get: () => () => undefined });
    win.VChart = { create: () => chart, pure: { INTERVALS: {}, SRC_WORDS: {} } };
    vm.runInContext(script("coin.js"), win, { filename: "public/coin.js" });
    for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r));
    return page;
  };
  const cc = await coinPage(ccPages.get("coin.html"));
  assert.deepEqual(vicinityIn(visibleWords(cc.doc)), []);
  assert.equal(cc.doc.title, "$UTICA: live price, chart and holders · Citycoin.dev");
  assert.equal(cc.$("#coin-ca-badge-text").textContent, "Recorded by Citycoin.dev");
  assert.equal(cc.$("#coin-ca-note").textContent, "The one $UTICA Citycoin.dev recorded from the blockchain for Utica, launched on the Citycoin.dev launchpad after an on-chain approval. Check the address before you buy.");
  assert.equal(cc.$("#coin-holders-src").textContent, "Not counted yet: Citycoin.dev counts every 10 minutes.");
  // today's page: today's words, exactly
  const today = await coinPage(null);
  assert.equal(today.doc.title, "$UTICA: live price, chart and holders · Vicinity");
  assert.equal(today.$("#coin-ca-badge-text").textContent, "Recorded by Vicinity");
  assert.equal(today.$("#coin-holders-src").textContent, "Not counted yet: vicinity.city counts every 10 minutes.");
  // the connect page as it opens
  const c = await openConnect({ page: ccPages.get("connect.html") });
  assert.deepEqual(vicinityIn(visibleWords(c.doc)), []);
  assert.ok(vicinityIn(visibleWords((await openConnect()).doc)).length > 0, "today's connect page still names today's brand");
});


/* ---------------------------------------------------------------- the Worker's words (label migration, area c) */
// A stand-in for a page build made with BRAND=citycoin (src/v5policy.js _pagesBuiltForTests moves src/brand.js's reading too), always reset:
// the tests above read the committed record (brand "").
const CC = Object.freeze({ BRAND: "citycoin" });
const FIXTURE_ORIGIN = "https://example.test"; // a clearly fake serving origin (SITE_ORIGIN, listed in SITE_ORIGINS as src/site-config.js asks)
const SITE = Object.freeze({ SITE_ORIGIN: FIXTURE_ORIGIN, SITE_ORIGINS: `${FIXTURE_ORIGIN} https://vicinity.city` });
const asCitycoinBuild = async (fn) => { _pagesBuiltForTests({ brand: "citycoin" }); try { return await fn(); } finally { _pagesBuiltForTests(null); } };
const deepStrings = (o) => (typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(deepStrings) : []);
const CCW = wordsOf(CITYCOIN_BRAND);

test("server words: today's label set gives every text exactly as written; Citycoin.dev's renames a text's own words, never a value put into it", async () => {
  const texts = ["Vicinity city list", "Holders: counted by vicinity.city", "Vicinity's owner must revoke that approval", "$VICINITY", "VICINITY CITY", "vicinity", "plain"];
  for (const w of [SAME, wordsOf(LEGACY_BRAND), brandWords({}), brandWords(CC), brandWords({ BRAND: "other" })]) {
    assert.equal(w.on, false);
    for (const t of texts) assert.equal(w.say(t), t);
    assert.equal(w`Ask Vicinity about ${"Vicinity Street"} on vicinity.city`, "Ask Vicinity about Vicinity Street on vicinity.city");
  }
  assert.ok(Object.isFrozen(SAME) && Object.isFrozen(CCW));
  assert.equal(CCW.on, true);
  assert.equal(CCW.say("This city isn't in the Vicinity city list yet."), "This city isn't in the Citycoin.dev city list yet.");
  assert.equal(CCW.say("Holders: counted by vicinity.city"), "Holders: counted by Citycoin.dev");
  assert.equal(CCW.say("Vicinity's owner"), "Citycoin.dev's owner");
  assert.equal(CCW.say("$VICINITY"), "$VICINITY", "the legacy token's ticker is never renamed into a token that is not live (area d hides it instead)");
  for (const v of [5, null, undefined, { a: "Vicinity" }]) assert.deepEqual(CCW.say(v), v, "anything that is not a string comes back as it is");
  assert.equal(CCW`Ask Vicinity about ${"Vicinity Street"} (${"https://vicinity.city/x"})`, "Ask Citycoin.dev about Vicinity Street (https://vicinity.city/x)", "values are never renamed");
  assert.doesNotMatch(CCW`read by vicinity.city`, /citycoin\.dev/, "the label set's domain label is the brand name, never a host to open");
  // the Worker's reading, fail closed: the Citycoin.dev words only with pages built for them
  assert.deepEqual([statementName(CC), statementNames(CC), siteOrigin({})], ["Vicinity", ["Vicinity"], "https://vicinity.city"]);
  await asCitycoinBuild(() => {
    assert.equal(brandWords(CC).on, true);
    assert.equal(brandWords({}).on, true, "BRAND unset with a Citycoin.dev build: the pages' words (BRAND_PAGES_MISMATCH, review finding F12)");
    assert.deepEqual([statementName(CC), statementNames(CC)], ["Citycoin.dev", ["Citycoin.dev", "Vicinity"]], "a text issued just before the switch stays good");
    assert.equal(siteOrigin({ ...CC, ...SITE }), FIXTURE_ORIGIN);
  });
});

// (origin: the host the request was served as, src/hostbind.js mailOrigin, stage S06; left out, the configured canonical origin)
const ALL_MAILS = (env, origin = undefined) => [
  ...["signin", "signup", "reset", "other"].map((k) => verificationEmail("123456", k, origin, env)),
  ...["phantom", "solflare", "backpack", "nope", undefined].map((a) => walletLinkedEmail("Abcd…wxyz", a, origin, env)),
  googleAddedEmail(origin, env),
];
test("e-mails: today's while the pages are today's; BRAND=citycoin names Citycoin.dev in every word, writes out no host, and links to the serving origin", async () => {
  const today = ALL_MAILS(undefined);
  for (const env of [{}, CC, { ...CC, ...SITE }]) assert.deepEqual(ALL_MAILS(env), today, "the committed build: today's e-mails, whatever BRAND says");
  assert.match(today[0].text, /Enter it at https:\/\/vicinity\.city\/connect/);
  await asCitycoinBuild(() => {
    for (const m of ALL_MAILS({ ...CC, ...SITE })) {
      for (const f of ["subject", "text", "html"]) assert.doesNotMatch(m[f], /vicinity/i, `${m.subject}: ${f}`);
      assert.match(m.subject, /Citycoin\.dev/);
      assert.match(m.text, /— Citycoin\.dev · One city\. One coin\. One community\.$/);
      assert.doesNotMatch(m.text, /https?:|www\.|citycoin\.dev/, "the text names the product, never a host to type");
      const hrefs = [...m.html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]);
      assert.equal(hrefs.length, 1);
      assert.ok(hrefs[0].startsWith(`${FIXTURE_ORIGIN}/`), hrefs[0]);
      assert.doesNotMatch(m.html, /https?:\/\/(?:www\.)?citycoin\.dev/i, "never a link to citycoin.dev while it does not serve the site");
      assert.match(m.html, /color:#0C2344/, "navy text on the gold button, never white on gold");
    }
    const [signin, signup, reset] = ["signin", "signup", "reset"].map((k) => verificationEmail("654321", k, undefined, CC));
    assert.equal(signin.subject, "654321 is your Citycoin.dev code");
    assert.equal(signin.text, "Your Citycoin.dev sign-in code is 654321.\n\nEnter it on Citycoin.dev, where you asked for it. It expires in 10 minutes.\nIf you didn't ask for this, just ignore this email.\n\n— Citycoin.dev · One city. One coin. One community.");
    assert.match(signup.text, /^Your Citycoin\.dev verification code is 654321\./);
    assert.match(reset.text, /^Your Citycoin\.dev password reset code is 654321\./);
    assert.equal(walletLinkedEmail("Abcd…wxyz", "phantom", undefined, CC).subject, "A wallet was connected to your Citycoin.dev account");
    assert.equal(googleAddedEmail(undefined, CC).subject, "Google sign-in was added to your Citycoin.dev account");
    // SITE_ORIGIN unset: the button goes to today's serving origin; no word names it
    for (const m of ALL_MAILS(CC)) {
      for (const f of ["subject", "text"]) assert.doesNotMatch(m[f], /vicinity/i);
      assert.deepEqual(m.html.match(/[^\s"]*vicinity[^\s"]*/gi).map((x) => x.replace(/\?.*$/, "")).filter((x) => !/^https:\/\/vicinity\.city\/(connect|dashboard)$/.test(x)), [], "only the button's link");
    }
    assert.match(verificationEmail("<b>&", "signin", undefined, CC).html, /&lt;b&gt;&amp;/, "the code is escaped like today's");
  });
});

test("e-mails (stage S06 with the labels): the button opens the host the request was served as, the words stay the label set's", async () => {
  // today's label set: S06's e-mails, the origin in the links and words, the label set ignored (a BRAND the pages were not built with)
  for (const origin of ["https://citycoin.dev", "https://vicinity.city", undefined])
    for (const env of [undefined, {}, CC, { ...CC, ...SITE }]) assert.deepEqual(ALL_MAILS(env, origin), ALL_MAILS(undefined, origin), `${origin} ${JSON.stringify(env)}`);
  assert.deepEqual(ALL_MAILS(undefined, "https://vicinity.city"), ALL_MAILS(undefined), "on vicinity.city: today's e-mails, byte for byte");
  await asCitycoinBuild(() => {
    for (const [origin, env] of [["https://citycoin.dev", CC], ["https://citycoin.dev", { ...CC, ...SITE }], ["https://vicinity.city", CC], ["http://localhost:8787", CC]]) {
      const mails = ALL_MAILS(env, origin);
      // only the button's link differs from the e-mails with no origin: the same subject, text and words
      const none = ALL_MAILS(env);
      mails.forEach((m, i) => {
        assert.equal(m.subject, none[i].subject);
        assert.equal(m.text, none[i].text, "the text names the product, never a host to type");
        const hrefs = [...m.html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]);
        assert.equal(hrefs.length, 1);
        assert.ok(hrefs[0].startsWith(`${origin}/`), `${origin}: ${hrefs[0]}`);
        assert.equal(m.html.replace(hrefs[0], "<link>"), none[i].html.replace([...none[i].html.matchAll(/href="([^"]*)"/g)][0][1], "<link>"));
        if (origin === "https://citycoin.dev") for (const f of ["subject", "text", "html"]) assert.doesNotMatch(m[f], /vicinity/i, `${m.subject}: ${f}`);
      });
    }
    // an origin that is not exactly an http(s) origin: the configured canonical origin, as with none
    for (const bad of ["https://citycoin.dev/connect", "javascript:alert(1)", 'https://evil"x', "", null, 5, {}])
      assert.deepEqual(ALL_MAILS({ ...CC, ...SITE }, bad), ALL_MAILS({ ...CC, ...SITE }), JSON.stringify(bad));
  });
});

test("e-mail senders: under BRAND=citycoin no sender of the old name is ever used (mail counts as not configured until the owner sets one)", async () => {
  // today's label set: exactly today's rules (any configured sender, whatever its address), today's SMTP greeting
  for (const env of [{ RESEND_API_KEY: "rk-test" }, { RESEND_API_KEY: "rk-test", EMAIL_FROM: "Vicinity <noreply@vicinity.city>" }, { GMAIL_USER: "noreply@vicinity.city", GMAIL_APP_PASSWORD: "p" }, { ...CC, RESEND_API_KEY: "rk-test" }]) {
    assert.equal(emailConfigured(env), true);
    assert.equal(senderShowsOldName(env), false);
    assert.equal(ehloName(env), "vicinity.city");
  }
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const configuredFrom = wrangler.match(/"EMAIL_FROM":\s*"([^"]*)"/)[1];
  assert.match(configuredFrom, /vicinity/i, "the committed sender still names the old domain: under BRAND=citycoin it is refused until the owner changes it");
  await asCitycoinBuild(async () => {
    let calls = 0;
    const fetchImpl = async (url, init) => { calls++; return new Response(JSON.stringify({ id: "x", from: JSON.parse(init.body).from }), { status: 200 }); };
    const smtpImpl = async (m) => { calls++; return { ok: true, from: m.from }; };
    for (const env of [{ ...CC, RESEND_API_KEY: "rk-test" }, { ...CC, RESEND_API_KEY: "rk-test", EMAIL_FROM: configuredFrom }, { ...CC, GMAIL_USER: "noreply@vicinity.city", GMAIL_APP_PASSWORD: "p" },
      { ...CC, RESEND_API_KEY: "rk-test", EMAIL_FROM: "Fixture <noreply@VICINITY.example.org>" }]) {
      assert.equal(senderShowsOldName(env), true);
      assert.equal(emailConfigured(env), false);
      assert.equal(providers(env).email, false, "the pages offer no e-mail step (as with no sender at all); Google and wallets stay");
      assert.deepEqual(await sendMail(env, { to: "a@example.org", subject: "s", text: "t" }, { fetchImpl, smtpImpl }), { ok: false, error: "email_unavailable" });
      assert.deepEqual(await sendViaResend(env, { to: "a@example.org", subject: "s", text: "t" }, fetchImpl), { ok: false, error: "email_unavailable" });
    }
    assert.equal(calls, 0, "nothing was sent");
    const resend = { ...CC, RESEND_API_KEY: "rk-test", EMAIL_FROM: "Fixture <noreply@example.org>" };
    assert.equal(emailConfigured(resend), true);
    const sent = [];
    await sendMail(resend, { to: "a@example.org", subject: "s", text: "t" }, { fetchImpl: async (url, init) => { sent.push(JSON.parse(init.body).from); return new Response("{}", { status: 200 }); } });
    assert.deepEqual(sent, ["Fixture <noreply@example.org>"]);
    const gmail = { ...CC, GMAIL_USER: "fixture@example.org", GMAIL_APP_PASSWORD: "p" };
    assert.equal(emailConfigured(gmail), true);
    assert.equal((await sendMail(gmail, { to: "a@example.org", subject: "s", text: "t" }, { smtpImpl })).ok, true);
    assert.equal(ehloName(CC), "[127.0.0.1]", "the greeting never names an old host");
    assert.equal(ehloName({ ...CC, ...SITE }), "example.test");
  });
});

test("wallet statements: today's sentence by default; BRAND=citycoin writes the product's name and accepts both names for the minutes a text lives", async () => {
  const ADDR = "8VEEtD3E9ZkHZZw6WT37DE1nYbVEtnDJ9DRGgBDkPuCk";
  const ACTIONS = [["verify", {}], ["claim", { cityId: "5142056", country: "US" }], ["add", { name: "Utica", country: "US" }], ["login", {}], ["login", { pin: "42" }], ["link", { handle: "zq_fixture" }], ["link", { handle: "zq_fixture", pin: "42" }]];
  const msg = (statement) => buildMessage({ host: "vicinity.city", address: ADDR, nonce: "abcdefghijklmnop", issuedAt: "2026-10-24T00:00:00.000Z", statement });
  assert.equal(messageStatement(), MESSAGE_STATEMENT);
  assert.equal(statementFor("login"), "Sign in to Vicinity with this wallet. Free, not a transaction, cannot move funds.");
  for (const [a, o] of ACTIONS) {
    const today = statementFor(a, o), cc = statementFor(a, o, "Citycoin.dev");
    assert.equal(statementFor(a, o, "Vicinity"), today);
    assert.equal(statementFor(a, o, "Not (a) name!"), today, "a name outside the pattern is never written");
    assert.doesNotMatch(cc, /vicinity/i);
    assert.match(cc, /Citycoin\.dev/);
    const both = ["Citycoin.dev", "Vicinity"];
    assert.equal(parseMessage(msg(cc)), null, "today's checker never reads the new name: with BRAND unset nothing changes");
    assert.equal(parseMessage(msg(cc), both).action, a);
    assert.equal(parseMessage(msg(today), both).action, a);
    assert.equal(parseMessage(msg(today)).action, a);
    assert.equal(parseMessage(msg(cc), ["Vicinity"]), null);
  }
  // the route: /api/message names the product of the label set (the first line names the serving host, as today)
  const ask = async (env) => (await (await worker.fetch(new Request(`https://vicinity.city/api/message?address=${ADDR}&action=login`), env)).json()).message.split("\n");
  assert.equal((await ask(CC))[3], statementFor("login"));
  await asCitycoinBuild(async () => {
    const lines = await ask(CC);
    assert.equal(lines[3], "Sign in to Citycoin.dev with this wallet. Free, not a transaction, cannot move funds.");
    assert.equal(lines[0], "vicinity.city wants you to sign in with your Solana account:", "the host it is served on");
  });
});

test("new coins' metadata and picture under BRAND=citycoin: the product's name, the serving origin's links and badge, t1c's arc; a coin built before keeps its JSON", async () => {
  const ADDR = "8VEEtD3E9ZkHZZw6WT37DE1nYbVEtnDJ9DRGgBDkPuCk";
  const coin = { mint: ADDR, name: "Utica", symbol: "UTICA", pitch: "A fixture pitch.", city: { id: "5142056", name: "Utica", country: "US", ticker: "UTICA" } };
  for (const env of [{}, CC, { ...CC, ...SITE }]) {
    assert.equal(metaBrand(env), VICINITY_BRAND, "the committed build: today's brand");
    assert.deepEqual(coinMetadataJson(coin, metaBrand(env)), coinMetadataJson(coin));
    assert.equal(templateOf(env), "t1");
  }
  await asCitycoinBuild(() => {
    const env = { ...CC, ...SITE };
    const b = metaBrand(env);
    assert.deepEqual({ ...b }, { name: "Citycoin.dev", site: FIXTURE_ORIGIN, logo: `${FIXTURE_ORIGIN}/brand/icon-512.png`, network: VICINITY_BRAND.network, metadataPrefix: VICINITY_BRAND.metadataPrefix });
    for (const j of [coinMetadataJson(coin, b), coinMetadataJson({ ...coin, pitch: undefined }, b),
      versionJson({ mint: ADDR, city_id: "5142056" }, { name: "Utica", symbol: "UTICA" }, { description: "The city coin of Utica.", art_sha256: "a".repeat(64), content: { city: { name: "Utica", country: "US" } } }, b)]) {
      const { image, ...rest } = j;
      assert.doesNotMatch(JSON.stringify(rest), /vicinity/i);
      assert.match(j.description, /Launched on Citycoin\.dev on Solana\.$/);
      assert.ok(image.startsWith(VICINITY_BRAND.metadataPrefix), "the picture URLs keep the prefix compiled into the deployed program");
      assert.deepEqual([j.launchpad, j.createdOn, j.external_url], ["Citycoin.dev", FIXTURE_ORIGIN, `${FIXTURE_ORIGIN}/coin?mint=${ADDR}`]);
    }
    assert.equal(coinImageUrl(ADDR), `${VICINITY_BRAND.metadataPrefix}${ADDR}.png`);
    // a coin whose JSON was built under today's brand keeps it (0 such coins exist today; the rule holds for any)
    assert.equal(metaBrandFor(env, { meta_json: JSON.stringify(coinMetadataJson(coin)) }), VICINITY_BRAND);
    assert.equal(metaBrandFor(env, { meta_json: JSON.stringify(coinMetadataJson(coin, b)) }).name, "Citycoin.dev");
    assert.equal(metaBrandFor(env, { meta_json: "{not json" }).name, "Citycoin.dev");
    assert.equal(metaBrandFor(env, null).name, "Citycoin.dev");
    // the new coins' picture: t1c (t1 with the product's name on the arc; test/coinart.test.js pins both; never S22's "t2", another picture)
    assert.equal(templateOf(env), "t1c");
    assert.equal(templateFor(brandWords(env).brand), "t1c");
    assert.equal(TEMPLATES.t1c.arc.text, "CITYCOIN.DEV");
  });
  assert.ok(readFileSync(new URL("../public/brand/icon-512.png", import.meta.url)).length > 0, "the badge the JSON names is published");
});

// The texts of ours that callers rename with bw.say (src/brandwords.js): renamed whole, nothing of the old name is left but the legacy
// token's ticker (POLICY.never's item about it, which /api/policy leaves out under another label set: area d).
const SAID_TABLES = { SOURCE, DEFAULT_GATES, GATES, REASONS, LEGACY_REJECTED, SYSTEM_TEXT_LAUNCHED, ...(CHECKS ? { CHECKS } : {}), LP_VENUE, NO_CHART, NO_TRADES,
  "ATTRIBUTION.chain": ATTRIBUTION.chain.text, "ATTRIBUTION.holders": ATTRIBUTION.holders.text, MESSAGES, "POLICY.never": POLICY.never };
test("API messages and notices under BRAND=citycoin: every text of ours that names the product is renamed where it is answered", async () => {
  for (const [name, table] of Object.entries(SAID_TABLES)) {
    const strings = deepStrings(table);
    assert.ok(strings.length > 0, name);
    for (const t of strings) assert.doesNotMatch(CCW.say(t).replace(/\$VICINITY/g, ""), /vicinity/i, `${name}: ${t}`);
  }
  assert.ok(POLICY.never.some((t) => /Vicinity city list/.test(t)), "today's never-list names the city list");
  // answered: the policy's never-list, a founder's coin defaults, the screener's explanations, the market's attribution
  const policyOf = async (env) => (await (await worker.fetch(new Request("https://vicinity.city/api/policy"), env)).json()).policy;
  assert.deepEqual(await policyOf(CC), JSON.parse(JSON.stringify(POLICY)), "the committed build: today's answer");
  assert.equal((await coinDefaults(CC, "x", "US")).message, DEFAULT_GATES.not_in_list);
  for (const code of Object.keys(MESSAGES)) assert.equal(explain(code, "Utica"), explain(code, "Utica", SAME));
  await asCitycoinBuild(async () => {
    const p = await policyOf(CC);
    assert.deepEqual(p.never.filter((t) => /vicinity/i.test(t)), []);
    // area d: the never-list's item about minting more $VICINITY is a fact of the legacy token, left out (its other items renamed only)
    assert.ok(POLICY.never.includes(LEGACY_NEVER) && /\$VICINITY/.test(LEGACY_NEVER));
    assert.deepEqual(p.never, POLICY.never.filter((t) => t !== LEGACY_NEVER).map((t) => CCW.say(t)));
    // and the edition: the Citycoin.dev Rules are version 7, in effect since 2026-10-25 (src/editions.js; owner decision 2, the owner's go of
    // 25 Oct 2026); every rule of POLICY is the same
    assert.deepEqual([p.version, p.effectiveAt], [7, "2026-10-25"]);
    assert.deepEqual({ ...p, never: null, version: null, effectiveAt: null }, { ...JSON.parse(JSON.stringify(POLICY)), never: null, version: null, effectiveAt: null }, "only the never-list and the edition change");
    const d = await coinDefaults(CC, "x", "US");
    assert.equal(d.message, "This city isn't in the Citycoin.dev city list yet, so it has no ready-made coin. Tell us and we'll add it.");
    for (const code of Object.keys(MESSAGES)) assert.doesNotMatch(explain(code, "Utica", brandWords(CC)), /vicinity/i, code);
    const used = attributionFor(new Set(["chain", "jupiter"]), { holders: true }, brandWords(CC));
    assert.deepEqual(used.map((a) => a.text).filter((t) => /vicinity/i.test(t)), []);
    assert.ok(used.some((a) => a.text === "Holders: counted by Citycoin.dev"));
  });
});

// Every Worker text that still says "vicinity" outside src/brandwords.js's three forms (bw`…`, .say(…), today's branch of `….on ? … : …`)
// and outside internal values, per file and by why. A new one fails here.
//   said    a text of ours that its callers rename with bw.say (checked above: renamed whole)
//   today   today's words, kept byte for byte for today's label set or for what was already written with them: today's three e-mails and
//           the default sender (refused under another label set), today's "verify" statement and name, the legacy coin JSON brand, t1's arc,
//           the launchpad's partner entry on Meteora (written once on chain), the admin's step titles of today, src/brand.js's own set
//   legacy  the legacy token's own texts ($VICINITY, its name), today's official list, its link-checker answers and social account: area d
//           answers them for today's label set only (src/official.js legacyHidden; the tests below read every such answer under BRAND=citycoin
//           and find no "vicinity"), plus /official's program notes, which the page build words for the label set (area a, brandAddressGroups)
//   record  the approved master change order (src/masterpolicy.js): a record whose text is hashed, never re-worded
const SERVER_LEFT = Object.freeze({
  said: { "coindefaults.js": 3, "coinready.js": 1, "coinreview.js": 3, "coins.js": 1, "cointakedown.js": 3, ...(CHECKS ? { "lpbatch.js": 2 } : {}), "lpcoins.js": 3, "marketlive.js": 3, "policy.js": 1, "screen.js": 2 },
  // mail.js 18 since main 46c5825 (S06): today's three e-mails take their links from the served origin, today's address named once (MAIL_ORIGIN)
  today: { "brand.js": 3, "coinart.js": 1, "coinmeta.js": 2, "lpadmin.js": 1, "lpkit.js": 1, "mail.js": 18, "sol/lpadmin-ix.js": 1, "solana.js": 2 },
  legacy: { "coin.js": 1, "me.js": 1, "official.js": 30, "policy.js": 1, "portfolio.js": 2, "swap.js": 2 },
  // 25 since main ec1e838 (#100): the owner's domains decision names vicinity.city in the policy statement; 28 since stage S55: the amendment
  // owner-decision-2026-10-25-golive quotes the owner's go ("Vicinity still active") and the on-chain partner record it accepts going dark
  // (name "Vicinity", the vicinity.city logo address). Records of the policy document, never shown on a page
  record: { "masterpolicy.js": 28 },
});
const LEGACY_FILES = new Set(["coin.js", "me.js", "official.js", "portfolio.js", "swap.js"]);
const TODAY_FILES = new Set(["brand.js", "coinart.js", "coinmeta.js", "lpadmin.js", "lpkit.js", "mail.js", "sol/lpadmin-ix.js", "solana.js"]);
const WORD_LISTS = new Set(["common-passwords.js", "screen-vocab.js"]); // dictionaries (the word "vicinity" is an English word there)
const srcFiles = (dir, base = "") => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? srcFiles(`${dir}${e.name}/`, `${base}${e.name}/`) : e.name.endsWith(".js") ? [`${base}${e.name}`] : []);
test("the Worker's words: every \"vicinity\" left in src/ is renamed through src/brandwords.js, internal, or counted here with why", () => {
  const left = { said: {}, today: {}, legacy: {}, record: {} };
  let renamed = 0;
  for (const f of srcFiles("../src/")) {
    if (WORD_LISTS.has(f)) continue;
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    for (const x of scanServer(src)) {
      if (x.kind === "bw" || x.kind === "say" || x.kind === "legacy") { renamed++; continue; }
      if (x.kind !== "text") continue; // name, parser, internal
      const group = f === "masterpolicy.js" ? "record" : LEGACY_FILES.has(f) || /\$VICINITY/.test(x.token) ? "legacy" : TODAY_FILES.has(f) ? "today" : "said";
      if (group === "said") assert.doesNotMatch(CCW.say(x.token), /vicinity/i, `src/${f}:${x.line}: renamed whole by bw.say`);
      left[group][f] = (left[group][f] || 0) + 1;
    }
  }
  assert.deepEqual(left, JSON.parse(JSON.stringify(SERVER_LEFT)));
  assert.ok(renamed >= 100, `${renamed} texts go through src/brandwords.js`);
  // the words helper is always a local named bw (the scan reads the tag by name): no other tag carries the product's name
  for (const f of srcFiles("../src/")) {
    if (WORD_LISTS.has(f)) continue;
    for (const x of lex(readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8"))) if (x.t === "tpl" && x.tag && x.tag !== "bw") assert.doesNotMatch(x.v, /vicinity/i, `src/${f}: a ${x.tag}\`…\` template`);
  }
});

/* ---------------------------------------------------------------- the legacy token (label migration, area d) */
// The live settings (wrangler.jsonc: the legacy mint; profiles, the Launchpad list, the dashboard and the swap on) with BRAND=citycoin on a
// stand-in build made with it; and the same with a clearly fake main token configured and MAIN_TOKEN_V5 counting (a stand-in build made with
// both, which the real page build refuses while main-token pages do not exist, MAIN_TOKEN_PAGES). None is a real Citycoin.dev setting.
const LIVE = Object.freeze({ VICINITY_MINT: LEGACY_MINT, PROFILES: "on", LAUNCHPAD_V2: "on", DASHBOARD_V2: "on", SWAP: "on" });
const FAKE_MAIN = "FakeMainTokenMint111111111111111111111111111";
const FAKE_X = "https://x.com/ZqFakeTestX";
const CC_V5 = Object.freeze({ ...LIVE, ...CC, ...ACCEPTED, MAIN_TOKEN_MINT: FAKE_MAIN, OFFICIAL_X_URL: FAKE_X });
const asCitycoinV5Build = async (fn) => { _pagesBuiltForTests({ brand: "citycoin", mainTokenV5: true }); try { return await fn(); } finally { _pagesBuiltForTests(null); } };
const SOL_MINT = "So11111111111111111111111111111111111111112";
const H1 = "Hdr1111111111111111111111111111111111111111";
const [TEAM_WALLET] = OFFICIAL.teamWallets, TEAM_LOCK = OFFICIAL.teamLocks[0].address;
// the legacy token's facts: its mint, the team wallets and the lock published for it
const LEGACY_FACTS = [LEGACY_MINT, ...OFFICIAL.teamWallets, ...OFFICIAL.teamLocks.map((l) => l.address)];
/** Every string of an answer with where it is ([path, text]), the keys that are identifiers never shown left out: `kind` ("vicinity" is the
 *  API's name for the site's own token, pinned by test/persist-guard.test.js) and the swap's fee wallet (the platform's configured fee
 *  recipient, which pays no attention to which token is shown); a token search's `q`, the visitor's own words given back. /api/official's
 *  `websites` are the hosts the site is served on today, data for the link checker that no page shows. */
const shownStrings = (o, path = "") => (typeof o === "string" ? [[path, o]] : o && typeof o === "object"
  ? Object.entries(o).filter(([k]) => !["kind", "feeRecipient", "q", "websites"].includes(k)).flatMap(([k, v]) => shownStrings(v, `${path}.${k}`)) : []);
/** No string of `answer` names vicinity or carries a fact of the legacy token. */
function nothingLegacy(answer, where) {
  for (const [p, t] of shownStrings(answer)) {
    assert.doesNotMatch(t, /vicinity/i, `${where} ${p}: ${t}`);
    for (const a of LEGACY_FACTS) assert.ok(!t.includes(a), `${where} ${p}: ${t}`);
  }
}
/** Jupiter and Raydium answer "nothing" (no route), the chain is the test world's. */
const quietNet = () => {
  const rpc = W.chain();
  return async (url, init) => {
    const u = new URL(String(url));
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (/(^|\.)jup\.ag$/.test(u.hostname)) return u.pathname.endsWith("/quote") ? ok({ error: "Could not find any route", errorCode: "COULD_NOT_FIND_ANY_ROUTE" }, 400) : ok(u.pathname === "/tokens/v2/search" ? [] : {});
    if (/^launch-(mint|history)-v1\.raydium\.io$/.test(u.host)) return ok({ success: true, data: { rows: [] } });
    return rpc(url, init);
  };
};
const call = async (env, path, { method = "GET", body } = {}) => {
  const { handleApi } = await import("../src/index.js");
  const headers = body === undefined ? {} : { origin: W.ORIGIN, "content-type": "application/json" };
  const res = await handleApi(new Request(`${W.ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, quietNet(), { waitUntil() {} });
  return { status: res.status, body: await res.json() };
};
const PUBLIC_ROUTES = ["/api/official", "/api/token", "/api/holders", `/api/rank?address=${H1}`, "/api/policy", "/api/launchpad", "/api/swap/config", "/api/swap/tokens?q=vicinity",
  "/api/seats", "/api/claims", `/api/check?q=${LEGACY_MINT}`, "/api/check?q=%40VicinityCitySOL", `/api/check?q=${TEAM_LOCK}`];
const inWorld = async (fn) => { W.useClock("2026-10-24T12:00:00Z"); _resetSwap(); _resetLaunchpad(); _resetCoin(); _resetPortfolio(); try { return await fn(); } finally { W.realClock(); } };

test("area d, BRAND=citycoin without a main token: no token is live, and no answer names $VICINITY or carries its mint, holders, team wallets, lock or old account", async () => {
  await inWorld(() => asCitycoinBuild(async () => {
    const env = W.newWorld({ ...LIVE, ...CC });
    W.setHolding(H1, 2_000_000); W.setHolding(TEAM_WALLET, 5_000_000); W.setHolding(TEAM_LOCK, 60_000_000);
    // the settings' reading: the pages decide (review finding F12): BRAND unset with this build still hides the legacy token, which those
    // pages show nowhere
    assert.equal(legacyHidden(env), true);
    assert.equal(legacyHidden(LIVE), true, "BRAND unset with a Citycoin.dev build: the pages' label set");
    assert.equal(tokenMint(LIVE), null);
    assert.equal(tokenMint(env), null, "no token is live: the site's \"not launched\" state");
    assert.equal(mainCacheTag(env), "-nolegacy", "an edge-cache answer of today's mode is never served in this one");
    assert.deepEqual(socialProfiles(env), [], "no social account: the former one is today's brand's, and none is configured");
    assert.deepEqual(socialProfiles(LIVE), [], "BRAND unset with a Citycoin.dev build: the pages' label set (review finding F12)");
    _pagesBuiltForTests(null);
    try { assert.deepEqual(socialProfiles(LIVE), SOCIAL_PROFILES_TODAY, "BRAND unset with today's build: today's account"); } finally { _pagesBuiltForTests({ brand: "citycoin" }); }

    const got = {};
    for (const r of PUBLIC_ROUTES) { got[r] = await call(env, r); nothingLegacy(got[r].body, r); }
    const o = got["/api/official"].body;
    // no official account (OFFICIAL_X_URL is configured in wrangler.jsonc, but shown only with the main-token switch: amendment 01 section
    // 4.4), and no website of the old name (review finding CRAWL-3): SITE_ORIGIN is unset, so none is listed
    assert.deepEqual([o.tokenContract, o.teamWallets, o.teamLocks, o.socials, o.officialLinks, o.legacyTokens, o.websites], [null, [], [], [], undefined, undefined, []]);
    assert.deepEqual(o.tokens, [
      { network: "Solana", name: "Citycoin.dev token", symbol: "", contract: null, platform: null, status: "Not live yet" },
      { network: "Solana", name: "City coins (one per city)", symbol: "e.g. $UTICA", contract: null, platform: "Citycoin.dev Launchpad", status: "Launching city by city" },
    ]);
    assert.deepEqual(got["/api/token"].body, { launched: false, registry: o.tokens });
    assert.equal(got["/api/holders"].body.launched, false, "no holder list: no token is live");
    assert.equal(got[`/api/rank?address=${H1}`].body.launched, false);
    assert.equal(got["/api/launchpad"].body.vicinity, null, "no first card for the legacy token");
    assert.ok(!got["/api/swap/config"].body.tokens.some((t) => t.kind === "vicinity" || t.mint === LEGACY_MINT), "the Buy panel has no main token to default to");
    assert.deepEqual(got["/api/policy"].body.policy.never, POLICY.never.filter((t) => t !== LEGACY_NEVER).map((t) => CCW.say(t)));
    assert.equal(got[`/api/check?q=${LEGACY_MINT}`].body.verdict, "warning");
    assert.match(got[`/api/check?q=${LEGACY_MINT}`].body.message, /^This is the contract of an earlier token of ours \(history only\)\. It is not the Citycoin\.dev token/);
    // the coin page and the swap refuse the legacy mint; holders keep their tokens (Send still moves them, labelled without the name)
    assert.equal((await call(env, `/api/coin?mint=${LEGACY_MINT}`)).status, 404);
    for (const [inputMint, outputMint] of [[SOL_MINT, LEGACY_MINT], [LEGACY_MINT, SOL_MINT]]) {
      const q = await call(env, "/api/swap/quote", { method: "POST", body: { inputMint, outputMint, amount: "0.1" } });
      assert.equal(q.status, 409);
      assert.deepEqual([q.body.error, q.body.message], ["legacy_token", "No swap or purchase is offered for this token here. Your tokens stay yours, and you can still send them from your wallet."]);
    }
    // the link checker over every input a visitor may paste
    for (const q of CHECK_INPUTS) nothingLegacy(checkOfficial(q, isSolanaAddress, env), `checker ${JSON.stringify(q)}`);
    // the portfolio's and Send's allow-lists, the badges and a holder's /api/me: no legacy entry, no holding, rank or claim from it
    assert.ok(!(await mintsFor(env)).some((m) => m.mint === LEGACY_MINT));
    const assets = await supportedAssets(env, Date.now());
    nothingLegacy(assets, "send assets");
    assert.ok(!assets.some((a) => a.mint === LEGACY_MINT));
    const p = await W.person(env, { home: W.IN_UTICA, holds: 2_000_000 });
    await W.tick(env);
    const me = await p.get("/api/me");
    nothingLegacy(me, "/api/me");
    assert.equal(me.launched, false);
    assert.equal(me.holding.amount, 0);
    assert.deepEqual(me.lost, [], "no badge is \"lost\" for a token that is not live");
    // no badge measures a holding, an amount or a holder rank of a token that is not live (review finding F3)
    assert.deepEqual(me.badges.filter((b) => ["holder", "founder_ready", "whale", "top100", "top10"].includes(b.id)), []);
    const pf = await p.get("/api/me/portfolio");
    assert.deepEqual(pf.portfolio.items, []);
    // the balance history: nothing is read from the $VICINITY days, nothing new is sampled, no founder clock runs on it
    assert.equal(dayKey(env, "2026-10-24"), null);
    assert.equal(await latestBalances(env, Date.now()), null);
    assert.deepEqual(await maybeSample(env, Date.now(), quietNet(), () => 0), { sampled: false, why: "not_launched" });
    assert.deepEqual(await ledgerStatus(env, Date.now()), { running: false, lastSample: null, samplesLast24h: 0 });
    assert.equal((await tenure(env, p.w.address, 100_000, Date.now())).qualified, false);
  }));
});

test("area d, BRAND=citycoin without the main-token switch: no social account is shown, not even a configured one (amendment 01 section 4.4), and the checker never calls one of them 'not us'", async () => {
  await inWorld(() => asCitycoinBuild(async () => {
    const FAKE_TG = "https://t.me/ZqFakeTestGroup";
    const env = W.newWorld({ ...LIVE, ...CC, OFFICIAL_X_URL: FAKE_X, OFFICIAL_TELEGRAM_URL: FAKE_TG });
    // configured, shape-checked, but not shown: "before any switch shows it", a person checks the account and a second person signs off;
    // the main-token switch is the one that shows them, on the day its section 4.3 checks are re-run
    assert.deepEqual(socialProfiles(env), []);
    assert.equal(tokenMint(env), null, "a configured account says nothing about a token: still none is live");
    const o = (await call(env, "/api/official")).body;
    assert.deepEqual([o.socials, o.officialLinks, o.tokenContract], [[], undefined, null]);
    nothingLegacy(o, "/api/official");
    const check = (q) => checkOfficial(q, isSolanaAddress, env);
    // configured but not verified: neither "official" nor "not official" (final check finding 3; never "this account is not us", review
    // finding F9), a plain warning that the team named it and its verification is not finished
    const named = (network, handle) => ({ verdict: "warning", kind: "social", unverified: true,
      message: `The Citycoin.dev team named this ${network} account (${handle}), but its verification is not finished yet, so this checker cannot confirm it yet. Never share your recovery phrase or private key with any account.` });
    assert.deepEqual(check(FAKE_X), named("X", "@ZqFakeTestX"));
    assert.deepEqual(check("@ZqFakeTestGroup"), named("Telegram", "@ZqFakeTestGroup"));
    // an account nobody configured: not on the list, said plainly, as before
    assert.deepEqual(check("https://x.com/ZqSomeoneElse"), { verdict: "not_official", kind: "social", message: "This X account is not on the official list. Citycoin.dev lists no official X account right now." });
    assert.deepEqual(check("@ZqSomeoneElse"), { verdict: "not_official", kind: "social", message: "This account is not on the official list: Citycoin.dev lists no official social accounts right now." });
    assert.equal(check("@VicinityCitySOL").message, "This is a former account of ours (legacy), not a current official account.");
    // the label set's own address while this Worker does not serve it (SITE_ORIGINS without citycoin.dev): the planned address, which does not
    // serve the site yet (src/site-config.js CUTOVER_HOSTS, F9), although OFFICIAL.websites lists it since stage S06: under this label set
    // "official" is only a host the Worker serves (go-live review finding GL-8)
    assert.ok(OFFICIAL.websites.includes("citycoin.dev"));
    for (const q of ["citycoin.dev", "https://www.citycoin.dev/connect"]) {
      assert.deepEqual(check(q), { verdict: "warning", kind: "website", message: "This is the address planned for Citycoin.dev. It does not serve the site yet, so nothing there is official until it does." }, q);
    }
    // once SITE_ORIGINS lists it, it is the official website, and the public list names it (never the old names: review finding CRAWL-3); its
    // www. is never served (it moves to the apex: domain-cutover.md section 2), so it is an address of ours, not the official website
    const moved = { ...env, SITE_ORIGIN: "https://citycoin.dev", SITE_ORIGINS: "https://citycoin.dev https://vicinity.city" };
    assert.equal(checkOfficial("citycoin.dev", isSolanaAddress, moved).verdict, "official");
    assert.deepEqual(checkOfficial("https://www.citycoin.dev/connect", isSolanaAddress, moved),
      { verdict: "warning", kind: "website", ours: true, message: "This is an address of ours, but it does not serve the Citycoin.dev site, so nothing there is official." });
    assert.deepEqual(withMint(moved).websites, ["citycoin.dev"]);
    for (const q of CHECK_INPUTS) nothingLegacy(check(q), `checker ${JSON.stringify(q)}`);
    // the former account as the configured link is refused (amendment 01): no account at all, never the old one
    assert.deepEqual(socialProfiles({ ...LIVE, ...CC, OFFICIAL_X_URL: "https://x.com/VicinityCitySOL" }), []);
    assert.deepEqual(configuredSocialProfiles({ ...LIVE, ...CC, OFFICIAL_X_URL: "https://x.com/VicinityCitySOL" }), []);
    // BRAND unset with the same settings and today's build: today's footer account, exactly as before (the new links count only with the
    // switch there)
    _pagesBuiltForTests(null);
    try { assert.deepEqual(socialProfiles({ ...LIVE, OFFICIAL_X_URL: FAKE_X, OFFICIAL_TELEGRAM_URL: FAKE_TG }), SOCIAL_PROFILES_TODAY); } finally { _pagesBuiltForTests({ brand: "citycoin" }); }
  }));
});

test("final check finding 3: under BRAND=citycoin a configured but unverified official account is answered neutrally (a warning, never 'official', never 'not official'); BRAND unset answers exactly as before", async () => {
  // the value wrangler.jsonc configures since main ec1e838, with its incomplete verification record (amendment 01 section 4.4)
  const X = "https://x.com/CityCoinDev", TG = "https://t.me/ZqFakeTestGroup";
  const inputs = [X, "x.com/CityCoinDev", "https://www.x.com/citycoindev/", "https://twitter.com/CityCoinDev", "https://mobile.twitter.com/CityCoinDev/status/1",
    "http://x.com/CityCoinDev", "@CityCoinDev", "@citycoindev", TG, "t.me/ZqFakeTestGroup", "@ZqFakeTestGroup"];
  const others = ["https://x.com/CityCoinDev_", "@CityCoinDevv", "https://t.me/ZqOtherGroup", "https://x.com/", "https://x.com/VicinityCitySOL", "@VicinityCitySOL", "citycoin.dev"];
  await inWorld(async () => {
    const settings = { ...LIVE, OFFICIAL_X_URL: X, OFFICIAL_TELEGRAM_URL: TG };
    // BRAND unset, today's build: the checker never reads these settings, every answer is today's, word for word
    const today = W.newWorld(settings), bare = W.newWorld(LIVE);
    for (const q of [...inputs, ...others]) {
      const a = checkOfficial(q, isSolanaAddress, today);
      assert.deepEqual(a, checkOfficial(q, isSolanaAddress, bare), `BRAND unset: ${q}`);
      assert.equal("unverified" in a, false, q);
    }
    assert.deepEqual(checkOfficial(X, isSolanaAddress, today), { verdict: "not_official", kind: "social", message: checkOfficial(X, isSolanaAddress, bare).message });
    // BRAND=citycoin (pages built for it) without the main-token switch: the configured accounts are named, not confirmed
    await asCitycoinBuild(async () => {
      const env = W.newWorld({ ...settings, ...CC });
      assert.deepEqual(socialProfiles(env), [], "still shown nowhere: no footer, no list");
      for (const q of inputs) {
        const a = checkOfficial(q, isSolanaAddress, env);
        const tg = /ZqFakeTestGroup/.test(q);
        assert.deepEqual(a, { verdict: "warning", kind: "social", unverified: true,
          message: `The Citycoin.dev team named this ${tg ? "Telegram" : "X"} account (${tg ? "@ZqFakeTestGroup" : "@CityCoinDev"}), but its verification is not finished yet, so this checker cannot confirm it yet. Never share your recovery phrase or private key with any account.` }, q);
        assert.doesNotMatch(a.message, /official|vicinity/i, q);
      }
      for (const q of others) assert.equal("unverified" in checkOfficial(q, isSolanaAddress, env), false, `${q}: answered as before`);
      assert.equal(checkOfficial("https://x.com/CityCoinDev_", isSolanaAddress, env).verdict, "not_official");
      assert.equal(checkOfficial("@VicinityCitySOL", isSolanaAddress, env).legacy, true);
      // through the Worker's route, as /official#check asks it
      const r = await call(env, `/api/check?q=${encodeURIComponent(X)}`);
      assert.equal(r.body.verdict, "warning");
      assert.equal(r.body.unverified, true);
      // nothing configured: no account is named
      const none = W.newWorld({ ...LIVE, ...CC });
      for (const q of inputs) assert.equal("unverified" in checkOfficial(q, isSolanaAddress, none), false, `${q}: nothing configured`);
    });
    // once the main-token switch counts (the day the verification is finished), the configured account is official, as S02A has it
    await asCitycoinV5Build(async () => {
      const env = W.newWorld({ ...CC_V5, OFFICIAL_X_URL: X });
      assert.equal(checkOfficial(X, isSolanaAddress, env).verdict, "official");
      assert.equal(checkOfficial("@CityCoinDev", isSolanaAddress, env).verdict, "official");
    });
  });
});

test("area d, BRAND=citycoin with a verified main token (MAIN_TOKEN_V5 counting): the S02A path shows that token, and nothing of $VICINITY is left", async () => {
  await inWorld(() => asCitycoinV5Build(async () => {
    const env = W.newWorld(CC_V5);
    W.setHolding(H1, 2_000_000);
    assert.equal(tokenMint(env), FAKE_MAIN);
    assert.equal(mainCacheTag(env), `-v5-${FAKE_MAIN}`);
    assert.deepEqual(socialProfiles(env).map((x) => [x.handle, x.url]), [["@ZqFakeTestX", FAKE_X]], "only the configured, shape-checked link");
    const got = {};
    for (const r of PUBLIC_ROUTES) { got[r] = await call(env, r); nothingLegacy(got[r].body, r); }
    const o = got["/api/official"].body;
    assert.equal(o.tokenContract, FAKE_MAIN);
    assert.deepEqual(o.tokens.map((t) => [t.name, t.contract, t.status]), [["Main token", FAKE_MAIN, "Configured"], ["City coins (one per city)", null, "Launching city by city"]]);
    assert.deepEqual([o.legacyTokens, o.teamWallets, o.teamLocks, o.socials, o.officialLinks], [[], [], [], ["@ZqFakeTestX"], { x: FAKE_X, telegram: null }]);
    assert.equal(got["/api/token"].body.launched, true);
    assert.equal(got["/api/token"].body.facts.mint, FAKE_MAIN);
    assert.equal(got["/api/holders"].body.mint, FAKE_MAIN);
    assert.deepEqual([got["/api/launchpad"].body.vicinity.mint, got["/api/launchpad"].body.vicinity.name], [FAKE_MAIN, "Main token"]);
    // Jupiter finds no route here: no Buy for the main token yet (S02A's rule), and never one for the legacy token
    assert.deepEqual(got["/api/swap/config"].body.tokens.filter((t) => t.kind === "vicinity" || t.mint === LEGACY_MINT), []);
    assert.match(got["/api/check?q=%40VicinityCitySOL"].body.message, /^This is a former account of ours \(legacy\), not a current official account\. Citycoin\.dev's official account is @ZqFakeTestX\.$/);
    assert.equal(checkOfficial(FAKE_MAIN, isSolanaAddress, env).verdict, "official");
    assert.equal(checkOfficial(FAKE_X, isSolanaAddress, env).verdict, "official");
    for (const q of CHECK_INPUTS) nothingLegacy(checkOfficial(q, isSolanaAddress, env), `checker ${JSON.stringify(q)}`);
    assert.equal((await call(env, `/api/coin?mint=${LEGACY_MINT}`)).status, 404);
    assert.equal((await call(env, "/api/swap/quote", { method: "POST", body: { inputMint: SOL_MINT, outputMint: LEGACY_MINT, amount: "0.1" } })).status, 409);
    nothingLegacy(withMint(env), "the official list");
    assert.ok(!(await mintsFor(env)).some((m) => m.mint === LEGACY_MINT));
    nothingLegacy(await supportedAssets(env, Date.now()), "send assets");
    // today's label set with the switch (S02A as it was): the legacy token is a labelled legacy entry, exactly as before
    _pagesBuiltForTests({ mainTokenV5: true, brand: "" });
    const s02a = withMint({ ...LIVE, ...ACCEPTED, MAIN_TOKEN_MINT: FAKE_MAIN });
    assert.equal(s02a.tokens[1].name, "Vicinity, legacy token");
    assert.equal(s02a.legacyTokens[0].mint, LEGACY_MINT);
  }));
});

test("area d, client: a BRAND=citycoin build's coin page says plainly that its token is not live yet; /token is the plain page and loads nothing of the legacy token", async () => {
  const open = async (html) => {
    const page = await openPage("coin.html", { agreed: "2026-10-01", html });
    const win = page.window;
    Object.assign(win, { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, history: { replaceState() {} }, Intl, VSwap: { open() {} } });
    win.location = { href: "https://example.test/coin", pathname: "/coin", search: "", host: "example.test", origin: "https://example.test" };
    const offi = { ok: true, tokenContract: null, swap: true }; // /api/official without a live token (the Worker's answer above)
    win.fetch = async () => ({ ok: true, status: 200, json: async () => offi });
    win.V.official = Promise.resolve(offi);
    const chart = new Proxy({}, { get: () => () => undefined });
    win.VChart = { create: () => chart, pure: { INTERVALS: {}, SRC_WORDS: {} } };
    vm.runInContext(script("coin.js"), win, { filename: "public/coin.js" });
    for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r));
    return page;
  };
  const cc = await open(ccPages.get("coin.html"));
  assert.equal(cc.$("#coin-note-title").textContent, "The Citycoin.dev token is not live yet");
  assert.equal(cc.$("#coin-note-text").textContent, "Its page opens here once it is live. Anything presented as it before that is not ours.");
  assert.deepEqual([cc.$("#coin-note-link").getAttribute("href"), cc.$("#coin-note-link").textContent], ["/launchpad", "Back to the Launchpad"]);
  assert.equal(cc.doc.title, "The Citycoin.dev token is not live yet · Citycoin.dev");
  assert.deepEqual(vicinityIn(visibleWords(cc.doc)), []);
  const today = await open(null);
  assert.equal(today.$("#coin-note-title").textContent, "$VICINITY isn't launched yet", "today's page: today's words");
  assert.equal(today.$("#coin-note-link").getAttribute("href"), "/token");
  // /token of that build: one plain sentence, no script of the legacy token page, no address, price or Buy
  const token = ccPages.get("token.html");
  assert.doesNotMatch(token, /vicinity/i);
  assert.match(token, /The Citycoin\.dev token is not live yet\.<\/h1>\s*<p[^>]*>There is no official token address, price or Buy button yet\.<\/p>/);
  assert.doesNotMatch(token, /src="\/(token|swap|holders)\.js"/);
});
