import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassBackdrop } from "../../liquid-glass/LiquidGlassBackdrop";
import type { SheetPaneProps } from "./SheetPane.types";
export type { SheetPaneProps } from "./SheetPane.types";

/** Root of a pane or sheet backed by the continuous liquid glass bloom backdrop. */
export function SheetPane(props: SheetPaneProps) {
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  return (
    <LiquidGlassBackdrop
      dark={themeAppearance === "dark"}
      accentColor={themeVariables["--color-primary"]}
    >
      {props.children}
    </LiquidGlassBackdrop>
  );
}
