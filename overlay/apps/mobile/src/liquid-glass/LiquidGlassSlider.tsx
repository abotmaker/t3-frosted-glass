import { View, type StyleProp, type ViewStyle } from "react-native";

import { NativeLiquidGlassSliderView } from "./nativeViews";

export interface LiquidGlassSliderProps {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly dark: boolean;
  readonly disabled?: boolean;
  readonly onValueChange?: (value: number) => void;
  readonly onValueCommit?: (value: number) => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Knobless BitChord `ThinSlider` / Jarvoice `GlassSlider`:
 * 10dp glass capsule at rest, springing smoothly to 16dp while dragged.
 */
export function LiquidGlassSlider({
  min,
  max,
  step,
  value,
  dark,
  disabled = false,
  onValueChange,
  onValueCommit,
  style,
}: LiquidGlassSliderProps) {
  if (!NativeLiquidGlassSliderView) {
    return <View style={[{ height: 36, width: "100%" }, style]} />;
  }

  return (
    <NativeLiquidGlassSliderView
      min={min}
      max={max}
      step={step}
      value={value}
      dark={dark}
      enabled={!disabled}
      onValueChange={
        onValueChange ? (event) => onValueChange(event.nativeEvent.value) : undefined
      }
      onValueCommit={
        onValueCommit ? (event) => onValueCommit(event.nativeEvent.value) : undefined
      }
      style={[{ height: 36, width: "100%" }, style]}
    />
  );
}
