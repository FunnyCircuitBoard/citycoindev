// Written by scripts/pages/build.mjs from the settings of wrangler.jsonc; do not edit (test/build-parity.test.js checks it).
// What the deployed pages in public/ were built with, and whether wrangler.jsonc sends them through the Worker (run_worker_first true).
// src/v5policy.js counts MAIN_TOKEN_V5 only when mainTokenV5 is true here, and HOST_REDIRECT only when pagesReachWorker is true.
// legacySeats "frozen": built with LEGACY_SEATS=frozen (no old founder copy); src/v5policy.js holds the freeze if the Worker's setting differs.
// walletOnly true: built with WALLET_ONLY=on (scripts/pages/walletonly-copy.mjs: no page offers Google, e-mail or password sign-in).
export const PAGES_BUILT = Object.freeze({ mainTokenV5: false, brand: "citycoin", pagesReachWorker: false, legacySeats: "frozen", walletOnly: true });
