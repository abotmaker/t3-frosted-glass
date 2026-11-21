import { LiquidGlassSwitch } from "../../liquid-glass/LiquidGlassSwitch";
import type { ThemedSwitchProps } from "./NativeSwitch.types";
import { useControlTheme } from "./useControlTheme";

export function NativeSwitch(props: ThemedSwitchProps) {
  const { colors, colorScheme } = useControlTheme();
  const dark = colorScheme === "dark";

  return (
    <LiquidGlassSwitch
      value={Boolean(props.value)}
      dark={dark}
      disabled={Boolean(props.disabled)}
      activeTrackColor={colors["--color-switch-active-track"]}
      onValueChange={props.onValueChange}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      testID={props.testID}
      style={props.style}
    />
  );
}
