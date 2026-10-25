// Coin-art template t2 (src/coinart-t2.js; Citycoin.dev master v5, stage S22): the new-program coin picture beside t1. t1 keeps every
// byte (one digest over the t1 SVG of all 8,030 registry cities, recorded at edabab5), t2 reuses t1's fitting, takes its colours from
// the Civic Atlas tokens and its emblem from the brand file shape for shape, follows the same safety rules, and is pinned by golden SVG
// and PNG hashes (t2 is immutable from here: a change of one pixel is t3). No Worker path loads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { TEMPLATES, TEMPLATE_VERSION, coinSvg, fitCoin } from "../src/coinart.js";
import { ART_TEMPLATES, T2, T2_COLORS, artSvg, artTemplate, coinSvgT2 } from "../src/coinart-t2.js";
import { NAME_OVERRIDES } from "../src/coindefaults.js";
import { nodeRenderer } from "../scripts/coin-art/render.mjs";

const file = (p) => readFileSync(new URL(`../${p}`, import.meta.url));
const text = (p) => file(p).toString("utf8");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const LEGACY = JSON.parse(text("test/fixtures/s22-legacy-outputs.json"));
const tickers = JSON.parse(text("public/data/tickers.json"));
const cities = JSON.parse(text("public/data/cities.json"));
const registry = [];
for (const list of Object.values(cities.byCountry)) for (const r of list) { const v = tickers[String(r[0])]; if (v) registry.push({ id: String(r[0]), name: r[1], ticker: typeof v === "string" ? v : v[0] }); }
const byId = (id) => registry.find((r) => r.id === String(id));

// the six coins test/coinart.test.js pins for t1, drawn in t2
const GOLDEN_T2 = {
  5142056: { svg: "5e75ab1bbea0e9277222d1fc74195882c3d115722d2de070bec6adb2f0974566", png: "8797dae6e2dc945ade6ca793a745a73c61a9a7153b9755ed360d0d46941d6a17" }, // UTICA
  5128581: { svg: "8588edd63177cd7d13ffc26d3ac188eaf1ac7e9851c746eda36a3c24b25ffc8f", png: "03bf909ef5b26ca7f0da16a49c7fe3f660f783af453f9075a681db4dfe7297eb" }, // NYC
  1735161: { svg: "d40ad883b75ae84c5734c8c6742e1841813db6e2a72d6c91a581387e62519282", png: "4674c4d461f4ee1d7bdb1e26118a0be4344d65c643ddd84d8507dcf2c88ea7e7" }, // KUALALUM
  7259621: { svg: "ac20fc6ae3bebf3f8adecc06c8062c43957b4ebcd26daa8bfb1f95d0768fe84e", png: "d4c997a484f4f6c70e7ab3ca383b826db2115204403d842b330f8d50ca15031c" }, // WBT, two lines
  1140026: { svg: "f5f8cf4e17c16f762553d761a505cf5977de3a063734c822293bd9550256622f", png: "eef937c4945c66a4461714c867bf3ec2db4b963d59c803bd6387d8fb4488b071" }, // HERAT (ā)
  1194041: { svg: "60f779d2e19aa0634155c9acbc04f32cbc5fbcc869cb9c48bc4405ab37edbe49", png: "2ac259b2fcaa7696840e6108b0e27a465ca8168e12994e22f811971f6a05d329" }, // MOHAMMADPU
};

test("t1 is byte for byte what edabab5 drew: one digest over the t1 SVG of every registry coin (and the three short coin names) is the recorded one", () => {
  const lines = [];
  for (const r of registry) {
    const svg = coinSvg({ ticker: r.ticker, city: r.name });
    assert.equal(artSvg({ ticker: r.ticker, city: r.name, templateVersion: "t1" }), svg, `${r.ticker}: artSvg t1 is coinSvg`);
    lines.push(`${r.id} ${sha(svg)}`);
    if (NAME_OVERRIDES[r.id]) lines.push(`${r.id}* ${sha(coinSvg({ ticker: r.ticker, city: NAME_OVERRIDES[r.id], templateVersion: "t1" }))}`);
  }
  assert.equal(lines.length, LEGACY.t1Registry.coins);
  assert.equal(sha(lines.join("\n")), LEGACY.t1Registry.digest, "every stored t1 picture still has the SVG it was drawn from");
});

test("src/coinart.js is as it was: t1 only, t1 the default, the same template numbers, fonts and renderer as at edabab5", () => {
  assert.deepEqual(Object.keys(TEMPLATES), ["t1"]);
  assert.equal(TEMPLATE_VERSION, "t1");
  assert.deepEqual(JSON.parse(JSON.stringify(TEMPLATES)), LEGACY.coinart.TEMPLATES);
  assert.equal(ART_TEMPLATES.t1, TEMPLATES.t1, "t1 is the same frozen object, not a copy");
  assert.equal(artTemplate("t2"), T2);
  for (const bad of ["t3", "T2", "", undefined, "toString", "__proto__"]) assert.throws(() => artTemplate(bad), /unknown template version/, String(bad));
  assert.throws(() => artSvg({ ticker: "UTICA", city: "Utica", templateVersion: "t9" }), /unknown template version/);
  assert.ok(Object.isFrozen(T2) && Object.isFrozen(T2.ticker) && Object.isFrozen(T2.city) && Object.isFrozen(T2.arc) && Object.isFrozen(T2.mark) && Object.isFrozen(T2_COLORS));
});

test("t2 fits text exactly as t1: the same numbers, and the same sizes and lines for every registry coin", () => {
  assert.deepEqual({ ...T2.ticker }, { ...TEMPLATES.t1.ticker });
  assert.deepEqual({ ...T2.city }, { ...TEMPLATES.t1.city });
  assert.deepEqual({ ...T2.arc, text: null }, { ...TEMPLATES.t1.arc, text: null });
  assert.equal(T2.arc.text, "CITYCOIN.DEV");
  assert.equal(T2.fonts, TEMPLATES.t1.fonts);
  assert.equal(T2.resvg, TEMPLATES.t1.resvg);
  for (const r of registry) {
    const a = fitCoin({ ticker: r.ticker, city: r.name }), b = fitCoin({ ticker: r.ticker, city: r.name, template: T2 });
    assert.deepEqual({ ...b, template: "t1" }, a, r.name);
  }
});

test("t2's colours are the Civic Atlas tokens of public/brand/tokens.css, and its emblem is public/brand/citycoin-icon-dark.svg shape for shape", () => {
  const css = text("public/brand/tokens.css");
  const token = (name) => new RegExp(`--cc-${name}:\\s*(#[0-9A-F]{6})`, "i").exec(css)[1].toUpperCase();
  const dark = css.slice(css.indexOf("Dark counterpart"));
  const darkToken = (name) => new RegExp(`--cc-${name}:\\s*(#[0-9A-F]{6})`, "i").exec(dark)[1].toUpperCase();
  assert.equal(T2_COLORS.rim, token("gold"));
  assert.equal(T2_COLORS.ticker, token("gold"));
  assert.equal(T2_COLORS.ring, token("teal"));
  assert.equal(T2_COLORS.accent, token("teal"));
  assert.equal(T2_COLORS.navy, token("navy"));
  assert.equal(T2_COLORS.tickerEdge, token("navy"));
  assert.equal(T2_COLORS.text, token("on-navy"));
  assert.equal(T2_COLORS.fieldOut, darkToken("canvas"));
  assert.equal(T2_COLORS.gap, darkToken("canvas"));
  assert.equal(T2_COLORS.fieldIn, darkToken("card"));
  const svg = coinSvgT2({ ticker: "UTICA", city: "Utica" });
  const used = new Set([...svg.matchAll(/#[0-9A-F]{6}\b/gi)].map((m) => m[0].toUpperCase()));
  assert.deepEqual([...used].sort(), [...new Set(Object.values(T2_COLORS).concat("#FFFFFF"))].sort(), "no other colour");
  // the emblem: every path of the brand file, in order, with its fill, stroke and clip (ids renamed ccid- to cc-)
  const icon = text("public/brand/citycoin-icon-dark.svg").replace(/ccid-/g, "cc-");
  const shapes = (s) => [...s.matchAll(/<path (?:fill="[^"]+" )?(?:clip-path="url\(#cc-(?:sky|edge)\)" )?d="[^"]+"\/>/g)].map((m) => m[0]);
  const iconShapes = shapes(icon.slice(icon.indexOf("</defs>")));
  const g = svg.indexOf("<g transform="), coinShapes = shapes(svg.slice(g, svg.indexOf("</g>\n", g)));
  assert.equal(iconShapes.length, 9);
  assert.deepEqual(coinShapes, iconShapes);
  assert.ok(svg.includes('<g fill="#FFFFFF" stroke="#FFFFFF" stroke-width="24" stroke-linejoin="round">'), "the white outline");
  for (const clip of icon.matchAll(/<clipPath id="cc-(sky|edge)">([\s\S]*?)<\/clipPath>/g)) assert.ok(svg.includes(`<clipPath id="cc-${clip[1]}">${clip[2]}</clipPath>`), clip[1]);
});

test("the t2 SVG: the registry ticker only, escaped text, no script, style, image or outside reference, numbers to 2 decimals", () => {
  const svg = coinSvgT2({ ticker: "UTICA", city: `Utica & <script>alert("x")</script> 'q'` });
  assert.doesNotMatch(svg, /<script|<style|<image|<foreignObject|on[a-z]+=/i);
  assert.match(svg, />UTICA &amp;<\/text>/);
  assert.match(svg, />&lt;SCRIPT&gt;ALERT\(&quot;X&quot;\)&lt;\/SCRIPT&gt; &#39;Q&#39;<\/text>/);
  const refs = [...svg.matchAll(/(?:xlink:)?href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(refs)], ["#cc-arc"]);
  assert.deepEqual([...new Set([...svg.matchAll(/url\(#([a-z-]+)\)/g)].map((m) => m[1]))].sort(), ["cc-edge", "cc-field", "cc-sky"]);
  assert.match(svg, />\$UTICA</);
  assert.match(svg, />CITYCOIN\.DEV<\/textPath>/);
  assert.doesNotMatch(svg, /VICINITY/i);
  for (const n of svg.matchAll(/="(-?\d+\.\d+)"/g)) assert.match(n[1], /^-?\d+\.\d{2}$/, n[1]);
  assert.match(svg, /<g transform="translate\(202\.24 99\.50\) scale\(0\.21\)">/);
  for (const bad of ["utica", "UTICA!", "", "ABCDEFGHIJK", null, 12]) assert.throws(() => coinSvgT2({ ticker: bad, city: "Utica" }), /ticker/);
  assert.throws(() => coinSvgT2({ ticker: "BEIJING", city: "北京" }), /nothing the coin font can draw/);
  assert.equal(artSvg({ ticker: "UTICA", city: "Utica", templateVersion: "t2" }), coinSvgT2({ ticker: "UTICA", city: "Utica" }));
});

test("the emblem stays clear of the ticker: it ends at y 203.24, at least 10 px above the ticker's caps on one line and on two", () => {
  const m = T2.mark, bottom = m.y + 494 * m.scale, top = m.y + 2 * m.scale; // the emblem's ink with its outline: grid y 2 to 494
  assert.equal(bottom.toFixed(2), "203.24");
  assert.ok(top > 256 - 204 + 20, "inside the ring with room to spare");
  assert.equal((m.x + 256 * m.scale).toFixed(2), "256.00", "centred");
  const T = T2.ticker;
  assert.ok(T.centerY - 0.35 * T.start - bottom >= 10, "one line, largest ticker");
  assert.ok(T.twoLineCenterY - 0.35 * T.twoLineMax - bottom >= 10, "two lines");
  for (const r of registry) {
    const f = fitCoin({ ticker: r.ticker, city: r.name, template: T2 });
    assert.ok(f.tickerCenterY - 0.35 * f.tickerSize - bottom >= 10, r.ticker);
  }
});

test("t2 is pinned: the SVG and PNG of six coins (resvg-wasm 2.6.2, 512 x 512, under 150 KB, the same bytes on every render)", async () => {
  const render = await nodeRenderer();
  for (const [id, g] of Object.entries(GOLDEN_T2)) {
    const r = byId(id);
    const svg = coinSvgT2({ ticker: r.ticker, city: r.name });
    assert.equal(sha(svg), g.svg, `${r.ticker} SVG`);
    const png = await render(svg);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dv = new DataView(png.buffer, png.byteOffset);
    assert.deepEqual([dv.getUint32(16), dv.getUint32(20)], [512, 512]);
    assert.ok(png.length < 150_000, `${png.length} bytes`);
    assert.equal(sha(png), g.png, `${r.ticker}: t2 renders exactly these bytes (a change is a new template version)`);
    assert.equal(sha(await render(svg)), g.png);
  }
});
