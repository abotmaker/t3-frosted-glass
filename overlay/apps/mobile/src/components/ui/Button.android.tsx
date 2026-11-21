import { View } from "react-native";

import { useScaledTextRole } from "../../features/settings/appearance/useScaledTextRole";
import { LiquidGlassButton } from "../../liquid-glass/LiquidGlassButton";
import { AppActivityIndicator } from "./AppActivityIndicator";
import { SymbolView } from "./AppSymbol";
import { AppText as Text } from "./AppText";
import type { ButtonProps } from "./Button";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useControlTheme } from "./useControlTheme";

export function Button(props: ButtonProps) {
  const { colors, colorScheme } = useControlTheme();
  const dark = colorScheme === "dark";
  const typography = useScaledTextRole("footnote");
  const { scale, mediumIconSize } = useAndroidControlSizing();
  const tone = props.tone ?? "secondary";
  const disabled = Boolean(props.disabled || props.loading);

  const look =
    tone === "text"
      ? "clear"
      : tone === "primary" || tone === "contrast"
        ? "primary"
        : "tonal";

  const accentColor =
    tone === "danger"
      ? colors["--color-danger-foreground"]
      : tone === "primary"
        ? colors["--color-primary"]
        : null;

  const accentOpacity = tone === "danger" ? 0.24 : tone === "primary" ? (dark ? 0.28 : 0.22) : null;

  const contentColor = disabled
    ? colors["--color-foreground-muted"]
    : tone === "danger"
      ? colors["--color-danger-foreground"]
      : tone === "text"
        ? colors["--color-primary-text"]
        : dark
          ? "#F5F7FA"
          : "#181B20";

  const minHeight = props.size === "compact" ? 40 : 48;

  return (
    <LiquidGlassButton
      look={look}
      dark={dark}
      cornerRadius={999}
      accentColor={accentColor}
      accentOpacity={accentOpacity}
      disabled={disabled}
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityHint={props.accessibilityHint}
      accessibilityState={{ disabled, busy: Boolean(props.loading) }}
      style={props.fullWidth ? { width: "100%" } : { alignSelf: "flex-start" }}
      contentStyle={{
        minHeight,
        paddingHorizontal: props.size === "compact" ? 18 : 22,
        paddingVertical: 8,
        width: props.fullWidth ? "100%" : undefined,
      }}
    >
      <View
        className="flex-row items-center justify-center"
        style={{ gap: 8 * scale }}
      >
        {props.loading ? (
          <AppActivityIndicator
            size="small"
            colorClassName={tone === "danger" ? "accent-danger-foreground" : "accent-foreground"}
          />
        ) : props.icon ? (
          <SymbolView
            name={props.icon}
            size={mediumIconSize}
            tintColor={contentColor}
          />
        ) : null}
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
      </View>
    </LiquidGlassButton>
  );
}
