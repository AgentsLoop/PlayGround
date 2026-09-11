# PlayGround — Hermes project context

This repo is a playground for browser game experiments. Keep changes small,
runnable in a real browser, and verifiable over HTTP (never `file://`).

Hermes loads this file first: `.hermes.md` / `HERMES.md` outranks `AGENTS.md`,
`CLAUDE.md`, and `.cursorrules`. The rules below therefore repeat the
committed `Agents.md` process policy so Hermes sessions do not lose it.

## Project instructions

- Browser entrypoint is `./index.html` or `./dist/index.html` at the project
  home (`PROJECT_DIR`, defaults to repo root). Static root `index.html` apps
  run directly; built apps publish `dist/index.html`.
- Serve viewers and games over HTTP for verification (for example
  `python3 -m http.server`). Do not rely on `file://`.
- Keep generated games responsive (desktop + mobile), with explicit win/lose
  states and restart where applicable.
- Run available checks before finishing: `git diff --check` and any
  project-local tests. Do not commit unless the user explicitly asks; the
  delivery workflow creates the result branch and immutable commit.

## Process lifecycle

- Run long-lived servers and watchers in a persistent session such as tmux.
- Do not background them in bounded commands without explicit detachment and cleanup.
- After a timeout, inspect the process and endpoint before retrying or claiming failure.

## Skills

Hermes discovers project skills from both locations at the git root:

```text
.hermes/skills/*/SKILL.md
.agents/skills/*/SKILL.md
```

They follow the agentskills.io `SKILL.md` format (`name`, `description`).
Project skills are highest precedence (`project → local → external_dirs`) and
are tagged `[project]` in the skill index. They are trust-gated: run
`hermes skills trust` once inside this checkout, then `hermes skills list`
should show the vendored skills.

Bundled cross-tool skills in `.agents/skills/`:

- `gauntlet-loop` — paste-ready quality-bar loop prompt.
- `image-search` — DuckDuckGo image素材 search with filters.
- `load-sketchfab-threejs` — Sketchfab GLB download, normalization, and
  Three.js / PlayCanvas browser A/B verification.
- `mcp-duckgo` — web search and fetch via DuckDuckGo MCP server.
- `opencode-zen-completions` — OpenCode Zen chat-completions API usage.

Hermes-native skills in `.hermes/skills/`:

- `playground-guide` — how to build and verify a browser game in this repo.

Invoke with `/<skill-name>` (for example `/playground-guide`,
`/load-sketchfab-threejs`). Stack up to 5 leading `/skill` tokens in one
message when a task needs several skills together.

## Hermes quickstart in this repo

```sh
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes skills trust              # trust this checkout once
hermes skills list               # project skills appear with [project]
hermes                           # interactive CLI
hermes chat --toolsets skills -q "What skills do you have?"
```

Hermes supports OpenCode Zen / OpenCode Go as OpenAI-compatible providers
(`opencode-zen`, `opencode-go`, keys `OPENCODE_ZEN_API_KEY` /
`OPENCODE_GO_API_KEY` in `~/.hermes/.env`). Treat the live
`https://opencode.ai/zen/v1/models` listing as authoritative when selecting a
model; model IDs change over time.

## Safety

- Never print secrets, tokens, or private keys while inspecting runners.
- Do not commit `node_modules`, downloaded models, credentials, cookies, or
  session material.
- Project skill directories are repo-owned and read-only to autonomous skill
  maintenance; new agent-created skills belong in `~/.hermes/skills/`.
