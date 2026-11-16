import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { darkColors } from '@/theme/colors';

/** Toolbar colors. Omitted fields fall back to the dark theme. */
export type InAppBrowserColors = {
  background?: string;
  surface?: string;
  accent?: string;
};

/**
 * Android resolves `openBrowserAsync` as soon as the Custom Tab opens, so the
 * in-flight promise alone does not cover a second tap. Drop those for a short window.
 */
const REOPEN_GUARD_MS = 600;

let inFlight: Promise<void> | null = null;
let lastAttemptAt = 0;
let generation = 0;

/**
 * Opens an http(s) URL in a Custom Tab (Android) or SFSafariViewController (iOS).
 * Other schemes are ignored.
 *
 * Android passes `createTask: false`, which launches the tab from this activity
 * with no `FLAG_ACTIVITY_NEW_TASK`, so closing it returns here. Calls made while
 * a launch is still in flight return that same promise.
 *
 * `warmUpAsync` / `coolDownAsync` are not called. On Android they bind a Custom
 * Tabs service and throw when no browser package can be resolved.
 */
export function openInAppBrowser(url: string, colors?: InAppBrowserColors): Promise<void> {
  const target = url.trim();
  if (!isHttpUrl(target)) return Promise.resolve();
  if (inFlight) return inFlight;

  const now = Date.now();
  if (now - lastAttemptAt < REOPEN_GUARD_MS) return Promise.resolve();
  lastAttemptAt = now;

  const ticket = ++generation;
  const task = launch(target, colors).finally(() => {
    if (ticket === generation) inFlight = null;
  });
  inFlight = task;
  return task;
}

/** Clears the double-open guard so tests do not share the 600ms window. */
export function resetInAppBrowserGuard(): void {
  generation += 1;
  inFlight = null;
  lastAttemptAt = 0;
}

function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function launch(url: string, colors?: InAppBrowserColors): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, browserOptions(colors));
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      // No Custom Tab and no handler for the URL.
    }
  }
}

function browserOptions(colors?: InAppBrowserColors): WebBrowser.WebBrowserOpenOptions {
  const background = colors?.background ?? darkColors.background;
  const surface = colors?.surface ?? darkColors.surface;
  const accent = colors?.accent ?? darkColors.accent;

  if (Platform.OS === 'android') {
    return {
      createTask: false,
      showTitle: true,
      enableBarCollapsing: true,
      toolbarColor: background,
      secondaryToolbarColor: surface,
      controlsColor: accent,
      enableDefaultShareMenuItem: true,
    };
  }

  return {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    controlsColor: accent,
    dismissButtonStyle: 'close',
    readerMode: false,
  };
}
