// The go-live review's findings on the switch-on itself (implementation-report.md section 11, "Go-live switch-on", the review follow-ups), one
// regression test each, against the committed files and the Worker with the committed settings (read past the suite's stand-in for today's site):
//   GL-SAFE-2  WALLET_ONLY holds closed when it is not exactly "on" over pages built wallet-only, or holds a value outside its set
//   GL-2       no page offers the tiny-transfer sign-in (the home FAQ did)
//   GL-3       the town request promises no location check and no Country Manager
//   GL-6       the Rules and /app say new city-coin launches wait for the Citycoin.dev token
//   GL-HON-6   no page promises check-ins (the Terms' Services list included)
//   GL-4       no badge nobody can earn is offered "to earn"
//   GL-HON-9   the Terms acceptance records only the edition the pages publish
// Fake wallets and fake data only; nothing here reaches a network.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as W from "./helpers/world.js";
import { committedFile, realWrangler } from "./helpers/today-build.mjs";
import { member, outbox } from "./helpers/signup.js";
import { varsOf } from "../scripts/brand/wrangler-vars.mjs";
import { CITYCOIN_BRAND } from "../src/brand.js";
import { SAME, wordsOf } from "../src/brandwords.js";
import { badgesFor } from "../src/me.js";
import { Doc, parse } from "./helpers/pagedom.js";
import { _pagesBuiltForTests, _resetPolicyCheck, checkPolicyConfig, walletOnly, walletOnlyHeld, walletOnlyRefusals } from "../src/v5policy.js";

const V = varsOf(realWrangler());
const RECORD = committedFile("src/pages-built.js", "utf8");
const BUILT = Object.fromEntries([.../export const PAGES_BUILT = Object\.freeze\((\{[^}]*\})\);/.exec(RECORD)[1].matchAll(/(\w+): ("[^"]*"|true|false)/g)].map(([, k, v]) => [k, JSON.parse(v)]));
const page = (f) => committedFile(`public/${f}`, "utf8");
/** What a page shows before any script runs (as test/golive-config.test.js reads it): the text outside hidden parts, scripts and styles. */
function shown(html) {
  const doc = new Doc();
  for (const n of parse(doc, html)) doc.append(n);
  const out = [];
  const walk = (n) => {
    if (n.tagName) {
      if (n.hasAttribute("hidden") || ["SCRIPT", "STYLE", "TEMPLATE", "HEAD"].includes(n.tagName)) return;
      for (const c of n.childNodes) walk(c);
    } else if (n.textContent) out.push(n.textContent);
  };
  walk(doc);
  return out.join(" ").replace(/\s+/g, " ");
}
const answer = async (res) => [res.status, await res.json()];
const signed = async (b, w, purpose) => {
  const c = await b.post("/api/auth/challenge", { purpose, address: w.address });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message) };
};

beforeEach(() => { W.useClock("2026-10-25T12:00:00Z"); _resetPolicyCheck(); _pagesBuiltForTests(null); });
after(() => { W.realClock(); _pagesBuiltForTests(null); });

/* ---------------------------------------------------------------- GL-SAFE-2: the switch fails closed */

test("GL-SAFE-2: over the committed (wallet-only) pages, WALLET_ONLY missing, blank, 'off' or a typo holds sign-in closed; it never reopens Google, e-mail or a Google-only session", async () => {
  assert.equal(BUILT.walletOnly, true, "the committed pages are built wallet-only");
  // a member made by today's sign-up before the switch (today's pages: the suite's stand-in), signed in with Google only
  // (made with today's settings on the same database, as production had them before the switch; its session, made with no host
  // configured, is vicinity.city's: src/hostbind.js)
  const env = W.V2({ ...V, SOLANA_RPC_URL: "https://rpc.test", GOOGLE_CLIENT_ID: "gid" }); // (the fake Google's client id)
  delete env.WALLET_ONLY;
  const today = { ...env };
  for (const k of ["SITE_ORIGIN", "SITE_ORIGINS", "DEPLOYMENT_ENV", "BRAND", "LEGACY_SEATS", "LEGACY_LAUNCH", "EMAIL_FROM"]) delete today[k];
  const made = await member(today, outbox(), { via: "google", sub: "gsafe2" });
  const g = { b: W.browser(env, { site: "https://vicinity.city" }) };
  for (const [k, v] of made.b.jar) g.b.jar.set(k, v);
  assert.equal((await g.b.get("/api/me")).signedIn, true, "today's pages, the switch unset: today's site");
  _pagesBuiltForTests(BUILT);
  for (const value of [undefined, "", "off", "true", "yes", "1"]) {
    if (value === undefined) delete env.WALLET_ONLY; else env.WALLET_ONLY = value;
    _resetPolicyCheck();
    const what = JSON.stringify(value);
    assert.equal(walletOnly(env), false, what);
    assert.equal(walletOnlyHeld(env), true, `${what}: held`);
    const codes = walletOnlyRefusals(env);
    assert.ok(codes.includes("WALLET_ONLY_UNSET_PAGES_WALLET_ONLY"), `${what}: ${codes}`);
    assert.equal(codes.includes("WALLET_ONLY_VALUE_REFUSED"), !["", "off", undefined].includes(value), `${what}: ${codes}`);
    const lines = [];
    checkPolicyConfig(env, { log: (...a) => lines.push(a.join(" ")) });
    assert.ok(lines.includes("wallet-only switch refused WALLET_ONLY_UNSET_PAGES_WALLET_ONLY"), `${what}: the line alerts page on\n${lines.join("\n")}`);
    const b = W.browser(env, { site: "https://citycoin.dev" });
    for (const [m, p] of [["GET", "/api/auth/google/start"], ["POST", "/api/auth/email/login"], ["POST", "/api/auth/email/start"], ["POST", "/api/auth/password/reset/start"], ["POST", "/api/auth/transfer/check"]])
      assert.equal((await b.send(p, { method: m, body: m === "POST" ? { email: "x@example.com", password: "p" } : undefined })).status, 404, `${what} ${m} ${p}`);
    for (const p of ["/api/signup/start", "/api/auth/challenge", "/api/pair"]) assert.deepEqual(await answer(await b.send(p, { method: "POST", body: {} })), [503, { ok: false, error: "unavailable" }], `${what} ${p}`);
    const me = await g.b.get("/api/me");
    assert.deepEqual([me.signedIn, me.walletOnly], [false, true], `${what}: the Google-only session does not count, and the pages are told wallet-only`);
  }
  // exactly "on": the switch counts (registration open again, Google still gone)
  env.WALLET_ONLY = "on"; _resetPolicyCheck();
  assert.deepEqual([walletOnly(env), walletOnlyHeld(env)], [true, false]);
  assert.equal((await W.browser(env, { site: "https://citycoin.dev" }).send("/api/signup/start", { method: "POST", body: {} })).status, 200);
  // today's pages (built without it): only a value outside the switch's set holds; unset and "off" are today's site
  _pagesBuiltForTests(null);
  for (const [value, held] of [[undefined, false], ["off", false], ["", false], ["true", true]]) {
    if (value === undefined) delete env.WALLET_ONLY; else env.WALLET_ONLY = value;
    _resetPolicyCheck();
    assert.deepEqual([walletOnly(env), walletOnlyHeld(env)], [false, held], JSON.stringify(value));
  }
});

/* ---------------------------------------------------------------- the copy (GL-2, GL-3, GL-6, GL-HON-6) */

test("GL-2, GL-3, GL-6, GL-HON-6: the committed pages offer no tiny transfer, promise no location check, Country Manager, check-in or launch before the token", () => {
  // (the dashboard's panels are hidden until its script runs: its words are read with the hidden parts)
  const words = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const index = words(page("index.html")), dash = words(page("dashboard.html")), cities = shown(page("cities.html")), rules = shown(page("rules.html"));
  const app = shown(page("app.html")), terms = shown(page("terms.html"));
  // GL-2: the app-wallet answer names the ways that work under wallet-only sign-in (the FAQ's other tabs are hidden until clicked: read whole)
  assert.doesNotMatch(index, /App wallet \(FOMO|tiny, exact amount|to yourself/);
  assert.doesNotMatch(shown(page("index.html")), /App wallet \(FOMO|tiny, exact amount|to yourself/);
  assert.match(index, /I use FOMO \(or another app wallet\)\. How do I connect\? Open this site in the wallet app's own browser and connect there\. On a computer, choose "Wallet on my phone" and approve with your phone's wallet app\./);
  assert.match(page("connect.html"), /<strong>Wallet on my phone<\/strong>/, "the label the answer names is the one /connect shows");
  // GL-3: the town request
  for (const [f, t] of [["index.html", index], ["dashboard.html", dash], ["cities.html", cities]]) assert.doesNotMatch(t, /Stand in the town|checks location|Country Manager (gives advice|approves|to add)/, f);
  assert.match(dash, /Ask for a town near your city\. An admin decides; approved towns join the map at the next update\. /);
  assert.match(page("dashboard.html"), /<button class="btn btn--glass btn--sm" type="submit">Send request<\/button>/);
  assert.match(cities, /Town missing\? Ask for it from your dashboard →/);
  assert.match(index, /ask for your town to become its own community from your dashboard; an admin decides\./);
  // GL-6: launches wait for the token
  assert.doesNotMatch(rules, /the active founder designs it|An admin approves it on chain before launch/);
  assert.match(rules, /The city's coin: new city-coin launches on this launchpad are closed until the Citycoin\.dev token is live\. Coins already launched keep trading/);
  assert.doesNotMatch(app, /as it launches/);
  assert.match(app, /New city coins launch once the Citycoin\.dev token is live\./);
  assert.doesNotMatch(index, /Launchpad lets each city launch its coin/);
  // GL-HON-6: no check-in promised (the feed's "Check-ins" filter, for earlier ones, and the Terms' definition of a Submission stay)
  for (const [f, html] of [["index.html", page("index.html")], ["dashboard.html", page("dashboard.html")]]) {
    assert.doesNotMatch(html, /check-ins and votes|memes, check-ins|local memes and check-ins|Memes, check-ins and discussions/, f);
  }
  assert.match(terms, /\(d\) community features such as memes, discussions, badges, and holder verification;/);
  assert.doesNotMatch(terms, /memes, check-ins, discussions/);
});

/* ---------------------------------------------------------------- GL-4: badges */

test("GL-4: badges nobody can earn are not offered: Early member under the Citycoin.dev labels, City Founder and Country Manager while the seats are frozen; earned ones stay", () => {
  const CC = wordsOf(CITYCOIN_BRAND);
  const base = { u: { early: 0, wallet: "W1", home_city: "5142056" }, launched: false, amount: 0, position: null, seat: null, manager: false, admin: false, checkins: 0, posts: 0, tenure: null, threshold: null };
  const ids = (o) => badgesFor({ ...base, ...o }).map((b) => b.id);
  const cc = ids({ bw: CC, legacyFrozen: true, walletOnly: true });
  for (const id of ["early", "city_founder", "country_manager", "streak"]) assert.ok(!cc.includes(id), `${id}: not offered (${cc})`);
  assert.deepEqual(cc, ["verified", "wallet", "local", "voice"]);
  // earned: kept, as records
  const earned = badgesFor({ ...base, u: { ...base.u, early: 1 }, seat: { status: "active" }, manager: true, bw: CC, legacyFrozen: true, walletOnly: true });
  for (const id of ["early", "city_founder", "country_manager"]) assert.ok(earned.find((b) => b.id === id && b.earned), id);
  assert.equal(earned.find((b) => b.id === "city_founder").detail, "A founder seat on record.");
  // today's labels: Early member is offered as before; frozen seats still drop the founder and manager badges
  assert.ok(ids({ bw: SAME, legacyFrozen: true }).includes("early"));
  assert.ok(!ids({ bw: SAME, legacyFrozen: true }).includes("city_founder"));
  assert.deepEqual(ids({ bw: SAME }).filter((id) => ["early", "city_founder", "country_manager"].includes(id)), ["early", "city_founder", "country_manager"], "nothing frozen, today's labels: as before");
});

/* ---------------------------------------------------------------- GL-HON-9 and GL-4 through the Worker as committed */

test("GL-HON-9 and GL-4: with the committed settings a new member is offered no unearnable badge, and the Terms acceptance takes only the published edition", async () => {
  _pagesBuiltForTests(BUILT);
  const env = W.newWorld({ ...V, SOLANA_RPC_URL: "https://rpc.test" });
  const b = W.browser(env, { site: "https://citycoin.dev" }), w = await W.wallet();
  await b.post("/api/signup/start");
  await b.post("/api/signup/location", { location: W.IN_UTICA, country: "US" });
  await b.post("/api/signup/terms", { version: "2026-10-25" });
  assert.equal((await b.send("/api/signup/wallet", { method: "POST", body: await signed(b, w, "register") })).status, 200);
  const me = await b.get("/api/me");
  const offered = (me.badges || []).filter((x) => !x.earned).map((x) => x.id);
  for (const id of ["early", "city_founder", "country_manager", "streak"]) assert.ok(!offered.includes(id), `${id} is not offered to earn (${offered})`);
  for (const version of ["2099-01-01", "2026-10-01", "2026-10-24"]) {
    assert.deepEqual(await answer(await b.send("/api/me/terms", { method: "POST", body: { version } })), [400, { ok: false, error: "bad_version", current: "2026-10-25" }], version);
  }
  assert.equal((await env.DB.prepare("SELECT terms_version FROM users WHERE wallet = ?").bind(w.address).first()).terms_version, "2026-10-25", "nothing made-up was stored");
  assert.deepEqual(await b.post("/api/me/terms", { version: "2026-10-25" }), { ok: true, version: "2026-10-25" });
});
