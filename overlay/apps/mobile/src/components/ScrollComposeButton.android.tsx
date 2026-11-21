import { useGT } from "gt-react-native";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { resolveScaledTextRole } from "../lib/appearancePreferences";
import { LiquidGlassButton } from "../liquid-glass/LiquidGlassButton";
import { SymbolView } from "./ui/AppSymbol";
import { AppText as Text } from "./ui/AppText";
import { useAndroidControlSizing } from "./ui/useAndroidControlSizing";

export function ScrollComposeButton(props: {
  readonly expanded: boolean;
  readonly onPress: () => void;
  readonly size?: number;
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const gt = useGT();
  const { appearance, themeAppearance, themeVariables: colors } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  const typography = resolveScaledTextRole("footnote", appearance.baseFontSize);
  const { iconSize, fabSize: scaledFabSize } = useAndroidControlSizing();
  const fabSize = props.size ?? scaledFabSize;
  const contentColor = dark ? "#F5F7FA" : "#181B20";

  return (
    <View
      pointerEvents="box-none"
      className={props.className}
      style={[props.style, { alignItems: "flex-end", height: fabSize }]}
    >
      <LiquidGlassButton
        look="primary"
        dark={dark}
        cornerRadius={999}
        accentColor={dark ? colors["--color-primary"] : "#0F172A"}
        accentOpacity={dark ? 0.24 : 0.11}
        onPress={props.onPress}
        accessibilityLabel={gt("New thread")}
        contentStyle={{
          height: fabSize,
          minWidth: fabSize,
          paddingHorizontal: props.expanded ? 18 : 0,
        }}
      >
        <View
          className="flex-row items-center justify-center"
          style={{ gap: props.expanded ? 8 : 0 }}
        >
          <SymbolView
            name="square.and.pencil"
            size={iconSize}
            tintColor={contentColor}
            type="monochrome"
          />
          {props.expanded ? (
            <Text
              numberOfLines={1}
              style={{
                fontSize: typography.fontSize,
                lineHeight: typography.lineHeight,
                fontWeight: "600",
                color: contentColor,
              }}
            >
              {gt("New thread")}
            </Text>
          ) : null}
        </View>
      </LiquidGlassButton>
    </View>
  );
}
