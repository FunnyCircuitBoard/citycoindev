# Domain cutover: vicinity.city to citycoin.dev

Master change order v5, section 04 (BR-02) and section 05 (BR-03). Started in stage S03 (host-safe routing and redirects); stage S04
(session and challenge host binding) added section 1.2 and section 6; the S03/S04 review fixes added section 1.3 and the S06 rules in
section 2. All three were merged in PR #97 (`2608bd9`) with their switches off. On 24 October 2026 the owner decided that the old names
are not forwarded (section 0): stage S56 (the redirects) is dropped, and the cutover now finishes in S55. Each later stage adds its part.

**Status on 25 October 2026: step 2 (stage S06) is prepared in a configuration pull request, not merged, on the owner's go of the same
day** ("Don't wait for my permission just go ahead and execute all the changes"). It attaches citycoin.dev as a custom domain of this
Worker and lists it in `SITE_ORIGINS` in the same `wrangler.jsonc`, with `DEPLOYMENT_ENV=production` (section 2, item 2; section 3,
step 2). Until that pull request is merged and deployed nothing here is applied: no DNS record, Cloudflare setting, route, custom domain
or switch was changed, citycoin.dev (registered on the same Cloudflare nameservers as vicinity.city, `pearl` and `tim`, with no DNS
record) is **not attached**, and the live Worker's routes are `vicinity.city` and `www.vicinity.city` only. The deploy of the merge is
what attaches it: Cloudflare then creates the DNS record and the certificate for the custom domain. The S06 review (same day) added three
Worker fixes for the two-host period to that pull request (citycoin.dev on the link checker's official list, e-mails that name the host
they were asked on, `noindex` on citycoin.dev's pages) and found two owner steps that must come **before** the merge: the deploy token
must be given the citycoin.dev zone (section 3, step 1: as `docs/DEPLOY.md` set it up it covers vicinity.city only, so the attach would
fail), and the Google console should list citycoin.dev's return address (section 1.3).

## 0. The owner's decision on the old names (24 October 2026)

In writing, in the working conversation of 24 October 2026: "i dont want any domain forward from vicinty. leve that blank both.
vicinity.city and vicinitycity.com i wil need them for other purpose."

So: **no 308, 301 or 302 forwarding from `vicinity.city`, `www.vicinity.city`, `vicinitycity.com` or `www.vicinitycity.com` to
citycoin.dev.** After the move both names are left blank: not served by this Worker and not redirected, for the owner's other use. This
replaces master section 04's redirect of the old hosts and its rule to keep their routes for at least 12 months after it; `policy.json`
records the decision (`amendments`, and `release_gates.legacy_redirect_min_months` 0).

What it changes in this plan:

- **Stage S56 is dropped.** `HOST_REDIRECT` is never set and `"run_worker_first": true` is no longer needed (section 2, item 1). The S03
  code (`src/hostroute.js` behind `HOST_REDIRECT`, merged, off) stays as it is: it is no longer wanted for the old hosts, and its removal
  belongs to a later cleanup stage (S65). Nothing is deleted now.
- **The S04 host binding stays useful** while both hosts serve, from S06 (citycoin.dev attached) to S55 (vicinity.city removed).
- **vicinity.city keeps serving until citycoin.dev serves the site.** Removing it earlier would leave the site offline in between.
- **The order is section 3:** citycoin.dev is attached and checked while vicinity.city serves; then one configuration pull request
  makes citycoin.dev canonical and removes the vicinity.city routes, with no redirect, after the legacy launch path is closed; the
  vicinitycity.com forward is the owner's own step, at any time.

Facts checked on 24 October 2026 (read-only):

- `vicinity.city` and `www.vicinity.city` are this Worker's custom domains (wrangler.jsonc `routes`) and serve the live site.
- `vicinitycity.com` and `www.vicinitycity.com` use the same Cloudflare nameserver pair (`pearl`, `tim`). Both answer `302` with
  `location: https://vicinity.city/` for every path and method tried (HEAD of `/` and `/some/path?x=1`, a POST), with
  `cache-control: no-store` and the countdown Worker's own headers (its `content-security-policy` ending in `form-action 'none'`,
  `x-frame-options: DENY`, `strict-transport-security: max-age=31536000`). That answer comes from the countdown Worker
  `vicinity-countdown` of this repository: countdown/src/index.js sends every request on that domain to `https://vicinity.city/`
  with 302 and no-store since the countdown ended on 3 October 2026, and countdown/wrangler.jsonc says both names are attached to that
  Worker in Cloudflare and lists no routes on purpose (a deploy leaves the attachment as it is). It is not this Worker
  (wrangler.jsonc `routes` names only the two vicinity.city hosts). A zone redirect rule would answer before any Worker and without
  these headers, so none applies to these requests; the zone's rules themselves were not listed (no dashboard access from here).
- `vicinitycity.net` and `www.vicinitycity.net` are not routed to this Worker and answer 403 from Cloudflare. The owner's decision
  does not name them, and with S56 dropped nothing in this plan forwards them either. They are still in the link checker's list of
  official websites (`src/official.js` `websites`) and in `src/site-config.js` `LEGACY_FORWARD_HOSTS`. Their use is the owner's call
  (open).
- The deployed legacy launchpad (`AkMP9q…A1Ai`) compiles `METADATA_URI_PREFIX = "https://vicinity.city/coin-meta/"` into every coin it
  launches (rebrand-inventory.md P02). It has launched 0 coins (`/official-coins.csv` is empty), and its launches are open on chain
  (`launches_paused = 0`, implementation-report.md section 2).

What stops answering once vicinity.city is removed (section 3, step 4), for the owner to know before that step:

1. **Coin metadata.** A coin launched through the legacy launchpad would name a dead address for good. So the legacy launch path is
   closed first: the website's legacy launch flow switched off (`LEGACY_LAUNCH=off`; the switch is stage S23's, not built yet) and the on-chain pause
   `set_pause(launches = true)`, which needs the signature of the legacy admin `13qRam…sRiN` (stage S58, external E3).
2. **`/brand/vicinity-512.png` on vicinity.city.** The Meteora DBC partner-metadata account `2be9mDcn…si11` names this address on chain
   (rebrand-inventory.md C04). After step 4 it gets no answer from this site; the file itself stays and is served on citycoin.dev.
   Whether DBC lets the fee-claimer wallet update that record was not verified. The policy keeps this file under
   `release_gates.legacy_immutable_metadata` (exact bytes served as long as existing assets depend on them), and the owner's decision
   does not name it. So step 4 waits until either the record names an address on citycoin.dev, or the owner accepts in writing that
   this address goes dark and that acceptance is recorded as an owner decision in `policy.json` `amendments` and its mirror
   `src/masterpolicy.js` (section 4, "Before step 4").
3. **`/official-coins.csv` and the read-only API on vicinity.city** (rebrand-inventory.md C09, C10). A tracker that registered the
   vicinity.city address (whether any did was not verified) must use citycoin.dev's.
4. **Every old link and bookmark** (posts of `@VicinityCitySOL`, listings that name `https://vicinity.city`, the Google sign-in
   callback registered for vicinity.city) gets no answer from this site. A member signs in again on citycoin.dev with the same wallet
   (section 6). Visitors learn the new address only from what the site and the official accounts tell them before step 4.
5. **Mail.** The sender is on vicinity.city (wrangler.jsonc `EMAIL_FROM`, rebrand-inventory.md U03). It moves to citycoin.dev once
   the mail provider verifies it, or mail notices stop (in-app only), before the owner puts vicinity.city to another use.
6. **The link checker** calls `vicinity.city`, `vicinitycity.com` and `vicinitycity.net` official (`src/official.js` `websites`,
   rebrand-inventory.md C03). They come off that list, and citycoin.dev goes on, before the owner puts either name to its other use;
   otherwise the checker would vouch for a site that is no longer this one. citycoin.dev goes on in the S06 pull request (review finding
R1: from the attach on, the checker on citycoin.dev would otherwise call citycoin.dev "not on our official list"); the old names coming off
is still a later code change.

## 1. What stage S03 built (dark)

**Not to be switched on (section 0).** The old hosts are not redirected, so `HOST_REDIRECT` stays unset in every step. The code below is
merged and off, and stays until a later cleanup stage removes it; this section is the record of what is deployed.

One switch, `HOST_REDIRECT`, read like every other switch (exactly `on`, trimmed, any letter case). The Worker applies it only through
`src/v5policy.js` `hostRedirect`, which counts it only while **every** precondition holds:

| Refusal code (logged once per isolate, never a value) | Holds the switch off while |
|---|---|
| `HOST_REDIRECT_PAGES_BYPASS_WORKER` | the deployed `wrangler.jsonc` does not send every request through the Worker first: its `assets.run_worker_first` is neither exactly `true` nor a list that holds `"/*"` and no negative (`!`) pattern. Any other form (for example a list of prefixes, or `"true"` as a string) keeps the switch refused with only this log line. The page build records this in `src/pages-built.js` (`pagesReachWorker`), and refuses to build when `wrangler.jsonc` sets `HOST_REDIRECT=on` without it. |
| `HOST_REDIRECT_SITE_REFUSED` | `SITE_ORIGIN` and `SITE_ORIGINS` are unset, or `src/site-config.js` refuses them |
| `HOST_REDIRECT_POLICY_REFUSED` | the v5 configuration check refuses the deployment: `DEPLOYMENT_ENV` unset (`ENVIRONMENT_UNSET`), `SITE_ORIGIN` missing (`MISSING_SITE_ORIGIN`) or not `https://citycoin.dev` (`HOST_REDIRECT_TARGET_NOT_CANONICAL`), or any other named error |

With the switch off (unset, any value but `on`, or refused) the Worker answers exactly as before, for every host, scheme, method and path:
`www.vicinity.city`, `vicinitycity.net` and `www.vicinitycity.net` answer 301 to the same path on `https://vicinity.city`, plain `http://`
answers 301 to `https://` on the same host, both for every method, and every other host is served in place (except the cutover's own two
hosts, `citycoin.dev` and `www.citycoin.dev`, which answer 421 until `SITE_ORIGINS` lists citycoin.dev: section 1.3; neither reaches the
Worker today). Because pages bypass the
Worker today, that 301 applies only to `/api/*`, `/coin-meta/*` and `/official-coins.csv`; pages on `www.vicinity.city` are served without
a redirect, as today. (The plan in `implementation-report.md` once allowed S03 to change today's hosts at merge; the order for this stage
requires no change with every new switch unset, so S03 changes nothing live.)

### 1.1 The route contract while the switch counts (`src/hostroute.js`)

The canonical origin is `SITE_ORIGIN` (`https://citycoin.dev`, the only value the v5 check accepts for the switch). "Accepted hosts" are
the hosts of `SITE_ORIGINS` plus the four legacy hosts (`vicinity.city`, `www.vicinity.city`, `vicinitycity.net`, `www.vicinitycity.net`,
`src/site-config.js` `LEGACY_HOSTS`), which stay accepted whatever `SITE_ORIGINS` lists.

| Request | Answer |
|---|---|
| `https://citycoin.dev`, any method, any path | served exactly as today |
| a local host (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`): `wrangler dev` | outside production only (`DEPLOYMENT_ENV` anything but `production`): served exactly as today. In production it is an unknown host (next row): the Worker never serves it or builds anything from it |
| an unknown host (not accepted; look-alikes such as `vicinity.city.evil.example`, `evilcitycoin.dev`, a trailing dot, an IP; a `workers.dev` or preview address if one were ever turned on) | `421 {"error":"wrong_host","origin":…}`, no `Location`, never served, never a redirect target |
| an accepted non-canonical host over `https://`, `POST /api/auth/logout` | served in place: it only ends the session this host's cookie names and clears that cookie (the Origin check applies), so a member can always sign out of an old host, for example on a shared computer |
| an accepted non-canonical host (or `http://` on any accepted host), any other method but GET and HEAD | `421 {"error":"wrong_host","origin":…}`, no `Location`: a signed POST, an API write or a webhook delivery is never replayed on another origin |
| same, GET or HEAD of an immutable legacy file: `/coin-meta/*`, `/brand/vicinity-512.png`, `/official-coins.csv` | served in place, the same bytes as on the canonical host (over `http://`: 308 to `https://` on the same host, never to another host) |
| same, GET or HEAD of a sign-in trip: `/api/auth/<provider>/start` or `/api/auth/<provider>/callback` (Google coming back to an old host for a trip started before the switch, an old bookmark) | `302` to `https://citycoin.dev/connect?error=login_expired`, the query dropped (no provider code or state travels), `Cache-Control: no-store`, no cookie: the sign-in page of the new host says the sign-in took too long and offers it again |
| same, GET or HEAD of a wallet challenge, any other sign-in route, pairing or other hand-off, callback or webhook: `/api/message`, `/api/auth/*`, `/api/pair*`, `/api/signup/*`, `/api/me/wallet/*`, `/api/locate*`, any path with a `callback(s)` or `webhook(s)` segment | `421 {"error":"wrong_host","origin":…}`, no `Location` |
| same, GET or HEAD of any other `/api/*` route (read-only answers, inventory C10) | served in place (over `http://`: 308 to `https://` on the same host) |
| same, GET or HEAD of anything else (the pages and their files) | `308` to `https://citycoin.dev` + the same path + only the safe query keys |

The 308 carries today's redirect headers (the security headers and `Cache-Control: public, max-age=3600`, so turning the switch off undoes a
cached redirect within the hour), no body and no cookie. The 421 is JSON with the security headers and `Cache-Control: no-store`; its body
names the canonical origin from the configuration, never from the request: `{"error":"wrong_host","origin":"https://citycoin.dev"}`. (The
pages' own scripts do not read `origin` yet: they show their generic error on a 421. Mapping `wrong_host` to a "Vicinity moved to
citycoin.dev, reload and sign in there" notice changes `public/site.js`, so it waits for the stage that may change the pages: today every
file in `public/` must stay byte for byte.)

**Safe query keys** (`SAFE_QUERY_KEYS`): `city`, `mint`, `u`, `address`, `tab`, `q`, `tf`, `range`, `unit`, `style`, `mode`, `step`,
`welcome`, `claim`, `swap_in`, `swap_out`, `swap_amt`, `swap_slip`, `swap_open`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
`utm_content`. Each kept pair is copied byte for byte, in order. **Every other key is dropped**, unknown keys included, first of all the
hand-off, sign-in and one-time-code keys of inventory C02 and the sign-in callbacks (`link`, `pair`, `code`, `register`, `carry`, `state`,
`ref`, `next`, `error`, `login`, `google`, `linked`, `token`, `pin`, `on`, `app`, `with`). A fragment never reaches the server.

**No open redirect.** The target is `SITE_ORIGIN` (validated by `src/site-config.js` and the v5 check) with the request's path appended as
text, never resolved against it, and the result is checked to name that origin before it is sent (`//evil.example/x` becomes
`https://citycoin.dev//evil.example/x`). The request's `Host` header never builds a target: for `http://` to an accepted host the target is
that host's own allowlist entry over `https://`.

### 1.2 Sessions, hand-offs and challenges bound to their host (stage S04, `src/hostbind.js`)

Master section 05 (BR-03): "Domain migration must preserve account ownership, not assume that a cookie or wallet signature valid for
vicinity.city is valid for citycoin.dev", and its acceptance: wrong-origin signatures, copied cookies, replayed hand-offs and untrusted
return URLs fail safely.

**When it counts.** There is no new switch. The binding counts once `SITE_ORIGINS` (accepted by `src/site-config.js`) lists a host other
than `vicinity.city`: the moment a second host can serve the site (the S06 configuration pull request that attaches citycoin.dev is the
first that does). A `SITE_ORIGIN` or `SITE_ORIGINS` that is set but refused counts too, with today's site: a broken setting fails closed
(every host outside the allowlist refused) instead of serving a second host unbound. **Setting `SITE_ORIGIN` or `SITE_ORIGINS`, even
wrongly (a typo in the dashboard: `keep_vars` keeps it), runs the additive host migrations on first use and turns on 421 for every host
outside the allowlist.** Members see nothing on vicinity.city (their rows have host NULL), but the schema gains the `host` columns and new
sessions record `vicinity.city`; a refusal also logs one `policy config refused SITE_ORIGIN_…` line per isolate. With both unset, or naming
only `vicinity.city`, nothing changes on any host that reaches the Worker: no column is added, no host is written or compared, and the
links and the signed text name the request's own host as they always have (on vicinity.city that is exactly the configuration's value;
Cloudflare routes no other host to this Worker today: wrangler.jsonc `routes`, `workers_dev` and `preview_urls` false). The cutover's own
two hosts are the one exception (section 1.3). It does not depend on `HOST_REDIRECT` and works with it on or off.

**What it does while it counts.** The request's host is looked up in the allowlist: the hosts of `SITE_ORIGINS` plus the four legacy hosts
(the same "accepted hosts" as section 1.1; exact, lower case, never a suffix match). The value used is the allowlist's own entry, never the
request's text (a port or another spelling of the name does not change it). Outside production only (`DEPLOYMENT_ENV` anything but
`production`), a local development host (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`: `wrangler dev`, never a Cloudflare route) is
served as its own host, and `wrangler dev`'s visit of a route's name over `http://` from this computer (`http://vicinity.city` with
`cf-connecting-ip` 127.0.0.1) keeps `http://` in its links and Google return address, bound to the allowlist entry. In production both are
refused like any other host outside the allowlist. Local development under `SITE_ORIGINS`: a session made before the binding (host NULL,
which is vicinity.city) is signed out on `http://localhost:8787` (its key is `localhost`); sign in again there, or use the route's name.

| What | While the binding counts |
|---|---|
| A host outside the allowlist (`evil.example`, `citycoin.dev.evil.example`, a trailing dot, an IP, `www.citycoin.dev`, a host attached but not listed) | For every request that reaches the Worker: `421 {"error":"wrong_host","origin":…}`, no `Location`, no cookie, before any route and before the `http://` and old-name 301s (so no address is built from its `Host`). With today's `run_worker_first` list only `/api/*`, `/coin-meta/*` and `/official-coins.csv` reach the Worker: **an attached host's pages are served straight from the static assets (200) and only those paths answer 421**, a half-working site. Never attach a host the allowlist does not list (section 2). Only with `run_worker_first` set to `true` would the asset fallback answer 421 too; no stage plans that any more (S56 is dropped, section 0). |
| A session (the `vs` cookie) | A new session records the host it is made on (`sessions.host`: the allowlist entry, or the local host's name), in the same D1 transaction as its row, by every way a session is made (wallet sign-in, pairing, Google, the e-mail code, a password log-in or reset, the new sign-up's finish, the wallet app's carry claim, a pending transfer proof). `getSession` refuses a row of another host: a cookie copied by hand to another host is signed out there (`/api/me` says `signedIn: false`, a sensitive action answers `401 sign_in`). Signing out, or signing in, there deletes only a session of that host: a copied cookie never ends the session on the host that made it (`src/hostbind.js` `sessionDelete`). A row made before the binding counted (host NULL) belongs to `vicinity.city`. |
| The cookie itself | Unchanged: `vs=<token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=…`, host-only (no `Domain` attribute), today's name; it is never shared across domains. (The design gives it the `__Host-` prefix under `WALLET_ONLY`; as built on `cc/s09` the session cookie `vs` and the sign-up cookie `vsu` keep their names even under the switch, a recorded deviation: review finding SEC-9, `implementation-report.md` section 11, "Gate for the S15 switch-on".) |
| The wallet challenge (`GET /api/message`) and every signed text (`/api/auth/wallet`, `/api/auth/reprove`, `/api/verify`, the wallet link and its carry claim) | The text names the allowlist entry (lower case, no port), and `src/signed.js` accepts a text only on the host it names: a signature made for vicinity.city is refused on citycoin.dev (`wrong_site`) and the other way round. That binding exists today (the text must name the request's host); S04 keeps it, takes the host from the allowlist, and tests it. A text is still single use (`replayed`). |
| A "sign in with my phone" pairing (`/api/pair*`), the wallet link's carry code (`/api/me/wallet/carry*`), the location hand-offs (`/api/locate/handoff*`, `/api/signup/location/handoff*`) and a sign-up (the `vsu` cookie) | Each row records its host (`pairs.host`, `handoffs.host`, `signups.host`). On another host it is unknown: `pair_expired` / `expired` / `carry_expired` / `no_signup`, and nothing is read, marked, approved, consumed or deleted there (a copied `vsu` cookie is cleared on that host, the sign-up it names stays: `signupDelete`); a pairing approved on its own host cannot be collected on another (no session is made). |
| A request that changes something (every POST route's Origin check, `src/http.js` `sameSite`) | The `Origin` must be exactly the allowlist entry's origin the request is served as (scheme and host): `http://citycoin.dev`, or `https://vicinity.city:8443`, is refused (403) on `https://citycoin.dev` and `https://vicinity.city`. While the binding does not count: today's rule (the Origin's host equals the request's host). |
| Links: the QR code and pairing link, the carry link, the location hand-off links, the Google return address (`redirect_uri`) | Built on the allowlist entry's origin. The request's `Host` never builds a link, a QR code or a redirect target; the server's own redirects stay relative paths of this site, and no request parameter (`next`, `return`, `redirect_uri`) is ever followed. |
| A Google callback replayed on another host | The return address on that host differs from the one Google issued the code for, so the code exchange fails (`/connect?error=login_failed`); the `vo` cookie is host-only besides. |

**Schema.** Four lazy additive migrations in `src/store.js`, one per table, each run only while the binding counts and only by the paths
that use its table, the first time such a row is read or written: `2026-10-24-host-binding-sessions` (`sessions.host`),
`2026-10-24-host-binding-pairs` (`pairs.host`), `2026-10-24-host-binding-handoffs` (`handoffs.host`) and `2026-10-24-host-binding-signups`
(`signups.host`, once the sign-up tables exist). Nullable `TEXT` columns, each `ALTER` on its own ("duplicate column" ignored), then the
record. No row is rewritten. A request with no cookie and no write touches nothing. A failing `ALTER` breaks only its own table's routes
(a hand-off column never stops a sign-in); a wallet sign-in or carry claim adds `sessions.host` before it uses up the signed text, so a
failure there answers 500 and the same signature works on the retry; while bound, sign-out clears the cookie even when the database fails.

### 1.3 The cutover's own hosts before `SITE_ORIGINS` lists them (S03/S04 review)

`citycoin.dev` and `www.citycoin.dev` (`src/site-config.js` `CUTOVER_HOSTS`: the v5 policy's canonical host and its www; a test keeps the
two in step) answer `421 {"error":"wrong_host","origin":"https://vicinity.city"}` before any route while `SITE_ORIGINS` does not list
citycoin.dev (unset, naming only vicinity.city, or refused). They are not attached today, so no answer that anyone receives changes. The
reason: the binding is turned on by configuration, not by the host a request arrives on. Without this rule, citycoin.dev attached as a
custom domain before `SITE_ORIGINS` lists it (in the dashboard, or by an out-of-order deploy) would serve the whole site unbound: its
sessions, pairings and hand-offs would get host NULL, which later reads as vicinity.city (signed out on citycoin.dev, accepted on
vicinity.city if copied), and its challenge text, QR links and Google return address would come from its `Host` header. With the rule,
such a window answers 421 on the Worker paths and makes no row; its pages still come from the static assets, so it is still a half-working
site: keep the order in section 2. Other hosts outside the allowlist keep today's in-place serving while unset (refusing all of them would
change today's answers, which is the owner's call; Cloudflare routes none of them to this Worker). From the S06 configuration on
(section 3, step 2) `SITE_ORIGINS` lists citycoin.dev, so this rule no longer applies to it: citycoin.dev is served, bound to its host
(section 1.2), and www.citycoin.dev, never listed, is refused like any host outside the allowlist.

**Owner actions it implies (none taken here).** Google sign-in on citycoin.dev works only if the Google OAuth console lists
`https://citycoin.dev/api/auth/google/callback` (external E12): on citycoin.dev the Worker sends Google that return address (it is built
on the host the request is served as, section 1.2). With `SIGNUP_FLOW=v2` live and `WALLET_ONLY` off, Google is one of the site's main
ways to sign up and sign in, so this is a **before-the-merge owner step of S06** (implementation-report.md, S06 deploy checklist, item 2;
adding it early is harmless). Without it every Google tap on citycoin.dev (Continue with Google, Log in with Google, the Profile's Add)
ends on Google's "Error 400: redirect_uri_mismatch" page: nobody is signed in by mistake, but Google sign-in does not work on citycoin.dev,
and a member who signs in only with Google (signed out there by design: their session is vicinity.city's) cannot sign in there with it.
Master section 05 keeps Google out of the new wallet-only login path (S15), so the entry can be deleted with the client then (E12).

## 2. The Cloudflare settings (item 2 prepared in the S06 pull request, not merged; none changed yet)

1. **`run_worker_first` stays the list.** It was to become `true` only so that the Worker could redirect old-host pages under
   `HOST_REDIRECT` (S56). With S56 dropped (section 0) no stage needs it: `wrangler.jsonc` keeps
   `"run_worker_first": ["/api/*", "/coin-meta/*", "/official-coins.csv"]` with `not_found_handling: "404-page"`, so every page and
   file is served straight from the static assets on each routed host, citycoin.dev included, as on vicinity.city today, and page views
   are not Worker requests. The page build still refuses `HOST_REDIRECT=on` without `run_worker_first: true` (`src/pages-built.js`
   `pagesReachWorker`), which keeps the dropped switch from being turned on by mistake. No zone Redirect Rule is made on the vicinity.city
   zone either: the owner wants no forward from it.
2. **Attach citycoin.dev** (stage S06): the owner first gives the GitHub deploy token (`CLOUDFLARE_API_TOKEN`,
   .github/workflows/deploy.yml) the citycoin.dev zone (external E1). Then the S06 configuration pull request adds `citycoin.dev` as a
   custom domain of the Worker (wrangler.jsonc `routes`), Cloudflare issues the certificate, and the same pull request adds it to
   `SITE_ORIGINS` (`https://citycoin.dev https://vicinity.city`; `SITE_ORIGIN` stays unset until S55, so vicinity.city stays canonical
   and keeps serving). Rules for that pull request:
   - **`SITE_ORIGINS` lists citycoin.dev in the same deploy that attaches it, or an earlier one; never after.** Attaching first gives a
     half-working site: its pages load from the static assets while every `/api/*` answers 421 (section 1.3), until the setting is
     deployed. Add the custom domain through the pull request's `routes`, not in the dashboard ahead of it.
   - **Do not list `www.citycoin.dev` in `SITE_ORIGINS`.** Listed, it becomes an origin of its own: its own sessions, its own challenge
     text and a Google return address `https://www.citycoin.dev/api/auth/google/callback` that is not registered. Unlisted but attached, its
     pages load from the assets and its `/api/*` answers 421. So **www.citycoin.dev answers with the apex or is left unattached**: attach
     it only together with a zone Single Redirect (Rules, Redirect Rules) from `www.citycoin.dev` to `https://citycoin.dev`, keeping the
     path and the query string (there are no legacy hand-off links on www.citycoin.dev, so a whole-query redirect is safe); the redirect
     runs before the Worker, which then never sees www. That meets master section 04's "canonicalize www.citycoin.dev to the apex". If the
     rule cannot be made in the same change, www.citycoin.dev stays unattached (today it does not resolve) and is added later the same
     way. This redirect stays inside the new domain; the owner's decision concerns the vicinity names only. With S56 dropped, no stage
     serves www from the Worker.
   - **No preview or staging host under citycoin.dev** (for example `preview.citycoin.dev`) until the session cookie carries the `__Host-`
     prefix (not built yet: as built on `cc/s09`, `vs` and `vsu` keep their names under `WALLET_ONLY`, review finding SEC-9): until then such
     a host, running other code, could set a `Domain=citycoin.dev` `vs` or `vsu` cookie and log a visitor into the setter's own account or
     continue the setter's sign-up. The same holds for any host under vicinity.city. Use a separate domain for previews (S05).
   - Set `DEPLOYMENT_ENV=production` with it (the v5 check wants an environment for any changed switch anyway): it also turns off the local
     development exemption (section 1.2) on the production Worker. `wrangler dev` reads the same `wrangler.jsonc` values and presents every
     local visit under the first route's name, `http://citycoin.dev` from S06 on (`http://vicinity.city` before): with `production` that is
     served as `https://citycoin.dev`, so pages and reads work, the wallet challenge names citycoin.dev, and every write from the browser
     answers `403 wrong_origin` (its Origin, `http://localhost:8787`, is not `https://citycoin.dev`; measured with wrangler 4.137
     `wrangler dev --local`, no network). It answers 421
     only when started with `--local-upstream localhost:8787`. A local copy that signs in and saves: `DEPLOYMENT_ENV=test` in its
     git-ignored `.dev.vars` (`.dev.vars.example`) and `npm run dev -- --local-upstream localhost:8787` (README, "Run it locally"). (Before
     S06 a browser on `http://localhost:8787` got `403 wrong_origin` on writes too: its Origin's host is not the presented route's name.)
   Until then no request for citycoin.dev reaches the Worker. `HOST_REDIRECT` stays unset in every step (section 0).

   **Status (25 October 2026): prepared, not merged.** The S06 configuration pull request (branch `cc/s06` on main `5150529`) does exactly
   this in `wrangler.jsonc`: `routes` gains `{ "pattern": "citycoin.dev", "custom_domain": true }` before the two vicinity.city entries;
   `vars` gain `SITE_ORIGINS` = `https://citycoin.dev https://vicinity.city` and `DEPLOYMENT_ENV` = `production`; `SITE_ORIGIN` stays unset
   (vicinity.city canonical until S55); www.citycoin.dev is neither listed nor attached, and no zone redirect is made (it keeps not
   resolving); `HOST_REDIRECT` stays unset; `run_worker_first` stays the list. The S06 review added three Worker fixes for the two-host
   period: citycoin.dev on the link checker's official list (`src/official.js`), the code e-mail and the wallet and Google notices name the
   host the request was served as (`src/mail.js`, `src/hostbind.js` `mailOrigin`), and citycoin.dev's pages and files carry
   `X-Robots-Tag: noindex` (a host rule in `public/_headers`; the static-assets engine matches a rule that starts with `https://` against
   `https://<host><path>`, checked with wrangler 4.137's asset worker: three valid rules, the header on citycoin.dev only).

   **The deploy token (external E1, section 3 step 1).** As `docs/DEPLOY.md` step 1 set it up (template *Edit Cloudflare Workers*, zone
   resources `vicinity.city`), `CLOUDFLARE_API_TOKEN` does not cover the citycoin.dev zone, unless the owner widened it since (that can only
   be read in the Cloudflare dashboard, or from the deploy log). So the owner gives it the zone **before the merge**. What a deploy does
   without it (read in wrangler 4.137, `node_modules/wrangler/wrangler-dist/cli.js`): `npm run build`, every test included, passes; the
   assets are uploaded and the new Worker version is deployed at 100% before the routes and domains are handled, so `SITE_ORIGINS`,
   `DEPLOYMENT_ENV` and this pull request's code **are live** on vicinity.city; then the zone lookup for citycoin.dev finds nothing ("Could
   not find zone for `citycoin.dev`"), or the custom-domain request is refused, and wrangler exits 1: the run goes red, its live check does
   not run, and citycoin.dev still gets no DNS record (the owner's complaint stays). vicinity.city keeps serving: a failed run does not
   detach its custom domains, and its answers are those of the new version, which is harmless (members keep their sessions, host NULL reads
   as vicinity.city; new rows record vicinity.city; the hosts the binding refuses are hosts Cloudflare does not route here). Every later push
   to main then deploys its Worker and fails at the same step, with its live check skipped, until the token gets the zone or the route is
   removed. After such a run: check `https://vicinity.city/` by hand, give the token the zone, and run the workflow again.
3. **Plain http.** No zone change is needed: `.dev` is on the HSTS preload list, so browsers never ask citycoin.dev over http.
4. **Remove the vicinity.city routes** (stage S55, section 3 step 4): the `vicinity.city` and `www.vicinity.city` entries leave
   wrangler.jsonc `routes` in the configuration pull request that makes citycoin.dev canonical, with no redirect (section 0). They are not
   kept for 12 months: the owner's decision replaces master section 04's rule. Preconditions: citycoin.dev serves the site and passed the
   checks of section 4, and the legacy launch path is closed (section 0, item 1). After the deploy Cloudflare no longer sends either name
   to this Worker, and the names are the owner's to use as he decides. Nothing from them is redirected.
5. **vicinitycity.net** is not routed to the Worker today (wrangler.jsonc comment on `routes`; it answers 403 from Cloudflare). This plan
   does not attach it, and the owner's decision does not name it (open, section 0).
6. **vicinitycity.com and www.vicinitycity.com** are not this Worker's: they are custom domains of the countdown Worker
   `vicinity-countdown` (section 0), which answers every request with a 302 to `https://vicinity.city/`. That forward ends when the two
   names are detached from `vicinity-countdown` in the Cloudflare dashboard (Workers & Pages, vicinity-countdown, Settings, Domains &
   Routes), which the owner, or someone with Cloudflare access, does. A deploy from this repository does not detach them
   (countdown/wrangler.jsonc lists no routes on purpose). It can be done at any time: it does not touch the site. Afterwards the
   countdown deploy workflow (.github/workflows/deploy-countdown.yml) would fail at its last step, which checks
   `https://vicinitycity.com/teaser.js`, on the next push that changes `countdown/`; that workflow, the `countdown/` folder, and the
   Worker and its D1 database `vicinity-countdown` (it holds the countdown's "Rep your city" answers) are for a later cleanup, at the
   owner's word. No forward from vicinitycity.com to citycoin.dev is added (rebrand-inventory.md U11 is dropped).

## 3. Order of the cutover (owner decision of 24 October 2026; step 2 prepared in a pull request on 25 October 2026, none of it applied)

Already merged with nothing switched on: S03 (section 1, not to be switched on) and S04 (sessions, hand-offs, hand-off links, QR codes
and wallet challenges bound to their host, counting from step 2 on, section 1.2). S05, the preview environment, is where steps 2 and 4
are rehearsed first.

1. **The owner gives the GitHub deploy token the citycoin.dev zone** (`CLOUDFLARE_API_TOKEN`, external E1). Nothing on the site changes.
   *Status (25 Oct 2026): required before the S06 merge; not confirmed.* The citycoin.dev zone is on the same Cloudflare account as
   vicinity.city. The token as `docs/DEPLOY.md` step 1 made it names the vicinity.city zone only (DEPLOY.md now names both zones); whether
   the owner widened it since can only be read in the Cloudflare dashboard, or from the S06 deploy log. The owner edits the token (Cloudflare,
   My Profile, API Tokens, the deploy token, Edit): zone resources the citycoin.dev zone too (or all zones of the account), with the
   template's permissions, and checks that the zone shows Active. Without it the S06 deploy fails at the attach (section 2, item 2, status).
2. **S06, a configuration pull request, attaches citycoin.dev** to this Worker and lists it in `SITE_ORIGINS` in the same pull request
   (section 2, item 2), with `DEPLOYMENT_ENV=production`. www.citycoin.dev answers with the apex through the zone redirect, or stays
   unattached; never listed. vicinity.city keeps serving and stays canonical (`SITE_ORIGIN` unset). `HOST_REDIRECT` stays unset.
   *Status (25 Oct 2026): prepared, not merged* (branch `cc/s06`, on the owner's go of 25 Oct 2026; section 2, item 2, status). www.citycoin.dev
   stays unattached. The pull request also carries the S06 review's three Worker fixes (section 2, item 2, status). Before the merge: step
   1, and the Google console entry (section 1.3). The deploy of the merge attaches the domain; then the checks of section 4, "After step 2",
   are run. If the attach fails for want of the token's zone (step 1), see the status under section 2, item 2.
3. **Checks on citycoin.dev** while both hosts serve (section 4, "After step 2").
4. **S55, a configuration pull request, makes citycoin.dev the canonical origin and removes the vicinity.city routes**:
   `SITE_ORIGIN=https://citycoin.dev`, `SITE_ORIGINS=https://citycoin.dev`, and the `vicinity.city` and `www.vicinity.city` entries
   removed from wrangler.jsonc `routes`, with no redirect (section 2, item 4). Only after the legacy launch path is closed (section 0,
   item 1: stage S58), the checks of step 3 pass and every item of section 4, "Before step 4", holds. The label switches of S55 may
   go in the same pull request or follow it (implementation-report.md, stage S55).
5. **The owner removes the vicinitycity.com forward** (section 2, item 6): any time, before or after the other steps; it is independent
   of the site.

## 4. Checks (to run at each step; none run yet: "After step 2" follows the deploy of the S06 merge)

**After step 2** (both hosts serve):

- `curl -sI https://citycoin.dev/` answers 200 over a certificate Cloudflare issued for citycoin.dev; the main pages and
  `/api/health` answer 200.
- Byte hashes of the files a legacy coin or listing may name are equal on `https://vicinity.city` and `https://citycoin.dev`:
  `/brand/vicinity-512.png`, `/official-coins.csv`, and every `/coin-meta/<mint>.json`, `/coin-meta/<mint>.png` and
  `/coin-meta/art/<sha>.png` a coin names (none today).
- The host binding counts (section 1.2): a wallet sign-in works on citycoin.dev; a `vs` cookie copied by hand from vicinity.city reads
  signed out there (`/api/me` says `signedIn: false`); a POST with `Origin: https://vicinity.city` sent to citycoin.dev answers 403.
- www.citycoin.dev: with the zone redirect, `curl -sI "https://www.citycoin.dev/launchpad?tab=new"` answers a redirect to
  `https://citycoin.dev/launchpad?tab=new`; without it the name does not resolve.
- `node scripts/check-live.mjs https://citycoin.dev` passes (the deploy workflow runs it only for vicinity.city; retry while the
  certificate is being issued).
- `curl -sI https://citycoin.dev/` carries `x-robots-tag: noindex`; `curl -sI https://vicinity.city/` carries none. (Until the go-live pull
  request, branch `cc/golive`, not merged. From its deploy on it is the other way round: citycoin.dev carries none, and vicinity.city
  and www.vicinity.city carry `x-robots-tag: noindex`; implementation-report.md section 11, "Go-live switch-on".)
- On citycoin.dev, "Check a link" (`/api/check?q=citycoin.dev`) answers official; an e-mail sign-up's code e-mail asked there says "Enter it
  at https://citycoin.dev/connect"; with the Google console entry (section 1.3) "Continue with Google" comes back signed in, without it
  Google shows `redirect_uri_mismatch`.
- vicinity.city answers exactly as before: the same pages, APIs and redirects as a snapshot taken before the deploy, except
  `/api/official` (its `websites` list names citycoin.dev, `updated` 2026-10-25), the checker's verdict for citycoin.dev, and the exact
  Origin rule of section 1.2 (a write whose Origin is spelled `http://vicinity.city`, `https://vicinity.city:443` or
  `https://VICINITY.CITY` now answers 403; browsers never send those spellings). Its e-mails are byte for byte as before.
- The synthetic probes of S54 are green on both hosts.

**Before step 4:**

- The legacy launch path is closed: a read-only RPC read of the legacy launchpad PDA shows `launches_paused = 1` (signed by
  `13qRam…sRiN`, external E3), and the website builds no legacy launch (`LEGACY_LAUNCH=off`, S58).
- No coin names vicinity.city: `/official-coins.csv` is empty and the legacy launchpad has launched no coin. Any such coin stops step 4
  until the owner decides (policy `release_gates.legacy_immutable_metadata`: exact bytes served as long as existing assets depend on
  them).
- The on-chain partner record `2be9mDcn…si11` (section 0, item 2): a read-only RPC read shows that it names an address on
  citycoin.dev, or the owner has accepted in writing that `https://vicinity.city/brand/vicinity-512.png` goes dark and that
  acceptance is recorded as an owner decision in `policy.json` `amendments` and `src/masterpolicy.js` (kept identical), for this one
  file on the old host. Without one of the two, step 4 waits (policy `release_gates.legacy_immutable_metadata`).
- The post-deploy check checks citycoin.dev: `scripts/check-live.mjs` (default base `https://vicinity.city`, run after every deploy
  by `.github/workflows/deploy.yml`) takes its base from `SITE_ORIGIN` (rebrand-inventory.md U10, stage S54). Otherwise the S55
  deploy removes the vicinity.city routes and then fails its own live check, leaving a failed run with the site already changed.
- Items 3 to 6 of section 0 are known to the owner; the mail sender and the link checker's list (items 5 and 6) are settled.
- The S55 pull request removes the `https://citycoin.dev/*` rule (`X-Robots-Tag: noindex`) from `public/_headers`, or the canonical site
  stays out of search engines.
  Since the go-live pull request (branch `cc/golive`, not merged; owner's go of 25 Oct 2026), the rules in `public/_headers` are
  `https://vicinity.city/*` and `https://www.vicinity.city/*` instead, and citycoin.dev is indexed. Once the go-live is deployed, the S55
  pull request removes those two rules together with the routes.

**After step 4:**

- citycoin.dev answers as after step 2, and its pages and links name `https://citycoin.dev` as the canonical origin.
- `curl -sI https://vicinity.city/` and `curl -sI https://www.vicinity.city/` get no answer from this Worker and no `location` that
  points at citycoin.dev.
- The synthetic probes stay green on citycoin.dev through the observation period (external E15).

**After step 5:** `curl -sI https://vicinitycity.com/` and `curl -sI https://www.vicinitycity.com/` no longer answer 302 to
`https://vicinity.city/`, and nothing forwards them to citycoin.dev.

## 5. Rollback

`HOST_REDIRECT` is never set (section 0), so it has nothing to roll back.

Step 4 rolls back by putting the two vicinity.city routes back in wrangler.jsonc and `SITE_ORIGIN` and `SITE_ORIGINS` back to their step 2
values, then deploying; members' vicinity.city sessions are then still valid until they expire (section 6). This works only while the owner
has not yet put vicinity.city to its other use. Once he has, there is no way back to vicinity.city, only fixes on citycoin.dev.

The host binding (section 1.2) rolls back with `SITE_ORIGINS`: set it back to `https://vicinity.city` (or blank both settings) and deploy.
Change the value in `wrangler.jsonc`; do not delete the line, and do not count on a plain revert of the S06 merge, which deletes it:
`keep_vars` keeps a setting that a deploy no longer names, so the old value would stay.
Every session, pairing, hand-off and sign-up row is then found by its token alone again, on any host, as today; the `host` columns stay,
nullable and unread. citycoin.dev then answers 421 on every Worker path (section 1.3: never served unbound) while its pages still load from
the assets, so detach citycoin.dev in the same rollback. A member's citycoin.dev session row stays until it expires. This rollback applies
only between steps 2 and 4, while vicinity.city still serves.

## 6. Sessions during the window

- **Until S06** (`SITE_ORIGINS` unset): one host, nothing changes. Every existing session row has host NULL.
- **From S06** (`SITE_ORIGINS` lists citycoin.dev; section 1.2): a member signed in today stays signed in on vicinity.city (host NULL
  is vicinity.city), with the same session, dashboard and roles. Browsers never send a vicinity.city cookie to citycoin.dev, so there the
  member signs in again with the same wallet and reaches the same account (`users.wallet`); no location check is asked (master section 05).
  A cookie carried by hand between the hosts is signed out on the other one. A Google- or e-mail-only member uses the legacy window (S14).
- **After step 4** (S55): vicinity.city no longer reaches this Worker, so a vicinity.city session can no longer be used or signed out
  there; nothing redirects an old tab or a sign-in trip that comes back to vicinity.city. The member signs in on citycoin.dev with the
  same wallet. The vicinity.city session rows end by themselves (the table below) and the scheduled job deletes them.

**Expiry and retirement of what exists today** (master section 05: "Document the safe expiry/retirement of old sessions, handoff tokens and
signing keys"). Nothing is deleted by S04; every row below ends by itself, and the scheduled job (`src/jobs.js`) deletes expired rows:

| Row | Lifetime (unchanged) | So, after the binding starts |
|---|---|---|
| Session (`sessions`) | 30 days (`src/session.js`); a session a wallet made in a wallet app's own browser is renewed while used, never past 90 days from when it was made (`src/auth.js` `renewSession`, `SESSION_MAX_DAYS`) | every host-NULL session has ended 90 days after the last one was made |
| Pending wallet proof (a session without an account) | 30 minutes (`PENDING_SECONDS`) | gone within the hour |
| Pairing (`pairs`) | 10 minutes | gone within the hour |
| Hand-off code (`handoffs`: carry, location) | 10 minutes | gone within the hour |
| Sign-up (`signups`) | an hour from the last request, at most 3 hours | gone within 3 hours |

A row made before the binding is bound to vicinity.city, so none of these can be used on citycoin.dev at any point. Signing keys: the wallet
challenge is not keyed (the wallet signs it, and the text names its host); the location attestation key (`ATTEST_KEY`, or the generated
`attest_key` setting, `src/attest.js`) and the relay-ticket key (the limits salt, `src/limits.js`) name no host, so the domain change needs
no rotation. R1-09 plans the `ATTEST_KEY` rotation once the check-in and apply attestations are retired (after `WALLET_ONLY`, S15).
