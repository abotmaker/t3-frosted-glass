import {
  themeColorWithContrast,
  type MobileThemeAppearance,
  type MobileThemeVariables,
} from "../lib/mobileTheme";

export const GLASS_TRANSPARENT = "rgba(0, 0, 0, 0)";
export const GLASS_TRANSPARENT_LIGHT = "rgba(242, 244, 247, 0)";
export const GLASS_BACKDROP_BASE_DARK = "#000000";
export const GLASS_BACKDROP_BASE_LIGHT = "#f2f4f7";

/**
 * Calibrates Android theme variables for the Jarvoice/BitChord liquid glass aesthetic:
 *  - Canvas & sheet-solid tokens stay 100% transparent while carrying the real backdrop RGB
 *    (`rgba(0, 0, 0, 0)` in dark, `rgba(242, 244, 247, 0)` in light) so `T3LiquidGlassBackdropView`
 *    supplies the canvas underneath AND color helpers (`flattenThemeColor`, `isDarkThemeColor`,
 *    `themeColorWithAlpha`, `contextChipAccent`) resolve the true dark/light surface luminance.
 *  - Cards, headers, inputs, composer, and bubbles use translucent frosted glass fills
 *    whose RGB polarity matches their mode, with crisp monochrome foregrounds in both themes.
 */
export function applyLiquidGlassThemeVariables(
  variables: MobileThemeVariables,
  appearance: MobileThemeAppearance,
): MobileThemeVariables {
  const dark = appearance === "dark";
  const backdropBase = dark ? GLASS_BACKDROP_BASE_DARK : GLASS_BACKDROP_BASE_LIGHT;
  const transparentCanvas = dark ? GLASS_TRANSPARENT : GLASS_TRANSPARENT_LIGHT;
  const bubbleRefSurface = dark ? "#1A1C20" : "#FAFBFD";
  const primaryAccent = variables["--color-primary"];
  const readableLink = themeColorWithContrast(primaryAccent, backdropBase);
  const readableBubbleSkill = themeColorWithContrast(primaryAccent, bubbleRefSurface);

  return {
    ...variables,
    "--color-status-bar": backdropBase,
    "--color-screen": transparentCanvas,
    "--color-thread-canvas": transparentCanvas,
    "--color-drawer": transparentCanvas,
    "--color-header": transparentCanvas,
    "--color-header-border": dark ? "rgba(255, 255, 255, 0.14)" : "rgba(15, 23, 42, 0.10)",
    "--color-sheet": dark ? "rgba(24, 24, 24, 0.42)" : "rgba(247, 249, 252, 0.54)",
    "--color-sheet-solid": transparentCanvas,
    "--color-card": dark ? "rgba(24, 24, 24, 0.42)" : "rgba(255, 255, 255, 0.56)",
    "--color-grouped-card": dark ? "rgba(24, 24, 24, 0.40)" : "rgba(255, 255, 255, 0.54)",
    "--color-card-alt": dark ? "rgba(24, 24, 24, 0.78)" : "rgba(250, 252, 255, 0.90)",
    "--color-card-translucent": dark ? "rgba(24, 24, 24, 0.44)" : "rgba(255, 255, 255, 0.60)",
    "--color-border": dark ? "rgba(255, 255, 255, 0.18)" : "rgba(15, 23, 42, 0.12)",
    "--color-border-subtle": dark ? "rgba(255, 255, 255, 0.11)" : "rgba(15, 23, 42, 0.08)",
    "--color-separator": dark ? "rgba(255, 255, 255, 0.10)" : "rgba(15, 23, 42, 0.08)",
    "--color-subtle": dark ? "rgba(255, 255, 255, 0.09)" : "rgba(15, 23, 42, 0.06)",
    "--color-subtle-strong": dark ? "rgba(255, 255, 255, 0.15)" : "rgba(15, 23, 42, 0.10)",
    "--color-row-hover": dark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.05)",
    "--color-thread-hover": dark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.05)",
    "--color-thread-selected": dark ? "rgba(38, 42, 48, 0.82)" : "rgba(255, 255, 255, 0.72)",
    "--color-thread-selected-foreground": dark ? "#F5F7FA" : "#0F172A",
    "--color-thread-selected-foreground-muted": dark ? "#B8BFC9" : "#4B5563",
    "--color-input": dark ? "rgba(28, 30, 34, 0.68)" : "rgba(255, 255, 255, 0.60)",
    "--color-input-border": dark ? "rgba(255, 255, 255, 0.24)" : "rgba(15, 23, 42, 0.16)",
    "--color-sidebar-search": dark ? "rgba(28, 30, 34, 0.68)" : "rgba(255, 255, 255, 0.56)",
    "--color-composer-panel": transparentCanvas,
    "--color-composer-surface": dark ? "rgba(24, 24, 24, 0.40)" : "rgba(255, 255, 255, 0.56)",
    "--color-composer-border": dark ? "rgba(255, 255, 255, 0.24)" : "rgba(15, 23, 42, 0.14)",
    "--color-glass-surface": dark ? "rgba(24, 24, 24, 0.40)" : "rgba(255, 255, 255, 0.54)",
    "--color-glass-fallback": dark ? "rgba(24, 24, 24, 0.54)" : "rgba(255, 255, 255, 0.68)",
    "--color-glass-tint": dark ? "rgba(255, 255, 255, 0.10)" : "rgba(255, 255, 255, 0.35)",
    "--color-secondary": dark ? "rgba(30, 32, 36, 0.72)" : "rgba(255, 255, 255, 0.60)",
    "--color-secondary-foreground": dark ? "#F0F2F5" : "#181B20",
    "--color-secondary-border": dark ? "rgba(255, 255, 255, 0.20)" : "rgba(15, 23, 42, 0.12)",
    "--color-switch-active-track": dark ? "rgba(227, 232, 238, 0.42)" : "rgba(24, 27, 32, 0.34)",
    "--color-switch-active-thumb": dark ? "#F5F7FA" : "#FFFFFF",
    "--color-switch-inactive-track": dark ? "rgba(255, 255, 255, 0.09)" : "rgba(15, 23, 42, 0.10)",
    "--color-switch-inactive-thumb": dark ? "#C6C8CC" : "#64748B",
    "--color-user-bubble": dark ? "rgba(30, 32, 36, 0.72)" : "rgba(255, 255, 255, 0.66)",
    "--color-user-bubble-foreground": dark ? "#F0F2F5" : "#181B20",
    "--color-user-bubble-foreground-muted": dark
      ? "rgba(240, 242, 245, 0.78)"
      : "rgba(24, 27, 32, 0.72)",
    "--color-user-bubble-skill-foreground": readableBubbleSkill,
    "--color-foreground": dark ? "#F0F2F5" : "#181B20",
    "--color-foreground-secondary": dark ? "#C6C8CC" : "#4B5563",
    "--color-foreground-muted": dark ? "#A8AEB8" : "#5B6472",
    "--color-placeholder": dark ? "#9BA3AE" : "#6B7280",
    "--color-icon": dark ? "#F0F2F5" : "#181B20",
    "--color-icon-muted": dark ? "#A8AEB8" : "#5B6472",
    "--color-icon-subtle": dark ? "#8E96A4" : "#64748B",
    "--color-header-foreground": dark ? "#F0F2F5" : "#181B20",
    "--color-drawer-foreground": dark ? "#F0F2F5" : "#181B20",
    "--color-drawer-foreground-muted": dark ? "#A8AEB8" : "#5B6472",
    "--color-wordmark": dark ? "#F0F2F5" : "#181B20",
    "--color-md-body": dark ? "#F0F2F5" : "#181B20",
    "--color-md-strong": dark ? "#F5F7FA" : "#0F172A",
    "--color-md-link": readableLink,
    "--color-md-code-bg": dark ? "rgba(24, 24, 24, 0.62)" : "rgba(255, 255, 255, 0.68)",
    "--color-md-code-text": dark ? "#E8ECF2" : "#1E293B",
    "--color-md-user-code-bg": dark ? "rgba(255, 255, 255, 0.14)" : "rgba(15, 23, 42, 0.08)",
    "--color-md-user-code-text": dark ? "#F0F2F5" : "#181B20",
    "--color-md-user-fence-bg": dark ? "rgba(0, 0, 0, 0.30)" : "rgba(15, 23, 42, 0.08)",
    "--color-md-user-fence-text": dark ? "#F0F2F5" : "#181B20",
    "--color-md-blockquote-bg": dark ? "rgba(255, 255, 255, 0.07)" : "rgba(15, 23, 42, 0.05)",
  };
}
