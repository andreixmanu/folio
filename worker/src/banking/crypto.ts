/** WebCrypto helpers (Workers and Node 20+). No secrets are logged. */

const enc = new TextEncoder();

export function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`). Accepts literal `\n` from a secret. */
export function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('Empty private key');
  const bytes = base64UrlDecode(body.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importRsaKey(pem: string): Promise<CryptoKey> {
  let key = keyCache.get(pem);
  if (!key) {
    key = crypto.subtle.importKey('pkcs8', pemToDer(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'sign',
    ]);
    keyCache.set(pem, key);
    key.catch(() => keyCache.delete(pem));
  }
  return key;
}

/** RS256 JWT. Enable Banking accepts at most 24 h TTL; we use 1 h. */
export async function signRs256Jwt(
  pem: string,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const head = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'RS256', ...header }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const input = `${head}.${body}`;
  const key = await importRsaKey(pem);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(input));
  return `${input}.${base64UrlEncode(sig)}`;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function hmacSign(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message));
  return base64UrlEncode(sig);
}

export async function hmacVerify(secret: string, message: string, signature: string): Promise<boolean> {
  let sig: Uint8Array;
  try {
    sig = base64UrlDecode(signature);
  } catch {
    return false;
  }
  return crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(message));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
