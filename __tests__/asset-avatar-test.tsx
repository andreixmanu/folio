import { act, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { AssetAvatar } from '@/components/ui/asset-avatar';
import { ASSET_ICONS } from '@/components/ui/asset-icons.generated';

import { FIXTURE_IBKR_POSITIONS } from '../test/fixtures/ibkr';
import { renderWithProviders } from '../test/test-utils';

// Render expo-image as a plain host view so the test can read its props.
jest.mock('expo-image', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: (props: object) => <View testID="logo-image" {...props} /> };
});

const originalOS = Platform.OS;

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: os });
}

describe('<AssetAvatar />', () => {
  afterEach(() => {
    setPlatform(originalOS);
  });

  test('every sample stock and known crypto symbol has a bundled logo', () => {
    const symbols = [...FIXTURE_IBKR_POSITIONS.map((p) => p.symbol), 'BTC', 'ETH', 'USDC', 'USDT'];
    const missing = [...new Set(symbols)].filter((s) => !ASSET_ICONS[s]);
    expect(missing).toEqual([]);
  });

  test('renders the bundled logo for a known symbol', async () => {
    await renderWithProviders(<AssetAvatar symbol="BTC" assetClass="crypto" />);
    expect(screen.getByTestId('asset-logo-BTC')).toBeTruthy();
    expect(screen.getByTestId('logo-image').props.source).toBe(ASSET_ICONS.BTC);
  });

  test('falls back to initials for an unknown coin', async () => {
    await renderWithProviders(<AssetAvatar symbol="FOO" assetClass="crypto" />);
    expect(screen.getByTestId('asset-initials-FOO')).toBeTruthy();
    expect(screen.getByText('FOO')).toBeTruthy();
  });

  test('hides the image from the accessibility tree on native', async () => {
    setPlatform('ios');
    await renderWithProviders(<AssetAvatar symbol="BTC" assetClass="crypto" />);
    expect(screen.getByTestId('logo-image').props.accessible).toBe(false);
    expect(screen.getByTestId('asset-logo-BTC').props.accessibilityLabel).toBe('BTC');
  });

  test('does not pass accessible={false} to the image on web', async () => {
    setPlatform('web');
    await renderWithProviders(<AssetAvatar symbol="ETH" assetClass="crypto" />);
    expect(screen.getByTestId('logo-image').props.accessible).toBeUndefined();
    expect(screen.getByTestId('asset-logo-ETH').props.accessibilityLabel).toBe('ETH');
  });

  test('tries the worker logo for an unknown stock, then initials on error', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test/api';
    await renderWithProviders(<AssetAvatar symbol="TSLA" assetClass="stocks" />);
    const img = screen.getByTestId('logo-image');
    expect(img.props.source).toEqual({ uri: 'https://api.example.test/api/logo/TSLA' });
    await act(async () => img.props.onError?.({ error: 'boom' }));
    expect(screen.getByTestId('asset-initials-TSLA')).toBeTruthy();
    delete process.env.EXPO_PUBLIC_API_URL;
  });
});
