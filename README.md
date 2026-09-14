# PlayGround
Playground for browser game experiments

## House (pascalorg/editor)

Single-storey 10 × 7 m family house built with the Pascal 3D architectural
editor (`https://github.com/pascalorg/editor`) via its local MCP CLI.

- Scene: `public/house.scene.json` (37 nodes, `validate_scene` clean,
  `verify_scene` clean)
- Provenance: `public/pascal-meta.json` (local project `4a23eb99f0de`,
  scene `39c5c315acfd`)
- Viewer: Vite + React + `@pascal-app/core` / `@pascal-app/viewer` /
  `@pascal-app/nodes` (`src/App.tsx` loads the scene with
  `useScene.getState().setScene` and renders `<Viewer />`)

Run:

```bash
npm install
npm run dev     # http://localhost:3000 (binds 0.0.0.0)
npm run build
```

Public verification tunnel (browser checks reach the app through
`*.trycloudflare.com`; `vite.config.ts` allows those hosts):

```bash
npm run dev:tunnel   # cloudflared quick tunnel -> http://127.0.0.1:3000
```
