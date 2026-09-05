// Robo Orb Run — zero-dependency static server.
// Serves this directory (the self-contained app) so the game works over
// http://127.0.0.1:3000/ and behind the public trycloudflare.com tunnel.
// No Host allow-list: any Host header (localhost, 127.0.0.1, *.trycloudflare.com) is served.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const argv = process.argv.slice(2);
const argVal = (name) => {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i === -1) return undefined;
  const a = argv[i];
  if (a.includes('=')) return a.split('=').slice(1).join('=');
  return argv[i + 1];
};
const PORT = Number(process.env.PORT || argVal('--port') || 3000);
const HOST = process.env.HOST || argVal('--host') || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.stat(file, (statErr, st) => {
    const target = !statErr && st.isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(target, (err, data) => {
      if (err) {
        // Single-page fallback: unknown paths serve index.html only for extensionless routes
        if (!path.extname(target)) {
          fs.readFile(path.join(ROOT, 'index.html'), (e2, d2) => {
            if (e2) { res.writeHead(404); res.end('not found'); return; }
            res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(d2);
          });
          return;
        }
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`robo-orb-run serving ${ROOT} on http://${HOST}:${PORT}/`);
});
