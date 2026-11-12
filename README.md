# Folio

Personal investment portfolio app (Android + web), built with Expo SDK 58, Expo Router and TypeScript (strict).

**Phase 1:** UI foundations with typed mock data. Later phases connect IBKR (Flex Query), crypto wallets/exchanges and RSS feeds through a Cloudflare Workers backend.

## Scripts

```bash
npm start            # expo start (Expo Go)
npm run web          # web dev server
npm test             # jest-expo + React Native Testing Library
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
npm run doctor       # expo-doctor
npx expo export --platform web
```

## Structure

```
src/
  app/                 Expo Router routes: (tabs)/index (Portfolio), news, settings
  theme/               tokens: colors, spacing, radii, typography, motion, elevation + ThemeProvider
  components/ui/       IslandCard, ListRow, ChangeChip, SegmentedControl, FilterChips, AnimatedNumber, Screen…
  components/navigation/ FloatingTabBar (pill, detached, animated indicator)
  components/charts/   ValueChart (area line), AllocationDonut
  features/            screen sections (portfolio hero, allocation, sources, holdings, news cards)
  services/            typed domain + data sources (mock now) + React Query hooks
  store/               Zustand UI state (range, filters, privacy mode, theme)
  lib/                 formatting, haptics (no-op on web), PRNG
```

Swap data sources in `src/services/sources.ts`; hooks and screens stay unchanged.
