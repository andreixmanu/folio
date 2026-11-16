import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useModeStore } from '@/store/mode-store';
import { useUiStore } from '@/store/ui-store';
import { useTheme } from '@/theme';

import { renderWithProviders } from '../test/test-utils';

function AccentProbe() {
  const theme = useTheme();
  return (
    <>
      <Text testID="mode">{theme.mode}</Text>
      <Text testID="accent">{theme.colors.accent}</Text>
      <Text testID="accent-muted">{theme.colors.accentMuted}</Text>
      <Text testID="on-accent">{theme.colors.onAccent}</Text>
    </>
  );
}

function text(testID: string): string {
  const children = screen.getByTestId(testID).props.children;
  return typeof children === 'string' ? children : String(children);
}

describe('ThemeProvider mode accent', () => {
  beforeEach(() => {
    useUiStore.setState({ themeMode: 'dark' });
    useModeStore.setState({ mode: 'invest' });
  });

  test('keeps the violet accent for Investimenti', async () => {
    await renderWithProviders(<AccentProbe />);
    expect(text('mode')).toBe('invest');
    expect(text('accent')).toBe('#7C6CFF');
    expect(text('accent-muted')).toBe('rgba(124,108,255,0.18)');
    expect(text('on-accent')).toBe('#FFFFFF');
  });

  test('keeps the light violet accent for Investimenti', async () => {
    useUiStore.setState({ themeMode: 'light' });
    await renderWithProviders(<AccentProbe />);
    expect(text('accent')).toBe('#5B4BFF');
    expect(text('accent-muted')).toBe('rgba(91,75,255,0.12)');
    expect(text('on-accent')).toBe('#FFFFFF');
  });

  test('uses the teal accent when the mode is budget', async () => {
    useModeStore.setState({ mode: 'budget' });
    await renderWithProviders(<AccentProbe />);
    expect(text('mode')).toBe('budget');
    expect(text('accent')).toBe('#2EC4A6');
    expect(text('accent-muted')).toBe('rgba(46,196,166,0.16)');
    expect(text('on-accent')).toBe('#041510');
  });

  test('uses the light teal accent when the mode is budget', async () => {
    useUiStore.setState({ themeMode: 'light' });
    useModeStore.setState({ mode: 'budget' });
    await renderWithProviders(<AccentProbe />);
    expect(text('accent')).toBe('#0E9F84');
    expect(text('accent-muted')).toBe('rgba(14,159,132,0.12)');
    expect(text('on-accent')).toBe('#041510');
  });
});
