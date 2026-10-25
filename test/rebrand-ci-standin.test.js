// The rebrand stage's second check (Citycoin.dev label migration, S48): S06-CI-RED and STANDIN-MULTILINE (the suite's stand-in for today's
// site takes back only what the switch or its CI trial wrote, by the JSONC structure, so a DEPLOYMENT_ENV or SITE_ORIGINS committed for stage
// S06 stays as committed and a value written over several lines stays readable) and TRIAL-ENV-UNSET (the trial on a committed DEPLOYMENT_ENV
// "unset"). Every sender below is a clearly fake fixture; every other value is the committed file's own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TODAY_EMAIL_FROM, SWITCH_ON_SETTINGS, committedIsToday, realWrangler, todayWrangler } from "./helpers/today-build.mjs";
import { TRIAL_SETTINGS, trialPlan, withTrialSettings } from "../scripts/brand/switch-trial.mjs";
import { jsoncTree, rawVar, removeVar, setRawVar, setVar, undoTrial, varsOf } from "../scripts/brand/wrangler-vars.mjs";
import { pageBrandPrerequisites, pageV5Config } from "../scripts/pages/build.mjs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/* ---------------------------------------------------------------- the committed bases (each written by its place in the JSONC) */
// today's committed file: the file on disk as the suite's stand-in reads it, so the same in the CI trial job (where the file on disk is the
// trial's copy) and once a configuration pull request commits the switch (the switch-trial run of the rebased branch caught the first)
const COMMITTED = todayWrangler(realWrangler());
const add = (base, set) => { let out = base, last = "EMAIL_FROM"; for (const [k, v] of Object.entries(set)) { const had = rawVar(out, k) !== null; out = v === undefined ? removeVar(out, k) : setVar(out, k, v, { after: last }); if (v !== undefined && !had) last = k; } return out; };
// stage S06 (branch cc/s06, the owner's go of 25 Oct 2026): citycoin.dev listed beside vicinity.city, the production environment named
const S06 = add(COMMITTED, { SITE_ORIGINS: "https://citycoin.dev https://vicinity.city", DEPLOYMENT_ENV: "production" });
// the same list written as a JSON array over several lines, which the page build and the Worker accept as well
const S06_LINES = setRawVar(S06, "SITE_ORIGINS", '[\n      "https://citycoin.dev",\n      "https://vicinity.city"\n    ]');
const UNSET_ENV = add(COMMITTED, { DEPLOYMENT_ENV: "unset" });
const BASES = [["as committed", COMMITTED], ["S06", S06], ["S06, SITE_ORIGINS over several lines", S06_LINES], ["DEPLOYMENT_ENV unset", UNSET_ENV]];
const OWNER_FROM = "Citycoin.dev <owner-supplied@mail.example.org>";
/** The configuration pull request that sets the switch on top of `base` (no trial: the committed file IS the switch). */
const configPr = (base) => add(base, { EMAIL_FROM: OWNER_FROM, BRAND: "citycoin", LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production" });

test("wrangler-vars: entries are found by the JSONC structure (comments, strings with //, values over several lines), and every edit undone gives back the same bytes", () => {
  for (const [name, base] of BASES) {
    const vars = varsOf(base);
    const entries = jsoncTree(base).entries.find((e) => e.key === "vars").value.entries;
    assert.deepEqual(entries.map((e) => e.key), Object.keys(vars), `${name}: the same keys as the whole-line reader`);
    for (const e of entries) assert.deepEqual(JSON.parse(base.slice(e.valueStart, e.valueEnd)), vars[e.key], `${name}: ${e.key}`);
    // a new key and its removal, a value replaced and put back: the same bytes
    assert.equal(removeVar(setVar(base, "BRAND", "citycoin", { after: "EMAIL_FROM" }), "BRAND"), base, name);
    assert.equal(setRawVar(setVar(base, "EMAIL_FROM", "X <x@example.com>"), "EMAIL_FROM", rawVar(base, "EMAIL_FROM")), base, name);
    // the last entry too (no comma of its own): its removal takes the comma before it, and the text still parses
    const last = entries[entries.length - 1].key, without = removeVar(base, last);
    assert.equal(Object.hasOwn(varsOf(without), last), false);
    assert.doesNotThrow(() => JSON.parse(without.replace(/^\s*\/\/.*$/gm, "")), `${name}: no comma left before the closing brace`);
  }
  // STANDIN-MULTILINE: a value over several lines is removed and replaced as one entry
  assert.deepEqual(varsOf(S06_LINES).SITE_ORIGINS, ["https://citycoin.dev", "https://vicinity.city"]);
  assert.deepEqual(pageV5Config(varsOf(S06_LINES)), { ok: true }, "a configuration the page build takes");
  const gone = removeVar(S06_LINES, "SITE_ORIGINS");
  assert.equal(Object.hasOwn(varsOf(gone), "SITE_ORIGINS"), false);
  assert.deepEqual({ ...varsOf(gone), SITE_ORIGINS: varsOf(S06_LINES).SITE_ORIGINS }, varsOf(S06_LINES), "nothing else changed");
  assert.equal(varsOf(setVar(S06_LINES, "SITE_ORIGINS", "https://citycoin.dev")).SITE_ORIGINS, "https://citycoin.dev");
});

test("S06-CI-RED (trial job): the stand-in gives the suite exactly the committed wrangler.jsonc back from the trial's copy, S06's settings included, on every base", () => {
  for (const [name, base] of BASES) {
    const p = trialPlan(base);
    assert.equal(p.action, "write", `${name}: ${p.reason}`);
    assert.equal(varsOf(p.text).DEPLOYMENT_ENV, "production", `${name}: the trial's environment (TRIAL-ENV-UNSET: written over "unset")`);
    assert.deepEqual(pageBrandPrerequisites(varsOf(p.text)), { ok: true }, name);
    assert.equal(undoTrial(p.text), base, `${name}: the trial's own change, taken back`);
    assert.equal(todayWrangler(p.text), base, `${name}: what the suite reads in the trial job is the committed file, byte for byte`);
  }
  assert.equal(todayWrangler(COMMITTED), COMMITTED, "today's committed file: nothing to take back");
  assert.equal(todayWrangler(S06), S06, "S06's committed file (BRAND unset): nothing to take back");
});

test("S06-CI-RED (the configuration pull request): the stand-in takes back the switch's own settings only; SITE_ORIGINS and DEPLOYMENT_ENV stay as committed", () => {
  for (const [name, base] of BASES) {
    const committedSwitch = configPr(base);
    assert.equal(trialPlan(committedSwitch).action, "noop", `${name}: the trial writes nothing there`);
    const today = todayWrangler(committedSwitch), vars = varsOf(today);
    for (const k of SWITCH_ON_SETTINGS) assert.equal(Object.hasOwn(vars, k), false, `${name}: ${k} taken back`);
    assert.equal(vars.EMAIL_FROM, TODAY_EMAIL_FROM, `${name}: today's sender`);
    assert.deepEqual(vars.SITE_ORIGINS, varsOf(base).SITE_ORIGINS, `${name}: SITE_ORIGINS as committed`);
    assert.equal(vars.DEPLOYMENT_ENV, "production", `${name}: DEPLOYMENT_ENV as committed in the pull request, never stripped`);
    const others = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "DEPLOYMENT_ENV"));
    assert.deepEqual(others(vars), others(varsOf(base)), `${name}: every other setting as on the base`);
  }
  // with S06 committed first (the switch-on order), the stand-in gives back S06's file byte for byte
  assert.equal(todayWrangler(configPr(S06)), S06);
  assert.equal(todayWrangler(configPr(S06_LINES)), S06_LINES);
  // the settings that are today's anyway stay where they are (a blank BRAND, LEGACY_SEATS "on")
  const quiet = add(COMMITTED, { BRAND: "", LEGACY_SEATS: "on" });
  assert.equal(todayWrangler(quiet), quiet);
  // and what the suite reads is that file: as it is on disk while the committed build is today's, through the stand-in otherwise
  assert.equal(read("wrangler.jsonc"), COMMITTED);
  if (committedIsToday) assert.equal(realWrangler(), COMMITTED, "today's build: the file on disk, as it is");
});

test("TRIAL-ENV-UNSET: a committed DEPLOYMENT_ENV the freeze refuses ('unset') is replaced in the trial's copy and taken back after; one the freeze takes is kept", () => {
  assert.deepEqual(pageV5Config(varsOf(UNSET_ENV)), { ok: true }, "a configuration the page build takes with BRAND unset");
  const p = trialPlan(UNSET_ENV);
  assert.equal(p.action, "write", p.reason);
  assert.doesNotMatch(p.line, /kept as committed/);
  for (const env of ["test", "preview", "production"]) {
    const q = trialPlan(add(COMMITTED, { DEPLOYMENT_ENV: env }));
    assert.equal(varsOf(q.text).DEPLOYMENT_ENV, env, env);
    assert.match(q.line, /kept as committed: DEPLOYMENT_ENV\)$/, env);
  }
  assert.equal(TRIAL_SETTINGS.DEPLOYMENT_ENV, "production");
  assert.throws(() => withTrialSettings(p.text), /trial's own placeholder sender/);
});

