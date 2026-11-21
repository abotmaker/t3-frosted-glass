import * as Haptics from "expo-haptics";
import { useState } from "react";
import { View } from "react-native";

import { LiquidGlassSlider } from "../../liquid-glass/LiquidGlassSlider";
import { SymbolView } from "./AppSymbol";
import { AppText as Text } from "./AppText";
import type { SliderRowProps } from "./SliderRow.types";
import { useControlTheme } from "./useControlTheme";

export function SliderRow(props: SliderRowProps) {
  const { colorScheme } = useControlTheme();
  const dark = colorScheme === "dark";
  const [liveValue, setLiveValue] = useState<number | null>(null);

  const snap = (value: number) =>
    Math.min(
      props.max,
      Math.max(props.min, props.min + Math.round((value - props.min) / props.step) * props.step),
    );

  const commit = (value: number) => {
    setLiveValue(null);
    if (props.disabled) return;
    const next = snap(value);
    if (next === props.value) return;
    void Haptics.selectionAsync().catch(() => undefined);
    props.onChange(next);
  };

  return (
    <View className={props.disabled ? "gap-2 p-4 opacity-45" : "gap-2 p-4"}>
      <View className="flex-row items-center gap-4">
        <SymbolView name={props.icon} size={24} tintColorClassName="accent-icon" />
        <Text className="min-w-0 flex-1 text-base">{props.label}</Text>
        <Text className="text-sm text-foreground-muted">{props.valueLabel}</Text>
      </View>
      <View
        accessible
        accessibilityLabel={props.label}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled: Boolean(props.disabled) }}
        accessibilityValue={{
          min: props.min,
          max: props.max,
          now: liveValue ?? props.value,
          text: props.valueLabel,
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "increment") commit(props.value + props.step);
          else if (nativeEvent.actionName === "decrement") commit(props.value - props.step);
        }}
      >
        <View importantForAccessibility="no-hide-descendants">
          <LiquidGlassSlider
            min={props.min}
            max={props.max}
            step={props.step}
            value={liveValue ?? props.value}
            dark={dark}
            disabled={Boolean(props.disabled)}
            onValueChange={(value) => {
              const next = snap(value);
              setLiveValue(next);
            }}
            onValueCommit={commit}
          />
        </View>
      </View>
    </View>
  );
}
