import { Tabs } from 'expo-router/js-tabs';
import { ChartColumn, LayoutDashboard, PiggyBank, ReceiptText, Settings } from '@/components/ui/icons';

import { FloatingTabBar } from '@/components/navigation/floating-tab-bar';
import { TabIcon } from '@/components/navigation/tab-icon';
import { useSyncMode } from '@/store/use-sync-mode';
import { useTheme } from '@/theme';

export default function BudgetLayout() {
  const theme = useTheme();
  useSyncMode('budget');
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
        name="overview"
        options={{
          title: 'Panoramica',
          tabBarButtonTestID: 'tab-overview',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={LayoutDashboard} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Movimenti',
          tabBarButtonTestID: 'tab-transactions',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={ReceiptText} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analisi',
          tabBarButtonTestID: 'tab-analytics',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={ChartColumn} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budget',
          tabBarButtonTestID: 'tab-budgets',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={PiggyBank} size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="budget-settings"
        options={{
          title: 'Impostazioni',
          tabBarButtonTestID: 'tab-budget-settings',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon icon={Settings} size={size} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
