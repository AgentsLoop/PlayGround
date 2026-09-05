# OMG (Oh My GitHub) agent instructions

## Wiki index

- [OpenCode workflow](wiki/opencode.md)
- [Oh My Github App](wiki/oh-my-github-app.md)
- [Temporary Mac SSH access](wiki/access.md)
- [Testing and verification](wiki/testing.md)
- [OmGithub publishing](wiki/omgithub.md)

## Main project file

The main project file is [.github/workflows/opencode.yml](.github/workflows/opencode.yml).

The local [game issue E2E skill](.agents/skills/game-issue-e2e/SKILL.md) must
stay aligned with this workflow. Its kickoff procedure creates a fresh issue
with the `OpenCode` label (and `Goal` by default), does not use comments as
triggers, and waits only for the initial OpenCode session link.
The GitHub App dispatches execution for an issue opened with `OpenCode` or when
the `OpenCode` label is added to an existing issue. The workflow itself accepts
only `workflow_dispatch`; edits, comments, and unrelated labels must not be
documented as triggers. When a human opens an issue without `OpenCode`, the App
ensures the repository label exists, leaves the issue unlabeled, and posts a
reminder; it does not start the workflow automatically.
An optional issue-title suffix `branch: <existing-branch>` selects the target
checkout and pull-request base; without it, the default branch is used.

## Shell timing

When writing shell scripts or invoking multiple commands in one shell call,
always add explicit per-command execution-time measurements between commands.
Use `/usr/bin/time -p` or a small timing helper around each meaningful command;
the outer command duration is not sufficient because it hides which step is
slow or hung.

## Ideas

Store durable implementation ideas as individual Markdown files under
`./ideas/`, using descriptive kebab-case filenames such as
`ideas/opencode-oauth-env-auth.md`.

## Git delivery

After every code change, commit and push the change.
Before running any workflow, verify that the working tree is clean and everything
is committed.

When the user asks to undo a just-made change or commit, inspect the targeted
commit and working tree first, then prefer rewriting that commit and pushing with
`git push --force-with-lease` rather than creating a revert commit. Preserve
unrelated changes and stop if the remote branch has advanced unexpectedly. Use
`git revert` when the change is already shared broadly or when history rewriting
would be unsafe.

## Git Commits
- Write evidence-rich commit messages, not short subject-only messages. Use a specific subject and a body that records the motivating symptom or context, root cause, decision rationale and alternatives considered, material changes, verification performed, discovered Throughput bottlenecks or Hung commands, relevant Pitfalls and Gotchas, and known caveats or follow-up. Preserve the durable reasoning summary needed for diagnosis, rollback, and future extension.
- Always include the current Codex chat/task ID in the commit message, using a clear field such as `Chat-ID: <chat-id>` in the body.

## Links in handoffs

When a relevant URL or stable identifier exists, include a clickable Markdown
link in the user-facing response. Link GitHub issues, Actions runs, pull
requests, commits, releases, public app URLs, and Codex tasks/threads rather
than reporting only their numbers or plain text. For Codex tasks/threads, use
the `codex://threads/<thread-id>` URL format.

When mentioning a commit, append its relative age in hours or days.

## OpenCode GitHub Actions

To execute an issue, open it with the `OpenCode` label, or add that label to an
existing issue. The GitHub App converts that event into one workflow dispatch.
Edits, comments, and other labels do not execute it. Add
the `Goal` issue label to use persistent goal mode. The workflow starts a temporary AgentsWeb SSH session,
verifies it, runs OpenCode, and cleans up the SSH session afterward.

When monitoring a triggered run, use `gh run watch <run-id> --repo AgentsLoop/OhMyGithub --exit-status` for overall job status.
Do not use `gh run view --log` to read logs from a running task: GitHub reports that
logs are unavailable until completion. Use `bash scripts/ssh-run-log.sh <run-id>`
for the live Actions log over SSH. Do not use tight `for` loops around `gh run list`,
which needlessly consume GitHub API rate limit.

To connect to an issue's live worker, find its run ID with
`gh run list --repo AgentsLoop/OhMyGithub --workflow opencode.yml --status in_progress`,
then run `bash scripts/ssh-run-log.sh <run-id>` to discover the host and port and SSH
with `~/.ssh/aiplay-agentsweb` as shown by the helper.

When the user asks to check a live OpenCode workflow, always pull the runner logs
over SSH first, using `scripts/ssh-run-log.sh` or a targeted SSH read from the
same runner. Base the answer on those logs before discussing whether an action
is confirmed; do not lead with a generic inability-to-confirm statement when
live log evidence can be collected.

For real-time inspection from a live temporary SSH session, use the helper:

```sh
bash scripts/ssh-run-log.sh <run-id>
```

The helper discovers the temporary SSH command from the triggering issue or pull
request, then follows the freshest `_diag/pages` log. The runner uploads chunks from
`_diag/blocks` to GitHub. Do not print environment files, tokens, or private keys while
inspecting the runner.

## Mac SSH access

The Mac private key stays at `~/.ssh/aiplay-agentsweb`. Its public key is
stored in the repository Actions secret `AGENTSWEB_SSH_PUBLIC_KEY`. The issue
commented by the workflow contains a directly usable command such as:

```sh
ssh -i ~/.ssh/aiplay-agentsweb -p <port> runner@<run-name>.agentsweb.space
```

The command works only while the corresponding Actions job is running.

## Connecting to a live OpenCode worker

Use the repository helper to discover the worker host and port from the broker
or issue comment. It uses the persistent local key `~/.ssh/aiplay-agentsweb`:

```sh
bash scripts/ssh-run-log.sh <run-id> --repo AgentsLoop/OhMyGithub
```

For an interactive shell, reuse the host and port printed by the helper and
use the same key:

```sh
ssh -tt -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -i ~/.ssh/aiplay-agentsweb \
  -p <port> runner@<run-name>.agentsweb.space
```

Do not substitute the generated runner key under `sshworker/outputs/keys/`; it
can produce a misleading `Permission denied (publickey)` result. Temporary
worker SSH access ends when the Actions job and session are cleaned up. Never
print secrets while inspecting a worker.
