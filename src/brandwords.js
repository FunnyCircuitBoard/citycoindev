/**
 * The product's name in the Worker's own words (the label migration, stage S48, area c: e-mails, the wallet statements of today's sign-in,
 * API messages and notices that pages show, admin texts; owner directive of 24 Oct 2026: "there should be no existence of vicinity. only
 * citycoin."). One reading of the label set per environment, src/brand.js brandOf (fail closed: the Citycoin.dev labels only while the
 * deployed pages were built with them, src/pages-built.js), and two ways to use it:
 *
 *   w`…`        a tag for a template literal: the label set's names go into the template's OWN words ("Vicinity" becomes the product's
 *               name, the data label "vicinity.city" the `domain` label), never into a value put into it (a city's name, a founder's
 *               words, a link, an address, a number). The same rule as the client scripts' brand`…` (public/*.js, area b).
 *   w.say(t)    a whole text of ours (a module constant, an entry of a message table): renamed the same way. Anything that is not a
 *               string comes back as it is.
 *
 * With today's label set (BRAND unset, or a BRAND the pages were not built with) both give every text exactly as written, so today's
 * answers, D1 rows, e-mails and log lines stay byte for byte what they were.
 *
 * Never passed through here (test/brand-adapters.test.js and test/persist-guard.test.js pin them): persistent values (the stored and API value
 * "vicinity", the /coin-meta/ URLs and the legacy coin-JSON brand, program and crate names, hash domains, today's signed statements, storage
 * keys), links and hosts (they come from src/site-config.js), and the legacy token's own texts ($VICINITY: the main-token stage's, area d;
 * the upper-case ticker is never matched).
 */
import { LEGACY_BRAND, brandOf } from "./brand.js";
import { LEGACY_HOSTS, siteConfig } from "./site-config.js";

const rename = (b, s) => s.replace(/vicinity\.city/g, () => b.domain).replace(/Vicinity/g, () => b.productName);

/** The words of one label set (a src/brand.js set): the tag, with `say`, `brand` (the set) and `on` (false for today's set). */
export function wordsOf(b) {
  const on = Boolean(b && b.key); // today's label set has the key "": it renames nothing
  const w = (strings, ...values) => {
    let out = "";
    for (let i = 0; i < strings.length; i++) out += (on ? rename(b, strings[i]) : strings[i]) + (i < values.length ? String(values[i]) : "");
    return out;
  };
  w.say = (t) => (on && typeof t === "string" ? rename(b, t) : t);
  w.brand = b;
  w.on = on;
  return Object.freeze(w);
}

/** Today's words: every text exactly as written (the default of every function that takes words). */
export const SAME = wordsOf(LEGACY_BRAND);

/** The words of a Worker environment (src/brand.js brandOf). */
export const brandWords = (env) => wordsOf(brandOf(env));

/**
 * The product's name in the wallet statements of today's sign-in (src/solana.js statementFor: /api/message and src/signed.js checkSigned,
 * used while WALLET_ONLY is off). `statementName` is the name a new statement is written in; `statementNames` the names a signed statement
 * is accepted in: today's always (a text issued just before the label set changed stays good for its ten minutes), and the label set's.
 */
export const statementName = (env) => brandOf(env).productName;
export const statementNames = (env) => {
  const name = statementName(env);
  return name === LEGACY_BRAND.productName ? [name] : [name, LEGACY_BRAND.productName];
};

/** The serving origin (src/site-config.js SITE_ORIGIN, today's https://vicinity.city while unset): the address the links of a label set's
 *  words point at (an e-mail's buttons, a new coin's metadata), never written into the words themselves. */
export const siteOrigin = (env) => siteConfig(env).origin;
/** Is the serving origin one of the old names (SITE_ORIGIN unset, or naming vicinity.city)? Then a link built from it would name the old host
 *  (src/coinmeta.js leaves a new coin's host links out until it is not: review finding CRAWL-1). */
export const onLegacyHost = (env) => LEGACY_HOSTS.includes(siteConfig(env).host);
