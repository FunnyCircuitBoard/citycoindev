// Citycoin.dev master v5, stage S23 review fixes: what stays open while the legacy launch path is closed (LEGACY_LAUNCH=off), and what the
// closed path no longer says or sends. A founder can still withdraw their own coin request (POST /api/coins/review/cancel) and take their
// own picture down (POST /api/coins/design with exactly { removeLogo: true }); a reviewer can still ask for changes, never approve (review
// findings CL-1, S23-OFF-2, SEC-S23-3). The founder's review card is read-only history (S23-OFF-4). The job's ticker notice promises no
// launch (S23-OFF-5, SEC-S23-2). The owner's candidates say first that nothing is approvable, and /api/official carries the switch for the
// Launchpad page (S23-OFF-6). The relay no longer sends a legacy approve_launch or launch built before the switch closed (SEC-S23-4). The
// gate has no fail-open catch, and the two exports only the deleted round used are gone (S23-NIT-1, SEC-S23-5). No "approval round" words
// are left in the Worker (S23-COPY-1). Fake chain, fake data; nothing remote.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { ORIGIN, browser, newWorld, person, realClock } from "./helpers/world.js";
import { handleApi } from "../src/index.js";
import { _resetLpKit, buildTx } from "../src/lpkit.js";
import { _resetLpAdmin } from "../src/lpadmin.js";
import * as LPADMIN from "../src/lpadmin.js";
import { _resetLpCoins } from "../src/lpcoins.js";
import { _resetRelay } from "../src/relay.js";
import { _setArtRenderer } from "../src/coinready.js";
import * as REVIEW from "../src/coinreview.js";
import { _resetReview, registryStep } from "../src/coinreview.js";
import { _resetCityCache } from "../src/cities.js";
import { _resetTickers } from "../src/tickers.js";
import { _resetPolicyCheck } from "../src/v5policy.js";
import { officialFor } from "../src/official.js";
import { DECISION_OPEN, LEGACY_LAUNCH_CLOSED, LEGACY_LAUNCH_LINE, REVIEW_OPEN, closedLaunchTx, decisionOpen, logoRemovalOnly } from "../src/legacylaunch.js";
import { DISCRIMINATORS as ADMIN_IX } from "../src/sol/lpadmin-ix.js";
import { DISCRIMINATORS as LAUNCH_IX } from "../src/sol/lplaunch-ix.js";
import { PROGRAM_IDS } from "../src/sol/pda.js";
import { decodeHeader } from "../src/sol/message.js";
import { fromBase64, toBase64 } from "../src/sol/bytes.js";
import { nodeRenderer } from "../scripts/coin-art/render.mjs";
import { UTICA, approvalAccount, world } from "./helpers/readyworld.js";
import { LP_ON as RELAY_LP, addr, lpChain } from "./helpers/lpchain.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const CLOSED = { LEGACY_LAUNCH: "off", DEPLOYMENT_ENV: "test" };
const GONE = { ok: false, error: "legacy_launch_closed", message: LEGACY_LAUNCH_CLOSED };
const set = (env, extra) => { for (const k of ["LEGACY_LAUNCH", "DEPLOYMENT_ENV"]) delete env[k]; Object.assign(env, extra); };
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c63f8ffff3f0005fe02fea7d6a3f40000000049454e44ae426082", "hex").toString("base64");

before(async () => { _setArtRenderer(await nodeRenderer()); });
after(() => { _setArtRenderer(null); REVIEW._setScreener(null); realClock(); });
beforeEach(() => { _resetLpKit(); _resetLpAdmin(); _resetLpCoins(); _resetReview(); _resetRelay(); _resetPolicyCheck(); realClock(); });

/** The ready-made coin world with COIN_V2_REVIEW on and a second admin (the founder can't decide their own coin). */
async function reviewWorld() {
  const w = await world();
  w.env.COIN_V2_REVIEW = "on";
  w.env.NOTIFY = "on";
  w.admin = await person(w.env);
  await w.env.DB.prepare("INSERT INTO admin_roles (wallet, role, granted_by, granted_at) VALUES (?, 'admin', ?, ?)").bind(w.admin.w.address, w.owner.w.address, new Date(Date.now()).toISOString()).run();
  w.ready = () => w.get(w.f, `/api/coins/ready?city=${UTICA}`);
  w.rv = (path, body = {}) => w.post(w.f, `/api/coins/review/${path}`, { cityId: UTICA, ...body });
  w.decide = (body) => w.post(w.admin, "/api/admin/coins/reviews/decide", body);
  w.row = (sql, ...p) => w.env.DB.prepare(sql).bind(...p).first();
  w.notices = async () => (await w.env.DB.prepare("SELECT text FROM notices ORDER BY id").all()).results.map((n) => n.text);
  w.draft = async (over = {}) => { const d = await w.rv("draft", { reason: "Locals call the town by this name for years.", name: "Utica Falls", ...over }); assert.equal(d.ok, true, JSON.stringify(d)); return d.review.request; };
  w.request = async (over = {}) => { const d = await w.draft(over); const s = await w.rv("submit", { draftUpdatedAt: d.draft.updatedAt }); assert.equal(s.ok, true, JSON.stringify(s)); return s.review.request; };
  return w;
}

/* ---------------------------------------------------------------- CL-1, S23-OFF-2, SEC-S23-3: requests can still be closed */
test("closed: a founder still cancels their own pending request, and a reviewer still asks for changes; an approval answers 410 before any read", async () => {
  const w = await reviewWorld();
  await w.useCoin();
  const p = await w.request();
  set(w.env, CLOSED);
  // the reviewer: an approval is refused before the session, the database or the body is read for real (a copy of the body names it)
  const used = [];
  const DB = new Proxy(w.env.DB, { get(t, k) { const v = t[k]; return typeof v === "function" ? (...a) => { used.push(String(k)); return v.apply(t, a); } : v; } });
  const headers = new Headers({ origin: ORIGIN, "content-type": "application/json" });
  for (const [k, v] of w.admin.jar) headers.append("cookie", `${k}=${v}`);
  const res = await handleApi(new Request(`${ORIGIN}/api/admin/coins/reviews/decide`, { method: "POST", headers, body: JSON.stringify({ id: p.id, action: "approve", contentHash: p.contentHash }) }), { ...w.env, DB }, w.both);
  assert.deepEqual([res.status, await res.json(), used], [410, GONE, []]);
  assert.equal((await w.row("SELECT status FROM coin_requests WHERE id = ?", p.id)).status, "pending", "nothing decided");
  // asking for changes goes through: the request is closed with the reason the founder reads, and the founder is told
  const asked = await w.decide({ id: p.id, action: DECISION_OPEN, contentHash: p.contentHash, reasonCode: "name_misleading" });
  assert.deepEqual([asked.ok, asked.id, asked.status], [true, p.id, "changes_needed"], JSON.stringify(asked));
  assert.equal((await w.row("SELECT status FROM coin_requests WHERE id = ?", p.id)).status, "changes_needed");
  assert.ok((await w.notices()).some((n) => /needs changes/.test(n)));
  // the founder puts the decided request away (cancel dismisses a decided one): still open
  const away = await w.rv("cancel", { requestId: p.id });
  assert.equal(away.ok, true, JSON.stringify(away));
  assert.ok((await w.row("SELECT dismissed_at FROM coin_requests WHERE id = ?", p.id)).dismissed_at);
  // a second request submitted while open, then cancelled while closed: withdrawn, so nothing waits for ever
  set(w.env, {});
  const q = await w.request({ name: "Utica Springs" });
  set(w.env, CLOSED);
  const c = await w.rv("cancel", { requestId: q.id });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal((await w.row("SELECT status FROM coin_requests WHERE id = ?", q.id)).status, "cancelled");
  assert.equal((await w.get(w.admin, "/api/admin/coins/reviews")).reviews.filter((x) => x.status === "pending").length, 0, "the queue holds nothing pending any more");
  // every other founder route stays refused (only cancel is open)
  for (const r of ["draft", "submit", "edit", "reset", "description", "description/review", "description/default"]) assert.deepEqual([(await w.rv(r, {})).status], [410], r);
  assert.deepEqual([...REVIEW_OPEN], ["cancel"]);
  for (const b of [null, {}, { action: "approve" }, { action: "Changes_Needed" }, { action: ["changes_needed"] }]) assert.equal(decisionOpen(b), false, JSON.stringify(b));
  assert.equal(decisionOpen({ action: "changes_needed" }), true);
});

test("closed: the founder's review card is read-only history (a pending request with Cancel, a draft with Discard, words that promise no launch)", async () => {
  const w = await reviewWorld();
  await w.useCoin();
  const p = await w.request();
  const open = await w.ready();
  assert.match(open.review.request.message, /Launch is paused until they decide/);
  set(w.env, CLOSED);
  const shut = await w.ready();
  assert.equal(shut.review.closed, true);
  assert.deepEqual(shut.review.can, { request: false, describe: false, reset: false, cancel: true, edit: false });
  assert.deepEqual([shut.review.blocked, shut.review.hold], [LEGACY_LAUNCH_LINE, null]);
  assert.equal(shut.review.request.status, "pending");
  assert.equal(shut.review.request.message, `Version ${p.version} was sent for review. New city-coin launches on this launchpad are closed, so it can't be approved now. You can cancel it.`);
  assert.doesNotMatch(JSON.stringify(shut.review), /launch(es)? after|Launch is paused|Submitting pauses/);
  // a draft never sent: Discard is its only action
  assert.equal((await w.rv("cancel", { requestId: p.id })).ok, true);
  set(w.env, {});
  await w.draft({ name: "Utica Springs" });
  set(w.env, CLOSED);
  const d = await w.ready();
  assert.deepEqual([d.review.request.status, d.review.can.cancel], ["draft", true]);
  assert.match(d.review.request.message, /^Your draft is private and was never sent\. .*You can discard it\.$/);
  // with the switch unset the card is today's (no closed key)
  set(w.env, {});
  assert.equal("closed" in (await w.ready()).review, false);
});

test("closed: the founder takes their own picture down with exactly { removeLogo: true }; nothing else changes; any other studio write stays 410", async () => {
  const w = await world({ ready: null });
  const design = { name: "Utica Coin", pitch: "The Handshake City.", pair: "SOL", color: "emerald" };
  assert.equal((await w.post(w.f, "/api/coins/design", { ...design, image: PNG })).ok, true);
  const before = await w.env.DB.prepare("SELECT name, pitch, pair, color, media_id FROM city_coins WHERE city_id = ?").bind(UTICA).first();
  assert.ok(before.media_id, "a picture is on the design");
  set(w.env, CLOSED);
  for (const body of [{ ...design, removeLogo: true }, { removeLogo: true, image: PNG }, { ...design, image: PNG }, { removeLogo: 1 }]) {
    const r = await w.post(w.f, "/api/coins/design", body);
    assert.deepEqual([r.status, r.error], [410, "legacy_launch_closed"], JSON.stringify(body).slice(0, 80));
  }
  assert.equal(logoRemovalOnly({ removeLogo: true }), true);
  for (const b of [null, [], { removeLogo: true, x: 1 }, { removeLogo: "true" }, {}]) assert.equal(logoRemovalOnly(b), false, JSON.stringify(b));
  // signed out: the session is asked first (the removal is the founder's own)
  assert.equal((await w.post(browser(w.env), "/api/coins/design", { removeLogo: true })).status, 401);
  const r = await w.post(w.f, "/api/coins/design", { removeLogo: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  const after = await w.env.DB.prepare("SELECT name, pitch, pair, color, media_id, approved_media_id, logo_status FROM city_coins WHERE city_id = ?").bind(UTICA).first();
  assert.deepEqual([after.name, after.pitch, after.pair, after.color], [before.name, before.pitch, before.pair, before.color], "the design is otherwise untouched");
  assert.deepEqual([after.media_id, after.approved_media_id, after.logo_status], [null, null, null]);
  const log = await w.env.DB.prepare("SELECT note FROM mod_actions WHERE action = 'coin_design' ORDER BY id DESC LIMIT 1").first();
  assert.equal(log.note, "Utica: logo removed");
  // nothing left to remove: 404, nothing written
  assert.deepEqual([(await w.post(w.f, "/api/coins/design", { removeLogo: true })).status], [404]);
  // a design approved on chain is fixed there: the removal is refused as the studio refuses it (the takedown is the staff's remedy)
  set(w.env, {});
  assert.equal((await w.post(w.f, "/api/coins/design", { ...design, image: PNG })).ok, true);
  w.lp.S.accounts[await w.L.approval(BigInt(UTICA))] = approvalAccount({ cityId: BigInt(UTICA), founder: w.f.w.address, rentPayer: w.owner.w.address, name: "Utica Coin", symbol: "UTICA", expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400) });
  set(w.env, CLOSED);
  _resetLpKit(); _resetLpCoins();
  assert.deepEqual([(await w.post(w.f, "/api/coins/design", { removeLogo: true })).error], ["coin_approved"]);
});

/* ---------------------------------------------------------------- S23-OFF-5, SEC-S23-2: the job's notice */
test("closed: the job still marks an approved ticker live, but its notice promises no launch (the neutral line instead)", async () => {
  const run = async (closed) => {
    const w = await reviewWorld();
    await w.useCoin();
    const p = await w.request({ name: "Utica", symbol: "UTICANY" });
    assert.equal((await w.decide({ id: p.id, action: "approve", contentHash: p.contentHash })).ok, true);
    if (closed) set(w.env, CLOSED);
    const tickers = { 5128581: "NYC", 5140405: "SYRACUSE", 5106834: "ALBANY", 5142056: "UTICANY" };
    const assets = w.env.ASSETS;
    w.env.ASSETS = { fetch: async (r) => (new URL(r.url).pathname === "/data/tickers.json" ? new Response(JSON.stringify(tickers)) : assets.fetch(r)) };
    _resetTickers(); _resetCityCache();
    assert.deepEqual(await registryStep(w.env), { live: 1 });
    return (await w.notices()).filter((n) => /is in the Vicinity city list now/.test(n));
  };
  assert.deepEqual(await run(false), ["Your new ticker $UTICANY is in the Vicinity city list now. Your coin launches after the owner's approval on the blockchain."]);
  assert.deepEqual(await run(true), [`Your new ticker $UTICANY is in the Vicinity city list now. ${LEGACY_LAUNCH_LINE}`]);
});

/* ---------------------------------------------------------------- S23-OFF-6: candidates and /api/official */
test("closed: the owner's candidates say first that nothing is approvable (every candidate ok false); /api/official carries legacyLaunch only then", async () => {
  const w = await world();
  await w.useCoin();
  const open = await w.get(w.owner, "/api/admin/lp/candidates?cluster=devnet");
  assert.equal(open.global.includes(LEGACY_LAUNCH_LINE), false);
  set(w.env, CLOSED);
  _resetLpKit(); _resetLpAdmin();
  const shut = await w.get(w.owner, "/api/admin/lp/candidates?cluster=devnet");
  assert.equal(shut.global[0], LEGACY_LAUNCH_LINE);
  assert.ok(shut.candidates.length > 0 && shut.candidates.every((c) => c.ok === false && c.reasons[0] === LEGACY_LAUNCH_LINE));
  for (const env of [{}, { LEGACY_LAUNCH: "on" }, { LEGACY_LAUNCH: "" }]) assert.equal("legacyLaunch" in officialFor(env), false, JSON.stringify(env));
  for (const env of [CLOSED, { LEGACY_LAUNCH: "off" }, { LEGACY_LAUNCH: "of" }]) assert.equal(officialFor(env).legacyLaunch, "off", JSON.stringify(env));
  const { legacyLaunch: _drop, ...rest } = officialFor(CLOSED);
  assert.deepEqual(rest, officialFor({}), "nothing else in the answer changes");
});

/* ---------------------------------------------------------------- SEC-S23-4: the relay */
test("closed: the relay does not send a legacy approve_launch or launch it built before the switch closed; other transactions, and another program's 'launch', still go", async () => {
  const env = { ...newWorld(), ...RELAY_LP };
  const chain = lpChain();
  const b = browser(env);
  const PAYER = addr(1);
  const ix = (programAddress, d) => ({ programAddress, accounts: [{ address: PAYER, role: 3 }], data: Uint8Array.from([...d, 1, 2, 3, 4]) });
  const sign = (b64) => { const tx = fromBase64(b64); tx.fill(7, 1, 65); return toBase64(tx); };
  const send = async (built) => { const r = await b.send("/api/swap/send", { method: "POST", body: { tx: sign(built.tx), ticket: built.ticket, cluster: "devnet" }, fetchImpl: chain.fetchImpl }); return { status: r.status, data: await r.json() }; };
  const program = RELAY_LP.LAUNCHPAD_PROGRAM_ID;
  const builds = {};
  for (const [name, i] of [["approve", ix(program, ADMIN_IX.approve_launch)], ["launch", ix(program, LAUNCH_IX.launch)], ["revoke", ix(program, ADMIN_IX.revoke_approval)],
    ["pause", ix(program, ADMIN_IX.set_pause)], ["other program's launch", ix(addr(9), LAUNCH_IX.launch)], ["system", ix(PROGRAM_IDS.system, [2, 0, 0, 0])]]) {
    builds[name] = await buildTx(env, { payer: PAYER, instructions: [i] }, chain.fetchImpl);
    assert.equal(builds[name].ok, true, name);
  }
  // closed: the two legacy writers are refused with the 410 before any node is asked; the rest are sent as before
  Object.assign(env, CLOSED);
  for (const name of ["approve", "launch"]) assert.deepEqual([(await send(builds[name])).status, (await send(builds[name])).data], [410, GONE], name);
  assert.equal(chain.calls("sendTransaction").length, 0);
  for (const name of ["revoke", "pause", "other program's launch", "system"]) assert.equal((await send(builds[name])).status, 200, name);
  // unset: the very same transactions are sent (today's relay)
  set(env, {});
  for (const name of ["approve", "launch"]) assert.equal((await send(builds[name])).status, 200, name);
  // the helper alone: null with the path open, whatever the transaction
  const decoded = decodeHeader(fromBase64(sign(builds.approve.tx)));
  assert.equal(closedLaunchTx({ ...env }, decoded), null);
  assert.equal(closedLaunchTx({ ...env, ...CLOSED }, decoded).status, 410);
  assert.equal(closedLaunchTx({ ...CLOSED }, decoded), null, "without the launchpad's settings there is no legacy program to match");
});

/* ---------------------------------------------------------------- S23-NIT-1, SEC-S23-5, S23-COPY-1 */
test("the gate has no fail-open catch; the deleted round's two exports are gone; no 'approval round' words are left in the Worker or the pages", () => {
  const ll = read("src/legacylaunch.js");
  assert.doesNotMatch(ll, /catch\s*\{\s*closed\s*=\s*false/, "launchClosed never falls back to open");
  assert.match(read("src/v5policy.js"), /LEGACY_LAUNCH_CHECK_FAILED {4}LEGACY_LAUNCH=off and the v5 check itself threw/, "the refusal code is documented");
  assert.equal("fits" in LPADMIN, false, "fits was exported only for the deleted round");
  assert.equal("selectionProblem" in REVIEW, false, "selectionProblem was exported only for the deleted round");
  assert.equal("NEXT_ROUND" in REVIEW, false);
  for (const dir of ["src", "public"]) {
    for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((x) => /\.m?js$/.test(x))) {
      assert.doesNotMatch(read(`${dir}/${f}`), /approval round|owner's next round|renews it at|renewed at the owner/, `${dir}/${f}`);
    }
  }
});
