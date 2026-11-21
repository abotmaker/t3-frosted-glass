const fs = require("node:fs");
const path = require("node:path");
const {
  withAndroidManifest,
  withAndroidStyles,
  withAppBuildGradle,
  withDangerousMod,
} = require("expo/config-plugins");

// Frosted glass dialog surfaces matching Jarvoice's dark & light glass palette.
const GLASS_ALERT_DIALOG_DRAWABLE_LIGHT = `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:insetLeft="16dp"
    android:insetTop="16dp"
    android:insetRight="16dp"
    android:insetBottom="16dp">
  <shape android:shape="rectangle">
    <solid android:color="#EBEEF3FA" />
    <stroke android:width="1dp" android:color="#80FFFFFF" />
    <corners android:radius="24dp" />
  </shape>
</inset>
`;

const GLASS_ALERT_DIALOG_DRAWABLE_NIGHT = `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:insetLeft="16dp"
    android:insetTop="16dp"
    android:insetRight="16dp"
    android:insetBottom="16dp">
  <shape android:shape="rectangle">
    <solid android:color="#E616191F" />
    <stroke android:width="1dp" android:color="#3DFFFFFF" />
    <corners android:radius="24dp" />
  </shape>
</inset>
`;

const GLASS_UPDATER_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths>
  <cache-path name="glass_updates" path="glass-updates/" />
</paths>
`;

function assignStyleItem(style, name, value) {
  style.item = style.item ?? [];
  const existing = style.item.find((item) => item.$?.name === name);
  if (existing) {
    existing._ = value;
  } else {
    style.item.push({ _: value, $: { name } });
  }
}

function withGlassWindowStyles(config) {
  return withAndroidStyles(config, (nextConfig) => {
    const styles = nextConfig.modResults.resources.style ?? [];
    const appTheme = styles.find((style) => style.$?.name === "AppTheme");
    if (appTheme) {
      assignStyleItem(appTheme, "android:statusBarColor", "@android:color/transparent");
      assignStyleItem(appTheme, "android:navigationBarColor", "@android:color/transparent");
      assignStyleItem(appTheme, "android:enforceNavigationBarContrast", "false");
      assignStyleItem(appTheme, "android:enforceStatusBarContrast", "false");
    }
    return nextConfig;
  });
}

function withGlassUpdaterManifest(config) {
  return withAndroidManifest(config, (nextConfig) => {
    const manifest = nextConfig.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    const installPerm = "android.permission.REQUEST_INSTALL_PACKAGES";
    if (!manifest["uses-permission"].some((item) => item.$?.["android:name"] === installPerm)) {
      manifest["uses-permission"].push({ $: { "android:name": installPerm } });
    }

    const app = manifest.application?.[0];
    if (app) {
      app.provider = app.provider ?? [];
      const authority = "${applicationId}.glass_updater_provider";
      if (!app.provider.some((item) => item.$?.["android:authorities"] === authority)) {
        app.provider.push({
          $: {
            "android:name": "androidx.core.content.FileProvider",
            "android:authorities": authority,
            "android:exported": "false",
            "android:grantUriPermissions": "true",
          },
          "meta-data": [
            {
              $: {
                "android:name": "android.support.FILE_PROVIDER_PATHS",
                "android:resource": "@xml/glass_updater_paths",
              },
            },
          ],
        });
      }
    }
    return nextConfig;
  });
}

function withGlassAlertDrawables(config) {
  return withDangerousMod(config, [
    "android",
    async (nextConfig) => {
      const resDir = path.join(
        nextConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      const drawableDir = path.join(resDir, "drawable");
      const drawableNightDir = path.join(resDir, "drawable-night");
      const xmlDir = path.join(resDir, "xml");
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.mkdirSync(drawableNightDir, { recursive: true });
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(drawableDir, "alert_dialog_background.xml"),
        GLASS_ALERT_DIALOG_DRAWABLE_LIGHT,
      );
      fs.writeFileSync(
        path.join(drawableNightDir, "alert_dialog_background.xml"),
        GLASS_ALERT_DIALOG_DRAWABLE_NIGHT,
      );
      fs.writeFileSync(
        path.join(xmlDir, "glass_updater_paths.xml"),
        GLASS_UPDATER_PATHS_XML,
      );
      return nextConfig;
    },
  ]);
}

function withGlassReleaseSigning(config) {
  return withAppBuildGradle(config, (nextConfig) => {
    const keystorePath = process.env.T3_GLASS_KEYSTORE_PATH?.trim();
    if (!keystorePath) return nextConfig;
    const storePassword = process.env.T3_GLASS_KEYSTORE_PASSWORD ?? "t3glassrelease";
    const keyAlias = process.env.T3_GLASS_KEY_ALIAS ?? "t3glass";
    const keyPassword = process.env.T3_GLASS_KEY_PASSWORD ?? storePassword;

    let contents = nextConfig.modResults.contents;
    if (contents.includes("glassRelease {")) return nextConfig;

    const escapedPath = keystorePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const signingBlock = `        glassRelease {
            storeFile file("${escapedPath}")
            storePassword "${storePassword}"
            keyAlias "${keyAlias}"
            keyPassword "${keyPassword}"
        }
`;
    if (contents.includes("signingConfigs {")) {
      contents = contents.replace(
        "signingConfigs {",
        `signingConfigs {\n${signingBlock}`,
      );
    }
    contents = contents.replace(
      /(release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      "$1signingConfig signingConfigs.glassRelease",
    );
    nextConfig.modResults.contents = contents;
    return nextConfig;
  });
}

module.exports = function withAndroidLiquidGlass(config) {
  return withGlassReleaseSigning(
    withGlassUpdaterManifest(withGlassAlertDrawables(withGlassWindowStyles(config))),
  );
};
