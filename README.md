# PlayGround
Playground for browser game experiments

## Hermes agent support

This repo works with [Hermes Agent](https://hermes-agent.nousresearch.com/)
in addition to OpenCode / Worker Agents.

- Project context: `HERMES.md` (Hermes-native, highest priority) plus
  `Agents.md` process policy.
- Project skills: `.hermes/skills/*/SKILL.md` (Hermes-native) and
  `.agents/skills/*/SKILL.md` (cross-tool, shared). Both follow the
  agentskills.io `SKILL.md` format.

```sh
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes skills trust              # trust this checkout once
hermes skills list               # project skills show as [project]
hermes                           # interactive CLI
```

Try `/playground-guide` for repo workflow, `/load-sketchfab-threejs` for 3D
model verification, or stack them: `/playground-guide /load-sketchfab-threejs`.
