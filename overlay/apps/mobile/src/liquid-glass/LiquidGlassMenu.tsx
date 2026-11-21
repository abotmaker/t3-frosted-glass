import type { ReactNode } from "react";
import { ScrollView, type ViewStyle } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassSurface } from "./LiquidGlassSurface";

export function LiquidGlassMenu(props: {
  readonly children: ReactNode;
  readonly scale: number;
  readonly style: ViewStyle;
}) {
  const { themeAppearance } = useAppearancePreferences();
  return (
    <LiquidGlassSurface
      look="menu"
      dark={themeAppearance === "dark"}
      cornerRadius={28 * props.scale}
      style={props.style}
    >
      <ScrollView
        contentContainerStyle={{ paddingVertical: 8 * props.scale }}
        bounces={false}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {props.children}
      </ScrollView>
    </LiquidGlassSurface>
  );
}
