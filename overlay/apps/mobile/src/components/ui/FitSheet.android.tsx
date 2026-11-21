import type { ReactNode } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassBackdrop } from "../../liquid-glass/LiquidGlassBackdrop";
import { fitSheetBottomInset, type FitSheetProps } from "./FitSheet.types";
import { ScreenContent } from "./ScreenContent";
export type { FitSheetProps } from "./FitSheet.types";

/** The route sizes the sheet to this content, backed by the liquid glass bloom canvas. */
export function FitSheet({
  header,
  footer,
  avoidsKeyboard,
  children,
  contentContainerClassName = "gap-2 p-2",
  contentContainerStyle,
  ...scrollProps
}: FitSheetProps) {
  const insets = useSafeAreaInsets();
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  return (
    <SheetContainer avoidsKeyboard={avoidsKeyboard} dark={dark} accentColor={themeVariables["--color-primary"]}>
      <ScreenContent fitToContents>
        <ScrollView
          {...scrollProps}
          nestedScrollEnabled
          contentContainerClassName={contentContainerClassName}
          className="shrink grow-0"
          contentContainerStyle={[
            footer ? undefined : { paddingBottom: fitSheetBottomInset(insets.bottom) },
            contentContainerStyle,
          ]}
        >
          {children}
          {footer ? (
            <View
              className="mt-4 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              <View style={{ minHeight: 48 }}>{footer}</View>
            </View>
          ) : null}
        </ScrollView>
      </ScreenContent>
      {header}
    </SheetContainer>
  );
}

function SheetContainer(props: {
  readonly avoidsKeyboard?: boolean;
  readonly dark: boolean;
  readonly accentColor: string;
  readonly children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const style = { maxHeight: height * 0.92 };
  const inner = (
    <LiquidGlassBackdrop dark={props.dark} accentColor={props.accentColor} style={{ flex: 0 }}>
      <View className="flex-col-reverse">{props.children}</View>
    </LiquidGlassBackdrop>
  );
  return props.avoidsKeyboard ? (
    <KeyboardAvoidingView
      automaticOffset
      behavior="padding"
      collapsable={false}
      style={style}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : (
    <View collapsable={false} style={style}>
      {inner}
    </View>
  );
}
