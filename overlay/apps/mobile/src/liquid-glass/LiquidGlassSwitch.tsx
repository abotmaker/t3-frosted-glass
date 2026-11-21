import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export interface LiquidGlassSwitchProps {
  readonly value: boolean;
  readonly dark: boolean;
  readonly disabled?: boolean;
  readonly activeTrackColor?: string;
  readonly onValueChange?: (value: boolean) => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 30;
const THUMB_SIZE = 24;
const THUMB_INSET = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 320,
  mass: 0.8,
  reduceMotion: ReduceMotion.System,
};

/**
 * Translucent glass switch matching Jarvoice's `Widget.Jarvoice.GlassSwitch`:
 * frosted glass track with a luminous rim and crisp floating thumb.
 */
export function LiquidGlassSwitch({
  value,
  dark,
  disabled = false,
  activeTrackColor,
  onValueChange,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: LiquidGlassSwitchProps) {
  const progress = useDerivedValue(() => withSpring(value ? 1 : 0, SPRING_CONFIG));
  const colorProgress = useDerivedValue(() =>
    withTiming(value ? 1 : 0, { duration: 150, reduceMotion: ReduceMotion.System }),
  );

  const offTrack = dark ? "rgba(255, 255, 255, 0.09)" : "rgba(15, 23, 42, 0.10)";
  const onTrack = activeTrackColor ?? (dark ? "rgba(227, 232, 238, 0.42)" : "rgba(24, 27, 32, 0.34)");
  const offBorder = dark ? "rgba(255, 255, 255, 0.30)" : "rgba(15, 23, 42, 0.24)";
  const onBorder = dark ? "rgba(255, 255, 255, 0.56)" : "rgba(15, 23, 42, 0.34)";

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(colorProgress.value, [0, 1], [offTrack, onTrack]),
    borderColor: interpolateColor(colorProgress.value, [0, 1], [offBorder, onBorder]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
      testID={testID}
      style={[styles.hitArea, disabled && styles.disabled, style]}
    >
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.track, trackStyle]}>
          <Animated.View
            style={[
              styles.thumb,
              {
                backgroundColor: dark
                  ? value
                    ? "#F6F8FB"
                    : "#D2D6DC"
                  : "#FFFFFF",
              },
              thumbStyle,
            ]}
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    width: 52,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.42,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    borderWidth: 1,
    padding: THUMB_INSET - 1,
    justifyContent: "center",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    elevation: 2,
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
