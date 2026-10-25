// The rebrand stage's second check (Citycoin.dev label migration, S48), RB-2: under the Citycoin.dev label set the link checker names the
// current role of every address /official lists (the programs, their upgrade authority, the fee wallet, the price-curve settings), in the
// page's own words, never "history only"; with BRAND unset every answer is today's.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPages } from "../scripts/pages/build.mjs";
import { CITYCOIN_BRAND } from "../src/brand.js";
import { OFFICIAL, checkOfficial, officialAddresses } from "../src/official.js";
import { isSolanaAddress } from "../src/solana.js";
import { _pagesBuiltForTests } from "../src/v5policy.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
afterEach(() => { _pagesBuiltForTests(null); });

const CC_ENV = { BRAND: "citycoin", LEGACY_SEATS: "frozen", DEPLOYMENT_ENV: "production" };
const ccPage = new Map(buildPages({ brand: CITYCOIN_BRAND })).get("official.html");
/** Each address row of a built /official page: its address, its label and its note, as a visitor reads them. */
const unescape = (t) => t.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const rowsOf = (html) => html.split('<div class="credits__row off-row" data-address="').slice(1).map((chunk) => {
  const row = chunk.slice(0, chunk.indexOf("</dd>"));
  const note = /<p class="credits__note">([^<]*)<\/p>/.exec(row);
  return { address: row.slice(0, row.indexOf('"')), label: unescape(/<dt>([^<]+)<\/dt>/.exec(row)[1]), note: note ? unescape(note[1]) : null };
});

test("RB-2: under BRAND=citycoin every address the Citycoin.dev /official lists is answered by the checker with the same role and words, never 'history only'", () => {
  const vars = { ...JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars };
  const rows = rowsOf(ccPage);
  assert.ok(rows.length >= 5, JSON.stringify(rows));
  assert.ok(rows.some((r) => r.label === "Fee wallet"), "the fee wallet is on the page");
  _pagesBuiltForTests({ brand: "citycoin", legacySeats: "frozen" });
  const cc = { ...vars, ...CC_ENV };
  for (const r of rows) {
    const a = checkOfficial(r.address, isSolanaAddress, cc);
    assert.equal(a.verdict, "official", `${r.label}: ${JSON.stringify(a)}`);
    assert.equal(a.current, true, r.label);
    assert.equal(a.message, `This is an official Citycoin.dev address: ${r.label}.${r.note ? ` ${r.note.replace(/, linked here,/, "")}` : ""}`, r.label);
    assert.doesNotMatch(a.message, /history only|earlier token|vicinity/i, r.label);
  }
  // the fee wallet in particular: the page's role, not the team wallet's history
  const fee = checkOfficial(rows.find((r) => r.label === "Fee wallet").address, isSolanaAddress, cc);
  assert.equal(fee.message, "This is an official Citycoin.dev address: Fee wallet. Citycoin.dev's share of city-coin fees goes to this wallet. The launchpad program has this address built in.");
  // a team wallet the page does not list (published for the earlier token only) keeps its legacy answer
  const listed = new Set(rows.map((r) => r.address));
  const legacyOnly = OFFICIAL.teamWallets.filter((w) => !listed.has(w));
  assert.ok(legacyOnly.length > 0);
  for (const w of legacyOnly) assert.match(checkOfficial(w, isSolanaAddress, cc).message, /listed for an earlier token of ours \(history only\)\.$/, w);
  // the page and the checker read the same rows (src/official.js officialAddresses, brandAddressNote)
  const groups = officialAddresses(cc, false).filter((g) => !["vicinity", "team", "legacy"].includes(g.id));
  assert.deepEqual(groups.flatMap((g) => g.rows.map((r) => r.address)).sort(), [...listed].sort());
});

test("RB-2: with BRAND unset the checker's answers for the same addresses are today's, word for word", () => {
  const vars = { ...JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars };
  const rows = rowsOf(ccPage);
  for (const r of rows) {
    const a = checkOfficial(r.address, isSolanaAddress, vars);
    if (OFFICIAL.teamWallets.includes(r.address)) assert.deepEqual(a, { verdict: "official", kind: "wallet", message: "This is a published Vicinity team wallet." }, r.label);
    else assert.deepEqual(a, { verdict: "not_official", kind: "address", message: "This address is NOT the official $VICINITY contract or a team wallet." }, r.label);
  }
});

