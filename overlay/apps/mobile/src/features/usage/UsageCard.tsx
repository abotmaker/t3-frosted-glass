import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import { cn } from "../../lib/cn";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";

export function UsageCard({ children, className, compact = false }: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly compact?: boolean;
}) {
  const { themeAppearance } = useAppearancePreferences();
  if (Platform.OS === "android") {
    return (
      <LiquidGlassSurface
        look="card"
        dark={themeAppearance === "dark"}
        cornerRadius={compact ? 20 : 24}
        className={cn(compact ? "px-4 py-2.5" : "p-4", className)}
      >
        {children}
      </LiquidGlassSurface>
    );
  }
  return (
    <View className={cn("rounded-[24px] border-continuous bg-grouped-card p-4", className)}>
      {children}
    </View>
  );
}
