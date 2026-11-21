import { View } from "react-native";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { useScaledTextRole } from "../../features/settings/appearance/useScaledTextRole";
import { LiquidGlassButton } from "../../liquid-glass/LiquidGlassButton";
import { SymbolView } from "./AppSymbol";
import { AppText as Text } from "./AppText";
import type { FloatingActionButtonProps } from "./FloatingActionButton.types";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

export function FloatingActionButton(props: FloatingActionButtonProps) {
  const { themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  const typography = useScaledTextRole("footnote");
  const { scale, iconSize: standardIconSize, fabSize, largeFabSize } = useAndroidControlSizing();
  const buttonSize = props.variant === "large" ? largeFabSize : fabSize;
  const primary = props.tone === "primary";
  const iconSize = props.variant === "large" ? Math.round(28 * scale) : standardIconSize;
  const extended = props.variant === "extended" && props.expanded !== false;
  const contentColor = dark ? "#F5F7FA" : "#181B20";

  return (
    <View className={props.className} style={props.style}>
      <LiquidGlassButton
        look={primary ? "primary" : "dock"}
        dark={dark}
        cornerRadius={999}
        accentColor={primary ? (dark ? colors["--color-primary"] : "#0F172A") : null}
        accentOpacity={primary ? (dark ? 0.24 : 0.11) : null}
        onPress={props.onPress}
        accessibilityLabel={props.label}
        contentStyle={{
          minWidth: buttonSize,
          height: buttonSize,
          paddingHorizontal: extended ? 18 : 0,
        }}
      >
        <View className="flex-row items-center justify-center" style={{ gap: extended ? 10 : 0 }}>
          <SymbolView
            name={props.icon}
            size={iconSize}
            tintColor={contentColor}
            type="monochrome"
          />
          {extended ? (
            <Text
              numberOfLines={1}
              style={{
                ...typography,
                fontWeight: "600",
                color: contentColor,
              }}
            >
              {props.label}
            </Text>
          ) : null}
        </View>
      </LiquidGlassButton>
    </View>
  );
}
