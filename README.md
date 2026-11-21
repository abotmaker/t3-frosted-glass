<img src="assets/icon.svg" width="64" height="64" alt="">

# T3 Frosted Glass — Android Edition

Builds the official [T3 Code](https://github.com/pingdotgg/t3code) Android app with a **Frosted / Liquid Glass** material pipeline (`RenderNode` + 1.6× saturation + live blur + Android 13+ Kyant0 AGSL rounded-rect refraction & chromatic dispersion shader, draggable spring-squashing floating glass dock & segmented lens pills, floating oval glass headers with top status-bar fade, in-window live-blurred glass menus, knobless glass sliders, frosted glass cards, and floating glass composer with bottom edge fade on AMOLED `#000000` dark and clean `#F2F4F7` porcelain light canvases), installed **side-by-side** alongside the official Play Store T3 Code app.

## Side-by-Side Identity & In-App Auto-Updates

- **App name:** `T3 Code Glass`
- **Package ID:** `com.t3tools.t3code.glass` (does not conflict with `com.t3tools.t3code`)
- **URL scheme:** `t3code-glass://`
- **Persistent signing key:** `keystore/t3-glass.keystore` (gitignored; ensures every future update upgrades in-place without losing login or connections)
- **In-app GitHub Releases updater:** Automatically checks `abotmaker/t3-frosted-glass` Releases on launch/foreground, displays a floating Frosted Glass update banner when a newer APK is published, downloads with progress, verifies SHA-256 checksum, and hands off to Android's native 1-tap package installer.
- **Local Android 16/17 Live-Updates Bridge:** Because sideloaded builds (`com.t3tools.t3code.glass`) cannot receive FCM pushes signed for the official Play Store package, T3 Frosted Glass bridges live connected-environment thread streams + authenticated T3 Connect relay snapshots directly into Android's promoted Live Update notifications (`Working`, `2 live`, `Approve`, `Answer`, `Done`, `Failed`) and high-priority `agent-alerts` banners, backed by a lightweight `dataSync` foreground service active only while an agent is running.
- **Upstream EAS OTA updates:** disabled on the custom build so upstream OTA bundles never overwrite the Frosted Glass UI.

## Syncing Upstream T3 Code & Publishing Updates

All Frosted Glass code lives in `overlay/` and is re-applied onto fresh `pingdotgg/t3code` checkouts by `scripts/apply-liquid-glass.mjs`.

Whenever upstream T3 Code ships updates, run:

```bash
./scripts/sync-and-build.sh --publish
```

The script fetches upstream `main`, compares it against `.upstream-commit`, runs `scripts/review-upstream-ui.mjs` to flag any added/changed Android UI files, reapplies and verifies the overlay, runs typecheck + mobile unit tests + Kotlin unit tests, bumps a monotonic `android.versionCode`, builds a signed `arm64-v8a` release APK, publishes a GitHub Release (with SHA-256) so phones pick it up automatically in-app, and updates any connected ADB device.

Useful flags:

- `./scripts/sync-and-build.sh --check --mobile-only` — check for mobile-relevant upstream changes without building (`0` = up to date, `2` = safe to build, `3` = Android UI review required)
- `./scripts/sync-and-build.sh --publish` — sync, test, build signed APK, and publish a GitHub Release to `abotmaker/t3-frosted-glass`
- `./scripts/sync-and-build.sh --no-sync` — rebuild & reinstall from the current `t3code/` checkout
- `./scripts/sync-and-build.sh --no-install` — build/publish without invoking `adb`
- `./scripts/sync-and-build.sh --reviewed-ui=<full-sha>` — continue building after reviewing flagged UI changes

## Architecture

- `overlay/apps/mobile/modules/t3-liquid-glass/` — Expo native Android module (Kotlin + AGSL):
  - `GlassShaders.kt` (Apache-2.0 Kyant0/backdrop refraction & chromatic dispersion shader)
  - `T3LiquidGlassBackdropView.kt`, `T3LiquidGlassFadeView.kt` (AMOLED dark / clean porcelain light backdrop host & GPU edge fades)
  - `T3LiquidGlassSourceView.kt` (captures workspace tabs, Settings content, and thread feeds for floating glass)
  - `LiquidGlassRenderer.kt` (dirty-cached `RenderNode` + `RenderEffect` blur + 3-tap AGSL spectral refraction)
  - `GlassSurfaceDrawer.kt` (shared card/dock/composer/header/menu/button/bubble/input material stack with GPU RRect fast path)
  - `GlassPillMotion.kt` (zero-allocation BitChord / `liquid_glass_easy` spring travel, lift, squash, and lens handoff)
  - `T3LiquidGlassDockView.kt`, `T3LiquidGlassSegmentedView.kt`, `T3LiquidGlassSliderView.kt`
  - `T3GlassUpdaterModule.kt` (trusted GitHub Releases HTTPS downloader, SHA-256 verifier, `FileProvider` package installer bridge)
  - `baseline-prof.txt` (ART Baseline Profile for Fabric, Hermes, Liquid Glass, and navigation AOT compilation)
- `overlay/apps/mobile/src/liquid-glass/` — React Native glass bindings, theme calibration, floating header/bottom fade, in-app GitHub Releases updater (`glassUpdater.ts`, `LiquidGlassUpdateBanner.tsx`), and Android thread-open performance modules (`fastIntlPolyfills.ts`, `markdownParseCache.ts`, `wideMarkdownLayout.ts`, `localLiveNotifications.ts`)
- `overlay/apps/mobile/src/components/` — Android Frosted Glass component adapters
- `overlay/apps/mobile/plugins/withAndroidLiquidGlass.cjs` — Expo config plugin for edge-to-edge system bars, frosted dialog drawables, `FileProvider` + `REQUEST_INSTALL_PACKAGES`, and persistent release signing
- `scripts/apply-liquid-glass.mjs` — idempotent, self-verifying overlay & hook applicator
- `scripts/sync-and-build.sh` — end-to-end upstream sync, test, build, GitHub Release publish, and ADB install pipeline
