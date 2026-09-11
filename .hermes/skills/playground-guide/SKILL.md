---
name: playground-guide
description: Build and verify browser game experiments in this PlayGround repo. Use for new games, interactive demos, landing pages, or dashboards here — entrypoint layout, HTTP verification, process lifecycle, and which project skills to stack.
version: 1.0.0
metadata:
  hermes:
    tags: [playground, browser-games, verification, threejs]
    category: development
---

# PlayGround guide

Build small browser experiments that run from `./index.html` or
`./dist/index.html` and verify them in a real browser over HTTP.

## When to Use

Use this skill when the task is to create, extend, or fix anything in this
PlayGround checkout: arcade games, puzzles, physics demos, dashboards, tools,
landing pages, or prototypes. Stack with domain skills when needed, for
example `/playground-guide /load-sketchfab-threejs` for 3D model work or
`/playground-guide /image-search` for配图素材.

## Procedure

1. Read `HERMES.md` at the repo root and `Agents.md` process policy. Hermes
   loads `HERMES.md` instead of `AGENTS.md` here, and `HERMES.md` already
   repeats the lifecycle rules — follow them.
2. Confirm the entrypoint: root `index.html` for static apps, or
   `dist/index.html` for built apps. Create a minimal page first when none
   exists, then iterate.
3. Serve over HTTP for every visual check (never `file://`):
   `python3 -m http.server 8000`, then open `http://localhost:8000/`.
4. Run long-lived servers and watchers in a persistent session such as tmux.
   Do not background them in bounded commands without explicit detachment and
   cleanup. After a timeout, inspect the process and endpoint before retrying
   or claiming failure.
5. Keep games responsive with explicit win/lose states and restart where
   applicable. Preserve attribution sidecars for third-party assets.
6. Run `git diff --check` before finishing. Leave changes uncommitted unless
   the user explicitly asks to commit; the delivery workflow creates the
   result branch and immutable commit.

## Pitfalls

- `file://` hides CORS, module, texture, and fetch failures that appear over
  HTTP — always verify over HTTP.
- A downloader HTTP 200 or loader callback is not completion; compare the
  reference (Sketchfab thumbnail, design brief) against the real engine render
  side by side.
- Do not commit `node_modules`, downloaded models, credentials, cookies,
  `.hermes/cache/`, sessions, logs, or runner state.
- Project skills (`.hermes/skills/`, `.agents/skills/`) require one-time
  `hermes skills trust` inside the checkout; untrusted skills stay unloaded
  with a banner notice.

## Verification

- `index.html` or `dist/index.html` exists at the project home.
- App loads over HTTP with no console errors and renders the expected scene.
- `git diff --check` is clean and `git status --short` shows only intended
  project files.
- `hermes skills list` shows project skills with `[project]` after trust.
