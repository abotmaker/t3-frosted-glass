import { describe, expect, it } from "vite-plus/test";

import { contextChipAccent } from "../lib/composerChipPresentation";
import {
  flattenThemeColor,
  getMobileThemeVariables,
  isDarkThemeColor,
  themeColorContrastRatio,
  themeColorWithAlpha,
} from "../lib/mobileTheme";
import {
  applyLiquidGlassThemeVariables,
  GLASS_BACKDROP_BASE_DARK,
  GLASS_BACKDROP_BASE_LIGHT,
  GLASS_TRANSPARENT,
  GLASS_TRANSPARENT_LIGHT,
} from "./liquidGlassTheme";

describe("applyLiquidGlassThemeVariables", () => {
  it("makes dark screen and canvas transparent for the native AMOLED backdrop while keeping crisp foregrounds", () => {
    const base = getMobileThemeVariables("t3-code", "dark");
    const glass = applyLiquidGlassThemeVariables(base, "dark");
    expect(glass["--color-status-bar"]).toBe(GLASS_BACKDROP_BASE_DARK);
    expect(glass["--color-screen"]).toBe(GLASS_TRANSPARENT);
    expect(glass["--color-thread-canvas"]).toBe(GLASS_TRANSPARENT);
    expect(glass["--color-drawer"]).toBe(GLASS_TRANSPARENT);
    expect(glass["--color-composer-panel"]).toBe(GLASS_TRANSPARENT);
    expect(isDarkThemeColor(glass["--color-screen"])).toBe(true);
    expect(glass["--color-card"]).toContain("rgba(");
    expect(glass["--color-composer-surface"]).toContain("rgba(");
    expect(glass["--color-foreground"]).toBe("#F0F2F5");
  });

  it("calibrates light mode transparent canvas tokens with porcelain RGB so helpers never fall back to black", () => {
    const base = getMobileThemeVariables("t3-code", "light");
    const glass = applyLiquidGlassThemeVariables(base, "light");
    expect(glass["--color-status-bar"]).toBe(GLASS_BACKDROP_BASE_LIGHT);
    expect(glass["--color-screen"]).toBe(GLASS_TRANSPARENT_LIGHT);
    expect(glass["--color-thread-canvas"]).toBe(GLASS_TRANSPARENT_LIGHT);
    expect(glass["--color-composer-panel"]).toBe(GLASS_TRANSPARENT_LIGHT);
    expect(glass["--color-sheet-solid"]).toBe(GLASS_TRANSPARENT_LIGHT);
    expect(isDarkThemeColor(glass["--color-screen"])).toBe(false);
    expect(themeColorWithAlpha(glass["--color-composer-panel"], 1)).toBe("rgba(242, 244, 247, 1)");
    expect(glass["--color-card"]).toContain("rgba(255, 255, 255");
    expect(glass["--color-foreground"]).toBe("#181B20");
    expect(glass["--color-header-foreground"]).toBe("#181B20");
    expect(
      isDarkThemeColor(flattenThemeColor(glass["--color-border"], glass["--color-user-bubble"])),
    ).toBe(false);
  });

  it("keeps file & context chip accents legible (>= 5:1) in both dark and light liquid glass modes", () => {
    for (const appearance of ["light", "dark"] as const) {
      const glass = applyLiquidGlassThemeVariables(
        getMobileThemeVariables("t3-code", appearance),
        appearance,
      );
      const canvas = appearance === "dark" ? GLASS_BACKDROP_BASE_DARK : GLASS_BACKDROP_BASE_LIGHT;
      for (const accent of ["#0090cd", "#009f6e", "#8a70dd", "#d06217"]) {
        const resolved = contextChipAccent(accent, glass, glass["--color-md-body"])!;
        expect(resolved).not.toBe(appearance === "light" ? "#ffffff" : "#000000");
        expect(themeColorContrastRatio(resolved, canvas)).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("forces dark ink on light glass user bubbles even when the underlying theme uses white-on-accent bubbles", () => {
    const base = {
      ...getMobileThemeVariables("t3-chat", "light"),
      "--color-user-bubble": "#6750a4",
      "--color-user-bubble-foreground": "#ffffff",
      "--color-md-user-code-text": "#ffffff",
    };
    const glass = applyLiquidGlassThemeVariables(base, "light");
    expect(glass["--color-user-bubble-foreground"]).toBe("#181B20");
    expect(glass["--color-md-user-code-text"]).toBe("#181B20");
    expect(themeColorContrastRatio(glass["--color-user-bubble-foreground"], "#fafbfc")).toBeGreaterThanOrEqual(7);
  });
});
