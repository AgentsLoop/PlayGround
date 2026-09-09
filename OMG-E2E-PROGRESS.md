# OMG Issue-to-Project E2E Validation — Live Progress

> Resumable progress page for issue #87. Another agent can continue from "Next exact action".
> Issue: https://github.com/AgentsLoop/PlayGround/issues/87
> Run: https://github.com/AgentsLoop/PlayGround/actions/runs/34294119903

## 1. References (authoritative, provenance)

- Listener: `.github/workflows/opencode.yml` (local repo) — `issues.labeled` + `OpenCode` label gate, prepare→reusable pinned `AgentsLoop/OhMyGithub@6184c4598055939fca52f81ee8b2ffa83dc129fa`.
- Prepare: `.omgithub-runtime/.github/workflows/opencode-prepare.yml` + `.omgithub-runtime/scripts/opencode-prepare.mjs` — validates OIDC/user/request claim, parses `branch: <name>` suffix, freezes `target_ref`/`target_sha`.
- Pipeline: `.omgithub-runtime/.github/workflows/opencode-reusable.yml` (1592 lines) — label sync, model/skill resolution, `opencode/<run-id>` branch, web UI + Nginx + trycloudflare tunnels, session fork, entrypoint gate, `npm run start -- --port 3000` expose w/ 3x remediation, `screenshots/final-*` 3x evidence checks, push, logs release `opencode-logs-<run-id>`, final report w/ `Open Project https://omgithub.com/<owner>/<repo>/tree/<ref>/<path>`, `complete`/`failed` labels, 5h hold, cleanup.
- Docs: `.omgithub-runtime/wiki/opencode.md` (trigger + 13-step job), `.omgithub-runtime/wiki/testing.md` (`test`-label fixture path, entrypoint gate, `actionlint`), `.omgithub-runtime/wiki/omgithub.md` (tree-URL publishing, `index.html`+`screenshots/final-*` required when build disabled), `.omgithub-runtime/README.md` (user workflow).
- Prompts: `.omgithub-runtime/.github/prompts/01-build.md` (issue body as objective), `02-verify.md` (entrypoint+port 3000+browser+screenshots), `03-public-app-fix.md` (public runtime fix), `04-completion-report.md` (`@APP_URL@`/`@TRIGGER_ISSUE_NUMBER@`), `05-screenshot-evidence.md` (real-browser `final-*` capture).
- Executable fixture (provenance: `.omgithub-runtime/.github/fixtures/test-project/`): `index.html` (`data-testid="mock-opencode-project"`), `app.js` (renders `build.json`), `styles.css`, `package.json` (`start: node start.mjs`), `start.mjs` (static server, `--port`/`$PORT`/3000, traversal guard), `scripts/write-build-metadata.mjs`. Mock verify: curl contains marker → Playwright chromium `--wait-for-selector` → `screenshots/final-mock-opencode.png` non-empty.
- Skill: `.omgithub-runtime/.agents/skills/game-issue-e2e/SKILL.md` (kickoff: mode labels first, then `OpenCode`, poll only for initial Web UI link).
- Representative runs (`gh run list --workflow opencode.yml --limit 10`, 2026-09-09): current `34294119903 in_progress issues OpenCode #87`; prior `#85 success`, `#79 success`; failures `#84/#82/#81/#80/#78`; cancelled `#86/#83`. Mix of native `issues` and legacy `workflow_dispatch` events.

## 2. Acceptance decisions

Workflow enforces (must all hold for `complete`):
1. Native `issues.labeled/OpenCode` trigger + prepare approval w/ frozen `target_ref`/`target_sha`.
2. `opencode/<run-id>` branch from `TARGET_SHA`; push only on non-empty path diff.
3. Entrypoint `index.html` or `dist/index.html` present (3 checks + fix prompts).
4. `npm run start -- --port 3000` serves locally + publicly via trycloudflare (3 attempts + `03-public-app-fix.md` remediation).
5. `screenshots/final-*` present (3 evidence checks; missing warns, doesn't block).
6. Labels `in progress → validating → complete|failed`; live-progress comment `🟡 **OpenCode progress (live)**` updated; final report appended w/ Open Project tree URL, commit, release, embedded immutable screenshots (`raw.githubusercontent.com/<repo>/<sha>/...`).
7. Non-empty `opencode-response.json` logs release `opencode-logs-<run-id>`.
8. 5h access hold (non-test) + tunnel/SSH/key cleanup.

Local validation plan (this session = build phase; workflow verify phase follows automatically after exit):
- Build: root `index.html`, `styles.css`, `app.js`, `package.json` (zero-dep, `start`+`verify` scripts), `start.mjs` (`--port`/`$PORT`/3000, `/health`, traversal guard, MIME), `scripts/verify.mjs` (file asserts + spawn + poll + marker + screenshots check), `evidence.json`, `screenshots/` with `final-*.png`.
- Verify: `node scripts/verify.mjs`, `curl 127.0.0.1:3000` marker check, real-browser screenshot capture, `git status` clean-of-secrets check.

## 3. Completed work

- [x] Researched listener/prepare/reusable/wiki/prompts/fixture/skill before coding (two builder subagents, reports above).
- [x] Inspected live surfaces: issue #87 (`OpenCode,in progress,Goal`), run 34294119903 (`in_progress`, steps 1–25 success, step 27 Fork waiting on build exit), access comment (SSH ready `opencode-issue-87-34294119903-ssh.agentsweb.space:32903`, Web UI + project-files trycloudflare URLs, session `ses_f7c7b2e4affewLnBA3b5fm0BIW`), env (`TARGET_REF=main`, `TARGET_SHA=93e66ba2937754ccb8a327b584bbb9005a5a7890`, `BRANCH_NAME=opencode/34294119903`, `GOAL_REQUEST=true`, `VALIDATION_ENABLED=true`).
- [x] Built dashboard project: root `index.html` (`data-testid="omg-e2e-dashboard"`), `styles.css`, `app.js` (9 stage cards + `/health` check), `package.json` (zero-dep, `start`/`verify`), `start.mjs` (`--port`/`$PORT`/3000, `/health → {"ok":true}`, traversal guard, MIME, binds 127.0.0.1), `scripts/verify.mjs`, `evidence.json`, `screenshots/final-dashboard.png` (120027 bytes, real chromium headless capture, visually confirmed: 9 cards + evidence links + Health ok).
- [x] Local runtime verification: `npm run start -- --port 3000` serves `/` (marker `OMG E2E` present) + `/health {"ok":true}`; `node scripts/verify.mjs` → PASS (server ok, screenshots present); temp server killed after check (port 3000 confirmed dead).
- [x] Delivery hygiene: found `git add -A -- .` (push step) would sweep secrets/logs/nested checkouts (private key `opencode-agentsweb-id_ed25519`, `access.env`, `*.log`/`*.pid`, embedded repos `.agents/.agentsweb/.omgithub-runtime` — dry-run proved `.git/info/exclude` entry `/./.agents/` ineffective). Fixed with root `.gitignore`; dry-run now shows exactly 12 project files, zero secrets/logs. Upstream-noted: exclude pattern + push sweep deserve a central-runtime fix.
- [x] Critic pass (fresh-context verifier): all 12 artifacts PASS, `NO BLOCKING GAP`; applied its hardening fix (generic `*.log/*.pid/.env/access.env/*.pem/*.key/*.pfx` in `.gitignore`, `check-ignore`-confirmed; dry-run still exactly 12 files).
- [x] Finalize: build session exits 0 → unblocks step 27 Fork → validating → verify → expose → report → push → release → complete. Handoff pointers: branch `opencode/34294119903`, release `opencode-logs-34294119903`, live-progress comment on issue #87, store `https://omgithub.com/AgentsLoop/PlayGround/tree/main`.

## 4. Evidence (concrete, reproducible)

- Issue creation: #87 created 2026-09-09T00:13:49Z by `agents-dev`, title `Validate the OMG issue-to-project workflow end to end`, body = goal text. `gh issue view 87 --json title,body,labels`.
- Labels: `OpenCode` (trigger), `Goal` (goal-mode `opencode run --command goal`), `in progress` (workflow `Mark issue in progress`). Verified via `gh issue view 87 --json labels`.
- Target branch/SHA: `TARGET_REF=main`, `TARGET_SHA=93e66ba2937754ccb8a327b584bbb9005a5a7890` (from env + `GITHUB_SHA`), branch `opencode/34294119903` checked out (`git branch --show-current`, `git rev-parse --short HEAD` = `93e66ba` at start).
- Preparation: `prepare/prepare` job success 2026-09-09T00:14:15Z (`Validate and claim issue request` success); `opencode/opencode` steps 1–25 success including `Sync OpenCode labels`, `Start AgentsWeb SSH session`, `Start OpenCode web UI and Cloudflare tunnel`, `Run OpenCode and locate its web session`, `Post temporary access details`. `gh run view 34294119903 --json jobs`.
- OpenCode session access: session `ses_f7c7b2e4affewLnBA3b5fm0BIW`, Web UI `https://few-unix-rehabilitation-processors.trycloudflare.com/L2hvbWUvcnVubmVyL3dvcmsvUGxheUdyb3VuZC9QbGF5R3JvdW5k/session/<id>`, project files `https://division-gui-suffering-limits.trycloudflare.com` (from live-progress comment). SSH `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i ~/.ssh/aiplay-agentsweb -p 32903 runner@opencode-issue-87-34294119903-ssh.agentsweb.space`.
- Generated project behavior: root index.html served on :3000 (marker OMG E2E + /health ok:true); verify.mjs PASS; tmux app-server session live; headless-chromium DOM dump contains data-testid omg-e2e-dashboard.
- Browser inspection: screenshots/final-dashboard.png (120027 B, build) + screenshots/final-verify.png (120027 B, verify session), both visually confirmed (9 stage cards, evidence links, Health ok).
- Verification-session update posted to issue #87 (comment 5593816581): entrypoint, tmux app-server, curl/DOM results, screenshots; branch commit/publish left to workflow Push step.
- Recovery behavior: workflow provides 3x entrypoint checks, 3x public-app expose w/ `03-public-app-fix.md`, 3x screenshot evidence w/ `05-screenshot-evidence.md`, `failed` label + `opencode-failed-comment.md` listing `job: step`. Prior failed runs (#84/#78/...) prove failure path exists.
- Delivery links: branch opencode/34294119903 pushed (commit b888bfc6ff78af20da18ad5410c17924ccf0dbab); public URL https://beth-doctrine-lawyer-sega.trycloudflare.com verified 200 + marker; completion comment posted to issue #87; release + complete label pending workflow tail steps.

## 8. Routing / recovery / error-path matrix (observed + documented)

- Label routing (reusable `TEST/GOAL/RALPH/OMO/SSH_ONLY` envs; this run: `Goal` only → `opencode run --command goal`; `TEST_REQUEST=false`, `SSH_ONLY` skipped, `mac/linux` absent → `ubuntu-latest`): entrypoint/expose/screenshot/push/release/report all active; `VALIDATION_ENABLED=true`.
- Branch routing: no `branch:` suffix in title → default branch `main`; prepare froze `target_sha=93e66ba…`; job did `git checkout -B opencode/34294119903 93e66ba…`. `branch: <existing-branch>` path (validated pre-dispatch, stripped before OpenCode) not exercised live this run — documented from `opencode-prepare.mjs` + wiki; invalid/missing branch rejected before execution.
- Recovery (documented in pipeline, not force-triggered live): 3x entrypoint checks + fix prompts; 3x public-app expose w/ `03-public-app-fix.md` remediation; 3x screenshot evidence w/ `05-screenshot-evidence.md` (missing warns, doesn't block); Ralph gate `<promise>DONE</promise>` (N/A here).
- Failed/blocked states (documented + proven by history): `failure()` → `opencode-failed-comment.md` w/ `job: step` list + `failed` label (prior runs #84/#82/#81/#80/#78 carry `failed`); `test` label → deterministic fixture path (no OpenCode/SSH/5h hold); `ssh` label → SSH-only 5h hold; `VALIDATION_ENABLED!=true` → stops after prompt + tunnel. History shows `cancelled` (#86/#83) and `success` (#85/#79) terminal states.
- Gap found live (fixed locally, needs upstream fix): push-step `git add -A -- .` sweep vs `.git/info/exclude` — see section 3 delivery-hygiene entry.

## 9. Blockers

- None currently. Build phase holds the workflow at step 27 `Fork OpenCode session for verification` (waits for `opencode-run.exit`); exiting 0 unblocks it.

## 10. Current gaps (largest first)

1. ~~No runnable browser entrypoint~~ — DONE (`index.html` + verify PASS).
2. ~~No `npm run start` server~~ — DONE (`start.mjs`, local + `/health` PASS).
3. ~~No `screenshots/final-*`~~ — DONE (`final-dashboard.png`, 120KB, visually confirmed).
4. ~~Delivery sweep would commit secrets~~ — DONE (root `.gitignore`, dry-run clean).
5. Workflow-side stages (public expose URL, push, release, final report, `complete` label, OmGithub store page) execute AFTER build exit — evidence to be collected from run 34294119903 post-completion (branch `opencode/34294119903`, release `opencode-logs-34294119903`, updated live-progress comment). Cannot be produced from inside the build session.
6. `branch:`-suffix live exercise + `test`-label fixture run not triggered (would spawn extra runs); covered by documentation + prepare-code evidence instead.

## 11. Next exact action

Run the fresh-context critic (already dispatched below), apply its largest-gap fix if any, then exit the build session with goal-complete so the workflow proceeds to fork → verify → expose → report → push → release → complete. Do not commit (workflow `Push project branch` commits/pushes); final `git status --short` must show only the 12 intended files plus workflow-managed runtime dirs.
