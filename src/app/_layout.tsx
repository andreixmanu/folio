import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { NavigationBar } from 'expo-navigation-bar';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  type ErrorBoundaryProps,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ModeTransitionOverlay } from '@/components/navigation/mode-transition-overlay';
import { createQueryClient, useAppStateFocus } from '@/services/query-client';
import { ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

/**
 * Catches a render error in the root tree and shows a screen.
 * A native crash (the Android blur bug) never reaches this.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      testID="app-error-boundary"
      style={{
        flex: 1,
        backgroundColor: '#08080B',
        paddingHorizontal: 28,
        paddingVertical: 48,
        justifyContent: 'center',
        gap: 12,
      }}>
      <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }}>Qualcosa è andato storto</Text>
      <Text style={{ color: '#9A9AA8', fontSize: 15, lineHeight: 22 }}>
        {error.message || 'Errore inatteso. Riprova.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Riprova"
        testID="app-error-retry"
        onPress={() => {
          void retry();
        }}
        style={{
          alignSelf: 'flex-start',
          marginTop: 8,
          paddingHorizontal: 18,
          height: 40,
          borderRadius: 999,
          backgroundColor: '#24242D',
          justifyContent: 'center',
        }}>
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>Riprova</Text>
      </Pressable>
    </View>
  );
}

function AppShell() {
  const theme = useTheme();
  const isDark = theme.scheme === 'dark';

  useEffect(() => {
    // Root view color: avoids white flashes behind screens and during transitions.
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  const base = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.accent,
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      {/* Edge-to-edge: transparent system bars, content draws underneath. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationBar style={isDark ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          // Cross-fade between Investimenti and Budget. No slide, no bounce.
          animation: 'fade',
          animationDuration: 220,
        }}>
        {/* Movement and category detail: cards pushed above the Budget tabs, with the native back gesture. */}
        <Stack.Screen name="transaction/[id]" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="category/[id]" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="categories" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
      </Stack>
      <ModeTransitionOverlay />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  useAppStateFocus();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
