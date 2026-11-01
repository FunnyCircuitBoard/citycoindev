# Design v5 — final specification for the site-wide build

Status: **the build spec** for branch `cc/design-premium` (from `main` `0204191`). Written 1 Nov 2026 after three designed directions
(Midnight Atlas, Obsidian & Champagne, Graphite & Electric) were rendered and judged. Winner: **Midnight Atlas** (two of three judges;
best brand coherence, best contrast margins, smallest and safest diff). This document is Midnight Atlas with every defect the judges
found fixed and the runner-up ideas the judges named grafted in. Builders implement **this file**, not the direction drafts.

The owner's request (26 Oct 2026, verbatim): "chnage the websie theme and the color fo the website. it would be a complete design upgrade
by keeping the fucntionalutiy as it is.. amke it more smooth. more elite and more premium looking."

This file ships with the change. Sections 11 (test pins) and 12 (contrast) are the record the review reads; builders append to them.

## Contents

1. The direction and what changed since the judging
2. Hard rules (unchanged from the brief)
3. Tokens: the two theme blocks, the scale block, the secondary tokens, the new names
4. Type scale
5. Lines, surfaces, radii, elevation, glass
6. Components (every family in the CSS map)
7. Motion
8. Hero treatments, page by page
9. Per-sheet notes (every stylesheet)
10. Rollout: owners, order, verification, what to record where
11. Pinned tests: every assertion that changes, and how
12. The contrast table that must hold
13. Residuals (JavaScript is frozen)
Appendix A. The display serif (Fraunces): deferred, with the recipe
Appendix B. Changed-assertion log (builders fill this in)

---

## 1. The direction and what changed since the judging

**Midnight Atlas, final.** The brand's own three colours, nothing foreign: the emblem's **night navy** (`#071426`, already the page's
`theme-color`) is the canvas in three depths; the emblem's **teal** (`#00CBB6`) is everything *live or interactive* (links, focus, the
chosen tab, live dots, the map's Active status, the field focus ring); the coin's **gold** (`#F8C13A`) is the *one main action*, rank and
the coin itself. Text is cool slate in four levels; lines are 1 px white at 9 % and 15 %; the header and tab bar are glass; the top of every
page carries a faint aurora of teal (left) and gold (right); the member pass and founder card are navy in both themes, lit teal at one
corner and gold at the other. The light theme is cool paper (`#F5F7FB`) with the brand navy as ink, so its lines, wells and shadows are
navy-tinted, never grey.

**Meaning of colour (the rule every sheet follows):**

| colour | means | never means |
|---|---|---|
| teal `--pin` / `--pin-2` | live, interactive: links, focus, the current tab, live dots, Active cities, field focus | a headline, a label, danger |
| gold `--gold` / `--cta-*` (dark) | the main action, the coin, rank, Founded cities, the headline's second line | danger, "live" |
| navy `--bg*` / light `--ink` | the canvas (dark), the ink and the main action (light) | — |
| coral `--bad-*` | lost, down, sell, not official, danger | — |
| mint `--ok-*` / `--moss` | ok, done, up, buy, verified | — |
| amber `--warn*` | warning, pending, Choosing cities | — |
| steel `--st-open` / `--map-dot` | an open city (no founder yet), only on the map | — |
| ink `--st-mine` (white dark / navy light) | *your* city on the map, drawn as a ring so it is never a status | — |
| `--faint` | decoration (hairline captions, disabled glyphs) | source text, a number's caption, a sentence |

Text on a filled colour always reads its `--on-*` token (`--on-cta`, `--on-gold`, `--on-accent`); **text never sits on a two-colour
gradient** (the old pin-to-gold avatars become a gold fill with navy ink; teal-to-gold gradients survive only where nothing is written on
them: the tab bar's pill, the progress bar, the aurora hairline, the hover ring).

**Changes to the winning draft, each from a judge's finding:**

1. **Light theme main action inverted** (judges 1 and 2: the yellow pill on white read "bumblebee"): in light, `.btn--primary` and every
   CTA-coloured control are **navy `#0C2344 → #16355E` with gold text `#F8C13A`** (9.5:1 / 7.4:1), the light lockup's own pairing. Dark keeps
   gold with navy text (8.5:1 / 10.7:1). One token pair (`--cta-a/--cta-b` + `--on-cta`) per theme does it.
2. **Headline gradient is the coin's gold only** (judges 1, 2, 3: the teal → mint → gold aurora had a muddy middle and read "web3"; teal in the
   headline dilutes "teal = interactive"): dark `#FFD978 → #F8C13A → #E7A92A`; light a bronze `#A87400 → #8A5F00 → #6E4B00` (3.7:1 or more
   on paper, large text only). Three stops are kept because `test/contrast.test.js` pins the format.
3. **Aurora wash halved in light** (judge 2: a stain on /connect and /launchpad): light `--grad-glow` alphas `.07` / `.06`; the header's
   aurora hairline `.45` / `.55` in light.
4. **Deeper, softer elevation with a lit top edge on every raised surface** (judge 1 graft 5, judge 2 graft 3, judge 3 graft 4): `--e2`
   `12/32 px`, `--e3` `28/72 px`, each with `inset 0 1px 0` light in dark; the account sheet, swap sheet, modals and pop-overs take `--e3`.
5. **Hover/colour transitions 180 ms on `cubic-bezier(.22,.61,.36,1)`** (judges 1 and 3): `--dur-2: 180ms`, `--ease-out` changed; press
   stays 80 ms, enters 320 ms.
6. **Kickers stay `--muted`** (judge 2 graft 6): the draft's teal kickers are *not* adopted; `.kicker` is unchanged (`color: var(--muted)`).
7. **`--on-accent` discipline** (judge 3 graft 2, defect 1): `.skip`, `.holders__skip:focus` and every `color: #fff` laid on `var(--pin)`
   read `var(--on-accent)` (navy on teal 8.6:1 dark, white on deep teal 5.2:1 light). "Not official" leaves the accent for coral.
8. **Map statuses re-themed** (judge 3 graft 3, defect 2; judge 2 defect 4): `--st-founded` = the coin's gold, `--st-choosing` amber,
   `--st-mine` ink (a ring, so "yours" is never a status colour), `.dot--claimed`/`.dot--mine`/`.dot--choosing` read the `--st-*` tokens
   instead of `--pin`/`--gold`; dark land a step lighter (`#1F3A60`) and water a step deeper (`#08142A`) so coastlines read (1.6:1 figure/ground,
   was 1.28). `--st-active` is unchanged (frozen by `cities.js`).
9. **Status pills carry a glyph** (judge 2 graft 7): `.tag--active::before` (the ring, already pinned) and a new `.tag--open::before`
   (a hollow dot), so Open vs Active is never colour alone.
10. **Field line verified on every surface** (judge 1 graft 6): page, card, well, opaque layer, both themes, all 3.15:1 or more (section 12).
11. **Two red pins cleared and recorded** (judge 3 defect 3; judge 1 graft 1): `test/token-tabs.test.js` `.trade__side.is-sell` fallback and
    `test/v4-review.test.js` `.btn--soft`; every changed assertion is in section 11 and Appendix B.
12. **Full render before the PR**: all 16 pages × 390/1440 × dark/light (64 shots) plus the component shots, plus `/launchpad` with coin cards
    and `/connect`'s wizard from synthetic fixtures (judge 3 graft 7; judge 1 graft 1).
13. **Fraunces deferred** (judge 2 graft 5 over judge 3 graft 1): a display serif is a font-pipeline change (package, copy-assets, a build.mjs
    preload, the /credits licence sentence, the byte-pinned default build); it is the owner's separate decision. Appendix A has the recipe.
14. **One contrast test for the whole table** (judge 2 graft 8): `test/design-v5.test.js` recomputes section 12 from the token blocks.

Not grafted, on purpose: Graphite's 12–14 px button corners (a pinned, site-wide shape; the pills are right for this register), Graphite's
azure, Obsidian's champagne and warm obsidian canvas (the lockup is navy/teal/gold), any font change in this PR.

## 2. Hard rules (unchanged from the brief)

- **Functionality unchanged.** No JavaScript file changes. No HTML change: `scripts/pages/src/*.html` and `scripts/pages/build.mjs` are not
  touched (the default build's SHA-256 is pinned by `test/build-parity.test.js`; `theme-color` `#071426` equals the new `--bg`, so nothing
  there needs to move). Pages are still rebuilt (`node scripts/pages/build.mjs`) so `public/*.html` matches, byte for byte.
- **Both themes complete**: dark (`:root`, the default) and light (`:root[data-theme="light"]`), every token in both blocks.
- **WCAG AA on real rendered pairs**: 4.5:1 for text, 3:1 for large text (≥ 24 px, or ≥ 19 px bold), for UI borders, icons and focus rings.
  Section 12 is the table; `test/design-v5.test.js` enforces it.
- **44 px touch targets stay** (every `min-height: 44px` rule in `polish.css` and the page sheets is pinned).
- **Phone first**: 390 px, no horizontal overflow (`html { overflow-x: clip }`, `body { overflow-x: hidden; overflow-x: clip }` pinned).
- **Reduced motion respected**: the `prefers-reduced-motion: reduce` block in `style.css` is unchanged and last; every animation/transition
  in every sheet sits inside a `no-preference` block; nothing loops except `shimmer`/`spin` on a busy state and `ringSpin` under a mouse.
- **CSP**: `style-src 'self'`, `font-src 'self'`, `img-src 'self' data:`. No inline styles, no external URLs, `@font-face` only in `style.css`.
- **Tests pin structure**: keep every selector, property order and section-marker comment; change values; where a pinned literal *is* the
  design value, update the assertion keeping its intent and record it (section 11, Appendix B, `docs/citycoin-master/implementation-report.md`
  section 11 and its update log).
- **No secrets, no model identifiers** in files or commits. Commit messages end with the two trailer lines given in the brief.
- **Clean code**: tokens over one-off colours; a literal that duplicated a token becomes `var(--x)` or `rgba(var(--x-rgb), a)`; dead rules
  that a replacement makes unreachable are deleted; third-party brand colours (SOL, USDC, RAY, Google, the mainnet red `#B3261E`, the QR's
  `#fff`/`#0B1626`) stay literal.

## 3. Tokens

All design tokens live in `public/style.css`, before `/* ---------- base ---------- */`. Every existing name is kept. The blocks below are
the final values; copy them verbatim (comments may be edited, values and formats may not: `--bg`, `--muted`, `--text`, `--text-2`, `--cta-a`,
`--cta-b` are 6-digit hex; `--glass-bg`, `--glass-bg-strong`, `--field-line` are `rgba(R,G,B,.NN)` with no spaces and a leading-dot alpha;
`--grad-accent` is `linear-gradient(100deg, …)` with exactly three `#RRGGBB` stops; `  --bg:` starts a line exactly twice in the file).

### 3.1 Dark (the default)

```css
:root {
  /* ---- Design v5 (26 Oct 2026): the brand's own three colours. Night navy canvas (#071426 is also the page's theme-color), the emblem's
     teal for anything live or interactive, the coin's gold for the one main action; cool slate text; crisp 1 px lines; an aurora of teal
     and gold at the top of a page. Text on a fill reads its --on-* token; tints read the *-rgb triplets. ---- */
  /* canvas: three depths */
  --bg: #071426; --bg-2: #0B1B33; --bg-3: #10284A;
  --ink: 255,255,255;                      /* overlays: rgba(var(--ink), a) */
  --card: rgba(var(--ink),.045); --card-2: rgba(var(--ink),.075);
  --line: rgba(var(--ink),.09); --line-2: rgba(var(--ink),.15);
  /* form fields: their border reads 3:1 or more on the page, a card, a well and an opaque layer (WCAG 1.4.11); --line and --line-2 are decoration */
  --field-line: rgba(var(--ink),.36);
  /* text: four levels (16.6, 12.2, 7.3 and 5.4:1 on the page); --faint is decoration only, never a sentence or a number's source */
  --text: #EEF3FA; --text-2: #C6D3E6; --muted: #93A4BE; --faint: #7A8CA8;
  /* the accent: --pin is the teal of marks, fills and live dots; --pin-2 the teal of links and accent text (11:1 on the page); --gold the
     coin's gold for fills (the main action, rank, the coin); --gold-ui the gold for thin marks that must read 3:1 on the page (the tab
     pill's gold end, the map's Founded dot, chart series 2, the progress bar's gold end); the rest are status colours (8:1 or more as text) */
  --pin: #00CBB6; --pin-2: #37E0CA; --moss: #34D399; --gold: #F8C13A; --gold-ui: #F8C13A; --blue: #6E9BFF; --warn: #FFD27A;
  --ok-text: #7CE8A6; --bad-text: #FF9A86; --gold-text: #FFDC8A;
  /* text on a filled colour: navy on gold (8.5:1 or more) and on teal (8.6:1), the lockup's own pairing */
  --on-cta: #0C2344; --on-gold: #0C2344; --on-accent: #06192E;
  /* the same colours as RGB triplets, for tints and rims: rgba(var(--accent-rgb), .12) */
  --accent-rgb: 0,203,182; --accent-2-rgb: 55,224,202; --gold-rgb: 248,193,58; --ok-rgb: 52,211,153; --bad-rgb: 255,154,134; --warn-rgb: 255,210,122; --blue-rgb: 110,155,255;
  --accent-line: rgba(var(--accent-rgb),.38);
  --focus-ring: var(--pin-2);              /* the keyboard focus ring (3 px); not --focus, which the map's focus card uses for its status colour */
  --scrim: rgba(3,10,22,.6);
  --glass: rgba(7,20,38,.82); --code-bg: rgba(2,8,20,.4);
  /* glass: the floating header, the tab bar, sheets (the only blurred surfaces; a phone blurs at most these) */
  --glass-bg: rgba(10,24,46,.62); --glass-bg-strong: rgba(10,24,46,.88);
  --glass-border: rgba(var(--ink),.10); --glass-hi: inset 0 1px 0 rgba(var(--ink),.08); --glass-blur: saturate(1.6) blur(20px);
  /* gradients: the headline words (ink, then the coin's gold), the aurora at the top of a page, the ring a hovered main button draws, the hairline of a bar */
  --grad-ink: linear-gradient(180deg, #FFFFFF 0%, #C6D3E6 100%);
  --grad-accent: linear-gradient(100deg, #FFD978 0%, #F8C13A 50%, #E7A92A 100%); /* the coin's gold; every stop 8.3:1 or more on #071426 and #0B1B33 */
  --grad-glow: radial-gradient(50% 42% at 28% 0%, rgba(0,203,182,.22), transparent 70%), radial-gradient(44% 38% at 78% 0%, rgba(248,193,58,.14), transparent 70%);
  --grad-ring: conic-gradient(from var(--ring-a, 0deg), transparent 0 55%, rgba(55,224,202,.95) 70%, rgba(248,193,58,.85) 78%, transparent 90%);
  --grad-aurora: linear-gradient(90deg, transparent, rgba(0,203,182,.75) 35%, rgba(248,193,58,.75) 65%, transparent);
  /* elevation: a resting card, a raised (hovered) card, a floating layer (the scrolled header, sheets, pop-overs); each with a 1 px lit top edge */
  --e1: inset 0 1px 0 rgba(var(--ink),.06), 0 1px 2px rgba(2,8,20,.4);
  --e2: inset 0 1px 0 rgba(var(--ink),.08), 0 12px 32px -14px rgba(2,8,20,.75);
  --e3: inset 0 1px 0 rgba(var(--ink),.08), 0 28px 72px -28px rgba(2,8,20,.8);
  --glow-cta: 0 8px 24px -10px rgba(248,193,58,.5), inset 0 1px 0 rgba(255,255,255,.4);
  --glow-cta-hover: 0 12px 34px -8px rgba(248,193,58,.65), 0 0 0 1px rgba(255,214,110,.7), inset 0 1px 0 rgba(255,255,255,.45);
  --cta-halo: 0 0 28px 2px rgba(248,193,58,.24); /* the one hero action's soft halo (a blur, never a hard band) */
  /* charts (one series colour, one for a second series; text never takes a series colour) */
  --chart-1: #2BD9C3; --chart-2: #F8C13A; --chart-grid: rgba(var(--ink),.07); --chart-axis: var(--muted);
  --radius: 22px;
  /* the main buttons: the coin's gold with navy text (--on-cta, 8.5:1 or more end to end) in dark; the light theme turns the pair round
     (navy button, gold text, 7.4:1 or more), the light lockup's own pairing. WCAG AA for normal text in both. */
  --cta-a: #F2B51F; --cta-b: #FFCF57;
  --display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --body: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --shadow: 0 24px 60px -30px rgba(2,8,20,.8);
  --map-bg: radial-gradient(80% 70% at 30% 35%, rgba(0,203,182,.07), transparent 60%), radial-gradient(120% 90% at 55% 45%, #10284A, #071426);
  /* map colours (read by cities.js and home.js): land a step lighter and water a step deeper than before, so coastlines read (1.6:1) */
  --map-water: #08142A; --map-land: #1F3A60; --map-land-line: rgba(149,162,184,.42);
  --map-area: rgba(127,163,214,.10); --map-area-line: rgba(160,190,235,.75);
  --map-dot: #7FA3D6; --map-label: #EEF3FA; --map-halo: rgba(7,20,38,.85);
  /* the member pass and founder card: navy in both themes, lit by the emblem's teal and the coin's gold (white keeps 6:1 on the lit corners) */
  --pass-a: #12345F; --pass-b: #071426; --pass-glow-1: rgba(0,203,182,.38); --pass-glow-2: rgba(248,193,58,.42); --pass-line: rgba(255,255,255,.14);
  color-scheme: dark;
}
```

### 3.2 Light

```css
/* Light theme: chosen with the theme toggle, never by the device setting (dark is the default); see theme.js */
:root[data-theme="light"] {
  --bg: #F5F7FB; --bg-2: #FFFFFF; --bg-3: #EDF1F7;
  --ink: 12,35,68;                         /* the brand navy: lines, wells and shadows are navy-tinted, never grey */
  --card: #FFFFFF; --card-2: rgba(12,35,68,.05);
  --line: rgba(12,35,68,.09); --line-2: rgba(12,35,68,.15);
  --field-line: rgba(12,35,68,.52);
  --text: #0C2344; --text-2: #2E4466; --muted: #52647A; --faint: #6C7D92;
  --pin: #0B7A70; --pin-2: #006F67; --moss: #159A74; --gold: #E5AA1C; --gold-ui: #A26F00; --blue: #2F63E0; --warn: #8A5F00;
  --ok-text: #0C6F4F; --bad-text: #C0392B; --gold-text: #7A5200;
  --on-cta: #F8C13A; --on-gold: #0C2344; --on-accent: #FFFFFF;
  --accent-rgb: 11,122,112; --accent-2-rgb: 0,111,103; --gold-rgb: 229,170,28; --ok-rgb: 21,154,116; --bad-rgb: 192,57,43; --warn-rgb: 138,95,0; --blue-rgb: 47,99,224;
  --accent-line: rgba(11,122,112,.35);
  --scrim: rgba(12,35,68,.32);
  --glass: rgba(255,255,255,.86); --code-bg: rgba(12,35,68,.05);
  --glass-bg: rgba(255,255,255,.72); --glass-bg-strong: rgba(255,255,255,.92);
  --glass-border: rgba(12,35,68,.09); --glass-hi: inset 0 1px 0 rgba(255,255,255,.9);
  --grad-ink: linear-gradient(180deg, #0C2344 0%, #2E4466 100%);
  --grad-accent: linear-gradient(100deg, #A87400 0%, #8A5F00 50%, #6E4B00 100%); /* the coin's gold deepened to bronze so it reads on paper: every stop 3.7:1 or more on #F5F7FB and on white */
  --grad-glow: radial-gradient(50% 42% at 28% 0%, rgba(0,203,182,.07), transparent 70%), radial-gradient(44% 38% at 78% 0%, rgba(248,193,58,.06), transparent 70%);
  --grad-aurora: linear-gradient(90deg, transparent, rgba(11,122,112,.45) 35%, rgba(162,111,0,.55) 65%, transparent);
  --e1: 0 1px 2px rgba(12,35,68,.06), 0 0 0 1px rgba(12,35,68,.03);
  --e2: 0 1px 2px rgba(12,35,68,.06), 0 12px 32px -14px rgba(12,35,68,.22);
  --e3: 0 28px 72px -28px rgba(12,35,68,.3);
  --glow-cta: 0 8px 22px -12px rgba(12,35,68,.45), inset 0 1px 0 rgba(255,255,255,.12);
  --glow-cta-hover: 0 12px 30px -10px rgba(12,35,68,.55), 0 0 0 1px rgba(12,35,68,.55), inset 0 1px 0 rgba(255,255,255,.16);
  --cta-halo: 0 0 26px 0 rgba(12,35,68,.16);
  --chart-1: #0B7A70; --chart-2: #A26F00; --chart-grid: rgba(12,35,68,.08);
  --cta-a: #0C2344; --cta-b: #16355E;
  --shadow: 0 20px 50px -30px rgba(12,35,68,.35);
  --map-bg: radial-gradient(80% 70% at 30% 35%, rgba(0,203,182,.06), transparent 60%), radial-gradient(120% 90% at 55% 45%, #EAF1FA, #DCE6F2);
  --map-water: #D7E6F5; --map-land: #FFFFFF; --map-land-line: rgba(12,35,68,.22);
  --map-area: rgba(43,91,255,.07); --map-area-line: rgba(30,70,160,.8);
  --map-dot: #3F67A6; --map-label: #0C2344; --map-halo: rgba(255,255,255,.9);
  color-scheme: light;
}
```

`--grad-ring`, `--pass-*`, `--focus-ring`, `--radius`, the fonts and `--chart-axis` are theme-independent and are not repeated in the light
block (they inherit from `:root`); `--on-gold` is repeated only so the three `--on-*` tokens read as one line in each block.

### 3.3 The design-v2 scale block (names pinned by `test/mobile-polish.test.js`)

Unchanged values except the ones marked **new**:

```css
:root {
  --fs-xs: .75rem; --fs-sm: .875rem; --fs-base: 1rem; --fs-md: 1.125rem; --fs-lg: 1.25rem;
  --fs-xl: clamp(1.5rem, 1.15rem + 1.6vw, 2.25rem); --fs-2xl: clamp(2.25rem, 1.4rem + 3.6vw, 3.75rem);
  --fs-display: clamp(2.75rem, 1.5rem + 6.2vw, 6rem); --fs-num: clamp(1.75rem, 1.3rem + 2.4vw, 2.5rem);
  --fs-kicker: .75rem; --ls-kicker: .08em; --lh-tight: 1.05; --lh-snug: 1.3; --lh-body: 1.6;
  --sp-1: 4px; … --sp-10: 128px; --gutter: 16px; --card-pad: 16px; --section-y: 48px;
  --r-xs: 8px; --r-chip: 12px; --r-card: 16px; --r-lg: 20px; --r-hero: 24px; --r-pill: 999px;
  --surface-1: linear-gradient(180deg, rgba(var(--ink),.055), rgba(var(--ink),.025)); --surface-2: var(--bg-2); --surface-inset: rgba(var(--ink), .04);
  /* new: the soft tints read the triplets, so one rule serves both themes */
  --accent-soft: rgba(var(--accent-rgb),.12); --ok-soft: rgba(var(--ok-rgb),.14); --bad-soft: rgba(var(--bad-rgb),.12); --warn-soft: rgba(var(--warn-rgb),.12); --gold-soft: rgba(var(--gold-rgb),.14);
  --shadow-1: var(--e1); --shadow-2: var(--e3);
  --header-h: 60px; --sticky-top: calc(var(--header-h) + 12px);
  /* new values: a press 120 ms, a hover/colour change 180 ms, an enter or lift 320 ms, a long reveal 560 ms; one soft curve */
  --dur-1: 120ms; --dur-2: 180ms; --dur-3: 320ms; --dur-4: 560ms;
  --ease-out: cubic-bezier(.22,.61,.36,1); --ease-in-out: cubic-bezier(.65,0,.35,1); --ease-spring: cubic-bezier(.34,1.56,.64,1);
}
/* the four media ladders are unchanged (gutter 24 at 481, card-pad 24 + section-y 72 at 601, section-y 96 + header-h 68 at 901, gutter 32 at 1280) */
:root[data-theme="light"] {
  --surface-1: linear-gradient(180deg, #FFFFFF, #FBFCFD); --surface-inset: #EEF2F7;
  --accent-soft: rgba(var(--accent-rgb),.09); --ok-soft: rgba(var(--ok-rgb),.10); --bad-soft: rgba(var(--bad-rgb),.08); --warn-soft: rgba(var(--warn-rgb),.08); --gold-soft: rgba(var(--gold-rgb),.12);
}
```

`--bad-soft: rgba(…);` must still occur exactly twice in `style.css` (`test/token-tabs.test.js`). The glass fallbacks (`@supports not
backdrop-filter`, `prefers-reduced-transparency`) and `@property --ring-a` are unchanged.

### 3.4 Secondary tokens (other places in `style.css` and other sheets)

| where | final value | note |
|---|---|---|
| `style.css` cities block | `:root { --st-open: #7FA3D6; --st-choosing: #FFA94D; --st-founded: #F8C13A; --st-mine: #FFFFFF; --chip-bg: rgba(7,20,38,.82); }` | literal hex (read by `cities.js`, pinned by `test/map-overview.test.js`, updated there) |
| | `:root[data-theme="light"] { --st-open: #3F67A6; --st-choosing: #B35A0A; --st-founded: #A26F00; --st-mine: #0C2344; --chip-bg: rgba(255,255,255,.92); }` | |
| `polish-map.css` | `:root { --st-active: #2ED3B7; }` / `:root[data-theme="light"] { --st-active: #0E7C63; }` | **unchanged**: `cities.js` falls back to these and `test/map-labels.test.js` pins them |
| `style.css` launchpad live block | `:root { --up: #34D399; --down: #FF8C74; --chart-halo: rgba(7,20,38,.86); }` | read by `coinchart.js` |
| | `:root[data-theme="light"] { --up: #1E9E78; --down: #C0392B; --chart-halo: rgba(255,255,255,.92); }` | `--down` was the old accent `#E8431F`; now the light `--bad-text` (pin updated) |
| `style.css` profiles block | `--pf-0..7`, `--pf-x` | **unchanged** (a categorical data palette, both themes, pinned by `test/profiles-ui.test.js`) |
| `style.css` `[data-color]` coin palettes | gold default `--c1/--c2/--c3` = `#FFE9A8 / #F8C13A / #D99A1A`; rose, ocean, emerald, violet, ink as today | the gold family follows the brand gold; the five others are the member's own choices |
| `pages-launchpad.css` / `pages-coin.css` / `swap.css` | `.lp-ava` / `.swap__mark--ava` defaults `--c2: #F8C13A; --c3: #D99A1A`, ink `var(--on-gold)` | the `.lp-ava` block stays byte-identical in the two page sheets |
| `polish.css` | `--tabbar-h: 64px; --bottom-bars: 0px` | unchanged (pinned) |
| `polish-dash.css` | `--dd-*` aliases | values follow the shared tokens; names unchanged |
| `public/brand/tokens.css` | unchanged | the coin-art palette (`--cc-*`) is frozen by `test/coinart-t2.test.js`; nobody links this file |

### 3.5 New names, and one rename

New: `--gold-ui`, `--on-cta`, `--on-gold`, `--on-accent`, `--accent-rgb`, `--accent-2-rgb`, `--gold-rgb`, `--ok-rgb`, `--bad-rgb`, `--warn-rgb`,
`--blue-rgb`, `--focus-ring`, `--scrim`, `--grad-aurora`, `--pass-a`, `--pass-b`, `--pass-glow-1`, `--pass-glow-2`, `--pass-line`.

Rename in the *using* sheets only: `coin-ready.css` and `coin-review.css` read `var(--focus, #F25C24)` for their focus rings; `--focus` is not
a root token (it is the map focus card's local status colour, `style.css` 951–960 and `polish-map.css`), so those rings fell back to the old
orange. They now read `var(--focus-ring, #37E0CA)`. Nothing is removed from `style.css`.

### 3.6 Values that look like design values but are frozen by JavaScript (keep literally)

`--st-active` (`#2ED3B7` / `#0E7C63`), `theme-color` `#071426` (citycoin build) and `#070E19` / `#F5F7FB` (default build / `theme.js`),
`--header-h` arithmetic (52 + 8 phone = 60; 68 desktop; the dashboard strip's `+ 6px`), the opaque-bar recipe
`background: linear-gradient(var(--glass-bg-strong), var(--glass-bg-strong)), var(--bg); backdrop-filter: none` on `.tabbar` and `.dv2 .dtabs`
(phone), `.wrap --wrap-pad` 16/24, `.buy-slot.is-pending` heights, `#city-stage --slot-h` 134/52, the `--cc-*` coin-art tokens, the `--pf-*`
palette, the `.wtab-qr` white/`#0B1626`, `#B3261E` mainnet red.

## 4. Type scale

Unchanged in face, size and rhythm (section 3.3 tokens; `h1` 650 / `-0.035em` / 1.05, `h2` 600 at `--fs-xl` ≤ 22ch, `h3` 600 at `--fs-lg`,
body Inter 16px/1.6, `.75rem` the floor). Space Grotesk stays the display face for titles, numbers, tabs and card titles; it is also what
the server-side coin art renders with (`test/coinart.test.js`) and both licences are named on `/credits` (`test/site.test.js`). Colour
changes only:

- `h1`, `h2`, `h3`, `.page-title`: `var(--text)`; the hero's first line `.text-ink` (`--grad-ink`), the second `.accent` (`--grad-accent`).
- Leads (`.lead`, `.hero4__lead`): `var(--text-2)`.
- `.kicker`: `600 var(--fs-kicker)/1.4 var(--body)`, uppercase, `var(--ls-kicker)`, **`color: var(--muted)`** (unchanged rule).
- Links in copy: `var(--pin-2)`, `text-underline-offset: 3px` (unchanged).
- Numbers (`.tnum`, `--fs-num`, table `.num`): `font-variant-numeric: tabular-nums` (unchanged).
- Small source lines (`.lp-src`, `.coin-foot`, `.coin-tile__src`, `.coin-trade__who`, `.coin-sources`): `var(--muted)`, never `--faint` (pinned).

## 5. Lines, surfaces, radii, elevation, glass

- **Lines**: `--line` (.09) for card borders and dividers, `--line-2` (.15) for emphasised borders, chips and the secondary button;
  `--field-line` (.36 / .52) for every form control (3.15:1 or more on every surface); `--accent-line` for an accent hairline; `--pass-line`
  on the pass. Dashed lines (`.empty`, `.contract__foot`) use `--line-2`.
- **Surfaces**: page `--bg`; card `--surface-1` (ink .055 → .025 over the page) or `--card`; well `--surface-inset`; opaque layer `--bg-2`
  (sheets, pop-overs, sticky table heads use `--bg-3`); light cards are white (`--card: #FFFFFF`). The light "white chip" idiom
  (`:root[data-theme="light"] .btn--glass`, `.seg button[aria-selected]`, `.lp-search input`, `.su-tab`, `.swap__token`) reads `var(--card)`
  instead of the literal `#FFFFFF`/`#fff`.
- **Radii** (unchanged scale): `--r-xs` 8 (code, skip link), `--r-chip` 12 (inputs, toast, nav pills), `--r-card` 16 (cards, the header),
  `--r-lg` 20 (modals), `--r-hero` 24 (hero figures, dashboard cards), `--r-pill` (buttons, tags, segmented), `--radius` 22, the pass 26.
- **Elevation**: `--e1` at rest (1 px lit top edge + 1/2 px drop), `--e2` raised/hovered (lit edge + 12/32 px), `--e3` floating (lit edge +
  28/72 px). Dark shadows are navy-black `rgba(2,8,20,…)`, light ones navy `rgba(12,35,68,…)`; nothing grey. The header's scrolled shadow is
  `--e3` on its `::after` (unchanged mechanism). The CTA glow family is gold in dark and a navy shadow in light.
- **Glass**: `--glass-bg` at rest, `--glass-bg-strong` scrolled/opaque bars, `--glass-border` + `--glass-hi` as the inset rim, `--glass-blur`
  `saturate(1.6) blur(20px)`. Only the header, tab bar, toast, terms note, map controls, coin mini-bar and sheets are glass. The phone tab
  bar and the dashboard strip stay opaque (the pinned recipe).
- **Scrims**: `--scrim` behind the account sheet, modals and the swap sheet (`::backdrop` keeps literal rgba in both theme rules, retinted
  to the same navy values, because `::backdrop` does not inherit custom properties in every supported browser).

## 6. Components

Rules are given as the final declarations the owner of that file writes; selectors and property order of pinned rules are kept.

### 6.1 Floating header (`style.css` 166–222; `polish.css` 44–67; `brand/citycoin.css`)

- Bar: unchanged geometry (56 px desk / 52 phone, radius 16 / 14, sticky at 12 / 8 px). `background: var(--glass-bg)`, blur, `box-shadow: inset
  0 0 0 1px var(--glass-border), var(--glass-hi);` (pinned, no `border`). Scrolled: `--glass-bg-strong`, `::after` fades `--e3` in.
- `::before` hairline: `background: var(--grad-aurora); left: 14%; right: 14%; opacity: .8;` (light `.6`). Replaces the accent-line hairline.
- `.nav a`: `--muted`, hover `--text` on `rgba(var(--ink),.05)`, current `--text` on `rgba(var(--ink),.07)` (unchanged).
- `.theme-toggle`: unchanged; focus ring `--focus-ring`.
- Log in `.account-btn`: a ghost text button; signed-in chip `rgba(var(--ink),.06)` + `--line-2` inset; `.btn__dot` `var(--ok-text)` with
  `0 0 0 3px var(--ok-soft)` (was a moss literal). `.avatar-mini`: `background: var(--gold); color: var(--on-gold)` (was pin→gold with white).
- Sign up `.hdr-signup`: `.btn--primary.btn--sm.has-ring` — gold with navy text in dark, navy with gold text in light; the hover ring
  `--grad-ring` (teal → gold) as today.
- Signed-in avatar (`polish.css` `.hdr-avatar__face`, `.acct__av`): `background: linear-gradient(145deg, rgba(var(--accent-rgb),.30),
  rgba(var(--gold-rgb),.16)); box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb),.5), inset 0 1px 0 rgba(255,255,255,.12);` — one rule for both
  themes; delete the light override. Hover/open: `0 0 0 3px var(--accent-soft)`. Focus: `outline: 2px solid var(--focus-ring)`.
  Phone "current tab" ring: `… 0 0 0 2px var(--bg-2), 0 0 0 4px var(--pin)` (pinned); delete the light `#CF3A1A` override (the token covers both).
- Lockups (`brand/citycoin.css`): unchanged. White wordmark + gold `.dev` + teal icon on the dark glass (18:1 / 10.9:1 / 8.8:1), navy wordmark
  on the light glass (15.4:1); on light, the gold `.dev` and teal icon are the lockup's own art (images, not text).

### 6.2 Phone tab bar (`style.css` 223–239, 1397–1400, 1425–1429; `brand/citycoin.css` 4 columns)

Opaque strong glass over `--bg` (pinned recipe), `inset 0 1px 0 var(--glass-border)`. Labels `--muted`, current label `--text`, current icon
`var(--pin)` (pinned). `.tabbar__ind` (20 × 4 px, pinned geometry): `background: linear-gradient(90deg, var(--pin), var(--gold-ui));` —
teal to gold, and `--gold-ui` keeps the gold end at 4.3:1 on the light bar. Tap bounce unchanged (`--ease-spring`).

### 6.3 Buttons (`style.css` 241–304; motion 1411–1413, 1431–1436)

```css
.btn { /* unchanged: pill, 48 px, 600 1rem/1.2 Inter, -.005em, 1px transparent border */ }
.btn--primary { background: linear-gradient(135deg, var(--cta-a), var(--cta-b)); color: var(--on-cta); box-shadow: var(--glow-cta); }
.btn--glass { background: rgba(var(--ink),.06); border-color: var(--line-2); color: var(--text); box-shadow: var(--glass-hi); }
:root[data-theme="light"] .btn--glass { background: var(--card); box-shadow: var(--e1); }
.btn--ghost { background: transparent; color: var(--text-2); }
.btn--cta-glow { box-shadow: var(--glow-cta), var(--cta-halo); }   /* pinned text */
@media (hover: hover) {
  .btn--primary:hover { box-shadow: var(--glow-cta-hover); }
  .btn--cta-glow:hover { box-shadow: var(--glow-cta-hover), var(--cta-halo); }
  .btn--glass:hover { background: rgba(var(--ink),.10); border-color: var(--accent-line); }
  .btn--ghost:hover { background: rgba(var(--ink),.05); color: var(--text); }
}
.btn--sm { min-height: 40px; … }  .btn--lg { min-height: 56px; … }   /* 44 px on touch via polish.css, pinned */
.btn[disabled], .btn.is-busy { opacity: .6; cursor: progress; transform: none; }   /* unchanged */
.btn__dot { background: rgba(255,255,255,.75); }   /* on the primary it is drawn over --on-cta's button: keep */
.btn--email .social-mark { color: var(--pin-2); }  .btn--google { /* Google's own colours, keep */ }
```

States: hover lifts 1 px under a mouse (`translateY(-1px)`, motion layer, pinned), press `scale(.97)` at 80 ms, focus `:focus-visible` 3 px
`--focus-ring` offset 3 px, disabled `.6` opacity and no lift. `.btn--soft` (`pages-launchpad.css`): `background: rgba(var(--accent-rgb),.15);
border-color: rgba(var(--accent-rgb),.62); color: var(--pin-2); font-weight: 700;` with its hover `.24` / `.85` and no light override (the
triplets change per theme). Every former white-on-CTA control draws `var(--on-cta)`: `.contract__buy`, `.su-tab[aria-pressed="true"]`,
`.phase__n`, `.map-open`, `.pm-btn--primary` (`app-phone.css`); `.steps__n` stays a `--card-2` disc. `.icon-btn` on the pass: white alphas
(unchanged). `.map-ctrl button`: glass with `--line-2`, hover border `--accent-line`. `.link-btn`: `--muted` → `--text` (unchanged).

### 6.4 Cards (`style.css` `.card` 308; `.stat` 381; `.dash .card` 1569–1573; `.lp-card` 1951; `.dv2 .dpanel > .card`; `polish-dash.css` 154–158)

- `.card { background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-card); padding: var(--card-pad); box-shadow:
  var(--shadow-1); }` (pinned text). Hover (fine pointer, motion welcome; the pinned list of grids): `translateY(-2px)`, `border-color:
  var(--line-2)`, `box-shadow: var(--e2)`.
- `.stat`: `--card` fill, `--line`, radius 18 (unchanged).
- `.dash::before` glow: `radial-gradient(45% 60% at 12% 0%, rgba(var(--accent-rgb),.14), transparent 70%), radial-gradient(40% 55% at 88% 4%,
  rgba(var(--gold-rgb),.12), transparent 70%)`.
- `.dash .card`: fill `rgba(var(--ink),.07) → .025`, border `rgba(var(--ink),.1)`, `box-shadow: inset 0 1px 0 rgba(var(--ink),.08), 0 30px 60px
  -42px rgba(2,8,20,.9)`; the gradient rim `::before`: `linear-gradient(160deg, rgba(var(--ink),.22), transparent 32%, transparent 72%,
  rgba(var(--gold-rgb),.28))` (ink to gold).
- `.lp-card`: `--surface-1`, `--line`, `--e1`; `.lp-card--live:hover` border `--accent-line`; `.lp-card--featured` unchanged in layout (pinned).
- Dashboard panels (`polish-dash.css`): `--dd-card`/`--dd-shadow` aliases follow `--surface-1`/`--e1`; the `.standing`/`.welcome`/`.wcard` tints
  read `rgba(var(--accent-rgb),.12) → rgba(var(--gold-rgb),.06)`.
- `.coin-page .card`, `.prof .card`, `.countdown__unit`: tokens only, no literals.

### 6.5 Inputs, selects, checkboxes, radios (`style.css` 347–351, 279, 737, 1180, 1486, 1525, 1827, 1847, 1941–1947; `polish.css`; `swap.css`; `admin.css`)

```css
input, select, textarea { font: 500 .98rem var(--body); color: var(--text); }
.field, … { background: var(--surface-inset); border: 1px solid var(--field-line); border-radius: 12px; padding: 11px 12px; outline: none; min-width: 0; }
…:focus { border-color: var(--pin); box-shadow: 0 0 0 3px var(--accent-soft); }
select option { background: var(--bg-2); }
input[type="checkbox"], input[type="radio"] { accent-color: var(--pin); }   /* .su-check input and .swap__warn input already do */
::placeholder { color: var(--faint); opacity: 1; }   /* placeholder is a hint, never the only label */
[aria-invalid="true"] { border-color: var(--bad-text); box-shadow: 0 0 0 3px var(--bad-soft); }
```

Every control keeps `border: 1px solid var(--field-line)` (six selectors pinned), 44 px tall (48 for `.lp-search`), `font-size: 16px` on
phones where pinned (`.find-box input`, `.map-find input`). The `.email-form input:focus` outline becomes the same teal ring. Selects keep the
browser chevron (no data-URI in `pages-home`/`pages-app`/`app-phone`, which forbid `url(`). Light fields: white well is **not** used; the
light `--surface-inset` is `#EEF2F7` so the field reads as a well on a white card (field line 3.29:1 there).

### 6.6 Sheets, modals, pop-overs (`style.css` `.modal` 1500–1515, `.rank-pop` 749–806, `.terms-note` 609; `polish.css` `.acct*` 69–116;
`swap.css` `.swap-sheet` 138–151; `feedback.css` `.fb__panel`; `style.css` `.prof-menu__list`, `.coin-mini`, `.coin-buybar`)

- Panel: `background: var(--bg-2); border: 1px solid var(--line-2); box-shadow: var(--e3); border-radius: var(--r-lg)` (bottom sheets square
  their bottom corners on phones as today). The account sheet's grab handle `--line-2`; rows 56 px (pinned).
- Scrim: `.modal { background: var(--scrim); backdrop-filter: blur(4px); }`, `.acct__scrim { background: var(--scrim); }` (delete the light
  literal override), `.swap-sheet::backdrop { background: rgba(3,10,22,.6); }` + `:root[data-theme="light"] .swap-sheet::backdrop {
  background: rgba(12,35,68,.32); }` (literal on purpose, see 5).
- `.rank-pop__card`: `--bg-2`, `--e3`; its title in light `var(--bad-text)` (pinned). `.terms-note`: glass strong, `--e3`.
- `.coin-mini`, `.coin-buybar`: glass strong, inset rim, `--e3`; the Buy button inside is `.btn--primary`.
- `.fb__panel`: `--bg-2`, `--e3`; `.fb__btn` glass (pinned text). `feedback.css` has no hex and no `255, 90, 54` (pinned): tokens and triplets only.

### 6.7 Tabs and segmented controls (`style.css` `.seg` 1291–1297 + `.seg__ind` 1457–1467, `.chips`, `.su-tabs`, `a[role=tab]`, `.lp-tabs`,
`.coin-seg`, `.trade__tabs`, `.dv2 .dtabs`; `polish-dash.css` 25–152; `pages-launchpad.css` 37–79; `pages-connect.css` 32–33; `admin.css`)

- `.seg`: `background: var(--surface-inset); border: 1px solid var(--field-line); radius 999; padding 3px`; chosen segment
  `background: var(--card-2); color: var(--text); font-weight: 600; box-shadow: inset 0 0 0 1px var(--line-2)`; light chosen `var(--card)` +
  `0 0 0 1px var(--line-2), var(--e1)`. The sliding `.seg__ind` (pinned behaviours) takes the same fill. Delete the light `rgba(11,22,38,.06)` literal.
- `.chips button[aria-selected="true"]`: `color: var(--text); border-color: rgba(var(--accent-rgb),.6); background: var(--accent-soft)`.
- `a[role="tab"][aria-selected="true"]` underline: 2 px `var(--pin)`.
- `.su-tabs`: `--card-2` track with `--line-2`; `.su-tab[aria-pressed="true"] { background: linear-gradient(135deg, var(--cta-a), var(--cta-b));
  color: var(--on-cta); box-shadow: var(--glow-cta); }` (the rule's first two declarations are pinned text).
- `.lp-tabs button[aria-selected]`: `--text` on `--card-2`; `.lp-tabs__n` count pill `var(--accent-soft)` + `var(--pin-2)`, light
  `transparent` + `var(--text-2)` (pinned); focus `outline: 2px solid var(--pin-2)` (pinned text).
- Dashboard strip `.dv2 .dtabs__ind` (the glass pill; every outer shadow y + spread + blur ≤ 4 px, pinned): dark fill
  `linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,.05) 55%, rgba(var(--accent-rgb),.09)) border-box`, shadows
  `inset 0 1px 0 rgba(255,255,255,.2), 0 2px 6px -4px rgba(var(--accent-rgb),.7), 0 1px 6px -3px rgba(2,8,20,.6)`; its `::after` line
  `linear-gradient(90deg, rgba(var(--accent-rgb),0), var(--pin) 25%, var(--pin) 75%, rgba(var(--accent-rgb),0))` with
  `0 -2px 6px rgba(var(--accent-rgb),.55)`; light fill `rgba(255,255,255,.9) → rgba(222,233,248,.72) 62% → rgba(var(--accent-rgb),.09)`,
  light line **`linear-gradient(90deg, rgba(0,111,103,0), #006F67 25%, #006F67 75%, rgba(0,111,103,0))`** (the light `--pin-2`, a shade deeper
  than `--pin`, 3:1 against the pill at its faintest breath; pin updated), glow `rgba(0,111,103,.4)`. `.dv2 .dtab__badge` light:
  `background: var(--pin-2); color: #fff` (6.0:1), replacing `#B8430F`.
- `.coin-seg`, `.trade__tabs`, `.adm-subtabs`, `.fb__kinds`: the `.seg` recipe.

### 6.8 Pills, badges, tags (`style.css` 318–325, 1247–1250, 639–641, 2012–2015, 2143–2145, 2328–2332; `polish-map.css`; page sheets)

```css
.pill { … background: var(--warn-soft); border: 1px solid rgba(var(--warn-rgb),.3); color: var(--warn); }
.pill--live { background: var(--accent-soft); border-color: rgba(var(--accent-rgb),.35); color: var(--pin-2); }
.tag { … background: var(--card-2); border: 1px solid var(--line-2); color: var(--muted); }
.tag--ok { background: var(--ok-soft); border-color: rgba(var(--ok-rgb),.4); color: var(--ok-text); }
.tag--no { background: var(--bad-soft); border-color: rgba(var(--bad-rgb),.4); color: var(--bad-text); }
.tag--warn { background: var(--warn-soft); border-color: rgba(var(--warn-rgb),.4); color: var(--warn); }
.tag--gold { background: var(--gold-soft); border-color: rgba(var(--gold-rgb),.5); color: var(--gold-text); }
.role-pill[data-level="holder"] { color: var(--ok-text); border-color: rgba(var(--ok-rgb),.45); background: var(--ok-soft); }
.role-pill[data-level="founder"] { color: var(--gold-text); border-color: rgba(var(--gold-rgb),.55); background: var(--gold-soft); }
.role-pill[data-level="manager"], .role-pill[data-level="admin"] { color: var(--on-gold); border-color: transparent; background: var(--gold); }
```

`.live-dot { … background: var(--pin); }` (pinned); its ping `livePing` unchanged. `.dv2 .pass .live-dot` `#7CE8A6` (the dark `--ok-text`,
literal because the pass is navy in both themes; pin updated). `.contract__badge`, `.verified-badge`, `.check-result--official`: the ok
family; `.check-result--not_official { background: var(--bad-soft); border-color: rgba(var(--bad-rgb),.5); } .check-result--not_official
.check-result__icon { background: var(--bad-text); color: var(--on-accent); }` (navy on coral 8.6:1 dark, white on `#C0392B` 5.4:1 light).
**The filled status disc pattern** (one rule, both themes): the fill is the status *text* colour (`--ok-text`, `--bad-text`, `--warn`) and the
ink is `var(--on-accent)`; the done step of the sign-up stepper, the not-official icon and the wallet card's done tick all use it (dark navy on
`#7CE8A6` 11.8:1, light white on `#0C6F4F` 6.2:1). The light `--moss` fill takes neither navy (4.4:1) nor white (3.6:1) as text, so `--moss` is
for lines, dots and tints only.
`.lp-chg2.is-up/.is-down`, `.coin-chg`, `.token-quote__chg`: `--ok-text`/`--bad-text` on their soft tints; `.coin-tside`/`.trade__side.is-buy`
ok, `.is-sell { color: var(--bad-text); background: var(--bad-soft, rgba(255,154,134,.12)); }` (pin updated). Map pills (`polish-map.css`):
`.tag--active` unchanged (pinned, `--st-active`), `.tag--open` unchanged lines (pinned) plus a new
`.tag--open::before { content: ""; display: inline-block; box-sizing: border-box; width: 8px; height: 8px; margin-right: 6px; vertical-align: -1px;
border-radius: 50%; border: 1.5px solid currentColor; }` (hollow, so Open and Active differ in shape as well as hue). `pages-cities.css`
`:root[data-theme="light"] #cities .city-status { color: var(--ok-text); }` (pin updated; `#0C6F4F` 5.75:1).

### 6.9 Tables and lists (`style.css` 810–865, 525–533, 1803–1818, 1338–1341; `admin.css` 145–187; `pages-official.css`; `coin-review.css`)

`th` `600 .74rem/.1em` uppercase `--muted`, `border-bottom: 1px solid var(--line-2)`; sticky `thead th` on `var(--bg-3)` (opaque);
`td` `--line` rule, last row none; `.table-scroll` radius 14 with `--line`; row hover (fine pointer) `rgba(var(--ink),.03)`; `tr.is-me td`
`var(--gold-soft)` with `inset 3px 0 0 var(--gold)`; mono addresses `--text`, hover `--pin-2`; skeleton rows shimmer on `--card-2 →
rgba(var(--ink),.12)` only while `.skeleton`/`.is-loading` (pinned); phone grid rows unchanged (pinned). `.pct-bar` track `rgba(var(--ink),.08)`,
fill `var(--pin)`. Lists: `.wanted > li` cards `--surface-1`/`--line`, hover lift; `.kv` dividers `--line`; `.compare` ticks `--ok-text`,
crosses `--bad-text`.

### 6.10 Charts and progress (`style.css` `--chart-*`, `--up/--down`, `.lp-spark`, `.coin-chart__*`, `.pf-*`, `.meter`, `.bar`, `.lp-bar`,
`.launch-progress`; `admin.css` `.chart__*`, `.adm-spark`; `polish-dash.css` `.dpv__bar`)

Series 1 teal `--chart-1`, series 2 gold `--chart-2` (light `#A26F00`, 4.4:1), grid `--chart-grid`, axis text `--chart-axis` (= `--muted`);
`--up`/`--down` mint/coral (light `--down` = `--bad-text`). Text never takes a series colour. Progress tracks `rgba(var(--ink),.08)`; fills:
`.meter`/`.bar`/`.launch-progress` `var(--pin)`; `.lp-bar::-webkit-progress-value { background: linear-gradient(90deg, var(--pin), var(--gold-ui));`
and the same for `::-moz-progress-bar` (pin updated); the one-time `moSheen` unchanged. `.pf-*` donut keeps `--pf-*`. `.lp-spark` line `--chart-1`,
`.is-up`/`.is-down` tint `--ok-soft`/`--bad-soft`; `.lp-spark__ping` `--pin`. `coinchart.js` reads `--up --down --text --muted --faint --ink
--chart-halo` (names kept).

### 6.11 Map (`style.css` 426–450 home SVG, 879–1062 cities, `--st-*` 941–942; `polish-map.css`; `pages-cities.css`)

- Tokens: section 3.1/3.2/3.4. Legend and card dots: `.dot--open { background: var(--st-open); box-shadow: 0 0 6px var(--st-open); }` (one
  definition; delete the earlier `#7FA3D6` literal at 925), `.dot--claimed { background: var(--st-founded); box-shadow: 0 0 8px var(--st-founded); }`,
  `.dot--mine { background: var(--st-mine); box-shadow: 0 0 8px var(--st-mine); }`, `.dot--choosing { background: transparent; border: 2px dashed
  var(--st-choosing); }`, `.dot--active` unchanged (pinned). `.map-focus[data-status]` `--focus` mappings unchanged (they read `--st-*`).
- Home SVG map: `.m-area` fills `rgba(127,163,214,.08/.22)` → `rgba(var(--blue-rgb),.08/.22)`; `.m-nyc` accent `rgba(var(--accent-rgb),…)`;
  `.m-official` gold; `.m-coin circle { fill: var(--gold); stroke: #fff6; stroke-width: 3; } .m-coin text { … fill: var(--on-gold); }`;
  light `:root[data-theme="light"] .m-coin circle { fill: var(--gold); stroke: var(--gold-ui); stroke-width: 2.5; }` and
  `:root[data-theme="light"] .m-coin text { fill: var(--on-gold); }` (pin updated). `.hero-map::before` glow `rgba(var(--accent-rgb),.22) →
  .08`; `.hero-map__svg` background `var(--map-water)`, shadow `0 40px 100px -30px rgba(2,8,20,.8)`; hover border `--accent-line`, glow
  `rgba(var(--accent-rgb),.35)`; `.hero-map__link:focus-visible { outline: 3px solid var(--focus-ring); }`. `.map-open` = CTA colours + `--on-cta`.
- Cities page: `.citymap__stage` on `var(--map-bg)`; coloured-map canvas backgrounds `#10345a #081a30` → `#12325C #08142A`, light `#cfe6f7 #aecfeb`
  → unchanged family; `.map-ctrl`/`.map-exit`/`.map-focus`/`.map-find` glass with `--line-2`, hover/focus `--accent-line`; `.map-find input`
  focus `rgba(var(--accent-rgb),.55)`; `.citymap__tip`, `.map-hint` glass strong. `pages-cities.css` light `#city-stage --map-bg` override
  keeps `#E6F0FA / #D9E6F4`. `cities.js` palettes (hover fills, label text colours, area tints) are frozen: documented in section 13.

### 6.12 Skeletons and loading (`style.css` `.skel` 373, `tr.skeleton`, `.map-focus.is-loading`, `.lp-spark.is-loading`, `.dv2-skel`;
`polish-dash.css` 530–543; `pages-launchpad.css` `.lp-skel`; `pages-token.css`; `admin.css`)

`.skel` `linear-gradient(90deg, var(--card), var(--card-2), var(--card))`, never animated (pinned); shimmer only on `.is-loading`,
`.is-busy`, `[aria-busy]`, `.skeleton` (pinned); `.lp-spark.is-loading.is-asking` shimmer (pinned). No colour literals.

### 6.13 Toast and burst (`style.css` 339–346, 237)

`.toast`: glass strong, blur, `inset 0 0 0 1px var(--glass-border), var(--e3)`, radius `--r-chip` (pinned geometry); its tick `--ok-text`.
`.burst` 6 px `var(--pin)` dot, `.6s var(--ease-out)` once (pinned).

### 6.14 Footer (`style.css` 578–606; `polish.css` 135–137)

`.site-footer { border-top: 1px solid var(--line); … }` plus `position: relative` and a new `.site-footer::before { content: ""; position:
absolute; top: -1px; left: 14%; right: 14%; height: 1px; pointer-events: none; background: var(--grad-aurora); opacity: .5; }`. Copy and
links `--muted`, hover `--text`; social discs hover `rgba(var(--ink),.06)`; the security line `--muted`; 44 px rows (pinned); the phone
theme switch unchanged.

### 6.15 Focus rings

`:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 3px; border-radius: 8px; }`. Every local ring reads `--focus-ring`
(`.hdr-avatar`, `.acct__link`, `.nt-switch`, `.hero-map__link`, `.pair-opt`, `.app4-phones` 3 px, `.lp-tabs button` 2 px `--pin-2` pinned,
`#cr-state`, `.crv-card`, `#crv-req-tag`). Teal `#37E0CA` on navy 11:1; `#006F67` on paper 5.6:1. Inside a filled gold button the ring is
still teal (offset 3 px puts it on the page).

### 6.16 Pass, founder card, dashboard preview, profile pass (`style.css` 1577–1606, 2316–2348; `polish-dash.css` 209–242, 545–655;
`pages-profile.css`; `onboard.css` `.ring--pass`)

```css
.pass { … color: #fff; border: 1px solid var(--pass-line);
  background: radial-gradient(90% 120% at 0% 0%, var(--pass-glow-1), transparent 60%), radial-gradient(90% 120% at 100% 100%, var(--pass-glow-2), transparent 60%), linear-gradient(135deg, var(--pass-a), var(--pass-b));
  box-shadow: 0 34px 80px -34px rgba(0,203,182,.35), inset 0 1px 0 rgba(255,255,255,.22); }
.pass__mark { background: var(--gold); box-shadow: 0 0 0 3px rgba(255,255,255,.18); }   /* citycoin.css replaces it with the favicon */
.pass .role-pill[data-level="founder"] { background: var(--gold); color: var(--on-gold); border-color: transparent; }
```

White text keeps 6.0:1 on the teal corner and 6.5:1 on the gold corner (section 12). The founder card `.dv2 .card.fcard` uses the same
`--pass-*` base; its states: default gold light `rgba(var(--gold-rgb),.32)`, `steward` mint `rgba(var(--ok-rgb),.4)`, `provisional` blue
`rgba(var(--blue-rgb),.5)`, `grace` coral `rgba(var(--bad-rgb),.4)`; its kicker and `.fcard__pick` `var(--gold-text)`, its tags the section 6.8
tints with the pass's white alphas. The dashboard preview `.dpv__pass` reads the same tokens (its green sample coin becomes `#34D399` with
ink `#062A1F`, 8.0:1; pin updated); the profile pass `.prof-pass` tones the glows to `.28`/`.3`. Nothing in this family changes in light:
"one object in two materials".

### 6.17 Coin discs and avatars (`style.css` `.coin-disc`, `[data-color]`, `.coin-art`, `.swatch`, `.token-chip__dot`, `.pair-opt__icon`,
`.idcard__avatar`, `.contract__icon`; `pages-launchpad.css`/`pages-coin.css` `.lp-ava`; `swap.css` `.swap__mark`; `onboard.css`; `polish.css`)

`.coin-disc`: `radial-gradient(circle at 32% 28%, #FFE9A8, var(--gold) 45%, #D99A1A 100%)`, rim `rgba(255,236,190,.8)`, shadow
`0 10px 24px -8px rgba(var(--gold-rgb),.55)`, ink `var(--on-gold)` (navy 6.4:1 at the darkest end). `.lp-ava`/`.swap__mark--ava` gold default
`--c2: #F8C13A; --c3: #D99A1A`, ink `var(--on-gold)`; `.lp-ava[data-kind="vicinity"] { color: #0C2344; background: linear-gradient(135deg,
#00CBB6, #F8C13A); }` (the legacy token's own mark; literal in both themes, pin updated; the block stays byte-identical in both sheets).
`.idcard__avatar`, `.link-in__avatar`, `.welcome__disc`: `var(--gold)` + `var(--on-gold)` (was pin → gold). `.pm-coin--vic` (`app-phone.css`)
the same literal pair as `.lp-ava[data-kind="vicinity"]`; `.pm-coin--city` `rgba(var(--blue-rgb),.16)`.

### 6.18 Empty states, folds, icons (`style.css` 355–371, 362–367, 1333)

`.empty` dashed `--line-2`, `--muted`, title `--text`; `.fold` `--line` top, `+`/`−` in `var(--pin-2)` (interactive); `.ico--ok` `--ok-text`,
`.ico--gold` `--gold-text`, `.ico--muted` `--muted`. Unchanged selectors (pinned).

## 7. Motion

The site-wide motion layer (`style.css` 1384–1449) keeps its structure, keyframe names (`moEnter, moSheen, moState, vtIn, vtOut, livePing`)
and the reduced-motion block verbatim. Value changes are through the tokens of section 3.3 only:

| what | duration / curve | where |
|---|---|---|
| press (buttons, tappable cards) | `scale(.97)` 80 ms | `.btn:active`, `.card--link:active` (unchanged) |
| hover colour, background, border, shadow | `--dur-2` **180 ms**, `--ease-out` **`cubic-bezier(.22,.61,.36,1)`** | `.btn`, `.nav a`, `.theme-toggle`, footer links, `.has-ring::after`, `.site-header::after` |
| hover lift | 1 px (buttons), 2 px (cards), `--dur-2` | the `(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)` block only |
| enter (view transition new, `main`, panels) | `--dur-3` 320 ms `--ease-out`; old page `--dur-1` 120 ms | pinned rule text |
| reveal on scroll `.mo-armed.mo-in` | `.4s ease-out` / `.4s cubic-bezier(.2,.8,.2,1)` | pinned literal, unchanged |
| tab bounce | `.32s var(--ease-spring)` | unchanged |
| live dot, next-step ping, card ping | `livePing 1.6s cubic-bezier(0,0,.2,1) 3` | pinned, unchanged |
| progress sheen | `moSheen 3.6s ease-in-out 1.5s 1` | pinned, unchanged |
| pass gloss | `passShine 2.4s ease-in-out .4s 1` (`.dpv__shine` `7s 1.2s 2`) | pinned, unchanged |
| contract sweep, map rest | `contractSweep 2.4s … 1.2s 1`, `fxRest 3.6s steps(18) 1` | pinned, unchanged |
| focus ring | no transition | — |

Rules: only `transform`, `opacity` (and `filter`/`background-position` in the motion layer) move; nothing loops but `shimmer`/`spin` on a
busy state and `ringSpin` under a mouse; every self-starting animation ends within 5 s; every `animation`/`transition` in every sheet is inside
a `prefers-reduced-motion: no-preference` block; `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before,
*::after { animation: none !important; transition: none !important; } .mo-armed { opacity: 1; transform: none; } }` stays the last block of
`style.css`. `polish.css` keeps exactly one no-preference block. `wallet-send.css` and the Wallet-tab block have no motion at all.

## 8. Hero treatments, page by page

Every page's first section is lit by `--grad-glow` (teal at 28 % left, gold at 78 % right; half strength in light) through the pinned
`::before` rules (`.page-hero`, `.connect`, `.dash-out`, `main > .section:first-child`, `.hero4`, `.lp4-hero`); nothing in a glow animates.

| page | treatment |
|---|---|
| `/` (`pages-home.css` `.hero4`) | "One city." in `.text-ink` (`--grad-ink`), "One coin." in `.accent` (the coin's gold; bronze in light); lead `--text-2` ≤ 34ch; two 56 px buttons: `.btn--primary.btn--lg` (Find your city) + `.btn--glass.btn--lg`; the live-numbers bar `.tk__*` on `--card` with an ok live dot; `hero4Rise .4s` unchanged |
| `/launchpad` (`pages-launchpad.css` `.lp4-hero`) | "Every city gets" ink, "its own coin." `.accent`; one `.btn--primary.btn--lg.btn--cta-glow.has-ring` (gold halo dark, navy shadow light); the hero's `::before` is the page's one glow (pinned) |
| `/cities` (`.page-hero--map`) | title + facts in ink only (no `.accent`: the map is the picture); glow at `.5` opacity so the stage dominates; the stage on `--map-bg` with the retinted land/water |
| `/dashboard` signed out (`.dpv`) | the navy pass preview lit teal/gold, kicker `--muted`, "Join or log in" `.btn--primary` (gold dark / navy light); signed in: no hero, the glass strip |
| `/connect`, `/locate` (`.connect`) | the panel card on `--surface-1`; title in `--text` only (a form page carries no accent headline); the wizard's done steps mint, current teal; the glow at full dark strength, `.07/.06` light |
| `/token` (citycoin: the "not live" page, `pages-404.css`) and `/404` | `.page-title` ink; the big "404" / "Not live yet" line `.accent`; one `.btn--glass` |
| `/coin` | no hero (a data page): head card, price `--fs-num` in `--text`, change in ok/bad |
| `/profile` | the profile pass (6.16) as the hero |
| `/admin` | no hero; the gate card on `--surface-1` |
| `/rules`, `/terms` (`pages-docs.css`) | `.page-title` in ink; the terms table of contents links `--pin-2`; glow faint |
| `/credits`, `/official`, `/app` | `.page-title` ink; `/app`'s phone stage glow `rgba(var(--accent-rgb),.18)` dark / `.08` light |

## 9. Per-sheet notes (every stylesheet in the CSS map)

Owner letters are from section 10. "Sweep" means: every literal of the old palette (orange `255,90,54`, `232,67,31`, `#FF5A36`, `#FF8A5B`,
`#B8430F`, `#CF3A1A`, `#A8321A`, pin-2 `255,138,91`, moss `55,194,154`, gold `255,200,87`/`#FFC857`/`#D98A1F`, warn `255,213,138`, blue
`91,140,255`/`43,91,255`, purple `122,92,255`/`#1B1030`/`#0B1426`, old inks `#5A3A06 #3A2A0A #3A2300 #062017 #1A1206 #1A0E05 #3A2400`, old text
fallbacks `#C9D2E0 #93A0B6 #7CF0C5 #FF9D80 #FFE3A3 #F2552F #5B8CFF`, grey scrims `rgba(0,0,0,…)`, `rgba(3,7,14,…)`, `rgba(11,22,38,…)`)
becomes a token, a triplet tint, or the new literal where a fallback is required. Delete a light-theme override once the token covers both themes.

| sheet (owner) | what changes |
|---|---|
| `style.css` (A) | the two token blocks and the scale block (section 3); `.skip` → `color: var(--on-accent)`; `:focus-visible` → `--focus-ring`; `::selection` unchanged; header hairline → `--grad-aurora`; `.tabbar__ind` gradient; buttons 6.3; `.pill`/`.tag*`/`.role-pill` 6.8; `.section--glow` tint `rgba(var(--accent-rgb),.075)` (pin); inputs 6.5 + `accent-color` + `::placeholder`; home map 6.11; `.steps__n` unchanged; `.hero-map*`; `.m-coin` light block (pin); footer `::before`; token page: `.contract` light `border-color: rgba(var(--accent-rgb),.22)` (pin), `.contract__buy` `color: var(--on-cta)` (pin), `.contract__badge` ok, `.check-result--*` 6.8, `.chip-link` accent tint, `.holders__skip:focus` `--on-accent`, `.holders__table tr.is-me` gold tint; cities: `--st-*` lines (pin), `.dot--*` 6.11, `.coin-preview`/`.coin-disc` 6.17, `.map-ctrl`/`.map-focus` glass; connect: `.stepper`, `.wallet-option`, `.alt`, `.su-tab` (pin), `.verified-badge` ok/gold, `.idcard__avatar`; dashboard legacy: `.lost-alert` bad, `.seg`/`.chips` 6.7, `.fomo`/`.badge*` tints, `.dash::before`, `.dash .card` rim, `.pass` 6.16, `.icon-btn`, `.pair-opt`, `.swatch`, `.token-chip__dot`; terms `.callout` warn; `.scam-note` bad; `.early__steps` accent; `.lp-*` live market: `.lp-tabs__n`, `.lp-chg2`, `.lp-bar` (pin), `--up/--down` (pin), `.lp-card--live:hover`; coin page `.coin-*` tints; `.dv2 .fcard` 6.16, `.dv2 .dtab__badge` dark `--accent-soft`/`--pin-2`; the motion layer untouched but for tokens. Keep every section-marker comment and the live-buttons comment verbatim. |
| `polish.css` (B) | avatar + account sheet 6.1/6.6 (`.acct__scrim` → `--scrim`, `.acct__panel` `--bg-2` + `--e3`); `.hero__outline` `rgba(var(--accent-rgb),.10)`; `.member-cloud__more` `color: var(--pin-2)` (pinned) with `rgba(var(--accent-2-rgb),.5)` rims; `.steps::after` progress `--pin`; timeline rail `--moss/--pin/--line-2`; `.holders__skip` on `--pin` with `--on-accent`; `.rules-toc a:hover` `--accent-line`; `#team-lock-live a` rule verbatim (pinned); no `#B8430F` (pinned); one no-preference block (pinned). |
| `feedback.css` (B) | `.fb__done-mark` `var(--ok-soft)` / `rgba(var(--ok-rgb),.4)`; `.fb__btn` pinned text; **no hex, no `255, 90, 54`, no `--cta-a`, no `--faint`** (pinned). |
| `polish-dash.css` (B) | strip pill 6.7 (pin at `dashboard-tabs.test.js:119`); `.dv2 .dtab__badge` light → `--pin-2`/white; `.nt-switch` track `--line-2`, knob `#fff`, on `var(--ok-text, #7CE8A6)` (pin at `notify.test.js:708`); Pass 6.16 (`#7CE8A6` live dot, pin); `.welcome`/`.wcard`/`.standing` tints via triplets; coin disc inks `--on-gold`; `.danger-btn:hover` `--bad-soft`; `chips[aria-selected]` ring `rgba(var(--accent-rgb),.55)`; `.dpv` 6.16 (sample coin `#34D399`/`#062A1F`, pin at `contrast.test.js:50`; `.dpv__kicker` rule text pinned); Wallet tab QR literal kept (pinned); every selector scoped to `.dv2`/`.dpv`/`body.is-dv2`/`[data-page="dashboard"]` (pinned); no `text-overflow: ellipsis`; no `infinite`. |
| `onboard.css` (B) | the stepper's `.is-done` disc takes the filled-status pattern of 6.8: `background: var(--ok-text); color: var(--on-accent)` (one rule, both themes; delete the light `#fff` override and the `#062A1F` literal); `.link-in__avatar`, `.welcome__disc` gold + `--on-gold`; `.welcome` tint `rgba(var(--accent-rgb),.14) → rgba(var(--gold-rgb),.08)`; `.wcard` border `rgba(var(--gold-rgb),.35)`, `.wcard.is-done` `rgba(var(--ok-rgb),.45)`; `.ring` arcs `--pin`, `.ring--pass` white; selectors scoped to the pinned prefixes; `.ring__arc` transition rule verbatim (pinned); the `.wcard` rule has no `color: #hex` (pinned). |
| `swap.css` (B) | wells `--surface-inset`; `.swap__token` light `var(--card)`; `.swap__warn` rim `rgba(var(--accent-rgb),.45)`; `.swap__note` `rgba(var(--blue-rgb),.12/.35)`; chips ring `rgba(var(--accent-rgb),.55)`; `.swap__mark--ava` 6.17; `#buy-slot.swap::before` line `rgba(var(--accent-rgb),.7)`; `::backdrop` literals retinted (5); QR white kept; `.swap__amt[data-fit]`, `.swap__go 52px`, `.swap__more-sum::after --pin-2` pinned. |
| `wallet-send.css`, `wallet-only.css` (B) | wells `--surface-inset`; `.wsend__addr b { font-weight: 800; color: var(--pin); }` (pinned); no motion (pinned); `wallet-only.css` layout only. |
| `pages-home.css` (C) | tokens only already; `.faq4 summary::after` stays `rgba(var(--ink),.06)`; `.hero4__lead` rule text pinned; no `url(`, no `!important` (pinned). |
| `pages-launchpad.css` (C) | `.lp-ava` 6.17 (byte-identical with `pages-coin.css`; `[data-kind="vicinity"]` pin); `.btn--soft` 6.3 (pin at `v4-review.test.js:99`); `.lp-search input` light `var(--card)`; `.lp-tabs__n` light rule text pinned; `.lp4-hero::before` glow rule pinned; `lpCardIn` pinned. |
| `pages-coin.css` (C) | `.lp-ava` copy identical to the launchpad's; contract pills accent tint; trades ok/bad tints; `.coin-ca__links` rule pinned. |
| `pages-token.css` (C) | `.token-quote__chg.is-down` `var(--bad-soft)` + light `var(--bad-text)` (delete `#A8321A`); `.trade__side.is-sell` fallback (pin at `token-tabs.test.js:61`); `.token-hero .contract__ext span` rule pinned. |
| `pages-cities.css` (C) | `.city-status` light → `var(--ok-text)` (pin at `v4-review.test.js:137`); `.map-find` focus `rgba(var(--accent-rgb),.55)`; light `#city-stage --map-bg` kept; `:root[light] .tag--active` → `var(--st-active)`; stage sizing, legend and `--legend-room` rules pinned; `.citymap__howto > summary` 44 px pinned. |
| `polish-map.css` (C) | `--st-active` lines unchanged (pinned); `.tag--active`/`.tag--open` lines unchanged (pinned); add `.tag--open::before` (6.8); icon masks unchanged. |
| `pages-app.css`, `app-phone.css` (C) | stage glow `rgba(var(--accent-rgb),.18)` / light `.08` (delete the `232,67,31` override); phone frame `#0B0F17`/`#1A2230`/`#000` kept (a device bezel); mock screens on `--bg/--text`; `.pm-btn--primary` CTA + `--on-cta`; `.pm-coin--vic` literal pair (6.17); `.pm-coin--city` blue triplet; QR white kept; no `url(` (pinned). |
| `pages-connect.css` (C) | **7,900 of 8,000 bytes**: every edit must shorten or hold the size (`test/design-pages.test.js:28`); `.su-tabs` light `var(--card)`; `.su-check`/`.alt` wells `--surface-inset`; Google button literals kept; `.connect` padding/min-height rules pinned. |
| `pages-profile.css` (C) | `.prof-pass` → `--pass-*` with glows `.28`/`.3`; badges chips 6.8. |
| `pages-official.css`, `pages-credits.css` (`--code-bg` fallback → `rgba(2,8,20,.4)`), `pages-docs.css`, `pages-404.css` (C) | tokens only; sizes under budget (`pages-credits.css` < 4,000 B, the others < 8,000 B). |
| `lp-launch.css` (C) | wells `--surface-inset`; `#B3261E` mainnet red kept (pinned); `#C9D2E0` fallbacks → `#C6D3E6`; `.lp-net` radius rule pinned. |
| `coin-ready.css`, `coin-review.css` (C) | focus rings → `var(--focus-ring, #37E0CA)`; warn tints via `--warn-rgb`; `coin-review`'s own green/orange (`83,211,140`, `242,92,36`) → `--ok-rgb`/`--bad-rgb`; `--warn-text` fallback `#F25C24` → `var(--warn, #FFD27A)`; drop shadows `rgba(2,8,20,…)`; `.coin-ready__facts` rules pinned. |
| `brand/citycoin.css` (C) | unchanged (lockups, 4-tab bar, `.cc-off`, `.pass__mark` favicon; pinned). |
| `admin.css` (D) | `.lp-approve { border: 2px solid var(--gold, #F8C13A);` (pin at `lp-launch-ui.test.js:503`); `#B3261E` kept; `.tab-badge` on gold → `var(--on-gold)`; danger border `rgba(var(--bad-rgb),.5)`; moss/gold alphas → triplets; every `var(--x, fallback)` fallback → the new dark value (`#C6D3E6 #93A4BE #7CE8A6 #FF9A86 #FFDC8A #2BD9C3 rgba(255,255,255,.045)`); `.chart__*` read `--chart-1/2`, `--chart-grid/axis`; `.adm-metric__go` order rule pinned; `.adm-coinrev*` rules pinned. |
| `scripts/pages/build.mjs`, `scripts/pages/src/*.html` | **unchanged**. Run `node scripts/pages/build.mjs` once at the end so `public/*.html` is a fresh build of the committed sources (parity test). |

## 10. Rollout: owners, order, verification, what to record where

Worktree: `/tmp/claude-0/-home-user/259e7af3-62d7-56de-8406-76246b95043c/scratchpad/cc-design` (branch `cc/design-premium`), `node_modules`
a symlink (keep it; never `npm install` there). Each parallel owner takes a detached scratch worktree of the same branch and merges back in
the order below; file sets are disjoint.

**Step 0 — owner A, first, short (blocks everyone):** the two token blocks + scale block of `style.css` (section 3), the `--st-*` and
`--up/--down` lines, and the matching assertion updates in `test/contrast.test.js`, `test/map-labels.test.js`, `test/map-overview.test.js`,
`test/launchpad-ui.test.js:492`. Push; B, C, D branch from it.

| owner | files (exclusive) | tests only this owner edits |
|---|---|---|
| **A — core** | `public/style.css`, `docs/DESIGN-V5.md` (Appendix B rows from everyone), `docs/citycoin-master/implementation-report.md` (section 11 + update log), new `test/design-v5.test.js` | contrast, map-labels, map-overview, d3-fix, launchpad-ui (491–492), token-card (88, 94), token-tabs (61, via C's value), v4-review (99 via C, 137 via C), design-pages (145 via C), mobile-polish (210), dashboard-design (122 via B), dashboard-tabs (119 via B), notify (708 via B), lp-launch-ui (503 via D) — A lands every assertion edit after the owner of the CSS sends the final rule text |
| **B — chrome & dashboard** | `public/polish.css`, `polish-dash.css`, `onboard.css`, `swap.css`, `wallet-send.css`, `wallet-only.css`, `feedback.css` | none directly (sends A the three pinned rule texts: strip line, pass live dot, nt-switch fallback, dpv coin) |
| **C — page sheets** | `pages-home`, `pages-launchpad`, `pages-coin`, `pages-token`, `pages-cities`, `polish-map`, `pages-app`, `app-phone`, `pages-connect`, `pages-profile`, `pages-official`, `pages-docs`, `pages-credits`, `pages-404`, `lp-launch`, `coin-ready`, `coin-review`, `brand/citycoin.css` | none directly (sends A: `.lp-ava` vicinity, `.btn--soft`, `.trade__side.is-sell`, `.city-status`, `.lp-approve` is D's) |
| **D — admin** | `public/admin.css` | none directly (sends A `.lp-approve`) |
| **E — verification** (after merge) | renders, the full suite, the docs check | — |

**Order:** 0 (A tokens) → A/B/C/D in parallel → merge B, C, D into A's branch → A lands the remaining assertion edits and `test/design-v5.test.js`
→ E.

**Cross-file hazards:** `.lp-ava` block byte-equal in `pages-launchpad.css` and `pages-coin.css` (both C); `--bad-soft` defined exactly twice in
`style.css`; `  --bg:` exactly twice; `pages-connect.css` ≤ 8,000 B; `polish-dash.css` selectors all scoped; `feedback.css` no hex; the
dashboard strip pill's outer shadows ≤ 4 px; nothing in `polish.css`/page sheets uses `!important`; no `:is(…)::before` in the motion section.

**Verification (E, before the PR):**

1. `node scripts/copy-assets.mjs && node scripts/pages/build.mjs && npm test` — green but for failures the untouched worktree also has
   (run the same command there first and diff the failing-test lists; 2,736 tests on `main` + the new file).
2. Render with the harness (`render-harness/README.md`, harness B: `node serve.cjs <public> <port>` + `node shoot.cjs <public> <outdir>`):
   all 16 pages × 390/1440 × dark/light = 64 full-page shots + 30 component shots; `report.json` must show no console error, no failed
   request beyond the known unmocked `/api/*`, and `horizontalOverflow: false` everywhere. Add **synthetic** fixtures (hand-written from the
   API shapes, not fetched) for `/api/launchpad` (three coins, one featured, one live with a spark) and `/api/signup/state`, so `/launchpad`
   shows coin cards and `/connect` its wizard; never run anything but read-only GETs against the live site.
3. Compare with `shots-before/` (live site) and the baseline run (`shots-base-static/`): every page, both themes; look for leaked orange
   (admin, profile, coin, official, rules/terms, 404 are where it hides), the light main action (navy/gold), the header lockups at 2×, the
   pass corners, the map legend vs the canvas, field borders on cards.
4. Measure, do not assume: `node test/design-v5.test.js` output is the section 12 table; eyeball the four component shots at 2× (header, tab
   bar, primary button, input focus) in both themes.
5. Keyboard pass on `/` and `/dashboard`: Tab to the skip link (navy on teal), the theme toggle (teal ring), the primary button (teal ring
   offset 3 px on the page), a field (teal border + ring).

**Record:** every changed assertion as a row in Appendix B (test, line, before, after, why) and as one row of
`docs/citycoin-master/implementation-report.md` section 11's tests table (the command run, the result, "design v5: N assertions updated,
each a pinned design value; see docs/DESIGN-V5.md Appendix B") plus one update-log row (`| 2026-11-xx (design v5, branch cc/design-premium) |
… |`) naming the files changed, the test count, the renders, and that no JavaScript or HTML source changed.

**Commits:** small, by owner; messages end with a blank line then exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018Fxgn3Z3hwNXvCPUPb4PWg
```

## 11. Pinned tests: every assertion that changes, and how

Intent is kept in every case (the WCAG threshold, the rule's structure); only the literal that *is* the design value moves. Lines are
`main` `0204191`'s. Everything not listed here stays as it is.

| test : line | before | after | why |
|---|---|---|---|
| `contrast.test.js` 17–20 (main buttons) | white `#FFFFFF` on every `--cta-a`/`--cta-b` ≥ 4.5 | per theme block: `--on-cta` of that block on that block's `--cta-a`/`--cta-b` ≥ 4.5 (reads 8.5/10.7 dark, 9.5/7.4 light); split the block at `:root[data-theme="light"] {` as the other tests do | the main button is gold with navy text in dark and navy with gold text in light |
| `contrast.test.js` 23–25 | `color: #fff;` in `.btn--primary`, `.contract__buy`, `.su-tab[aria-pressed="true"]` | `color: var(--on-cta);` | same |
| `contrast.test.js` 36–37 (headline stops) | light on `#F4F6FA`, `#FFFFFF`; dark on `#060C17`, `#0A1322` | light on `#F5F7FB`, `#FFFFFF`; dark on `#071426`, `#0B1B33` | the new `--bg`/`--bg-2` |
| `contrast.test.js` 49–50 (dpv coin) | `color: #062A1F` on `#37C29A` ≥ 6 | `color: #062A1F` on `#34D399` ≥ 6 (8.0) | the sample coin's green is the new ok fill |
| `contrast.test.js` 55 (`--muted` surfaces) | dark `#1B212A #141A24 #060C17`, light `#F3F5F6 #FFFFFF #F4F6FA` | dark `#10284A #0B1B33 #071426`, light `#EDF1F7 #FFFFFF #F5F7FB` | tile, card, page of the new palette |
| `contrast.test.js` 90–91 (field line) | dark over `#060C17 #0A1322 #0F1C31`; light ink `[11,22,38]` over `#F4F6FA #FFFFFF #EEF2F7` | dark over `#071426 #0B1B33 #10284A`; light ink `[12,35,68]` over `#F5F7FB #FFFFFF #EEF2F7` | new surfaces, navy ink |
| `mobile-polish.test.js` 210 | light `--pin-2` ≥ 4.5 on `#FFFFFF #F4F6FA #EEF2F7` | on `#FFFFFF #F5F7FB #EEF2F7` (6.05/5.64/5.4) | the new light page colour (passes either way; updated for accuracy) |
| `map-labels.test.js` 213 | dark `--st-active` ≥ 3 on `#1b2e4d #0B1A2E #10203a #060c16` | on `#1F3A60 #08142A #10284A #071426` | new land, water and the two ends of `--map-bg` |
| `map-labels.test.js` 214 | `--map-land: #1b2e4d; --map-land-line`, `--map-water: #0B1A2E;` | `--map-land: #1F3A60; --map-land-line`, `--map-water: #08142A;` (light lines unchanged) | coastline figure/ground 1.28 → 1.6 |
| `map-labels.test.js` 218 | others dark `#7FA3D6 #FFC857 #FF5A36`, light `#3F67A6 #B57F00 #E8431F` | dark `#7FA3D6 #FFA94D #F8C13A`, light `#3F67A6 #B35A0A #A26F00` (min separation 45° / 50°) | the new open / choosing / founded colours |
| `map-labels.test.js` 228 | `#7FA3D6` on `#0B1A2E` ≥ 4.5 | `#7FA3D6` on `#08142A` ≥ 4.5 (7.1) | new water |
| `map-overview.test.js` 476 | `--st-choosing: #FFC857`, `--st-founded: #FF5A36`, `--st-mine: #FFC857`, `--chip-bg: rgba(7,14,25,.82)` | `--st-choosing: #FFA94D`, `--st-founded: #F8C13A`, `--st-mine: #FFFFFF`, `--chip-bg: rgba(7,20,38,.82)` (`--st-open` both, light `--chip-bg` unchanged) | founded is the coin's gold, choosing amber, yours ink; the chip on the new canvas |
| `token-card.test.js` 88 | `.contract__buy` `color: #fff` | `color: var(--on-cta)` | navy on the gold Buy |
| `token-card.test.js` 94 | light `.contract` `border-color: rgba(232,67,31,.22)` | `rgba(var(--accent-rgb),.22)` | the tint reads the token |
| `token-tabs.test.js` 61 | `.trade__side.is-sell { color: var(--bad-text); background: var(--bad-soft, rgba(255,90,54,.1)); }` | `… var(--bad-soft, rgba(255,154,134,.12)); }` | the fallback is the new dark bad tint |
| `launchpad-ui.test.js` 491 | `.lp-bar::-webkit-progress-value { background: linear-gradient(90deg, #FF5A36, #FFC857);` | `… linear-gradient(90deg, var(--pin), var(--gold-ui));` | teal to gold, from tokens |
| `launchpad-ui.test.js` 492 | `:root[data-theme="light"] { --up: #1E9E78; --down: #E8431F;` | `… --down: #C0392B;` | the old accent is not a status colour; `--down` = light `--bad-text` |
| `design-pages.test.js` 145 | `.lp-ava[data-kind="vicinity"] { color: #fff; background: linear-gradient(135deg, #FF5A36, #FFC857); }` | `{ color: #0C2344; background: linear-gradient(135deg, #00CBB6, #F8C13A); }` | navy on the legacy mark's teal-to-gold (8.6:1 at the teal end) |
| `d3-fix.test.js` 55 | light `.m-coin circle { fill: #FFC857; stroke: #B9780F; stroke-width: 2.5; }` / `.m-coin text { fill: #3F2702; }` | `{ fill: var(--gold); stroke: var(--gold-ui); stroke-width: 2.5; }` / `{ fill: var(--on-gold); }` | the home coin reads the tokens (navy on light gold 7.5:1) |
| `d3-fix.test.js` 64 | `.section--glow … rgba(255,90,54,.075)` | `rgba(var(--accent-rgb),.075)` | the tint reads the token |
| `dashboard-design.test.js` 122 | `.dv2 .pass .live-dot… { background: #7CF0C5; }` | `{ background: #7CE8A6; }` | the dark `--ok-text` (the pass is navy in both themes) |
| `dashboard-tabs.test.js` 119 | light `.dtabs__ind::after` `rgba(207,58,26,0), #CF3A1A 25%, #CF3A1A 75%, rgba(207,58,26,0)` | `rgba(0,111,103,0), #006F67 25%, #006F67 75%, rgba(0,111,103,0)` | the light `--pin-2` (a shade deeper than `--pin`, 3:1 on the pill) |
| `notify.test.js` 708 | `background: var(--ok-text, #37C29A);` | `background: var(--ok-text, #7CE8A6);` | fallback = the new dark `--ok-text` |
| `v4-review.test.js` 99 | `.btn--soft { background: rgba(255,90,54,.15); border-color: rgba(255,110,70,.62); …` | `.btn--soft { background: rgba(var(--accent-rgb),.15); border-color: rgba(var(--accent-rgb),.62); color: var(--pin-2); font-weight: 700; }` | the tint reads the token |
| `v4-review.test.js` 137 | `:root[data-theme="light"] #cities .city-status { color: #0C6B4E; }` | `{ color: var(--ok-text); }` | the status pill reads the token (light 5.75:1) |
| `lp-launch-ui.test.js` 503 | `.lp-approve { border: 2px solid var(--gold, #FFC857);` | `var(--gold, #F8C13A);` | fallback = the brand gold |

**New:** `test/design-v5.test.js` — reads `public/style.css` (both token blocks, `--st-*`, `--up/--down`) and `public/polish-map.css`
(`--st-active`), composites the glass, well, chip and pass surfaces exactly as section 12's "surfaces" rows say, and asserts every row of
section 12 at its threshold (T 4.5, L 3, U 3, D none). It also asserts the token *discipline*: no `color: #fff` in a rule whose `background`
is `var(--pin)`, no `rgba(255,90,54`, `rgba(232,67,31`, `#FF5A36`, `#FF8A5B`, `#B8430F`, `#CF3A1A`, `#FFC857` anywhere in `public/*.css`
except inside `url("data:…")`, and that every `var(--focus, ` is gone from the two coin sheets.

**Must not change** (their intent is a frozen script or a shape): `map-labels.test.js` 223–226 (`--st-active` values), 247–256 (pill rule
texts); `profiles-ui.test.js` 381–385 (`--pf-*`); `wallet-tab.test.js` 111 (QR); `lp-launch-ui.test.js` 495 (`#B3261E`); `feedback-ui.test.js`
177/361; `live-buttons.test.js` 97–104, 182 (the comment); `build-parity.test.js`, `rebrand-review-fixes.test.js` (theme-color `#071426`);
`motion.test.js` all; `phone-dash.test.js` all (`0 0 0 4px var(--pin)` stays a token); `site.test.js` 82–84, 124; `mobile-polish.test.js`
everything but 210; `dashboard-design.test.js` everything but 122; `coinart*.test.js`.

## 12. The contrast table that must hold

Computed from the section 3 hexes with WCAG 2.x relative luminance (sRGB). Kinds: **T** text 4.5:1, **L** large text 3:1, **U** UI (borders,
icons, focus rings, chart lines, map marks) 3:1, **D** decoration (no bar; recorded so nobody promotes `--faint` to text). Surfaces that are
not tokens are composites: dark glass at rest `#09162B` = `rgba(10,24,46,.62)` over `#071426`, scrolled `#0A182D` (.88); light glass `#FCFDFE`
/ `#FEFEFF`; dark well `#15243B` = ink .04 over `--bg-2`; light well `#EEF2F7`; chip `rgba(7,20,38,.82)` over water `#071427`, light
`#FCFDFE`; pass teal corner `#0B6D80` = teal .38 over `--pass-a`, gold corner `#6C5D2E` = gold .42 over `--pass-b`; tints are the soft
alphas over `--bg`.

| kind | pair | dark | ratio | light | ratio |
|---|---|---|---|---|---|
| T | `--text` on `--bg` | `#EEF3FA` / `#071426` | 16.57 | `#0C2344` / `#F5F7FB` | 14.62 |
| T | `--text` on `--bg-3` | | 13.22 | | 13.83 |
| T | `--text-2` on `--bg` | `#C6D3E6` | 12.19 | `#2E4466` | 9.17 |
| T | `--text-2` on `--bg-3` | | 9.73 | | 8.68 |
| T | `--muted` on `--bg` | `#93A4BE` | 7.29 | `#52647A` | 5.65 |
| T | `--muted` on `--bg-2` (card) | | 6.81 | | 6.06 |
| T | `--muted` on `--bg-3` (tile) | | 5.82 | | 5.35 |
| T | `--muted` (kickers, captions) on the well | | 6.16 | | 5.39 |
| D | `--faint` on `--bg` | `#7A8CA8` | 5.40 | `#6C7D92` | 3.93 |
| T | `--pin-2` links on `--bg` | `#37E0CA` | 11.15 | `#006F67` | 5.64 |
| T | `--pin-2` on `--bg-2` | | 10.40 | | 6.05 |
| T | `--pin-2` on `--bg-3` | | 8.90 | | 5.34 |
| T | `--pin-2` on `--accent-soft` (live pill) | | 9.09 | | 5.02 |
| U | `--pin` mark on `--bg` | `#00CBB6` | 8.99 | `#0B7A70` | 4.86 |
| U | `--pin` current-tab icon on the tab bar | | 8.65 | | 5.17 |
| T | `--on-cta` on `--cta-a` (main button) | `#0C2344` / `#F2B51F` | 8.51 | `#F8C13A` / `#0C2344` | 9.47 |
| T | `--on-cta` on `--cta-b` | `/ #FFCF57` | 10.69 | `/ #16355E` | 7.44 |
| T | `--on-gold` on `--gold` (badges, discs, coin art, role pills) | `#0C2344` / `#F8C13A` | 9.47 | `/ #E5AA1C` | 7.54 |
| T | `--on-accent` on `--pin` (skip link) | `#06192E` / `#00CBB6` | 8.61 | `#FFFFFF` / `#0B7A70` | 5.21 |
| T | `--on-accent` on `--bad-text` (not-official icon) | `#06192E` / `#FF9A86` | 8.61 | `#FFFFFF` / `#C0392B` | 5.44 |
| T | `--on-accent` on `--ok-text` (done step, done tick) | `#06192E` / `#7CE8A6` | 11.76 | `#FFFFFF` / `#0C6F4F` | 6.17 |
| T | `--ok-text` on `--bg` / `--bg-3` / `--ok-soft` | `#7CE8A6` | 12.27 / 9.79 / 9.45 | `#0C6F4F` | 5.75 / 5.45 / 4.98 |
| T | `--bad-text` on `--bg` / `--bg-3` / `--bad-soft` | `#FF9A86` | 8.99 / 7.17 / 7.42 | `#C0392B` | 5.07 / 4.80 / 4.52 |
| T | `--gold-text` on `--bg` / `--bg-3` / `--gold-soft` | `#FFDC8A` | 13.94 / 11.13 / 10.67 | `#7A5200` | 6.45 / 6.11 / 5.97 |
| T | `--warn` on `--bg` / `--bg-3` / `--warn-soft` | `#FFD27A` | 12.97 / 10.36 / 10.06 | `#8A5F00` | 5.27 / 4.98 / 4.74 |
| T | `--blue` on `--bg` | `#6E9BFF` | 6.86 | `#2F63E0` | 4.92 |
| T | `--muted` on header glass at rest / scrolled | | 7.14 / 7.02 | | 5.96 / 6.02 |
| T | `--text-2` on header glass at rest | | 11.94 | | 9.66 |
| T | `--text` on header glass scrolled | | 15.94 | | 15.55 |
| L | `--grad-accent` stops 1 / 2 / 3 on `--bg` | `#FFD978 #F8C13A #E7A92A` | 13.59 / 11.15 / 8.89 | `#A87400 #8A5F00 #6E4B00` | 3.79 / 5.27 / 7.33 |
| L | `--grad-accent` stops 1 / 3 on `--bg-2` | | 12.67 / 8.29 | | 4.07 / 7.87 |
| U | `--field-line` on `--bg` / `--bg-2` / `--bg-3` / well | white .36 | 3.32 / 3.29 / 3.15 / 3.25 | navy .52 | 3.31 / 3.37 / 3.26 / 3.29 |
| U | focus ring `--pin-2` on `--bg` / `--bg-2` | | 11.15 / 10.40 | | 5.64 / 6.05 |
| T | white on the pass: teal corner / gold corner / `--pass-a` | `#FFFFFF` | 5.98 / 6.48 / 12.48 | same (navy pass in both themes) | 5.98 / 6.48 / 12.48 |
| U | `#7CE8A6` live dot on the pass's gold corner | | 4.30 | same | 4.30 |
| U | `--st-open` on water / land | `#7FA3D6` | 7.09 / 4.43 | `#3F67A6` | 4.46 / 5.67 |
| U | `--st-active` on land / water | `#2ED3B7` | 6.07 / 9.72 | `#0E7C63` | 5.14 / 4.05 |
| U | `--st-founded` on land / water | `#F8C13A` | 6.92 / 11.09 | `#A26F00` | 4.37 / 3.44 |
| U | `--st-choosing` on land / water | `#FFA94D` | 6.02 / 9.65 | `#B35A0A` | 4.79 / 3.77 |
| U | `--st-mine` on land / water | `#FFFFFF` | 11.46 / 18.36 | `#0C2344` | 15.68 / 12.34 |
| — | land vs water (informational) | `#1F3A60` / `#08142A` | 1.60 | `#FFFFFF` / `#D7E6F5` | 1.27 |
| T | `--st-open` as pill text on the chip / on `--bg-2` | | 7.13 / 6.66 | | 5.57 / 5.67 |
| U | `--up` / `--down` on `--bg-2` | `#34D399` / `#FF8C74` | 8.96 / 7.59 | `#1E9E78` / `#C0392B` | 3.38 / 5.44 |
| U | `--chart-1` / `--chart-2` on `--bg-2` | `#2BD9C3` / `#F8C13A` | 9.69 / 10.40 | `#0B7A70` / `#A26F00` | 5.21 / 4.37 |
| U | `--gold-ui` (tab pill's gold end) on the tab bar | `#F8C13A` | 10.73 | `#A26F00` | 4.33 |
| T | `.dv2 .dtab__badge` white on `--pin-2` (light) | — | — | `#FFFFFF` / `#006F67` | 6.05 |
| T | coin disc ink `--on-gold` at the disc's darkest stop `#D99A1A` | `#0C2344` | 6.41 | same | 6.41 |
| U | lockup gold `.dev` / wordmark / teal icon on header glass (images) | | 10.92 / 18.08 / 8.80 | | 1.63 / 15.39 / 2.02 (the lockup's own art) |
| — | `--st-active` hue vs open / choosing / founded (≥ 30°) | 170° vs 215° / 31° / 43° | 45° min | 166° vs 217° / 29° / 42° | 50° min |

Also held, unchanged from today: `#062A1F` on `#34D399` 8.04 (dpv sample coin), `#0C2344` on `#00CBB6` 8.61 and on `#F8C13A` 9.47 (the
legacy mark), `#fff` on `#B3261E` 6.5 (mainnet line), `#0B1626` on `#fff` (QR).

## 13. Residuals (JavaScript is frozen)

- `public/cities.js` hard-codes its canvas palette: hover fills, status label text colours (`foundedText #FFB39C/#C23A1C`, `choosingText
  #FFE3A3/#8A5A00`, `activeText #7CF0C5/#0E7C63`), eight area tints per theme, and the `--st-*` fallbacks of the *old* palette (used only if a
  token is missing; the tokens are all set). The founded label text `#FFB39C` is the old orange's tint on the new gold dot: visible only once a
  city is founded; a one-line JS change for a later PR.
- `public/coinchart.js` fallbacks (`#C9D2E0`, `#93A0B6`, `#F2552F`…) never render while `style.css` loads; `pillText #06101C` reads 9.9:1 or
  more on the new series colours (`#F8C13A` 11.5, `#34D399` 9.9, `#2BD9C3` 10.8).
- `public/swap.js` colours the "vicinity" pair mark `#FF5A36 → #FFC857` and a city mark `#5B8CFF`; under the Citycoin.dev brand the legacy
  token is shown nowhere.
- `public/site.js` preview banner `#7c3aed` (preview deployments only).
- `theme.js` sets the light `theme-color` `#F5F7FB` = the new light `--bg`; the dark one comes from the page (`#071426` = `--bg`).
- `public/brand/tokens.css` (Civic Atlas draft) stays unlinked; its coin-art values are frozen by `test/coinart-t2.test.js`.

## Appendix A. The display serif (Fraunces): deferred, with the recipe

One of three judges would add Fraunces for `h1`/`h2`/`.page-title` (the biggest "elite" lift in the renders); another says leave it out of
this PR. It is left out because it is not a theme change: `@fontsource-variable/fraunces` in `package.json`/lock, a row in
`scripts/copy-assets.mjs`, a `<link rel="preload">` in `build.mjs` `layout()`, a licence sentence on `/credits` (`scripts/pages/src/credits.html`
and `test/site.test.js:124`), `--serif` tokens, and `test/build-parity.test.js`'s SHA pin of the BRAND-unset build, which any default-build
byte moves. If the owner wants it after seeing design v5 live:

1. `npm install @fontsource-variable/fraunces@5.3.0` in a worktree of its own (never in the shared `node_modules`); add
   `["@fontsource-variable/fraunces", "fraunces-latin-wght-normal.woff2", "fraunces"]` to `copy-assets.mjs` (OFL licence copied to
   `public/fonts/LICENSE-fraunces.txt`).
2. `build.mjs`: preload **only for the Citycoin.dev look** (`look ? '<link rel="preload" href="/fonts/fraunces.woff2" …>' : ""`), so the
   default build stays byte-identical and the SHA pin holds; a brand-conditional licence line on `/credits` the same way, with
   `test/site.test.js:124` and `test/build-parity.test.js` 327–340 extended for the citycoin build.
3. `style.css`: `@font-face` for Fraunces (variable, `font-optical-sizing: auto`), `--serif`, and `h1, h2, .page-title, .hero4__title,
   .lp4-hero__title { font-family: var(--serif); font-weight: 500; letter-spacing: -.025em; }` behind `:root[data-brand="citycoin"]`. Keep Space
   Grotesk for `h3`, numbers, tabs, card titles and the coin art.
4. Re-render the 64 shots; update `docs/DESIGN-V5.md` and the implementation report.

## Appendix B. Changed-assertion log (builders fill this in)

One row per assertion actually changed, copied from section 11 when it lands, with the commit hash. The review reads this table and the
implementation report's section 11 together.

| commit | test : line | before | after | why |
|---|---|---|---|---|
| stage A | `contrast.test.js` 17–20 (main buttons) | white `#FFFFFF` on every `--cta-a`/`--cta-b` ≥ 4.5 | per theme block, `--on-cta` of that block on that block's `--cta-a`/`--cta-b` ≥ 4.5 (8.5 / 10.7 dark, 9.5 / 7.4 light); the block is split at `:root[data-theme="light"] {` like the other tests | the main button is gold with navy text in dark and navy with gold text in light; the WCAG threshold is unchanged |
| stage A | `contrast.test.js` 23–25 | `color: #fff;` in `.btn--primary`, `.contract__buy`, `.su-tab[aria-pressed="true"]` | `color: var(--on-cta);` in all three, plus a guard that no main button keeps `color: #fff` | same |
| stage A | `contrast.test.js` 36–37 (headline stops) | light on `#F4F6FA`, `#FFFFFF`; dark on `#060C17`, `#0A1322` | light on `#F5F7FB`, `#FFFFFF`; dark on `#071426`, `#0B1B33` | the new `--bg` / `--bg-2`; 3:1 for large text unchanged |
| stage A | `contrast.test.js` 55 (`--muted` surfaces) | dark `#1B212A #141A24 #060C17`, light `#F3F5F6 #FFFFFF #F4F6FA` | dark `#10284A #0B1B33 #071426`, light `#EDF1F7 #FFFFFF #F5F7FB` | tile, card and page of the new palette; 4.5:1 unchanged |
| stage A | `contrast.test.js` 90–91 (field line) | dark over `#060C17 #0A1322 #0F1C31`; light ink `[11,22,38]` over `#F4F6FA #FFFFFF #EEF2F7` | dark over `#071426 #0B1B33 #10284A`; light ink `[12,35,68]` over `#F5F7FB #FFFFFF #EEF2F7` | new surfaces, the brand navy as the light ink; 3:1 unchanged |
| stage A | `mobile-polish.test.js` 210 | light `--pin-2` ≥ 4.5 on `#FFFFFF #F4F6FA #EEF2F7` | on `#FFFFFF #F5F7FB #EEF2F7` | the new light page colour (passes either way; accuracy) |
| stage A | `map-labels.test.js` 213 | dark `--st-active` ≥ 3 on `#1b2e4d #0B1A2E #10203a #060c16` | on `#1F3A60 #08142A #10284A #071426` | the new land, water and the two ends of `--map-bg` |
| stage A | `map-labels.test.js` 215 | `--map-land: #1b2e4d; --map-land-line`, `--map-water: #0B1A2E;` | `--map-land: #1F3A60; --map-land-line`, `--map-water: #08142A;` (light lines unchanged) | coastline figure/ground 1.28 → 1.6 |
| stage A | `map-labels.test.js` 218 | others dark `#7FA3D6 #FFC857 #FF5A36`, light `#3F67A6 #B57F00 #E8431F` | dark `#7FA3D6 #FFA94D #F8C13A`, light `#3F67A6 #B35A0A #A26F00` | the new open / choosing / founded colours; the 30° hue rule unchanged |
| stage A | `map-labels.test.js` 228 | `#7FA3D6` on `#0B1A2E` ≥ 4.5 | `#7FA3D6` on `#08142A` ≥ 4.5 (7.1) | the new water |
| stage A | `map-overview.test.js` 476 | `--st-choosing: #FFC857`, `--st-founded: #FF5A36`, `--st-mine: #FFC857`, `--chip-bg: rgba(7,14,25,.82)` | `--st-choosing: #FFA94D`, `--st-founded: #F8C13A`, `--st-mine: #FFFFFF`, `--chip-bg: rgba(7,20,38,.82)` | founded is the coin's gold, choosing amber, yours the ink; the chip on the new canvas |
| stage A | `token-card.test.js` 88 | `.contract__buy` `color: #fff` | `color: var(--on-cta)` | navy on the gold Buy |
| stage A | `token-card.test.js` 94 | light `.contract` `border-color: rgba(232,67,31,.22)` | `rgba(var(--accent-rgb),.22)` | the tint reads the token |
| stage A | `token-tabs.test.js` 62 | `/--bad-soft: rgba\([^)]+\);/g` counted twice | `/--bad-soft: rgba\((?:[^()]\|\([^()]*\))+\);/g` counted twice | the value now nests one `var(--bad-rgb)`; the intent (defined once per theme) is unchanged |
| stage A | `launchpad-ui.test.js` 491 | `.lp-bar::-webkit-progress-value { background: linear-gradient(90deg, #FF5A36, #FFC857);` | `… linear-gradient(90deg, var(--pin), var(--gold-ui));` | teal to gold, from tokens |
| stage A | `launchpad-ui.test.js` 492 | `:root[data-theme="light"] { --up: #1E9E78; --down: #E8431F;` | `… --down: #C0392B;` | the old accent is not a status colour; `--down` = light `--bad-text` |
| stage A | `d3-fix.test.js` 55 | light `.m-coin circle { fill: #FFC857; stroke: #B9780F; stroke-width: 2.5; }` / `.m-coin text { fill: #3F2702; }` | `{ fill: var(--gold); stroke: var(--gold-ui); stroke-width: 2.5; }` / `{ fill: var(--on-gold); }` | the home coin reads the tokens (navy on the light gold 7.5:1) |
| stage A | `d3-fix.test.js` 64 | `.section--glow … rgba(255,90,54,.075)` | `rgba(var(--accent-rgb),.075)` | the tint reads the token |

Stage A (`public/style.css`, `public/polish.css`, `public/feedback.css`; `public/brand/citycoin.css`, `public/theme.js` and
`scripts/pages/build.mjs` unchanged because the Citycoin.dev `theme-color` `#071426` already equals the new `--bg`) also departs from the
section 6 text in three small places, each a value choice inside owner A's files: `::placeholder` reads `var(--muted)` (4.5:1 or more on
every well in both themes) rather than `--faint`, so a hint is never under AA; `.pct-bar`, `.launch-progress` and `.role-meter.is-bad`
fills are one colour (`--pin`, `--pin`, `--bad-text`) as section 6.10 says, while `.lp-bar` keeps the teal-to-gold hairline; `.verified-badge`
is a flat `--ok-text` disc with a white inset highlight and `--on-accent` ink (a mint-to-green gradient would put white text on a light
corner in the light theme). The `.dpv` preview pass, the dashboard strip, `onboard.css`, `swap.css` and every page sheet are the next owners'
(B, C, D): until they land, those still show the old orange and purple.
