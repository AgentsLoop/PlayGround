# OMG (Oh My GitHub) workflow

The canonical workflow is `.github/workflows/opencode.yml`.
The numbered build, verification, remediation, completion, and screenshot
prompt templates are stored as Markdown files in `.github/prompts/`.

## Trigger

The `OpenCode` issue label is the execution marker consumed by the Oh My Github
App. The App dispatches `.github/workflows/opencode.yml`; the workflow itself
accepts only `workflow_dispatch` and does not subscribe directly to issue
events. The issue body, or title when the body is empty, supplies the request
text. Comments and edits never trigger execution. An issue with the `Goal` label
uses the installed `opencode-goal-plugin`, configures
`noInterruptOnUserMessage: true`, and starts the runner with `opencode run
--command goal`; an issue without `Goal` uses the standard `opencode run`
path. The `OpenCode` label asks the App to launch the workflow; add `Goal` to select
persistent goal mode. This keeps
one request event mapped to one OpenCode session.

When a human opens an issue without `OpenCode`, the App posts a reminder to add
the label and stops; it does not dispatch a workflow. Adding `OpenCode` later
starts the normal App-dispatched flow.

The `test-gh` label is a deliberate Pages-only smoke-test mode and must be used
alongside `OpenCode`. The App remains triggered only by the exact `OpenCode`
label; `test-gh` changes the dispatched workflow path so it does not run
OpenCode. It creates a unique `test-gh/hello-world-*` branch, commits a static
Hello World page, and exercises the GitHub Pages publication and deployment
steps.

An optional issue-title suffix in the exact form `branch: <existing-branch>`
selects the checkout and pull-request base. The App removes that suffix from the
OpenCode request and validates the branch before dispatching the thin workflow
wrapper.
Invalid or missing branches receive an issue comment and do not start the build.
Without the directive, the repository default branch is used.

See the dedicated [Oh My Github App documentation](oh-my-github-app.md) for
App ownership, installation scope, permissions, events, and webhook details.

An issue labeled `omo` additionally installs and configures the OpenCode Ultimate
edition of `oh-my-openagent` with Bun before the OpenCode server starts. The
installer runs non-interactively with provider authentication skipped; `/omo` is
not a command and does not trigger a run by itself. An `omo`-labeled OpenCode run
uses OMO's native `goal` command and prepends `ulw` to the objective. The Codex
Light `ulw-loop` component is not recreated or registered for OpenCode.

## What the job does

1. Checks out the repository with persisted `GITHUB_TOKEN` credentials.
2. Copies `agents.template.md` to `$PROJECT_DIR/Agents.md` so the worker receives
   issue-update, screenshot, and completion-report requirements.
3. Starts an ephemeral AgentsWeb SSH tunnel.
4. Starts the OpenCode web UI and publishes it through a temporary public
   trycloudflare.com tunnel.
5. Creates an `opencode/<run-id>` branch from the relevant base branch.
6. Starts `opencode run --attach` against the same OpenCode installation and
   server-backed session store, then posts a direct URL to that live session.
7. Verifies SSH connectivity.
8. Replaces the access comment with aggregate OpenCode progress statistics and
   refreshes it about every 10 seconds while the run is active. The report also
   counts active child sessions from `/session/status` and all descendant
   subagent sessions from their `parentID` lineage. It also reports inferred
   human-readable elapsed time, aggregate token count and tokens-per-second speed,
   plus inferred image-context model calls by following image MIME attachments
   through each session transcript.
   Message text, reasoning, prompts, and tool details are
   never rendered in the live comment; full logs are published only in the
   completion release.
9. Runs a second verification prompt in the same OpenCode session as the build,
   starts the app, and exposes it through a
   separate temporary trycloudflare.com tunnel, and verifies the public URL.
10. Verifies the app through the public tunnel. If verification fails, sends a
   remediation prompt to the same OpenCode session and retries up to three
   times. Detects both uncommitted generated files and commits already created
   by OpenCode, then pushes the branch and creates the pull request in YAML.
11. Gives the verified public URL back to the worker, requests committed final
    browser screenshots, and appends immutable screenshot URLs with the game,
    commit, and PR links to the oldest triggering-issue comment containing the
    `🟡 **OpenCode progress (live)**` marker. If screenshots are missing, it
    sends up to two follow-up prompts to the same OpenCode session before
    continuing delivery with a warning.
12. Creates a uniquely tagged GitHub release containing the final OpenCode
    response JSON and safe runner log files, then appends its link to that same
    live-progress comment.
13. Keeps SSH, the OpenCode Web UI, and the app available for 5 hours after
   verification,
   then marks the comment closed and terminates both tunnels.

Validation is controlled by the repository variable `VALIDATION_ENABLED`. It
defaults to `true`. When set to `off` (or any value other than `true`), the
workflow stops after the initial OpenCode prompt and temporary OpenCode Web
trycloudflare exposure; app verification/remediation, completion and screenshot
prompts, Git delivery, GitHub Pages publication, release/report generation, and the
complete label are skipped. The temporary access session still sleeps for five
hours before cleanup.

After PR creation, the workflow publishes `$PROJECT_DIR/dist` into the target
repository's `gh-pages` branch with `peaceiris/actions-gh-pages`. Every result
uses `branches/<sanitized-opencode-branch>/<commit-prefix>/`, and `keep_files`
preserves earlier branch results so they coexist. Vite projects are rebuilt
with a relative asset base before publication. Publishing defaults to enabled;
set `PAGES_PUBLISH_ENABLED=false` to skip it. After the first `gh-pages` push,
the workflow assembles the complete branch site and deploys it with GitHub's
Pages artifact/deployment actions, automatically provisioning the deployment
without the Pages REST configuration API. Both built `dist/index.html` and
static root `index.html` projects are supported. If deployment is denied, the
final issue comment links directly to repository Settings → Pages and explains
the required branch/source selection. Publication remains non-blocking.
See [OmGithub publishing](omgithub.md).

The OmGithub issue workspace polls issue comments every eight seconds. Its
header contains the four numbered workflow stages plus the currently executing
stage and description. On desktop it shows the live OpenCode session on the
left and the newest progress screenshot or playable preview on the right. At
the mobile breakpoint, Chat and Preview tabs keep only one iframe visible at a
time. Numbered preview controls retain access to every progress and final
screenshot found in issue comments.

The comment URL opens `/<encoded-worktree>/session/<session-id>` rather than
the web home page. This matters because the web home page stores its project
selection in the browser, while the runner's project exists only on the
temporary GitHub Actions filesystem.

## Local tracker test

On macOS, run `./scripts/test-opencode-progress-tracker.sh`. It starts a local
mock OpenCode HTTP server with nested, active, and completed child sessions,
including user and tool image attachments, then asserts the three derived
progress counters.

The workflow uses the built-in OpenCode model path and does not require an
`OPENCODE_API_KEY` secret. To authenticate an ephemeral worker with the Mac's
OpenAI OAuth login, save the complete local OpenCode `auth.json` as the
`OPENCODE_AUTH_JSON` repository secret; the workflow passes it through
OpenCode's `OPENCODE_AUTH_CONTENT` environment variable. Branch creation,
pushing, and pull-request creation are deliberately handled by the workflow
rather than by OpenCode's GitHub integration.

## Findings: tracking the GitHub run in Web UI

The previous GitHub integration installed the OpenCode CLI and ran:

```sh
opencode github run
```

The workflow now sends the comment text directly to `opencode run --attach`.

For the installed `opencode-goal-plugin`, invoke a goal from the non-interactive
CLI with `opencode run --command goal "<objective>"`; passing `/goal <objective>`
as the message sends literal text instead of invoking the custom command. To
send a follow-up to the same attached session, use `opencode run --attach
<server-url> --session <session-id> "<message>"`. In this workflow, the
issue text is passed directly as the objective before it is passed to the custom
command, and later human messages steer the running goal instead of
pausing it.

Before starting OpenCode, the workflow checks out `agents-dev/skills` into
`$PROJECT_DIR/.agents`. OpenCode discovers project skills from
`$PROJECT_DIR/.agents/skills/**/SKILL.md`.
The workflow excludes this nested skills checkout through `.git/info/exclude`
so it cannot be included in the generated app commit.
The workflow verifies the discovered skill list through OpenCode's `/skill`
endpoint and synchronizes `model/<provider>/<name>` and `skill/<name>` labels
in the repository.
This keeps the regular OpenCode session while making branch and PR behavior
explicit and reviewable in YAML.
Model labels are refreshed from the live OpenCode catalog on each run and are
limited to models with zero input, output, and cache-read cost, plus the
explicitly allowed `opencode/gpt-5.6-luna` and `openai/gpt-5.6-luna` models.
Use `model/openai/gpt-5.6-luna` when the OpenAI provider is required. Default GitHub labels are removed, and
the triggering issue is marked `in progress`,
`complete`, or `failed` as the job advances.
For difficult game requests, the `game-issue-e2e` skill selects the synchronized
`model/opencode/muse-spark-1.2-contributor-free` label; if that label is
unavailable, the skill records that it used the workflow default instead.

The workflow reads the repository variable `PROJECT_DIR` as a repository-relative
project home. It defaults to `./`, while this repository sets it to `./project/`.
Absolute paths and parent-directory traversal are rejected. OpenCode Web and all
OpenCode runs use the resolved directory, and skill checkout, Git delivery,
publishing, and screenshot links use the same project home. OpenCode's server
also loads project instances per request using the `x-opencode-directory` header.
A tunneled browser request does not know the runner's `$GITHUB_WORKSPACE`, so
the UI can appear empty even while `opencode github run` is actively working.

The reliable architecture is:

```text
opencode github run
        |
        v
shared OpenCode session/database
        ^
        | x-opencode-directory: $PROJECT_DIR
        |
local header-injecting proxy
        ^
        |
trycloudflare tunnel -> browser Web UI
```

The workflow tunnels a minimal local nginx reverse proxy that injects
`x-opencode-directory: $PROJECT_DIR` before forwarding requests to
OpenCode Web, including WebSocket upgrade headers. The access comment points
to the encoded worktree/session route, so the browser opens the live run
directly. A loaded Web UI or healthy tunnel alone does not prove session
tracking; acceptance requires a screenshot while the run is active.

## Runner selection

The reusable workflow uses `ubuntu-latest` (AMD64) by default. Add the exact
`runner/arm64` label to an issue to select GitHub's `ubuntu-24.04-arm`
GitHub-hosted runner. The label is passed through `labels_json`, so this works
for both repository-local workflows and App-generated fallback wrappers.

## Repository settings

- Actions must be allowed to create and approve pull requests.
- For runner-side SSH access and verification, configure the
  `AGENTSWEB_SSH_PUBLIC_KEY` Actions secret with the public key matching the Mac
  private key described in [access.md](access.md). Without it, the workflow
  skips SSH setup and verification but still exposes the OpenCode Web session.
