// Learn more https://docs.expo.dev/guides/customizing-metro
const http = require('http');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The Cloudflare Worker (./worker) and the icon build tool (./scripts/asset-icons) have
// their own node_modules: keep Metro out of them.
const workerDir = path.resolve(__dirname, 'worker');
const iconToolDir = path.resolve(__dirname, 'scripts/asset-icons');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${escape(workerDir)}\\/.*$`),
  new RegExp(`^${escape(iconToolDir)}\\/.*$`),
];

/**
 * DEV ONLY: proxy `/api/*` to the local Worker (`wrangler dev`, port 8787) so the phone can
 * reach it through the same Expo tunnel/LAN address as Metro. Not used by production builds.
 */
const WORKER_URL = new URL(process.env.FOLIO_WORKER_URL || 'http://127.0.0.1:8787');
const previous = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const next = previous ? previous(middleware, server) : middleware;
  return (req, res, fallthrough) => {
    if (!req.url || !req.url.startsWith('/api/')) return next(req, res, fallthrough);
    const upstream = http.request(
      {
        hostname: WORKER_URL.hostname,
        port: WORKER_URL.port,
        path: req.url.slice(4),
        method: req.method,
        headers: { ...req.headers, host: WORKER_URL.host },
      },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      res.writeHead(502, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ error: `Worker non raggiungibile: ${err.message}` }));
    });
    req.pipe(upstream);
  };
};

module.exports = config;
