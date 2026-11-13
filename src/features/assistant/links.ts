import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function openExternalUrl(url: string): void {
  void WebBrowser.openBrowserAsync(url).catch(() => {
    void Linking.openURL(url);
  });
}
