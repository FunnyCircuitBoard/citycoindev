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
 * What it builds, per city and per allowed quote:
 *   renderDescription(city, region, country, quote, { symbol, text })
 *       The description, in this exact wording (template cc-desc-1):
 *         <lead> City: <city>. State or region: <region>. Country: <country>. Pair: $<TICKER> / <QUOTE>. Launched on Citycoin.dev
 *         (https://citycoin.dev) on Solana.
 *       <lead> is the approved descriptive text, or "The city coin of <city>." when there is none (the live default's words,
 *       src/coinmeta.js and src/coindefaults.js). `region` must be given: a name, or null for a place the list has no state or region
 *       for, which renders "No state or region." in its place (never a made-up state: WP-07, "If a region is not applicable, render
 *       that explicitly"). The pair is the SELECTED quote's symbol, written as the site writes a pair ("Pair: $UTICA / SOL",
 *       public/launchpad.js pairText), so a USDC coin can never say SOL (section 25). Each field ends with one full stop (a name
 *       that already ends with one, "Bogota D.C.", keeps it).
 *   contentV2(input) / contentJson / contentHash
 *       The content of one coin version for one quote: the canonical ids (city: GeoNames id; region: "CC.ADM1" code of the list;
 *       country: ISO 3166-1 alpha-2; quote: mint), the names, the attribution, the normalization version, the approved text, the
 *       rendered description and its template, the picture (SHA-256 and art template) and the quote. Its SHA-256 is the version's
 *       content hash: what the owner reviews and what a launch binds.
 *   metadataJsonV2(content, { mint, contentHash }) / buildCoinMetadataV2 / buildPerQuote
 *       The JSON served write-once at https://citycoin.dev/coin-meta/v1/<mint>.json, and its SHA-256: the program's meta_hash
 *       (curve:CITYCOIN-CURVE-DESIGN.md:415, the Approval's meta_hash: "SHA-256 of the exact metadata JSON the website will serve at
 *       the coin's URI"; section 3.10). Its image URL names the picture's SHA-256 (3.10). The mint is an input: the program
 *       derives it from its id and the city id (curve:sdk/curve/pda.mjs coinAccounts), so the JSON and its hash are known before
 *       the launch.
 *
 * Canonical JSON (contentJson and the metadata JSON text): RFC 8785 (JCS) restricted to null, booleans, safe integers, strings, arrays
 * and plain objects. Object keys sorted by UTF-16 code units at every level, no insignificant whitespace, strings escaped as JSON.stringify does
 * (non-ASCII written as UTF-8, not \u escapes); anything else (a fraction, undefined, a lone surrogate, a sparse array, a class
 * instance) is refused, never dropped. The hash is SHA-256 over the UTF-8 bytes, lower-case hex.
 *
 * Text normalization cc-norm-1 (every string that enters content or metadata): a well-formed string; Unicode NFC; every run of ASCII
 * whitespace (tab, line feed, vertical tab, form feed, carriage return, space) becomes one space, none at either end; then refused
 * if empty, or holding a control character (Cc), an invisible character or a blank character other than U+0020 (src/text.js
 * FORMAT_CHARS and BLANK_CHARS, the same ranges as the program's is_format_char and is_blank_char). Normalizing twice changes nothing.
 * A later rule is a new version name, never an edit of this one.
 *
 * Name and ticker rules for new-program coins (the program refuses anything else at launch):
 *   name    1 to 32 UTF-8 bytes, in cc-norm-1 form (curve:programs/citycoin-curve/src/helpers.rs:39 check_name; MAX_NAME_LEN 32,
 *           curve:sdk/curve/constants.mjs:72). Never cut to fit: a longer name is refused (src/coindefaults.js NAME_OVERRIDES is
 *           where the three long registry names get their short forms).
 *   symbol  1 to 10 of A-Z and 0-9 (helpers.rs:112 check_symbol; MAX_SYMBOL_LEN 10, constants.mjs:73): the registry ticker.
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

export const CONTENT_VERSION = 2;
export const NORMALIZATION_VERSION = "cc-norm-1";
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
/** The city list's own attribution (public/data/cities.json "source"). */
export const PLACE_ATTRIBUTION = "GeoNames (geonames.org), CC BY 4.0";

/**
 * The quotes the master names with a known mint (section 16 "Pairs and branding": SOL and USDC; the master policy's quote_configs sol and
 * usdc). A third, the main token, is passed in as { symbol, mint } only once MAIN_TOKEN_MINT is verified (owner amendment 01); its
 * symbol is read from the chain then. Never a legacy mint.
 */
export const QUOTES = Object.freeze({
  SOL: Object.freeze({ symbol: "SOL", mint: "So11111111111111111111111111111111111111112" }),
  USDC: Object.freeze({ symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }),
});
/** $VICINITY, a legacy token since owner amendment 01: never a quote (policy legacy_tokens never_used_for main_token_quote). */
export const LEGACY_QUOTE_MINTS = Object.freeze(["2aVkhRfAEm44tMhFo8oamWvumGGvweFqnUwukRMBkray"]);
// symbols another quote may not borrow: a listed quote's own (any letter case), wrapped SOL's, and the legacy token's
const RESERVED_QUOTE_SYMBOLS = Object.freeze({ SOL: QUOTES.SOL.mint, WSOL: QUOTES.SOL.mint, USDC: QUOTES.USDC.mint, VICINITY: null });

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
/** Why a string is not acceptable after the whitespace step, or null. */
function charProblem(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return "control_character";
    if (inRanges(c, FORMAT_CHARS)) return "invisible_character";
    if (inRanges(c, BLANK_CHARS)) return "blank_character";
  }
  return null;
}
/** The cc-norm-1 form of `value` (see the header), or a MetadataError naming `field`. */
export function normalizeText(value, field = "text", { max = Infinity } = {}) {
  if (typeof value !== "string") fail("not_text", field);
  if (!wellFormed(value)) fail("not_well_formed", field);
  const s = value.normalize("NFC").replace(/[\t\n\v\f\r ]+/g, " ").replace(/^ /, "").replace(/ $/, "");
  if (!s) fail("empty", field);
  const bad = charProblem(s);
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

/** A quote, checked: "SOL", "USDC" or { symbol, mint }. A listed quote's symbol only with its mint, and its mint only with its symbol. */
export function quoteOf(quote) {
  const q = typeof quote === "string" ? (Object.hasOwn(QUOTES, quote) ? QUOTES[quote] : fail("unknown_quote", "quote")) : quote;
  if (!q || typeof q !== "object") fail("unknown_quote", "quote");
  const { symbol, mint } = q;
  if (typeof symbol !== "string" || !/^[A-Za-z0-9]{1,10}$/.test(symbol)) fail("bad_quote_symbol", "quote.symbol");
  if (typeof mint !== "string" || !BASE58.test(mint)) fail("bad_quote_mint", "quote.mint");
  if (LEGACY_QUOTE_MINTS.includes(mint)) fail("legacy_quote", "quote.mint");
  const upper = symbol.toUpperCase();
  // a reserved symbol (any letter case) only on its own mint, and a listed mint only under its exact symbol ("sol" or "WSOL" on SOL's mint too)
  if (Object.hasOwn(RESERVED_QUOTE_SYMBOLS, upper) && RESERVED_QUOTE_SYMBOLS[upper] !== mint) fail("quote_mismatch", "quote");
  for (const k of Object.values(QUOTES)) if (k.mint === mint && k.symbol !== symbol) fail("quote_mismatch", "quote");
  return Object.freeze({ symbol, mint });
}

/* ---------------------------------------------------------------- the description (template cc-desc-1) */
const sentence = (s) => (/[.!?…]$/u.test(s) ? s : `${s}.`);
const LINKISH = /https?:|www\.|\.[a-z]{2,}(\/|\b)/i; // src/coins.js and src/coinreview.js: the founder's link rule
const ADDRESSISH = /[1-9A-HJ-NP-Za-km-z]{32,44}/; // src/coinmeta.js PITCH_BAD: no address in a coin's words
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * The approved descriptive text, normalized and checked. It is rendered for every allowed quote, so it may not name a quote itself
 * (the pair is the mandatory field), nor carry a link or an address. A place's own name never counts as a quote ("Costa del Sol").
 */
function approvedText(text, places, quote) {
  const t = normalizeText(text, "text", { max: MAX_TEXT_LENGTH });
  if (LINKISH.test(t)) fail("text_has_link", "text");
  if (ADDRESSISH.test(t)) fail("text_has_address", "text");
  let rest = t;
  for (const p of places) if (p) rest = rest.replace(new RegExp(escapeRe(p), "giu"), " ");
  const symbols = [...new Set([...Object.values(QUOTES).map((k) => k.symbol), "WSOL", quote.symbol.toUpperCase()])].map(escapeRe).join("|");
  if (new RegExp(`(?<![\\p{L}\\p{N}])(?:${symbols})(?![\\p{L}\\p{N}])`, "iu").test(rest)) fail("text_names_quote", "text");
  return t;
}

/**
 * The description of a coin for one quote (template cc-desc-1; the header has the wording). `region` is a name or null (no state or
 * region); `quote` is "SOL", "USDC" or { symbol, mint }; `symbol` is the coin's ticker; `text` the approved descriptive text or null.
 */
export function renderDescription(city, region, country, quote, { symbol, text = null } = {}) {
  if (region === undefined) fail("region_missing", "region");
  const c = placeName(city, "city"), r = region === null ? null : placeName(region, "region"), k = placeName(country, "country");
  const q = quoteOf(quote);
  if (checkCoinSymbol(symbol)) fail("bad_symbol", "symbol");
  const lead = text === null ? `The city coin of ${sentence(c)}` : sentence(approvedText(text, [c, r, k], q));
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

/* ---------------------------------------------------------------- content v2 */
/**
 * The content of one coin version for one quote, normalized and checked, deeply frozen:
 *   { city: { id, name }, region: { id, name } | null, country: { id, name }, attribution?, name, symbol, text?, artSha256, quote }
 * `region` must be given (null: the list has no state or region for the place). `name` is the coin's name (the registry name or its
 * short form). `text` is the approved descriptive text, or null for the default lead. `quote` as quoteOf takes it.
 */
export function contentV2(input = {}) {
  const { city, region, country, attribution = PLACE_ATTRIBUTION, name, symbol, text = null, artSha256, quote } = input;
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
  const coinName = normalizeText(name, "name");
  const nameErr = checkCoinName(coinName);
  if (nameErr) fail(nameErr, "name");
  if (checkCoinSymbol(symbol)) fail("bad_symbol", "symbol");
  const q = quoteOf(quote);
  const approved = text === null ? null : normalizeText(text, "text", { max: MAX_TEXT_LENGTH });
  const description = renderDescription(place.city.name, place.region && place.region.name, place.country.name, q, { symbol, text: approved });
  return deepFreeze({
    v: CONTENT_VERSION,
    norm: NORMALIZATION_VERSION,
    city: place.city,
    region: place.region,
    country: place.country,
    attribution: normalizeText(attribution, "attribution", { max: MAX_TEXT_LENGTH }),
    name: coinName,
    symbol,
    text: approved,
    description,
    descriptionTemplate: DESCRIPTION_TEMPLATE,
    image: { sha256: sha256Of(artSha256, "artSha256"), template: CC_COIN_BRAND.artTemplate },
    quote: { mint: q.mint, symbol: q.symbol },
  });
}
export const contentJson = (content) => canonicalJson(content);
export const contentHash = async (content) => sha256Hex(canonicalJson(content));

/* ---------------------------------------------------------------- the metadata JSON (served at metadataUri(mint)) */
/**
 * The metadata JSON of a launched coin, from its content and its mint (and the content's hash, which it names). Fields as the
 * legacy JSON has them (src/coinmeta.js coinMetadataJson: name, symbol, description, image, external_url, website, createdOn,
 * launchpad, network, city, showName, attributes) with Citycoin.dev values, plus the place ids and attribution, the quote and the
 * content version. No logo field: no brand picture is reviewed by the owner yet (docs/citycoin-master/brand/README.md).
 */
export function metadataJsonV2(content, { mint, contentHash: hash } = {}) {
  if (!content || content.v !== CONTENT_VERSION || content.norm !== NORMALIZATION_VERSION) fail("not_content_v2", "content");
  if (typeof mint !== "string" || !BASE58.test(mint)) fail("bad_mint", "mint");
  if (mint === content.quote.mint) fail("own_quote", "mint");
  if (LEGACY_QUOTE_MINTS.includes(mint) || Object.values(QUOTES).some((q) => q.mint === mint)) fail("bad_mint", "mint");
  const B = CC_COIN_BRAND, page = coinPageUrl(mint);
  const regionValue = content.region ? content.region.name : "No state or region";
  return deepFreeze({
    name: content.name,
    symbol: content.symbol,
    description: content.description,
    image: artUrl(content.image.sha256),
    external_url: page,
    website: page,
    createdOn: B.site,
    launchpad: B.productName,
    network: B.network,
    city: { id: content.city.id, name: content.city.name, region: content.region, country: content.country, attribution: content.attribution },
    quote: { mint: content.quote.mint, symbol: content.quote.symbol },
    showName: true,
    attributes: [
      { trait_type: "Launchpad", value: B.productName },
      { trait_type: "Network", value: B.network },
      { trait_type: "City", value: content.city.name },
      { trait_type: "State or region", value: regionValue },
      { trait_type: "Country", value: content.country.name },
      { trait_type: "Pair", value: `$${content.symbol} / ${content.quote.symbol}` },
    ],
    content: { v: CONTENT_VERSION, hash: sha256Of(hash, "contentHash") },
  });
}

/**
 * Everything for one coin and one quote: { content, contentJson, contentHash, metadata, metadataJson, metaHash, uri }. metadataJson
 * is the exact text to serve at `uri` (UTF-8); metaHash is its SHA-256, the on-chain meta_hash.
 */
export async function buildCoinMetadataV2(input = {}) {
  const content = contentV2(input);
  const cJson = canonicalJson(content);
  const cHash = await sha256Hex(cJson);
  const metadata = metadataJsonV2(content, { mint: input.mint, contentHash: cHash });
  const mJson = canonicalJson(metadata);
  return Object.freeze({ content, contentJson: cJson, contentHash: cHash, metadata, metadataJson: mJson, metaHash: await sha256Hex(mJson), uri: metadataUri(input.mint) });
}

/** The same for each allowed quote of a city (the pair selector's choices), in the order given; a quote twice is refused. */
export async function buildPerQuote(input = {}, quotes = []) {
  if (!Array.isArray(quotes) || !quotes.length) fail("no_quotes", "quotes");
  const seen = new Set(), out = [];
  for (const q of quotes) {
    const { mint } = quoteOf(q);
    if (seen.has(mint)) fail("duplicate_quote", "quotes");
    seen.add(mint);
    out.push(await buildCoinMetadataV2({ ...input, quote: q }));
  }
  return Object.freeze(out);
}
