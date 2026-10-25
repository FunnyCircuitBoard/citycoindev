// The BRAND=citycoin switch, tried before anyone sets it (review finding F2 of the Citycoin.dev rebrand stage): writes the switch and the
// prerequisites the page build asks for (scripts/pages/build.mjs pageBrandPrerequisites) into THIS COPY's wrangler.jsonc, so the next
// `npm run build` builds and tests exactly what the configuration pull request would. For the CI job "brand-switch-trial"
// (.github/workflows/ci.yml), whose copy is thrown away; never commit its result. The sender address is a clearly fake placeholder
// (example.com): the owner supplies the real one in the configuration pull request.
//
// What it does with the committed wrangler.jsonc (final check finding 2: the job must stay green once the configuration pull request
// sets the switch, and on every pull request after it):
//   BRAND unset (or blank)                 writes the switch: BRAND=citycoin, LEGACY_SEATS=frozen, DEPLOYMENT_ENV=production and the
//                                          placeholder EMAIL_FROM. A value the committed file already has for one of them is kept when it
//                                          is what the switch needs (LEGACY_SEATS=frozen, any DEPLOYMENT_ENV the build accepts, an EMAIL_FROM
//                                          without the old name), so a pull request that sets them first still gets the trial.
//   BRAND=citycoin with its prerequisites  nothing to try: the committed file IS the switch, and the build that follows builds and tests
//                                          it. Writes nothing, says so in one line and exits 0.
//   anything else                          exits 1 with the reason: a half-set switch (BRAND=citycoin without LEGACY_SEATS=frozen, an
//                                          accepted DEPLOYMENT_ENV or an EMAIL_FROM without the old name), a BRAND that names another label
//                                          set, a LEGACY_SEATS the switch cannot carry, any setting the page build refuses, or the trial's own
//                                          placeholder sender in the committed file (its result was committed, or it ran twice).
//
//   node scripts/brand/switch-trial.mjs                          in CI (CI=true), or
//   node scripts/brand/switch-trial.mjs --local                  on a scratch copy of the repository
//   ... --wrangler <path>                                        another wrangler.jsonc than the repository's (tests)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brandFromSettings } from "../../src/brand.js";
import { legacySeatsFrozenOn } from "../../src/flags.js";
import { pageBrand, pageBrandPrerequisites, pageLegacySeats, pageV5Config } from "../pages/build.mjs";

export const TRIAL_SETTINGS = Object.freeze({ EMAIL_FROM: "Citycoin.dev <noreply@example.com>", BRAND: "citycoin", LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production" });

/** The "vars" of a wrangler.jsonc text, read as scripts/mainnet-preflight.mjs settingsFrom reads them (whole-line comments and trailing commas out). */
export const varsOf = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars || {};

/** Every check the page build makes on these settings that concerns the switch; throws the build's own error. */
function buildAccepts(vars) {
  pageBrand(vars);
  pageLegacySeats(vars);
  pageBrandPrerequisites(vars);
  pageV5Config(vars);
}
// one setting's line, `"KEY": "value",` (the comma optional, but needed on the EMAIL_FROM line the trial writes after)
const lineOf = (k, comma = "?") => new RegExp(`^([ \\t]*)"${k}"[ \\t]*:[ \\t]*"([^"\\n]*)"([ \\t]*,${comma})[ \\t]*\\n`, "m");
const said = (vars, keys) => keys.map((k) => `${k}=${vars[k]}`).join(", ");

/**
 * What the trial does with a wrangler.jsonc text (see the header):
 *   { action: "write", text, line }  the text with the switch, and the line to print
 *   { action: "noop", line }         the committed text already is the switch, consistently: nothing to write
 *   { action: "fail", reason }       a half-set or inconsistent configuration
 */
export function trialPlan(text) {
  let vars;
  try { vars = varsOf(text); } catch (e) { return { action: "fail", reason: `wrangler.jsonc does not parse (${e.message})` }; }
  const has = (k) => Object.hasOwn(vars, k);
  if (vars.EMAIL_FROM === TRIAL_SETTINGS.EMAIL_FROM)
    return { action: "fail", reason: `wrangler.jsonc carries the trial's own placeholder sender (${TRIAL_SETTINGS.EMAIL_FROM}): this is the trial's result, already applied (never apply it twice, never commit it)` };
  try { buildAccepts(vars); } catch (e) { return { action: "fail", reason: `the committed wrangler.jsonc is refused by the page build: ${e.message}` }; }
  const b = brandFromSettings(vars);
  if (b.key === TRIAL_SETTINGS.BRAND) {
    return { action: "noop", line: `switch-trial: wrangler.jsonc already sets the switch with its prerequisites (${said(vars, ["BRAND", "LEGACY_SEATS", "DEPLOYMENT_ENV"])}, EMAIL_FROM without the old name): nothing to try and nothing written; the build that follows builds and tests these committed settings` };
  }
  if (has("BRAND") && b.value !== "") return { action: "fail", reason: `wrangler.jsonc sets BRAND=${JSON.stringify(vars.BRAND)}, a label set other than ${TRIAL_SETTINGS.BRAND}: the trial does not replace it` };
  if (has("LEGACY_SEATS") && !legacySeatsFrozenOn(vars) && !["", "on"].includes(String(vars.LEGACY_SEATS).trim().toLowerCase()))
    return { action: "fail", reason: `wrangler.jsonc sets LEGACY_SEATS=${JSON.stringify(vars.LEGACY_SEATS)}, which BRAND=${TRIAL_SETTINGS.BRAND} cannot carry (it needs frozen)` };

  // BRAND unset or blank: the switch on top of what is committed, keeping a committed value that is already what the switch needs
  const from = typeof vars.EMAIL_FROM === "string" ? vars.EMAIL_FROM.trim() : "";
  const want = {
    EMAIL_FROM: from && !/vicinity/i.test(from) ? vars.EMAIL_FROM : TRIAL_SETTINGS.EMAIL_FROM,
    BRAND: TRIAL_SETTINGS.BRAND,
    LEGACY_SEATS: legacySeatsFrozenOn(vars) ? vars.LEGACY_SEATS : TRIAL_SETTINGS.LEGACY_SEATS,
    DEPLOYMENT_ENV: has("DEPLOYMENT_ENV") && String(vars.DEPLOYMENT_ENV).trim() !== "" ? vars.DEPLOYMENT_ENV : TRIAL_SETTINGS.DEPLOYMENT_ENV,
  };
  const anchor = lineOf("EMAIL_FROM", "").exec(text);
  if (!anchor) return { action: "fail", reason: "wrangler.jsonc: no EMAIL_FROM line to put the trial settings after" };
  let out = text;
  const added = [];
  for (const [k, v] of Object.entries(want)) {
    const m = lineOf(k).exec(out);
    if (m) out = out.slice(0, m.index) + `${m[1]}${JSON.stringify(k)}: ${JSON.stringify(v)}${m[3]}\n` + out.slice(m.index + m[0].length);
    else if (has(k)) return { action: "fail", reason: `wrangler.jsonc sets ${k} on a line the trial cannot rewrite (one "${k}": "…", line)` };
    else added.push(`${anchor[1]}${JSON.stringify(k)}: ${JSON.stringify(v)},\n`);
  }
  if (added.length) {
    const at = lineOf("EMAIL_FROM", "").exec(out);
    out = out.slice(0, at.index + at[0].length) + added.join("") + out.slice(at.index + at[0].length);
  }
  const after = varsOf(out);
  for (const [k, v] of Object.entries(want)) if (after[k] !== v) return { action: "fail", reason: `the trial could not write ${k} into wrangler.jsonc` };
  try { buildAccepts(after); } catch (e) { return { action: "fail", reason: `the switch on top of the committed wrangler.jsonc is refused by the page build: ${e.message}` }; }
  const kept = Object.keys(want).filter((k) => has(k) && vars[k] === want[k]);
  return { action: "write", text: out,
    line: `switch-trial: wrangler.jsonc now sets ${said(after, Object.keys(want))} (this copy only${kept.length ? `; kept as committed: ${kept.join(", ")}` : ""})` };
}

/** wrangler.jsonc's text with the trial settings (trialPlan's "write"); throws with the reason otherwise (the committed text already is the
 *  switch, or a half-set or inconsistent configuration). */
export function withTrialSettings(text) {
  const p = trialPlan(text);
  if (p.action === "write") return p.text;
  throw new Error(p.action === "noop" ? p.line : p.reason);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.env.CI !== "true" && !process.argv.includes("--local")) {
    console.error("switch-trial: this rewrites wrangler.jsonc. Run it in CI, or with --local on a scratch copy (never commit the result).");
    process.exit(1);
  }
  const i = process.argv.indexOf("--wrangler");
  const path = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : new URL("../../wrangler.jsonc", import.meta.url);
  const plan = trialPlan(readFileSync(path, "utf8"));
  if (plan.action === "fail") { console.error(`switch-trial: ${plan.reason}`); process.exit(1); }
  if (plan.action === "write") writeFileSync(path, plan.text);
  console.log(plan.line);
}
