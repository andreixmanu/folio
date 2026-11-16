import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { useModeStore, type AppMode } from '@/store/mode-store';
import { useUiStore } from '@/store/ui-store';

import { darkColors, lightColors, modeAccents, type ColorTokens } from './colors';
import { elevation } from './elevation';
import { radii } from './radii';
import { layout, spacing } from './spacing';
import { fonts, typography } from './typography';

export type ColorSchemeName = 'dark' | 'light';

export type Theme = {
  scheme: ColorSchemeName;
  /** Investimenti or Budget. Drives the accent tokens. */
  mode: AppMode;
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  fonts: typeof fonts;
  layout: typeof layout;
  elevation: (level: 0 | 1 | 2 | 3) => ReturnType<typeof elevation>;
};

export function createTheme(scheme: ColorSchemeName, mode: AppMode = 'invest'): Theme {
  const base = scheme === 'dark' ? darkColors : lightColors;
  const accent = modeAccents[scheme][mode];
  const colors: ColorTokens = {
    ...base,
    accent: accent.accent,
    accentMuted: accent.accentMuted,
    onAccent: accent.onAccent,
  };
  return {
    scheme,
    mode,
    colors,
    spacing,
    radii,
    typography,
    fonts,
    layout,
    elevation: (level) => elevation(level, colors.shadow),
  };
}

const ThemeContext = createContext<Theme>(createTheme('dark'));

export function ThemeProvider({ children }: PropsWithChildren) {
  const themeMode = useUiStore((s) => s.themeMode);
  const appMode = useModeStore((s) => s.mode);
  const system = useColorScheme();
  const scheme: ColorSchemeName =
    themeMode === 'system' ? (system === 'light' ? 'light' : 'dark') : themeMode;
  const theme = useMemo(() => createTheme(scheme, appMode), [scheme, appMode]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
