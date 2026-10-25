// Canonical city-coin metadata v2 (src/coinmeta-v2.js; Citycoin.dev master v5, stage S22, advances M01): the description's exact
// wording for SOL and non-SOL quotes, with and without a state or region; content v2, one per city version and the same for every quote
// (ids, attribution, list and normalization versions, the picture's source), its canonical JSON and SHA-256 (the schema's content_hash);
// per quote the description and the metadata JSON whose SHA-256 is the program's meta_hash; the brand constants of new-program coins
// against the master policy and PR #83 (test/fixtures/citycoin-curve-pr83.json); the Unicode 15.1 tables of cc-norm-1; golden vectors
// (test/fixtures/coinmeta-v2-golden.json). And the stage's promise: nothing is wired, and no existing module's output changes
// (test/fixtures/s22-legacy-outputs.json was recorded from edabab5). The review's findings have their own file, test/s22-s39-review.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as V2 from "../src/coinmeta-v2.js";
import { MASTER_POLICY } from "../src/masterpolicy.js";
import { POLICY } from "../src/policy.js";
import { BLANK_CHARS, FORMAT_CHARS } from "../src/text.js";
import * as META from "../src/coinmeta.js";
import * as DEFS from "../src/coindefaults.js";
import * as READY from "../src/coinready.js";
import * as ART from "../src/coinart.js";
import * as STORE from "../src/coinart-store.js";
import * as UNI from "../src/cc-unicode.js";

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
const { MetadataError, renderDescription, contentV2, canonicalJson, normalizeText, checkCoinName, checkCoinSymbol, quoteOf, buildCoinMetadataV2, buildPerQuote, metadataJsonV2, renderQuote, perQuoteJson, contentFromJson, describeContent, QUOTES, CC_COIN_BRAND } = V2;
const MINT = "CagvLF3JgZNBTUf6LrTg9ryFh7FsZbVoBaHVmoCnhBba"; // fake
const ART_SHA = "a".repeat(64); // fake
const LIST_SHA = sha(readFileSync(new URL("public/data/cities.json", root))); // the list version: the exact city list file's SHA-256
const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof MetadataError, String(e)); return e.code; } return null; };
const rejects = async (p, want) => { try { await p(); } catch (e) { assert.ok(e instanceof MetadataError, String(e)); assert.equal(e.code, want); return; } assert.fail(`expected ${want}`); };
const UTICA = { city: { id: "5142056", name: "Utica" }, region: { id: "US.NY", name: "New York" }, country: { id: "US", name: "United States" }, name: "Utica", symbol: "UTICA", listSha256: LIST_SHA, image: { sha256: ART_SHA, source: "template" }, mint: MINT };
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
  let n = 0, noRegion = 0, longNames = [], unreviewed = [];
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
    // the coin's own content: the registry name, or its short form where the name is over 32 bytes (src/coindefaults.js); a null region
    // only where no state or region applies (the three places of REGION_UNREVIEWED wait for the owner's review of their region)
    const base = { city: { id: String(r[0]), name: r[1] }, region: region === null ? null : { id: `${cc}.${r[2]}`, name: region }, country: { id: cc, name: country }, symbol: ticker, listSha256: LIST_SHA, image: { sha256: ART_SHA, source: "template" } };
    const why = code(() => contentV2({ ...base, name: r[1] }));
    if (why === "region_unreviewed") { unreviewed.push(String(r[0])); continue; }
    if (why === "name_too_long") longNames.push(String(r[0]));
    else assert.equal(contentV2({ ...base, name: r[1] }).name, normalizeText(r[1]));
    if (DEFS.NAME_OVERRIDES[r[0]]) assert.equal(contentV2({ ...base, name: DEFS.NAME_OVERRIDES[r[0]] }).name, DEFS.NAME_OVERRIDES[r[0]]);
  }
  assert.equal(n, 2 * 8030);
  assert.equal(noRegion, 29, "the list has no state or region for 29 registry places; each description says so");
  assert.deepEqual(unreviewed.sort(), Object.keys(V2.REGION_UNREVIEWED).sort(), "three of them have a region that applies: refused until the owner reviews it");
  assert.deepEqual(longNames.sort(), Object.keys(DEFS.NAME_OVERRIDES).sort(), "only the three long names are refused, and their short forms pass");
});

test("the region must be stated: null for none, never left out, never blank, never made up", async () => {
  assert.equal(code(() => renderDescription("Utica", undefined, "United States", "SOL", { symbol: "UTICA" })), "region_missing");
  assert.equal(code(() => renderDescription("Utica", "", "United States", "SOL", { symbol: "UTICA" })), "empty");
  assert.equal(code(() => renderDescription("Utica", " \n ", "United States", "SOL", { symbol: "UTICA" })), "empty");
  const { region, ...noRegion } = UTICA;
  assert.equal(code(() => contentV2(noRegion)), "region_missing");
  assert.equal(code(() => contentV2({ ...UTICA, region: { id: "CA.08", name: "Ontario" } })), "bad_id", "a region of another country");
  const c = contentV2({ ...UTICA, region: null });
  assert.equal(c.region, null);
  assert.match(describeContent(c, "SOL"), / City: Utica\. No state or region\. Country: United States\. /);
  assert.deepEqual((await metadataJsonV2(c, { mint: MINT, quote: "SOL" })).attributes[3], { trait_type: "State or region", value: "No state or region" });
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

test("golden vectors: one content per city version rendered for SOL and USDC (one mint), an approved upload, no state or region, non-ASCII, NFD input, an approved text, and a fake coin at every limit", async () => {
  assert.equal(GOLDEN.vectors.length, 8);
  assert.equal(GOLDEN.listSha256, LIST_SHA, "the list version of the real places is public/data/cities.json as it is");
  const byId = Object.fromEntries(GOLDEN.vectors.map((v) => [v.id, v]));
  for (const v of GOLDEN.vectors) {
    const r = await buildPerQuote(v.input, v.quotes.map((q) => q.quote));
    assert.equal(r.contentJson, v.contentJson, v.id);
    assert.equal(r.contentHash, v.contentHash, v.id);
    // the hashes again with Node's own SHA-256 over the UTF-8 bytes (an implementation the module does not use)
    assert.equal(sha(Buffer.from(v.contentJson, "utf8")), v.contentHash);
    assert.equal(V2.contentJson(contentFromJson(v.contentJson)), v.contentJson, `${v.id}: the stored content reads back to the same bytes`);
    assert.equal(r.perQuote.length, v.quotes.length);
    for (const [i, q] of v.quotes.entries()) {
      const p = r.perQuote[i];
      assert.equal(p.description, q.description, v.id);
      assert.equal(p.metadataJson, q.metadataJson, v.id);
      assert.equal(p.metaHash, q.metaHash, v.id);
      assert.equal(p.uri, q.uri, v.id);
      assert.equal(sha(Buffer.from(q.metadataJson, "utf8")), q.metaHash);
      const m = JSON.parse(q.metadataJson);
      assert.deepEqual(m, JSON.parse(JSON.stringify(p.metadata)));
      assert.equal(m.description, q.description);
      assert.equal(m.content.hash, v.contentHash, "the JSON names its content version: the same for every quote");
      assert.equal(q.uri, `https://citycoin.dev/coin-meta/v1/${v.input.mint}.json`);
      assert.equal(m.image, `https://citycoin.dev/coin-meta/v1/art/${v.input.image.sha256}.png`);
    }
  }
  // one version, two quotes: one content and one content hash; only the descriptions, the pair and the meta hashes differ; one mint
  const u = byId.utica;
  assert.deepEqual(u.quotes.map((q) => q.quote), ["SOL", "USDC"]);
  assert.equal(u.quotes[0].description.replace("/ SOL.", "/ USDC."), u.quotes[1].description);
  assert.notEqual(u.quotes[0].metaHash, u.quotes[1].metaHash);
  assert.equal(new Set(u.quotes.map((q) => q.uri)).size, 1);
  // the next version with an owner-approved upload: only the picture differs
  const up = byId["utica-upload"], a = JSON.parse(u.contentJson), b = JSON.parse(up.contentJson);
  assert.deepEqual({ ...a, image: null }, { ...b, image: null });
  assert.deepEqual([a.image.source, a.image.template, b.image.source, b.image.template], ["template", "t2", "upload", undefined]);
  assert.equal(up.input.mint, u.input.mint, "one city, one mint");
  // NFD and stray spaces in, NFC out: the same content as the composed input
  const nfd = byId["sao-paulo-nfd"];
  const composed = await buildCoinMetadataV2({ ...nfd.input, city: { id: "3448439", name: "São Paulo" }, region: { id: "BR.27", name: "São Paulo" }, country: { id: "BR", name: "Brazil" }, name: "São Paulo", quote: nfd.quotes[0].quote });
  assert.equal(composed.contentHash, nfd.contentHash);
  assert.ok(nfd.input.city.name !== "São Paulo" && nfd.contentJson.includes('"name":"São Paulo"') && !nfd.contentJson.includes("̃"));
  // the limits: a 32-byte name, a 10-character ticker, the largest city id, a 200-character text, a 44-byte country
  const lim = byId["limits-fake-spl"], lc = JSON.parse(lim.contentJson);
  assert.equal(Buffer.byteLength(lc.name, "utf8"), 32);
  assert.equal(lc.symbol.length, 10);
  assert.equal(lc.city.id, ((1n << 64n) - 2n).toString());
  assert.equal(lc.text.length, 200);
  assert.equal(Buffer.byteLength(lc.country.name, "utf8"), 44);
  assert.ok(lim.quotes[0].uri.length <= 200, "within Metaplex's 200-byte URI");
  const one = (patch) => code(() => contentV2({ ...lim.input, ...patch }));
  assert.equal(one({ name: "Sainte-Anne-des-Plaines-de-Lévis" }), "name_too_long", "33 bytes");
  assert.equal(one({ symbol: "GROSSGERAUX" }), "bad_symbol", "11 characters");
  assert.equal(one({ text: `${lc.text.slice(0, -1)}xx` }), "too_long", "201 characters");
  assert.equal(one({ city: { id: ((1n << 64n) - 1n).toString(), name: "X" } }), "bad_id", "u64::MAX");
  assert.equal(one({ region: { id: "GS.ABCDEFGHIJKLMNOPQRSTU", name: "X" } }), "bad_id", "a 21-character region code");
});

test("content v2: exactly these keys, the ids, the attribution, the list and normalization versions and the picture's source, no quote, deeply frozen, and the same bytes whatever the input key order", async () => {
  const c = contentV2(UTICA);
  assert.deepEqual(Object.keys(c).sort(), ["city", "country", "descriptionTemplate", "image", "list", "name", "norm", "region", "symbol", "text", "v"]);
  assert.equal(c.v, 2);
  assert.equal(c.norm, "cc-norm-1");
  assert.equal(V2.NORMALIZATION_UNICODE, "15.1");
  assert.equal(c.descriptionTemplate, "cc-desc-1");
  assert.deepEqual(c.list, { attribution: "GeoNames (geonames.org), CC BY 4.0", sha256: LIST_SHA });
  assert.deepEqual(c.city, { id: "5142056", name: "Utica" });
  assert.deepEqual(c.region, { id: "US.NY", name: "New York" });
  assert.deepEqual(c.country, { id: "US", name: "United States" });
  assert.deepEqual(c.image, { sha256: ART_SHA, source: "template", template: "t2" });
  assert.equal(c.text, "The city coin of Utica.", "the default lead is stored as the text (descriptive_text is NOT NULL)");
  assert.equal(V2.contentJson(contentV2({ ...UTICA, text: "The city coin of Utica." })), V2.contentJson(c), "the default's own words are the default");
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.city) && Object.isFrozen(c.region) && Object.isFrozen(c.image) && Object.isFrozen(c.list));
  assert.equal(contentV2({ ...UTICA, city: { name: "Utica", id: 5142056 } }).city.id, "5142056", "a numeric id is written as text");
  for (const quote of ["SOL", "USDC", { symbol: "CCTEST", mint: MINT }]) assert.equal(V2.contentJson(contentV2({ ...UTICA, quote })), V2.contentJson(c), "a quote never enters the content");
  const reversed = Object.fromEntries(Object.entries(UTICA).reverse());
  assert.equal(V2.contentJson(contentV2(reversed)), V2.contentJson(c));
  assert.equal(await V2.contentHash(c), sha(V2.contentJson(c)));
  assert.match(V2.contentJson(c), /^\{"city":\{"id":"5142056","name":"Utica"\},"country":\{"id":"US","name":"United States"\},"descriptionTemplate":"cc-desc-1","image":/);
  // refusals
  const bad = (patch, want) => assert.equal(code(() => contentV2({ ...UTICA, ...patch })), want, JSON.stringify(patch));
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
  bad({ image: { sha256: "A".repeat(64), source: "template" } }, "bad_sha256");
  bad({ image: undefined }, "missing");
  bad({ image: { sha256: ART_SHA } }, "bad_image_source");
  bad({ image: { sha256: ART_SHA, source: "template", template: "t1" } }, "bad_image_source");
  bad({ image: { sha256: ART_SHA, source: "upload", template: "t2" } }, "bad_image_source");
  bad({ listSha256: undefined }, "bad_sha256");
  bad({ listSha256: "x" }, "bad_sha256");
  bad({ attribution: "" }, "empty");
  bad({ text: "Trade it against SOL" }, "text_names_quote");
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

test("cc-norm-1's Unicode 15.1 tables (src/cc-unicode.js): 149,813 assigned code points (Unicode 15.1's published total), all known to this runtime; the marks and the letters and digits of 15.1; what a newer Unicode added is refused", () => {
  const count = (t) => t.reduce((n, [a, b]) => n + b - a + 1, 0);
  assert.equal(UNI.UNICODE_VERSION, "15.1");
  assert.deepEqual([count(UNI.ASSIGNED), count(UNI.MARK), count(UNI.LETTER_NUMBER)], [149813, 2450, 138557]);
  for (const t of [UNI.ASSIGNED, UNI.MARK, UNI.LETTER_NUMBER]) for (let i = 1; i < t.length; i++) assert.ok(t[i][0] > t[i - 1][1] + 1, "sorted, disjoint ranges");
  const assigned = /^(?![\p{Cc}\p{Cs}\p{Co}])\p{Assigned}$/u, mark = /^\p{M}$/u, ln = /^[\p{L}\p{N}]$/u;
  let notHere = 0, markDiff = 0, lnDiff = 0;
  for (const [a, b] of UNI.ASSIGNED) for (let c = a; c <= b; c++) {
    const ch = String.fromCodePoint(c);
    if (!assigned.test(ch)) notHere++;
    if (mark.test(ch) !== UNI.inTable(UNI.MARK, c)) markDiff++;
    if (ln.test(ch) !== UNI.inTable(UNI.LETTER_NUMBER, c)) lnDiff++;
  }
  assert.deepEqual([notHere, markDiff, lnDiff], [0, 0, 0], `this runtime (Unicode ${process.versions.unicode}) agrees on every 15.1 code point`);
  for (const t of [UNI.MARK, UNI.LETTER_NUMBER]) for (const [a, b] of t) for (let c = a; c <= b; c++) assert.ok(UNI.inTable(UNI.ASSIGNED, c));
  // the code points whose NFC order Unicode 16.0 changed (they are new in 16.0): refused, so no text's bytes depend on the runtime
  for (const c of [0x113ce, 0x113cf, 0x113d0, 0x1612f, 0x1e5ef]) {
    assert.equal(UNI.inTable(UNI.ASSIGNED, c), false);
    assert.equal(code(() => normalizeText(`x\u0301${String.fromCodePoint(c)}`)), "unassigned_character", c.toString(16));
  }
  // on a Unicode 15.1 runtime the generator writes the committed file again, byte for byte
  if (process.versions.unicode === "15.1") {
    const dir = mkdtempSync(join(tmpdir(), "cc-unicode-"));
    try {
      const out = join(dir, "cc-unicode-check.js");
      execFileSync(process.execPath, [new URL("../scripts/cc-unicode-table.mjs", import.meta.url).pathname, out]);
      assert.equal(readFileSync(out, "utf8"), text("src/cc-unicode.js"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
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

test("per quote: one content and one content hash for the city version, one description, JSON and meta hash for each allowed quote; per_quote_json keyed by quote config; a quote twice, no quote, the coin as its own quote or a quote's mint as the coin are refused", async () => {
  const all = await buildPerQuote(UTICA, ["SOL", "USDC", { symbol: "CCTEST", mint: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" }]);
  assert.equal(all.perQuote.length, 3);
  assert.equal(all.contentHash, sha(all.contentJson));
  assert.equal(all.contentHash, (await buildCoinMetadataV2({ ...UTICA, quote: "USDC" })).contentHash, "the content hash does not depend on the quote");
  assert.equal(new Set(all.perQuote.map((r) => r.metaHash)).size, 3);
  assert.equal(new Set(all.perQuote.map((r) => r.uri)).size, 1, "one coin, one URI: the launch binds the quote's JSON by its hash");
  assert.deepEqual(all.perQuote.map((r) => r.quote.symbol), ["SOL", "USDC", "CCTEST"]);
  for (const r of all.perQuote) {
    assert.ok(r.metadataJson.includes(`"value":"$UTICA / ${r.quote.symbol}"`));
    assert.ok(r.description.includes(`Pair: $UTICA / ${r.quote.symbol}. `));
    assert.equal(JSON.parse(r.metadataJson).content.hash, all.contentHash);
  }
  // per_quote_json: {quote_config_id: {description, metadata_json_sha256}} (the policy's SOL config is 0; a FAKE id for USDC here)
  assert.equal(P.quote_configs.sol.config_id, 0);
  const keyed = await buildPerQuote(UTICA, [{ ...QUOTES.SOL, configId: 0 }, { ...QUOTES.USDC, configId: 7 }]);
  const pq = JSON.parse(perQuoteJson(keyed.perQuote));
  assert.deepEqual(Object.keys(pq), ["0", "7"]);
  assert.deepEqual(pq["0"], { description: keyed.perQuote[0].description, metadata_json_sha256: keyed.perQuote[0].metaHash });
  assert.equal(perQuoteJson(keyed.perQuote), canonicalJson(pq));
  assert.equal(keyed.perQuote[0].metaHash, all.perQuote[0].metaHash, "the config id never enters the metadata JSON");
  assert.equal(code(() => perQuoteJson(all.perQuote)), "no_config_id");
  assert.equal(code(() => perQuoteJson([])), "no_quotes");
  assert.equal(code(() => perQuoteJson([{ ...keyed.perQuote[0] }])), "not_rendered", "only renderQuote's own results");
  const other = await buildPerQuote({ ...UTICA, text: "Another version" }, [{ ...QUOTES.USDC, configId: 7 }]);
  assert.equal(code(() => perQuoteJson([keyed.perQuote[0], other.perQuote[0]])), "not_rendered", "all of one content");
  assert.equal(code(() => perQuoteJson([keyed.perQuote[0], keyed.perQuote[0]])), "duplicate_config_id");
  assert.equal(code(() => quoteOf({ ...QUOTES.SOL, configId: -1 })), "bad_config_id");
  assert.equal(code(() => quoteOf({ ...QUOTES.SOL, configId: 1.5 })), "bad_config_id");
  assert.equal(code(() => { throw new MetadataError("x", "y"); }), "x");
  await rejects(() => buildPerQuote(UTICA, ["SOL", { symbol: "SOL", mint: QUOTES.SOL.mint }]), "duplicate_quote");
  await rejects(() => buildPerQuote(UTICA, []), "no_quotes");
  await rejects(() => buildCoinMetadataV2({ ...UTICA, quote: { symbol: "CCTEST", mint: MINT } }), "own_quote");
  await rejects(() => buildCoinMetadataV2({ ...UTICA, mint: QUOTES.USDC.mint, quote: "SOL" }), "bad_mint");
  await rejects(() => buildCoinMetadataV2({ ...UTICA, mint: "not a mint", quote: "SOL" }), "bad_mint");
  await rejects(() => metadataJsonV2({ v: 1 }, { mint: MINT, quote: "SOL" }), "not_content_v2");
  await rejects(() => renderQuote(JSON.parse(all.contentJson), "SOL", { mint: MINT }), "not_content_v2");
  await rejects(() => buildCoinMetadataV2({ ...UTICA, quote: "USDC", text: "Paired with CCTEST" }).then(() => buildCoinMetadataV2({ ...UTICA, text: "Paired with CCTEST", quote: { symbol: "CCTEST", mint: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" } })), "text_names_quote");
  // a stored canonical_json reads back only as the exact bytes contentV2 writes
  const back = contentFromJson(all.contentJson);
  assert.equal(V2.contentJson(back), all.contentJson);
  assert.equal((await renderQuote(back, "SOL", { mint: MINT })).metaHash, all.perQuote[0].metaHash);
  assert.equal(code(() => contentFromJson(all.contentJson.replace('"v":2', '"v":2 '))), "not_canonical");
  assert.equal(code(() => contentFromJson(all.contentJson.replace('"cc-desc-1"', '"cc-desc-2"'))), "not_canonical", "another template is another version");
  assert.equal(code(() => contentFromJson(all.contentJson.replace('"template":"t2"', '"template":"t1"'))), "bad_image_source");
  assert.equal(code(() => contentFromJson(all.contentJson.replace("The city coin of Utica.", "Trade it for SOL"))), "text_names_quote", "a stored text is checked again");
  assert.equal(code(() => contentFromJson("{")), "not_json");
  assert.equal(code(() => contentFromJson("[]")), "not_content_v2");
});

/* ------------------------------------------------------------------ the stage's promise: not wired, and no existing output changes */

test("not wired: no Worker path reaches src/coinmeta-v2.js, src/coinart-t2.js or src/cc-unicode.js, no page or script names them, and they read no setting, clock, network or database", () => {
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
  assert.ok(!seen.has("src/coinmeta-v2.js") && !seen.has("src/coinart-t2.js") && !seen.has("src/cc-unicode.js"));
  const files = [];
  const list = (dir) => { for (const n of readdirSync(new URL(dir, root))) { const rel = `${dir}${n}`; if (n === "node_modules" || n.startsWith(".")) continue; if (statSync(new URL(rel, root)).isDirectory()) list(`${rel}/`); else if (/\.(m?js|html|jsonc?)$/.test(n)) files.push(rel); } };
  for (const dir of ["src/", "public/", "scripts/"]) list(dir);
  files.push("wrangler.jsonc");
  // the table generator and the table it wrote name the module in their comments only (the generator is an owner-side script, never run by the site)
  const naming = files.filter((f) => /coinmeta-v2|coinart-t2|cc-unicode/.test(text(f)));
  assert.deepEqual(naming.sort(), ["scripts/cc-unicode-table.mjs", "src/cc-unicode.js", "src/coinart-t2.js", "src/coinmeta-v2.js"]);
  for (const f of ["src/coinmeta-v2.js", "src/coinart-t2.js", "src/cc-unicode.js"]) {
    const src = text(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\bfetch\(|\benv\b|\.DB\b|Date\.now|new Date|Math\.random|console\.|import\(/, f);
    assert.deepEqual([...src.matchAll(/^import [^;]* from "([^"]+)";$/gm)].map((m) => m[1]).sort(),
      { "src/coinmeta-v2.js": ["./cc-unicode.js", "./coinart-t2.js", "./coinart.js", "./text.js"], "src/coinart-t2.js": ["./coinart-metrics.js", "./coinart.js"], "src/cc-unicode.js": [] }[f], f);
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
