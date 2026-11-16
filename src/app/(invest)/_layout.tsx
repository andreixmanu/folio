import { Tabs } from 'expo-router/js-tabs';
import { ChartPie, Newspaper, Settings, Sparkles } from '@/components/ui/icons';

import { FloatingTabBar } from '@/components/navigation/floating-tab-bar';
import { TabIcon } from '@/components/navigation/tab-icon';
import { useSyncMode } from '@/store/use-sync-mode';
import { useTheme } from '@/theme';

export default function InvestLayout() {
  const theme = useTheme();
  useSyncMode('invest');
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Short cross-fade between tabs.
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 180 } },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}>
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portafoglio',
          tabBarButtonTestID: 'tab-portfolio',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={ChartPie} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'Notizie',
          tabBarButtonTestID: 'tab-news',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={Newspaper} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Assistente',
          tabBarButtonTestID: 'tab-assistant',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={Sparkles} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Impostazioni',
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={Settings} size={size} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
