// Regression tests for the review of stages S09 to S14 (wallet-only sign-in, registration, location once, the legacy link window). Each test
// names its finding and fails without its fix. The fail-closed gate (SEC-1), the legacy window record (SEC-4), the register pairing of an
// existing wallet (SEC-3) and the login pairing's requester (SEC-5) have their tests next to the stage they change: test/identity-legacy-link,
// test/identity-challenge, test/identity-register, test/identity-wallet-only and test/identity-pair-status. Fake wallets only.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import * as W from "./helpers/world.js";
import { TERMS, member, memberWithWallet, one, outbox, rows } from "./helpers/signup.js";
import { _resetPolicyCheck } from "../src/v5policy.js";
import { base58Encode, isSigningPoint, isWalletKey, verifySignature } from "../src/solana.js";
import { pageV5Config } from "../scripts/pages/build.mjs";
import { ADDR, memberMe, openDashboard } from "./helpers/dashpage.js";
import { UA, fakeWallet, openConnect } from "./helpers/connectpage.js";

beforeEach(() => { W.useClock("2026-10-24T12:00:00Z"); _resetPolicyCheck(); });
after(() => W.realClock());

const ON = Object.freeze({ WALLET_ONLY: "on", DEPLOYMENT_ENV: "test", SITE_ORIGIN: W.ORIGIN, SITE_ORIGINS: W.ORIGIN });
const on = (env, extra = {}) => Object.assign(env, ON, extra);
const answer = async (res) => [res.status, await res.json()];
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const hex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const SYSTEM = "11111111111111111111111111111111"; // 32 zero bytes: a point of order 4
// the small-order points of edwards25519 (libsodium's list), canonical and with the sign bit set
const SMALL = ["00".repeat(32), `01${"00".repeat(31)}`, "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
  "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a", `ec${"ff".repeat(30)}7f`, `ed${"ff".repeat(30)}7f`, `ee${"ff".repeat(30)}7f`,
  `${"00".repeat(31)}80`, "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85"];
/** The forgery of the finding: R = a small-order point, S = 0. */
const forged = (r) => { const sig = new Uint8Array(64); sig.set(hex(r), 0); return sig; };

/* ---------------------------------------------------------------- SEC-2: small-order keys */

test("SEC-2: WebCrypto alone accepts R = small-order, S = 0 for a small-order key; verifySignature refuses every such forgery and every honest signature passes", async () => {
  const key = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "Ed25519" }, false, ["verify"]);
  let raw = 0, ours = 0;
  for (let i = 0; i < 120; i++) {
    const m = `forge ${i}`;
    for (const r of SMALL.slice(0, 7)) {
      if (await crypto.subtle.verify({ name: "Ed25519" }, key, forged(r), new TextEncoder().encode(m))) raw++;
      if (await verifySignature(SYSTEM, m, forged(r))) ours++;
    }
  }
  assert.ok(raw > 0, "the platform's verify alone is forgeable here (the reason for the check)");
  assert.equal(ours, 0, "no forgery passes");
  for (const h of SMALL) assert.equal(isSigningPoint(hex(h)), false, h);
  assert.equal(isSigningPoint(hex(`${"ff".repeat(31)}7f`)), false, "non-canonical y >= p");
  assert.equal(isSigningPoint(hex("5866666666666666666666666666666666666666666666666666666666666666")), true, "the base point");
  assert.equal(isWalletKey(SYSTEM), false);
  for (let i = 0; i < 20; i++) {
    const w = await W.wallet();
    assert.equal(isWalletKey(w.address), true);
    const m = `hello ${i}`;
    assert.equal(await verifySignature(w.address, m, Uint8Array.from(atob(await w.sign(m)), (c) => c.charCodeAt(0))), true);
  }
  // S >= L (a non-canonical S) is refused before WebCrypto is asked
  const w = await W.wallet(), m = "canonical S";
  const sig = Uint8Array.from(atob(await w.sign(m)), (c) => c.charCodeAt(0));
  const L = (1n << 252n) + 27742317777372353535851937790883648493n;
  let s = 0n; for (let i = 63; i >= 32; i--) s = (s << 8n) | BigInt(sig[i]);
  const bumped = s + L; const big = sig.slice();
  for (let i = 0, v = bumped; i < 32; i++, v >>= 8n) big[32 + i] = Number(v & 0xffn);
  if (bumped < (1n << 256n)) assert.equal(await verifySignature(w.address, m, big), false);
});

test("SEC-2: the System Program address cannot get a challenge, and today's signed messages with a forged signature are refused too", async () => {
  const env = W.V2();
  on(env);
  const b = W.browser(env);
  for (const purpose of ["login", "register", "admin"]) {
    assert.deepEqual(await answer(await b.send("/api/auth/challenge", { method: "POST", body: { purpose, address: SYSTEM } })), [400, { ok: false, error: "bad_address" }], purpose);
  }
  // the switch off: today's public verify text (any address may ask for one); a forged signature never verifies, however many tries
  const off = W.V2(), v = W.browser(off);
  W.realClock();
  let verified = 0;
  for (let i = 0; i < 25; i++) {
    const msg = await v.get(`/api/message?address=${SYSTEM}&action=verify`);
    const r = await v.post("/api/verify", { address: SYSTEM, message: msg.message, signature: btoa(String.fromCharCode(...forged(SMALL[4]))) });
    if (r.verified) verified++;
  }
  assert.equal(verified, 0);
});

/* ---------------------------------------------------------------- SEC-6: the location hand-off's code in the fragment */

test("SEC-6: while WALLET_ONLY counts the location-once link carries its code in the fragment; switched off, today's ?code=", async () => {
  const env = W.newWorld();
  const p = await W.person(env);
  const off = await p.post("/api/locate/handoff", { purpose: "home" });
  assert.equal(off.url, `${W.ORIGIN}/locate?code=${off.code}`, "today's link");
  on(env);
  p.jar.clear();
  const c = await p.post("/api/auth/challenge", { purpose: "login", address: p.w.address });
  assert.equal((await p.post("/api/auth/wallet", { challengeId: c.challengeId, address: p.w.address, message: c.message, signature: await p.w.sign(c.message) })).ok, true);
  const h = await p.post("/api/locate/handoff", { purpose: "home" });
  assert.equal(h.url, `${W.ORIGIN}/locate#code=${h.code}`);
});

test("SEC-6: /locate reads a #code= link, takes it out of the address bar before any request, and sends it in POST bodies only; a ?code= link works as before", async () => {
  const run = async (location) => {
    const calls = [], replaced = [];
    const els = new Map(), make = (sel) => ({ sel, textContent: "", hidden: false, parentElement: { replaceChildren() {} }, replaceChildren() {}, addEventListener() {} });
    const $ = (sel) => { if (!els.has(sel)) els.set(sel, make(sel)); return els.get(sel); };
    const V = { $, $$: () => [], getLocation: async () => ({}), api: async (path, body) => { calls.push({ path, body, replacedBefore: replaced.length }); return { ok: true, purpose: "home", done: false }; } };
    const history = { replaceState: (s, t, u) => replaced.push(u) };
    vm.runInContext(read("public/locate.js"), vm.createContext({ window: { V }, location, history, URLSearchParams }));
    await new Promise((r) => setImmediate(r));
    return { calls, replaced };
  };
  const code = "abcdefghijklmnopqr";
  const a = await run({ pathname: "/locate", search: "", hash: `#code=${code}` });
  assert.deepEqual(a.replaced, ["/locate"], "the code leaves the address bar");
  assert.deepEqual(a.calls.map((c) => [c.path, c.body.code, c.replacedBefore]), [["/api/locate/handoff/info", code, 1]], "after it left, in the body");
  const b = await run({ pathname: "/locate", search: `?code=${code}`, hash: "" });
  assert.deepEqual(b.replaced, [], "today's link: nothing rewritten");
  assert.deepEqual(b.calls.map((c) => c.body.code), [code]);
});

/* ---------------------------------------------------------------- SEC-7: no distances kept */

test("SEC-7: the wallet-only registration keeps the three nearest choices without their distances; today's v2 sign-up keeps them as before", async () => {
  const env = W.V2();
  on(env);
  const b = W.browser(env);
  await b.post("/api/signup/start");
  const loc = await b.post("/api/signup/location", { location: W.EMPTY, country: "US" });
  assert.ok(loc.choices.length > 0);
  const row = await one(env.DB, "SELECT loc_choices FROM signups");
  const kept = JSON.parse(row.loc_choices);
  assert.ok(kept.length > 0);
  for (const c of kept) assert.deepEqual(Object.keys(c).sort(), ["id", "name"], "ids and names only");
  for (const c of loc.choices) assert.equal("km" in c, false);
  const state = await b.post("/api/signup/start");
  for (const c of state.state.location.choices) assert.equal("km" in c, false);
  assert.equal((await b.post("/api/signup/location/choice", { id: loc.choices[0].id })).ok, true, "the choice still works");
  // the switch off: today's v2 sign-up, byte for byte (its distances included)
  const today = W.V2(), t = W.browser(today);
  await t.post("/api/signup/start");
  const tl = await t.post("/api/signup/location", { location: W.EMPTY, country: "US" });
  assert.ok(tl.choices.every((c) => typeof c.km === "number"));
  assert.ok(JSON.parse((await one(today.DB, "SELECT loc_choices FROM signups")).loc_choices).every((c) => typeof c.km === "number"));
});

/* ---------------------------------------------------------------- F9: the census */

test("F9: an account a wallet registration made before the legacy census is never labelled a legacy case", async () => {
  const env = W.V2(), box = outbox();
  await memberWithWallet(env, box, { via: "google" });
  await member(env, box, { via: "google" });
  on(env);
  // a wallet registers (WALLET_ONLY alone: no window, no census yet)
  const b = W.browser(env), w = await W.wallet();
  await b.post("/api/signup/start");
  await b.post("/api/signup/location", { location: W.IN_UTICA, country: "US" });
  await b.post("/api/signup/terms", { version: TERMS });
  const c = await b.post("/api/auth/challenge", { purpose: "register", address: w.address });
  assert.equal((await b.post("/api/signup/wallet", { challengeId: c.challengeId, address: w.address, message: c.message, signature: await w.sign(c.message) })).ok, true);
  // the window opens; the job writes the census
  on(env, { LEGACY_LINK: "on", LEGACY_LINK_UNTIL: "2026-12-01T00:00:00Z" });
  await W.tick(env);
  const states = await rows(env.DB, "SELECT provider, legacy_state FROM users ORDER BY id");
  assert.deepEqual(states.map((r) => [r.provider, r.legacy_state]), [["google", "wallet_linked"], ["google", "legacy_unlinked"], ["wallet", null]]);
});

/* ---------------------------------------------------------------- SEC-1: the build checks every v5 input */

test("SEC-1: the page build stops on any v5 setting the Worker refuses, and on WALLET_ONLY=on that would fail closed; today's settings pass", () => {
  assert.deepEqual(pageV5Config({}), { ok: true });
  assert.deepEqual(pageV5Config(ON), { ok: true });
  for (const [vars, code] of [[{ ...ON, OFFICIAL_X_URL: "x.com/citycoin" }, "OFFICIAL_X_URL_INVALID"], [{ ...ON, MAIN_TOKEN_MINT: "not-a-mint" }, "MAIN_TOKEN_MINT_INVALID"],
    [{ WALLET_ONLY: "on" }, "WALLET_ONLY_SITE_REFUSED"], [{ ...ON, DEPLOYMENT_ENV: "" }, "ENVIRONMENT_UNSET"], [{ ...ON, LEGACY_LINK: "on" }, "MISSING_LEGACY_LINK_UNTIL"]]) {
    assert.throws(() => pageV5Config(vars), new RegExp(`wrangler\\.jsonc has v5 settings the Worker refuses \\(.*${code}`), JSON.stringify(vars));
  }
  assert.deepEqual(pageV5Config(), { ok: true }, "the committed wrangler.jsonc");
});

/* ---------------------------------------------------------------- F1, F2: the dashboard's words and controls */

const walletMe = (user = {}) => { const m = memberMe({ wallet: ADDR }); return { ...m, walletOnly: true, providers: { wallet: true }, user: { ...m.user, provider: "wallet", ...user } }; };

test("F1: under wallet-only the Profile offers no e-mail Add or Change (its sender is gone); a kept address can be removed; the form never calls the login code route", async () => {
  const p = await openDashboard({ me: walletMe() });
  p.win.V.openProfile(); await p.flush();
  const fold = p.$("#email-row").closest("details");
  assert.equal(fold.hidden, true, "no address: the row is not shown");
  assert.equal(p.$("#email-view").children.length, 0);
  p.$("#email-input").value = "me@example.com";
  p.$("#email-form").dispatchEvent(Object.assign(new (p.win.CustomEvent)("submit"), { preventDefault() {} }));
  await p.flush();
  assert.equal(p.callsTo("/api/auth/email/start").length, 0);
  const q = await openDashboard({ me: walletMe({ contact_email: "me@example.com" }) });
  q.win.V.openProfile(); await q.flush();
  const labels = q.$("#email-view").children.map((c) => c.textContent);
  assert.equal(q.$("#email-row").closest("details").hidden, false);
  assert.ok(labels.includes("Remove") && !labels.includes("Change") && !labels.includes("Add"), labels.join(","));
  // switch off: today's controls
  const t = await openDashboard({ me: memberMe({ wallet: ADDR }) });
  t.win.V.openProfile(); await t.flush();
  assert.deepEqual(t.$("#email-view").children.map((c) => c.textContent), ["Add"]);
  assert.equal(t.$("#email-row").closest("details").hidden, false);
});

test("F2: the signed-out dashboard under wallet-only speaks wallet first (DS-06) and its example pass says Wallet; switched off, today's words", async () => {
  const DS06 = "Verify your city once, then connect your wallet. We keep your city/country, not your raw GPS coordinates.";
  const out = { ok: true, signedIn: false };
  const p = await openDashboard({ me: { ...out, walletOnly: true, providers: { wallet: true } } });
  assert.equal(p.text("#out-cta-note"), DS06);
  assert.equal(p.$("#dash-out .dpv__foot").children[0].textContent, "Wallet");
  assert.doesNotMatch(p.text("#dash-out .teaser__copy"), /Google|e-mail/);
  const t = await openDashboard({ me: { ...out, providers: { google: true, email: true }, signupFlow: "v2" } });
  assert.equal(t.text("#out-cta-note"), "Takes a minute, with Google or e-mail. Your wallet comes later, from your dashboard: free, one signature.");
  assert.equal(t.$("#dash-out .dpv__foot").children[0].textContent, "Google");
});

/* ---------------------------------------------------------------- F4: a switch made while no page watched */

/** A Wallet Standard wallet that already shares `address` with the site when the page loads. */
function sharingWallet(name, address) {
  const acc = { address, publicKey: new Uint8Array(32), chains: ["solana:mainnet"], features: ["solana:signMessage"] };
  return { version: "1.0.0", name, icon: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", chains: ["solana:mainnet"], accounts: [acc],
    features: { "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [acc] }) }, "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
      "standard:events": { version: "1.0.0", on: () => () => {} }, "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }) => [{ signedMessage: message, signature: new Uint8Array(64) }] } } };
}
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

test("F4: the dashboard remembers the account's address per wallet, and a wallet that now reports another address on load signs out (the switch was made on a page without the watch)", async () => {
  // first visit: Phantom shows the account's address; it is remembered
  const p = await openDashboard({ me: walletMe(), wallets: [sharingWallet("Phantom", ADDR)] });
  assert.deepEqual(JSON.parse(p.local.get("vicinity:wallet-seen")), { Phantom: ADDR });
  assert.equal(p.callsTo("/api/auth/logout").length, 0);
  // the person switched accounts in the extension on the home page (no watch there), then opens the dashboard
  const q = await openDashboard({ me: walletMe(), wallets: [sharingWallet("Phantom", OTHER)], storage: { "vicinity:wallet-seen": JSON.stringify({ Phantom: ADDR }) } });
  assert.equal(q.callsTo("/api/auth/logout").length, 1);
  assert.deepEqual(q.assigned, ["/connect?mode=login"]);
  assert.equal(q.local.has("vicinity:wallet-seen"), false, "forgotten with the rest at logout");
  // another wallet that never showed the account's address changes nothing
  const r = await openDashboard({ me: walletMe(), wallets: [sharingWallet("Solflare", OTHER)], storage: { "vicinity:wallet-seen": JSON.stringify({ Phantom: ADDR }) } });
  assert.equal(r.callsTo("/api/auth/logout").length, 0);
  // switched off: nothing watched, nothing remembered
  const t = await openDashboard({ me: memberMe({ wallet: ADDR }), wallets: [sharingWallet("Phantom", OTHER)], storage: { "vicinity:wallet-seen": JSON.stringify({ Phantom: ADDR }) } });
  assert.equal(t.callsTo("/api/auth/logout").length, 0);
});

/* ---------------------------------------------------------------- F5, F6, F7, F8: the connect page */

const WO = { walletOnly: true, providers: { wallet: true } };
const COMMUNITY = { id: "4509177", name: "Columbus", country: "US" };
const blank = () => ({ terms: { done: false, version: "2026-10-01" }, location: { done: false }, name: null, next: "location" });
const apiOf = (over = {}) => async (path, body) => (over[path] ? over[path](body) : path === "/api/signup/start" ? { ok: true, state: blank() } : { ok: true });
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const ANDROID_WV = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36";

test("F5: a phone's normal browser with a wallet of its own (Brave, Kiwi) registers here: the location step, not 'Open in Safari or Chrome'; a wallet app's own browser still gets the way out", async () => {
  const p = await openConnect({ ua: ANDROID_CHROME, me: WO, api: apiOf(), state: blank(), search: "mode=register", wallets: [fakeWallet("Brave Wallet").wallet] });
  assert.equal(p.screen(), "su-location");
  assert.equal(p.visible(p.$("#su-loc-go")), true);
  const q = await openConnect({ ua: ANDROID_WV, me: WO, api: apiOf(), state: blank(), search: "mode=register", wallets: [fakeWallet("Phantom").wallet] });
  assert.equal(q.screen(), "wo-inapp");
  const r = await openConnect({ ua: UA.phantomApp, me: WO, api: apiOf(), state: blank(), search: "mode=register", wallets: [fakeWallet("Phantom").wallet] });
  assert.equal(r.screen(), "wo-inapp");
});

test("F6: a location denied on a phone does not offer 'register on your phone' (it is the phone); a computer still gets it", async () => {
  const denied = { getCurrentPosition: (ok, no) => no({ code: 1 }) };
  const p = await openConnect({ ua: UA.iphone, me: WO, api: apiOf(), state: blank(), geolocation: denied, search: "mode=register" });
  await p.tap(p.$("#su-loc-go"));
  assert.match(p.$("#su-loc-error").textContent, /Location is blocked/);
  assert.equal(p.visible(p.$("#su-loc-phone")), false);
  const q = await openConnect({ me: WO, api: apiOf(), state: blank(), geolocation: denied, search: "mode=register" });
  await q.tap(q.$("#su-loc-go"));
  assert.equal(q.visible(q.$("#su-loc-phone")), true);
  assert.match(read("public/wallet-only.css"), /@media \(max-width: 900px\) \{\n {2}\.wo-on #su-loc-ask p\.tiny \{ padding-right: 56px; \}/, "the floating button keeps clear of the network line");
});

test("F7: a dead registration link says it once, offers the link for Safari or Chrome first and Sign in second; the first opener of a contested link is told it was opened twice", async () => {
  const CODE = "R".repeat(32);
  const deadWith = async (error, status) => openConnect({ ua: UA.phantomApp, me: WO, api: apiOf({ "/api/signup/handoff/info": () => ({ ok: false, error, _status: status }) }), state: blank(),
    hash: `register=${CODE}`, wallets: [fakeWallet("Phantom").wallet], clipboard: true });
  const p = await deadWith("code_expired", 410);
  assert.equal(p.screen(), "link-dead");
  assert.equal(p.$("#ld-h").textContent, "That link was used or ran out");
  assert.equal(p.$("#ld-body").textContent, "Go back to Safari or Chrome and get a new link. Nothing was registered.");
  assert.doesNotMatch(p.$("#ld-body").textContent, /used or ran out/, "the body never repeats the heading");
  assert.equal(p.visible(p.$("#wo-ld-copy")), true);
  assert.match(p.$("#wo-ld-copy").className, /btn--primary/);
  assert.match(p.$("#ld-signin").className, /btn--glass/);
  assert.equal(p.$("#ld-signin").textContent, "Already registered? Sign in");
  await p.tap(p.$("#wo-ld-copy"));
  assert.deepEqual(p.copied, ["https://vicinity.test/connect"]);
  const q = await deadWith("contested", 403);
  assert.equal(q.$("#ld-h").textContent, "That link was opened twice");
  assert.doesNotMatch(q.$("#ld-body").textContent, /opened twice/);
});

/* ---------------------------------------------------------------- SEC-10: the computer's pairing status follows the server's link */

test("SEC-10: a pairing whose link the server put in the fragment is asked about in a POST body, never GET /api/pair?code=", () => {
  const src = read("public/connect.js");
  assert.match(src, /\.\.\.\(\/#pair=\/\.test\(String\(d\.url \|\| ""\)\) \? \{ post: true \} : \{\}\)/, "decided by the start answer's link");
  assert.match(src, /const s = wo \|\| p\.post \? await api\("\/api\/pair\/status", \{ code: p\.code \}\) : await api\(`\/api\/pair\?code=\$\{encodeURIComponent\(p\.code\)\}`\);/);
});

/* ---------------------------------------------------------------- PAR-04: a failed /api/me never breaks today's paths */

test("PAR-04: a rejected V.ready reads as today's sign-in in the admin console and adds no unhandled rejection in wallets.js", async () => {
  assert.match(read("public/admin.js"), /const walletOnlyLate = async \(\) => \{ try \{ return \(\(await window\.V\.ready\) \|\| \{\}\)\.walletOnly === true; \} catch \{ return false; \} \};/);
  // wallets.js against a page whose /api/me failed: no unhandled rejection
  const unhandled = [];
  const onRej = (e) => unhandled.push(e);
  process.on("unhandledRejection", onRej);
  try {
    const ready = Promise.reject(new Error("me failed"));
    const ctx = vm.createContext({ window: { V: { ready, webView: false }, addEventListener() {}, dispatchEvent() {}, navigator: { userAgent: UA.desktop } },
      navigator: { userAgent: UA.desktop, maxTouchPoints: 0 }, document: { addEventListener() {}, hidden: false }, setTimeout: () => 0, location: { origin: "https://vicinity.test" },
      CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
    ctx.window.window = ctx.window;
    vm.runInContext(read("public/wallets.js"), ctx);
    await new Promise((r) => setTimeout(r, 20));
  } finally { process.off("unhandledRejection", onRej); }
  assert.deepEqual(unhandled, []);
});
