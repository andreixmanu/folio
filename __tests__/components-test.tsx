import { fireEvent, screen } from '@testing-library/react-native';

import { ChangeChip } from '@/components/ui/change-chip';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TIME_RANGES } from '@/services/types';

import { renderWithProviders } from '../test/test-utils';

describe('<ChangeChip />', () => {
  test('shows a positive change with amount and percent', async () => {
    await renderWithProviders(<ChangeChip percent={4.6} amount={7113.62} testID="chip" />);
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/^In rialzo \+7\.113,62\s€ · 4,60%$/);
  });

  test('masks the amount in privacy mode', async () => {
    await renderWithProviders(<ChangeChip percent={-1.2} amount={-50} masked testID="chip" />);
    expect(screen.getByText('•••• · 1,20%')).toBeTruthy();
    expect(screen.getByTestId('chip').props.accessibilityLabel).toMatch(/^In ribasso/);
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
