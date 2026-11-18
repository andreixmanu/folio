import { Platform, type ViewStyle } from 'react-native';

import type { ColorSchemeName } from './theme-provider';

/**
 * Translucent fill for the floating tab bar and the round mode button.
 * The mockup uses a backdrop blur; this app does not (no expo-blur).
 * Android uses a denser fill so the controls stay readable without blur.
 */
export function floatingSurface(scheme: ColorSchemeName): ViewStyle {
  const android = Platform.OS === 'android';
  if (scheme === 'dark') {
    return {
      backgroundColor: android ? 'rgba(18,18,24,0.88)' : 'rgba(18,18,24,0.58)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      boxShadow: '0px 12px 36px rgba(0,0,0,0.45)',
    };
  }
  return {
    backgroundColor: android ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.58)',
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
