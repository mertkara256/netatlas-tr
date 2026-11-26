import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 4173);
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const ROOT = path.resolve(import.meta.dirname, "..", "out");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pmtiles": "application/octet-stream",
  ".woff2": "font/woff2",
};

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || end >= size) {
    return null;
  }
  return { start, end };
}

function sendNotFound(res, method) {
  const notFoundPage = path.join(ROOT, "404.html");
  if (fs.existsSync(notFoundPage)) {
    const stat = fs.statSync(notFoundPage);
    res.writeHead(404, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });
    if (method === "HEAD") res.end();
    else fs.createReadStream(notFoundPage).pipe(res);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(method === "HEAD" ? undefined : "Not Found");
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  let pathname;
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  let relPath = pathname;
  if (BASE_PATH) {
    if (pathname === BASE_PATH) {
      res.writeHead(308, { Location: `${BASE_PATH}/` });
      res.end();
      return;
    }
    if (!pathname.startsWith(`${BASE_PATH}/`)) {
      sendNotFound(res, req.method);
      return;
    }
    relPath = pathname.slice(BASE_PATH.length);
  }

  const trimmed = relPath.replace(/^\/+/, "");
  let filePath = path.resolve(ROOT, trimmed);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stat = fs.statSync(filePath);
    }
  } catch {
    sendNotFound(res, req.method);
    return;
  }

  const headers = {
    "Content-Type": contentType(filePath),
    "Accept-Ranges": "bytes",
  };

  if (req.headers.range) {
    const range = parseRange(req.headers.range, stat.size);
    if (!range) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
      "Content-Length": range.end - range.start + 1,
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(filePath, range).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, "Content-Length": stat.size });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT}${BASE_PATH}/`);
});
