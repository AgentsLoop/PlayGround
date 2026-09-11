# Superpowers → Codex install — live progress

**Goal:** Install `obra/superpowers` skills from `main` into the target Codex environment, available for immediate use.
**Bar (repo-documented):** Codex CLI via marketplace plugin (`/plugins` → search `superpowers` → Install), whose artifact is `.codex-plugin/plugin.json` (`name=superpowers`, `skills=./skills/`, `hooks={}`) + all 14 skills under `skills/*/SKILL.md` with valid `name`/`description` frontmatter. Codex scans `~/.codex/skills/**/SKILL.md` (legacy), `$HOME/.agents/skills`, `.codex/skills` (project), `.agents/skills` (repo chain).
**Constraint:** Leave all changes uncommitted; workflow commits/pushes.

## Upstream source (frozen)
- Cloned `https://github.com/obra/superpowers.git` branch `main` to `/tmp/superpowers`
- HEAD: `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0)
- Skills (14): brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills

## Rounds
| # | Piece | Builder result | Critic verdict | Biggest gap → fix |
|---|-------|----------------|----------------|-------------------|
| 1 | Source fidelity (14 skills + plugin.json match HEAD b36e082) | 14/14 SKILL.md + frontmatter, plugin name=superpowers v6.3.0 skills=./skills/ hooks={} | PASSES (fresh-context, byte-identical diff) | none |
| 2 | Target install layout (project `.codex/skills/` + `.codex-plugin/skills/` + user `~/.codex/skills` + `~/.agents/skills` + `.agents/skills`, no symlinks, exec bits kept) | 14/14 in all 5 roots, diff -rq exit 0, symlinks 0, task-brief 755 | PASSES (round 1) → gap found: `.codex-plugin/skills/` missing so `skills:./skills/` didn't resolve → fixed (round 2 builder+critic PASSES) | fixed: populated `.codex-plugin/skills/` 14/14 |
| 3 | Loadability (frontmatter valid, `plugin.json` skills path resolves, codex-tools ref present) | 14/14 loadable in all 5 roots (name 13–30 chars, desc 79–234 chars), codex-tools.md 5/5 | PASSES (independent re-run, 28/28) | none |
| 4 | Evidence bundle (this page + verify commands) | done below | PASSES | none |

## Evidence (updated live)
- Source: `/tmp/superpowers` main HEAD `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`, `git status` clean, remote `origin https://github.com/obra/superpowers.git`
- Installed roots (real files, `cp -a`, 0 symlinks each): project `.codex/skills/` 14, project `.codex-plugin/skills/` 14, project `.agents/skills/` 14 superpowers (+5 pre-existing untouched), user `~/.codex/skills/` 14, user `~/.agents/skills/` 14
- Full-tree `diff -rq /tmp/superpowers/skills <each-root>` exit 0; spot sha256 `brainstorming/SKILL.md` `74edf03e…` identical everywhere
- `plugin.json`: `name=superpowers version=6.3.0 skills=./skills/ hooks={}`, byte-identical to upstream, and `./skills/` resolves (14/14 SKILL.md present)
- Loadability: 14/14 PASS per root; `using-superpowers/references/codex-tools.md` present 5/5 (4762 bytes, multi_agent+spawn_agent refs)
- Exec bits: `task-brief` 755 source + all installs; 7 helper scripts executable everywhere
- Git: `git status --short` shows only untracked `?? .codex-plugin/ ?? .codex/ …`, HEAD unchanged `2f46f81`, 0 staged — left uncommitted for the workflow
