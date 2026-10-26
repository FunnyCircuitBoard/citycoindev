// Stage S55, the last step of the domain cutover (docs/citycoin-master/domain-cutover.md section 3, step 4; implementation-report.md section 11,
// stage S55): citycoin.dev is the one host this Worker serves, the vicinity.city and www.vicinity.city routes are removed with no redirect (the
// owner's decision of 24 Oct 2026, carried out on his go of 25 Oct 2026), and what goes with it. Checked against the committed files (read past
// the suite's stand-in for today's site, test/helpers/today-build.mjs) and through the real Worker:
//   - the committed configuration: SITE_ORIGINS and SITE_ORIGIN https://citycoin.dev, one route, accepted by the v5 configuration check;
//   - every other host, the old names first, is refused (421 wrong_host naming https://citycoin.dev, no Location, no cookie), never served and
//     never redirected; the old names are not forwarded to vicinity.city either, since it is not served (src/site-config.js servesLegacy);
//   - sessions and pairings made on citycoin.dev are citycoin.dev's, and what the Worker answers there links nowhere on vicinity.city;
//   - e-mail links name https://citycoin.dev;
//   - public/_headers carries no X-Robots-Tag rule;
//   - the post-deploy check (scripts/check-live.mjs) checks the configured canonical origin by default, and the deploy workflow relies on it;
//   - the link checker never calls vicinity.city, vicinitycity.com or vicinitycity.net official again;
//   - the policy amendment owner-decision-2026-10-25-golive, the same in docs/citycoin-master/policy.json and src/masterpolicy.js, in force as
//     S55's recorded deviation (b): it applies the owner's general go to the partner logo going dark, with that consequence stated to him in
//     writing by the lead developer, and never says that the owner named or specifically accepted the file (S55 review finding H1).
// Fake wallets and fake data only; nothing here reaches a network.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as W from "./helpers/world.js";
import worker from "../src/index.js";
import { committedFile, realWrangler } from "./helpers/today-build.mjs";
import { varsOf } from "../scripts/brand/wrangler-vars.mjs";
import { FALLBACK_BASE, PATHS, checkLive, defaultBase } from "../scripts/check-live.mjs";
import { OFFICIAL_URL } from "../scripts/cities/tickers.mjs";
import { pageV5Config, pageWalletOnly } from "../scripts/pages/build.mjs";
import { DEFAULT_SITE, LEGACY_HOSTS, acceptedHost, isForwardHost, servesLegacy, siteConfig } from "../src/site-config.js";
import { hostBound, mailOrigin, servedHost } from "../src/hostbind.js";
import { hostAnswer } from "../src/hostroute.js";
import { FORMER_WEBSITES, OFFICIAL, checkOfficial } from "../src/official.js";
import { verificationEmail, walletLinkedEmail } from "../src/mail.js";
import { MASTER_POLICY } from "../src/masterpolicy.js";
import { isSolanaAddress } from "../src/solana.js";
import { _pagesBuiltForTests, _resetPolicyCheck, checkPolicyConfig, walletOnly, walletOnlyRefusals } from "../src/v5policy.js";

const TEXT = realWrangler();
const WR = JSON.parse(TEXT.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
const V = varsOf(TEXT);
const RECORD = committedFile("src/pages-built.js", "utf8");
const BUILT = Object.fromEntries([.../export const PAGES_BUILT = Object\.freeze\((\{[^}]*\})\);/.exec(RECORD)[1].matchAll(/(\w+): ("[^"]*"|true|false)/g)].map(([, k, v]) => [k, JSON.parse(v)]));
const CC = "https://citycoin.dev";
const GO = "I still see nothing on Citycoin.dev. Vicinity still active. What are you doing? Get them all sorted. Don't wait for my permission just go ahead and execute all the changes.";
// the lead developer's written statement to the owner, 25 Oct 2026, before either merge (the part about the partner logo), quoted as written
const LEAD_STATEMENT = "For step 3 I'm taking your message as written approval of two things. First, the old Vicinity logo address stored on-chain (the Meteora partner record) will stop loading.";
const DECISION = "i dont want any domain forward from vicinty. leve that blank both. vicinity.city and vicinitycity.com i wil need them for other purpose.";
/** Every name of the old site, with and without www. */
const OLD_NAMES = ["vicinity.city", "www.vicinity.city", "vicinitycity.net", "www.vicinitycity.net", "vicinitycity.com", "www.vicinitycity.com"];
const OLD_URL = /https?:\/\/(www\.)?vicinity\.city|vicinitycity\.(com|net)/i;

// nothing here reaches a network: the test world's chain answers RPC, the market sources answer empty, anything else fails at once
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  const ok = (b) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
  if (/(^|\.)jup\.ag$/.test(u.hostname)) return ok(u.pathname === "/tokens/v2/search" ? [] : {});
  if (/raydium\.io$|dexscreener/.test(u.hostname)) return ok({ success: true, data: { rows: [] }, pairs: [] });
  return W.chain()(url, init);
};
beforeEach(() => { W.useClock("2026-10-25T12:00:00Z"); _resetPolicyCheck(); _pagesBuiltForTests(null); });
after(() => { globalThis.fetch = realFetch; W.realClock(); _pagesBuiltForTests(null); });
const ctx = { waitUntil() {}, passThroughOnException() {} };
const fetchVia = (env, url, method = "GET", headers = {}) => worker.fetch(new Request(url, { method, headers: { origin: new URL(url).origin, ...headers },
  body: method === "POST" ? "{}" : undefined }), env, ctx);

/* ---------------------------------------------------------------- the committed configuration */

test("the committed wrangler.jsonc is single-host: SITE_ORIGINS and SITE_ORIGIN https://citycoin.dev, the citycoin.dev route alone, accepted by the v5 check", () => {
  assert.equal(V.SITE_ORIGINS, CC);
  assert.equal(V.SITE_ORIGIN, CC);
  assert.equal(V.DEPLOYMENT_ENV, "production");
  assert.deepEqual(WR.routes, [{ pattern: "citycoin.dev", custom_domain: true }]);
  assert.equal(WR.workers_dev, false);
  assert.equal(WR.preview_urls, false);
  assert.equal(Object.hasOwn(V, "HOST_REDIRECT"), false, "no forwarding switch (the owner's decision of 24 Oct 2026)");
  // no value of the configuration names an old host (the comments may: the history and the rollback)
  assert.doesNotMatch(JSON.stringify({ vars: WR.vars, routes: WR.routes }), /vicinity\.city|vicinitycity\./);
  const site = siteConfig(V);
  assert.deepEqual([site.origin, [...site.hosts], [...site.forwardHosts], [...site.problems], site.configured], [CC, ["citycoin.dev"], [], [], true]);
  assert.equal(hostBound(site), true, "the host binding counts");
  assert.equal(servesLegacy(site), false, "vicinity.city is not served, so its old names are not accepted or forwarded");
  // the v5 configuration check, the page build and the wallet-only switch take it as it is
  assert.deepEqual(checkPolicyConfig(V, { log: () => {} }), { ok: true, codes: [] });
  assert.deepEqual(pageV5Config(V), { ok: true });
  assert.deepEqual(pageWalletOnly(V), { walletOnly: true });
  _pagesBuiltForTests(BUILT);
  try { assert.deepEqual([walletOnly(V), walletOnlyRefusals(V)], [true, []]); } finally { _pagesBuiltForTests(null); }
  // the comment above SITE_ORIGINS says what S55 does, quotes the owner's decision and gives the rollback: a revert of the S55 code, which puts
  // the configuration and the tests that pin it back together (values changed, no line deleted), with the deploy token's vicinity.city zone
  // first (S55 review finding S55-DEPLOY-1: changing the value and the routes alone fails the suite the deploy's build runs)
  const lines = TEXT.split("\n"), at = lines.findIndex((l) => l.trim().startsWith('"SITE_ORIGINS":'));
  let i = at - 1, block = "";
  while (i >= 0 && lines[i].trim().startsWith("//")) block = lines[i--].trim().replace(/^\/\/\s*/, "") + " " + block;
  assert.match(block, /stage S55/);
  assert.ok(block.includes(DECISION), "the owner's decision of 24 Oct 2026, quoted as written");
  assert.match(block, /owner's go of 25 Oct 2026/);
  assert.match(block, /Rollback of S55, only while the owner has not put vicinity\.city to its other use: one pull request that reverts the S55 code \(git revert of its merge commit/);
  assert.match(block, /puts this value back to "https:\/\/citycoin\.dev https:\/\/vicinity\.city", both vicinity\.city routes below, the noindex rules of public\/_headers and the tests that pin each, together/);
  assert.match(block, /Changing this value and the routes alone fails the tests/);
  assert.match(block, /the deploy token gets the vicinity\.city zone back/);
  assert.match(block, /never delete the line: keep_vars/);
  assert.equal(TEXT.replace(/\n\s*\/\/\s*/g, " ").split(GO).length - 1, 1, "the owner's go is quoted once (with the go-live settings)");
});

test("src/site-config.js: the legacy hosts count as accepted, and the old names forward to vicinity.city, only while SITE_ORIGINS lists vicinity.city", () => {
  const s55 = siteConfig(V);
  const two = siteConfig({ SITE_ORIGIN: CC, SITE_ORIGINS: `${CC} https://vicinity.city` });
  for (const h of LEGACY_HOSTS) {
    assert.equal(acceptedHost(s55, h), null, `${h}: not accepted since S55`);
    assert.equal(acceptedHost(two, h.toUpperCase()), h, `${h}: accepted while vicinity.city is listed (S06, the go-live, S55's rollback)`);
    assert.equal(acceptedHost(DEFAULT_SITE, h), h, `${h}: accepted with the settings unset (today's site)`);
    if (h !== "vicinity.city") assert.equal(isForwardHost(s55, h), false, `${h}: never forwarded once vicinity.city is not served`);
  }
  assert.deepEqual([...two.forwardHosts], ["www.vicinity.city", "vicinitycity.net", "www.vicinitycity.net"]);
  assert.equal(acceptedHost(s55, "citycoin.dev"), "citycoin.dev");
  // the stale rule is gone from the comments: no legacy host is kept "at least 12 months" any more (the owner's decision of 24 Oct 2026)
  for (const f of ["src/site-config.js", "src/hostroute.js"]) assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /stay(s)? attached for at least 12 months|routes stay at least 12 months/, f);
  // even the dropped redirect switch (HOST_REDIRECT, never to be set) refuses an old name once vicinity.city is not served: never a 308 there
  const url = new URL("https://vicinity.city/launchpad?tab=new");
  assert.equal(hostAnswer(new Request(url), url, s55, false, false).status, 421);
});

/* ---------------------------------------------------------------- the Worker as committed */

test("the Worker as committed: every host but citycoin.dev is refused before any route (421 wrong_host, no Location, no cookie); nothing redirects to citycoin.dev", async () => {
  _pagesBuiltForTests(BUILT);
  try {
    const env = W.newWorld({ ...V, SOLANA_RPC_URL: "https://rpc.test" });
    const others = [...OLD_NAMES, "www.citycoin.dev", "vicinity-map.example.workers.dev", "evil.example", "VICINITY.CITY", "localhost"];
    for (const host of others) for (const proto of ["https", "http"]) {
      for (const [method, path] of [["GET", "/api/me"], ["GET", "/api/health"], ["GET", "/coin-meta/x.json"], ["GET", "/official-coins.csv"], ["POST", "/api/auth/challenge"],
        ["GET", "/api/auth/google/start"], ["POST", "/api/auth/logout"], ["GET", "/brand/vicinity-512.png"]]) {
        const res = await fetchVia(env, `${proto}://${host}${path}`, method);
        assert.deepEqual([res.status, res.headers.get("location"), res.headers.get("set-cookie"), await res.json()],
          [421, null, null, { error: "wrong_host", origin: CC }], `${method} ${proto}://${host}${path}`);
      }
    }
    // citycoin.dev itself: served; plain http goes to https on the same host, never anywhere else
    assert.equal((await fetchVia(env, `${CC}/api/health`)).status, 200);
    const http = await fetchVia(env, "http://citycoin.dev/rules?x=1");
    assert.deepEqual([http.status, http.headers.get("location")], [301, "https://citycoin.dev/rules?x=1"]);
  } finally { _pagesBuiltForTests(null); }
});

test("sessions and pairings made on citycoin.dev are citycoin.dev's; what the Worker answers there names no vicinity.city address to go to", async () => {
  _pagesBuiltForTests(BUILT);
  try {
    const env = W.newWorld({ ...V, SOLANA_RPC_URL: "https://rpc.test" });
    const b = W.browser(env, { site: CC }), w = await W.wallet();
    const seen = [];
    b.net.tap = async ({ path, response }) => { seen.push([path, response.headers.get("location"), await response.text()]); };
    await b.post("/api/signup/start");
    await b.post("/api/signup/location", { location: W.IN_UTICA, country: "US" });
    await b.post("/api/signup/terms", { version: "2026-10-25" });
    const c = await b.post("/api/auth/challenge", { purpose: "register", address: w.address });
    assert.match(c.message, /^citycoin\.dev wants you to sign in with your Solana account:\n[\s\S]*\nURI: https:\/\/citycoin\.dev\n/, "the wallet signs for citycoin.dev");
    const reg = await b.send("/api/signup/wallet", { method: "POST", body: { challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message) } });
    assert.equal(reg.status, 200, JSON.stringify(await reg.clone().json()));
    assert.equal((await b.get("/api/me")).signedIn, true);
    assert.deepEqual((await env.DB.prepare("SELECT DISTINCT host FROM sessions").all()).results, [{ host: "citycoin.dev" }]);
    // a "sign in with my phone" pairing started there: its row and its link are citycoin.dev's
    const computer = W.browser(env, { site: CC });
    const pair = await computer.post("/api/pair", {});
    assert.deepEqual([pair.ok, pair.purpose], [true, "login"], JSON.stringify(pair));
    assert.match(pair.url, /^https:\/\/citycoin\.dev\/connect#pair=/);
    assert.deepEqual((await env.DB.prepare("SELECT DISTINCT host FROM pairs").all()).results, [{ host: "citycoin.dev" }]);
    const status = await computer.send("/api/pair/status", { method: "POST", body: { code: pair.code } });
    const st = await status.json();
    assert.deepEqual([status.status, st.error], [200, undefined], `and it is answered there: ${JSON.stringify(st)}`);
    // the public answers a visitor's pages read
    for (const p of ["/api/official", "/api/policy", "/api/health", "/api/launchpad", "/api/coins", "/api/fees", "/api/official-coins", "/api/swap/config", "/api/me",
      "/api/check?q=vicinity.city", "/api/check?q=citycoin.dev"]) await b.send(p);
    assert.ok(seen.length > 15);
    for (const [path, location, body] of seen) {
      assert.ok(!location || !OLD_URL.test(location), `${path}: Location ${location}`);
      assert.doesNotMatch(body, OLD_URL, `${path}: names no address on the old site`);
    }
  } finally { _pagesBuiltForTests(null); }
});

test("e-mail links name https://citycoin.dev: the origin a request on citycoin.dev is served as, and the label set's fallback", () => {
  const served = servedHost(V, new Request(`${CC}/api/signup/email`));
  assert.deepEqual([served.bound, served.refused, served.origin, served.host, served.key], [true, false, CC, "citycoin.dev", "citycoin.dev"]);
  assert.equal(mailOrigin(served), CC);
  // a request on an old name never reaches a route, so no e-mail is ever built for it
  for (const h of OLD_NAMES) assert.equal(servedHost(V, new Request(`https://${h}/api/signup/email`)).refused, true, h);
  _pagesBuiltForTests(BUILT);
  try {
    for (const mail of [verificationEmail("123456", "signup", mailOrigin(served), V), verificationEmail("123456", "signup", undefined, V),
      walletLinkedEmail("Wa11…1111", "phantom", mailOrigin(served), V), walletLinkedEmail("Wa11…1111", "phantom", undefined, V)]) {
      const links = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(links.length > 0);
      for (const l of links) assert.ok(l.startsWith(`${CC}/`) || l === CC, l);
      assert.doesNotMatch(mail.text + mail.html, /vicinity/i);
    }
  } finally { _pagesBuiltForTests(null); }
});

/* ---------------------------------------------------------------- public/_headers */

test("public/_headers carries no X-Robots-Tag rule and no host rule: citycoin.dev is indexed (the two vicinity.city rules left with their routes)", () => {
  const text = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  assert.doesNotMatch(text, /X-Robots-Tag/i);
  assert.doesNotMatch(text, /^https?:\/\//m, "no rule names a host");
  assert.doesNotMatch(text, /vicinity/i);
  assert.match(text, /^\/\*\n {2}Content-Security-Policy: default-src 'self';/m, "the security headers stay");
  assert.match(text, /^\/fonts\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
});

/* ---------------------------------------------------------------- the post-deploy check */

test("scripts/check-live.mjs checks the configured canonical origin by default (SITE_ORIGIN), falling back to https://citycoin.dev; the deploy workflow relies on it", async () => {
  assert.equal(FALLBACK_BASE, CC);
  assert.equal(defaultBase(TEXT), CC, "the committed wrangler.jsonc: citycoin.dev");
  assert.equal(defaultBase(), CC, "read from the repository's wrangler.jsonc when no text is given");
  const withVars = (set) => JSON.stringify({ vars: set });
  assert.equal(defaultBase(withVars({ SITE_ORIGINS: CC })), CC, "SITE_ORIGIN unset: the fallback, never today's vicinity.city");
  assert.equal(defaultBase(withVars({})), CC);
  assert.equal(defaultBase(withVars({ SITE_ORIGIN: "nonsense", SITE_ORIGINS: CC })), CC, "a refused SITE_ORIGIN: the fallback");
  assert.equal(defaultBase(withVars({ SITE_ORIGIN: "https://citycoin.dev", SITE_ORIGINS: "https://vicinity.city" })), CC, "SITE_ORIGIN outside SITE_ORIGINS: refused, the fallback");
  assert.equal(defaultBase("{ not json"), CC, "an unreadable file: the fallback");
  assert.equal(defaultBase(withVars({ SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://example.test" })), "https://example.test", "the configured origin, whatever it is");
  // the check asks the base it is given, every path, GET only, never following a redirect
  const asked = [];
  const fake = async (url, init) => { asked.push([url, init.redirect]); return new Response("x", { status: 200, headers: { "content-type": url.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/html" } }); };
  const bad = await checkLive(CC, fake, () => {});
  assert.deepEqual(asked.map(([u]) => u), PATHS.map((p) => `${CC}${p}`));
  assert.ok(asked.every(([, r]) => r === "manual"));
  assert.equal(bad, PATHS.length, "no security header in the fake answers: every address fails");
  // the deploy workflow runs it with no address (so on citycoin.dev) and names no vicinity.city address to check
  const deploy = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const runs = [...deploy.matchAll(/^\s*run: (.*)$/gm)].map((m) => m[1]);
  assert.ok(runs.some((r) => r.startsWith("node scripts/check-live.mjs || (sleep 20 && node scripts/check-live.mjs)")), "the live check runs");
  for (const r of runs) assert.doesNotMatch(r, /vicinity\.city/, r);
  assert.match(deploy, /^# Deploys the Citycoin\.dev site \(Worker "vicinity-map", custom domain citycoin\.dev\)/);
  assert.doesNotMatch(deploy, /^# Deploys vicinity\.city/m);
  // the ticker build reads the official list from the same origin (scripts/cities/tickers.mjs)
  assert.equal(OFFICIAL_URL, `${CC}/api/official-coins`);
  // no script or workflow of the site checks or reads vicinity.city as the live site (the countdown's own workflow is a later owner cleanup,
  // domain-cutover.md section 2 item 6; the switch trial's fallback list is used only for a file that does not list citycoin.dev at all)
  for (const f of ["scripts/check-live.mjs", "scripts/cities/tickers.mjs", ".github/workflows/ci.yml", ".github/workflows/deploy.yml"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/^\s*(#|\/\/|\*).*$/gm, ""), /https:\/\/vicinity\.city/, f);
  }
});

/* ---------------------------------------------------------------- the link checker */

test("the link checker never calls vicinity.city, vicinitycity.com or vicinitycity.net official again; /api/official lists citycoin.dev alone", async () => {
  assert.deepEqual(OFFICIAL.websites, ["citycoin.dev"]);
  assert.equal(OFFICIAL.updated, "2026-10-25");
  assert.deepEqual([...FORMER_WEBSITES], ["vicinity.city", "vicinitycity.com", "vicinitycity.net"]);
  const asks = OLD_NAMES.flatMap((h) => [h, `https://${h}`, `http://${h}/launchpad`, `https://${h}/brand/vicinity-512.png`]);
  for (const [label, built] of [["today's pages (the stand-in)", null], ["the committed Citycoin.dev pages", BUILT]]) {
    _pagesBuiltForTests(built);
    try {
      const env = W.newWorld({ ...V, SOLANA_RPC_URL: "https://rpc.test" });
      const b = W.browser(env, { site: CC });
      for (const q of asks) {
        const a = await b.get(`/api/check?q=${encodeURIComponent(q)}`);
        assert.notEqual(a.verdict, "official", `${label}: ${q}`);
        assert.deepEqual([a.verdict, a.former], ["warning", true], `${label}: ${q} is a former address`);
        assert.match(a.message, /^This was an earlier address of (Vicinity|Citycoin\.dev)\. It no longer serves the (Vicinity|Citycoin\.dev) site, so nothing there is official\.$/, `${label}: ${q}`);
      }
      assert.equal((await b.get("/api/check?q=citycoin.dev")).verdict, "official", label);
      assert.equal((await b.get("/api/check?q=vicinity.city.evil.example")).verdict, "not_official", `${label}: a look-alike stays not official`);
      assert.deepEqual((await b.get("/api/official")).websites, ["citycoin.dev"], label);
    } finally { _pagesBuiltForTests(null); }
  }
  // the pure checker under every label set and site setting it can meet: an old name is official only while this Worker serves it in place
  for (const env of [V, { ...V, BRAND: "" }]) for (const q of OLD_NAMES) assert.notEqual(checkOfficial(q, isSolanaAddress, env).verdict, "official", `${JSON.stringify(env.BRAND)} ${q}`);
});

/* ---------------------------------------------------------------- the policy amendment */

test("the policy amendment owner-decision-2026-10-25-golive is in policy.json and src/masterpolicy.js, the same, in force under the owner's general go, with the consequence stated to him in writing; it never says he named the file", () => {
  const json = JSON.parse(readFileSync(new URL("../docs/citycoin-master/policy.json", import.meta.url), "utf8"));
  const id = "owner-decision-2026-10-25-golive";
  const inJson = json.amendments.find((a) => a.id === id), inModule = MASTER_POLICY.amendments.find((a) => a.id === id);
  assert.ok(inJson && inModule, "present in both");
  assert.deepEqual(structuredClone(inModule), inJson, "identical");
  assert.deepEqual(Object.keys(inJson), ["id", "date", "source", "summary", "overrides"], "the shape of the decision of 24 Oct 2026");
  assert.deepEqual(Object.keys(json.amendments.find((a) => a.id === "owner-decision-2026-10-24-domains")), Object.keys(inJson));
  assert.equal(inJson.date, "2026-10-25");
  assert.ok(inJson.source.includes(`"${GO}"`), "the owner's words, quoted as written");
  assert.match(inJson.summary, /https:\/\/vicinity\.city\/brand\/vicinity-512\.png/);
  assert.match(inJson.summary, /2be9mDcnk6rK2XVnNiTBH4JmeWWwFzmUXMSrXMS8si11/);
  assert.match(inJson.summary, /https:\/\/citycoin\.dev\/brand\/vicinity-512\.png with unchanged bytes/);
  assert.match(inJson.summary, /fee-claimer wallet holder's step \(the owner's\)/);
  // Recorded deviation (b) of S55 (the lead developer's decision of 25 Oct 2026 under the owner's delegation): the entry is in force, applied
  // under the owner's general go, and quotes the lead developer's written statement of this consequence to the owner, made before either merge.
  // S55 review finding H1 still holds: the go does not name the file, so no field says that the owner named or specifically accepted it.
  assert.match(inJson.source, /It is a general instruction: it does not name this file, the partner record or Meteora, and this entry does not record that the owner named or specifically accepted this file\./);
  assert.ok(inJson.source.includes(`(quoted as written): "${LEAD_STATEMENT}"`), "the lead developer's written statement to the owner, quoted as written");
  assert.match(inJson.source, /The lead developer, under the owner's delegation, applies the go to this file, and before either merge stated this consequence to the owner in writing, in the working conversation on 25 Oct 2026/);
  assert.match(inJson.summary, /^In force since 25 Oct 2026: applied under the owner's general go \(source\), a recorded deviation of stage S55; nothing changes on the live site until S55 is merged and deployed\./);
  assert.match(inJson.summary, /What the gate protects still holds: no coin depends on that record \(the fee claimer's one DBC config, EZVHCgxKZhvXmUGMXJMEw8tZHiTmoHPyM9mNNQ5u1kSP, has 0 pools, and the legacy launchpad has launched 0 coins/);
  for (const f of ["source", "summary", "overrides"]) {
    assert.doesNotMatch(inJson[f], /is his written acceptance|(?<!not record that the )owner (has |had )?(named|accepted|specifically accepted)|accepted in writing|his (specific |written )+acceptance|Not in force/, f);
  }
  assert.match(inJson.overrides, /^release_gates\.legacy_immutable_metadata \(master section 04, BR-02\) for this one file on the old host only \(https:\/\/vicinity\.city\/brand\/vicinity-512\.png\); the gate itself is unchanged and keeps covering every other legacy asset/);
  // the gate itself is unchanged
  assert.equal(json.policy.release_gates.legacy_immutable_metadata, "exact bytes served as long as existing assets depend on them; never redirected");
  assert.equal(MASTER_POLICY.policy.release_gates.legacy_immutable_metadata, json.policy.release_gates.legacy_immutable_metadata);
  // and the file the record names is still in the site, served on citycoin.dev (its bytes are pinned by test/persist-guard.test.js)
  assert.ok(readFileSync(new URL("../public/brand/vicinity-512.png", import.meta.url)).length > 1000);
});
