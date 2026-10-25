// Free transfers (Citycoin.dev master v5, stage S39; acceptance check B02, "SOL/token send builders include no platform collection; receive
// adds no charge; network/rent are separate"; master section 29, "Zero launch/send/receive platform fees": "Builders contain no flat/percentage
// platform payment, hidden surcharge or transfer tax", and "Decode launch and transfer transactions to prove zero platform collection").
//   * The swap platform fee is pinned to 0 (src/cluster.js swapFeeRefusal). SWAP_PLATFORM_FEE_BPS unset, blank or "0" and SWAP_FEE_ACCOUNT unset
//     or blank are today's no fee, answer for answer; any other value makes the Jupiter path of /api/swap/quote and /api/swap/tx refuse with a
//     named reason before any chain read or Jupiter call (logged once per server and reason). A bad body, a legacy token and a city coin on its
//     curve answer as before (review finding SF-5), and every other route answers as before.
//   * A swap build decoded: the versioned message, its account keys (the lookup table's included) and every instruction. No platform fee in the
//     swap's data, no fee account anywhere, and outside the swap nothing is written but the taker's own accounts. The swap's route (its pools
//     and vaults, past the fixed places) is Jupiter's choice: the Worker does not check it pool by pool, and Jupiter's program bounds it on
//     chain by the minimum output (otherAmountThreshold). What the Worker does check there: the derived accounts in their places and no taker
//     account of a watched mint the route does not trade (review finding SEC-1). Jupiter answers that add a fee (in the swap's optional slot,
//     its data, a transfer beside it, a Token-2022 transfer with fee, or the shared-accounts layout's data) are refused before anything is
//     simulated.
//   * The Send summary's fee line names the product through src/brandwords.js (the words of the deployment's label set, src/brand.js
//     brandOf): "No Vicinity fee." with BRAND unset, byte for byte.
// Against the fake Jupiter and fake RPC of test/helpers/jupfake.js (the recorded answers of 9 Oct 2026 rewritten for the asking wallet).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleApi } from "../src/index.js";
import { _resetSwap } from "../src/swap.js";
import { _resetRelay } from "../src/relay.js";
import { _resetMarketLive } from "../src/marketlive.js";
import { jupiterConfig, swapFeeRefusal } from "../src/cluster.js";
import { checkJupiterBuild, decodeJupiterSwap, JUPITER_PROGRAM } from "../src/jupswap.js";
import { decodeHeader } from "../src/sol/message.js";
import { decodeLookupTable } from "../src/sol/dbc.js";
import { fromBase64, readU16, readU64, toBase64 } from "../src/sol/bytes.js";
import { ADDRESSES, PROGRAM_IDS, ata } from "../src/sol/pda.js";
import { LEGACY_BRAND, brandOf } from "../src/brand.js";
import { SAME, brandWords, wordsOf } from "../src/brandwords.js";
import { MASTER_POLICY } from "../src/masterpolicy.js";
import { NETWORK_FEE_LAMPORTS, accountOf, planSend } from "../src/walletsend.js";
import { newWorld, person, wallet, useClock, realClock } from "./helpers/world.js";
import { ALT_KEY, RECORDED_TAKER, REAL_VIC, SOL, USDC, fakeWorld, rewriteBuild, fakeOut } from "./helpers/jupfake.js";
import buildSol from "./fixtures/jupiter/build-sol-vicinity.json" with { type: "json" };
import buildUsdc from "./fixtures/jupiter/build-usdc-vicinity.json" with { type: "json" };

const TAKER = "CnQMR167gRRXcPYrDZkwbW6moYKmxd7gZNGSN6BNzz6p";
const FEE_WALLET = "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL"; // the fakes' stranger: where a slipped-in fee would go
const ORIGIN = "https://vicinity.test";
const quoteBody = (over = {}) => ({ inputMint: SOL, outputMint: REAL_VIC, amount: "0.25", slippageBps: 100, ...over });

/** The swap world of test/swap-api.test.js: SWAP on, the real Worker API entry, the fake Jupiter and RPC; each world is a fresh server. */
function world(extraEnv = {}, fakes = {}) {
  _resetSwap(); _resetRelay(); _resetMarketLive();
  const W = fakeWorld({ rpc: { mints: { [REAL_VIC]: { decimals: 6 } }, lamports: { [TAKER]: 2_000_000_000 }, holdings: { [REAL_VIC]: { [TAKER]: 1234.5 } } }, ...fakes });
  const env = { ...newWorld(), SWAP: "on", VICINITY_MINT: REAL_VIC, SOLANA_RPC_URL: "https://rpc.test", JUPITER_API_KEY: "secret-key-123", JUPITER_RPS: "10", ...extraEnv };
  const call = async (path, { body, ip = "1.2.3.4" } = {}) => {
    const headers = new Headers({ "cf-connecting-ip": ip, origin: ORIGIN });
    if (body !== undefined) headers.set("content-type", "application/json");
    const res = await handleApi(new Request(ORIGIN + path, { method: body !== undefined ? "POST" : "GET", headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, W.fetch);
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, text, cache: res.headers.get("Cache-Control") };
  };
  return { W, env, call };
}
/** Every row of every table (a refused call writes nothing, not even an attempt counter). */
async function rows(env) {
  const names = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results.map((r) => r.name);
  const out = {};
  for (const t of names) out[t] = JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results);
  return out;
}
/** console.error lines while `fn` runs. */
async function errorsDuring(fn) {
  const seen = [], was = console.error;
  console.error = (...a) => seen.push(a.map(String).join(" "));
  try { await fn(); } finally { console.error = was; }
  return seen;
}
/** `fn` with the same random numbers every time (the fake builds draw a blockhash; the counters a salt), restored after. */
async function seeded(fn) {
  const c = globalThis.crypto, was = c.getRandomValues;
  let x = 0x2545f491;
  Object.defineProperty(c, "getRandomValues", { configurable: true, writable: true, value: (arr) => { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < u.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; u[i] = x & 255; } return arr; } });
  try { return await fn(); } finally { Object.defineProperty(c, "getRandomValues", { configurable: true, writable: true, value: was }); }
}

/* ---------------------------------------------------------------- the setting */
test("S39: the swap fee settings: unset, blank and \"0\" are no fee; any other value, and any fee account, is a named refusal; the fee is always 0", () => {
  for (const env of [{}, { SWAP_PLATFORM_FEE_BPS: undefined }, { SWAP_PLATFORM_FEE_BPS: null }, { SWAP_PLATFORM_FEE_BPS: "" }, { SWAP_PLATFORM_FEE_BPS: "   " }, { SWAP_PLATFORM_FEE_BPS: "0" }, { SWAP_PLATFORM_FEE_BPS: " 0 " }, { SWAP_PLATFORM_FEE_BPS: 0 }, { SWAP_FEE_ACCOUNT: "" }, { SWAP_FEE_ACCOUNT: "  " }, { SWAP_PLATFORM_FEE_BPS: "0", SWAP_FEE_ACCOUNT: "" }]) {
    assert.equal(swapFeeRefusal(env), null, JSON.stringify(env));
  }
  for (const v of ["50", "1", "1000", "1001", "65535", 50]) assert.equal(swapFeeRefusal({ SWAP_PLATFORM_FEE_BPS: v }), "platform_fee_not_zero", String(v));
  for (const v of ["0.5", "-1", "00", "+5", "1e2", "abc", "50 bps", "0x10", "Infinity", "NaN", "0,5", true]) assert.equal(swapFeeRefusal({ SWAP_PLATFORM_FEE_BPS: v }), "platform_fee_malformed", String(v));
  for (const v of [FEE_WALLET, "not-an-address", "0"]) assert.equal(swapFeeRefusal({ SWAP_FEE_ACCOUNT: v }), "fee_account_set", v);
  assert.equal(swapFeeRefusal({ SWAP_PLATFORM_FEE_BPS: "50", SWAP_FEE_ACCOUNT: FEE_WALLET }), "platform_fee_not_zero", "the fee itself is named first");
  // jupiterConfig: no fee and no fee account, whatever is set; the refusal rides along
  for (const env of [{}, { SWAP_PLATFORM_FEE_BPS: "50", SWAP_FEE_ACCOUNT: FEE_WALLET }, { SWAP_PLATFORM_FEE_BPS: "abc" }]) {
    const jc = jupiterConfig(env);
    assert.equal(jc.platformFeeBps, 0);
    assert.equal("feeAccount" in jc, false);
    assert.equal(jc.feeRefusal, swapFeeRefusal(env));
  }
});

test("S39: with a fee setting, the Jupiter path of /api/swap/quote and /api/swap/tx refuses before any chain read or Jupiter call (only the attempt counters are written), logged once per server and reason; every other route answers as with no setting", async () => {
  useClock("2026-10-24T12:00:00Z"); // the balances answer says when it was read
  try { await refusedRoutes(); } finally { realClock(); }
});
async function refusedRoutes() {
  const plain = world();
  const OTHER = ["/api/swap/config", "/api/swap/tokens?q=usd", `/api/swap/balances?owner=${TAKER}`, "/api/swap/status?sig=" + "1".repeat(88), "/api/official", "/api/health", "/api/nope"];
  const baseline = {};
  for (const p of OTHER) baseline[p] = await plain.call(p);
  assert.equal(baseline["/api/swap/config"].data.platformFeeBps, 0);
  for (const [setting, reason] of [[{ SWAP_PLATFORM_FEE_BPS: "50" }, "platform_fee_not_zero"], [{ SWAP_PLATFORM_FEE_BPS: "0.5" }, "platform_fee_malformed"], [{ SWAP_FEE_ACCOUNT: FEE_WALLET }, "fee_account_set"], [{ SWAP_PLATFORM_FEE_BPS: "50", SWAP_FEE_ACCOUNT: FEE_WALLET }, "platform_fee_not_zero"]]) {
    const w = world(setting);
    const before = await rows(w.env);
    const logs = await errorsDuring(async () => {
      for (const body of [quoteBody(), quoteBody({ taker: TAKER }), quoteBody({ taker: TAKER, inputMint: USDC, amount: "5" })]) {
        const q = await w.call("/api/swap/quote", { body });
        assert.deepEqual([q.status, q.data, q.cache], [503, { ok: false, error: "swap_unavailable", reason }, "no-store"], JSON.stringify(setting));
        const t = await w.call("/api/swap/tx", { body: { ...body, taker: TAKER } });
        assert.deepEqual([t.status, t.data], [503, { ok: false, error: "swap_unavailable", reason }]);
      }
    });
    assert.deepEqual(logs, [`swap refused: platform fee setting ${reason}`], "one line for the server, never the value");
    assert.ok(!logs.join(" ").includes(FEE_WALLET) && !logs.join(" ").includes("0.5"));
    assert.deepEqual(w.W.jup.log, [], "Jupiter was never called");
    assert.deepEqual(w.W.rpc.log, [], "the chain was never read");
    // the attempt counters are written, as for any attempt (the input and the curve are read before the fee is asked, review finding SF-5);
    // nothing else is
    const after = await rows(w.env);
    // (the counters' own rows: auth_limits, the per-server salt in settings, and the schema bookkeeping any first request makes)
    for (const [t, v] of Object.entries(after)) if (!["auth_limits", "schema_migrations", "settings"].includes(t)) assert.equal(v, before[t] ?? "[]", `${t}: nothing but the attempt counters`);
    assert.deepEqual(JSON.parse(after.settings).map((r) => r.key), ["limit_salt"]);
    assert.ok(/swap_quote/.test(after.auth_limits) && /swap_tx/.test(after.auth_limits), "the attempts were counted");
    // the other routes, the swap config included, answer exactly as with no setting (the fee there is 0 either way)
    for (const p of OTHER) {
      const r = await w.call(p);
      assert.deepEqual([r.status, r.data], [baseline[p].status, baseline[p].data], `${p} with ${JSON.stringify(setting)}`);
    }
  }
  // a fresh server logs it again
  const again = world({ SWAP_FEE_ACCOUNT: FEE_WALLET });
  assert.deepEqual(await errorsDuring(() => again.call("/api/swap/quote", { body: quoteBody() })), ["swap refused: platform fee setting fee_account_set"]);
}

test("S39: unset, blank, \"0\" and \" 0 \": the same answers as no setting, request for request, and Jupiter is never asked for a fee", async () => {
  useClock("2026-10-24T12:00:00Z");
  try {
    const run = (setting) => seeded(async () => {
      const w = world(setting);
      const out = [];
      out.push(await w.call("/api/swap/config")); // (the token search keeps its own five-minute cache across these worlds: test/swap-api.test.js covers it)
      for (const body of [quoteBody(), quoteBody({ taker: TAKER }), quoteBody({ taker: TAKER, inputMint: USDC, outputMint: REAL_VIC, amount: "5" }), quoteBody({ taker: TAKER, inputMint: REAL_VIC, outputMint: SOL, amount: "100" })]) {
        out.push(await w.call("/api/swap/quote", { body }));
        out.push(await w.call("/api/swap/tx", { body: { ...body, taker: TAKER } }));
      }
      return { out: out.map((r) => [r.status, r.text]), jup: w.W.jup.log.map((l) => `${l.host}${l.path}?${new URLSearchParams(l.q)}`) };
    });
    const none = await run({});
    assert.ok(none.out.filter(([s]) => s === 200).length >= 8, JSON.stringify(none.out.map(([s]) => s)));
    for (const [, text] of none.out) assert.doesNotMatch(text, /"platformFeeBps":[1-9]/);
    for (const url of none.jup) assert.doesNotMatch(url, /platformFeeBps|feeAccount/, url);
    assert.ok(none.jup.some((u) => u.includes("/swap/v2/build?")), "builds were asked for");
    for (const setting of [{ SWAP_PLATFORM_FEE_BPS: "" }, { SWAP_PLATFORM_FEE_BPS: "0" }, { SWAP_PLATFORM_FEE_BPS: " 0 " }, { SWAP_FEE_ACCOUNT: "" }, { SWAP_PLATFORM_FEE_BPS: "0", SWAP_FEE_ACCOUNT: " " }]) {
      assert.deepEqual(await run(setting), none, JSON.stringify(setting));
    }
  } finally { realClock(); }
});

/* ---------------------------------------------------------------- the decode */
const COMPUTE = PROGRAM_IDS.computeBudget, SYSTEM = PROGRAM_IDS.system, TOKEN = PROGRAM_IDS.token, ATA_PROGRAM = PROGRAM_IDS.ata;
/** The message's account keys in the runtime's order (static, then every table's writable, then every table's read-only), with writability. */
function accountKeys(h, tables) {
  const keys = h.staticKeys.map((k, i) => {
    const signer = i < h.header.numRequiredSignatures;
    const writable = signer ? i < h.header.numRequiredSignatures - h.header.numReadonlySignedAccounts : i < h.staticKeys.length - h.header.numReadonlyUnsignedAccounts;
    return { key: k, writable, signer };
  });
  for (const l of h.lookups) for (const i of l.writableIndexes) keys.push({ key: tables[l.key][i], writable: true, signer: false });
  for (const l of h.lookups) for (const i of l.readonlyIndexes) keys.push({ key: tables[l.key][i], writable: false, signer: false });
  return keys;
}
/** One swap through /api/swap/tx, decoded. */
async function decodedSwap(w, body) {
  const r = await w.call("/api/swap/tx", { body: { ...body, taker: TAKER } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const h = decodeHeader(fromBase64(r.data.tx));
  const tables = {};
  for (const l of h.lookups) { const t = decodeLookupTable(w.W.rpc.accounts[l.key]); assert.ok(t, l.key); tables[l.key] = t.addresses; }
  const keys = accountKeys(h, tables);
  const ixs = h.instructions.map((i) => ({ program: keys[i.programIdIndex].key, accounts: i.accountKeyIndexes.map((k) => keys[k]), data: i.data }));
  return { r, h, keys, ixs };
}

test("S39: a swap build decoded (versioned message, account keys with the lookup table's, every instruction): no platform fee, no fee account, nothing paid to anyone but the taker's own accounts and the route Jupiter lists in the swap", async () => {
  const w = world();
  const cases = [
    { name: "SOL -> $VICINITY (no lookup table)", body: quoteBody(), tpl: buildSol },
    { name: "USDC -> $VICINITY (a lookup table)", body: quoteBody({ inputMint: USDC, amount: "5" }), tpl: buildUsdc, alt: true },
    { name: "$VICINITY -> SOL (unwrap at the end)", body: quoteBody({ inputMint: REAL_VIC, outputMint: SOL, amount: "100" }), tpl: buildSol },
    { name: "$VICINITY -> USDC", body: quoteBody({ inputMint: REAL_VIC, outputMint: USDC, amount: "100" }), tpl: buildSol },
  ];
  for (const c of cases) {
    const ww = c.alt ? world({}, { jupiter: { alt: true } }) : w;
    const { r, h, keys, ixs } = await decodedSwap(ww, c.body);
    const { inputMint, outputMint } = c.body;
    const inAta = await ata(TAKER, inputMint), outAta = await ata(TAKER, outputMint), wsolAta = await ata(TAKER, SOL);
    const own = new Set([TAKER, inAta, outAta, wsolAta]);
    // the envelope: version 0, one signature slot (the taker's, empty), the taker pays; a lookup table only where the route claims one
    assert.deepEqual([h.version, h.numSignatures, h.signaturesFilled, keys[0].key, keys[0].signer], [0, 1, [false], TAKER, true], c.name);
    assert.deepEqual(h.lookups.map((l) => l.key), c.alt ? [ALT_KEY] : [], c.name);
    assert.equal(keys.filter((k) => k.signer).length, 1, "nobody but the taker signs");
    // no fee account anywhere in the message, and the answer says no platform fee
    assert.ok(!keys.some((k) => k.key === FEE_WALLET), c.name);
    assert.deepEqual([r.data.fees.platformFeeBps, r.data.quote.fees.platformFeeBps], [0, 0]);
    // every instruction, by program
    const programs = ixs.map((i) => i.program);
    assert.ok(programs.every((p) => [COMPUTE, ATA_PROGRAM, SYSTEM, TOKEN, JUPITER_PROGRAM].includes(p)), `${c.name}: ${programs}`);
    assert.deepEqual(programs.slice(0, 2), [COMPUTE, COMPUTE], "our compute budget first");
    assert.equal(programs.filter((p) => p === JUPITER_PROGRAM).length, 1, "one swap");
    for (const ix of ixs) {
      const a = (k) => ix.accounts[k] && ix.accounts[k].key, d = ix.data;
      const writable = ix.accounts.filter((x) => x.writable).map((x) => x.key);
      if (ix.program === COMPUTE) {
        assert.equal(ix.accounts.length, 0);
        assert.ok((d[0] === 2 && d.length === 5) || (d[0] === 3 && d.length === 9), "a compute-unit limit or price, nothing else");
      } else if (ix.program === ATA_PROGRAM) {
        // create-idempotent of the taker's own account, the taker paying
        assert.deepEqual([...d], [1]);
        assert.deepEqual([a(0), a(2), a(4)], [TAKER, TAKER, SYSTEM]);
        assert.equal(a(1), await ata(TAKER, a(3)), "the taker's own associated account");
        assert.ok([inputMint, outputMint, SOL].includes(a(3)));
      } else if (ix.program === SYSTEM) {
        // the only lamports that move: the SOL being paid, from the taker into the taker's own WSOL account
        assert.equal(inputMint, SOL, `${c.name}: a System instruction only when paying with SOL`);
        assert.deepEqual([d[0], d[1], d[2], d[3], d.length], [2, 0, 0, 0, 12], "a transfer");
        assert.deepEqual([a(0), a(1)], [TAKER, wsolAta]);
        assert.ok(readU64(d, 4) <= BigInt(r.data.quote.inAmount));
      } else if (ix.program === TOKEN) {
        // sync-native or close of the taker's WSOL account back to the taker: never a transfer (3) or a checked transfer (12) to anyone
        assert.ok(d.length === 1 && (d[0] === 17 || d[0] === 9), `${c.name}: token opcode ${d[0]}`);
        if (d[0] === 17) assert.deepEqual(ix.accounts.map((x) => x.key), [wsolAta]);
        else assert.deepEqual(ix.accounts.map((x) => x.key), [wsolAta, TAKER, TAKER]);
      } else {
        // the swap: route_v2 with the taker's own accounts in the fixed places, no fee in its data, no fee account in its optional slot
        const sw = decodeJupiterSwap({ accounts: ix.accounts.map((x) => ({ pubkey: x.key })), data: toBase64(d) });
        assert.equal(sw.kind, "route_v2");
        assert.deepEqual([sw.authority, sw.source, sw.destinations, sw.optional, sw.sourceMint, sw.destinationMint], [TAKER, inputMint === SOL ? wsolAta : inAta, [outAta], null, inputMint, outputMint], c.name);
        assert.equal(a(7), JUPITER_PROGRAM, "the optional (fee) account is the program id: none");
        assert.deepEqual([readU16(d, 26), readU16(d, 28), sw.platformFeeBps, sw.positiveSlippageBps], [0, 0, 0, 0], "platform fee 0, no positive-slippage cut");
        assert.equal(sw.inAmount, BigInt(r.data.quote.inAmount));
        // past the fixed places: the route, exactly as the recorded route lists it (its pools, vaults and programs), with the recorded
        // wallet's own accounts in the asking taker's; the route is the only place other writable accounts may appear
        const recWsol = c.tpl.swapInstruction.accounts[1].pubkey, recOut = c.tpl.swapInstruction.accounts[2].pubkey;
        const sub = (k) => (k === RECORDED_TAKER ? TAKER : k === recWsol ? (inputMint === SOL ? wsolAta : inAta) : k === recOut ? outAta : k);
        assert.deepEqual(ix.accounts.slice(8).map((x) => x.key), c.tpl.swapInstruction.accounts.slice(8).map((x) => sub(x.pubkey)), c.name);
        continue;
      }
      for (const k of writable) assert.ok(own.has(k), `${c.name}: ${ix.program} writes ${k}, not the taker's own`);
    }
    // the message's writable accounts: the taker's own, or accounts the swap's route lists; nothing else is written
    const swapIx = ixs.find((i) => i.program === JUPITER_PROGRAM);
    const route = new Set(swapIx.accounts.map((x) => x.key));
    for (const k of keys.filter((x) => x.writable)) assert.ok(own.has(k.key) || route.has(k.key), `${c.name}: ${k.key} is writable`);
  }
  // Jupiter was never asked for a fee
  for (const l of w.W.jup.log) assert.deepEqual([l.q.platformFeeBps, l.q.feeAccount], [undefined, undefined], l.path);
});

test("S39: a Jupiter answer that adds a platform fee is refused before anything is compiled or simulated: the fee in the swap's data and its optional slot, the fee account alone, the fee alone, a token, Token-2022 or SOL transfer to a fee wallet, a fee in the shared-accounts layout", async () => {
  const tampered = {
    "Jupiter answers a fee nobody asked for, to a fee account": { platformFeeBps: 50, feeAccount: FEE_WALLET },
    fee_bps_and_account: { hostile: "fee_bps_and_account" },
    fee_account: { hostile: "fee_account" },
    platform_fee: { hostile: "platform_fee" },
    fee_token_transfer: { hostile: "fee_token_transfer" },
    fee_token_transfer_checked: { hostile: "fee_token_transfer_checked" },
    fee_sol_transfer: { hostile: "fee_sol_transfer" },
    fee_token2022_transfer: { hostile: "fee_token2022_transfer" }, // review finding SEC-8
    shared_fee: { hostile: "shared_fee" },
  };
  for (const [name, jupiter] of Object.entries(tampered)) {
    for (const body of [quoteBody(), quoteBody({ inputMint: REAL_VIC, outputMint: SOL, amount: "100" })]) {
      const w = world({}, { jupiter });
      const logs = await errorsDuring(async () => {
        const q = await w.call("/api/swap/quote", { body: { ...body, taker: TAKER } });
        assert.deepEqual([q.status, q.data], [502, { ok: false, error: "jupiter_refused" }], `${name} quote`);
        const t = await w.call("/api/swap/tx", { body: { ...body, taker: TAKER } });
        assert.deepEqual([t.status, t.data], [502, { ok: false, error: "jupiter_refused" }], `${name} tx`);
        assert.ok(!t.text.includes(FEE_WALLET), "the fee wallet never leaves");
      });
      assert.ok(logs.length > 0 && logs.every((l) => l.startsWith("jupiter build refused")), JSON.stringify(logs));
      assert.ok(!w.W.rpc.log.some((l) => l.methods.includes("simulateTransaction")), `${name}: nothing was simulated`);
      for (const l of w.W.jup.log) assert.equal(l.q.feeAccount, undefined, "and none was asked for");
    }
  }
  // the validator's own reason for each, on the same rewritten answers
  const p = { taker: TAKER, inputMint: SOL, outputMint: REAL_VIC, amountRaw: "250000000", slippageBps: 100, outRaw: fakeOut(SOL, REAL_VIC, 250_000_000n, { [SOL]: 9, [REAL_VIC]: 6 }) };
  const reason = async (over) => { try { await checkJupiterBuild(await rewriteBuild({ ...p, ...over }), { taker: TAKER, inputMint: SOL, outputMint: REAL_VIC, inAmount: 250_000_000n }); return "accepted"; } catch (e) { return e.code; } };
  assert.equal(await reason({}), "accepted", "the clean answer passes");
  assert.equal(await reason({ platformFeeBps: 50, feeAccount: FEE_WALLET }), "destination_account");
  assert.equal(await reason({ hostile: "fee_bps_and_account" }), "destination_account");
  assert.equal(await reason({ hostile: "fee_account" }), "destination_account");
  assert.equal(await reason({ hostile: "platform_fee" }), "platform_fee");
  assert.equal(await reason({ hostile: "fee_token_transfer" }), "token_opcode");
  assert.equal(await reason({ hostile: "fee_token_transfer_checked" }), "token_opcode");
  assert.equal(await reason({ hostile: "fee_sol_transfer" }), "sol_transfer_destination");
  // review findings SEC-8 and SEC-1: a Token-2022 transfer with fee, the shared-accounts layout (clean, with a fee, with a stranger in its
  // program authority or destination), the event authority swapped, the taker's USDT account in a route that never trades USDT
  assert.equal(await reason({ hostile: "fee_token2022_transfer" }), "helper_program");
  assert.equal(await reason({ hostile: "shared" }), "accepted");
  assert.equal(await reason({ hostile: "shared_fee" }), "platform_fee");
  assert.equal(await reason({ hostile: "shared_program_authority" }), "program_authority");
  assert.equal(await reason({ hostile: "shared_program_destination" }), "program_destination");
  assert.equal(await reason({ hostile: "event_authority" }), "event_authority");
  assert.equal(await reason({ hostile: "route_taker_account" }), "route_taker_account");
  // and a caller that still passes the old fee options is refused, even with a clean answer
  const clean = await rewriteBuild(p);
  for (const opt of [{ platformFeeBps: 50 }, { feeAccount: FEE_WALLET }, { platformFeeBps: 50, feeAccount: FEE_WALLET }, { platformFeeBps: "0" }]) {
    await assert.rejects(checkJupiterBuild(clean, { taker: TAKER, inputMint: SOL, outputMint: REAL_VIC, inAmount: 250_000_000n, ...opt }), (e) => e.code === "platform_fee_option", JSON.stringify(opt));
  }
  await checkJupiterBuild(clean, { taker: TAKER, inputMint: SOL, outputMint: REAL_VIC, inAmount: 250_000_000n, platformFeeBps: 0, feeAccount: null });
});

/* ---------------------------------------------------------------- the Send line */
const sys = (lamports) => ({ owner: SYSTEM, lamports, data: ["", "base64"] });
test("S39: the Send fee line names the product through src/brandwords.js: \"No Vicinity fee.\" with BRAND unset, byte for byte; a Citycoin.dev label set says \"No Citycoin.dev fee.\"; the instructions never change", async () => {
  const sender = (await wallet()).address, to = (await wallet()).address;
  const args = { sender, to, asset: { id: "SOL", label: "SOL", decimals: 9 }, amount: "0.5", chain: { sender: accountOf(sys(2_000_000_000)), to: accountOf(sys(1_000_000_000)) }, cuPrice: 100_000n };
  const today = await planSend(args);
  assert.equal(today.summary.lines[1], "No Vicinity fee. Network fee about 0.000006 SOL.");
  assert.deepEqual(await planSend({ ...args, bw: SAME }), today);
  assert.deepEqual(await planSend({ ...args, bw: brandWords({}) }), today);
  assert.deepEqual(await planSend({ ...args, bw: wordsOf(LEGACY_BRAND) }), today);
  // the Citycoin.dev name (master policy pairs_and_branding.product_name) in a label set of src/brand.js's shape
  const citycoin = { ...LEGACY_BRAND, key: "citycoin", productName: MASTER_POLICY.policy.pairs_and_branding.product_name };
  const cc = await planSend({ ...args, bw: wordsOf(citycoin) });
  assert.equal(cc.summary.lines[1], "No Citycoin.dev fee. Network fee about 0.000006 SOL.");
  assert.deepEqual({ ...cc, summary: { ...cc.summary, lines: null } }, { ...today, summary: { ...today.summary, lines: null } }, "the words only: the same instructions, fee and amounts");
  assert.equal(today.fee, NETWORK_FEE_LAMPORTS + 1000n, "the network's fee and the priority fee, nothing for the platform");
  // through the route: the line is the deployment's label set's (BRAND unset: today's, byte for byte; BRAND=citycoin with today's pages
  // stays today's, src/brand.js BRAND_PAGES_MISMATCH: the Citycoin.dev words come only with pages built for them; a BRAND that names no
  // label set stays today's, BRAND_UNKNOWN)
  for (const BRAND of [undefined, "", "citycoin", "nope"]) {
    _resetRelay();
    const W = fakeWorld({ rpc: {} });
    const env = newWorld({ WALLET_SEND: "on", VICINITY_MINT: REAL_VIC, SOLANA_RPC_URL: "https://rpc.test", ...(BRAND === undefined ? {} : { BRAND }) });
    const me = await person(env);
    W.rpc.accounts[me.w.address] = sys(2_000_000_000);
    W.rpc.accounts[to] = sys(1_000_000_000);
    const r = await me.send("/api/wallet/send/build", { method: "POST", body: { to, asset: "SOL", amount: "0.5" }, fetchImpl: W.fetch, ip: "10.9.9.9" });
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal(d.summary.lines[1], `No ${brandOf(env).productName} fee. Network fee about 0.000006 SOL.`, String(BRAND));
    if (!BRAND) assert.equal(d.summary.lines[1], "No Vicinity fee. Network fee about 0.000006 SOL.");
  }
  // and the route hands planSend the words of the deployment's label set (src/brandwords.js brandWords: src/brand.js brandOf, so a BRAND
  // the deployed pages were not built with keeps today's words, as the loop above shows); pinned by its source, as
  // test/brand-adapters.test.js pins the mail sender's
  assert.match(readFileSync(new URL("../src/walletsend.js", import.meta.url), "utf8"), /const plan = await planSend\(\{[^\n]*, bw: brandWords\(env\) \}\);/);
});
