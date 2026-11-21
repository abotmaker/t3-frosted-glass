import { useId } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { GLASS_BACKDROP_BASE_DARK, GLASS_BACKDROP_BASE_LIGHT } from "./liquidGlassTheme";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { NativeLiquidGlassFadeView } from "./nativeViews";

export const GLASS_HEADER_INSET = 12;
export const GLASS_HEADER_CONTENT_PADDING = 14;

/** Draws the floating oval pill glass bar surface and a top status-bar edge fade. */
export function LiquidGlassHeader({
  top,
  bottom = 4,
}: {
  readonly top: number;
  readonly bottom?: number;
}) {
  const { themeAppearance } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  const gradientId = useId();
  const fadeColor = dark ? GLASS_BACKDROP_BASE_DARK : GLASS_BACKDROP_BASE_LIGHT;
  const showStatusFade = top > 16;
  const fadeHeight = top + 24;
  const solidStop = Math.max(0, Math.min(0.85, (top - 2) / fadeHeight));
  const midStop = Math.min(0.95, solidStop + (1 - solidStop) * 0.45);
  const useNativeFade = Platform.OS === "android" && NativeLiquidGlassFadeView !== null;

  return (
    <>
      {showStatusFade ? (
        useNativeFade && NativeLiquidGlassFadeView ? (
          <NativeLiquidGlassFadeView
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            dark={dark}
            direction="top"
            solidStop={solidStop}
            style={[styles.statusFade, { height: fadeHeight }]}
          />
        ) : (
          <View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            style={[styles.statusFade, { height: fadeHeight }]}
          >
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={fadeColor} stopOpacity="1" />
                  <Stop offset={String(solidStop)} stopColor={fadeColor} stopOpacity="1" />
                  <Stop offset={String(midStop)} stopColor={fadeColor} stopOpacity="0.6" />
                  <Stop offset="1" stopColor={fadeColor} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
            </Svg>
          </View>
        )
      ) : null}
      <LiquidGlassSurface
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        look="header"
        dark={dark}
        cornerRadius={999}
        style={[styles.surface, { top, bottom }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  statusFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  surface: {
    position: "absolute",
    left: GLASS_HEADER_INSET,
    right: GLASS_HEADER_INSET,
  },
});
