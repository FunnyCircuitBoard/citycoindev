/**
 * The server's wallet challenges (Citycoin.dev master v5, stage S09; master section 18 WP-02 "Sign a human-readable challenge bound to origin,
 * cluster, wallet, nonce, purpose and expiry. Use one-use nonces and two-minute challenges. Verify on the server and issue a secure session;
 * signature is not a blockchain payment", and section 05 BR-03 "Issue wallet challenges for the exact new origin, action, chain, wallet, nonce
 * and expiry"; docs/citycoin-master/schema-and-api.md sections 3.1 and 4.1). Used only while WALLET_ONLY counts (src/v5policy.js walletOnly):
 * with the switch off nothing here runs and the site keeps today's signed messages (src/solana.js buildMessage, src/signed.js checkSigned).
 *
 * ISSUE (POST /api/auth/challenge, src/auth.js handleChallenge). The server makes the text, never the browser: the host it names is the
 * allowlist entry the request is served as (src/hostbind.js servedHost: never the request's own Host text while the host binding counts), the
 * cluster is this deployment's (src/cluster.js identityCluster), the nonce is 128 random bits, and the text says what the signature is for
 * (the purpose, in words and as "Request ID"), that it is free and not a transaction, and when it stops working ("Expiration Time", 120
 * seconds later: policy.identity.challenge_seconds). One auth_challenges row records the SHA-256 of the nonce and of the whole text, the purpose,
 * host, cluster and wallet, what it is bound to (`ref`) and both times (src/store.js IDENTITY_MIGRATION).
 *
 * CHECK (checkChallenge). The browser sends back { challengeId, address, message, signature }. Refused, each by name: an unknown id, a purpose
 * the route does not take, another host, another cluster, another wallet, a text that is not the one issued, an expired or a used challenge, a
 * signature that is not the wallet's. Any database failure refuses too (503 unavailable): a challenge that cannot be read or used up is never
 * accepted. Today's check (src/signed.js noteMessage) lets a message through when its used-message store cannot answer; this one never does.
 *
 * USE (consumeStatement). The use is a conditional UPDATE (still unused, not expired, same purpose, wallet, host and cluster) that records a
 * hash naming what the use makes (`used_by`), and the caller runs it in the SAME D1 batch as the statement that makes the session (or approves
 * the pairing, or re-proves the session), which carries `AND EXISTS (SELECT 1 FROM auth_challenges WHERE id = ? AND used_by = ?)` (usedClause).
 * Two requests racing with one signature: one UPDATE changes the row, the other changes nothing and its session statement finds no row with its
 * own `used_by`, so it makes nothing (409 challenge_used).
 *
 * The words of each statement come from the product's label set (src/brand.js productName: today's "Vicinity"; the label migration S48 flips
 * it) and keep today's sentence "Free, not a transaction, cannot move funds.". Today's statements (src/solana.js statementFor) are untouched:
 * they are pinned for the legacy window (test/persist-guard.test.js; rebrand-inventory.md C08 and L16).
 */
import { json, randomToken, sha256 } from "./http.js";
import { base58Encode, isSolanaAddress, verifySignature } from "./solana.js";
import { base64ToBytes } from "./signed.js";
import { ensureIdentitySchema } from "./store.js";
import { brandOf } from "./brand.js";
import { IDENTITY_POLICY } from "./v5policy.js";
import { identityCluster } from "./cluster.js";

/** Every purpose a row may record (the table's CHECK). legacy_link: the legacy link window (stage S14, src/legacy.js). */
export const PURPOSES = Object.freeze(["login", "register", "reprove", "admin", "legacy_link"]);
/** The purposes POST /api/auth/challenge issues whenever WALLET_ONLY counts. legacy_link is issued only while the legacy link window is open
 *  (src/v5policy.js legacyLink; src/auth.js handleChallenge asks src/legacy.js legacyChallenge first). */
export const ISSUED_PURPOSES = Object.freeze(["login", "register", "reprove", "admin"]);
/** Today's sentence, kept word for word in every new statement. */
export const FREE = "Free, not a transaction, cannot move funds.";
export const MAX_MESSAGE = 1200;
const ID_RE = /^[0-9a-f]{32}$/;
const iso = (ms) => new Date(ms).toISOString();
/** Text that goes into one line of the signed message: no control characters, no line breaks, at most `max` characters. */
const oneLine = (s, max = 60) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * The statement a wallet signs for `purpose`, in the product's own name (`brand`: a src/brand.js label set).
 *   login     "Sign in to <product> with this wallet." (with `pin`: a phone approving for another device, with its 2-digit check number)
 *   register  "Register this wallet on <product> for <city>, <country>." (the city and country the browser's location step resolved; with
 *             `pin`: a phone approving the registration a computer started, "... on my other device (check number NN).", stage S11)
 *   reprove   "Confirm this wallet again on <product> for a sensitive action." (a signed-in member's fresh proof)
 *   admin     "Use this wallet for the <product> admin console." (the console's sign-in and its fresh proofs)
 *   legacy_link  "Link this wallet to my existing <product> account @<account>." (stage S14: the legacy link window; the account is named the way
 *             src/walletlink.js accountName names it, so a signature for one account never links another; with `pin`: a phone approving the
 *             link a computer's or Safari's restricted session started, "... on my other device (check number NN).")
 */
export function challengeStatement(purpose, brand, { pin, city, country, account } = {}) {
  const p = oneLine(brand.productName);
  if (purpose === "login" && pin) return `Sign in to ${p} on my other device (check number ${pin}). ${FREE}`;
  if (purpose === "login") return `Sign in to ${p} with this wallet. ${FREE}`;
  if (purpose === "register" && pin) return `Register this wallet on ${p} for ${oneLine(city)}, ${oneLine(country, 8)} on my other device (check number ${pin}). ${FREE}`;
  if (purpose === "register") return `Register this wallet on ${p} for ${oneLine(city)}, ${oneLine(country, 8)}. ${FREE}`;
  if (purpose === "reprove") return `Confirm this wallet again on ${p} for a sensitive action. ${FREE}`;
  if (purpose === "admin") return `Use this wallet for the ${p} admin console. ${FREE}`;
  if (purpose === "legacy_link" && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(String(account || ""))) {
    return `Link this wallet to my existing ${p} account @${account}${pin ? ` on my other device (check number ${pin})` : ""}. ${FREE}`;
  }
  throw new Error("challenge: unknown purpose");
}

/**
 * The exact text a wallet signs: the Sign-In-With-Solana layout (the first line names the host, so a wallet that checks it can compare it with
 * the page), with the origin, the cluster, the nonce, both times and the purpose.
 */
export function buildChallengeMessage({ host, origin, address, statement, cluster, nonce, issuedAt, expiresAt, purpose }) {
  return [
    `${host} wants you to sign in with your Solana account:`,
    address,
    "",
    statement,
    "",
    `URI: ${origin}`,
    "Version: 1",
    `Chain ID: ${cluster}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
    `Request ID: ${purpose}`,
  ].join("\n");
}

/**
 * Make and store a challenge. `served` is src/hostbind.js servedHost of the request (its `host` is what the text names, its `origin` the URI).
 * The caller decides whether the purpose may be issued now (src/auth.js handleChallenge: legacy_link only while the legacy window is open).
 * Returns { challengeId, message, statement, purpose, expiresAt }. Throws on a database failure (the caller answers 503).
 */
export async function issueChallenge(env, { purpose, address, served, ref = null, pin = null, city = null, country = null, account = null }, now = Date.now()) {
  if (!PURPOSES.includes(purpose)) throw new Error("challenge: purpose not issued");
  if (!isSolanaAddress(address)) throw new Error("challenge: bad address");
  if (!served || !served.host || !served.origin) throw new Error("wrong_host");
  await ensureIdentitySchema(env.DB);
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const nonce = base58Encode(crypto.getRandomValues(new Uint8Array(16)));
  const cluster = identityCluster(env);
  const issuedAt = iso(now), expiresAt = iso(now + IDENTITY_POLICY.challengeSeconds * 1000);
  const statement = challengeStatement(purpose, brandOf(env), { pin, city, country, account });
  const message = buildChallengeMessage({ host: served.host, origin: served.origin, address, statement, cluster, nonce, issuedAt, expiresAt, purpose });
  await env.DB.prepare(`INSERT INTO auth_challenges (id, nonce_hash, purpose, host, cluster, wallet, ref, message_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, await sha256(nonce), purpose, served.host, cluster, address, ref, await sha256(message), issuedAt, expiresAt).run();
  return { challengeId: id, message, statement, purpose, expiresAt };
}

const refuse = (error, status = 400) => ({ error: json({ ok: false, error }, status) });

/**
 * Check the answer to a challenge, without using it up. `purposes`: the purposes this route takes. Returns { row } (the challenge, every check
 * passed: the caller now runs consumeStatement in the same batch as what the proof makes) or { error: Response }:
 *   400 challenge_required (no challengeId: today's signed message is not accepted while WALLET_ONLY counts), challenge_unknown, bad_address,
 *       bad_message (not the text that was issued), bad_signature, wrong_purpose, wrong_site (issued for another host), wrong_cluster
 *   403 wrong_wallet (issued for another wallet)
 *   409 challenge_used · 410 challenge_expired · 401 signature_mismatch · 503 unavailable (the database could not say: never accepted)
 */
export async function checkChallenge(env, body, { served, purposes, now = Date.now() }) {
  const { challengeId, address, message, signature } = body || {};
  if (challengeId == null) return refuse("challenge_required");
  if (typeof challengeId !== "string" || !ID_RE.test(challengeId)) return refuse("challenge_unknown");
  if (!isSolanaAddress(address)) return refuse("bad_address");
  if (typeof message !== "string" || !message || message.length > MAX_MESSAGE) return refuse("bad_message");
  let row;
  try {
    await ensureIdentitySchema(env.DB);
    row = await env.DB.prepare("SELECT * FROM auth_challenges WHERE id = ?").bind(challengeId).first();
  } catch (e) {
    console.error("challenge store unavailable", String((e && e.message) || e).slice(0, 80)); // the reason only, never the text
    return refuse("unavailable", 503);
  }
  if (!row) return refuse("challenge_unknown");
  if (!purposes.includes(row.purpose)) return refuse("wrong_purpose");
  if (!served || served.refused || !served.host || row.host !== served.host) return refuse("wrong_site");
  if (row.cluster !== identityCluster(env)) return refuse("wrong_cluster");
  if (row.wallet !== address) return refuse("wrong_wallet", 403);
  if ((await sha256(message)) !== row.message_hash) return refuse("bad_message");
  if (row.used_at) return refuse("challenge_used", 409);
  if (!(Date.parse(row.expires_at) > now)) return refuse("challenge_expired", 410);
  let sig;
  try { sig = base64ToBytes(signature); } catch { return refuse("bad_signature"); }
  let ok = false;
  try { ok = await verifySignature(row.wallet, message, sig); } catch { ok = false; }
  if (!ok) return refuse("signature_mismatch", 401);
  return { row };
}

/**
 * The statement that uses the challenge up (run it first in the batch; it changes one row or none). `usedBy` names what the use makes.
 * `also` (optional, stage S11): one more condition the use needs, { sql: " AND ...", args }, numbering its parameters from ?8 (the
 * registration adds "the sign-up is still alive, with its Terms and this city", so a dead sign-up never uses a challenge up).
 */
export const consumeStatement = (db, row, usedBy, now = Date.now(), also = null) => db.prepare(
  `UPDATE auth_challenges SET used_at = ?1, used_by = ?2
    WHERE id = ?3 AND used_at IS NULL AND expires_at > ?1 AND purpose = ?4 AND wallet = ?5 AND host = ?6 AND cluster = ?7${also ? also.sql : ""}`,
).bind(iso(now), usedBy, row.id, row.purpose, row.wallet, row.host, row.cluster, ...(also ? also.args : []));

/** The condition every statement made by a use carries (with its two values): it holds only when THIS batch's consumeStatement changed the row. */
export const usedClause = (row, usedBy) => ({ sql: " AND EXISTS (SELECT 1 FROM auth_challenges WHERE id = ? AND used_by = ?)", args: [row.id, usedBy] });

/** A fresh value for `used_by`: a hash naming what the use makes (`what`: "session:<id>"), with 128 random bits so no two uses share one. */
export const usedByFor = (what) => sha256(`${what}:${randomToken(16)}`);
