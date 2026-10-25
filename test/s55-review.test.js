// Stage S55, the review's follow-ups (docs/citycoin-master/implementation-report.md section 11, "Stage S55", "S55 review follow-ups"):
//   - S55-DEPLOY-2: the post-deploy check (scripts/check-live.mjs) runs its checks when it is started through a linked path too; before, the
//     run-as-script test compared import.meta.url (symbolic links resolved) with process.argv[1] (as typed), so it checked nothing and exited 0;
//   - S55-DEPLOY-1: the rollback text names a revert of the S55 code (the configuration and the tests that pin it, together) and the deploy
//     token's vicinity.city zone, never a pull request that changes the two settings alone (which fails the suite the deploy's build runs);
//   - H1, H2, H3, H5: the S55 documents declare no gate met by inference: the owner's specific acceptance of the partner logo going dark, the
//     on-chain pause, his acknowledgement of what stops answering, and the census and backup are blocking items of the S55 deploy checklist;
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

test("the S55 documents declare no gate met by inference: the partner logo, the on-chain pause, the owner's acknowledgement and the census are blocking", () => {
  const cutover = read("docs/citycoin-master/domain-cutover.md");
  const report = read("docs/citycoin-master/implementation-report.md");
  const inventory = read("docs/citycoin-master/rebrand-inventory.md");
  const s55 = report.slice(report.indexOf("### Stage S55:"), report.indexOf("## 12. Commands run for this report"));
  const status = cutover.slice(cutover.indexOf("**Status of step 4 (stage S55)"), cutover.indexOf("**Status on 25 October 2026 (written before S55)"));
  const note = report.slice(report.indexOf("> **Status note added with stage S55"), report.indexOf("## Contents"));
  const row = report.split("\n").find((l) => l.startsWith("| **S55** Website cutover |"));
  const c04 = inventory.split("\n").find((l) => l.startsWith("| C04 |"));
  // H1: the owner's general go is not recorded as his acceptance of the partner logo going dark
  for (const [label, text] of [["domain-cutover.md", cutover], ["the S55 section", s55], ["the status note", note], ["the S55 row", row], ["C04", c04]]) {
    // the first version's words (each an affirmative claim; the corrected texts say "is not recorded as ...")
    assert.doesNotMatch(text, /go (of 25 Oct(ober)? 2026 )?is recorded as (his|the|that) acceptance|\bis recorded as that acceptance|records the owner's go( of 25 Oct 2026, quoted as written,)? as his acceptance|the gate is met by the owner's written acceptance|partner-image acceptance recorded/, label);
  }
  assert.match(status, /3\. \*\*The partner record's logo\*\* \(section 0, item 2\): not met\./);
  assert.match(c04, /not recorded as that acceptance/);
  // H2: the pause is a blocking pre-merge item, no deviation
  assert.doesNotMatch(cutover + note + row + s55, /recorded deviation: the on-chain pause|One gate is a recorded deviation|proceeds under the owner's go of 25 Oct 2026 with this recorded deviation|\*\*Deviation, recorded\.\*\*/);
  assert.match(status, /2\. \*\*The legacy launch path closed on chain\*\*[^]*?: not met\./);
  // H3: the checklist's pre-merge items are all blocking, and the status lists every precondition that is not met or not evidenced
  const checklist = s55.slice(s55.indexOf("**Deploy checklist for S55.**"), s55.indexOf("**Rollback**"));
  assert.match(checklist, /^\*\*Deploy checklist for S55\.\*\* Items 1 to 5 come before the merge, each recorded in the pull request with its time, and all five are blocking/);
  for (const n of [1, 2, 3, 4, 5]) assert.match(checklist, new RegExp(`^${n}\\. \\*\\*Blocking: `, "m"), `item ${n} is blocking`);
  assert.match(checklist, /launches_paused = 1/);
  assert.doesNotMatch(checklist, /set_pause\(launches = true\)` on the legacy launchpad \(recommended\)/);
  for (const item of ["PR #106 merged and deployed", "The legacy launch path closed on chain", "The partner record's logo", "Items 3 and 4 of section 0 known to the owner",
    "The database census and backup before and after", "The rollback rehearsed on preview first", "The synthetic probes of S54"]) {
    assert.ok(status.includes(`**${item}`), `the status lists: ${item}`);
  }
  // H5: the safety argument is qualified by the upgrade authority
  assert.doesNotMatch(cutover, /So nobody but the owner's wallet can make a launch possible\./);
  assert.match(cutover, /So, under the deployed code, nobody but the owner's wallet can make a launch possible; any change to that code\n {2}needs the program's upgrade authority, the Squads vault `AB5qB1iAukPB7p1dkukQ1qSke3yQBDeSd5o69dLFGs7X` \(2 of 3\)/);
});

/* ---------------------------------------------------------------- H4: the deploy step's name */

test("docs/DEPLOY.md names the deploy workflow's live-check step by its name", () => {
  const steps = [...read(".github/workflows/deploy.yml").matchAll(/^\s*- name: (.*)$/gm)].map((m) => m[1].trim());
  const live = steps.find((n) => /^Check the live site/.test(n));
  assert.equal(live, "Check the live site (citycoin.dev) sends its security headers");
  const named = [...read("docs/DEPLOY.md").matchAll(/output of "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(named, [live]);
});
