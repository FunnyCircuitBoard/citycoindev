// Where a client script still says "vicinity" (the label migration, area b: the client scripts). A small JavaScript lexer, enough for
// the scripts in public/: comments, strings, template literals (with ${…} nesting and the tag in front), regular expression literals
// (told from a division by the token before them) and the rest as identifiers, numbers and punctuators. scanVicinity(src) returns every
// occurrence of the word, in any letter case, outside comments, with where it stands:
//   brand      in the words of a brand`…` text (the script's brand helper renames it from the page's <html> labels)
//   legacy     in today's branch of `BRAND ? … : …` (the other branch is what a page built for another label set shows)
//   name       part of an identifier or a property name (internal: onVicinity, lp.vicinity, window.vicinityTicker)
//   key        a whole string that is a stored value or a storage, event or cache key ("vicinity", "vicinity-theme", "vicinity:me")
//   parser     inside a regular expression literal (never shown: it reads words the Worker sends)
//   text       anything else: words a person may see, which still name today's brand
// It is not a parser: it is checked against the scripts it reads (test/brand-adapters.test.js), not against JavaScript at large.

const PUNCT = ["...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>"];
const REGEX_AFTER_WORD = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);

/** Tokens: { t: "str" | "tpl" | "re" | "id" | "num" | "p", v, at, tag, first } (tag: the identifier in front of a template, for its chunks;
 *  first: the index of the template's first chunk, so a chunk after a ${…} substitution is judged where its template stands). */
export function lex(src) {
  const out = [];
  const frames = []; // open template substitutions: { tag, depth, first }
  let i = 0;
  const last = () => out[out.length - 1];
  const regexAllowed = () => {
    const p = last();
    if (!p) return true;
    if (p.t === "id") return REGEX_AFTER_WORD.has(p.v);
    if (p.t === "num" || p.t === "str" || p.t === "re") return false;
    if (p.t === "tpl") return false;
    return ![")", "]", "}"].includes(p.v);
  };
  // one template chunk from i (just after ` or after the } that closes a substitution); returns true when the template ended
  const chunk = (tag, first = out.length) => {
    const at = i;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { out.push({ t: "tpl", v: src.slice(at, i), at, tag, first }); i++; return true; }
      if (c === "$" && src[i + 1] === "{") { out.push({ t: "tpl", v: src.slice(at, i), at, tag, first }); i += 2; frames.push({ tag, depth: 0, first }); return false; }
      i++;
    }
    throw new Error(`unclosed template at ${at}`);
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); if (e < 0) throw new Error(`unclosed comment at ${i}`); i = e + 2; continue; }
    if (c === '"' || c === "'") {
      const at = i; i++;
      while (i < src.length && src[i] !== c) { if (src[i] === "\\") i++; if (src[i] === "\n") throw new Error(`newline in a string at ${at}`); i++; }
      out.push({ t: "str", v: src.slice(at + 1, i), at }); i++; continue;
    }
    if (c === "`") {
      const p = last();
      const tag = p && p.t === "id" && src.slice(p.at + p.v.length, i).trim() === "" ? p.v : null;
      i++; chunk(tag); continue;
    }
    if (c === "/" && regexAllowed()) {
      const at = i; i++;
      let inClass = false;
      while (i < src.length) {
        const d = src[i];
        if (d === "\\") { i += 2; continue; }
        if (d === "\n") throw new Error(`newline in a regular expression at ${at}`);
        if (d === "[") inClass = true; else if (d === "]") inClass = false; else if (d === "/" && !inClass) break;
        i++;
      }
      i++; while (/[a-z]/i.test(src[i] || "")) i++;
      out.push({ t: "re", v: src.slice(at, i), at }); continue;
    }
    if (/[A-Za-z_$]/.test(c)) { const at = i; while (/[\w$]/.test(src[i] || "")) i++; out.push({ t: "id", v: src.slice(at, i), at }); continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) { const at = i; while (/[\w.]/.test(src[i] || "")) i++; out.push({ t: "num", v: src.slice(at, i), at }); continue; }
    if (frames.length && (c === "{" || c === "}")) {
      const f = frames[frames.length - 1];
      if (c === "{") f.depth++;
      else if (f.depth === 0) { frames.pop(); i++; chunk(f.tag, f.first); continue; }
      else f.depth--;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i)) || c;
    // "?." before a digit is a conditional and a number (a ? .5 : 1), never optional chaining
    const v = p === "?." && /[0-9]/.test(src[i + 2] || "") ? "?" : p;
    out.push({ t: "p", v, at: i }); i += v.length;
  }
  if (frames.length) throw new Error("unclosed template substitution");
  return out;
}

/**
 * Is token k in today's branch of a conditional whose test is `isTest` (the part after ":"), at any depth of conditionals nested in it
 * (`BRAND ? a : c ? b : d` puts b and d there) and anywhere inside that branch's expression: in a group, a call's arguments, an array, an
 * object literal or an arrow function's body (`BRAND ? a : f("x", [y])`)? Or in the else block of `if (test) { … } else { … }` (`isCond`,
 * over the tokens between its parentheses), at any depth of statements inside it? Walking back from the token at its own bracket depth:
 * a ":" met with no colon open is the colon of a conditional whose other branch holds the token, and the "?" that closes it names its test;
 * a "?" met with no colon open is the conditional whose first branch holds the token (its enclosing one is looked for further back). A ","
 * or ";" means a sibling, and a statement block (a "{" after ")", else, try, finally or do, or at the start) is not part of an
 * expression: either way the walk goes on from the bracket that holds them, never through the statements before (so a conditional that
 * ends an earlier statement is never taken for the token's own).
 */
const BLOCK_AFTER = new Set(["else", "try", "finally", "do"]);
/** The index of the bracket that opens the one closing at `j` (walking back), or -1. */
function openerOf(toks, j) {
  let d = 0;
  for (let i = j; i >= 0; i--) {
    const y = toks[i];
    if (y.t !== "p") continue;
    if ([")", "]", "}"].includes(y.v)) d++;
    else if (["(", "[", "{"].includes(y.v) && --d === 0) return i;
  }
  return -1;
}
/** The index of the bracket that holds position j (an opener before it with nothing unclosed between), or -1. */
function holderOf(toks, j) {
  let d = 0;
  for (let i = j - 1; i >= 0; i--) {
    const y = toks[i];
    if (y.t !== "p") continue;
    if ([")", "]", "}"].includes(y.v)) d++;
    else if (["(", "[", "{"].includes(y.v)) { if (d === 0) return i; d--; }
  }
  return -1;
}
/** Is the block opening at `j` the else block of `if (<cond>) { … } else {`, with isCond(cond's tokens)? */
function elseOf(toks, j, isCond) {
  const els = toks[j - 1], close = toks[j - 2];
  if (!els || els.t !== "id" || els.v !== "else" || !close || close.v !== "}") return false;
  const open = openerOf(toks, j - 2);
  if (open < 1 || toks[open - 1].v !== ")") return false;
  const paren = openerOf(toks, open - 1);
  if (paren < 1 || toks[paren - 1].t !== "id" || toks[paren - 1].v !== "if") return false;
  return isCond(toks.slice(paren + 1, open - 1));
}
const isBlock = (toks, j) => {
  const before = toks[j - 1];
  return toks[j].v === "{" && (!before || (before.t === "p" && [")", ";", "}", "{"].includes(before.v)) || (before.t === "id" && BLOCK_AFTER.has(before.v)));
};
function inTodaysBranch(toks, k, isTest, isCond = () => false) {
  let depth = 0;
  const colons = []; // true: the colon of a conditional whose other branch holds the token
  for (let j = k - 1; j >= 0; j--) {
    const x = toks[j];
    if (x.t !== "p") continue; // words, names and template chunks (a substitution's braces are not tokens)
    if ([")", "]", "}"].includes(x.v)) { depth++; continue; }
    let jump = false;
    if (["(", "[", "{"].includes(x.v)) {
      if (depth > 0) { depth--; continue; }
      // the bracket that holds the token: an expression bracket is part of the expression around it; a statement block is today's
      // branch when it is the else block of the test, and otherwise the walk goes on from the bracket that holds the block
      if (!isBlock(toks, j)) { colons.length = 0; continue; }
      if (elseOf(toks, j, isCond)) return true;
      jump = true;
    } else if (depth > 0) continue;
    else if (x.v === ":") colons.push(colons.length === 0);
    else if (x.v === "?") {
      if (!colons.length) continue; // the token is in this conditional's first branch
      if (colons.pop() && isTest(toks, j)) return true;
    } else if (x.v === "," || x.v === ";") jump = true;
    if (jump) {
      const i = holderOf(toks, j);
      if (i < 0) return false;
      j = i + 1; // the next step reads that bracket
      colons.length = 0;
    }
  }
  return false;
}
/** Is token k today's branch of `BRAND ? a : b` (b, the part after ":" of a conditional whose test is the identifier BRAND)? */
const legacyBranch = (toks, k) => inTodaysBranch(toks, k, (t, j) => { const q = t[j - 1]; return Boolean(q && q.t === "id" && q.v === "BRAND"); },
  (c) => c.length === 1 && c[0].t === "id" && c[0].v === "BRAND");

const KEY = /^vicinity(?:[-_:.][\w:.-]*)?$/;
/** Every "vicinity" outside comments: [{ at, line, kind, token }] (see the top of this file). */
export function scanVicinity(src) {
  const toks = lex(src);
  const lineOf = (at) => src.slice(0, at).split("\n").length;
  const found = [];
  toks.forEach((x, k) => {
    if (!/vicinity/i.test(x.v)) return;
    const at = x.t === "tpl" && Number.isInteger(x.first) ? x.first : k; // a template is judged where it starts
    const kind = x.t === "id" ? "name"
      : x.t === "re" ? (legacyBranch(toks, k) ? "legacy" : "parser")
        : x.t === "tpl" && x.tag === "brand" ? "brand"
          : legacyBranch(toks, at) ? "legacy"
            : (x.t === "str" && KEY.test(x.v)) || (x.t === "tpl" && /^vicinity[-_:.][\w:.-]*$/.test(x.v)) ? "key"
              : "text";
    found.push({ at: x.at, line: lineOf(x.at), kind, token: x.v, t: x.t });
  });
  return found;
}

/** The words of every brand`…` text of a script (its literal parts, as written in the source). */
export const brandTexts = (src) => lex(src).filter((x) => x.t === "tpl" && x.tag === "brand").map((x) => x.v);

/* ---------------------------------------------------------------- the Worker's words (label migration, area c) */
// The same lexer over src/: where the Worker still says "vicinity". The Worker's words go through src/brandwords.js: a bw`…` template
// (renamed from the label set), bw.say(…) (a whole text of ours, renamed), or today's branch of `….on ? … : …` (the other branch is the
// label set's own text). scanServer(src) returns every occurrence outside comments:
//   bw        in the words of a bw`…` text
//   say       inside the argument of a .say(…) call
//   legacy    in today's branch of a `bw.on ? … : …` conditional (any words object's `.on`)
//   name      part of an identifier or a property name
//   parser    inside a regular expression literal
//   internal  a whole string that is a stored value or key ("vicinity", "vicinity-map", "vicinity:city:", "vicinity_launchpad 0.1.0", the
//             ticker "VICINITY"), an address (https://vicinity.city…, cache.vicinity.internal, www.vicinity.city), a path
//             (/brand/vicinity-512.png), a header name, a MIME boundary or a hash domain's formula
//   text      anything else: words that still name today's brand (test/brand-adapters.test.js counts them per file, with why)

/** Is token k inside the argument list of a `.say(` call (of the same statement)? */
function insideSay(toks, k) {
  let depth = 0;
  for (let j = k - 1; j >= 0; j--) {
    const x = toks[j];
    if (x.t !== "p") continue;
    if ([")", "]", "}"].includes(x.v)) depth++;
    else if (["(", "[", "{"].includes(x.v)) {
      if (depth > 0) { depth--; continue; }
      if (x.v !== "(") return false;
      const f = toks[j - 1], dot = toks[j - 2];
      if (f && f.t === "id" && f.v === "say" && dot && dot.v === ".") return true;
      // an inner call or group: keep looking outwards
    } else if (depth === 0 && x.v === ";") return false;
  }
  return false;
}
/** Is token k in today's branch (after ":") of a conditional whose test ends in `.on` (a words object: bw.on, brandWords(env).on)? */
const legacyOfWords = (toks, k) => inTodaysBranch(toks, k, (t, j) => { const q = t[j - 1], dot = t[j - 2]; return Boolean(q && q.t === "id" && q.v === "on" && dot && dot.v === "."); },
  (c) => c.length >= 3 && c[c.length - 1].t === "id" && c[c.length - 1].v === "on" && c[c.length - 2].v === "." && !c.some((x) => x.t === "p" && ["!", "&&", "||", "?", "??"].includes(x.v)));
const INTERNAL = [
  /^vicinity(?:[-_:.|][\w:.|-]*)?$/,                         // a stored value or a key ("vicinity", "vicinity-map", "vicinity:city:", "vicinity-seat|")
  /^VICINITY$/,                                              // the legacy token's ticker, a value (an upper-case ticker is never renamed)
  /^vicinity_[a-z]+ \d+\.\d+\.\d+$/,                         // a program's IDL name and version
  /^(?:https?:\/\/)?(?:[\w-]+\.)*vicinity(?:city)?\.(?:city|net|com|internal)(?:[:/][^\s"'`]*)?$/i, // an address on a host of the old name
  /^\/brand\/vicinity-512\.png$/,                            // the legacy badge's path (kept for whatever names it)
  /^x-vicinity-[\w-]+$/i,                                    // an internal header name
  /^vicinitys$/,                                             // a word of the screener's staff-name list (it reads founders' words)
  /^sha256\('vicinity-[\w-]+\|'/,                            // a hash domain's formula (persistent)
  /^[\w-]+:\s*multipart\/alternative; boundary=\\?"vicinity-boundary\\?"$|^(?:\\r\\n)?--vicinity-boundary(?:--)?(?:\\r\\n)?$/i, // a MIME boundary
];
/** Every "vicinity" of a Worker source outside comments: [{ at, line, kind, token, t }] (see above). */
export function scanServer(src) {
  const toks = lex(src);
  const lineOf = (at) => src.slice(0, at).split("\n").length;
  const found = [];
  toks.forEach((x, k) => {
    if (!/vicinity/i.test(x.v)) return;
    const at = x.t === "tpl" && Number.isInteger(x.first) ? x.first : k; // a template is judged where it starts
    const kind = x.t === "id" ? "name"
      : x.t === "re" ? "parser"
        : x.t === "tpl" && x.tag === "bw" ? "bw"
          : insideSay(toks, k) ? "say"
            : legacyOfWords(toks, at) ? "legacy"
              : (x.t === "str" || x.t === "tpl") && INTERNAL.some((r) => r.test(x.v)) ? "internal"
                : "text";
    found.push({ at: x.at, line: lineOf(x.at), kind, token: x.v, t: x.t });
  });
  return found;
}
