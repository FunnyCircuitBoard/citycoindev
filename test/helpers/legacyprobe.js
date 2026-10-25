// The legacy token's answers of the Worker (the label migration, area d), gathered from one source tree: the official list, its
// addresses, the social accounts, the link checker over a fixed set of inputs, the main-token mint and cache tag, the badge texts, the
// portfolio's and Send's allow-lists, the swap's token list, the coin page's allow-list, the balance history's day key and /api/policy.
// test/build-parity.test.js runs it on this tree with BRAND unset (and with a BRAND the pages were not built with) and compares a sha256 of
// the answers with the same run on the c5df86a tree (the live site when the label migration started): today's answers, byte for byte.
// Nothing here reads the network or a database: every answer is the one a Worker gives without them.

/** The settings the answers are gathered with: the live mint, the Launchpad list and the swap on (as wrangler.jsonc has them). */
export const LEGACY_MINT = "2aVkhRfAEm44tMhFo8oamWvumGGvweFqnUwukRMBkray";
export const PROBE_ENVS = Object.freeze([
  Object.freeze({ VICINITY_MINT: LEGACY_MINT, LAUNCHPAD_V2: "on", SWAP: "on" }),
  Object.freeze({}), // before any mint: the "not launched" answers
]);
const TEAM = ["13qRam63xqqd8KNUoAmHWQu7ro71oHqEsYHYaG5MsRiN", "8dQ5Rb2Y7jYWCEgyKKVMrhboEgMFvFXKNZw1KBeCxP5"];
const LOCK = "CnRn4NiHSfezUHxh7EUytzcoJv98yeH5CpbCgsvyejB6";
const OTHER = "So11111111111111111111111111111111111111112";
/** What a visitor may paste into the link checker: the legacy mint, the team's wallets and lock, the former X account, market links,
 *  the site's own hosts, a look-alike, a code host, another address, nothing, and words. */
export const CHECK_INPUTS = Object.freeze([
  LEGACY_MINT, ...TEAM, LOCK, `https://lock.jup.ag/escrow/${LOCK}`, `http://lock.jup.ag/escrow/${LOCK}`,
  "@VicinityCitySOL", "@vicinitycitysol", "@SomeoneElse", "https://x.com/VicinityCitySOL", "https://twitter.com/VicinityCitySOL/status/1", "https://x.com/someone", "https://x.com/",
  `https://raydium.io/launchpad/token/?mint=${LEGACY_MINT}`, `https://jup.ag/swap/SOL-${LEGACY_MINT}`, `https://dexscreener.com/solana/${LEGACY_MINT}`,
  `https://solscan.io/token/${LEGACY_MINT}`, `https://raydium.io/launchpad/token/?mint=${OTHER}`, "https://jup.ag/",
  "vicinity.city", "https://vicinity.city/dashboard", "http://vicinity.city", "vicinitycity.net", "https://www.vicinity.city", "vicin1ty-claim.app",
  "citycoin.dev", "https://example.org", "https://github.com/someone/repo", OTHER, "", "   ", "hello there",
]);

/** A database with no rows at all: every statement answers nothing (the coin page's lookup of a recorded city coin finds none). */
const NONE = { bind() { return NONE; }, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) };
const EMPTY_DB = Object.freeze({ prepare: () => NONE, batch: async (list) => list.map(() => ({ results: [], meta: { changes: 0 } })), exec: async () => ({}) });

/** The answers of the source tree at `root` (a file: URL of the folder that holds src/) for `env`, as one JSON-able object. */
export async function probe(root, env) {
  const at = (p) => import(new URL(p, root).href);
  const [O, ME, PF, WS, SW, C, L, P, I, S] = await Promise.all(["src/official.js", "src/me.js", "src/portfolio.js", "src/walletsend.js", "src/swap.js",
    "src/coin.js", "src/ledger.js", "src/policy.js", "src/index.js", "src/solana.js"].map(at));
  const now = Date.parse("2026-10-24T12:00:00Z");
  const noNet = async () => { throw new Error("no network in the probe"); };
  const u = (o) => ({ early: 1, wallet: null, home_city: null, badges: null, ...o });
  const out = {
    official: O.officialFor(env), withMint: O.withMint(env), addresses: O.officialAddresses(env), socials: O.socialProfiles(env),
    tokenMint: O.tokenMint(env) ?? null, cacheTag: O.mainCacheTag(env),
    check: CHECK_INPUTS.map((q) => O.checkOfficial(q, S.isSolanaAddress, env)),
    // the badge texts as /api/me gives them before and after launch (the unit is the one src/me.js passes for this environment)
    badges: [false, true].map((launched) => ME.badgesFor({ u: u({ wallet: launched ? TEAM[0] : null }), launched, amount: launched ? 2_000_000 : 0, position: null, seat: null,
      manager: false, admin: false, checkins: 0, posts: 0, tenure: null, threshold: 150_000 })),
    mints: (await PF.mintsFor(env, { now })).list ?? (await PF.mintsFor(env, { now })),
    assets: await WS.supportedAssets(env, now),
    swapConfig: await (await SW.handleSwapConfig(env, noNet, now)).json(),
    // the legacy mint on the coin page: allow-listed by the settings, or else looked up among the recorded city coins (an empty database)
    coinLegacy: await C.allowListed({ ...env, DB: EMPTY_DB }, LEGACY_MINT),
    dayKey: L.dayKey(env, "2026-10-24"),
    never: P.POLICY.never,
    policyRoute: await (await I.default.fetch(new Request("https://vicinity.city/api/policy"), env)).json(),
    tokenRoute: env.VICINITY_MINT ? null : await (await I.default.fetch(new Request("https://vicinity.city/api/token"), env)).json(),
  };
  return JSON.parse(JSON.stringify(out));
}
