// Design v5 (docs/DESIGN-V5.md, sections 11 and 12): the contrast table recomputed from the token blocks, and the token discipline.
// The table is read from public/style.css (both theme blocks, the scale blocks, the map's --st-* and the market's --up/--down lines) and
// public/polish-map.css (--st-active, frozen by cities.js); surfaces that are not tokens are composited exactly as section 12 says (glass
// over the page, the well as ink over --bg-2, the chip over the water, the pass corners as the glows over the pass). Every row is asserted
// at its kind's bar: T text 4.5:1, L large text 3:1, U UI (borders, icons, rings, marks, chart lines) 3:1, D decoration (recorded, no bar).
// Run on its own (node --test test/design-v5.test.js) it prints the table it checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("style.css");
const mapCss = read("polish-map.css");

// ---- colour maths (WCAG 2.x relative luminance, sRGB) ----
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hexOf = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const lum = (hex) => { const [r, g, b] = rgbOf(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** rgba [r,g,b,a] composited over an opaque hex. */
const over = ([r, g, b, a], bg) => hexOf(rgbOf(bg).map((v, i) => [r, g, b][i] * a + v * (1 - a)));
const hue = (hex) => { const [r, g, b] = rgbOf(hex).map((v) => v / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; if (!d) return 0; let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return h * 60; };
const hueGap = (a, b) => { const d = Math.abs(hue(a) - hue(b)) % 360; return d > 180 ? 360 - d : d; };

// ---- the token blocks ----
const head = css.slice(0, css.indexOf("/* ---------- base ---------- */"));
assert.ok(head.length > 0, "style.css has its base marker after the token blocks");
/** Every `--name: value;` of a block, comments removed. */
const decls = (block) => { const out = {}; for (const m of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim(); return out; };
/** The blocks of the token section, in order, each tagged dark (`:root {`) or light (`:root[data-theme="light"] {`); media ladders skipped. */
const blocks = [...head.matchAll(/^(:root(?:\[data-theme="light"\])?) \{\n([\s\S]*?)\n\}/gm)].map((m) => ({ theme: m[1].includes("light") ? "light" : "dark", decls: decls(m[2]) }));
assert.equal(blocks.filter((b) => b.theme === "dark").length, 2, "two dark root blocks (tokens, scale)");
assert.equal(blocks.filter((b) => b.theme === "light").length, 2, "two light root blocks (tokens, scale)");
const lineTokens = (re, src) => { const m = re.exec(src); assert.ok(m, re); return decls(m[1]); };
const DARK = Object.assign({}, ...blocks.filter((b) => b.theme === "dark").map((b) => b.decls),
  lineTokens(/^:root \{ (--st-open:[^\n]*) \}$/m, css), lineTokens(/^:root \{ (--up:[^\n]*) \}$/m, css), lineTokens(/^:root \{ (--st-active:[^\n]*) \}$/m, mapCss));
const LIGHT = Object.assign({}, DARK, ...blocks.filter((b) => b.theme === "light").map((b) => b.decls),
  lineTokens(/^:root\[data-theme="light"\] \{ (--st-open:[^\n]*) \}$/m, css), lineTokens(/^:root\[data-theme="light"\] \{ (--up:[^\n]*) \}$/m, css), lineTokens(/^:root\[data-theme="light"\] \{ (--st-active:[^\n]*) \}$/m, mapCss));

/** A token's value as an opaque hex (#RRGGBB) or an rgba tuple [r,g,b,a]; var() and rgba(var(--x-rgb), a) are followed. */
function resolve(T, value, depth = 0) {
  assert.ok(depth < 8, `token chain too deep at ${value}`);
  const v = value.trim();
  let m;
  if ((m = /^#([0-9A-Fa-f]{6})$/.exec(v))) return "#" + m[1].toUpperCase();
  if ((m = /^var\((--[a-z0-9-]+)\)$/.exec(v))) { assert.ok(T[m[1]] !== undefined, `${m[1]} is defined`); return resolve(T, T[m[1]], depth + 1); }
  if ((m = /^rgba\(\s*var\((--[a-z0-9-]+)\)\s*,\s*(\.?\d*\.?\d+)\s*\)$/.exec(v))) { const t = T[m[1]]; assert.ok(t, `${m[1]} is defined`); return [...t.split(",").map(Number), Number(m[2])]; }
  if ((m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\.?\d*\.?\d+)\s*\)$/.exec(v))) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  assert.fail(`cannot read ${value} as a colour`);
}
const hex = (T, name) => { const r = resolve(T, T[name] ?? name); assert.equal(typeof r, "string", `${name} is opaque`); return r; };
const tint = (T, name, bg) => { const r = resolve(T, T[name] ?? name); assert.ok(Array.isArray(r), `${name} is a tint`); return over(r, bg); };
const stops = (T) => { const g = /^linear-gradient\(100deg, (.+)\)$/.exec(T["--grad-accent"]); assert.ok(g, "--grad-accent is a three-stop linear-gradient(100deg, …)"); const s = [...g[1].matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase()); assert.equal(s.length, 3); return s; };

/** The surfaces of one theme: tokens and section 12's composites. */
function surfaces(T) {
  const bg = hex(T, "--bg"), bg2 = hex(T, "--bg-2"), bg3 = hex(T, "--bg-3");
  const well = typeof resolve(T, T["--surface-inset"]) === "string" ? hex(T, "--surface-inset") : tint(T, "--surface-inset", bg2);
  const glass = tint(T, "--glass-bg", bg), glassStrong = tint(T, "--glass-bg-strong", bg);
  const water = hex(T, "--map-water"), land = hex(T, "--map-land");
  const chip = tint(T, "--chip-bg", water);
  const passA = hex(T, "--pass-a"), passB = hex(T, "--pass-b");
  return { bg, bg2, bg3, well, glass, glassStrong, tabbar: glassStrong, water, land, chip, passA, passTeal: tint(T, "--pass-glow-1", passA), passGold: tint(T, "--pass-glow-2", passB) };
}

const BAR = { T: 4.5, L: 3, U: 3, D: 0 };
/** The rows of section 12 for one theme: [kind, label, foreground hex, background hex]. */
function rows(T) {
  const S = surfaces(T);
  const soft = (n) => tint(T, n, S.bg);
  const [g1, g2, g3] = stops(T);
  const r = [];
  const add = (kind, label, fg, bg) => r.push({ kind, label, fg, bg, ratio: ratio(fg, bg) });
  add("T", "--text on --bg", hex(T, "--text"), S.bg); add("T", "--text on --bg-3", hex(T, "--text"), S.bg3);
  add("T", "--text-2 on --bg", hex(T, "--text-2"), S.bg); add("T", "--text-2 on --bg-3", hex(T, "--text-2"), S.bg3);
  add("T", "--muted on --bg", hex(T, "--muted"), S.bg); add("T", "--muted on --bg-2 (card)", hex(T, "--muted"), S.bg2);
  add("T", "--muted on --bg-3 (tile)", hex(T, "--muted"), S.bg3); add("T", "--muted on the well", hex(T, "--muted"), S.well);
  add("D", "--faint on --bg (decoration only)", hex(T, "--faint"), S.bg);
  add("T", "--pin-2 links on --bg", hex(T, "--pin-2"), S.bg); add("T", "--pin-2 on --bg-2", hex(T, "--pin-2"), S.bg2); add("T", "--pin-2 on --bg-3", hex(T, "--pin-2"), S.bg3);
  add("T", "--pin-2 on --accent-soft (live pill)", hex(T, "--pin-2"), soft("--accent-soft"));
  add("U", "--pin mark on --bg", hex(T, "--pin"), S.bg); add("U", "--pin current-tab icon on the tab bar", hex(T, "--pin"), S.tabbar);
  add("T", "--on-cta on --cta-a (main button)", hex(T, "--on-cta"), hex(T, "--cta-a")); add("T", "--on-cta on --cta-b", hex(T, "--on-cta"), hex(T, "--cta-b"));
  add("T", "--on-gold on --gold (badges, discs, coin art)", hex(T, "--on-gold"), hex(T, "--gold"));
  add("T", "--on-accent on --pin (skip link)", hex(T, "--on-accent"), hex(T, "--pin"));
  add("T", "--on-accent on --bad-text (not-official icon)", hex(T, "--on-accent"), hex(T, "--bad-text"));
  add("T", "--on-accent on --ok-text (done step)", hex(T, "--on-accent"), hex(T, "--ok-text"));
  for (const [name, softName] of [["--ok-text", "--ok-soft"], ["--bad-text", "--bad-soft"], ["--gold-text", "--gold-soft"], ["--warn", "--warn-soft"]]) {
    add("T", `${name} on --bg`, hex(T, name), S.bg); add("T", `${name} on --bg-3`, hex(T, name), S.bg3); add("T", `${name} on ${softName}`, hex(T, name), soft(softName));
  }
  add("T", "--blue on --bg", hex(T, "--blue"), S.bg);
  add("T", "--muted on header glass at rest", hex(T, "--muted"), S.glass); add("T", "--muted on header glass scrolled", hex(T, "--muted"), S.glassStrong);
  add("T", "--text-2 on header glass at rest", hex(T, "--text-2"), S.glass); add("T", "--text on header glass scrolled", hex(T, "--text"), S.glassStrong);
  add("L", "--grad-accent stop 1 on --bg", g1, S.bg); add("L", "--grad-accent stop 2 on --bg", g2, S.bg); add("L", "--grad-accent stop 3 on --bg", g3, S.bg);
  add("L", "--grad-accent stop 1 on --bg-2", g1, S.bg2); add("L", "--grad-accent stop 3 on --bg-2", g3, S.bg2);
  for (const [label, bg] of [["--bg", S.bg], ["--bg-2", S.bg2], ["--bg-3", S.bg3], ["the well", S.well]]) add("U", `--field-line on ${label}`, tint(T, "--field-line", bg), bg);
  add("U", "focus ring --focus-ring on --bg", hex(T, "--focus-ring"), S.bg); add("U", "focus ring --focus-ring on --bg-2", hex(T, "--focus-ring"), S.bg2);
  add("T", "white on the pass's teal corner", "#FFFFFF", S.passTeal); add("T", "white on the pass's gold corner", "#FFFFFF", S.passGold); add("T", "white on --pass-a", "#FFFFFF", S.passA);
  add("U", "#7CE8A6 live dot on the pass's gold corner", "#7CE8A6", S.passGold);
  for (const st of ["--st-open", "--st-active", "--st-founded", "--st-choosing", "--st-mine"]) { add("U", `${st} on land`, hex(T, st), S.land); add("U", `${st} on water`, hex(T, st), S.water); }
  add("T", "--st-open as pill text on the chip", hex(T, "--st-open"), S.chip); add("T", "--st-open as pill text on --bg-2", hex(T, "--st-open"), S.bg2);
  add("U", "--up on --bg-2", hex(T, "--up"), S.bg2); add("U", "--down on --bg-2", hex(T, "--down"), S.bg2);
  add("U", "--chart-1 on --bg-2", hex(T, "--chart-1"), S.bg2); add("U", "--chart-2 on --bg-2", hex(T, "--chart-2"), S.bg2);
  add("U", "--gold-ui (the progress bars' gold end) on --bg-2", hex(T, "--gold-ui"), S.bg2);
  add("T", "coin disc ink --on-gold at the disc's darkest stop #D99A1A", hex(T, "--on-gold"), "#D99A1A");
  return { rows: r, S };
}

const table = { dark: rows(DARK), light: rows(LIGHT) };

test("design v5: every row of the contrast table (docs/DESIGN-V5.md section 12) holds at its bar in both themes", () => {
  const lines = [];
  for (const [theme, { rows: rs, S }] of Object.entries(table)) {
    lines.push(`${theme}: page ${S.bg}, card ${S.bg2}, tile ${S.bg3}, well ${S.well}, glass ${S.glass} / ${S.glassStrong}, water ${S.water}, land ${S.land}, chip ${S.chip}, pass corners ${S.passTeal} / ${S.passGold}`);
    for (const row of rs) {
      lines.push(`  ${row.kind}  ${row.label.padEnd(52)} ${row.fg} on ${row.bg}  ${row.ratio.toFixed(2)}:1`);
      assert.ok(row.ratio >= BAR[row.kind], `${theme} ${row.kind} ${row.label}: ${row.fg} on ${row.bg} reads ${row.ratio.toFixed(2)}:1, under ${BAR[row.kind]}:1`);
    }
  }
  if (process.argv.some((a) => a.endsWith("design-v5.test.js"))) console.log(lines.join("\n"));
});

test("design v5: the map's figure/ground and the status hues keep their separation (section 12, informational rows)", () => {
  for (const [theme, T] of [["dark", DARK], ["light", LIGHT]]) {
    const { S } = table[theme];
    const fg = ratio(S.land, S.water);
    assert.ok(fg >= (theme === "dark" ? 1.5 : 1.2), `${theme} land ${S.land} vs water ${S.water}: ${fg.toFixed(2)}:1 (coastlines must read)`);
    const active = hex(T, "--st-active");
    for (const st of ["--st-open", "--st-choosing", "--st-founded"]) assert.ok(hueGap(active, hex(T, st)) >= 30, `${theme} --st-active vs ${st}: ${hueGap(active, hex(T, st)).toFixed(0)}° apart (30° or more, so the statuses never rely on brightness alone)`);
  }
  // held unchanged: the preview's sample coin, the legacy mark, the mainnet line, the QR
  assert.ok(ratio("#062A1F", "#34D399") >= 6); assert.ok(ratio("#0C2344", "#00CBB6") >= 4.5); assert.ok(ratio("#0C2344", "#F8C13A") >= 4.5);
  assert.ok(ratio("#FFFFFF", "#B3261E") >= 4.5); assert.ok(ratio("#0B1626", "#FFFFFF") >= 4.5);
});

test("design v5: the light theme repeats every colour token of the dark block (both themes complete)", () => {
  const dark = blocks.find((b) => b.theme === "dark").decls, light = blocks.find((b) => b.theme === "light").decls;
  // theme-independent by design: the pass and its state triplets, the focus ring, the radius, the fonts, the chart axis (section 3.2)
  const shared = new Set(["--pass-a", "--pass-b", "--pass-glow-1", "--pass-glow-2", "--pass-line", "--pass-ok-rgb", "--pass-bad-rgb", "--pass-blue-rgb", "--pass-gold-rgb", "--focus-ring", "--radius", "--display", "--body", "--mono", "--chart-axis", "--glass-blur"]);
  const missing = Object.keys(dark).filter((k) => !(k in light) && !shared.has(k));
  assert.deepEqual(missing, [], "every dark token the light theme must restate");
  for (const k of ["--bg", "--bg-2", "--bg-3", "--ink", "--card", "--card-2", "--line", "--line-2", "--field-line", "--text", "--text-2", "--muted", "--faint", "--pin", "--pin-2", "--moss", "--gold", "--gold-ui", "--blue", "--warn", "--ok-text", "--bad-text", "--gold-text", "--on-cta", "--on-gold", "--on-accent", "--accent-rgb", "--accent-2-rgb", "--gold-rgb", "--ok-rgb", "--bad-rgb", "--warn-rgb", "--blue-rgb", "--accent-line", "--scrim", "--glass", "--code-bg", "--glass-bg", "--glass-bg-strong", "--glass-border", "--glass-hi", "--grad-ink", "--grad-accent", "--grad-glow", "--grad-aurora", "--e1", "--e2", "--e3", "--chart-1", "--chart-2", "--chart-grid", "--cta-a", "--cta-b", "--shadow", "--map-bg", "--map-water", "--map-land", "--map-land-line", "--map-area", "--map-area-line", "--map-dot", "--map-label", "--map-halo"]) {
    assert.ok(k in dark, `dark ${k}`); assert.ok(k in light, `light ${k}`);
  }
  assert.match(head, /color-scheme: dark;\n\}/); assert.match(head, /color-scheme: light;\n\}/); // each theme block ends by naming its scheme
});

test("design v5, fix round 1: the portfolio ring's eight slots sit on the brand (3:1 on the page and the card, 30 degrees apart), and the fixes hold", () => {
  const block = css.slice(css.indexOf("Member profiles (PROFILES=on)"));
  for (const [theme, T, re] of [["dark", DARK, /^:root \{ (--pf-0[^}]*)\}/m], ["light", LIGHT, /^:root\[data-theme="light"\] \{ (--pf-0[^}]*)\}/m]]) {
    const slots = decls(re.exec(block)[1]);
    const { S } = table[theme];
    const hexes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => hex(T, slots[`--pf-${i}`]));
    for (const [i, h] of hexes.entries()) for (const [label, bg] of [["--bg", S.bg], ["--bg-2", S.bg2]]) assert.ok(ratio(h, bg) >= 3, `${theme} --pf-${i} ${h} on ${label} ${bg}: ${ratio(h, bg).toFixed(2)}:1`);
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.ok(hueGap(hexes[i], hexes[j]) >= 30, `${theme} --pf-${i} vs --pf-${j}: ${hueGap(hexes[i], hexes[j]).toFixed(0)} degrees apart`);
    assert.equal(hex(T, slots["--pf-x"]), hex(T, "--faint"), `${theme} --pf-x is the --faint grey`);
    assert.ok(ratio(hex(T, slots["--pf-x"]), S.bg2) >= 3, `${theme} --pf-x on the card`);
  }
  assert.equal(hex(DARK, decls(/^:root \{ (--pf-0[^}]*)\}/m.exec(block)[1])["--pf-0"]), hex(DARK, "--gold"), "dark slot 0 is the coin's gold");
  assert.equal(hex(LIGHT, decls(/^:root\[data-theme="light"\] \{ (--pf-0[^}]*)\}/m.exec(block)[1])["--pf-0"]), hex(LIGHT, "--gold-ui"), "light slot 0 is the light theme's gold for marks");
  // the pre-v5 ring palette never returns
  assert.doesNotMatch(block, /#3987e5|#d95926|#199e70|#c98500|#d55181|#008300|#9085e9|#e66767|#898781|#2a78d6|#eb6834|#1baf7a|#eda100|#e87ba4|#4a3aa7|#e34948/i);
  // fix round 2 (FR-1-R1): a disabled main button is the gold at 60 % by default (the scripts disable a WORKING button with .is-busy,
  // aria-busy, data-busy or no marker at all, so a generic well would show "cannot" mid-action); the quiet well is opted in by selector
  // only where the page knows the button cannot be used yet (the coin studio's Use this coin, the app mock)
  assert.match(css, /^\.btn\[disabled\], \.btn\.is-busy \{ opacity: \.6; cursor: progress; transform: none; \}$/m, "a disabled button dims to 60 % (main's rule)");
  assert.doesNotMatch(css, /\.btn--primary\[disabled\][^{]*\{[^}]*opacity: 1;/, "no generic quiet well on a disabled main button");
  assert.match(css, /^#cr-use\[disabled\] \{ opacity: 1; background: var\(--card-2\); color: var\(--muted\); border-color: var\(--line-2\); box-shadow: none; \}$/m, "the coin studio's Use this coin (disabled only while no usable design is shown) is the quiet well");
  assert.doesNotMatch(read("wallet-send.css"), /\.wsend__go[^{]*\[disabled\]/, "the Send sheet needs no exception any more");
  assert.match(read("app-phone.css"), /\.pm-btn--primary\.is-off \{ opacity: 1; background: var\(--card-2\); color: var\(--muted\); border-color: var\(--line-2\); \}/, "the app mock's disabled main button is the same quiet well");
  // the pass avatar's initial is white on the frosted tile (the pass is navy in both themes)
  assert.match(css, /\.pass \.idcard__avatar \{[^}]*color: #fff;/);
  // the phone tab bar's pill is one colour; the next-step edges are the accent, not a fourth colour
  assert.match(css, /\.tabbar__ind \{[^}]*background: var\(--pin\);/);
  assert.match(css, /\.dv2 \.today__card::before \{[^}]*background: var\(--pin\); \}/);
  assert.match(read("polish-dash.css"), /\.dpv__todo::before \{[^}]*background: var\(--pin\); \}/);
  // the light headline gradient stays in the gold family (every stop's hue between 35 and 50 degrees)
  for (const s of stops(LIGHT)) assert.ok(hue(s) >= 35 && hue(s) <= 50, `light --grad-accent stop ${s}: hue ${hue(s).toFixed(0)}`);
  // the owner console's chosen queue chip is said for the light theme too; the map's find pill rings on keyboard focus
  assert.match(read("admin.css"), /\.adm-subtabs \.adm-subtab\[aria-selected="true"\], :root\[data-theme="light"\] \.adm-subtabs \.adm-subtab\[aria-selected="true"\] \{ background: var\(--text\); color: var\(--bg\); box-shadow: none; \}/);
  assert.match(read("pages-cities.css"), /\.map-find:has\(:focus-visible\) \{ outline: 3px solid var\(--focus-ring\); outline-offset: 2px; \}/);
  // the small coin disc (the coin sheets' .lp-ava and, fix round 2 A11Y-4-R, the Buy sheet's own copy .swap__mark--ava): white initials
  // 4.5:1 or more at the lightest stop of every city colour, the same five stops in all three sheets
  const discStops = {};
  for (const [sheet, disc] of [["pages-launchpad.css", "lp-ava"], ["pages-coin.css", "lp-ava"], ["swap.css", "swap__mark--ava"]]) { const t = read(sheet); const re = new RegExp(`\\.${disc}\\[data-color="(ocean|emerald|rose|violet|ink)"\\] \\{ --c2: (#[0-9A-F]{6}); \\}`, "g"); const found = {}; for (const m of t.matchAll(re)) { assert.ok(ratio("#FFFFFF", m[2]) >= 4.5, `${sheet} ${m[1]} ${m[2]}: ${ratio("#FFFFFF", m[2]).toFixed(2)}`); found[m[1]] = m[2]; } assert.equal(Object.keys(found).length, 5, `${sheet}: five deeper discs`); discStops[sheet] = found; }
  assert.deepEqual(discStops["swap.css"], discStops["pages-launchpad.css"], "the Buy sheet's mark takes the coin sheets' stops");
  // the dead alias is gone; the header's blur is back at 18 px
  assert.doesNotMatch(head, /--shadow-2/); assert.match(head, /--glass-blur: saturate\(1\.5\) blur\(18px\);/);
});

test("design v5: token discipline across public/*.css (no old-palette literal, no white text on the accent fill, no --focus fallback in the coin sheets)", () => {
  const dir = new URL("../public/", import.meta.url);
  const sheets = [...readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => [f, read(f)]), ...readdirSync(new URL("brand/", dir)).filter((f) => f.endsWith(".css")).map((f) => [`brand/${f}`, read(`brand/${f}`)])];
  const stripData = (s) => s.replace(/url\(\s*["']?data:[^)]*\)/g, "url(data)");
  // the retired accent and its tints, in any case
  const OLD = /rgba\(\s*255\s*,\s*90\s*,\s*54|rgba\(\s*232\s*,\s*67\s*,\s*31|rgba\(\s*255\s*,\s*110\s*,\s*70|rgba\(\s*207\s*,\s*58\s*,\s*26|rgba\(\s*242\s*,\s*92\s*,\s*36|#FF5A36|#FF8A5B|#B8430F|#CF3A1A|#FFC857|#E8431F|#C93512|#D0441C|#F25C24|#FF7A45|#FFD3B8|#FFB39C/i;
  for (const [name, text] of sheets) {
    if (name === "brand/tokens.css") continue; // the Civic Atlas draft: unlinked, its coin-art values frozen by test/coinart-t2.test.js
    const body = stripData(text);
    const m = OLD.exec(body);
    assert.equal(m, null, `${name} still carries the old accent: ${m && m[0]} at ${m && body.slice(Math.max(0, m.index - 60), m.index + 30).replace(/\n/g, " ")}`);
    for (const chunk of body.split("}")) {
      const d = chunk.slice(chunk.lastIndexOf("{") + 1);
      if (/background(?:-color)?:\s*var\(--pin\)\s*;/.test(d)) assert.doesNotMatch(d, /color:\s*(#fff\b|#ffffff\b|white\b)/i, `${name}: white text on the teal fill must read var(--on-accent): ${d.trim().slice(0, 120)}`);
    }
  }
  for (const name of ["coin-ready.css", "coin-review.css"]) {
    const text = read(name);
    assert.doesNotMatch(text, /var\(--focus,/, `${name}: --focus is the map focus card's local colour, not a root token; the ring reads --focus-ring`);
    assert.match(text, /outline: 3px solid var\(--focus-ring, #37E0CA\)/, `${name}: the keyboard ring is the teal --focus-ring with the dark value as its fallback`);
  }
});
