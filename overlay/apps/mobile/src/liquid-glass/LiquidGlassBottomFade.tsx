import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { GLASS_BACKDROP_BASE_DARK, GLASS_BACKDROP_BASE_LIGHT } from "./liquidGlassTheme";

/** Soft bottom edge gradient behind the floating composer pill, matching LiquidGlassHeader's top fade. */
export function LiquidGlassBottomFade() {
  const { themeAppearance } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  const gradientId = useId();
  const fadeColor = dark ? GLASS_BACKDROP_BASE_DARK : GLASS_BACKDROP_BASE_LIGHT;

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fadeColor} stopOpacity="0" />
            <Stop offset="0.52" stopColor={fadeColor} stopOpacity="0.18" />
            <Stop offset="0.82" stopColor={fadeColor} stopOpacity="0.86" />
            <Stop offset="1" stopColor={fadeColor} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}
