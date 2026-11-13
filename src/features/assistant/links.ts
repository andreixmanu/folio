import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

export function openExternalUrl(url: string): void {
  void WebBrowser.openBrowserAsync(url).catch(() => {
    void Linking.openURL(url);
  });
}
