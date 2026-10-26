// Terms of Use: the agree-before-entry gate's server-side record.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { browser, newWorld, person, realClock, useClock } from "./helpers/world.js";

let env;
beforeEach(() => { useClock("2026-10-01T12:00:00Z"); env = newWorld(); });
after(() => realClock());

test("POST /api/me/terms records the agreement for a signed-in user", async () => {
  const p = await person(env);
  const r = await p.post("/api/me/terms", { version: "2026-10-01" });
  assert.equal(r.ok, true);
  assert.equal(r.version, "2026-10-01");
  const row = await env.DB.prepare("SELECT terms_version, terms_agreed_at FROM users WHERE wallet = ?")
    .bind(p.w.address).first();
  assert.equal(row.terms_version, "2026-10-01");
  assert.ok(row.terms_agreed_at, "agreement timestamp recorded");
});

test("POST /api/me/terms rejects anonymous users and bad versions", async () => {
  const anon = await browser(env).post("/api/me/terms", { version: "2026-10-01" });
  assert.equal(anon.ok, false);
  assert.equal(anon.error, "sign_in");

  const p = await person(env);
  assert.equal((await p.post("/api/me/terms", { version: "tomorrow" })).error, "bad_version");
  assert.equal((await p.post("/api/me/terms", {})).error, "bad_version");
  assert.equal((await p.post("/api/me/terms", { version: "2026-10-01'; DROP TABLE users;--" })).error, "bad_version");
});

test("agreeing again records the published edition; a version the pages do not publish is refused and never stored (go-live review GL-HON-9)", async () => {
  const p = await person(env);
  assert.equal((await p.post("/api/me/terms", { version: "2026-10-01" })).ok, true);
  assert.deepEqual(await p.post("/api/me/terms", { version: "2026-11-01" }), { ok: false, error: "bad_version", current: "2026-10-01" });
  assert.deepEqual(await p.post("/api/me/terms", { version: "2099-01-01" }), { ok: false, error: "bad_version", current: "2026-10-01" });
  const row = await env.DB.prepare("SELECT terms_version FROM users WHERE wallet = ?").bind(p.w.address).first();
  assert.equal(row.terms_version, "2026-10-01");
});
