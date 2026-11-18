import type { ViewStyle } from 'react-native';

import type { ColorSchemeName } from './theme-provider';

/**
 * Hairline and shadow for the floating tab bar and the round mode button.
 * The frosted fill itself lives in `FrostedFill` (expo-blur plus a tint fallback).
 */
export function floatingSurface(scheme: ColorSchemeName): ViewStyle {
  if (scheme === 'dark') {
    return {
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      boxShadow: '0px 12px 36px rgba(0,0,0,0.45)',
    };
  }
  return {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    boxShadow: '0px 10px 32px rgba(40,30,80,0.12)',
  };
}

/** Header icon button: a quiet translucent disc, not a solid island. */
export function iconButtonChrome(scheme: ColorSchemeName): { backgroundColor: string; borderColor: string } {
  if (scheme === 'dark') {
    return {
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderColor: 'rgba(255,255,255,0.10)',
    };
  }
  return {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderColor: 'rgba(255,255,255,0.80)',
  };
}
