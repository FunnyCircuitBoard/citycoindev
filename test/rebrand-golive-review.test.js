// The go-live review's findings that live in the label set itself (Citycoin.dev label migration, S48; behind BRAND=citycoin, so with BRAND
// unset every answer here is today's), one regression test each:
//   GL-1      the new name and the official X handle are reserved usernames (and the screener's staff rule knows the new name)
//   GL-8      the link checker calls "official" only a host this Worker serves (SITE_ORIGINS); every other name of ours is said as it is
//   GL-HON-7  no balance sample is taken under the label set, so the $VICINITY history is not pruned either
//   GL-DEP-8  the fee words and the official-coins list are kept at the edge under a key that names the label set's mode
// Every wallet, mint and address below is a clearly fake fixture.
import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import * as W from "./helpers/world.js";
import { CITYCOIN_BRAND, LEGACY_BRAND } from "../src/brand.js";
import { ownWords } from "../src/brandwords.js";
import { brandReserve, reservedUsername } from "../src/me.js";
import { screenName, screenDescription } from "../src/screen.js";
import { checkOfficial } from "../src/official.js";
import { isSolanaAddress } from "../src/solana.js";
import { getBlob, putBlob } from "../src/blobs.js";
import { pruneLedger } from "../src/ledger.js";
import { ensureSchema } from "../src/store.js";
import { _pagesBuiltForTests, _resetPolicyCheck } from "../src/v5policy.js";
import { LP_ON, SOL_CONFIG } from "./helpers/lpchain.js";

beforeEach(() => { _pagesBuiltForTests(null); _resetPolicyCheck(); });
afterEach(() => { _pagesBuiltForTests(null); });
after(() => W.realClock());

const X = "https://x.com/CityCoinDev";
const CC = Object.freeze({ BRAND: "citycoin", OFFICIAL_X_URL: X });
const cc = () => _pagesBuiltForTests({ brand: "citycoin" });

/* ---------------------------------------------------------------- GL-1: reserved names */

const TAKEN_FOR_THE_PRODUCT = ["CityCoinDev", "citycoin", "Citycoin_dev", "CitycoinTeam", "C1tyc0inDev", "C1tyc0in", "Cityco1n", "TheCitycoin", "citycoins"];

test("GL-1: under BRAND=citycoin the new name (any look-alike) and the configured X handle are reserved; ordinary names stay free", () => {
  assert.deepEqual([...ownWords(CITYCOIN_BRAND)], ["citycoin", "citycoindev"]);
  assert.deepEqual([...ownWords(LEGACY_BRAND)], [], "today's label set adds nothing: its own 'vicinity' rule stays as written");
  cc();
  const r = brandReserve(CC);
  for (const n of TAKEN_FOR_THE_PRODUCT) assert.equal(reservedUsername(n, r), true, n);
  for (const n of ["Sakib", "CityLover", "Coin_city", "Citizen", "Cocoa", "Utica_fan"]) assert.equal(reservedUsername(n, r), false, n);
  assert.equal(reservedUsername("Vicinity_fan", r), true, "the old name stays reserved too");
  // another handle in the setting is reserved exactly (look-alike letters included), without making every name that contains it reserved
  const other = brandReserve({ BRAND: "citycoin", OFFICIAL_X_URL: "https://x.com/LocalBuzz" });
  assert.equal(reservedUsername("L0calBuzz", other), true);
  assert.equal(reservedUsername("LocalBuzzFan", other), false);
});

test("GL-1: with today's label set (BRAND unset, or set only in the dashboard over today's pages) nothing more is reserved", () => {
  for (const env of [{ OFFICIAL_X_URL: X }, CC]) {
    const r = brandReserve(env);
    assert.deepEqual([[...r.contains], [...r.exact]], [[], []], JSON.stringify(env));
    for (const n of TAKEN_FOR_THE_PRODUCT) assert.equal(reservedUsername(n, r), false, `${n} (today's rule, unchanged)`);
  }
  assert.equal(reservedUsername("CityCoinDev"), false, "no second argument: today's rule");
});

test("GL-1: the display name at registration refuses CityCoinDev under BRAND=citycoin (400 username_reserved); today's sign-up keeps it free", async () => {
  W.useClock("2026-10-25T12:00:00Z");
  const ON = { WALLET_ONLY: "on", DEPLOYMENT_ENV: "test", SITE_ORIGIN: W.ORIGIN, SITE_ORIGINS: W.ORIGIN };
  const nameAnswer = async (env, displayName) => {
    const b = W.browser(env);
    assert.equal((await b.post("/api/signup/start")).ok, true);
    assert.equal((await b.post("/api/signup/location", { location: W.IN_UTICA, country: "US" })).ok, true);
    const res = await b.send("/api/signup/name", { method: "POST", body: { displayName } });
    return [res.status, (await res.json()).error || null];
  };
  assert.deepEqual(await nameAnswer(W.V2({ ...ON, OFFICIAL_X_URL: X }), "CityCoinDev"), [200, null], "BRAND unset: today's rule");
  cc();
  for (const n of ["CityCoinDev", "Citycoin", "C1tyc0inDev"]) assert.deepEqual(await nameAnswer(W.V2({ ...ON, ...CC }), n), [400, "username_reserved"], n);
  assert.deepEqual(await nameAnswer(W.V2({ ...ON, ...CC }), "Sakib_Utica"), [200, null]);
});

test("GL-1: the screener's staff rule flags the label set's name next to a staff word when the context carries it; without it, today's rule", () => {
  const city = { name: "Utica", region: "New York", countryName: "United States", country: "US" };
  const staff = (r) => r.issues.some((x) => x.code === "staff");
  assert.equal(staff(screenName("Citycoin Team", { city })), false, "today's context: only 'Vicinity' counts");
  assert.equal(staff(screenName("Vicinity Team", { city })), true);
  const ctx = { city, brandNames: [...ownWords(CITYCOIN_BRAND)] };
  for (const t of ["Citycoin Team", "CityCoinDev Support", "Official Citycoins Staff"]) assert.equal(staff(screenName(t, ctx)), true, t);
  assert.equal(staff(screenDescription("The Citycoin team is not part of this coin. Utica people made it for Utica.", ctx)), true);
  assert.equal(screenName("Citycoin Team", ctx).rulesVersion, screenName("Citycoin Team", { city }).rulesVersion, "the lists' version is the lists' (a person reads every founder text)");
});

/* ---------------------------------------------------------------- GL-8: the link checker's websites */

const GOLIVE_SITE = Object.freeze({ SITE_ORIGIN: "https://citycoin.dev", SITE_ORIGINS: "https://citycoin.dev https://vicinity.city", DEPLOYMENT_ENV: "production" });

test("GL-8: under BRAND=citycoin only a served host (SITE_ORIGINS, exactly) is the official website; the other names of ours are said as they are", () => {
  cc();
  const env = { ...CC, ...GOLIVE_SITE };
  const ask = (u) => checkOfficial(u, isSolanaAddress, env);
  for (const u of ["citycoin.dev", "https://citycoin.dev/rules", "vicinity.city"]) assert.deepEqual([ask(u).verdict, ask(u).message], ["official", "This is the official Citycoin.dev website."], u);
  assert.equal(ask("http://citycoin.dev").verdict, "warning");
  assert.match(ask("http://citycoin.dev").message, /^Right site, but the link uses http/);
  for (const u of ["www.citycoin.dev", "https://www.vicinity.city", "vicinitycity.net", "vicinitycity.com", "www.vicinitycity.com", "http://vicinitycity.net"]) {
    const a = ask(u);
    assert.deepEqual([a.verdict, a.ours, a.message], ["warning", true, "This is an address of ours, but it does not serve the Citycoin.dev site, so nothing there is official."], u);
  }
  for (const u of ["evil.citycoin.dev", "app.citycoin.dev", "citycoin.dev.evil.com", "https://citycoin.dev@evil.com/", "t.me/CityCoinDev"]) assert.equal(ask(u).verdict, "not_official", u);
  // before SITE_ORIGINS names citycoin.dev: the planned address, as before (review finding F9), for the apex and its www
  for (const u of ["citycoin.dev", "www.citycoin.dev"]) assert.match(checkOfficial(u, isSolanaAddress, CC).message, /^This is the address planned for Citycoin\.dev\./, u);
  assert.equal(checkOfficial("vicinity.city", isSolanaAddress, CC).verdict, "official", "SITE_ORIGINS unset: today's host is the one served");
});

test("GL-8: with BRAND unset every website answer is today's (the published list, www. stripped)", () => {
  for (const env of [{}, GOLIVE_SITE]) {
    for (const u of ["citycoin.dev", "www.citycoin.dev", "vicinity.city", "www.vicinity.city", "vicinitycity.net", "vicinitycity.com"]) {
      assert.deepEqual([checkOfficial(u, isSolanaAddress, env).verdict, checkOfficial(u, isSolanaAddress, env).message], ["official", "This is the official Vicinity website."], u);
    }
  }
});

/* ---------------------------------------------------------------- GL-HON-7: the balance history */

test("GL-HON-7: under BRAND=citycoin (no token sampled) the $VICINITY days and samples are not pruned; with BRAND unset the 45-day prune is as before", async () => {
  const now = Date.parse("2026-12-31T03:05:00Z");
  const seed = async (env) => {
    await ensureSchema(env.DB);
    await putBlob(env.DB, "day:2026-10-24", { day: "2026-10-24", n: 1 });
    await putBlob(env.DB, "day:2026-12-30", { day: "2026-12-30", n: 1 });
    await env.DB.prepare("INSERT INTO balance_samples (taken_at, day, slot, holders, hash) VALUES (?, ?, ?, ?, ?)").bind("2026-10-24T01:00:00.000Z", "2026-10-24", 1, 3, "h1").run();
  };
  const samples = async (env) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM balance_samples").first()).n;
  cc();
  const brand = W.newWorld({ BRAND: "citycoin", VICINITY_MINT: W.MINT });
  await seed(brand);
  await pruneLedger(brand, now);
  assert.ok(await getBlob(brand.DB, "day:2026-10-24"), "kept as history: nothing is sampled, so nothing is forgotten");
  assert.equal(await samples(brand), 1);
  _pagesBuiltForTests(null);
  const today = W.newWorld({ VICINITY_MINT: W.MINT });
  await seed(today);
  await pruneLedger(today, now);
  assert.equal(await getBlob(today.DB, "day:2026-10-24"), null, "today's site: older than 45 days is forgotten, as before");
  assert.ok(await getBlob(today.DB, "day:2026-12-30"));
  assert.equal(await samples(today), 0);
});

/* ---------------------------------------------------------------- GL-DEP-8: the edge keys */

test("GL-DEP-8: /api/fees and /api/official-coins are kept under keys that name the label set's mode; with BRAND unset the keys are today's", async () => {
  W.useClock("2026-10-25T12:00:00Z");
  const asked = [], had = globalThis.caches;
  globalThis.caches = { default: { match: async (r) => { asked.push(new URL(r.url).pathname.slice(1)); return undefined; }, put: async () => {} } };
  const down = async () => new Response("down", { status: 503 }); // every chain read fails: only the key matters here
  try {
    const keys = async (env) => {
      asked.length = 0;
      for (const p of ["/api/fees", "/api/official-coins"]) await W.browser(env).send(p, { fetchImpl: down });
      return [...asked];
    };
    const base = { ...LP_ON, LAUNCHPAD_DBC_CONFIGS: SOL_CONFIG };
    const today = await keys(W.newWorld(base));
    assert.equal(today[0], "fees-live", "today's key, byte for byte");
    assert.match(today[1], /^official-coins-json-devnet-[^-]+-[0-9a-f]+$/, "today's key, byte for byte (no suffix)");
    cc();
    const brand = await keys(W.newWorld({ ...base, BRAND: "citycoin" }));
    assert.deepEqual(brand, [`${today[0]}-nolegacy`, `${today[1]}-nolegacy`], "a label-set change never serves an answer kept before it");
  } finally {
    if (had === undefined) delete globalThis.caches; else globalThis.caches = had;
  }
});
