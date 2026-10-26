// After a deploy: does the live site send the security headers on pages and files, not only on /api/*? And do the addresses that must
// be answered with a given kind of file get it (the official city-coin list: never the HTML 404 page, which is what the static files
// would answer if run_worker_first lost /official-coins.csv)?
//   node scripts/check-live.mjs [https://citycoin.dev]      (npm run check:live)
// With no address it checks the canonical origin the committed wrangler.jsonc configures (SITE_ORIGIN, https://citycoin.dev since the
// go-live), falling back to https://citycoin.dev when SITE_ORIGIN is unset or not a bare https origin the site configuration accepts
// (rebrand-inventory.md U10; stage S55 removes the vicinity.city routes, so the check after that deploy must not ask vicinity.city).
// Exit code 1 lists what is missing. Nothing is changed on the site (GET requests only).
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { siteConfig } from "../src/site-config.js";
import { varsOf } from "./brand/wrangler-vars.mjs";

/** The address checked when SITE_ORIGIN gives none. */
export const FALLBACK_BASE = "https://citycoin.dev";
const WRANGLER = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));

/**
 * The address the check reads by default: SITE_ORIGIN of a wrangler.jsonc text (the repository's when none is given), when it is set and
 * the site configuration accepts it together with SITE_ORIGINS (src/site-config.js: a bare https origin, one of SITE_ORIGINS); otherwise
 * FALLBACK_BASE. Never vicinity.city by default: a SITE_ORIGIN that is unset or refused does not fall back to today's canonical host.
 */
export function defaultBase(text) {
  try {
    const vars = varsOf(text === undefined ? readFileSync(WRANGLER, "utf8") : text);
    const raw = typeof vars.SITE_ORIGIN === "string" ? vars.SITE_ORIGIN.trim() : "";
    const site = siteConfig(vars);
    if (raw && site.configured) return site.origin;
  } catch { /* an unreadable file checks the fallback */ }
  return FALLBACK_BASE;
}

const need = {
  "content-security-policy": /default-src 'self'/,
  "x-content-type-options": /nosniff/i,
  "x-frame-options": /deny/i,
  "referrer-policy": /strict-origin/i,
  "permissions-policy": /geolocation=\(self\)/,
  "strict-transport-security": /max-age=/,
};
export const PATHS = Object.freeze(["/", "/connect", "/dashboard", "/rules", "/terms", "/official", "/admin", "/style.css", "/connect.js", "/api/me", "/official-coins.csv", "/no-such-page"]);
// [status, content type] pairs an address may answer; anything else is a failure. /official-coins.csv: the list (200 text/csv) or,
// when the chain could not be read, 503 plain text; never HTML.
const kinds = {
  "/official": [[200, /^text\/html/]],
  "/official-coins.csv": [[200, /^text\/csv; charset=utf-8$/], [503, /^text\/plain/]],
};

/** Checks every address of PATHS on `base`; prints one line each and returns the number of failing addresses. */
export async function checkLive(base, fetchImpl = fetch, log = console.log) {
  let bad = 0;
  for (const p of PATHS) {
    const res = await fetchImpl(base + p, { redirect: "manual" });
    const missing = Object.entries(need).filter(([h, re]) => !re.test(res.headers.get(h) || "")).map(([h]) => h);
    const type = res.headers.get("content-type") || "";
    if (kinds[p] && !kinds[p].some(([status, re]) => res.status === status && re.test(type))) missing.push(`answer (${res.status} ${type || "no content type"})`);
    log(`${missing.length ? "MISSING" : "ok     "} ${res.status} ${p}${missing.length ? "  " + missing.join(", ") : ""}`);
    if (missing.length) bad++;
  }
  log(bad ? `${bad} of ${PATHS.length} addresses on ${base} are missing security headers or the right answer` : `every checked address on ${base} sends the security headers and the right answer`);
  return bad;
}

/**
 * Is this file the script node was started with? Compared as real paths: node resolves the symbolic links of the main module's path for
 * import.meta.url but leaves process.argv[1] as typed, so a plain comparison is false when the script is started through a linked path,
 * and the check would then check nothing and exit 0 (S55 review finding S55-DEPLOY-2). Importing the file (the tests) runs nothing.
 */
export function startedAsScript(argv1 = process.argv[1], self = fileURLToPath(import.meta.url)) {
  if (!argv1) return false;
  try { return realpathSync(argv1) === realpathSync(self); } catch { return false; }
}

if (startedAsScript()) {
  const base = (process.argv[2] || defaultBase()).replace(/\/$/, "");
  process.exit((await checkLive(base)) ? 1 : 0);
}
