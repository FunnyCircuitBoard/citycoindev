/**
 * The editions of the Rules and of the Terms of Use: which version of each text the deployed site publishes, records and asks people to accept
 * (rebrand owner decision 2, review finding F4; the owner's go of 25 Oct 2026, in writing: "I still see nothing on Citycoin.dev. Vicinity still
 * active. What are you doing? Get them all sorted. Don't wait for my permission just go ahead and execute all the changes.").
 *
 * The texts are in the deployed pages (/rules, /terms), so an edition belongs to the label set those pages were built with: src/brand.js brandOf
 * reads it from src/pages-built.js, whatever BRAND says in the Worker's settings (a BRAND set only in the Cloudflare dashboard changes no page,
 * so it changes no version either). One edition, one text: the Citycoin.dev pages are built only together with the legacy seat freeze and
 * wallet-only sign-in (scripts/pages/build.mjs pageBrandPrerequisites), which their Rules and Terms describe.
 *
 *   ""         today's pages        Rules version 6, in effect since 2026-10-16; Terms of Use version 2026-10-01
 *   citycoin   the Citycoin.dev     Rules version 7 and Terms of Use version 2026-10-25, both in effect since 25 Oct 2026 (the Citycoin.dev
 *              pages                names, Terms passages T1 to T4, the frozen founder rules and wallet-only sign-in)
 *
 * Old records keep the version they were made under and stay readable as they are: an account's users.terms_version (an account that agreed to
 * an earlier Terms version is asked to confirm the current one by the quiet bar of public/site.js, never blocked), and the policy number of a
 * seat, election or snapshot. Nothing is rewritten.
 */
import { BRANDS, brandOf } from "./brand.js";
import { POLICY } from "./policy.js";

/** The Terms of Use version of today's pages (src/signup-core.js TERMS_VERSION is this constant). */
export const TERMS_TODAY = "2026-10-01";

export const EDITIONS = Object.freeze({
  "": Object.freeze({ rules: Object.freeze({ version: POLICY.version, effectiveAt: POLICY.effectiveAt }), terms: TERMS_TODAY }),
  citycoin: Object.freeze({ rules: Object.freeze({ version: 7, effectiveAt: "2026-10-25" }), terms: "2026-10-25" }),
});

/** The edition of a label set key ("" or a BRANDS key); today's for anything else. */
export const editionFor = (key) => (typeof key === "string" && Object.hasOwn(EDITIONS, key) && Object.hasOwn(BRANDS, key) ? EDITIONS[key] : EDITIONS[""]);
/** The edition the deployed pages carry (their label set). `env` is optional: only the pages decide. */
export const edition = (env) => editionFor(brandOf(env).key);
/** The Terms of Use version a new account accepts and the site shows ("2026-10-01" for today's pages). */
export const termsVersion = (env) => edition(env).terms;
/** The Rules' version and effective date ({ version, effectiveAt }): /api/policy, /api/me and the version a decision is recorded under. */
export const rulesEdition = (env) => edition(env).rules;
/** The Rules' version number alone (6 for today's pages). */
export const rulesVersion = (env) => rulesEdition(env).version;
