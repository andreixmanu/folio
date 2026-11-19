import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

const STORAGE_KEY = 'folio-query-cache-v1';
/** Last portfolio is still worth showing after a few days offline; quotes refetch on open. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PERSISTED_ROOTS = new Set(['wallets', 'ibkr', 'quotes', 'history']);

type Persisted = { savedAt: number; state: DehydratedState };

function isPersisted(value: unknown): value is Persisted {
  if (!value || typeof value !== 'object') return false;
  const row = value as { savedAt?: unknown; state?: unknown };
  return typeof row.savedAt === 'number' && !!row.state && typeof row.state === 'object';
}

/** Portfolio, quotes and history only. News stays out. A failure with no data stays out; last data is kept. */
export async function persistPortfolioCache(client: QueryClient): Promise<void> {
  const state = dehydrate(client, {
    shouldDehydrateQuery: (query) =>
      query.state.data !== undefined && PERSISTED_ROOTS.has(String(query.queryKey[0])),
  });
  const payload: Persisted = { savedAt: Date.now(), state };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Puts the last saved portfolio into the client. Corrupt or expired caches are ignored. */
export async function restorePortfolioCache(client: QueryClient): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersisted(parsed)) return;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return;
    hydrate(client, parsed.state);
  } catch {
    // Unreadable cache: the next fetch fills it.
  }
}

/** Debounced save, plus a flush when the app leaves the foreground. */
export function subscribePortfolioCache(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    void persistPortfolioCache(client);
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 500);
  };
  const unsubscribe = client.getQueryCache().subscribe(schedule);
  const appSub = AppState.addEventListener('change', (status) => {
    if (status !== 'active') flush();
  });
  return () => {
    unsubscribe();
    appSub.remove();
    if (timer) clearTimeout(timer);
  };
}
