import { fireEvent, screen } from '@testing-library/react-native';
import { ChartPie, Eye } from '@/components/ui/icons';

import { TabIcon } from '@/components/navigation/tab-icon';
import { ChangeChip } from '@/components/ui/change-chip';
import { HeroBalance } from '@/components/ui/hero-balance';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/screen-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TIME_RANGES } from '@/services/types';
import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

const normalize = (s: string) => s.replace(/\u00a0|\u202f/g, ' ');

describe('<ChangeChip />', () => {
  test('shows a positive change with amount and percent', async () => {
    await renderWithProviders(<ChangeChip percent={4.6} amount={7113.62} testID="chip" />);
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/^In rialzo \+7\.113,62\s€ · 4,6%$/);
  });

  test('masks the amount in privacy mode', async () => {
    await renderWithProviders(<ChangeChip percent={-1.2} amount={-50} masked testID="chip" />);
    expect(screen.getByText('•••• · 1,2%')).toBeTruthy();
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/^In ribasso/);
  });

  test('spend tone treats an increase as negative', async () => {
    await renderWithProviders(<ChangeChip tone="spend" percent={12} amount={30} testID="chip" />);
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/^Spesa in aumento \+30,00\s€ · 12%$/);
  });
});

describe('<HeroBalance />', () => {
  test('renders a large integer with smaller decimals and the currency next to it', async () => {
    await renderWithProviders(<HeroBalance value={319.74} from={319.74} testID="total" />);
    expect(normalize(String(screen.getByTestId('total').props.accessibilityLabel))).toBe('319,74 €');
    expect(screen.getByText('319')).toBeTruthy();
    expect(screen.getByText(',74')).toBeTruthy();
    expect(screen.getByText('€')).toBeTruthy();
  });

  test('masks the amount in privacy mode', async () => {
    await renderWithProviders(<HeroBalance value={319.74} masked testID="total" />);
    expect(screen.getByTestId('total').props.accessibilityLabel).toBe('••••');
    expect(screen.getByText('••••')).toBeTruthy();
  });
});

describe('ui store', () => {
  test('defaults the portfolio chart range to 1W', () => {
    expect(useUiStore.getInitialState().timeRange).toBe('1W');
  });
});

describe('<SegmentedControl />', () => {
  test('marks the selected range and reports changes', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <SegmentedControl
        options={TIME_RANGES.map((r) => ({ value: r, label: r }))}
        value="1M"
        onChange={onChange}
        testID="range"
      />,
    );
    expect(screen.getByTestId('range-1M').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId('range-1Y'));
    expect(onChange).toHaveBeenCalledWith('1Y');
    // Pressing the already-selected option is a no-op.
    await fireEvent.press(screen.getByTestId('range-1M'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('<Icon />', () => {
  test('renders a Lucide icon', async () => {
    await renderWithProviders(
      <Icon icon={Eye} size={18} color="#FFFFFF" accessibilityLabel="Mostra" testID="icon-eye" />,
    );
    expect(screen.getByTestId('icon-eye')).toBeTruthy();
    expect(screen.getByLabelText('Mostra')).toBeTruthy();
  });
});

describe('<IconButton />', () => {
  test('renders a Lucide icon action', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <IconButton icon={Eye} accessibilityLabel="Nascondi saldi" onPress={onPress} />,
    );
    const button = screen.getByLabelText('Nascondi saldi');
    expect(button).toBeTruthy();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('<TabIcon />', () => {
  test('uses a heavier Lucide stroke when focused', async () => {
    await renderWithProviders(
      <TabIcon icon={ChartPie} size={22} color="#FFFFFF" focused testID="tab-icon" />,
    );
    expect(screen.getByTestId('tab-icon')).toBeTruthy();
    expect(screen.getByTestId('tab-icon').props.strokeWidth).toBe(2.25);
  });

  test('uses the default Lucide stroke when inactive', async () => {
    await renderWithProviders(
      <TabIcon icon={ChartPie} size={22} color="#9A9AA8" focused={false} testID="tab-icon" />,
    );
    expect(screen.getByTestId('tab-icon').props.strokeWidth).toBe(1.75);
  });
});

describe('<LiveIndicator />', () => {
  const { LiveIndicator } = jest.requireActual('@/components/ui/live-indicator') as typeof import('@/components/ui/live-indicator');
  const t = new Date(2026, 10, 12, 17, 52, 30).getTime();

  test.each([
    ['live', /^Live · 17:52:30, prezzi Kraken$/],
    ['stale', /^Offline · 17:52:30$/],
    ['error', /^Prezzi non disponibili$/],
  ] as const)('%s', async (status, label) => {
    await renderWithProviders(<LiveIndicator status={status} updatedAt={t} />);
    expect(screen.getByTestId('live-indicator').props.accessibilityLabel).toMatch(label);
  });
});
