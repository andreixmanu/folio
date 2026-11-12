import type { ViewStyle } from 'react-native';

/**
 * Cross-platform elevation using the `boxShadow` style prop (supported by
 * React Native's New Architecture on Android/iOS and by react-native-web).
 */
export function elevation(level: 0 | 1 | 2 | 3, shadowColor: string): ViewStyle {
  switch (level) {
    case 0:
      return {};
    case 1:
      return { boxShadow: `0px 4px 14px 0px ${shadowColor}` };
    case 2:
      return { boxShadow: `0px 10px 28px 0px ${shadowColor}` };
    case 3:
      return { boxShadow: `0px 18px 44px 0px ${shadowColor}` };
  }
}
