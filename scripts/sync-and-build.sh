#!/usr/bin/env bash
# Sync upstream pingdotgg/t3code, re-apply the Frosted/Liquid Glass UI overlay,
# verify tests & typecheck, build a standalone signed Release APK side-by-side as
# "T3 Code Glass" (com.t3tools.t3code.glass), optionally publish a GitHub Release
# for in-app auto-updates, and install on a connected Android device.
#
# Usage:
#   ./scripts/sync-and-build.sh                     # Pull latest upstream T3 Code, apply UI, test, build & install
#   ./scripts/sync-and-build.sh --publish           # Also publish signed APK + SHA-256 to GitHub Releases
#   ./scripts/sync-and-build.sh --no-sync           # Keep current t3code checkout, re-apply UI, build & install
#   ./scripts/sync-and-build.sh --no-install        # Sync, apply, test, and build APK without adb install
#   ./scripts/sync-and-build.sh --skip-tests        # Skip vitest/typecheck for faster local UI iteration
#   ./scripts/sync-and-build.sh --check             # Report upstream Android UI changes without building
#   ./scripts/sync-and-build.sh --mobile-only       # Treat upstream commits outside mobile paths as up to date
#   ./scripts/sync-and-build.sh --reviewed-ui=<sha> # Continue after reviewing this upstream commit
#   ./scripts/sync-and-build.sh --debug             # Build debug APK instead of release

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T3_DIR="$ROOT_DIR/t3code"
MOBILE_DIR="$T3_DIR/apps/mobile"
KEYSTORE_DIR="$ROOT_DIR/keystore"
KEYSTORE_PATH="$KEYSTORE_DIR/t3-glass.keystore"
DIST_DIR="$ROOT_DIR/dist"
STATE_FILE="$ROOT_DIR/.upstream-commit"
RELEASE_REPO="${T3_GLASS_RELEASE_REPO:-abotmaker/t3-frosted-glass}"

DO_SYNC=1
DO_TESTS=1
DO_INSTALL=1
DO_PUBLISH=0
CHECK_ONLY=0
MOBILE_ONLY=0
BUILD_TYPE="release"
REVIEWED_UI_COMMIT=""

for arg in "$@"; do
  case "$arg" in
    --no-sync) DO_SYNC=0 ;;
    --skip-tests) DO_TESTS=0 ;;
    --no-install) DO_INSTALL=0 ;;
    --publish) DO_PUBLISH=1 ;;
    --check) CHECK_ONLY=1 ;;
    --mobile-only) MOBILE_ONLY=1 ;;
    --reviewed-ui=*)
      REVIEWED_UI_COMMIT="${arg#*=}"
      if [[ ! "$REVIEWED_UI_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
        echo "Use the full upstream commit SHA with --reviewed-ui." >&2
        exit 1
      fi
      ;;
    --debug) BUILD_TYPE="debug" ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

# Resolve the upstream revision and review its committed UI changes before resetting the checkout.
if [[ ! -d "$T3_DIR/.git" ]]; then
  echo "==> Cloning pingdotgg/t3code..."
  git clone --depth 1 https://github.com/pingdotgg/t3code.git "$T3_DIR"
fi

if [[ "$DO_SYNC" -eq 1 ]]; then
  echo "==> Fetching latest upstream pingdotgg/t3code (origin/main)..."
  git -C "$T3_DIR" fetch --depth 50 origin main --quiet
  TARGET_REF=origin/main
else
  TARGET_REF=HEAD
fi
UPSTREAM_FULL_SHA="$(git -C "$T3_DIR" rev-parse --verify "$TARGET_REF^{commit}")"
UPSTREAM_SHA="$(git -C "$T3_DIR" rev-parse --short "$UPSTREAM_FULL_SHA")"

BUILT_SHA=""
if [[ -e "$STATE_FILE" ]]; then
  BUILT_SHA="$(cat "$STATE_FILE")"
  if [[ ! "$BUILT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "ERROR: Invalid upstream commit in $STATE_FILE" >&2
    exit 1
  fi
fi
echo "Built upstream commit:  ${BUILT_SHA:-none recorded}"
echo "Target upstream commit: $UPSTREAM_FULL_SHA"

if [[ -n "$REVIEWED_UI_COMMIT" && "$REVIEWED_UI_COMMIT" != "$UPSTREAM_FULL_SHA" ]]; then
  echo "ERROR: The reviewed commit differs from the target. Run --check to review the target." >&2
  exit 1
fi

# When --mobile-only is active, ignore upstream commits that don't affect the Android app
# (matching upstream .github/workflows/mobile-eas-production.yml path filters).
if [[ "$MOBILE_ONLY" -eq 1 && -n "$BUILT_SHA" && "$BUILT_SHA" != "$UPSTREAM_FULL_SHA" ]]; then
  if git -C "$T3_DIR" cat-file -e "$BUILT_SHA^{commit}" 2>/dev/null; then
    MOBILE_DIFF="$(git -C "$T3_DIR" diff --name-only "$BUILT_SHA" "$UPSTREAM_FULL_SHA" -- \
      apps/mobile packages/client-runtime packages/contracts packages/shared assets scripts patches pnpm-lock.yaml pnpm-workspace.yaml)"
    if [[ -z "$MOBILE_DIFF" ]]; then
      echo "No mobile-relevant upstream changes since ${BUILT_SHA:0:8}."
      exit 0
    fi
  fi
fi

if [[ -n "$BUILT_SHA" && "$BUILT_SHA" != "$UPSTREAM_FULL_SHA" ]]; then
  if node "$ROOT_DIR/scripts/review-upstream-ui.mjs" "$T3_DIR" "$BUILT_SHA" "$UPSTREAM_FULL_SHA"; then
    echo "==> Upstream UI review scan passed."
  else
    REVIEW_STATUS=$?
    if [[ "$REVIEW_STATUS" -ne 3 ]]; then
      exit "$REVIEW_STATUS"
    fi
    if [[ "$REVIEWED_UI_COMMIT" != "$UPSTREAM_FULL_SHA" ]]; then
      echo "Update paused for Android UI review. After reviewing the files above, rerun with:" >&2
      echo "  $0 --reviewed-ui=$UPSTREAM_FULL_SHA" >&2
      exit 3
    fi
  fi
elif [[ -z "$BUILT_SHA" ]]; then
  echo "No previous release to compare. The first successful release will establish the UI review baseline."
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  if [[ "$BUILT_SHA" == "$UPSTREAM_FULL_SHA" ]]; then
    echo "Up to date."
    exit 0
  fi
  echo "Update available."
  exit 2
fi

# Locate JDK 21 (required by React Native / Gradle / Expo Modules)
if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/java" ]]; then
  for candidate in \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /opt/homebrew/Cellar/openjdk@21/*/libexec/openjdk.jdk/Contents/Home \
    /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
    /Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home; do
    if [[ -x "$candidate/bin/java" ]]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi
export PATH="${JAVA_HOME}/bin:${PATH}"

# Locate Android SDK
if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [[ -d "$HOME/Android/Sdk" ]]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi
export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${ANDROID_HOME}/platform-tools:${PATH}"

# Resolve pnpm matching t3code's packageManager field
PNPM_CMD=("npx" "--yes" "pnpm@12.14.0")

# ---------------------------------------------------------------------------
# 1. Sync the reviewed upstream revision
# ---------------------------------------------------------------------------
if [[ "$DO_SYNC" -eq 1 ]]; then
  git -C "$T3_DIR" reset --hard "$UPSTREAM_FULL_SHA"
  # Preserve .env and node_modules while clearing stale prebuild/overlay files.
  git -C "$T3_DIR" clean -fd -e .env -e .env.local -e node_modules -e apps/mobile/node_modules -e apps/mobile/android/.gradle
fi

echo "==> Upstream t3code commit: $UPSTREAM_SHA"

# Enable T3 Connect public config if not already configured
if [[ ! -f "$T3_DIR/.env" && -f "$T3_DIR/.env.example" ]]; then
  cp "$T3_DIR/.env.example" "$T3_DIR/.env"
  echo "==> Initialized t3code/.env from .env.example (enables T3 Connect + local/Tailscale)"
fi

# ---------------------------------------------------------------------------
# 2. Apply Liquid Glass overlay & surgical hooks
# ---------------------------------------------------------------------------
echo "==> Applying Frosted / Liquid Glass overlay & hooks..."
node "$ROOT_DIR/scripts/apply-liquid-glass.mjs"

# ---------------------------------------------------------------------------
# 3. Install dependencies
# ---------------------------------------------------------------------------
echo "==> Ensuring workspace dependencies are up to date..."
(cd "$T3_DIR" && "${PNPM_CMD[@]}" install --frozen-lockfile)

# ---------------------------------------------------------------------------
# 4. Run typecheck & tests
# ---------------------------------------------------------------------------
if [[ "$DO_TESTS" -eq 1 ]]; then
  echo "==> Running mobile typecheck..."
  (cd "$MOBILE_DIR" && "${PNPM_CMD[@]}" run typecheck)
  echo "==> Running Liquid Glass + critical mobile unit tests..."
  (cd "$MOBILE_DIR" && "${PNPM_CMD[@]}" exec vp test run \
    src/liquid-glass/liquidGlass.test.ts \
    src/liquid-glass/glassUpdater.test.ts \
    src/liquid-glass/localLiveNotificationsPayload.test.ts \
    src/features/agent-awareness/remoteRegistration.test.ts \
    src/features/threads/threadStreamHaptics.test.ts \
    app.config.test.ts \
    src/dependency-graph.test.ts \
    src/reactCompilerCoverage.test.ts \
    src/components/ui/Dialog.android.test.tsx \
    src/components/ui/AppBar.android.test.tsx \
    src/components/ui/AndroidAnchoredMenu.android.test.tsx \
    src/lib/mobileTheme.test.ts \
    src/lib/composerChipPresentation.test.ts \
    src/lib/nativeTheme.test.ts)
fi

# ---------------------------------------------------------------------------
# 5. Ensure persistent release signing keystore (for seamless in-place updates)
# ---------------------------------------------------------------------------
mkdir -p "$KEYSTORE_DIR" "$DIST_DIR"
if [[ ! -f "$KEYSTORE_PATH" ]]; then
  echo "==> Generating persistent release signing keystore at $KEYSTORE_PATH..."
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -storetype PKCS12 \
    -keystore "$KEYSTORE_PATH" \
    -alias t3glass \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass t3glassrelease \
    -keypass t3glassrelease \
    -dname "CN=T3 Code Glass, OU=Mobile, O=Local, L=Local, S=Local, C=US"
fi

# ---------------------------------------------------------------------------
# 6. Expo prebuild & Gradle Android build (side-by-side: com.t3tools.t3code.glass)
# ---------------------------------------------------------------------------
VERSION_CODE="${T3_GLASS_VERSION_CODE:-$(($(date +%s) / 60))}"
APP_VERSION="$(node -e 'const fs=require("node:fs"); const s=fs.readFileSync(process.argv[1],"utf8"); const m=/version:\s*repoEnv\.T3CODE_MOBILE_VERSION\s*\?\?\s*"([^"]+)"/.exec(s); console.log(m?.[1] ?? "2.3.0");' "$MOBILE_DIR/app.config.ts")"

echo "==> Running Expo Android prebuild for T3 Code Glass (v${APP_VERSION}, versionCode=${VERSION_CODE})..."
export APP_VARIANT=production
export T3CODE_LIQUID_GLASS=1
export T3_GLASS_VERSION_CODE="$VERSION_CODE"
export T3_GLASS_UPSTREAM_SHA="$UPSTREAM_FULL_SHA"
export T3_GLASS_RELEASE_REPO="$RELEASE_REPO"
export T3_GLASS_KEYSTORE_PATH="$KEYSTORE_PATH"
export T3_GLASS_KEYSTORE_PASSWORD="t3glassrelease"
export T3_GLASS_KEY_ALIAS="t3glass"
export T3_GLASS_KEY_PASSWORD="t3glassrelease"
export EXPO_NO_GIT_STATUS=1
export EXPO_NO_TYPESCRIPT_SETUP=1

(cd "$MOBILE_DIR" && "${PNPM_CMD[@]}" exec expo prebuild --clean --platform android)

echo "==> Running native t3-liquid-glass & t3-agent-notifications Kotlin unit tests..."
(cd "$MOBILE_DIR/android" && ./gradlew :t3-liquid-glass:testDebugUnitTest :t3-agent-notifications:testDebugUnitTest --no-daemon)

if [[ "$BUILD_TYPE" == "release" ]]; then
  echo "==> Building standalone signed Release APK (arm64-v8a)..."
  (cd "$MOBILE_DIR/android" && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon)
  APK_SRC="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"
  APK_DST="$DIST_DIR/T3Code-Glass-${UPSTREAM_SHA}-release.apk"
else
  echo "==> Building Debug APK (arm64-v8a)..."
  (cd "$MOBILE_DIR/android" && ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon)
  APK_SRC="$MOBILE_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  APK_DST="$DIST_DIR/T3Code-Glass-${UPSTREAM_SHA}-debug.apk"
fi

cp "$APK_SRC" "$APK_DST"
APK_SHA256="$(shasum -a 256 "$APK_DST" | awk '{print $1}')"
if [[ "$BUILD_TYPE" == "release" ]]; then
  cp "$APK_SRC" "$DIST_DIR/T3Code-Glass-latest.apk"
  echo "$UPSTREAM_FULL_SHA" > "$STATE_FILE"
fi
echo "==> APK ready: $APK_DST"
echo "==> SHA256:    $APK_SHA256"

# ---------------------------------------------------------------------------
# 7. Optional GitHub Release publish for in-app auto-updater
# ---------------------------------------------------------------------------
if [[ "$DO_PUBLISH" -eq 1 && "$BUILD_TYPE" == "release" ]]; then
  RELEASE_TAG="v${APP_VERSION}-glass.${VERSION_CODE}-${UPSTREAM_SHA}"
  echo "==> Publishing GitHub Release ${RELEASE_TAG} to ${RELEASE_REPO}..."
  RELEASE_NOTES="$(cat <<EOF
T3 Frosted Glass Android release built from upstream \`pingdotgg/t3code\` commit \`${UPSTREAM_SHA}\`.

- UpstreamCommit: ${UPSTREAM_FULL_SHA}
- VersionCode: ${VERSION_CODE}
- SHA256: ${APK_SHA256}
EOF
)"
  gh release create "$RELEASE_TAG" "$APK_DST" \
    --repo "$RELEASE_REPO" \
    --title "T3 Frosted Glass ${APP_VERSION} (${UPSTREAM_SHA})" \
    --notes "$RELEASE_NOTES" \
    --latest
  echo "==> Published release ${RELEASE_TAG} to https://github.com/${RELEASE_REPO}/releases/tag/${RELEASE_TAG}"
fi

# ---------------------------------------------------------------------------
# 8. Install side-by-side on connected Android phone via ADB (ports 5037 & 5038)
# ---------------------------------------------------------------------------
if [[ "$DO_INSTALL" -eq 1 ]]; then
  ADB_PORT=""
  DEVICE_SERIAL=""
  for port in "${ADB_SERVER_PORT:-5037}" 5037 5038; do
    SERIAL="$(adb -P "$port" devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}' || true)"
    if [[ -n "$SERIAL" ]]; then
      ADB_PORT="$port"
      DEVICE_SERIAL="$SERIAL"
      break
    fi
  done
  if [[ -n "$DEVICE_SERIAL" ]]; then
    echo "==> Installing com.t3tools.t3code.glass side-by-side onto $DEVICE_SERIAL (ADB port $ADB_PORT)..."
    adb -P "$ADB_PORT" -s "$DEVICE_SERIAL" install -r "$APK_DST"
    echo "==> Installing bundled ART Baseline Profile & pre-compiling speed-profile..."
    adb -P "$ADB_PORT" -s "$DEVICE_SERIAL" shell "am broadcast -a androidx.profileinstaller.action.INSTALL_PROFILE com.t3tools.t3code.glass/androidx.profileinstaller.ProfileInstallReceiver >/dev/null 2>&1 && sleep 1 && cmd package compile -m speed-profile -f com.t3tools.t3code.glass" || true
    echo "==> Installed T3 Code Glass alongside com.t3tools.t3code!"
  else
    echo "WARN: No ADB device connected. Install manually with: adb install -r \"$APK_DST\""
  fi
fi
