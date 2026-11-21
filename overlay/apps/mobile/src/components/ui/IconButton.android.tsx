import { Pressable, View } from "react-native";

import { LiquidGlassButton } from "../../liquid-glass/LiquidGlassButton";
import { SymbolView } from "./AppSymbol";
import type { IconButtonProps } from "./IconButton.types";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { useControlTheme } from "./useControlTheme";

export function IconButton(props: IconButtonProps & { readonly iconScale?: number }) {
  const { colors, colorScheme } = useControlTheme();
  const dark = colorScheme === "dark";
  const { iconSize, buttonSize } = useAndroidControlSizing();
  const variant = props.variant ?? "standard";
  const iconName =
    props.icon === "ellipsis" ? { ios: "ellipsis" as const, android: "more_vert" as const } : props.icon;

  const iconTint = props.disabled
    ? "accent-icon-subtle"
    : variant === "danger"
      ? "accent-danger-foreground"
      : variant === "primary"
        ? "accent-foreground"
        : variant === "tonal"
          ? "accent-secondary-foreground"
          : (props.tintColorClassName ?? "accent-foreground");

  // Standard header/inline icon buttons stay crisp & clean when idle and highlight when selected.
  if (variant === "standard" && !props.selected) {
    return (
      <Pressable
        accessibilityLabel={props.accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(props.disabled), selected: props.selected }}
        disabled={props.disabled}
        onPress={props.onPress}
        android_ripple={{
          borderless: true,
          color: dark ? "rgba(255, 255, 255, 0.16)" : "rgba(15, 23, 42, 0.10)",
          radius: buttonSize * 0.45,
        }}
        style={{
          width: buttonSize,
          height: buttonSize,
          alignItems: "center",
          justifyContent: "center",
          opacity: props.disabled ? 0.38 : 1,
        }}
      >
        <SymbolView
          name={iconName}
          size={iconSize * (props.iconScale ?? 1)}
          tintColorClassName={iconTint}
          type="monochrome"
        />
      </Pressable>
    );
  }

  const glassSize = Math.max(38, buttonSize - 6);
  const look = variant === "primary" || props.selected ? "primary" : "tonal";
  const accentColor =
    variant === "danger"
      ? colors["--color-danger-foreground"]
      : variant === "primary"
        ? colors["--color-primary"]
        : null;
  const accentOpacity = variant === "danger" ? 0.24 : variant === "primary" ? 0.28 : null;

  return (
    <View
      style={{
        width: buttonSize,
        height: buttonSize,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LiquidGlassButton
        look={look}
        dark={dark}
        cornerRadius={999}
        accentColor={accentColor}
        accentOpacity={accentOpacity}
        disabled={Boolean(props.disabled)}
        onPress={props.onPress}
        accessibilityLabel={props.accessibilityLabel}
        accessibilityState={{ disabled: Boolean(props.disabled), selected: props.selected }}
        contentStyle={{
          width: glassSize,
          height: glassSize,
        }}
      >
        <SymbolView
          name={iconName}
          size={iconSize * (props.iconScale ?? 1)}
          tintColorClassName={iconTint}
          type="monochrome"
        />
      </LiquidGlassButton>
    </View>
  );
}
