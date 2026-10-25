/**
 * The v5 policy at run time (Citycoin.dev master v5, stage S07; docs/citycoin-master/schema-and-api.md sections 2.1, 2.2 and 4.9;
 * implementation-report.md stage S07). One of the two modules of the Worker that read the policy module (the other is the amendment-01
 * adapter src/maintoken.js; test/masterpolicy.test.js keeps it that way).
 *
 *   deploymentFromEnv(env)   the policy's deployment block as this Worker's settings describe it: the switches of FLAG_VALUES (an unset
 *                            or blank one is its default), the environment (DEPLOYMENT_ENV), the inputs that have a Worker setting today
 *                            (INPUT_SETTINGS) and the presence, never the value, of the two archive secrets. Every other input (the
 *                            program, the cluster, the role keys, the quote configs and their chain facts) has no Worker setting yet: it
 *                            stays null, so a switch that needs one is refused with its MISSING_* name until the stage that builds that
 *                            switch adds the setting here.
 *   policyConfig(env)        { ok, errors: [{ code, path }], environment }: the policy's validatePolicy on that deployment. With every
 *                            v5 switch and setting unset the deployment is the policy's own default block, which validates (a test
 *                            checks it), so that case is answered without walking the policy again. Memoized per deployment; never
 *                            throws (a failure of the check itself is CONFIG_CHECK_FAILED, which counts as refused).
 *   checkPolicyConfig(env)   the check run at the first request of an isolate (src/index.js) and at each job start (src/jobs.js): each named
 *                            error is logged once per isolate, as its code and path only, never a value. With everything unset it logs
 *                            nothing: today's site. While MAIN_TOKEN_V5 is on, the three amendment-01 keys are reported by
 *                            src/maintoken.js checkDeploymentConfig (stage S02A), so they are not logged a second time here. While
 *                            HOST_REDIRECT is set on, each reason that holds it off is logged once too.
 *   publicV5(env)            PUBLIC_V5 is on AND the configuration is accepted (schema-and-api.md 2.2: validation "keeps every dependent
 *                            feature off while any error exists"). Off: GET /api/policy answers as before and /api/policy/master is an
 *                            unknown path.
 *   mainTokenV5(env)         MAIN_TOKEN_V5 as the Worker applies it: on only while every precondition holds (mainTokenRefusals below:
 *                            the deployed pages were built with the switch, the label set they were built with is this Worker's, and both
 *                            configuration checks accept the deployment). Otherwise the whole Worker answers exactly as with the switch
 *                            off. Every main-token consumer reads the switch through this, never through src/flags.js mainTokenV5On.
 *   hostRedirect(env)        HOST_REDIRECT as the Worker applies it (stage S03, src/hostroute.js): on only while every precondition holds
 *                            (hostRedirectRefusals below: the deployed wrangler.jsonc sends every page through the Worker, SITE_ORIGIN and
 *                            SITE_ORIGINS are accepted, and the v5 configuration check accepts the deployment, which needs DEPLOYMENT_ENV and
 *                            SITE_ORIGIN = https://citycoin.dev). Otherwise src/index.js answers exactly as with the switch off.
 *   walletOnly(env)          WALLET_ONLY as the Worker applies it (stages S09 and S10, src/challenge.js and src/auth.js): on only while its OWN
 *                            preconditions hold (walletOnlyRefusals below: DEPLOYMENT_ENV, and SITE_ORIGIN and SITE_ORIGINS, which the switch
 *                            requires by name). An error in an unrelated input (an OFFICIAL_X_URL typo, a refused MAIN_TOKEN_MINT, a malformed
 *                            LEGACY_LINK_UNTIL) switches off only its own feature, never wallet-only sign-in.
 *   walletOnlyHeld(env)      WALLET_ONLY is set on but its own preconditions refuse it: the Worker FAILS CLOSED (review finding SEC-1; master
 *                            section 05 BR-03 "Do not restore Google as the new dashboard login path"). Only wallet-bound sessions count
 *                            (src/auth.js getSession), the Google, e-mail, password and tiny-transfer routes stay 404, and every sign-in,
 *                            registration and pairing route answers 503 unavailable (src/index.js) until the configuration is fixed. Only
 *                            WALLET_ONLY unset (or off) is today's site.
 *   legacyLink(env, now)     the legacy link window as the Worker applies it (stage S14, src/legacy.js): { state: "off" | "open" | "closed",
 *                            until }. Open only while WALLET_ONLY counts, LEGACY_LINK is on and LEGACY_LINK_UNTIL is an ISO date still ahead;
 *                            closed once that LEGACY_LINK_UNTIL has passed while LEGACY_LINK is still on (its routes answer 410; the scheduled
 *                            job marks unlinked accounts closed_unresolved only after a window was recorded open, src/legacy.js); otherwise off,
 *                            which is today's site (or, under WALLET_ONLY alone, the S10 answers). A date alone never makes a window.
 *   legacySeats(env)         LEGACY_SEATS as the Worker applies it (stage S16, src/seats.js): "frozen" while LEGACY_SEATS=frozen is accepted
 *                            by the v5 check for the switch's OWN inputs and the deployed pages were built with it (legacySeatsRefusals below),
 *                            or while MAIN_TOKEN_V5 counts (owner amendment 01 freezes the seats with the main token: one gate for both); "held"
 *                            while LEGACY_SEATS=frozen is set but refused (its own inputs, or pages built without it), or while the deployed
 *                            pages were built with it and this Worker's setting is not "frozen", or while LEGACY_SEATS holds a value outside
 *                            the switch's set (the freeze holds: master section 15, see legacySeats); "on" with LEGACY_SEATS unset, blank or
 *                            "on", which is today's site. An error in an unrelated input (an OFFICIAL_X_URL typo, a refused MAIN_TOKEN_MINT)
 *                            never unfreezes it.
 *   legacySeatsFrozen(env)   legacySeats(env) is "frozen" or "held": every legacy seat, squad, endorsement, objection, resign and election
 *                            writer answers 410, the job skips its seats and elections steps, and the founder hold streaks stop.
 *   legacyLaunch(env)        LEGACY_LAUNCH as the Worker applies it (stage S23, src/legacylaunch.js): "off" while LEGACY_LAUNCH=off is accepted by the
 *                            v5 check for the switch's OWN inputs (DEPLOYMENT_ENV); "held" while LEGACY_LAUNCH=off is set but refused, or while it
 *                            holds a value outside the switch's set (the path stays closed: never reopened by a configuration mistake); "on" with
 *                            LEGACY_LAUNCH unset, blank or "on", which is today's site. An error in an unrelated input never closes it.
 *   legacyLaunchClosed(env)  legacyLaunch(env) is "off" or "held": every legacy approval, launch and founder studio writer answers 410.
 *   IDENTITY_POLICY          the two identity lifetimes of the policy (policy.identity: a 120-second single-use challenge, a 300-second
 *                            single-use hand-off), so the challenge service reads the master's numbers, never its own; and the policy
 *                            version a location verified under this master records (users.loc_policy, stage S11).
 *   publicMaster(env, opts)  the `master` key of GET /api/policy: version, approved and active pairs, the selection schedule, the fee
 *                            policy, the main_token block (mint null until configured, verified and in use), legacy_tokens, official_links
 *                            (null when unset) and the public authority addresses. Every part says its own status.
 *   masterPolicyAnswer(env, opts)  GET /api/policy/master: the same, plus the policy values and their master sections.
 *   policyDigest()           sha256 (hex) of the canonical JSON (sorted keys, no spaces) of the policy values as the document holds them
 *                            (the three configured values null), so two deployments can tell whether they run the same policy.
 *
 * Nothing here holds a mint, an X address or a Telegram address of its own: the main token and the links come from src/maintoken.js,
 * which reads MAIN_TOKEN_MINT, OFFICIAL_X_URL and OFFICIAL_TELEGRAM_URL (none of them supplied by the owner yet).
 */
import { FLAG_VALUES, MASTER_POLICY, nextSelectionBoundary, validatePolicy } from "./masterpolicy.js";
import { hostRedirectOn, legacyLaunchValue, legacyLinkOn, legacySeatsValue, mainTokenV5On, publicV5On, walletOnlyOn } from "./flags.js";
import { deploymentAccepted, mainMint, officialLinks } from "./maintoken.js";
import { DEFAULT_SITE_ORIGIN, DEFAULT_SITE_ORIGINS, normalizeOrigin, siteConfig } from "./site-config.js";
import { brandOf } from "./brand.js";
import { PAGES_BUILT } from "./pages-built.js";

const P = MASTER_POLICY.policy;
const DEFAULT_DEPLOYMENT = MASTER_POLICY.deployment;

/** The Worker setting that names the deployment environment (unset, test, preview, production; unset or blank = "unset"). */
export const ENVIRONMENT_SETTING = "DEPLOYMENT_ENV";
/** The deployment inputs that have a Worker setting of the same name today. */
export const INPUT_SETTINGS = Object.freeze(["SITE_ORIGIN", "SITE_ORIGINS", "LEGACY_LINK_UNTIL", "MAIN_TOKEN_MINT", "OFFICIAL_X_URL", "OFFICIAL_TELEGRAM_URL"]);
/** The public authority roles of the policy's deployment inputs (public keys, never secrets). */
export const AUTHORITY_ROLES = Object.freeze(["program_id", "governance_vault", "treasury", "keeper", "selection_publisher", "selection_verifier",
  "hourly_verifier_a", "hourly_verifier_b", "metadata_admin", "guardian"]);

const blank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** SITE_ORIGINS as src/site-config.js reads it (a list, or one string of origins separated by commas or spaces), each origin normalized
 *  when it is one; anything else is kept as given, so the check names it (SITE_ORIGINS_INVALID). */
function originList(raw) {
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/).filter(Boolean) : [raw];
  if (!items.length) return [raw]; // "," names no origin: malformed, never "unset"
  return items.map((o) => normalizeOrigin(o) ?? o);
}

/** The deployment block this Worker's settings describe (see the top of this file). */
export function deploymentFromEnv(env) {
  const e = env !== null && typeof env === "object" ? env : {};
  const flags = {};
  for (const name of Object.keys(FLAG_VALUES)) if (!blank(e[name])) flags[name] = String(e[name]).trim().toLowerCase();
  const environment = blank(e[ENVIRONMENT_SETTING]) ? "unset" : String(e[ENVIRONMENT_SETTING]).trim().toLowerCase();
  const inputs = {};
  // the site's own origins, read the way src/site-config.js reads them: when one of the pair is set, a blank other one is today's value
  if (!blank(e.SITE_ORIGIN) || !blank(e.SITE_ORIGINS)) {
    inputs.SITE_ORIGIN = blank(e.SITE_ORIGIN) ? DEFAULT_SITE_ORIGIN : (normalizeOrigin(e.SITE_ORIGIN) ?? e.SITE_ORIGIN);
    inputs.SITE_ORIGINS = blank(e.SITE_ORIGINS) ? [...DEFAULT_SITE_ORIGINS] : originList(e.SITE_ORIGINS);
  }
  for (const key of ["LEGACY_LINK_UNTIL", "MAIN_TOKEN_MINT", "OFFICIAL_X_URL", "OFFICIAL_TELEGRAM_URL"]) {
    if (!blank(e[key])) inputs[key] = typeof e[key] === "string" ? e[key].trim() : e[key];
  }
  const secrets = {};
  for (const name of Object.keys(DEFAULT_DEPLOYMENT.inputs.secrets_present)) secrets[name] = !blank(e[name]); // presence only
  return {
    environment,
    fixture: false, // local test fixtures never run in a Worker
    flags: { ...DEFAULT_DEPLOYMENT.flags, ...flags },
    inputs: { ...DEFAULT_DEPLOYMENT.inputs, ...inputs, secrets_present: secrets },
  };
}

const DEFAULT_KEY = JSON.stringify(DEFAULT_DEPLOYMENT);
const ACCEPTED_DEFAULT = Object.freeze({ ok: true, errors: Object.freeze([]), environment: DEFAULT_DEPLOYMENT.environment });
const CHECK_FAILED = Object.freeze({ ok: false, errors: Object.freeze([Object.freeze({ code: "CONFIG_CHECK_FAILED", path: "deployment" })]), environment: "unset" });
let memo = { key: null, value: null };

const SITE_PATHS = Object.freeze({ SITE_ORIGIN_INVALID: "deployment.inputs.SITE_ORIGIN", SITE_ORIGIN_NOT_ALLOWED: "deployment.inputs.SITE_ORIGIN",
  SITE_ORIGINS_INVALID: "deployment.inputs.SITE_ORIGINS" });

/**
 * { ok, errors, environment }: the v5 configuration check for this environment (see the top of this file). The site origins count by the
 * stricter of the two readers: what src/site-config.js refuses (it takes bare https origins only, and the redirect and host code then fall
 * back to today's values) is refused here by the same name, even where validatePolicy alone would accept it (an http://localhost origin in
 * the test and preview environments), so an accepted configuration is one the Worker really runs with.
 */
export function policyConfig(env) {
  try {
    const deployment = deploymentFromEnv(env);
    const key = JSON.stringify(deployment); // public values and presence booleans only: never a secret
    if (key === DEFAULT_KEY) return ACCEPTED_DEFAULT;
    const site = siteConfig(env).problems;
    const memoKey = `${key}|${site.join(",")}`;
    if (memo.key === memoKey) return memo.value;
    const r = validatePolicy({ ...MASTER_POLICY, deployment });
    const errors = r.errors.map((x) => ({ code: x.code, path: x.path }));
    for (const code of site) if (!errors.some((x) => x.code === code)) errors.push({ code, path: SITE_PATHS[code] || "deployment.inputs.SITE_ORIGIN" });
    const value = Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors.map((x) => Object.freeze(x))), environment: deployment.environment });
    memo = { key: memoKey, value };
    return value;
  } catch {
    return CHECK_FAILED;
  }
}

/** The amendment-01 keys that src/maintoken.js reports while MAIN_TOKEN_V5 is on. */
const MAIN_TOKEN_PATHS = new Set(["MAIN_TOKEN_MINT", "OFFICIAL_X_URL", "OFFICIAL_TELEGRAM_URL"].map((k) => `deployment.inputs.${k}`));
let reported = new Set();
/** Tests: a fresh isolate. */
export const _resetPolicyCheck = () => { reported = new Set(); memo = { key: null, value: null }; };

/**
 * { ok, codes }: the configuration check at the first request of an isolate and at each job start. Each named error is logged once per
 * isolate (its code and path, never a value). While MAIN_TOKEN_V5 is set on, each reason that holds it off is logged once too
 * ("main token switch refused <code>"), so a switch that does nothing says why. It never throws, and it changes no answer by itself: what
 * it refuses stays off.
 */
export function checkPolicyConfig(env, { log = (...args) => console.error(...args) } = {}) {
  const r = policyConfig(env);
  let tokenOn = false;
  try { tokenOn = mainTokenV5On(env); } catch { /* the switch reads as off */ }
  const say = (key, ...line) => {
    if (reported.has(key)) return;
    reported.add(key);
    try { log(...line); } catch { /* a log line is never worth a failed request */ }
  };
  for (const e of r.errors) {
    if (tokenOn && MAIN_TOKEN_PATHS.has(e.path)) continue; // reported by src/maintoken.js checkDeploymentConfig
    say(`${e.code}|${e.path}`, "policy config refused", e.code, e.path);
  }
  if (tokenOn) for (const code of mainTokenRefusals(env)) say(`gate|${code}`, "main token switch refused", code);
  let redirectOn = false;
  try { redirectOn = hostRedirectOn(env); } catch { /* the switch reads as off */ }
  if (redirectOn) for (const code of hostRedirectRefusals(env)) say(`host|${code}`, "host redirect switch refused", code);
  let walletOn = false;
  try { walletOn = walletOnlyOn(env); } catch { /* the switch reads as off */ }
  if (walletOn) for (const code of walletOnlyRefusals(env)) say(`wallet|${code}`, "wallet-only switch refused", code);
  let legacyOn = false;
  try { legacyOn = legacyLinkOn(env); } catch { /* the switch reads as off */ }
  if (legacyOn) for (const code of legacyLinkRefusals(env)) say(`legacy|${code}`, "legacy link switch refused", code);
  // the legacy seat freeze held rather than accepted (stage S16: LEGACY_SEATS=frozen refused, a value outside the switch's set, or pages built
  // frozen without it): the freeze holds, and the log says why the configuration is wrong. Unset with pages built without it (today): no line
  for (const code of legacySeatsRefusals(env)) say(`seats|${code}`, "legacy seats switch refused", code, "(held frozen)");
  // the legacy launch path held closed rather than accepted (stage S23: LEGACY_LAUNCH=off refused, or a value outside the switch's set): the
  // path stays closed, and the log says why the configuration is wrong. Unset, blank or "on" (today): no line
  for (const code of legacyLaunchRefusals(env)) say(`launch|${code}`, "legacy launch switch refused", code, "(held off)");
  return { ok: r.ok, codes: r.errors.map((e) => e.code) };
}

/** PUBLIC_V5 is on and the configuration is accepted: the only way to read the switch. Never throws (anything odd reads as off). */
export function publicV5(env) {
  try { return publicV5On(env) && policyConfig(env).ok; } catch { return false; }
}

/* ---------------------------------------------------------------- MAIN_TOKEN_V5 as the Worker applies it */

let pagesBuilt = PAGES_BUILT;
/** Tests only: stand in for a page build made with the switch ({ mainTokenV5: true, brand }), with every page sent through the Worker
 *  ({ pagesReachWorker: true }) or with the legacy seats frozen ({ legacySeats: "frozen" }), or null for the committed src/pages-built.js. */
export const _pagesBuiltForTests = (p) => { pagesBuilt = p ? Object.freeze({ ...PAGES_BUILT, ...p }) : PAGES_BUILT; };

/**
 * Why MAIN_TOKEN_V5 does not count in this environment: [] when every precondition holds, else the reasons (codes only, never a value).
 *   MAIN_TOKEN_V5_PAGES_NOT_BUILT   the deployed pages and the client scripts were not built for the switch (src/pages-built.js, written
 *                                   by the page build from wrangler.jsonc). The pages are static files the Worker never sees (wrangler.jsonc
 *                                   run_worker_first lists only /api/*, /coin-meta/* and /official-coins.csv, and not_found_handling serves
 *                                   the 404 page from the assets too), so their footers, their /official groups and the client scripts'
 *                                   $VICINITY labels can follow the switch only through the build, and the build refuses the switch until
 *                                   the label migration (stage S48). A switch set only in the Cloudflare dashboard therefore does nothing.
 *   MAIN_TOKEN_V5_BRAND_MISMATCH    BRAND is unknown or is not the label set the pages were built with (the build accepts the switch only
 *                                   with a known label set other than today's, so the main token never appears under today's labels).
 *   MAIN_TOKEN_V5_CONFIG_REFUSED    src/maintoken.js refuses MAIN_TOKEN_MINT, OFFICIAL_X_URL or OFFICIAL_TELEGRAM_URL (unset, malformed,
 *                                   legacy): the switch never runs without a usable main token (amendment 01 section 5).
 *   MAIN_TOKEN_V5_POLICY_REFUSED    the v5 configuration check refuses the deployment (an unnamed environment, legacy seats not frozen, any
 *                                   other named error): "keeps every dependent feature off while any error exists" (schema-and-api.md 2.2).
 */
export function mainTokenRefusals(env) {
  try {
    const out = [];
    if (pagesBuilt.mainTokenV5 !== true) out.push("MAIN_TOKEN_V5_PAGES_NOT_BUILT");
    const b = brandOf(env);
    if (b.problem || b.value !== pagesBuilt.brand) out.push("MAIN_TOKEN_V5_BRAND_MISMATCH");
    if (!deploymentAccepted(env)) out.push("MAIN_TOKEN_V5_CONFIG_REFUSED");
    if (!policyConfig(env).ok) out.push("MAIN_TOKEN_V5_POLICY_REFUSED");
    return out;
  } catch {
    return ["MAIN_TOKEN_V5_CHECK_FAILED"];
  }
}

/** MAIN_TOKEN_V5 is set on AND nothing refuses it (above). Never throws: anything odd reads as off, which is today's site. */
export function mainTokenV5(env) {
  try { return mainTokenV5On(env) && mainTokenRefusals(env).length === 0; } catch { return false; }
}

/* ---------------------------------------------------------------- HOST_REDIRECT as the Worker applies it */

/**
 * Why HOST_REDIRECT does not count in this environment: [] when every precondition holds, else the reasons (codes only, never a value).
 *   HOST_REDIRECT_PAGES_BYPASS_WORKER  the deployed wrangler.jsonc does not send every request through the Worker first (its assets block's
 *                                      run_worker_first is not true; the page build records it in src/pages-built.js pagesReachWorker).
 *                                      Today run_worker_first lists only /api/*, /coin-meta/* and /official-coins.csv, so on an old host
 *                                      the pages would still be served straight from the static assets while their /api writes answered
 *                                      421: a half-moved site. The switch stays off until the pages reach the Worker.
 *   HOST_REDIRECT_SITE_REFUSED         src/site-config.js has no accepted configuration (SITE_ORIGIN and SITE_ORIGINS unset, or refused):
 *                                      no configured redirect target.
 *   HOST_REDIRECT_POLICY_REFUSED       the v5 configuration check refuses the deployment: DEPLOYMENT_ENV unset (ENVIRONMENT_UNSET),
 *                                      SITE_ORIGIN missing (MISSING_SITE_ORIGIN) or not https://citycoin.dev
 *                                      (HOST_REDIRECT_TARGET_NOT_CANONICAL), or any other named error (schema-and-api.md 2.2: "keeps every
 *                                      dependent feature off while any error exists").
 */
export function hostRedirectRefusals(env) {
  try {
    const out = [];
    if (pagesBuilt.pagesReachWorker !== true) out.push("HOST_REDIRECT_PAGES_BYPASS_WORKER");
    if (!siteConfig(env).configured) out.push("HOST_REDIRECT_SITE_REFUSED");
    if (!policyConfig(env).ok) out.push("HOST_REDIRECT_POLICY_REFUSED");
    return out;
  } catch {
    return ["HOST_REDIRECT_CHECK_FAILED"];
  }
}

/** HOST_REDIRECT is set on AND nothing refuses it (above). Never throws: anything odd reads as off, which is today's site. With the switch
 *  unset this reads one setting and nothing else, so the Worker's every request costs what it cost before. */
export function hostRedirect(env) {
  try { return hostRedirectOn(env) && hostRedirectRefusals(env).length === 0; } catch { return false; }
}

/* ---------------------------------------------------------------- WALLET_ONLY as the Worker applies it */

/** The policy's identity lifetimes in seconds (policy.identity; master section 18: two-minute challenges; section 19 step 4: five-minute
 *  hand-offs). Read here so src/challenge.js never holds a number of its own (only this module and src/maintoken.js read the policy). */
export const IDENTITY_POLICY = Object.freeze({ challengeSeconds: P.identity.challenge_seconds, handoffSeconds: P.identity.handoff_seconds,
  challengeSingleUse: P.identity.challenge_single_use, challengeBinds: Object.freeze([...P.identity.challenge_binds]),
  // the policy version a location verified under this master records (users.loc_policy; master section 19 step 3, stage S11)
  policyVersion: MASTER_POLICY.policy_version });

/**
 * The v5 check's codes that belong to WALLET_ONLY itself: the environment it must name, and the two origins it requires by name (their absence,
 * their shape, SITE_ORIGIN outside SITE_ORIGINS), or a check that could not run. Every other code (another switch's input, an official link,
 * the main token, LEGACY_LINK_UNTIL) refuses only its own feature (review finding SEC-1).
 */
export const WALLET_ONLY_CODES = Object.freeze(["CONFIG_CHECK_FAILED", "DEPLOYMENT_MISSING", "ENVIRONMENT_INVALID", "ENVIRONMENT_UNSET",
  "MISSING_SITE_ORIGIN", "MISSING_SITE_ORIGINS", "SITE_ORIGIN_INVALID", "SITE_ORIGIN_NOT_ALLOWED", "SITE_ORIGINS_INVALID"]);
/** The v5 check's codes that belong to LEGACY_LINK itself (its date, and the rule that the window exists only under WALLET_ONLY). */
export const LEGACY_LINK_CODES = Object.freeze(["MISSING_LEGACY_LINK_UNTIL", "LEGACY_LINK_UNTIL_INVALID", "LEGACY_LINK_WITHOUT_WALLET_ONLY"]);
const ownErrors = (env, codes, flag) => policyConfig(env).errors.filter((e) => codes.includes(e.code) || e.path === `deployment.flags.${flag}`);

/**
 * Why WALLET_ONLY does not count in this environment: [] when every precondition holds, else the reasons (codes only, never a value).
 *   WALLET_ONLY_SITE_REFUSED    src/site-config.js has no accepted configuration (SITE_ORIGIN and SITE_ORIGINS unset, or refused): a challenge
 *                               names the allowlist entry it is issued for, and with no allowlist there is none to name.
 *   WALLET_ONLY_POLICY_REFUSED  the v5 configuration check refuses one of the switch's OWN inputs (WALLET_ONLY_CODES): DEPLOYMENT_ENV unset
 *                               (ENVIRONMENT_UNSET), SITE_ORIGIN or SITE_ORIGINS missing (MISSING_SITE_ORIGIN, MISSING_SITE_ORIGINS: the switch
 *                               requires both by name) or malformed. An error elsewhere in the deployment is not a reason here.
 * Set but refused, the Worker fails closed (walletOnlyHeld below): it never falls back to today's Google, e-mail and password logins.
 */
export function walletOnlyRefusals(env) {
  try {
    const out = [];
    if (!siteConfig(env).configured) out.push("WALLET_ONLY_SITE_REFUSED");
    if (ownErrors(env, WALLET_ONLY_CODES, "WALLET_ONLY").length) out.push("WALLET_ONLY_POLICY_REFUSED");
    return out;
  } catch {
    return ["WALLET_ONLY_CHECK_FAILED"];
  }
}

/** WALLET_ONLY is set on AND nothing refuses it (above). Never throws: anything odd reads as off. With the switch unset this reads one setting
 *  and nothing else. */
export function walletOnly(env) {
  try { return walletOnlyOn(env) && walletOnlyRefusals(env).length === 0; } catch { return false; }
}

/**
 * WALLET_ONLY is set on but refused (walletOnlyRefusals is not empty): the identity routes fail closed (see the top of this file). False with the
 * switch unset, off or counting. Never throws: a switch that cannot be read reads as unset.
 */
export function walletOnlyHeld(env) {
  try { return walletOnlyOn(env) && walletOnlyRefusals(env).length > 0; } catch { return false; }
}

/* ---------------------------------------------------------------- LEGACY_LINK as the Worker applies it */

/**
 * LEGACY_LINK_UNTIL as an instant (milliseconds), or null when it is unset, blank or not the ISO 8601 date or time the v5 check accepts
 * (masterpolicy.js: YYYY-MM-DD, or YYYY-MM-DDThh:mm[:ss[.fff]] with Z or an offset). A bare date is the start of that day in UTC (Date.parse),
 * so "2026-12-31" closes the window at 2026-12-31T00:00:00Z: the pages show the exact instant, never a day that could be read as included.
 */
export function legacyLinkUntil(env) {
  try {
    const raw = env && env.LEGACY_LINK_UNTIL;
    if (typeof raw !== "string" || !raw.trim()) return null;
    const t = raw.trim();
    if (!/^\d{4}-\d{2}-\d{2}(T[0-9:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(t)) return null;
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : null;
  } catch { return null; }
}

/**
 * The legacy link window (stage S14; master section 05 BR-03; schema-and-api.md section 2.2): { state, until } (until: the ISO instant, or null).
 *   "open"    WALLET_ONLY counts, LEGACY_LINK is on and none of its own inputs is refused (LEGACY_LINK_CODES: MISSING_LEGACY_LINK_UNTIL,
 *             LEGACY_LINK_UNTIL_INVALID), and LEGACY_LINK_UNTIL is still ahead of `now`. A Google- or e-mail-only member may log in at
 *             /connect?mode=legacy and link a wallet.
 *   "closed"  the same, but LEGACY_LINK_UNTIL has passed: every legacy route answers 410 and a restricted session counts for nothing. The scheduled
 *             job marks the accounts still without a wallet closed_unresolved only once a window was recorded open (src/legacy.js
 *             closeLegacyWindow, review finding SEC-4): a date in the past that never opened a window closes nobody.
 *   "off"     anything else: WALLET_ONLY does not count (today's site, or held: src/index.js), it counts without a window (the S10 answers: 404),
 *             or LEGACY_LINK is off (a LEGACY_LINK_UNTIL alone, however set, is no window, open or closed).
 * Never throws: anything odd reads as off.
 */
export function legacyLink(env, now = Date.now()) {
  try {
    if (!walletOnly(env) || !legacyLinkOn(env)) return LEGACY_OFF;
    const until = legacyLinkUntil(env);
    if (until === null || ownErrors(env, LEGACY_LINK_CODES, "LEGACY_LINK").length) return LEGACY_OFF;
    const iso = new Date(until).toISOString();
    return Object.freeze({ state: until <= now ? "closed" : "open", until: iso });
  } catch { return LEGACY_OFF; }
}
const LEGACY_OFF = Object.freeze({ state: "off", until: null });

/**
 * Why LEGACY_LINK=on does not open a window in this environment: [] when it does, else the reasons (codes only, never a value).
 *   LEGACY_LINK_WALLET_ONLY_OFF  WALLET_ONLY does not count here (unset, or refused: its own reasons are logged as wallet-only refusals): the window
 *                                exists only under wallet-only sign-in (LEGACY_LINK_WITHOUT_WALLET_ONLY when WALLET_ONLY is not even set on).
 *   LEGACY_LINK_POLICY_REFUSED   the v5 check refuses one of the switch's own inputs (LEGACY_LINK_UNTIL missing or not an ISO date). An error in
 *                                another input is not a reason here.
 *   LEGACY_LINK_UNTIL_PASSED     LEGACY_LINK_UNTIL is not ahead of `now`: the window is closed (its routes answer 410), never opened.
 */
export function legacyLinkRefusals(env, now = Date.now()) {
  try {
    const out = [];
    if (!walletOnly(env)) out.push("LEGACY_LINK_WALLET_ONLY_OFF");
    if (ownErrors(env, LEGACY_LINK_CODES, "LEGACY_LINK").length) out.push("LEGACY_LINK_POLICY_REFUSED");
    const until = legacyLinkUntil(env);
    if (until !== null && until <= now) out.push("LEGACY_LINK_UNTIL_PASSED");
    return out;
  } catch {
    return ["LEGACY_LINK_CHECK_FAILED"];
  }
}

/* ---------------------------------------------------------------- LEGACY_SEATS as the Worker applies it */

/**
 * The v5 check's codes that belong to LEGACY_SEATS itself: the environment a deployment that changes a switch must name, or a check that could
 * not run. Any error on the switch's own path (deployment.flags.LEGACY_SEATS) is its own too. Every other code (another switch's input, an
 * official link, the main token, the site origins) refuses only its own feature, never the freeze (the lesson of review finding SEC-1 of the
 * S09-S14 review, applied here: a freeze must never turn itself off because an unrelated input is wrong).
 */
export const LEGACY_SEATS_CODES = Object.freeze(["CONFIG_CHECK_FAILED", "DEPLOYMENT_MISSING", "ENVIRONMENT_INVALID", "ENVIRONMENT_UNSET"]);

/**
 * Why the legacy seat freeze is HELD rather than accepted in this environment: [] when it is accepted or not set at all, else the reasons
 * (codes only, never a value).
 *   LEGACY_SEATS_POLICY_REFUSED     LEGACY_SEATS=frozen and the v5 configuration check refuses one of the switch's own inputs
 *                                   (LEGACY_SEATS_CODES: DEPLOYMENT_ENV unset or not a known environment). An error elsewhere in the deployment
 *                                   is not a reason here.
 *   LEGACY_SEATS_PAGES_NOT_BUILT    LEGACY_SEATS=frozen but the deployed pages were not built with it (src/pages-built.js, written by the page
 *                                   build from wrangler.jsonc, has no legacySeats "frozen"): a switch set only in the Cloudflare dashboard. The
 *                                   writers are frozen all the same and the dashboards follow /api/me, but the static pages still carry the old
 *                                   founder copy until the switch is in wrangler.jsonc and the pages are built with it (stage S16 copy).
 *   LEGACY_SEATS_UNSET_PAGES_FROZEN the deployed pages were built with LEGACY_SEATS=frozen but this Worker's setting is not "frozen" (removed,
 *                                   "on", or a value outside the set, set in the Cloudflare dashboard): the pages no longer describe the old
 *                                   founder rules, so the writers never reopen behind them. Undoing the freeze is a configuration pull request
 *                                   that removes the switch from wrangler.jsonc and rebuilds the pages.
 *   LEGACY_SEATS_VALUE_REFUSED      LEGACY_SEATS is set to a value outside the switch's set (not blank, "on" or "frozen" once trimmed, any letter
 *                                   case: "off", "true", "freeze", a typo), which the v5 check also refuses by name (FLAG_VALUE_INVALID); the
 *                                   page build stops on it in wrangler.jsonc, so it comes from the Cloudflare dashboard. Review fix SEC-S16-3
 *                                   of stage S16: such a value used to read as today's site and reopened every writer; it now holds the freeze,
 *                                   like a refused DEPLOYMENT_ENV does (fail toward frozen: master lines 924, 471 and 1010, see legacySeats).
 * A refusal never unfreezes: legacySeats answers "held" and the writers keep answering 410 (see legacySeats).
 */
export function legacySeatsRefusals(env) {
  let value = "";
  try { value = legacySeatsValue(env); } catch { /* a setting that cannot be read reads as unset */ }
  const set = value === "frozen", other = value !== "" && value !== "on" && !set;
  try {
    const built = pagesBuilt.legacySeats === "frozen";
    if (!set && !other) return built ? ["LEGACY_SEATS_UNSET_PAGES_FROZEN"] : [];
    if (other) return built ? ["LEGACY_SEATS_VALUE_REFUSED", "LEGACY_SEATS_UNSET_PAGES_FROZEN"] : ["LEGACY_SEATS_VALUE_REFUSED"];
    const out = [];
    if (ownErrors(env, LEGACY_SEATS_CODES, "LEGACY_SEATS").length) out.push("LEGACY_SEATS_POLICY_REFUSED");
    if (!built) out.push("LEGACY_SEATS_PAGES_NOT_BUILT");
    return out;
  } catch {
    return ["LEGACY_SEATS_CHECK_FAILED"];
  }
}

/**
 * The legacy seats as the Worker applies them (stage S16): "frozen", "held" or "on".
 *   "frozen"  LEGACY_SEATS=frozen (trimmed, any letter case), the v5 check accepts the switch's own inputs and the deployed pages were built with
 *             it (src/pages-built.js legacySeats "frozen"); or MAIN_TOKEN_V5 counts, which the v5 check accepts only with LEGACY_SEATS=frozen
 *             (MAIN_TOKEN_ON_WITH_LEGACY_SEATS), so both freezes are this one gate.
 *   "held"    LEGACY_SEATS=frozen is set but refused (legacySeatsRefusals: its own inputs, or pages built without it), LEGACY_SEATS is set to a
 *             value outside the switch's set (review fix SEC-S16-3), or the pages were built with it and this Worker's setting is not "frozen".
 *             The freeze holds, toward the master's intent:
 *             master section 15, "Keep historical records readable, but do not let historical rules authorize new actions" (master-v5.txt
 *             line 924), with section 07 BR-05 "Old seven-day / rotating state: Retain historical records for audit only; remove their
 *             authority over new login, founder, launch and country-manager flows" (line 471) and section 17 "Seven-day stake ladder and
 *             founder-seat/election structures: Retain history for audit only" (line 1010). Freezing ends nobody's seat or term and keeps
 *             every record; reopening the writers on a configuration mistake could seat a founder or elect a manager under rules the master
 *             retired. The reason is logged once per isolate (checkPolicyConfig: "legacy seats switch refused <code> (held frozen)").
 *   "on"      LEGACY_SEATS unset, blank or "on" (trimmed, any letter case), with pages built without the freeze and MAIN_TOKEN_V5 not counting.
 *             This is today's site exactly. A value outside the switch's set ("off", "true", "freeze", a typo) is NOT this: the v5 check refuses
 *             it by name (FLAG_VALUE_INVALID at deployment.flags.LEGACY_SEATS) and it is held frozen (LEGACY_SEATS_VALUE_REFUSED, review fix
 *             SEC-S16-3 of stage S16: before that fix it read as "on", like a WALLET_ONLY that is not exactly "on", so a dashboard typo reopened every
 *             legacy writer; a freeze fails toward frozen). The page build stops on such a value in wrangler.jsonc (scripts/pages/build.mjs
 *             pageV5Config).
 * Never throws. With LEGACY_SEATS unset this reads one setting, the committed page record and then MAIN_TOKEN_V5 (one setting while that is
 * unset), as before.
 */
export function legacySeats(env) {
  let value = "";
  try { value = legacySeatsValue(env); } catch { /* a setting that cannot be read reads as unset */ }
  if ((value !== "" && value !== "on") || pagesBuilt.legacySeats === "frozen") return legacySeatsRefusals(env).length ? "held" : "frozen";
  return mainTokenV5(env) ? "frozen" : "on";
}

/** The legacy seat machinery is frozen ("frozen" or "held" above): the one test every writer, job step and reader asks. Never throws. */
export const legacySeatsFrozen = (env) => legacySeats(env) !== "on";

/* ---------------------------------------------------------------- LEGACY_LAUNCH as the Worker applies it */

/**
 * The v5 check's codes that belong to LEGACY_LAUNCH itself: the environment a deployment that changes a switch must name, or a check that could
 * not run. Any error on the switch's own path (deployment.flags.LEGACY_LAUNCH) is its own too. Every other code (another switch's input, an
 * official link, the main token, the site origins, LAUNCH_V5's own inputs) refuses only its own feature: an unrelated mistake never closes the
 * legacy launch path, and never reopens it.
 */
export const LEGACY_LAUNCH_CODES = Object.freeze(["CONFIG_CHECK_FAILED", "DEPLOYMENT_MISSING", "ENVIRONMENT_INVALID", "ENVIRONMENT_UNSET"]);

/**
 * Why the legacy launch path is HELD closed rather than accepted closed in this environment: [] when it is accepted or not set at all, else the
 * reasons (codes only, never a value).
 *   LEGACY_LAUNCH_POLICY_REFUSED  LEGACY_LAUNCH=off and the v5 configuration check refuses one of the switch's own inputs (LEGACY_LAUNCH_CODES:
 *                                 DEPLOYMENT_ENV unset or not a known environment). An error elsewhere in the deployment is not a reason here.
 *   LEGACY_LAUNCH_VALUE_REFUSED   LEGACY_LAUNCH holds a value outside the switch's set (not blank, "on" or "off" once trimmed, any letter case:
 *                                 "of", "false", "closed", a typo), which the v5 check also refuses by name (FLAG_VALUE_INVALID); the page build
 *                                 stops on it in wrangler.jsonc (scripts/pages/build.mjs pageV5Config), so it comes from the Cloudflare dashboard.
 * A refusal never reopens the path: legacyLaunch answers "held" and the writers keep answering 410 (see legacyLaunch for the master's lines).
 */
export function legacyLaunchRefusals(env) {
  let value = "";
  try { value = legacyLaunchValue(env); } catch { /* a setting that cannot be read reads as unset */ }
  if (value === "" || value === "on") return [];
  if (value !== "off") return ["LEGACY_LAUNCH_VALUE_REFUSED"];
  try { return ownErrors(env, LEGACY_LAUNCH_CODES, "LEGACY_LAUNCH").length ? ["LEGACY_LAUNCH_POLICY_REFUSED"] : []; }
  catch { return ["LEGACY_LAUNCH_CHECK_FAILED"]; }
}

/**
 * The legacy launch path as the Worker applies it (stage S23): "off", "held" or "on".
 *   "off"   LEGACY_LAUNCH=off (trimmed, any letter case) and the v5 check accepts the switch's own inputs (DEPLOYMENT_ENV). The live launchpad's
 *           approvals, launches and the founder studio are closed (src/legacylaunch.js); history reads stay.
 *   "held"  LEGACY_LAUNCH=off with its own inputs refused, or LEGACY_LAUNCH set to a value outside the switch's set: the path is closed all the
 *           same. The direction is the master's: section 15, "Keep historical records readable, but do not let historical rules authorize new
 *           actions" (master-v5.txt line 924); section 27, "Keep a narrow legacy compatibility module only if existing assets require it;
 *           prevent new launches from using that route" (lines 1566-1567); section 37 step 9, "Coordinate legacy new-launch disable" and step 10,
 *           "Deploy production flags disabled where required" (lines 2099-2101); section 16, "Runtime validation rejects incompatible flags and
 *           missing required deployment inputs with named errors" (line 982). A setting that says something other than "on" is never read as a
 *           reason to keep building launches on the program the master retires; closing ends no coin, and nothing launched is touched. The
 *           reason is logged once per isolate (checkPolicyConfig: "legacy launch switch refused <code> (held off)").
 *   "on"    LEGACY_LAUNCH unset, blank or "on" (trimmed, any letter case): today's site exactly, whatever any other setting says (an error in
 *           another input, LAUNCH_V5 refused for LAUNCH_V5_WITH_LEGACY_LAUNCH, a refused MAIN_TOKEN_MINT: none of them closes it).
 * Never throws. With LEGACY_LAUNCH unset this reads one setting and nothing else.
 */
export function legacyLaunch(env) {
  let value = "";
  try { value = legacyLaunchValue(env); } catch { /* a setting that cannot be read reads as unset */ }
  if (value === "" || value === "on") return "on";
  return legacyLaunchRefusals(env).length ? "held" : "off";
}

/** The legacy launch path is closed ("off" or "held" above): the one test every legacy launch writer and builder asks. Never throws. */
export const legacyLaunchClosed = (env) => legacyLaunch(env) !== "on";

/* ---------------------------------------------------------------- the public policy */

/** JSON with every object's keys sorted (UTF-16 code unit order) and no spaces: the form the digest is taken of. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

let digest = null;
/** sha256 (lower-case hex) of canonicalJson(policy values); null if this runtime cannot hash. Computed once per isolate. */
export function policyDigest() {
  if (!digest) {
    try {
      digest = crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(P)))
        .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), () => null);
    } catch { digest = Promise.resolve(null); }
  }
  return digest;
}

const STATEMENT = "Approved target values of the Citycoin.dev master change order v5. Approval is not evidence that anything is built, deployed, "
  + "audited or active: each part of this answer carries its own status, read from this deployment's configuration.";

/**
 * The main token as published: the configured MAIN_TOKEN_MINT (shape-checked by the policy, never a legacy mint) only while MAIN_TOKEN_V5
 * counts (mainTokenV5 above), the moment the site's own main-token consumers read it (amendment 01: the switch goes on only after the
 * verification record exists, section 4.3). Otherwise null: not configured, not shown. The official links follow the same rule as the
 * page footers (src/official.js socialProfiles): configured and accepted, and only while the switch counts.
 */
function configuredValues(env) {
  if (!mainTokenV5(env)) return { mint: null, xUrl: null, telegramUrl: null };
  const links = officialLinks(env);
  return { mint: mainMint(env), xUrl: links.xUrl, telegramUrl: links.telegramUrl };
}

/**
 * The `master` key of GET /api/policy (PUBLIC_V5). `routeFor(mint)` (optional) answers whether a live quote finds a route for the main
 * token (src/swap.js mainTokenRoute): purchase links read "hidden" until it says so.
 */
export async function publicMaster(env, { now = Date.now(), routeFor = null } = {}) {
  const cfg = policyConfig(env), inputs = deploymentFromEnv(env).inputs, v = configuredValues(env);
  let purchase = "hidden";
  if (v.mint && typeof routeFor === "function") {
    try { if ((await routeFor(v.mint)) === true) purchase = "shown"; } catch { /* no route known: hidden */ }
  }
  const fs = P.founder_selection, t = P.trading, pf = P.platform_fees;
  return {
    policy_version: MASTER_POLICY.policy_version,
    owner_delegation_date: MASTER_POLICY.owner_delegation_date,
    policy_digest: await policyDigest(),
    environment: cfg.environment,
    server_time: new Date(now).toISOString(),
    status: { policy: MASTER_POLICY.status.policy, statement: STATEMENT },
    // pairs read from the custom program's enabled quote configs on chain: none while no program is configured (program_id unset)
    active_pairs: [],
    approved_pairs: Object.entries(P.quote_configs).map(([id, q]) => ({ id, quote_symbol: q.quote_symbol, quote_mint: q.quote_mint,
      quote_decimals: q.quote_decimals, activation: q.activation, status: "approved_target" })),
    // the six-hour schedule; no selection runs in this deployment (SELECTION_V5 is not built)
    selection_schedule: { cycle_seconds: fs.cycle_seconds, epoch_formula: fs.epoch_formula, clock: fs.clock, boundaries_utc: [...fs.boundaries_utc],
      next_boundary: new Date(nextSelectionBoundary(Math.floor(now / 1000)) * 1000).toISOString(), first_selection_for_new_city: fs.first_selection_for_new_city,
      status: "approved_target" },
    // the fee of the custom curve and pool (not deployed); the live legacy launchpad fees are on /api/fees
    fee_status: { total_fee_bps: t.total_fee_bps, bps_denominator: t.bps_denominator, split_bps: { ...t.split_bps }, applies_to: t.applies_to,
      platform_fees: { launch_fee: pf.launch_fee, send_fee: pf.send_fee, receive_fee: pf.receive_fee }, transfer_tax: pf.transfer_tax,
      live_legacy_fees: "/api/fees", status: "approved_target" },
    // no hourly processing exists in this deployment (CC_HOURLY is not built)
    hourly_job_status: { mode: "off", status: "approved_target" },
    // a configured mint is shape-checked, not verified: "configured_unverified" until the verification record is machine-readable
    main_token: { mint: v.mint, config_key: P.main_token.config_key, verified: null, purchase_links: purchase, status: v.mint ? "configured_unverified" : "approved_target" },
    // $VICINITY is legacy (and the old X account a legacy link) only once the main token is in use; until then that is the approved target
    legacy_tokens: clone(P.legacy_tokens).map((t) => ({ ...t, status: v.mint ? "active" : "approved_target" })),
    official_links: { x_url: v.xUrl, telegram_url: v.telegramUrl, legacy: { x_url: P.official_links.legacy.x_url, status: v.mint ? "active" : "approved_target" } },
    // the configured public keys of each role (none has a Worker setting yet, so each is null until its stage adds one)
    public_authority_addresses: AUTHORITY_ROLES.map((role) => ({ role, address: typeof inputs[role] === "string" ? inputs[role] : null })),
  };
}

/** GET /api/policy/master (PUBLIC_V5): the public status above, the policy values (the three configured ones filled as published) and
 *  their master sections. Never the deployment block: no switch value, input or secret presence leaves the server here. */
export async function masterPolicyAnswer(env, opts = {}) {
  const master = await publicMaster(env, opts);
  const policy = clone(P);
  policy.main_token.mint = master.main_token.mint;
  policy.official_links.x_url = master.official_links.x_url;
  policy.official_links.telegram_url = master.official_links.telegram_url;
  const S = MASTER_POLICY.master_sections;
  return {
    policyVersion: master.policy_version,
    ownerDelegationDate: master.owner_delegation_date,
    policyDigest: master.policy_digest,
    serverTime: master.server_time,
    status: master.status,
    master,
    policy,
    masterSections: { policy_version: S.policy_version, owner_delegation_date: S.owner_delegation_date, policy: clone(S.policy) },
  };
}
