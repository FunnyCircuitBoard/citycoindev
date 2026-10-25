// Citycoin.dev master v5, stage S23: the LEGACY_LAUNCH switch and the deletion of COIN_V2_BATCH (src/legacylaunch.js, src/v5policy.js
// legacyLaunch, src/flags.js legacyLaunchValue). The gate (unset, blank and "on" are today's site; "off" counts with DEPLOYMENT_ENV; "off"
// without it, or a value outside the switch's set, is held closed; an unrelated error neither closes nor reopens it), the v5 configuration
// acceptance and the page build, the deleted COIN_V2_BATCH setting ignored, every legacy launch writer refused with 410 before any read (no
// database, chain or session read), what stays open answering exactly as with the switch unset, the history reads (the launch status of a
// launched coin, the admin's candidates, approvals on record and launched coins), the founder's status "closed", the ready-made coin's gate,
// and the /api/me and admin-probe keys. Fake chain, fake data; nothing remote.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { ORIGIN, browser, realClock } from "./helpers/world.js";
import { handleApi } from "../src/index.js";
import { _resetLpKit } from "../src/lpkit.js";
import { _resetLpAdmin } from "../src/lpadmin.js";
import { _resetLpCoins } from "../src/lpcoins.js";
import { _setArtRenderer } from "../src/coinready.js";
import { nodeRenderer } from "../scripts/coin-art/render.mjs";
import { UTICA, approvalAccount, launchOnChain, world } from "./helpers/readyworld.js";
import { seedCoin } from "./helpers/launchpad.js";
import { LEGACY_LAUNCH_CODES, _resetPolicyCheck, checkPolicyConfig, legacyLaunch, legacyLaunchClosed, legacyLaunchRefusals, policyConfig } from "../src/v5policy.js";
import { legacyLaunchValue } from "../src/flags.js";
import * as FLAGS from "../src/flags.js";
import { LEGACY_LAUNCH_CLOSED, LEGACY_LAUNCH_LINE, LP_RECORD_CLOSED, LP_SETUP_CLOSED, lpAdminWrite } from "../src/legacylaunch.js";
import { pageV5Config } from "../scripts/pages/build.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const wranglerVars = () => JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars;
const CLOSED = { LEGACY_LAUNCH: "off", DEPLOYMENT_ENV: "test" };
const GONE = { ok: false, error: "legacy_launch_closed", message: LEGACY_LAUNCH_CLOSED };
const set = (env, extra) => { for (const k of ["LEGACY_LAUNCH", "DEPLOYMENT_ENV"]) delete env[k]; Object.assign(env, extra); };

before(async () => { _setArtRenderer(await nodeRenderer()); });
after(() => { _setArtRenderer(null); realClock(); });
beforeEach(() => { _resetLpKit(); _resetLpAdmin(); _resetLpCoins(); _resetPolicyCheck(); realClock(); });

/* ---------------------------------------------------------------- the gate */
test("the gate: unset, blank and 'on' are today's site; 'off' counts with DEPLOYMENT_ENV; 'off' without one, or a value outside the set, is held closed", () => {
  for (const v of [undefined, null, "", "  ", "on", " ON ", "On"]) {
    assert.equal(legacyLaunch({ LEGACY_LAUNCH: v }), "on", JSON.stringify(v));
    assert.equal(legacyLaunchClosed({ LEGACY_LAUNCH: v }), false);
    assert.deepEqual(legacyLaunchRefusals({ LEGACY_LAUNCH: v }), []);
  }
  for (const environment of ["test", "preview", "production", " Production "]) {
    for (const v of ["off", " OFF ", "Off"]) {
      const env = { LEGACY_LAUNCH: v, DEPLOYMENT_ENV: environment };
      assert.deepEqual([legacyLaunch(env), legacyLaunchClosed(env), legacyLaunchRefusals(env)], ["off", true, []], `${v} ${environment}`);
    }
  }
  // "off" with its own input refused: held closed, never reopened
  for (const env of [{ LEGACY_LAUNCH: "off" }, { LEGACY_LAUNCH: "off", DEPLOYMENT_ENV: "" }, { LEGACY_LAUNCH: "off", DEPLOYMENT_ENV: "staging" }]) {
    assert.deepEqual([legacyLaunch(env), legacyLaunchClosed(env), legacyLaunchRefusals(env)], ["held", true, ["LEGACY_LAUNCH_POLICY_REFUSED"]], JSON.stringify(env));
  }
  // a value outside the switch's set: held closed, whatever the environment
  for (const v of ["of", "false", "0", "no", "closed", "true", "disabled", "offf"]) {
    for (const extra of [{}, { DEPLOYMENT_ENV: "production" }]) {
      const env = { LEGACY_LAUNCH: v, ...extra };
      assert.deepEqual([legacyLaunch(env), legacyLaunchRefusals(env)], ["held", ["LEGACY_LAUNCH_VALUE_REFUSED"]], v);
      assert.ok(policyConfig(env).errors.some((e) => e.code === "FLAG_VALUE_INVALID" && e.path === "deployment.flags.LEGACY_LAUNCH"), "the v5 check refuses it by name too");
    }
  }
  assert.deepEqual([...LEGACY_LAUNCH_CODES], ["CONFIG_CHECK_FAILED", "DEPLOYMENT_MISSING", "ENVIRONMENT_INVALID", "ENVIRONMENT_UNSET"]);
  assert.equal(legacyLaunchValue({ LEGACY_LAUNCH: " OFF " }), "off");
  assert.equal(legacyLaunch(undefined), "on");
  assert.equal(legacyLaunch(null), "on");
});

test("the gate: an unrelated input error never closes the path (unset) and never reopens it ('off' accepted)", () => {
  const unrelated = [
    { OFFICIAL_X_URL: "x.com/someone" }, { MAIN_TOKEN_MINT: "not-a-mint" }, { LEGACY_LINK_UNTIL: "soon" }, { SITE_ORIGIN: "http://evil.example" },
    { LAUNCH_V5: "on" }, { WALLET_ONLY: "on" }, { LEGACY_SEATS: "freeze" }, { HOST_REDIRECT: "on" },
  ];
  for (const bad of unrelated) {
    assert.equal(policyConfig({ ...bad, DEPLOYMENT_ENV: "production" }).ok, false, `the configuration itself is refused: ${JSON.stringify(bad)}`);
    assert.equal(legacyLaunch(bad), "on", `unset stays today's site: ${JSON.stringify(bad)}`);
    assert.equal(legacyLaunch({ ...bad, DEPLOYMENT_ENV: "production" }), "on");
    assert.deepEqual([legacyLaunch({ ...bad, ...CLOSED, DEPLOYMENT_ENV: "production" }), legacyLaunchRefusals({ ...bad, ...CLOSED, DEPLOYMENT_ENV: "production" })], ["off", []], `off stays off: ${JSON.stringify(bad)}`);
  }
  // LAUNCH_V5 with legacy launches on is the policy's own rule (LAUNCH_V5_WITH_LEGACY_LAUNCH): it refuses LAUNCH_V5, not the legacy path
  assert.ok(policyConfig({ LAUNCH_V5: "on", DEPLOYMENT_ENV: "test" }).errors.some((e) => e.code === "LAUNCH_V5_WITH_LEGACY_LAUNCH"));
  assert.equal(legacyLaunch({ LAUNCH_V5: "on", DEPLOYMENT_ENV: "test" }), "on");
  assert.equal(policyConfig({ LAUNCH_V5: "on", ...CLOSED }).errors.some((e) => e.code === "LAUNCH_V5_WITH_LEGACY_LAUNCH"), false);
});

test("the gate is logged once per isolate when held (code only, never a value); nothing is logged unset, 'on' or accepted 'off'", () => {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  for (const env of [{}, { LEGACY_LAUNCH: "on" }, CLOSED, { ...CLOSED, DEPLOYMENT_ENV: "production" }]) checkPolicyConfig(env, { log });
  assert.equal(lines.filter((l) => /legacy launch/.test(l)).length, 0, lines.join("\n"));
  _resetPolicyCheck(); lines.length = 0;
  checkPolicyConfig({ LEGACY_LAUNCH: "closed-for-good" }, { log });
  checkPolicyConfig({ LEGACY_LAUNCH: "closed-for-good" }, { log });
  assert.deepEqual(lines.filter((l) => /legacy launch/.test(l)), ["legacy launch switch refused LEGACY_LAUNCH_VALUE_REFUSED (held off)"]);
  assert.equal(lines.some((l) => l.includes("closed-for-good")), false, "never the value");
  _resetPolicyCheck(); lines.length = 0;
  checkPolicyConfig({ LEGACY_LAUNCH: "off" }, { log });
  assert.deepEqual(lines.filter((l) => /legacy launch/.test(l)), ["legacy launch switch refused LEGACY_LAUNCH_POLICY_REFUSED (held off)"]);
});

test("v5 configuration acceptance and the page build: 'off' needs DEPLOYMENT_ENV, a value outside the set is named; production's wrangler.jsonc sets neither LEGACY_LAUNCH nor COIN_V2_BATCH", () => {
  assert.deepEqual(policyConfig({ LEGACY_LAUNCH: "off" }).errors.map((e) => e.code), ["ENVIRONMENT_UNSET"]);
  assert.deepEqual(policyConfig(CLOSED).errors, []);
  assert.deepEqual(policyConfig({ LEGACY_LAUNCH: "on" }).errors, [], "the default value changes no switch");
  assert.throws(() => pageV5Config({ LEGACY_LAUNCH: "off" }), /ENVIRONMENT_UNSET/);
  assert.throws(() => pageV5Config({ LEGACY_LAUNCH: "of", DEPLOYMENT_ENV: "production" }), /FLAG_VALUE_INVALID/);
  assert.deepEqual(pageV5Config(CLOSED), { ok: true });
  const vars = wranglerVars();
  assert.equal("LEGACY_LAUNCH" in vars, false, "LEGACY_LAUNCH stays unset until stage S58");
  assert.equal("COIN_V2_BATCH" in vars, false, "the deleted switch's line is gone");
  assert.equal(legacyLaunch(vars), "on");
  assert.deepEqual(pageV5Config(vars), { ok: true });
});

/* ---------------------------------------------------------------- COIN_V2_BATCH, deleted */
test("COIN_V2_BATCH is deleted: no module reads it, and a value left in the Worker's settings changes no answer", async () => {
  assert.equal(existsSync(new URL("../src/lpbatch.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../docs/COIN-BATCH.md", import.meta.url)), false);
  assert.equal("coinV2BatchOn" in FLAGS, false);
  for (const dir of ["src", "src/sol", "public", "scripts/pages"]) {
    for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((x) => /\.(m?js|css|html)$/.test(x))) {
      assert.doesNotMatch(read(`${dir}/${f}`), /COIN_V2_BATCH|coinV2BatchOn|lpbatch|approvalRound|signAllTransactions|canSignAll/, `${dir}/${f}`);
    }
  }
  const w = await world();
  const probe = async () => w.get(w.owner, "/api/admin/lp");
  const ready = async () => w.get(w.f, `/api/coins/ready?city=${UTICA}`);
  const before = [await probe(), await ready(), await w.get(w.owner, "/api/admin/lp/candidates?cluster=devnet")];
  for (const value of ["on", "ON", "off", "anything"]) {
    w.env.COIN_V2_BATCH = value;
    assert.deepEqual([await probe(), await ready(), await w.get(w.owner, "/api/admin/lp/candidates?cluster=devnet")], before, value);
    for (const [path, method] of [["/api/admin/lp/batch?cluster=devnet", "GET"], ["/api/admin/lp/batch/tx", "POST"], ["/api/admin/lp/batch", "POST"]]) {
      const r = await w.owner.send(path, { method, body: method === "POST" ? { cluster: "devnet", rows: [] } : undefined, fetchImpl: w.both });
      assert.deepEqual([r.status, await r.json()], [404, { ok: false, error: "not_found" }], `${method} ${path}`);
    }
    const rec = await w.post(w.owner, "/api/admin/lp/record", { cluster: "devnet", step: "batch", signature: "1".repeat(64), params: { cities: [] } });
    assert.deepEqual([rec.status, rec.error], [400, "bad_step"]);
  }
  assert.equal("batch" in before[0], false);
  assert.equal("approvalRound" in before[1], false);
});

/* ---------------------------------------------------------------- closed: the writers */
/** A database and a fetch that count every use, to prove an answer came before any read. */
function spies(env, fetchImpl) {
  const used = [];
  const DB = new Proxy(env.DB, { get(t, k) { const v = t[k]; return typeof v === "function" ? (...a) => { used.push(`db.${String(k)}`); return v.apply(t, a); } : v; } });
  const fetchSpy = async (u, i) => { used.push(`fetch ${String(u)}`); return fetchImpl(u, i); };
  return { env: { ...env, DB }, fetchImpl: fetchSpy, used };
}
const WRITERS = [
  ["/api/lp/launch/tx", { cityId: UTICA, cluster: "devnet", mint: "11111111111111111111111111111112" }],
  ["/api/coins/design", { name: "Utica Coin", pitch: "", pair: "SOL", color: "gold" }],
  // a picture removal goes through only as exactly { removeLogo: true } (review finding SEC-S23-3): with any other field it is the studio
  ["/api/coins/design", { removeLogo: true, name: "Utica Coin" }],
  ["/api/coins/design", { removeLogo: "true" }],
  ["/api/coins/mint", { mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }],
  ["/api/coins/mint/decide", { city: UTICA, approve: true, mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }],
  ["/api/coins/ready/art", { cityId: UTICA }],
  ["/api/coins/ready/use", { cityId: UTICA, contentHash: "a".repeat(64) }],
  // (cancel stays open: it only withdraws the founder's own request; review findings CL-1, SEC-S23-3)
  ...["draft", "submit", "edit", "reset", "description", "description/review", "description/default"].map((r) => [`/api/coins/review/${r}`, { cityId: UTICA }]),
  // (asking for changes stays open; an approval, or anything that is not exactly action changes_needed, is refused: CL-1, S23-OFF-2)
  ["/api/admin/coins/reviews/decide", { id: 1, action: "approve", contentHash: "a".repeat(64) }],
  ["/api/admin/coins/reviews/decide", { id: 1, action: "Changes_Needed", contentHash: "a".repeat(64) }],
  ["/api/admin/coins/reviews/decide", { id: 1 }],
  ["/api/admin/lp/approve/tx", { cluster: "devnet", cityId: UTICA }],
  ...LP_SETUP_CLOSED.map((step) => ["/api/admin/lp/tx", { cluster: "devnet", step }]),
  ...LP_RECORD_CLOSED.map((step) => ["/api/admin/lp/record", { cluster: "devnet", step, signature: "1".repeat(64), params: { cityId: UTICA } }]),
  ["/api/admin/lp/pause/tx", { cluster: "devnet", launches: false }],
];

test("closed: every legacy launch writer answers 410 legacy_launch_closed before any read (no database, chain, session or second body read)", async () => {
  const w = await world();
  w.env.COIN_V2_REVIEW = "on";
  for (const mode of [CLOSED, { LEGACY_LAUNCH: "off" }, { LEGACY_LAUNCH: "Closed", DEPLOYMENT_ENV: "production" }]) {
    set(w.env, mode);
    for (const who of [w.f, w.owner, browser(w.env)]) {
      for (const [path, body] of WRITERS) {
        const s = spies(w.env, w.both);
        const headers = new Headers({ origin: ORIGIN, "content-type": "application/json" });
        if (who.jar.size) headers.set("cookie", [...who.jar].map(([k, v]) => `${k}=${v}`).join("; "));
        const res = await handleApi(new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) }), s.env, s.fetchImpl);
        const what = `${JSON.stringify(mode)} ${path} ${JSON.stringify(body)}`;
        assert.deepEqual([res.status, await res.json()], [410, GONE], what);
        assert.equal(res.headers.get("cache-control"), "no-store", what);
        assert.deepEqual(s.used, [], `${what}: nothing read before the answer`);
      }
    }
  }
  // nothing was written: no approval log, no request, no coin version
  for (const t of ["lp_approvals_log", "coin_requests", "coin_versions"]) {
    const row = await w.env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?").bind(t).first();
    if (row.n) assert.equal((await w.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n, 0, t);
  }
});

test("closed: a writer whose route is not switched on here keeps its own 404 first; an unknown path or another method keeps its answer", async () => {
  const w = await world({ ready: null });
  set(w.env, CLOSED);
  // COIN_V2_READY off: the ready routes are unknown paths; COIN_V2_REVIEW off: the review routes and the reviewer's decision too
  for (const path of ["/api/coins/ready/art", "/api/coins/ready/use", "/api/coins/review/draft"]) {
    const r = await w.f.send(path, { method: "POST", body: { cityId: UTICA }, fetchImpl: w.both });
    assert.deepEqual([r.status, await r.json()], [404, { error: "not_found" }], path);
  }
  assert.equal((await w.owner.send("/api/admin/coins/reviews/decide", { method: "POST", body: {}, fetchImpl: w.both })).status, 404);
  // the launchpad's settings missing: its routes are not there at all
  for (const k of ["LAUNCHPAD_CLUSTER", "LAUNCHPAD_PROGRAM_ID", "LAUNCHPAD_REWARDS_PROGRAM_ID", "LAUNCHPAD_RPC_URL", "LAUNCHPAD_DBC_CONFIGS"]) delete w.env[k];
  for (const [path, who] of [["/api/lp/launch/tx", w.f], ["/api/admin/lp/approve/tx", w.owner], ["/api/admin/lp/pause/tx", w.owner]]) {
    const r = await who.send(path, { method: "POST", body: { cluster: "devnet", launches: false }, fetchImpl: w.both });
    assert.deepEqual([r.status, (await r.json()).error], [404, "not_enabled"], path);
  }
  const v = await world();
  v.env.COIN_V2_REVIEW = "on";
  set(v.env, CLOSED);
  const unknown = await v.f.send("/api/coins/review/no-such-route", { method: "POST", body: {}, fetchImpl: v.both });
  assert.deepEqual([unknown.status, await unknown.json()], [404, { error: "not_found" }]);
  for (const path of ["/api/lp/launch/tx", "/api/coins/design", "/api/coins/mint", "/api/coins/ready/use", "/api/coins/review/draft"]) {
    assert.equal((await v.f.send(path, { fetchImpl: v.both })).status, 405, `GET ${path}`);
  }
});

test("closed: what stays open (reads, revoke, pause, the hand-over, collect, graduation, a rejection) answers exactly as with the switch unset", async () => {
  const w = await world();
  await w.useCoin(); // Utica's design row: the owner's card lists the city, and its approval below
  // an approval on record for Utica (the history the owner can still revoke) and a launched coin elsewhere are read the same way
  w.lp.S.accounts[await w.L.approval(BigInt(UTICA))] = approvalAccount({ cityId: BigInt(UTICA), founder: w.f.w.address, rentPayer: w.owner.w.address, name: "Utica", symbol: "UTICA", expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400) });
  const strip = (x) => JSON.parse(JSON.stringify(x, (k, v) => (["tx", "ticket", "lastValidBlockHeight", "blockhash"].includes(k) ? "<per build>" : v)));
  const run = async () => {
    const out = {};
    for (const p of ["/api/admin/lp/status?cluster=devnet", "/api/admin/lp/candidates?cluster=devnet", "/api/admin/lp/coins?cluster=devnet", "/api/admin/lp/summary?cluster=devnet", "/api/admin/lp/platform/plan?cluster=devnet"]) out[p] = await w.get(w.owner, p);
    for (const [p, body] of [["/api/admin/lp/revoke/tx", { cityId: UTICA }], ["/api/admin/lp/pause/tx", { launches: true }], ["/api/admin/lp/tx", { step: "handoff", params: {} }], ["/api/admin/lp/tx", { step: "referral" }],
      ["/api/admin/lp/tx", { step: "lookup" }], ["/api/admin/lp/tx", { step: "partner" }], ["/api/admin/lp/collect/tx", { cityId: UTICA }], ["/api/admin/lp/init-city/tx", { cityId: UTICA }],
      ["/api/admin/lp/forward/tx", { cityId: UTICA }], ["/api/admin/lp/record", { step: "revoke", signature: "1".repeat(64), params: { cityId: UTICA } }], ["/api/admin/lp/legacy/reject", { cityId: UTICA }]]) {
      out[`${p} ${JSON.stringify(body)}`] = strip(await w.post(w.owner, p, { cluster: "devnet", ...body }));
    }
    for (const [p, body] of [["/api/lp/graduate/tx", { mint: "11111111111111111111111111111112", step: "migrate" }], ["/api/lp/founder-claim/tx", { cityId: UTICA }], ["/api/lp/record", { cityId: UTICA }],
      ["/api/coins/mint/decide", { city: UTICA, approve: false, note: "no" }], ["/api/coins/takedown", { city: UTICA, what: "logo", reason: "spam", note: "spam" }]]) {
      out[`${p} ${JSON.stringify(body)}`] = strip(await w.post(w.f, p, { cluster: "devnet", ...body }));
    }
    for (const p of ["/api/lp/launch/status", "/api/lp/graduate/status?mint=11111111111111111111111111111112&cluster=devnet", `/api/coins?city=${UTICA}`, "/api/coins", `/api/coins/review/ticker-check?city=${UTICA}&t=UTICA`]) out[p] = await w.get(w.f, p);
    return out;
  };
  const unset = await run();
  set(w.env, CLOSED);
  _resetLpKit(); _resetLpAdmin(); _resetLpCoins();
  const closed = await run();
  // the candidates list says first that nothing is approvable while closed, and so no candidate is (review finding S23-OFF-6); the rest of
  // that answer (the approvals on record, the launched coins, the config, the Meteora check) is as with the switch unset
  const CAND = "/api/admin/lp/candidates?cluster=devnet";
  const { candidates: cc, global: cg, ...restClosed } = closed[CAND];
  const { candidates: uc, global: ug, ...restUnset } = unset[CAND];
  assert.deepEqual(cg, [LEGACY_LAUNCH_LINE, ...ug]);
  assert.deepEqual(restClosed, restUnset);
  assert.equal(cc.length, uc.length);
  for (const [i, c] of cc.entries()) {
    assert.deepEqual([c.ok, c.reasons[0]], [false, LEGACY_LAUNCH_LINE], c.cityId);
    const { ok: _a, reasons: _b, ...cRest } = c; const { ok: _c, reasons: _d, ...uRest } = uc[i];
    assert.deepEqual(cRest, uRest, c.cityId);
  }
  for (const k of Object.keys(unset).filter((x) => x !== CAND)) assert.deepEqual(closed[k], unset[k], k);
  assert.equal(closed["/api/admin/lp/revoke/tx {\"cityId\":\"5142056\"}"].ok, true, "the owner can still revoke an approval on record");
  assert.equal(closed["/api/admin/lp/pause/tx {\"launches\":true}"].ok, true, "and pause launches on chain (stage S58 starts with it)");
  assert.equal(closed[CAND].approvals.length, 1, "the approval on record is read as before");
});

/* ---------------------------------------------------------------- closed: what the pages read */
test("closed: the founder's launch status says 'closed' with the neutral line and keeps the approval on record; a launched coin's status is unchanged", async () => {
  const w = await world();
  w.lp.S.accounts[await w.L.approval(BigInt(UTICA))] = approvalAccount({ cityId: BigInt(UTICA), founder: w.f.w.address, rentPayer: w.owner.w.address, name: "Utica", symbol: "UTICA", expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400) });
  const status = () => w.get(w.f, `/api/lp/launch/status?city=${UTICA}&cluster=devnet&buy=100000000`);
  const open = await status();
  assert.equal(open.state, "ready", JSON.stringify(open));
  set(w.env, CLOSED);
  const shut = await status();
  assert.deepEqual([shut.state, shut.why, shut.message], ["closed", "legacy_launch_closed", LEGACY_LAUNCH_LINE]);
  assert.deepEqual(shut.approval, open.approval, "the approval on chain is shown as recorded");
  assert.deepEqual(shut.coin, open.coin);
  for (const k of ["cost", "firstBuy", "quote", "quoteError"]) assert.equal(k in shut, false, `${k}: nothing about building a launch`);
  const { state: _a, why: _b, message: _c, ...restShut } = shut;
  const { state: _d, cost: _e, firstBuy: _f, quote: _g, ...restOpen } = open;
  assert.deepEqual(restShut, restOpen, "every other field as before");
  // the coin launched: the closed switch changes nothing in its status (its fees, its page, its explorer link)
  await launchOnChain(w);
  set(w.env, {});
  _resetLpKit(); _resetLpCoins();
  const live = await w.get(w.f, `/api/lp/launch/status?city=${UTICA}&cluster=devnet`);
  assert.equal(live.state, "launched", JSON.stringify(live));
  set(w.env, CLOSED);
  _resetLpKit(); _resetLpCoins();
  assert.deepEqual(await w.get(w.f, `/api/lp/launch/status?city=${UTICA}&cluster=devnet`), live);
});

test("closed: /api/me and the admin's probe carry legacyLaunch 'off' (held too); unset, no key at all", async () => {
  const w = await world();
  const anon = browser(w.env);
  const keys = async () => [(await w.get(w.f, "/api/me")).legacyLaunch, (await anon.get("/api/me")).legacyLaunch, (await w.get(w.owner, "/api/admin/lp")).legacyLaunch];
  const unset = [await w.get(w.f, "/api/me"), await anon.get("/api/me"), await w.get(w.owner, "/api/admin/lp")];
  for (const x of unset) assert.equal("legacyLaunch" in x, false);
  for (const mode of [CLOSED, { LEGACY_LAUNCH: "off" }, { LEGACY_LAUNCH: "nope" }]) { set(w.env, mode); assert.deepEqual(await keys(), ["off", "off", "off"], JSON.stringify(mode)); }
  set(w.env, { LEGACY_LAUNCH: "on" });
  assert.deepEqual(await keys(), [undefined, undefined, undefined]);
});

test("closed: the ready-made coin says the closed line instead of 'Use this coin'; its review card is read-only history; a launched coin is still 'launched'", async () => {
  const w = await world();
  w.env.COIN_V2_REVIEW = "on";
  const open = await w.get(w.f, `/api/coins/ready?city=${UTICA}`);
  assert.equal(open.gate, null, JSON.stringify(open.gate));
  assert.ok(open.review, "the review card with the switch unset");
  set(w.env, CLOSED);
  const shut = await w.get(w.f, `/api/coins/ready?city=${UTICA}`);
  assert.deepEqual(shut.gate, { code: "legacy_launch_closed", message: LEGACY_LAUNCH_LINE });
  // the review card is history (review finding S23-OFF-4): nothing that builds toward the approval is offered, the closed line says why
  assert.equal(shut.review.closed, true);
  assert.deepEqual(shut.review.can, { request: false, describe: false, reset: false, cancel: false, edit: false });
  assert.deepEqual([shut.review.blocked, shut.review.hold], [LEGACY_LAUNCH_LINE, null]);
  assert.equal("closed" in open.review, false, "unset: no such key");
  assert.deepEqual(shut.coin, open.coin, "the coin itself is shown as before");
  // the admin's queue of requests on record stays readable
  const q = await w.get(w.owner, "/api/admin/coins/reviews");
  assert.equal(q.ok, true);
  // a city whose coin launched (recorded on this site) is said as launched, never as closed
  await seedCoin(w.env.DB, { city: UTICA, name: "Utica", mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" });
  const after = await w.get(w.f, `/api/coins/ready?city=${UTICA}`);
  assert.equal(after.gate && after.gate.code, "launched", JSON.stringify(after.gate));
});

test("lpAdminWrite names exactly the closed City coins writes", () => {
  assert.equal(lpAdminWrite("approve/tx", null), true);
  for (const step of ["start", "config", "allow"]) assert.equal(lpAdminWrite("tx", { step }), true, step);
  for (const step of ["handoff", "referral", "lookup", "partner", undefined, "x"]) assert.equal(lpAdminWrite("tx", { step }), false, String(step));
  for (const step of ["approve", "start", "config", "allow"]) assert.equal(lpAdminWrite("record", { step }), true, step);
  for (const step of ["revoke", "handoff", "referral", "lookup", "partner", "pause", "collect", "forward", "initCity", "platform", "batch"]) assert.equal(lpAdminWrite("record", { step }), false, step);
  assert.equal(lpAdminWrite("pause/tx", { launches: false }), true);
  for (const launches of [true, "false", 0, undefined]) assert.equal(lpAdminWrite("pause/tx", { launches }), false, String(launches));
  for (const sub of ["revoke/tx", "collect/tx", "init-city/tx", "forward/tx", "platform/tx", "legacy/reject", "status", ""]) assert.equal(lpAdminWrite(sub, {}), false, sub);
});
