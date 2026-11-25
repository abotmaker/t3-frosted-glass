import { View, type StyleProp, type ViewStyle } from "react-native";

import {
  NativeLiquidGlassDockView,
  toNativeColor,
  toNativeColorOrDefault,
} from "./nativeViews";

export interface LiquidGlassDockProps {
  readonly tabs: readonly string[];
  readonly tabTitles?: Readonly<Record<string, string>>;
  readonly selectedTab: string;
  readonly dark: boolean;
  readonly floating: boolean;
  readonly textScale: number;
  readonly selectedColor: string;
  readonly unselectedColor: string;
  readonly accentColor?: string | null;
  readonly onTabSelected: (tab: string) => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * BitChord/Jarvoice liquid glass navigation dock:
 * floating capsule (or edge-to-edge glass bar) with draggable & tappable spring-squashing
 * selection lens pill and live AGSL icon refraction on Android 13+.
 */
export function LiquidGlassDock({
  tabs,
  tabTitles,
  selectedTab,
  dark,
  floating,
  textScale,
  selectedColor,
  unselectedColor,
  accentColor,
  onTabSelected,
  style,
}: LiquidGlassDockProps) {
  if (!NativeLiquidGlassDockView) {
    return <View style={style} />;
  }

  return (
    <NativeLiquidGlassDockView
      tabs={tabs}
      tabTitles={tabTitles}
      selectedTab={selectedTab}
      dark={dark}
      floating={floating}
      textScale={textScale}
      selectedColor={toNativeColorOrDefault(selectedColor, dark ? 0xffffffff : 0xff181b20)}
      unselectedColor={toNativeColorOrDefault(unselectedColor, dark ? 0xb3ffffff : 0x99181b20)}
      accentColor={toNativeColor(accentColor)}
      onTabSelected={(event) => onTabSelected(event.nativeEvent.tab)}
      style={style}
    />
  );
}
