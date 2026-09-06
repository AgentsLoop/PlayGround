// Zero-dependency static server for the Strike Protocol FPS.
// Serves the repo root on 0.0.0.0:3000 so local browsers, the
// app-server tmux session, and the cloudflared tunnel origin
// (http://127.0.0.1:3000) all reach the same playable entrypoint.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
// Parse CLI flags too (the harness launches `node server.js --port 3000`);
// env vars remain the primary override.
const argv = process.argv.slice(2);
function flagValue(name) {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return undefined;
  const hit = argv[i];
  if (hit.includes('=')) return hit.split('=').slice(1).join('=');
  return argv[i + 1];
}
const PORT = Number(process.env.PORT || flagValue('--port') || 3000);
const HOST = process.env.HOST || flagValue('--host') || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    fs.stat(filePath, (err, st) => {
      if (!err && st.isDirectory()) filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err2, data) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('server error');
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    // Another instance (e.g. the tmux app-server session) already owns the
    // port. If it serves this same app, treat startup as satisfied and exit
    // cleanly so launchers (npm start / harness) don't report failure.
    const probe = http.get(
      { host: '127.0.0.1', port: PORT, path: '/index.html', timeout: 5000 },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; if (body.length > 8192) res.destroy(); });
        res.on('end', () => {
          const ours = res.statusCode === 200 && body.includes('Strike Protocol');
          if (ours) {
            console.log(`port ${PORT} already serving this app (likely tmux app-server); exiting 0`);
            process.exit(0);
          }
          console.error(`port ${PORT} in use by an unrelated server (HTTP ${res.statusCode}); exiting 1`);
          process.exit(1);
        });
      }
    );
    probe.on('error', (e) => {
      console.error(`port ${PORT} in use and not responding to probe: ${e.message}; exiting 1`);
      process.exit(1);
    });
    return;
  }
  console.error('server error:', err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`app serving ${ROOT} on http://${HOST}:${PORT}`);
});
