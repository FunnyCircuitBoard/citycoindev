/**
 * The two facts about a signed-in session that more than one file needs: the cookie's name and how long a full session lasts.
 * They live here, and not in src/auth.js, so that the sign-up's finish (src/signup-finish.js, which auth.js calls from the
 * Google callback) never has to import auth.js (no import cycle). auth.js re-exports them, so everything else is unchanged.
 */
export const SESSION_COOKIE = "vs";
export const SESSION_SECONDS = 30 * 86400;  // signed in for 30 days
/**
 * sessions.proof of a restricted legacy link session (stage S14, src/legacy.js; sessions.auth 'legacy_link'). The proof column exists in every
 * database, so src/auth.js getSession refuses such a row by it whatever WALLET_ONLY says, without reading a column the switches-off site may not
 * have (review finding SEC-1). No other session ever carries this value (a tiny-transfer proof is a JSON object).
 */
export const LEGACY_PROOF = "legacy_link";
