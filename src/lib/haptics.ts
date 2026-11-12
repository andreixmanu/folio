import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'android' || Platform.OS === 'ios';

/** Haptic helpers. All of them are silent no-ops on web. */
export const haptics = {
  /** Light tick for selection changes (tabs, segmented controls, chips). */
  selection() {
    if (enabled) void Haptics.selectionAsync().catch(() => {});
  },
  /** Soft impact for presses on cards and rows. */
  light() {
    if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium() {
    if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success() {
    if (enabled)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
