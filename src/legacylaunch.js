/**
 * The legacy launch path closed (Citycoin.dev master v5, stage S23; LEGACY_LAUNCH=off, read through src/v5policy.js legacyLaunch, which also
 * holds the path closed when the switch is set but refused). The legacy path is the live launchpad program vicinity_launchpad (AkMP9q…) with
 * Meteora's curve: the owner's on-chain approval (src/lpadmin.js), the founder's launch (src/lplaunch.js), the founder studio that sets a coin's
 * name, description and pair (src/coins.js handleDesign), the old Raydium LaunchLab contract path (src/coins.js), and the ready-made coin and its
 * reviews, which hand a version to that approval (src/coinready.js, src/coinreview.js; both switched off in production).
 *
 * While closed (legacyLaunchClosed), each of these answers 410 { ok: false, error: "legacy_launch_closed", message: LEGACY_LAUNCH_CLOSED } before
 * any read (no session, database, chain or body beyond the one field that names the write), from src/index.js, and again inside its own module
 * for a caller that reaches the module directly. The 410 is the S16 freeze's shape (410 seats_frozen): the route exists and is retired, unlike the
 * not_enabled / unknown-path 404 of a route that was never switched on here, which each keeps where it had it (lpSetup off, COIN_V2_READY off,
 * COIN_V2_REVIEW off: the route still answers its 404 first).
 *   POST /api/lp/launch/tx                               the founder's launch
 *   POST /api/coins/design                               the founder studio (name, description, pair, colour, logo); only a body that is exactly
 *                                                        { removeLogo: true } still goes through: the founder takes their own picture down
 *                                                        (logoRemovalOnly; src/coins.js then changes nothing else)
 *   POST /api/coins/mint                                 a founder's Raydium LaunchLab contract
 *   POST /api/coins/mint/decide       with approve true  recording such a contract (a rejection still settles the city)
 *   POST /api/coins/ready/art, /api/coins/ready/use      the ready-made coin for the legacy approval (with COIN_V2_READY on)
 *   POST /api/coins/review/<route>    except cancel      change requests and descriptions for the legacy approval (with COIN_V2_REVIEW on; refused in
 *                                                        src/coinreview.js once the route is known, before it reads anything). Cancel stays:
 *                                                        it only withdraws a draft or a pending request, or puts a decided one away
 *   POST /api/admin/coins/reviews/decide  except action changes_needed   a reviewer's approval (with COIN_V2_REVIEW on), which would make a
 *                                                        version the coin for the legacy approval; asking for changes only closes the request
 *   POST /api/admin/lp/approve/tx                        the owner's on-chain approval (with the launchpad's settings on, as every /api/admin/lp route)
 *   POST /api/admin/lp/tx             with step start, config or allow    setup steps that serve new launches only: starting the launchpad, a
 *                                                        new Meteora price curve, a price curve on the launchpad's allow-list
 *   POST /api/admin/lp/record         with step approve, start, config or allow   recording those (the chain stays the record)
 *   POST /api/admin/lp/pause/tx       with launches false   resuming launches on chain (pausing them is still built: S58 starts with it)
 *   POST /api/swap/send               a legacy approve_launch or launch instruction   the relay (src/relay.js): such a transaction built just before
 *                                                        the switch closed (its relay ticket lasts 10 minutes) is not sent for it afterwards
 *                                                        (closedLaunchTx; the signer could still send the same bytes to any public node)
 * Not closed, because they serve coins already launched, close something, or only read: every GET (the launch status says "closed" for a city with
 * no coin, keeps an approval on record, and is unchanged for a launched one; the admin's candidates, approvals on record and launched coins), the
 * revoke of an approval and its record, pausing launches, the hand-over to the Squads vault, the fee accounts, the speed table and the partner
 * entry, collecting fees, holder rewards, forwarding, platform fees, graduation, the founder's fee collection, the rejection of a waiting LaunchLab
 * contract, a founder taking their own picture down, a founder cancelling their own coin request, a reviewer asking for changes, takedowns, and
 * the job. The launch record stays open too (POST /api/lp/record, GET /api/lp/coin, and the job's lpCoins sweep): it records a coin the chain
 * already has, so one city keeps one coin. This switch builds nothing on chain and pauses nothing there: a founder holding an unexpired Approval
 * can still call vicinity_launchpad directly, and the coin is then recorded and listed. Only the owner's set_pause(launches = true) and revoking
 * every pending Approval stop launches on chain (stage S58 does both first; 00-reconciliation.md LL-1).
 * With LEGACY_LAUNCH unset (production until S58) nothing here answers and no request is read twice: every route is exactly as before.
 */
import { json, readJson } from "./http.js";
import { lpSetup } from "./cluster.js";
import { coinV2ReadyOn, coinV2ReviewOn } from "./flags.js";
import { legacyLaunchClosed } from "./v5policy.js";
import { programOfInstruction } from "./sol/message.js";
import { DISCRIMINATORS as ADMIN_IX } from "./sol/lpadmin-ix.js";
import { DISCRIMINATORS as LAUNCH_IX } from "./sol/lplaunch-ix.js";

/** The neutral line the pages show while the path is closed (the admin's City coins tab, the founder's launch card, the dashboard). */
export const LEGACY_LAUNCH_LINE = "New city-coin launches on this launchpad are closed. Coins already launched keep trading.";
/** What a refused write answers in `message`. */
export const LEGACY_LAUNCH_CLOSED = `${LEGACY_LAUNCH_LINE} Nothing was changed.`;
/** The admin setup steps that serve new launches only, and the record steps that record them or an approval. */
export const LP_SETUP_CLOSED = Object.freeze(["start", "config", "allow"]);
export const LP_RECORD_CLOSED = Object.freeze(["approve", ...LP_SETUP_CLOSED]);

/** The coin-review routes a founder may still use while the path is closed: cancel only withdraws or puts away (src/coinreview.js). */
export const REVIEW_OPEN = Object.freeze(["cancel"]);
/** The one reviewer's decision left while the path is closed: asking for changes closes a request and makes no version the coin. */
export const DECISION_OPEN = "changes_needed";

/**
 * 410 legacy_launch_closed while the path is closed, else null. Reads one setting (two while it is set). Never throws, because
 * src/v5policy.js legacyLaunchClosed never does (no catch here: a catch could only fall back to one side, and the gate's direction is
 * legacyLaunch's alone; review finding S23-NIT-1 / SEC-S23-5).
 */
export function launchClosed(env) {
  return legacyLaunchClosed(env) ? json({ ok: false, error: "legacy_launch_closed", message: LEGACY_LAUNCH_CLOSED }, 410, { "Cache-Control": "no-store" }) : null;
}

/** Is this design body exactly { removeLogo: true }: the founder taking their own picture down, nothing else (review finding SEC-S23-3)? */
export const logoRemovalOnly = (b) => Boolean(b && typeof b === "object" && !Array.isArray(b) && b.removeLogo === true && Object.keys(b).length === 1);
/** Is this reviewer's decision one that stays open while closed (asking for changes)? Anything else (an approval, a malformed body) is refused. */
export const decisionOpen = (b) => Boolean(b && typeof b === "object" && b.action === DECISION_OPEN);

/**
 * Is POST /api/admin/lp/<sub> with this body a legacy launch writer (the list at the top)? `body` may be null (unread or not JSON): only approve/tx
 * is decided without it.
 */
export function lpAdminWrite(sub, body) {
  if (sub === "approve/tx") return true;
  const b = body && typeof body === "object" ? body : {};
  if (sub === "tx") return LP_SETUP_CLOSED.includes(b.step);
  if (sub === "record") return LP_RECORD_CLOSED.includes(b.step);
  if (sub === "pause/tx") return b.launches === false;
  return false;
}

/** The one field of a POST body that says which write it is, read from a copy (the route reads the request itself afterwards). */
export const peek = async (request, max = 4096) => { try { return await readJson(request.clone(), max); } catch { return null; } };

/**
 * src/index.js, before any read: the 410 for a closed legacy launch writer among the paths that need a look at the request (the admin's City coins
 * routes, the reviewer's decision, the LaunchLab decision, the studio), else null. With the path open this returns null at once, reading nothing.
 */
export async function closedBeforeRead(request, env, path) {
  const closed = launchClosed(env);
  if (!closed || request.method !== "POST") return null;
  if (path.startsWith("/api/admin/lp/")) {
    if (!lpSetup(env).on) return null; // the City coins tab is not there at all: its 404 not_enabled answers (src/admin.js)
    const sub = path.slice("/api/admin/lp/".length);
    if (sub === "approve/tx") return closed;
    if (!["tx", "record", "pause/tx"].includes(sub)) return null;
    return lpAdminWrite(sub, await peek(request, 8192)) ? closed : null;
  }
  if (path === "/api/admin/coins/reviews/decide") return coinV2ReviewOn(env) && !decisionOpen(await peek(request, 4096)) ? closed : null;
  if (path === "/api/coins/mint/decide") { const b = await peek(request, 4096); return b && b.approve === true ? closed : null; }
  // the studio: only a body that is exactly { removeLogo: true } goes through (a body too big to peek, as one with a picture is, is refused)
  if (path === "/api/coins/design") return logoRemovalOnly(await peek(request, 4096)) ? null : closed;
  return null;
}

/** src/index.js: the plain writers (no field to read), each only where its route exists. null: not one, or the path is open. */
export function closedWriter(env, path, method) {
  if (method !== "POST") return null;
  if (path === "/api/coins/mint") return launchClosed(env);
  if (path === "/api/lp/launch/tx") return lpSetup(env).on ? launchClosed(env) : null;
  if (path === "/api/coins/ready/art" || path === "/api/coins/ready/use") return coinV2ReadyOn(env) ? launchClosed(env) : null;
  // (/api/coins/review/<route>: src/coinreview.js handleReview refuses once it knows the route, before the route reads anything, so an unknown
  // path there stays the unknown-path 404)
  return null;
}

/** The legacy instructions the relay no longer sends while the path is closed: the owner's approval and the founder's launch. */
const CLOSED_IX = Object.freeze([ADMIN_IX.approve_launch, LAUNCH_IX.launch]);
const startsWith = (data, d) => data && data.length >= d.length && d.every((x, i) => data[i] === x);
/**
 * src/relay.js handleSend (review finding SEC-S23-4): the 410 for a transaction that carries a vicinity_launchpad approve_launch or launch
 * instruction (the live program, lpSetup's programId; another program's instruction of the same name is never matched), while the path is
 * closed; else null. `decoded`: src/sol/message.js decodeHeader of the signed bytes. With the path open this returns null at once.
 */
export function closedLaunchTx(env, decoded) {
  if (!legacyLaunchClosed(env)) return null;
  const program = lpSetup(env).programId;
  if (!program || !decoded || !Array.isArray(decoded.instructions)) return null;
  for (let i = 0; i < decoded.instructions.length; i++) {
    if (programOfInstruction(decoded, i) !== program) continue;
    if (CLOSED_IX.some((d) => startsWith(decoded.instructions[i].data, d))) return launchClosed(env);
  }
  return null;
}
