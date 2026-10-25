// Rules page: fills in every number from the live rules (/api/policy), so the page can't drift from the code.
(() => {
  "use strict";
  // The product's names in this file's words (the label migration, area b). A page built for a label set other than today's carries the
  // set on <html> (data-brand, data-brand-name, data-brand-domain: scripts/pages/build.mjs writes them from src/brand.js); brand`…` puts
  // those names in a text's own words, never in a value put into it. A page without them (today's pages) gets every text exactly as written.
  const BRAND = (() => { try { const r = document.documentElement, at = (k) => (r && typeof r.getAttribute === "function" ? r.getAttribute(k) : null); return at("data-brand") && at("data-brand-name") && at("data-brand-domain") ? Object.freeze({ key: at("data-brand"), name: at("data-brand-name"), domain: at("data-brand-domain") }) : null; } catch { return null; } })();
  const brand = (s, ...v) => s.reduce((out, part, i) => out + (BRAND ? part.replace(/vicinity\.city/g, () => BRAND.domain).replace(/Vicinity/g, () => BRAND.name) : part) + (i < v.length ? String(v[i]) : ""), "");
  const { $, $$, el, api, fmt, ago } = window.V;
  // each rule is a fold: open on a computer, closed on a phone (one card at a time); a link to a rule (/rules#founders) opens its fold.
  // The Terms page (/terms) loads this file for the same folds on its sections (and nothing else: the rules' numbers are below)
  const folds = $$(".rules-grid details, details.terms-sec");
  if (window.matchMedia && window.matchMedia("(min-width: 800px)").matches) folds.forEach((d) => (d.open = true));
  const openTarget = () => { let t = null; try { t = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; } catch {} const d = t && t.closest ? t.closest("details") : null; if (d) d.open = true; };
  openTarget(); window.addEventListener("hashchange", openTarget);
  if (!$(".rules-grid")) return; // the Terms page: folds only
  (async () => {
    const d = await api("/api/policy");
    if (!d.policy) return;
    const p = d.policy, f = p.founder, m = p.manager, mod = p.moderation;
    const L = f.ladder;
    const values = {
      version: p.version, effectiveAt: p.effectiveAt,
      // v5: the Stake Ladder — no more flat 1M. Compact form here; the full formula is on the page.
      founderAmount: `${fmt(L.base)}–${fmt(L.max)} by city size`,
      qualifyingDays: f.qualifyingDays, localDays: f.localDays, windowHours: f.windowHours, appealHours: f.appealHours,
      graceDays: f.graceDays, maxGraces: f.maxGraces, cooldownDays: f.cooldownDays,
      stewardProbationDays: f.stewardProbationDays, stewardQuorum: f.stewardQuorum,
      stewardChallengeEndorsements: f.stewardChallengeEndorsements, stewardGraceHours: f.stewardGraceHours,
      darkCityDays: f.darkCityDays, squadMin: f.squadMin, squadMax: f.squadMax,
      minFounderDays: m.minFounderDays, electionDays: m.electionDays, termDays: m.termDays,
      hideHours: mod.hideHours, reportsToConfirm: mod.reportsToConfirm, reportsToAutoHide: mod.reportsToAutoHide, banDays: mod.banDays,
      challengeHours: p.supporters.challengeHours, attestationMinutes: p.attestation.minutes, freshProofMinutes: p.freshProofMinutes,
    };
    for (const [k, v] of Object.entries(values)) $$(`[data-rule="${k}"]`).forEach((e) => (e.textContent = v));
    const w = f.weights;
    // The Stake Ladder, rendered from the live policy so the examples can't drift from the code.
    const ex = (pop) => {
      const raw = L.base * Math.cbrt(Math.max(pop, 1) / L.refPop);
      return Math.floor(Math.min(L.max, Math.max(L.base, raw)) / L.rung) * L.rung;
    };
    const eg = (pop) => `${pop >= 1e6 ? (pop / 1e6) + "M" : Math.round(pop / 1e3) + "K"} people → ${fmt(ex(pop))}`;
    const ladderEl = $("#ladder-formula");
    if (ladderEl) ladderEl.textContent =
      `stake = ${fmt(L.base)} × (population ÷ ${fmt(L.refPop)})^(1/3), clamped ${fmt(L.base)}–${fmt(L.max)}, rounded down to ${fmt(L.rung)}\n` +
      `rule of eight: 8× the people → 2× the stake\n` +
      [10_000, 80_000, 640_000, 5_120_000, 10_000_000].map(eg).join(" · ");
    const formula = $("#founder-formula"); // (guarded: the page built with the legacy seats frozen has no founder formula, stage S16)
    if (formula) formula.textContent = `score = ${w.endorsement * 100}% × endorsement share + ${w.contribution * 100}% × contribution + ${w.stake * 100}% × holdings
holdings count from the amount up to ${f.stakeCap}× the amount (more counts the same)
${BRAND ? "ties: lowest sha256(seat prefix|window|wallet)" : 'ties: lowest sha256("vicinity-seat|window|wallet")'}`;
    $("#never-list").replaceChildren(...p.never.map((t) => el("li", null, t)));
    $("#cutoff").textContent = d.snapshotCutoff ? new Date(d.snapshotCutoff).toUTCString() : "not scheduled yet";
    const h = d.balanceHistory || {};
    // (a page built for another label set names no legacy token: its own token is not live yet, so nothing is checked)
    $("#health-text").textContent = !d.launched ? (BRAND ? `The ${BRAND.name} token is not live yet, so no balances are checked.` : "Balance checks start the moment $VICINITY launches.")
      : h.lastSample ? `Balance checks running: last check ${ago(h.lastSample.taken_at)} (slot ${h.lastSample.slot ?? "—"}, ${fmt(h.lastSample.holders)} holding wallets, pools and team wallets included), ${h.samplesLast24h} in the last 24 hours.`
      : "Balance checks haven't recorded anything yet.";
  })();
})();
