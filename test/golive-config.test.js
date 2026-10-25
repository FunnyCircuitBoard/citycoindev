// The go-live switch-on of Citycoin.dev (master v5; implementation-report.md section 11, "Go-live switch-on"), on the owner's go of 25 Oct 2026, in
// writing: "I still see nothing on Citycoin.dev. Vicinity still active. What are you doing? Get them all sorted. Don't wait for my permission just
// go ahead and execute all the changes." What is checked here, against the committed files (read past the suite's stand-in for today's site,
// test/helpers/today-build.mjs): the committed wrangler.jsonc, the pages and the record it builds, the two-way rule between the label set and
// wallet-only sign-in, the wallet-only copy (the S15 gate, review finding F3), the editions of the Rules and the Terms, the moved noindex rule,
// a rollback to the previous values, and the Worker with the committed settings on both served hosts (registration with a fake wallet and the
// location once, sign-in, the refused Google, e-mail and password routes, the frozen seat writers, the closed launch writers, a swap quote of the
// fake Jupiter, the job). Fake wallets and fake data only; nothing here reaches a network.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as W from "./helpers/world.js";
import { committedFile, realWrangler, todayWrangler, TODAY_EMAIL_FROM } from "./helpers/today-build.mjs";
import { varsOf } from "../scripts/brand/wrangler-vars.mjs";
import { trialPlan } from "../scripts/brand/switch-trial.mjs";
import { ACCOUNT_LINKS_WALLET_ONLY, buildPages, buildStandalonePages, frozenFor, pageBrandPrerequisites, pageV5Config, pageWalletOnly, pagesBuiltSource,
  walletOnlyCopy } from "../scripts/pages/build.mjs";
import { WALLET_ONLY_COPY } from "../scripts/pages/walletonly-copy.mjs";
import { CITYCOIN_BRAND, LEGACY_BRAND } from "../src/brand.js";
import { escBrand } from "../src/footer-social.js";
import { EDITIONS, TERMS_TODAY, editionFor, rulesEdition, rulesVersion, termsVersion } from "../src/editions.js";
import { TERMS_VERSION } from "../src/signup-core.js";
import { POLICY } from "../src/policy.js";
import { _pagesBuiltForTests, _resetPolicyCheck, legacyLaunch, legacySeats, walletOnly } from "../src/v5policy.js";
import { siteConfig } from "../src/site-config.js";
import { Doc, parse } from "./helpers/pagedom.js";
import { fakeJupiter, SOL, USDC } from "./helpers/jupfake.js";
import { runJobs } from "../src/jobs.js";

const QUOTE = "I still see nothing on Citycoin.dev. Vicinity still active. What are you doing? Get them all sorted. Don't wait for my permission just go ahead and execute all the changes.";
const TEXT = realWrangler();
const WR = JSON.parse(TEXT.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
const V = varsOf(TEXT);
const RECORD = committedFile("src/pages-built.js", "utf8");
const BUILT = Object.fromEntries([.../export const PAGES_BUILT = Object\.freeze\((\{[^}]*\})\);/.exec(RECORD)[1].matchAll(/(\w+): ("[^"]*"|true|false)/g)].map(([, k, v]) => [k, JSON.parse(v)]));
const PAGES = readFileSync(new URL("../scripts/pages/src/", import.meta.url).pathname.replace(/\/$/, "") + "/index.html", "utf8") && ["404.html", "admin.html", "app.html", "cities.html", "coin.html",
  "connect.html", "credits.html", "dashboard.html", "index.html", "launchpad.html", "locate.html", "official.html", "profile.html", "rules.html", "terms.html", "token.html"];

beforeEach(() => { W.useClock("2026-10-25T12:00:00Z"); _resetPolicyCheck(); });
after(() => { W.realClock(); _pagesBuiltForTests(null); });

/* ---------------------------------------------------------------- the committed configuration */

test("the committed wrangler.jsonc carries the go-live settings, each with a comment naming the owner's go of 25 Oct 2026, and nothing more", () => {
  assert.deepEqual([V.BRAND, V.LEGACY_SEATS, V.LEGACY_LAUNCH, V.WALLET_ONLY, V.EMAIL_FROM, V.SITE_ORIGIN, V.SITE_ORIGINS, V.DEPLOYMENT_ENV],
    ["citycoin", "frozen", "off", "on", "Citycoin.dev <noreply@citycoin.dev>", "https://citycoin.dev", "https://citycoin.dev https://vicinity.city", "production"]);
  // LEGACY_LINK stays unset (production has had 0 members since 24 Oct 2026: no Google- or e-mail-only account to link), and so does every
  // switch this pull request does not move (HOST_REDIRECT is never to be set: the owner's decision of 24 Oct 2026, no forwarding)
  for (const k of ["LEGACY_LINK", "LEGACY_LINK_UNTIL", "HOST_REDIRECT", "MAIN_TOKEN_V5", "MAIN_TOKEN_MINT", "PUBLIC_V5", "SELECTION_V5", "LAUNCH_V5", "CC_TRADING", "CC_HOURLY"])
    assert.equal(Object.hasOwn(V, k), false, `${k} is not set`);
  assert.equal(Object.keys(V).at(-1), "FEED_V2", "FEED_V2 stays the last setting");
  assert.deepEqual(WR.routes, [{ pattern: "citycoin.dev", custom_domain: true }, { pattern: "vicinity.city", custom_domain: true }, { pattern: "www.vicinity.city", custom_domain: true }], "the routes are unchanged");
  assert.deepEqual(WR.triggers, { crons: ["*/10 * * * *"] }, "one cron");
  // each new or changed setting: the comment block right above its line names the owner's go of 25 Oct 2026, and the go itself is quoted once
  const lines = TEXT.split("\n");
  for (const k of ["EMAIL_FROM", "SITE_ORIGIN", "BRAND", "LEGACY_SEATS", "LEGACY_LAUNCH", "WALLET_ONLY"]) {
    const at = lines.findIndex((l) => l.trim().startsWith(`"${k}":`));
    let i = at - 1, block = "";
    while (i >= 0 && lines[i].trim().startsWith("//")) block = lines[i--].trim().replace(/^\/\/\s*/, "") + " " + block;
    assert.match(block, /owner's go of 25 Oct 2026/i, `${k}: its comment names the owner's go`);
    assert.match(block, /roll back|rollback/i, `${k}: its comment says how to roll it back (a value, never a deleted line)`);
  }
  assert.equal(TEXT.replace(/\n\s*\/\/\s*/g, " ").split(QUOTE).length - 1, 1, "the owner's words, quoted once as written");
  // the site settings: citycoin.dev canonical while vicinity.city still serves in place
  const site = siteConfig(V);
  assert.deepEqual([site.origin, site.hosts, site.problems], ["https://citycoin.dev", ["citycoin.dev", "vicinity.city"], []]);
  assert.deepEqual(pageV5Config(V), { ok: true });
});

test("the page build: the committed settings build the Citycoin.dev pages with the freeze and the wallet-only copy; the record says so, and the CI trial writes nothing", () => {
  assert.deepEqual(pageBrandPrerequisites(V), { ok: true });
  assert.deepEqual(pageWalletOnly(V), { walletOnly: true });
  assert.equal(pagesBuiltSource(V, WR.assets), RECORD, "src/pages-built.js is the record of the committed settings");
  assert.deepEqual(BUILT, { mainTokenV5: false, brand: "citycoin", pagesReachWorker: false, legacySeats: "frozen", walletOnly: true });
  const p = trialPlan(TEXT);
  assert.equal(p.action, "noop", p.reason);
  assert.match(p.line, /already sets the switch with its prerequisites \(BRAND=citycoin, LEGACY_SEATS=frozen, DEPLOYMENT_ENV=production, WALLET_ONLY=on, SITE_ORIGIN=https:\/\/citycoin\.dev, EMAIL_FROM without the old name\)/);
  // the suite's stand-in for today's site takes back the label set, the freeze, wallet-only sign-in and the sender, and keeps the rest as committed
  const today = varsOf(todayWrangler(TEXT));
  for (const k of ["BRAND", "LEGACY_SEATS", "WALLET_ONLY"]) assert.equal(Object.hasOwn(today, k), false, k);
  assert.equal(today.EMAIL_FROM, TODAY_EMAIL_FROM);
  assert.deepEqual([today.SITE_ORIGIN, today.SITE_ORIGINS, today.DEPLOYMENT_ENV, today.LEGACY_LAUNCH], [V.SITE_ORIGIN, V.SITE_ORIGINS, "production", "off"]);
});

test("one edition, one text: WALLET_ONLY=on is built only with BRAND=citycoin, and BRAND=citycoin only with WALLET_ONLY=on and its inputs", () => {
  const without = (o, ...ks) => { const c = { ...o }; for (const k of ks) delete c[k]; return c; };
  assert.throws(() => pageBrandPrerequisites(without(V, "WALLET_ONLY")), /BRAND=citycoin in wrangler\.jsonc needs, in the same pull request: WALLET_ONLY=on \(with SITE_ORIGIN, SITE_ORIGINS and DEPLOYMENT_ENV\)/);
  assert.throws(() => pageBrandPrerequisites({ ...V, WALLET_ONLY: "off" }), /WALLET_ONLY=on/);
  assert.throws(() => pageWalletOnly(without(V, "BRAND")), /WALLET_ONLY=on in wrangler\.jsonc needs BRAND=citycoin/);
  assert.deepEqual(pageWalletOnly(without(V, "SITE_ORIGIN")), { walletOnly: true }, "SITE_ORIGINS alone is a configuration the Worker accepts (its first origin canonical)");
  assert.throws(() => pageWalletOnly(without(V, "SITE_ORIGIN", "SITE_ORIGINS")), /WALLET_ONLY=on in wrangler\.jsonc with a configuration the Worker refuses \(WALLET_ONLY_SITE_REFUSED/);
  assert.throws(() => pageWalletOnly({ ...V, DEPLOYMENT_ENV: "" }), /WALLET_ONLY_POLICY_REFUSED/);
  assert.deepEqual(pageWalletOnly(without(V, "WALLET_ONLY")), { walletOnly: false });
  assert.deepEqual(pageWalletOnly({ ...V, WALLET_ONLY: " ON " }), { walletOnly: true }, "the letter case the Worker accepts");
});

/* ---------------------------------------------------------------- the wallet-only copy (S15 gate, review finding F3) */

test("the wallet-only copy: written for the Citycoin.dev pages only, each passage found exactly once (a source edited without it stops the build)", () => {
  const B = escBrand(CITYCOIN_BRAND);
  assert.deepEqual(Object.keys(WALLET_ONLY_COPY).sort(), ["connect.html", "dashboard.html", "index.html", "rules.html", "terms.html"]);
  for (const [f, entry] of Object.entries(WALLET_ONLY_COPY)) {
    assert.equal(frozenFor(f, entry, LEGACY_BRAND), null, `${f}: never applied to today's label set`);
    const r = frozenFor(f, entry, CITYCOIN_BRAND, B);
    for (const [old, next] of r.replace) {
      assert.match(old, /google|e-?mail|password|then sign in\. Link a wallet later|<span>Connect your wallet<\/span>/i, `${f}: every passage replaced offers or describes a Google, e-mail or password way in, or today's order (a wallet later)`);
      assert.doesNotMatch(next.replace(/No password: you sign in|There is no password to keep: you sign in/g, ""), /google|e-?mail|password/i, `${f}: no replacement offers one`);
      assert.doesNotMatch(next, /vicinity|\{\{|<!--@/i, `${f}: resolved and in the label set's words`);
    }
  }
  // the build stops on a passage it cannot find exactly once
  assert.throws(() => walletOnlyCopy("index.html", "no such text\n", { replace: [["a passage\n", "b\n"]] }), /index\.html: wallet-only copy passage 1 is not in the source exactly once/);
  assert.throws(() => walletOnlyCopy("index.html", "x\nx\n", { replace: [["x\n", "y\n"]] }), /not in the source exactly once/);
  // built in memory both ways: with the copy, no page says "per Google login or verified e-mail"; without it, the Rules still do
  const site = siteConfig(V);
  const on = new Map([...buildPages({ brand: CITYCOIN_BRAND, site, walletOnly: true }), ...buildStandalonePages({ brand: CITYCOIN_BRAND, site, walletOnly: true })]);
  const off = new Map(buildPages({ brand: CITYCOIN_BRAND, site, walletOnly: false }));
  for (const [f, html] of on) assert.doesNotMatch(html, /per Google login or verified e-mail|Wallet \+ Google or e-mail|link a Google account/, f);
  assert.match(off.get("rules.html"), /One account per wallet and per Google login or verified e-mail/);
  assert.throws(() => buildPages({ brand: CITYCOIN_BRAND, walletOnly: "on" }), /walletOnly must be true or false/);
  // the account sheet's entry names what that part of the dashboard holds under wallet-only sign-in
  assert.deepEqual(ACCOUNT_LINKS_WALLET_ONLY.find((l) => l[0] === "account").slice(0, 4), ["account", "/dashboard#profile-account", "Account", "Wallet, sign-in and phone"]);
});

/** What a page shows before any script runs: the text outside hidden parts, scripts and styles, the title, the description and the shown labels. */
function shown(html) {
  const doc = new Doc();
  for (const n of parse(doc, html)) doc.append(n);
  const out = [];
  const walk = (n) => {
    if (n.tagName) {
      if (n.hasAttribute("hidden") || ["SCRIPT", "STYLE", "TEMPLATE", "HEAD"].includes(n.tagName)) return;
      for (const a of ["aria-label", "placeholder", "alt", "title"]) { const v = n.getAttribute(a); if (v) out.push(v); }
      for (const c of n.childNodes) walk(c);
    } else if (n.textContent) out.push(n.textContent);
  };
  walk(doc);
  const title = /<title>([^<]*)<\/title>/.exec(html), desc = /<meta name="description" content="([^"]*)"/.exec(html);
  return [title ? title[1] : "", desc ? desc[1] : "", ...out].join(" ").replace(/\s+/g, " ");
}
const ALLOWED = [/No password: you sign in by signing a free message with your wallet\./g, /There is no password to keep: you sign in by signing a free message with your wallet, never a transaction\./g,
  /RPC infrastructure, hosting, analytics, and e-mail delivery\./g, /No links, wallet addresses, e-mail addresses or phone numbers\./g];

test("the committed pages: no \"vicinity\" anywhere; nothing shown offers Google, e-mail or password sign-in; the account rule, the Terms and the Rules say wallet sign-in", () => {
  const pages = new Map(PAGES.map((f) => [f, committedFile(`public/${f}`, "utf8")]));
  for (const [f, html] of pages) {
    assert.doesNotMatch(html, /vicinity/i, `${f}: no "vicinity" in any letter case`);
    assert.doesNotMatch(html, /per Google login or verified e-mail|Wallet \+ Google or e-mail|link a Google account or (a )?verified e-mail/, `${f}: no account rule of today's sign-in, shown or not`);
    let text = shown(html);
    for (const a of ALLOWED) text = text.replace(a, "");
    assert.deepEqual(text.match(/.{0,50}(google|e-?mail|password).{0,50}/gi) || [], [], `${f}: what the page shows before any script`);
    assert.match(html, /<html lang="en" data-brand="citycoin" data-brand-name="Citycoin\.dev" data-brand-domain="Citycoin\.dev" data-terms="2026-10-25">/, f);
    assert.match(html, /<span>Wallet, sign-in and phone<\/span>/, `${f}: the account sheet`);
  }
  const has = (f, s) => assert.ok(pages.get(f).includes(s), `${f}: ${s.slice(0, 90)}`);
  has("rules.html", "<li>One account per wallet: you sign in with it. It makes fake accounts harder, but no online check can prove someone is one unique person (one person can have several wallets).</li>");
  has("rules.html", 'Rules &amp; fairness · version <span data-rule="version">7</span> · in effect since <span data-rule="effectiveAt">2026-10-25</span>');
  has("terms.html", "Updated October 25, 2026 · Version 2026-10-25");
  has("terms.html", "<p>You may use the Services by proving control of a Solana wallet: you sign in by signing a free message with it, and your account is tied to that wallet.");
  has("terms.html", "connect a third-party wallet and sign in with it;");
  has("index.html", "then sign one free message with your Solana wallet: you're in.");
  has("dashboard.html", 'rules version <span data-policy-version>7</span>');
  has("dashboard.html", '<p class="tiny muted" id="out-cta-note">Verify your city once, then connect your wallet. We keep your city/country, not your raw GPS coordinates.</p>');
  assert.match(pages.get("connect.html"), /<meta name="description" content="Join Citycoin\.dev: share your location once to find your community, then sign one free message with your Solana wallet\. Members sign in with the same wallet\.">/);
  // the /cities founder requirement of today's sign-up is gone with the freeze's copy (S16), and nothing replaced it with a sign-in claim
  assert.doesNotMatch(pages.get("cities.html"), /claim-reqs|A local account/);
});

/* ---------------------------------------------------------------- the editions of the Rules and the Terms (owner decision 2) */

test("the editions: today's pages keep Rules 6 and Terms 2026-10-01; the Citycoin.dev pages carry Rules 7 and Terms 2026-10-25, in effect since 25 Oct 2026", () => {
  assert.equal(TERMS_VERSION, TERMS_TODAY);
  assert.deepEqual(EDITIONS[""], { rules: { version: POLICY.version, effectiveAt: POLICY.effectiveAt }, terms: "2026-10-01" });
  assert.deepEqual(EDITIONS.citycoin, { rules: { version: 7, effectiveAt: "2026-10-25" }, terms: "2026-10-25" });
  assert.equal(editionFor("nope"), EDITIONS[""]);
  assert.equal(editionFor("__proto__"), EDITIONS[""]);
  // the suite's stand-in reads today's build: today's edition, whatever BRAND says (a dashboard-only BRAND changes no page, so no version)
  _pagesBuiltForTests(null);
  for (const env of [{}, { BRAND: "citycoin" }]) {
    assert.equal(termsVersion(env), "2026-10-01");
    assert.deepEqual(rulesEdition(env), { version: 6, effectiveAt: "2026-10-16" });
  }
  // the committed build: the Citycoin.dev edition, whatever BRAND says (a Worker setting that differs keeps the pages' label set, F12)
  _pagesBuiltForTests(BUILT);
  try {
    for (const env of [{ BRAND: "citycoin" }, {}, { BRAND: "x" }]) {
      assert.equal(termsVersion(env), "2026-10-25");
      assert.deepEqual(rulesEdition(env), { version: 7, effectiveAt: "2026-10-25" });
      assert.equal(rulesVersion(env), 7);
    }
  } finally { _pagesBuiltForTests(null); }
});

/* ---------------------------------------------------------------- the moved noindex rule */

test("public/_headers: citycoin.dev (canonical, SITE_ORIGIN) is indexed; every other host this Worker serves pages on carries X-Robots-Tag: noindex", () => {
  const rules = [];
  for (const line of readFileSync(new URL("../public/_headers", import.meta.url), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^(https:\/\/|\/)/.test(t)) rules.push({ rule: t, set: [] }); else rules.at(-1).set.push(t);
  }
  const noindex = rules.filter((r) => r.set.includes("X-Robots-Tag: noindex")).map((r) => r.rule);
  const served = [...siteConfig(V).hosts, ...WR.routes.map((r) => r.pattern)];
  const canonical = siteConfig(V).host;
  assert.deepEqual(noindex, [...new Set(served)].filter((h) => h !== canonical).map((h) => `https://${h}/*`), "a noindex rule for each served host but the canonical one");
  assert.ok(!noindex.some((r) => r.includes(canonical)), "citycoin.dev's pages carry no noindex");
});

/* ---------------------------------------------------------------- rollback */

test("rollback: one pull request that puts the previous values back (lines kept, values changed: keep_vars) builds today's pages and record again", () => {
  const back = { ...V, BRAND: "", LEGACY_SEATS: "on", LEGACY_LAUNCH: "on", WALLET_ONLY: "off", SITE_ORIGIN: "", EMAIL_FROM: TODAY_EMAIL_FROM };
  assert.deepEqual(pageBrandPrerequisites(back), { ok: true });
  assert.deepEqual(pageWalletOnly(back), { walletOnly: false });
  assert.deepEqual(pageV5Config(back), { ok: true });
  assert.equal(legacySeats(back), "on");
  assert.equal(legacyLaunch(back), "on");
  assert.equal(walletOnly(back), false);
  assert.equal(siteConfig(back).origin, "https://vicinity.city", "vicinity.city canonical again (S06's settings)");
  assert.equal(pagesBuiltSource(back, WR.assets), readFileSync(new URL("../src/pages-built.js", import.meta.url), "utf8"), "today's record (the stand-in's)");
  // the pages: today's, byte for byte (the stand-in serves today's build for public/<page>)
  for (const [f, html] of [...buildPages(), ...buildStandalonePages()]) assert.equal(html, readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8"), f);
});

/* ---------------------------------------------------------------- the Worker with the committed settings, on both served hosts */

const answer = async (res) => [res.status, await res.json()];
const signed = async (b, w, purpose) => {
  const c = await b.post("/api/auth/challenge", { purpose, address: w.address });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message) };
};

test("the Worker as committed, on citycoin.dev and on vicinity.city: register with a wallet and the location once, sign in again, every other way in refused", async () => {
  _pagesBuiltForTests(BUILT);
  try {
    const env = W.newWorld({ ...V, SOLANA_RPC_URL: "https://rpc.test" });
    assert.equal(walletOnly(env), true);
    assert.equal(legacySeats(env), "frozen");
    assert.equal(legacyLaunch(env), "off");
    for (const site of ["https://citycoin.dev", "https://vicinity.city"]) {
      const b = W.browser(env, { site }), w = await W.wallet();
      const me0 = await b.get("/api/me");
      assert.equal(me0.walletOnly, true, site);
      assert.equal(me0.signedIn, false);
      const start = await b.post("/api/signup/start");
      assert.equal(start.state.terms.version, "2026-10-25", `${site}: the Terms of the Citycoin.dev edition`);
      const loc = await b.post("/api/signup/location", { location: W.IN_UTICA, country: "US" });
      assert.deepEqual(loc, { ok: true, community: { id: "5142056", name: "Utica", country: "US" } });
      // the earlier version is refused: a page from before the edition asks to reload
      assert.deepEqual(await answer(await b.send("/api/signup/terms", { method: "POST", body: { version: "2026-10-01" } })), [400, { ok: false, error: "bad_version" }]);
      assert.equal((await b.post("/api/signup/terms", { version: "2026-10-25" })).ok, true);
      const reg = await b.send("/api/signup/wallet", { method: "POST", body: await signed(b, w, "register") });
      assert.equal(reg.status, 200, `${site}: ${JSON.stringify(await reg.clone().json())}`);
      const me1 = await b.get("/api/me");
      assert.equal(me1.signedIn, true, site);
      assert.equal(me1.user.wallet, w.address);
      assert.equal(me1.termsVersion, "2026-10-25");
      assert.equal(me1.policyVersion, 7);
      const row = await env.DB.prepare("SELECT provider, provider_id, terms_version, home_name FROM users WHERE wallet = ?").bind(w.address).first();
      assert.deepEqual(row, { provider: "wallet", provider_id: w.address, terms_version: "2026-10-25", home_name: "Utica" });
      const verified = (me1.badges || []).find((x) => x.id === "verified");
      if (verified) assert.doesNotMatch(verified.detail, /google|e-?mail/i, "the Verified account badge says wallet");
      assert.ok(!(me1.badges || []).some((x) => x.id === "streak"), "no check-in badge to earn: new check-ins are not posted");
      // log out, then sign in again with the same wallet: no location asked
      assert.equal((await b.post("/api/auth/logout")).ok, true);
      assert.equal((await b.get("/api/me")).signedIn, false);
      const login = await b.send("/api/auth/wallet", { method: "POST", body: await signed(b, w, "login") });
      assert.equal(login.status, 200, JSON.stringify(await login.clone().json()));
      assert.equal((await b.get("/api/me")).user.wallet, w.address);
      // every Google, e-mail, password and tiny-transfer route is the unknown-path 404
      for (const [m, p] of [["GET", "/api/auth/google/start"], ["GET", "/api/auth/google/callback?code=c&state=s"], ["POST", "/api/auth/email/start"], ["POST", "/api/auth/email/verify"], ["POST", "/api/auth/email/login"],
        ["POST", "/api/auth/password/reset/start"], ["POST", "/api/auth/password/reset"], ["POST", "/api/me/password"], ["POST", "/api/me/google/add"], ["POST", "/api/me/google/remove"],
        ["POST", "/api/me/wallet/unlink"], ["POST", "/api/auth/transfer/start"], ["POST", "/api/auth/transfer/check"], ["POST", "/api/signup/finish"]]) {
        assert.equal((await b.send(p, { method: m, body: m === "POST" ? { email: "x@example.com" } : undefined })).status, 404, `${site} ${m} ${p}`);
      }
      // the legacy seat writers (S16) and the legacy launch writers (S23)
      for (const p of ["/api/seats/apply", "/api/seats/endorse", "/api/seats/object", "/api/seats/resign", "/api/seats/squad/create", "/api/seats/squad/join", "/api/elections/vote"])
        assert.deepEqual((await answer(await b.send(p, { method: "POST", body: {} })))[1].error, "seats_frozen", `${site} ${p}`);
      for (const [p, body] of [["/api/lp/launch/tx", { city: "5142056" }], ["/api/coins/design", { name: "Utica" }], ["/api/coins/mint", {}]]) {
        const [status, data] = await answer(await b.send(p, { method: "POST", body }));
        assert.deepEqual([status, data.error], [410, "legacy_launch_closed"], `${site} ${p}`);
      }
      // the Rules as answered: the Citycoin.dev edition, with the freeze said
      const pol = await b.get("/api/policy");
      assert.deepEqual([pol.policy.version, pol.policy.effectiveAt, Boolean(pol.legacySeats)], [7, "2026-10-25", true]);
      assert.doesNotMatch(JSON.stringify(pol), /vicinity/i);
    }
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 2);
  } finally { _pagesBuiltForTests(null); }
});

test("an acceptance of the earlier Terms stays readable as recorded; the member confirms the current edition with the same call as /terms", async () => {
  _pagesBuiltForTests(BUILT);
  try {
    const env = W.newWorld({ ...V, SOLANA_RPC_URL: "https://rpc.test" });
    const b = W.browser(env, { site: "https://citycoin.dev" }), w = await W.wallet();
    await b.post("/api/signup/start");
    await b.post("/api/signup/location", { location: W.IN_UTICA, country: "US" });
    await b.post("/api/signup/terms", { version: "2026-10-25" });
    assert.equal((await b.send("/api/signup/wallet", { method: "POST", body: await signed(b, w, "register") })).status, 200);
    // an account that agreed to the earlier text (as a member from before the edition would have): its record is read back as it is
    await env.DB.prepare("UPDATE users SET terms_version = '2026-10-01' WHERE wallet = ?").bind(w.address).run();
    assert.equal((await b.get("/api/me")).termsVersion, "2026-10-01");
    assert.deepEqual(await b.post("/api/me/terms", { version: "2026-10-25" }), { ok: true, version: "2026-10-25" });
    assert.equal((await b.get("/api/me")).termsVersion, "2026-10-25");
  } finally { _pagesBuiltForTests(null); }
});

test("the Worker as committed: SOL and USDC still quote (a fake Jupiter, no platform fee), and the one job runs with the seat steps skipped", async () => {
  _pagesBuiltForTests(BUILT);
  try {
    const env = W.newWorld({ ...V, SOLANA_RPC_URL: "https://rpc.test" });
    const jup = fakeJupiter(), chain = W.chain(), others = [];
    const fetchImpl = async (url, init) => (await jup.fetch(url, init)) || (/rpc/.test(String(url)) ? chain(url, init) : (others.push(String(url)), new Response("blocked", { status: 599 })));
    for (const site of ["https://citycoin.dev", "https://vicinity.city"]) {
      const b = W.browser(env, { site });
      const cfg = await b.send("/api/swap/config", { fetchImpl });
      assert.equal(cfg.status, 200);
      assert.equal((await cfg.json()).platformFeeBps, 0);
      for (const [inputMint, outputMint, amount] of [[SOL, USDC, "10000000"], [USDC, SOL, "2000000"]]) {
        const [status, q] = await answer(await b.send("/api/swap/quote", { method: "POST", body: { inputMint, outputMint, amount, slippageBps: 50 }, fetchImpl }));
        assert.equal(status, 200, `${site}: ${JSON.stringify(q)}`);
        assert.equal(q.ok, true);
      }
    }
    const r = await runJobs(env, Date.now(), fetchImpl, () => 0.99);
    assert.deepEqual([r.seats, r.elections], [{ skipped: "legacy_seats_frozen" }, { skipped: "legacy_seats_frozen" }]);
    assert.deepEqual(others, [], "nothing asked of any host but the fakes");
  } finally { _pagesBuiltForTests(null); }
});
