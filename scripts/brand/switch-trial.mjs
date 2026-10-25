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
//                                          is what the switch needs (LEGACY_SEATS=frozen, a DEPLOYMENT_ENV the freeze accepts, so not "unset",
//                                          an EMAIL_FROM without the old name), so a pull request that sets them first still gets the trial.
//                                          The values are written by their place in the JSONC (scripts/brand/wrangler-vars.mjs), every other
//                                          byte stays, and one comment line (TRIAL_MARK) records what was replaced, so the suite's stand-in for
//                                          today's site takes back exactly the trial's change (test/helpers/today-build.mjs).
//   BRAND=citycoin with its prerequisites  nothing to try: the committed file IS the switch, and the build that follows builds and tests
//                                          it. Writes nothing, says so in one line and exits 0.
//   anything else                          exits 1 with the reason: a half-set switch (BRAND=citycoin without LEGACY_SEATS=frozen, an
//                                          accepted DEPLOYMENT_ENV or an EMAIL_FROM without the old name), a BRAND that names another label
//                                          set, a LEGACY_SEATS the switch cannot carry, any setting the page build refuses, or the trial's own
//                                          placeholder sender or line in the committed file (its result was committed, or it ran twice).
//
//   node scripts/brand/switch-trial.mjs                          in CI (CI=true), or
//   node scripts/brand/switch-trial.mjs --local                  on a scratch copy of the repository
//   ... --wrangler <path>                                        another wrangler.jsonc than the repository's (tests)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brandFromSettings } from "../../src/brand.js";
import { legacySeatsFrozenOn } from "../../src/flags.js";
import { pageBrand, pageBrandPrerequisites, pageLegacySeats, pageV5Config } from "../pages/build.mjs";
import { MARK_LINE, TRIAL_MARK, rawVar, setRawVar, trialMark, undoTrial, varsOf } from "./wrangler-vars.mjs";

export { TRIAL_MARK, trialMark, undoTrial, varsOf };
export const TRIAL_SETTINGS = Object.freeze({ EMAIL_FROM: "Citycoin.dev <noreply@example.com>", BRAND: "citycoin", LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production" });

/** Every check the page build makes on these settings that concerns the switch; throws the build's own error. */
function buildAccepts(vars) {
  pageBrand(vars);
  pageLegacySeats(vars);
  pageBrandPrerequisites(vars);
  pageV5Config(vars);
}
const said = (vars, keys) => keys.map((k) => `${k}=${vars[k]}`).join(", ");
/** A DEPLOYMENT_ENV the freeze accepts (not blank, not "unset": the v5 policy names "unset" an environment, but the freeze refuses it,
 *  rebrand second check TRIAL-ENV-UNSET). */
const freezeTakes = (vars, env) => { try { return pageLegacySeats({ ...vars, LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: env }).legacySeats === "frozen"; } catch { return false; } };

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
  if (vars.EMAIL_FROM === TRIAL_SETTINGS.EMAIL_FROM || MARK_LINE.test(text))
    return { action: "fail", reason: `wrangler.jsonc carries the trial's own placeholder sender (${TRIAL_SETTINGS.EMAIL_FROM}) or its line: this is the trial's result, already applied (never apply it twice, never commit it)` };
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
    DEPLOYMENT_ENV: has("DEPLOYMENT_ENV") && freezeTakes(vars, vars.DEPLOYMENT_ENV) ? vars.DEPLOYMENT_ENV : TRIAL_SETTINGS.DEPLOYMENT_ENV,
  };
  if (!has("EMAIL_FROM")) return { action: "fail", reason: "wrangler.jsonc: no EMAIL_FROM line to put the trial settings after" };
  let out = text, last = "EMAIL_FROM";
  const before = {};
  try {
    for (const [k, v] of Object.entries(want)) {
      const raw = rawVar(out, k);
      if (raw !== null && typeof vars[k] !== "string") return { action: "fail", reason: `wrangler.jsonc sets ${k} to something other than a text value, which the trial does not rewrite` };
      if (raw !== null && vars[k] === v) continue; // kept as committed
      before[k] = raw;
      out = setRawVar(out, k, JSON.stringify(v), { after: last });
      if (raw === null) last = k;
    }
    // the trial's own line, right after the sender's (whole-line comment), so the suite's stand-in takes back exactly these values
    const at = out.indexOf("\n", out.indexOf('"EMAIL_FROM"')) + 1;
    const indent = /^[ \t]*/.exec(out.slice(out.lastIndexOf("\n", out.indexOf('"EMAIL_FROM"')) + 1))[0];
    out = `${out.slice(0, at)}${indent}${TRIAL_MARK}${JSON.stringify(before)}\n${out.slice(at)}`;
  } catch (e) { return { action: "fail", reason: `the trial could not write the switch into wrangler.jsonc (${e.message})` }; }
  let after;
  try { after = varsOf(out); } catch (e) { return { action: "fail", reason: `the trial could not write the switch into wrangler.jsonc (${e.message})` }; }
  for (const [k, v] of Object.entries(want)) if (after[k] !== v) return { action: "fail", reason: `the trial could not write ${k} into wrangler.jsonc` };
  if (undoTrial(out) !== text) return { action: "fail", reason: "the trial's change to wrangler.jsonc could not be taken back exactly" };
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
