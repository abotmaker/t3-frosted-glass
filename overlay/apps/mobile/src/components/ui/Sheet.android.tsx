import { useState } from "react";
import { View } from "react-native";
import { FormSheet } from "react-native-screens";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassBackdrop } from "../../liquid-glass/LiquidGlassBackdrop";
import { GLASS_BACKDROP_BASE_DARK, GLASS_BACKDROP_BASE_LIGHT } from "../../liquid-glass/liquidGlassTheme";
import { AppBar } from "./AppBar";
import { BottomSheetContext } from "./BottomSheetContext";
import { RoutedFormSheetContext } from "./RoutedFormSheetContext";
import { ScreenContent } from "./ScreenContent";
import type { SheetProps } from "./Sheet.types";
export type { SheetProps } from "./Sheet.types";

export function Sheet(props: SheetProps) {
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  const [isOpen, setIsOpen] = useState(true);
  return (
    <FormSheet
      isOpen={isOpen}
      detents={[0.5, 0.9]}
      prefersGrabberVisible={false}
      preventNativeDismiss={props.dismissDisabled}
      nativeContainerStyle={{ backgroundColor: dark ? GLASS_BACKDROP_BASE_DARK : GLASS_BACKDROP_BASE_LIGHT }}
      onDismiss={props.onClose}
      onNativeDismiss={props.onClose}
    >
      <BottomSheetContext value>
        <RoutedFormSheetContext value={false}>
          {/* Android FormSheet does not bound flex children. */}
          <View collapsable={false} className="absolute inset-0">
            <LiquidGlassBackdrop dark={dark} accentColor={themeVariables["--color-primary"]}>
              <AppBar
                sheet
                title={props.title}
                onBack={props.dismissDisabled ? undefined : () => setIsOpen(false)}
                hideBottomBorder
              />
              <ScreenContent>{props.children}</ScreenContent>
              <View
                pointerEvents="none"
                className="absolute top-1 h-1 w-8 self-center rounded-full bg-header-foreground/40"
              />
            </LiquidGlassBackdrop>
          </View>
        </RoutedFormSheetContext>
      </BottomSheetContext>
    </FormSheet>
  );
}
