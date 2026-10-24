// The connect page while WALLET_ONLY counts (Citycoin.dev master v5, stage S12; master section 18 WP-02, section 19 WP-03, section 14 DS-06).
// Loaded by public/connect.js ONLY when /api/me says walletOnly (src/me.js; the server's fail-closed gate, src/v5policy.js walletOnly), so with
// the switch off this file is never fetched and the page is today's. Two paths, both wallet only, and nothing else:
//   Sign in             a wallet signs a server "login" challenge (POST /api/auth/challenge, then /api/auth/wallet). Never asks for a location.
//                       An unknown wallet gets one screen: "No account for this wallet. Register in Safari or Chrome: verify your city once,
//                       then connect this wallet." with the link to copy; nothing is made.
//   Register your city  the location in THIS browser first (today's location step, /api/signup/location; only the city is kept), then the
//                       Terms and an optional display name, then the wallet: this browser's wallet (/api/signup/wallet), on a phone the wallet
//                       app opened with a five-minute single-use code (/api/signup/handoff: /connect#register=<code>), or a phone's wallet
//                       for a computer (POST /api/pair {purpose: "register"}: /connect#pair=<code>). Inside a wallet app's browser it never
//                       asks for a location: it offers "Open in Safari or Chrome" instead.
// The legacy link window (stage S14; only while /api/me carries `legacyLink`, src/legacy.js): /connect?mode=legacy is a third path, for a member whose
// account was made with Google or an e-mail address and has no wallet: log in once with that login (a restricted 15-minute session), then connect the
// wallet that opens the account from now on (a "legacy_link" challenge, POST /api/me/wallet/link; on a phone without a wallet, a link pairing), then
// Sign in with it. Sign in and the no-account screen carry one line about it (or, once LEGACY_LINK_UNTIL has passed, that the window has closed).
// Outside that path no Google, e-mail or password control is shown. Codes travel only in POST bodies and in the fragment of a link, which no
// browser sends to this site's server or puts in a Referer; a hand-off code leaves the address bar before anything is asked. One exception, by
// design of the wallet apps (review finding SEC-8): "Open app" wraps the whole link, fragment included, in the wallet vendor's universal link
// (public/wallets.js KNOWN open), so when the phone does not hand that link to the app the vendor's web server sees the live code. The vendor
// is a trusted party there; what protects the code is its five-minute single use, the first-opener binding and the connection binding. The wallet screens (pick, sign, phone, approve) are connect.js's: it asks
// this file what to sign (challengeFor), where to send it (signPath, signExtra) and what to do with the answer (walletProven).
// New words are product-neutral or come from the page's own labels (the build writes them from src/brand.js): no product name is typed here.
// Needs site.js (window.V), wallets.js (window.VW) and connect.js. Nothing here touches the DOM until start() is called.
(() => {
  "use strict";

  /* ================= pure helpers: no DOM (test/identity-connect-ui.test.js runs them in node) ================= */
  // master section 14 DS-06, word for word
  const DS06 = Object.freeze({
    register: "Verify your city once, then connect your wallet. We keep your city/country, not your raw GPS coordinates.",
    signin: "Connect your wallet to return to your dashboard. No location check required.",
  });
  // R1-13: the no-account screen (the heading and the body read as one sentence pair)
  const NO_ACCOUNT = Object.freeze({ title: "No account for this wallet.", body: "Register in Safari or Chrome: verify your city once, then connect this wallet." });
  const INAPP = Object.freeze({ title: "Open in Safari or Chrome", body: "Registration starts in Safari or Chrome: verify your city once there, then connect this wallet." });
  const LOCATION_UNVERIFIED = "We couldn't confirm your location. Turn on precise location, use your normal mobile or home internet (no VPN), and try again.";
  const ERR = Object.freeze({
    location_required: "Verify your city first: share your location once in this browser.",
    location_unverified: LOCATION_UNVERIFIED,
    location_changed: "Your city changed in the meantime. Please check it again, then connect your wallet.",
    cities_unavailable: "The map is busy. Please try again in a minute.",
    bad_choice: "That choice isn't available any more. Please check your location again.",
    no_choices: "There is nothing to choose from any more. Please check your location again.",
    terms_required: "Tick the box to agree to the Terms of Use first.",
    bad_version: "The Terms of Use were updated. Please reload the page to read the new version.",
    bad_username: "Use 3 to 20 letters, digits or _, starting with a letter.",
    username_reserved: "That name is reserved. Please pick another.",
    username_taken: "That name is taken. Please pick another, or leave it empty.",
    username_similar: "That name looks too much like someone else's. Please pick another.",
    no_signup: "Your registration was open too long, so it was cleared. Start again: verify your city once, then connect your wallet.",
    signup_expired: "Your registration ran out. Start again: verify your city once, then connect your wallet.",
    wrong_signup: "That signature was for an earlier step. Please connect your wallet again.",
    wallet_conflict: "This wallet can't be registered here. Please use another wallet.",
    already_signed_in: "You're already signed in. Taking you to your dashboard…",
    handoff_relay: "This browser hides its connection, so the link can't move into your wallet app. Approve there instead, then come back here.",
    code_expired: "That link was used or ran out. Go back to Safari or Chrome and get a new link.",
    code_network: "Your wallet app and Safari or Chrome are on different internet connections (Wi-Fi and mobile data?). Go back to Safari or Chrome and approve in your wallet app instead: that works on any connection.",
    "code_network:relay": "This link works only in the country where you made it, and not through a VPN. Go back to Safari or Chrome and approve in your wallet app instead: that works anywhere.",
    contested: "That link was opened twice, so it stopped working. Go back to Safari or Chrome and get a new link. Never send it to anyone.",
    not_opened: "That link was opened in another app. Go back to Safari or Chrome and get a new link.",
    pair_expired: "That code expired. Go back to where you started and try again.",
    use_sign_in: "This wallet already has an account. Sign in with it instead: nothing was registered.",
    forbidden: "This wallet has no access here.",
    slow_down: "That's a lot of attempts. Take a short break and try again in a little while.",
    signup_unavailable: "Registration is down for a moment. Please try again in a few minutes.",
    unavailable: "Something went wrong on our side. Please try again in a minute.",
    wrong_origin: "Something went wrong. Please reload the page and try again.",
    offline: "Couldn't reach the site. Check your connection and try again.",
    generic: "Something went wrong. Please try again.",
  });
  // the legacy link window (stage S14): its own words, kept apart from ERR (the two everyday paths never speak of Google or e-mail)
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  /** The instant the window closes, in words, exactly (UTC): "1 December 2026, 00:00 UTC". "" for anything that is not a time. */
  function untilText(iso) {
    const d = new Date(String(iso || ""));
    if (!iso || !Number.isFinite(d.getTime())) return "";
    const two = (n) => String(n).padStart(2, "0");
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`;
  }
  const LEGACY = Object.freeze({
    noteOpen: (u) => `Made your account with Google or e-mail before wallet sign-in? Connect a wallet to it until ${u}.`,
    noteLink: "Connect a wallet to my account",
    noteClosed: (u) => `Connecting a wallet to an account made with Google or e-mail was possible until ${u}. That window has closed.`,
    lead: "For an account made with Google or e-mail before wallet sign-in.",
    title: "Connect a wallet to your account",
    body: (u) => `Your account was made with Google or e-mail. Log in with it here once, then connect the wallet that will open your account from now on. This works until ${u}.`,
    closedTitle: "This window has closed",
    google: "Log in with Google",
    inapp: "Google log-in doesn't open inside a wallet app. Use the e-mail code here, or open this page in Safari or Chrome.",
    emailLabel: "E-mail address of your account",
    send: "Send me a code",
    sent: (e) => `If an account was made with ${e}, a 6-digit code is on its way. It works for 10 minutes.`,
    codeLabel: "6-digit code",
    verify: "Log in",
    resend: "Send a new code",
    back: "Back to Sign in",
    linkH: "Connect the wallet for your account",
    linkLead: "You're logged in to your account for 15 minutes. Connect the wallet that should open it from now on. A wallet that already has an account here can't be used.",
    signH: "Connect this wallet to your account",
    signBtn: "Sign and connect",
    doneH: "Wallet connected",
    doneSub: "From now on this wallet opens your account. Sign in with it to see your dashboard.",
    doneGo: "Sign in with your wallet",
    approveH: "Connect this wallet to your account?",
    approveWarn: "Only continue if you just logged in to your own account yourself. From now on this wallet opens that account.",
    approveDonePhone: " Go back to Safari or Chrome: it finishes the link. Then sign in with this wallet.",
    approveDone: " Go back to where you logged in: it finishes the link. Then sign in with this wallet.",
  });
  const LEGACY_ERR = Object.freeze({
    legacy_sign_in: "Your log-in ran out (it lasts 15 minutes). Log in again.",
    wallet_taken: "This wallet already has an account here. Connect another wallet, or sign in with this one to open its own account.",
    link_done: "Your account has a wallet now. Sign in with it.",
    use_wallet: "This account already has a wallet. Sign in with your wallet instead.",
    "no_account:google": "No account was made with this Google account. Check that you picked the one you signed up with.",
    no_account: "No account was made with this e-mail address. Check the address you signed up with.",
    wrong_session: "That signature was for an earlier log-in. Please connect your wallet again.",
    bad_email: "That doesn't look like an e-mail address.",
    bad_code: "Enter the 6-digit code from the e-mail.",
    code_expired: "That code ran out. Send a new one.",
    too_many: "Too many tries. Ask for a new code in an hour.",
    too_soon: "A code was just sent. Wait a minute before asking for another.",
    email_unavailable: "E-mail log-in isn't available right now. Please try again later.",
    login_cancelled: "The Google log-in was cancelled. Nothing changed.",
    login_expired: "That log-in took too long or was opened in another tab. Please try again.",
    login_failed: "The Google log-in didn't go through. Please try again.",
    login_unavailable: "Google log-in isn't available right now. Use the e-mail code instead.",
  });
  /** One plain sentence for a legacy answer ({ error, left?, login? }) or code; window_closed is said by the closed screen itself. */
  function legacyText(d, login) {
    const code = typeof d === "string" ? d : d && d.error;
    if (code === "code_wrong") { const left = d && d.left; return left != null ? `That code doesn't match. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code doesn't match."; }
    if (code === "no_account" && ((d && d.login) || login) === "google") return LEGACY_ERR["no_account:google"];
    return LEGACY_ERR[code] || ERR[code] || ERR.generic;
  }

  /** One plain sentence for a server answer ({ error }) or an error code. */
  function errText(d) {
    const code = typeof d === "string" ? d : d && d.error;
    if (code === "code_network" && d && d.relay) return ERR["code_network:relay"];
    return ERR[code] || ERR.generic;
  }
  /** The wallet answers this page deals with itself (connect.js hands them to walletProven instead of showing a plain error). */
  const HANDLED = Object.freeze(["no_account", "location_required", "location_unverified", "location_changed", "terms_required", "username_taken", "no_signup",
    "signup_expired", "wrong_signup", "wallet_conflict", "already_signed_in", "code_expired", "code_network", "contested", "not_opened", "forbidden",
    "use_sign_in", // (a register pairing approved by a wallet that already has an account: nothing registered, review finding SEC-3)
    // the legacy link window (stage S14)
    "legacy_sign_in", "wallet_taken", "link_done", "window_closed", "wrong_session"]);
  /** The codes a link carries in its fragment (/connect#register=<code>, /connect#pair=<code>&on=phone): never in a URL a server sees. */
  function parseFragment(hash) {
    const q = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    const ok = (v, min) => (typeof v === "string" && new RegExp(`^[A-Za-z0-9_-]{${min},64}$`).test(v) ? v : null);
    return { register: ok(q.get("register"), 32), pair: ok(q.get("pair"), 16), on: q.get("on") === "phone" ? "phone" : null };
  }
  /** The registration's step bar: the city (in this browser), then the wallet. st = GET /api/signup/state's `state`; hold = "city" (looking at it again). */
  function regView(st, hold) {
    const located = Boolean(st && st.location && st.location.done);
    const view = !located || hold === "city" ? "city" : "wallet";
    return { view, steps: [{ key: "city", done: located, active: view === "city", editable: located && view !== "city" }, { key: "wallet", done: false, active: view === "wallet", editable: false }] };
  }
  /** Anything in the registration the person would have to redo. */
  const hasProgress = (st) => Boolean(st && ((st.location && (st.location.done || (st.location.choices && st.location.choices.length))) || (st.terms && st.terms.done) || st.name));
  /** Only ever follow the server to our own dashboard. */
  const safeNext = (next) => (next === "/dashboard?welcome=1" || /^\/dashboard#[a-z][a-z0-9-]{0,24}$/.test(String(next)) ? next : "/dashboard");
  /** The username rules of the server (src/me.js validUsername): 3 to 20 letters, digits or _, a letter first. */
  const validName = (s) => /^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(String(s || ""));
  /** What the done screen says. how = "signin" | "registered" | "existing". */
  function doneCopy(how, city) {
    if (how === "registered") return { h: "You're registered.", sub: city ? `Your city is ${city}. Taking you to your dashboard…` : "Taking you to your dashboard…" };
    if (how === "existing") return { h: "You're in.", sub: "This wallet already has an account, so we signed you in. Its city is unchanged. Taking you to your dashboard…" };
    return { h: "You're in.", sub: "Taking you to your dashboard…" };
  }
  /** Why the pairing (approve in the wallet app, finish here) shows instead of "Open app": the connection is hidden behind a relay. */
  function relayWhy(name, iphone, qr) {
    const w = name || "your wallet app";
    const lead = `${iphone ? "Your iPhone hides its connection (iCloud Private Relay)" : "This browser hides its connection (a VPN or a private relay)"}, so the link can't move into ${w}`;
    return qr ? `${lead} here. Instead, scan the code below with your phone and approve there, then come back here: this page finishes by itself.` : `${lead}. Approve there instead, then come back here: this page finishes by itself.`;
  }

  window.VWalletOnly = { start, pure: { DS06, NO_ACCOUNT, INAPP, ERR, HANDLED, errText, parseFragment, regView, hasProgress, safeNext, validName, doneCopy, relayWhy,
    LEGACY, LEGACY_ERR, legacyText, untilText } };

  /* ================= the controller ================= */
  function start(ctx) {
    const { $, $$, el, api, copy, burst, getLocation } = window.V;
    const W = window.VW;
    const { panel, params, show, setErr, renderPick, connectWith, approve } = ctx;
    const WA = window.V.walletApp || { here: () => null, remembered: () => null, remember() {} };
    const here = () => WA.here();
    const inApp = () => W.inWalletApp();
    // the registration gate (master section 19 step 1, never a location inside a wallet app): the user agent's own word (review finding F5: a
    // phone's Brave or Kiwi with a wallet of its own is a normal browser that can share its location and sign), not "a phone with a wallet on
    // the page", which the sign-in and "Open app" paths still use
    const inAppByAgent = () => (typeof W.walletAppByAgent === "function" ? W.walletAppByAgent() : inApp());
    const knownApp = (id) => (id && W.KNOWN.find((k) => k.id === id)) || null;
    const text = (sel, t) => { const e = $(sel); if (e) e.textContent = t; };
    const hide = (sel, h = true) => { const e = typeof sel === "string" ? $(sel) : sel; if (e) e.hidden = h; };
    const S = {
      mode: "page",     // "page" (the two tabs) | "claim" (a wallet app opened a register link) | "approve" (a phone approving a pairing) | "dead"
      tab: "register",  // "register" | "signin" | "legacy" (the legacy link window, /connect?mode=legacy: no tab of its own)
      legacyStep: "login", legacyEmail: "", // the legacy path: "login" (Google or the e-mail code) | "link" (the restricted session connects a wallet)
      me: null, srv: null, cur: "", hold: null, redo: false, justLocated: false, started: false, leaving: false, first: true, autoTimer: null,
      carry: null, carryTimer: null, // a phone's "Open app" register link waiting to be used { k, name, link, pin, ref, until, relay, opened, ... }
      claim: null,      // the wallet app's browser: { code, opener, info }
      approve: null,    // the phone approving a pairing: { code, purpose, on }
      pairName: null, pairRelay: false, withId: null, touched: false,
    };
    let liveFlip = false;
    const announce = (t) => { liveFlip = !liveFlip; text("#su-live", liveFlip ? t : t + " "); };
    /** A calm one-sentence note under the tabs (why the person was moved). */
    function notice(msg) { const n = $("#su-note"); if (!n) return; n.textContent = msg || ""; n.hidden = !msg; if (msg) announce(msg); }
    const reduced = () => Boolean(window.V.reduced);
    const productLine = () => { const f = $(".site-footer__safe"); return f ? f.textContent.trim() : ""; }; // the layout's label (src/brand.js safety)

    /* ---------- talking to the server ---------- */
    /** api() plus the answers every registration call shares: signed in elsewhere, the registration lost. d._handled = the page dealt with it. */
    async function call(path, body) {
      const d = await api(path, body);
      if (d.error === "already_signed_in") { signedIn("signin", "/dashboard"); d._handled = true; return d; }
      if ((d.error === "no_signup" || d.error === "signup_expired") && S.mode === "page") { await restart(errText(d)); d._handled = true; return d; }
      return d;
    }
    async function refresh() {
      const d = await api("/api/signup/state");
      if (d.ok && d.state) S.srv = d.state;
      return d;
    }
    async function ensureSignup() {
      if (S.started) return { ok: true };
      const d = await api("/api/signup/start", {});
      if (d.ok) { S.started = true; if (d.state) S.srv = d.state; }
      return d;
    }
    /** The registration row is gone (it lives an hour): start over at the city, saying so. An expired registration is never a login check. */
    async function restart(msg) {
      stopCarry(); forgetCarry();
      Object.assign(S, { hold: null, redo: false, started: false, tab: "register" });
      S.srv = { terms: { done: false, version: (S.srv && S.srv.terms && S.srv.terms.version) || "2026-10-01" }, location: { done: false }, name: null, next: "location" };
      render(); notice(msg);
    }

    /* ---------- small UI helpers ---------- */
    function fieldErr(id, msg) {
      const e = $(`#${id}-error`), i = $(`#${id}`);
      if (e) e.textContent = msg || "";
      if (i && i.tagName === "INPUT") { if (msg) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); }
    }
    async function busy(btn, label, fn) {
      if (btn.dataset.busy) return undefined;
      const old = btn.textContent;
      btn.dataset.busy = "1"; btn.disabled = true; btn.textContent = label; btn.setAttribute("aria-busy", "true");
      try { return await fn(); } finally { delete btn.dataset.busy; btn.removeAttribute("aria-busy"); btn.disabled = false; btn.textContent = old; }
    }
    const FOCUS = { city: "#su-loc-title", pick: "#wallet-h", inapp: "#wo-inapp-h", noAccount: "#na-h", carry: "#carry-h", claim: "#carry-in-h", dead: "#ld-h", legacy: "#wo-lg-h" };
    function focusHeading(key) {
      const h = $(FOCUS[key]);
      if (h && !S.first) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); panel.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" }); }
      S.first = false;
    }
    const svg = (paths, w = 16) => {
      const NS = "http://www.w3.org/2000/svg", s = document.createElementNS ? document.createElementNS(NS, "svg") : el("span");
      if (!s.setAttribute) return s;
      for (const [k, v] of [["viewBox", "0 0 24 24"], ["width", String(w)], ["height", String(w)], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "1.75"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]]) s.setAttribute(k, v);
      for (const d of paths) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.append(p); }
      return s;
    };
    const PIN = ["M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z", "M12 7.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8z"];
    const WALLET = ["M4 7.5A2.5 2.5 0 0 1 6.5 5h11v3", "M6.5 8H18a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 18 19H6.5A2.5 2.5 0 0 1 4 16.5v-9", "M16 13.5h1.5"];

    /* ---------- the page's own pieces (built once: the static page stays today's bytes, test/build-parity.test.js) ---------- */
    function build() {
      const link = el("link"); link.rel = "stylesheet"; link.href = "/wallet-only.css"; document.head.append(link);
      panel.classList.add("su-on", "wo-on"); panel.removeAttribute("aria-live"); // announcements go through #su-live and the error lines
      for (const t of ["pointerdown", "keydown", "click"]) panel.addEventListener(t, () => { S.touched = true; });
      hide("#stepper"); hide("#login-block"); hide("#lg-block");
      // the two paths: Sign in first, then Register your city (the tabs of today's markup, relabelled)
      const tabs = $(".su-tabs");
      tabs.setAttribute("aria-label", "Sign in, or register your city?");
      tabs.prepend($("#tab-login"));
      text("#tab-login", "Sign in"); text("#tab-new", "Register your city");
      // the step bar: your city, then your wallet (no third, optional step)
      const steps = $("#su-steps");
      steps.classList.add("wo-steps"); steps.setAttribute("aria-label", "Registration steps");
      hide("#su-later");
      text("#su-step-location .stepper__label", "Your city"); text("#su-step-location .stepper__sub", "Verify once");
      text("#su-step-account .stepper__label", "Wallet"); text("#su-step-account .stepper__sub", "One signature");
      const ico = $("#su-step-account .stepper__ico");
      if (ico && ico.parentNode) { const w = svg(WALLET); if (w.setAttribute) w.setAttribute("class", "stepper__ico"); ico.parentNode.insertBefore(w, ico); ico.remove(); }
      // the safety fold: free, never the recovery phrase (the layout's own sentence, src/brand.js), one account per wallet
      const safety = $(".connect__intro .safety");
      if (safety) {
        const lines = ["Signing in is free. It isn't a transaction and can't move funds.", productLine(), "One account per wallet. That is not proof of one person."].filter(Boolean);
        safety.replaceChildren(...lines.map((t) => el("li", null, t)));
      }
      // the pick screen: the city of the registration and its Terms and display name, or the sign-in line
      const pick = $('.cstate[data-state="pick"]'), head = $("#wallet-h");
      const chips = el("p", "su-chips wo-reg"); chips.id = "wo-reg-chips";
      const chip = el("span", "su-chip"); chip.id = "wo-city"; const cn = el("span", null, "—"); cn.id = "wo-city-name"; chip.append(svg(PIN, 18), cn);
      const redo = el("button", "link-btn link-btn--tiny", "Not right? Check again"); redo.type = "button"; redo.id = "wo-city-redo";
      chips.append(chip, redo);
      pick.insertBefore(chips, head);
      const form = el("div", "wo-reg wo-form"); form.id = "wo-reg-form";
      const lead = el("p", "muted small", ""); lead.id = "wo-reg-lead";
      const check = el("div", "su-check"); check.dataset.fbAvoid = "";
      const box = el("input"); box.type = "checkbox"; box.id = "wo-terms"; box.setAttribute("aria-describedby", "wo-terms-error");
      const lab = el("label"); lab.setAttribute("for", "wo-terms"); const tl = el("a", null, "Terms of Use"); tl.href = "/terms"; tl.target = "_blank"; tl.rel = "noopener";
      lab.append("I agree to the ", tl, ".");
      check.append(box, lab);
      const termsErr = el("p", "su-err"); termsErr.id = "wo-terms-error"; termsErr.setAttribute("role", "alert");
      const field = el("div", "su-field");
      const nl = el("label"); nl.setAttribute("for", "wo-name"); nl.append("Display name ", el("span", "muted", "(optional)"));
      const name = el("input"); name.id = "wo-name"; name.type = "text"; name.maxLength = 20; name.autocomplete = "nickname"; name.setAttribute("autocapitalize", "none"); name.spellcheck = false;
      name.setAttribute("aria-describedby", "wo-name-hint wo-name-error");
      const hint = el("p", "su-hint", "3 to 20 letters, digits or _, starting with a letter. Leave it empty and one is picked for you."); hint.id = "wo-name-hint";
      const nameErr = el("p", "su-err"); nameErr.id = "wo-name-error"; nameErr.setAttribute("role", "alert");
      field.append(nl, name, hint, nameErr);
      form.append(lead, check, termsErr, field);
      const sin = el("div", "wo-signin"); sin.id = "wo-signin";
      const sinLead = el("p", "muted small", DS06.signin); sinLead.id = "wo-signin-lead";
      const quick = el("button", "btn btn--primary btn--block btn--lg", "Sign in with your wallet"); quick.type = "button"; quick.id = "wo-quick"; quick.hidden = true;
      sin.append(sinLead, quick);
      head.after(form); form.after(sin);
      // inside a wallet app's browser, Register your city: no location here, only the way to Safari or Chrome
      const inapp = el("div", "cstate wo-inapp"); inapp.dataset.state = "wo-inapp"; inapp.hidden = true;
      const ih = el("h2", "h2--sm", INAPP.title); ih.id = "wo-inapp-h"; ih.tabIndex = -1;
      const ib = el("p", "muted small", INAPP.body); ib.id = "wo-inapp-body";
      const row = el("div", "req-form");
      const il = el("label", "sr-only", "Link to open in Safari or Chrome"); il.setAttribute("for", "wo-inapp-link");
      const iv = el("input", "field mono"); iv.id = "wo-inapp-link"; iv.readOnly = true; iv.value = `${location.origin}/connect`;
      const ic = el("button", "btn btn--primary btn--sm", "Copy link"); ic.type = "button"; ic.id = "wo-inapp-copy";
      row.append(il, iv, ic);
      const it = el("p", "tiny muted", "Your city is checked in Safari or Chrome, never inside a wallet app.");
      const isn = el("button", "link-btn", "Already registered? Sign in"); isn.type = "button"; isn.id = "wo-inapp-signin";
      inapp.append(ih, ib, row, it, isn);
      panel.insertBefore(inapp, $("#c-error"));
      buildLegacy(sin);
      // the location step: the master's words, and no hand-off into another browser (the registration's location stays in this one)
      const ask = $("#su-loc-ask");
      if (ask) {
        const first = ask.querySelector("p.muted"); if (first) first.textContent = DS06.register;
        const tiny = ask.querySelector("p.tiny"); if (tiny) tiny.textContent = "Use your normal mobile or home internet, with no VPN.";
      }
      text("#su-loc-phone", "No location here? Copy the link and register on your phone");
      // the screens of today's markup that this page reuses, in its words
      const warn = $(".link-in__warn");
      if (warn) warn.replaceChildren(el("strong", null, "Only continue if you just started this registration in Safari or Chrome on this phone."), " If someone sent you this link, stop.");
      const terms = $$('.cstate[data-state="carry-in"] p.tiny').find((p) => /Terms/.test(p.textContent)); if (terms) terms.textContent = "You accepted the Terms of Use in Safari or Chrome.";
      const ldp = $("#ld-login"); if (ldp && ldp.parentNode) ldp.parentNode.hidden = true; // ("log in with your e-mail and password": not a way in any more)
      // the dead registration link's first way on: copy the link for Safari or Chrome (review finding F7)
      const ldc = el("button", "btn btn--primary btn--block btn--lg", "Copy the link for Safari or Chrome"); ldc.type = "button"; ldc.id = "wo-ld-copy"; ldc.hidden = true;
      const lds = $("#ld-signin"); if (lds && lds.parentNode) lds.parentNode.insertBefore(ldc, lds);
      hide("#na-tiny");
      const q = $("#qr"); if (q) q.setAttribute("aria-label", "QR code to open this page on your phone");
      wire();
    }

    /** The legacy link window's pieces (stage S14): built hidden every time, shown only while /api/me carries legacyLink. */
    function buildLegacy(sin) {
      // the one line on Sign in and on the no-account screen
      const note = el("p", "tiny muted wo-legacy-note"); note.id = "wo-legacy-note"; note.hidden = true; sin.append(note);
      const naNote = el("p", "tiny muted wo-legacy-note"); naNote.id = "wo-legacy-note-na"; naNote.hidden = true;
      const na = $("#na-another"); if (na && na.parentNode) na.parentNode.insertBefore(naNote, na.nextSibling);
      // the link step's line on the pick screen
      const lead = el("p", "muted small"); lead.id = "wo-legacy-lead"; lead.hidden = true; lead.textContent = LEGACY.linkLead;
      $("#wo-signin").after(lead);
      // the log-in screen: Google (a link: the trip to Google and back), or the e-mail code
      const box = el("div", "cstate wo-legacy"); box.dataset.state = "wo-legacy"; box.hidden = true;
      const h = el("h2", "h2--sm", LEGACY.title); h.id = "wo-lg-h"; h.tabIndex = -1;
      const body = el("p", "muted small"); body.id = "wo-lg-body";
      const login = el("div", "wo-lg-login"); login.id = "wo-lg-login";
      const g = el("a", "btn btn--glass btn--block btn--lg", LEGACY.google); g.id = "wo-lg-google"; g.setAttribute("href", "/api/auth/google/start?legacy=1");
      const gIn = el("p", "tiny muted", LEGACY.inapp); gIn.id = "wo-lg-inapp"; gIn.hidden = true;
      const form = el("form", "wo-form wo-lg-form"); form.id = "wo-lg-email"; form.noValidate = true;
      const f1 = el("div", "su-field"); f1.id = "wo-lg-step-email";
      const l1 = el("label", null, LEGACY.emailLabel); l1.setAttribute("for", "wo-lg-addr");
      const addr = el("input", "field"); addr.id = "wo-lg-addr"; addr.type = "email"; addr.autocomplete = "email"; addr.setAttribute("autocapitalize", "none"); addr.spellcheck = false;
      addr.setAttribute("aria-describedby", "wo-lg-error");
      const send = el("button", "btn btn--primary btn--block", LEGACY.send); send.type = "button"; send.id = "wo-lg-send";
      f1.append(l1, addr, send);
      const f2 = el("div", "su-field"); f2.id = "wo-lg-step-code"; f2.hidden = true;
      const sent = el("p", "muted small"); sent.id = "wo-lg-sent"; sent.setAttribute("role", "status");
      const l2 = el("label", null, LEGACY.codeLabel); l2.setAttribute("for", "wo-lg-code");
      const code = el("input", "field mono"); code.id = "wo-lg-code"; code.inputMode = "numeric"; code.autocomplete = "one-time-code"; code.maxLength = 6;
      code.setAttribute("aria-describedby", "wo-lg-error");
      const verify = el("button", "btn btn--primary btn--block", LEGACY.verify); verify.type = "button"; verify.id = "wo-lg-verify";
      const resend = el("button", "link-btn link-btn--tiny", LEGACY.resend); resend.type = "button"; resend.id = "wo-lg-resend";
      f2.append(sent, l2, code, verify, resend);
      form.append(f1, f2);
      login.append(g, gIn, el("p", "or-line wo-lg-or", "or"), form);
      const err = el("p", "su-err"); err.id = "wo-lg-error"; err.setAttribute("role", "alert");
      const back = el("button", "link-btn", LEGACY.back); back.type = "button"; back.id = "wo-lg-back";
      box.append(h, body, login, err, back);
      panel.insertBefore(box, $("#c-error"));
    }

    function wire() {
      $("#tab-login").addEventListener("click", () => setTab("signin"));
      $("#tab-new").addEventListener("click", () => setTab("register"));
      $$("#su-steps button").forEach((b) => b.addEventListener("click", () => { if (b.closest("li").dataset.step !== "location") return; clearTimeout(S.autoTimer); S.justLocated = false; S.hold = "city"; S.redo = false; render(); }));
      $("#su-loc-go").addEventListener("click", shareLocation);
      $("#su-loc-phone").addEventListener("click", () => copy(`${location.origin}/connect`, "Link copied. Open it in Safari or Chrome on your phone."));
      $("#su-choices-redo").addEventListener("click", () => { S.redo = true; render(); });
      $("#su-loc-continue").addEventListener("click", () => { clearTimeout(S.autoTimer); S.justLocated = false; S.hold = null; S.redo = false; render(); });
      $("#su-loc-redo").addEventListener("click", () => { clearTimeout(S.autoTimer); S.justLocated = false; S.redo = true; S.hold = "city"; locError(""); render(); });
      $("#wo-city-redo").addEventListener("click", () => { S.redo = true; S.hold = "city"; locError(""); render(); });
      $("#wo-terms").addEventListener("change", () => fieldErr("wo-terms", ""));
      $("#wo-name").addEventListener("input", () => fieldErr("wo-name", ""));
      $("#wo-quick").addEventListener("click", () => { const a = W.list()[0]; if (a) connectWith(a, null, true); });
      $("#wo-inapp-copy").addEventListener("click", () => copy(`${location.origin}/connect`, "Link copied. Paste it in Safari or Chrome."));
      $("#wo-inapp-link").addEventListener("focus", (e) => e.target.select());
      $("#wo-inapp-signin").addEventListener("click", () => setTab("signin"));
      // the no-account screen
      $("#na-create").addEventListener("click", () => { S.mode = "page"; setTab("register", true); });
      $("#na-copy").addEventListener("click", () => copy(`${location.origin}/connect`, "Link copied. Paste it in Safari or Chrome."));
      $("#na-another").addEventListener("click", () => { S.mode = "page"; setTab("signin", true); });
      // the phone's "Open app" screen
      document.addEventListener("visibilitychange", () => { if (!document.hidden && S.carry) { S.carry.back = true; pollCarry(); } });
      $("#carry-back").addEventListener("click", () => { stopCarry(); forgetCarry(); render(); });
      $("#carry-pair").addEventListener("click", () => { const n = S.carry && S.carry.name; stopCarry(); forgetCarry(); render(); pairInstead(n, false); });
      $("#carry-renew").addEventListener("click", () => renewCarry());
      // the wallet app's browser
      $("#carry-in-yes").addEventListener("click", acceptClaim);
      $("#carry-in-no").addEventListener("click", declineClaim);
      $("#ld-retry").addEventListener("click", () => location.reload());
      $("#ld-signin").addEventListener("click", () => { forgetClaim(); S.mode = "page"; setTab("signin", true); });
      $("#wo-ld-copy").addEventListener("click", () => copy(`${location.origin}/connect`, "Link copied. Paste it in Safari or Chrome."));
      // the legacy link window (stage S14)
      $("#wo-lg-email").addEventListener("submit", (e) => { e.preventDefault(); legacySend(); }); // (Enter in the address field)
      $("#wo-lg-send").addEventListener("click", legacySend);
      $("#wo-lg-verify").addEventListener("click", legacyVerify);
      $("#wo-lg-resend").addEventListener("click", legacySend);
      $("#wo-lg-code").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); legacyVerify(); } });
      $("#wo-lg-back").addEventListener("click", () => setTab("signin"));
      W.onChange(() => { if (S.cur === "carry-in") drawClaimWallets(); if (S.cur === "pick") drawPick(); if (S.cur === "wo-legacy") drawLegacyLogin(); if (S.mode === "page" && S.tab === "register" && S.cur === "su-location" && inAppByAgent()) render(); });
      window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
    }

    /* ---------- intro, tabs, and what is on screen ---------- */
    function setIntro() {
      const sec = $(".connect"); if (sec && sec.dataset) sec.dataset.mode = S.tab === "signin" ? "login" : "new";
      const title = $(".connect__intro .page-title"), accent = el("span", "accent");
      if (S.tab === "legacy") {
        const L = legacyInfo();
        text(".connect__intro .kicker", "Connect a wallet");
        accent.textContent = "Your wallet."; title.replaceChildren("Your account.", el("br"), accent);
        text(".connect__intro .lead", L ? LEGACY.lead : ""); // (the panel says the rest, with the date: never twice)
      } else if (S.tab === "signin") {
        text(".connect__intro .kicker", "Welcome back");
        accent.textContent = "Wallet only."; title.replaceChildren("Sign in.", el("br"), accent);
        text(".connect__intro .lead", DS06.signin);
      } else {
        text(".connect__intro .kicker", "Register your city");
        accent.textContent = "Your wallet."; title.replaceChildren("Your city.", el("br"), accent);
        text(".connect__intro .lead", DS06.register);
      }
    }
    function setTab(tab, force = false) {
      if (S.tab === tab && S.mode === "page" && !force) return;
      S.tab = tab; S.mode = "page"; stopCarry(); S.pairName = null; S.pairRelay = false; notice("");
      render();
    }
    function render() {
      setIntro();
      if (S.mode === "claim") return drawClaim();
      if (S.mode !== "page") return;
      if (S.tab === "legacy") return drawLegacy();
      if (S.tab === "signin") { show("pick"); renderPick(); focusHeading("pick"); return; }
      if (inAppByAgent()) { show("wo-inapp"); focusHeading("inapp"); return; } // never a location inside a wallet app (R1-20)
      if (S.carry) return drawCarry();
      const { view, steps } = regView(S.srv, S.hold);
      drawSteps(steps);
      if (view === "city") showCity();
      else { show("pick"); renderPick(); focusHeading("pick"); announce(`Step 2 of 2: Wallet. ${$("#wo-reg-lead").textContent}`); }
    }
    function drawSteps(steps) {
      const map = { city: "location", wallet: "account" };
      for (const st of steps) {
        const li = $(`#su-steps li[data-step="${map[st.key]}"]`); if (!li) continue;
        const b = li.firstElementChild;
        li.classList.toggle("is-active", st.active); li.classList.toggle("is-done", st.done && !st.active);
        b.disabled = !st.editable;
        if (st.active) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
        const s = li.querySelector("[data-step-state]"); if (s) s.textContent = st.active ? ", current step" : st.done ? (st.editable ? ", done. Tap to check again." : ", done") : ", not started yet";
      }
    }
    /** connect.js calls this every time a screen is shown. */
    function onShow(s) {
      S.cur = s;
      const page = S.mode === "page";
      const hero = $(".connect__intro"); if (hero) hero.hidden = !page && (W.isMobile || S.mode === "approve");
      hide("#su-top", !page || ["approve", "done", "loading", "carry", "carry-in", "link-dead"].includes(s));
      hide(".su-tabs", !page || S.tab === "legacy" || !["pick", "su-location", "no-account", "wo-inapp"].includes(s));
      hide("#su-steps", !page || S.tab !== "register" || !["pick", "su-location", "sign", "phone"].includes(s));
      $("#tab-login").setAttribute("aria-pressed", String(page && S.tab === "signin"));
      $("#tab-new").setAttribute("aria-pressed", String(page && S.tab === "register"));
      if (s === "pick") {
        if (S.mode === "claim") { Promise.resolve().then(() => { if (S.cur === "pick" && S.mode === "claim") drawClaim(); }); return; } // ("Use another wallet": back to the question)
        drawPick();
      }
      if (s === "sign") {
        const reg = S.mode === "claim" || (page && S.tab === "register");
        text("#sign-h", page && S.tab === "legacy" ? LEGACY.signH : reg ? "Register with this wallet" : "Sign in with this wallet");
        text("#c-msg-label", "See the message you'll sign");
      }
      if (["sign", "phone"].includes(s) && !S.first) { const h = $(`.cstate[data-state="${s}"] h2`); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } }
    }
    const signLabel = () => (S.mode === "page" && S.tab === "legacy" ? LEGACY.signBtn : S.mode === "claim" || (S.mode === "page" && S.tab === "register") ? "Sign and register" : "Sign in");
    /** The pick screen, for either path. connect.js has just drawn the wallets (renderPick). */
    function drawPick() {
      const reg = S.tab === "register", leg = S.tab === "legacy";
      for (const sel of ["#lg-block", "#login-block", "#link-top", "#or-line", "#su-wallet-lead", "#link-noapp", "#alt-app", "#alt-check", "#alt-skip"]) hide(sel);
      hide("#wo-reg-chips", !reg); hide("#wo-reg-form", !reg); hide("#wo-signin", reg || leg); hide("#wo-legacy-lead", !leg);
      text("#wallet-h", reg ? "Connect your wallet" : leg ? LEGACY.linkH : "Sign in with your wallet");
      if (!reg && !leg) legacyNote($("#wo-legacy-note"));
      const phone = W.isMobile && !inApp() && !W.list().length;
      if (reg) {
        const c = S.srv && S.srv.location && S.srv.location.community, city = c ? `${c.name}, ${c.country}` : "your city";
        text("#wo-city-name", c ? `${c.name}, ${c.country}` : "—");
        text("#wo-reg-lead", phone ? `Tap your wallet app: it opens this page there to sign once. One free signature creates your account for ${city}. Nothing is paid or moved.`
          : `One free signature creates your account for ${city}. Nothing is paid or moved.`);
        if (S.srv && S.srv.terms && S.srv.terms.done && !$("#wo-terms").dataset.seen) $("#wo-terms").checked = true;
        $("#wo-terms").dataset.seen = "1";
        const nm = $("#wo-name"); if (!nm.dataset.seen) { nm.value = (S.srv && S.srv.name) || ""; nm.dataset.seen = "1"; }
      }
      // inside a known wallet app with one wallet: ONE button signs in (connect, then one signature)
      const k = here(), only = W.list().length === 1 ? W.list()[0] : null;
      hide("#wo-quick", !(!reg && !leg && k && only));
      if (!reg && !leg && k && only) text("#wo-quick", `Sign in with ${only.name}`);
      if (phone) hide("#wallets-none");
      text("#alt-phone em", W.isPhone && !inApp() ? "Approve in your wallet app, then finish here." : reg || leg ? "Scan a code with your phone, sign there, finish here." : "Scan a code with your phone, sign there, continue here.");
      if (W.isMobile && !W.list().length) text("#more-label", "Open this page in your wallet app");
    }

    /* ================= Register your city: step 1, the city (this browser only) ================= */
    function showCity() {
      show("su-location");
      const st = S.srv || { location: { done: false } }, loc = st.location || {};
      const sub = S.redo ? "ask" : loc.done ? "done" : loc.choices && loc.choices.length ? "choices" : "ask";
      hide("#su-loc-ask", sub !== "ask"); hide("#su-loc-handoff"); hide("#su-loc-choices", sub !== "choices"); hide("#su-loc-done", sub !== "done");
      text("#su-loc-title", sub === "done" ? "City verified" : "Verify your city");
      if (sub === "choices") drawChoices();
      if (sub === "done") {
        const c = loc.community;
        text("#su-loc-city", c ? `${c.name}, ${c.country}` : "Your city");
        text("#su-loc-note", `This will be your city: it is fixed once you register. ${loc.picked ? "You chose it from the three nearest. " : ""}Your exact location was not saved.`);
        if (S.justLocated) {
          S.justLocated = false; clearTimeout(S.autoTimer);
          S.autoTimer = setTimeout(() => {
            if (S.cur !== "su-location" || S.hold !== "city" || S.leaving || S.mode !== "page" || S.tab !== "register") return;
            S.hold = null; render();
          }, reduced() ? 0 : 800);
        }
      }
      announce(`Step 1 of 2: Your city. ${DS06.register}`);
      focusHeading("city");
    }
    const locError = (m) => text("#su-loc-error", m || "");
    function locStatus(m) { if (m) { text("#su-loc-status-text", m); announce(m); } hide("#su-loc-status", !m); }
    function located() { S.redo = false; S.hold = S.srv && S.srv.location && S.srv.location.done ? "city" : null; S.justLocated = Boolean(S.hold); render(); }
    async function shareLocation() {
      const btn = $("#su-loc-go");
      locError(""); hide("#su-loc-phone");
      await busy(btn, "Checking your location…", async () => {
        locStatus("Waiting for your browser. If it asks, choose Allow.");
        let loc;
        try { loc = await getLocation(); }
        catch (e) { locStatus(""); locError(e && e.message ? e.message : errText("location_required")); hide("#su-loc-phone", W.isPhone); return; } // (on a phone already: no "register on your phone", review finding F6)
        locStatus("Finding your city…");
        const s = await ensureSignup();
        if (!s.ok) { locStatus(""); if (!s._handled) locError(errText(s)); return; }
        const r = await call("/api/signup/location", { location: loc }); // (the point goes to the server once and is never kept: only the city)
        locStatus("");
        if (r._handled) return;
        if (!r.ok) { locError(errText(r)); hide("#su-loc-phone", W.isPhone); return; }
        await refresh(); located();
      });
    }
    function drawChoices() {
      $("#su-choices").replaceChildren(...S.srv.location.choices.map((c) => {
        const b = el("button", "city-row"); b.type = "button";
        const nm = el("span", "city-row__name"); nm.append(el("strong", null, c.name), el("span", null, c.km != null ? `about ${c.km} km away` : c.country));
        b.append(nm, el("span", "tag tag--ok", "Join"));
        b.addEventListener("click", () => pickChoice(c.id));
        const li = el("li"); li.append(b); return li;
      }));
    }
    async function pickChoice(id) {
      text("#su-choices-error", "");
      const r = await call("/api/signup/location/choice", { id });
      if (r._handled) return;
      if (!r.ok) {
        if (r.error === "bad_choice" || r.error === "no_choices") await refresh();
        if (S.srv.location.choices && S.srv.location.choices.length) return text("#su-choices-error", errText(r));
        S.redo = true; render(); return locError(errText(r));
      }
      await refresh(); located();
    }

    /* ================= Register your city: step 2, the Terms, an optional name, then the wallet ================= */
    /** connect.js asks before it connects a wallet or starts a pairing: the Terms must be ticked, and a typed display name saved (true = go on). */
    async function beforeWallet() {
      if (S.mode !== "page" || S.tab !== "register") return true;
      const box = $("#wo-terms"), nameIn = $("#wo-name");
      fieldErr("wo-terms", ""); fieldErr("wo-name", ""); setErr("");
      if (!box.checked) { fieldErr("wo-terms", errText("terms_required")); box.focus(); announce(errText("terms_required")); return false; }
      if (!S.srv || !S.srv.terms || !S.srv.terms.done) {
        const r = await call("/api/signup/terms", { version: (S.srv && S.srv.terms && S.srv.terms.version) || "2026-10-01" });
        if (r._handled) return false;
        if (!r.ok) { fieldErr("wo-terms", errText(r)); return false; }
        if (r.state) S.srv = r.state;
      }
      const name = nameIn.value.trim();
      if (name !== ((S.srv && S.srv.name) || "")) {
        if (name && !validName(name)) { fieldErr("wo-name", errText("bad_username")); nameIn.focus(); return false; }
        const r = await call("/api/signup/name", { displayName: name || null });
        if (r._handled) return false;
        if (!r.ok) { fieldErr("wo-name", errText(r)); nameIn.focus(); return false; }
        if (r.state) S.srv = r.state;
      }
      return true;
    }
    /** What the wallet signs: connect.js asks for the challenge's request. `pin` = a phone approving a pairing. */
    function challengeFor(address, pin) {
      if (S.mode === "approve" && S.approve) return { purpose: S.approve.purpose === "register" ? "register" : S.approve.purpose === "link" ? "legacy_link" : "login", address, pair: S.approve.code };
      if (S.mode === "claim" && S.claim) return { purpose: "register", address, handoff: S.claim.code, ...(S.claim.opener ? { opener: S.claim.opener } : {}) };
      if (pin) return null;
      if (S.tab === "legacy") return { purpose: "legacy_link", address }; // the restricted legacy session's own challenge (stage S14)
      return { purpose: S.tab === "register" ? "register" : "login", address };
    }
    /** The challenge was refused (the registration is not ready, the code died, the network...): say so where it helps. */
    function challengeFailed(d) {
      const e = d && d.error;
      if (S.mode === "claim" && /^(code_expired|code_network|contested|not_opened|signup_expired|location_changed)$/.test(String(e))) return showDead(d);
      if (S.mode === "page" && S.tab === "register" && (e === "location_required" || e === "terms_required" || e === "no_signup")) return walletProven(d);
      if (S.mode === "page" && S.tab === "legacy" && HANDLED.includes(String(e))) return walletProven(d);
      setErr(errText(d), $("#c-sign"));
    }
    const signPath = () => (S.mode === "claim" ? "/api/signup/handoff/claim" : S.tab === "register" ? "/api/signup/wallet" : S.tab === "legacy" ? "/api/me/wallet/link" : "/api/auth/wallet");
    function signExtra() {
      const k = here();
      if (S.mode === "claim" && S.claim) return { code: S.claim.code, ...(S.claim.opener ? { opener: S.claim.opener } : {}), ...(k ? { app: k.id } : {}) };
      if (S.tab === "register" && k) return { app: k.id };
      return {};
    }
    const handles = (code) => HANDLED.includes(code);

    /** The wallet's answer, from connect.js (a sign-in, a registration, a hand-off claim, a pairing finished here). */
    async function walletProven(d) {
      if (S.mode === "page" && S.tab === "legacy") return legacyProven(d);
      if (!d.ok) {
        const e = d.error;
        if (e === "no_account") return showNoAccount();
        if (e === "already_signed_in") return signedIn("signin", "/dashboard");
        if (S.mode === "claim" && /^(code_expired|code_network|contested|not_opened|signup_expired|location_changed)$/.test(String(e))) return showDead(d);
        if (e === "no_signup" || e === "signup_expired") return restart(errText(d));
        if (e === "location_required" || e === "location_unverified" || e === "location_changed") {
          S.mode = "page"; S.tab = "register"; S.hold = "city"; S.redo = true; await refresh(); render(); locError(errText(d)); return undefined;
        }
        S.mode = S.mode === "claim" ? "claim" : "page";
        if (S.mode === "claim") { drawClaim(); return text("#carry-in-error", errText(d)); }
        show("pick"); renderPick();
        if (e === "terms_required") { fieldErr("wo-terms", errText(d)); return undefined; }
        if (e === "username_taken") { fieldErr("wo-name", errText(d)); return undefined; }
        return setErr(errText(d), $("#wallets-detected"));
      }
      forgetClaim(); forgetCarry();
      const reg = S.mode === "claim" || d.existing !== undefined;
      const city = d.user && d.user.city ? `${d.user.city.name}, ${d.user.city.country}` : null;
      return signedIn(!reg ? "signin" : d.existing ? "existing" : "registered", d.next, city);
    }
    function signedIn(how, next, city) {
      if (S.leaving) return;
      S.leaving = true; stopCarry();
      const k = here(); if (k) WA.remember(k.id);
      const c = doneCopy(how, city), to = safeNext(next);
      show("done");
      const b = $("#done-badge"); if (b) b.dataset.icon = "pin";
      text("#done-h", c.h); text("#done-sub", c.sub);
      $("#done-go").setAttribute("href", to); text("#done-go", "Open my dashboard →"); hide("#done-stay");
      announce(`${c.h} ${c.sub}`);
      const r = panel.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 80);
      setTimeout(() => location.assign(to), 1200);
    }
    /** R1-13: a wallet nobody registered. No location, no Terms, no account made: one screen that says where to go. */
    function showNoAccount() {
      S.mode = "page";
      show("no-account");
      text("#na-h", NO_ACCOUNT.title); text("#na-body", NO_ACCOUNT.body);
      const app = inApp();
      text("#na-create", "Register your city"); hide("#na-create", app); // in Safari or Chrome already: the Register tab is one tap away
      text("#na-copy", "Copy the link"); hide("#na-copy", false);
      $("#na-copy").className = app ? "btn btn--primary btn--block btn--lg" : "btn btn--glass btn--block btn--lg";
      text("#na-another", "Try another wallet");
      legacyNote($("#wo-legacy-note-na"));
      announce(`${NO_ACCOUNT.title} ${NO_ACCOUNT.body}`);
      S.first = false; focusHeading("noAccount");
    }

    /* ---- a phone's Safari or Chrome: "Open app" opens registration inside the wallet app, with a five-minute single-use code ---- */
    function carrier() {
      // the legacy path on a phone without a wallet here: its wallet apps approve a link pairing (the restricted session stays in this browser)
      if (S.mode === "page" && S.tab === "legacy" && W.isMobile && !inApp()) return (k) => pairInstead(k.name, false);
      return S.mode === "page" && S.tab === "register" && W.isMobile && !inApp() ? carryTo : null;
    }
    /** Where a known wallet's tile goes on a phone: Sign in opens this page in the wallet app, signed in there with one tap. */
    function tileTarget() { return S.tab === "signin" ? (k) => `${location.origin}/connect?mode=login&with=${k.id}` : `${location.origin}/connect`; }
    const CARRY_KEY = "vicinity-wo-carry";
    const keepCarry = (c) => { try { sessionStorage.setItem(CARRY_KEY, JSON.stringify({ id: c.k.id, url: c.url, pin: c.pin, ref: c.ref, until: c.until, relay: c.relay })); } catch { /* private mode: a reload starts at the wallets */ } };
    const forgetCarry = () => { try { sessionStorage.removeItem(CARRY_KEY); } catch { /* ignore */ } };
    function keptCarry() {
      let c = null;
      try { c = JSON.parse(sessionStorage.getItem(CARRY_KEY) || "null"); } catch { return null; }
      const k = c && knownApp(c.id);
      if (!k || !k.open || typeof c.url !== "string" || !/^https?:\/\/[^/]+\/connect#register=[A-Za-z0-9_-]{32,64}$/.test(c.url) || !/^[A-Za-z0-9_-]{12}$/.test(String(c.ref)) || !(c.until > Date.now())) { forgetCarry(); return null; }
      return { k, name: k.name, url: c.url, link: k.open(c.url), pin: String(c.pin), ref: c.ref, until: c.until, relay: Boolean(c.relay), restored: true };
    }
    async function carryTo(k, tile) {
      if (tile && tile.disabled) return;
      if (!(await beforeWallet())) return;
      const go = tile ? tile.querySelector(".go") : null;
      setErr("");
      if (tile) { tile.disabled = true; tile.setAttribute("aria-busy", "true"); } if (go) go.textContent = "Getting your link…";
      try {
        const r = await call("/api/signup/handoff", { app: k.id });
        if (r._handled) return;
        WA.remember(k.id);
        if (!r.ok) {
          if (r.error === "handoff_relay") return pairInstead(k.name, true);
          if (r.error === "location_required" || r.error === "terms_required") return walletProven(r);
          return setErr(errText(r), $("#more-wallets"));
        }
        S.carry = { k, name: k.name, url: r.url, link: k.open(r.url), pin: r.pin, ref: r.ref, until: Date.parse(r.expiresAt), relay: Boolean(r.relay) };
        keepCarry(S.carry);
        render();
      } finally {
        if (tile) { tile.disabled = false; tile.removeAttribute("aria-busy"); } if (go) go.textContent = "Open app";
      }
    }
    function stopCarry() { clearTimeout(S.carryTimer); S.carryTimer = null; S.carry = null; }
    function pollSoon(ms) { clearTimeout(S.carryTimer); S.carryTimer = setTimeout(pollCarry, ms); }
    function drawCarry() {
      const c = S.carry, name = c.name;
      show("carry");
      text("#carry-h", `Register in ${name}`);
      text("#carry-lead", `${name} opens this page and asks to connect your wallet. Check the number, connect, and sign the free message. Then you stay in ${name}, signed in.`);
      text("#carry-pin", c.pin || "--");
      text("#carry-small", c.relay ? "This link works once, only on this phone. Never send it to anyone." : "This link works once, for 5 minutes, only on this phone. Never send it to anyone.");
      const get = $("#carry-get"); get.href = c.k.site; text("#carry-get", `No ${name} on this phone? Get it first.`);
      const a = $("#carry-open"); a.href = c.link; a.textContent = `Open ${name}`;
      const dead = c.expired || c.contested, refused = Boolean(c.refused && !c.opened && !dead);
      hide("#carry-open", dead || refused); hide("#carry-pinrow", dead || refused || !c.pin); hide("#carry-status", dead || refused); hide("#carry-renew", !dead); hide("#carry-get", dead || refused);
      hide("#carry-hint"); hide("#carry-skip");
      text("#carry-status-text", c.opened ? `${name} opened your link…` : `Waiting for ${name}…`);
      text("#carry-error", c.contested ? errText("contested") : c.expired ? "That link ran out (links work for 5 minutes). Get a new link."
        : refused ? (c.refusedRelay ? errText({ error: "code_network", relay: true }) : `${name} opened your link on another internet connection (Wi-Fi and mobile data?), so it can't be used there. Approve in ${name} instead: that works on any connection.`) : "");
      const pair = $("#carry-pair"); pair.className = refused ? "btn btn--primary btn--block" : "link-btn";
      text("#carry-pair", refused ? `Approve in ${name} instead` : `Didn't work? Approve in ${name} and finish here instead`);
      text("#carry-back", "Choose another way");
      announce(dead || refused ? $("#carry-error").textContent : `Register in ${name}: check number ${c.pin}. Tap Open ${name}.`);
      focusHeading("carry");
      if (!dead) pollSoon(c.restored ? 0 : 3000);
    }
    /** While this page is on screen: did the wallet app open the link, register, or is the link dead? (POST: the reference in the body.) */
    async function pollCarry() {
      clearTimeout(S.carryTimer); S.carryTimer = null;
      const c = S.carry;
      if (!c || document.hidden || S.leaving || S.mode !== "page") return;
      const d = await api("/api/signup/handoff/status", { ref: c.ref });
      if (S.carry !== c || S.leaving) return;
      if (!d.ok) return pollSoon(5000);
      if (d.status === "registered") return registeredThere(c);
      if (c.restored) { c.restored = false; if (d.status === "expired") { c.expired = true; forgetCarry(); return render(); } }
      if (d.status === "contested") { c.contested = true; forgetCarry(); return render(); }
      if (d.status === "expired" || Date.now() > c.until) { c.expired = true; forgetCarry(); return render(); }
      if (d.status === "refused" && !c.refused) { c.refused = true; render(); return undefined; }
      if (d.status === "opened" && !c.opened) { c.opened = true; c.refused = false; text("#carry-status-text", `${c.name} opened your link…`); announce(`${c.name} opened your link.`); }
      return pollSoon(3000);
    }
    /** R1-25: registered in the wallet app. No session moves between browsers: this one signs in with the wallet too. */
    function registeredThere(c) {
      stopCarry(); forgetCarry(); S.leaving = true;
      show("done");
      const b = $("#done-badge"); if (b) b.dataset.icon = "pin";
      text("#done-h", `Registered in ${c.name} ✓`);
      text("#done-sub", "Sign in with your wallet here too.");
      $("#done-go").setAttribute("href", c.k.open(`${location.origin}/dashboard`)); text("#done-go", `Open ${c.name}`);
      const stay = $("#done-stay"); stay.setAttribute("href", "/connect?mode=login"); stay.textContent = "Sign in here"; stay.hidden = false;
      announce(`Registered in ${c.name}. Sign in with your wallet here too.`);
    }
    async function renewCarry() {
      const old = S.carry, k = old && old.k;
      if (!k) return render();
      await busy($("#carry-renew"), "Getting your link…", async () => {
        const r = await call("/api/signup/handoff", { app: k.id });
        if (S.carry !== old || S.leaving || r._handled) return;
        if (!r.ok) { if (r.error === "handoff_relay") { stopCarry(); forgetCarry(); render(); pairInstead(k.name, true); return; } text("#carry-error", errText(r)); return; }
        S.carry = { k, name: k.name, url: r.url, link: k.open(r.url), pin: r.pin, ref: r.ref, until: Date.parse(r.expiresAt), relay: Boolean(r.relay) };
        keepCarry(S.carry); render();
      });
    }
    /** The other way round on a phone: approve in the wallet app, finish here (connect.js's pairing screen). */
    function pairInstead(name, relay) { S.pairName = name || null; S.pairRelay = Boolean(relay); $("#alt-phone").click(); }
    const iphone = () => /iPhone|iPod/i.test(String(navigator.userAgent || ""));

    /* ---- pairings (connect.js shows them): a phone's wallet for a computer, or the way round a hidden connection ---- */
    function pairContext() {
      if (S.tab === "legacy") return { for: "wo-legacy", purpose: "link", name: S.pairName, relay: S.pairRelay };
      const reg = S.tab === "register";
      return { for: reg ? "wo-register" : "wo-login", purpose: reg ? "register" : "login", name: S.pairName, relay: S.pairRelay };
    }
    function pairStarted() { S.pairName = null; S.pairRelay = false; }
    /** POST /api/pair was refused: the registration's own answers (true = said on screen). */
    function pairFailed(d) {
      if (S.tab === "legacy" && d && ["legacy_sign_in", "window_closed"].includes(d.error)) { legacyProven(d); return true; }
      if (!d || !["no_signup", "location_required", "terms_required", "already_signed_in", "signup_expired"].includes(d.error)) return false;
      walletProven(d); return true;
    }
    /** This tab was reloaded during a pairing it kept: may it carry on here? */
    function resumePair(saved) {
      if (S.leaving || S.mode !== "page" || S.carry) return "forget";
      if (saved.for === "wo-login") { if (S.tab !== "signin") { S.tab = "signin"; render(); } return "resume"; }
      if (saved.for === "wo-legacy") { // (only on the legacy path, while the window is open: the restricted session finishes it, or says it ran out)
        const L = legacyInfo();
        if (S.tab !== "legacy" || !L || !L.open) return "forget";
        S.legacyStep = "link"; render(); return "resume";
      }
      if (saved.for === "wo-register") {
        if (!(S.srv && S.srv.location && S.srv.location.done)) return "forget";
        if (S.tab !== "register" || S.hold) { S.tab = "register"; S.hold = null; render(); }
        return "resume";
      }
      return "forget";
    }
    /** The pairing on screen is gone: did another tab of this browser use it? Then carry on from there. */
    async function pairGone() {
      const me = await api("/api/me?lite=1");
      if (S.leaving || S.cur !== "phone") return true;
      if (me.signedIn) { signedIn("signin", "/dashboard"); return true; }
      return false;
    }
    /** The phone approving a pairing (connect.js startApprove read its status): what it approves, in words. */
    function approveShown(s) {
      if (!S.approve) return;
      if (s.purpose === "link") return approveLegacy(s);
      S.approve.purpose = s.purpose === "register" ? "register" : "login";
      const reg = S.approve.purpose === "register", onPhone = S.approve.on === "phone";
      text("#approve-h", reg ? "Approve the registration you started" : "Approve the sign-in you started");
      $("#approve-ask").replaceChildren(onPhone ? "Does Safari or Chrome, where you started, show check number " : "Does the page where you started show ", $("#approve-pin"), "?");
      text("#approve-warn", "Only continue if you started this yourself. Never sign for a code someone sent you.");
      $("#approve-done-text").replaceChildren(el("strong", null, "Approved."), reg
        ? (onPhone ? " Go back to Safari or Chrome: it finishes your registration." : " Go back to your computer (or tablet): it finishes your registration.")
        : (onPhone ? " Go back to Safari or Chrome: it signs you in." : " Go back to where you started: it signs you in."));
    }

    /* ---- the wallet app's browser, opened by "Open app" (/connect#register=<code>): nothing happens until the person confirms ---- */
    const CLAIM_KEY = "vicinity-wo-register";
    const keepClaim = (code, opener) => { try { sessionStorage.setItem(CLAIM_KEY, JSON.stringify({ code, at: Date.now(), ...(opener ? { opener } : {}) })); } catch { /* private mode: a reload starts over */ } };
    const forgetClaim = () => { try { sessionStorage.removeItem(CLAIM_KEY); } catch { /* ignore */ } };
    function keptClaim() {
      try {
        const k = JSON.parse(sessionStorage.getItem(CLAIM_KEY) || "null");
        if (k && /^[A-Za-z0-9_-]{32,64}$/.test(String(k.code)) && Date.now() - Number(k.at) < 10 * 60_000) return k;
        if (k) sessionStorage.removeItem(CLAIM_KEY);
      } catch { /* storage blocked */ }
      return null;
    }
    /** A wallet app's browser can take a moment to put its wallet on the page: wait up to `ms` for it. */
    function inAppSoon(ms = 3000) {
      return new Promise((resolve) => {
        if (inApp()) return resolve(true);
        let t = null;
        const off = W.onChange(() => { if (inApp()) { off(); clearTimeout(t); resolve(true); } });
        t = setTimeout(() => { off(); resolve(inApp()); }, ms);
      });
    }
    async function startClaim(code, opener) {
      S.mode = "claim";
      keepClaim(code, opener); // whatever the answer: a reload here shows this same question again, never the registration's location
      if (!W.isMobile || !(await inAppSoon())) { // only a wallet app's browser opens it: anywhere else the code is left unused
        forgetClaim();
        return showDead({ error: "elsewhere" });
      }
      const info = await api("/api/signup/handoff/info", opener ? { code, opener } : { code });
      if (!info.ok) return showDead(info);
      keepClaim(code, info.opener || opener);
      S.claim = { code, opener: info.opener || opener || null, info };
      return drawClaim();
    }
    function drawClaim() {
      const c = S.claim; if (!c) return;
      const i = c.info, city = i.community ? `${i.community.name}, ${i.community.country}` : "your city";
      show("carry-in");
      text("#carry-in-h", `Register this wallet for ${city}?`);
      text("#carry-in-avatar", (i.community && i.community.name ? i.community.name : "•").slice(0, 1).toUpperCase());
      text("#carry-in-handle", city); text("#carry-in-city", "The city you verified in Safari or Chrome");
      text("#carry-in-pin", i.pin || "--");
      text("#carry-in-error", ""); hide("#carry-in-here"); hide("#carry-in-signin");
      text("#carry-in-yes", "Yes, register this wallet"); text("#carry-in-no", "No, that is not me");
      hide("#carry-in-yes", false); hide("#carry-in-wallets"); hide("#carry-in-tap");
      announce(`Register this wallet for ${city}? Check number ${i.pin}. Only continue if you started this yourself, on this phone.`);
      S.first = false; focusHeading("claim");
    }
    function acceptClaim() {
      if (!S.claim) return;
      hide("#carry-in-yes");
      const list = W.list();
      if (list.length === 1) { text("#carry-in-tap", `Check ${list[0].name}: connect, then sign. Nothing is paid or moved.`); hide("#carry-in-tap", false); return connectWith(list[0], null, true); }
      hide("#carry-in-wallets", false);
      return drawClaimWallets();
    }
    function drawClaimWallets() {
      if (!S.claim || $("#carry-in-wallets").hidden) return;
      const list = W.list();
      $("#carry-in-wallets").replaceChildren(...list.map((a) => {
        const b = el("button", "wallet-option"); b.type = "button";
        const icon = W.safeIcon(a.icon);
        if (icon) { const img = el("img"); img.alt = ""; img.src = icon; b.append(img); } else b.append(W.mark(a.name));
        b.append(el("span", null, a.name), el("span", "detected", "Detected"));
        b.addEventListener("click", () => connectWith(a, b, true));
        return b;
      }));
      text("#carry-in-tap", list.length ? `Tap ${list.length === 1 ? list[0].name : "your wallet"} and sign. Nothing is paid or moved.` : "Waiting for your wallet app to connect…");
      hide("#carry-in-tap", false);
    }
    function declineClaim() {
      S.claim = null; forgetClaim(); S.mode = "page"; S.tab = "signin";
      render(); notice("OK, nothing was registered. The link stays unused.");
    }
    /** The register link can't be used here: one plain screen (never the registration's location, never a login check). */
    function showDead(d) {
      S.mode = "dead"; S.claim = null;
      const code = d && d.error, k = here();
      const title = { code_expired: "That link was used or ran out", code_network: "That link can't be used here", contested: "That link was opened twice", not_opened: "That link was opened in another app",
        signup_expired: "Your registration ran out", location_changed: "Your city changed", elsewhere: "Open this link in your wallet app" }[code];
      // (the body never repeats the heading: review finding F7)
      const body = code === "signup_expired" ? "Go back to Safari or Chrome and start again: verify your city once, then connect your wallet."
        : code === "location_changed" ? `Go back to Safari or Chrome and tap “Open ${k ? k.name : "your wallet app"}” again for a new link.`
          : code === "elsewhere" ? "This registration link works only inside the wallet app you chose in Safari or Chrome, on the same phone. Nothing was changed."
            : code === "code_expired" || code === "not_opened" ? "Go back to Safari or Chrome and get a new link. Nothing was registered."
              : code === "contested" ? "So it stopped working. Go back to Safari or Chrome and get a new link. Never send it to anyone."
                : errText(d);
      if (title) forgetClaim(); // a dead link is never offered again (an answer that never came is: "Try again" reloads it)
      show("link-dead");
      text("#ld-h", title || "Couldn't check your link"); text("#ld-body", body);
      // a registration link that died: the way on is Safari or Chrome (copy the link there); Sign in stays, second, for a wallet that has an account
      const back = Boolean(title) && code !== "elsewhere";
      hide("#wo-ld-copy", !back);
      $("#ld-signin").className = back ? "btn btn--glass btn--block btn--lg" : "btn btn--primary btn--block btn--lg";
      hide("#ld-retry", Boolean(title)); hide("#ld-signin", false); text("#ld-signin", back ? "Already registered? Sign in" : "Sign in with your wallet");
      announce(`${$("#ld-h").textContent}. ${$("#ld-body").textContent}`);
      S.first = false; focusHeading("dead");
    }

    /* ================= the legacy link window (stage S14; only while /api/me carries legacyLink) ================= */
    /** { open, until } from /api/me while the window exists, else null (then nothing of it is shown). */
    const legacyInfo = () => (S.me && S.me.legacyLink && typeof S.me.legacyLink === "object" ? S.me.legacyLink : null);
    /** The one line about the window under Sign in and on the no-account screen (hidden when there is no window). */
    function legacyNote(n) {
      if (!n) return;
      const L = legacyInfo();
      if (!L) { n.replaceChildren(); n.hidden = true; return; }
      const u = untilText(L.until);
      if (L.open) {
        const a = el("a", null, LEGACY.noteLink); a.setAttribute("href", "/connect?mode=legacy");
        a.addEventListener("click", (e) => { e.preventDefault(); openLegacy(); });
        n.replaceChildren(`${LEGACY.noteOpen(u)} `, a);
      } else { n.replaceChildren(); n.hidden = true; return; } // closed: said on /connect?mode=legacy only, never on Sign in (review finding F8)
      n.hidden = false;
    }
    function openLegacy() {
      stopCarry(); S.pairName = null; S.pairRelay = false; notice("");
      S.mode = "page"; S.tab = "legacy"; S.legacyStep = "login"; S.leaving = false; render();
    }
    const legacyErr = (m) => text("#wo-lg-error", m || "");
    function drawLegacy() {
      const L = legacyInfo();
      if (!L) { S.tab = "signin"; return render(); }
      if (L.open && S.legacyStep === "link") { show("pick"); renderPick(); focusHeading("pick"); return undefined; }
      show("wo-legacy");
      drawLegacyLogin();
      focusHeading("legacy");
      return undefined;
    }
    function drawLegacyLogin() {
      const L = legacyInfo(); if (!L) return;
      const u = untilText(L.until);
      text("#wo-lg-h", L.open ? LEGACY.title : LEGACY.closedTitle);
      text("#wo-lg-body", L.open ? LEGACY.body(u) : LEGACY.noteClosed(u));
      hide("#wo-lg-login", !L.open);
      const app = inApp();
      hide("#wo-lg-google", app); hide("#wo-lg-inapp", !app); // Google refuses to run inside a wallet app's browser
      const sent = Boolean(S.legacyEmail);
      hide("#wo-lg-step-email", sent); hide("#wo-lg-step-code", !sent);
      if (sent) text("#wo-lg-sent", LEGACY.sent(S.legacyEmail));
    }
    async function legacySend() {
      legacyErr("");
      const input = $("#wo-lg-addr");
      const email = (S.legacyEmail && !$("#wo-lg-step-code").hidden ? S.legacyEmail : String(input.value || "")).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { legacyErr(legacyText("bad_email")); input.focus(); return; }
      const btn = $("#wo-lg-step-code").hidden ? $("#wo-lg-send") : $("#wo-lg-resend");
      await busy(btn, "Sending…", async () => {
        const d = await api("/api/auth/email/start", { email, legacy: true });
        if (!d.ok) { if (d.error === "window_closed") return legacyProven(d); legacyErr(legacyText(d)); return; }
        S.legacyEmail = email; drawLegacyLogin(); announce(LEGACY.sent(email));
        const c = $("#wo-lg-code"); c.value = ""; c.focus();
      });
    }
    async function legacyVerify() {
      legacyErr("");
      const code = String($("#wo-lg-code").value || "").replace(/\D/g, "").slice(0, 6);
      if (code.length !== 6) { legacyErr(legacyText("bad_code")); return; }
      await busy($("#wo-lg-verify"), "Checking…", async () => {
        const d = await api("/api/auth/email/verify", { email: S.legacyEmail, code, legacy: true });
        if (!d.ok) { if (d.error === "window_closed") return legacyProven(d); legacyErr(legacyText(d)); return; }
        S.legacyEmail = ""; S.legacyStep = "link"; render();
      });
    }
    /** What the legacy path does with an answer: the link went through, or why not (said where it helps). */
    function legacyProven(d) {
      if (d.ok && d.linked) return linkedDone();
      const e = d.error;
      if (e === "window_closed") { S.me.legacyLink = { open: false, until: d.until || (legacyInfo() || {}).until }; S.legacyStep = "login"; render(); return undefined; }
      if (e === "legacy_sign_in") { S.legacyStep = "login"; render(); legacyErr(legacyText(d)); return undefined; }
      if (e === "link_done") { S.tab = "signin"; render(); notice(legacyText(d)); return undefined; }
      show("pick"); renderPick();
      return setErr(legacyText(d), $("#wallets-detected"));
    }
    /** The link went through: the restricted session is over, and the dashboard opens only after a wallet sign-in. */
    function linkedDone() {
      if (S.leaving) return;
      S.leaving = true; stopCarry();
      show("done");
      const b = $("#done-badge"); if (b) b.dataset.icon = "pin";
      text("#done-h", LEGACY.doneH); text("#done-sub", LEGACY.doneSub);
      $("#done-go").setAttribute("href", "/connect?mode=login"); text("#done-go", LEGACY.doneGo); hide("#done-stay");
      announce(`${LEGACY.doneH}. ${LEGACY.doneSub}`);
    }
    /** A phone approving a link pairing (its wallet becomes the way into the account that logged in): words of this window, no product name. */
    function approveLegacy(s) {
      S.approve.purpose = "link";
      const onPhone = S.approve.on === "phone";
      text("#approve-h", LEGACY.approveH);
      text("#approve-owner", s.handle ? `@${s.handle}` : "•••");
      text("#approve-city", s.community ? `${s.community.name}, ${s.community.country}` : ""); hide("#approve-city", !s.community);
      hide("#approve-who", false); hide("#approve-terms");
      $("#approve-ask").replaceChildren(onPhone ? "Does Safari or Chrome, where you logged in, show check number " : "Does the page where you logged in show check number ", $("#approve-pin"), "?");
      text("#approve-warn", LEGACY.approveWarn);
      $("#approve-done-text").replaceChildren(el("strong", null, "Approved."), onPhone ? LEGACY.approveDonePhone : LEGACY.approveDone);
    }

    /* ================= start ================= */
    /**
     * Resolves true once the page shows a path (its state loaded), false when it could not load ("Reload the page").
     * #pair=<code>: a phone approving a pairing (connect.js's approve screen). #register=<code>: a wallet app's browser opened by "Open app".
     */
    function init(me, err) {
      S.me = me;
      build();
      const frag = parseFragment(location.hash);
      // the hand-off code leaves the address bar before anything is asked (kept in this tab for a reload); a pairing code stays (it is what
      // the wallet app opened, like today's ?pair=)
      if (frag.register) { try { history.replaceState(history.state, "", location.pathname + location.search); } catch { /* ignore */ } }
      const withId = params.get("with"), nextAsked = params.get("next");
      if (withId !== null || nextAsked !== null) { params.delete("with"); params.delete("next"); try { history.replaceState(null, "", location.pathname + (String(params) ? `?${params}` : "") + location.hash); } catch { /* ignore */ } }
      return (async () => {
        if (frag.pair) { S.mode = "approve"; S.approve = { code: frag.pair, purpose: "login", on: frag.on }; await approve(frag.pair); return true; }
        const kept = frag.register ? null : keptClaim();
        if (frag.register || kept) {
          if (me.signedIn) { forgetClaim(); signedIn("signin", "/dashboard"); return true; }
          await startClaim(frag.register || kept.code, frag.register ? keptOpener(frag.register) : kept.opener || null);
          return true;
        }
        if (me.signedIn) { signedIn("signin", withId !== null && nextAsked && safeNext(nextAsked) === nextAsked ? nextAsked : "/dashboard"); return true; }
        const d = await refresh();
        if (!d.ok || !S.srv) return failedLoad(d);
        let remembered = false; try { remembered = localStorage.getItem("vicinity-account") === "1"; } catch { /* ignore */ }
        const mode = params.get("mode");
        S.tab = mode === "login" ? "signin" : mode === "register" ? "register" : hasProgress(S.srv) ? "register" : remembered || here() || withId !== null ? "signin" : "register";
        if (mode === "legacy" && legacyInfo()) { S.tab = "legacy"; S.legacyStep = params.get("legacy") === "signed_in" ? "link" : "login"; } // (stage S14)
        const carry = S.tab === "register" && W.isMobile && !inApp() ? keptCarry() : null;
        if (carry) S.carry = carry;
        render();
        if (S.tab === "legacy" && err) legacyErr(legacyText({ error: err, login: params.get("login") })); // (the legacy Google log-in came back)
        else if (err && Object.hasOwn(ERR, err)) setErr(ERR[err]); // (?error= of the old ways in, Google's and the e-mail's, means nothing here)
        if (withId !== null && S.tab === "signin") quickFromLink(withId);
        return true;
      })();
    }
    const keptOpener = (code) => { const k = keptClaim(); return k && k.code === code && typeof k.opener === "string" ? k.opener : null; };
    /** /connect?mode=login&with=<id> inside that wallet app: the sign-in starts by itself, once (its connect sheet, then ONE signature). */
    async function quickFromLink(id) {
      const wanted = () => W.list().find((a) => { const k = W.knownFor(a.name); return k && k.id === id; }) || null;
      if (W.isMobile && !wanted()) await new Promise((resolve) => {
        const off = W.onChange(() => { if (wanted()) { off(); clearTimeout(t); resolve(); } });
        const t = setTimeout(() => { off(); resolve(); }, 3000);
      });
      const a = wanted();
      if (!a || !here() || S.leaving || S.mode !== "page" || S.tab !== "signin" || S.touched) return;
      connectWith(a, null, true);
    }
    function failedLoad(d) {
      show("loading"); text("#su-loading-text", `The page didn't load. ${errText(d)}`); hide("#su-reload", false); $("#su-reload").onclick = () => location.reload();
      return false;
    }

    /** Where connect.js puts a wallet error that has no control next to it: under the tabs while they show, else at the end of the panel. */
    const errSlot = () => { const t = $("#su-top"); return t && !t.hidden ? t : panel; };

    return { init, onShow, signLabel, errSlot, beforeWallet, challengeFor, challengeFailed, signPath, signExtra, handles, walletProven, carrier, tileTarget,
      pairContext, pairStarted, pairFailed, resumePair, pairGone, approveShown, relayWhy: (name, qr) => relayWhy(name, iphone(), qr), say: notice };
  }
})();
