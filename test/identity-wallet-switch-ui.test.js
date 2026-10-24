// Wallet-only pages besides /connect (Citycoin.dev master v5, stage S12; master section 18 WP-02 "When the wallet switches, clear the old
// session/data and authenticate the new address", "Disconnect/logout clears the application session"; section 19 WP-03 and acceptance A04 "no
// geolocation call on post/launch/apply"): the signed-in dashboard (site.js, wallets.js, dashboard.js, dashboard-roles.js in the just-enough DOM
// of test/helpers/dashpage.js) and the admin console (public/admin.js). While /api/me says walletOnly: a wallet that showed the account's
// address and then reports another one signs this browser out, clears what the tab kept and opens Sign in; logout disconnects the wallets;
// the fresh proof is a server "reprove" challenge (no transfer proof); a town request and an application ask for no location; no new check-in;
// no Google or unlink rows; the admin console signs and re-proves with its "admin" challenge. With the switch off: every one of these is today's.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { ADDR, memberMe, openDashboard } from "./helpers/dashpage.js";
import { openPage } from "./helpers/pagedom.js";

const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const CID = "0123456789abcdef0123456789abcdef";
const walletMe = (extra = {}) => ({ ...memberMe({ wallet: ADDR }), walletOnly: true, providers: { wallet: true }, ...extra });
const todayMe = () => memberMe({ wallet: ADDR });

/** A Wallet Standard wallet with "change" events and a disconnect counter; `accounts` is what it shares with the site at the start. */
function eventWallet(name = "Phantom", accounts = [ADDR]) {
  const acc = (a) => ({ address: a, publicKey: new Uint8Array(32), chains: ["solana:mainnet"], features: ["solana:signMessage"] });
  const ctl = { listeners: new Set(), disconnects: 0, current: accounts.map(acc), messages: [] };
  const wallet = {
    version: "1.0.0", name, icon: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", chains: ["solana:mainnet"], get accounts() { return ctl.current; },
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: ctl.current.length ? ctl.current : [acc(ADDR)] }) },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { ctl.disconnects++; } },
      "standard:events": { version: "1.0.0", on: (ev, cb) => { if (ev === "change") ctl.listeners.add(cb); return () => ctl.listeners.delete(cb); } },
      "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }) => { ctl.messages.push(new TextDecoder().decode(message)); return [{ signedMessage: message, signature: new Uint8Array(64).fill(7) }]; } },
    },
  };
  ctl.switchTo = (a) => { ctl.current = a ? [acc(a)] : []; for (const cb of ctl.listeners) cb({ accounts: ctl.current }); };
  return { wallet, ctl };
}
const tabState = { "vicinity-pair": "{}", "vicinity-link": "{}", "vicinity-wo-carry": "{}", "vl-started": "1" };

test("the wallet switches to another address while signed in: signed out, this tab's state cleared, Sign in opens (WALLET_ONLY counting)", async () => {
  const { wallet, ctl } = eventWallet();
  const p = await openDashboard({ me: walletMe(), wallets: [wallet], session: tabState, storage: { "vicinity:dash-v2": "{}", "vicinity-theme": "dark" } });
  assert.equal(p.callsTo("/api/auth/logout").length, 0);
  ctl.switchTo(OTHER);
  await p.flush();
  assert.equal(p.callsTo("/api/auth/logout").length, 1);
  assert.deepEqual(p.assigned, ["/connect?mode=login"]);
  for (const k of Object.keys(tabState)) assert.equal(p.session.has(k), false, k);
  assert.equal(p.local.has("vicinity:dash-v2"), false);
  assert.equal(p.local.get("vicinity-theme"), "dark", "a person's own settings stay");
  // twice is still one sign-out
  ctl.switchTo(ADDR); ctl.switchTo(OTHER); await p.flush();
  assert.equal(p.callsTo("/api/auth/logout").length, 1);
});

test("what is not a switch changes nothing: a wallet that locks (no account), a wallet that never showed the account's address, the same address again", async () => {
  const { wallet, ctl } = eventWallet();
  const p = await openDashboard({ me: walletMe(), wallets: [wallet] });
  ctl.switchTo(null); await p.flush();   // locked: no account shared
  ctl.switchTo(ADDR); await p.flush();   // back: the same address
  assert.equal(p.callsTo("/api/auth/logout").length, 0);
  assert.deepEqual(p.assigned, []);
  // another wallet in this browser, never on the account's address (connected to pay with, say): its account is its own business
  const other = eventWallet("Solflare", []);
  const q = await openDashboard({ me: walletMe(), wallets: [other.wallet] });
  other.ctl.switchTo(OTHER); await q.flush();
  assert.equal(q.callsTo("/api/auth/logout").length, 0);
  // ...until it shows the account's address and then leaves it
  other.ctl.switchTo(ADDR); other.ctl.switchTo(OTHER); await q.flush();
  assert.equal(q.callsTo("/api/auth/logout").length, 1);
});

test("an older wallet's accountChanged signs out the same way", async () => {
  const handlers = {};
  const pk = (a) => ({ toString: () => a, toBase58: () => a });
  const solana = { isPhantom: true, publicKey: pk(ADDR), isConnected: true, connect: async () => ({ publicKey: pk(ADDR) }), signMessage: async () => ({ signature: new Uint8Array(64) }),
    disconnect: async () => {}, on: (ev, cb) => { handlers[ev] = cb; } };
  const p = await openDashboard({ me: walletMe(), globals: { phantom: { solana } } });
  assert.equal(typeof handlers.accountChanged, "function", "the watch listens");
  handlers.accountChanged(null); await p.flush(); // (a disconnect: not a switch)
  assert.equal(p.callsTo("/api/auth/logout").length, 0);
  handlers.accountChanged(pk(OTHER)); await p.flush();
  assert.equal(p.callsTo("/api/auth/logout").length, 1);
  assert.deepEqual(p.assigned, ["/connect?mode=login"]);
});

test("with the switch off (or signed out) nothing is watched: today's dashboard", async () => {
  const { wallet, ctl } = eventWallet();
  const p = await openDashboard({ me: todayMe(), wallets: [wallet] });
  ctl.switchTo(OTHER); await p.flush();
  assert.equal(p.callsTo("/api/auth/logout").length, 0);
  assert.deepEqual(p.assigned, []);
  assert.equal(ctl.listeners.size, 0, "no listener at all");
  const handlers = {};
  const solana = { isPhantom: true, publicKey: { toString: () => ADDR }, connect: async () => ({}), signMessage: async () => ({}), on: (ev, cb) => { handlers[ev] = cb; } };
  await openDashboard({ me: todayMe(), globals: { phantom: { solana } } });
  assert.equal(handlers.accountChanged, undefined);
});

test("logout disconnects the page's wallets while WALLET_ONLY counts; today's logout does not", async () => {
  const on = eventWallet();
  const p = await openDashboard({ me: walletMe(), wallets: [on.wallet], session: tabState });
  await p.win.V.logout("/"); await p.flush();
  assert.equal(on.ctl.disconnects, 1);
  assert.deepEqual(p.assigned, ["/"]);
  assert.equal(p.session.has("vicinity-pair"), false);
  const off = eventWallet();
  const q = await openDashboard({ me: todayMe(), wallets: [off.wallet], session: tabState });
  await q.win.V.logout("/"); await q.flush();
  assert.equal(off.ctl.disconnects, 0);
  assert.equal(q.session.get("vicinity-pair"), "{}", "today's logout keeps the tab's other state");
});

test("the fresh proof under WALLET_ONLY is a server 'reprove' challenge, with no tiny transfer; today's is the signed message", async () => {
  const run = async (me) => {
    const { wallet, ctl } = eventWallet();
    let asked = 0;
    const p = await openDashboard({ me, wallets: [wallet], api: async (path, body) => {
      if (path === "/api/me/username") return asked++ ? { ok: true, handle: body.handle } : { ok: false, error: "reprove", _status: 403 };
      if (path === "/api/auth/challenge") return { ok: true, challengeId: CID, message: `challenge for ${body.purpose}`, purpose: body.purpose };
      if (path.startsWith("/api/message")) return { message: "today's message" };
      if (path === "/api/auth/reprove") return { ok: true };
      return undefined;
    } });
    p.win.V.openProfile(); await p.flush();
    p.$("#username-input").value = "NewName";
    p.$("#username-form").dispatchEvent(Object.assign(new (p.win.CustomEvent)("submit"), { preventDefault() {} }));
    await p.flush();
    return { p, ctl };
  };
  const { p, ctl } = await run(walletMe());
  assert.equal(p.$("#proof-modal").hidden, false);
  assert.equal(p.$("#proof-transfer").hidden, true, "no tiny-transfer proof");
  assert.equal(p.$("#proof-login").hidden, true);
  await p.tap(p.$("#proof-wallets button"));
  await p.flush();
  assert.deepEqual(p.callsTo("/api/auth/challenge").map((c) => c.body), [{ purpose: "reprove", address: ADDR }]);
  assert.deepEqual(p.callsTo("/api/auth/reprove").map((c) => [c.body.challengeId, c.body.message]), [[CID, "challenge for reprove"]]);
  assert.deepEqual(ctl.messages, ["challenge for reprove"]);
  assert.equal(p.callsTo("/api/message").length, 0);
  // today's
  const t = await run(todayMe());
  assert.equal(t.p.$("#proof-transfer").hidden, false);
  await t.p.tap(t.p.$("#proof-wallets button")); await t.p.flush();
  assert.equal(t.p.callsTo("/api/auth/challenge").length, 0);
  assert.deepEqual(t.p.callsTo("/api/auth/reprove").map((c) => c.body.challengeId), [undefined]);
});

test("A04 on the dashboard: a town request asks for no location under WALLET_ONLY; no new check-in; no Google sign-in or unlink rows", async () => {
  let geo = 0;
  const atDefer = (doc, win) => { win.navigator.geolocation = { getCurrentPosition: () => { geo++; } }; };
  const p = await openDashboard({ me: walletMe(), atDefer, api: async (path, body) => (path === "/api/towns" && body ? { ok: true } : undefined) });
  p.$("#req-name").value = "Newtown";
  p.$("#req-form").dispatchEvent(Object.assign(new (p.win.CustomEvent)("submit"), { preventDefault() {} }));
  await p.flush();
  assert.deepEqual(p.callsTo("/api/towns").filter((c) => c.method === "POST").map((c) => c.body), [{ name: "Newtown" }]);
  assert.equal(p.callsTo("/api/locate").length, 0);
  assert.equal(geo, 0);
  // the Check-ins chip still reads the old ones, but there is no form to post a new one
  await p.tap(p.$('.chips [data-kind="checkin"]'));
  assert.equal(p.$("#composer").hidden, true);
  p.win.V.openProfile(); await p.flush();
  assert.equal(p.$("#google-sec").hidden, true);
  assert.equal(p.$("#profile-unlink").hidden, true);
  assert.equal(p.$("#profile-provider").textContent, "Wallet");
  // today's: the town request checks the location first (and this browser has none to give), the check-in form is there
  let geo2 = 0;
  const q = await openDashboard({ me: todayMe(), atDefer: (doc, win) => { win.navigator.geolocation = { getCurrentPosition: () => { geo2++; } }; } });
  q.$("#req-name").value = "Newtown";
  q.$("#req-form").dispatchEvent(Object.assign(new (q.win.CustomEvent)("submit"), { preventDefault() {} }));
  await q.flush();
  assert.equal(geo2, 1, "today's request asks for the location");
  await q.tap(q.$('.chips [data-kind="checkin"]'));
  assert.equal(q.$("#composer").hidden, false);
  q.win.V.openProfile(); await q.flush();
  assert.equal(q.$("#google-sec").hidden, false);
  assert.equal(q.$("#profile-unlink").hidden, false);
});

/* ---------------------------------------------------------------- the admin console */

const ADMIN_JS = readFileSync(new URL("../public/admin.js", import.meta.url), "utf8");
async function adminPage(me) {
  const page = await openPage("admin.html", { agreed: "2026-10-01", me });
  const win = page.window, doc = page.doc, calls = [];
  let signedIn = false;
  win.fetch = async (path, init = {}) => {
    const p = String(path).split("?")[0], body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path: String(path), body });
    const d = p === "/api/auth/challenge" ? { ok: true, challengeId: CID, message: "admin challenge text" }
      : p === "/api/message" ? { message: "today's admin message" }
        : p === "/api/auth/wallet" ? (signedIn = true, { ok: true, wallet: ADDR, next: "/dashboard" })
          : p === "/api/admin/me" ? (signedIn ? { ok: true, wallet: ADDR, role: "owner" } : { ok: false, error: "sign_in" })
            : { ok: false, error: "not_found" };
    return { ok: d.ok !== false, status: d.ok === false ? 404 : 200, json: async () => JSON.parse(JSON.stringify(d)) };
  };
  win.setTimeout = (fn) => { setImmediate(fn); return 0; };
  win.location = { hash: "", pathname: "/admin", href: "https://vicinity.test/admin" };
  const signed = [];
  const adapter = { name: "Phantom", icon: null, connect: async () => ADDR, signMessage: async (bytes) => { signed.push(new TextDecoder().decode(bytes)); return new Uint8Array(64); } };
  win.VW = { list: () => [adapter], isMobile: false, KNOWN: [], onChange() {}, safeIcon: () => null, mark: () => doc.createElement("span") };
  win.TextEncoder = TextEncoder; win.TextDecoder = TextDecoder; win.btoa = (s) => Buffer.from(s, "binary").toString("base64");
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  vm.runInContext(ADMIN_JS, win, { filename: "public/admin.js" });
  const tick = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };
  await tick();
  return { doc, calls, signed, tick };
}

test("the admin console signs in with an 'admin' challenge under WALLET_ONLY, and with today's message otherwise", async () => {
  const a = await adminPage({ ok: true, signedIn: false, walletOnly: true });
  a.doc.querySelector("#admin-wallets .wallet-option").click(); await a.tick();
  assert.deepEqual(a.calls.filter((c) => c.path === "/api/auth/challenge").map((c) => c.body), [{ purpose: "admin", address: ADDR }]);
  assert.equal(a.doc.querySelector("#admin-msg").textContent, "admin challenge text");
  a.doc.querySelector("#admin-sign").click(); await a.tick();
  assert.deepEqual(a.signed, ["admin challenge text"]);
  const [login] = a.calls.filter((c) => c.path === "/api/auth/wallet").map((c) => c.body);
  assert.equal(login.challengeId, CID);
  assert.equal(a.calls.filter((c) => c.path.startsWith("/api/message")).length, 0);
  const t = await adminPage({ ok: true, signedIn: false });
  t.doc.querySelector("#admin-wallets .wallet-option").click(); await t.tick();
  assert.equal(t.calls.filter((c) => c.path === "/api/auth/challenge").length, 0);
  assert.equal(t.doc.querySelector("#admin-msg").textContent, "today's admin message");
  t.doc.querySelector("#admin-sign").click(); await t.tick();
  assert.deepEqual(Object.keys(t.calls.find((c) => c.path === "/api/auth/wallet").body).sort(), ["address", "message", "signature"]);
});
