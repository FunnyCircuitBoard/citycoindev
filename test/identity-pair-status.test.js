// The pairing's codes off the URL for the wallet-only connect page (Citycoin.dev master v5, stage S12; master section 19 WP-03 step 4 "redact its
// token from logs/referrers"; R1-08): while WALLET_ONLY counts, POST /api/pair/status { code } answers what GET /api/pair?code= answers, and a
// login pairing lives five minutes with its link's code in the fragment (/connect#pair=), like the register pairing of stage S11, and GET
// /api/pair?code= answers 405 (a pairing code never travels in a URL: review finding SEC-10). With the switch off /api/pair/status is what an
// unknown path answers (for every method) and pairings are today's (?pair=, ten minutes); set but refused, both answer 503 (fail closed, SEC-1).
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as W from "./helpers/world.js";
import { handleApi } from "../src/index.js";
import { _resetPolicyCheck } from "../src/v5policy.js";

beforeEach(() => { W.useClock("2026-10-24T12:00:00Z"); _resetPolicyCheck(); });
after(() => W.realClock());

const ON = Object.freeze({ WALLET_ONLY: "on", DEPLOYMENT_ENV: "test", SITE_ORIGIN: W.ORIGIN, SITE_ORIGINS: W.ORIGIN });
const req = (method, path, body, origin = W.ORIGIN) => new Request(`${W.ORIGIN}${path}`, { method, headers: { origin, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

test("WALLET_ONLY counting: a login pairing's link carries the code in the fragment and lives five minutes; POST /api/pair/status answers like the GET", async () => {
  const env = { ...W.V2(), ...ON };
  const computer = W.browser(env), phone = W.browser(env);
  const pair = await computer.post("/api/pair");
  assert.equal(pair.purpose, "login");
  assert.equal(pair.url, `${W.ORIGIN}/connect#pair=${pair.code}`);
  assert.equal(pair.expiresAt, "2026-10-24T12:05:00.000Z");
  const viaPost = await phone.post("/api/pair/status", { code: pair.code });
  assert.deepEqual(viaPost, { status: "waiting", pin: pair.pin, purpose: "login" });
  // the GET form, with the code in the URL, is refused while the switch counts (review finding SEC-10)
  const viaGet = await handleApi(req("GET", `/api/pair?code=${pair.code}`), env);
  assert.deepEqual([viaGet.status, await viaGet.json()], [405, { error: "method_not_allowed" }]);
  assert.deepEqual(await phone.post("/api/pair/status", { code: "x".repeat(24) }), { status: "expired" });
  assert.deepEqual(await phone.post("/api/pair/status", {}), { status: "expired" });
  // five minutes, then gone
  W.useClock("2026-10-24T12:05:01Z");
  assert.deepEqual(await phone.post("/api/pair/status", { code: pair.code }), { status: "expired" });
  // same-site only, POST only, JSON only
  const cross = await handleApi(req("POST", "/api/pair/status", { code: pair.code }, "https://evil.example"), env);
  assert.deepEqual([cross.status, await cross.json()], [403, { ok: false, error: "wrong_origin" }]);
  const get = await handleApi(req("GET", "/api/pair/status"), env);
  assert.deepEqual([get.status, await get.json()], [405, { error: "method_not_allowed" }]);
  const bad = await handleApi(new Request(`${W.ORIGIN}/api/pair/status`, { method: "POST", headers: { origin: W.ORIGIN, "content-type": "application/json" }, body: "{" }), env);
  assert.deepEqual([bad.status, await bad.json()], [400, { ok: false, error: "bad_json" }]);
});

test("set but refused: the pairing routes fail closed (503), never today's ?pair= pairing (review finding SEC-1)", async () => {
  for (const extra of [{ WALLET_ONLY: "on" }, { WALLET_ONLY: "on", DEPLOYMENT_ENV: "test" }]) {
    _resetPolicyCheck();
    const env = { ...W.V2(), ...extra };
    for (const [method, path] of [["POST", "/api/pair/status"], ["GET", "/api/pair/status"], ["POST", "/api/pair"], ["GET", "/api/pair?code=abcdefghijklmnopqr"], ["POST", "/api/pair/finish"]]) {
      const res = await handleApi(req(method, path, method === "POST" ? { code: "x" } : undefined), env);
      assert.deepEqual([res.status, await res.json()], [503, { ok: false, error: "unavailable" }], `${method} ${path} ${JSON.stringify(extra)}`);
    }
  }
});

test("switch off: /api/pair/status is an unknown path for every method, and a login pairing is today's (?pair=, ten minutes)", async () => {
  for (const extra of [{}, { WALLET_ONLY: "off" }]) {
    _resetPolicyCheck();
    const env = { ...W.V2(), ...extra };
    for (const method of ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
      const res = await handleApi(req(method, "/api/pair/status", method === "POST" || method === "PUT" ? { code: "x" } : undefined), env);
      assert.equal(res.status, 404, `${method} ${JSON.stringify(extra)}`);
      if (method !== "HEAD") assert.deepEqual(await res.json(), { error: "not_found" });
    }
    const pair = await W.browser(env).post("/api/pair");
    assert.equal(pair.url, `${W.ORIGIN}/connect?pair=${pair.code}`, JSON.stringify(extra));
    assert.equal(pair.expiresAt, "2026-10-24T12:10:00.000Z");
  }
});
