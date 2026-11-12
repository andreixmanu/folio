import Constants from 'expo-constants';
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
  icon: React.ComponentProps<typeof IconBadge>['name'];
  color: string;
};

const FUTURE_SOURCES: FutureSource[] = [
  { key: 'ibkr', title: 'Interactive Brokers', subtitle: 'Flex Query · sola lettura', icon: 'business', color: '#D81F26' },
  { key: 'wallets', title: 'Wallet crypto', subtitle: 'Indirizzi on-chain (BTC, ETH, SOL)', icon: 'wallet', color: '#B98CFF' },
  { key: 'exchanges', title: 'Exchange', subtitle: 'API in sola lettura', icon: 'swap-horizontal', color: '#F0B90B' },
  { key: 'prices', title: 'Prezzi', subtitle: 'CoinGecko e quotazioni di mercato', icon: 'pulse', color: '#2FD08A' },
  { key: 'rss', title: 'Feed RSS', subtitle: 'Testate finanziarie e crypto', icon: 'logo-rss', color: '#FF8A4C' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'Scuro' },
  { value: 'light', label: 'Chiaro' },
  { value: 'system', label: 'Sistema' },
];

function SoonBadge() {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.surfaceMuted,
      }}>
      <AppText variant="micro" color="textSecondary">
        PRESTO
      </AppText>
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);
  const hideBalances = useUiStore((s) => s.hideBalances);
  const toggleHideBalances = useUiStore((s) => s.toggleHideBalances);

  return (
    <Screen testID="settings-screen">
      <ScreenHeader eyebrow="Folio" title="Impostazioni" />

      <SectionTitle title="Fonti dati" />
      <IslandCard index={0}>
        {FUTURE_SOURCES.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 ? <RowSeparator /> : null}
            <ListRow
              leading={<IconBadge name={s.icon} color={s.color} />}
              title={s.title}
              subtitle={s.subtitle}
              accessory={<SoonBadge />}
              showChevron
              onPress={() => {}}
            />
          </Fragment>
        ))}
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
          <IconBadge name="contrast" color={theme.colors.accent} />
          <AppText variant="bodyStrong" style={{ flex: 1 }}>
            Tema
          </AppText>
          <View style={{ width: 196 }}>
            <SegmentedControl options={THEME_OPTIONS} value={themeMode} onChange={setThemeMode} size="sm" />
          </View>
        </View>
        <RowSeparator />
        <ListRow
          leading={<IconBadge name="eye-off" color={theme.colors.accent} />}
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
          leading={<IconBadge name="information-circle" color={theme.colors.textSecondary} />}
          title="Versione"
          subtitle="Fase 1 · dati di esempio"
          value={Constants.expoConfig?.version ?? '0.1.0'}
        />
      </IslandCard>
    </Screen>
  );
}
