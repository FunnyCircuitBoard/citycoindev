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
Appendix C. What shipped (stage C, the integration)
Appendix D. Fix round 1 (the review of 1 Nov 2026)
Appendix E. Fix round 2 (the re-review of 1 Nov 2026)

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
   headline dilutes "teal = interactive"): dark `#FFD978 → #F8C13A → #E7A92A`; light a deeper gold `#A87400 → #946500 → #8A5F00` (3.8:1 or
   more on paper, large text only; fix round 1 dropped the brown end `#6E4B00`, which read muddy). Three stops are kept because `test/contrast.test.js` pins the format.
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
  /* --pin: the teal of marks, fills and live dots; --pin-2: the teal of links and accent text (11:1 on the page); --gold: the coin's gold for
     fills (the main action, rank, the coin); --gold-ui: the gold for thin marks that must read 3:1 (the progress bars' gold end, the light
     coin's rim); --blue: the informational blue (notices, map areas, the provisional state); the rest are status colours (8:1 or more as text) */
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
  --glass-border: rgba(var(--ink),.10); --glass-hi: inset 0 1px 0 rgba(var(--ink),.08); --glass-blur: saturate(1.5) blur(18px);
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
  --pass-a: #12345F; --pass-b: #071426; --pass-glow-1: rgba(0,203,182,.38); --pass-glow-2: rgba(255,205,96,.46); --pass-line: rgba(255,255,255,.14);
  --pass-ok-rgb: 52,211,153; --pass-bad-rgb: 255,154,134; --pass-blue-rgb: 110,155,255; --pass-gold-rgb: 248,193,58; /* the founder card's state corners, theme-independent like the pass */
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
  --text: #0C2344; --text-2: #2E4466; --muted: #4E6076; --faint: #6C7D92; /* --muted one step deeper than the draft's #52647A: 4.8:1 on a well inside a dashboard card */
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
  --grad-accent: linear-gradient(100deg, #A87400 0%, #946500 50%, #8A5F00 100%); /* the coin's gold deepened so it reads on paper, kept in the gold family: 3.8 / 4.7 / 5.3:1 on #F5F7FB */
  --grad-ring: conic-gradient(from var(--ring-a, 0deg), transparent 0 55%, rgba(55,224,202,.95) 70%, rgba(248,193,58,.85) 78%, transparent 90%); /* the teal-and-gold arc on the navy button; the dark block's ring is a white-into-gold sheen on the gold button */
  --grad-glow: radial-gradient(50% 42% at 28% 0%, rgba(0,203,182,.07), transparent 70%), radial-gradient(44% 38% at 78% 0%, rgba(248,193,58,.06), transparent 70%);
  --grad-aurora: linear-gradient(90deg, transparent, rgba(11,122,112,.45) 35%, rgba(162,111,0,.55) 65%, transparent);
  --e1: 0 1px 2px rgba(12,35,68,.06), 0 0 0 1px rgba(12,35,68,.03);
  --e2: 0 1px 2px rgba(12,35,68,.06), 0 12px 32px -14px rgba(12,35,68,.22);
  --e3: 0 28px 72px -28px rgba(12,35,68,.3);
  --glow-cta: 0 8px 22px -12px rgba(12,35,68,.45), inset 0 1px 0 rgba(255,255,255,.12);
  --glow-cta-hover: 0 12px 30px -10px rgba(12,35,68,.55), 0 0 0 1px rgba(12,35,68,.55), inset 0 1px 0 rgba(255,255,255,.16);
  --cta-halo: 0 0 26px 0 rgba(12,35,68,.16);
  --chart-1: #0B7A70; --chart-2: #16355E; --chart-grid: rgba(12,35,68,.08); /* series 2 is each theme's own fill: gold on the night canvas, the brand navy (ink bars) on paper */
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
  --shadow-1: var(--e1);   /* --shadow-2 was removed in fix round 1: nothing read it any more (its four readers take --e3) */
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
| `style.css` profiles block | `--pf-0..7`, `--pf-x` | fix round 1: on the brand (dark `#f8c13a #2bd9c3 #7fa3d6 #ff9a86 #6fcf7e #a78bfa #b3d15a #f28cb4`, light `#a26f00 #0b7a70 #3f67a6 #c0392b #2e8b4e #6a4fd8 #657f14 #b5306c`, `--pf-x` = `--faint`): slot 0 the coin's gold, 1 teal, 2 steel blue, 3 coral, 4 green, 5 violet, 6 lime, 7 rose; each 3:1 or more on the page and on a card, every pair 32° or more apart (pin updated, `test/design-v5.test.js` checks the numbers) |
| `style.css` `[data-color]` coin palettes | gold default `--c1/--c2/--c3` = `#FFE9A8 / #F8C13A / #D99A1A`; rose, ocean, emerald, violet, ink as today | the gold family follows the brand gold; the five others are the member's own choices |
| `pages-launchpad.css` / `pages-coin.css` / `swap.css` | `.lp-ava` / `.swap__mark--ava` defaults `--c2: #F8C13A; --c3: #D99A1A`, ink `var(--on-gold)`; on these small discs the five city colours' light stop a step deeper (`ocean #2D6BD6`, `emerald #138463`, `rose #CF3366`, `violet #7A5CE6`, `ink #56657D`: white initials 4.5:1 or more; fix rounds 1 and 2) | the `.lp-ava` block stays byte-identical in the two page sheets; `swap.css` carries the same five stops (asserted equal) |
| `polish.css` | `--tabbar-h: 64px; --bottom-bars: 0px` | unchanged (pinned) |
| `polish-dash.css` | `--dd-*` aliases | values follow the shared tokens; names unchanged |
| `public/brand/tokens.css` | unchanged | the coin-art palette (`--cc-*`) is frozen by `test/coinart-t2.test.js`; nobody links this file |

### 3.5 New names, and one rename

New: `--gold-ui`, `--on-cta`, `--on-gold`, `--on-accent`, `--accent-rgb`, `--accent-2-rgb`, `--gold-rgb`, `--ok-rgb`, `--bad-rgb`, `--warn-rgb`,
`--blue-rgb`, `--focus-ring`, `--scrim`, `--grad-aurora`, `--pass-a`, `--pass-b`, `--pass-glow-1`, `--pass-glow-2`, `--pass-line`; fix round 1 added
`--pass-ok-rgb`, `--pass-bad-rgb`, `--pass-blue-rgb`, `--pass-gold-rgb` (the founder card's state corners, theme-independent like the pass),
gave `--grad-ring` a value per theme (a sheen on the gold button in dark, the teal-and-gold arc on the navy button in light) and removed the
unread `--shadow-2`.

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
  `saturate(1.5) blur(18px)` (main's radius: fix round 1 took back the 20 px, imperceptible behind the fill and dearer to paint). Only the
  header, tab bar, toast, terms note, map controls, coin mini-bar and sheets are glass. The phone tab
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
`var(--pin)` (pinned). `.tabbar__ind` (20 × 4 px, pinned geometry): `background: var(--pin);` — one colour (fix round 1: at that size the
teal-to-gold gradient read as a mis-registered mark, half teal, half yellow). Tap bounce unchanged (`--ease-spring`).

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
.btn[disabled], .btn.is-busy { opacity: .6; cursor: progress; transform: none; }   /* unchanged: a disabled main button, working or not, is the gold at 60 % */
#cr-use[disabled] { opacity: 1; background: var(--card-2); color: var(--muted); border-color: var(--line-2); box-shadow: none; }
/* the quiet well, opted in by selector only where the page knows the button cannot be used yet (the coin studio's "Use this coin"; the app
   mock's .pm-btn--primary.is-off in app-phone.css). No generic well on [disabled]: the scripts disable a WORKING button with .is-busy,
   aria-busy, data-busy or no marker at all, so it would read as "cannot" mid-action (fix round 2, FR-1-R1) */
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

Series 1 teal `--chart-1`, series 2 each theme's own fill `--chart-2` (gold in dark; light the brand navy `#16355E`, 12.3:1, ink bars on paper:
fix round 1 replaced the bronze `#A26F00`, thirty brown bars on a white card), grid `--chart-grid`, axis text `--chart-axis` (= `--muted`);
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

White text keeps 6.0:1 on the teal corner and 5.4:1 on the gold corner (section 12; fix round 1 made the gold corner a small warm glint,
`radial-gradient(60% 80% at 100% 100%, …, transparent 62%)` of `rgba(255,205,96,.46)`, instead of the wide `.42` wash that mixed to khaki).
The founder card `.dv2 .card.fcard` uses the same `--pass-*` base; its states read the theme-independent `--pass-*-rgb` triplets (fix round 1;
the card is navy in both themes): default gold light `rgba(var(--pass-gold-rgb),.32)`, `steward` mint `rgba(var(--pass-ok-rgb),.4)`,
`provisional` blue `rgba(var(--pass-blue-rgb),.5)`, `grace` coral `rgba(var(--pass-bad-rgb),.4)`; its kicker and `.fcard__pick` `var(--gold-text)`, its tags the section 6.8
tints with the pass's white alphas. The dashboard preview `.dpv__pass` reads the same tokens (its green sample coin becomes `#34D399` with
ink `#062A1F`, 8.0:1; pin updated); the profile pass `.prof-pass` tones the glows to `.28`/`.3`. Nothing in this family changes in light:
"one object in two materials".

### 6.17 Coin discs and avatars (`style.css` `.coin-disc`, `[data-color]`, `.coin-art`, `.swatch`, `.token-chip__dot`, `.pair-opt__icon`,
`.idcard__avatar`, `.contract__icon`; `pages-launchpad.css`/`pages-coin.css` `.lp-ava`; `swap.css` `.swap__mark`; `onboard.css`; `polish.css`)

`.coin-disc`: `radial-gradient(circle at 32% 28%, #FFE9A8, var(--gold) 45%, #D99A1A 100%)`, rim `rgba(255,236,190,.8)`, shadow
`0 10px 24px -8px rgba(var(--gold-rgb),.55)`, ink `var(--on-gold)` (navy 6.4:1 at the darkest end). `.lp-ava`/`.swap__mark--ava` gold default
`--c2: #F8C13A; --c3: #D99A1A`, ink `var(--on-gold)`, and the five city colours' light stop deeper on both (section 3.4 row); `.lp-ava[data-kind="vicinity"] { color: #0C2344; background: linear-gradient(135deg,
#00CBB6, #F8C13A); }` (the legacy token's own mark; literal in both themes, pin updated; the block stays byte-identical in both sheets).
`.idcard__avatar`, `.link-in__avatar`, `.welcome__disc`: `var(--gold)` + `var(--on-gold)` (was pin → gold). `.pm-coin--vic` (`app-phone.css`)
the same literal pair as `.lp-ava[data-kind="vicinity"]`; `.pm-coin--city` `rgba(var(--blue-rgb),.16)`.

### 6.18 Empty states, folds, icons (`style.css` 355–371, 362–367, 1333)

`.empty` a resting card (`--line` solid, `--surface-1`, `--e1`; fix round 1: the dashed frame read as a wireframe, and dashes mean a drop
target on the dashboard), `--muted`, title `--text`; the same for `.empty-feed`, the coin page's "nothing recorded yet" chart state and the
console's `.chart__empty`; `.fold` `--line` top, `+`/`−` in `var(--pin-2)` (interactive); `.ico--ok` `--ok-text`,
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
| `/` (`pages-home.css` `.hero4`) | "One city." in `.text-ink` (`--grad-ink`), "One coin." in `.accent` (the coin's gold; a deeper gold in light); lead `--text-2` ≤ 34ch; two 56 px buttons: `.btn--primary.btn--lg` (Find your city) + `.btn--glass.btn--lg`; the live-numbers bar `.tk__*` on `--card` with an ok live dot; `hero4Rise .4s` unchanged |
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

Worktree: a scratch worktree of branch `cc/design-premium` outside the repository, `node_modules` a symlink (keep it; never `npm install`
there). Each parallel owner takes a detached scratch worktree of the same branch and merges back in
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
| `token-tabs.test.js` 62 | `/--bad-soft: rgba\([^)]+\);/g` counted twice | `/--bad-soft: rgba\((?:[^()]\|\([^()]*\))+\);/g` counted twice | the value nests one `var(--bad-rgb)`; the intent (defined once per theme) is unchanged |
| `profiles-ui.test.js` 381–382 (fix round 1) | dark `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767`, light `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #4a3aa7 #e34948` | dark `#f8c13a #2bd9c3 #7fa3d6 #ff9a86 #6fcf7e #a78bfa #b3d15a #f28cb4`, light `#a26f00 #0b7a70 #3f67a6 #c0392b #2e8b4e #6a4fd8 #657f14 #b5306c` | the ring on the brand (V1); the slot rules at 383–385 unchanged; `test/design-v5.test.js` now checks 3:1 on the page and the card and 30° between every pair |
| `d3-fix.test.js` 56 (fix round 1) | the light `.m-coin circle` rule followed by `:root[data-theme="light"] .m-coin text { fill: var(--on-gold); }` | the base `.m-coin text { … fill: var(--on-gold); }`, the light circle rule alone, and `doesNotMatch` the light text rule | the light restatement repeated the base rule exactly (Q3) |
| `v4-review.test.js` 138 (fix round 1) | `:root[data-theme="light"] #cities .city-status { color: var(--ok-text); }` | the base `#cities .city-status { … color: var(--ok-text);` and `doesNotMatch` the light rule | same (Q3) |
| `mobile-polish.test.js` 262 (fix round 1) | `--shadow-2` in the list of scale tokens that must exist | removed from the list | the alias had no reader left (Q2) |
| `design-pages.test.js` 145 (fix round 1, comment only) | "8.6:1 at the teal end" | "7.6:1 at the teal end" | the recorded figure was `--on-accent`'s (H1); the assertion is unchanged |

**New:** `test/design-v5.test.js` — reads `public/style.css` (both token blocks, `--st-*`, `--up/--down`) and `public/polish-map.css`
(`--st-active`), composites the glass, well, chip and pass surfaces exactly as section 12's "surfaces" rows say, and asserts every row of
section 12 at its threshold (T 4.5, L 3, U 3, D none). It also asserts the token *discipline*: no `color: #fff` in a rule whose `background`
is `var(--pin)`, no `rgba(255,90,54`, `rgba(232,67,31`, `#FF5A36`, `#FF8A5B`, `#B8430F`, `#CF3A1A`, `#FFC857` anywhere in `public/*.css`
except inside `url("data:…")`, and that every `var(--focus, ` is gone from the two coin sheets.

**Must not change** (their intent is a frozen script or a shape): `map-labels.test.js` 223–226 (`--st-active` values), 247–256 (pill rule
texts); `profiles-ui.test.js` 383–385 (the `--pf-*` slot rules; the values at 381–382 moved onto the brand in fix round 1, Appendix B); `wallet-tab.test.js` 111 (QR); `lp-launch-ui.test.js` 495 (`#B3261E`); `feedback-ui.test.js`
177/361; `live-buttons.test.js` 97–104, 182 (the comment); `build-parity.test.js`, `rebrand-review-fixes.test.js` (theme-color `#071426`);
`motion.test.js` all; `phone-dash.test.js` all (`0 0 0 4px var(--pin)` stays a token); `site.test.js` 82–84, 124; `mobile-polish.test.js`
everything but 210; `dashboard-design.test.js` everything but 122; `coinart*.test.js`.

## 12. The contrast table that must hold

Computed from the section 3 hexes with WCAG 2.x relative luminance (sRGB). Kinds: **T** text 4.5:1, **L** large text 3:1, **U** UI (borders,
icons, focus rings, chart lines, map marks) 3:1, **D** decoration (no bar; recorded so nobody promotes `--faint` to text). Surfaces that are
not tokens are composites: dark glass at rest `#09162B` = `rgba(10,24,46,.62)` over `#071426`, scrolled `#0A182D` (.88); light glass `#FCFDFE`
/ `#FEFEFF`; dark well `#15243B` = ink .04 over `--bg-2`; light well `#EEF2F7`; chip `rgba(7,20,38,.82)` over water `#071427`, light
`#FCFDFE`; pass teal corner `#0B6D80` = teal .38 over `--pass-a`, gold corner `#796941` = the glint `rgba(255,205,96,.46)` over `--pass-b`; tints are the soft
alphas over `--bg`.

| kind | pair | dark | ratio | light | ratio |
|---|---|---|---|---|---|
| T | `--text` on `--bg` | `#EEF3FA` / `#071426` | 16.57 | `#0C2344` / `#F5F7FB` | 14.62 |
| T | `--text` on `--bg-3` | | 13.22 | | 13.83 |
| T | `--text-2` on `--bg` | `#C6D3E6` | 12.19 | `#2E4466` | 9.17 |
| T | `--text-2` on `--bg-3` | | 9.73 | | 8.68 |
| T | `--muted` on `--bg` | `#93A4BE` | 7.29 | `#4E6076` | 6.01 |
| T | `--muted` on `--bg-2` (card) | | 6.81 | | 6.44 |
| T | `--muted` on `--bg-3` (tile) | | 5.82 | | 5.69 |
| T | `--muted` (kickers, captions) on the well | | 6.16 | | 5.73 |
| T | `--muted` on a well inside a dashboard card (`--card-2` over the card's top stop over the page: light `#DADEE6`) | | 6.3 | | 4.78 (rendered 4.77–4.78; was 4.49 with `#52647A`) |
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
| T | `--muted` on header glass at rest / scrolled | | 7.14 / 7.02 | | 6.33 / 6.39 |
| T | `--text-2` on header glass at rest | | 11.94 | | 9.66 |
| T | `--text` on header glass scrolled | | 15.94 | | 15.55 |
| L | `--grad-accent` stops 1 / 2 / 3 on `--bg` | `#FFD978 #F8C13A #E7A92A` | 13.59 / 11.15 / 8.89 | `#A87400 #946500 #8A5F00` | 3.79 / 4.75 / 5.27 |
| L | `--grad-accent` stops 1 / 3 on `--bg-2` | | 12.67 / 8.29 | | 4.07 / 5.65 |
| U | `--field-line` on `--bg` / `--bg-2` / `--bg-3` / well | white .36 | 3.32 / 3.29 / 3.15 / 3.25 | navy .52 | 3.31 / 3.37 / 3.26 / 3.29 |
| U | focus ring `--pin-2` on `--bg` / `--bg-2` | | 11.15 / 10.40 | | 5.64 / 6.05 |
| T | white on the pass: teal corner / gold corner / `--pass-a` | `#FFFFFF` | 5.98 / 5.37 / 12.48 | same (navy pass in both themes) | 5.98 / 5.37 / 12.48 |
| U | `#7CE8A6` live dot on the pass's gold corner | | 3.57 | same | 3.57 |
| U | `--st-open` on water / land | `#7FA3D6` | 7.09 / 4.43 | `#3F67A6` | 4.46 / 5.67 |
| U | `--st-active` on land / water | `#2ED3B7` | 6.07 / 9.72 | `#0E7C63` | 5.14 / 4.05 |
| U | `--st-founded` on land / water | `#F8C13A` | 6.92 / 11.09 | `#A26F00` | 4.37 / 3.44 |
| U | `--st-choosing` on land / water | `#FFA94D` | 6.02 / 9.65 | `#B35A0A` | 4.79 / 3.77 |
| U | `--st-mine` on land / water | `#FFFFFF` | 11.46 / 18.36 | `#0C2344` | 15.68 / 12.34 |
| — | land vs water (informational) | `#1F3A60` / `#08142A` | 1.60 | `#FFFFFF` / `#D7E6F5` | 1.27 |
| T | `--st-open` as pill text on the chip / on `--bg-2` | | 7.13 / 6.66 | | 5.57 / 5.67 |
| U | `--up` / `--down` on `--bg-2` | `#34D399` / `#FF8C74` | 8.96 / 7.59 | `#1E9E78` / `#C0392B` | 3.38 / 5.44 |
| U | `--chart-1` / `--chart-2` on `--bg-2` | `#2BD9C3` / `#F8C13A` | 9.69 / 10.40 | `#0B7A70` / `#16355E` | 5.21 / 12.32 |
| U | `--gold-ui` (the progress bars' gold end) on `--bg-2` | `#F8C13A` | 10.40 | `#A26F00` | 4.37 |
| U | `--pf-0` … `--pf-7` (the portfolio ring) on `--bg` / `--bg-2`, and the pairs' hue gap | gold, teal, steel, coral, green, violet, lime, rose | 6.79+ / 6.33+; 32° or more | `#A26F00 #0B7A70 #3F67A6 #C0392B #2E8B4E #6A4FD8 #657F14 #B5306C` | 3.98+ / 4.27+; 32° or more |
| T | `.dv2 .dtab__badge` white on `--pin-2` (light) | — | — | `#FFFFFF` / `#006F67` | 6.05 |
| T | coin disc ink `--on-gold` at the disc's darkest stop `#D99A1A` | `#0C2344` | 6.41 | same | 6.41 |
| U | lockup gold `.dev` / wordmark / teal icon on header glass (images) | | 10.92 / 18.08 / 8.80 | | 1.63 / 15.39 / 2.02 (the lockup's own art) |
| — | `--st-active` hue vs open / choosing / founded (≥ 30°) | 170° vs 215° / 31° / 43° | 45° min | 166° vs 217° / 29° / 42° | 50° min |

Also held, unchanged from today: `#062A1F` on `#34D399` 8.04 (dpv sample coin), `#0C2344` on `#00CBB6` 7.63 and on `#F8C13A` 9.47 (the
legacy mark; 8.61 is `--on-accent` `#06192E` on the teal, the skip link's pair), `#fff` on `#B3261E` 6.5 (mainnet line), `#0B1626` on `#fff` (QR).

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
| ae4054e | `contrast.test.js` 17–20 (main buttons) | white `#FFFFFF` on every `--cta-a`/`--cta-b` ≥ 4.5 | per theme block, `--on-cta` of that block on that block's `--cta-a`/`--cta-b` ≥ 4.5 (8.5 / 10.7 dark, 9.5 / 7.4 light); the block is split at `:root[data-theme="light"] {` like the other tests | the main button is gold with navy text in dark and navy with gold text in light; the WCAG threshold is unchanged |
| ae4054e | `contrast.test.js` 23–25 | `color: #fff;` in `.btn--primary`, `.contract__buy`, `.su-tab[aria-pressed="true"]` | `color: var(--on-cta);` in all three, plus a guard that no main button keeps `color: #fff` | same |
| ae4054e | `contrast.test.js` 36–37 (headline stops) | light on `#F4F6FA`, `#FFFFFF`; dark on `#060C17`, `#0A1322` | light on `#F5F7FB`, `#FFFFFF`; dark on `#071426`, `#0B1B33` | the new `--bg` / `--bg-2`; 3:1 for large text unchanged |
| ae4054e | `contrast.test.js` 55 (`--muted` surfaces) | dark `#1B212A #141A24 #060C17`, light `#F3F5F6 #FFFFFF #F4F6FA` | dark `#10284A #0B1B33 #071426`, light `#EDF1F7 #FFFFFF #F5F7FB` | tile, card and page of the new palette; 4.5:1 unchanged |
| ae4054e | `contrast.test.js` 90–91 (field line) | dark over `#060C17 #0A1322 #0F1C31`; light ink `[11,22,38]` over `#F4F6FA #FFFFFF #EEF2F7` | dark over `#071426 #0B1B33 #10284A`; light ink `[12,35,68]` over `#F5F7FB #FFFFFF #EEF2F7` | new surfaces, the brand navy as the light ink; 3:1 unchanged |
| ae4054e | `mobile-polish.test.js` 210 | light `--pin-2` ≥ 4.5 on `#FFFFFF #F4F6FA #EEF2F7` | on `#FFFFFF #F5F7FB #EEF2F7` | the new light page colour (passes either way; accuracy) |
| ae4054e | `map-labels.test.js` 213 | dark `--st-active` ≥ 3 on `#1b2e4d #0B1A2E #10203a #060c16` | on `#1F3A60 #08142A #10284A #071426` | the new land, water and the two ends of `--map-bg` |
| ae4054e | `map-labels.test.js` 215 | `--map-land: #1b2e4d; --map-land-line`, `--map-water: #0B1A2E;` | `--map-land: #1F3A60; --map-land-line`, `--map-water: #08142A;` (light lines unchanged) | coastline figure/ground 1.28 → 1.6 |
| ae4054e | `map-labels.test.js` 218 | others dark `#7FA3D6 #FFC857 #FF5A36`, light `#3F67A6 #B57F00 #E8431F` | dark `#7FA3D6 #FFA94D #F8C13A`, light `#3F67A6 #B35A0A #A26F00` | the new open / choosing / founded colours; the 30° hue rule unchanged |
| ae4054e | `map-labels.test.js` 228 | `#7FA3D6` on `#0B1A2E` ≥ 4.5 | `#7FA3D6` on `#08142A` ≥ 4.5 (7.1) | the new water |
| ae4054e | `map-overview.test.js` 476 | `--st-choosing: #FFC857`, `--st-founded: #FF5A36`, `--st-mine: #FFC857`, `--chip-bg: rgba(7,14,25,.82)` | `--st-choosing: #FFA94D`, `--st-founded: #F8C13A`, `--st-mine: #FFFFFF`, `--chip-bg: rgba(7,20,38,.82)` | founded is the coin's gold, choosing amber, yours the ink; the chip on the new canvas |
| ae4054e | `token-card.test.js` 88 | `.contract__buy` `color: #fff` | `color: var(--on-cta)` | navy on the gold Buy |
| ae4054e | `token-card.test.js` 94 | light `.contract` `border-color: rgba(232,67,31,.22)` | `rgba(var(--accent-rgb),.22)` | the tint reads the token |
| ae4054e | `token-tabs.test.js` 62 | `/--bad-soft: rgba\([^)]+\);/g` counted twice | `/--bad-soft: rgba\((?:[^()]\|\([^()]*\))+\);/g` counted twice | the value now nests one `var(--bad-rgb)`; the intent (defined once per theme) is unchanged |
| ae4054e | `launchpad-ui.test.js` 491 | `.lp-bar::-webkit-progress-value { background: linear-gradient(90deg, #FF5A36, #FFC857);` | `… linear-gradient(90deg, var(--pin), var(--gold-ui));` | teal to gold, from tokens |
| ae4054e | `launchpad-ui.test.js` 492 | `:root[data-theme="light"] { --up: #1E9E78; --down: #E8431F;` | `… --down: #C0392B;` | the old accent is not a status colour; `--down` = light `--bad-text` |
| ae4054e | `d3-fix.test.js` 55 | light `.m-coin circle { fill: #FFC857; stroke: #B9780F; stroke-width: 2.5; }` / `.m-coin text { fill: #3F2702; }` | `{ fill: var(--gold); stroke: var(--gold-ui); stroke-width: 2.5; }` / `{ fill: var(--on-gold); }` | the home coin reads the tokens (navy on the light gold 7.5:1) |
| ae4054e | `d3-fix.test.js` 64 | `.section--glow … rgba(255,90,54,.075)` | `rgba(var(--accent-rgb),.075)` | the tint reads the token |
| d67eb33 (B2) | `v4-review.test.js` 137 | `:root[data-theme="light"] #cities .city-status { color: #0C6B4E; }` | `{ color: var(--ok-text); }` | the status pill reads the token (light `#0C6F4F`, 5.2:1 on its tint over the page, 5.5:1 over a card); the AA intent is unchanged |
| d67eb33 (B1) | `design-pages.test.js` 145 | `.lp-ava[data-kind="vicinity"] { color: #fff; background: linear-gradient(135deg, #FF5A36, #FFC857); }` | `{ color: #0C2344; background: linear-gradient(135deg, #00CBB6, #F8C13A); }` | the legacy mark keeps its own two colours, now the emblem's teal into the coin's gold, with navy ink (8.6:1 at the teal end, 9.5:1 at the gold end); the block stays byte-identical in `pages-launchpad.css` and `pages-coin.css` (the equality assertion is unchanged) |
| d67eb33 (B1) | `v4-review.test.js` 99 | `.btn--soft { background: rgba(255,90,54,.15); border-color: rgba(255,110,70,.62); color: var(--pin-2); font-weight: 700; }` | `.btn--soft { background: rgba(var(--accent-rgb),.15); border-color: rgba(var(--accent-rgb),.62); color: var(--pin-2); font-weight: 700; }` | the Buy tint reads the accent triplet (teal), one rule for both themes; the two light-theme overrides are deleted |
| d67eb33 (B1) | `token-tabs.test.js` 61 | `.trade__side.is-sell { color: var(--bad-text); background: var(--bad-soft, rgba(255,90,54,.1)); }` | `… var(--bad-soft, rgba(255,154,134,.12)); }` | the fallback is the new dark coral tint; the rule still reads the token first |
| d67eb33 (B3) | `dashboard-tabs.test.js` 119 | light `.dtabs__ind::after` `rgba(207,58,26,0), #CF3A1A 25%, #CF3A1A 75%, rgba(207,58,26,0)` | `rgba(0,111,103,0), #006F67 25%, #006F67 75%, rgba(0,111,103,0)` (its glow `rgba(0,111,103,.4)`) | the light `--pin-2`, a shade deeper than `--pin`, so the chosen tab's line keeps 3:1 against the pill at its faintest breath; the intent (a 3:1 mark, WCAG 1.4.11) is unchanged |
| d67eb33 (B3) | `dashboard-design.test.js` 122 | `.dv2 .pass .live-dot, .dv2 .pass .live-dot::after { background: #7CF0C5; }` | `{ background: #7CE8A6; }` | the dark theme's `--ok-text`, written out because the pass is navy in both themes (4.3:1 on the pass's gold corner, section 12) |
| d67eb33 (B3) | `notify.test.js` 708 | `.dv2 .nt-switch:checked::before { background: var(--ok-text, #37C29A); }` | `{ background: var(--ok-text, #7CE8A6); }` | the fallback is the new dark `--ok-text`; the rule reads the token first |
| d67eb33 (B3) | `contrast.test.js` 50 | `#062A1F` on `#37C29A` ≥ 6 (the preview's sample coin) | `#062A1F` on `#34D399` ≥ 6 (8.0) | the sample coin's green is the new ok fill (`--moss` / `--up`); the 6:1 bar is unchanged |
| d67eb33 (B3) | `lp-launch-ui.test.js` 503 | `.lp-approve { border: 2px solid var(--gold, #FFC857);` | `var(--gold, #F8C13A);` | the fallback is the brand gold; the rule reads the token first |
| fix round 1 | `profiles-ui.test.js` 381–382 | dark `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767`, light `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #4a3aa7 #e34948` | dark `#f8c13a #2bd9c3 #7fa3d6 #ff9a86 #6fcf7e #a78bfa #b3d15a #f28cb4`, light `#a26f00 #0b7a70 #3f67a6 #c0392b #2e8b4e #6a4fd8 #657f14 #b5306c` | the portfolio ring on the brand (V1): slot 0 the coin's gold, 1 teal, 2 steel blue, 3 coral, 4 green, 5 violet, 6 lime, 7 rose, grey = `--faint`; each 3:1 or more on the page and the card in its theme, every pair 32° or more apart, checked by `test/design-v5.test.js`; the slot rules (383–385) and "nothing moves" are unchanged |
| fix round 1 | `d3-fix.test.js` 56 | the light circle rule `\n:root[data-theme="light"] .m-coin text { fill: var(--on-gold); }` | the base `.m-coin text { font: 800 26px var(--display); fill: var(--on-gold); }`, the light circle rule alone, `doesNotMatch` the light text rule | the light rule restated the base rule's value (Q3); the ink is still `--on-gold` |
| fix round 1 | `v4-review.test.js` 138 | `:root[data-theme="light"] #cities .city-status { color: var(--ok-text); }` | the base `#cities .city-status { … color: var(--ok-text);` and `doesNotMatch` the light rule | same (Q3); the pill still reads `--ok-text` (light 5.2:1 on its tint) |
| fix round 1 | `mobile-polish.test.js` 262 | `"--shadow-1", "--shadow-2", "--header-h"` | `"--shadow-1", "--header-h"` | `--shadow-2` had no reader (Q2) and was removed from the scale block |
| fix round 1 | `design-pages.test.js` 145 (a comment) | "navy ink (8.6:1 at the teal end)" | "navy ink (7.6:1 at the teal end)" | the figure was `--on-accent`'s; `#0C2344` on `#00CBB6` is 7.63 (H1); the assertion is unchanged |
| fix round 2 | `design-v5.test.js` 164–165 | `style.css` has `.btn--primary[disabled]:not(.is-busy, [aria-busy="true"], [data-busy]) { opacity: 1; background: var(--card-2); … }`; `wallet-send.css` has `.wsend__go.btn--primary[disabled] { opacity: .6; background: linear-gradient(…) …` | `style.css` has `.btn[disabled], .btn.is-busy { opacity: .6; cursor: progress; transform: none; }` (main's rule) and `#cr-use[disabled] { opacity: 1; background: var(--card-2); color: var(--muted); border-color: var(--line-2); box-shadow: none; }`, `doesNotMatch` any `.btn--primary[disabled]… { … opacity: 1;` rule; `wallet-send.css` `doesNotMatch` `.wsend__go…[disabled]` | FR-1-R1: the well is opted in, never the default (a working button has no reliable marker); the app-mock pin is unchanged |
| fix round 2 | `design-v5.test.js` 179 | the five deeper `.lp-ava[data-color]` stops ≥ 4.5:1 for white, in `pages-launchpad.css` and `pages-coin.css` | the same loop over three sheets: `.lp-ava` in the two coin sheets and `.swap__mark--ava` in `swap.css`, five stops each ≥ 4.5:1, and the `swap.css` set `deepEqual` the launchpad's | A11Y-4-R: the Buy sheet's mark takes the coin sheets' stops; the 4.5:1 bar is unchanged |

Stage A (`public/style.css`, `public/polish.css`, `public/feedback.css`; `public/brand/citycoin.css`, `public/theme.js` and
`scripts/pages/build.mjs` unchanged because the Citycoin.dev `theme-color` `#071426` already equals the new `--bg`) also departs from the
section 6 text in three small places, each a value choice inside owner A's files: `::placeholder` reads `var(--muted)` (4.5:1 or more on
every well in both themes) rather than `--faint`, so a hint is never under AA; `.pct-bar`, `.launch-progress` and `.role-meter.is-bad`
fills are one colour (`--pin`, `--pin`, `--bad-text`) as section 6.10 says, while `.lp-bar` keeps the teal-to-gold hairline; `.verified-badge`
is a flat `--ok-text` disc with a white inset highlight and `--on-accent` ink (a mint-to-green gradient would put white text on a light
corner in the light theme). At stage A the `.dpv` preview pass, the dashboard strip, `onboard.css`, `swap.css` and every page sheet were
the next owners' (B, C, D), and showed the old orange and purple until stages B1–B3 landed in `d67eb33`.

### Build notes — stage B2 (`pages-cities.css`, `polish-map.css`, `pages-app.css`, `app-phone.css`, `pages-connect.css`, `onboard.css`)

Every literal of the old palette in the six sheets became a token or a triplet tint; the pinned rule texts of `test/cities-find.test.js`,
`test/d3-fix.test.js`, `test/design-pages.test.js`, `test/home-v4.test.js`, `test/map-labels.test.js` (the `--st-active` lines, the four pill
rules), `test/dashboard-wallet-card.test.js`, `test/dashboard-inwallet.test.js` and `test/connect-v3-ui.test.js` are untouched; the one changed
assertion is the Appendix B row above. Four places depart from the section 9 text, each a value choice inside these sheets:

- **Light `.tag--active` reads `var(--pin-2)`, not `var(--st-active)`** (`pages-cities.css`): the light `--st-active` `#0E7C63` is frozen by
  `cities.js` and reads 4.2:1 on the pill's own tint (`rgba(14,124,99,.1)`) over the page, 3.98:1 over `--bg-3`, so the 12 px pill text would
  be under AA; the light `--pin-2` `#006F67` (the same teal family, 10° apart) reads 5.0:1 there. The map's marks, the legend dot and the
  card's bar keep `--st-active`; the old literal `#0B6E57` is gone.
- **`.tag--open::before` margins** (`polish-map.css`): `margin: 0 5px 0 -2px`, the same as the pinned `.tag--active::before`, instead of
  section 6.8's `margin-right: 6px`, so the hollow dot and the ring sit on the same optical left edge in a list of pills.
- **The stepper's filled track and the done step's hover ring read `--ok-text`** (`onboard.css`), the done disc's own colour, rather than
  `--moss` (`#34D399` next to a `#7CE8A6` disc read as two greens); `--moss` is now unused in the sheet. The setup ring's arc is `--pin` as
  section 9 says.
- **A light-theme focus ring restated** (`pages-cities.css`): `:root[data-theme="light"] .map-find` (0,3,0) outranked
  `.map-find:focus-within` (0,2,0), so the find pill's teal focus ring never showed in light; a
  `:root[data-theme="light"] .map-find:focus-within` rule now carries the ring with the light shadow. A hover (`--accent-line`, fine pointers
  only) and 180 ms transitions on the pill, the location button, the suggestions and the menu rows sit in one `no-preference` block.

Renders: `/cities`, `/app`, `/connect`, `/locate` at 390 and 1440, dark and light (16 full pages, `report.json`: no console or page error
beyond the two unmocked `/api/seats` and `/api/members` 404s on `/cities`, no horizontal overflow) plus 32 component crops at 2× (the find
pill at rest/focus/with suggestions, the city card after a pick, the controls' menu, the legend, the browse list, the sign-up panel on both
tabs, the stepper current/done/hover, the safe fold open, the phone frames) in a session-local folder (`shots-B2-map-onboarding`; the
render harness and its output are not in the repository, see Appendix D). The `/connect` wizard was rendered with a
**synthetic** `/api/signup/state` fixture (hand-written from `src/signup.js registerState`, `next: "location"`; never fetched) served by the
harness's `serve.cjs` from a copy of its fixtures; `/api/me` is the live answer of 26 Oct. `pages-connect.css` is 7,975 bytes (budget 8,000).

### Build notes — stage B1 (`pages-home.css`, `pages-launchpad.css`, `pages-coin.css`, `pages-token.css`, `lp-launch.css`, `swap.css`)

Every literal of the old palette in the six sheets became a token, a triplet tint or the new dark value where a fallback is required
(`#C6D3E6` for `--text-2`, `rgba(52,211,153,.14)` / `rgba(255,154,134,.12)` for the ok / bad tints, `#37E0CA` for `--focus-ring`, `#0C2344` for
`--on-gold`); the three changed assertions are the B1 rows above. Every other pinned rule text of `test/home-v4.test.js`, `test/home-d3.test.js`,
`test/d3-fix.test.js`, `test/v4-review.test.js`, `test/design-pages.test.js`, `test/launchpad-ui.test.js`, `test/lp-launch-ui.test.js`,
`test/swap-ui.test.js`, `test/swap-links.test.js`, `test/token-card.test.js`, `test/token-tabs.test.js`, `test/mobile-polish.test.js`,
`test/motion.test.js` and `test/dashboard-design.test.js` is untouched (221 tests, all pass). What the sheets now do, beyond section 9:

- **Launchpad**: the chosen list's count pill is one rule for both themes (style.css's `--accent-soft` + `--pin-2`, 9:1 dark, 5:1 light); the
  light `rgba(232,67,31,.08)` override is deleted and the pinned `:root[data-theme="light"] .lp-tabs__n` line is kept. `.btn--soft` hover `.24`
  / `.85` on the triplet. `.lp-card--live:hover` reads `--accent-line` with no fallback. The open "Filter and sort" button takes a
  `rgba(var(--ink),.10)` fill with its `--field-line` edge. The avatar's text shadow is the navy-black `rgba(2,8,20,.3)` and is off on the gold
  and legacy discs (navy ink carries no shadow).
- **Coin page**: the contract card's three pills take the token page's `--card-2` chip (style.css lifts them and tints them teal under a
  mouse); the "nothing recorded yet" chart state sits on `--surface-inset` inside a hairline (solid since fix round 1).
- **Token page**: `.token-quote__chg.is-down` reads `--bad-soft` and `rgba(var(--bad-rgb),.4)` (7.4:1 dark, 4.5:1 light on the tint: the light
  `#A8321A` override is deleted); the trades list is a `--surface-inset` well with `--r-chip` corners (was a bare 14 px box); the placeholder
  rows' corners read `--r-xs`.
- **Buy panel and sheet** (`swap.css`): the amount well's focus ring reads `--focus-ring`; the light token pill is `var(--card)` with `--e1`; a
  hovered token pill or flip button takes `--accent-line` / `--pin-2`; the chosen slippage chip reads `--pin-2` on its teal tint; the sheet
  card's shadow is `--e3`; the scrim literals are the navy values of section 5 (`rgba(3,10,22,.6)` / `rgba(12,35,68,.32)`).
- **Home**: the card focus rings read `--focus-ring`; the open FAQ question's +/− disc takes `--accent-soft`; the links' colour changes (180 ms,
  `--ease-out`) sit in the page's one `no-preference` block.

Renders (harness B, `serve.cjs` with a copy of its fixtures plus **synthetic** `/api/launchpad` (three live city coins on a curve and a pool,
one designed), `/api/coin`, `/api/coin/chart` (7 days of readings) and `/api/members`, hand-written from the API shapes in the tests, never
fetched) in a session-local folder (`shots-B1-public-pages`, not in the repository): `/`, `/launchpad`,
`/coin?mint=…` and `/token` at 390 and 1440, dark and light (16 full pages; `report.json`: no page error, no failed request, no horizontal
overflow, the one 404 is the unmocked `/api/snapshots`) plus 78 state crops (`st-*`: a coin card at rest, hovered, with Details open and with
Buy's keyboard ring, the filters open, the Buy sheet at rest, focused and with Price details open, the coin head, chart, tiles, contract
card, trades and the hero's Buy sheet, the home numbers bar, a hovered and a focused step card, the FAQ open, the teaser). Under the
Citycoin.dev build `/token` is the "not live yet" page (`pages-404.css`), so `pages-token.css` and the Buy panel were rendered from a scratch
build of the default-label pages (`buildPages({ brand: LEGACY_BRAND })` over a copy of `public/`, nothing written into the worktree) with
synthetic `/api/official`, `/api/token` and `/api/holders` fixtures: `token-legacy-build/` holds the four full pages and the Buy panel at rest,
focused and with Price details, the hero, the contract card, the Trades card, the Holders tab and its find box. `lp-launch.css` (the
founder's launch card on the dashboard, the graduation box on the coin page) needs a signed-in founder and was not rendered; its edits are
fallback values only.

### Build notes — stage B3 (`polish-dash.css`, `admin.css`, `pages-profile.css`, `pages-official.css`, `pages-docs.css`, `pages-credits.css`, `pages-404.css`)

Every literal of the old palette in the seven sheets became a token, a triplet tint or the new dark value where a fallback is required
(`admin.css`: every `var(--x, fallback)` fallback is now the dark theme's value: `#C6D3E6 #93A4BE #7CE8A6 #FF9A86 #FFDC8A #FFD27A #2BD9C3
#F8C13A #0B1B33`, `rgba(0,203,182,.12)`, `rgba(52,211,153,.14)`, `rgba(248,193,58,.14)`); every `rgba(0,0,0,…)` shadow is navy-black
`rgba(2,8,20,…)` and every light `rgba(11,22,38,…)` is the brand navy `rgba(12,35,68,…)`. The pinned rule texts of `test/dashboard-design.test.js`
(every selector scoped to `.dv2` / `.dpv` / `body.is-dv2` / `[data-page="dashboard"]`, no ellipsis, motion only when welcome),
`test/dashboard-tabs.test.js` (the pill's geometry, its outer shadows within 4 px), `test/phone-dash.test.js` (the opaque strip recipe),
`test/notify.test.js` (the 44 × 26 switch), `test/wallet-tab.test.js` (the QR code white with `#0B1626`), `test/layout-shift.test.js`,
`test/feed-v2.test.js`, `test/site.test.js` (`pages-credits.css` under 4,000 B, nothing moves), `test/design-pages.test.js` (the small
sheets under 8,000 B, no `!important` added), `test/admin-ui.test.js`, `test/admin-coin-reviews-ui.test.js`, `test/lpadmin-ui.test.js`,
`test/program-pins.test.js` and `test/v4-review.test.js` are untouched; the five changed assertions are the B3 rows above (every one a
pinned colour literal, its threshold or structure kept). Where the sheets depart from the section 6 / section 9 text, each a value choice
inside these files:

- **The strip pill's glow colours are written out** (`polish-dash.css` 6.7): the dark rule's `rgba(0,203,182,.7)` / `.55` and the light
  rule's `rgba(11,122,112,.5)` / `rgba(0,111,103,.4)` instead of `rgba(var(--accent-rgb),…)`, because `test/dashboard-tabs.test.js` reads
  every outer shadow's reach (y + spread + blur ≤ 4 px) with a pattern that strips a plain `rgba()` only: a nested `var()` would leave its
  alpha in the numbers and the assertion would read it as a 4.55 px reach. The pill's fill gradient and its line do read `--accent-rgb`.
- **`.nt-switch:focus-visible` keeps `outline: 2px solid var(--pin)`** (section 6.15 names `--focus-ring`): the rule's text is pinned by
  `test/notify.test.js` and `--pin` is the same teal family (9:1 on the dark page, 4.9:1 on the light one), so the pin was not touched.
- **The preview's progress bar is the teal-to-gold hairline** (`.dpv__fill`: `linear-gradient(90deg, var(--pin), var(--gold-ui))`, as
  `.lp-bar`), not one colour: nothing is written on it. Its "Next for you" cards carry the same edge as the real `.dv2 .today__card`
  (style.css), so the preview matches the dashboard it previews: the accent `--pin` since fix round 1 (it was `--blue`, a fourth colour on
  the one card every signed-out visitor sees).
- **The admin sparkline is one series** (`.adm-spark__line` and `.adm-spark__end` both `--chart-1`; the line was the second series' colour
  with an accent end dot), the sticky table head sits on `--bg-3` (6.9), and the preview-mode banner (`.admin-banner`, "Test environment")
  reads the warn family rather than gold: it is a warning, not the coin.
- **The pass's pin icon and the preview's are white at .85** (`#FFD3B8` was the old orange's tint); the live dot, the preview's dot and the
  sample coin are the dark theme's mint, written out, because the pass is navy in both themes (section 6.16).
- **One rule deleted**: `.dv2 .profile__head .idcard__avatar` (a deeper-orange gradient with a white letter, kept because white on the old
  gold end was 2.2:1) — the shared `.idcard__avatar` (style.css: `--gold` with `--on-gold`, 9.5:1) now serves the Profile tab too.
- **Fields on the Profile tab and in the console read the field line**: `.dv2 #profile-modal :is(input, textarea)`, `.admin-row .field select`,
  `.lp-input`, `.lp-select`, `.adm-pic__reject` controls were on `--line-2` (2:1); every one is `var(--field-line, …)` with the teal ring on
  focus (section 6.5). `pages-official.css` read `var(--r-sm, 12px)`, a token that does not exist: it is `--r-chip` now, and the wide-screen
  table sits on `--surface-1` with `--e1` and a `--line-2` head rule (6.9); on a phone it is the plain stacked list it was.
- **Motion**: the dashboard's and the console's hover transitions run 180 ms on the one soft curve (fallbacks updated; the notice rows,
  the welcome card's close, the danger buttons, the wallet refresh, the sub-navigation links, the console's sidebar, icon button, card
  links, sub-tabs, table rows and the fields' focus ring ease too), all inside the existing `no-preference` blocks; nothing loops.
- Not changed: `.dv2 .feed { padding: var(--dd-pad) !important; }` is the sheet's one pre-existing `!important` (not in any pinned
  "no !important" list; removing it would change the feed card's padding against style.css); the inverted chip's count pill in the
  console's phone sub-tabs keeps its neutral `rgba(127,127,127,.22)` (a translucent tint on a `--text`-coloured chip, right in both themes).

Renders in a session-local folder (`shots-B3-dashboard-admin`, not in the repository): `/dashboard` (signed in:
Home and every tab — Wallet, City, Feed, Notifications, Rankings, Founder, Profile), `/admin` (the owner: Overview, Inbox, Moderation,
Users, Audit, Config), `/profile` (the search page and `?u=harbor_jo`, the pass), `/official`, `/rules`, `/terms`, `/credits` and `/404x`
at 390 and 1440, dark and light (32 full pages from `shoot.cjs`, `report.json`: no page error, no horizontal overflow, the one console
line per dashboard load is an unmocked `/api/*` 404; 56 more full pages and 2× crops of the strip, the pass, the metric cards, the charts,
the live activity, the focused filter field; `hover-*` / `focus-*` crops of the sidebar, a table row, a card link, a role tile, the pass copy
button, a notice row, a switch and the username field), and `signed-out/` (the `.dpv` preview, 4 full pages). Harness B with
**synthetic** fixtures (hand-written from the shapes in `test/helpers/dashpage.js` and `test/admin-ui.test.js`; never fetched):
`/api/me` as a signed-in member with a wallet and two unread notices, `/api/posts`, `/api/notices`, `/api/me/portfolio`,
`/api/swap/balances`, `/api/profile`, `/api/admin/me` (the owner), `/api/admin/overview`, `growth`, `audit`, `feedback`, `users`,
`claims`, `reports`, `logos` and the rest, served by the harness's `serve.cjs` from a copy of its fixtures folder; the signed-out
preview from the stock fixtures. The standing card, the rank chips and the Today cards did not show under the Citycoin.dev build with the
token "not live yet", so their rules (token-only changes) were not rendered. `npm test` on the worktree with every stage's edits:
2,736 tests, 2,735 pass, 1 skipped, 0 fail.

## Appendix C. What shipped (stage C, the integration)

Written 1 Nov 2026 after the three builders' sheets were merged, checked against this file, rendered and committed. The branch is
`cc/design-premium` on `main` `0204191`: **built, not merged**. Four commits carry the design: `ae4054e` (stage A, the foundation:
`style.css`, `polish.css`, `feedback.css`, 18 assertion rows) and `02e89d5` (its hash in Appendix B); `d67eb33` (stages B1, B2, B3 and
the integration below: every page sheet, the two coin feature sheets, nine assertion rows, the new `test/design-v5.test.js`); and the
documents commit that carries this appendix and the implementation report's rows. Fix round 1 (the review of 1 Nov 2026) is one more
commit, recorded in Appendix D.

**What the integration changed, beyond the three builders' reports** (each a value inside the files, no selector or structure moved):

- `public/coin-ready.css` and `public/coin-review.css` (the ready-made coin and the review of a coin request; loaded by their scripts when
  `COIN_V2_READY` / `COIN_V2_REVIEW` are on, so nothing on the live site reads them today): their keyboard rings read
  `var(--focus-ring, #37E0CA)` (section 3.5: `--focus` is the map focus card's local colour, so the rings fell back to the old orange);
  `.crv-over, .crv-bad` read `var(--bad-text, #FF9A86)` (`--warn-text` was never a token, so the "over the limit" words were always the old
  orange); the pending / ok / changes tints read the `--warn-rgb` / `--ok-rgb` / `--bad-rgb` triplets and the `*-soft` tokens (they were
  literal amber, green and orange alphas); the `--muted` fallbacks are the dark value `#93A4BE`; the two drop shadows are navy-black.
- `public/style.css`: `.token-chip[data-token="vic"] .token-chip__dot` (the legacy token's mark in the Buy panel's token pill) is the
  emblem's teal into the coin's gold, the same pair as `.lp-ava[data-kind="vicinity"]` and `.pm-coin--vic` (it was the old orange radial,
  the last of the old accent in `public/`); `.btn--primary[disabled]:not(.is-busy)` is a quiet well (`--card-2`, `--muted`, `--line-2`, no
  glow) instead of the gold at 60 % (B1's open issue: olive on the navy, grey-blue on paper; a *busy* main button keeps its gold). Fix
  round 1 narrowed that selector to `:not(.is-busy, [aria-busy="true"], [data-busy])` and excluded the Send sheet's Send button
  (`wallet-send.css`), because the scripts mark a working button in three ways and one not at all (Appendix D, FR-1). Fix round 2
  inverted it (Appendix E, FR-1-R1): there is no generic well any more, a disabled main button is the gold at 60 % as on `main`, and the
  well is opted in by selector only where the page knows the button cannot be used yet (`#cr-use[disabled]`, the app mock).
- Nothing else: the sweep of the old accent (`FF5A36 FF8A5B E8431F FFC857 C93512 D0441C CF3A1A B8430F F25C24` and their `rgba(…)` tints, and
  every other retired value of sections 3 and 11) finds nothing in `public/*.css` and `public/brand/citycoin.css`; `public/brand/tokens.css`
  is the unlinked draft (frozen by `test/coinart-t2.test.js`). The `[data-color]` member palettes, the `--pf-*` palette (moved onto the brand
  in fix round 1, still literal hexes: the pin reads them as such) and the third-party colours (SOL, USDC, RAY, Google, the mainnet red,
  the QR) stay literal by design.

**The new test, `test/design-v5.test.js`** (section 11, "New"; 4 tests): it reads both theme blocks and both scale blocks of `style.css`
(every `--name: value;` of the four `:root` blocks before the base marker), the map's `--st-*` lines, the market's `--up/--down` lines and
`polish-map.css`'s `--st-active`, resolves `var()` chains and `rgba(var(--x-rgb), a)` tints, composites the surfaces as section 12 says
(glass over the page, the well as ink over `--bg-2`, the chip over the water, the pass corners as the glows over the pass) and asserts every
row of section 12 at its bar (T 4.5, L 3, U 3, D recorded without a bar) in both themes; the figure/ground of land and water, the 30° hue
rule for the four map statuses and the "also held" pairs; that the light block restates every colour token of the dark block; and the token
discipline (no old-palette literal anywhere in `public/*.css` and `brand/`, no white text on a `var(--pin)` fill, no `var(--focus,` in the two
coin sheets). `node --test test/design-v5.test.js` prints the table it checked (the section 12 numbers, recomputed). No assertion of an
existing test changed in stage C.

**The suite.** `node scripts/brand/switch-trial.mjs --local && npm run build` with `NODE_OPTIONS=--unhandled-rejections=strict` (the CI job
`brand-switch-trial`'s two steps; `npm run build` is `copy-assets`, the page build and `npm test`): the trial writes nothing (`wrangler.jsonc`
already carries the switch with its prerequisites; exit 0; `git status` shows no change to it); the page build leaves `public/*.html` byte
for byte as committed (no HTML source changed; `test/build-parity.test.js` holds); **2,740 tests, 2,739 pass, 0 fail, 1 skipped** (the
opt-in live Squads read), against 2,736 on `main`: the four new ones are `test/design-v5.test.js`. The same command run before the
integration edits, with the three builders' sheets as they were, gave 2,736 / 2,735 / 0 / 1.

**The renders** (a session-local folder, `shots-stageC`; the render harness, `serve.cjs` + `shoot.cjs`, and every render folder named in
this file live outside the repository and are not reproducible from it; the before / after shots travel with the pull request): harness B
(`serve.cjs` + `shoot.cjs`) over this worktree's `public/`, with the seven live fixtures of 26 Oct plus the builders' **synthetic** fixtures (B1's
`/api/launchpad`, `/api/coin`, `/api/coin/chart`, `/api/members`; B2's `/api/signup/state`; never fetched), so `/launchpad` shows three coin
cards and `/connect` its wizard. All 16 pages × 390 / 1440 × dark / light = 64 full pages + 30 component captures (header, tab bar, main and
secondary button, card, the find box, the theme toggle's keyboard ring, the account sheet); `report.json`: every shot `ok`, **no horizontal
overflow, no console or page error, no failed request**; the one 4xx is the unmocked `/api/seats` on the component pass. `extra/`: the
signed-in `/dashboard`, the owner's `/admin` and `/profile?u=harbor_jo` (B3's synthetic member, owner and admin fixtures) and
`/coin?mint=…` (B1's synthetic coin) at both sizes in both themes, the disabled main button in both themes, and the keyboard pass on `/`
and `/cities` (`focus-*`): the skip link navy on teal (dark) / white on deep teal (light), the main button's 3 px teal ring offset 3 px,
the find pill's teal ring. Every one of the 64 + 16 pages was looked at: nothing of the old accent remains (the places it hid: admin,
profile, coin, official, rules/terms, 404), the pass is navy in both themes with its teal and gold corners, the light main action is navy
with gold text, the lockups sit right on both canvases, the map legend reads against the canvas, the status pills carry their glyphs,
field borders show on cards. Compared with `shots-before/` (the live site of 26 Oct) the pages are the same pages: nothing moved, only the
colours, the lines, the depth and the motion timing.

**Known and left as is** (none a defect of this design; each recorded by its builder above):
`cities.js`'s canvas label colours (`foundedText #FFB39C` …) are the old palette and JavaScript is frozen (section 13); `coinchart.js`'s
canvas grows during a full-page phone capture (the `/coin` phone shots are 4,176 px tall in B1's run and this one; the chart is 546 px on
screen, as B1's 2× crops show); `.dv2 .feed { … !important }` is pre-existing; the dashboard strip pill's glow colours are literal
`rgba()` (the test's reach regex); `.nt-switch:focus-visible` keeps `var(--pin)` (pinned); `lp-launch.css` is unrendered (a founder's card); the light
`#city-stage --map-bg` keeps its `#E6F0FA / #D9E6F4` stops (a step off the light `--map-bg`, by design: the map tray is its own surface);
Fraunces stays deferred (Appendix A). Next: pull request, CI, merge, deploy, then the live before / after for the owner.

## Appendix D. Fix round 1 (the review of 1 Nov 2026)

The review of the stage C branch (visual, accessibility, regression and record lenses, 30 findings) was answered in one commit on
`cc/design-premium`: CSS, test pins and documents only; no JavaScript, page source, build script or setting changed, and `public/*.html`
is rebuilt byte for byte. Every finding was rendered or measured again first (Chromium, harness B with the stage C fixtures, 390 / 768 /
1440 px, dark and light); the measurements below are from that run. The render harness and its output stay session-local (outside the
repository); the before / after shots travel with the pull request.

| id | verdict | what changed (files) and what the render shows |
|---|---|---|
| V1 ring palette | fixed | `style.css` `--pf-0..7`, `--pf-x` on the brand per theme (section 3.4 row): dark `#f8c13a #2bd9c3 #7fa3d6 #ff9a86 #6fcf7e #a78bfa #b3d15a #f28cb4`, light `#a26f00 #0b7a70 #3f67a6 #c0392b #2e8b4e #6a4fd8 #657f14 #b5306c`, grey = `--faint`. Every slot 3:1 or more on the page and the card (dark 6.79+ / 6.33+, light 3.98+ / 4.27+), every pair 32° or more apart; `test/design-v5.test.js` checks all of it and refuses the sixteen old hexes; `profiles-ui.test.js` 381–382 updated (Appendix B). Rendered: the ring is gold / teal / steel blue on the profile card |
| V2 mock Send | fixed | `app-phone.css` `.pm-btn--primary.is-off`: the site's quiet well (`--card-2`, `--muted`, `--line-2`, opacity 1). Rendered: label 6.1:1 dark, 5.4:1 light on the well; the other mock buttons keep `.is-off` at 55 % |
| V3 blue bars | fixed | `polish-dash.css` `.dpv__todo::before`, `style.css` `.dv2 .today__card::before` → `var(--pin)`; `.dv2 .fs-rank` → `--pin` edge, `rgba(var(--accent-rgb),.08)` tint. `--blue` / `--blue-rgb` stay: the map area tint, the `.pf-notice` and `.swap__note` tints, the founder card's provisional corner and the mock's city coin read them (section 3.1 comment says so) |
| V4 light headline | fixed | light `--grad-accent: #A87400 → #946500 → #8A5F00` (3.79 / 4.75 / 5.27 on the page, 4.07 / 5.65 on white); the hue of every stop stays between 35° and 50° (new assertion). Rendered: "One coin." reads gold, not brown |
| V5 pass gold corner | fixed | `--pass-glow-2: rgba(255,205,96,.46)` and the corner's radial `60% 80% … transparent 62%` (`.pass`; the profile pass the same shape at `.34`): a small warm glint, not a wide wash. White 5.37:1 and the live dot 3.57:1 on the full glint (section 12); rendered bottom-right 26 px: `#60583D` median, white 7.1:1 |
| V6 tab pill | fixed | `.tabbar__ind { background: var(--pin) }` (geometry pinned, unchanged). `--gold-ui` keeps its other readers (the progress bars' gold end, the light coin's rim); its section 12 row is now measured on `--bg-2` |
| V7 light bars | fixed | light `--chart-2: #16355E` (the brand navy, 12.3:1 on white): series 2 is each theme's own fill, gold on the night canvas, ink bars on paper. The curve bar keeps `--pin → --gold-ui` (the gold end must stay 3:1 on the track; `--pin` alone would lose the pinned two-colour hairline) |
| V8 hover ring | fixed | dark `--grad-ring` a white-into-light-gold sheen; the light block restates the teal-and-gold arc for its navy button (`--grad-ring` left the test's theme-independent set). Rendered: no teal fringe on the gold pill |
| V9 launchpad min-height | not changed | `.lp-skels, #lp-panel { min-height: calc(100vh - 240/300px) }` is a pinned no-jump guard (`test/design-pages.test.js` 59–60 and its comment: the sources, the fold and the footer never show and then jump when the list arrives); shortening or capping it trades the empty band for that jump on most screens. Same at `0204191`; a layout decision for the owner, outside a re-theme |
| V10 half-empty Home | fixed | `polish-dash.css` (≥ 1000 px): when the Home panel has no Buy card (`#trade` `.cc-off` under this brand, or hidden by a wallet app) the portfolio and badges take the right column and each row's two cards share a height. Rendered at 1440: pass 144–798 / portfolio 812–1296 on one row, role / badges on the next; the Buy-card layouts are untouched. Reopened by the re-review as V10-R1 (the grid-wide stretch spread a "Next for you" row) and closed in round 2, then by the final check as V10-R2 (a blank band under the block) and closed in round 3: Appendix E |
| V11 tablet cards | fixed (home), not changed (launchpad) | `pages-home.css`: 601–900 px two how-it-works cards side by side and the third across (rendered at 768: 24–376, 392–744, then 24–744), three from 901 px. The launchpad grid keeps `repeat(auto-fill, minmax(min(100%, 300px), 1fr))` (pinned, `launchpad-ui.test.js` 361): with three coins and two columns the third card is alone whatever the breakpoint, and a card made two columns wide would be a narrow card stretched; left as it is |
| V12 dashed empty states | fixed | `.empty` a resting card (`--line` solid, `--surface-1`, `--e1`); the same for `.empty-feed`, the coin page's "nothing recorded yet" state and the console's `.chart__empty`. Dashes stay where they mean something: the drop target and the layout-edit outline, a blocked coin card, the choosing ring, the chart's "none" line, the wizard's optional step, the contract card's note hairline |
| A11Y-1 pass avatar (blocking) | fixed | `.pass .idcard__avatar { color: #fff }`. Rendered (text hidden, tile pixels sampled under the 20.8 px bold initial): white on `#335D77` 7.06:1 at 390 px, 6.76:1 at 1440 px, both themes (was 2.2:1); the profile pass already had its own white |
| A11Y-2 console sub-tabs | fixed | `admin.css` (`@container admbody ≤ 639 px`): the chosen chip's rule is said for the light theme too (`:root[data-theme="light"] .adm-subtabs .adm-subtab[aria-selected="true"]`), so style.css's light `.seg` rule no longer paints it white. Rendered on a phone: "Claims" `#F5F7FB` on `#0C2344` 14.6:1 light, 16.6:1 dark |
| A11Y-3 find pill focus | fixed | `pages-cities.css` `.map-find:has(:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 2px }`: the site's ring around the pill on keyboard focus (light `#006F67`, 5.6:1 on the page). Rendered with Tab: `solid 3px rgb(0, 111, 103)` light, `rgb(55, 224, 202)` dark |
| A11Y-4 coin disc initials | fixed | `pages-launchpad.css` and `pages-coin.css` (the shared `.lp-ava` block, still byte-identical): the five city colours' light stop a step deeper on this 40 px disc only (`ocean #2D6BD6`, `emerald #138463`, `rose #CF3366`, `violet #7A5CE6`, `ink #56657D`; white 4.66:1 or more at the lightest stop, asserted); the coin art, swatches and pass coins keep `style.css`'s values. Rendered under the glyphs: emerald 4.9:1 (was 3.3), ocean 5.8:1 (was 4.0), gold 7.9:1. Half a fix: the Buy sheet's own copy of the disc (`swap.css` `.swap__mark--ava`) still read `style.css`'s lighter stops (emerald 3.29:1); reopened as A11Y-4-R and closed in round 2: Appendix E |
| A11Y-5 light `--muted` | fixed | light `--muted: #4E6076` (one step deeper): 6.01 on the page, 6.44 on a card, 4.78 on a well inside a dashboard card (section 12 rows updated). Rendered on a phone: "No founder" tag 4.78:1, the feed's chips 4.77:1 (were 4.49) |
| FR-1 busy main buttons | fixed | `style.css`: the quiet well is `.btn--primary[disabled]:not(.is-busy, [aria-busy="true"], [data-busy])`, so a button the scripts disable while it works (connect.js and profile.js set `aria-busy`, signup.js `data-busy`, swap.js, cities.js and the Send sheet's Review `.is-busy`) keeps its gold at 60 %; `wallet-send.css` keeps the Send sheet's Send (no marker) gold while it waits. Pinned in `test/design-v5.test.js`. Rendered under the real sheets: a plain disabled primary is the well; `.is-busy`, `aria-busy`, `data-busy` and `.wsend__go` are the gold gradient at opacity .6 with `--on-cta` ink, both themes. Not enough: most working buttons carry no marker at all (the feedback widget's Send, the Send sheet's Review during its live re-check, Apply, Save design, the launch approval…) and still turned into the well mid-action; reopened as FR-1-R1 and the default inverted in round 2: Appendix E |
| H1 7.6:1 | fixed | `#0C2344` on `#00CBB6` is 7.63:1 (8.61 is `--on-accent` `#06192E` on the teal): the six places now say 7.6 / 7.63 (section 12 "Also held", the section 11 and Appendix B rows, both sheets' comments, the test comment) |
| H2 commits | fixed | the implementation report's status paragraph names the five commits (`02e89d5` included) |
| H3 "every text pair" | fixed | the report says what is true: the section 12 table recomputed from the tokens on every run, the review's pixel-measured pairs in this appendix, the whole site not re-measured |
| H4 session-local paths | fixed (stated) | every `/tmp/…/scratchpad/…` path in this file and the report is now a plain statement that the render folders and the harness are session-local and outside the repository, with the shots travelling with the pull request; the harness was not committed (its fixtures include live answers and synthetic members, and its scripts would enter the suite's sweeps for nothing the site needs) |
| H5 stage-A paragraph | fixed | Appendix B's closing sentence is in the past tense ("showed the old orange and purple until stages B1–B3 landed in `d67eb33`") |
| H6 token-tabs 62 | fixed | the row is in section 11's table too (27 rows there and in Appendix B's stage rows) |
| Q1 connect budget | fixed | `pages-connect.css` 7,975 → 7,824 bytes: five comments shorter (the header, the panel, the intro, the wallet rows, the recap chip). The three `var(--surface-inset, rgba(var(--ink),.04))` fallbacks stay: `test/design-pages.test.js` 38 pins "tokens with a fallback where they are new" for the page sheets (dropping them was tried and failed that pin) |
| Q2 `--shadow-2` | fixed | removed from the scale block (no reader; the four former readers take `--e3`); `mobile-polish.test.js` 262 no longer lists it (Appendix B); section 3.3 says so |
| Q3 redundant light rules | fixed | `:root[data-theme="light"] .m-coin text` and `:root[data-theme="light"] #cities .city-status` removed; `d3-fix.test.js` 56 and `v4-review.test.js` 138 assert the base rule and `doesNotMatch` the light one (Appendix B) |
| Q4 founder card corners | fixed | `--pass-ok-rgb`, `--pass-bad-rgb`, `--pass-blue-rgb`, `--pass-gold-rgb` (the dark triplets, theme-independent like `--pass-*`); `.dv2 .fcard` and its state and tag rules read them, so the navy card's corners and tints are the same in both themes (section 6.16, the test's theme-independent set) |
| P1 comment bytes | partly | the two longest token-block essays in `style.css` are shorter and every rule this round adds carries a one-line reason, but the round still adds bytes: across the eleven touched sheets +1,550 B of code and +2,209 B of comments (`style.css` 232,753 → 233,674 B, code +328 / comments +593; against `main` 227,894 → 233,674). A stand-alone trim of the stage A and B prose (the builders' notes to the reviewer) is left as a follow-up: it changes nothing the owner sees |
| P2 blur | fixed | `--glass-blur: saturate(1.5) blur(18px)` (main's radius; asserted); `--e3`'s 72 px and the two-stop `--grad-glow` stay (the review let them) |
| P3 console transitions | fixed | the admin transition list is `.adm-nav__item, .adm-icon-btn, .adm-metric__go, .adm-subtab, .lp-card` for background, colour and border only; `.admin-table tbody tr td`, `.lp-step` and `box-shadow` are out (nothing of theirs changes under a mouse) |

**The suite.** The trial writes nothing (`wrangler.jsonc` already carries the switch with its prerequisites; exit 0; `wrangler.jsonc` unchanged); the page build leaves every `public/*.html` byte for byte as committed (no page source changed); `npm test`: exit 0, 2,741 tests, 2,740 pass, 0 fail, 1 skipped (the opt-in live Squads read); one test more than stage C: `test/design-v5.test.js` gained the fix-round-1 test (the ring palette's contrast and hue gaps, the disabled-button selectors, the pass avatar's ink, the tab pill, the next-step edges, the light headline's hue, the console chip, the find pill's ring, the coin discs, `--shadow-2` gone, the blur).

## Appendix E. Fix round 2 (the re-review of 1 Nov 2026)

The re-review of the round-1 commit `f5d19d1` sent three findings back (one new, two half-closed). Answered in one commit on
`cc/design-premium`: CSS, test pins and documents only; no JavaScript, page source, build script or setting changed, and `public/*.html`
is rebuilt byte for byte. Each was rendered again first (Chromium, harness B with the stage C fixtures, the signed-in fixtures for the
dashboard; dark and light), then rendered after the change; the figures below are from that run. The harness and its output stay
session-local, outside the repository.

| id | verdict | what changed (files) and what the render shows |
|---|---|---|
| V10-R1 "Next for you" spread by the stretch | fixed (real: the round-1 rule stretched the whole grid) | `polish-dash.css` (≥ 1000 px, no Buy card): the grid keeps `align-items: start`; only the four paired cards stretch, `> :is(#dash-top, #role-home, #portfolio, #badges) { align-self: stretch; }`, so `#today` (a grid of one-line rows) and the one-line Buy card keep their own height beside a taller card. Rendered with a "Pick a username" row, built as `dashboard-v2.js` builds it: 1440 px `#today` 144–798 @457 **h96** (was h268), its card h66 (min-height 64; was h152), title @500 / sub @521 (21 px apart; was 63), `#badges` 812–1296 @457 h268 beside it, `#role-home` @739 under it; 1000 px `#today` h96, card h66, badges h283. Without a Today row the round-1 layout is unchanged (pass / portfolio h239 on one row, role / badges h268 on the next, both widths). Both themes; no horizontal overflow |
| V10-R2 a blank band under "Next for you" (the final check of 1 Nov 2026) | fixed (real: the round-2 rule kept `#today` at its own height, but beside the taller badges card it left the band below it empty; the role card started only after that row) | `polish-dash.css` (≥ 1000 px, no Buy card): `> #today { grid-column: 1 / -1; }`, so the "Next for you" block runs the full width above the role and badges row. Rendered with the signed-in fixtures and rows built as `dashboard-v2.js` builds them, 1440 and 1000 px, dark and light, 1 and 3 rows: `#today` 144–1296 @457 h96 (three rows h115), `#role-home` 144–798 and `#badges` 812–1296 on the next row at one height (h268 at 1440, h283 at 1000), 14 px between them (was a 186 px blank at 1440, 201 px at 1000, with one row); without a Today row the layout is unchanged; no horizontal overflow; 0 page errors. The 14 test files that read `polish-dash.css`: 208 of 208 pass. |
| A11Y-4-R the Buy sheet's coin mark | fixed (real: the sheet's own disc still took `style.css`'s stops) | `swap.css`: `.swap__mark--ava[data-color="ocean"] { --c2: #2D6BD6; }`, `emerald #138463`, `rose #CF3366`, `violet #7A5CE6`, `ink #56657D`, next to the gold rule, the same five stops as `.lp-ava` in the coin sheets (`test/design-v5.test.js` now checks all three sheets and that the `swap.css` set equals the launchpad's). Rendered in the real Buy sheet opened from the launchpad's emerald PO card (both marks: the pay-with pill and the coin row), the pixels under the 10.56 px / 800 glyphs: emerald **4.91:1** (worst 4.85; was 3.29), ocean 5.80 (5.56), rose 5.58 (5.37), violet 6.10 (5.61), ink 9.65 (8.29), gold 7.88 (navy ink); 390 and 1440 px, dark and light (the mark is theme-independent). The round-1 row and the commit-level claim ("coin-disc initials 4.5:1 or more") now hold for the sheet too |
| FR-1-R1 working main buttons the well | fixed (real: the "no marker" set is most of the site) | The default is inverted, CSS only. `style.css`: the generic rule `.btn--primary[disabled]:not(.is-busy, [aria-busy="true"], [data-busy]) { … well … }` is gone; a disabled main button is `.btn[disabled]`'s gold at 60 % as on `main`, whatever the scripts mark it with (`.is-busy`, `aria-busy`, `data-busy` or nothing: `feedback.js` 177, `wallet-send.js` 269, `dashboard.js` 507 / 764 / 1239 / 1465, `dashboard-roles.js` 378, `lp-launch.js` 341 / 410 / 539, `admin.js` 407, `locate.js` 36, `site.js` 663, `profile.js` 850, `connect.js` 368 / 384). The quiet well is opted in by selector only where the page knows the button cannot be used yet: `#cr-use[disabled]` (the coin studio's "Use this coin", `dashboard.html` 408; `coin-ready.js` 101 disables it only while no usable design is shown and marks saving with `aria-disabled`, never `disabled`) and the app mock's `.pm-btn--primary.is-off` (`app-phone.css`, unchanged). `wallet-send.css`: the `.wsend__go` exception is removed (redundant). Not opted in, on purpose: the Buy sheet's `.swap__go` (`swap.js` 1268 disables it without `.is-busy` both while "Quoting…" and while no amount is typed or the 10 % box is unticked; CSS cannot tell the two apart, so it keeps `main`'s dimmed gold in every disabled state) and the Send sheet's Review (invalid form and the live re-check, the same mix). Rendered at 390 × 844 under the real sheets: the Send sheet's Review during the live re-check (the build request held) and the feedback widget's "Sending…" (the POST held) are the gold gradient at opacity .6 with `--on-cta` ink, dark fill `#967829` / ink `#0B1F3D`, light `#6D7B90` / `#FBDA88` (as `main` renders them); "Applying…", "Save design", "Checking your location…", "Approve the launch in your wallet" and an `.is-busy` button the same; "Use this coin" disabled is the well, dark `#192536` / `#93A4BE` 6.1:1, light `#E9ECF1` / `#4E6076` 5.44:1. The 60 % gold's own ratios (3.9:1 dark, 3.2:1 light) are a disabled control's, exempt from the AA text rule and unchanged from `main` |

**Changed assertions** (also in Appendix B): `test/design-v5.test.js` 164–165 (the disabled-button rule set: main's `.btn[disabled]` rule
present, no generic well on a disabled main button, `#cr-use[disabled]` the well, no `.wsend__go` exception) and 179 (the deeper disc stops
checked in `swap.css` too, equal to the launchpad's). No threshold moved.

**The suite.** `NODE_OPTIONS=--unhandled-rejections=strict node scripts/brand/switch-trial.mjs --local && npm run build`: the trial writes
nothing (`wrangler.jsonc` unchanged, exit 0); the page build leaves every `public/*.html` byte for byte as committed (no page source
changed); `npm test`: exit 0, 2,741 tests, 2,740 pass, 0 fail, 1 skipped (the opt-in live Squads read); the same count as round 1 (no
test added; two assertions rewritten).
