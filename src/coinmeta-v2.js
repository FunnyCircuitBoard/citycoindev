/**
 * Canonical city-coin metadata, version 2, for coins of the NEW program (citycoin_curve, PR #83): Citycoin.dev master v5, stage S22
 * (WP-07 section 24, section 25 "Exact state and consistency rules", M01 of section 40). Pure: no route, no D1, no fetch, no clock, no
 * randomness, no setting. No Worker path imports this file (test/coinmeta-v2.test.js walks the Worker's import graph), so the live site
 * is unchanged. S24 (requests), S25 (owner inbox), S26 (launch center), S27 (permanent endpoints) and S41 (launch) wire it.
 *
 * LEGACY IS UNTOUCHED. Coins of the old launchpad keep src/coinmeta.js (their /coin-meta/<mint>.json), src/coindefaults.js (their
 * default description) and src/coinready.js canonicalContent (content v1), byte for byte; test/coinmeta-v2.test.js compares their
 * outputs with the ones recorded at edabab5.
 *
 * Two layers, as the merged S08 schema has them (table city_metadata_versions; docs/citycoin-master/schema-and-api.md 3.5):
 *
 *   1. Content v2, ONE per city version, pair-independent: contentV2(input) / contentJson / contentHash / contentFromJson
 *        { v: 2, norm: "cc-norm-1", list: { attribution, sha256 }, city: { id, name }, region: { id, name } | null,
 *          country: { id, name }, name, symbol, text, descriptionTemplate: "cc-desc-1", image }
 *      The canonical ids (city: GeoNames id; region: the list's "CC.ADM1" code; country: ISO 3166-1 alpha-2), the names, the list's
 *      attribution and the SHA-256 of the exact city list file the place came from (the list version), the normalization version,
 *      the coin's name and ticker, the descriptive text, the description template and the picture. Its canonical JSON is the row's
 *      canonical_json and its SHA-256 the row's content_hash: what the owner approves before any pair is chosen (section 25), the
 *      same for every quote. `text` is never null (descriptive_text is NOT NULL): the approved descriptive text, or for a default
 *      the default lead "The city coin of <city>." (the live default's words, src/coinmeta.js and src/coindefaults.js). `image`
 *      says where the picture came from: { sha256, source: "template", template: "t2" } for the generated coin art (src/coinart-t2.js),
 *      or { sha256, source: "upload" } for an owner-approved upload (city_metadata_uploads.normalized_sha256, sections 25 and 40).
 *      `region` null means the list has no state or region for the place, which renders "No state or region."; never made up.
 *
 *   2. Per quote, rendered from a content and one allowed quote: renderQuote(content, quote, { mint }) / metadataJsonV2 /
 *      buildCoinMetadataV2 / buildPerQuote / perQuoteJson
 *      The description (template cc-desc-1, below), the metadata JSON served write-once at
 *      https://citycoin.dev/coin-meta/v1/<mint>.json and its SHA-256: the program's meta_hash (curve:CITYCOIN-CURVE-DESIGN.md:415,
 *      "SHA-256 of the exact metadata JSON the website will serve at the coin's URI"), which a launch binds with the quote config
 *      (section 25). perQuoteJson gives the row's per_quote_json, {quote_config_id: {description, metadata_json_sha256}}. The mint
 *      is an input: the program derives one mint per city (curve:sdk/curve/pda.mjs coinAccounts), the same for every quote.
 *
 * Only contents made here are accepted downstream (review finding SEC-3): metadataJsonV2 and renderQuote take a content that contentV2
 * or contentFromJson returned (deeply frozen and registered), never an object assembled elsewhere, and compute its hash themselves.
 * contentFromJson re-reads a stored canonical_json by building it again and requiring the same bytes.
 *
 * The description (template cc-desc-1), per quote:
 *     <lead> City: <city>. State or region: <region>. Country: <country>. Pair: $<TICKER> / <QUOTE>. Launched on Citycoin.dev
 *     (https://citycoin.dev) on Solana.
 *   <lead> is the content's text. A place with no state or region reads "No state or region." in that field. The pair is the SELECTED
 *   quote's symbol, written as the site writes a pair ("Pair: $UTICA / SOL", public/launchpad.js pairText), so a USDC coin can never
 *   say SOL (section 25). Each field ends with one full stop (a name that already ends with one, "Bogota D.C.", keeps it).
 *
 * The approved descriptive text serves every allowed quote, so it may not name a quote, carry a link, an address or markup. The checks
 * run on the text as written and on a folded form (review finding SEC-4): compatibility forms (fullwidth, mathematical letters) to
 * their plain letters, diacritics dropped, a pinned set of look-alike letters (Cyrillic, Greek, Latin small capitals, Lisu) read as the
 * Latin ones, lower case, then split into words. Refused: SOL, WSOL, USDC, USDT, SOLANA and the selected quote's symbol as a word, or
 * spelled out letter by letter ("S O L", "S.O.L."), with 0, 1 and 5 read as o, l and s inside a word; a place's own name never counts
 * ("Costa del Sol"). Links also with full-width, ideographic or leader dots and "[.]"; an address also when split by spaces into mixed
 * chunks; "<" and ">" (review finding SEC-7). What these checks cannot see (any other look-alike, a paraphrase) is the owner's review.
 *
 * Canonical JSON (contentJson and the metadata JSON text): RFC 8785 (JCS) restricted to null, booleans, safe integers, strings, arrays
 * and plain objects. Object keys sorted by UTF-16 code units at every level, no insignificant whitespace, strings escaped as JSON.stringify does
 * (non-ASCII written as UTF-8, not \u escapes); anything else (a fraction, undefined, a lone surrogate, a sparse array, a class
 * instance) is refused, never dropped. The hash is SHA-256 over the UTF-8 bytes, lower-case hex. JSON text does not escape "<", ">" or
 * "&": a consumer shows the description as text (S27 serves the JSON as application/json with nosniff and never inlines it in HTML).
 *
 * Text normalization cc-norm-1 (every string that enters content or metadata), pinned to Unicode 15.1 (review finding SF-3):
 *   a well-formed string whose every code point is assigned in Unicode 15.1 (src/cc-unicode.js, generated by
 *   scripts/cc-unicode-table.mjs; and known to the runtime); Unicode NFC; every run of ASCII whitespace (tab, line feed, vertical tab,
 *   form feed, carriage return, space) becomes one space, none at either end; then refused if empty, or holding a control character
 *   (Cc), an invisible character or a blank character other than U+0020 (src/text.js FORMAT_CHARS and BLANK_CHARS, the program's
 *   is_format_char and is_blank_char), a private-use code point, a noncharacter or unassigned code point, U+FFFC or U+FFFD, a combining
 *   mark at the start or after a space, or more than 4 combining marks in a row (review finding SEC-6). Because only Unicode 15.1
 *   code points pass, the NFC form is the same on every runtime with Unicode 15.1 or later (Unicode's normalization stability policy);
 *   an older runtime refuses (runtime_unicode_too_old) rather than give other bytes. Normalizing twice changes nothing. A later rule is
 *   a new version name, never an edit of this one (cc-norm-1 took its final form in the S22 review, before any coin carried it).
 *
 * Name and ticker rules for new-program coins (the program refuses anything else at launch):
 *   name    1 to 32 UTF-8 bytes, in cc-norm-1 form (curve:programs/citycoin-curve/src/helpers.rs:39 check_name; MAX_NAME_LEN 32,
 *           curve:sdk/curve/constants.mjs:72). Never cut to fit: a longer name is refused (src/coindefaults.js NAME_OVERRIDES is
 *           where the three long registry names get their short forms).
 *   symbol  1 to 10 of A-Z and 0-9 (helpers.rs:112 check_symbol; MAX_SYMBOL_LEN 10, constants.mjs:73): the registry ticker.
 *
 * Places whose list entry has no state or region although one applies (REGION_UNREVIEWED; review finding SF-4) are refused with a null
 * region until the owner reviews their region; the other places with none (city-states, territories) render "No state or region.".
 *
 * Brand constants (CC_COIN_BRAND): persistent identifiers of new-program coins, which never follow the BRAND setting (src/brand.js;
 * the same rule as the legacy coin JSON's brand, VICINITY_BRAND in src/coinmeta.js), because they are hashed into immutable metadata.
 * The product name and origin are the master policy's (docs/citycoin-master/policy.json pairs_and_branding: "Citycoin.dev",
 * "https://citycoin.dev"); the metadata prefix is the program's (curve:sdk/curve/constants.mjs:71 and
 * curve:programs/citycoin-curve/src/constants.rs:217, "https://citycoin.dev/coin-meta/v1/"); the picture layout
 * (<prefix>art/<sha256>.png) is this stage's, the legacy one (/coin-meta/art/<sha256>.png, src/coinart-store.js artPath) under the
 * versioned prefix. S27 serves both.
 */
import { BLANK_CHARS, FORMAT_CHARS } from "./text.js";
import { sha256Hex } from "./coinart.js";
import { T2 } from "./coinart-t2.js";
import { ASSIGNED, LETTER_NUMBER, MARK, UNICODE_VERSION, inTable } from "./cc-unicode.js";

export const CONTENT_VERSION = 2;
export const NORMALIZATION_VERSION = "cc-norm-1";
export const NORMALIZATION_UNICODE = UNICODE_VERSION;
export const DESCRIPTION_TEMPLATE = "cc-desc-1";

export const CC_COIN_BRAND = Object.freeze({
  productName: "Citycoin.dev",
  site: "https://citycoin.dev",
  network: "Solana",
  metadataPrefix: "https://citycoin.dev/coin-meta/v1/",
  artPrefix: "https://citycoin.dev/coin-meta/v1/art/",
  artTemplate: T2.version,
});
export const MAX_NAME_BYTES = 32;
export const MAX_SYMBOL_BYTES = 10;
/** The approved descriptive text: at most 200 UTF-16 code units, as the founder's pitch today (src/policy.js coins.pitchMax). */
export const MAX_TEXT_LENGTH = 200;
/** A place name (city, state or region, country): the list's longest is 44 bytes; this bound only refuses nonsense. */
export const MAX_PLACE_LENGTH = 100;
/** Combining marks in a row that cc-norm-1 accepts (after NFC). */
export const MAX_COMBINING_MARKS = 4;
/** The city list's own attribution (public/data/cities.json "source"). */
export const PLACE_ATTRIBUTION = "GeoNames (geonames.org), CC BY 4.0";
/** Where a coin's picture came from: the generated coin art of CC_COIN_BRAND.artTemplate, or an owner-approved upload. */
export const IMAGE_SOURCES = Object.freeze(["template", "upload"]);

/**
 * The quotes the master names with a known mint (section 16 "Pairs and branding": SOL and USDC; the master policy's quote_configs sol and
 * usdc). A third, the main token, is passed in as { symbol, mint } only once MAIN_TOKEN_MINT is verified (owner amendment 01); its
 * symbol is read from the chain then. Never a legacy mint. A quote object may carry its quote config id ({ symbol, mint, configId }),
 * which per_quote_json is keyed by; it never enters the metadata JSON.
 */
export const QUOTES = Object.freeze({
  SOL: Object.freeze({ symbol: "SOL", mint: "So11111111111111111111111111111111111111112" }),
  USDC: Object.freeze({ symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }),
});
/** $VICINITY, a legacy token since owner amendment 01: never a quote (policy legacy_tokens never_used_for main_token_quote). */
export const LEGACY_QUOTE_MINTS = Object.freeze(["2aVkhRfAEm44tMhFo8oamWvumGGvweFqnUwukRMBkray"]);
// symbols another quote may not borrow: a listed quote's own (any letter case), wrapped SOL's, and the legacy token's
const RESERVED_QUOTE_SYMBOLS = Object.freeze({ SOL: QUOTES.SOL.mint, WSOL: QUOTES.SOL.mint, USDC: QUOTES.USDC.mint, VICINITY: null });
/** Words the approved descriptive text may not use (it serves every quote; the pair is the mandatory field), besides the selected quote's symbol. */
export const REFUSED_TEXT_WORDS = Object.freeze(["SOL", "WSOL", "USDC", "USDT", "SOLANA"]);
/**
 * Registry places whose list entry has no state or region although the country has one that applies (review finding SF-4): refused
 * with a null region until the owner reviews the region (an open owner review, docs/citycoin-master/implementation-report.md section 10).
 */
export const REGION_UNREVIEWED = Object.freeze({ "13608003": "Chongming, China", "11048860": "Chagni, Ethiopia", "2377450": "Nouakchott, Mauritania" });

export const metadataUri = (mint) => `${CC_COIN_BRAND.metadataPrefix}${mint}.json`;
export const artUrl = (sha256) => `${CC_COIN_BRAND.artPrefix}${sha256}.png`;
export const coinPageUrl = (mint) => `${CC_COIN_BRAND.site}/coin?mint=${mint}`;

/** A refusal with a stable code (and the field it concerns), never a partial result. */
export class MetadataError extends Error {
  constructor(code, field) {
    super(`${field}: ${code}`);
    this.name = "MetadataError";
    this.code = code;
    this.field = field;
  }
}
const fail = (code, field) => { throw new MetadataError(code, field); };

/* ---------------------------------------------------------------- normalization cc-norm-1 */
const inRanges = (c, ranges) => ranges.some(([lo, hi]) => c >= lo && c <= hi);
/** No lone surrogate (a string that UTF-8 cannot carry exactly). */
function wellFormed(s) {
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u >= 0xd800 && u <= 0xdbff) {
      const v = s.charCodeAt(i + 1);
      if (!(v >= 0xdc00 && v <= 0xdfff)) return false;
      i++;
    } else if (u >= 0xdc00 && u <= 0xdfff) return false;
  }
  return true;
}
const ASCII_SPACE_CONTROLS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d]);
const RUNTIME_ASSIGNED = /\p{Assigned}/u;
const privateUse = (c) => (c >= 0xe000 && c <= 0xf8ff) || (c >= 0xf0000 && c <= 0xffffd) || (c >= 0x100000 && c <= 0x10fffd);
/** Why a string is not acceptable (on the raw input, ASCII whitespace is still allowed), or null. */
function charProblem(s, raw) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (raw && ASCII_SPACE_CONTROLS.has(c)) continue;
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return "control_character";
    if (inRanges(c, FORMAT_CHARS)) return "invisible_character";
    if (inRanges(c, BLANK_CHARS)) return "blank_character";
    if (privateUse(c)) return "private_use";
    if (c === 0xfffc || c === 0xfffd) return "replacement_character";
    if (!inTable(ASSIGNED, c)) return "unassigned_character"; // noncharacters and code points newer than Unicode 15.1 included
    if (!RUNTIME_ASSIGNED.test(ch)) return "runtime_unicode_too_old";
  }
  return null;
}
/** A combining mark at the start or after a space, or more than MAX_COMBINING_MARKS in a row; else null. */
function markProblem(s) {
  let run = 0, base = -1;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (inTable(MARK, c)) {
      if (base === -1 || base === 0x20) return "leading_mark";
      if (++run > MAX_COMBINING_MARKS) return "too_many_marks";
    } else { run = 0; base = c; }
  }
  return null;
}
/** The cc-norm-1 form of `value` (see the header), or a MetadataError naming `field`. */
export function normalizeText(value, field = "text", { max = Infinity } = {}) {
  if (typeof value !== "string") fail("not_text", field);
  if (!wellFormed(value)) fail("not_well_formed", field);
  const before = charProblem(value, true); // before NFC: a code point newer than 15.1 must never be decomposed away by a newer runtime
  if (before) fail(before, field);
  const s = value.normalize("NFC").replace(/[\t\n\v\f\r ]+/g, " ").replace(/^ /, "").replace(/ $/, "");
  if (!s) fail("empty", field);
  const bad = charProblem(s, false) || markProblem(s);
  if (bad) fail(bad, field);
  if (s.length > max) fail("too_long", field);
  return s;
}

/* ---------------------------------------------------------------- names, tickers, ids */
const utf8Len = (s) => new TextEncoder().encode(s).length;
/** null when a new-program coin may carry this name (already in cc-norm-1 form, 1 to 32 bytes), else the reason. */
export function checkCoinName(name) {
  if (typeof name !== "string") return "not_text";
  let n;
  try { n = normalizeText(name, "name"); } catch (e) { return e.code; }
  if (n !== name) return "not_normalized";
  if (utf8Len(name) > MAX_NAME_BYTES) return "name_too_long";
  return null;
}
/** null when the program accepts the ticker (1 to 10 of A-Z0-9), else the reason. */
export const checkCoinSymbol = (symbol) => (typeof symbol === "string" && /^[A-Z0-9]{1,10}$/.test(symbol) ? null : "bad_symbol");

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const U64_LAST = (1n << 64n) - 2n;
/** A GeoNames city id as its decimal text: 1 to 2^64 - 2 (the program's u64 city id; src/coinreview.js cityIdOk). */
function cityIdOf(id) {
  const s = typeof id === "number" && Number.isSafeInteger(id) ? String(id) : id;
  if (typeof s !== "string" || !/^[1-9][0-9]{0,19}$/.test(s) || BigInt(s) > U64_LAST) fail("bad_id", "city.id");
  return s;
}
const countryIdOf = (id) => (typeof id === "string" && /^[A-Z]{2}$/.test(id) ? id : fail("bad_id", "country.id"));
/** The list's region key: "<country>.<ADM1 code>" (public/data/cities.json "admin"), of this country. */
const regionIdOf = (id, countryId) => (typeof id === "string" && /^[A-Z]{2}\.[0-9A-Z]{1,20}$/.test(id) && id.startsWith(`${countryId}.`) ? id : fail("bad_id", "region.id"));
const placeName = (v, field) => normalizeText(v, field, { max: MAX_PLACE_LENGTH });
const sha256Of = (v, field) => (typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : fail("bad_sha256", field));

/**
 * A quote, checked: "SOL", "USDC" or { symbol, mint, configId? }. A listed quote's symbol only with its mint, and its mint only with its
 * symbol. `configId`, when given, is the quote config's id (a whole number from 0).
 */
export function quoteOf(quote) {
  const q = typeof quote === "string" ? (Object.hasOwn(QUOTES, quote) ? QUOTES[quote] : fail("unknown_quote", "quote")) : quote;
  if (!q || typeof q !== "object") fail("unknown_quote", "quote");
  const { symbol, mint, configId = null } = q;
  if (typeof symbol !== "string" || !/^[A-Za-z0-9]{1,10}$/.test(symbol)) fail("bad_quote_symbol", "quote.symbol");
  if (typeof mint !== "string" || !BASE58.test(mint)) fail("bad_quote_mint", "quote.mint");
  if (LEGACY_QUOTE_MINTS.includes(mint)) fail("legacy_quote", "quote.mint");
  if (configId !== null && !(Number.isSafeInteger(configId) && configId >= 0)) fail("bad_config_id", "quote.configId");
  const upper = symbol.toUpperCase();
  // a reserved symbol (any letter case) only on its own mint, and a listed mint only under its exact symbol ("sol" or "WSOL" on SOL's mint too)
  if (Object.hasOwn(RESERVED_QUOTE_SYMBOLS, upper) && RESERVED_QUOTE_SYMBOLS[upper] !== mint) fail("quote_mismatch", "quote");
  for (const k of Object.values(QUOTES)) if (k.mint === mint && k.symbol !== symbol) fail("quote_mismatch", "quote");
  return Object.freeze(configId === null ? { symbol, mint } : { symbol, mint, configId });
}

/* ---------------------------------------------------------------- the approved descriptive text */
const sentence = (s) => (/[.!?…]$/u.test(s) ? s : `${s}.`);
/** The lead of a default (no approved text): the live default's words (src/coinmeta.js, src/coindefaults.js). */
const defaultLead = (city) => `The city coin of ${sentence(city)}`;
const LINKISH = /https?:|www\.|\.[a-z]{2,}(\/|\b)/i; // src/coins.js and src/coinreview.js: the founder's link rule
const ADDRESSISH = /[1-9A-HJ-NP-Za-km-z]{32,44}/; // src/coinmeta.js PITCH_BAD: no address in a coin's words
// look-alike letters read as Latin (a pinned subset of Unicode's confusables, UTS #39, for the Latin letters), applied before lower case
const CONFUSABLE = new Map(Object.entries({
  // Cyrillic
  А: "a", а: "a", В: "b", в: "b", С: "c", с: "c", Ԁ: "d", ԁ: "d", Е: "e", е: "e", Һ: "h", һ: "h", Н: "h", н: "h", І: "i", і: "i", Ј: "j", ј: "j",
  К: "k", к: "k", Ӏ: "l", ӏ: "l", М: "m", м: "m", п: "n", О: "o", о: "o", Р: "p", р: "p", Ԛ: "q", ԛ: "q", Ѕ: "s", ѕ: "s", Т: "t", т: "t",
  Ԝ: "w", ԝ: "w", Х: "x", х: "x", У: "y", у: "y", Ү: "y", ү: "y",
  // Greek
  Α: "a", α: "a", Β: "b", β: "b", Ϲ: "c", ϲ: "c", Ε: "e", ε: "e", Η: "h", η: "n", Ι: "i", ι: "i", Ϳ: "j", ϳ: "j", Κ: "k", κ: "k", Μ: "m",
  Ν: "n", ν: "v", Ο: "o", ο: "o", Ρ: "p", ρ: "p", Τ: "t", τ: "t", Υ: "y", υ: "u", Χ: "x", χ: "x", ω: "w", Ζ: "z",
  // Latin small capitals and letter forms
  ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ɢ: "g", ʜ: "h", ɪ: "i", ı: "i", ᴊ: "j", ȷ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p",
  ʀ: "r", ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z", ɑ: "a", ɡ: "g",
  // Lisu
  ꓮ: "a", ꓐ: "b", ꓚ: "c", ꓓ: "d", ꓰ: "e", ꓝ: "f", ꓖ: "g", ꓧ: "h", ꓲ: "i", ꓙ: "j", ꓗ: "k", ꓡ: "l", ꓟ: "m", ꓠ: "n", ꓳ: "o", ꓑ: "p",
  ꓣ: "r", ꓢ: "s", ꓔ: "t", ꓴ: "u", ꓦ: "v", ꓪ: "w", ꓫ: "x", ꓬ: "y", ꓜ: "z",
}));
// dots that read as a full stop in a link (after the compatibility step, which already turns "．", "․" and "﹒" into ".")
const DOTS = new Map([["。", "."], ["｡", "."], ["︒", "."]]);
const noMarks = (s) => { let o = ""; for (const ch of s) if (!inTable(MARK, ch.codePointAt(0))) o += ch; return o; };
/** The folded form the guards read: compatibility forms, no diacritics, look-alikes as Latin, lower case. */
function fold(t) {
  let o = "";
  for (const ch of noMarks(t.normalize("NFKD"))) o += CONFUSABLE.get(ch) ?? DOTS.get(ch) ?? ch;
  return noMarks(o.toLowerCase().normalize("NFKD"));
}
const DIGIT_LETTERS = { 0: "o", 1: "l", 5: "s" };
/** Words of a folded text (runs of letters and digits, Unicode 15.1), with 0, 1 and 5 read as letters inside a word that has a letter. */
function words(folded) {
  const out = [];
  let cur = "";
  for (const ch of `${folded} `) {
    if (inTable(LETTER_NUMBER, ch.codePointAt(0))) { cur += ch; continue; }
    if (cur) out.push(/[a-z]/.test(cur) ? cur.replace(/[015]/g, (d) => DIGIT_LETTERS[d]) : cur);
    cur = "";
  }
  return out;
}
/** `list` with every run equal to `seq` replaced by one null (a break no spelled-out word may cross). */
function cut(list, seq) {
  const out = [];
  for (let i = 0; i < list.length;) {
    if (seq.length && seq.every((w, k) => list[i + k] === w)) { out.push(null); i += seq.length; } else out.push(list[i++]);
  }
  return out;
}
/** Does the text name one of `refused` (folded words) as a word or spelled out letter by letter, outside the places' own names? */
function namesRefused(text, places, refused) {
  let list = words(fold(text));
  for (const p of places) if (p) list = cut(list, words(fold(p)));
  if (list.some((w) => w !== null && refused.has(w))) return true;
  let run = "";
  for (const w of [...list, null]) {
    if (w !== null && [...w].length === 1) { run += w; continue; }
    if (run.length >= 2 && [...refused].some((r) => run.includes(r))) return true;
    run = "";
  }
  return false;
}
/** A link also with look-alike letters, full-width, ideographic or leader dots and "[.]", "(.)", "{.}" (and "dot" in brackets). */
const linkView = (t) => fold(t).replace(/[[({]\s*(?:\.|dot)\s*[\])}]/g, ".");
const WORDLIKE = /^(?:[A-Z]?[a-z]*|[A-Z]+|[0-9]+)$/;
/** An address, also split by spaces, hyphens or dots into chunks that each mix letters and digits or cases. */
function hasAddress(t) {
  if (ADDRESSISH.test(t)) return true;
  const joined = t.replace(/([1-9A-HJ-NP-Za-km-z]+)[ .-]+(?=([1-9A-HJ-NP-Za-km-z]+))/g, (m, a, b) => (!WORDLIKE.test(a) && !WORDLIKE.test(b) ? a : m));
  return ADDRESSISH.test(joined);
}
const refusedWords = (symbols) => new Set([...REFUSED_TEXT_WORDS, ...symbols].map((s) => words(fold(s)).join("")).filter(Boolean));
/**
 * The approved descriptive text, normalized and checked (the header has the rules). `places` are the city, region and country names (a
 * place's own name never counts as a quote); `symbols` the selected quote's symbol, when there is one.
 */
function approvedText(text, places, symbols = []) {
  const t = normalizeText(text, "text", { max: MAX_TEXT_LENGTH });
  if (/[<>]/.test(t)) fail("text_has_markup", "text");
  if (LINKISH.test(t) || LINKISH.test(linkView(t))) fail("text_has_link", "text");
  if (hasAddress(t)) fail("text_has_address", "text");
  if (namesRefused(t, places, refusedWords(symbols))) fail("text_names_quote", "text");
  return t;
}

/* ---------------------------------------------------------------- the description (template cc-desc-1) */
/**
 * The description of a coin for one quote (template cc-desc-1; the header has the wording). `region` is a name or null (no state or
 * region); `quote` is "SOL", "USDC" or { symbol, mint }; `symbol` is the coin's ticker; `text` the approved descriptive text or null for
 * the default lead. The wording only: whether a place may have a null region is contentV2's rule (it knows the city's id).
 */
export function renderDescription(city, region, country, quote, { symbol, text = null } = {}) {
  if (region === undefined) fail("region_missing", "region");
  const c = placeName(city, "city"), r = region === null ? null : placeName(region, "region"), k = placeName(country, "country");
  const q = quoteOf(quote);
  if (checkCoinSymbol(symbol)) fail("bad_symbol", "symbol");
  const lead = text === null || text === defaultLead(c) ? defaultLead(c) : sentence(approvedText(text, [c, r, k], [q.symbol]));
  return [
    lead,
    `City: ${sentence(c)}`,
    r === null ? "No state or region." : `State or region: ${sentence(r)}`,
    `Country: ${sentence(k)}`,
    `Pair: $${symbol} / ${q.symbol}.`,
    `Launched on ${CC_COIN_BRAND.productName} (${CC_COIN_BRAND.site}) on ${CC_COIN_BRAND.network}.`,
  ].join(" ");
}

/* ---------------------------------------------------------------- canonical JSON and hashes */
/** The canonical JSON text of `value` (see the header). */
export function canonicalJson(value) {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean": return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) fail("not_canonical", "number");
      return String(value);
    case "string":
      if (!wellFormed(value)) fail("not_well_formed", "string");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail("not_canonical", "array");
        return `[${value.map(canonicalJson).join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) fail("not_canonical", "object");
      return `{${Object.keys(value).sort().map((k) => `${canonicalJson(k)}:${canonicalJson(value[k])}`).join(",")}}`;
    }
    default: return fail("not_canonical", typeof value);
  }
}
const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v); return Object.freeze(o); };

/* ---------------------------------------------------------------- content v2 (pair-independent) */
const CONTENTS = new WeakSet(); // every content contentV2 made: the only ones the per-quote layer accepts (SEC-3)
const RENDERS = new WeakMap(); // every renderQuote result -> its content (perQuoteJson takes only these, of one content)
/** The picture: the generated coin art of CC_COIN_BRAND.artTemplate, or an owner-approved upload (city_metadata_uploads.normalized_sha256). */
function imageOf(image) {
  if (!image || typeof image !== "object") fail("missing", "image");
  const sha256 = sha256Of(image.sha256, "image.sha256");
  if (image.source === "template" && (image.template === undefined || image.template === CC_COIN_BRAND.artTemplate)) return { sha256, source: "template", template: CC_COIN_BRAND.artTemplate };
  if (image.source === "upload" && image.template === undefined) return { sha256, source: "upload" };
  return fail("bad_image_source", "image.source");
}
/**
 * The content of one coin version, pair-independent, normalized and checked, deeply frozen (the header has its keys). Input:
 *   { city: { id, name }, region: { id, name } | null, country: { id, name }, attribution?, listSha256, name, symbol, text?, image }
 * `region` must be given (null: the list has no state or region for the place). `listSha256` is the SHA-256 of the exact city list file
 * the place came from. `name` is the coin's name (the registry name or its short form). `text` is the approved descriptive text, or
 * null for the default lead. `image` is { sha256, source: "template" | "upload" }.
 */
export function contentV2(input = {}) {
  const { city, region, country, attribution = PLACE_ATTRIBUTION, listSha256, name, symbol, text = null, image } = input;
  if (!city || typeof city !== "object") fail("missing", "city");
  if (!country || typeof country !== "object") fail("missing", "country");
  if (region === undefined) fail("region_missing", "region");
  if (region !== null && typeof region !== "object") fail("missing", "region");
  const countryId = countryIdOf(country.id);
  const place = {
    city: { id: cityIdOf(city.id), name: placeName(city.name, "city.name") },
    region: region === null ? null : { id: regionIdOf(region.id, countryId), name: placeName(region.name, "region.name") },
    country: { id: countryId, name: placeName(country.name, "country.name") },
  };
  if (place.region === null && Object.hasOwn(REGION_UNREVIEWED, place.city.id)) fail("region_unreviewed", "region");
  const list = { attribution: normalizeText(attribution, "attribution", { max: MAX_TEXT_LENGTH }), sha256: sha256Of(listSha256, "listSha256") };
  const coinName = normalizeText(name, "name");
  const nameErr = checkCoinName(coinName);
  if (nameErr) fail(nameErr, "name");
  if (checkCoinSymbol(symbol)) fail("bad_symbol", "symbol");
  const lead = defaultLead(place.city.name);
  const descriptive = text === null || text === lead ? lead : approvedText(text, [place.city.name, place.region && place.region.name, place.country.name]);
  const content = deepFreeze({
    v: CONTENT_VERSION,
    norm: NORMALIZATION_VERSION,
    list,
    city: place.city,
    region: place.region,
    country: place.country,
    name: coinName,
    symbol,
    text: descriptive,
    descriptionTemplate: DESCRIPTION_TEMPLATE,
    image: imageOf(image),
  });
  CONTENTS.add(content);
  return content;
}
export const contentJson = (content) => canonicalJson(content);
export const contentHash = async (content) => sha256Hex(canonicalJson(content));
/** A stored canonical_json read back: built again from its own fields, and the same bytes required. The content, registered. */
export function contentFromJson(text) {
  if (typeof text !== "string") fail("not_text", "contentJson");
  let o;
  try { o = JSON.parse(text); } catch { fail("not_json", "contentJson"); }
  if (!o || typeof o !== "object" || Array.isArray(o) || o.v !== CONTENT_VERSION || o.norm !== NORMALIZATION_VERSION || !o.list || typeof o.list !== "object" || !o.city || typeof o.city !== "object") fail("not_content_v2", "contentJson");
  const isDefault = typeof o.city.name === "string" && typeof o.text === "string" && o.text === defaultLead(o.city.name);
  const c = contentV2({ city: o.city, region: o.region, country: o.country, attribution: o.list.attribution, listSha256: o.list.sha256, name: o.name, symbol: o.symbol, text: isDefault ? null : o.text, image: o.image });
  if (canonicalJson(c) !== text) fail("not_canonical", "contentJson");
  return c;
}

/* ---------------------------------------------------------------- per quote: description, metadata JSON, meta_hash */
/** The description of a content for one quote. */
export function describeContent(content, quote) {
  if (!CONTENTS.has(content)) fail("not_content_v2", "content");
  return renderDescription(content.city.name, content.region && content.region.name, content.country.name, quote, { symbol: content.symbol, text: content.text });
}
/**
 * The metadata JSON of a launched coin, from a content (made by contentV2 or contentFromJson), the coin's mint and one allowed quote. Fields
 * as the legacy JSON has them (src/coinmeta.js coinMetadataJson: name, symbol, description, image, external_url, website, createdOn,
 * launchpad, network, city, showName, attributes) with Citycoin.dev values, plus the place ids and attribution, the quote and the content
 * version with its hash (computed here). No logo field: no brand picture is reviewed by the owner yet (docs/citycoin-master/brand/README.md).
 */
export async function metadataJsonV2(content, { mint, quote } = {}) {
  if (!CONTENTS.has(content)) fail("not_content_v2", "content");
  const q = quoteOf(quote);
  if (typeof mint !== "string" || !BASE58.test(mint)) fail("bad_mint", "mint");
  if (mint === q.mint) fail("own_quote", "mint");
  if (LEGACY_QUOTE_MINTS.includes(mint) || Object.values(QUOTES).some((x) => x.mint === mint)) fail("bad_mint", "mint");
  const description = describeContent(content, q);
  const hash = await sha256Hex(canonicalJson(content));
  const B = CC_COIN_BRAND, page = coinPageUrl(mint);
  return deepFreeze({
    name: content.name,
    symbol: content.symbol,
    description,
    image: artUrl(content.image.sha256),
    external_url: page,
    website: page,
    createdOn: B.site,
    launchpad: B.productName,
    network: B.network,
    city: { id: content.city.id, name: content.city.name, region: content.region, country: content.country, attribution: content.list.attribution },
    quote: { mint: q.mint, symbol: q.symbol },
    showName: true,
    attributes: [
      { trait_type: "Launchpad", value: B.productName },
      { trait_type: "Network", value: B.network },
      { trait_type: "City", value: content.city.name },
      { trait_type: "State or region", value: content.region ? content.region.name : "No state or region" },
      { trait_type: "Country", value: content.country.name },
      { trait_type: "Pair", value: `$${content.symbol} / ${q.symbol}` },
    ],
    content: { v: CONTENT_VERSION, hash },
  });
}
/**
 * One content rendered for one quote: { quote, description, metadata, metadataJson, metaHash, uri }. metadataJson is the exact text to
 * serve at `uri` (UTF-8); metaHash is its SHA-256, the on-chain meta_hash (per_quote_json's metadata_json_sha256).
 */
export async function renderQuote(content, quote, { mint } = {}) {
  const q = quoteOf(quote);
  const metadata = await metadataJsonV2(content, { mint, quote: q });
  const metadataJson = canonicalJson(metadata);
  const r = Object.freeze({ quote: q, description: metadata.description, metadata, metadataJson, metaHash: await sha256Hex(metadataJson), uri: metadataUri(mint) });
  RENDERS.set(r, content);
  return r;
}
/** Everything for one coin version and one quote: { content, contentJson, contentHash } and renderQuote's fields for input.quote. */
export async function buildCoinMetadataV2(input = {}) {
  const content = contentV2(input);
  const cJson = canonicalJson(content);
  const r = await renderQuote(content, input.quote, { mint: input.mint });
  return Object.freeze({ content, contentJson: cJson, contentHash: await sha256Hex(cJson), ...r });
}
/**
 * One content version and its rendering for each allowed quote of the city (the pair selector's choices), in the order given:
 * { content, contentJson, contentHash, perQuote: [renderQuote(...), ...] }. A quote twice is refused.
 */
export async function buildPerQuote(input = {}, quotes = []) {
  if (!Array.isArray(quotes) || !quotes.length) fail("no_quotes", "quotes");
  const content = contentV2(input);
  const cJson = canonicalJson(content);
  const seen = new Set(), perQuote = [];
  for (const q of quotes) {
    const quote = quoteOf(q);
    if (seen.has(quote.mint)) fail("duplicate_quote", "quotes");
    seen.add(quote.mint);
    perQuote.push(await renderQuote(content, quote, { mint: input.mint }));
  }
  return Object.freeze({ content, contentJson: cJson, contentHash: await sha256Hex(cJson), perQuote: Object.freeze(perQuote) });
}
/**
 * The row's per_quote_json, {quote_config_id: {description, metadata_json_sha256}}, as canonical JSON, from renderQuote results of one
 * content whose quotes carry their config id. (The master policy has config_id 0 for SOL; USDC's is assigned with the quote configs, S31.)
 */
export function perQuoteJson(perQuote) {
  if (!Array.isArray(perQuote) || !perQuote.length) fail("no_quotes", "perQuote");
  const out = {};
  const content = RENDERS.get(perQuote[0]);
  for (const r of perQuote) {
    if (!RENDERS.has(r) || RENDERS.get(r) !== content) fail("not_rendered", "perQuote");
    const id = r.quote.configId;
    if (!Number.isSafeInteger(id)) fail("no_config_id", "perQuote");
    if (Object.hasOwn(out, String(id))) fail("duplicate_config_id", "perQuote");
    out[String(id)] = { description: r.description, metadata_json_sha256: r.metaHash };
  }
  return canonicalJson(out);
}
