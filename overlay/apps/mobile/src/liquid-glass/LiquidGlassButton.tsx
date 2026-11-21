import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { LiquidGlassSurface } from "./LiquidGlassSurface";
import type { GlassLookName } from "./nativeViews";

export interface LiquidGlassButtonProps {
  readonly look?: GlassLookName;
  readonly dark: boolean;
  readonly cornerRadius?: number;
  readonly accentColor?: string | null;
  readonly accentOpacity?: number | null;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly accessibilityRole?: "button" | "tab" | "link";
  readonly accessibilityState?: {
    readonly disabled?: boolean;
    readonly busy?: boolean;
    readonly selected?: boolean;
  };
  readonly style?: StyleProp<ViewStyle>;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly hitSlop?: number;
  readonly children: ReactNode;
}

const PRESS_TIMING = { duration: 90, reduceMotion: ReduceMotion.System };
const RELEASE_TIMING = {
  duration: 260,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

/**
 * Interactive liquid glass button matching Jarvoice's `GlassButton.java`:
 * presses brighten the glass and spring to 96% scale, settling back without overshoot;
 * disabled buttons draw at 38% opacity.
 */
export function LiquidGlassButton({
  look = "tonal",
  dark,
  cornerRadius = 999,
  accentColor,
  accentOpacity,
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  accessibilityState,
  style,
  contentStyle,
  hitSlop,
  children,
}: LiquidGlassButtonProps) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={() => {
        if (disabled) return;
        setPressed(true);
        scale.set(withTiming(0.96, PRESS_TIMING));
      }}
      onPressOut={() => {
        setPressed(false);
        scale.set(withTiming(1, RELEASE_TIMING));
      }}
      style={[disabled && styles.disabled, style]}
    >
      <Animated.View style={animatedStyle}>
        <LiquidGlassSurface
          look={look}
          dark={dark}
          cornerRadius={cornerRadius}
          accentColor={accentColor}
          accentOpacity={accentOpacity}
          pressed={pressed}
          style={[styles.surface, contentStyle]}
        >
          {children}
        </LiquidGlassSurface>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.38,
  },
  surface: {
    alignItems: "center",
    justifyContent: "center",
  },
});
