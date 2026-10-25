/**
 * The product's visible names, in one place (Citycoin.dev master v5, stage S02; rebrand-inventory.md L01-L04, L12). Read from the
 * setting BRAND like the other switches (trimmed, any letter case).
 *
 * BRAND unset (or blank) is today's label set, byte for byte: "Vicinity", "Vicinity.city", "vicinity.city" and the tagline
 * "One city. One coin. One community.". BRAND=citycoin is the Citycoin.dev label set (the label migration, stage S48; owner directive of
 * 24 Oct 2026: "there should be no existence of vicinity. only citycoin."). Any other value names no label set: today's labels, and the
 * refusal in `problem` (BRAND_UNKNOWN).
 *
 * Two readings, because the pages are static files built from wrangler.jsonc and the Worker never sees them:
 *   brandFromSettings(vars)  the label set a BRAND value names, nothing else checked: the page build's reading (scripts/pages/build.mjs
 *                            pageBrand), which records what it built with in src/pages-built.js.
 *   brandOf(env)             the Worker's reading: the label set of the deployed pages (src/pages-built.js brand) decides. BRAND counts
 *                            when it is that label set. Anything else names the refusal in `problem` (BRAND_UNKNOWN, or BRAND_PAGES_MISMATCH)
 *                            and gives the label set the pages show: today's labels for today's pages (a BRAND set only in the Cloudflare
 *                            dashboard never renames the mail or the wallet statements while the pages still carry the old name), and the
 *                            pages' own label set for pages built with another one (review finding F12: today's labels there would put
 *                            the old name and the legacy token's data into pages that show neither).
 *
 * Only visible labels live here. Persistent identifiers never follow BRAND (rebrand-inventory.md sections 3.3 and 3.4; pinned by
 * test/persist-guard.test.js): program names and IDs, the /coin-meta/ URL prefix and the legacy coin-JSON brand, /brand/vicinity-512.png,
 * stored "vicinity" values, signed-message and hash domains, storage keys and cookie names. Origins and hosts are src/site-config.js:
 * citycoin.dev is never written as an address to open here (`domain` of the Citycoin.dev set is the brand name), so no text sends people to
 * a host that does not serve the site yet.
 *
 * Used by the page layout and the page sources' {{label}} fills (scripts/pages/build.mjs, from the settings of wrangler.jsonc), the mail
 * sender's display name (src/mail.js) and the words of the new wallet statements (src/challenge.js). The client scripts (public/*.js) read
 * the same labels from the page: a page built with a label set other than today's carries data-brand, data-brand-name (productName) and
 * data-brand-domain (domain) on <html>, and their brand`…` texts use those; today's pages carry none, so the scripts keep their words.
 */
import { PAGES_BUILT } from "./pages-built.js";

const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v); return Object.freeze(o); };

/** Today's labels. */
export const LEGACY_BRAND = deepFreeze({
  key: "",
  productName: "Vicinity",                       // in sentences: "Vicinity never asks …", "Vicinity on X", the header
  shortName: "Vicinity",                         // where space is short (app name, tab bar)
  domain: "vicinity.city",                       // the address as a visible label ("read by vicinity.city")
  siteLabel: "Vicinity.city",                    // the name on the copyright line
  senderName: "Vicinity",                        // the display name of outgoing mail
  tagline: "One city. One coin. One community.",
});

/**
 * The Citycoin.dev labels (BRAND=citycoin). No new legal entity is named (rebrand-inventory.md L03). `domain` is the brand name, not a
 * host: "read by Citycoin.dev" (U06), never "open citycoin.dev" while the site is served elsewhere.
 */
export const CITYCOIN_BRAND = deepFreeze({
  key: "citycoin",
  productName: "Citycoin.dev",
  shortName: "Citycoin",
  domain: "Citycoin.dev",
  siteLabel: "Citycoin.dev",
  senderName: "Citycoin.dev",
  tagline: "One city. One coin. One community.",
});

/** Every label set, by BRAND value ("" = unset). */
export const BRANDS = deepFreeze({ "": LEGACY_BRAND, citycoin: CITYCOIN_BRAND });

const FIELDS = ["productName", "shortName", "domain", "siteLabel", "senderName", "tagline"];
const valueOf = (env) => String((env && env.BRAND) ?? "").trim().toLowerCase();

/** The label set a BRAND value names (the page build's reading): a frozen BRANDS entry plus `value` and `problem` (BRAND_UNKNOWN). */
export function brandFromSettings(vars) {
  const value = valueOf(vars);
  const known = Object.hasOwn(BRANDS, value);
  return Object.freeze({ ...(known ? BRANDS[value] : LEGACY_BRAND), value, problem: known ? null : "BRAND_UNKNOWN" });
}

let builtRecord = PAGES_BUILT;
/** Tests only: stand in for another page build record ({ brand, ... }), or null for the committed src/pages-built.js. src/v5policy.js
 *  _pagesBuiltForTests sets it too, so one stand-in moves the Worker's every reading of the build. Each test file runs in its own process. */
export const _brandBuiltForTests = (p) => { builtRecord = p || PAGES_BUILT; };

/**
 * The label set of a Worker environment: BRAND's set while it is the one the deployed pages were built with (`built`, src/pages-built.js;
 * src/v5policy.js passes its own record so tests can stand in for a build). Otherwise the label set those pages show, with `value` and
 * `problem` (BRAND_UNKNOWN, BRAND_PAGES_MISMATCH): today's labels for today's pages, the pages' own label set for pages built with another.
 * With BRAND unset and today's build this is exactly LEGACY_BRAND. A refusal never makes a switch count: src/v5policy.js refuses
 * MAIN_TOKEN_V5 on any `problem`.
 */
export function brandOf(env, built = builtRecord) {
  const b = brandFromSettings(env);
  const pages = String(built?.brand ?? "");
  if (!b.problem && b.value === pages) return b;
  if (pages !== "" && Object.hasOwn(BRANDS, pages)) return Object.freeze({ ...BRANDS[pages], value: b.value, problem: b.problem || "BRAND_PAGES_MISMATCH" });
  if (b.problem) return b;
  return Object.freeze({ ...LEGACY_BRAND, value: b.value, problem: "BRAND_PAGES_MISMATCH" });
}

/**
 * The labels the page layout writes, made from one label set. With LEGACY_BRAND every string is exactly today's.
 * (Plain text: the layout escapes what it writes into markup.)
 */
export function brandLabels(b) {
  for (const f of FIELDS) if (typeof b?.[f] !== "string" || !b[f].trim()) throw new Error(`brand: ${f} must be a non-empty string`);
  return Object.freeze({
    homeTitle: `${b.productName} — ${b.tagline}`,
    pageTitle: (title) => `${title} · ${b.productName}`,
    homeLink: `${b.productName} home`,
    headerName: b.productName,
    copyright: `${b.siteLabel} © 2026. All rights reserved.`,
    socialList: `${b.productName} on social media`,
    socialLink: (network, handle) => `${b.productName} on ${network} (${handle}), opens in a new tab`,
    safety: `${b.productName} never asks for your recovery phrase or private key.`,
  });
}
