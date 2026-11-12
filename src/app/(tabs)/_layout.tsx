import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { FloatingTabBar } from '@/components/navigation/floating-tab-bar';
import { useTheme } from '@/theme';

function TabIcon({
  name,
  size,
  color,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  size: number;
  color: ColorValue;
}) {
  return <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />;
}

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Smooth cross-fade + slight shift between tabs.
        animation: 'shift',
        sceneStyle: { backgroundColor: theme.colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Portafoglio',
          tabBarButtonTestID: 'tab-portfolio',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name={focused ? 'pie-chart' : 'pie-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'Notizie',
          tabBarButtonTestID: 'tab-news',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name={focused ? 'newspaper' : 'newspaper-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Impostazioni',
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
