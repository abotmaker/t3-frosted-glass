import { View } from "react-native";

import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { NativeHeaderToolbar } from "../../native/NativeHeaderToolbar";
import type { ToolbarProps } from "./Toolbar.types";
import { useControlTheme } from "./useControlTheme";

function ToolbarRoot(props: ToolbarProps) {
  const { colorScheme } = useControlTheme();
  const dark = colorScheme === "dark";
  if (props.placement) return <NativeHeaderToolbar {...props} />;
  return (
    <View style={{ alignSelf: "center", maxWidth: "100%" }}>
      <LiquidGlassSurface look="dock" dark={dark} cornerRadius={999}>
        <View className="flex-row items-center gap-1 px-2 py-1">{props.children}</View>
      </LiquidGlassSurface>
    </View>
  );
}

export const Toolbar = Object.assign(ToolbarRoot, {
  Button: NativeHeaderToolbar.Button,
  Custom: NativeHeaderToolbar.Custom,
  Label: NativeHeaderToolbar.Label,
  Menu: NativeHeaderToolbar.Menu,
  MenuAction: NativeHeaderToolbar.MenuAction,
  SearchBarSlot: NativeHeaderToolbar.SearchBarSlot,
  Spacer: NativeHeaderToolbar.Spacer,
});
