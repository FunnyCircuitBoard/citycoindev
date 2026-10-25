// Host-safe routing (Citycoin.dev master v5, stage S03): src/hostroute.js, the HOST_REDIRECT gate in src/v5policy.js and the Worker entry
// in src/index.js. With HOST_REDIRECT unset (or set but refused) every host, scheme, method and path answers exactly as before: the old
// names 301 to vicinity.city and plain http 301 to https, for every method. With HOST_REDIRECT accepted (a fixture configuration:
// SITE_ORIGIN https://citycoin.dev, DEPLOYMENT_ENV production, and a stand-in for a page build made with run_worker_first true, which the
// committed wrangler.jsonc does not have): 308 for ordinary public GET and HEAD on every other accepted host, 421 wrong_host for every
// other method, wallet challenge, sign-in, hand-off, callback or webhook, the immutable legacy files and the read-only API in place on
// every accepted host, unknown hosts refused. Since stage S06 the committed wrangler.jsonc attaches citycoin.dev and lists it in
// SITE_ORIGINS, with DEPLOYMENT_ENV production; since stage S55 it lists and attaches citycoin.dev alone, so the legacy hosts are refused
// like any unknown host, with the switch off and on (never redirected: the owner's decision of 24 Oct 2026). HOST_REDIRECT stays unset.
// No request here leaves this process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import worker from "../src/index.js";
import * as W from "./helpers/world.js";
import { SECURITY_HEADERS } from "../src/http.js";
import { _pagesBuiltForTests, checkPolicyConfig, hostRedirect, hostRedirectRefusals, _resetPolicyCheck } from "../src/v5policy.js";
import { HANDOFF_QUERY_KEYS, IMMUTABLE_PATHS, SAFE_QUERY_KEYS, acceptedHost, hostAnswer, isImmutable, isOriginBound, onOrigin, safeQuery } from "../src/hostroute.js";
import { CUTOVER_HOSTS, LEGACY_FORWARD_HOSTS, LEGACY_HOSTS, siteConfig } from "../src/site-config.js";
import { hostBound } from "../src/hostbind.js";
import { _resetLpCoins } from "../src/lpcoins.js";
import { PAGES_BUILT } from "../src/pages-built.js";
import { deployedAssets, deployedVars, pageRouting, pagesBuiltSource } from "../scripts/pages/build.mjs";

// nothing here reaches the network: the test world's fake chain answers RPC, the market sources answer empty, anything else fails at once
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  const ok = (b) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
  if (/(^|\.)jup\.ag$/.test(u.hostname)) return ok(u.pathname === "/tokens/v2/search" ? [] : {});
  if (/raydium\.io$|dexscreener/.test(u.hostname)) return ok({ success: true, data: { rows: [] }, pairs: [] });
  return W.chain()(url, init);
};
W.useClock("2026-10-20T12:00:00Z");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url));
const WRANGLER = JSON.parse(read("wrangler.jsonc").toString("utf8").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
const VARS = WRANGLER.vars;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };
// the static assets as the ASSETS binding serves them (public/, clean URLs, the 404 page)
const ASSETS = { fetch: async (req) => {
  let p = decodeURIComponent(new URL(req.url).pathname);
  if (p.endsWith("/")) p += "index.html";
  for (const t of [p, `${p}.html`]) {
    try { const bytes = read(`public${t}`); return new Response(bytes, { status: 200, headers: { "content-type": TYPES[extname(t)] || "application/octet-stream", etag: '"fixed"' } }); } catch { /* next */ }
  }
  return new Response(read("public/404.html"), { status: 404, headers: { "content-type": TYPES[".html"] } });
} };
const world = (extra = {}) => W.newWorld({ ...VARS, GOOGLE_CLIENT_ID: "gid", ASSETS, ...extra });
/** A member signed in today (wallet + Google, a home community), made the way the test world makes one (the old sign-up path), before
 *  the site settings changed: the world's own host (vicinity.test) is not on any allowlist, and since stage S04 a SITE_ORIGINS that lists a
 *  second host binds new sessions to their host (src/hostbind.js), so the member is made with the settings unset, as every session row that
 *  exists today was (host NULL, which reads as vicinity.city). */
async function member(env) {
  const flow = env.SIGNUP_FLOW, site = [env.SITE_ORIGIN, env.SITE_ORIGINS];
  delete env.SIGNUP_FLOW; delete env.SITE_ORIGIN; delete env.SITE_ORIGINS;
  try { return await W.person(env, { home: W.IN_UTICA, holds: 1_000_000 }); }
  finally {
    env.SIGNUP_FLOW = flow;
    if (site[0] !== undefined) env.SITE_ORIGIN = site[0];
    if (site[1] !== undefined) env.SITE_ORIGINS = site[1];
  }
}
const ctx = { waitUntil() {}, passThroughOnException() {} };

/** The accepted fixture: the switch, a named environment and SITE_ORIGIN https://citycoin.dev (the only target the v5 check accepts). */
const ON = Object.freeze({ HOST_REDIRECT: "on", DEPLOYMENT_ENV: "production", SITE_ORIGIN: "https://citycoin.dev",
  SITE_ORIGINS: "https://citycoin.dev https://www.citycoin.dev https://vicinity.city" });
const CANON = "https://citycoin.dev";
const pagesReachWorker = () => _pagesBuiltForTests({ pagesReachWorker: true });
const pagesAsCommitted = () => _pagesBuiltForTests(null);

const ADDR = "13qRam63xqqd8KNUoAmHWQu7ro71oHqEsYHYaG5MsRiN";
const MINT = VARS.VICINITY_MINT;
// [path, class]: page = an ordinary public page or file; immutable; read = read-only /api; bound = origin-bound GET
const PATHS = [
  ["/", "page"], ["/dashboard", "page"], ["/cities?city=5128581", "page"], ["/style.css", "page"], ["/no-such-page-zq", "page"],
  [`/connect?link=L1&carry=C1&pair=P1&code=X1&state=S1&register=1&ref=R1&next=%2Fadmin&mode=login&utm_source=mail`, "page"],
  [`/token?address=${ADDR}&tab=holders&token=T1`, "page"],
  [`/coin-meta/${MINT}.json`, "immutable"], [`/coin-meta/${MINT}.png`, "immutable"], [`/coin-meta/art/${"ab".repeat(32)}.png`, "immutable"],
  ["/brand/vicinity-512.png", "immutable"], ["/official-coins.csv", "immutable"],
  ["/api/health", "read"], ["/api/official", "read"], ["/api/official-coins", "read"], ["/api/policy", "read"], ["/api/me", "read"],
  ["/api/check?q=%40VicinityCitySOL", "read"],
  [`/api/message?address=${ADDR}&action=login`, "bound"], ["/api/auth/google/start", "bound"], ["/api/auth/google/callback?code=c&state=s", "bound"],
  ["/api/pair?code=abc", "bound"], ["/api/signup/state", "bound"], ["/api/me/wallet/carry/info", "bound"], ["/api/locate", "bound"],
  ["/api/payments/webhook", "bound"],
];
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const ACCEPTED_HOSTS = ["citycoin.dev", "www.citycoin.dev", "vicinity.city", "www.vicinity.city", "vicinitycity.net", "www.vicinitycity.net"];
const UNKNOWN_HOSTS = ["evil.example", "vicinity.city.evil.example", "citycoin.dev.evil.example", "evilcitycoin.dev", "vicinity.city.", "127.0.0.2"];

const request = (url, method = "GET", headers = {}) => new Request(url, { method, headers: { origin: new URL(url).origin, ...headers },
  body: ["POST", "PUT", "PATCH"].includes(method) ? "{}" : undefined });
/** An answer as data. Random values (nonces, codes, ids) and wall-clock times are masked so two worlds given the same requests compare equal. */
const mask = (t) => String(t).replace(/[A-Za-z0-9_-]{20,}/g, (m) => (m === MINT || m === ADDR ? m : "<r>"))
  .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, "<time>").replace(/"pin":"\d+"/g, '"pin":"<r>"');
/** Routes whose answer names the request's own host today (the wallet challenge's text, the Google return address: stage S04 moves them
 *  to configuration). Their served answer is compared with the same request, not with the same path on vicinity.city. */
const HOST_NAMED = new Set(["/api/message", "/api/auth/google/start"]);
/** While the host binding counts (stage S06 as committed), the answers that name the host they are served as: HOST_NAMED, and the pairing
 *  link of POST /api/pair (built on the allowlist entry's origin, src/hostbind.js). */
const OWN_HOST_NAMED = new Set([...HOST_NAMED, "/api/pair"]);
/** The switch-off request whose answer a served request must equal: the same request on the canonical host (and on a host whose answer
 *  names it), else the same path on vicinity.city, which the switch-off Worker serves in place (it 301s the old names). */
const reference = (url, path) => {
  const u = new URL(url);
  return (u.protocol === "https:" && u.hostname === "citycoin.dev") || HOST_NAMED.has(u.pathname) ? url : `https://vicinity.city${path}`;
};
async function snap(res) {
  const bytes = res.body ? Buffer.from(await res.arrayBuffer()) : null;
  const text = bytes && /json|text|csv|html|javascript|svg/.test(res.headers.get("content-type") || "") ? mask(bytes.toString("utf8")) : bytes && bytes.toString("base64");
  return { status: res.status, headers: [...res.headers].map(([k, v]) => [k, mask(v)]).sort(), body: text };
}
const call = async (env, url, method = "GET", headers = {}) => snap(await worker.fetch(request(url, method, headers), env, ctx));
const headerOf = (s, name) => (s.headers.find(([k]) => k === name) || [])[1] ?? null;

/** What today's Worker answers before any route (the rule HOST_REDIRECT off keeps): a 301 for the old names and plain http, or null. */
function todays(url) {
  const u = new URL(url);
  const forward = LEGACY_FORWARD_HOSTS.includes(u.hostname);
  if (!forward && u.protocol !== "http:") return null;
  return `https://${forward ? "vicinity.city" : u.hostname}${u.pathname}${u.search}`;
}
const REDIRECT_HEADERS = (location) => [["cache-control", "public, max-age=3600"], ["location", location],
  ...Object.entries(SECURITY_HEADERS).filter(([k]) => k !== "Cache-Control").map(([k, v]) => [k.toLowerCase(), v])].sort();
/** A redirect with exactly today's headers (the security headers, one hour of caching, the Location) and no body, masked like snap(). */
const redirectTo = (status, location) => ({ status, headers: REDIRECT_HEADERS(location).map(([k, v]) => [k, mask(v)]), body: null });

/* ---------------------------------------------------------------- the gate */

test("HOST_REDIRECT unset reads one setting and nothing else; a throwing setting reads as off", () => {
  const seen = [];
  const env = new Proxy({}, { get(_, k) { seen.push(k); return undefined; } });
  assert.equal(hostRedirect(env), false);
  assert.deepEqual(seen, ["HOST_REDIRECT"], "with the switch unset the Worker's every request costs what it cost before");
  const boom = new Proxy({}, { get() { throw new Error("boom"); } });
  assert.equal(hostRedirect(boom), false);
  assert.deepEqual(hostRedirectRefusals(boom), ["HOST_REDIRECT_CHECK_FAILED"]);
});

test("the switch counts only with every precondition: the pages reach the Worker, an accepted site configuration and an accepted v5 check", () => {
  pagesAsCommitted();
  assert.equal(PAGES_BUILT.pagesReachWorker, false, "the committed wrangler.jsonc serves the pages without the Worker");
  assert.deepEqual(hostRedirectRefusals(ON), ["HOST_REDIRECT_PAGES_BYPASS_WORKER"]);
  assert.equal(hostRedirect(ON), false, "as committed, even a complete configuration does nothing");
  pagesReachWorker();
  try {
    assert.equal(hostRedirect(ON), true);
    assert.equal(hostRedirect({ ...ON, HOST_REDIRECT: " ON " }), true, "trimmed, any letter case");
    for (const v of [undefined, "", "off", "true", "1", "yes", "onn"]) assert.equal(hostRedirect({ ...ON, HOST_REDIRECT: v }), false, String(v));
    const refused = [
      [{ ...ON, DEPLOYMENT_ENV: "" }, ["HOST_REDIRECT_POLICY_REFUSED"]],                                 // ENVIRONMENT_UNSET
      [{ HOST_REDIRECT: "on", DEPLOYMENT_ENV: "production" }, ["HOST_REDIRECT_SITE_REFUSED", "HOST_REDIRECT_POLICY_REFUSED"]], // no target
      [{ ...ON, SITE_ORIGIN: "" }, ["HOST_REDIRECT_POLICY_REFUSED"]],                                   // a blank SITE_ORIGIN is today's vicinity.city
      [{ ...ON, SITE_ORIGIN: "https://vicinity.city" }, ["HOST_REDIRECT_POLICY_REFUSED"]],              // HOST_REDIRECT_TARGET_NOT_CANONICAL
      [{ ...ON, SITE_ORIGIN: "https://example.test", SITE_ORIGINS: "https://example.test" }, ["HOST_REDIRECT_POLICY_REFUSED"]],
      [{ ...ON, SITE_ORIGINS: "https://citycoin.dev/path" }, ["HOST_REDIRECT_SITE_REFUSED", "HOST_REDIRECT_POLICY_REFUSED"]],
      [{ ...ON, SITE_ORIGINS: "https://vicinity.city" }, ["HOST_REDIRECT_SITE_REFUSED", "HOST_REDIRECT_POLICY_REFUSED"]],      // origin not allowed
      [{ ...ON, LEGACY_LINK: "on" }, ["HOST_REDIRECT_POLICY_REFUSED"]],                                 // any other named error
    ];
    for (const [env, codes] of refused) {
      assert.deepEqual(hostRedirectRefusals(env), codes, JSON.stringify(env));
      assert.equal(hostRedirect(env), false);
    }
  } finally { pagesAsCommitted(); }
});

test("a switch set on but refused says why, once per isolate, as codes only; unset says nothing", () => {
  const lines = [];
  const log = (...a) => lines.push(a.join(" "));
  _resetPolicyCheck();
  checkPolicyConfig({}, { log });
  checkPolicyConfig({ HOST_REDIRECT: "off" }, { log });
  assert.deepEqual(lines, []);
  _resetPolicyCheck();
  checkPolicyConfig(ON, { log }); checkPolicyConfig(ON, { log });
  assert.deepEqual(lines, ["host redirect switch refused HOST_REDIRECT_PAGES_BYPASS_WORKER"]);
  lines.length = 0; _resetPolicyCheck();
  checkPolicyConfig({ HOST_REDIRECT: "on" }, { log });
  assert.ok(lines.includes("policy config refused ENVIRONMENT_UNSET deployment.environment"));
  assert.ok(lines.includes("host redirect switch refused HOST_REDIRECT_SITE_REFUSED"));
  for (const l of lines) assert.doesNotMatch(l, /citycoin\.dev|vicinity\.city|https?:/, "a code and a path, never a value");
  _resetPolicyCheck();
});

/* ---------------------------------------------------------------- switch off: exactly today */

/** The site settings HOST_REDIRECT unset is checked with, and the hosts each one refuses before any route (421 wrong_host naming the canonical
 *  origin of the configuration):
 *   - as committed (stage S55): SITE_ORIGINS and SITE_ORIGIN https://citycoin.dev, DEPLOYMENT_ENV production. The host binding counts
 *     (src/hostbind.js) and its allowlist is citycoin.dev alone: every other host is refused, the four legacy hosts (vicinity.city, any
 *     letter case, and its three old names: no longer served, never forwarded) and www.citycoin.dev included, and in production the local
 *     development hosts;
 *   - stage S06 and the go-live (S55's rollback): SITE_ORIGINS lists citycoin.dev and vicinity.city. The binding counts; every host outside
 *     the allowlist (SITE_ORIGINS plus the four legacy hosts, which count while vicinity.city is listed) is refused, www.citycoin.dev (never
 *     listed: domain-cutover.md section 2) and, in production, the local development hosts among them;
 *   - the site settings taken out (the rollback of domain-cutover.md section 5; DEPLOYMENT_ENV stays): unbound, only the cutover's own two
 *     hosts are refused (section 1.3), every other host is served in place as before S04;
 *   - the settings main had before stage S06 (no site setting, no environment): the same answers as the rollback. */
// (the origin a refused host is told: the canonical one of the configuration, https://citycoin.dev as committed since the go-live, and
// today's https://vicinity.city with the site settings taken out)
const TWO_HOSTS = "https://citycoin.dev https://vicinity.city";
const UNSET_CONFIGS = [
  ["as committed (stage S55)", {}, new Set([...ACCEPTED_HOSTS.filter((h) => h !== "citycoin.dev"), ...UNKNOWN_HOSTS, "VICINITY.CITY", "localhost"])],
  ["stage S06 and the go-live (both hosts listed: the rollback of S55)", { SITE_ORIGINS: TWO_HOSTS }, new Set(["www.citycoin.dev", ...UNKNOWN_HOSTS, "localhost"])],
  ["site settings taken out (rollback)", { SITE_ORIGIN: undefined, SITE_ORIGINS: undefined }, new Set(CUTOVER_HOSTS)],
  ["before stage S06", { SITE_ORIGIN: undefined, SITE_ORIGINS: undefined, DEPLOYMENT_ENV: undefined }, new Set(CUTOVER_HOSTS)],
];
test("switch unset: every host, scheme, method and path class answers as today (301 from the old names and from http, the same answer elsewhere)", async () => {
  assert.equal(VARS.HOST_REDIRECT, undefined);
  for (const [label, extra, refused] of UNSET_CONFIGS) {
    const env = world(extra), ref = world(extra), vic = world(extra);
    const bothHosts = label.startsWith("stage S06");
    assert.equal(hostBound(siteConfig(env)), label.startsWith("as committed") || bothHosts, `${label}: the binding counts only with a site setting that lists citycoin.dev`);
    for (const host of [...ACCEPTED_HOSTS, ...UNKNOWN_HOSTS, "VICINITY.CITY", "localhost"]) {
      for (const proto of ["https", "http"]) {
        for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
          for (const [path] of PATHS) {
            const url = `${proto}://${host}${path}`, got = await call(env, url, method), at = `${label}: ${method} ${url}`;
            const location = todays(url);
            if (refused.has(host)) {
              // refused before any route and before the 301s: never served unbound (S04 review), never served outside the allowlist while the
              // binding counts; no Location, no cookie
              assert.deepEqual([got.status, JSON.parse(got.body), headerOf(got, "location"), headerOf(got, "set-cookie")],
                [421, { error: "wrong_host", origin: siteConfig(env).origin }, null, null], at);
            } else if (location && host !== "localhost") {
              assert.deepEqual(got, redirectTo(301, location), at);
            } else {
              // served in place: no answer of the entry (a redirect or a refusal), the route's own answer, as a second world gives it
              assert.ok(got.status !== 308 && got.status !== 421 && !(got.status === 301 && got.body === null), at);
              assert.deepEqual(got, await call(ref, url, method), at);
              // while both hosts are listed (S06, the go-live), citycoin.dev serves the same site as vicinity.city: every answer served in place
              // there equals the same request on vicinity.city (in a third world given the same requests in the same order: citycoin.dev's come
              // first), except the routes whose answer names the host it is served as (OWN_HOST_NAMED: the wallet challenge's text, the Google
              // return address, the pairing link; domain-cutover.md section 1.2). S06 review, R8.
              if (bothHosts && host === "citycoin.dev" && proto === "https" && !OWN_HOST_NAMED.has(new URL(url).pathname))
                assert.deepEqual(got, await call(vic, `https://vicinity.city${path}`, method), `${at}: the same answer as vicinity.city's`);
            }
          }
        }
      }
    }
  }
  // as committed, citycoin.dev is the one host served in place (attached in the same deploy that lists it: domain-cutover.md section 2); with
  // both hosts listed (S06, the go-live) it answered exactly as vicinity.city; since stage S55 vicinity.city is refused, with no Location
  const health = await call(world(), "https://citycoin.dev/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health, await call(world({ SITE_ORIGINS: TWO_HOSTS }), "https://vicinity.city/api/health"), "the same answer as on vicinity.city while both hosts were listed");
  const gone = await call(world(), "https://vicinity.city/api/health");
  assert.deepEqual([gone.status, JSON.parse(gone.body), headerOf(gone, "location")], [421, { error: "wrong_host", origin: CANON }, null], "stage S55: vicinity.city refused, never redirected");
});

// The reference of a refused switch is the same deployment with HOST_REDIRECT taken out: since stage S04 the site settings themselves count
// (a SITE_ORIGINS that lists a second host, or a refused one, binds sessions and refuses hosts outside the allowlist: src/hostbind.js and
// test/host-binding.test.js), so a refused HOST_REDIRECT must add nothing to them. `{ HOST_REDIRECT: "on", SITE_ORIGIN: undefined }` is stage
// S06's settings with the switch (refused: SITE_ORIGIN is not citycoin.dev); since the go-live the committed settings name citycoin.dev
// canonical, so the committed settings with the switch are refused only because the pages bypass the Worker (the first variant: never
// switched on, the owner's decision of 24 Oct 2026); a variant with no site settings and no environment is compared with the world with
// nothing set, as before S06.
const withoutSwitch = (v) => { const { HOST_REDIRECT, ...rest } = v; void HOST_REDIRECT; return rest; };
test("switch set but refused (each reason): every answer, header and D1 row is exactly the switch-off one", async () => {
  const variants = [
    { ...ON },                                                         // as committed: the pages bypass the Worker
    { ...ON, DEPLOYMENT_ENV: "" }, { HOST_REDIRECT: "on", SITE_ORIGIN: undefined }, { HOST_REDIRECT: "on", SITE_ORIGIN: undefined, SITE_ORIGINS: undefined, DEPLOYMENT_ENV: undefined },
    { ...ON, SITE_ORIGIN: "https://vicinity.city" },
    { ...ON, SITE_ORIGINS: "nonsense" }, { HOST_REDIRECT: "true", DEPLOYMENT_ENV: "production", SITE_ORIGIN: ON.SITE_ORIGIN, SITE_ORIGINS: ON.SITE_ORIGINS },
  ];
  const urls = [];
  for (const host of ["vicinity.city", "www.vicinity.city", "vicinitycity.net", "citycoin.dev", "www.citycoin.dev", "evil.example"]) {
    for (const proto of ["https", "http"]) for (const [path] of PATHS) urls.push(`${proto}://${host}${path}`);
  }
  for (const v of variants) {
    if (v !== variants[0]) pagesReachWorker(); // every refusal but the first is a refusal of the configuration, not of the page routing
    try {
      const off = world(withoutSwitch(v)), on = world(v);
      // each world asks as a fresh isolate would: src/lpcoins.js remembers an unknown mint for 5 minutes per isolate, and that memo is
      // shared by both worlds of this process (whichever asked first would count the lookup against coin_meta, the other not)
      const fresh = (env, url, method) => { _resetLpCoins(); return call(env, url, method); };
      for (const url of urls) for (const method of ["GET", "HEAD", "POST", "DELETE"]) {
        assert.deepEqual(await fresh(on, url, method), await fresh(off, url, method), `${JSON.stringify(v)} ${method} ${url}`);
      }
      const dump = async (env) => { const t = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()).results;
        return Promise.all(t.map(async ({ name }) => [name, mask(JSON.stringify((await env.DB.prepare(`SELECT * FROM "${name}"`).all()).results))])); };
      assert.deepEqual(await dump(on), await dump(off), "every D1 row too");
    } finally { pagesAsCommitted(); }
  }
});

/* ---------------------------------------------------------------- switch accepted: the route contract */

/** The rule the switch applies, restated: [kind, location] for a request on an accepted host. */
function contract(url, method, kind) {
  const u = new URL(url);
  const secure = u.protocol === "https:";
  if (secure && u.hostname === "citycoin.dev") return ["serve"];
  if (method === "POST" && u.pathname === "/api/auth/logout") return secure ? ["serve"] : ["421"]; // sign-out is served in place (review R2H-04)
  if (method !== "GET" && method !== "HEAD") return ["421"];
  if (kind === "immutable" || kind === "read") return secure ? ["serve"] : ["308", `https://${u.hostname}${u.pathname}${u.search}`];
  if (/^\/api\/auth\/[a-z]+\/(start|callback)$/.test(u.pathname)) return ["302", `${CANON}/connect?error=login_expired`]; // a sign-in trip (R2H-05)
  if (kind === "bound") return ["421"];
  return ["308", `${CANON}${u.pathname}${safeQuery(u.search)}`];
}

test("switch accepted: every accepted host, scheme, method and path class follows the route contract", async () => {
  pagesReachWorker();
  try {
    // the reference is the switch-off Worker with the same site settings (since stage S04 they bind sessions and serve citycoin.dev in
    // place; with no site settings citycoin.dev is refused, never served unbound)
    const env = world(ON), ref = world(withoutSwitch(ON));
    let n308 = 0, n421 = 0, nServe = 0, n302 = 0;
    for (const host of ACCEPTED_HOSTS) for (const proto of ["https", "http"]) for (const method of METHODS) for (const [path, kind] of PATHS) {
      const url = `${proto}://${host}${path}`, label = `${method} ${url}`;
      const [want, location] = contract(url, method, kind);
      const got = await call(env, url, method);
      if (want === "308") {
        n308++;
        assert.deepEqual(got, redirectTo(308, location), label);
        // one hop: the target answers (no loop, no second redirect, never a refusal)
        const next = await call(env, location, method);
        assert.ok(![301, 302, 307, 308, 421].includes(next.status), `${label} -> ${location} answered ${next.status}`);
      } else if (want === "302") {
        n302++;
        // the new host's sign-in page, the query dropped (no provider code or state travels), never cached, no cookie
        assert.equal(got.status, 302, label);
        assert.equal(headerOf(got, "location"), location, label);
        assert.equal(headerOf(got, "cache-control"), "no-store");
        assert.equal(headerOf(got, "set-cookie"), null);
        assert.equal(got.body, null);
      } else if (want === "421") {
        n421++;
        assert.equal(got.status, 421, label);
        assert.equal(headerOf(got, "location"), null, `${label}: no Location`);
        assert.equal(headerOf(got, "cache-control"), "no-store");
        assert.equal(headerOf(got, "content-type"), "application/json; charset=utf-8");
        assert.equal(headerOf(got, "content-security-policy"), mask(SECURITY_HEADERS["Content-Security-Policy"]));
        assert.deepEqual(JSON.parse(got.body), { error: "wrong_host", origin: CANON }, label);
      } else {
        nServe++;
        // served in place: the switch-off answer of the same request on a host served in place, byte for byte
        assert.deepEqual(got, await call(ref, reference(url, path), method), label);
      }
    }
    assert.ok(n308 > 100 && n421 > 400 && nServe > 100 && n302 > 20, `${n308} redirects, ${n421} refusals, ${nServe} in place, ${n302} sign-in trips`);
  } finally { pagesAsCommitted(); }
});

test("switch accepted: unknown hosts are refused for every method and path, never served and never a redirect target", async () => {
  pagesReachWorker();
  try {
    const env = world(ON);
    for (const host of UNKNOWN_HOSTS) for (const proto of ["https", "http"]) for (const method of METHODS) for (const [path] of PATHS) {
      const got = await call(env, `${proto}://${host}${path}`, method);
      assert.equal(got.status, 421, `${method} ${proto}://${host}${path}`);
      assert.equal(headerOf(got, "location"), null);
      assert.deepEqual(JSON.parse(got.body), { error: "wrong_host", origin: CANON }, "the canonical origin from the configuration, never the request's host");
    }
  } finally { pagesAsCommitted(); }
});

// (Until stage S55 this test read "the legacy hosts stay accepted even when SITE_ORIGINS leaves them out": master section 04 kept the old
// routes 12 months after the redirect, so the old names were 308'd to citycoin.dev and their immutable files served in place. The owner's
// decision of 24 Oct 2026 replaced that: no forwarding, the names left blank. From S55 on, with SITE_ORIGINS citycoin.dev alone, the legacy
// hosts are unknown hosts, refused even with the switch accepted; the files keep their bytes on citycoin.dev, and the one address named on
// chain that goes dark, https://vicinity.city/brand/vicinity-512.png, waits for the owner's specific written acceptance: policy amendment
// owner-decision-2026-10-25-golive, prepared and not in force until it is quoted there, a blocking item of the S55 deploy checklist.)
test("switch accepted with SITE_ORIGINS citycoin.dev alone (stage S55): the legacy hosts are refused, never redirected to citycoin.dev; the immutable files keep their bytes on citycoin.dev", async () => {
  pagesReachWorker();
  try {
    const only = { ...ON, SITE_ORIGINS: "https://citycoin.dev" };
    assert.equal(hostRedirect(only), true);
    const env = world(only), ref = world({ SITE_ORIGINS: TWO_HOSTS }); // (the reference: vicinity.city as served until S55)
    for (const host of LEGACY_HOSTS) {
      for (const proto of ["https", "http"]) for (const method of ["GET", "HEAD", "POST"]) {
        for (const p of ["/brand/vicinity-512.png", `/coin-meta/${MINT}.json`, "/official-coins.csv", "/api/health", "/launchpad?tab=new", "/"]) {
          const got = await call(env, `${proto}://${host}${p}`, method);
          assert.deepEqual([got.status, headerOf(got, "location"), headerOf(got, "set-cookie")], [421, null, null], `${method} ${proto}://${host}${p}`);
          if (method !== "HEAD") assert.deepEqual(JSON.parse(got.body), { error: "wrong_host", origin: CANON });
        }
      }
    }
    for (const p of ["/brand/vicinity-512.png", `/coin-meta/${MINT}.json`, "/official-coins.csv", "/api/health"]) {
      for (const method of ["GET", "HEAD"]) assert.deepEqual(await call(env, `${CANON}${p}`, method), await call(ref, `https://vicinity.city${p}`, method), `${method} ${CANON}${p}: the same bytes as vicinity.city served`);
    }
    const logo = await call(env, `${CANON}/brand/vicinity-512.png`);
    assert.equal(logo.status, 200);
    assert.equal(logo.body, read("public/brand/vicinity-512.png").toString("base64"), "the logo named on chain: the file's exact bytes, on citycoin.dev");
    // www.citycoin.dev is not listed here, and it is no legacy host: refused
    assert.equal((await call(env, "https://www.citycoin.dev/")).status, 421);
  } finally { pagesAsCommitted(); }
});

test("switch accepted: no open redirect; the target is always SITE_ORIGIN with the request's path appended as text", async () => {
  pagesReachWorker();
  try {
    const env = world(ON);
    const tricky = ["//evil.example/x", "/\\evil.example/x", "/%2F%2Fevil.example", "/..//evil.example", "/@evil.example", "/./evil.example",
      "/x?next=https://evil.example&city=1", "/x?city=1#frag", "/%0d%0aSet-Cookie:%20a=b", "/x?city=%0d%0aSet-Cookie:a=b", "/x?mode=login&mode=https://evil.example"];
    for (const host of ["vicinity.city", "www.vicinity.city", "vicinitycity.net", "www.citycoin.dev"]) for (const proto of ["https", "http"]) for (const p of tricky) {
      const res = await worker.fetch(request(`${proto}://${host}${p}`), env, ctx);
      assert.equal(res.status, 308, `${host}${p}`);
      const location = res.headers.get("location");
      assert.ok(location.startsWith(`${CANON}/`), `${host}${p} -> ${location}`);
      assert.equal(new URL(location).origin, CANON);
      assert.equal(new URL(location, "https://other.example/").origin, CANON, "absolute: a browser resolves it to the canonical origin from any base");
      assert.equal(res.headers.get("set-cookie"), null);
      assert.doesNotMatch(location, /[\r\n]/);
    }
    // the last guard: a path that would change the origin once appended (never one a parsed URL gives) is refused, not sent
    for (const pathname of ["@evil.example/x", ".evil.example/x", ":443@evil.example/"]) {
      assert.equal(onOrigin(CANON, { pathname }, ""), null, pathname);
      const fake = { hostname: "vicinity.city", protocol: "https:", pathname, search: "" };
      assert.equal(hostAnswer(new Request("https://vicinity.city/"), fake, siteConfig(ON)).status, 421, pathname);
    }
    assert.equal(onOrigin(CANON, { pathname: "//evil.example/x" }, "?city=1"), `${CANON}//evil.example/x?city=1`);
    // the Host header never moves the target: the request's own URL host decides acceptance, and the target is configuration
    const spoof = await worker.fetch(new Request("https://vicinity.city/a", { headers: { host: "evil.example", "x-forwarded-host": "evil.example" } }), env, ctx);
    assert.equal(spoof.headers.get("location"), `${CANON}/a`);
  } finally { pagesAsCommitted(); }
});

test("switch accepted: a moved page keeps only the safe query keys; hand-off, sign-in and one-time-code keys never travel", async () => {
  pagesReachWorker();
  try {
    const env = world(ON);
    const handoff = HANDOFF_QUERY_KEYS.map((k, i) => `${k}=secret${i}`).join("&");
    const res = await worker.fetch(request(`https://vicinity.city/connect?${handoff}&mode=login&utm_source=mail&city=5128581`), env, ctx);
    assert.equal(res.headers.get("location"), `${CANON}/connect?mode=login&utm_source=mail&city=5128581`);
    assert.doesNotMatch(res.headers.get("location"), /secret/);
    const bare = await worker.fetch(request(`https://vicinity.city/connect?link=${"a".repeat(43)}`), env, ctx);
    assert.equal(bare.headers.get("location"), `${CANON}/connect`, "no dangling ?");
  } finally { pagesAsCommitted(); }
});

test("the query filter: exact keys only, each kept pair byte for byte and in order, malformed keys dropped", () => {
  for (const k of HANDOFF_QUERY_KEYS) assert.ok(!SAFE_QUERY_KEYS.includes(k), `${k} is a hand-off key`);
  for (const k of ["link", "pair", "code", "register", "carry", "state", "ref"]) assert.ok(HANDOFF_QUERY_KEYS.includes(k), `inventory C02 names ${k}`);
  assert.equal(safeQuery(""), "");
  assert.equal(safeQuery("?"), "");
  assert.equal(safeQuery("?code=1&state=2"), "");
  assert.equal(safeQuery("?city=1&code=2&city=3"), "?city=1&city=3", "a repeated safe key is kept, in order");
  assert.equal(safeQuery("?q=a%20b+c&tab=new"), "?q=a%20b+c&tab=new", "the encoding is kept as sent");
  assert.equal(safeQuery("?c%69ty=1"), "?c%69ty=1", "an encoded safe key is that key");
  assert.equal(safeQuery("?%63ode=1&Code=2&CITY=3"), "", "an encoded hand-off key is that key; keys are case-sensitive");
  assert.equal(safeQuery("?%zz=1&city=2"), "?city=2", "a malformed key is dropped");
  assert.equal(safeQuery("?&&welcome&city="), "?welcome&city=", "empty pairs dropped, keys without a value kept");
  assert.equal(safeQuery("?swap_in=SOL&swap_out=X&swap_amt=1&swap_slip=50&swap_open=1&utm_campaign=c"), "?swap_in=SOL&swap_out=X&swap_amt=1&swap_slip=50&swap_open=1&utm_campaign=c");
  assert.equal(safeQuery("?unknown=1&city=2"), "?city=2", "unknown keys are dropped, so a later secret key never travels by default");
});

test("the path classes: the immutable files, the origin-bound routes of today's index.js, exact host matching", () => {
  for (const p of ["/coin-meta/x.json", "/coin-meta/art/ab.png", "/brand/vicinity-512.png", "/official-coins.csv"]) assert.ok(isImmutable(p), p);
  for (const p of ["/coin-meta", "/Coin-Meta/x", "/brand/vicinity-512.png/x", "/brand/vicinity-512.PNG", "/official-coins.csv/", "/brand/logo.svg"]) assert.ok(!isImmutable(p), p);
  assert.deepEqual([...IMMUTABLE_PATHS], ["/brand/vicinity-512.png", "/official-coins.csv"]);
  // every /api route literal of src/index.js: exactly these are origin-bound (a new route under these prefixes is refused off-host until reviewed)
  const src = read("src/index.js").toString("utf8");
  const routes = [...new Set([...src.matchAll(/["'](\/api\/[a-z0-9/_-]+)["']/g)].map((m) => m[1]))].sort();
  // (stages S09 and S10 add the literals of the wallet challenge and of the routes WALLET_ONLY retires, stage S12 the pairing's POST status:
  // each is origin-bound by its prefix)
  assert.deepEqual(routes.filter(isOriginBound), ["/api/auth/challenge", "/api/auth/email/login", "/api/auth/email/start", "/api/auth/email/verify",
    "/api/auth/google/callback", "/api/auth/google/start", "/api/auth/logout",
    "/api/auth/password/reset", "/api/auth/password/reset/start", "/api/auth/reprove", "/api/auth/transfer", "/api/auth/transfer/check", "/api/auth/wallet",
    "/api/locate", "/api/locate/handoff", "/api/locate/handoff/claim", "/api/locate/handoff/complete", "/api/locate/handoff/info", "/api/me/wallet/",
    "/api/me/wallet/unlink", "/api/message", "/api/pair", "/api/pair/finish", "/api/pair/status", "/api/signup/"]);
  for (const p of ["/api/auth/google/start", "/api/auth/google/callback", "/api/signup/location/handoff/info", "/api/me/wallet/carry/status", "/x/callback", "/api/hooks/webhooks/y", "/api/Webhook"]) assert.ok(isOriginBound(p), p);
  for (const p of ["/api/me", "/api/messages", "/api/pairs", "/api/locatex", "/api/token", "/api/wallet/send/status", "/api/callbacking"]) assert.ok(!isOriginBound(p), p);
  const site = siteConfig(ON);
  assert.equal(acceptedHost(site, "www.citycoin.dev"), "www.citycoin.dev");
  assert.equal(acceptedHost(site, "WWW.VICINITY.CITY"), "www.vicinity.city");
  for (const h of ["evil.citycoin.dev", "citycoin.dev.evil.example", "xcitycoin.dev", "vicinity.city.", "", null]) assert.equal(acceptedHost(site, h), null, String(h));
});

test("switch accepted: this computer (wrangler dev) is served as today outside production; a local visit by a route's name follows the host rule", async () => {
  pagesReachWorker();
  try {
    const DEV = { ...ON, DEPLOYMENT_ENV: "test" };
    assert.equal(hostRedirect(DEV), true);
    const env = world(DEV), site = siteConfig(DEV);
    for (const url of ["http://localhost:8787/dashboard", "http://127.0.0.1/api/health", "http://[::1]/", "http://app.localhost/x"]) {
      assert.equal(hostAnswer(new Request(url, { method: "POST" }), new URL(url), site, true), null, url);
      // in production (review SEC-7) a local host name is an unknown host like any other: the Worker never serves it or builds from it
      assert.equal(hostAnswer(new Request(url, { method: "POST" }), new URL(url), site, false, false).status, 421, url);
      assert.equal((await call(world(ON), url)).status, 421, `production: ${url}`);
    }
    const local = { "cf-connecting-ip": "127.0.0.1" };
    assert.equal((await call(env, "http://citycoin.dev/api/health", "GET", local)).status, 200, "the canonical host, presented as http by wrangler dev");
    const page = await call(env, "http://vicinity.city/rules", "GET", local);
    assert.equal(headerOf(page, "location"), `${CANON}/rules`, "a route's name from this computer: the host rule, not the https upgrade");
    assert.equal((await call(env, "http://vicinity.city/api/health", "GET", local)).status, 200, "read-only API in place (no upgrade from this computer)");
  } finally { pagesAsCommitted(); }
});

/* ---------------------------------------------------------------- members stay signed in; nothing is written */

// (Stage S55: with the committed settings vicinity.city is no longer served, so "the switch off" is checked with the settings it was served
// under, S06's and the go-live's (both hosts listed); with the committed settings that session answers 421 on vicinity.city: the member signs
// in again on citycoin.dev with the same wallet, domain-cutover.md section 6.)
test("existing members stay signed in while vicinity.city is served: a session made today (no host on its row) answers there with the switch off and on; since stage S55 vicinity.city refuses it", async () => {
  {
    const env = world();
    const p = await member(env);
    const cookie = [...p.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const me = await worker.fetch(request("https://vicinity.city/api/me", "GET", { cookie }), env, ctx);
    assert.deepEqual([me.status, await me.json(), me.headers.get("location"), me.headers.get("set-cookie")], [421, { error: "wrong_host", origin: CANON }, null, null], "as committed (S55)");
    const there = await (await worker.fetch(request("https://citycoin.dev/api/me", "GET", { cookie }), env, ctx)).json();
    assert.equal(there.signedIn, false, "a vicinity.city session (host NULL) is not citycoin.dev's");
  }
  for (const flip of [false, true]) {
    if (flip) pagesReachWorker();
    try {
      const env = world(flip ? ON : { SITE_ORIGINS: "https://citycoin.dev https://vicinity.city" });
      const p = await member(env);
      const cookie = [...p.jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const sessions = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first()).n;
      const before = await sessions();
      assert.ok(before >= 1);
      const me = await worker.fetch(request("https://vicinity.city/api/me", "GET", { cookie }), env, ctx);
      assert.equal(me.status, 200);
      const body = await me.json();
      assert.equal(body.signedIn, true, `signed in on vicinity.city (switch ${flip ? "on" : "off"})`);
      assert.equal(body.user.wallet, p.w.address);
      if (flip) {
        // a write from an old tab on vicinity.city is refused, never replayed elsewhere, and the session is untouched
        const out = await worker.fetch(request("https://vicinity.city/api/me/profile", "POST", { cookie }), env, ctx);
        assert.equal(out.status, 421);
        assert.equal(out.headers.get("set-cookie"), null);
        assert.equal(await sessions(), before, "the 421 changed no row");
        // a cookie scoped to vicinity.city never reaches citycoin.dev: there the browser starts signed out, as the master requires
        const fresh = await (await worker.fetch(request("https://citycoin.dev/api/me"), env, ctx)).json();
        assert.equal(fresh.signedIn, false);
        const again = await (await worker.fetch(request("https://vicinity.city/api/me", "GET", { cookie }), env, ctx)).json();
        assert.equal(again.signedIn, true, "still signed in on vicinity.city after the refused write");
        // sign-out on the old host is served in place (review R2H-04, SEC-5): the session ends there and the cookie is cleared, so a shared
        // computer can always be signed out of vicinity.city; a foreign Origin is still refused
        const foreign = await worker.fetch(request("https://vicinity.city/api/auth/logout", "POST", { cookie, origin: "https://evil.example" }), env, ctx);
        assert.equal(foreign.status, 403);
        assert.equal(await sessions(), before);
        const bye = await worker.fetch(request("https://vicinity.city/api/auth/logout", "POST", { cookie }), env, ctx);
        assert.equal(bye.status, 200);
        assert.match(bye.headers.get("set-cookie"), /^vs=; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0$/);
        assert.equal(await sessions(), before - 1, "the old host's session row is gone");
        const after = await (await worker.fetch(request("https://vicinity.city/api/me", "GET", { cookie }), env, ctx)).json();
        assert.equal(after.signedIn, false, "signed out of vicinity.city");
        // over plain http the sign-out is not served (a Secure cookie never rides on http): 421, nothing changes
        assert.equal((await worker.fetch(request("http://vicinity.city/api/auth/logout", "POST", { cookie }), env, ctx)).status, 421);
      }
    } finally { pagesAsCommitted(); }
  }
});

test("switch accepted: redirects and refusals write nothing (every D1 row before and after a sweep)", async () => {
  pagesReachWorker();
  try {
    const env = world(ON);
    await member(env);
    const dump = async () => { const t = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()).results;
      return Promise.all(t.map(async ({ name }) => [name, JSON.stringify((await env.DB.prepare(`SELECT * FROM "${name}"`).all()).results)])); };
    const before = await dump();
    for (const host of ["vicinity.city", "www.vicinity.city", "evil.example"]) for (const method of METHODS) for (const [path, kind] of PATHS) {
      if (kind === "read" || kind === "immutable") continue; // served in place: the same reads as on the canonical host
      await worker.fetch(request(`https://${host}${path}`, method), env, ctx);
    }
    assert.deepEqual(await dump(), before);
  } finally { pagesAsCommitted(); }
});

/* ---------------------------------------------------------------- the deployment: pages must reach the Worker */

test("the committed wrangler.jsonc: no HOST_REDIRECT, the pages bypass the Worker, so the switch does nothing until a configuration PR", () => {
  assert.equal(VARS.HOST_REDIRECT, undefined);
  // stage S06 (domain-cutover.md section 2 item 2 and section 3 step 2): citycoin.dev attached and listed in SITE_ORIGINS in the same
  // configuration, the production environment named; the go-live (the owner's go of 25 Oct 2026) makes citycoin.dev the canonical origin;
  // stage S55 (section 3 step 4) lists and attaches citycoin.dev alone: the vicinity.city routes are gone, with no redirect. HOST_REDIRECT
  // stays unset (no forwarding: section 0)
  assert.equal(VARS.SITE_ORIGIN, "https://citycoin.dev", "citycoin.dev canonical since the go-live");
  assert.equal(VARS.SITE_ORIGINS, "https://citycoin.dev", "citycoin.dev alone since stage S55");
  assert.equal(VARS.DEPLOYMENT_ENV, "production");
  const site = siteConfig(VARS);
  assert.deepEqual([site.origin, site.hosts, site.problems], ["https://citycoin.dev", ["citycoin.dev"], []]);
  assert.ok(!site.hosts.includes("www.citycoin.dev"), "www.citycoin.dev is never listed");
  assert.deepEqual(WRANGLER.assets.run_worker_first, ["/api/*", "/coin-meta/*", "/official-coins.csv"], "not changed by this stage");
  assert.deepEqual(WRANGLER.routes, [{ pattern: "citycoin.dev", custom_domain: true }], "citycoin.dev the one custom domain; www.citycoin.dev is not attached");
  // never attach a host the allowlist does not list (section 2): every attached name is listed (since S55 no legacy host is attached at all)
  for (const { pattern } of WRANGLER.routes) assert.ok(site.hosts.includes(pattern), `${pattern} is attached but not listed`);
  assert.deepEqual(WRANGLER.routes.filter(({ pattern }) => LEGACY_HOSTS.includes(pattern)), [], "no vicinity.city name is attached");
  assert.deepEqual(pageRouting(), { pagesReachWorker: false });
  assert.match(pagesBuiltSource(), /pagesReachWorker: false/);
  assert.deepEqual(deployedAssets(), WRANGLER.assets);
  // the switch set on top of the committed settings would still do nothing: the pages bypass the Worker. (Since the go-live SITE_ORIGIN is
  // citycoin.dev, so the page routing is the one refusal left; the switch is never to be set: the owner decided on 24 Oct 2026 that the old
  // names are not forwarded, and the go-live deploy checklist confirms no dashboard HOST_REDIRECT)
  pagesAsCommitted();
  assert.equal(hostRedirect({ ...VARS, HOST_REDIRECT: "on" }), false);
  assert.deepEqual(hostRedirectRefusals({ ...VARS, HOST_REDIRECT: "on" }), ["HOST_REDIRECT_PAGES_BYPASS_WORKER"]);
});

test("the page build refuses HOST_REDIRECT=on in wrangler.jsonc unless the pages reach the Worker and the Worker would accept it", () => {
  const vars = { ...deployedVars(), ...ON };
  const listed = WRANGLER.assets, first = { ...WRANGLER.assets, run_worker_first: true };
  assert.throws(() => pageRouting(vars, listed), /HOST_REDIRECT=on in wrangler\.jsonc.*HOST_REDIRECT_PAGES_BYPASS_WORKER/);
  assert.throws(() => pagesBuiltSource(vars, listed), /run_worker_first/);
  assert.throws(() => pageRouting({ ...vars, DEPLOYMENT_ENV: "" }, first), /ENVIRONMENT_UNSET/);
  assert.throws(() => pageRouting({ ...vars, SITE_ORIGIN: "https://vicinity.city" }, first), /HOST_REDIRECT_TARGET_NOT_CANONICAL/);
  assert.deepEqual(pageRouting(vars, first), { pagesReachWorker: true });
  assert.match(pagesBuiltSource(vars, first), /mainTokenV5: false, brand: "", pagesReachWorker: true/);
  assert.deepEqual(pageRouting({ ...deployedVars(), HOST_REDIRECT: "off" }, listed), { pagesReachWorker: false });
  assert.deepEqual(pageRouting(deployedVars(), first), { pagesReachWorker: true }, "run_worker_first alone changes no answer: the switch is off");
});
