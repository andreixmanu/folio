import Constants from 'expo-constants';
import {
  Activity,
  ArrowLeftRight,
  Contrast,
  EyeOff,
  Info,
  Landmark,
  Rss,
  Sparkles,
  Wallet,
  type LucideIcon,
} from '@/components/ui/icons';
import { Fragment } from 'react';
import { Switch, View } from 'react-native';

import {
  AppText,
  IconBadge,
  IslandCard,
  ListRow,
  RowSeparator,
  Screen,
  ScreenHeader,
  SectionTitle,
  SegmentedControl,
} from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useUiStore, type ThemeMode } from '@/store/ui-store';
import { useTheme } from '@/theme';

type FutureSource = {
  key: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  live?: boolean;
};

const FUTURE_SOURCES: FutureSource[] = [
  { key: 'ibkr', title: 'Interactive Brokers', subtitle: 'Flex Query · sola lettura', icon: Landmark, color: '#D81F26' },
  { key: 'wallets', title: 'Wallet crypto', subtitle: 'Tangem · BTC, ETH · sola lettura', icon: Wallet, color: '#B98CFF', live: true },
  { key: 'exchanges', title: 'Exchange', subtitle: 'API in sola lettura', icon: ArrowLeftRight, color: '#F0B90B' },
  { key: 'prices', title: 'Prezzi', subtitle: 'Crypto live da Kraken · azioni simulate', icon: Activity, color: '#2FD08A', live: true },
  { key: 'rss', title: 'Feed RSS', subtitle: 'Sole 24 Ore, ANSA, CNBC, FT, CoinDesk e altri', icon: Rss, color: '#FF8A4C', live: true },
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'Scuro' },
  { value: 'light', label: 'Chiaro' },
  { value: 'system', label: 'Sistema' },
];

function SoonBadge({ live = false }: { live?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: theme.radii.pill,
        backgroundColor: live ? theme.colors.positiveMuted : theme.colors.surfaceMuted,
      }}>
      <AppText variant="micro" color={live ? 'positive' : 'textSecondary'}>
        {live ? 'LIVE' : 'PRESTO'}
      </AppText>
    </View>
  );
}

export function SettingsScreen() {
  const theme = useTheme();
  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);
  const hideBalances = useUiStore((s) => s.hideBalances);
  const toggleHideBalances = useUiStore((s) => s.toggleHideBalances);

  return (
    <Screen testID="settings-screen">
      <ScreenHeader title="Impostazioni" />

      <SectionTitle title="Fonti dati" />
      <IslandCard index={0}>
        {FUTURE_SOURCES.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 ? <RowSeparator /> : null}
            <ListRow
              leading={<IconBadge icon={s.icon} color={s.color} />}
              title={s.title}
              subtitle={s.subtitle}
              accessory={<SoonBadge live={s.live} />}
              showChevron
              onPress={() => {}}
            />
          </Fragment>
        ))}
        <RowSeparator />
        <ListRow
          leading={<IconBadge icon={Sparkles} color={theme.colors.accent} />}
          title="Assistente"
          subtitle="xAI · Grok"
        />
      </IslandCard>

      <SectionTitle title="Preferenze" />
      <IslandCard index={1}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingVertical: 10,
          }}>
          <IconBadge icon={Contrast} color={theme.colors.accent} />
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            Tema
          </AppText>
          <View style={{ width: 196 }}>
            <SegmentedControl options={THEME_OPTIONS} value={themeMode} onChange={setThemeMode} size="sm" />
          </View>
        </View>
        <RowSeparator />
        <ListRow
          leading={<IconBadge icon={EyeOff} color={theme.colors.accent} />}
          title="Nascondi saldi"
          subtitle="Maschera importi e quantità"
          accessory={
            <Switch
              value={hideBalances}
              onValueChange={() => {
                haptics.selection();
                toggleHideBalances();
              }}
              trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.accent }}
              thumbColor="#FFFFFF"
            />
          }
        />
        <RowSeparator />
        <ListRow
          leading={<IconBadge icon={Info} color={theme.colors.textSecondary} />}
          title="Versione"
          subtitle="Azioni IBKR: dati di esempio"
          value={Constants.expoConfig?.version ?? '0.1.0'}
        />
      </IslandCard>
    </Screen>
  );
}
