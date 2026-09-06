// Zero-dependency static server for Canyon Courier.
// Serves the project root on PORT (default 3000).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  if (rel.includes("..")) {
    res.writeHead(400);
    res.end("bad request");
    return;
  }
  let file = path.join(__dirname, rel);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback to index.html
      file = path.join(__dirname, "index.html");
    }
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Canyon Courier running at http://localhost:${PORT}`);
});
