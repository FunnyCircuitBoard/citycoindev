// MAIN_TOKEN_V5 in tests (src/v5policy.js mainTokenV5). The switch counts only while every precondition holds; these helpers give a test
// the settings that pass the configuration checks and stand in for a page build made with the switch, which the real page build refuses
// until the label migration (stage S48). Each test file runs in its own process, so the stand-in never leaks into another file.
import { _pagesBuiltForTests } from "../../src/v5policy.js";

/** The settings the v5 configuration check needs for the switch: a named environment and the legacy seats frozen. */
export const ACCEPTED = Object.freeze({ MAIN_TOKEN_V5: "on", DEPLOYMENT_ENV: "test", LEGACY_SEATS: "frozen" });
/** As if the deployed pages had been built with MAIN_TOKEN_V5 (and today's label set). The build accepts the switch only with
 *  LEGACY_SEATS=frozen (the v5 check, MAIN_TOKEN_ON_WITH_LEGACY_SEATS), so those pages carry the legacy seat freeze too (stage S16). */
export const pagesBuiltWithSwitch = () => _pagesBuiltForTests({ mainTokenV5: true, brand: "", legacySeats: "frozen" });
/** As if the deployed pages had been built with LEGACY_SEATS=frozen in wrangler.jsonc (stage S16: src/pages-built.js legacySeats "frozen"). */
export const pagesBuiltFrozen = () => _pagesBuiltForTests({ legacySeats: "frozen" });
/** Back to the committed src/pages-built.js (the pages were built without the switch). */
export const pagesAsCommitted = () => _pagesBuiltForTests(null);
