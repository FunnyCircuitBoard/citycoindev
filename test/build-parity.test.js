// Build parity (Citycoin.dev master v5, stage S02; rebrand-inventory.md section 6 "build parity test"): with BRAND unset, the page
// build gives the committed public/*.html byte for byte, and every product name the layout writes comes from src/brand.js. Nothing
// visible changes until a later stage adds a label set and a configuration pull request sets BRAND.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PAGES_BUILT_FILE, buildPages, buildStandalonePages, deployedVars, pageBrand, pageLegacySeats, pagesBuiltSource } from "../scripts/pages/build.mjs";
import { FROZEN_COPY } from "../scripts/pages/frozen-copy.mjs";
import { BRANDS, LEGACY_BRAND, brandLabels, brandOf } from "../src/brand.js";
import { SOCIAL_PROFILES } from "../src/official.js";

const committed = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url));
const sources = readdirSync(new URL("../scripts/pages/src/", import.meta.url)).filter((f) => f.endsWith(".html")).sort();
const all = (opts) => [...buildPages(opts), ...buildStandalonePages(opts)];
const sameBytes = (pages, why) => {
  assert.deepEqual(pages.map(([f]) => f).sort(), sources, "one page per source file");
  for (const [f, html] of pages) assert.ok(Buffer.from(html, "utf8").equals(committed(f)), `public/${f} differs from the build (${why})`);
};

test("BRAND is not set in wrangler.jsonc: the pages are built with today's label set", () => {
  assert.equal(Object.hasOwn(deployedVars(), "BRAND"), false);
  const b = pageBrand();
  assert.equal(b.value, "");
  assert.equal(b.problem, null);
  for (const k of Object.keys(LEGACY_BRAND)) assert.equal(b[k], LEGACY_BRAND[k], k);
  assert.deepEqual(Object.keys(BRANDS), [""], "only today's label set exists at this stage");
});

test("with BRAND unset, every built page is byte-identical to the committed public/ file (main and standalone pages)", () => {
  sameBytes(all(), "default build");
  for (const env of [{}, { BRAND: "" }, { BRAND: "   " }, { BRAND: undefined }]) sameBytes(all({ brand: brandOf(env) }), `BRAND=${JSON.stringify(env.BRAND)}`);
  sameBytes(all({ brand: LEGACY_BRAND }), "LEGACY_BRAND");
});

test("the shell's environment never reaches the page build (every build of a commit is the same)", () => {
  const before = process.env.BRAND;
  process.env.BRAND = "citycoin";
  try { sameBytes(all(), "BRAND set in the shell only"); } finally { if (before === undefined) delete process.env.BRAND; else process.env.BRAND = before; }
});

test("today's labels are exactly the strings the layout wrote before src/brand.js", () => {
  const L = brandLabels(LEGACY_BRAND);
  assert.equal(L.homeTitle, "Vicinity — One city. One coin. One community.");
  assert.equal(L.pageTitle("Token"), "Token · Vicinity");
  assert.equal(L.homeLink, "Vicinity home");
  assert.equal(L.headerName, "Vicinity");
  assert.equal(L.copyright, "Vicinity.city © 2026. All rights reserved.");
  assert.equal(L.socialList, "Vicinity on social media");
  assert.equal(L.socialLink("X", "@VicinityCitySOL"), "Vicinity on X (@VicinityCitySOL), opens in a new tab");
  assert.equal(L.safety, "Vicinity never asks for your recovery phrase or private key.");
});

test("every product name in the layout comes from src/brand.js: a fake label set moves exactly those positions and nothing else", () => {
  // clearly fake test values; replacing them back must give the committed bytes, so no other byte of any page moved
  const FAKE = { key: "zqkey", productName: "Zqfakebrand", shortName: "Zqshort", domain: "zqfake.example", siteLabel: "Zqfakesite.example", senderName: "Zqsender", tagline: "Zq fake tagline." };
  const pages = all({ brand: FAKE });
  assert.deepEqual(pages.map(([f]) => f).sort(), sources);
  for (const [f, html] of pages) {
    const before = committed(f).toString("utf8");
    for (const v of Object.values(FAKE)) assert.ok(!before.includes(v), `precondition: ${v} is not in public/${f}`);
    assert.notEqual(html, before, `public/${f} carries the layout's labels`);
    const count = (s) => html.split(s).length - 1;
    // title, og:title, the header link's label and text, the social list label, one label per social account, the security line
    assert.equal(count(FAKE.productName), 6 + SOCIAL_PROFILES.length, `${f}: product-name positions`);
    assert.equal(count(FAKE.siteLabel), 1, `${f}: the copyright line`);
    assert.equal(count(FAKE.tagline), f === "index.html" ? 2 : 0, `${f}: the home title and its og:title`);
    const back = html.replaceAll(FAKE.siteLabel, LEGACY_BRAND.siteLabel).replaceAll(FAKE.tagline, LEGACY_BRAND.tagline).replaceAll(FAKE.productName, LEGACY_BRAND.productName);
    assert.ok(Buffer.from(back, "utf8").equals(committed(f)), `${f}: only label positions changed`);
  }
});

test("labels are escaped where the layout writes them into markup", () => {
  const brand = { ...LEGACY_BRAND, productName: 'Zq "<b>&', siteLabel: "Zq<i>" };
  const html = new Map(buildPages({ brand })).get("token.html");
  assert.doesNotMatch(html, /<b>|<i>/);
  assert.match(html, /<title>[^<]* · Zq &quot;&lt;b&gt;&amp;<\/title>/);
  assert.match(html, /aria-label="Zq &quot;&lt;b&gt;&amp; home"/);
  assert.match(html, /> Zq&lt;i&gt; © 2026\. All rights reserved\.<\/p>/);
});

test("an unknown BRAND stops the page build instead of shipping today's labels under a new switch value", () => {
  assert.throws(() => pageBrand({ BRAND: "citycoin" }), /BRAND="citycoin" is not a label set of src\/brand\.js \(BRAND_UNKNOWN\)/);
  assert.throws(() => brandLabels({ ...LEGACY_BRAND, productName: " " }), /productName must be a non-empty string/);
});

test("the legacy seat freeze (stage S16): unset in wrangler.jsonc, every page and src/pages-built.js are today's bytes; the shell never reaches it", () => {
  assert.equal(Object.hasOwn(deployedVars(), "LEGACY_SEATS"), false, "LEGACY_SEATS is not set in wrangler.jsonc");
  assert.deepEqual(pageLegacySeats(), { legacySeats: "on" });
  sameBytes(all(), "default build");
  sameBytes(all({ legacySeats: "on" }), "legacySeats on");
  const before = process.env.LEGACY_SEATS;
  process.env.LEGACY_SEATS = "frozen";
  try { sameBytes(all(), "LEGACY_SEATS=frozen set in the shell only"); } finally { if (before === undefined) delete process.env.LEGACY_SEATS; else process.env.LEGACY_SEATS = before; }
  // the record the Worker reads: the same four lines as before the freeze existed (the key is written only for pages built frozen)
  const file = readFileSync(PAGES_BUILT_FILE, "utf8");
  assert.equal(file, pagesBuiltSource());
  assert.equal(file, [
    "// Written by scripts/pages/build.mjs from the settings of wrangler.jsonc; do not edit (test/build-parity.test.js checks it).",
    "// What the deployed pages in public/ were built with, and whether wrangler.jsonc sends them through the Worker (run_worker_first true).",
    "// src/v5policy.js counts MAIN_TOKEN_V5 only when mainTokenV5 is true here, and HOST_REDIRECT only when pagesReachWorker is true.",
    "export const PAGES_BUILT = Object.freeze({ mainTokenV5: false, brand: \"\", pagesReachWorker: false });",
    "",
  ].join("\n"));
  // frozen, only the pages the frozen copy names change (the others stay today's bytes); an unknown value never builds
  const frozen = all({ legacySeats: "frozen" });
  for (const [f, html] of frozen) assert.equal(Buffer.from(html, "utf8").equals(committed(f)), !Object.hasOwn(FROZEN_COPY, f), f);
  assert.throws(() => buildPages({ legacySeats: "maybe" }), /legacySeats must be "on" or "frozen"/);
});
