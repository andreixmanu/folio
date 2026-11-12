import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import NewsScreen from '@/app/(tabs)/news';
import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

describe('News screen', () => {
  beforeEach(() => useUiStore.setState({ newsFilter: 'all' }));

  test('lists mock articles and filters by Crypto', async () => {
    await renderWithProviders(<NewsScreen />);
    expect(await screen.findByText(/European shares edge higher/)).toBeTruthy();
    expect(screen.getByText(/Bitcoin holds above key support/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('news-filter-crypto'));
    await waitFor(() => expect(screen.queryByText(/European shares edge higher/)).toBeNull());
    expect(screen.getByText(/Solana network upgrade/)).toBeTruthy();
    expect(screen.getByTestId('news-filter-crypto').props.accessibilityState).toEqual({ selected: true });
  });
});
