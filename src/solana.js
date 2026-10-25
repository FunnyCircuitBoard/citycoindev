/**
 * Solana helpers for "Verify wallet ownership".
 *
 * Verification = the visitor signs a plain text message with their wallet.
 * It is NOT a transaction: it cannot move funds and costs nothing.
 * We check the signature with the Ed25519 algorithm built into the platform.
 */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_MAP = new Map([...B58].map((c, i) => [c, i]));

/** Decode a base58 string to bytes. Throws on invalid input. */
export function base58Decode(str) {
  if (typeof str !== "string" || str.length === 0 || str.length > 128) throw new Error("bad_base58");
  const bytes = [];
  for (const ch of str) {
    const val = B58_MAP.get(ch);
    if (val === undefined) throw new Error("bad_base58");
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of str) { if (ch === "1") bytes.push(0); else break; }
  return new Uint8Array(bytes.reverse());
}

/** Encode bytes to base58. */
export function base58Encode(bytes) {
  const digits = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = "";
  for (const b of bytes) { if (b === 0) out += "1"; else break; }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

/** True if the string looks like a Solana address (32 bytes in base58). */
export function isSolanaAddress(str) {
  if (typeof str !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str)) return false;
  try { return base58Decode(str).length === 32; } catch { return false; }
}

export const MESSAGE_STATEMENT =
  "Verify wallet ownership for Vicinity. This is free, is not a transaction, and cannot move funds.";

/**
 * The product's name in today's statements (the label migration, stage S48): "Vicinity", byte for byte, unless a caller names its label set's
 * (src/brandwords.js statementName: the Citycoin.dev name only with pages built for it). Every statement made with the default is exactly
 * today's (test/persist-guard.test.js C08); a message is accepted for any name its checker is given (statementNames: today's name always,
 * so a text issued just before the label set changed still works for the minutes it is valid).
 */
export const LEGACY_NAME = "Vicinity";
const PRODUCT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .-]{0,38}[A-Za-z0-9]$/;
const nameOf = (name) => (typeof name === "string" && PRODUCT_NAME_RE.test(name) ? name : LEGACY_NAME);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The "verify" statement in a product's name (today's MESSAGE_STATEMENT for "Vicinity"). */
export const messageStatement = (name = LEGACY_NAME) => (nameOf(name) === LEGACY_NAME ? MESSAGE_STATEMENT : `Verify wallet ownership for ${nameOf(name)}. This is free, is not a transaction, and cannot move funds.`);

const FREE = "Free, not a transaction, cannot move funds.";

/** A city name we accept: letters (any language), spaces and . ' - only. */
export const CITY_NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{0,58}[\p{L}\p{M}.]$/u;

/**
 * The one line that says what the wallet is agreeing to.
 *   verify → prove you own the wallet
 *   claim  → claim a listed city (by id)
 *   add    → add a missing city and claim it
 *   login  → sign in to your dashboard (with a 2-digit check number when a phone signs in for a computer)
 *   link   → link this wallet to the account named in the statement (onboarding v3: the account exists first, the wallet comes
 *            later; with a check number when a wallet app approves for another device). A login statement never links (src/auth.js
 *            walletProven: use_link) and a link statement never signs anyone in: the two are different sentences.
 */
export function statementFor(action = "verify", { cityId, name, country, pin, handle } = {}, product = LEGACY_NAME) {
  const p = nameOf(product);
  if (action === "claim") return `Claim city #${cityId} (${country}) for this wallet on ${p}. ${FREE}`;
  if (action === "add") return `Add the city "${name}" (${country}) and claim it for this wallet on ${p}. ${FREE}`;
  if (action === "login" && pin) return `Sign in to ${p} on my other device (check number ${pin}). ${FREE}`;
  if (action === "login") return `Sign in to ${p} with this wallet. ${FREE}`;
  if (action === "link" && pin) return `Link this wallet to my ${p} account @${handle} on my other device (check number ${pin}). ${FREE}`;
  if (action === "link") return `Link this wallet to my ${p} account @${handle}. ${FREE}`;
  return messageStatement(p);
}

/** The statement on line 4 of a message, in one product's name, or null. */
function parseStatementAs(line, product) {
  const p = nameOf(product), q = escapeRe(p);
  if (line === messageStatement(p)) return { action: "verify" };
  if (line === statementFor("login", {}, p)) return { action: "login" };
  const pin = line.match(new RegExp(`^Sign in to ${q} on my other device \\(check number ([0-9]{2})\\)\\. `));
  if (pin && line === statementFor("login", { pin: pin[1] }, p)) return { action: "login", pin: pin[1] };
  const link = line.match(new RegExp(`^Link this wallet to my ${q} account @([A-Za-z][A-Za-z0-9_]{0,39})(?: on my other device \\(check number ([0-9]{2})\\))?\\. `));
  if (link && line === statementFor("link", { handle: link[1], pin: link[2] }, p)) return { action: "link", handle: link[1], ...(link[2] ? { pin: link[2] } : {}) };
  let m = line.match(new RegExp(`^Claim city #([0-9]{1,10}|c[0-9]{1,9}) \\(([A-Z]{2})\\) for this wallet on ${q}\\. `));
  if (m && line === statementFor("claim", { cityId: m[1], country: m[2] }, p)) return { action: "claim", cityId: m[1], country: m[2] };
  m = line.match(new RegExp(`^Add the city "(.+)" \\(([A-Z]{2})\\) and claim it for this wallet on ${q}\\. `));
  if (m && CITY_NAME_RE.test(m[1]) && line === statementFor("add", { name: m[1], country: m[2] }, p))
    return { action: "add", name: m[1], country: m[2] };
  return null;
}
/** The statement in the first of `products` it is written in (today's name by default), or null. */
function parseStatement(line, products = [LEGACY_NAME]) {
  for (const product of products) {
    const st = parseStatementAs(line, product);
    if (st) return st;
  }
  return null;
}

/** Build the exact message the wallet signs. The browser and server must agree on this format. */
export function buildMessage({ host, address, nonce, issuedAt, statement = MESSAGE_STATEMENT }) {
  return [
    `${host} wants you to sign in with your Solana account:`,
    address,
    "",
    statement,
    "",
    `URI: https://${host}`,
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

/** Parse a message produced by buildMessage. Returns null if the format is wrong. `products`: the names its statement may be in. */
export function parseMessage(message, products = [LEGACY_NAME]) {
  if (typeof message !== "string" || message.length > 1000) return null;
  const lines = message.split("\n");
  if (lines.length !== 10) return null;
  const m0 = lines[0].match(/^([a-z0-9.-]+(?::\d+)?) wants you to sign in with your Solana account:$/);
  const nonce = lines[8].match(/^Nonce: ([A-Za-z0-9]{16,64})$/);
  const issued = lines[9].match(/^Issued At: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/);
  if (!m0 || !nonce || !issued) return null;
  const st = parseStatement(lines[3], products);
  if (!st) return null;
  const parsed = { host: m0[1], address: lines[1], nonce: nonce[1], issuedAt: issued[1], statement: lines[3], ...st };
  return buildMessage(parsed) === message ? parsed : null;
}

/* ---------------- Ed25519 points (review finding SEC-2) ----------------
 * WebCrypto's Ed25519 verify (workerd/BoringSSL, Node/OpenSSL) accepts, for a public key of SMALL ORDER (the identity, the point of order 2,
 * the points of order 4 and 8, e.g. 11111111111111111111111111111111 = 32 zero bytes, the System Program address), a signature R = a
 * small-order point, S = 0 on arbitrary messages in a good share of tries: a forgery with no private key. So before any verify, the key and
 * the signature's R must each be the canonical encoding of a curve point (y < p, x = 0 only with the sign bit clear) that is NOT of small order
 * ([8]P is not the identity), and S must be canonical (S < L). An honest wallet's key and signatures always are: its key is [a]B and its R is
 * [r]B, both of prime order L. Program-derived addresses (off the curve) stay valid addresses (isSolanaAddress); they simply cannot sign.
 */
const FP = (1n << 255n) - 19n;
const ORDER_L = (1n << 252n) + 27742317777372353535851937790883648493n;
const mod = (a) => { const r = a % FP; return r < 0n ? r + FP : r; };
function powMod(b, e) {
  let r = 1n; b = mod(b);
  while (e > 0n) { if (e & 1n) r = (r * b) % FP; b = (b * b) % FP; e >>= 1n; }
  return r;
}
const inv = (a) => powMod(a, FP - 2n);
const ED_D = mod(-121665n * inv(121666n));
const SQRT_M1 = powMod(2n, (FP - 1n) / 4n);
const leInt = (bytes) => { let n = 0n; for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]); return n; };

/** The affine point a 32-byte encoding names, or null when it is not a canonical encoding of a point on edwards25519. */
function decodePoint(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) return null;
  const sign = bytes[31] >> 7;
  const y = leInt(bytes) & ((1n << 255n) - 1n);
  if (y >= FP) return null; // non-canonical y
  const y2 = (y * y) % FP, u = mod(y2 - 1n), v = mod(ED_D * y2 + 1n);
  let x = (u * powMod(v, 3n) % FP) * powMod(u * powMod(v, 7n), (FP - 5n) / 8n) % FP;
  const vx2 = (v * x % FP) * x % FP;
  if (vx2 === mod(-u)) x = (x * SQRT_M1) % FP;
  else if (vx2 !== u) return null; // not on the curve
  if (x === 0n && sign === 1) return null; // non-canonical: -0
  if (Number(x & 1n) !== sign) x = FP - x;
  return { x, y };
}
/** P + Q on edwards25519 (a = -1; the formulas are complete there: no denominator is ever zero). */
function addPoints(p, q) {
  const t = (ED_D * p.x % FP) * (q.x * p.y % FP) % FP * q.y % FP;
  return { x: mod((p.x * q.y + p.y * q.x) * inv(1n + t)), y: mod((p.y * q.y + p.x * q.x) * inv(1n - t)) };
}
/** A canonical point of edwards25519 that is not of small order ([8]P is not the identity): a key that can sign, or an R a signer made. */
export function isSigningPoint(bytes) {
  const p = decodePoint(bytes);
  if (!p) return false;
  let q = p;
  for (let i = 0; i < 3; i++) q = addPoints(q, q);
  return !(q.x === 0n && q.y === 1n);
}
/** True when the address is a public key that can sign: 32 bytes in base58, a canonical curve point not of small order. */
export function isWalletKey(str) {
  if (!isSolanaAddress(str)) return false;
  try { return isSigningPoint(base58Decode(str)); } catch { return false; }
}

/** Verify an Ed25519 signature made by a Solana wallet. A key or an R of small order, a non-canonical encoding or S >= L is refused first. */
export async function verifySignature(addressB58, messageText, signatureBytes) {
  const pub = base58Decode(addressB58);
  if (pub.length !== 32 || !signatureBytes || signatureBytes.length !== 64) return false;
  const sig = signatureBytes instanceof Uint8Array ? signatureBytes : Uint8Array.from(signatureBytes);
  if (!isSigningPoint(pub) || !isSigningPoint(sig.subarray(0, 32)) || leInt(sig.subarray(32)) >= ORDER_L) return false;
  const key = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, sig, new TextEncoder().encode(messageText));
}
