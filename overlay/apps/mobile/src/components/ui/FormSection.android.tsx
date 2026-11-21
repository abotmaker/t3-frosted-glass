import { View } from "react-native";

import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { AppText as Text, AppTextInput as TextInput } from "./AppText";
import type { FormFieldProps, FormSectionProps } from "./FormSection.types";
export type { FormFieldProps, FormSectionProps } from "./FormSection.types";

export function FormSection(props: FormSectionProps) {
  const { themeAppearance } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  return (
    <LiquidGlassSurface look="card" dark={dark} cornerRadius={20}>
      <View className="gap-3 p-4">
        <Text className="text-base font-t3-medium text-foreground">{props.title}</Text>
        {props.children}
      </View>
    </LiquidGlassSurface>
  );
}

export function FormField({ label, ...props }: FormFieldProps) {
  const { themeAppearance } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  return (
    <>
      {label ? <Text className="text-sm text-foreground-secondary">{label}</Text> : null}
      <LiquidGlassSurface look="input" dark={dark} cornerRadius={14}>
        <TextInput {...props} className="bg-transparent" />
      </LiquidGlassSurface>
    </>
  );
}
