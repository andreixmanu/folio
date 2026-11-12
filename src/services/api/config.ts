import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Base URL of the Folio API (Cloudflare Worker).
 * 1. `EXPO_PUBLIC_API_URL` from `.env` (see `.env.example`).
 * 2. In development, the Expo dev server's `/api` proxy (see `metro.config.js`), which works
 *    over LAN or the Expo tunnel without exposing the Worker separately.
 */
export function resolveApiBaseUrl(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `${/:\d+$/.test(hostUri) ? 'http' : 'https'}://${hostUri}/api`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/api`;
  return null;
}
