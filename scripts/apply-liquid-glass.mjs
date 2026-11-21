#!/usr/bin/env node
/**
 * Applies the Jarvoice/BitChord Liquid Glass overlay and surgical integration hooks
 * onto the upstream `t3code` checkout.
 *
 * Designed to be 100% idempotent and resilient across upstream T3 Code updates:
 *   1. Copies standalone native module, React Native glass primitives, assets, and plugin
 *      from `overlay/` into `t3code/`.
 *   2. Applies semantic, marker-guarded hooks into upstream files.
 *   3. Verifies every hook applied cleanly; fails loudly with exact file/hook diagnostics
 *      if upstream changed an anchor.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OVERLAY_DIR = path.join(ROOT, "overlay");
const T3_DIR = path.join(ROOT, "t3code");
const MOBILE_DIR = path.join(T3_DIR, "apps", "mobile");
const MARKER = "/* t3-liquid-glass */";

if (!fs.existsSync(MOBILE_DIR)) {
  console.error(`ERROR: Upstream mobile directory not found at ${MOBILE_DIR}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Copy overlay directory recursively into t3code/
// ---------------------------------------------------------------------------
let copiedFiles = 0;
function copyOverlayRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyOverlayRecursive(src, dst);
    } else {
      fs.copyFileSync(src, dst);
      copiedFiles += 1;
    }
  }
}

copyOverlayRecursive(OVERLAY_DIR, T3_DIR);
console.log(`[overlay] Copied ${copiedFiles} files into t3code/`);

// ---------------------------------------------------------------------------
// 2. Patch helpers
// ---------------------------------------------------------------------------
const results = [];

function patchFile(relPath, hookName, transform, marker = MARKER) {
  const fullPath = path.join(MOBILE_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`[${hookName}] Missing file: ${relPath}`);
  }
  const original = fs.readFileSync(fullPath, "utf8");
  if (original.includes(marker)) {
    results.push({ relPath, hookName, status: "already-applied" });
    return;
  }
  const updated = transform(original);
  if (updated === original) {
    throw new Error(`[${hookName}] Transform produced no changes for ${relPath}`);
  }
  fs.writeFileSync(fullPath, updated, "utf8");
  results.push({ relPath, hookName, status: "applied" });
}

function replaceOnce(source, anchor, replacement, label) {
  const idx = source.indexOf(anchor);
  if (idx === -1) {
    throw new Error(`Anchor not found (${label}): ${JSON.stringify(anchor.slice(0, 120))}`);
  }
  const secondIdx = source.indexOf(anchor, idx + anchor.length);
  if (secondIdx !== -1) {
    throw new Error(`Anchor matched multiple times (${label}): ${JSON.stringify(anchor.slice(0, 120))}`);
  }
  return source.slice(0, idx) + replacement + source.slice(idx + anchor.length);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g"))];
  if (matches.length !== 1) {
    throw new Error(`Regex anchor (${label}) matched ${matches.length} times (expected 1)`);
  }
  return source.replace(regex, replacement);
}

// ---------------------------------------------------------------------------
// Hook 1: app.config.ts — side-by-side "T3 Code Glass" identity + plugin
// ---------------------------------------------------------------------------
patchFile("app.config.ts", "app-config-glass-variant", (src) => {
  let out = replaceOnce(
    src,
    `const APP_VARIANT = resolveAppVariant(repoEnv.APP_VARIANT);`,
    `${MARKER}
const APP_VARIANT = resolveAppVariant(repoEnv.APP_VARIANT);
const isLiquidGlassBuild = process.env.T3CODE_LIQUID_GLASS === "1";`,
    "app.config.ts APP_VARIANT",
  );

  out = replaceOnce(
    out,
    `const variant = VARIANT_CONFIG[APP_VARIANT];`,
    `const baseVariant = VARIANT_CONFIG[APP_VARIANT];
const variant = isLiquidGlassBuild
  ? {
      ...baseVariant,
      appName: "T3 Code Glass",
      scheme: "t3code-glass",
      androidPackage: "com.t3tools.t3code.glass",
      assets: {
        ...baseVariant.assets,
        androidAdaptiveBackgroundColor: "#0E1116",
        androidAdaptiveBackgroundImage: "./assets/android-icon-background-glass.png",
        androidSplashIcon: "./assets/android-splash-icon-glass.png",
        androidNotificationColor: "#8FA8C8",
      },
    }
  : baseVariant;`,
    "app.config.ts variant resolution",
  );

  out = replaceOnce(
    out,
    `enabled: repoEnv.T3CODE_MOBILE_UPDATES_ENABLED !== "0",`,
    `enabled: !isLiquidGlassBuild && repoEnv.T3CODE_MOBILE_UPDATES_ENABLED !== "0",`,
    "app.config.ts updates.enabled",
  );

  out = replaceOnce(
    out,
    `"./plugins/withAndroidTabletOrientation.cjs",`,
    `"./plugins/withAndroidTabletOrientation.cjs",
    ...(isLiquidGlassBuild ? ["./plugins/withAndroidLiquidGlass.cjs"] : []),`,
    "app.config.ts plugins",
  );

  out = replaceOnce(
    out,
    `  android: {
    icon: variant.assets.appIcon,
    package: variant.androidPackage,`,
    `  android: {
    icon: variant.assets.appIcon,
    package: variant.androidPackage,
    ...(isLiquidGlassBuild
      ? {
          versionCode:
            Number.parseInt(process.env.T3_GLASS_VERSION_CODE ?? "", 10) ||
            Math.floor(Date.now() / 60_000),
        }
      : {}),`,
    "app.config.ts android versionCode",
  );

  out = replaceOnce(
    out,
    `  extra: {
    appVariant: APP_VARIANT,`,
    `  extra: {
    appVariant: APP_VARIANT,
    ...(isLiquidGlassBuild
      ? {
          glassUpdater: {
            releaseRepo: process.env.T3_GLASS_RELEASE_REPO?.trim() || "abotmaker/t3-frosted-glass",
            upstreamSha: process.env.T3_GLASS_UPSTREAM_SHA?.trim() || null,
            versionCode:
              Number.parseInt(process.env.T3_GLASS_VERSION_CODE ?? "", 10) ||
              Math.floor(Date.now() / 60_000),
          },
        }
      : {}),`,
    "app.config.ts extra glassUpdater",
  );

  return out;
});

// ---------------------------------------------------------------------------
// Hook 2: src/App.tsx — scheme prefix + root LiquidGlassBackdrop
// ---------------------------------------------------------------------------
patchFile("src/App.tsx", "app-root-backdrop", (src) => {
  let out = replaceOnce(
    src,
    `import "../global.css";`,
    `${MARKER}
import { LiquidGlassBackdrop } from "./liquid-glass/LiquidGlassBackdrop";
import "../global.css";`,
    "App.tsx import",
  );

  out = replaceOnce(
    out,
    `"t3code-preview://",`,
    `"t3code-preview://",
    "t3code-glass://",`,
    "App.tsx linking prefixes",
  );

  out = replaceOnce(
    out,
    `const { themeAppearance } = useAppearancePreferences();`,
    `const { themeAppearance, themeVariables } = useAppearancePreferences();`,
    "App.tsx themeVariables",
  );

  out = replaceOnce(
    out,
    `<GestureHandlerRootView className="flex-1">`,
    `<GestureHandlerRootView className="flex-1">
        <LiquidGlassBackdrop
          dark={themeAppearance === "dark"}
          accentColor={themeVariables["--color-primary"]}
        >`,
    "App.tsx open LiquidGlassBackdrop",
  );

  out = replaceOnce(
    out,
    `      </GestureHandlerRootView>`,
    `        </LiquidGlassBackdrop>
      </GestureHandlerRootView>`,
    "App.tsx close LiquidGlassBackdrop",
  );

  return out;
});

// ---------------------------------------------------------------------------
// Hook 3: AppearancePreferencesProvider.tsx — apply Android liquid glass tokens
// ---------------------------------------------------------------------------
patchFile(
  "src/features/settings/appearance/AppearancePreferencesProvider.tsx",
  "appearance-glass-theme-variables",
  (src) => {
    let out = replaceOnce(
      src,
      `import { getMobileThemeRuntimeVariables } from "../../../lib/mobileThemeVariables";`,
      `${MARKER}
import { getMobileThemeRuntimeVariables } from "../../../lib/mobileThemeVariables";
import { applyLiquidGlassThemeVariables } from "../../../liquid-glass/liquidGlassTheme";`,
      "AppearancePreferencesProvider import",
    );

    out = replaceOnce(
      out,
      `    return themeIds[appearance] === "material-you" && palettes
      ? materialYouPaletteToMobileThemeVariables(palettes[appearance], appearance, base)
      : base;`,
      `    const resolved =
      themeIds[appearance] === "material-you" && palettes
        ? materialYouPaletteToMobileThemeVariables(palettes[appearance], appearance, base)
        : base;
    return Platform.OS === "android"
      ? applyLiquidGlassThemeVariables(resolved, appearance)
      : resolved;`,
      "AppearancePreferencesProvider resolveThemeVariablesByAppearance",
    );

    return out;
  },
);

// ---------------------------------------------------------------------------
// Hook 4: src/lib/nativeTheme.ts — safe compositing onto status-bar hex base
// ---------------------------------------------------------------------------
patchFile("src/lib/nativeTheme.ts", "native-theme-safe-base", (src) => {
  return replaceOnce(
    src,
    `      flattenThemeColor(color, colors["--color-screen"]),`,
    `${MARKER}
      flattenThemeColor(
        color,
        colors["--color-screen"].startsWith("#")
          ? colors["--color-screen"]
          : colors["--color-status-bar"].startsWith("#")
            ? colors["--color-status-bar"]
            : "#000000",
      ),`,
    "nativeTheme.ts flattenThemeColor base",
  );
});

// ---------------------------------------------------------------------------
// Hook 5: src/lib/useMobileNavigationTheme.ts — transparent stack background on Android
// ---------------------------------------------------------------------------
patchFile("src/lib/useMobileNavigationTheme.ts", "nav-theme-transparent-android", (src) => {
  let out = replaceOnce(
    src,
    `import { useMemo } from "react";`,
    `${MARKER}
import { useMemo } from "react";
import { Platform } from "react-native";`,
    "useMobileNavigationTheme Platform import",
  );

  out = replaceOnce(
    out,
    `background: variables[surface === "sidebar" ? "--color-drawer" : "--color-screen"],`,
    `background:
          Platform.OS === "android"
            ? "transparent"
            : variables[surface === "sidebar" ? "--color-drawer" : "--color-screen"],`,
    "useMobileNavigationTheme background",
  );

  return out;
});

// ---------------------------------------------------------------------------
// Hook 6: src/lib/androidNavigationStyle.ts — default to floating glass nav bar
// ---------------------------------------------------------------------------
patchFile("src/lib/androidNavigationStyle.ts", "android-floating-dock-default", (src) => {
  return replaceOnce(
    src,
    `  return (
    preference ??
    (manufacturer?.toLowerCase() === "samsung" || previewEnabled ? "one-ui" : "material")
  );`,
    `${MARKER}
  void manufacturer;
  void previewEnabled;
  return preference ?? "one-ui";`,
    "androidNavigationStyle default to floating dock",
  );
});

// ---------------------------------------------------------------------------
// Hook 7: createWorkspaceStackNavigator.android.tsx — every screen gets bloom backdrop
// ---------------------------------------------------------------------------
patchFile(
  "src/features/layout/createWorkspaceStackNavigator.android.tsx",
  "android-stack-screen-backdrop",
  (src) => {
    let out = replaceOnce(
      src,
      `import { BottomSheetContext } from "../../components/ui/BottomSheetContext";`,
      `${MARKER}
import { BottomSheetContext } from "../../components/ui/BottomSheetContext";
import { LiquidGlassBackdrop } from "../../liquid-glass/LiquidGlassBackdrop";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";`,
      "createWorkspaceStackNavigator imports",
    );

    out = replaceOnce(
      out,
      `function WorkspaceStackNavigator({`,
      `function LiquidGlassRouteFrame(props: { readonly children: React.ReactNode }) {
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

function WorkspaceStackNavigator({`,
      "createWorkspaceStackNavigator helper",
    );

    out = replaceOnce(
      out,
      `                ...(descriptor.options.presentation === "formSheet"
                  ? {
                      render: () => (
                        <BottomSheetContext value>
                          <RoutedFormSheetContext value>
                            {descriptor.render()}
                          </RoutedFormSheetContext>
                        </BottomSheetContext>
                      ),
                    }
                  : undefined),`,
      `                render: () =>
                  descriptor.options.presentation === "formSheet" ? (
                    <BottomSheetContext value>
                      <RoutedFormSheetContext value>
                        <LiquidGlassRouteFrame>{descriptor.render()}</LiquidGlassRouteFrame>
                      </RoutedFormSheetContext>
                    </BottomSheetContext>
                  ) : (
                    <LiquidGlassRouteFrame>{descriptor.render()}</LiquidGlassRouteFrame>
                  ),`,
      "createWorkspaceStackNavigator wrap descriptor.render",
    );

    return out;
  },
);

// ---------------------------------------------------------------------------
// Hook 8: src/components/ui/GlassSurface.tsx — route Android to GPU LiquidGlassSurface
// ---------------------------------------------------------------------------
patchFile("src/components/ui/GlassSurface.tsx", "glass-surface-android-native", (src) => {
  let out = replaceOnce(
    src,
    `import { GlassBackdrop } from "./GlassBackdrop";`,
    `${MARKER}
import { GlassBackdrop } from "./GlassBackdrop";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import type { GlassLookName } from "../../liquid-glass/nativeViews";`,
    "GlassSurface imports",
  );

  out = replaceOnce(
    out,
    `  readonly fallbackClassName?: string;
}`,
    `  readonly fallbackClassName?: string;
  readonly androidLook?: GlassLookName;
  readonly androidCornerRadius?: number;
}`,
    "GlassSurface props",
  );

  out = replaceOnce(
    out,
    `  fallbackClassName,
  className,`,
    `  fallbackClassName,
  androidLook,
  androidCornerRadius,
  className,`,
    "GlassSurface destructuring",
  );

  out = replaceOnce(
    out,
    `  return (
    <View
      {...props}
      ref={ref}
      className={cn(`,
    `  if (Platform.OS === "android") {
    return (
      <LiquidGlassSurface
        {...props}
        ref={ref}
        look={androidLook ?? (chrome === "none" ? "composer" : "card")}
        dark={isDarkMode}
        cornerRadius={androidCornerRadius}
        drawRim
        style={[
          {
            borderRadius: androidCornerRadius ?? MOBILE_SHAPE.glass,
            overflow: "hidden",
          },
          style,
        ]}
      >
        {children}
      </LiquidGlassSurface>
    );
  }

  return (
    <View
      {...props}
      ref={ref}
      className={cn(`,
    "GlassSurface Android branch",
  );

  return out;
});

// ---------------------------------------------------------------------------
// Hook 9: src/components/ComposerSurface.tsx — frosted liquid glass input capsule
// ---------------------------------------------------------------------------
patchFile("src/components/ComposerSurface.tsx", "composer-surface-liquid-glass", (src) => {
  let out = replaceOnce(
    src,
    `import { GlassSurface } from "./ui/GlassSurface";`,
    `${MARKER}
import { GlassSurface } from "./ui/GlassSurface";`,
    "ComposerSurface marker",
  );

  out = replaceOnce(
    out,
    `      <AnimatedGlassSurface
        chrome="none"
        fallbackColor={colors["--color-composer-surface"]}
        fallbackClassName="border border-composer-border"`,
    `      <AnimatedGlassSurface
        chrome="none"
        androidLook="composer"
        androidCornerRadius={targetBorderRadius}
        fallbackColor={colors["--color-composer-surface"]}
        fallbackClassName="border border-composer-border"`,
    "ComposerSurface androidLook",
  );

  return out;
});

// ---------------------------------------------------------------------------
// Hook 10: src/components/ui/Notice.tsx — enable glass on Android floating notices
// ---------------------------------------------------------------------------
patchFile("src/components/ui/Notice.tsx", "notice-android-glass", (src) => {
  return replaceOnce(
    src,
    `  if (props.floating && Platform.OS === "ios")`,
    `${MARKER}
  if (props.floating && (Platform.OS === "ios" || Platform.OS === "android"))`,
    "Notice floating Android glass",
  );
});

// ---------------------------------------------------------------------------
// Hook 11: ListSection / ListRow / ListChoiceRow / ListActionRow — Jarvoice Glass Cards
// (Preserves 100% of existing Settings & list layouts untouched!)
// ---------------------------------------------------------------------------
patchFile("src/components/ui/ListSection.tsx", "list-section-glass-card", (src) => {
  let out = replaceOnce(
    src,
    `import { AppText as Text } from "./AppText";`,
    `${MARKER}
import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { AppText as Text } from "./AppText";`,
    "ListSection imports",
  );

  out = replaceOnce(
    out,
    `export function ListSection(props: {
  readonly title?: string;
  readonly titleIcon?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: string;
}) {
  return (`,
    `export function ListSection(props: {
  readonly title?: string;
  readonly titleIcon?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: string;
}) {
  const { themeAppearance } = useAppearancePreferences();
  const cardRadius =
    Platform.OS === "android" ? MOBILE_SHAPE.group.android : MOBILE_SHAPE.group.ios;
  return (`,
    "ListSection appearance hook",
  );

  out = replaceOnce(
    out,
    `      <View
        className="overflow-hidden border-continuous bg-grouped-card"
        style={{
          borderRadius:
            Platform.OS === "android" ? MOBILE_SHAPE.group.android : MOBILE_SHAPE.group.ios,
        }}
      >
        {props.children}
      </View>`,
    `      {Platform.OS === "android" ? (
        <LiquidGlassSurface
          look="card"
          dark={themeAppearance === "dark"}
          cornerRadius={cardRadius}
        >
          {props.children}
        </LiquidGlassSurface>
      ) : (
        <View
          className="overflow-hidden border-continuous bg-grouped-card"
          style={{ borderRadius: cardRadius }}
        >
          {props.children}
        </View>
      )}`,
    "ListSection Android LiquidGlassSurface card",
  );

  return out;
});

patchFile("src/components/ui/ListRow.tsx", "list-row-transparent-android", (src) => {
  return replaceOnce(
    src,
    `className="bg-grouped-card"`,
    `${MARKER}
      className={Platform.OS === "android" ? "bg-transparent" : "bg-grouped-card"}`,
    "ListRow transparent on Android glass card",
  );
});

patchFile("src/components/ui/ListChoiceRow.tsx", "list-choice-row-transparent-android", (src) => {
  return replaceOnce(
    src,
    `className={cn("bg-grouped-card", props.separated && "border-t border-border-subtle")}`,
    `${MARKER}
      className={cn(
        Platform.OS === "android" ? "bg-transparent" : "bg-grouped-card",
        props.separated && "border-t border-border-subtle",
      )}`,
    "ListChoiceRow transparent on Android glass card",
  );
});

patchFile("src/components/ui/ListActionRow.tsx", "list-action-row-transparent-android", (src) => {
  return replaceOnce(
    src,
    `className="bg-grouped-card"`,
    `${MARKER}
      className={Platform.OS === "android" ? "bg-transparent" : "bg-grouped-card"}`,
    "ListActionRow transparent on Android glass card",
  );
});

// ---------------------------------------------------------------------------
// Hook 12: ScreenContent.tsx — continuous backdrop without opaque slab wrapper
// ---------------------------------------------------------------------------
patchFile("src/components/ui/ScreenContent.tsx", "screen-content-transparent-glass", (src) => {
  return replaceOnce(
    src,
    `  return (
    <View className={fitToContents ? "shrink bg-header" : "flex-1 bg-header"}>
      <View
        className={\`overflow-hidden rounded-t-[28px] \${SURFACE_CLASS_NAMES[surface]}\`}
        collapsable={false}
        onLayout={onLayout}
        style={{
          flexShrink: 1,
          flexGrow: fitToContents ? 0 : 1,
          flexBasis: fitToContents ? "auto" : 0,
          marginHorizontal: (insetHorizontal ?? layout.usesSplitView) ? 4 : 0,
        }}
      >
        {children}
      </View>
    </View>
  );`,
    `${MARKER}
  return (
    <View className={fitToContents ? "shrink bg-transparent" : "flex-1 bg-transparent"}>
      <View
        className={\`overflow-hidden \${SURFACE_CLASS_NAMES[surface]}\`}
        collapsable={false}
        onLayout={onLayout}
        style={{
          flexShrink: 1,
          flexGrow: fitToContents ? 0 : 1,
          flexBasis: fitToContents ? "auto" : 0,
          marginHorizontal: (insetHorizontal ?? layout.usesSplitView) ? 4 : 0,
        }}
      >
        {children}
      </View>
    </View>
  );`,
    "ScreenContent Android continuous backdrop",
  );
});

// ---------------------------------------------------------------------------
// Hook 13: Transparent Android app bars and consistent shared-slot title
// ---------------------------------------------------------------------------
patchFile("src/components/ui/NativeAppBar.android.tsx", "native-app-bar-transparent", (src) => {
  return replaceOnce(
    src,
    `containerColor: colors["--color-header"],`,
    `${MARKER}
          containerColor: "#00000000",`,
    "NativeAppBar transparent container",
  );
});

patchFile("src/features/layout/workspace/SharedSlotTitle.tsx", "android-shared-tab-title", (src) => {
  const out = replaceOnce(src, 'import { msg, useGT, useMessages }',
    `${MARKER}\nimport { msg, useGT, useMessages }`, "SharedSlotTitle import");
  return replaceOnce(
    out,
    `          className="font-t3-bold text-foreground"
          style={{ fontSize: 20 * scale, letterSpacing: -0.4 * scale }}`,
    `          textRole={Platform.OS === "android" ? "title" : undefined}
          className={Platform.OS === "android" ? "text-header-foreground" : "font-t3-bold text-foreground"}
          style={Platform.OS === "android" ? undefined : { fontSize: 20 * scale, letterSpacing: -0.4 * scale }}`,
    "SharedSlotTitle Android toolbar typography",
  );
});

// ---------------------------------------------------------------------------
// Hook 14: SearchField.tsx, Chip.tsx, ControlPill.tsx — frosted glass controls
// ---------------------------------------------------------------------------
patchFile("src/components/ui/SearchField.tsx", "search-field-glass-input", (src) => {
  let out = replaceOnce(
    src,
    `import { SymbolView } from "./AppSymbol";`,
    `${MARKER}
import { Platform } from "react-native";
import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { SymbolView } from "./AppSymbol";`,
    "SearchField imports",
  );

  out = replaceOnce(
    out,
    `  const { scale, mediumIconSize } = useAndroidControlSizing();
  return (
    <View
      className="min-w-0 flex-1 flex-row items-center rounded-full border border-input-border bg-input"
      style={{
        minHeight: Math.max(48, 42 * scale),
        gap: 7 * scale,
        paddingHorizontal: 10.5 * scale,
      }}
    >`,
    `  const { scale, mediumIconSize } = useAndroidControlSizing();
  const { themeAppearance } = useAppearancePreferences();
  const inner = (
    <View
      className={
        Platform.OS === "android"
          ? "min-w-0 flex-1 flex-row items-center"
          : "min-w-0 flex-1 flex-row items-center rounded-full border border-input-border bg-input"
      }
      style={{
        minHeight: Math.max(48, 42 * scale),
        gap: 7 * scale,
        paddingHorizontal: 12 * scale,
      }}
    >`,
    "SearchField open wrapper",
  );

  out = replaceOnce(
    out,
    `      ) : null}
    </View>
  );
}`,
    `      ) : null}
    </View>
  );
  if (Platform.OS === "android") {
    return (
      <LiquidGlassSurface
        look="input"
        dark={themeAppearance === "dark"}
        cornerRadius={999}
        style={{ flex: 1, minWidth: 0 }}
      >
        {inner}
      </LiquidGlassSurface>
    );
  }
  return inner;
}`,
    "SearchField close wrapper",
  );

  return out;
});

patchFile("src/components/ui/Chip.tsx", "chip-android-glass", (src) => {
  let out = replaceOnce(
    src,
    `import { Pressable, View } from "react-native";`,
    `${MARKER}
import { Platform, Pressable, View } from "react-native";
import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";`,
    "Chip imports",
  );

  out = replaceOnce(
    out,
    `  const small = props.size === "small";`,
    `  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const dark = (props.colorScheme ?? themeAppearance) === "dark";
  const small = props.size === "small";`,
    "Chip appearance",
  );

  out = replaceOnce(
    out,
    `  const iconColor = props.selected ? "accent-primary-foreground" : "accent-icon-muted";`,
    `  const selectedForeground = Platform.OS === "android" ? "accent-foreground" : "accent-primary-foreground";
  const iconColor = props.selected ? selectedForeground : "accent-icon-muted";`,
    "Chip Android selected icon color",
  );

  out = replaceOnce(
    out,
    `          props.selected ? "text-primary-foreground" : "text-foreground-muted",`,
    `          props.selected
            ? Platform.OS === "android"
              ? "text-foreground"
              : "text-primary-foreground"
            : "text-foreground-muted",`,
    "Chip Android selected text color",
  );

  out = replaceOnce(
    out,
    `    ) : (
      <View
        className={cn(
          layout,
          props.selected ? "bg-primary" : small ? "bg-grouped-card" : "bg-subtle",
        )}
      >
        {content}
      </View>
    );`,
    `    ) : Platform.OS === "android" ? (
      <LiquidGlassSurface
        look={props.selected ? "primary" : "tonal"}
        dark={dark}
        cornerRadius={999}
        accentColor={props.selected ? themeVariables["--color-primary"] : null}
        accentOpacity={props.selected ? 0.28 : null}
      >
        <View className={layout}>{content}</View>
      </LiquidGlassSurface>
    ) : (
      <View
        className={cn(
          layout,
          props.selected ? "bg-primary" : small ? "bg-grouped-card" : "bg-subtle",
        )}
      >
        {content}
      </View>
    );`,
    "Chip Android LiquidGlassSurface",
  );

  return out;
});

patchFile("src/components/ui/ControlPill.tsx", "control-pill-android-glass", (src) => {
  let out = replaceOnce(
    src,
    `import { useAndroidControlSizing } from "./useAndroidControlSizing";`,
    `${MARKER}
import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { useAndroidControlSizing } from "./useAndroidControlSizing";`,
    "ControlPill imports",
  );

  out = replaceOnce(
    out,
    `  const variant = props.variant ?? "circle";`,
    `  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const dark = themeAppearance === "dark";
  const variant = props.variant ?? "circle";`,
    "ControlPill appearance",
  );

  out = replaceOnce(
    out,
    `        : "accent-primary-foreground"`,
    `        : Platform.OS === "android"
          ? "accent-foreground"
          : "accent-primary-foreground"`,
    "ControlPill Android primary icon tint",
  );

  out = replaceOnce(
    out,
    `        : "text-primary-foreground"`,
    `        : Platform.OS === "android"
          ? "text-foreground"
          : "text-primary-foreground"`,
    "ControlPill Android primary label color",
  );

  out = replaceOnce(
    out,
    `  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityRole="button"
      onPress={props.activateOnPressIn ? handlePress : props.onPress}
      onPressIn={props.activateOnPressIn ? handlePressIn : undefined}
      onPressOut={props.activateOnPressIn ? handlePressOut : undefined}
      disabled={props.disabled}
      className={containerClassName}
    >
      {props.iconNode ? (
        <View className="h-4 w-4 items-center justify-center">{props.iconNode}</View>
      ) : props.icon ? (
        <SymbolView
          name={props.icon}
          size={smallIconSize}
          tintColorClassName={iconTintClassName}
          type="monochrome"
        />
      ) : null}
      {props.label ? <Text className={labelClassName}>{props.label}</Text> : null}
    </Pressable>
  );`,
    `  const innerContent = (
    <>
      {props.iconNode ? (
        <View className="h-4 w-4 items-center justify-center">{props.iconNode}</View>
      ) : props.icon ? (
        <SymbolView
          name={props.icon}
          size={smallIconSize}
          tintColorClassName={iconTintClassName}
          type="monochrome"
        />
      ) : null}
      {props.label ? <Text className={labelClassName}>{props.label}</Text> : null}
    </>
  );

  if (Platform.OS === "android") {
    const glassLook = variant === "primary" ? "primary" : "tonal";
    const accentColor =
      variant === "danger"
        ? themeVariables["--color-danger-foreground"]
        : variant === "primary"
          ? themeVariables["--color-primary"]
          : null;
    return (
      <Pressable
        accessibilityLabel={props.accessibilityLabel ?? props.label}
        accessibilityRole="button"
        onPress={props.activateOnPressIn ? handlePress : props.onPress}
        onPressIn={props.activateOnPressIn ? handlePressIn : undefined}
        onPressOut={props.activateOnPressIn ? handlePressOut : undefined}
        disabled={props.disabled}
        style={props.disabled ? { opacity: 0.4 } : undefined}
      >
        <LiquidGlassSurface
          look={glassLook}
          dark={dark}
          cornerRadius={999}
          accentColor={accentColor}
          accentOpacity={accentColor ? 0.24 : null}
        >
          <View
            className={cn(
              isCircle
                ? "h-11 w-11 items-center justify-center"
                : variant === "primary"
                  ? "h-11 flex-row items-center justify-center gap-2 px-5"
                  : "h-11 flex-row items-center justify-center gap-2 px-3.5",
              props.className,
            )}
          >
            {innerContent}
          </View>
        </LiquidGlassSurface>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityRole="button"
      onPress={props.activateOnPressIn ? handlePress : props.onPress}
      onPressIn={props.activateOnPressIn ? handlePressIn : undefined}
      onPressOut={props.activateOnPressIn ? handlePressOut : undefined}
      disabled={props.disabled}
      className={containerClassName}
    >
      {innerContent}
    </Pressable>
  );`,
    "ControlPill Android LiquidGlassSurface",
  );

  return out;
});

// ---------------------------------------------------------------------------
// Hook 15: AndroidWorkspaceNavigation.android.tsx — BitChord Floating Liquid Glass Dock!
// ---------------------------------------------------------------------------
patchFile(
  "src/features/layout/workspace/AndroidWorkspaceNavigation.android.tsx",
  "android-floating-glass-dock",
  (src) => {
    let out = replaceOnce(
      src,
      `import { FLOATING_TABS, floatingTabsMetrics } from "./floating-workspace-tabs";`,
      `${MARKER}
import { FLOATING_TABS, floatingTabsMetrics } from "./floating-workspace-tabs";
import { LiquidGlassDock } from "../../../liquid-glass/LiquidGlassDock";
import { NativeLiquidGlassDockView } from "../../../liquid-glass/nativeViews";`,
      "AndroidWorkspaceNavigation imports",
    );

    out = replaceOnce(
      out,
      `  return (
    <View
      style={
        // The rail draws its own surface and pads the system bars; while open it spans the
        // workspace, so the rest of it must stay transparent.
        rail
          ? { flex: 1 }
          : floating
            ? undefined
            : { backgroundColor: containerColor, paddingBottom: insets.bottom }
      }
    >`,
      `  const handleTabSelection = (tab: AndroidWorkspaceNavigationTab) => {
    Keyboard.dismiss();
    if (tab !== "settings") workspace.dispatch({ type: "select", tab });
    const rootState = rootNavigationRef.getRootState();
    if (root && rootState) {
      navigation.dispatch({
        ...CommonActions.reset(
          androidWorkspaceTabNavigationState(rootState, tab, layout.usesSplitView),
        ),
        target: root.key,
      });
    }
    props.onSelect?.();
  };

  if (!rail && NativeLiquidGlassDockView) {
    const dark = themeAppearance === "dark";
    return (
      <View style={floating ? undefined : { paddingBottom: insets.bottom }}>
        <LiquidGlassDock
          tabs={tabs}
          selectedTab={selectedTab}
          dark={dark}
          floating={floating}
          textScale={scale}
          selectedColor={dark ? "#F5F7FA" : "#181B20"}
          unselectedColor={dark ? "rgba(240, 242, 245, 0.62)" : "rgba(24, 27, 32, 0.56)"}
          accentColor={colors["--color-primary"]}
          onTabSelected={(tab) => handleTabSelection(tab as AndroidWorkspaceNavigationTab)}
          style={
            floating
              ? {
                  width: metrics.pill + 2 * FLOATING_TABS.shadow,
                  height: metrics.height + 2 * FLOATING_TABS.shadow,
                }
              : { height: 74 * Math.max(1, scale), width: "100%" }
          }
        />
      </View>
    );
  }

  return (
    <View
      style={
        // The rail draws its own surface and pads the system bars; while open it spans the
        // workspace, so the rest of it must stay transparent.
        rail
          ? { flex: 1 }
          : floating
            ? undefined
            : { backgroundColor: containerColor, paddingBottom: insets.bottom }
      }
    >`,
      "AndroidWorkspaceNavigation LiquidGlassDock branch",
    );

    out = replaceOnce(
      out,
      `<View style={floating ? undefined : { paddingBottom: insets.bottom }}>`,
      `<View
        style={
          floating
            ? props.reserveComposeSlot
              ? { alignSelf: "flex-start" }
              : { alignSelf: "center" }
            : { paddingBottom: insets.bottom }
        }
      >`,
      "AndroidWorkspaceNavigation align glass dock",
    );

    out = replaceOnce(
      out,
      `  readonly rail?: boolean;`,
      `  readonly rail?: boolean;
  readonly reserveComposeSlot?: boolean;`,
      "AndroidWorkspaceNavigation compose slot prop",
    );

    out = replaceOnce(
      out,
      `  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"`,
      `  const insets = useSafeAreaInsets();
  const workspace = useWorkspaceTabs();
  const settingsOpen = useAndroidWorkspaceRoot()?.settingsOpen ?? false;
  const { hasConnections } = useWorkspaceConnectionState();
  const reserveComposeSlot =
    workspace?.state.selectedTab === "threads" && !settingsOpen && hasConnections;
  return (
    <View
      pointerEvents="box-none"`,
      "FloatingWorkspaceTabs compose visibility",
    );

    out = replaceOnce(
      out,
      `        left: Math.max(insets.left, FLOATING_TABS.edge) - FLOATING_TABS.shadow,
        right: 0,`,
      `        left: Math.max(insets.left, FLOATING_TABS.edge) - FLOATING_TABS.shadow,
        right: NativeLiquidGlassDockView && !reserveComposeSlot
          ? Math.max(insets.right, FLOATING_TABS.edge) - FLOATING_TABS.shadow
          : 0,`,
      "FloatingWorkspaceTabs center within pane",
    );

    out = replaceOnce(
      out,
      `      <AndroidWorkspaceNavigation {...props} floating />`,
      `      <AndroidWorkspaceNavigation {...props} floating reserveComposeSlot={reserveComposeSlot} />`,
      "FloatingWorkspaceTabs pass compose visibility",
    );

    return out;
  },
);

// ---------------------------------------------------------------------------
// Hook 16: ThreadFeed.tsx — Liquid Glass user message bubbles on Android
// ---------------------------------------------------------------------------
patchFile("src/features/home/HomeScreen.tsx", "android-thread-row-layout", (src) => {
  const out = replaceOnce(src, 'import { THREAD_LIST_ROW_LAYOUT }',
    `${MARKER}\nimport { THREAD_LIST_ROW_LAYOUT }`, "HomeScreen animation import");
  return replaceOnce(
    out,
    `                itemLayoutAnimation={THREAD_LIST_ROW_LAYOUT}`,
    `                itemLayoutAnimation={Platform.OS === "android" ? undefined : THREAD_LIST_ROW_LAYOUT}`,
    "HomeScreen keep recycled Android rows at their measured positions",
  );
});

patchFile("src/features/threads/ThreadFeed.tsx", "thread-feed-glass-user-bubble", (src) => {
  let out = replaceOnce(
    src,
    `import { cn } from "../../lib/cn";`,
    `${MARKER}
import { cn } from "../../lib/cn";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";`,
    "ThreadFeed import LiquidGlassSurface",
  );

  // Wrap Android user bubble container in LiquidGlassSurface(look="bubble", cornerRadius=20)
  out = replaceOnce(
    out,
    `          {hasBubble ? (
            <View
              className="min-w-0 rounded-[20px]"
              style={{
                backgroundColor: userBubbleColor,
                maxWidth: props.duoColumns ? "85%" : props.userBubbleMaxWidth,
                ...(!bubbleBodyVisible
                  ? null
                  : hasReviewCommentContext
                    ? { width: props.reviewCommentBubbleWidth }
                    : hasWideBlock || foldExpanded
                      ? { width: props.duoColumns ? "85%" : props.userBubbleMaxWidth }
                      : null),
              }}
            >`,
    `          {hasBubble ? (
            <LiquidGlassSurface
              look="bubble"
              dark={props.themeAppearance === "dark"}
              cornerRadius={20}
              enabled={Platform.OS === "android"}
              style={{
                minWidth: 0,
                borderRadius: 20,
                backgroundColor: Platform.OS === "android" ? undefined : userBubbleColor,
                maxWidth: props.duoColumns ? "85%" : props.userBubbleMaxWidth,
                ...(!bubbleBodyVisible
                  ? null
                  : hasReviewCommentContext
                    ? { width: props.reviewCommentBubbleWidth }
                    : hasWideBlock || foldExpanded
                      ? { width: props.duoColumns ? "85%" : props.userBubbleMaxWidth }
                      : null),
              }}
            >`,
    "ThreadFeed open user bubble",
  );

  // Close the matching </View> right after user bubble children. Let's anchor safely on the
  // exact closing sequence right after bubbleBodyVisible!
  const openIdx = out.indexOf(`<LiquidGlassSurface\n              look="bubble"`);
  if (openIdx === -1) throw new Error("ThreadFeed: failed to locate inserted LiquidGlassSurface");
  // Find the matching </View> before `) : null}` that closes `{hasBubble ? (`
  const closeAnchor = `            </View>
          ) : null}`;
  const closeIdx = out.indexOf(closeAnchor, openIdx);
  if (closeIdx === -1) {
    throw new Error("ThreadFeed: failed to locate closing </View> for user bubble");
  }
  out =
    out.slice(0, closeIdx) +
    `            </LiquidGlassSurface>
          ) : null}` +
    out.slice(closeIdx + closeAnchor.length);

  return out;
});

// Keep the live source below both the floating oval header and floating dock in the same route host.
patchFile("src/features/layout/workspace/WorkspaceRootScreen.android.tsx", "android-workspace-live-glass-source", (src) => {
  let out = replaceOnce(
    src,
    `import { useGT } from "gt-react-native";`,
    `${MARKER}
import { LiquidGlassSource } from "../../../liquid-glass/LiquidGlassSource";
import { useGT } from "gt-react-native";`,
    "workspace live glass import",
  );
  out = replaceOnce(
    out,
    `        <SafeAreaInsetsContext`,
    `        <WorkspaceAppBarScope enabled={!layout.usesSplitView && enabled.length > 0}>
          <LiquidGlassSource style={{ flex: 1 }}>
            <SafeAreaInsetsContext`,
    "workspace floating header scope and content source",
  );
  out = replaceOnce(
    out,
    `          ) : (
            <WorkspaceAppBarScope enabled={!layout.usesSplitView}>
              <WorkspaceTabPanes`,
    `          ) : (
              <WorkspaceTabPanes`,
    "workspace remove inner app bar scope open",
  );
  out = replaceOnce(
    out,
    `              />
            </WorkspaceAppBarScope>
          )}
        </SafeAreaInsetsContext>`,
    `              />
          )}
            </SafeAreaInsetsContext>
          </LiquidGlassSource>
        </WorkspaceAppBarScope>`,
    "workspace close outer app bar scope and source before dock",
  );
  return out;
});

patchFile("src/features/threads/ThreadDetailScreen.tsx", "android-thread-live-glass-source", (src) => {
  let out = `${MARKER}
import { LiquidGlassSource } from "../../liquid-glass/LiquidGlassSource";
${src}`;
  out = replaceOnce(
    out,
    `      ) : showContent ? (
        <View
          style={{ flex: 1 }}
          onTouchStart={handleFeedTouchStart}`,
    `      ) : showContent ? (
        <LiquidGlassSource
          style={{ flex: 1 }}
          onTouchStart={handleFeedTouchStart}`,
    "thread feed content before the composer",
  );
  return replaceOnce(
    out,
    `          </RenderErrorBoundary>
        </View>
      ) : (
        <View className="flex-1" />`,
    `          </RenderErrorBoundary>
        </LiquidGlassSource>
      ) : (
        <View className="flex-1" />`,
    "thread composer outside the source",
  );
});

// The Settings and split-view Usage docks live beside the navigator, outside the route's backdrop.
patchFile("src/features/layout/AdaptiveWorkspaceLayout.tsx", "android-settings-live-glass-source", (src) => {
  let out = replaceOnce(
    src,
    `import { SettingsWorkspaceLayout } from "../settings/SettingsWorkspaceLayout";`,
    `${MARKER}
import { LiquidGlassSource } from "../../liquid-glass/LiquidGlassSource";
import { SettingsWorkspaceLayout } from "../settings/SettingsWorkspaceLayout";`,
    "adaptive workspace glass import",
  );
  return replaceOnce(
    out,
    `                <View className="flex-1">
                  <PaneContext value="content">
                    <SettingsWorkspaceLayout>{children}</SettingsWorkspaceLayout>
                  </PaneContext>
                </View>`,
    `                <LiquidGlassSource
                  enabled={floatingTabsEnabled && (compactAndroidSettings || (layout.usesSplitView && workspacePage))}
                  style={{ flex: 1 }}
                >
                  <PaneContext value="content">
                    <SettingsWorkspaceLayout>{children}</SettingsWorkspaceLayout>
                  </PaneContext>
                </LiquidGlassSource>`,
    "settings content below its floating dock",
  );
});

patchFile("src/components/ui/RadioIndicator.android.tsx", "android-glass-radio-indicator", (src) => {
  let out = replaceOnce(
    src,
    'import { useControlTheme } from "./useControlTheme";',
    MARKER + '\nimport { useControlTheme } from "./useControlTheme";',
    "radio glass marker",
  );
  out = replaceOnce(
    out,
    "const { colors, systemColorsActive } = useControlTheme();",
    'const { colors, colorScheme, systemColorsActive } = useControlTheme();\n  const dark = colorScheme === "dark";',
    "radio appearance",
  );
  out = replaceOnce(
    out,
    "systemColorsActive\n              ? {}",
    "false && systemColorsActive\n              ? {}",
    "radio system colors",
  );
  return replaceOnce(
    out,
    'selectedColor: colors["--color-primary-text"],',
    'selectedColor: dark ? "#FFFFFF" : "#181B20",',
    "radio selected color",
  );
});

patchFile("src/features/usage/UsageRouteScreen.tsx", "android-glass-usage-charts", (src) => {
  let out = replaceOnce(
    src,
    'import { UsageDailyChart } from "./UsageDailyChart";',
    MARKER + '\nimport { UsageCard } from "./UsageCard";\nimport { UsageDailyChart } from "./UsageDailyChart";',
    "usage chart glass card import",
  );
  out = replaceRegexOnce(
    out,
    /<View className="rounded-\[24px\] border-continuous bg-grouped-card p-4">(\s+<UsageSummary merged=\{merged\} metric=\{metric\} \/>\s+)<\/View>/,
    "<UsageCard>$1</UsageCard>",
    "wide usage summary glass card",
  );
  out = replaceRegexOnce(
    out,
    /<View\s+className=\{[^}\n]*gap-4 rounded-\[24px\] border-continuous bg-grouped-card p-4[^\n]+\}\s*>/,
    '<UsageCard className={cn("gap-4", props.fill && "flex-1")}>',
    "usage chart glass card",
  );
  return replaceOnce(
    out,
    "    </View>\n  );\n}\n\nfunction UsageSummary",
    "    </UsageCard>\n  );\n}\n\nfunction UsageSummary",
    "usage chart glass card closing tag",
  );
});

patchFile("src/features/usage/UsageLimitsPooled.tsx", "android-glass-usage-limits", (src) => {
  let out = replaceRegexOnce(
    src,
    /import \{ (Linking, )?Pressable, View \} from "react-native";/,
    'import { $1Platform, Pressable, View } from "react-native";',
    "usage limits React Native imports",
  );
  out = replaceOnce(
    out,
    'import { usageProviderKind, useProviderColors } from "./usageProviders";',
    [
      MARKER,
      'import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";',
      'import { UsageCard } from "./UsageCard";',
      'import { usageProviderKind, useProviderColors } from "./usageProviders";',
    ].join("\n"),
    "usage limits glass imports",
  );
  out = replaceOnce(
    out,
    "  const [barWidth, setBarWidth] = useState(0);\n  // Each segment",
    '  const [barWidth, setBarWidth] = useState(0);\n' +
      "  const { themeAppearance } = useAppearancePreferences();\n" +
      '  const meterColor = Platform.OS === "android" ? (themeAppearance === "dark" ? "#FFFFFF" : "#181B20") : null;\n' +
      "  // Each segment",
    "usage meter appearance",
  );
  out = replaceOnce(
    out,
    "color={normalizeProviderAccentColor(account.accentColor) ?? color}",
    "color={meterColor ?? normalizeProviderAccentColor(account.accentColor) ?? color}",
    "usage meter fill",
  );
  out = replaceOnce(
    out,
    "const segmentColor = normalizeProviderAccentColor(account.accentColor) ?? color;",
    "const segmentColor = meterColor ?? normalizeProviderAccentColor(account.accentColor) ?? color;",
    "usage meter legend",
  );
  for (const [layout, firstChild] of [
    ["flex-row items-center gap-6", '<View className="w-44 gap-1">{summary}</View>'],
    ["gap-3", "{summary}"],
    ["gap-3", '<Text className="text-sm font-t3-medium text-foreground">{window.label}</Text>'],
    ["gap-2", '<Text className="text-sm font-t3-medium text-foreground">'],
    ["gap-3", '<Text className="text-sm font-t3-medium text-foreground">\n                  <T>Reset credits</T>'],
  ]) {
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const opening = '<View className="' + layout + ' rounded-[24px] border-continuous bg-grouped-card p-4">';
    const card = new RegExp("^([ \\t]*)" + escape(opening) + "(\\s+" +
      escape(firstChild) + "[\\s\\S]*?)^\\1</View>", "m");
    out = replaceRegexOnce(
      out,
      card,
      '$1<UsageCard className="' + layout + '">$2$1</UsageCard>',
      "usage limits glass card " + firstChild,
    );
  }
  return out;
});

const compactUsageMarker = "/* t3-liquid-glass: compact-usage */";
patchFile("src/features/usage/UsageLimitsPooled.tsx", "android-compact-usage-limits", (src) => {
  let out = replaceOnce(
    src,
    '  const meterColor = Platform.OS === "android" ? (themeAppearance === "dark" ? "#FFFFFF" : "#181B20") : null;',
    '  const meterColor = Platform.OS === "android" ? (themeAppearance === "dark" ? "#FFFFFF" : "#181B20") : null;\n' +
      "  " + compactUsageMarker + '\n  const compact = Platform.OS === "android" && !wide;\n' +
      '  const barHeight = wide ? "h-9" : compact ? "h-6" : "h-7";',
    "compact usage meter height",
  );
  out = replaceOnce(
    out,
    'className={wide ? "h-9 min-w-0 flex-1" : "h-7 min-w-0 flex-1"}',
    'className={barHeight + " min-w-0 flex-1"}',
    "compact empty meter segment",
  );
  out = replaceOnce(
    out,
    'className={wide ? "h-9 min-w-0 flex-1 rounded-md" : "h-7 min-w-0 flex-1 rounded-md"}',
    'className={barHeight + " min-w-0 flex-1 rounded-md"}',
    "compact meter segment",
  );
  out = replaceOnce(
    out,
    '<UsageCard className="gap-3">\n      {summary}',
    '<UsageCard compact={compact} className={compact ? "gap-1.5" : "gap-3"}>\n      {summary}',
    "compact usage card padding",
  );
  return replaceOnce(
    out,
    '<Fragment key={pool.driver}>\n            <View className="gap-3">',
    '<Fragment key={pool.driver}>\n            <View className={Platform.OS === "android" && !wide ? "gap-2" : "gap-3"}>',
    "compact usage card spacing",
  );
}, compactUsageMarker);

// Keep the controls on the existing renderer while preserving their upstream behavior.
patchFile("src/components/ui/SecretTextInput.android.tsx", "android-secret-input-glass", (src) => {
  let out = replaceOnce(src, 'import { SecretRevealButton }', `${MARKER}
import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { SecretRevealButton }`, "secret input imports");
  out = replaceOnce(out, "  const theme = useUniwindTheme();", `  const theme = useUniwindTheme();
  const { themeAppearance } = useAppearancePreferences();`, "secret input theme");
  out = replaceRegexOnce(out, /    <View(\s+className=)/, `    <LiquidGlassSurface look="input" dark={themeAppearance === "dark"} cornerRadius={16}$1`, "secret input frame");
  out = replaceOnce(out, " rounded-2xl border border-input-border bg-input", "", "secret input opaque background");
  out = replaceOnce(out, "    </View>", "    </LiquidGlassSurface>", "secret input frame end");
  return out.replace("processColor, View,", "processColor,");
});

patchFile("src/components/ComposerToolbar.tsx", "android-composer-toolbar-glass", (src) => {
  const start = src.indexOf("export function ComposerToolbarButton(");
  if (start === -1) throw new Error("Missing composer toolbar button");
  const imports = replaceOnce(src.slice(0, start), 'import { cn } from "../lib/cn";', `${MARKER}
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { LiquidGlassSurface } from "../liquid-glass/LiquidGlassSurface";
import { cn } from "../lib/cn";`, "composer toolbar button imports");
  let button = replaceOnce(src.slice(start), '  const variant = props.variant ?? "default";', `  const variant = props.variant ?? "default";
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const android = Platform.OS === "android";
  const emphasized = !props.disabled && (variant === "primary" || props.active === true);`, "composer toolbar button theme");
  button = replaceOnce(button, '        variant === "primary" && "shadow-lg', '        !android && variant === "primary" && "shadow-lg', "composer toolbar button shadow");
  button = replaceRegexOnce(button, /        variant === "primary"\n          \? props.disabled/, '        android ? "border-transparent bg-transparent" : variant === "primary"\n          ? props.disabled', "composer toolbar button fill");
  button = replaceOnce(button, '        variant === "default"\n', '        !android && (variant === "default"\n', "composer toolbar button border");
  button = replaceOnce(button, '              : "border-primary-foreground/20",', '              : "border-primary-foreground/20"),', "composer toolbar button border end");
  button = replaceOnce(button, '      {props.iconNode ? (', `      {android ? (
        <LiquidGlassSurface
          pointerEvents="none"
          look={emphasized ? "primary" : "tonal"}
          dark={themeAppearance === "dark"}
          cornerRadius={999}
          accentColor={variant === "danger" ? themeVariables["--color-danger-foreground"] : emphasized ? themeVariables["--color-primary"] : null}
          accentOpacity={variant === "danger" || emphasized ? 0.24 : null}
          className="absolute inset-0"
        />
      ) : null}
      {props.iconNode ? (`, "composer toolbar button glass");
  button = button.replaceAll('"accent-primary-foreground"', 'android ? "accent-foreground" : "accent-primary-foreground"');
  button = button.replaceAll('"text-primary-foreground"', 'android ? "text-foreground" : "text-primary-foreground"');
  return imports + button;
});

// This section was added upstream after the initial Glass release.
const projectRepositoriesPath = "src/features/settings/ProjectRepositoriesSection.tsx";
if (fs.existsSync(path.join(MOBILE_DIR, projectRepositoriesPath))) {
  patchFile(projectRepositoriesPath, "android-project-repository-controls", (src) => {
    let out = replaceOnce(src, 'import { Pressable } from "react-native";', `${MARKER}
import { Platform, Pressable } from "react-native";
import { Button } from "../../components/ui/Button";`, "project repository button import");
    return replaceOnce(out, 'folder.discovered === true ? undefined : (', `folder.discovered === true ? undefined : Platform.OS === "android" ? (
              <Button
                accessibilityLabel={gt("Remove {name} from the project", { name: folder.name })}
                label={gt("Remove", { $context: "verb, removes a folder from the project" })}
                size="compact"
                tone="danger"
                disabled={!canEdit || isBusy}
                onPress={() => remove(folder)}
              />
            ) : (`, "project repository remove accessory");
  });
}

// These screens first appeared after the original Glass release.
for (const [file, name, transform] of [
  ["ReadOnlyComposerBar.tsx", "android-read-only-composer-glass", (src) => {
    let out = replaceOnce(src, 'import { View } from "react-native";', `${MARKER}
import { Platform, View } from "react-native";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";`, "read-only composer imports");
    return replaceOnce(out, '  return (', `  const { themeAppearance } = useAppearancePreferences();
  if (Platform.OS === "android") {
    return (
      <LiquidGlassSurface
        look="composer"
        dark={themeAppearance === "dark"}
        cornerRadius={20}
        className="flex-row items-center gap-3 py-2 pe-2 ps-4"
      >
        {props.children}
      </LiquidGlassSurface>
    );
  }
  return (`, "read-only composer surface");
  }],
  ["McpSignInSheet.tsx", "android-mcp-sign-in-glass", (src) => {
    let out = replaceOnce(src, 'import { ScrollView } from "react-native";', `${MARKER}
import { Platform, ScrollView } from "react-native";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";`, "MCP sign-in imports");
    out = replaceOnce(out, '  const insets = useSafeAreaInsets();', `  const insets = useSafeAreaInsets();
  const { themeAppearance } = useAppearancePreferences();
  const android = Platform.OS === "android";`, "MCP sign-in theme");
    out = replaceOnce(out, '        className="flex-1 bg-sheet-solid"', '        className="flex-1 bg-sheet-solid android:bg-transparent"', "MCP sign-in sheet backdrop");
    out = replaceOnce(out, '        {url !== null ? (\n          <TextInput', `        {url !== null ? (
          <CallbackInput
            android={android}
            dark={themeAppearance === "dark"}`, "MCP sign-in callback input");
    return out + `
function CallbackInput({ android, dark, ...props }: React.ComponentProps<typeof TextInput> & {
  readonly android: boolean;
  readonly dark: boolean;
}) {
  if (!android) return <TextInput {...props} />;
  return (
    <LiquidGlassSurface look="input" dark={dark} cornerRadius={16}>
      <TextInput {...props} className="border-0 bg-transparent" />
    </LiquidGlassSurface>
  );
}
`;
  }],
  ["LinkedThreadSheet.tsx", "android-linked-thread-glass", (src) => {
    let out = replaceOnce(src, 'import { AppState, Pressable, ScrollView, View } from "react-native";', `${MARKER}
import { AppState, Platform, Pressable, ScrollView, View } from "react-native";
import { LiquidGlassSurface } from "../../liquid-glass/LiquidGlassSurface";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";`, "linked thread imports");
    out = replaceOnce(out, '    <View className="max-w-[88%] self-end rounded-2xl bg-user-bubble px-3.5 py-2.5">', '    <LinkedUserBubble>', "linked user bubble");
    out = replaceOnce(out, '    </View>\n  ) : (\n    <SelectableMarkdownText markdown={entry.message.text}', '    </LinkedUserBubble>\n  ) : (\n    <SelectableMarkdownText markdown={entry.message.text}', "linked user bubble end");
    out = replaceOnce(out, 'className={inInspector ? "flex-1 bg-screen" : "flex-1 bg-sheet"}', 'className={inInspector ? "flex-1 bg-screen android:bg-transparent" : "flex-1 bg-sheet android:bg-transparent"}', "linked thread backdrop");
    return out + `
function LinkedUserBubble({ children }: { readonly children: React.ReactNode }) {
  const { themeAppearance } = useAppearancePreferences();
  if (Platform.OS === "android") {
    return (
      <LiquidGlassSurface look="bubble" dark={themeAppearance === "dark"} cornerRadius={20}
        className="max-w-[88%] self-end px-3.5 py-2.5"
      >
        {children}
      </LiquidGlassSurface>
    );
  }
  return <View className="max-w-[88%] self-end rounded-2xl bg-user-bubble px-3.5 py-2.5">{children}</View>;
}
`;
  }],
]) {
  const relPath = "src/features/threads/" + file;
  if (fs.existsSync(path.join(MOBILE_DIR, relPath))) patchFile(relPath, name, transform);
}

const menuBackdropMarker = "/* t3-liquid-glass: menu-backdrop */";
patchFile("src/App.tsx", "app-menu-backdrop", (src) => {
  let out = replaceOnce(
    src,
    'import { LiquidGlassBackdrop } from "./liquid-glass/LiquidGlassBackdrop";',
    `${menuBackdropMarker}
import { LiquidGlassBackdrop } from "./liquid-glass/LiquidGlassBackdrop";
import { LiquidGlassMenuBackdrop } from "./liquid-glass/LiquidGlassMenuBackdrop";`,
    "root menu backdrop import",
  );
  return replaceRegexOnce(
    out,
    /^( +)(<GlobalVoiceInputControl>\n[\s\S]*?\n +<\/GlobalVoiceInputControl>)(\n +<OverlayPortalHost \/>)/m,
    (_, indent, content, portal) =>
      `${indent}<LiquidGlassMenuBackdrop>\n${indent}  ${content.replaceAll("\n", "\n  ")}\n${indent}</LiquidGlassMenuBackdrop>${portal}`,
    "navigation content before the overlay portal host",
  );
}, menuBackdropMarker);

patchFile("src/components/ui/OverlayPortal.tsx", "overlay-portal-presence", (src) =>
  replaceOnce(src, "export function OverlayPortalHost() {", `${MARKER}
function hasOverlay() {
  return snapshot.size > 0;
}

export function useHasOverlayPortal() {
  return useSyncExternalStore(subscribe, hasOverlay, hasOverlay);
}

export function OverlayPortalHost() {`, "overlay portal host"),
);

patchFile("src/components/ui/WorkspaceAppBar.android.tsx", "rounded-oval-floating-workspace-header", (src) => {
  let out = `${MARKER}
import {
  GLASS_HEADER_CONTENT_PADDING,
  LiquidGlassHeader,
} from "../../liquid-glass/LiquidGlassHeader";
import { GlassFloatingHeaderInsetContext } from "../../liquid-glass/GlassFloatingHeaderInset";
${src}`;
  out = replaceOnce(
    out,
    `export function WorkspaceAppBarScope(props: {
  readonly children: ReactNode;
  /** Off, panes draw their own bars; the children keep their place so toggling keeps their state. */
  readonly enabled?: boolean;
}) {
  const [store] = useState(createWorkspaceAppBarStore);
  const enabled = props.enabled ?? true;
  return (
    <WorkspaceAppBarStoreContext value={enabled ? store : null}>
      {enabled ? <WorkspaceAppBarHost /> : null}
      {props.children}
    </WorkspaceAppBarStoreContext>
  );
}`,
    `export function WorkspaceAppBarScope(props: {
  readonly children: ReactNode;
  /** Off, panes draw their own bars; the children keep their place so toggling keeps their state. */
  readonly enabled?: boolean;
}) {
  const [store] = useState(createWorkspaceAppBarStore);
  const enabled = props.enabled ?? true;
  const { height, paddingTop, paddingBottom } = useToolbarLayout();
  const floatingInset = enabled ? paddingTop + height + paddingBottom : 0;
  return (
    <WorkspaceAppBarStoreContext value={enabled ? store : null}>
      <GlassFloatingHeaderInsetContext value={floatingInset}>
        <View style={{ flex: 1 }}>
          {props.children}
          {enabled ? (
            <View
              pointerEvents="box-none"
              style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
            >
              <WorkspaceAppBarHost />
            </View>
          ) : null}
        </View>
      </GlassFloatingHeaderInsetContext>
    </WorkspaceAppBarStoreContext>
  );
}`,
    "WorkspaceAppBarScope floating overlay",
  );
  return replaceOnce(
    out,
    '<View className="bg-header" style={{ paddingTop, paddingBottom }}>\n      {searching ? (',
    '<View style={{ paddingTop, paddingBottom, paddingHorizontal: GLASS_HEADER_CONTENT_PADDING }}>\n      <LiquidGlassHeader top={paddingTop} bottom={paddingBottom} />\n      {searching ? (',
    "WorkspaceAppBar oval glass container",
  );
});

patchFile("src/components/ui/AndroidScreenHeader.android.tsx", "rounded-oval-screen-header", (src) => {
  const out = `${MARKER}
import {
  GLASS_HEADER_CONTENT_PADDING,
  LiquidGlassHeader,
} from "../../liquid-glass/LiquidGlassHeader";
${src}`;
  return replaceOnce(
    out,
    '      className="border-b border-header-border bg-header"\n      style={{\n        paddingTop,\n        paddingBottom,\n        borderBottomWidth: props.hideBottomBorder ? 0 : undefined,\n      }}\n    >',
    '      style={{ paddingTop, paddingBottom, paddingHorizontal: GLASS_HEADER_CONTENT_PADDING }}\n    >\n      <LiquidGlassHeader top={paddingTop} bottom={paddingBottom} />',
    "AndroidScreenHeader oval glass container",
  );
});

patchFile("src/components/ui/AppBar.android.tsx", "rounded-oval-search-app-bar", (src) => {
  const out = `${MARKER}
import {
  GLASS_HEADER_CONTENT_PADDING,
  LiquidGlassHeader,
} from "../../liquid-glass/LiquidGlassHeader";
${src}`;
  return replaceOnce(
    out,
    '        <View\n          className="border-b border-header-border bg-header"\n          // Match Material TopAppBar\'s 4dp icon inset so buttons stay where the bar drew them.\n          style={{\n            paddingTop,\n            paddingBottom,\n            paddingHorizontal: 4,\n            borderBottomWidth: props.hideBottomBorder ? 0 : undefined,\n          }}\n        >',
    '        <View style={{ paddingTop, paddingBottom, paddingHorizontal: GLASS_HEADER_CONTENT_PADDING + 4 }}>\n          <LiquidGlassHeader top={paddingTop} bottom={paddingBottom} />',
    "AppBar search oval glass container",
  );
});

patchFile("src/components/ui/AndroidAnchoredMenu.android.tsx", "in-window-glass-menu", (src) => {
  let out = replaceOnce(
    src,
    'import { Pressable, ScrollView, View } from "react-native";',
    `${MARKER}
import { BackHandler, Pressable, View } from "react-native";
import { useEffect, useEffectEvent } from "react";
import { LiquidGlassMenu } from "../../liquid-glass/LiquidGlassMenu";`,
    "glass menu imports",
  );
  out = replaceOnce(out, 'import { useHardwareBack } from "../../lib/backHandler";\n', '', "native popup back handler import");
  out = replaceOnce(
    out,
    '  readonly children: ReactNode | ((open: () => void) => ReactNode);',
    '  readonly children: ReactNode | ((open: () => void, expanded: boolean) => ReactNode);',
    "controlled menu trigger",
  );
  out = replaceRegexOnce(
    out,
    /  \/\/ Only the in-window \(keyboard\) presentation needs this;[\s\S]*?^  \}\);/m,
    `  const back = useEffectEvent(() => {
    if (path.length > 0) {
      setPath((current) => current.slice(0, -1));
    } else {
      close();
    }
    return true;
  });
  const expanded = anchor !== null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the open overlay handles Back ahead of the underlying route or sheet
  useEffect(() => {
    if (!expanded) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => back());
    return () => subscription.remove();
  }, [expanded]);`,
    "menu back handling",
  );
  out = replaceOnce(out, '{props.children(open)}', '{props.children(open, expanded)}', "expanded trigger state");
  out = replaceOnce(out, 'accessibilityState={triggerState}', 'accessibilityState={{ ...triggerState, expanded }}\n          disabled={triggerState?.disabled}', "trigger state");
  return replaceRegexOnce(
    out,
    /            \{local === null \? null : !anchor\.keyboardWasVisible \? \([\s\S]*?^            \)\}/m,
    `            {verticalPlacement && verticalPlacement.maxHeight > 0 ? (
              <LiquidGlassMenu
                scale={scale}
                style={{ position: "absolute", left, width: menuWidth, ...verticalPlacement }}
              >
                <MenuPopup
                  menuWidth={menuWidth}
                  actions={levelActions}
                  title={props.title}
                  parent={parent}
                  onPress={onPressItem}
                  onBack={() => setPath((current) => current.slice(0, -1))}
                />
              </LiquidGlassMenu>
            ) : null}`, 
    "in-window glass menu",
  );
});

patchFile("src/components/ui/MenuPopup.tsx", "inline-menu-props", (src) => {
  let out = replaceRegexOnce(src, /^  readonly anchor: \{[\s\S]*?^  \};\n/m, "", "native popup anchor");
  out = replaceOnce(out, "  readonly onClose: () => void;\n  readonly inline?: boolean;\n", "", "native popup dismissal props");
  return `${MARKER}\n${out}`;
});

patchFile("src/components/ui/MenuPopup.android.tsx", "inline-menu-content", (src) => {
  let out = replaceOnce(src, "  Box,\n", "", "native popup anchor box");
  out = replaceOnce(out, "  DropdownMenu,\n", "", "native popup window import");
  return replaceRegexOnce(out, /^export function MenuPopup\(props: MenuPopupProps\) \{[\s\S]*?^\}/m, `${MARKER}
export function MenuPopup(props: MenuPopupProps) {
  return (
    <NativeThemeHost ignoreSafeAreaKeyboardInsets matchContents style={{ width: props.menuWidth }}>
      <Column><MenuPopupItems {...props} /></Column>
    </NativeThemeHost>
  );
}`, "inline Compose menu items");
});

patchFile("src/components/ui/SplitButton.android.tsx", "split-button-glass-menu", (src) => {
  let out = replaceOnce(src, "  DropdownMenu,\n", "", "split native popup import");
  out = replaceOnce(out, 'import { useState } from "react";\n', '', "split menu state import");
  out = replaceOnce(out, 'import { MenuPopupItems } from "./MenuPopup.android";', `${MARKER}
import { AndroidAnchoredMenu } from "./AndroidAnchoredMenu.android";`, "split menu component import");
  out = replaceOnce(out, "  const { scale, iconSize, mediumIconSize, menuWidth } = useAndroidControlSizing();\n  const [expanded, setExpanded] = useState(false);", "  const { scale, iconSize, mediumIconSize } = useAndroidControlSizing();", "split menu local state");
  out = replaceRegexOnce(out, /^( +)<DropdownMenu[\s\S]*?<\/DropdownMenu>/m, (_, indent) => `${indent}<Icon
${indent}  source={require("../../../assets/icons/chevron-down.xml")}
${indent}  size={iconSize}
${indent}  modifiers={[rotate(expanded ? 180 : 0)]}
${indent}/>`, "split menu icon");
  out = replaceOnce(out, "            checked={expanded}\n            onCheckedChange={setExpanded}", "            checked={expanded && menuEnabled}\n            onCheckedChange={(checked) => { if (checked) open(); }}", "split menu trigger");
  return replaceRegexOnce(out, /^    <NativeThemeHost[\s\S]*?^    <\/NativeThemeHost>/m, (host) => `    <AndroidAnchoredMenu
      actions={props.actions}
      title={props.menuTitle}
      onPressAction={({ nativeEvent }) => props.onPressAction(nativeEvent.event)}
    >
      {(open, expanded) => (
${host.split("\n").map((line) => `    ${line}`).join("\n")}
      )}
    </AndroidAnchoredMenu>`, "split button shared menu");
});

patchFile("src/features/threads/ComposerCommandPopover.tsx", "composer-command-glass", (src) => {
  let out = replaceOnce(src, 'import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";', `${MARKER}
import { Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";`, "composer popover platform import");
  out = replaceOnce(out, "    borderRadius: 16,", '    borderRadius: Platform.OS === "android" ? 28 : 16,', "composer popover radius");
  return replaceOnce(out, '      glassEffectStyle="clear"', '      glassEffectStyle="clear"\n      androidLook="menu"', "composer popover material");
});

patchFile("src/features/keyboard/CommandPalette.tsx", "command-palette-glass-menu", (src) => {
  let out = replaceOnce(
    src,
    `  Modal,
  Pressable,`,
    `${MARKER}
  Modal,
  Platform,
  Pressable,`,
    "CommandPalette Platform import",
  );
  out = replaceOnce(
    out,
    `            <GlassSurface
              accessibilityViewIsModal
              className="bg-sheet"
              tintColorClassName="accent-sheet/20"
              fallbackColor={themeVariables["--color-sheet"]}
              style={{
                width: Math.min(600, width - 32 - bounds.left - bounds.right),
                height: Math.min(520, height - 80),
                borderRadius: 20,
              }}
            >`,
    `            <GlassSurface
              accessibilityViewIsModal
              androidLook="menu"
              className="bg-sheet"
              tintColorClassName="accent-sheet/20"
              fallbackColor={themeVariables["--color-sheet"]}
              style={{
                width: Math.min(600, width - 32 - bounds.left - bounds.right),
                height: Math.min(520, height - 80),
                borderRadius: Platform.OS === "android" ? 28 : 20,
              }}
            >`,
    "CommandPalette android menu glass",
  );
  return out;
});

// Floating oval header live-blur support across lists, Settings, Usage, and Threads.
const floatingHeaderMarker = "/* t3-liquid-glass: floating-header-inset */";

patchFile("src/features/settings/components/SettingsScreen.tsx", "settings-floating-oval-header", (src) => {
  let out = replaceOnce(
    src,
    'import { View } from "react-native";',
    `${MARKER}
import { Platform, View } from "react-native";
import { useToolbarLayout } from "../../../components/ui/useToolbarLayout";
import {
  GlassFloatingHeaderInsetContext,
  useGlassFloatingHeaderInset,
} from "../../../liquid-glass/GlassFloatingHeaderInset";
import { LiquidGlassSource } from "../../../liquid-glass/LiquidGlassSource";`,
    "SettingsScreen floating header imports",
  );
  out = replaceOnce(
    out,
    `  const surfaceClassName = workspaceRoot || cover ? "bg-screen" : "bg-sheet";

  return (
    <View collapsable={false} className={\`flex-1 \${surfaceClassName}\`}>
      <AppBar
        title={props.title}
        actions={props.actions}
        refresh={props.refresh}
        search={props.search}
        trailing={props.trailing}
        menus={props.menus}
        onBack={workspaceRoot ? undefined : back}
        guardBack={props.guardBack}
        hideBottomBorder
      />
      <ScreenScrollViewBottomInset value={deviceType === "pad" || compactTabs ? 80 : 0}>
        <ScreenScrollViewSurface value={surfaceClassName}>
          <SettingsScreenContent>{props.children}</SettingsScreenContent>
        </ScreenScrollViewSurface>
      </ScreenScrollViewBottomInset>
    </View>
  );`,
    `  const surfaceClassName = workspaceRoot || cover ? "bg-screen" : "bg-sheet";
  const inheritedHeaderInset = useGlassFloatingHeaderInset();
  const toolbar = useToolbarLayout();
  const floatOwnBar = Platform.OS === "android" && inheritedHeaderInset === 0;
  const ownHeaderInset = floatOwnBar
    ? toolbar.paddingTop + toolbar.height + toolbar.paddingBottom
    : inheritedHeaderInset;

  const appBar = (
    <AppBar
      title={props.title}
      actions={props.actions}
      refresh={props.refresh}
      search={props.search}
      trailing={props.trailing}
      menus={props.menus}
      onBack={workspaceRoot ? undefined : back}
      guardBack={props.guardBack}
      hideBottomBorder
    />
  );

  const body = (
    <ScreenScrollViewBottomInset value={deviceType === "pad" || compactTabs ? 80 : 0}>
      <ScreenScrollViewSurface value={surfaceClassName}>
        <SettingsScreenContent>{props.children}</SettingsScreenContent>
      </ScreenScrollViewSurface>
    </ScreenScrollViewBottomInset>
  );

  if (floatOwnBar) {
    return (
      <View collapsable={false} className={\`flex-1 \${surfaceClassName}\`}>
        <LiquidGlassSource style={{ flex: 1 }}>
          <GlassFloatingHeaderInsetContext value={ownHeaderInset}>
            {body}
          </GlassFloatingHeaderInsetContext>
        </LiquidGlassSource>
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
        >
          {appBar}
        </View>
      </View>
    );
  }

  return (
    <View collapsable={false} className={\`flex-1 \${surfaceClassName}\`}>
      {appBar}
      {body}
    </View>
  );`,
    "SettingsScreen floating header layout",
  );
  return out;
});

patchFile("src/components/ui/ScreenScrollView.tsx", "screen-scroll-view-floating-inset", (src) => {
  let out = replaceOnce(
    src,
    'import { createContext, use, type ComponentProps } from "react";\nimport { Platform } from "react-native";',
    `${MARKER}
import { cloneElement, createContext, isValidElement, use, type ComponentProps } from "react";
import { Platform, StyleSheet } from "react-native";
import { useGlassFloatingHeaderInset } from "../../liquid-glass/GlassFloatingHeaderInset";`,
    "ScreenScrollView imports",
  );
  return replaceOnce(
    out,
    `export function ScreenScrollView(props: ComponentProps<typeof ScrollView>) {
  const bottomInset = use(ScreenScrollViewBottomInset);
  const surface = use(ScreenScrollViewSurface);
  return (
    <ScrollView
      {...props}
      className={Platform.OS === "ios" && surface ? cn(surface, props.className) : props.className}
      contentInset={
        Platform.OS === "ios" && bottomInset > 0
          ? { ...props.contentInset, bottom: (props.contentInset?.bottom ?? 0) + bottomInset }
          : props.contentInset
      }
      contentContainerStyle={[
        props.contentContainerStyle,
        Platform.OS === "android" && {
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        },
      ]}
    />
  );
}`,
    `export function ScreenScrollView(props: ComponentProps<typeof ScrollView>) {
  const bottomInset = use(ScreenScrollViewBottomInset);
  const surface = use(ScreenScrollViewSurface);
  const floatingHeaderInset = useGlassFloatingHeaderInset();
  const androidTopInset = Platform.OS === "android" && floatingHeaderInset > 0 ? floatingHeaderInset : 0;
  const flatContentStyle = StyleSheet.flatten(props.contentContainerStyle);
  const basePaddingTop =
    typeof flatContentStyle?.paddingTop === "number" ? flatContentStyle.paddingTop : 12;
  const refreshControl =
    androidTopInset > 0 && isValidElement<{ progressViewOffset?: number }>(props.refreshControl)
      ? cloneElement(props.refreshControl, {
          progressViewOffset: props.refreshControl.props.progressViewOffset ?? androidTopInset,
        })
      : props.refreshControl;
  return (
    <ScrollView
      {...props}
      refreshControl={refreshControl}
      className={Platform.OS === "ios" && surface ? cn(surface, props.className) : props.className}
      contentInset={
        Platform.OS === "ios" && bottomInset > 0
          ? { ...props.contentInset, bottom: (props.contentInset?.bottom ?? 0) + bottomInset }
          : props.contentInset
      }
      contentContainerStyle={[
        props.contentContainerStyle,
        Platform.OS === "android" && {
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
          ...(androidTopInset > 0 ? { paddingTop: androidTopInset + basePaddingTop } : undefined),
        },
      ]}
    />
  );
}`,
    "ScreenScrollView floating top inset",
  );
});

patchFile("src/features/home/HomeScreen.tsx", "home-screen-floating-header-inset", (src) => {
  let out = replaceOnce(
    src,
    'import { useContentTopInset } from "../../components/ui/useBarInset";',
    `${floatingHeaderMarker}
import { useContentTopInset } from "../../components/ui/useBarInset";
import { useGlassFloatingHeaderInset } from "../../liquid-glass/GlassFloatingHeaderInset";`,
    "HomeScreen floating header import",
  );
  out = replaceOnce(
    out,
    "  const contentTopInset = useContentTopInset();",
    "  const contentTopInset = useContentTopInset();\n  const floatingHeaderInset = useGlassFloatingHeaderInset();",
    "HomeScreen floating header hook",
  );
  out = replaceOnce(
    out,
    'style={{ paddingBottom: insets.bottom }}',
    'style={{ paddingTop: floatingHeaderInset, paddingBottom: insets.bottom }}',
    "HomeScreen empty state top padding",
  );
  return replaceOnce(
    out,
    `                contentContainerStyle={{
                  paddingLeft:`,
    `                contentContainerStyle={{
                  paddingTop: Platform.OS === "android" ? floatingHeaderInset : undefined,
                  paddingLeft:`,
    "HomeScreen list paddingTop",
  );
}, floatingHeaderMarker);

patchFile("src/features/pull-requests/PullRequestsScreen.tsx", "pr-screen-floating-header-inset", (src) => {
  let out = replaceOnce(
    src,
    'import { useContentTopInset } from "../../components/ui/useBarInset";',
    `${MARKER}
import { useContentTopInset } from "../../components/ui/useBarInset";
import { useGlassFloatingHeaderInset } from "../../liquid-glass/GlassFloatingHeaderInset";`,
    "PullRequestsScreen import",
  );
  out = replaceOnce(
    out,
    "  const contentTopInset = useContentTopInset();",
    "  const contentTopInset = useContentTopInset();\n  const floatingHeaderInset = useGlassFloatingHeaderInset();",
    "PullRequestsScreen hook",
  );
  out = replaceOnce(
    out,
    'progressViewOffset={Platform.OS === "ios" ? 60 : undefined}',
    'progressViewOffset={Platform.OS === "ios" ? 60 : floatingHeaderInset || undefined}',
    "PullRequestsScreen refresh offset",
  );
  return replaceOnce(
    out,
    `        contentContainerStyle={{
          paddingBottom: Math.max(bottomSafeArea, workspace.bottomClearance),
        }}`,
    `        contentContainerStyle={{
          paddingTop: Platform.OS === "android" ? floatingHeaderInset : undefined,
          paddingBottom: Math.max(bottomSafeArea, workspace.bottomClearance),
        }}`,
    "PullRequestsScreen paddingTop",
  );
});

patchFile("src/features/issues/IssuesScreen.tsx", "issues-screen-floating-header-inset", (src) => {
  let out = replaceOnce(
    src,
    'import { useContentTopInset } from "../../components/ui/useBarInset";',
    `${MARKER}
import { useContentTopInset } from "../../components/ui/useBarInset";
import { useGlassFloatingHeaderInset } from "../../liquid-glass/GlassFloatingHeaderInset";`,
    "IssuesScreen import",
  );
  out = replaceOnce(
    out,
    "  const contentTopInset = useContentTopInset();",
    "  const contentTopInset = useContentTopInset();\n  const floatingHeaderInset = useGlassFloatingHeaderInset();",
    "IssuesScreen hook",
  );
  out = replaceOnce(
    out,
    'progressViewOffset={Platform.OS === "ios" ? 60 : undefined}',
    'progressViewOffset={Platform.OS === "ios" ? 60 : floatingHeaderInset || undefined}',
    "IssuesScreen refresh offset",
  );
  return replaceOnce(
    out,
    `        contentContainerStyle={{
          paddingBottom: Math.max(bottomSafeArea, workspace.bottomClearance),
        }}`,
    `        contentContainerStyle={{
          paddingTop: Platform.OS === "android" ? floatingHeaderInset : undefined,
          paddingBottom: Math.max(bottomSafeArea, workspace.bottomClearance),
        }}`,
    "IssuesScreen paddingTop",
  );
});

patchFile("src/features/threads/ThreadScreenHost.tsx", "thread-screen-floating-oval-header", (src) => {
  let out = replaceOnce(
    src,
    'import { View } from "react-native";',
    `${MARKER}
import { Platform, View } from "react-native";
import { useToolbarLayout } from "../../components/ui/useToolbarLayout";
import { GlassFloatingHeaderInsetContext } from "../../liquid-glass/GlassFloatingHeaderInset";`,
    "ThreadScreenHost imports",
  );
  return replaceOnce(
    out,
    `function ThreadScreenOutlet() {
  const store = useContext(ThreadScreenContext)!;
  const content = useSyncExternalStore(store.subscribe, store.getSnapshot);
  if (content === null) return null;
  const body = "props" in content ? <ThreadDetailScreen {...content.props} /> : content.fallback;
  return (
    <>
      {"props" in content ? content.props.header : content.header}
      <ScreenContent surface="canvas">{body}</ScreenContent>
    </>
  );
}`,
    `function ThreadScreenOutlet() {
  const store = useContext(ThreadScreenContext)!;
  const content = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const toolbar = useToolbarLayout();
  if (content === null) return null;
  const header = "props" in content ? content.props.header : content.header;
  const body = "props" in content ? <ThreadDetailScreen {...content.props} /> : content.fallback;
  if (Platform.OS === "android" && header) {
    const floatingInset = toolbar.paddingTop + toolbar.height + toolbar.paddingBottom;
    return (
      <View style={{ flex: 1 }}>
        <GlassFloatingHeaderInsetContext value={floatingInset}>
          <ScreenContent surface="canvas">{body}</ScreenContent>
        </GlassFloatingHeaderInsetContext>
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
        >
          {header}
        </View>
      </View>
    );
  }
  return (
    <>
      {header}
      <ScreenContent surface="canvas">{body}</ScreenContent>
    </>
  );
}`,
    "ThreadScreenHost floating header overlay",
  );
});

patchFile("src/features/threads/ThreadFeed.tsx", "thread-feed-floating-header-inset", (src) => {
  let out = replaceOnce(
    src,
    'import { useBarInset, useContentTopInset } from "../../components/ui/useBarInset";',
    `${floatingHeaderMarker}
import { useBarInset, useContentTopInset } from "../../components/ui/useBarInset";
import { useGlassFloatingHeaderInset } from "../../liquid-glass/GlassFloatingHeaderInset";`,
    "ThreadFeed floating header import",
  );
  return replaceOnce(
    out,
    "  const topContentInset = usesNativeAutomaticInsets ? 0 : columnTopInset;",
    `  const floatingHeaderInset = useGlassFloatingHeaderInset();
  const topContentInset = usesNativeAutomaticInsets
    ? 0
    : columnTopInset + (Platform.OS === "android" ? floatingHeaderInset : 0);`,
    "ThreadFeed floating header topContentInset",
  );
}, floatingHeaderMarker);

patchFile("src/features/settings/SettingsOpenSourceLicensesRouteScreen.tsx", "licenses-floating-header-inset", (src) => {
  let out = replaceOnce(
    src,
    'import { SettingsScreen } from "./components/SettingsScreen";',
    `${MARKER}
import { useGlassFloatingHeaderInset } from "../../liquid-glass/GlassFloatingHeaderInset";
import { SettingsScreen } from "./components/SettingsScreen";`,
    "Licenses screen import",
  );
  out = replaceOnce(
    out,
    "  const searchInset = useSearchToolbarInset(search);",
    "  const searchInset = useSearchToolbarInset(search);\n  const floatingHeaderInset = useGlassFloatingHeaderInset();",
    "Licenses screen hook",
  );
  return replaceOnce(
    out,
    `        contentContainerStyle={{
          paddingBottom:`,
    `        contentContainerStyle={{
          paddingTop: Platform.OS === "android" ? floatingHeaderInset : undefined,
          paddingBottom:`,
    "Licenses screen paddingTop",
  );
});

patchFile("src/lib/mobileTheme.ts", "mobile-theme-rgba-channels", (src) => {
  return replaceOnce(
    src,
    `function rgbChannels(color: string): readonly [number, number, number] | null {
  const match = /^#([\\da-f]{2})([\\da-f]{2})([\\da-f]{2})(?:[\\da-f]{2})?$/i.exec(color);
  if (!match) return null;
  const [, red = "0", green = "0", blue = "0"] = match;
  return [Number.parseInt(red, 16), Number.parseInt(green, 16), Number.parseInt(blue, 16)];
}`,
    `${MARKER}
function rgbChannels(color: string): readonly [number, number, number] | null {
  const match = /^#([\\da-f]{2})([\\da-f]{2})([\\da-f]{2})(?:[\\da-f]{2})?$/i.exec(color);
  if (match) {
    const [, red = "0", green = "0", blue = "0"] = match;
    return [Number.parseInt(red, 16), Number.parseInt(green, 16), Number.parseInt(blue, 16)];
  }
  const rgba = /^rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)(?:[,\\s/]+[\\d.]+)?\\s*\\)$/i.exec(
    color.trim(),
  );
  if (!rgba) return null;
  return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
}`,
    "mobileTheme rgbChannels rgba parsing",
  );
});

patchFile("src/features/threads/ThreadComposer.tsx", "thread-composer-transparent-android", (src) => {
  let out = replaceOnce(
    src,
    `import { themeColorWithAlpha } from "../../lib/mobileTheme";`,
    `${MARKER}
import { LiquidGlassBottomFade } from "../../liquid-glass/LiquidGlassBottomFade";`,
    "ThreadComposer bottom fade import",
  );
  out = replaceOnce(
    out,
    `        paddingBottom: (props.bottomInset ?? 0) + THREAD_COMPOSER_BOTTOM_GUTTER,
        backgroundColor:
          Platform.OS === "android" ? themeColorWithAlpha(composerPanel, 1) : undefined,`,
    `        paddingBottom: (props.bottomInset ?? 0) + THREAD_COMPOSER_BOTTOM_GUTTER,`,
    "ThreadComposer remove opaque Android panel bar",
  );
  return replaceOnce(
    out,
    `      {/* Use a plain View: Reanimated Animated.View drops experimental_backgroundImage on Android. */}
      <View
        className={
          Platform.OS === "android"
            ? "hidden"
            : "absolute inset-0 bg-linear-to-b from-screen/0 via-screen/60 to-screen/90"
        }
        pointerEvents="none"
      />`,
    `      {/* Use a plain View: Reanimated Animated.View drops experimental_backgroundImage on Android. */}
      {Platform.OS === "android" ? (
        <LiquidGlassBottomFade />
      ) : (
        <View
          className="absolute inset-0 bg-linear-to-b from-screen/0 via-screen/60 to-screen/90"
          pointerEvents="none"
        />
      )}`,
    "ThreadComposer Android bottom edge fade",
  );
});

const glassUpdaterMarker = "/* t3-liquid-glass: in-app-updater */";
patchFile("src/App.tsx", "app-glass-in-app-updater", (src) => {
  let out = replaceOnce(
    src,
    'import { LiquidGlassMenuBackdrop } from "./liquid-glass/LiquidGlassMenuBackdrop";',
    `${glassUpdaterMarker}
import { LiquidGlassMenuBackdrop } from "./liquid-glass/LiquidGlassMenuBackdrop";
import { installGlassUpdateChecker } from "./liquid-glass/glassUpdater";
import { LiquidGlassUpdateBanner } from "./liquid-glass/LiquidGlassUpdateBanner";`,
    "App.tsx glass updater imports",
  );
  out = replaceOnce(
    out,
    "  installAppUpdateChecks(),",
    "  installAppUpdateChecks(),\n  installGlassUpdateChecker(),",
    "App.tsx glass updater disposer",
  );
  return replaceOnce(
    out,
    "            <OverlayPortalHost />",
    "            <OverlayPortalHost />\n            <LiquidGlassUpdateBanner />",
    "App.tsx glass update banner",
  );
}, glassUpdaterMarker);

patchFile("src/features/pull-requests/PullRequestDescription.tsx", "pr-description-fade-hex", (src) => {
  return replaceOnce(
    src,
    `  const fadeColor = colors[Platform.OS === "android" ? "--color-sheet-solid" : "--color-screen"];`,
    `${MARKER}
  const fadeColor = colors[Platform.OS === "android" ? "--color-status-bar" : "--color-screen"];`,
    "PullRequestDescription Android fade hex",
  );
});

for (const [file, mock] of [
  ["components/ui/AppBar.android.test.tsx", 'vi.mock("../../liquid-glass/LiquidGlassHeader", () => ({ GLASS_HEADER_CONTENT_PADDING: 14, LiquidGlassHeader: () => null }));'],
  ["components/ui/AndroidAnchoredMenu.android.test.tsx", 'vi.mock("../../liquid-glass/LiquidGlassMenu", () => ({ LiquidGlassMenu: () => null }));'],
  ["features/layout/workspace/workspace-tabs-state.test.ts", 'vi.mock("../../../liquid-glass/LiquidGlassSource", () => ({ LiquidGlassSource: ({ children }: { readonly children?: ReactNode }) => children }));'],
]) {
  patchFile(`src/${file}`, "glass-view-test-mock", (src) =>
    src.includes('vi.mock("react-native",')
      ? replaceOnce(src, 'vi.mock("react-native",', `${MARKER}\n${mock}\nvi.mock("react-native",`, `${file} native view mocks`)
      : replaceOnce(src, 'vi.mock("../../../components/ui/WorkspaceAppBar.android",', `${MARKER}\n${mock}\nvi.mock("../../../components/ui/WorkspaceAppBar.android",`, `${file} native view mocks`),
  );
}

console.log("\n[hooks] Integration summary:");
for (const entry of results) {
  console.log(`  - ${entry.status.padEnd(15)} ${entry.hookName} (${entry.relPath})`);
}
console.log(`\nAll ${results.length} Liquid Glass hooks verified cleanly!`);
