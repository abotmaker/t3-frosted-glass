import { requireNativeView } from "expo";
import type { ComponentType } from "react";
import {
  Platform,
  processColor,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";

export type GlassLookName =
  | "card"
  | "track"
  | "dock"
  | "composer"
  | "header"
  | "menu"
  | "sheet"
  | "primary"
  | "tonal"
  | "clear"
  | "bubble"
  | "input";

export interface NativeBackdropProps extends ViewProps {
  readonly dark: boolean;
  readonly accentColor?: number | null;
}

export interface NativeSurfaceProps extends ViewProps {
  readonly look: GlassLookName;
  readonly dark: boolean;
  readonly cornerRadius: number;
  readonly topCornerRadius?: number | null;
  readonly bottomCornerRadius?: number | null;
  readonly glassOpacity?: number | null;
  readonly accentColor?: number | null;
  readonly accentOpacity?: number | null;
  readonly pressed?: boolean;
  readonly drawRim?: boolean;
  readonly backdropAlpha?: number | null;
  readonly enabled?: boolean;
}

export interface NativeDockProps extends ViewProps {
  readonly tabs: readonly string[];
  readonly selectedTab: string;
  readonly dark: boolean;
  readonly floating: boolean;
  readonly textScale: number;
  readonly selectedColor: number;
  readonly unselectedColor: number;
  readonly accentColor?: number | null;
  readonly onTabSelected: (event: NativeSyntheticEvent<{ readonly tab: string }>) => void;
}

export interface NativeSegmentedProps extends ViewProps {
  readonly labels: readonly string[];
  readonly selectedIndex: number;
  readonly dark: boolean;
  readonly compact: boolean;
  readonly selectedTextColor: number;
  readonly mutedTextColor: number;
  readonly onSelectIndex: (event: NativeSyntheticEvent<{ readonly index: number }>) => void;
}

export interface NativeSliderProps extends ViewProps {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly dark: boolean;
  readonly enabled: boolean;
  readonly onValueChange?: (event: NativeSyntheticEvent<{ readonly value: number }>) => void;
  readonly onValueCommit?: (event: NativeSyntheticEvent<{ readonly value: number }>) => void;
}

export interface NativeFadeProps extends ViewProps {
  readonly dark: boolean;
  readonly direction: "top" | "bottom";
  readonly solidStop?: number;
}

function tryRequireNativeView<P>(name: string): ComponentType<P> | null {
  if (Platform.OS !== "android") return null;
  try {
    return requireNativeView<P>(name);
  } catch {
    return null;
  }
}

export const NativeLiquidGlassBackdropView =
  tryRequireNativeView<NativeBackdropProps>("T3LiquidGlassBackdrop");

export const NativeLiquidGlassSourceView =
  tryRequireNativeView<ViewProps & { enabled: boolean; menuBackdrop: boolean }>("T3LiquidGlassSource");

export const NativeLiquidGlassSurfaceView =
  tryRequireNativeView<NativeSurfaceProps>("T3LiquidGlassSurface");

export const NativeLiquidGlassDockView =
  tryRequireNativeView<NativeDockProps>("T3LiquidGlassDock");

export const NativeLiquidGlassSegmentedView =
  tryRequireNativeView<NativeSegmentedProps>("T3LiquidGlassSegmented");

export const NativeLiquidGlassSliderView =
  tryRequireNativeView<NativeSliderProps>("T3LiquidGlassSlider");

export const NativeLiquidGlassFadeView =
  tryRequireNativeView<NativeFadeProps>("T3LiquidGlassFade");

const nativeColorCache = new Map<string, number | null>();

export function toNativeColor(value: string | null | undefined): number | null {
  if (!value) return null;
  const cached = nativeColorCache.get(value);
  if (cached !== undefined) return cached;
  const processed = processColor(value);
  const resolved = typeof processed === "number" ? processed : null;
  if (nativeColorCache.size >= 256) {
    nativeColorCache.clear();
  }
  nativeColorCache.set(value, resolved);
  return resolved;
}

export function toNativeColorOrDefault(value: string | null | undefined, fallback: number): number {
  return toNativeColor(value) ?? fallback;
}
