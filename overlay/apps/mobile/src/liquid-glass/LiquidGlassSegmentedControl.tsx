import { View, type StyleProp, type ViewStyle } from "react-native";

import { NativeLiquidGlassSegmentedView, toNativeColorOrDefault } from "./nativeViews";

export interface LiquidGlassSegmentedControlProps {
  readonly labels: readonly string[];
  readonly selectedIndex: number;
  readonly dark: boolean;
  readonly compact?: boolean;
  readonly selectedTextColor: string;
  readonly mutedTextColor: string;
  readonly onSelectIndex: (index: number) => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Native Jarvoice `GlassSegmentedGroup` wrapper:
 * tap or drag horizontally to slide the lifted, acceleration-squashing AGSL refraction pill.
 */
export function LiquidGlassSegmentedControl({
  labels,
  selectedIndex,
  dark,
  compact = false,
  selectedTextColor,
  mutedTextColor,
  onSelectIndex,
  style,
}: LiquidGlassSegmentedControlProps) {
  const height = compact ? 40 : 48;
  if (!NativeLiquidGlassSegmentedView) {
    return <View style={[{ height, width: "100%" }, style]} />;
  }

  return (
    <NativeLiquidGlassSegmentedView
      labels={labels}
      selectedIndex={selectedIndex}
      dark={dark}
      compact={compact}
      selectedTextColor={toNativeColorOrDefault(selectedTextColor, dark ? 0xffffffff : 0xff181b20)}
      mutedTextColor={toNativeColorOrDefault(mutedTextColor, dark ? 0xb3ffffff : 0x99181b20)}
      onSelectIndex={(event) => onSelectIndex(event.nativeEvent.index)}
      style={[{ height, width: "100%" }, style]}
    />
  );
}
