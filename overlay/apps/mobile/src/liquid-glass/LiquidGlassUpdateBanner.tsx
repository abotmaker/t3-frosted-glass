import { useSyncExternalStore } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import {
  dismissGlassUpdate,
  getGlassUpdateSnapshot,
  startGlassUpdateInstall,
  subscribeGlassUpdate,
} from "./glassUpdater";
import { LiquidGlassSurface } from "./LiquidGlassSurface";

/** Floating Liquid Glass banner shown only when a newer GitHub Release APK is ready. */
export function LiquidGlassUpdateBanner() {
  const snapshot = useSyncExternalStore(
    subscribeGlassUpdate,
    getGlassUpdateSnapshot,
    getGlassUpdateSnapshot,
  );
  const { themeAppearance, themeVariables } = useAppearancePreferences();
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "android") return null;
  const update = snapshot.update;
  if (!update || snapshot.phase === "idle" || snapshot.dismissedTag === update.tagName) {
    return null;
  }

  const dark = themeAppearance === "dark";
  const shortSha = update.upstreamSha ? update.upstreamSha.slice(0, 7) : null;
  const isDownloading = snapshot.phase === "downloading";
  const pct =
    snapshot.progress !== null ? `${Math.round(snapshot.progress * 100)}%` : "…";

  const title =
    snapshot.phase === "permission_required"
      ? "Allow app installs to finish"
      : snapshot.phase === "error"
        ? "Update failed"
        : isDownloading
          ? `Downloading update ${pct}`
          : "Update available";

  const subtitle =
    snapshot.phase === "error"
      ? snapshot.errorMessage ?? "Tap Retry to try again."
      : snapshot.phase === "permission_required"
        ? "Tap Install once permission is enabled."
        : shortSha
          ? `T3 Frosted Glass ${update.versionName} · ${shortSha}`
          : `T3 Frosted Glass ${update.versionName}`;

  const actionLabel =
    snapshot.phase === "permission_required"
      ? "Install"
      : snapshot.phase === "error"
        ? "Retry"
        : isDownloading
          ? pct
          : "Update";

  const primaryText = dark ? "#F5F7FA" : "#181B20";
  const mutedText = dark ? "#B8BFC9" : "#4B5563";
  const actionBg = dark ? "rgba(255, 255, 255, 0.16)" : "rgba(15, 23, 42, 0.10)";

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: Math.max(insets.top, 12) + 64 }]}
    >
      <LiquidGlassSurface
        look="menu"
        dark={dark}
        cornerRadius={24}
        accentColor={themeVariables["--color-primary"]}
        accentOpacity={dark ? 0.12 : 0.08}
        style={styles.card}
      >
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={[styles.title, { color: primaryText }]}>
              {title}
            </Text>
            <Text numberOfLines={1} style={[styles.subtitle, { color: mutedText }]}>
              {subtitle}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            disabled={isDownloading}
            onPress={() => void startGlassUpdateInstall()}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: actionBg, opacity: isDownloading ? 0.6 : pressed ? 0.72 : 1 },
            ]}
          >
            <Text style={[styles.actionText, { color: primaryText }]}>{actionLabel}</Text>
          </Pressable>
          {!isDownloading ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss update notice"
              onPress={dismissGlassUpdate}
              hitSlop={8}
              style={({ pressed }) => [styles.dismissButton, { opacity: pressed ? 0.6 : 0.8 }]}
            >
              <Text style={[styles.dismissText, { color: mutedText }]}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </LiquidGlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 50,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 460,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingLeft: 16,
    paddingRight: 10,
    gap: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 12,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dismissButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissText: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "500",
  },
});
