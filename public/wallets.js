// Solana wallets: finds every wallet installed in this browser (the "Wallet Standard" most wallets
// use, plus older built-in ones), and knows the popular wallets' app links for phones.
// Sets window.VW. Nothing is loaded from other sites: wallet icons come from the wallets themselves.
(() => {
  "use strict";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  // A phone (not a tablet): an iPhone, or Android with "Mobile" in its user agent. A tablet can still scan nothing with itself
  // but usually has a phone nearby, so it keeps the QR code where a phone gets app links instead.
  const isPhone = /iPhone|iPod/i.test(navigator.userAgent) || (/Android/i.test(navigator.userAgent) && /Mobile/i.test(navigator.userAgent));
  const enc = encodeURIComponent;
  const webView = Boolean(window.V && window.V.webView); // a wallet app's own browser (detected once, in site.js)

  // Popular Solana wallets. open(url) = link that opens a page inside the wallet app's browser (phones).
  const KNOWN = [
    // phantom.com: Phantom's current universal-link domain (phantom.app only redirects, and its Android app-link file is gone)
    { id: "phantom", name: "Phantom", color: "#AB9FF2", match: /phantom/i, site: "https://phantom.com/download",
      open: (u) => `https://phantom.com/ul/browse/${enc(u)}?ref=${enc(location.origin)}` },
    { id: "solflare", name: "Solflare", color: "#FC7227", match: /solflare/i, site: "https://solflare.com/download",
      open: (u) => `https://solflare.com/ul/v1/browse/${enc(u)}?ref=${enc(location.origin)}` },
    { id: "backpack", name: "Backpack", color: "#E33E3F", match: /backpack/i, site: "https://backpack.app/downloads",
      open: (u) => `https://backpack.app/ul/v1/browse/${enc(u)}?ref=${enc(location.origin)}` },
    { id: "okx", name: "OKX Wallet", color: "#1F1F1F", match: /okx/i, site: "https://www.okx.com/web3",
      open: (u) => `https://www.okx.com/download?deeplink=${enc("okx://wallet/dapp/url?dappUrl=" + enc(u))}` },
    { id: "coinbase", name: "Coinbase Wallet", color: "#0052FF", match: /coinbase/i, site: "https://www.coinbase.com/wallet/downloads",
      open: (u) => `https://go.cb-w.com/dapp?cb_url=${enc(u)}` },
    { id: "trust", name: "Trust Wallet", color: "#0500FF", match: /trust/i, site: "https://trustwallet.com/download",
      open: (u) => `https://link.trustwallet.com/open_url?coin_id=501&url=${enc(u)}` },
    { id: "bitget", name: "Bitget Wallet", color: "#00F0FF", match: /bitget|bitkeep/i, site: "https://web3.bitget.com/en/wallet-download" },
    { id: "magiceden", name: "Magic Eden", color: "#E42575", match: /magic ?eden/i, site: "https://wallet.magiceden.io/" },
    { id: "exodus", name: "Exodus", color: "#1D1B45", match: /exodus/i, site: "https://www.exodus.com/download/" },
    { id: "jupiter", name: "Jupiter", color: "#26A35E", match: /jupiter/i, site: "https://jup.ag/mobile" },
    { id: "binance", name: "Binance Wallet", color: "#F0B90B", match: /binance/i, site: "https://www.binance.com/en/web3wallet" },
    { id: "nightly", name: "Nightly", color: "#6067F9", match: /nightly/i, site: "https://nightly.app/download" },
    { id: "coin98", name: "Coin98", color: "#D9B432", match: /coin98/i, site: "https://coin98.com/wallet" },
    { id: "tokenpocket", name: "TokenPocket", color: "#2980FE", match: /tokenpocket/i, site: "https://www.tokenpocket.pro/en/download/app" },
    { id: "safepal", name: "SafePal", color: "#4A21EF", match: /safepal/i, site: "https://www.safepal.com/download" },
    { id: "brave", name: "Brave Wallet", color: "#FB542B", match: /brave/i, site: "https://brave.com/wallet/" },
  ];

  const found = new Map(); // name → adapter
  const rawOf = new WeakMap(); // adapter → the Wallet Standard wallet behind it (its change events: the wallet-only watch below)
  const listeners = new Set();
  const changed = () => listeners.forEach((f) => { try { f(); } catch {} });
  const toBytes = (sig) => (sig instanceof Uint8Array ? sig : sig?.signature ? toBytes(sig.signature) : new Uint8Array(sig));
  /** A wallet's answer to "sign this": the 64-byte signature, or an error the page can put in plain words (never a raw one). */
  function signatureOf(out) {
    const first = Array.isArray(out) ? out[0] : out; // the standard answers [{ signedMessage, signature }]; some wallets give the object itself
    let sig = null;
    try { sig = first == null ? null : toBytes(first); } catch { sig = null; }
    if (!sig || sig.length !== 64) throw Object.assign(new Error("The wallet gave back no signature."), { code: "no_signature" });
    return sig;
  }

  // A silent connect (connectSilently(), used by public/swap.js inside a wallet app's own browser): the account the wallet ALREADY
  // shares with this site, and never a question to the person. Anything else (no account, a refusal, an error, or no answer within
  // SILENT_MS: a wallet that is asking the person after all) is null, and an answer that comes later is dropped.
  const SILENT_MS = 2500;
  /** `p`'s answer, or null when it has not come within `ms`. */
  const within = (p, ms) => new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(null), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
  /** The Solana account of a list of Wallet Standard accounts (the first one when none names a chain), or null. */
  const solanaAccount = (list) => {
    const all = Array.isArray(list) ? list : list && typeof list[Symbol.iterator] === "function" ? [...list] : [];
    const acc = all.find((a) => a && (a.chains || []).some((c) => String(c).startsWith("solana:"))) || all[0] || null;
    return acc && typeof acc.address === "string" && acc.address ? acc : null;
  };
  const versionsOf = (feature) => { const v = feature && feature.supportedTransactionVersions; return v ? [...v] : ["legacy"]; };
  /** The first answer of a Wallet Standard call ([{ ... }] by the standard; some wallets give the object itself). */
  const firstOf = (out) => (Array.isArray(out) ? out[0] : out);
  // Wallet Standard wallets. Besides connect and signMessage (what signing in needs), the swap panel (public/swap.js) uses
  // "solana:signAndSendTransaction" (serialized bytes + chain in, the signature out: the wallet broadcasts itself) and, for wallets
  // that only sign, "solana:signTransaction" (the signed bytes out; our Worker relays them), and inside a wallet app's own browser
  // connectSilently (the account the wallet already shares with this site, never a prompt). canSend / canSign / txVersions say
  // which a wallet offers, chains which networks its account is on. Nothing here ever needs a page library.
  function standard(w) {
    const send = w.features["solana:signAndSendTransaction"], sign = w.features["solana:signTransaction"];
    return {
      name: w.name, icon: w.icon, kind: "standard", chains: [...(w.chains || [])],
      canSend: Boolean(send && typeof send.signAndSendTransaction === "function"), canSign: Boolean(sign && typeof sign.signTransaction === "function"),
      txVersions: versionsOf(send || sign),
      async connect() {
        const { accounts } = await w.features["standard:connect"].connect();
        const acc = accounts.find((a) => (a.chains || []).some((c) => String(c).startsWith("solana:"))) || accounts[0];
        if (!acc) throw new Error("No account was shared.");
        this.account = acc; return acc.address;
      },
      /**
       * The account this wallet already shares with this site, never a prompt: the accounts it lists already, else "standard:connect"
       * with { silent: true } (the standard's own "do not ask": a site the person allowed before gets its account back, any other
       * none or a refusal). The address, or null (see SILENT_MS).
       */
      async connectSilently() {
        try {
          let acc = solanaAccount(w.accounts);
          if (!acc) {
            const out = await within(w.features["standard:connect"].connect({ silent: true }), SILENT_MS);
            acc = out ? solanaAccount(out.accounts) || solanaAccount(w.accounts) : null;
          }
          if (!acc) return null;
          this.account = acc; return acc.address;
        } catch { return null; }
      },
      async signMessage(bytes) {
        return signatureOf(await w.features["solana:signMessage"].signMessage({ account: this.account, message: bytes }));
      },
      /** Sign and broadcast serialized transaction bytes on `chain` ("solana:mainnet" | "solana:devnet"); answers the 64-byte signature. */
      async signAndSendTransaction(bytes, chain, options) {
        if (!send) throw Object.assign(new Error("This wallet cannot send transactions from here."), { code: "no_send" });
        const out = firstOf(await send.signAndSendTransaction({ account: this.account, transaction: bytes, chain, options }));
        const sig = out && out.signature ? toBytes(out.signature) : null;
        if (!sig || sig.length !== 64) throw Object.assign(new Error("The wallet gave back no signature."), { code: "no_signature" });
        return sig;
      },
      /** Sign serialized transaction bytes on `chain` without sending; answers the signed transaction bytes. */
      async signTransaction(bytes, chain) {
        if (!sign) throw Object.assign(new Error("This wallet cannot sign transactions from here."), { code: "no_sign" });
        const out = firstOf(await sign.signTransaction({ account: this.account, transaction: bytes, chain }));
        const signed = out && out.signedTransaction ? toBytes(out.signedTransaction) : null;
        if (!signed || signed.length < 100) throw Object.assign(new Error("The wallet gave back no transaction."), { code: "no_signature" });
        return signed;
      },
      async disconnect() { try { await w.features["standard:disconnect"]?.disconnect(); } catch {} },
    };
  }
  function register(...ws) {
    for (const w of ws) {
      const ok = w && w.name && w.features && w.features["standard:connect"] && w.features["solana:signMessage"] &&
        (w.chains || []).some((c) => String(c).startsWith("solana:"));
      if (ok && !found.has(w.name)) { const a = standard(w); rawOf.set(a, w); found.set(w.name, a); changed(); }
    }
    return () => {};
  }
  // a wallet announcing itself late (in-app browsers often inject after our scripts ran) is also a moment to look for the older kind
  window.addEventListener("wallet-standard:register-wallet", (e) => { try { e.detail({ register }); } catch {} scanLegacy(); });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register } })); } catch {}

  // Older wallets that only put an object on the page
  // Their transaction methods want a web3.js object the page does not have: the swap panel tells them to open the page in a Wallet Standard wallet.
  function legacy(name, p) {
    return {
      name, icon: null, kind: "legacy", chains: ["solana:mainnet"], canSend: false, canSign: false, txVersions: [],
      async connect() {
        const r = await p.connect();
        const pk = r?.publicKey || p.publicKey;
        if (!pk) throw new Error("No account was shared.");
        return pk.toString();
      },
      /**
       * The account already shared with this site, never a prompt: the one connected already, else connect({ onlyIfTrusted: true }),
       * asked only of the wallets known to keep that promise (Phantom, Backpack; any other is not asked at all). The address, or null.
       */
      async connectSilently() {
        try {
          if (p.isConnected && p.publicKey) return p.publicKey.toString();
          if (!p.isPhantom && !p.isBackpack) return null;
          const r = await within(p.connect({ onlyIfTrusted: true }), SILENT_MS);
          const pk = r ? r.publicKey || p.publicKey : null;
          return pk ? pk.toString() : null;
        } catch { return null; }
      },
      async signMessage(bytes) { return signatureOf(await p.signMessage(bytes, "utf8")); },
      async disconnect() { try { await p.disconnect(); } catch {} },
    };
  }
  function scanLegacy() {
    const cands = [
      ["Phantom", window.phantom?.solana], ["Solflare", window.solflare], ["Backpack", window.backpack?.solana || window.backpack],
      ["OKX Wallet", window.okxwallet?.solana], ["Coinbase Wallet", window.coinbaseSolana], ["Trust Wallet", window.trustwallet?.solana],
      ["Bitget Wallet", window.bitkeep?.solana], ["Exodus", window.exodus?.solana], ["Brave Wallet", window.braveSolana],
      ["Solana wallet", window.solana],
    ];
    for (let [name, p] of cands) {
      if (!p || typeof p.connect !== "function" || typeof p.signMessage !== "function") continue;
      // window.solana is usually a wallet listed already under its own name (Phantom sets both): one tile per wallet, not two
      if (name === "Solana wallet") name = p.isPhantom ? "Phantom" : p.isSolflare ? "Solflare" : p.isBackpack ? "Backpack" : name;
      const known = KNOWN.find((k) => k.match.test(name));
      const taken = [...found.keys()].some((n) => (known ? known.match.test(n) : n === name));
      if (!taken && ![...found.values()].some((a) => a._p === p)) { const a = legacy(name, p); a._p = p; found.set(name, a); }
    }
    changed();
  }
  setTimeout(scanLegacy, 350);
  window.addEventListener("load", () => setTimeout(scanLegacy, 200));
  // coming back to the tab (after installing a wallet, or when a wallet app's browser finished injecting): look again, no reload needed
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scanLegacy(); });

  /** The icon a wallet gave us (only safe data: images), or null. */
  const safeIcon = (src) => (typeof src === "string" && /^data:image\/(svg\+xml|png|webp|jpeg|gif);base64,/.test(src) ? src : null);
  /** A small coloured square with the wallet's first letter, for wallets that aren't installed. */
  function mark(name) {
    const k = KNOWN.find((x) => x.match.test(name));
    const s = document.createElement("span");
    s.className = "wallet-mark"; s.textContent = (name || "?")[0].toUpperCase();
    s.style.background = k ? k.color : "#445";
    return s;
  }
  /** Inside a wallet app's own browser? True when the user agent says so, or a phone browser already has a wallet on the page. */
  const inWalletApp = () => webView || (isMobile && found.size > 0);
  /** The user agent itself says this is a wallet app's own browser (no guess from an injected wallet: a phone's Brave or Kiwi with a wallet of
   *  its own is a normal browser that can share its location; review finding F5). The wallet-only registration gate reads this one. */
  const walletAppByAgent = () => webView;

  /** Every wallet of this page disconnects (logout while WALLET_ONLY counts, site.js); waits at most `ms` for them. */
  async function disconnectAll(ms = 1500) {
    const all = [...found.values()].map((a) => Promise.resolve().then(() => a.disconnect()).catch(() => {}));
    await within(Promise.all(all), ms).catch(() => null);
  }

  /*
   * Wallet-only (WALLET_ONLY counting: /api/me says walletOnly; Citycoin.dev master v5 stage S12, section 18 WP-02 "When the wallet switches,
   * clear the old session/data and authenticate the new address"): while a member is signed in, a wallet of this page that showed the
   * account's address and then reports ANOTHER one (the Wallet Standard "change" event, or an older wallet's "accountChanged") signs this
   * browser out, clears what this tab kept and opens Sign in, where the new address proves itself. A wallet that goes quiet (locked, no
   * account) or that never showed the account's address (another wallet connected for a purchase) changes nothing. With the switch off, or
   * signed out, nothing is watched.
   * A switch made while no page of this site watched (on a page without this file, or with the site closed: review finding F4) is caught when
   * the next page with this file loads: each wallet's last address seen with this account is kept in this browser (SEEN_KEY: wallet name →
   * address, public keys only, forgotten at logout by site.js clearWalletState), and a wallet that last showed the account's address and now
   * reports another one signs out the same way.
   */
  const SEEN_KEY = "vicinity:wallet-seen";
  const seenStore = () => { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
  const keepSeen = (name, addr) => { try { const v = seenStore(); if (v[name] !== addr) { v[name] = addr; localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } } catch { /* storage off: the open page still watches */ } };
  function watchSwitch(mine) {
    const last = new Map(), hooked = new WeakSet();
    let leaving = false;
    async function switched() {
      if (leaving) return;
      leaving = true;
      try { await window.V.api("/api/auth/logout", {}); } catch { /* the session ends on the server anyway when the page signs in again */ }
      if (typeof window.V.clearWalletState === "function") window.V.clearWalletState();
      location.assign("/connect?mode=login");
    }
    const seen = (name, addr) => {
      const before = last.get(name);
      if (addr) last.set(name, addr);
      if (addr === mine) keepSeen(name, mine);
      if (before === mine && addr && addr !== mine) switched();
    };
    /** What a wallet reports as this page hooks it: the account's address is remembered; another address after the account's is a switch. */
    const first = (name, addr) => {
      if (!addr) return;
      last.set(name, addr);
      if (addr === mine) keepSeen(name, mine);
      else if (seenStore()[name] === mine) switched(); // it showed the account's address on an earlier page, and another one now
    };
    const keyOf = (pk) => { try { return pk ? String(pk.toBase58 ? pk.toBase58() : pk.toString()) : null; } catch { return null; } };
    function hook(a) {
      if (hooked.has(a)) return;
      hooked.add(a);
      const w = rawOf.get(a);
      if (w) {
        const acc = solanaAccount(w.accounts); if (acc) first(a.name, acc.address);
        const ev = w.features && w.features["standard:events"];
        if (ev && typeof ev.on === "function") {
          try { ev.on("change", (props) => { if (props && "accounts" in props) { const now = solanaAccount(props.accounts); seen(a.name, now ? now.address : null); } }); } catch { /* a wallet without events */ }
        }
      } else if (a._p) {
        const p = a._p;
        const pk = keyOf(p.publicKey); if (pk) first(a.name, pk);
        if (typeof p.on === "function") { try { p.on("accountChanged", (k) => seen(a.name, keyOf(k))); } catch { /* an older wallet without events */ } }
      }
    }
    const hookAll = () => { for (const a of found.values()) hook(a); };
    hookAll();
    listeners.add(hookAll); // wallets that announce themselves later
  }
  if (window.V && window.V.ready && typeof window.V.ready.then === "function") {
    // (.catch: a failed /api/me answer is no reason for an unhandled rejection; review finding PAR-04)
    window.V.ready.then((me) => { if (me && me.walletOnly === true && me.signedIn && me.user && typeof me.user.wallet === "string" && me.user.wallet) watchSwitch(me.user.wallet); }).catch(() => {});
  }

  window.VW = {
    KNOWN, isMobile, isPhone, inWalletApp, walletAppByAgent, safeIcon, mark, disconnectAll, SEEN_KEY,
    list: () => [...found.values()],
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
    knownFor: (name) => KNOWN.find((k) => k.match.test(name)) || null,
    rescan: scanLegacy,
  };
})();
