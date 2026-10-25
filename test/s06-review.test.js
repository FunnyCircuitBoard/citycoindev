// Stage S06 review (25 Oct 2026): regression tests for the two-host defects the review found in the S06 configuration, run through the real
// Worker entry (src/index.js default fetch) with the committed wrangler.jsonc settings: citycoin.dev attached and listed in SITE_ORIGINS
// beside vicinity.city (still canonical), DEPLOYMENT_ENV production.
//   R1  the "Check a link" box (GET /api/check) on the site said citycoin.dev was not official;
//   R3  the code e-mail and the wallet and Google notices sent a citycoin.dev visitor to vicinity.city, where a sign-up or session made on
//       citycoin.dev does not exist (src/hostbind.js);
//   R5  citycoin.dev served the same pages as vicinity.city with nothing asking search engines not to index the copy.
// Since stage S55 the committed settings serve citycoin.dev alone (SITE_ORIGINS https://citycoin.dev, the vicinity.city routes removed): the
// two-host behaviour is checked with S06's and the go-live's SITE_ORIGINS (TWO_HOSTS, what a rollback of S55 puts back), and the committed
// settings are checked to refuse vicinity.city. The noindex rule of R5 left public/_headers with the vicinity.city routes.
// No request here leaves this process: the fake chain answers RPC, a stand-in answers Google and Resend. Every address is a fake fixture.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import * as W from "./helpers/world.js";
import { GOOD_PASSWORD, TERMS } from "./helpers/signup.js";
import { OFFICIAL, checkOfficial } from "../src/official.js";
import { MAIL_ORIGIN, googleAddedEmail, verificationEmail, walletLinkedEmail } from "../src/mail.js";
import { mailOrigin, servedHost } from "../src/hostbind.js";
import { linkNotice } from "../src/walletlink.js";
import { googleNotice } from "../src/logins.js";
import { ACCEPTED, pagesAsCommitted, pagesBuiltWithSwitch } from "./helpers/mainswitch.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const VARS = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars;
const CC = "https://citycoin.dev", VC = "https://vicinity.city";
/** S06's and the go-live's SITE_ORIGINS (both hosts served in place): what a rollback of stage S55 puts back. */
const TWO_HOSTS = Object.freeze({ SITE_ORIGINS: "https://citycoin.dev https://vicinity.city" });

// the outside world, faked: Resend (each mail lands in `mails`), Google's token endpoint (one Google account), the test chain for the rest
const mails = [];
let googleSub = "g-s06-review";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u === "https://api.resend.com/emails") { mails.push(JSON.parse(init.body)); return new Response('{"id":"re_1"}', { status: 200 }); }
  if (u.startsWith("https://oauth2.googleapis.com/")) {
    return new Response(JSON.stringify({ id_token: "x." + Buffer.from(JSON.stringify({ iss: "accounts.google.com", aud: "gid", sub: googleSub, given_name: "G" })).toString("base64url") + ".y" }));
  }
  if (/(^|\.)jup\.ag$|raydium\.io$|dexscreener/.test(new URL(u).hostname)) return new Response("{}", { headers: { "content-type": "application/json" } });
  return W.chain()(url, init);
};
after(() => { globalThis.fetch = realFetch; W.realClock(); });
W.useClock("2026-10-20T12:00:00Z");

/** The production settings as committed, with a mail sender (a fake key) and cheap password hashing for the test. */
const world = (extra = {}) => W.newWorld({ ...VARS, GOOGLE_CLIENT_ID: "gid", RESEND_API_KEY: "rk-test", PASSWORD_ITERATIONS: "1000", ...extra });
const pending = [];
const ctx = { waitUntil: (p) => pending.push(p), passThroughOnException() {} };
/** A browser on `site`, through the Worker entry: its own cookie jar, an Origin like a real page's. */
function browser(env, site) {
  const jar = new Map();
  const send = async (path, { method = "GET", body } = {}) => {
    const headers = new Headers({ origin: site });
    if (body !== undefined) headers.set("content-type", "application/json");
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await worker.fetch(new Request(site + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
    await Promise.all(pending.splice(0));
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split("; "); const i = pair.indexOf("="); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    return res;
  };
  return { send, jar, post: async (p, b = {}) => (await send(p, { method: "POST", body: b })).json(), get: async (p) => (await send(p)).json() };
}
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
/** An e-mail sign-up on `site` up to the code e-mail: { b, mail, code }. */
async function signupMail(env, site, email) {
  const b = browser(env, site);
  for (const [path, body] of [["/api/signup/start", {}], ["/api/signup/location", { location: W.IN_UTICA, country: "US" }], ["/api/signup/terms", { version: TERMS }]]) {
    const r = await b.post(path, body);
    assert.equal(r.ok, true, `${site}${path}: ${JSON.stringify(r)}`);
  }
  const before = mails.length;
  assert.deepEqual(await b.post("/api/signup/email", { email, password: GOOD_PASSWORD }), { ok: true });
  assert.equal(mails.length, before + 1, "one code e-mail");
  const mail = mails[mails.length - 1];
  return { b, mail, code: mail.text.match(/code is (\d{6})/)[1] };
}

/* ---------------------------------------------------------------- R1: the link checker */

const OURS = ["citycoin.dev", "https://citycoin.dev", "https://citycoin.dev/launchpad?tab=new", "CITYCOIN.DEV/token"];
// the names stage S55 took off the official list (src/official.js FORMER_WEBSITES): never official again while not served
const FORMER = ["https://vicinity.city/launchpad", "vicinity.city", "www.vicinity.city", "vicinitycity.net", "vicinitycity.com", "www.vicinitycity.com"];
// the same rule as every listed name: its www. form is the name itself (www.vicinity.city, www.vicinitycity.net); the zone is the owner's
const WWW = ["www.citycoin.dev", "https://www.citycoin.dev/connect"];
const LOOKALIKES = ["citycoin.dev.evil.example", "https://evilcitycoin.dev", "citycoin.de", "citycoin.devv", "city-coin.dev", "citycoin.app",
  "https://citycoin.dev@evil.example/", "https://evil.example/citycoin.dev", "citycoin.dev.co"];

// (Until stage S55 this test ran on both served hosts, OURS held https://vicinity.city/launchpad, and /api/official listed vicinity.city,
// citycoin.dev, vicinitycity.com and vicinitycity.net. S55 serves citycoin.dev alone and takes the three old names off the list, before the
// owner puts them to other use: domain-cutover.md section 0, item 6.)
test("R1: on the served host the link checker calls citycoin.dev official, http a warning, the old names former, and no look-alike official", async () => {
  const env = world();
  for (const site of [CC]) {
    const b = browser(env, site);
    const answer = async (q) => b.get("/api/check?q=" + encodeURIComponent(q));
    for (const q of [...OURS, ...WWW]) assert.equal((await answer(q)).verdict, "official", `${site}: ${q}`);
    assert.equal((await answer("http://citycoin.dev")).verdict, "warning", `${site}: the right site over http`);
    for (const q of FORMER) {
      const a = await answer(q);
      assert.deepEqual([a.verdict, a.former], ["warning", true], `${site}: ${q} is a former address, never official`);
    }
    for (const q of LOOKALIKES) assert.equal((await answer(q)).verdict, "not_official", `${site}: ${q}`);
    const official = await b.get("/api/official");
    assert.deepEqual(official.websites, ["citycoin.dev"], `${site}: /api/official`);
  }
  assert.deepEqual(OFFICIAL.websites, ["citycoin.dev"]);
  // vicinity.city is no longer served: its checker answers nothing (421 before any route)
  const old = await browser(env, VC).send("/api/check?q=citycoin.dev");
  assert.deepEqual([old.status, (await old.json()).error], [421, "wrong_host"]);
});

test("R1: the v5 checker (MAIN_TOKEN_V5 counting, a stand-in for its page build) reads the same list", () => {
  pagesBuiltWithSwitch();
  try {
    const env = { ...ACCEPTED, MAIN_TOKEN_MINT: "FakeMainTokenMint111111111111111111111111111" };
    const check = (q) => checkOfficial(q, () => false, env).verdict;
    for (const q of [...OURS, ...WWW]) assert.equal(check(q), "official", q);
    assert.equal(check("http://citycoin.dev"), "warning");
    for (const q of LOOKALIKES) assert.equal(check(q), "not_official", q);
  } finally { pagesAsCommitted(); }
});

/* ---------------------------------------------------------------- R3: the e-mails name the host the person is on */

test("R3: a sign-up started on citycoin.dev gets a code e-mail that names citycoin.dev only, and the code works there", async () => {
  const env = world();
  const { b, mail, code } = await signupMail(env, CC, "ada.s06@example.com");
  assert.match(mail.text, /\nEnter it at https:\/\/citycoin\.dev\/connect — it expires in 10 minutes\.\n/);
  assert.deepEqual(hrefs(mail.html), ["https://citycoin.dev/connect", "https://citycoin.dev"]);
  assert.match(mail.html, /Enter this code on citycoin\.dev to finish creating your account\./);
  assert.doesNotMatch(mail.text + mail.html, /vicinity\.city/, "no link or word leads to the other host, where this sign-up does not exist");
  assert.equal((await env.DB.prepare("SELECT host FROM signups").first()).host, "citycoin.dev", "the sign-up lives on citycoin.dev");
  // the mail is exactly the builder's for that origin (the same e-mail, only the site it names differs)
  const built = verificationEmail(code, "signup", CC);
  assert.deepEqual([mail.subject, mail.text, mail.html], [built.subject, built.text, built.html]);
  // entered where the mail says: the account is made
  const done = await b.post("/api/signup/email/verify", { email: "ada.s06@example.com", code });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(done.isNew, true);
});

test("R3: on vicinity.city the code e-mail is today's, byte for byte (while it is served: S06 and the go-live); since stage S55 no sign-up starts there", async () => {
  // as committed (S55): refused before any route, so nothing is started and no mail is sent
  const committed = world(), before = mails.length;
  const refused = await browser(committed, VC).send("/api/signup/start", { method: "POST", body: {} });
  assert.deepEqual([refused.status, await refused.json()], [421, { error: "wrong_host", origin: CC }]);
  assert.equal(mails.length, before, "no e-mail");
  const env = world(TWO_HOSTS);
  const { mail, code } = await signupMail(env, VC, "bea.s06@example.com");
  const today = verificationEmail(code, "signup"); // no origin: the e-mail as it has always been
  assert.deepEqual([mail.subject, mail.text, mail.html], [today.subject, today.text, today.html]);
  assert.match(mail.text, /Enter it at https:\/\/vicinity\.city\/connect/);
});

test("R3: Google added on citycoin.dev: the notice's links and words name citycoin.dev (and Google is sent citycoin.dev's return address)", async () => {
  const env = world();
  const { b, code } = await signupMail(env, CC, "cy.s06@example.com");
  assert.equal((await b.post("/api/signup/email/verify", { email: "cy.s06@example.com", code })).ok, true);
  const add = await b.post("/api/me/google/add", { current: GOOD_PASSWORD });
  assert.equal(add.ok, true, JSON.stringify(add));
  const google = new URL(add.url);
  // the return address Google is given on citycoin.dev: it must be listed in the Google console (implementation-report.md, S06 checklist)
  assert.equal(google.searchParams.get("redirect_uri"), "https://citycoin.dev/api/auth/google/callback");
  const before = mails.length;
  googleSub = "g-s06-added";
  const back = await b.send(`/api/auth/google/callback?code=c&state=${google.searchParams.get("state")}`);
  assert.equal(back.headers.get("location"), "/dashboard?google=linked#profile");
  assert.equal(mails.length, before + 1, "the owner is told");
  const notice = mails[mails.length - 1];
  assert.equal(notice.subject, "Google sign-in was added to your Vicinity account");
  assert.match(notice.text, /on https:\/\/citycoin\.dev\/connect tap Log in/);
  assert.deepEqual(hrefs(notice.html), ["https://citycoin.dev/connect?mode=login"]);
  assert.match(notice.html, /set a new password: on citycoin\.dev tap Log in/);
  assert.doesNotMatch(notice.text + notice.html, /vicinity\.city/);
  const built = googleAddedEmail(CC);
  assert.deepEqual([notice.text, notice.html], [built.text, built.html]);
});

test("R3: mailOrigin is the host the request is served as while the binding counts, and today's vicinity.city otherwise", () => {
  const env = world();
  const at = (url, e = env) => mailOrigin(servedHost(e, new Request(url)));
  assert.equal(at("https://citycoin.dev/api/signup/email"), CC, "as committed: the e-mails name citycoin.dev");
  // since stage S55 vicinity.city is refused (it never reaches a route, so no e-mail is built there); while both hosts were listed it named itself
  assert.equal(servedHost(env, new Request("https://vicinity.city/api/signup/email")).refused, true);
  assert.equal(at("https://vicinity.city/api/signup/email", world(TWO_HOSTS)), VC);
  assert.equal(at("https://www.citycoin.dev/api/x"), MAIL_ORIGIN, "a refused host (it never reaches a route) names nothing of its own");
  assert.equal(at("https://evil.example/api/x"), MAIL_ORIGIN);
  // the binding does not count (the settings main had before S06): today's address, whatever host the request came in on
  const unbound = W.newWorld({});
  assert.equal(at("https://vicinity.test/api/signup/email", unbound), MAIL_ORIGIN);
  assert.equal(at("https://vicinity.city/api/signup/email", unbound), MAIL_ORIGIN);
  assert.equal(MAIL_ORIGIN, "https://vicinity.city");
});

test("R3: the wallet and Google notices name the origin they are given; without one they are today's e-mails, byte for byte", async () => {
  const env = world();
  const u = { provider: "email", provider_id: "dee.s06@example.com" };
  const box = [];
  const fetchImpl = async (url, init) => { box.push(JSON.parse(init.body)); return new Response('{"id":"re_1"}'); };
  await linkNotice(env, u, "Wa11et1111111111111111111111111111111111111", "phantom", null, fetchImpl, CC);
  assert.match(box[0].text, /open your dashboard on https:\/\/citycoin\.dev\/dashboard within 7 days/);
  assert.deepEqual(hrefs(box[0].html), ["https://citycoin.dev/dashboard"]);
  await googleNotice(env, u, null, fetchImpl, CC);
  assert.deepEqual(hrefs(box[1].html), ["https://citycoin.dev/connect?mode=login"]);
  await linkNotice(env, u, "Wa11et1111111111111111111111111111111111111", "phantom", null, fetchImpl);
  await googleNotice(env, u, null, fetchImpl);
  const w = walletLinkedEmail("Wa11…1111", "phantom"), g = googleAddedEmail();
  assert.deepEqual([box[2].subject, box[2].html.includes("https://vicinity.city/dashboard"), box[2].text.includes("on https://vicinity.city/dashboard")], [w.subject, true, true]);
  assert.deepEqual([box[3].text, box[3].html], [g.text, g.html]);
  // every caller passes the origin it was served as (the wallet joined, Google was added, the code was asked for, on that host)
  for (const [file, pattern] of [["src/auth.js", /linkNotice\([^\n]*mailOrigin\(servedHost\(env, request\)\)\)/], ["src/walletlink.js", /linkNotice\([^\n]*mailOrigin\(served\)\)/],
    ["src/auth.js", /finishGoogleAdd\([^\n]*mailOrigin\(served\)\)/], ["src/signup.js", /sendEmailCode\([^\n]*origin: mailOrigin\(servedHost\(env, request\)\)/],
    ["src/pwlogin.js", /sendEmailCode\([^\n]*origin: mailOrigin\(servedHost\(env, request\)\)/], ["src/legacy.js", /sendEmailCode\([^\n]*origin: mailOrigin\(servedHost\(env, request\)\)/],
    ["src/auth.js", /sendEmailCode\(env, cleanEmail[^\n]*origin: mailOrigin\(servedHost\(env, request\)\)/]]) assert.match(read(file), pattern, `${file}: ${pattern}`);
});

test("R3: an origin that is not exactly an http(s) origin with a plain host falls back to today's address (never written into a mail)", () => {
  const today = verificationEmail("123456", "signin");
  for (const bad of ["https://citycoin.dev/connect", "https://citycoin.dev/", "javascript:alert(1)", 'https://evil"x', "https://a b", "", null, 5, {}])
    assert.deepEqual(verificationEmail("123456", "signin", bad), today, JSON.stringify(bad));
  assert.match(verificationEmail("123456", "signin", "http://localhost:8787").text, /Enter it at http:\/\/localhost:8787\/connect/, "a local run names itself");
});

/* ---------------------------------------------------------------- R5: citycoin.dev is not indexed as a copy */

/** public/_headers as rules: [{ pattern, headers: [[name, value]] }] (comments and blank lines dropped). */
function headerRules() {
  const rules = [];
  for (const line of read("public/_headers").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^(https:\/\/|\/)/.test(t)) rules.push({ pattern: t, headers: [] });
    else { const i = t.indexOf(":"); rules[rules.length - 1].headers.push([t.slice(0, i).trim(), t.slice(i + 1).trim()]); }
  }
  return rules;
}
/** The static-assets engine's matching (workers-shared rules-engine, as wrangler 4.137 bundles it): a rule that starts with https:// is
 *  matched against https://<host><path>, any other against the path; "*" matches anything. */
const matches = (pattern, url) => {
  const u = new URL(url);
  const re = new RegExp("^" + pattern.split("*").map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join(".*") + "$");
  return re.test(pattern.startsWith("https://") ? `https://${u.hostname}${u.pathname}` : u.pathname);
};
const headersFor = (url) => headerRules().filter((r) => matches(r.pattern, url)).flatMap((r) => r.headers);

// The go-live (the owner's go of 25 Oct 2026) moved the rule: citycoin.dev is the canonical site (SITE_ORIGIN) and is indexed (master v5
// section 06: "Production is indexable as intended"), and the copies vicinity.city and www.vicinity.city carried the noindex while they served.
// Stage S55 removed their routes and, with them, the two host rules (domain-cutover.md section 4, "Before step 4"): public/_headers has no
// host rule and no X-Robots-Tag at all, as before S06. (Until S55 this test asserted the two vicinity.city rules.)
test("R5, as ended by stage S55: no page or file carries X-Robots-Tag; citycoin.dev is indexed, and the security headers are the same for every path", () => {
  const rules = headerRules();
  assert.deepEqual(rules.filter((r) => r.pattern.startsWith("https://")), [], "no host rule");
  assert.deepEqual(rules.filter((r) => r.headers.some(([k]) => k === "X-Robots-Tag")), [], "no X-Robots-Tag rule");
  assert.deepEqual(rules.map((r) => r.pattern), ["/*", "/fonts/*"], "the two path rules, as before S06");
  for (const path of ["/", "/token", "/connect", "/style.css", "/fonts/x.woff2", "/no-such-page"]) {
    const cc = headersFor(CC + path);
    assert.deepEqual(cc.filter(([k]) => k === "X-Robots-Tag"), [], `citycoin.dev${path}: indexed`);
    for (const host of ["vicinity.city", "www.vicinity.city", "www.citycoin.dev"]) assert.deepEqual(headersFor(`https://${host}${path}`), cc, `${host}${path}: no rule names a host`);
  }
});
