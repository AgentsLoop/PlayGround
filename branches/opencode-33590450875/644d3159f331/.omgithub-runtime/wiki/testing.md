# Testing and verification

Project acceptance testing is live production testing. Manually create a real
GitHub issue with the required labels and prompt, then verify the resulting
workflow dispatch, exactly one runner/session, and the completed production
outcome. Do not use unit tests as the testing strategy; local checks such as
`actionlint` and `git diff --check` are only static safeguards before the live
test.

For an issue-triggered run with `AGENTSWEB_SSH_PUBLIC_KEY` configured, verify
these checkpoints in order:

1. `Start AgentsWeb SSH session` succeeds.
2. `Post temporary SSH connection command` succeeds.
3. `Verify AgentsWeb SSH availability` succeeds.
4. `Run OpenCode` succeeds.
5. `Mark SSH session closed` and `Clean up AgentsWeb SSH session` succeed.
6. The expected branch and pull request exist.

The verification loop must confirm a browser entrypoint before public-app and
Pages checks: either `$PROJECT_DIR/index.html` or `$PROJECT_DIR/dist/index.html`
must exist, and remediation retries must repeat that check. Static root
`index.html` apps are copied to a temporary Pages directory; built
`dist/index.html` apps are published directly.

When `AGENTSWEB_SSH_PUBLIC_KEY` is missing, the SSH session and SSH-based
verification steps must be skipped. OpenCode Web, the Cloudflare session URL,
and the browser-based workflow path must still run; the access comment should
omit SSH instructions and cleanup must not report an SSH session closure.

The AgentsWeb public port must be derived from `GITHUB_RUN_ID`, not
`GITHUB_RUN_NUMBER`. Run numbers restart at `1` for each repository, which made
the first OMG run in every newly installed repository contend for port `32001`
and close during SSH verification. The globally unique run ID spreads those
runs across the broker's `32000-32999` port range.

Validate workflow edits locally with:

```sh
actionlint .github/workflows/opencode.yml .github/workflows/opencode-reusable.yml
git diff --check
```

For a direct GitHub Pages smoke test, apply both the `OpenCode` and `test-gh`
labels to an issue. The App remains triggered only by the exact `OpenCode`
label; `test-gh` selects the Pages-only mode. The workflow skips OpenCode,
creates and pushes a unique `test-gh/hello-world-*` branch containing a static
Hello World page, and runs the Pages publication/deployment path strictly. A
successful run comments with the source branch, commit, and published URL.
The test path does not honor `PAGES_PUBLISH_ENABLED=false` and does not keep a
temporary worker alive for five hours.

The caller must grant every permission requested by the reusable workflow.
Otherwise GitHub rejects the run at startup before creating a job, even when
`actionlint` succeeds.

For goal support, confirm the App checks the `OpenCode` label and dispatches the
workflow once, while the workflow reads the forwarded `Goal` label without any
native `issues` subscription, installs and configures
`opencode-goal-plugin`, and branches the
initial invocation to `opencode run --command goal` only when that label is on
the issue. An issue without `Goal` must retain the standard `opencode run`
path. The configured
`noInterruptOnUserMessage: true` option should remain visible in the generated
OpenCode config.

Verify that label synchronization creates `Goal`, and that `Mark issue in
progress` preserves the label alongside `in progress`. `Goal` must be the only
way an issue enters goal mode; arbitrary issue text must not trigger the workflow.
Creating an issue with both `OpenCode` and `Goal` labels must start one
`workflow_dispatch` run through the App, not separate `opened` and `labeled`
runs.

For custom-branch support, create an issue whose title ends with
`branch: <existing-branch>`. Confirm the App strips the suffix from the
OpenCode request and dispatches the workflow from that branch for checkout and
pull-request base.
A missing or syntactically invalid branch must receive an issue comment and must
not start the reusable pipeline. The repository-local workflow must remain
dispatch-only so the App is the sole issue-event router.

For the `omo` issue label, verify that an otherwise normal OpenCode issue causes
the OpenCode startup step to install `oh-my-openagent` with Bun before starting
the web server and launches `opencode ... --command goal` with `ulw` in the
objective; an issue without the `OpenCode` label must not run that installer, and the
`omo` label alone must not trigger a workflow. The OMO config must use its
native Goal command and must not register a compatibility `ulw-loop` command.

The log-release step must copy and upload only non-empty `.log`/`.json` files;
empty service logs such as `nginx.log` can make GitHub's upload API return
`400 Bad Content-Length`. The OpenCode response JSON remains required and must
be non-empty.

Focused completion-evidence checks should also confirm that the workflow copies
`agents.template.md` to `project/Agents.md`, and that a run sends up to two
same-session follow-up prompts when no `project/screenshots/final-*` image
exists, with three total evidence checks. Missing screenshots warn and do not
block delivery; when present, a successful run must leave a final issue comment
containing the public URL, final commit, PR, and embedded screenshots served
from that immutable commit.

Watch a running workflow with live per-step logs using the same internal
endpoints as the GitHub Actions web UI:

```sh
python3 scripts/gh-run-watch-logs.py <run-id> \
  --repo AgentsLoop/OhMyGithub --internal-job-id <web-job-id> --exit-status
```

The script authenticates with `gh auth token`. GitHub's web log endpoints are
unsupported and may change. Unlike `gh run view --log`, they expose the
currently available text while a job is running. GitHub does not expose the
web UI's second, internal job ID through its supported API. Read it from the
job page's `data-job-steps-url`, whose form is
`.../actions/runs/<run>/jobs/<web-job-id>/steps`.

In the browser console on the job page, print that URL with:

```js
document.querySelector("check-steps").dataset.jobStepsUrl
```

The workflow may show non-fatal Node.js deprecation or Actions cache warnings.

For the freshest local log, connect to the temporary SSH session posted by the
workflow and follow the runner's current page log:

```sh
find /home/runner/actions-runner/cached/*/_diag/pages -type f -name '*_1.log' -print
tail -F /home/runner/actions-runner/cached/*/_diag/pages/*_1.log
```

The runner writes the live Actions console output to `_diag/pages` and uploads
step-log chunks from `_diag/blocks`. This can be ahead of `gh run view --log`
while a job is still running. Avoid printing environment files, tokens, or keys.

Use the helper to discover the posted SSH endpoint automatically:

```sh
bash scripts/ssh-run-log.sh <run-id>
```

The helper checks the AgentsWeb broker `/api/registrations` endpoint first when
`BROKER_API_TOKEN` is available (or when `../../sshworker/workers-dashboard/.env`
contains it), then falls back to the workflow issue comments.
