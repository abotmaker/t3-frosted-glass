import type { ReactNode, Ref } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewInstance,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import {
  NativeLiquidGlassSurfaceView,
  toNativeColor,
  type GlassLookName,
} from "./nativeViews";

export interface LiquidGlassSurfaceProps extends Omit<ViewProps, "style"> {
  readonly ref?: Ref<ViewInstance>;
  readonly look?: GlassLookName;
  readonly dark: boolean;
  readonly cornerRadius?: number;
  readonly topCornerRadius?: number | null;
  readonly bottomCornerRadius?: number | null;
  readonly glassOpacity?: number | null;
  readonly accentColor?: string | null;
  readonly accentOpacity?: number | null;
  readonly pressed?: boolean;
  readonly drawRim?: boolean;
  readonly backdropAlpha?: number | null;
  readonly enabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}

const UNIFORM_RADIUS_STYLES: Readonly<Record<number, ViewStyle>> = {
  0: { borderRadius: 0, overflow: "hidden" },
  12: { borderRadius: 12, overflow: "hidden" },
  14: { borderRadius: 14, overflow: "hidden" },
  16: { borderRadius: 16, overflow: "hidden" },
  18: { borderRadius: 18, overflow: "hidden" },
  20: { borderRadius: 20, overflow: "hidden" },
  24: { borderRadius: 24, overflow: "hidden" },
  28: { borderRadius: 28, overflow: "hidden" },
  999: { borderRadius: 999, overflow: "hidden" },
};

function resolveBorderRadius(style: StyleProp<ViewStyle>, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  if (style && !Array.isArray(style) && typeof style === "object") {
    const r = (style as ViewStyle).borderRadius;
    if (typeof r === "number") return r;
  } else if (style) {
    const flat = StyleSheet.flatten(style);
    if (typeof flat?.borderRadius === "number") return flat.borderRadius;
  }
  return 18;
}

export function LiquidGlassSurface({
  ref,
  look = "card",
  dark,
  cornerRadius,
  topCornerRadius,
  bottomCornerRadius,
  glassOpacity,
  accentColor,
  accentOpacity,
  pressed = false,
  drawRim = true,
  backdropAlpha,
  enabled = true,
  style,
  children,
  ...props
}: LiquidGlassSurfaceProps) {
  const radius = resolveBorderRadius(style, cornerRadius);
  const resolvedTopRadius = topCornerRadius ?? radius;
  const resolvedBottomRadius = bottomCornerRadius ?? radius;
  const radiusStyle: ViewStyle =
    topCornerRadius != null || bottomCornerRadius != null
      ? {
          borderTopLeftRadius: resolvedTopRadius,
          borderTopRightRadius: resolvedTopRadius,
          borderBottomLeftRadius: resolvedBottomRadius,
          borderBottomRightRadius: resolvedBottomRadius,
          overflow: "hidden",
        }
      : (UNIFORM_RADIUS_STYLES[radius] ?? {
          borderRadius: radius,
          overflow: "hidden",
        });

  if (Platform.OS !== "android" || !NativeLiquidGlassSurfaceView) {
    return (
      <View
        {...props}
        ref={ref}
        style={[
          radiusStyle,
          {
            backgroundColor:
              look === "menu"
                ? dark ? "#181818" : "#F7F9FC"
                : dark ? "rgba(24, 24, 24, 0.4)" : "rgba(255, 255, 255, 0.68)",
            borderWidth: drawRim ? StyleSheet.hairlineWidth : 0,
            borderColor: dark ? "rgba(255, 255, 255, 0.22)" : "rgba(15, 23, 42, 0.14)",
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View {...props} ref={ref} collapsable={false} style={[radiusStyle, style]}>
      <NativeLiquidGlassSurfaceView
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        look={look}
        dark={dark}
        cornerRadius={radius}
        topCornerRadius={topCornerRadius ?? null}
        bottomCornerRadius={bottomCornerRadius ?? null}
        glassOpacity={glassOpacity ?? null}
        accentColor={toNativeColor(accentColor)}
        accentOpacity={accentOpacity ?? null}
        pressed={pressed}
        drawRim={drawRim}
        backdropAlpha={backdropAlpha ?? null}
        enabled={enabled}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
