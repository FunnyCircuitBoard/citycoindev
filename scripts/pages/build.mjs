// Builds the site's pages: public/<name>.html = the shared layout (head, floating header, phone tab bar, footer) + the page's own
// content from scripts/pages/src/<name>.html. Design v4 (12 Oct 2026): a slim floating glass header (the brand, four links, Log in and
// one orange "Sign up"; signed in, one avatar that opens the account sheet), a five-tab bar on phones, and a minimal footer (the copyright line, Terms / Rules / Official addresses / Data / Check a link, the
// official social accounts from src/official.js, and one security line: Vicinity never asks for a recovery phrase; not a risk line). Every page loads style.css and then polish.css. No page carries a
// site-entry Terms of Use modal any more: the Terms are accepted at account creation and on /terms, and the footer links them everywhere.
// The product's names in the layout (titles, the header's brand, the copyright line, the social labels, the security line) come from
// src/brand.js with the BRAND setting of wrangler.jsonc: unset is today's labels, byte for byte (test/build-parity.test.js).
//   npm run pages
// Edit the files in scripts/pages/, never the generated public/*.html (a test checks they match).
//
// Each source file starts with one line of settings:
//   <!--{"title": "...", "description": "...", "page": "home", "scripts": ["home"], "styles": ["extra"], "main": "class"}-->
// ("noindex": true keeps a page out of search engines; "styles" are extra stylesheets from public/, e.g. "admin" -> /admin.css; never an inline <style>, the security policy blocks it;
//  "nav": "launchpad" marks that menu entry as the current page for a page that is not in the menu itself (the coin page /coin);
//  "standalone": true builds the page like any other, but buildPages() leaves it out: test/site.test.js lists the main pages one by one and says only the admin console is noindex.
//  The standalone pages come from buildStandalonePages() and are written by the same command; the tests of their own cover them.)
// A source may hold a fill, <!--@name-->, which the build replaces with markup made from the site's own data (FILLS below); an
// unknown name stops the build. Today: <!--@official-addresses--> on /official, the address list of src/official.js officialAddresses()
// with the settings of wrangler.jsonc (what the Worker runs with), so no address is typed into a page.
// It also writes src/pages-built.js: what these pages were built with (MAIN_TOKEN_V5 and BRAND from wrangler.jsonc) and whether
// wrangler.jsonc sends them through the Worker (its assets block's run_worker_first is true). The Worker counts MAIN_TOKEN_V5 only when the
// deployed pages were built with it (src/v5policy.js mainTokenV5): the pages are static files it never sees. It counts HOST_REDIRECT only
// when the pages reach it (src/v5policy.js hostRedirect), and the build stops when wrangler.jsonc sets HOST_REDIRECT=on without that.
// The legacy seat freeze (stage S16, LEGACY_SEATS=frozen in wrangler.jsonc): the build replaces the copy that presents the old founder rules
// as current (the seven-day hold, the Stake Ladder, the Seed Steward, squads, founder windows, endorsements, country-manager elections) with
// neutral words, from scripts/pages/frozen-copy.mjs (exact whole-line passages and a page description each; a passage not found exactly once
// stops the build). Not frozen, the sources are built as they are: today's pages, byte for byte (test/build-parity.test.js). The build records
// the freeze in src/pages-built.js (legacySeats "frozen", only then), so the Worker holds the freeze when its own setting differs from what
// the pages were built with (src/v5policy.js legacySeats).
//
// The brand (the label migration, stage S48; owner directive 24 Oct 2026: "there should be no existence of vicinity. only citycoin."). A
// page source writes the product's name through a label fill and keeps any other brand difference in a brand block:
//   {{productName}} {{shortName}} {{domain}} {{siteLabel}} {{tagline}}   the label of src/brand.js (escaped), in the body and in the settings
//                                                                        line's strings; an unknown name stops the build
//   <!--@if citycoin-->A<!--@else-->B<!--@end-->                          A when the pages are built with that label set, else B (the
//   <!--@if citycoin-->A<!--@end-->   <!--@if !citycoin-->B<!--@end-->    <!--@else--> part is optional; "!" negates). A marker alone on its
//                                                                        line goes with its line, so BRAND unset gives today's bytes. No nesting.
//   "brand": {"citycoin": {"title": ..., "scripts": [...], ...}}          in the settings line: settings that replace the page's own for that
//                                                                        label set (a page whose feature is not live under it, e.g. /token)
// With BRAND unset every page is today's, byte for byte (test/build-parity.test.js). A known label set other than today's (BRAND=citycoin)
// also gets its look (LOOKS below: the Citycoin.dev lockup, favicon set, web manifest, theme colour, social tags and stylesheet; no Token
// tab and no "Check a link" footer link while the main token is not live), its built pages lose their HTML comments, and the build stops
// if any built page still says "vicinity" in any letter case (brandResidue): nothing is shipped half renamed.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SOCIAL_PROFILES, officialAddresses, socialProfiles } from "../../src/official.js";
import { BRANDS, brandFromSettings, brandLabels } from "../../src/brand.js";
import { esc, escBrand, rewriteSocialLinks, socialList } from "../../src/footer-social.js";
import { hostRedirectOn, legacyLinkOn, legacySeatsFrozenOn, mainTokenV5On, walletOnlyOn } from "../../src/flags.js";
import { deploymentAccepted } from "../../src/maintoken.js";
import { LEGACY_SEATS_CODES, legacyLinkUntil, policyConfig, walletOnlyRefusals } from "../../src/v5policy.js";
import { LEGACY_HOSTS, siteConfig } from "../../src/site-config.js";
import { isSolanaAddress } from "../../src/solana.js";
import { settingsFrom } from "../mainnet-preflight.mjs";
import { FROZEN_COPY } from "./frozen-copy.mjs";

const SRC = fileURLToPath(new URL("./src/", import.meta.url));
const OUT = fileURLToPath(new URL("../../public/", import.meta.url));

// The header's links (computers; prompt item 1: Launchpad, Live map, App preview, Dashboard) and the phone tab bar's five tabs (the
// Token page keeps a thumb slot; the app teaser does not earn one). [page, href, label]  /  [page, href, label, icon]
const HEADER_NAV = [
  ["launchpad", "/launchpad", "Launchpad"],
  ["cities", "/cities", "Live map"],
  ["app", "/app", "App preview"],
  ["dashboard", "/dashboard", "Dashboard"],
];
const TABS = [
  ["home", "/", "Home", '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>'],
  ["launchpad", "/launchpad", "Launchpad", '<path d="M12 3c3 2.2 4.5 5.6 4.5 9.3l-1.8 3.2H9.3l-1.8-3.2C7.5 8.6 9 5.2 12 3z"/><circle cx="12" cy="9.8" r="1.6"/><path d="M9.3 15.5 7 19l3-1M14.7 15.5 17 19l-3-1M12 17.5V21"/>'],
  ["cities", "/cities", "Map", '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'],
  ["token", "/token", "Token", '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5h3.75"/>'],
  ["dashboard", "/dashboard", "Me", '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6"/>'],
];
// The account sheet (signed in): the header's one avatar opens it (site.js accountSheet), a bottom sheet on a phone and a small popover
// on a computer. The member's username and home community at the top, then Profile, Account and Settings, each an existing place of the
// dashboard (the Profile tab, its Wallet and sign-in rows, the notification settings), and Log out. Static markup filled with textContent.
const SHEET_ICON = (paths) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ACCOUNT_LINKS = [
  ["profile", "/dashboard#profile", "Profile", "Username, bio and how members see you", '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.9 16c.5-1.5 1.7-2.4 3.1-2.4s2.6.9 3.1 2.4M14.5 10h3.5M14.5 13.5h2.5"/>'],
  ["account", "/dashboard#profile-account", "Account", "Wallet, sign-in, e-mail and phone", '<circle cx="8" cy="15.5" r="3.5"/><path d="M10.5 13 19 4.5M15.5 8l2.5 2.5M17.5 6l2 2"/>'],
  ["settings", "/dashboard#notice-prefs", "Settings", "Notifications: what you get told about", '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'],
];
const ACCOUNT_SHEET = `  <div class="acct" id="acct-sheet" data-acct hidden>
    <div class="acct__scrim" data-acct-close></div>
    <div class="acct__panel" id="acct-panel" role="dialog" aria-modal="true" aria-label="Your account" tabindex="-1">
      <span class="acct__grab" aria-hidden="true"></span>
      <div class="acct__who">
        <span class="acct__av" data-acct-initial aria-hidden="true"></span>
        <div class="acct__id">
          <p class="acct__name" data-acct-name>Your account</p>
          <p class="acct__home">${SHEET_ICON('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>')}<span data-acct-home></span></p>
        </div>
        <button class="acct__x" type="button" data-acct-close aria-label="Close">${SHEET_ICON('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>')}</button>
      </div>
      <nav class="acct__nav" aria-label="Account menu">
        <ul class="acct__links">
${ACCOUNT_LINKS.map(([k, href, label, hint, paths]) => `          <li><a class="acct__link" href="${href}" data-acct-go="${k}"><span class="acct__ico">${SHEET_ICON(paths)}</span><span class="acct__text"><strong>${label}</strong><span>${hint}</span></span><span class="acct__chev" aria-hidden="true">${SHEET_ICON('<path d="M9.5 6l6 6-6 6"/>')}</span></a></li>`).join("\n")}
        </ul>
      </nav>
      <button class="acct__out" type="button" data-acct-logout>${SHEET_ICON('<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/><path d="M10 8l-4 4 4 4M6 12h9.5"/>')}<span>Log out</span></button>
    </div>
  </div>`;
const icon = (paths) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const current = (page, p) => (page === p ? ' aria-current="page"' : "");
// the theme switch: a moon in the dark theme, a sun in the light one (style.css shows one); in the header, and in the footer on phones
const THEME_ICONS = '<svg class="moon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6z"/></svg>' +
  '<svg class="sun" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
const themeToggle = (cls) => `<button class="${cls}" type="button" data-theme-toggle aria-label="Switch to light mode" aria-pressed="false">${THEME_ICONS}</button>`;

/* ---------------------------------------------------------------- the look of a label set other than today's */
/**
 * What a known label set other than today's changes in the layout besides its labels (BRANDS keys only; today's set and any unknown set
 * have no look, so they build today's layout). Citycoin.dev: the DS-03 assets of public/brand/ (docs/citycoin-master/brand/README.md),
 * the Civic Atlas dark canvas as the theme colour, a web manifest, og:site_name and a Twitter card, and its stylesheet
 * (public/brand/citycoin.css: the lockup per theme, a four-tab bar, the .cc-off hide). The main token is not live (owner amendment 01:
 * MAIN_TOKEN_MINT not supplied), so the Token tab is left out and /token itself answers a plain "not live yet" page (its settings line);
 * the footer's "Check a link" opens the link checker on /official instead (footerLinkTargets; the checker is on /official in that label
 * set, review finding F9). The social image needs an absolute address, so og:image and
 * twitter:image are written only once SITE_ORIGIN (src/site-config.js) names a host other than the legacy ones: never a link that names
 * the old host, and never one to a host that does not serve the site.
 * A look's pages also carry the label set on <html>: data-brand (its key), data-brand-name (productName) and data-brand-domain (domain).
 * The client scripts read the product's names there (their brand`…` texts, area b of the label migration), so the labels have one source,
 * src/brand.js; today's pages carry none of the three, and the scripts then show their own words exactly as written.
 */
export const LOOKS = Object.freeze({
  citycoin: Object.freeze({
    themeColor: "#071426",
    stylesheet: "brand/citycoin",
    icons: [
      '<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">',
      '<link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png">',
      '<link rel="apple-touch-icon" href="/brand/apple-touch-icon-180.png">',
      '<link rel="manifest" href="/brand/citycoin.webmanifest">',
    ],
    ogImage: { path: "/brand/og-default-1200x630.png", width: 1200, height: 630 },
    // the header's lockup, one file per theme (citycoin.css shows the one for data-theme); the link's aria-label names it
    header: [
      '<img class="brand__lockup brand__lockup--dark" src="/brand/citycoin-lockup-dark.svg" alt="" width="149" height="28">',
      '<img class="brand__lockup brand__lockup--light" src="/brand/citycoin-lockup.svg" alt="" width="157" height="28">',
    ],
    footerIcon: "/brand/favicon.svg",
    hiddenTabs: ["token"],
    footerLinkTargets: Object.freeze({ "/token#check": "/official#check" }),
  }),
});
/** The look of a label set: LOOKS[key] for a known label set other than today's, else null (today's layout). */
export const lookOf = (brand) => (brand && typeof brand.key === "string" && brand.key !== "" && Object.hasOwn(BRANDS, brand.key) && Object.hasOwn(LOOKS, brand.key) ? LOOKS[brand.key] : null);

const FOOTER_LINKS = [["/terms", "Terms"], ["/rules", "Rules"], ["/official", "Official addresses"], ["/credits", "Data"], ["/token#check", "Check a link"]];

/** The head lines a look adds after og:type: og:site_name, the Twitter card (with the social image once SITE_ORIGIN allows it), the icons. */
function lookHead(look, B, fullTitle, description, site) {
  const image = site && site.origin && !LEGACY_HOSTS.includes(site.host) ? `${site.origin}${look.ogImage.path}` : null;
  return [
    `  <meta property="og:site_name" content="${B.productName}">`,
    ...(image ? [
      `  <meta property="og:image" content="${esc(image)}">`,
      `  <meta property="og:image:width" content="${look.ogImage.width}">`,
      `  <meta property="og:image:height" content="${look.ogImage.height}">`,
      `  <meta property="og:image:alt" content="${B.productName} logo">`,
    ] : []),
    `  <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `  <meta name="twitter:title" content="${fullTitle}">`,
    `  <meta name="twitter:description" content="${description}">`,
    ...(image ? [`  <meta name="twitter:image" content="${esc(image)}">`] : []),
    ...look.icons.map((l) => `  ${l}`),
  ].join("\n");
}

// The official social accounts (rule R3: only real ones): src/official.js socialProfiles() becomes one round icon link each in the
// footer (src/footer-social.js, shared with the Worker's response-time rewrite), so a new network shows on the next build the moment
// it is listed there; a network without an icon shows its name. With MAIN_TOKEN_V5 off that is SOCIAL_PROFILES, as before.
// `L`: the labels of src/brand.js brandLabels(), made from an escaped label set (escBrand below), so each is safe in markup as it is;
// `B`: that escaped label set itself; `look`: lookOf(brand) (null: today's layout, byte for byte); `site`: src/site-config.js siteConfig
function layout({ title, description, page, nav: navPage = page, scripts = [], styles = [], main = "", noindex = false }, body, L, socials, { B, look = null, site = null } = {}) {
  const nav = HEADER_NAV.map(([p, href, label]) => `        <a href="${href}"${current(navPage, p)}>${label}</a>`).join("\n");
  const tabs = TABS.filter(([p]) => !look || !look.hiddenTabs.includes(p)).map(([p, href, label, paths]) => `    <a href="${href}"${current(navPage, p)}>${navPage === p ? '<span class="tabbar__ind" aria-hidden="true"></span>' : ""}${icon(paths)}<span>${label}</span></a>`).join("\n");
  // feedback.js (the floating Feedback / Support widget) runs last on every page: it needs window.V from site.js and nothing else needs it
  const js = ["site", ...scripts, "feedback"].map((s) => `  <script src="/${s}.js" defer></script>`).join("\n");
  const fullTitle = page === "home" ? L.homeTitle : L.pageTitle(title);
  const css = [...styles, ...(look ? [look.stylesheet] : [])];
  const footerLinks = FOOTER_LINKS.map(([href, text]) => `<a href="${look && Object.hasOwn(look.footerLinkTargets, href) ? look.footerLinkTargets[href] : href}">${text}</a>`).join("");
  return `<!doctype html>
<!-- Generated by scripts/pages/build.mjs from scripts/pages/src/${page === "home" ? "index" : page}.html. Edit those, then run: npm run pages -->
<html lang="en"${look ? ` data-brand="${esc(B.key)}" data-brand-name="${B.productName}" data-brand-domain="${B.domain}"` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
${noindex ? '  <meta name="robots" content="noindex, nofollow">\n' : ""}  <meta name="theme-color" content="${look ? look.themeColor : "#070E19"}">
  <meta name="color-scheme" content="dark">
  <meta property="og:title" content="${fullTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
${look ? lookHead(look, B, fullTitle, description, site) : '  <link rel="icon" href="/favicon.svg" type="image/svg+xml">'}
  <link rel="preload" href="/fonts/space-grotesk.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/polish.css">
  <link rel="stylesheet" href="/feedback.css">${css.map((c) => `\n  <link rel="stylesheet" href="/${c}.css">`).join("")}
  <script src="/theme.js"></script>
</head>
<body data-page="${page}">
  <a class="skip" href="#main">Skip to content</a>

  <header class="site-header" data-header>
    <div class="site-header__inner">
      <a class="brand" href="/" aria-label="${L.homeLink}">
${look ? look.header.map((l) => `        ${l}`).join("\n") : `        <img src="/logo.svg" alt="" width="28" height="28">
        <span>${L.headerName}</span>`}
      </a>
      <nav class="nav" aria-label="Main">
${nav}
      </nav>
      <div class="site-header__actions">
        ${themeToggle("theme-toggle")}
        <a class="btn btn--ghost btn--sm account-btn" href="/connect?mode=login" data-account><span class="btn__dot" aria-hidden="true"></span><span data-account-label>Log in</span></a>
        <button class="hdr-avatar" type="button" data-account-avatar aria-haspopup="dialog" aria-expanded="false" aria-controls="acct-panel" aria-label="Profile, account and settings" hidden><span class="hdr-avatar__face" data-account-initial aria-hidden="true"></span></button>
        <a class="btn btn--primary btn--sm hdr-signup has-ring" href="/connect" data-signup>Sign up</a>
      </div>
    </div>
  </header>
${ACCOUNT_SHEET}

  <main id="main"${main ? ` class="${main}"` : ""}>
${body.trimEnd()}
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      <p class="site-footer__copy"><img src="${look ? look.footerIcon : "/logo.svg"}" alt="" width="20" height="20"> ${L.copyright}</p>
      <nav class="site-footer__links" aria-label="Legal and data">
        ${footerLinks}
      </nav>
${socialList(socials, L)}      ${themeToggle("theme-toggle site-footer__theme")}
      <p class="site-footer__safe">${L.safety}</p>
    </div>
  </footer>

  <nav class="tabbar" aria-label="Main (phone)">
${tabs}
  </nav>

  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
${js}
</body>
</html>
`;
}

/* ---------------------------------------------------------------- fills */
/** The settings the Worker runs with: the "vars" of wrangler.jsonc (nothing from this shell, so every build of a commit is the same). */
export const deployedVars = () => settingsFrom({ wranglerPath: new URL("../../wrangler.jsonc", import.meta.url), env: {} });
const solscan = (r) => `https://solscan.io/${r.kind === "token" ? "token" : "account"}/${r.address}`;
/**
 * One address: its label, the address itself, a note, a Copy button (site JS shows it) and its Solscan page (and one more page, e.g. the
 * lock's). Its classes are off-row*, never the bare "addr": that is style.css's round address pill, which would clip the whole row.
 */
function addressRow(r) {
  if (!isSolanaAddress(r.address)) throw new Error(`official addresses: "${r.label}" is not a Solana address (${r.address})`);
  const out = (href, text) => {
    if (!/^https:\/\/[^\s"'<>]+$/.test(href)) throw new Error(`official addresses: "${r.label}" links ${href}`);
    return `<a class="btn btn--ghost btn--sm" href="${href}" target="_blank" rel="noopener">${esc(text)}<span class="sr-only">: ${esc(r.label)} (opens in a new tab)</span></a>`;
  };
  return [
    `            <div class="credits__row off-row" data-address="${r.address}">`,
    `              <dt>${esc(r.label)}</dt>`,
    `              <dd>`,
    `                <p><code class="off-row__value">${r.address}</code></p>`,
    ...(r.note ? [`                <p class="credits__note">${esc(r.note)}</p>`] : []),
    `                <p class="off-row__acts"><button class="btn btn--ghost btn--sm" type="button" data-copy="${r.address}" aria-label="Copy the address (${esc(r.label)})" hidden>Copy</button>${out(solscan(r), "Solscan")}${r.link ? out(r.link.href, r.link.text) : ""}</p>`,
    `              </dd>`,
    `            </div>`,
  ].join("\n");
}
/** Groups of addresses (src/official.js officialAddresses) as the page's sections. */
export const addressSections = (groups) => groups.map((g) => [
  `        <section class="credits__group" aria-labelledby="off-${g.id}">`,
  `          <h2 class="credits__h" id="off-${g.id}">${esc(g.title)}</h2>`,
  `          <dl class="credits__list">`,
  ...g.rows.map(addressRow),
  `          </dl>`,
  `        </section>`,
].join("\n")).join("\n\n");
/**
 * The /official groups for a label set with a look (BRAND=citycoin): the legacy token's own groups are left out (its mint, and the team's
 * lock and wallets, which exist for that token: the site stops showing it, owner directive 24 Oct 2026), the deployed programs keep their
 * addresses without the crate names in the notes (the on-chain names are permanent; rebrand-inventory.md, plan item 4), and the product's
 * name in a note is the label set's. Today's label set: the groups as they are.
 */
export function brandAddressGroups(groups, brand) {
  if (!lookOf(brand)) return groups;
  const note = (n) => (n == null ? n : n.replace(/^vicinity_[a-z_]+\.\s*/, "").replace(/\s*It is also the team's public wallet, listed under Team\./, "")
    .replace(/\bVicinity's\b/g, `${brand.productName}'s`).trim() || null);
  // (MAIN_TOKEN_V5's groups too: its "legacy" group and the team wallets it lists for the legacy token, src/official.js mainTokenAddressGroups)
  return groups.filter((g) => g.id !== "vicinity" && g.id !== "team" && g.id !== "legacy").map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, note: note(r.note) })) }));
}
// the /official groups follow the build's own switch decision (the switch in wrangler.jsonc, which pageSocials accepts only after S48)
const FILLS = { "official-addresses": ({ brand }) => { const vars = deployedVars(); return addressSections(brandAddressGroups(officialAddresses(vars, mainTokenV5On(vars)), brand)); } };
const fill = (f, body, ctx) => body.replace(/<!--@([a-z-]+)-->/g, (_, name) => {
  if (!Object.hasOwn(FILLS, name)) throw new Error(`${f}: unknown fill <!--@${name}-->`);
  return FILLS[name](ctx);
});

/**
 * The page copy while the legacy seats are frozen (stage S16, see the top of this file): `body` (a source without its settings line) with every
 * [old, new] passage of scripts/pages/frozen-copy.mjs for `f` replaced, in order. A passage that is not in the source exactly once stops the
 * build. `table` is for tests.
 */
export function frozenCopy(f, body, table = FROZEN_COPY) {
  const t = Object.hasOwn(table, f) ? table[f] : null;
  if (!t) return body;
  let out = body;
  t.replace.forEach(([old, next], i) => {
    const at = out.indexOf(old);
    if (at < 0 || out.indexOf(old, at + 1) >= 0) throw new Error(`${f}: frozen copy passage ${i + 1} is not in the source exactly once (edit scripts/pages/frozen-copy.mjs with the source)`);
    out = out.slice(0, at) + next + out.slice(at + old.length);
  });
  return out;
}
/**
 * One page's frozen copy (stage S16) for one label set: the description and every [old, new] passage with its brand blocks and label
 * fills resolved like the source (brandBlocks, brandFill), so a passage matches the source as the build reads it for that label set. A
 * passage that resolves to nothing on both sides is not that label set's (its words are in a brand block the set does not build) and is
 * left out; an entry with `labelSets` applies only to those label sets (the Citycoin.dev token page is the plain "not live yet" page, with
 * none of the token page's passages). With today's label set every passage of the table resolves to today's words, so today's frozen build
 * is S16's, byte for byte.
 */
export function frozenFor(f, entry, brand, B = escBrand(brand)) {
  if (!entry) return null;
  const key = brand && typeof brand.key === "string" ? brand.key : "";
  if (entry.labelSets && !entry.labelSets.includes(key)) return null;
  const as = (t) => brandFill(f, brandBlocks(f, t, brand), B);
  return {
    description: entry.description == null ? entry.description : as(entry.description),
    replace: entry.replace.map(([old, next]) => [as(old), as(next)]).filter(([old, next]) => old !== "" || next !== ""),
  };
}

/* ---------------------------------------------------------------- brand blocks and label fills (see the top of this file) */
const BLOCK = /<!--@(if !?[a-z0-9-]+|else|end)-->/g;
/**
 * A page source's text for one label set: each <!--@if key-->…<!--@else-->…<!--@end--> block keeps the part for `brand` (key: a
 * BRANDS key other than today's ""; "!key" negates). A marker alone on its line is removed with its line; any other marker is removed in
 * place. A malformed block (unknown key, nesting, a stray else or end, an unclosed if) stops the build.
 */
export function brandBlocks(f, text, brand) {
  const key = brand && typeof brand.key === "string" ? brand.key : "";
  // a marker that looks like a brand block but is not one would otherwise ship as an HTML comment, in today's pages too
  for (const m of text.matchAll(/<!--@(?:if|else|end)\b(?:(?!-->)[\s\S])*-->/g)) if (!/^<!--@(if !?[a-z0-9-]+|else|end)-->$/.test(m[0])) throw new Error(`${f}: malformed brand marker ${m[0]}`);
  let out = "", at = 0, open = null; // open: { keep: boolean, inElse: boolean }
  const keeping = () => !open || (open.inElse ? !open.keep : open.keep);
  for (const m of text.matchAll(BLOCK)) {
    // the marker is alone on its line when only spaces or tabs stand between it and the line's start (not consumed already) and its end
    const lineStart = text.lastIndexOf("\n", m.index - 1) + 1, after = m.index + m[0].length;
    const trail = /^[ \t]*\n/.exec(text.slice(after));
    const own = lineStart >= at && /^[ \t]*$/.test(text.slice(lineStart, m.index)) && trail !== null;
    const start = own ? lineStart : m.index;
    const end = own ? after + trail[0].length : after;
    if (keeping()) out += text.slice(at, start);
    at = end;
    const d = m[1];
    if (d.startsWith("if ")) {
      if (open) throw new Error(`${f}: a brand block inside a brand block (<!--@${d}-->)`);
      const neg = d[3] === "!", name = d.slice(neg ? 4 : 3);
      if (!name || name === "" || !Object.hasOwn(BRANDS, name)) throw new Error(`${f}: <!--@${d}--> names no label set of src/brand.js`);
      open = { keep: (key === name) !== neg, inElse: false };
    } else if (d === "else") {
      if (!open || open.inElse) throw new Error(`${f}: <!--@else--> outside a brand block`);
      open.inElse = true;
    } else {
      if (!open) throw new Error(`${f}: <!--@end--> outside a brand block`);
      open = null;
    }
  }
  if (open) throw new Error(`${f}: a brand block is not closed with <!--@end-->`);
  return out + text.slice(at);
}
const LABEL_FIELDS = ["productName", "shortName", "domain", "siteLabel", "tagline"];
/** {{field}} → the field of the (escaped) label set `B`; an unknown field or a stray "{{" stops the build. */
export function brandFill(f, text, B) {
  const out = String(text).replace(/\{\{([A-Za-z]+)\}\}/g, (_, name) => {
    if (!LABEL_FIELDS.includes(name)) throw new Error(`${f}: unknown label {{${name}}}`);
    return B[name];
  });
  if (out.includes("{{") || out.includes("}}")) throw new Error(`${f}: a label fill is not of the form {{name}}`);
  return out;
}
/**
 * A page source as the build reads it for one label set (default: today's, BRAND unset): its brand blocks and label fills resolved, the
 * settings line's labels filled in; no layout and no data fills. For tests and tools that read a page's own words from scripts/pages/src.
 */
export function sourceAs(f, text, brand = BRANDS[""]) {
  const nl = text.indexOf("\n"), line = nl < 0 ? text : text.slice(0, nl), body = nl < 0 ? "" : text.slice(nl + 1), B = escBrand(brand);
  const head = line.replace(/\{\{([A-Za-z]+)\}\}/g, (all, name) => (LABEL_FIELDS.includes(name) ? brand[name] : all));
  return `${head}${nl < 0 ? "" : "\n"}${brandFill(f, brandBlocks(f, body, brand), B)}`;
}
/** HTML comments out of a built page body (a look's pages: what the source explains is for the people who edit it). */
const stripComments = (body) => body.replace(/^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*\n/gm, "").replace(/<!--(?:(?!-->)[\s\S])*-->/g, "");
/** Every built page that still says "vicinity" in any letter case: [{ file, count, first }] (empty when none does). */
export function brandResidue(pages) {
  const out = [];
  for (const [file, html] of pages) {
    const hits = html.match(/vicinity/gi);
    if (hits) { const i = html.search(/vicinity/i); out.push({ file, count: hits.length, first: html.slice(Math.max(0, i - 60), i + 40).replace(/\s+/g, " ") }); }
  }
  return out;
}

/** The label set the pages are built with: BRAND from wrangler.jsonc (never from this shell). An unknown value stops the build. */
export function pageBrand(vars = deployedVars()) {
  const b = brandFromSettings(vars);
  if (b.problem) throw new Error(`BRAND=${JSON.stringify(vars.BRAND)} is not a label set of src/brand.js (${b.problem})`);
  return b;
}
/**
 * The official social accounts the footers are built with: src/official.js socialProfiles() for the settings of wrangler.jsonc (never this
 * shell). MAIN_TOKEN_V5 off: SOCIAL_PROFILES, today's footer byte for byte. MAIN_TOKEN_V5=on in wrangler.jsonc stops the build until the
 * brand rollout exists (owner amendment 01 section 3: the switch "rolls out with the brand rollout (BRAND=citycoin, stage S48) or after
 * it"): the pages still name $VICINITY as the token (the token page's copy, its 60M lock card, the client scripts' labels), so building
 * them under the switch would show $VICINITY wording next to the new mint. It also stops the build, first, while the Worker would refuse
 * the switch (a refused MAIN_TOKEN_MINT or link, or a refused v5 configuration): pages are never built for a switch that does not count at
 * run time. Tests build the switched footers with `socials`.
 * With a label set that has a look (BRAND=citycoin) and MAIN_TOKEN_V5 off there is no official account at all: the former X account is
 * today's brand's (amendment 01 refuses it as the new official link), and the configured ones (OFFICIAL_X_URL, OFFICIAL_TELEGRAM_URL) are
 * shown only once the main-token switch counts, the day their verification is re-run (amendment 01 section 4.3; section 4.4: "before any
 * switch shows it", a person checks the account and a second person signs off). OFFICIAL_X_URL is configured since main ec1e838 with an
 * incomplete record, so a footer icon here would present an unverified account as official. The list is empty: no footer icons, and the
 * page's other links to the former account are taken out.
 * MAIN_TOKEN_V5=on still stops the build under BRAND=citycoin while MAIN_TOKEN_PAGES is false: the token page and the client scripts do
 * not show the configured main token yet (they are the main-token stage's).
 */
export const MAIN_TOKEN_PAGES = false;
export function pageSocials(vars = deployedVars(), brand = pageBrand(vars)) {
  if (!mainTokenV5On(vars)) return lookOf(brand) ? [] : socialProfiles(vars, false);
  const refused = [...(deploymentAccepted(vars) ? [] : ["MAIN_TOKEN_V5_CONFIG_REFUSED"]), ...policyConfig(vars).errors.map((e) => e.code)];
  if (refused.length) throw new Error(`MAIN_TOKEN_V5=on in wrangler.jsonc with a configuration the Worker refuses (${[...new Set(refused)].join(", ")}): the pages are not built for a switch that does not count`);
  const b = brandFromSettings(vars);
  if (b.problem || b.value === "") throw new Error("MAIN_TOKEN_V5=on in wrangler.jsonc: the main-token switch rolls out with or after the brand rollout (BRAND=citycoin, stage S48); the pages still name $VICINITY as the token");
  if (!MAIN_TOKEN_PAGES) throw new Error("MAIN_TOKEN_V5=on in wrangler.jsonc: the main-token switch rolls out after the main-token pages (label migration S48): the token page and the client scripts do not show the configured main token yet");
  return socialProfiles(vars, true);
}

/** The assets block of wrangler.jsonc (whole-line comments and trailing commas stripped, as settingsFrom reads the vars). */
export const deployedAssets = () => JSON.parse(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")
  .replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).assets || {};
/**
 * Whether every page reaches the Worker: wrangler.jsonc's assets block has run_worker_first true, or a list that holds "/*" and no negative
 * ("!") pattern (the same routing). Today it lists only /api/*, /coin-meta/* and /official-coins.csv, so the pages are served straight from
 * the static assets (no Worker request) and this is false. HOST_REDIRECT
 * (stage S03) answers pages on the old hosts with a 308 from the Worker, so HOST_REDIRECT=on in wrangler.jsonc stops the build unless the
 * pages reach the Worker and the Worker would accept the switch (the same rule as MAIN_TOKEN_V5 above: never deploy a switch that does not
 * count). A HOST_REDIRECT set only in the Cloudflare dashboard is refused at run time instead (src/v5policy.js hostRedirectRefusals).
 */
export function pageRouting(vars = deployedVars(), assets = deployedAssets()) {
  const first = assets ? assets.run_worker_first : undefined;
  const pagesReachWorker = first === true || (Array.isArray(first) && first.includes("/*") && !first.some((p) => String(p).startsWith("!")));
  if (hostRedirectOn(vars)) {
    const refused = [...(pagesReachWorker ? [] : ["HOST_REDIRECT_PAGES_BYPASS_WORKER"]), ...(siteConfig(vars).configured ? [] : ["HOST_REDIRECT_SITE_REFUSED"]),
      ...policyConfig(vars).errors.map((e) => e.code)];
    if (refused.length) throw new Error(`HOST_REDIRECT=on in wrangler.jsonc with a configuration the Worker refuses (${[...new Set(refused)].join(", ")}): the old-host redirect needs "run_worker_first": true in the assets block, SITE_ORIGIN=https://citycoin.dev in SITE_ORIGINS and DEPLOYMENT_ENV`);
  }
  return { pagesReachWorker };
}

/**
 * The legacy link window (stage S14): LEGACY_LINK=on in wrangler.jsonc stops the build unless the Worker would open the window, that is unless the
 * v5 configuration check accepts the settings (WALLET_ONLY=on with DEPLOYMENT_ENV, SITE_ORIGIN and SITE_ORIGINS; LEGACY_LINK_UNTIL present and an
 * ISO date: LEGACY_LINK_WITHOUT_WALLET_ONLY, MISSING_LEGACY_LINK_UNTIL, LEGACY_LINK_UNTIL_INVALID...) and LEGACY_LINK_UNTIL is still ahead of
 * `now` (LEGACY_LINK_UNTIL_PASSED: a date in the past never opens a window). The same rule as MAIN_TOKEN_V5 and HOST_REDIRECT: never deploy a
 * switch that does not count. After the window, the configuration takes LEGACY_LINK off and may keep LEGACY_LINK_UNTIL: the Worker keeps
 * answering 410 for the legacy routes (src/v5policy.js legacyLink "closed"), and this check has nothing to refuse. A LEGACY_LINK set only in the
 * Cloudflare dashboard is refused at run time instead (src/v5policy.js legacyLinkRefusals, logged once per isolate).
 */
export function pageLegacyLink(vars = deployedVars(), now = Date.now()) {
  // a LEGACY_LINK_UNTIL in the past stops the build whatever LEGACY_LINK says (review finding SEC-4: a mistyped year prepared ahead of the window
  // must never reach the Worker). After a window, the configuration pull request removes LEGACY_LINK and LEGACY_LINK_UNTIL together.
  const until = legacyLinkUntil(vars);
  if (!legacyLinkOn(vars)) {
    if (until !== null && until <= now) throw new Error("LEGACY_LINK_UNTIL in wrangler.jsonc is in the past (LEGACY_LINK_UNTIL_PASSED): a date that has passed never opens a window; remove it (after a window, remove LEGACY_LINK and LEGACY_LINK_UNTIL together) or set a date that is still ahead");
    return { legacyLink: false };
  }
  const refused = [...policyConfig(vars).errors.map((e) => e.code), ...(until !== null && until <= now ? ["LEGACY_LINK_UNTIL_PASSED"] : [])];
  if (refused.length) throw new Error(`LEGACY_LINK=on in wrangler.jsonc with a configuration the Worker refuses (${[...new Set(refused)].join(", ")}): the legacy link window needs WALLET_ONLY=on, DEPLOYMENT_ENV, SITE_ORIGIN and SITE_ORIGINS, and LEGACY_LINK_UNTIL as an ISO date that is still ahead`);
  return { legacyLink: true, until: new Date(until).toISOString() };
}

/**
 * Every v5 switch and input in wrangler.jsonc (review finding SEC-1): the build stops on any error the v5 configuration check names (an
 * OFFICIAL_X_URL typo, a malformed MAIN_TOKEN_MINT, a missing DEPLOYMENT_ENV...), and on WALLET_ONLY=on that the Worker would refuse (it would fail
 * closed: sign-in answering 503). With none of them set (today) there is nothing to check. Values set only in the Cloudflare dashboard are
 * checked at run time instead (logged once per isolate) and must be confirmed by the deploy checklist.
 */
export function pageV5Config(vars = deployedVars()) {
  const refused = [...policyConfig(vars).errors.map((e) => e.code), ...(walletOnlyOn(vars) ? walletOnlyRefusals(vars) : [])];
  if (refused.length) throw new Error(`wrangler.jsonc has v5 settings the Worker refuses (${[...new Set(refused)].join(", ")}): fix them before the pages are built`);
  return { ok: true };
}

/**
 * The legacy seat freeze the pages are built with (stage S16): { legacySeats: "frozen" } when wrangler.jsonc sets LEGACY_SEATS=frozen (trimmed,
 * any letter case, as the Worker reads it), else { legacySeats: "on" }, today's pages. Frozen, the build stops unless the Worker would accept
 * the switch's own inputs (LEGACY_SEATS_POLICY_REFUSED: DEPLOYMENT_ENV unset or unknown, src/v5policy.js LEGACY_SEATS_CODES); pageV5Config
 * stops it on any other v5 error. A value outside the switch's set ("off", "true") is refused there by name (FLAG_VALUE_INVALID). Never from
 * this shell.
 */
export function pageLegacySeats(vars = deployedVars()) {
  if (!legacySeatsFrozenOn(vars)) return { legacySeats: "on" };
  const own = policyConfig(vars).errors.filter((e) => LEGACY_SEATS_CODES.includes(e.code) || e.path === "deployment.flags.LEGACY_SEATS").map((e) => e.code);
  if (own.length) throw new Error(`LEGACY_SEATS=frozen in wrangler.jsonc with a configuration the Worker refuses (LEGACY_SEATS_POLICY_REFUSED: ${[...new Set(own)].join(", ")}): the legacy seat freeze needs DEPLOYMENT_ENV`);
  return { legacySeats: "frozen" };
}

/**
 * What a label set with a look (BRAND=citycoin) needs in wrangler.jsonc before its pages are built (review findings F3, CRAWL-2 and F7 of
 * the rebrand stage); { ok: true } when BRAND names today's label set, which needs nothing. The build stops otherwise, so the configuration
 * pull request that turns the brand on carries everything at once:
 *   LEGACY_SEATS=frozen   the old founder rules (the Stake Ladder, the seven-day hold, the holder thresholds) were rules of the legacy token,
 *                         which that site shows nowhere, and the new token is not live: with the freeze (stage S16) no page, script or
 *                         answer presents them as current, and none restates them in a token that has no supply yet (the pages are built
 *                         with scripts/pages/frozen-copy.mjs; the Worker holds the freeze because src/pages-built.js records it)
 *   EMAIL_FROM            set, and without the old name: under that label set the Worker never sends from a sender that shows the old
 *                         name (src/mail.js senderShowsOldName) and turns e-mail off instead, while the pages (the home FAQ, the Terms,
 *                         /connect) still offer an e-mail address as a way in. A Gmail sender (GMAIL_USER, a secret) is not visible here:
 *                         the deploy checklist checks it.
 * Values set only in the Cloudflare dashboard are not seen here: src/pages-built.js keeps the freeze held at run time, and src/mail.js keeps
 * e-mail off under a sender of the old name.
 */
export function pageBrandPrerequisites(vars = deployedVars()) {
  const b = pageBrand(vars);
  if (!lookOf(b)) return { ok: true };
  const missing = [];
  if (pageLegacySeats(vars).legacySeats !== "frozen") missing.push("LEGACY_SEATS=frozen (with DEPLOYMENT_ENV): the old founder rules belong to the legacy token");
  const from = typeof vars.EMAIL_FROM === "string" ? vars.EMAIL_FROM.trim() : "";
  if (!from || /vicinity/i.test(from)) missing.push(`EMAIL_FROM without the old name (it is ${from ? JSON.stringify(from) : "unset"}): the pages offer e-mail sign-in, which the Worker turns off under a sender of the old name`);
  if (missing.length) throw new Error(`BRAND=${b.key} in wrangler.jsonc needs, in the same pull request: ${missing.join("; ")}`);
  return { ok: true };
}

export const PAGES_BUILT_FILE = fileURLToPath(new URL("../../src/pages-built.js", import.meta.url));
/**
 * The text of src/pages-built.js for these settings: whether the pages carry MAIN_TOKEN_V5 (only once pageSocials accepts it, so never
 * before the brand rollout), the label set they were built with, and whether they reach the Worker (pageRouting). The Worker counts
 * MAIN_TOKEN_V5 only while this says the pages have it and BRAND is the same label set, and HOST_REDIRECT only while the pages reach it,
 * so a switch or a BRAND set only in the Cloudflare dashboard never changes the site.
 */
export function pagesBuiltSource(vars = deployedVars(), assets = deployedAssets()) {
  pageSocials(vars); // refuses MAIN_TOKEN_V5 before the brand rollout
  pageBrandPrerequisites(vars); // refuses BRAND=citycoin without the freeze and a sender of the new name
  const { pagesReachWorker } = pageRouting(vars, assets); // refuses HOST_REDIRECT=on while the pages bypass the Worker
  const built = { mainTokenV5: mainTokenV5On(vars), brand: pageBrand(vars).value, pagesReachWorker };
  // the legacy seat freeze (stage S16): recorded only when the pages carry it, so the file of pages built without it is the same bytes as before
  const frozen = pageLegacySeats(vars).legacySeats === "frozen";
  return [
    "// Written by scripts/pages/build.mjs from the settings of wrangler.jsonc; do not edit (test/build-parity.test.js checks it).",
    "// What the deployed pages in public/ were built with, and whether wrangler.jsonc sends them through the Worker (run_worker_first true).",
    "// src/v5policy.js counts MAIN_TOKEN_V5 only when mainTokenV5 is true here, and HOST_REDIRECT only when pagesReachWorker is true.",
    ...(frozen ? ["// legacySeats \"frozen\": built with LEGACY_SEATS=frozen (no old founder copy); src/v5policy.js holds the freeze if the Worker's setting differs."] : []),
    `export const PAGES_BUILT = Object.freeze({ mainTokenV5: ${built.mainTokenV5}, brand: ${JSON.stringify(built.brand)}, pagesReachWorker: ${built.pagesReachWorker}${frozen ? ', legacySeats: "frozen"' : ""} });`,
    "",
  ].join("\n");
}

/** A page's settings for one label set: its own, with the "brand" entry for that set (a look's only) put over them. */
export function settingsFor(f, settings, brand) {
  const { brand: perBrand, ...own } = settings;
  if (perBrand !== undefined) {
    if (!perBrand || typeof perBrand !== "object" || Array.isArray(perBrand)) throw new Error(`${f}: "brand" must be an object of label sets`);
    for (const k of Object.keys(perBrand)) if (k === "" || !Object.hasOwn(BRANDS, k)) throw new Error(`${f}: "brand" names no label set of src/brand.js (${k})`);
  }
  return lookOf(brand) && perBrand && Object.hasOwn(perBrand, brand.key) ? { ...own, ...perBrand[brand.key] } : own;
}

function build(standalone, brand, socials, site, legacySeats, { allowResidue = false } = {}) {
  const B = escBrand(brand), L = brandLabels(B), look = lookOf(brand);
  if (legacySeats !== "on" && legacySeats !== "frozen") throw new Error(`legacySeats must be "on" or "frozen" (got ${JSON.stringify(legacySeats)})`);
  const frozen = legacySeats === "frozen";
  const out = [];
  for (const f of readdirSync(SRC).filter((x) => x.endsWith(".html")).sort()) {
    const src = readFileSync(SRC + f, "utf8").replace(/\r\n/g, "\n");
    const m = src.match(/^<!--(\{.*\})-->\n/);
    if (!m) throw new Error(`${f}: first line must be <!--{settings}-->`);
    const settings = settingsFor(f, JSON.parse(m[1]), brand);
    if (Boolean(settings.standalone) !== standalone) continue;
    // the legacy seats frozen (stage S16): the page's frozen description and copy, resolved for the label set; otherwise the source as it is
    const fz = frozen && Object.hasOwn(FROZEN_COPY, f) ? frozenFor(f, FROZEN_COPY[f], brand, B) : null;
    if (fz && fz.description) settings.description = fz.description;
    for (const k of ["title", "description"]) if (typeof settings[k] === "string") settings[k] = brandFill(f, settings[k], B);
    const own = brandFill(f, brandBlocks(f, src.slice(m[0].length), brand), B);
    let body = fill(f, fz ? frozenCopy(f, own, { [f]: fz }) : own, { brand });
    if (look) body = stripComments(body);
    const html = layout(settings, body, L, socials, { B, look, site });
    // other configured lists (MAIN_TOKEN_V5 on): the page's other links to the former X account follow too (the dashboard's "Contact us on
    // X"), by the same function the Worker rewrites with, so a built page and a rewritten one are the same bytes; today's list: untouched
    out.push([f, socials === SOCIAL_PROFILES ? html : rewriteSocialLinks(html, socials, L)]);
  }
  // a look's pages are never shipped half renamed: one "vicinity" left in any page stops the build (tests read the list with allowResidue)
  const residue = look && !allowResidue ? brandResidue(out) : [];
  if (residue.length) throw new Error(`BRAND=${brand.key}: these pages still say "vicinity": ${residue.map((r) => `${r.file} (${r.count}: …${r.first}…)`).join("; ")}`);
  return out;
}

/** The main pages: [output file, html]. `brand` (a label set of src/brand.js shape), `socials` (profiles of src/official.js socialProfiles
 *  shape), `site` (src/site-config.js siteConfig shape), `legacySeats` ("on" or "frozen") and `allowResidue` are for tests; the defaults are
 *  pageBrand(), pageSocials() for that label set, siteConfig() of wrangler.jsonc and pageLegacySeats(), except that a label set with a look
 *  is built with the freeze unless a test asks otherwise: it ships only with it (pageBrandPrerequisites). */
const opts = ({ brand, socials, site, legacySeats, allowResidue } = {}, standalone) => {
  const b = brand ?? pageBrand();
  const seats = legacySeats ?? (lookOf(b) ? "frozen" : pageLegacySeats().legacySeats);
  return build(standalone, b, socials ?? pageSocials(deployedVars(), b), site ?? siteConfig(deployedVars()), seats, { allowResidue });
};
export const buildPages = (o) => opts(o, false);
/** Pages that carry "standalone": true (see the top of this file). */
export const buildStandalonePages = (o) => opts(o, true);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  pageRouting(); // stops before any page is written when wrangler.jsonc sets HOST_REDIRECT=on without the pages reaching the Worker
  pageLegacyLink(); // and when it sets LEGACY_LINK=on without a window the Worker would open (stage S14), or a past LEGACY_LINK_UNTIL
  pageV5Config(); // and on any v5 switch or input the Worker would refuse (review finding SEC-1)
  pageLegacySeats(); // and on LEGACY_SEATS=frozen whose own inputs the Worker would refuse (stage S16)
  pageBrandPrerequisites(); // and on BRAND=citycoin without LEGACY_SEATS=frozen and an EMAIL_FROM of the new name (rebrand findings F3, F7)
  for (const [f, html] of [...buildPages(), ...buildStandalonePages()]) { writeFileSync(OUT + f, html); console.log("page ready:", f); }
  writeFileSync(PAGES_BUILT_FILE, pagesBuiltSource());
  console.log("ready: src/pages-built.js");
}
