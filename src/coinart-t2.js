/**
 * Coin-art template t2: the city-coin picture for coins of the NEW program (citycoin_curve, PR #83), drawn in the Citycoin.dev
 * Civic Atlas colours with the Citycoin.dev emblem (Citycoin.dev master v5, stage S22). Pure JavaScript, no I/O, like src/coinart.js.
 *
 * NOT WIRED: no route, job or page imports this file (test/coinart-t2.test.js walks the Worker's import graph), so the live site is
 * unchanged. src/coinmeta-v2.js names t2 as the template of new-program coins; S24 to S27 and S41 draw and store it.
 *
 * t1 IS UNTOUCHED. src/coinart.js is not edited: its TEMPLATES still holds t1 only, its TEMPLATE_VERSION is still "t1" (the legacy
 * ready-made coin, src/coinready.js), and every stored t1 picture keeps its bytes and its hash (test/coinart.test.js pins six t1 SVG
 * and PNG hashes; test/coinart-t2.test.js pins one digest over the t1 SVG of all 8,030 registry cities, computed at edabab5).
 * t2 lives beside it, here, so this stage changes no byte of the Worker bundle.
 *
 * What t2 keeps from t1: the text-fitting numbers (ticker, city line, two-line rule), the fonts (FONT_SHA256), the renderer
 * (resvg-wasm 2.6.2), the safety rules (no script, style element, outside reference or <image>; every text XML-escaped; every number
 * written with toFixed(2) or taken as written from the emblem's own file). What t2 changes:
 *   - the colours: the Civic Atlas tokens of public/brand/tokens.css (DS-04: navy #0C2344, gold #F8C13A, teal #00CBB6, dark canvas
 *     #071426, dark card #102A49, white on navy #FFFFFF), and nothing else;
 *   - the mark: the Citycoin.dev skyline-on-coin emblem for dark surfaces (public/brand/citycoin-icon-dark.svg, its shapes copied
 *     exactly, the two clip-path ids renamed) in the place of t1's map pin, at 0.21 scale, so it ends 17 px above the ticker in the
 *     two-line case (t1's pin ended 14.6 px above);
 *   - the arc: "CITYCOIN.DEV" (the product name, upper case) where t1 says "VICINITY CITY".
 *
 * A template version is immutable once a coin carries it: any change of one pixel of t2 is a new version (t3), never an edit. No coin
 * carries t2 yet (nothing draws or stores it), and the brand files it uses are not reviewed by the owner yet (docs/citycoin-master/
 * brand/README.md); the owner's review of t2's look is a gate before the first new-program coin is drawn (S41).
 *
 *   coinSvgT2({ ticker, city })                  the t2 SVG text (`ticker`: the registry ticker; `city`: the coin's city line)
 *   artTemplate(version)                         t1 (src/coinart.js TEMPLATES.t1, the same frozen object) or t2
 *   artSvg({ ticker, city, templateVersion })    the SVG of either version: t1 through src/coinart.js coinSvg, unchanged
 */
import { FONT_SHA256, RESVG_VERSION, TEMPLATES, coinSvg, fitCoin, textWidth } from "./coinart.js";
import METRICS from "./coinart-metrics.js";

/** The Civic Atlas colours t2 uses (public/brand/tokens.css). */
export const T2_COLORS = Object.freeze({
  fieldIn: "#102A49", // --cc-card (dark)
  fieldOut: "#071426", // --cc-canvas (dark)
  rim: "#F8C13A", // --cc-gold
  gap: "#071426", // --cc-canvas (dark)
  ring: "#00CBB6", // --cc-teal
  ticker: "#F8C13A", // --cc-gold
  tickerEdge: "#0C2344", // --cc-navy
  text: "#FFFFFF", // --cc-on-navy
  accent: "#00CBB6", // --cc-teal: the rules beside the city and the arc
  navy: "#0C2344", // the emblem's structure
});

/**
 * Template t2, frozen. The fitting numbers are t1's, written out again (test/coinart-t2.test.js checks they equal t1's), so a coin's
 * ticker and city sit where they sit on t1; only the base, the mark, the colours and the arc's words differ.
 */
export const T2 = Object.freeze({
  version: "t2", base: "vector-citycoin", fonts: FONT_SHA256, resvg: RESVG_VERSION,
  ticker: Object.freeze({ start: 80 / 0.7, maxWidth: 330, min: 40, track: 0.01, centerY: 264, twoLineMax: 84, twoLineCenterY: 250 }),
  city: Object.freeze({ start: 30, track: 0.22, centerY: 339, band: 340, rule: 64, ruleMin: 18, gap: 12, min: 18,
    twoLineMax: 24, twoLineWidth: 300, twoLineCenterY: 338, lineHeight: 1.15, floor: 14 }),
  arc: Object.freeze({ r: 158, size: 19, spacing: 6, text: "CITYCOIN.DEV" }),
  // the emblem's 512-unit grid placed at (x, y) and scaled: its ink (with the 12-unit outline) spans y 2 to 494 of the grid, so on
  // the coin it runs from y 99.92 to 203.24, centred on x 256
  mark: Object.freeze({ x: 202.24, y: 99.5, scale: 0.21 }),
  colors: T2_COLORS,
});

/** The versions a picture can have: t1 (the legacy ready-made coin, unchanged) and t2 (new-program coins). */
export const ART_TEMPLATES = Object.freeze({ t1: TEMPLATES.t1, t2: T2 });
export function artTemplate(version) {
  if (!Object.hasOwn(ART_TEMPLATES, version)) throw new Error(`unknown template version ${version}`);
  return ART_TEMPLATES[version];
}

const n2 = (x) => Number(x).toFixed(2);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The emblem of public/brand/citycoin-icon-dark.svg, shape for shape (the white outline group, the navy and gold coin, the rim cuts,
 * the navy skyline and its teal faces), in its own 512-unit grid. Its clip paths are #cc-sky and #cc-edge (defined in the SVG's defs).
 */
const EMBLEM = [
  `<g fill="#FFFFFF" stroke="#FFFFFF" stroke-width="24" stroke-linejoin="round"><path d="M40 362A216 70 0 0 1 472 362V412A216 70 0 0 1 40 412Z"/><path clip-path="url(#cc-sky)" d="M100 228L172 250L172 470L100 470ZM156 178L240 150L240 470L156 470ZM216 108L298 108L298 470L216 470ZM234 76L280 76L280 110L234 110ZM247 78L247 40L257 14L267 40L267 78ZM280 140L360 168L360 470L280 470ZM342 234L412 234L412 470L342 470Z"/></g>`,
  `<path fill="${T2_COLORS.navy}" d="M40 362A216 70 0 0 1 472 362V412A216 70 0 0 1 40 412Z"/>`,
  `<path fill="${T2_COLORS.rim}" d="M454 380V412A198 52 0 0 1 58 412V380A198 52 0 0 0 454 380Z"/>`,
  `<path fill="${T2_COLORS.navy}" clip-path="url(#cc-edge)" d="M118.93 362H131.71V468H118.93ZM204.15 362H220.73V468H204.15ZM291.27 362H307.85V468H291.27ZM380.29 362H393.07V468H380.29Z"/>`,
  `<path fill="${T2_COLORS.rim}" d="M58 362A198 52 0 0 1 454 362A198 52 0 0 1 58 362Z"/>`,
  `<path fill="${T2_COLORS.navy}" d="M96 353A160 26 0 0 1 416 353A160 26 0 0 1 96 353Z"/>`,
  `<g clip-path="url(#cc-sky)"><path fill="${T2_COLORS.navy}" d="M100 228L172 250L172 470L100 470ZM156 178L240 150L240 470L156 470ZM216 108L298 108L298 470L216 470ZM234 76L280 76L280 110L234 110ZM247 78L247 40L257 14L267 40L267 78ZM280 140L360 168L360 470L280 470ZM342 234L412 234L412 470L342 470Z"/><path fill="${T2_COLORS.ring}" d="M118 251.5L145 259.75L145 470L118 470ZM174 190L206 179.33L206 470L174 470ZM252 94L265 94L265 470L234 470L234 126L252 126ZM298 164.3L328 174.8L328 470L298 470ZM360 252L387 252L387 470L360 470Z"/></g>`,
].join("");
const EMBLEM_CLIPS = `<clipPath id="cc-sky"><path d="M0 0H512V353H0Z"/><path d="M96 353A160 26 0 0 1 416 353A160 26 0 0 1 96 353Z"/></clipPath>`
  + `<clipPath id="cc-edge"><path d="M454 380V412A198 52 0 0 1 58 412V380A198 52 0 0 0 454 380Z"/></clipPath>`;

/** The base of t2: the gold rim, the dark gap, the teal ring, the navy field and the emblem where t1 has its pin. */
function base(t) {
  const c = t.colors, m = t.mark;
  return [
    `<circle cx="256" cy="256" r="228" fill="${c.rim}"/>`,
    `<circle cx="256" cy="256" r="213" fill="${c.gap}"/>`,
    `<circle cx="256" cy="256" r="204" fill="${c.ring}"/>`,
    `<circle cx="256" cy="256" r="196" fill="url(#cc-field)"/>`,
    `<g transform="translate(${n2(m.x)} ${n2(m.y)}) scale(${n2(m.scale)})">${EMBLEM}</g>`,
  ].join("\n");
}

/** The text layers: t1's geometry (src/coinart.js textLayers), t2's colours and arc. */
function textLayers(f, t) {
  const c = t.colors, C = t.city;
  const out = [];
  const tb = f.tickerCenterY + 0.35 * f.tickerSize;
  out.push(`<text x="256" y="${n2(tb)}" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="${n2(f.tickerSize)}" letter-spacing="${n2(t.ticker.track * f.tickerSize)}" fill="${c.ticker}" stroke="${c.tickerEdge}" stroke-width="1.20" paint-order="stroke">${esc(f.ticker)}</text>`);
  const cityText = (line, y) => `<text x="256" y="${n2(y)}" text-anchor="middle" font-family="Space Grotesk" font-weight="500" font-size="${n2(f.citySize)}" letter-spacing="${n2(C.track * f.citySize)}" fill="${c.text}">${esc(line)}</text>`;
  if (f.lines.length === 1) {
    if (f.rule > 0) {
      const half = textWidth(f.lines[0], METRICS.medium, f.citySize, C.track) / 2 + C.gap;
      out.push(`<path d="M${n2(256 - half - f.rule)} ${n2(f.centerY)}H${n2(256 - half)}M${n2(256 + half)} ${n2(f.centerY)}H${n2(256 + half + f.rule)}" stroke="${c.accent}" stroke-width="2.50" stroke-linecap="round" fill="none"/>`);
    }
    out.push(cityText(f.lines[0], f.centerY + 0.35 * f.citySize));
  } else {
    const step = C.lineHeight * f.citySize;
    f.lines.forEach((line, i) => out.push(cityText(line, f.centerY + (i - 0.5) * step + 0.35 * f.citySize)));
  }
  out.push(`<text font-family="Space Grotesk" font-weight="500" font-size="${n2(t.arc.size)}" letter-spacing="${n2(t.arc.spacing)}" fill="${c.accent}"><textPath xlink:href="#cc-arc" href="#cc-arc" startOffset="50%" text-anchor="middle">${esc(t.arc.text)}</textPath></text>`);
  return out.join("\n");
}

/** The t2 SVG of one coin. Throws like src/coinart.js fitCoin: a ticker that is not 1-10 of A-Z0-9, a city with nothing drawable. */
export function coinSvgT2({ ticker, city } = {}) {
  const t = T2;
  const f = fitCoin({ ticker, city, template: t });
  const r = t.arc.r;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 512 512">
<defs>
<radialGradient id="cc-field" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="${t.colors.fieldIn}"/><stop offset="1" stop-color="${t.colors.fieldOut}"/></radialGradient>
${EMBLEM_CLIPS}
<path id="cc-arc" d="M${n2(256 - r)} 256A${n2(r)} ${n2(r)} 0 0 0 ${n2(256 + r)} 256"/>
</defs>
${base(t)}
${textLayers(f, t)}
</svg>
`;
}

/** The SVG of a coin in either version. t1 is src/coinart.js coinSvg exactly (the bytes every stored t1 picture was drawn from). */
export function artSvg({ ticker, city, templateVersion } = {}) {
  const t = artTemplate(templateVersion);
  return t === T2 ? coinSvgT2({ ticker, city }) : coinSvg({ ticker, city, templateVersion: t.version });
}
