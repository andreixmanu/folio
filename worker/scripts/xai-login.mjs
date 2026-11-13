#!/usr/bin/env node
/**
 * Device-code login for the Folio Worker xAI client (public, no client secret).
 * stdout: the verification URL, then "OK". Status goes to stderr.
 * Tokens are never printed and never placed on the wrangler command line.
 * `--remote` writes KV for a future deploy; local dev uses `--local` (the default).
 *
 * Constants below must match `src/xai-config.ts` (asserted by vitest).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const XAI_SCOPE = 'openid profile email offline_access grok-cli:access api:access';
const XAI_DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code';
const XAI_TOKEN_URL = 'https://auth.x.ai/oauth2/token';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assertXaiUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Blocked non-xAI URL');
  }
  const host = parsed.hostname;
  if (parsed.protocol !== 'https:' || (host !== 'x.ai' && !host.endsWith('.x.ai'))) {
    throw new Error('Blocked non-xAI URL');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scrub(text, secret) {
  if (!text || !secret) return text || '';
  return String(text).split(secret).join('[redacted]');
}

async function postForm(url, params) {
  assertXaiUrl(url);
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

function verificationLine(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const complete = payload.verification_uri_complete;
  if (typeof complete === 'string' && complete) return complete;
  const uri = payload.verification_uri;
  const code = payload.user_code;
  if (typeof uri !== 'string' || !uri || typeof code !== 'string' || !code) return null;
  const join = uri.includes('?') ? '&' : '?';
  return `${uri}${join}user_code=${encodeURIComponent(code)}`;
}

function pollDecision(body) {
  if (!body || typeof body !== 'object') return { type: 'fatal', error: 'token_error' };
  const error = typeof body.error === 'string' ? body.error : '';
  if (error === 'authorization_pending') return { type: 'pending' };
  if (error === 'slow_down') return { type: 'slow_down' };
  if (error === 'expired_token' || error === 'access_denied') return { type: 'fatal', error };
  if (error) return { type: 'fatal', error };
  if (
    typeof body.refresh_token === 'string' &&
    body.refresh_token &&
    typeof body.access_token === 'string' &&
    body.access_token
  ) {
    return { type: 'ok', refreshToken: body.refresh_token };
  }
  return { type: 'fatal', error: 'no_refresh_token' };
}

function fatalMessage(error) {
  if (error === 'access_denied') return 'Access denied. Login was not approved.';
  if (error === 'expired_token') return 'Device code expired. Run npm run login:xai again.';
  if (error === 'no_refresh_token') return 'xAI did not return a refresh token.';
  return `xAI login failed (${error || 'unknown'}).`;
}

function wrangler(args, secret) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd: workerDir,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    error: result.error,
    stdout: scrub(result.stdout, secret),
    stderr: scrub(result.stderr, secret),
  };
}

/** Argv for `wrangler kv key put`. The secret stays in `file`; it is not an argument. */
export function kvPutArgs(file, remote) {
  const where = remote ? '--remote' : '--local';
  return ['kv', 'key', 'put', where, '--binding', 'XAI_AUTH', 'refresh_token', '--path', file];
}

function storeRefreshToken(refreshToken, remote) {
  const where = remote ? '--remote' : '--local';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-xai-'));
  const file = path.join(dir, 'value');
  let failed = false;
  let detail = '';
  try {
    fs.writeFileSync(file, refreshToken, { encoding: 'utf8', mode: 0o600 });
    const put = wrangler(kvPutArgs(file, remote), refreshToken);
    if (put.error || put.status !== 0) {
      failed = true;
      detail = `${put.stderr || ''}${put.stdout || ''}`.trim();
    } else {
      console.error(
        remote
          ? 'Stored refresh token in remote KV (future deploy only).'
          : 'Stored refresh token in local KV (.wrangler/).',
      );
      // Drop a stale access token from a previous login. A missing key is fine.
      wrangler(['kv', 'key', 'delete', where, '--binding', 'XAI_AUTH', 'access_token'], refreshToken);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (failed) {
    console.error(detail ? `Failed to store refresh token.\n${detail}` : 'Failed to store refresh token.');
    process.exit(1);
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.error('Usage: node scripts/xai-login.mjs [--remote]');
    console.error('Device-code login. Stores the xAI refresh token in KV (local by default).');
    console.error('--remote is for a future deploy only.');
    return;
  }

  const remote = process.argv.includes('--remote');
  console.error(remote ? 'Starting xAI device login (remote KV).' : 'Starting xAI device login (local KV).');

  const deviceRes = await postForm(XAI_DEVICE_CODE_URL, {
    client_id: XAI_CLIENT_ID,
    scope: XAI_SCOPE,
  });
  const device = deviceRes.json;
  const line = verificationLine(device);
  if (deviceRes.status >= 400 || !line || typeof device.device_code !== 'string' || !device.device_code) {
    const code = device && typeof device.error === 'string' ? device.error : String(deviceRes.status);
    console.error(`Device authorization failed (${code}).`);
    process.exit(1);
  }
  try {
    assertXaiUrl(line);
  } catch {
    console.error('Refusing to print a non-xAI verification URL.');
    process.exit(1);
  }
  console.log(line);

  const intervalSec =
    typeof device.interval === 'number' && Number.isFinite(device.interval) && device.interval > 0
      ? device.interval
      : 5;
  let intervalMs = intervalSec * 1000;
  const expiresIn =
    typeof device.expires_in === 'number' && Number.isFinite(device.expires_in) && device.expires_in > 0
      ? device.expires_in
      : 900;
  const deadline = Date.now() + expiresIn * 1000;
  console.error(`Waiting for authorization (polling every ${Math.round(intervalMs / 1000)}s).`);

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    if (Date.now() >= deadline) break;
    const tokenRes = await postForm(XAI_TOKEN_URL, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: device.device_code,
      client_id: XAI_CLIENT_ID,
    });
    const decision = pollDecision(tokenRes.json);
    if (decision.type === 'ok') {
      storeRefreshToken(decision.refreshToken, remote);
      console.log('OK');
      return;
    }
    if (decision.type === 'pending') {
      console.error('Authorization pending.');
      continue;
    }
    if (decision.type === 'slow_down') {
      intervalMs += 5000;
      console.error(`Slowing down. Next poll in ${Math.round(intervalMs / 1000)}s.`);
      continue;
    }
    console.error(fatalMessage(decision.error));
    process.exit(1);
  }
  console.error('Device code expired. Run npm run login:xai again.');
  process.exit(1);
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : 'Login failed';
    console.error(message);
    process.exit(1);
  });
}
