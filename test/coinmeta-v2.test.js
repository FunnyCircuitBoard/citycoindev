// Canonical city-coin metadata v2 (src/coinmeta-v2.js; Citycoin.dev master v5, stage S22, advances M01): the description's exact
// wording for SOL and non-SOL quotes, with and without a state or region; content v2 with ids, attribution and the normalization
// version; canonical JSON and its SHA-256 per quote; the metadata JSON whose SHA-256 is the program's meta_hash; the brand constants
// of new-program coins against the master policy and PR #83 (test/fixtures/citycoin-curve-pr83.json); golden vectors
// (test/fixtures/coinmeta-v2-golden.json). And the stage's promise: nothing is wired, and no existing module's output changes
// (test/fixtures/s22-legacy-outputs.json was recorded from edabab5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import * as V2 from "../src/coinmeta-v2.js";
import { MASTER_POLICY } from "../src/masterpolicy.js";
import { POLICY } from "../src/policy.js";
import { BLANK_CHARS, FORMAT_CHARS } from "../src/text.js";
import * as META from "../src/coinmeta.js";
import * as DEFS from "../src/coindefaults.js";
import * as READY from "../src/coinready.js";
import * as ART from "../src/coinart.js";
import * as STORE from "../src/coinart-store.js";

const root = new URL("../", import.meta.url);
const text = (p) => readFileSync(new URL(p, root), "utf8");
const json = (p) => JSON.parse(text(p));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const GOLDEN = json("test/fixtures/coinmeta-v2-golden.json");
const CURVE = json("test/fixtures/citycoin-curve-pr83.json");
const LEGACY = json("test/fixtures/s22-legacy-outputs.json");
const cities = json("public/data/cities.json");
const tickers = json("public/data/tickers.json");
const P = MASTER_POLICY.policy;
const { MetadataError, renderDescription, contentV2, canonicalJson, normalizeText, checkCoinName, checkCoinSymbol, quoteOf, buildCoinMetadataV2, buildPerQuote, metadataJsonV2, QUOTES, CC_COIN_BRAND } = V2;
const MINT = "CagvLF3JgZNBTUf6LrTg9ryFh7FsZbVoBaHVmoCnhBba"; // fake
const ART_SHA = "a".repeat(64); // fake
const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof MetadataError, String(e)); return e.code; } return null; };
const UTICA = { city: { id: "5142056", name: "Utica" }, region: { id: "US.NY", name: "New York" }, country: { id: "US", name: "United States" }, name: "Utica", symbol: "UTICA", artSha256: ART_SHA, mint: MINT };
const BRAND_LINE = "Launched on Citycoin.dev (https://citycoin.dev) on Solana.";

/* ------------------------------------------------------------------ the wording (M01: actual city, state or region, country and pair) */

test("the description, word for word: SOL and USDC, with a state, with no state or region, non-ASCII, a region ending in a full stop, an approved text", () => {
  const D = (...a) => renderDescription(...a);
  assert.equal(D("Utica", "New York", "United States", "SOL", { symbol: "UTICA" }),
    `The city coin of Utica. City: Utica. State or region: New York. Country: United States. Pair: $UTICA / SOL. ${BRAND_LINE}`);
  assert.equal(D("Utica", "New York", "United States", "USDC", { symbol: "UTICA" }),
    `The city coin of Utica. City: Utica. State or region: New York. Country: United States. Pair: $UTICA / USDC. ${BRAND_LINE}`);
  assert.equal(D("Gibraltar", null, "Gibraltar", "SOL", { symbol: "GIBRALTAR" }),
    `The city coin of Gibraltar. City: Gibraltar. No state or region. Country: Gibraltar. Pair: $GIBRALTAR / SOL. ${BRAND_LINE}`);
  assert.equal(D("Oranjestad", null, "Aruba", "USDC", { symbol: "ORANJESTAD" }),
    `The city coin of Oranjestad. City: Oranjestad. No state or region. Country: Aruba. Pair: $ORANJESTAD / USDC. ${BRAND_LINE}`);
  assert.equal(D("Herāt", "Herat", "Afghanistan", "SOL", { symbol: "HERAT" }),
    `The city coin of Herāt. City: Herāt. State or region: Herat. Country: Afghanistan. Pair: $HERAT / SOL. ${BRAND_LINE}`);
  assert.equal(D("Bogotá", "Bogota D.C.", "Colombia", "USDC", { symbol: "BOGOTA", text: "Coffee, mountains\nand the  Andes" }),
    `Coffee, mountains and the Andes. City: Bogotá. State or region: Bogota D.C. Country: Colombia. Pair: $BOGOTA / USDC. ${BRAND_LINE}`);
  assert.equal(D("São Paulo", "São Paulo ", " Brazil", "SOL", { symbol: "SAOPAULO", text: "Where the city never sleeps!" }),
    `Where the city never sleeps! City: São Paulo. State or region: São Paulo. Country: Brazil. Pair: $SAOPAULO / SOL. ${BRAND_LINE}`);
  // a quote passed as { symbol, mint } (a later approved SPL quote, or the main token once its mint is verified): its own symbol
  assert.match(D("Utica", "New York", "United States", { symbol: "CCTEST", mint: MINT }, { symbol: "UTICA" }), /Pair: \$UTICA \/ CCTEST\. /);
});

test("every one of the 8,030 registry cities, with each listed quote: its own city, state or region (or 'No state or region'), country and the selected pair, never the other quote", () => {
  const sentence = (s) => (/[.!?…]$/u.test(s) ? s : `${s}.`);
  let n = 0, noRegion = 0, longNames = [];
  for (const [cc, rows] of Object.entries(cities.byCountry)) for (const r of rows) {
    const t = tickers[String(r[0])];
    if (!t) continue;
    const ticker = typeof t === "string" ? t : t[0];
    const region = r[2] ? cities.admin[`${cc}.${r[2]}`] || null : null;
    if (region === null) noRegion++;
    const country = cities.countries[cc];
    for (const q of ["SOL", "USDC"]) {
      const d = renderDescription(r[1], region, country, q, { symbol: ticker });
      const city = normalizeText(r[1]);
      assert.ok(d.startsWith(`The city coin of ${sentence(city)} City: ${sentence(city)} `), r[1]);
      assert.ok(d.includes(region === null ? " No state or region. " : ` State or region: ${sentence(normalizeText(region))} `), r[1]);
      assert.ok(d.includes(` Country: ${sentence(normalizeText(country))} Pair: $${ticker} / ${q}. `), r[1]);
      assert.ok(d.endsWith(BRAND_LINE));
      assert.doesNotMatch(d, q === "SOL" ? /USDC/ : /\/ SOL\b|\bSOL\b/, `${r[1]}: never the other quote`);
      n++;
    }
    // the coin's own content: the registry name, or its short form where the name is over 32 bytes (src/coindefaults.js)
    const base = { city: { id: String(r[0]), name: r[1] }, region: region === null ? null : { id: `${cc}.${r[2]}`, name: region }, country: { id: cc, name: country }, symbol: ticker, artSha256: ART_SHA, quote: "SOL" };
    if (code(() => contentV2({ ...base, name: r[1] })) === "name_too_long") longNames.push(String(r[0]));
    else assert.equal(contentV2({ ...base, name: r[1] }).name, normalizeText(r[1]));
    if (DEFS.NAME_OVERRIDES[r[0]]) assert.equal(contentV2({ ...base, name: DEFS.NAME_OVERRIDES[r[0]] }).name, DEFS.NAME_OVERRIDES[r[0]]);
  }
  assert.equal(n, 2 * 8030);
  assert.equal(noRegion, 29, "the list has no state or region for 29 registry places; each says so");
  assert.deepEqual(longNames.sort(), Object.keys(DEFS.NAME_OVERRIDES).sort(), "only the three long names are refused, and their short forms pass");
});

test("the region must be stated: null for none, never left out, never blank, never made up", () => {
  assert.equal(code(() => renderDescription("Utica", undefined, "United States", "SOL", { symbol: "UTICA" })), "region_missing");
  assert.equal(code(() => renderDescription("Utica", "", "United States", "SOL", { symbol: "UTICA" })), "empty");
  assert.equal(code(() => renderDescription("Utica", " \n ", "United States", "SOL", { symbol: "UTICA" })), "empty");
  const { region, ...noRegion } = UTICA;
  assert.equal(code(() => contentV2({ ...noRegion, quote: "SOL" })), "region_missing");
  assert.equal(code(() => contentV2({ ...UTICA, region: { id: "CA.08", name: "Ontario" }, quote: "SOL" })), "bad_id", "a region of another country");
  const c = contentV2({ ...UTICA, region: null, quote: "SOL" });
  assert.equal(c.region, null);
  assert.match(c.description, / City: Utica\. No state or region\. Country: United States\. /);
  assert.deepEqual(metadataJsonV2(c, { mint: MINT, contentHash: "b".repeat(64) }).attributes[3], { trait_type: "State or region", value: "No state or region" });
});

test("pair accuracy: a listed quote's symbol only with its own mint, never a legacy mint, never a look-alike; the approved text may not name a quote", () => {
  assert.deepEqual({ ...quoteOf("SOL") }, { ...QUOTES.SOL });
  assert.deepEqual({ ...quoteOf("USDC") }, { ...QUOTES.USDC });
  assert.deepEqual({ ...quoteOf({ symbol: "SOL", mint: QUOTES.SOL.mint }) }, { ...QUOTES.SOL });
  assert.deepEqual({ ...quoteOf({ symbol: "mSOLx", mint: MINT }) }, { symbol: "mSOLx", mint: MINT }, "another SPL symbol may have small letters");
  for (const [q, want] of [
    [{ symbol: "SOL", mint: QUOTES.USDC.mint }, "quote_mismatch"], [{ symbol: "USDC", mint: QUOTES.SOL.mint }, "quote_mismatch"],
    [{ symbol: "sol", mint: QUOTES.SOL.mint }, "quote_mismatch"], [{ symbol: "Sol", mint: MINT }, "quote_mismatch"], [{ symbol: "WSOL", mint: QUOTES.SOL.mint }, "quote_mismatch"],
    [{ symbol: "wsol", mint: MINT }, "quote_mismatch"], [{ symbol: "UsDc", mint: MINT }, "quote_mismatch"], [{ symbol: "VICINITY", mint: MINT }, "quote_mismatch"],
    [{ symbol: "OTHER", mint: QUOTES.SOL.mint }, "quote_mismatch"], [{ symbol: "VICINITY", mint: "2aVkhRfAEm44tMhFo8oamWvumGGvweFqnUwukRMBkray" }, "legacy_quote"],
    [{ symbol: "MAIN", mint: "2aVkhRfAEm44tMhFo8oamWvumGGvweFqnUwukRMBkray" }, "legacy_quote"], ["BONK", "unknown_quote"], ["sol", "unknown_quote"], ["toString", "unknown_quote"],
    [null, "unknown_quote"], [{ symbol: "SOL" }, "bad_quote_mint"], [{ symbol: "X Y", mint: MINT }, "bad_quote_symbol"], [{ symbol: "ABCDEFGHIJK", mint: MINT }, "bad_quote_symbol"],
    [{ symbol: "OK", mint: "0OIl" + "1".repeat(40) }, "bad_quote_mint"],
  ]) assert.equal(code(() => quoteOf(q)), want, JSON.stringify(q));
  const say = (t, q = "USDC", city = "Utica") => code(() => renderDescription(city, null, "United States", q, { symbol: "UTICA", text: t }));
  for (const t of ["Trade it against SOL", "paired with sol!", "now on $SOL", "USDC only", "wsol inside", "Buy with usdc."]) assert.equal(say(t), "text_names_quote", t);
  assert.equal(say("Paired with CCTEST", { symbol: "CCTEST", mint: MINT }), "text_names_quote", "the selected quote's own symbol too");
  for (const t of ["Solar city, solid people", "Soleil and console", "A city of 2 rivers"]) assert.equal(say(t), null, t);
  assert.equal(say("The sunny Costa del Sol", "SOL", "Costa del Sol"), null, "a place's own name is not a quote");
  for (const t of ["See https://utica.example", "visit www.utica", "utica.com/coin", `send to ${MINT}`]) assert.ok(["text_has_link", "text_has_address"].includes(say(t)), t);
});

/* ------------------------------------------------------------------ content v2, canonical JSON and the hashes */

test("golden vectors: one SOL and one USDC coin of the same city, no state or region, non-ASCII, NFD input, an approved text, and a fake coin at every limit", async () => {
  assert.equal(GOLDEN.vectors.length, 8);
  const byId = Object.fromEntries(GOLDEN.vectors.map((v) => [v.id, v]));
  for (const v of GOLDEN.vectors) {
    const r = await buildCoinMetadataV2({ ...v.input, quote: v.quote });
    assert.equal(r.content.description, v.description, v.id);
    assert.equal(r.contentJson, v.contentJson, v.id);
    assert.equal(r.contentHash, v.contentHash, v.id);
    assert.equal(r.metadataJson, v.metadataJson, v.id);
    assert.equal(r.metaHash, v.metaHash, v.id);
    assert.equal(r.uri, v.uri, v.id);
    // the hashes again with Node's own SHA-256 over the UTF-8 bytes (an implementation the module does not use)
    assert.equal(sha(Buffer.from(v.contentJson, "utf8")), v.contentHash);
    assert.equal(sha(Buffer.from(v.metadataJson, "utf8")), v.metaHash);
    assert.deepEqual(JSON.parse(v.metadataJson), JSON.parse(JSON.stringify(r.metadata)));
    assert.equal(JSON.parse(v.metadataJson).content.hash, v.contentHash, "the JSON names its content version");
    assert.equal(v.uri, `https://citycoin.dev/coin-meta/v1/${v.input.mint}.json`);
    assert.equal(JSON.parse(v.metadataJson).image, `https://citycoin.dev/coin-meta/v1/art/${v.input.artSha256}.png`);
  }
  // the same version, two quotes: only the pair, the quote and the hashes differ
  const s = JSON.parse(byId["utica-sol"].contentJson), u = JSON.parse(byId["utica-usdc"].contentJson);
  assert.deepEqual({ ...s, description: null, quote: null }, { ...u, description: null, quote: null });
  assert.equal(s.description.replace("/ SOL.", "/ USDC."), u.description);
  assert.notEqual(byId["utica-sol"].metaHash, byId["utica-usdc"].metaHash);
  // NFD and stray spaces in, NFC out: the same content as the composed input
  const nfd = byId["sao-paulo-usdc-nfd"];
  const composed = await buildCoinMetadataV2({ ...nfd.input, city: { id: "3448439", name: "São Paulo" }, region: { id: "BR.27", name: "São Paulo" }, country: { id: "BR", name: "Brazil" }, name: "São Paulo", quote: nfd.quote });
  assert.equal(composed.contentHash, nfd.contentHash);
  assert.ok(nfd.input.city.name !== "São Paulo" && nfd.contentJson.includes('"name":"São Paulo"') && !nfd.contentJson.includes("̃"));
  // the limits: a 32-byte name, a 10-character ticker, the largest city id, a 200-character text, a 44-byte country
  const lim = byId["limits-fake-spl"], lc = JSON.parse(lim.contentJson);
  assert.equal(Buffer.byteLength(lc.name, "utf8"), 32);
  assert.equal(lc.symbol.length, 10);
  assert.equal(lc.city.id, ((1n << 64n) - 2n).toString());
  assert.equal(lc.text.length, 200);
  assert.equal(Buffer.byteLength(lc.country.name, "utf8"), 44);
  assert.ok(lim.uri.length <= 200, "within Metaplex's 200-byte URI");
  const one = (patch) => code(() => contentV2({ ...lim.input, ...patch, quote: lim.quote }));
  assert.equal(one({ name: "Sainte-Anne-des-Plaines-de-Lévis" }), "name_too_long", "33 bytes");
  assert.equal(one({ symbol: "GROSSGERAUX" }), "bad_symbol", "11 characters");
  assert.equal(one({ text: `${lc.text.slice(0, -1)}xx` }), "too_long", "201 characters");
  assert.equal(one({ city: { id: ((1n << 64n) - 1n).toString(), name: "X" } }), "bad_id", "u64::MAX");
  assert.equal(one({ region: { id: "GS.ABCDEFGHIJKLMNOPQRSTU", name: "X" } }), "bad_id", "a 21-character region code");
});

test("content v2: exactly these keys, the ids, the attribution and the normalization version, deeply frozen, and the same bytes whatever the input key order", async () => {
  const c = contentV2({ ...UTICA, quote: "SOL" });
  assert.deepEqual(Object.keys(c).sort(), ["attribution", "city", "country", "description", "descriptionTemplate", "image", "name", "norm", "quote", "region", "symbol", "text", "v"]);
  assert.equal(c.v, 2);
  assert.equal(c.norm, "cc-norm-1");
  assert.equal(c.descriptionTemplate, "cc-desc-1");
  assert.equal(c.attribution, "GeoNames (geonames.org), CC BY 4.0");
  assert.deepEqual(c.city, { id: "5142056", name: "Utica" });
  assert.deepEqual(c.region, { id: "US.NY", name: "New York" });
  assert.deepEqual(c.country, { id: "US", name: "United States" });
  assert.deepEqual(c.quote, { mint: QUOTES.SOL.mint, symbol: "SOL" });
  assert.deepEqual(c.image, { sha256: ART_SHA, template: "t2" });
  assert.equal(c.text, null);
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.city) && Object.isFrozen(c.region) && Object.isFrozen(c.image) && Object.isFrozen(c.quote));
  assert.equal(contentV2({ ...UTICA, city: { name: "Utica", id: 5142056 }, quote: { mint: QUOTES.SOL.mint, symbol: "SOL" } }).city.id, "5142056", "a numeric id is written as text");
  const reversed = Object.fromEntries(Object.entries({ ...UTICA, quote: "SOL" }).reverse());
  assert.equal(V2.contentJson(contentV2(reversed)), V2.contentJson(c));
  assert.equal(await V2.contentHash(c), sha(V2.contentJson(c)));
  assert.match(V2.contentJson(c), /^\{"attribution":"GeoNames \(geonames\.org\), CC BY 4\.0","city":\{"id":"5142056","name":"Utica"\},"country":/);
  // refusals
  const bad = (patch, want) => assert.equal(code(() => contentV2({ ...UTICA, quote: "SOL", ...patch })), want, JSON.stringify(patch));
  bad({ city: { id: "0", name: "Utica" } }, "bad_id");
  bad({ city: { id: "05142056", name: "Utica" } }, "bad_id");
  bad({ city: { id: 1.5, name: "Utica" } }, "bad_id");
  bad({ country: { id: "us", name: "United States" } }, "bad_id");
  bad({ region: { id: "NY", name: "New York" } }, "bad_id");
  bad({ city: null }, "missing");
  bad({ name: "" }, "empty");
  bad({ name: "Uti​ca" }, "invisible_character");
  bad({ name: "Uti ca" }, "blank_character");
  bad({ name: "Uti\u0007ca" }, "control_character");
  bad({ name: "Utica\uD800" }, "not_well_formed");
  bad({ symbol: "utica" }, "bad_symbol");
  bad({ artSha256: "A".repeat(64) }, "bad_sha256");
  bad({ quote: "BONK" }, "unknown_quote");
  bad({ attribution: "" }, "empty");
});

test("canonical JSON: keys sorted by UTF-16 code units at every level, no whitespace, UTF-8 text, and refusals instead of silent drops", () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, "x\"y\\z\n"], é: "ü", B: { d: -0, c: 0 }, "😀": "", "": 9 }),
    '{"":9,"B":{"c":0,"d":0},"a":[true,null,"x\\"y\\\\z\\n"],"b":1,"é":"ü","😀":""}');
  assert.equal(canonicalJson(Object.freeze({ z: Object.freeze([1, "€"]) })), '{"z":[1,"€"]}');
  assert.equal(canonicalJson(Object.assign(Object.create(null), { k: "v" })), '{"k":"v"}');
  for (const [v, why] of [[1.5, "a fraction"], [2 ** 53, "an unsafe integer"], [NaN, "NaN"], [undefined, "undefined"], [{ a: undefined }, "an undefined member"], [[1, , 3], "a sparse array"], // eslint-disable-line no-sparse-arrays
    [new Date(0), "a class instance"], [10n, "a bigint"], ["\uDC00", "a lone surrogate"], [{ k: () => 1 }, "a function"], [new Map(), "a Map"]]) {
    assert.equal(code(() => canonicalJson(v)), v === "\uDC00" ? "not_well_formed" : "not_canonical", why);
  }
});

test("normalization cc-norm-1: NFC, ASCII whitespace runs to one space, nothing at the ends, invisible, blank and control characters refused, idempotent", () => {
  assert.equal(normalizeText("  São\t\tPaulo \r\n"), "São Paulo");
  assert.equal(normalizeText("Bonaire, Saint Eustatius and Saba "), "Bonaire, Saint Eustatius and Saba", "the list's own trailing space");
  assert.equal(normalizeText("A\fB\vC"), "A B C");
  for (const [s, want] of [["", "empty"], [" \t\n", "empty"], ["a\u0000b", "control_character"], ["a\u0085b", "control_character"], ["a‍b", "invisible_character"],
    ["a﻿b", "invisible_character"], ["‮abc", "invisible_character"], ["a　b", "blank_character"], ["a b", "blank_character"], ["a ", "blank_character"],
    ["\uD83D", "not_well_formed"], [12, "not_text"], [null, "not_text"]]) assert.equal(code(() => normalizeText(s)), want, JSON.stringify(s));
  assert.equal(code(() => normalizeText("x".repeat(11), "t", { max: 10 })), "too_long");
  // idempotent, and always NFC, over random strings of the hard cases
  const pool = ["a", "Z", "é", "é", "̃", " ", "  ", "\t", "\n", "\r\n", "ß", "İ", "😀", " ", "​", "\u0001", "-", ".", "ā", "Å", "Å", "ẞ"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
  let ok = 0;
  for (let i = 0; i < 4000; i++) {
    let s = "";
    for (let k = 1 + Math.floor(rnd() * 8); k > 0; k--) s += pool[Math.floor(rnd() * pool.length)];
    let n;
    try { n = normalizeText(s); } catch (e) { assert.ok(e instanceof MetadataError); continue; }
    ok++;
    assert.equal(normalizeText(n), n, JSON.stringify(s));
    assert.equal(n, n.normalize("NFC"));
    assert.ok(!/^ | $|  |[\t\n\r\v\f]/.test(n), JSON.stringify(n));
  }
  assert.ok(ok > 500);
});

/* ------------------------------------------------------------------ the program's rules (PR #83) and the master's values */

test("name and ticker rules match the program (PR #83 at 77faf53): the same limits and character ranges; every name accepted here is accepted there, and for NFC names the two agree", () => {
  const set = (ranges) => { const s = new Set(); for (const [lo, hi] of ranges) for (let c = lo; c <= hi; c++) s.add(c); return s; };
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  assert.ok(same(set(FORMAT_CHARS), set(CURVE.FORMAT_CHARS)) && same(set(CURVE.FORMAT_CHARS), set(CURVE.FORMAT_CHARS_RUST)), "invisible characters");
  assert.ok(same(set(BLANK_CHARS), set(CURVE.BLANK_CHARS)) && same(set(CURVE.BLANK_CHARS), set(CURVE.BLANK_CHARS_RUST)), "blank characters");
  assert.equal(V2.MAX_NAME_BYTES, CURVE.MAX_NAME_LEN);
  assert.equal(V2.MAX_SYMBOL_BYTES, CURVE.MAX_SYMBOL_LEN);
  // the program's check_name, as solana/sdk/curve/batch.mjs:55-67 writes it (null when accepted)
  const inR = (c, r) => r.some(([lo, hi]) => c >= lo && c <= hi);
  const curveName = (name) => {
    const n = Buffer.byteLength(name, "utf8");
    if (n === 0 || n > CURVE.MAX_NAME_LEN) return "length";
    for (const ch of name) { const c = ch.codePointAt(0); if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || inR(c, CURVE.FORMAT_CHARS) || inR(c, CURVE.BLANK_CHARS)) return "char"; }
    return name.startsWith(" ") || name.endsWith(" ") || name.includes("  ") ? "space" : null;
  };
  const curveSymbol = (s) => (/^[A-Z0-9]+$/.test(s) && s.length <= CURVE.MAX_SYMBOL_LEN ? null : "bad");
  const pool = ["a", "Z", "é", "é", " ", "  ", "\t", "ß", "😀", " ", "​", "\u0001", "-", "ā", "Universität", "x".repeat(10), "ㅤ", "؜"];
  let seed = 11, agree = 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 6000; i++) {
    let s = "";
    for (let k = Math.floor(rnd() * 6); k > 0; k--) s += pool[Math.floor(rnd() * pool.length)];
    const ours = checkCoinName(s), theirs = curveName(s);
    if (ours === null) assert.equal(theirs, null, JSON.stringify(s));
    if (s === s.normalize("NFC")) { assert.equal(ours === null, theirs === null, JSON.stringify(s)); agree++; }
    else if (theirs === null) assert.equal(ours, "not_normalized", "the program would take a decomposed name; the website never sends one");
  }
  assert.ok(agree > 1000);
  for (const s of ["UTICA", "A", "MOHAMMADPU", "NYC2", "utica", "", "ABCDEFGHIJK", "UT ICA", "ÜTICA", "UTICA\n"]) assert.equal(checkCoinSymbol(s) === null, curveSymbol(s) === null, s);
});

test("brand constants of new-program coins: the master policy's product name and origin, the program's metadata prefix, the content-addressed picture under it", () => {
  assert.equal(CC_COIN_BRAND.productName, P.pairs_and_branding.product_name);
  assert.equal(CC_COIN_BRAND.site, P.pairs_and_branding.canonical_origin);
  assert.equal(CC_COIN_BRAND.metadataPrefix, CURVE.METADATA_URI_PREFIX);
  assert.equal(CC_COIN_BRAND.metadataPrefix, CURVE.METADATA_URI_PREFIX_RUST);
  assert.ok(CC_COIN_BRAND.metadataPrefix.startsWith(`${CC_COIN_BRAND.site}/coin-meta/`));
  assert.equal(CC_COIN_BRAND.artPrefix, `${CC_COIN_BRAND.metadataPrefix}art/`);
  assert.equal(CC_COIN_BRAND.artTemplate, "t2");
  assert.equal(CC_COIN_BRAND.network, META.VICINITY_BRAND.network);
  assert.ok(Object.isFrozen(CC_COIN_BRAND));
  assert.equal(V2.metadataUri(MINT), `https://citycoin.dev/coin-meta/v1/${MINT}.json`);
  assert.ok(V2.metadataUri("1".repeat(44)).length <= 83, "34 + 44 + 5 bytes (curve design 3.2)");
  assert.equal(V2.artUrl(ART_SHA), `https://citycoin.dev/coin-meta/v1/art/${ART_SHA}.png`);
  assert.equal(V2.coinPageUrl(MINT), `https://citycoin.dev/coin?mint=${MINT}`);
  // the quotes, the legacy token, the attribution and the text limit are the policy's, the list's and the live rule's
  assert.deepEqual({ ...QUOTES.SOL }, { symbol: P.quote_configs.sol.quote_symbol, mint: P.quote_configs.sol.quote_mint });
  assert.deepEqual({ ...QUOTES.USDC }, { symbol: P.quote_configs.usdc.quote_symbol, mint: P.quote_configs.usdc.quote_mint });
  assert.equal(P.quote_configs.main_token.quote_mint, null, "no main-token quote until MAIN_TOKEN_MINT is verified (amendment 01)");
  assert.deepEqual([...V2.LEGACY_QUOTE_MINTS], P.legacy_tokens.map((t) => t.mint));
  assert.equal(V2.PLACE_ATTRIBUTION, cities.source);
  assert.equal(V2.MAX_TEXT_LENGTH, POLICY.coins.pitchMax);
  assert.deepEqual([...P.metadata.description_must_include], ["canonical_city", "state_or_region", "country", "actual_quote_pair"]);
  assert.equal(P.metadata.region_not_applicable, "render_explicitly_never_fabricate");
});

test("per quote: one content, one JSON and one hash for each allowed quote; a quote twice, no quote, the coin as its own quote or a quote's mint as the coin are refused", async () => {
  const all = await buildPerQuote(UTICA, ["SOL", "USDC", { symbol: "CCTEST", mint: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" }]);
  assert.equal(all.length, 3);
  assert.equal(new Set(all.map((r) => r.contentHash)).size, 3);
  assert.equal(new Set(all.map((r) => r.metaHash)).size, 3);
  assert.equal(new Set(all.map((r) => r.uri)).size, 1, "one coin, one URI: the launch binds the quote's JSON by its hash");
  assert.deepEqual(all.map((r) => r.content.quote.symbol), ["SOL", "USDC", "CCTEST"]);
  for (const r of all) assert.ok(r.metadataJson.includes(`"value":"$UTICA / ${r.content.quote.symbol}"`));
  assert.equal(code(() => { throw new MetadataError("x", "y"); }), "x");
  const rejects = async (p, want) => { try { await p(); } catch (e) { assert.equal(e.code, want); return; } assert.fail(`expected ${want}`); };
  await rejects(() => buildPerQuote(UTICA, ["SOL", { symbol: "SOL", mint: QUOTES.SOL.mint }]), "duplicate_quote");
  await rejects(() => buildPerQuote(UTICA, []), "no_quotes");
  await rejects(() => buildCoinMetadataV2({ ...UTICA, quote: { symbol: "CCTEST", mint: MINT } }), "own_quote");
  await rejects(() => buildCoinMetadataV2({ ...UTICA, mint: QUOTES.USDC.mint, quote: "SOL" }), "bad_mint");
  await rejects(() => buildCoinMetadataV2({ ...UTICA, mint: "not a mint", quote: "SOL" }), "bad_mint");
  assert.equal(code(() => metadataJsonV2({ v: 1 }, { mint: MINT, contentHash: ART_SHA })), "not_content_v2");
  assert.equal(code(() => metadataJsonV2(contentV2({ ...UTICA, quote: "SOL" }), { mint: MINT, contentHash: "x" })), "bad_sha256");
});

/* ------------------------------------------------------------------ the stage's promise: not wired, and no existing output changes */

test("not wired: no Worker path reaches src/coinmeta-v2.js or src/coinart-t2.js, no page or script names them, and they read no setting, clock, network or database", () => {
  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    for (const m of text(rel).matchAll(/(?:^|[\s;])(?:import|export)\s[^;]*?from\s*["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
      walk(new URL(m[1] || m[2], new URL(rel, "file:///r/")).pathname.slice(3));
    }
  };
  walk("src/index.js");
  assert.ok(seen.has("src/coinmeta.js") && seen.has("src/coinart.js") && seen.has("src/jobs.js") && seen.size > 60, `the walk found the Worker (${seen.size} modules)`);
  assert.ok(!seen.has("src/coinmeta-v2.js") && !seen.has("src/coinart-t2.js"));
  const files = [];
  const list = (dir) => { for (const n of readdirSync(new URL(dir, root))) { const rel = `${dir}${n}`; if (n === "node_modules" || n.startsWith(".")) continue; if (statSync(new URL(rel, root)).isDirectory()) list(`${rel}/`); else if (/\.(m?js|html|jsonc?)$/.test(n)) files.push(rel); } };
  for (const dir of ["src/", "public/", "scripts/"]) list(dir);
  files.push("wrangler.jsonc");
  const naming = files.filter((f) => /coinmeta-v2|coinart-t2/.test(text(f)));
  assert.deepEqual(naming.sort(), ["src/coinart-t2.js", "src/coinmeta-v2.js"]);
  for (const f of ["src/coinmeta-v2.js", "src/coinart-t2.js"]) {
    const src = text(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\bfetch\(|\benv\b|\.DB\b|Date\.now|new Date|Math\.random|console\.|import\(/, f);
    assert.deepEqual([...src.matchAll(/^import [^;]* from "([^"]+)";$/gm)].map((m) => m[1]).sort(),
      f === "src/coinmeta-v2.js" ? ["./coinart-t2.js", "./coinart.js", "./text.js"] : ["./coinart-metrics.js", "./coinart.js"], f);
  }
});

test("no existing module's output changed: the legacy coin JSON, default description, content v1, picture template, picture URLs and character ranges are what edabab5 gave", () => {
  const MINT0 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  const now = {};
  now.coinmeta = {
    VICINITY_BRAND: META.VICINITY_BRAND, MAX_NAME_BYTES: META.MAX_NAME_BYTES, MAX_SYMBOL_BYTES: META.MAX_SYMBOL_BYTES,
    metadataUriFor: META.metadataUriFor(MINT0), coinImageUrl: META.coinImageUrl(MINT0), coinPageUrl: META.coinPageUrl(MINT0),
    checkName: ["Utica", "", "a".repeat(33), "bad\nname", "São Paulo"].map((n) => META.checkName(n)),
    checkSymbol: ["UTICA", "utica", "ABCDEFGHIJK", ""].map((s) => META.checkSymbol(s)),
    json: [
      META.coinMetadataJson({ mint: MINT0, name: "Utica", symbol: "UTICA", city: { id: 5142056, name: "Utica", country: "US", ticker: "UTICA" } }),
      META.coinMetadataJson({ mint: MINT0, name: "Herāt", symbol: "HERAT", pitch: "  The old city of the west. ", city: { id: "1140026", name: "Herāt", country: "AF", region: "Herat", countryName: "Afghanistan", ticker: "HERAT" }, twitter: "https://x.com/example", telegram: "https://t.me/example" }),
      META.coinMetadataJson({ mint: MINT0, name: "Gibraltar", symbol: "GIBRALTAR", image: "https://vicinity.city/coin-meta/art/" + "a".repeat(64) + ".png", city: { id: 2411585, name: "Gibraltar", country: "GI", ticker: "GIBRALTAR" } }),
    ],
    versionJson: META.versionJson({ mint: MINT0, city_id: "5142056" }, { name: "Utica", symbol: "UTICA" }, { description: "The city coin of Utica, New York, United States.", art_sha256: "b".repeat(64), content: { city: { name: "Utica", country: "US", region: "New York", countryName: "United States" } } }),
  };
  now.coindefaults = {
    NAME_OVERRIDES: DEFS.NAME_OVERRIDES, DEFAULT_PAIR: DEFS.DEFAULT_PAIR, SOURCE: DEFS.SOURCE, DEFAULT_GATES: DEFS.DEFAULT_GATES,
    defaultDescription: [
      DEFS.defaultDescription({ name: "Utica", region: "New York", countryName: "United States" }),
      DEFS.defaultDescription({ name: "Gibraltar", region: null, countryName: "Gibraltar" }),
      DEFS.defaultDescription({ name: "São Paulo", region: "São Paulo", countryName: "Brazil" }),
      DEFS.defaultDescription({ name: "Bogotá", region: "Bogota D.C.", countryName: "Colombia" }),
    ],
  };
  const contents = [
    READY.canonicalContent({ city: { id: "5142056", name: "Utica", region: "New York", country: "US", countryName: "United States" }, name: "Utica", symbol: "UTICA", description: "The city coin of Utica, New York, United States.", artSha256: "c".repeat(64), templateVersion: "t1" }),
    READY.canonicalContent({ city: { id: 2411585, name: "Gibraltar", region: null, country: "GI", countryName: "Gibraltar" }, name: "Gibraltar", symbol: "GIBRALTAR", description: "The city coin of Gibraltar.", artSha256: "d".repeat(64), templateVersion: "t1", pair: "SOL" }),
    READY.canonicalContent({ city: { id: "1140026", name: "Herāt", region: "Herat", country: "AF", countryName: "Afghanistan" }, name: "Herāt", symbol: "HERAT", description: "The city coin of Herāt, Herat, Afghanistan.", artSha256: "e".repeat(64), templateVersion: "t1" }),
  ];
  now.coinready = { PREVIEW_LABEL: READY.PREVIEW_LABEL, canonicalContent: contents, contentHashes: contents.map(sha), versionLabel: READY.versionLabel(sha(contents[0])) };
  now.coinart = { TEMPLATES: ART.TEMPLATES, TEMPLATE_VERSION: ART.TEMPLATE_VERSION, FONT_SHA256: ART.FONT_SHA256, RESVG_VERSION: ART.RESVG_VERSION, ART_SIZE: ART.ART_SIZE,
    artText: ["Herāt", "Ḑaugavpils", "  São   Paulo ", "Straße", "北京"].map((n) => ART.artText(n)) };
  now.coinartStore = { artPath: STORE.artPath("f".repeat(64)), artUrl: STORE.artUrl("f".repeat(64)), READY_MIGRATION: STORE.READY_MIGRATION, APPROVED_MIGRATION: STORE.APPROVED_MIGRATION };
  now.text = { FORMAT_CHARS, BLANK_CHARS };
  const { t1Registry, recordedAt, ...was } = LEGACY;
  assert.match(recordedAt, /^edabab5 /);
  assert.equal(t1Registry.coins, 8033, "the t1 digest is checked in test/coinart-t2.test.js");
  assert.deepEqual(JSON.parse(JSON.stringify(now)), was);
});
