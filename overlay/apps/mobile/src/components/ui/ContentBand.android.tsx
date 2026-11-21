import { View } from "react-native";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { cn } from "../../lib/cn";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { AppActivityIndicator } from "./AppActivityIndicator";
import { AppText as Text } from "./AppText";
import type { ContentBandProps, ContentStatusProps } from "./ContentBand.types";
export type { ContentBandProps, ContentStatusProps } from "./ContentBand.types";

/** A rounded liquid glass card floating in the content's margin. */
export function ContentBand(props: ContentBandProps) {
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  return (
    <View className="m-2">
      <LiquidGlassSurface
        look="card"
        dark={dark}
        cornerRadius={20}
        accentColor={props.tone === "warning" ? themeVariables["--color-warning-foreground"] : null}
        accentOpacity={props.tone === "warning" ? 0.16 : null}
      >
        <View className={cn("px-4", props.spacing === "roomy" ? "gap-3 py-4" : "py-3")}>
          {props.children}
        </View>
      </LiquidGlassSurface>
    </View>
  );
}

/** Material centers an empty state in the space it has. */
export function ContentStatus(props: ContentStatusProps) {
  if (props.loading) {
    return (
      <View className="items-center gap-3 px-4 py-6">
        <AppActivityIndicator size="small" />
        <Text className="text-xs text-foreground-muted">{props.detail}</Text>
      </View>
    );
  }
  return (
    <View className="items-center px-6 py-5">
      {props.title ? (
        <Text className="text-sm font-t3-bold text-foreground">{props.title}</Text>
      ) : null}
      <Text className="mt-2 text-center text-xs leading-normal text-foreground-muted">
        {props.detail}
      </Text>
    </View>
  );
}

export const contentStatusContainerStyle = { flexGrow: 1, justifyContent: "center" } as const;
