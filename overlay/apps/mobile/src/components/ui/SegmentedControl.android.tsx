import { View } from "react-native";

import { LiquidGlassSegmentedControl } from "../../liquid-glass/LiquidGlassSegmentedControl";
import { NativeLiquidGlassSegmentedView } from "../../liquid-glass/nativeViews";
import { SegmentedControl as SharedSegmentedControl } from "./SegmentedControl.shared";
import type { SegmentedControlProps } from "./SegmentedControl.types";
import { useControlTheme } from "./useControlTheme";

export type { SegmentedControlProps } from "./SegmentedControl.types";

export function SegmentedControl<Value extends string | number>(
  props: SegmentedControlProps<Value>,
) {
  const { colorScheme, colors } = useControlTheme();
  const dark = colorScheme === "dark";

  if (!NativeLiquidGlassSegmentedView) {
    return <SharedSegmentedControl {...props} />;
  }

  const selectedIndex = props.options.findIndex((option) => option.value === props.selected);
  const labels = props.options.map((option) => option.label);

  return (
    <View collapsable={false} className={props.className}>
      <LiquidGlassSegmentedControl
        labels={labels}
        selectedIndex={selectedIndex}
        dark={dark}
        compact={props.size === "compact"}
        selectedTextColor={dark ? "#F5F7FA" : "#181B20"}
        mutedTextColor={colors["--color-foreground-muted"]}
        onSelectIndex={(index) => {
          const option = props.options[index];
          if (option !== undefined) props.onSelect(option.value);
        }}
      />
    </View>
  );
}
