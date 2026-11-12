import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { useUiStore } from '@/store/ui-store';

import { darkColors, lightColors, type ColorTokens } from './colors';
import { elevation } from './elevation';
import { radii } from './radii';
import { layout, spacing } from './spacing';
import { fonts, typography } from './typography';

export type ColorSchemeName = 'dark' | 'light';

export type Theme = {
  scheme: ColorSchemeName;
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  fonts: typeof fonts;
  layout: typeof layout;
  elevation: (level: 0 | 1 | 2 | 3) => ReturnType<typeof elevation>;
};

export function createTheme(scheme: ColorSchemeName): Theme {
  const colors = scheme === 'dark' ? darkColors : lightColors;
  return {
    scheme,
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
  const mode = useUiStore((s) => s.themeMode);
  const system = useColorScheme();
  const scheme: ColorSchemeName =
    mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
  const theme = useMemo(() => createTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
