import { ApiError, getJson } from '../api/client';
import { resolveApiBaseUrl } from '../api/config';
import type { Position } from '../types';

export type WalletChainId = 'bitcoin' | 'ethereum';

export type WalletAsset = {
  symbol: string;
  name: string;
  chain: WalletChainId;
  quantity: number;
  priceEur: number | null;
  valueEur: number | null;
  changePct: number | null;
  pending?: number;
};

export type WalletChain = {
  chain: WalletChainId;
  ok: boolean;
  error?: string;
  assets: WalletAsset[];
};

export type WalletsResponse = {
  updatedAt: string;
  source: 'tangem';
  wallets: WalletChain[];
};

export async function fetchWallets(signal?: AbortSignal): Promise<WalletsResponse> {
  const base = resolveApiBaseUrl();
  if (!base) throw new ApiError('API non configurata (EXPO_PUBLIC_API_URL)');
  return getJson<WalletsResponse>(`${base}/wallets`, {
    signal,
    headers: { 'X-Folio-Token': process.env.EXPO_PUBLIC_CHAT_TOKEN ?? '' },
  });
}

/** Quantities only — the app prices crypto via Kraken like every other coin. */
export function mapWalletsToPositions(res: WalletsResponse): Position[] {
  const positions: Position[] = [];
  for (const wallet of res.wallets) {
    if (!wallet.ok) continue;
    for (const asset of wallet.assets) {
      if (asset.quantity === 0) continue;
      positions.push({
        id: `tangem-${asset.symbol.toLowerCase()}`,
        sourceId: 'tangem',
        symbol: asset.symbol,
        name: asset.name,
        assetClass: 'crypto',
        instrument: 'coin',
        quantity: asset.quantity,
      });
    }
  }
  return positions;
}

const CHAIN_LABEL: Record<WalletChainId, string> = {
  bitcoin: 'Bitcoin non disponibile',
  ethereum: 'Ethereum non disponibile',
};

/** Compact caption for the holdings card. `null` when every chain is fine. */
export function walletStatusNote(res: WalletsResponse | undefined, isError: boolean): string | null {
  if (isError) return 'Tangem non raggiungibile · riprova';
  if (!res) return null;
  const failed = res.wallets.filter((w) => !w.ok);
  if (failed.length === 0) return null;
  return failed.map((w) => CHAIN_LABEL[w.chain] ?? w.chain).join(' · ');
}
