import { BlurTargetView } from 'expo-blur';
import { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';

/** Ref accepted by `BlurView.blurTarget` (SDK 58). */
export type BlurTargetRef = RefObject<ComponentRef<typeof View> | null>;

const BlurTargetContext = createContext<BlurTargetRef | undefined>(undefined);

/** Android `BlurView` samples this target; iOS and web ignore it. */
export function useBlurTarget(): BlurTargetRef | undefined {
  return useContext(BlurTargetContext);
}

/**
 * Wraps the screen tree so the floating chrome can blur the canvas behind it.
 * One target is enough for the tab bar and the mode button.
 */
export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const ref = useRef<ComponentRef<typeof View> | null>(null);
  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={{ flex: 1 }}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  );
}
