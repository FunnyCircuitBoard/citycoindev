// The "vars" of a wrangler.jsonc text, read and edited by their place in the JSONC structure, never line by line (rebrand second check,
// STANDIN-MULTILINE: a SITE_ORIGINS written as a multi-line JSON array is a value the page build and the Worker accept, and a line-based
// edit left the text unparseable). Used by the CI switch trial (scripts/brand/switch-trial.mjs) and by the test suite's stand-in for
// today's site (test/helpers/today-build.mjs). Pure: text in, text out. Everything outside the edited entries keeps its bytes (comments,
// spacing, the order of keys), and an edit that is undone gives back the very same bytes.

/** The "vars" of a wrangler.jsonc text, read as scripts/mainnet-preflight.mjs settingsFrom reads them (whole-line comments and trailing commas out). */
export const varsOf = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars || {};

/**
 * The JSONC structure of a text with positions: objects as { kind: "object", start, end, entries: [{ key, keyStart, valueStart, valueEnd,
 * comma, value }] } (comma: the index of the comma after the entry, or null), arrays as { kind: "array", start, end }, the rest as
 * { kind: "string" | "literal" }. Whole-line and inline // comments, block comments and trailing commas are read as wrangler reads them.
 */
export function jsoncTree(text) {
  let i = 0;
  const fail = (what) => { throw new Error(`wrangler.jsonc: ${what} at position ${i}`); };
  const ws = () => {
    for (;;) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
      if (c === "/" && text[i + 1] === "/") { const n = text.indexOf("\n", i); i = n < 0 ? text.length : n; continue; }
      if (c === "/" && text[i + 1] === "*") { const n = text.indexOf("*/", i + 2); if (n < 0) fail("an unclosed comment"); i = n + 2; continue; }
      return;
    }
  };
  const str = () => {
    const s = i;
    for (i++; i < text.length; i++) {
      if (text[i] === "\\") { i++; continue; }
      if (text[i] === "\n") break;
      if (text[i] === '"') { i++; return JSON.parse(text.slice(s, i)); }
    }
    return fail("an unclosed string");
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '"') { str(); return { kind: "string" }; }
    if (c === "{") return obj();
    if (c === "[") return arr();
    const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 64));
    if (!m) fail("an unexpected character");
    i += m[0].length;
    return { kind: "literal" };
  };
  const obj = () => {
    const start = i++, entries = [];
    for (;;) {
      ws();
      if (text[i] === "}") { i++; break; }
      if (text[i] !== '"') fail("a key expected");
      const keyStart = i, key = str();
      ws();
      if (text[i] !== ":") fail("':' expected");
      i++;
      ws();
      const valueStart = i, v = value(), valueEnd = i;
      ws();
      let comma = null;
      if (text[i] === ",") comma = i++;
      entries.push({ key, keyStart, valueStart, valueEnd, comma, value: v });
      if (comma === null) { ws(); if (text[i] !== "}") fail("',' or '}' expected"); i++; break; }
    }
    return { kind: "object", start, end: i, entries };
  };
  const arr = () => {
    const start = i++;
    for (;;) {
      ws();
      if (text[i] === "]") { i++; break; }
      value();
      ws();
      if (text[i] === ",") { i++; continue; }
      if (text[i] !== "]") fail("',' or ']' expected");
      i++;
      break;
    }
    return { kind: "array", start, end: i };
  };
  const root = value();
  ws();
  if (i !== text.length) fail("text after the end");
  if (root.kind !== "object") fail("an object expected");
  return root;
}

/** The entries of the top-level "vars" object (throws when there is none). */
function varsEntries(text) {
  const vars = jsoncTree(text).entries.find((e) => e.key === "vars");
  if (!vars || vars.value.kind !== "object") throw new Error('wrangler.jsonc: no "vars" object');
  return vars.value.entries;
}
const lineStart = (text, at) => text.lastIndexOf("\n", at - 1) + 1;
/** The end of the line `at` is on, past its newline, when nothing but spaces (or a comment) follows on it; else `at` itself. */
const lineEnd = (text, at) => {
  const n = text.indexOf("\n", at), rest = text.slice(at, n < 0 ? text.length : n);
  return /^[ \t]*(?:\/\/.*)?$/.test(rest) ? (n < 0 ? text.length : n + 1) : at;
};

/** The raw JSON text of a var's value (`"frozen"`, `["a", "b"]`), or null when the key is absent. */
export function rawVar(text, key) {
  const e = varsEntries(text).find((x) => x.key === key);
  return e ? text.slice(e.valueStart, e.valueEnd) : null;
}

/**
 * The text with `key` set to `raw` (JSON text). An existing value is replaced where it stands, whatever its form (a string, a multi-line
 * array). A new key is put on its own line right after the entry `after` (and after the keys a previous call added there: pass the last one
 * added), indented like it; with no such entry, after the last entry.
 */
export function setRawVar(text, key, raw, { after = null } = {}) {
  const entries = varsEntries(text), e = entries.find((x) => x.key === key);
  if (e) return text.slice(0, e.valueStart) + raw + text.slice(e.valueEnd);
  const anchor = (after && entries.find((x) => x.key === after)) || entries[entries.length - 1];
  if (!anchor) throw new Error('wrangler.jsonc: an empty "vars" object');
  const indent = /^[ \t]*/.exec(text.slice(lineStart(text, anchor.keyStart)))[0];
  if (anchor.comma !== null) {
    const at = lineEnd(text, anchor.comma + 1);
    if (at === anchor.comma + 1) return `${text.slice(0, at)}\n${indent}${JSON.stringify(key)}: ${raw},${text.slice(at)}`; // (the next entry on the same line)
    return `${text.slice(0, at)}${indent}${JSON.stringify(key)}: ${raw},\n${text.slice(at)}`;
  }
  // the last entry: it gets the comma, the new one is last
  return `${text.slice(0, anchor.valueEnd)},\n${indent}${JSON.stringify(key)}: ${raw}${text.slice(anchor.valueEnd)}`;
}
/** setRawVar with a value (a string, a number, an array...), written as JSON on one line. */
export const setVar = (text, key, value, opts) => setRawVar(text, key, JSON.stringify(value), opts);

/**
 * The text without `key`: its whole entry (the key, its value on however many lines, its comma) and the line it leaves empty. The comment
 * lines above it stay (they are comments). Removing the last entry also removes the comma before it. The text itself when the key is absent.
 */
export function removeVar(text, key) {
  const entries = varsEntries(text), k = entries.findIndex((x) => x.key === key);
  if (k < 0) return text;
  const e = entries[k];
  const ls = lineStart(text, e.keyStart), own = /^[ \t]*$/.test(text.slice(ls, e.keyStart));
  const start = own ? ls : e.keyStart;
  const end = e.comma !== null ? lineEnd(text, e.comma + 1) : lineEnd(text, e.valueEnd);
  let out = text.slice(0, start) + text.slice(end);
  if (e.comma === null && k > 0 && entries[k - 1].comma !== null) {
    const c = entries[k - 1].comma; // (before `start`: same index in `out`)
    out = out.slice(0, c) + out.slice(c + 1);
  }
  return out;
}

/**
 * The line the CI switch trial (scripts/brand/switch-trial.mjs) writes into the copy it changes: a whole-line comment, which every reader of
 * wrangler.jsonc skips, with the values the trial replaced as they were written ({ KEY: raw JSON text, or null for a key that was not
 * there }). The suite's stand-in for today's site (test/helpers/today-build.mjs) reads it to take back exactly what the trial wrote and
 * nothing else (rebrand second check, S06-CI-RED: a DEPLOYMENT_ENV or SITE_ORIGINS committed for another stage stays as committed).
 */
export const TRIAL_MARK = "// switch-trial: this copy only, never commit it. Before the trial: ";
export const MARK_LINE = /^[ \t]*\/\/ switch-trial: this copy only, never commit it\. Before the trial: (\{.*\})[ \t]*\r?\n/m;
/** The values the trial replaced, from its line ({ KEY: raw or null }), or null when this text carries no trial. */
export function trialMark(text) {
  const m = MARK_LINE.exec(text);
  if (!m) return null;
  const before = JSON.parse(m[1]);
  if (!before || typeof before !== "object" || Array.isArray(before)) throw new Error("switch-trial: the trial's line in wrangler.jsonc cannot be read");
  return before;
}
/** The text as it was before the trial: each value it replaced put back as it was written, each key it added and its own line taken out (the
 *  very same bytes); the text itself when it carries no trial. */
export function undoTrial(text) {
  const before = trialMark(text);
  if (!before) return text;
  let out = text;
  for (const [k, raw] of Object.entries(before)) out = raw === null ? removeVar(out, k) : setRawVar(out, k, raw);
  return out.replace(MARK_LINE, "");
}
