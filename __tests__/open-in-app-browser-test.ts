import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { openInAppBrowser, resetInAppBrowserGuard } from '@/lib/open-in-app-browser';

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  WebBrowserPresentationStyle: { FULL_SCREEN: 'fullScreen' },
}));

const originalOS = Platform.OS;

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: os });
}

describe('openInAppBrowser', () => {
  beforeEach(() => {
    resetInAppBrowserGuard();
    (WebBrowser.openBrowserAsync as jest.Mock).mockReset();
    (WebBrowser.openBrowserAsync as jest.Mock).mockResolvedValue({ type: 'opened' });
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(() => {
    setPlatform(originalOS);
    jest.restoreAllMocks();
  });

  test('passes Android Custom Tab options with createTask false', async () => {
    setPlatform('android');
    await openInAppBrowser('https://news.example/a', {
      background: '#111111',
      surface: '#222222',
      accent: '#333333',
    });

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://news.example/a', {
      createTask: false,
      showTitle: true,
      enableBarCollapsing: true,
      toolbarColor: '#111111',
      secondaryToolbarColor: '#222222',
      controlsColor: '#333333',
      enableDefaultShareMenuItem: true,
    });
  });

  test('uses the dark toolbar colors when none are passed', async () => {
    setPlatform('android');
    await openInAppBrowser('  http://news.example/plain  ');

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('http://news.example/plain', {
      createTask: false,
      showTitle: true,
      enableBarCollapsing: true,
      toolbarColor: '#08080B',
      secondaryToolbarColor: '#141419',
      controlsColor: '#7C6CFF',
      enableDefaultShareMenuItem: true,
    });
  });

  test('passes iOS presentation options and no Android task flags', async () => {
    setPlatform('ios');
    await openInAppBrowser('https://news.example/a');

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://news.example/a', {
      presentationStyle: 'fullScreen',
      controlsColor: '#7C6CFF',
      dismissButtonStyle: 'close',
      readerMode: false,
    });
  });

  test('opens only once for a rapid double call', async () => {
    setPlatform('android');
    let resolveOpen: (value: { type: string }) => void = () => {};
    (WebBrowser.openBrowserAsync as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );

    const first = openInAppBrowser('https://news.example/a');
    const second = openInAppBrowser('https://news.example/b');

    expect(second).toBe(first);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://news.example/a',
      expect.objectContaining({ createTask: false }),
    );

    resolveOpen({ type: 'opened' });
    await first;
  });

  test('ignores a second call within 600ms after the browser opens', async () => {
    setPlatform('android');
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(5_000);
    await openInAppBrowser('https://news.example/a');

    now.mockReturnValue(5_599);
    await openInAppBrowser('https://news.example/b');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);

    now.mockReturnValue(5_600);
    await openInAppBrowser('https://news.example/b');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(2);
  });

  test('ignores non-http URLs', async () => {
    setPlatform('android');
    await openInAppBrowser('javascript:alert(1)');
    await openInAppBrowser('folio://article');
    await openInAppBrowser('ftp://files.example/a');
    await openInAppBrowser('   ');

    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  test('falls back to Linking.openURL when the browser fails', async () => {
    setPlatform('android');
    (WebBrowser.openBrowserAsync as jest.Mock).mockRejectedValueOnce(new Error('no activity'));

    await expect(openInAppBrowser('https://news.example/a')).resolves.toBeUndefined();
    expect(Linking.openURL).toHaveBeenCalledWith('https://news.example/a');
  });
});
