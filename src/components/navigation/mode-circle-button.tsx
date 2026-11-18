import { useRef } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';

import { otherMode } from '@/components/navigation/mode-tabs';
import { Icon } from '@/components/ui/icon';
import { ChartPie, Wallet } from '@/components/ui/icons';
import { useModeStore, type AppMode } from '@/store/mode-store';
import { useModeTransitionStore, type ModeTransitionOrigin } from '@/store/mode-transition-store';
import { floatingSurface, modeAccents, useTheme } from '@/theme';

type HostMeasure = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

const SWITCH_LABEL: Record<AppMode, string> = {
  budget: 'Passa a Budget',
  invest: 'Passa a Investimenti',
};

/** Starts the shared transition. The overlay calls `switchMode` when it commits. */
export function requestModeSwitch(target: AppMode, origin: ModeTransitionOrigin): void {
  useModeTransitionStore.getState().start(origin, target);
}

/** Round control that switches to the mode that is not on screen. */
export function ModeCircleButton() {
  const theme = useTheme();
  const mode = useModeStore((s) => s.mode);
  const other = otherMode(mode);
  const ref = useRef<HostMeasure | null>(null);
  const { width, height } = useWindowDimensions();
  const accent = modeAccents[theme.scheme][other].accent;
  const size = theme.layout.tabBarHeight;

  // Window centre, measured after layout (measureInWindow is async on native and web).
  const centre = useRef<ModeTransitionOrigin | null>(null);
  const onLayout = () => {
    const node = ref.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x, y, w, h) => {
      if (w && h) centre.current = { x: x + w / 2, y: y + h / 2 };
    });
  };

  // One request per press: the cached centre, or the bottom-right corner where the button sits.
  const onPress = () => {
    requestModeSwitch(other, centre.current ?? { x: width, y: height });
  };

  return (
    <Pressable
      ref={ref as never}
      testID="mode-circle"
      accessibilityRole="button"
      accessibilityLabel={SWITCH_LABEL[other]}
      onPress={onPress}
      onLayout={onLayout}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        floatingSurface(theme.scheme),
      ]}>
      <Icon icon={other === 'budget' ? Wallet : ChartPie} size={22} color={accent} />
    </Pressable>
  );
}
