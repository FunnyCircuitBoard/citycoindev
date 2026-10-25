// Stage S55, the review's follow-ups (docs/citycoin-master/implementation-report.md section 11, "Stage S55", "S55 review follow-ups"):
//   - S55-DEPLOY-2: the post-deploy check (scripts/check-live.mjs) runs its checks when it is started through a linked path too; before, the
//     run-as-script test compared import.meta.url (symbolic links resolved) with process.argv[1] (as typed), so it checked nothing and exited 0;
//   - S55-DEPLOY-1: the rollback text names a revert of the S55 code (the configuration and the tests that pin it, together) and the deploy
//     token's vicinity.city zone, never a pull request that changes the two settings alone (which fails the suite the deploy's build runs);
//   - H1, H2, H3, H5: the S55 documents declare no gate met by inference. H1: no text says that the owner named or specifically accepted the
//     partner logo going dark; the guard reads every S55 document, the policy entry in both files and the comments of the tests that pin them.
//     Since the lead developer's decision of 25 Oct 2026 (under the owner's delegation, after his go), the three gates that need the owner's
//     signature or his specific words (the on-chain pause, the partner logo, his knowledge of what stops answering) are recorded deviations
//     (a), (b) and (c), each with its evidence, and the blocking items are: PR #106 merged and deployed with citycoin.dev checked, a fresh
//     read-only re-check of the chain (any Approval stops the merge), the census and a restore point, and the lead developer's message sent;
//   - H4: docs/DEPLOY.md names the live-check step of the deploy workflow by its name.
// Nothing here reaches a network: the check is pointed at a server on 127.0.0.1 that this test starts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startedAsScript } from "../scripts/check-live.mjs";
import { MASTER_POLICY } from "../src/masterpolicy.js";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const CHECK_LIVE = fileURLToPath(new URL("../scripts/check-live.mjs", import.meta.url));
/** Runs node on `script` with `args`; resolves { code, stdout } (never rejects on a non-zero exit). No proxy reaches 127.0.0.1. */
const runNode = (script, args) => new Promise((resolve) => {
  const env = { ...process.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" };
  delete env.NODE_USE_ENV_PROXY;
  execFile(process.execPath, [script, ...args], { env, timeout: 30_000 }, (err, stdout) => resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout) }));
});

/* ---------------------------------------------------------------- S55-DEPLOY-2: the check runs through a linked path */

test("scripts/check-live.mjs started through a symbolic link runs its checks (a failing site exits 1), as through its real path; importing it runs nothing", async () => {
  // a site that answers every address 200 with no security header: the check must report each one and exit 1
  const server = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("x"); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "s55-check-live-"));
  try {
    const link = join(dir, "check-live.mjs");
    symlinkSync(CHECK_LIVE, link);
    for (const [label, script] of [["the real path", CHECK_LIVE], ["a symbolic link", link]]) {
      const { code, stdout } = await runNode(script, [base]);
      assert.equal(code, 1, `${label}: a site without the security headers fails the check`);
      assert.match(stdout, /^MISSING 200 \/ {2}content-security-policy/m, `${label}: the check ran and said what is missing`);
      assert.match(stdout, new RegExp(`addresses on ${base.replace(/[.]/g, "\\.")} are missing security headers`), label);
    }
    // the run-as-script test compares real paths
    assert.equal(startedAsScript(link, CHECK_LIVE), true, "a linked path to the script is the script");
    assert.equal(startedAsScript(CHECK_LIVE, CHECK_LIVE), true);
    assert.equal(startedAsScript(fileURLToPath(new URL("../scripts/cities/tickers.mjs", import.meta.url)), CHECK_LIVE), false, "another script is not");
    assert.equal(startedAsScript(undefined, CHECK_LIVE), false, "no script (node -e, an import): nothing runs");
    assert.equal(startedAsScript(join(dir, "no-such-file.mjs"), CHECK_LIVE), false);
    assert.equal(startedAsScript(), false, "this test imported the module: it did not run the check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await new Promise((r) => server.close(r));
  }
});

/* ---------------------------------------------------------------- S55-DEPLOY-1: the rollback is a revert, with the token's zone */

test("the S55 rollback is a revert of the S55 code with the deploy token's vicinity.city zone first, never the two settings changed alone", () => {
  const wrangler = read("wrangler.jsonc").replace(/\n\s*\/\/\s*/g, " ");
  assert.match(wrangler, /Rollback of S55, [^"]*one pull request that reverts the S55 code \(git revert of its merge commit/);
  assert.match(wrangler, /Changing this value and the routes alone fails the tests, which the build runs before every deploy, so nothing would be uploaded/);
  assert.match(wrangler, /the deploy token gets the vicinity\.city zone back/);
  assert.match(wrangler, /Rollback, only while the owner has not reused vicinity\.city: the revert of S55 described at SITE_ORIGINS above/);
  assert.doesNotMatch(wrangler, /change this value back to "https:\/\/citycoin\.dev https:\/\/vicinity\.city" and put both vicinity\.city routes back below, in one pull request/, "the config-only rollback is gone");
  assert.match(read("wrangler.jsonc"), /"build": \{ "command": "npm run build" \}/, "the reason: every deploy builds, and the build runs every test");
  assert.match(read("package.json"), /"build": "node scripts\/copy-assets\.mjs && node scripts\/pages\/build\.mjs && npm test"/);

  const cutover = read("docs/citycoin-master/domain-cutover.md");
  const rollback = cutover.slice(cutover.indexOf("## 5. Rollback"), cutover.indexOf("## 6. Sessions during the window"));
  assert.match(rollback, /step 4 rolls back by one pull request\nthat reverts the S55 code, never by changing the two settings alone/);
  assert.match(rollback, /`git revert --no-commit <the S55 merge commit on main>`/);
  assert.match(rollback, /the deploy token has the `vicinity\.city` zone again/);

  const deploy = read("docs/DEPLOY.md");
  assert.match(deploy, /after it the token needs `citycoin\.dev` only, until a rollback of S55 \(docs\/citycoin-master\/domain-cutover\.md section 5\)\. A rollback attaches vicinity\.city and www\.vicinity\.city again, so the `vicinity\.city` zone goes back on the token first/);

  const report = read("docs/citycoin-master/implementation-report.md");
  const s55 = report.slice(report.indexOf("### Stage S55:"), report.indexOf("## 12. Commands run for this report"));
  const rb = s55.slice(s55.indexOf("**Rollback**"));
  assert.match(rb, /git revert --no-commit/);
  assert.match(rb, /`vicinity\.city` zone/);
});

/* ---------------------------------------------------------------- H1, H2, H3, H5: no gate declared met by inference */

const LEAD_STATEMENT = "For step 3 I'm taking your message as written approval of two things. First, the old Vicinity logo address stored on-chain (the Meteora partner record) will stop loading. Second, I'm going ahead before the old launchpad is paused on-chain. That pause needs your signature. It's still worth doing, but nobody can launch through the old launchpad anyway: no launch approvals exist on-chain, and the website no longer builds launches.";
const s55Texts = () => {
  const cutover = read("docs/citycoin-master/domain-cutover.md");
  const report = read("docs/citycoin-master/implementation-report.md");
  const lines = report.split("\n");
  const s55 = report.slice(report.indexOf("### Stage S55:"), report.indexOf("## 12. Commands run for this report"));
  return {
    cutover, report, s55,
    status: cutover.slice(cutover.indexOf("**Status of step 4 (stage S55)"), cutover.indexOf("**Status on 25 October 2026 (written before S55)")),
    note: report.slice(report.indexOf("> **Status note added with stage S55"), report.indexOf("## Contents")),
    row: lines.find((l) => l.startsWith("| **S55** Website cutover |")),
    log: lines.filter((l) => /^\| 2026-10-25 \((stage S55|S55 )/.test(l)).join("\n"),
    c04: read("docs/citycoin-master/rebrand-inventory.md").split("\n").find((l) => l.startsWith("| C04 |")),
    checklist: s55.slice(s55.indexOf("**Deploy checklist for S55.**"), s55.indexOf("**Rollback**")),
  };
};
// The false claim of S55 review finding H1, in each wording seen so far and its near variants: that the owner named, or specifically
// accepted, the partner logo going dark (or that his go is that acceptance). The amendment's own wording, which applies his general go to
// the file with the consequence stated to him in writing and says that he did not name it, passes. Conditions a gate states ("or the owner
// accepts in writing that ...") are not claims, and the review table's finding titles describe the defect found.
const FALSE_ACCEPTANCE = [
  /go (of 25 Oct(ober)? 2026 )?is recorded as (his|the|that) acceptance|\bis recorded as that acceptance|records the owner's go( of 25 Oct 2026, quoted as written,)? as his acceptance|the gate is met by the owner's written acceptance|partner-image acceptance recorded/i,
  /(?<!\bnot (?:be |been )?recorded )\bas (?:his|the|that|the owner's) (?:written |specific )?acceptance\b/i, // "... as the acceptance that ... goes dark"
  /\b(?:it|amendment|entry|go|record|decision) accepts\b|\baccepts (?:\w+ ){0,2}going dark/i, // "the record it accepts going dark"
  /(?<!\b(?:or|unless|until|if|when) )\b(?:the owner|he) (?:has |had )?(?:accepted in writing|accepted that|specifically accepted (?:this|the|that)|named (?:this|the|that) (?:file|logo|address|partner))/i,
  /(?<!\b(?:until|unless|when|once|if|after) )\b(?:his|the owner's) (?:specific |written )+acceptance (?:is|was) (?:given|recorded|quoted|received|in hand)/i,
];
const testComments = (f) => read(f).split("\n").filter((l) => /^\s*\/\//.test(l)).join("\n");

test("H1, widened: no S55 text, policy entry or test comment says that the owner named or specifically accepted the partner logo going dark", () => {
  const t = s55Texts();
  const amendment = (doc) => doc.amendments.find((a) => a.id === "owner-decision-2026-10-25-golive");
  const json = JSON.parse(read("docs/citycoin-master/policy.json"));
  const reconciliation = read("docs/citycoin-master/00-reconciliation.md").split("\n").filter((l) => l.includes("/brand/vicinity-512.png")).join("\n");
  const findingTitles = (text) => text.replace(/^\| (?:H\d|S55-[A-Z]+-\d|SEC-NIT-\d)[^|]*\|/gm, "|");
  const texts = [
    ["domain-cutover.md", t.cutover], ["the S55 section", findingTitles(t.s55)], ["the status note", t.note], ["the S55 row", t.row],
    ["the S55 update-log rows", t.log], ["C04", t.c04], ["00-reconciliation.md", reconciliation], ["docs/DEPLOY.md", read("docs/DEPLOY.md")],
    ["README.md", read("README.md")],
    ...["source", "summary", "overrides"].flatMap((f) => [[`policy.json ${f}`, amendment(json)[f]], [`src/masterpolicy.js ${f}`, amendment(MASTER_POLICY)[f]]]),
    // the two places the first H1 pass missed: the report's count note (in the S55 section, above) and this comment
    ...["test/masterpolicy.test.js", "test/brand-adapters.test.js", "test/host-redirect.test.js", "test/s55-cutover.test.js"].map((f) => [`${f} (comments)`, testComments(f)]),
  ];
  for (const [label, text] of texts) {
    assert.ok(text && text.length > 40, `${label}: read`);
    for (const re of FALSE_ACCEPTANCE) assert.doesNotMatch(text, re, label);
  }
  // the guard catches both wordings the first H1 pass missed, and the first version's
  for (const missed of [
    "and the record it accepts going dark (name \"Vicinity\", the vicinity.city logo address)",
    "(stage S55 added the third: the owner's go of 25 Oct 2026 as the acceptance that https://vicinity.city/brand/vicinity-512.png goes dark;",
    "it records the owner's go of 25 Oct 2026, quoted as written, as his acceptance that this address goes dark",
    "the owner has accepted in writing that this address goes dark",
    "the owner named the file in his go",
    "his specific written acceptance is quoted in the entry",
  ]) assert.ok(FALSE_ACCEPTANCE.some((re) => re.test(missed)), missed);
  // ... and lets the honest wording through
  for (const honest of [
    amendment(json).source, amendment(json).summary, t.c04,
    "it does not name this file, the partner record or Meteora, and this entry does not record that the owner named or specifically accepted this file",
    "So step 4 waits until either the record names an address on citycoin.dev, or the owner accepts in writing that this address goes dark",
    "it is not recorded as his acceptance of this file going dark",
    "nothing until the owner's specific written acceptance is quoted in this entry",
  ]) for (const re of FALSE_ACCEPTANCE) assert.doesNotMatch(honest, re, honest.slice(0, 80));
  // the honest wording is there: applied under the owner's general go, with the consequence stated to him in writing, never named by him
  assert.match(amendment(json).source, /this entry does not record that the owner named or specifically accepted this file\. The lead developer, under the owner's delegation, applies the go to this file, and before either merge stated this consequence to the owner in writing/);
  assert.match(amendment(json).summary, /^In force since 25 Oct 2026: applied under the owner's general go \(source\)/);
  assert.match(t.status, /3\. \*\*The partner record's logo\*\* \(section 0, item 2\): \*\*recorded deviation \(b\)\*\*\.[^]*?the go does not name the file, and the amendment does not say that he named or specifically accepted it\./);
  assert.match(t.c04, /not recorded as that acceptance/);
  assert.match(t.c04, /does not say that he named or specifically accepted it/);
});

test("the gates that need the owner's signature or his words are recorded deviations (a), (b), (c) with their evidence; the blocking items are the four the lead developer does right before the merge", () => {
  const t = s55Texts();
  // the lead developer's written statement to the owner, quoted as written, where the decision is recorded
  for (const [label, text] of [["domain-cutover.md status", t.status], ["the S55 section", t.s55]]) assert.ok(text.replace(/\n\s*/g, " ").includes(`(quoted as written): "${LEAD_STATEMENT}"`), label);
  // (a) the on-chain pause: not met as written, with its evidence, the residual risk, still recommended; the fresh re-check is blocking
  assert.match(t.status, /2\. \*\*The legacy launch path closed on chain\*\* \(section 0, item 1; section 4, "Before step 4"\): \*\*recorded deviation \(a\)\*\*, not met as written\./);
  const a = t.s55.slice(t.s55.indexOf("- **(a) The on-chain pause"), t.s55.indexOf("- **(b) The partner record's logo"));
  for (const must of [/It is 0: only the owner's wallet can set it/, /he has not signed it, and his go does not name it/, /0 `Approval` accounts exist on chain \(by size 179 and by discriminator\)/,
    /`LEGACY_LAUNCH=off` \(the go-live\) makes the website build and accept no approval or launch/, /0 coins were launched \(`\/official-coins\.csv` empty, 0 `Coin` accounts\)/,
    /Residual risk, stated plainly: the admin wallet `13qRam63xqqd8KNUoAmHWQu7ro71oHqEsYHYaG5MsRiN`, or the program's upgrade authority \(the Squads vault `AB5qB1iAukPB7p1dkukQ1qSke3yQBDeSd5o69dLFGs7X`, 2 of 3\), could still create an approval or change the code, and the pause itself would not stop an admin, who can unpause/,
    /The pause stays a recommended owner step/]) assert.match(a, must);
  // (b) and (c)
  assert.match(t.s55, /- \*\*\(b\) The partner record's logo \(gate "legacy_immutable_metadata"\)\.\*\*[^]*?no coin depends on that record \(the fee claimer's one DBC config has 0 pools, and the legacy launchpad has launched 0 coins\)/);
  assert.match(t.status, /4\. \*\*Items 3 and 4 of section 0 known to the owner:\*\* \*\*recorded deviation \(c\)\*\*\.[^]*?That message is not sent yet: sending it is a blocking item\./);
  assert.match(t.s55, /- \*\*\(c\) Items 3 and 4 of `domain-cutover\.md` section 0 known to the owner\.\*\*[^]*?That message is not sent yet/);
  // nothing claims the pause signed, the gate met, or the message sent
  assert.doesNotMatch(t.cutover + t.note + t.row + t.s55, /(?<!\b(?:if|unless|until|when|once) )the owner (?:has )?signed (?:the pause|`?set_pause)|the pause (?:is|was|has been) signed|message (?:is|was|has been) sent|(?<!not )met by the owner/);
  // the status lists every precondition, with the ones that cannot be met recorded as not met
  for (const item of ["PR #106 merged and deployed", "The legacy launch path closed on chain", "The partner record's logo", "Items 3 and 4 of section 0 known to the owner",
    "The database census and restore point before and after", "The rollback rehearsed on preview first", "The synthetic probes of S54"]) {
    assert.ok(t.status.includes(`**${item}`), `the status lists: ${item}`);
  }
  assert.match(t.status, /1\. \*\*PR #106 merged and deployed[^]*?: not met, blocking\./);
  assert.match(t.status, /5\. \*\*The database census and restore point before and after\*\*[^]*?blocking\./);
  assert.match(t.status, /6\. \*\*The rollback rehearsed on preview first\*\*[^]*?cannot be met/);
  assert.match(t.status, /7\. \*\*The synthetic probes of S54\*\*[^]*?not built\./);
  // the checklist: four blocking items, done right before the merge; the deviations are not among them
  assert.match(t.checklist, /^\*\*Deploy checklist for S55\.\*\* Items 1 to 4 come before the merge, each done by the lead developer right before the merge and recorded in the pull request with its time, and all four are blocking/);
  for (const n of [1, 2, 3, 4]) assert.match(t.checklist, new RegExp(`^${n}\\. \\*\\*Blocking: `, "m"), `item ${n} is blocking`);
  assert.doesNotMatch(t.checklist, /^5\. \*\*Blocking/m);
  assert.match(t.checklist, /^1\. \*\*Blocking: PR #106 \(the go-live\) is merged and deployed, and citycoin\.dev passes the checks of `domain-cutover\.md` section 4, "After step 2"\*\*/m);
  assert.match(t.checklist, /^2\. \*\*Blocking: a fresh read-only re-check of the chain, right before the merge\*\*[^]*?by `dataSize` 179 and by the `Approval` discriminator `e90999310bde3b82` \(0 expected\)[^]*?\*\*If any `Approval` or `Coin` account exists, or the list is not empty, STOP: do not merge\*\*/m);
  assert.match(t.checklist, /^3\. \*\*Blocking: the census and a restore point\*\*[^]*?If neither a backup nor a restore point is recorded, do not merge\./m);
  assert.match(t.checklist, /^4\. \*\*Blocking: the lead developer's message to the owner of deviation \(c\), sent\*\*/m);
  assert.match(t.checklist, /the on-chain pause `set_pause\(launches = true\)` on the legacy launchpad, which stays recommended \(deviation \(a\); E3, S58\)/);
  assert.doesNotMatch(t.checklist, /Blocking: the legacy launch path is closed on chain|Blocking: the partner record's logo|Blocking: the owner's written acknowledgement|or the owner's written waiver/);
  // the policy entry of the domains decision is unchanged ("the legacy launch path is closed before it stops"): the deviation is recorded, not
  // written into the policy as if the owner had decided it
  assert.match(JSON.parse(read("docs/citycoin-master/policy.json")).amendments.find((x) => x.id === "owner-decision-2026-10-24-domains").summary, /the legacy launch path is closed before it stops/);
  // H5: the safety argument is qualified by the upgrade authority
  assert.doesNotMatch(t.cutover, /So nobody but the owner's wallet can make a launch possible\./);
  assert.match(t.cutover, /So, under the deployed code, nobody but the owner's wallet can make a launch possible; any change to that code\n {2}needs the program's upgrade authority, the Squads vault `AB5qB1iAukPB7p1dkukQ1qSke3yQBDeSd5o69dLFGs7X` \(2 of 3\)/);
});

/* ---------------------------------------------------------------- H4: the deploy step's name */

test("docs/DEPLOY.md names the deploy workflow's live-check step by its name", () => {
  const steps = [...read(".github/workflows/deploy.yml").matchAll(/^\s*- name: (.*)$/gm)].map((m) => m[1].trim());
  const live = steps.find((n) => /^Check the live site/.test(n));
  assert.equal(live, "Check the live site (citycoin.dev) sends its security headers");
  const named = [...read("docs/DEPLOY.md").matchAll(/output of "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(named, [live]);
});
