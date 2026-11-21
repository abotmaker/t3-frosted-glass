import { View, type ViewProps } from "react-native";
import { NativeLiquidGlassSourceView } from "./nativeViews";

/** Bounds the screen content that may be sampled by sibling floating glass. */
export function LiquidGlassSource({
  enabled = true,
  menuBackdrop = false,
  ...props
}: ViewProps & { enabled?: boolean; menuBackdrop?: boolean }) {
  if (!NativeLiquidGlassSourceView) return <View {...props} collapsable={false} />;
  return (
    <NativeLiquidGlassSourceView
      {...props}
      collapsable={false}
      enabled={enabled}
      menuBackdrop={menuBackdrop}
    />
  );
}
