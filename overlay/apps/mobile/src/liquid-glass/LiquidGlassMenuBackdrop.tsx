import type { ReactNode } from "react";
import { Platform, StyleSheet } from "react-native";

import { useHasOverlayPortal } from "../components/ui/OverlayPortal";
import { LiquidGlassSource } from "./LiquidGlassSource";

export function LiquidGlassMenuBackdrop({ children }: { readonly children: ReactNode }) {
  const active = useHasOverlayPortal();
  if (Platform.OS !== "android") return children;
  return (
    <LiquidGlassSource
      menuBackdrop
      enabled={active}
      importantForAccessibility={active ? "no-hide-descendants" : "auto"}
      style={styles.fill}
    >
      {children}
    </LiquidGlassSource>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
