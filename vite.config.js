import { defineConfig } from "vite";

// NOTE: host + allowedHosts are set so the app stays reachable through a
// public tunnel (e.g. *.trycloudflare.com). Vite's default host 'localhost'
// can bind IPv6 ::1 only (refusing 127.0.0.1 tunnel dials), and Vite 6
// rejects unknown Host headers with 403 "Blocked request" — both break
// public-URL verification. 0.0.0.0 + allowedHosts fixes both.
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
});
