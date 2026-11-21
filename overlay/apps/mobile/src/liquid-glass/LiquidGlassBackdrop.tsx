import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { GLASS_BACKDROP_BASE_DARK, GLASS_BACKDROP_BASE_LIGHT } from "./liquidGlassTheme";
import { NativeLiquidGlassBackdropView, toNativeColor } from "./nativeViews";

export interface LiquidGlassBackdropProps {
  readonly dark: boolean;
  readonly accentColor?: string | null;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}

/** Hosts the route's AMOLED or light canvas and its live glass sources. */
export function LiquidGlassBackdrop({
  dark,
  accentColor,
  style,
  children,
}: LiquidGlassBackdropProps) {
  if (Platform.OS !== "android" || !NativeLiquidGlassBackdropView) {
    return (
      <View
        collapsable={false}
        style={[
          styles.fill,
          { backgroundColor: dark ? GLASS_BACKDROP_BASE_DARK : GLASS_BACKDROP_BASE_LIGHT },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <NativeLiquidGlassBackdropView
      collapsable={false}
      dark={dark}
      accentColor={toNativeColor(accentColor)}
      style={[styles.fill, style]}
    >
      {children}
    </NativeLiquidGlassBackdropView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
