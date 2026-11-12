export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** GET JSON with a timeout; non-2xx responses become `ApiError` with the server message. */
export async function getJson<T>(
  url: string,
  { signal, timeoutMs = DEFAULT_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(`Risposta non valida (${res.status})`, res.status);
    }
    if (!res.ok) {
      const msg = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
      throw new ApiError(msg, res.status);
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (controller.signal.aborted && !signal?.aborted) throw new ApiError('Timeout della richiesta');
    throw new ApiError(e instanceof Error ? e.message : 'Errore di rete');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
