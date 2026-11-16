import { openInAppBrowser, type InAppBrowserColors } from '@/lib/open-in-app-browser';

export function openExternalUrl(url: string, colors?: InAppBrowserColors): void {
  void openInAppBrowser(url, colors);
}
