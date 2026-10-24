// The connect page in the legacy link window (Citycoin.dev master v5, stage S14; master section 05 BR-03, section 18 WP-02; src/legacy.js): the
// real built page with site.js, wallets.js, connect.js and public/wallet-only.js in the just-enough DOM of test/helpers/connectpage.js, the server
// played by the test and fake wallets. What this pins: while /api/me carries `legacyLink`, Sign in and the no-account screen carry one line about
// the window (or that it closed) with the instant it ends; /connect?mode=legacy logs in once with Google (a plain link to the legacy start) or
// the e-mail code (with { legacy: true } in the body), then connects the wallet with a "legacy_link" challenge at /api/me/wallet/link (or a link
// pairing a phone approves), and ends on "Wallet connected" with Sign in as the next step (never the dashboard); every refusal is said where
// it helps; a phone approving the link reads the window's words; and without the key nothing of it shows. Real Chromium against the real
// Worker checks the looks and the whole journey (scratchpad harness, recorded in docs/citycoin-master/implementation-report.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADDR, UA, fakeWallet, openConnect } from "./helpers/connectpage.js";

const WO = { walletOnly: true, providers: { wallet: true } };
const OPEN = { open: true, until: "2026-12-01T00:00:00.000Z" }, CLOSED = { open: false, until: "2026-12-01T00:00:00.000Z" };
const UNTIL = "1 December 2026, 00:00 UTC";
const CID = "0123456789abcdef0123456789abcdef";
const PAIR = "P".repeat(24);
const soon = (seconds = 300) => new Date(Date.now() + seconds * 1000).toISOString();
const STMT = "Link this wallet to my existing Vicinity account @KeenRidge33";
const message = (address, extra = "") => `vicinity.test wants you to sign in with your Solana account:\n${address}\n\n${STMT}${extra}. Free, not a transaction, cannot move funds.\n\nRequest ID: legacy_link`;
const blank = () => ({ terms: { done: false, version: "2026-10-01" }, location: { done: false }, name: null, next: "location" });

/** The server of a wallet-only site in the legacy window: the answers a test sets in `world`. */
function server() {
  const world = { start: { ok: true }, verify: null, link: null, pairStatus: "waiting", finish: null };
  const api = async (path, body) => {
    if (path === "/api/auth/email/start") return world.start;
    if (path === "/api/auth/email/verify") return world.verify || { ok: true, legacy: true, account: "KeenRidge33", expiresAt: soon(900), next: "/connect?mode=legacy" };
    if (path === "/api/auth/challenge") return { ok: true, challengeId: CID, message: message(body.address, body.pair ? " on my other device (check number 42)" : ""), purpose: body.purpose, expiresAt: soon(120) };
    if (path === "/api/me/wallet/link") return world.link || { ok: true, linked: true, wallet: body.address, next: "/connect?mode=login" };
    if (path === "/api/auth/wallet") return body.pair ? { ok: true, paired: true } : { ok: true, wallet: body.address, next: "/dashboard" };
    if (path === "/api/pair") return { ok: true, code: PAIR, pin: "42", purpose: body.purpose || "login", url: `https://vicinity.test/connect#pair=${PAIR}`, expiresAt: soon() };
    if (path === "/api/pair/status") return { status: world.pairStatus, pin: "42", purpose: "link", name: "Ke•••", handle: "Ke•••", community: { name: "Utica", country: "US" }, terms: "2026-10-01" };
    if (path === "/api/pair/finish") return world.finish || { ok: true, status: "done", linked: true, wallet: ADDR, next: "/connect?mode=login" };
    return { ok: true };
  };
  return { world, api };
}
const canvasStub = ({ doc }) => { doc.querySelector("#qr").getContext = () => ({ fillRect() {}, set fillStyle(v) { /* nothing drawn */ } }); };
const seen = (n) => (n.hidden ? "" : n.childNodes ? n.childNodes.map(seen).join("") : n.textContent || "");
const words = (n) => seen(n).replace(/\s+/g, " ").trim();
const posts = (p, path) => p.calls.filter((c) => c.path === path).map((c) => c.body);
const spyGeo = () => { const g = { calls: 0, getCurrentPosition: () => { g.calls++; } }; return g; };

test("without the legacyLink key nothing of the window shows, /connect?mode=legacy included (the S12 page)", async () => {
  const s = server();
  const p = await openConnect({ me: WO, api: s.api, state: blank(), search: "mode=legacy" });
  assert.equal(p.screen(), "su-location", "no window: the page's ordinary first path");
  assert.equal(p.visible(p.$("#wo-legacy-note")), false);
  assert.equal(p.visible(p.$(".su-tabs")), true);
  const q = await openConnect({ me: WO, api: s.api, state: blank(), search: "mode=login" });
  assert.equal(q.screen(), "pick");
  assert.equal(q.visible(q.$("#wo-legacy-note")), false);
  assert.doesNotMatch(words(q.$(".connect")), /Google|e-mail/);
});

test("Sign in carries one line about the window, with the exact instant it ends; its link opens the legacy log-in (Google, or the e-mail code)", async () => {
  const s = server();
  const p = await openConnect({ me: { ...WO, legacyLink: OPEN }, api: s.api, state: blank(), search: "mode=login" });
  assert.equal(p.screen(), "pick");
  assert.equal(words(p.$("#wo-legacy-note")), `Made your account with Google or e-mail before wallet sign-in? Connect a wallet to it until ${UNTIL}. Connect a wallet to my account`);
  assert.equal(p.$("#wo-legacy-note a").getAttribute("href"), "/connect?mode=legacy");
  await p.tap(p.$("#wo-legacy-note a"));
  assert.equal(p.screen(), "wo-legacy");
  assert.equal(p.visible(p.$(".su-tabs")), false, "no tab of its own");
  assert.equal(p.$("#wo-lg-h").textContent, "Connect a wallet to your account");
  assert.equal(p.$("#wo-lg-body").textContent, `Your account was made with Google or e-mail. Log in with it here once, then connect the wallet that will open your account from now on. This works until ${UNTIL}.`);
  assert.equal(p.$("#wo-lg-google").getAttribute("href"), "/api/auth/google/start?legacy=1");
  assert.equal(p.visible(p.$("#wo-lg-google")), true);
  assert.equal(p.visible(p.$("#wo-lg-inapp")), false);
  assert.equal(p.visible(p.$("#wo-lg-addr")), true);
  await p.tap(p.$("#wo-lg-back"));
  assert.equal(p.screen(), "pick");
  // the no-account screen carries it too: a legacy member who tries a wallet sign-in first
  const t = server();
  const { wallet } = fakeWallet("Phantom");
  const api = async (path, body) => (path === "/api/auth/wallet" ? { ok: false, error: "no_account", _status: 404 } : t.api(path, body));
  const q = await openConnect({ me: { ...WO, legacyLink: OPEN }, api, state: blank(), search: "mode=login", wallets: [wallet] });
  await q.tap(q.$("#wallets-detected .wallet-option"));
  await q.tap(q.$("#c-sign"));
  assert.equal(q.screen(), "no-account");
  assert.match(words(q.$("#wo-legacy-note-na")), /^Made your account with Google or e-mail before wallet sign-in\? Connect a wallet to it until 1 December 2026/);
  await q.tap(q.$("#wo-legacy-note-na a"));
  assert.equal(q.screen(), "wo-legacy");
});

test("/connect?mode=legacy by e-mail: the code (legacy: true), then the wallet signs a legacy_link challenge at /api/me/wallet/link; 'Wallet connected' leads to Sign in, never the dashboard", async () => {
  const s = server(), geo = spyGeo(), { wallet, ctl } = fakeWallet("Phantom");
  const p = await openConnect({ me: { ...WO, legacyLink: OPEN }, api: s.api, state: blank(), search: "mode=legacy", wallets: [wallet], geolocation: geo });
  assert.equal(p.screen(), "wo-legacy");
  assert.equal(p.$(".connect__intro .kicker").textContent, "Connect a wallet");
  assert.equal(p.$(".connect__intro .lead").textContent, "For an account made with Google or e-mail before wallet sign-in.");
  p.$("#wo-lg-addr").value = "not-an-address";
  await p.tap(p.$("#wo-lg-send"));
  assert.equal(p.$("#wo-lg-error").textContent, "That doesn't look like an e-mail address.");
  assert.equal(posts(p, "/api/auth/email/start").length, 0);
  p.$("#wo-lg-addr").value = " Old@Example.com ";
  await p.tap(p.$("#wo-lg-send"));
  assert.deepEqual(posts(p, "/api/auth/email/start"), [{ email: "old@example.com", legacy: true }]);
  assert.equal(p.visible(p.$("#wo-lg-step-code")), true);
  assert.equal(p.$("#wo-lg-sent").textContent, "If an account was made with old@example.com, a 6-digit code is on its way. It works for 10 minutes.");
  // a wrong code is said, and the step stays
  s.world.verify = { ok: false, error: "code_wrong", left: 4, _status: 400 };
  p.$("#wo-lg-code").value = "000000";
  await p.tap(p.$("#wo-lg-verify"));
  assert.equal(p.$("#wo-lg-error").textContent, "That code doesn't match. 4 tries left.");
  s.world.verify = null;
  p.$("#wo-lg-code").value = "123456";
  await p.tap(p.$("#wo-lg-verify"));
  assert.deepEqual(posts(p, "/api/auth/email/verify").at(-1), { email: "old@example.com", code: "123456", legacy: true });
  // logged in for 15 minutes: the link step on the wallets screen
  assert.equal(p.screen(), "pick");
  assert.equal(p.$("#wallet-h").textContent, "Connect the wallet for your account");
  assert.equal(p.visible(p.$("#wo-legacy-lead")), true);
  assert.equal(p.visible(p.$("#wo-signin")), false);
  assert.equal(p.visible(p.$(".su-tabs")), false);
  await p.tap(p.$("#wallets-detected .wallet-option"));
  assert.equal(p.screen(), "sign");
  assert.equal(p.$("#sign-h").textContent, "Connect this wallet to your account");
  assert.equal(p.$("#c-sign").textContent, "Sign and connect");
  assert.deepEqual(posts(p, "/api/auth/challenge"), [{ purpose: "legacy_link", address: ADDR }]);
  await p.tap(p.$("#c-sign"));
  assert.deepEqual(ctl.messages, [message(ADDR)]);
  const [linkBody] = posts(p, "/api/me/wallet/link");
  assert.deepEqual(Object.keys(linkBody).sort(), ["address", "challengeId", "message", "signature"]);
  assert.equal(linkBody.challengeId, CID);
  assert.equal(p.screen(), "done");
  assert.equal(p.$("#done-h").textContent, "Wallet connected");
  assert.equal(p.$("#done-sub").textContent, "From now on this wallet opens your account. Sign in with it to see your dashboard.");
  assert.deepEqual([p.$("#done-go").getAttribute("href"), p.$("#done-go").textContent], ["/connect?mode=login", "Sign in with your wallet"]);
  await p.advance(3000);
  assert.deepEqual(p.assigned, [], "no dashboard from a legacy log-in");
  assert.equal(geo.calls, 0, "no location anywhere on this path");
  assert.equal(p.calls.filter((c) => /^\/api\/auth\/wallet$/.test(c.path)).length, 0, "nothing signed in");
});

test("back from Google: legacy=signed_in opens the link step; an error comes back as the window's own words", async () => {
  const s = server(), { wallet } = fakeWallet("Phantom");
  const p = await openConnect({ me: { ...WO, legacyLink: OPEN }, api: s.api, state: blank(), search: "mode=legacy&legacy=signed_in", wallets: [wallet] });
  assert.equal(p.screen(), "pick");
  assert.equal(p.$("#wallet-h").textContent, "Connect the wallet for your account");
  for (const [q, said] of [["error=no_account&login=google", "No account was made with this Google account. Check that you picked the one you signed up with."],
    ["error=use_wallet", "This account already has a wallet. Sign in with your wallet instead."], ["error=login_cancelled", "The Google log-in was cancelled. Nothing changed."],
    ["error=login_expired", "That log-in took too long or was opened in another tab. Please try again."]]) {
    const r = await openConnect({ me: { ...WO, legacyLink: OPEN }, api: s.api, state: blank(), search: `mode=legacy&${q}` });
    assert.equal(r.screen(), "wo-legacy", q);
    assert.equal(r.$("#wo-lg-error").textContent, said, q);
    assert.ok(!r.addressBar.at(-1).includes("error="), "the error leaves the address bar");
  }
});

test("refusals on the link: a wallet that has an account, a log-in that ran out, a window that closed meanwhile", async () => {
  const s = server(), { wallet } = fakeWallet("Phantom");
  const p = await openConnect({ me: { ...WO, legacyLink: OPEN }, api: s.api, state: blank(), search: "mode=legacy&legacy=signed_in", wallets: [wallet] });
  s.world.link = { ok: false, error: "wallet_taken", _status: 409 };
  await p.tap(p.$("#wallets-detected .wallet-option"));
  await p.tap(p.$("#c-sign"));
  assert.equal(p.screen(), "pick");
  assert.equal(p.$("#c-error").textContent, "This wallet already has an account here. Connect another wallet, or sign in with this one to open its own account.");
  s.world.link = { ok: false, error: "legacy_sign_in", _status: 401 };
  await p.tap(p.$("#wallets-detected .wallet-option"));
  await p.tap(p.$("#c-sign"));
  assert.equal(p.screen(), "wo-legacy");
  assert.equal(p.$("#wo-lg-error").textContent, "Your log-in ran out (it lasts 15 minutes). Log in again.");
  // the window closed while the page was open
  const t = server(), { wallet: w2 } = fakeWallet("Phantom");
  t.world.link = { ok: false, error: "window_closed", until: "2026-12-01T00:00:00.000Z", _status: 410 };
  const q = await openConnect({ me: { ...WO, legacyLink: OPEN }, api: t.api, state: blank(), search: "mode=legacy&legacy=signed_in", wallets: [w2] });
  await q.tap(q.$("#wallets-detected .wallet-option"));
  await q.tap(q.$("#c-sign"));
  assert.equal(q.screen(), "wo-legacy");
  assert.equal(q.$("#wo-lg-h").textContent, "This window has closed");
  assert.equal(q.visible(q.$("#wo-lg-login")), false);
});

test("after LEGACY_LINK_UNTIL: Sign in says nothing of Google or e-mail any more (review finding F8), and /connect?mode=legacy says the window closed, with no log-in", async () => {
  const s = server();
  const p = await openConnect({ me: { ...WO, legacyLink: CLOSED }, api: s.api, state: blank(), search: "mode=login" });
  assert.equal(p.visible(p.$("#wo-legacy-note")), false);
  assert.equal(words(p.$("#wo-legacy-note")), "");
  assert.equal(p.$("#wo-legacy-note a"), null);
  const q = await openConnect({ me: { ...WO, legacyLink: CLOSED }, api: s.api, state: blank(), search: "mode=legacy" });
  assert.equal(q.screen(), "wo-legacy");
  assert.equal(q.$("#wo-lg-h").textContent, "This window has closed");
  assert.equal(q.visible(q.$("#wo-lg-login")), false);
  assert.equal(q.visible(q.$("#wo-lg-google")), false);
  assert.equal(q.visible(q.$("#wo-lg-back")), true);
  assert.equal(posts(q, "/api/auth/email/start").length, 0);
});

test("inside a wallet app's browser the Google log-in is not offered (it cannot run there); the e-mail code is", async () => {
  const s = server();
  const p = await openConnect({ ua: UA.phantomApp, me: { ...WO, legacyLink: OPEN }, api: s.api, state: blank(), search: "mode=legacy", wallets: [fakeWallet("Phantom").wallet] });
  assert.equal(p.screen(), "wo-legacy");
  assert.equal(p.visible(p.$("#wo-lg-google")), false);
  assert.equal(p.visible(p.$("#wo-lg-inapp")), true);
  assert.equal(p.visible(p.$("#wo-lg-addr")), true);
});

test("a computer without a wallet: a link pairing (the code in the QR link's fragment, its status in POST bodies) finishes the link here", async () => {
  const s = server();
  const p = await openConnect({ me: { ...WO, legacyLink: OPEN }, api: s.api, state: blank(), search: "mode=legacy&legacy=signed_in", setup: canvasStub });
  assert.equal(p.screen(), "pick");
  await p.tap(p.$("#alt-phone"));
  assert.deepEqual(posts(p, "/api/pair"), [{ purpose: "link" }]);
  assert.equal(p.screen(), "phone");
  assert.equal(JSON.parse(p.session.get("vicinity-pair")).for, "wo-legacy");
  await p.advance(2000);
  assert.deepEqual(posts(p, "/api/pair/status"), [{ code: PAIR }]);
  s.world.pairStatus = "ready";
  await p.advance(2000);
  assert.deepEqual(posts(p, "/api/pair/finish"), [{ code: PAIR }]);
  assert.equal(p.screen(), "done");
  assert.equal(p.$("#done-h").textContent, "Wallet connected");
  assert.equal(p.session.get("vicinity-pair"), undefined);
  for (const c of p.calls) assert.ok(!c.path.includes(PAIR), `a code in ${c.method} ${c.path}`);
});

test("the phone approving a link pairing reads the window's words (no product name), and signs a legacy_link challenge naming the check number", async () => {
  const s = server(), { wallet } = fakeWallet("Phantom");
  const p = await openConnect({ ua: UA.phantomApp, me: { ...WO, legacyLink: OPEN }, api: s.api, state: blank(), hash: `pair=${PAIR}&on=phone`, wallets: [wallet] });
  assert.equal(p.screen(), "approve");
  assert.equal(p.$("#approve-h").textContent, "Connect this wallet to your account?");
  assert.equal(p.$("#approve-owner").textContent, "@Ke•••");
  assert.equal(p.$("#approve-city").textContent, "Utica, US");
  assert.equal(words(p.$("#approve-ask")), "Does Safari or Chrome, where you logged in, show check number 42?");
  assert.equal(p.$("#approve-warn").textContent, "Only continue if you just logged in to your own account yourself. From now on this wallet opens that account.");
  assert.doesNotMatch(words(p.$('.cstate[data-state="approve"]')), /Vicinity/);
  await p.tap(p.$("#approve-wallets .wallet-option"));
  await p.flush();
  assert.deepEqual(posts(p, "/api/auth/challenge"), [{ purpose: "legacy_link", address: ADDR, pair: PAIR }]);
  const [ok] = posts(p, "/api/auth/wallet");
  assert.deepEqual([ok.pair, ok.challengeId], [PAIR, CID]);
  assert.equal(p.visible(p.$("#approve-done")), true);
  assert.equal(words(p.$("#approve-done-text")), "Approved. Go back to Safari or Chrome: it finishes the link. Then sign in with this wallet.");
});

test("the pure helpers: the instant in words, the refusals, and no product name in the window's words", async () => {
  const p = await openConnect({ me: WO });
  const pure = p.win.VWalletOnly.pure;
  assert.equal(pure.untilText("2026-12-01T00:00:00.000Z"), "1 December 2026, 00:00 UTC");
  assert.equal(pure.untilText("2027-03-09T17:05:00Z"), "9 March 2027, 17:05 UTC");
  assert.equal(pure.untilText("soon"), ""); assert.equal(pure.untilText(null), "");
  assert.equal(pure.legacyText({ error: "code_wrong", left: 1 }), "That code doesn't match. 1 try left.");
  assert.equal(pure.legacyText({ error: "no_account", login: "email" }), "No account was made with this e-mail address. Check the address you signed up with.");
  assert.equal(pure.legacyText("slow_down"), pure.ERR.slow_down);
  const all = [...Object.values(pure.LEGACY).map((v) => (typeof v === "function" ? v("X") : v)), ...Object.values(pure.LEGACY_ERR)];
  for (const t of all) assert.doesNotMatch(t, /Vicinity|Citycoin/, t);
  // the two everyday paths still never speak of Google or e-mail (their words live in ERR, the window's apart)
  for (const t of Object.values(pure.ERR)) assert.doesNotMatch(t, /Google|e-mail/, t);
});
