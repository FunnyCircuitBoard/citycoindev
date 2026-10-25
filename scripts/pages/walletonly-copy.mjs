// The page copy while sign-in is wallet only (Citycoin.dev master v5, stage S15 switch-on; implementation-report.md section 11, "Gate for the
// S15 switch-on", item 1, review finding F3): scripts/pages/build.mjs applies these replacements to the page sources when wrangler.jsonc sets
// WALLET_ONLY=on (pageWalletOnly) and records it in src/pages-built.js (walletOnly: true). With the switch unset nothing here is read, so every
// built page is what it was, byte for byte (test/build-parity.test.js). Each [old, new] pair replaces one exact, whole-line passage of the page
// as the build reads it (brand blocks and label fills resolved, scripts/pages/build.mjs frozenFor), AFTER the legacy seat freeze's own copy
// (scripts/pages/frozen-copy.mjs), in order; a passage that is not found exactly once stops the build (a source edited without its wallet-only
// copy never ships half old, half new).
//
// What goes: every passage that offers sign-in with Google, an e-mail address or a password, or says an account is "per Google login or verified
// e-mail", with the data those sign-ins kept, and today's order on /connect (sign in first, a wallet later) (master section 18 WP-02: wallet-only
// sign-in and registration). What replaces it: plain words that
// say what the Worker does with WALLET_ONLY on (src/register.js, src/auth.js): a new member shares a location once (only the community is kept),
// then signs one free message with a Solana wallet; a member signs in again with the same wallet; there is no password; a phone number is the one
// optional contact detail (/api/me/phone; no contact e-mail can be added: review finding F1). Nothing more is claimed.
//
// Only the Citycoin.dev pages (labelSets): the page build refuses WALLET_ONLY=on in wrangler.jsonc unless BRAND=citycoin (pageWalletOnly), and
// BRAND=citycoin unless WALLET_ONLY=on (pageBrandPrerequisites), so the Rules and Terms of edition 2026-10-25 (src/editions.js) are one text.
// The Terms passages are legal text: the owner's go of 25 Oct 2026 ("Get them all sorted. Don't wait for my permission just go ahead and execute
// all the changes.") approves them, with the S15 gate; the exact before and after are in implementation-report.md section 11, "Go-live switch-on".
//
// Scripts and answers render their own words from GET /api/me (walletOnly: true, stage S12: public/connect.js loads public/wallet-only.js, the
// dashboard hides Google sign-in, the contact e-mail's Add and Change, the password and the unlink); the layout's account sheet takes its words
// from scripts/pages/build.mjs (ACCOUNT_LINKS_WALLET_ONLY).

/** The label sets these passages are written for: the Citycoin.dev pages only. */
const CITYCOIN_ONLY = Object.freeze(["citycoin"]);

export const WALLET_ONLY_COPY = Object.freeze({
  "connect.html": Object.freeze({
    labelSets: CITYCOIN_ONLY,
    description: "Join {{productName}}: share your location once to find your community, then sign one free message with your Solana wallet. Members sign in with the same wallet.",
    // The intro as the page shows it before public/wallet-only.js runs (which then writes the same words: DS06.register, the safety lines,
    // and hides the 1-2-3 steps): today's order (sign in first, a wallet later) and today's account rule are not what the Worker does here.
    replace: Object.freeze([
      // … then sign in. Link a wallet later, from your dashboard.
      ["          <p class=\"lead\">Share your location once (it is never stored), then sign in. Link a wallet later, from your dashboard.</p>\n",
        "          <p class=\"lead\">Verify your city once, then connect your wallet. We keep your city/country, not your raw GPS coordinates.</p>\n"],
      // the steps: 1 Connect your wallet, 2 Sign in with Google or e-mail
      ["            <li data-s=\"1\" class=\"is-active\"><span class=\"stepper__n\">1</span><span>Connect your wallet</span></li>\n",
        "            <li data-s=\"1\" class=\"is-active\"><span class=\"stepper__n\">1</span><span>Verify your city once</span></li>\n"],
      ["            <li data-s=\"2\"><span class=\"stepper__n\">2</span><span>Sign in with Google or e-mail</span></li>\n",
        "            <li data-s=\"2\"><span class=\"stepper__n\">2</span><span>Connect your wallet: one free signature</span></li>\n"],
      // One account per wallet and per Google login or verified e-mail …
      ["              <li>One account per wallet and per Google login or verified e-mail. That makes fake accounts harder, but it is not proof of one person.</li>\n",
        "              <li>One account per wallet. That is not proof of one person.</li>\n"],
    ]),
  }),
  "dashboard.html": Object.freeze({
    labelSets: CITYCOIN_ONLY,
    description: null,
    replace: Object.freeze([
      // Takes a minute, with Google or e-mail…
      ["          <p class=\"tiny muted\" id=\"out-cta-note\">Takes a minute, with Google or e-mail. Your wallet comes later, from your dashboard: free, one signature.</p>\n",
        "          <p class=\"tiny muted\" id=\"out-cta-note\">Verify your city once, then connect your wallet. We keep your city/country, not your raw GPS coordinates.</p>\n"],
      // the example pass: Google
      ["              <div class=\"dpv__row dpv__foot\"><span>Google</span><span class=\"dpv__live\"><span class=\"dpv__dot\"></span>live</span></div>\n",
        "              <div class=\"dpv__row dpv__foot\"><span>Wallet</span><span class=\"dpv__live\"><span class=\"dpv__dot\"></span>live</span></div>\n"],
    ]),
  }),
  "index.html": Object.freeze({
    labelSets: CITYCOIN_ONLY,
    description: null,
    replace: Object.freeze([
      // How do I get my dashboard? … sign in with Google or an e-mail address …
      ["          <details><summary>How do I get my dashboard?</summary><p>Share your location once (it finds your community and is never saved) and sign in with Google or an e-mail address: you're in. Connect a Solana wallet from your dashboard whenever you like: you sign one free message, it isn't a transaction, and your rank and badges switch on. One account per wallet and per login.</p></details>\n",
        "          <details><summary>How do I get my dashboard?</summary><p>Share your location once (it finds your community and is never saved), then sign one free message with your Solana wallet: you're in. The message isn't a transaction and moves nothing. Next time, sign in with the same wallet. One account per wallet.</p></details>\n"],
      // What do you store about me? … With Google sign-in … With e-mail sign-in …
      ["          <details><summary>What do you store about me?</summary><p>Your wallet address. With Google sign-in, only your Google account id and first name. With e-mail sign-in, the e-mail address itself (it is your account id) and a hash of the 6-digit code, which expires in 10 minutes. A made-up username, which is the only name feeds show, never your wallet. The name of your home community. Optionally a contact e-mail and a phone number: you can remove them any time, and the phone number is not verified and not used for anything yet. Never your location: it's used once to find your community, then thrown away. We never keep a password anyone could read: if an e-mail account has one, only a salted hash of it is stored. <span data-profiles-only hidden>Member profiles: other signed-in members can open your profile and see your username, home community, bio, wallet address, member-since date, badges and your city-coin balances. They never see your real name, how you signed in, your e-mail or phone, or your location. You can block anyone, and there is no messaging.</span></p></details>\n",
        "          <details><summary>What do you store about me?</summary><p>Your wallet address: it is how you sign in. A made-up username, or one you choose, which is the only name feeds show, never your wallet. The name of your home community. Optionally a phone number: you can remove it any time, and it is not verified and not used for anything yet. Never your location: it's used once to find your community, then thrown away. No password: you sign in by signing a free message with your wallet. <span data-profiles-only hidden>Member profiles: other signed-in members can open your profile and see your username, home community, bio, wallet address, member-since date, badges and your city-coin balances. They never see your phone number or your location. You can block anyone, and there is no messaging.</span></p></details>\n"],
    ]),
  }),
  "rules.html": Object.freeze({
    labelSets: CITYCOIN_ONLY,
    description: null,
    replace: Object.freeze([
      // One account per wallet and per Google login or verified e-mail …
      ["            <li>One account per wallet and per Google login or verified e-mail. It makes fake accounts harder, but no online check can prove someone is one unique person (one inbox can have several addresses).</li>\n",
        "            <li>One account per wallet: you sign in with it. It makes fake accounts harder, but no online check can prove someone is one unique person (one person can have several wallets).</li>\n"],
      // What we keep: … with Google … with e-mail …
      ["            <li>What we keep: your wallet address; with Google only the account id and first name; with e-mail the address itself (it is your account id) and a hash of the code (10-minute life); a made-up username; your home community; and, only if you add them, a contact e-mail and a phone number you can remove (the phone number is not verified and not used yet). We never keep a password anyone could read (an e-mail account that has one keeps only a salted hash of it), and check-in coordinates are never stored.</li>\n",
        "            <li>What we keep: your wallet address (it is how you sign in); a made-up username, or one you choose; your home community; and, only if you add it, a phone number you can remove (it is not verified and not used yet). There is no password to keep: you sign in by signing a free message with your wallet, never a transaction. Your coordinates are never stored.</li>\n"],
      // Member profiles: … how you signed in, your e-mail or phone …
      ["            <li data-profiles-only hidden>Member profiles: other signed-in members can open your profile and see your username, home community, bio, wallet address, member-since date, badges and your {{productName}} token and city-coin balances. They never see your real name, how you signed in, your e-mail or phone, or your location. You can block anyone, and there is no messaging.</li>\n",
        "            <li data-profiles-only hidden>Member profiles: other signed-in members can open your profile and see your username, home community, bio, wallet address, member-since date, badges and your {{productName}} token and city-coin balances. They never see your phone number or your location. You can block anyone, and there is no messaging.</li>\n"],
    ]),
  }),
  "terms.html": Object.freeze({
    labelSets: CITYCOIN_ONLY,
    description: null,
    replace: Object.freeze([
      // 2. The Services: (a) … link a Google account or verified e-mail address
      ["  <p>The Services currently consist of, among other things: (a) an informational and interactive website through which you may connect a third-party wallet and link a Google account or verified e-mail address; (b) city claiming, founder seats (including Seed Steward, Stake Ladder, and Squad Founding), founder elections and objections, and related dashboards; (c) interfaces through which you may launch city coins and trade tokens through third-party protocols once the launchpad opens; (d) community features such as memes, check-ins, discussions, badges, and holder verification; and (e) APIs supporting the above.</p>\n",
        "  <p>The Services currently consist of, among other things: (a) an informational and interactive website through which you may connect a third-party wallet and sign in with it; (b) city claiming, founder seats (including Seed Steward, Stake Ladder, and Squad Founding), founder elections and objections, and related dashboards; (c) interfaces through which you may launch city coins and trade tokens through third-party protocols once the launchpad opens; (d) community features such as memes, check-ins, discussions, badges, and holder verification; and (e) APIs supporting the above.</p>\n"],
      // 6. Accounts: … link a Google account or a verified e-mail address to that wallet …
      ["  <p>You may use the Services by proving control of a Solana wallet, and you may link a Google account or a verified e-mail address to that wallet. You are responsible for keeping your wallet, devices, and credentials secure; {{productName}} will never ask for your recovery phrase or private key, and anyone who does is not us. If someone else uses your linked accounts, you are responsible for what they do.</p>\n",
        "  <p>You may use the Services by proving control of a Solana wallet: you sign in by signing a free message with it, and your account is tied to that wallet. You are responsible for keeping your wallet, devices, and credentials secure; {{productName}} will never ask for your recovery phrase or private key, and anyone who does is not us. If someone else uses your wallet or your account, you are responsible for what they do.</p>\n"],
    ]),
  }),
});
