// The test suite describes today's site: the settings of the live wrangler.jsonc, the pages built from them (BRAND unset, no legacy seat
// freeze) and the Worker answering for that build. Loaded before every test file (package.json "test": node --import
// ./test/helpers/today-build.mjs --test ...), so the suite gives the same answers whichever build is committed (review finding F2 of the
// Citycoin.dev rebrand stage: the configuration pull request that sets BRAND=citycoin in wrangler.jsonc runs `npm run build`, which builds
// the Citycoin.dev pages and then runs this suite, before CI and `wrangler deploy` let it through).
//
// While the committed build IS today's (src/pages-built.js names no label set, no main-token switch and no freeze: the live site), this file
// does nothing at all. Otherwise, before any test runs, three committed things read as today's:
//   wrangler.jsonc        as it was before the switch (todayWrangler below): what the CI switch trial wrote into this copy, taken back
//                         exactly from the trial's own line (scripts/brand/wrangler-vars.mjs undoTrial); then the switch's own settings
//                         (SWITCH_ON_SETTINGS: BRAND, a LEGACY_SEATS frozen, MAIN_TOKEN_V5 on) taken out and today's mail sender put back.
//                         Nothing else: a DEPLOYMENT_ENV, SITE_ORIGIN or SITE_ORIGINS committed for another stage (S06) stays as committed
//                         (rebrand second check S06-CI-RED), and every edit goes by the JSONC structure, never by lines (STANDIN-MULTILINE)
//   src/pages-built.js    the record the page build writes for those settings, as the file's text and as the Worker's reading
//                         (src/v5policy.js _pagesBuiltBaseForTests; a test that stands in for another build merges onto this one, as it was
//                         written to)
//   public/<page>.html    the page today's build writes (a page scripts/pages/src has), built here in memory; every other file reads as it is
// The committed build itself is tested by test/build-parity.test.js through the real readers below (realWrangler, committedFile): the pages
// and the record must be exactly what the committed wrangler.jsonc builds. The Citycoin.dev pages and answers are tested in memory
// (buildPages({ brand: CITYCOIN_BRAND }), _pagesBuiltForTests({ brand: "citycoin" })) whichever build is committed.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { PAGES_BUILT } from "../../src/pages-built.js";
import { brandFromSettings } from "../../src/brand.js";
import { legacySeatsFrozenOn, mainTokenV5On } from "../../src/flags.js";
import { removeVar, setVar, undoTrial, varsOf } from "../../scripts/brand/wrangler-vars.mjs";

const realReadFileSync = fs.readFileSync;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PUBLIC = `${ROOT}public/`, SRC = `${ROOT}scripts/pages/src/`, WRANGLER = `${ROOT}wrangler.jsonc`, RECORD = `${ROOT}src/pages-built.js`;

/** The settings that turn on what a committed build other than today's carries (src/pages-built.js: the label set, the legacy seat freeze, the
 *  main-token switch), each taken out by the stand-in when it is set; and today's mail sender, put back when a label set was (BRAND=citycoin
 *  needs a sender without the old name: scripts/pages/build.mjs pageBrandPrerequisites). Never DEPLOYMENT_ENV, SITE_ORIGIN or SITE_ORIGINS:
 *  a configuration pull request of another stage (S06) commits them, and the suite reads them as committed (rebrand second check S06-CI-RED). */
export const SWITCH_ON_SETTINGS = Object.freeze(["BRAND", "LEGACY_SEATS", "MAIN_TOKEN_V5"]);
export const TODAY_EMAIL_FROM = "Vicinity <noreply@vicinity.city>";

/** Is the committed build today's? */
export const committedIsToday = PAGES_BUILT.brand === "" && PAGES_BUILT.mainTokenV5 === false && PAGES_BUILT.legacySeats === undefined;
/** A committed file exactly as it is on disk, never the stand-in below (a path relative to the repository: "public/index.html"). */
export const committedFile = (rel, encoding) => realReadFileSync(ROOT + rel, encoding);
/** The committed wrangler.jsonc's text, exactly as it is on disk. */
export const realWrangler = () => realReadFileSync(WRANGLER, "utf8");

/**
 * wrangler.jsonc as today's site has it: the CI switch trial's change taken back exactly (its own line says what it replaced), then each
 * SWITCH_ON_SETTINGS entry that turns something on taken out (a blank BRAND, a LEGACY_SEATS other than frozen, a MAIN_TOKEN_V5 other than on
 * are today's and stay), and today's mail sender when a label set was set. Every other byte stays: comments, other settings, a DEPLOYMENT_ENV
 * or SITE_ORIGINS committed for another stage, a value written over several lines.
 */
export function todayWrangler(text) {
  let out = undoTrial(text);
  const vars = varsOf(out);
  const labels = brandFromSettings(vars).value !== "";
  if (labels) out = removeVar(out, "BRAND");
  if (legacySeatsFrozenOn(vars)) out = removeVar(out, "LEGACY_SEATS");
  if (mainTokenV5On(vars)) out = removeVar(out, "MAIN_TOKEN_V5");
  if (labels && Object.hasOwn(vars, "EMAIL_FROM") && vars.EMAIL_FROM !== TODAY_EMAIL_FROM) out = setVar(out, "EMAIL_FROM", TODAY_EMAIL_FROM);
  varsOf(out); // (throws if the result would not parse: never hand the suite a file it cannot read)
  return out;
}

if (!committedIsToday) {
  const pathOf = (p) => { try { return p instanceof URL ? fileURLToPath(p) : typeof p === "string" ? (p.startsWith("file:") ? fileURLToPath(p) : p) : null; } catch { return null; } };
  const answer = (text, options) => {
    const enc = typeof options === "string" ? options : options && options.encoding;
    return enc ? Buffer.from(text, "utf8").toString(enc) : Buffer.from(text, "utf8");
  };
  const wrangler = todayWrangler(realWrangler());
  let pages = null, record = null;
  fs.readFileSync = function readFileSync(file, options) {
    const p = pathOf(file);
    if (p === WRANGLER) return answer(wrangler, options);
    if (p === RECORD && record !== null) return answer(record, options);
    if (pages && p && p.startsWith(PUBLIC) && pages.has(p.slice(PUBLIC.length))) return answer(pages.get(p.slice(PUBLIC.length)), options);
    return realReadFileSync.apply(this, arguments);
  };
  syncBuiltinESMExports();
  // today's build, from today's settings (the build reads wrangler.jsonc through the stand-in above)
  const { buildPages, buildStandalonePages, pagesBuiltSource } = await import("../../scripts/pages/build.mjs");
  const { LEGACY_BRAND } = await import("../../src/brand.js");
  const { SOCIAL_PROFILES } = await import("../../src/official.js");
  const { _pagesBuiltBaseForTests } = await import("../../src/v5policy.js");
  const opts = { brand: LEGACY_BRAND, socials: SOCIAL_PROFILES, legacySeats: "on" };
  const names = new Set(fs.readdirSync(SRC).filter((f) => f.endsWith(".html")));
  pages = new Map([...buildPages(opts), ...buildStandalonePages(opts)].filter(([f]) => names.has(f)));
  record = pagesBuiltSource();
  const today = /export const PAGES_BUILT = Object\.freeze\((\{[^}]*\})\);/.exec(record);
  if (!today) throw new Error("test/helpers/today-build.mjs: today's src/pages-built.js could not be read");
  // { mainTokenV5: false, brand: "", pagesReachWorker: … } as the record writes it (keys unquoted): read it as data, never as code
  const fields = Object.fromEntries([...today[1].matchAll(/(\w+): ("[^"]*"|true|false)/g)].map(([, k, v]) => [k, JSON.parse(v)]));
  _pagesBuiltBaseForTests(fields);
}
