// The review of stages S22 and S39 (Citycoin.dev master v5; docs/citycoin-master/implementation-report.md sections 10 and 11): one or more
// tests per finding, each first run on the reviewed commit 08649d3, where it failed. The inputs carry the old and the new names of a
// field side by side (artSha256 and image, quote) so the same test reads both versions of src/coinmeta-v2.js. More cases sit in
// test/coinmeta-v2.test.js, test/free-transfer.test.js, test/lptrade.test.js and test/main-token-gate.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as V2 from "../src/coinmeta-v2.js";
import { handleApi } from "../src/index.js";
import { _resetSwap } from "../src/swap.js";
import { _resetRelay } from "../src/relay.js";
import { _resetMarketLive } from "../src/marketlive.js";
import { checkJupiterBuild } from "../src/jupswap.js";
import { PROGRAM_IDS, ata, findProgramAddress } from "../src/sol/pda.js";
import { concat, fromBase64, toBase64, u16le } from "../src/sol/bytes.js";
import { newWorld } from "./helpers/world.js";
import { REAL_VIC, SOL, USDC, fakeOut, fakeWorld, rewriteBuild } from "./helpers/jupfake.js";

const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const MINT = "CagvLF3JgZNBTUf6LrTg9ryFh7FsZbVoBaHVmoCnhBba"; // fake
const LIST = "bc555d4a6d3ca7daf0d2641557ed70a536df42c704aebc000ba6f573595d7413"; // public/data/cities.json at edabab5
const UTICA = { city: { id: "5142056", name: "Utica" }, region: { id: "US.NY", name: "New York" }, country: { id: "US", name: "United States" }, name: "Utica", symbol: "UTICA", listSha256: LIST, image: { sha256: "a".repeat(64), source: "template" }, artSha256: "a".repeat(64), mint: MINT };
const codeOf = (fn) => { try { fn(); return "accepted"; } catch (e) { return e.code || String(e); } };
const say = (text, quote = "USDC") => codeOf(() => V2.renderDescription("Utica", "New York", "United States", quote, { symbol: "UTICA", text }));

/* ---------------------------------------------------------------- S22 */
test("SF-1 (high): the content hash is pair-independent: one city version has one content hash for SOL and USDC, and only the per-quote metadata hash differs", async () => {
  const sol = await V2.buildCoinMetadataV2({ ...UTICA, quote: "SOL" }), usdc = await V2.buildCoinMetadataV2({ ...UTICA, quote: "USDC" });
  assert.equal(sol.contentJson, usdc.contentJson, "one canonical_json for the version");
  assert.equal(sol.contentHash, usdc.contentHash, "one content_hash: UNIQUE (city_id, content_hash) holds one row per version");
  assert.notEqual(sol.metaHash, usdc.metaHash, "the meta hash binds the pair");
  for (const key of ["quote", "description"]) assert.equal(key in JSON.parse(sol.contentJson), false, `no ${key} in the content`);
  assert.equal(typeof JSON.parse(sol.contentJson).text, "string", "descriptive_text is NOT NULL: the default lead is stored");
});

test("SF-2: content v2 says where the picture came from, so an owner-approved upload is not called template t2", () => {
  const upload = V2.contentV2({ ...UTICA, image: { sha256: "b".repeat(64), source: "upload" }, artSha256: "b".repeat(64), quote: "SOL" });
  assert.deepEqual({ ...upload.image }, { sha256: "b".repeat(64), source: "upload" });
  const art = V2.contentV2({ ...UTICA, quote: "SOL" });
  assert.deepEqual({ ...art.image }, { sha256: "a".repeat(64), source: "template", template: "t2" });
  assert.notEqual(V2.contentJson(upload), V2.contentJson(art));
});

test("SF-3: cc-norm-1 is pinned to Unicode 15.1: a code point newer than 15.1 (whose NFC order a newer runtime changes) is refused, so the bytes never depend on the runtime", () => {
  assert.equal(codeOf(() => V2.normalizeText("Old town x́\u{1612F} river")), "unassigned_character");
  for (const c of [0x113ce, 0x113cf, 0x113d0, 0x1612f, 0x1e5ef]) assert.equal(codeOf(() => V2.normalizeText(`á${String.fromCodePoint(c)}`)), "unassigned_character", c.toString(16));
  assert.equal(V2.normalizeText("Herāt"), "Herāt", "Unicode 15.1 text passes");
});

test("SF-4: the three registry places whose list entry lacks a region that applies (Chongming, Chagni, Nouakchott) are refused with a null region; city-states still render 'No state or region'", () => {
  for (const [id, name, cc, country] of [["13608003", "Chongming", "CN", "China"], ["11048860", "Chagni", "ET", "Ethiopia"], ["2377450", "Nouakchott", "MR", "Mauritania"]]) {
    assert.equal(codeOf(() => V2.contentV2({ ...UTICA, city: { id, name }, region: null, country: { id: cc, name: country }, name, symbol: name.toUpperCase().slice(0, 10), quote: "SOL" })), "region_unreviewed", name);
  }
  assert.equal(codeOf(() => V2.contentV2({ ...UTICA, city: { id: "2411585", name: "Gibraltar" }, region: null, country: { id: "GI", name: "Gibraltar" }, name: "Gibraltar", symbol: "GIBRALTAR", quote: "SOL" })), "accepted");
});

test("SF-6: the golden vectors give one city one mint (the program derives one mint per city)", () => {
  const g = json("test/fixtures/coinmeta-v2-golden.json");
  const utica = g.vectors.filter((v) => v.input.city.id === "5142056");
  assert.ok(utica.length >= 1);
  assert.equal(new Set(utica.map((v) => v.input.mint)).size, 1);
});

test("SEC-3: the metadata JSON is made only from a content contentV2 made; a hand-built object is refused, and the content hash is computed, not taken", async () => {
  const forged = { v: 2, norm: "cc-norm-1", name: "‮evil\u0000", symbol: "lower case!", description: "Pair: $X / SOL <script>", text: "x", list: { attribution: "x", sha256: "c".repeat(64) },
    city: { id: "x", name: "​" }, region: null, country: { id: "zz", name: "" }, attribution: "x", image: { sha256: "a".repeat(64), source: "template", template: "t2" }, quote: { mint: USDC, symbol: "SOL" } };
  await assert.rejects(async () => V2.metadataJsonV2(forged, { mint: MINT, quote: "SOL", contentHash: "b".repeat(64) }), (e) => e.code === "not_content_v2");
  // a deep copy of a real content is not one either
  const real = V2.contentV2({ ...UTICA, quote: "SOL" });
  await assert.rejects(async () => V2.metadataJsonV2(JSON.parse(JSON.stringify(real)), { mint: MINT, quote: "SOL", contentHash: "b".repeat(64) }), (e) => e.code === "not_content_v2");
});

test("SEC-4: the approved text's guards read a folded form: look-alike, full-width, mathematical and spaced spellings of a quote, Solana and USDT, disguised links and a split address are refused; plain texts still pass", () => {
  for (const t of ["Trade it for ＳＯＬ.", "Trade it for SОL.", "Trade it for ЅOL.", "Trade it for 𝐒𝐎𝐋.", "Trade it for S O L.", "Trade it for S.O.L.", "Trade it for Solana.", "Paired with USDT.", "Trade it for S0L.", "Buy with U-S-D-C"]) {
    assert.equal(say(t), "text_names_quote", t);
  }
  for (const t of ["See ｗｗｗ．scam．com", "See scam。com/claim", "See t․me/scamgroup", "See scam[.]com"]) assert.equal(say(t), "text_has_link", t);
  assert.equal(say("Send to 7xKXtg2CW87d97TX JSDpbD5jBkheTqA83TZRuJosgAsU"), "text_has_address");
  for (const t of ["Solar city, solid people", "Soleil and console", "A city of 2 rivers", "Founded in 1785 by Dutch traders near the river", "Where rivers meet the sea and the sun warms the town", "Is old, is new", "Home of the US Open", "Arts & culture since 1501"]) assert.equal(say(t), "accepted", t);
  assert.equal(codeOf(() => V2.renderDescription("Costa del Sol", null, "Spain", "SOL", { symbol: "COSTA", text: "The sunny Costa del Sol" })), "accepted", "a place's own name");
});

test("SEC-6: cc-norm-1 refuses private use, noncharacters, U+FFFC and U+FFFD, a leading combining mark and a stack of more than 4", () => {
  for (const [s, want] of [["Utica", "private_use"], ["Utica", "private_use"], ["Utica\u{F0000}", "private_use"], ["Utica\u{10FFFD}", "private_use"], ["Utica￾", "unassigned_character"], ["Utica￿", "unassigned_character"],
    ["Utica﷐", "unassigned_character"], ["Utica￼", "replacement_character"], ["Utica�", "replacement_character"], ["́Utica", "leading_mark"], ["Uti ́ca", "leading_mark"], [`U${"́".repeat(90)}`, "too_many_marks"]]) {
    assert.equal(codeOf(() => V2.normalizeText(s)), want, JSON.stringify(s));
  }
  assert.equal(V2.normalizeText("Cá̂̃̄̅"), "Cá̂̃̄̅", "four marks after NFC pass");
});

test("SEC-7: '<' and '>' are refused in the approved text (the description is hashed into metadata JSON, which does not escape them)", () => {
  assert.equal(say("</script><img src=x onerror=alert(1)>"), "text_has_markup");
  assert.equal(say("Arts & culture"), "accepted");
});

/* ---------------------------------------------------------------- S39 */
const TAKER = "CnQMR167gRRXcPYrDZkwbW6moYKmxd7gZNGSN6BNzz6p";
const STRANGER = "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL";
function world(extraEnv = {}) {
  _resetSwap(); _resetRelay(); _resetMarketLive();
  const W = fakeWorld({ rpc: { mints: { [REAL_VIC]: { decimals: 6 } }, lamports: { [TAKER]: 2_000_000_000 } } });
  const env = { ...newWorld(), SWAP: "on", VICINITY_MINT: REAL_VIC, SOLANA_RPC_URL: "https://rpc.test", ...extraEnv };
  const call = async (path, body) => {
    const res = await handleApi(new Request(`https://vicinity.test${path}`, { method: "POST", headers: new Headers({ "cf-connecting-ip": "1.2.3.4", origin: "https://vicinity.test", "content-type": "application/json" }), body: JSON.stringify(body) }), env, W.fetch);
    return { status: res.status, data: await res.json() };
  };
  return { W, call };
}

test("SF-5: with a fee setting, an answer that never reaches Jupiter is today's (a bad body 400, an unknown pair's own refusal); the Jupiter path is refused", async () => {
  const { W, call } = world({ SWAP_PLATFORM_FEE_BPS: "50" });
  const bad = await call("/api/swap/quote", { inputMint: "nope", outputMint: REAL_VIC, amount: "1" });
  assert.deepEqual([bad.status, bad.data.error], [400, "bad_mint"]);
  const same = await call("/api/swap/tx", { inputMint: SOL, outputMint: SOL, amount: "1", taker: TAKER });
  assert.deepEqual([same.status, same.data.error], [400, "same_mint"]);
  const q = await call("/api/swap/quote", { inputMint: SOL, outputMint: REAL_VIC, amount: "0.25", slippageBps: 100 });
  assert.deepEqual([q.status, q.data.error, q.data.reason], [503, "swap_unavailable", "platform_fee_not_zero"]);
  assert.deepEqual(W.jup.log, [], "Jupiter was never asked");
});

/** A clean fake build in Jupiter's shared_accounts_route_v2 layout (as solana/sdk/launchpad/fixtures/ records it), then `mutate`. */
async function sharedBuild(p, mutate = () => {}) {
  const b = await rewriteBuild(p), sw = b.swapInstruction, A = sw.accounts, id = 3;
  const authority = (await findProgramAddress([new TextEncoder().encode("authority"), Uint8Array.of(id)], PROGRAM_IDS.jupiter))[0];
  const acc = (pubkey, isWritable = false) => ({ pubkey, isSigner: false, isWritable });
  sw.accounts = [acc(authority), { pubkey: p.taker, isSigner: true, isWritable: false }, acc(A[1].pubkey, true), acc(await ata(authority, p.inputMint), true), acc(await ata(authority, p.outputMint), true),
    acc(A[2].pubkey, true), acc(A[3].pubkey), acc(A[4].pubkey), acc(A[5].pubkey), acc(A[6].pubkey), acc(A[8].pubkey), acc(A[9].pubkey), ...A.slice(10)];
  sw.data = toBase64(concat([Uint8Array.from([0xd1, 0x98, 0x53, 0x93, 0x7c, 0xfe, 0xd8, 0xe9]), Uint8Array.of(id), fromBase64(sw.data).subarray(8)]));
  await mutate(b);
  return b;
}
test("SEC-1: the validator checks what it can tell: Jupiter's event authority, the shared layout's program authority and its own accounts, and no taker account of a watched mint the route does not trade; the recorded real answers still pass", async () => {
  const p = { taker: TAKER, inputMint: SOL, outputMint: REAL_VIC, amountRaw: "250000000", slippageBps: 100, outRaw: fakeOut(SOL, REAL_VIC, 250_000_000n, { [SOL]: 9, [REAL_VIC]: 6 }) };
  const check = async (b) => { try { await checkJupiterBuild(b, { taker: TAKER, inputMint: SOL, outputMint: REAL_VIC, inAmount: 250_000_000n }); return "accepted"; } catch (e) { return e.code; } };
  assert.equal(await check(await rewriteBuild(p)), "accepted");
  assert.equal(await check(await sharedBuild(p)), "accepted", "the clean shared layout");
  const usdcAta = await ata(TAKER, USDC);
  const strangerAta = await ata(STRANGER, REAL_VIC);
  assert.equal(await check(await sharedBuild(p, (b) => { b.swapInstruction.accounts[0].pubkey = STRANGER; })), "program_authority");
  assert.equal(await check(await sharedBuild(p, (b) => { b.swapInstruction.accounts[3].pubkey = STRANGER; })), "program_source");
  assert.equal(await check(await sharedBuild(p, (b) => { b.swapInstruction.accounts[4].pubkey = strangerAta; })), "program_destination");
  assert.equal(await check(await sharedBuild(p, (b) => { b.swapInstruction.accounts[10].pubkey = STRANGER; })), "event_authority");
  assert.equal(await check(await sharedBuild(p, (b) => { const d = fromBase64(b.swapInstruction.data); d.set(u16le(50), 27); b.swapInstruction.data = toBase64(d); })), "platform_fee");
  const route = await rewriteBuild(p);
  route.swapInstruction.accounts[8].pubkey = STRANGER;
  assert.equal(await check(route), "event_authority");
  const withUsdc = await rewriteBuild(p);
  withUsdc.swapInstruction.accounts.push({ pubkey: usdcAta, isSigner: false, isWritable: true });
  assert.equal(await check(withUsdc), "route_taker_account", "the taker's USDC account in a SOL -> $VICINITY route");
  // the recorded real answers (two shared, three route_v2 layouts; routes through USDC and SOL) pass the stricter checks
  for (const f of ["solana/sdk/launchpad/fixtures/jupiter-build-SOL-to-cbBTC-max40-nowrap.json", "solana/sdk/launchpad/fixtures/jupiter-build-cbBTC-to-SOL-max40.json", "solana/sdk/launchpad/fixtures/jupiter-build-cbBTC-to-VICINITY-max64.json", "test/fixtures/jupiter/build-sol-vicinity.json", "test/fixtures/jupiter/build-usdc-vicinity.json"]) {
    const b = json(f), shared = fromBase64(b.swapInstruction.data)[0] === 0xd1;
    await checkJupiterBuild(b, { taker: b.swapInstruction.accounts[shared ? 1 : 0].pubkey, inputMint: b.inputMint, outputMint: b.outputMint, inAmount: BigInt(b.inAmount) });
  }
});
