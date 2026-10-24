// The connect page while WALLET_ONLY counts (Citycoin.dev master v5, stage S12; master section 18 WP-02, section 19 WP-03, section 14 DS-06;
// acceptance A01 to A04): the real built page with site.js, wallets.js, connect.js and public/wallet-only.js (which connect.js loads only when
// /api/me says walletOnly), run in the just-enough DOM of test/helpers/connectpage.js, with the server played by the test and fake wallets.
// What this pins: exactly two paths, Sign in (wallet only, never a location) and Register your city (the location in this browser first, then
// the Terms, an optional display name and the wallet); no Google, e-mail or password control; the no-account screen; a wallet app's browser
// offered Safari or Chrome instead of a location; the DS-06 words; the hand-off and pairings with their codes only in POST bodies and link
// fragments; and with the switch off nothing of it (the page never fetches wallet-only.js). Real Chromium against the real Worker checks the
// looks and the whole journeys (scratchpad harness, recorded in docs/citycoin-master/implementation-report.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADDR, UA, fakeWallet, openConnect } from "./helpers/connectpage.js";

const COMMUNITY = { id: "4509177", name: "Columbus", country: "US" };
const DS_REG = "Verify your city once, then connect your wallet. We keep your city/country, not your raw GPS coordinates.";
const DS_IN = "Connect your wallet to return to your dashboard. No location check required.";
const WO = { walletOnly: true, providers: { wallet: true } };
const CID = "0123456789abcdef0123456789abcdef";
const REG = { code: "R".repeat(32), pin: "42", ref: "abcdefABCDEF" };
const PAIR = "P".repeat(24);
/** A time some seconds ahead of this test's clock (the page compares expiries with the real Date). */
const soon = (seconds = 300) => new Date(Date.now() + seconds * 1000).toISOString();
const blank = () => ({ terms: { done: false, version: "2026-10-01" }, location: { done: false }, name: null, next: "location" });
const located = (terms = false) => ({ terms: { done: terms, version: "2026-10-01" }, location: { done: true, community: COMMUNITY }, name: null, next: terms ? "wallet" : "terms" });
const message = (purpose, address, extra = "") => `vicinity.test wants you to sign in with your Solana account:\n${address}\n\n${purpose === "register" ? `Register this wallet on Vicinity for Columbus, US${extra}.` : `Sign in to Vicinity with this wallet${extra}.`} Free, not a transaction, cannot move funds.\n\nRequest ID: ${purpose}`;

/** The server of a wallet-only site: a registration that moves through its steps, challenges, and the answers a test sets in `world`. */
function server(start = blank()) {
  const world = { st: start, wallet: null, handoffStatus: "waiting", pairStatus: "waiting", pairPurpose: "register", info: null, claim: null, finish: null };
  const api = async (path, body) => {
    if (path === "/api/signup/start") return { ok: true, state: world.st };
    if (path === "/api/signup/location") { world.st = { ...world.st, location: { done: true, community: COMMUNITY }, next: world.st.terms.done ? "wallet" : "terms" }; return { ok: true, community: COMMUNITY }; }
    if (path === "/api/signup/terms") { world.st = { ...world.st, terms: { done: true, version: "2026-10-01" }, next: "wallet" }; return { ok: true, state: world.st }; }
    if (path === "/api/signup/name") { world.st = { ...world.st, name: body.displayName }; return { ok: true, state: world.st }; }
    if (path === "/api/auth/challenge") return { ok: true, challengeId: CID, message: message(body.purpose, body.address, body.pair ? " on my other device (check number 42)" : ""), purpose: body.purpose, expiresAt: soon(120) };
    if (path === "/api/auth/wallet") return body.pair ? { ok: true, paired: true } : world.wallet || { ok: true, wallet: body.address, next: "/dashboard" };
    if (path === "/api/signup/wallet") return { ok: true, existing: false, wallet: body.address, user: { id: 9, handle: world.st.name || "member9", city: COMMUNITY }, next: "/dashboard?welcome=1" };
    if (path === "/api/signup/handoff") return { ok: true, code: REG.code, pin: REG.pin, ref: REG.ref, url: `https://vicinity.test/connect#register=${REG.code}`, expiresAt: soon() };
    if (path === "/api/signup/handoff/status") return { ok: true, status: world.handoffStatus };
    if (path === "/api/signup/handoff/info") return world.info || { ok: true, pin: REG.pin, community: COMMUNITY, terms: "2026-10-01", expiresAt: soon(), relay: false, opener: "o".repeat(32) };
    if (path === "/api/signup/handoff/claim") return world.claim || { ok: true, existing: false, wallet: body.address, user: { id: 10, handle: "member10", city: COMMUNITY }, next: "/dashboard?welcome=1" };
    if (path === "/api/pair") return { ok: true, code: PAIR, pin: "42", purpose: body.purpose || "login", url: `https://vicinity.test/connect#pair=${PAIR}`, expiresAt: soon() };
    if (path === "/api/pair/status") return { status: world.pairStatus, pin: "42", purpose: world.pairPurpose };
    if (path === "/api/pair/finish") return world.finish || { ok: true, status: "done", existing: false, wallet: ADDR, user: { id: 11, handle: "member11", city: COMMUNITY }, next: "/dashboard?welcome=1" };
    return { ok: true };
  };
  return { world, api, state: () => world.st };
}
/** A computer's QR canvas: this DOM draws nothing (no qrcode library here, so connect.js puts the link in its place). */
const canvasStub = ({ doc }) => { doc.querySelector("#qr").getContext = () => ({ fillRect() {}, set fillStyle(v) { /* nothing drawn */ } }); };
/** A browser position that records when it was asked (A03: before the wallet; A04: never on sign-in). */
function spyGeo(order) {
  const g = { calls: 0, getCurrentPosition: (ok) => { g.calls++; order.push("geo"); ok({ coords: { latitude: 39.9612, longitude: -82.9988, accuracy: 30 } }); } };
  return g;
}
/** A fake wallet whose connect and signature are recorded in `order`. */
function orderedWallet(order, name = "Phantom") {
  const f = fakeWallet(name);
  const c = f.wallet.features["standard:connect"].connect, s = f.wallet.features["solana:signMessage"].signMessage;
  f.wallet.features["standard:connect"].connect = async (...a) => { order.push("connect"); return c(...a); };
  f.wallet.features["solana:signMessage"].signMessage = async (...a) => { order.push("sign"); return s(...a); };
  return f;
}
/** What a person can see in an element: the text of the parts that are not hidden. */
const seen = (n) => (n.hidden ? "" : n.childNodes ? n.childNodes.map(seen).join(" ") : n.textContent || "");
const LEGACY = /Google|e-mail|E-mail|password|Password/;
const noLegacy = (p, label) => {
  const t = seen(p.$(".connect")).replace(/\s+/g, " ");
  assert.doesNotMatch(t, LEGACY, `${label}: no Google, e-mail or password words (${t.match(LEGACY)})`);
  for (const sel of ["#lg-google", "#login-google", "#lg-form", "#login-email", "#su-google", "#go-google", "#alt-app"]) assert.equal(p.visible(p.$(sel)), false, `${label}: ${sel}`);
};
const posts = (p, path) => p.calls.filter((c) => c.path === path).map((c) => c.body);
/** No code ever in a URL the page asked for, and no legacy GET that carries one or a signed text. */
const noCodeInUrls = (p, codes) => {
  for (const c of p.calls) for (const code of codes) assert.ok(!c.path.includes(code), `a code in ${c.method} ${c.path}`);
  assert.equal(p.calls.filter((c) => /^\/api\/pair\?code=|^\/api\/message\?/.test(c.path)).length, 0, "no GET /api/pair?code= or /api/message");
};

/* ---------------------------------------------------------------- the switch off */

test("with the switch off the page never fetches wallet-only.js and shows today's sign-up (no challenge, the old tabs)", async () => {
  const p = await openConnect({}); // /api/me: sign-up v2, Google and e-mail on, no walletOnly key (today's live answer)
  assert.equal(p.scripts.includes("/wallet-only.js"), false);
  assert.equal(p.scripts.some((s) => /wallet-only\.css/.test(String(s))), false);
  assert.equal(p.$("#tab-new").textContent, "New here");
  assert.equal(p.$("#tab-login").textContent, "Log in");
  assert.equal(p.callsTo("/api/auth/challenge").length, 0);
  assert.equal(p.$(".connect__intro .kicker").textContent, "Join Vicinity");
  assert.equal(p.doc.querySelectorAll('[data-state="wo-inapp"]').length, 0, "no wallet-only screen added");
});

/* ---------------------------------------------------------------- Sign in */

test("Sign in: two paths only, the returning-login words of DS-06, a login challenge signed by the wallet, no location asked (A04)", async () => {
  const order = [], s = server(), geo = spyGeo(order), { wallet, ctl } = orderedWallet(order, "Phantom");
  const p = await openConnect({ me: WO, api: s.api, state: s.state, search: "mode=login", geolocation: geo, wallets: [wallet] });
  assert.equal(p.scripts.includes("/wallet-only.js"), true);
  assert.equal(p.screen(), "pick");
  assert.deepEqual(p.$(".su-tabs").children.map((b) => [b.textContent, b.getAttribute("aria-pressed")]), [["Sign in", "true"], ["Register your city", "false"]]);
  assert.equal(p.$(".connect__intro .lead").textContent, DS_IN);
  assert.equal(p.$("#wo-signin-lead").textContent, DS_IN);
  assert.equal(p.$("#wallet-h").textContent, "Sign in with your wallet");
  assert.equal(p.visible(p.$("#su-steps")), false, "no registration steps on Sign in");
  noLegacy(p, "sign in");
  assert.deepEqual([...p.doc.querySelectorAll(".connect__intro .safety li")].map((l) => l.textContent), [
    "Signing in is free. It isn't a transaction and can't move funds.", "Vicinity never asks for your recovery phrase or private key.", "One account per wallet. That is not proof of one person."]);
  await p.tap(p.$("#wallets-detected .wallet-option"));
  assert.equal(p.screen(), "sign");
  assert.deepEqual(posts(p, "/api/auth/challenge"), [{ purpose: "login", address: ADDR }]);
  assert.equal(p.$("#c-msg").textContent, message("login", ADDR));
  assert.equal(p.$("#c-sign").textContent, "Sign in");
  await p.tap(p.$("#c-sign"));
  assert.deepEqual(ctl.messages, [message("login", ADDR)]);
  const [login] = posts(p, "/api/auth/wallet");
  assert.deepEqual(Object.keys(login).sort(), ["address", "challengeId", "message", "signature"]);
  assert.equal(login.challengeId, CID);
  assert.equal(p.screen(), "done");
  await p.advance(1300);
  assert.deepEqual(p.assigned, ["/dashboard"]);
  assert.equal(geo.calls, 0, "Sign in never asks for a location");
  assert.deepEqual(order, ["connect", "sign"]);
  noCodeInUrls(p, []);
});

test("an unknown wallet: the no-account screen with its exact words and the link to copy; nothing else is asked (R1-13)", async () => {
  const s = server(), geo = spyGeo([]);
  s.world.wallet = { ok: false, error: "no_account", _status: 404 };
  const { wallet } = fakeWallet("Phantom");
  const p = await openConnect({ me: WO, api: s.api, state: s.state, search: "mode=login", geolocation: geo, wallets: [wallet], clipboard: true });
  await p.tap(p.$("#wallets-detected .wallet-option"));
  await p.tap(p.$("#c-sign"));
  assert.equal(p.screen(), "no-account");
  assert.equal(`${p.$("#na-h").textContent} ${p.$("#na-body").textContent}`, "No account for this wallet. Register in Safari or Chrome: verify your city once, then connect this wallet.");
  assert.equal(p.visible(p.$("#na-copy")), true); assert.equal(p.$("#na-copy").textContent, "Copy the link");
  assert.equal(p.visible(p.$("#na-create")), true, "Safari or Chrome: Register your city is right here");
  assert.equal(p.visible(p.$("#na-tiny")), false, "(today's line about e-mail and password is gone)");
  noLegacy(p, "no account");
  await p.tap(p.$("#na-copy"));
  assert.deepEqual(p.copied, ["https://vicinity.test/connect"]);
  await p.tap(p.$("#na-create"));
  assert.equal(p.screen(), "su-location");
  assert.equal(geo.calls, 0, "no location until the person shares it");
  // inside a wallet app the copy is the primary way, and Register is not offered there
  const q = await openConnect({ ua: UA.phantomApp, me: WO, api: s.api, state: s.state, search: "mode=login", wallets: [fakeWallet("Phantom").wallet] });
  await q.tap(q.$("#wo-quick"));
  await q.flush();
  assert.equal(q.screen(), "no-account");
  assert.equal(q.visible(q.$("#na-create")), false);
  assert.match(q.$("#na-copy").className, /btn--primary/);
});

test("inside a wallet app's browser: Sign in first, one tap signs in (connect, then one signature), the session marked as the app's", async () => {
  const order = [], s = server(), geo = spyGeo(order), { wallet } = orderedWallet(order, "Phantom");
  const p = await openConnect({ ua: UA.phantomApp, me: WO, api: s.api, state: s.state, geolocation: geo, wallets: [wallet] });
  assert.equal(p.$("#tab-login").getAttribute("aria-pressed"), "true");
  assert.equal(p.visible(p.$("#wo-quick")), true);
  assert.equal(p.$("#wo-quick").textContent, "Sign in with Phantom");
  await p.tap(p.$("#wo-quick"));
  await p.flush();
  const [login] = posts(p, "/api/auth/wallet");
  assert.equal(login.inApp, true);
  assert.equal(p.screen(), "done");
  assert.deepEqual(order, ["connect", "sign"]);
  assert.equal(geo.calls, 0);
});

/* ---------------------------------------------------------------- Register your city */

test("Register your city: the location in this browser first, then the Terms and a display name, then the wallet (A03 order); the first-registration words of DS-06", async () => {
  const order = [], s = server(), geo = spyGeo(order), { wallet, ctl } = orderedWallet(order, "Phantom");
  const p = await openConnect({ me: WO, api: s.api, state: s.state, geolocation: geo, wallets: [wallet] });
  assert.equal(p.screen(), "su-location");
  assert.deepEqual(p.$(".su-tabs").children.map((b) => [b.textContent, b.getAttribute("aria-pressed")]), [["Sign in", "false"], ["Register your city", "true"]]);
  assert.equal(p.$(".connect__intro .lead").textContent, DS_REG);
  assert.equal(p.$("#su-loc-ask p.muted").textContent, DS_REG);
  assert.equal(p.$("#su-loc-title").textContent, "Verify your city");
  assert.deepEqual([...p.doc.querySelectorAll("#su-steps .stepper__label")].filter((l) => p.visible(l)).map((l) => l.textContent), ["Your city", "Wallet"]);
  assert.equal(p.visible(p.$("#su-loc-phone")), false, "no hand-off of the location into another browser");
  noLegacy(p, "register city");
  assert.equal(geo.calls, 0);
  await p.tap(p.$("#su-loc-go"));
  await p.advance(10);
  assert.equal(p.screen(), "pick");
  assert.equal(p.$("#wallet-h").textContent, "Connect your wallet");
  assert.equal(p.$("#wo-city-name").textContent, "Columbus, US");
  assert.equal(p.$("#wo-reg-lead").textContent, "One free signature creates your account for Columbus, US. Nothing is paid or moved.");
  noLegacy(p, "register wallet");
  // the Terms first: a wallet tap without them asks nothing of the wallet and makes no challenge
  await p.tap(p.$("#wallets-detected .wallet-option"));
  assert.equal(p.$("#wo-terms-error").textContent, "Tick the box to agree to the Terms of Use first.");
  assert.equal(ctl.connects, 0); assert.equal(p.callsTo("/api/auth/challenge").length, 0);
  // a display name that breaks the rules is said at once, before anything is sent
  p.$("#wo-terms").checked = true; p.$("#wo-name").value = "1bad";
  await p.tap(p.$("#wallets-detected .wallet-option"));
  assert.equal(p.$("#wo-name-error").textContent, "Use 3 to 20 letters, digits or _, starting with a letter.");
  assert.equal(ctl.connects, 0);
  p.$("#wo-name").value = "NewbieOne";
  await p.tap(p.$("#wallets-detected .wallet-option"));
  assert.equal(p.screen(), "sign");
  assert.deepEqual(posts(p, "/api/auth/challenge"), [{ purpose: "register", address: ADDR }]);
  assert.equal(p.$("#c-sign").textContent, "Sign and register");
  assert.equal(p.$("#sign-h").textContent, "Register with this wallet");
  await p.tap(p.$("#c-sign"));
  const [reg] = posts(p, "/api/signup/wallet");
  assert.equal(reg.challengeId, CID); assert.equal(reg.address, ADDR);
  assert.equal(p.screen(), "done");
  assert.equal(p.$("#done-h").textContent, "You're registered.");
  assert.equal(p.$("#done-sub").textContent, "Your city is Columbus, US. Taking you to your dashboard…");
  await p.advance(1300);
  assert.deepEqual(p.assigned, ["/dashboard?welcome=1"]);
  assert.deepEqual(order, ["geo", "connect", "sign"], "the location before the wallet's connect and signature");
  const flow = p.calls.filter((c) => c.method === "POST").map((c) => c.path);
  assert.deepEqual(flow, ["/api/signup/start", "/api/signup/location", "/api/signup/terms", "/api/signup/name", "/api/auth/challenge", "/api/signup/wallet"]);
  // the point goes to the location step only, never anywhere else
  for (const c of p.calls) if (c.path !== "/api/signup/location") assert.doesNotMatch(JSON.stringify(c.body || {}), /39\.96|-82\.99|latitude|"lat"/, c.path);
  assert.deepEqual(posts(p, "/api/signup/location")[0].location, { lat: 39.9612, lon: -82.9988, accuracy: 30 });
});

test("a location that is denied or unavailable creates nothing and offers the link for a phone; the registration never turns into a sign-in", async () => {
  const s = server();
  const denied = { getCurrentPosition: (ok, no) => no({ code: 1 }) };
  const p = await openConnect({ me: WO, api: s.api, state: s.state, geolocation: denied, wallets: [fakeWallet("Phantom").wallet], clipboard: true });
  await p.tap(p.$("#su-loc-go"));
  assert.equal(p.screen(), "su-location");
  assert.equal(p.$("#su-loc-error").textContent, "Location is blocked. Allow location for this site in your browser settings, then try again.");
  assert.equal(p.visible(p.$("#su-loc-phone")), true);
  assert.equal(p.$("#su-loc-phone").textContent, "No location here? Copy the link and register on your phone");
  await p.tap(p.$("#su-loc-phone"));
  assert.deepEqual(p.copied, ["https://vicinity.test/connect"]);
  assert.equal(p.callsTo("/api/signup/location").length, 0); assert.equal(p.callsTo("/api/auth/challenge").length, 0);
  // the registration expired between the steps: it starts again at the city, saying so
  const t = server(located(true));
  t.api = ((orig) => async (path, body) => (path === "/api/signup/wallet" ? { ok: false, error: "signup_expired", _status: 410 } : orig(path, body)))(t.api);
  const q = await openConnect({ me: WO, api: t.api, state: t.state, wallets: [fakeWallet("Phantom").wallet] });
  q.$("#wo-terms").checked = true;
  await q.tap(q.$("#wallets-detected .wallet-option"));
  await q.tap(q.$("#c-sign"));
  assert.equal(q.screen(), "su-location");
  assert.equal(q.$("#su-note").textContent, "Your registration ran out. Start again: verify your city once, then connect your wallet.");
  assert.equal(q.callsTo("/api/auth/wallet").length, 0, "never a login check");
});

test("a wallet app's browser on Register your city: 'Open in Safari or Chrome' with the link to copy, never a location (R1-20)", async () => {
  const s = server(), geo = spyGeo([]);
  const p = await openConnect({ ua: UA.phantomApp, me: WO, api: s.api, state: s.state, search: "mode=register", geolocation: geo, wallets: [fakeWallet("Phantom").wallet], clipboard: true });
  assert.equal(p.screen(), "wo-inapp");
  assert.equal(p.$("#wo-inapp-h").textContent, "Open in Safari or Chrome");
  assert.equal(p.$("#wo-inapp-body").textContent, "Registration starts in Safari or Chrome: verify your city once there, then connect this wallet.");
  assert.equal(p.$("#wo-inapp-link").value, "https://vicinity.test/connect");
  await p.tap(p.$("#wo-inapp-copy"));
  assert.deepEqual(p.copied, ["https://vicinity.test/connect"]);
  noLegacy(p, "in app");
  await p.tap(p.$("#wo-inapp-signin"));
  assert.equal(p.screen(), "pick"); assert.equal(p.$("#tab-login").getAttribute("aria-pressed"), "true");
  await p.tap(p.$("#tab-new"));
  assert.equal(p.screen(), "wo-inapp");
  assert.equal(geo.calls, 0);
  assert.equal(p.callsTo("/api/signup/location").length, 0);
});

test("a phone's Safari: 'Open app' makes a five-minute code carried in the link's fragment; Safari waits, then says 'Sign in with your wallet here too'", async () => {
  const s = server(located(false));
  const p = await openConnect({ ua: UA.iphone, me: WO, api: s.api, state: s.state });
  assert.equal(p.screen(), "pick");
  assert.equal(p.$("#wo-reg-lead").textContent, "Tap your wallet app: it opens this page there to sign once. One free signature creates your account for Columbus, US. Nothing is paid or moved.");
  p.$("#wo-terms").checked = true;
  const tile = p.$$("#wallets-known button.wallet-option").find((b) => b.textContent.includes("Phantom"));
  await p.tap(tile);
  assert.deepEqual(posts(p, "/api/signup/handoff"), [{ app: "phantom" }]);
  assert.equal(p.screen(), "carry");
  assert.equal(p.$("#carry-h").textContent, "Register in Phantom");
  assert.equal(p.$("#carry-pin").textContent, "42");
  assert.equal(p.$("#carry-small").textContent, "This link works once, for 5 minutes, only on this phone. Never send it to anyone.");
  assert.equal(p.$("#carry-open").getAttribute("href"), `https://phantom.com/ul/browse/${encodeURIComponent(`https://vicinity.test/connect#register=${REG.code}`)}?ref=${encodeURIComponent("https://vicinity.test")}`);
  noLegacy(p, "carry");
  await p.advance(3000);
  assert.deepEqual(posts(p, "/api/signup/handoff/status"), [{ ref: REG.ref }]);
  s.world.handoffStatus = "registered";
  await p.advance(3000);
  assert.equal(p.screen(), "done");
  assert.equal(p.$("#done-h").textContent, "Registered in Phantom ✓");
  assert.equal(p.$("#done-sub").textContent, "Sign in with your wallet here too.");
  assert.equal(p.$("#done-stay").getAttribute("href"), "/connect?mode=login");
  assert.equal(p.assigned.length, 0, "no session moves to this browser");
  noCodeInUrls(p, [REG.code]);
});

test("the wallet app opens /connect#register=<code>: the code leaves the address bar first, the question names the city and the check number, then one signature registers", async () => {
  const order = [], s = server(), geo = spyGeo(order), { wallet } = orderedWallet(order, "Phantom");
  const p = await openConnect({ ua: UA.phantomApp, me: WO, api: s.api, state: s.state, hash: `register=${REG.code}`, geolocation: geo, wallets: [wallet] });
  assert.equal(p.screen(), "carry-in");
  const info = p.calls.find((c) => c.path === "/api/signup/handoff/info");
  assert.deepEqual(info.body, { code: REG.code });
  assert.ok(!info.addressBar.includes("register="), "the code left the address bar before the first request");
  assert.equal(p.$("#carry-in-h").textContent, "Register this wallet for Columbus, US?");
  assert.equal(p.$("#carry-in-pin").textContent, "42");
  assert.equal(p.$("#carry-in-yes").textContent, "Yes, register this wallet");
  noLegacy(p, "claim");
  await p.tap(p.$("#carry-in-yes"));
  await p.flush();
  assert.deepEqual(posts(p, "/api/auth/challenge"), [{ purpose: "register", address: ADDR, handoff: REG.code, opener: "o".repeat(32) }]);
  const [claim] = posts(p, "/api/signup/handoff/claim");
  assert.deepEqual([claim.code, claim.opener, claim.challengeId, claim.app], [REG.code, "o".repeat(32), CID, "phantom"]);
  assert.equal(p.screen(), "done"); assert.equal(p.$("#done-h").textContent, "You're registered.");
  assert.equal(geo.calls, 0, "no location inside the wallet app");
  assert.deepEqual(order, ["connect", "sign"]);
  noCodeInUrls(p, [REG.code]);
  // a dead code: one plain screen, never the registration's location
  const t = server();
  t.world.info = { ok: false, error: "contested", _status: 403 };
  const q = await openConnect({ ua: UA.phantomApp, me: WO, api: t.api, state: t.state, hash: `register=${REG.code}`, geolocation: geo, wallets: [fakeWallet("Phantom").wallet] });
  assert.equal(q.screen(), "link-dead");
  assert.equal(q.$("#ld-h").textContent, "That link was opened twice");
  assert.equal(q.visible(q.$("#ld-login")), false);
  assert.equal(q.session.get("vicinity-wo-register"), undefined, "a dead code is not kept for a reload");
});

test("a computer without a wallet: a register pairing (the code in the QR link's fragment, its status in POST bodies) and the phone approves it with the check number", async () => {
  const s = server(located(true));
  const p = await openConnect({ me: WO, api: s.api, state: s.state, setup: canvasStub });
  assert.equal(p.screen(), "pick");
  p.$("#wo-terms").checked = true;
  await p.tap(p.$("#alt-phone"));
  assert.deepEqual(posts(p, "/api/pair"), [{ purpose: "register" }]);
  assert.equal(p.screen(), "phone");
  assert.equal(JSON.parse(p.session.get("vicinity-pair")).for, "wo-register");
  await p.advance(2000);
  assert.deepEqual(posts(p, "/api/pair/status"), [{ code: PAIR }]);
  s.world.pairStatus = "ready";
  await p.advance(2000);
  assert.deepEqual(posts(p, "/api/pair/finish"), [{ code: PAIR }]);
  assert.equal(p.screen(), "done"); assert.equal(p.$("#done-h").textContent, "You're registered.");
  noCodeInUrls(p, [PAIR]);
  // the phone: /connect#pair=<code> in its wallet app
  const order = [], ph = server(), { wallet } = orderedWallet(order, "Phantom");
  const q = await openConnect({ ua: UA.phantomApp, me: WO, api: ph.api, state: ph.state, hash: `pair=${PAIR}&on=phone`, wallets: [wallet] });
  assert.equal(q.screen(), "approve");
  assert.deepEqual(posts(q, "/api/pair/status"), [{ code: PAIR }]);
  assert.equal(q.$("#approve-h").textContent, "Approve the registration you started");
  assert.equal(q.$("#approve-pin").textContent, "42");
  await q.tap(q.$("#approve-wallets .wallet-option"));
  await q.flush();
  assert.deepEqual(posts(q, "/api/auth/challenge"), [{ purpose: "register", address: ADDR, pair: PAIR }]);
  const [ok] = posts(q, "/api/auth/wallet");
  assert.deepEqual([ok.pair, ok.challengeId], [PAIR, CID]);
  assert.equal(q.visible(q.$("#approve-done")), true);
  assert.match(q.$("#approve-done-text").textContent, /Go back to Safari or Chrome: it finishes your registration\./);
  noCodeInUrls(q, [PAIR]);
});

test("a login pairing on Sign in: the phone approves a sign-in with a login challenge naming the pairing; no GET carries the code", async () => {
  const s = server();
  const p = await openConnect({ me: WO, api: s.api, state: s.state, search: "mode=login", setup: canvasStub });
  await p.tap(p.$("#alt-phone"));
  assert.deepEqual(posts(p, "/api/pair"), [{}]);
  assert.equal(JSON.parse(p.session.get("vicinity-pair")).for, "wo-login");
  s.world.pairStatus = "ready"; s.world.finish = { ok: true, status: "done", wallet: ADDR, next: "/dashboard" };
  await p.advance(2000);
  assert.equal(p.screen(), "done"); assert.equal(p.$("#done-h").textContent, "You're in.");
  noCodeInUrls(p, [PAIR]);
  const ph = server(); ph.world.pairPurpose = "login";
  const q = await openConnect({ ua: UA.phantomApp, me: WO, api: ph.api, state: ph.state, hash: `pair=${PAIR}`, wallets: [fakeWallet("Phantom").wallet] });
  assert.equal(q.$("#approve-h").textContent, "Approve the sign-in you started");
  await q.tap(q.$("#approve-wallets .wallet-option"));
  await q.flush();
  assert.deepEqual(posts(q, "/api/auth/challenge"), [{ purpose: "login", address: ADDR, pair: PAIR }]);
  noCodeInUrls(q, [PAIR]);
});

test("the pure helpers: the DS-06 words, the fragment codes, the step bar, safe destinations, the username rule", async () => {
  const p = await openConnect({ me: WO });
  const pure = p.win.VWalletOnly.pure;
  assert.equal(pure.DS06.register, DS_REG); assert.equal(pure.DS06.signin, DS_IN);
  assert.deepEqual({ ...pure.parseFragment(`#register=${REG.code}`) }, { register: REG.code, pair: null, on: null });
  assert.deepEqual({ ...pure.parseFragment(`#pair=${PAIR}&on=phone`) }, { register: null, pair: PAIR, on: "phone" });
  assert.deepEqual({ ...pure.parseFragment("#register=short&pair=<x>") }, { register: null, pair: null, on: null });
  assert.equal(pure.regView(blank()).view, "city");
  assert.equal(pure.regView(located()).view, "wallet");
  assert.equal(pure.regView(located(), "city").view, "city");
  assert.equal(pure.safeNext("/dashboard?welcome=1"), "/dashboard?welcome=1");
  assert.equal(pure.safeNext("https://evil.example/"), "/dashboard");
  assert.equal(pure.validName("NewbieOne"), true); assert.equal(pure.validName("1x"), false); assert.equal(pure.validName("a".repeat(21)), false);
  for (const t of Object.values(pure.ERR)) assert.doesNotMatch(t, LEGACY, t);
});
