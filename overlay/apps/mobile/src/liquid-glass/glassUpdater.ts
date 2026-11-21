import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";

import {
  DEFAULT_GLASS_RELEASE_REPO,
  parseGitHubGlassRelease,
  type GlassReleaseUpdate,
} from "./glassUpdaterRelease";

export {
  DEFAULT_GLASS_RELEASE_REPO,
  isTrustedReleaseDownloadUrl,
  normalizeSha256Hex,
  parseGitHubGlassRelease,
  type GlassReleaseUpdate,
} from "./glassUpdaterRelease";

const CHECK_THROTTLE_MS = 2 * 60 * 60 * 1000;

export type GlassUpdatePhase =
  | "idle"
  | "available"
  | "downloading"
  | "permission_required"
  | "error";

export interface GlassUpdateState {
  readonly phase: GlassUpdatePhase;
  readonly update: GlassReleaseUpdate | null;
  readonly progress: number | null;
  readonly errorMessage: string | null;
  readonly dismissedTag: string | null;
}

interface NativeGlassUpdaterModule {
  getInstalledVersionCode(): number;
  canRequestPackageInstalls(): boolean;
  openInstallPermissionSettings(): boolean;
  downloadAndInstallApk(
    url: string,
    expectedSha256: string | null,
    fileName: string,
  ): Promise<"installer_launched" | "permission_required">;
  installCachedApk(
    fileName: string,
    expectedSha256: string | null,
  ): Promise<"installer_launched" | "permission_required">;
  addListener?(
    eventName: "onDownloadProgress",
    listener: (event: { readonly progress: number; readonly bytesWritten: number; readonly totalBytes: number }) => void,
  ): { remove(): void };
}

function getNativeUpdater(): NativeGlassUpdaterModule | null {
  if (Platform.OS !== "android") return null;
  return requireOptionalNativeModule<NativeGlassUpdaterModule>("T3GlassUpdater");
}

function readGlassUpdaterConfig(): {
  readonly repo: string;
  readonly upstreamSha: string | null;
  readonly fallbackVersionCode: number;
} {
  const extra = Constants.expoConfig?.extra as
    | {
        readonly glassUpdater?: {
          readonly releaseRepo?: unknown;
          readonly upstreamSha?: unknown;
          readonly versionCode?: unknown;
        };
      }
    | undefined;
  const cfg = extra?.glassUpdater;
  const repo =
    typeof cfg?.releaseRepo === "string" && cfg.releaseRepo.trim().length > 0
      ? cfg.releaseRepo.trim()
      : DEFAULT_GLASS_RELEASE_REPO;
  const upstreamSha =
    typeof cfg?.upstreamSha === "string" && cfg.upstreamSha.trim().length > 0
      ? cfg.upstreamSha.trim()
      : null;
  const fallbackVersionCode =
    typeof cfg?.versionCode === "number" && Number.isFinite(cfg.versionCode) ? cfg.versionCode : 1;
  return { repo, upstreamSha, fallbackVersionCode };
}

let state: GlassUpdateState = {
  phase: "idle",
  update: null,
  progress: null,
  errorMessage: null,
  dismissedTag: null,
};

let lastCheckAt = 0;
let checkInFlight = false;
const listeners = new Set<() => void>();

function setState(next: GlassUpdateState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getGlassUpdateSnapshot(): GlassUpdateState {
  return state;
}

export function subscribeGlassUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissGlassUpdate(): void {
  if (!state.update) return;
  setState({
    ...state,
    dismissedTag: state.update.tagName,
    errorMessage: null,
  });
}

export async function checkForGlassUpdate(options?: { readonly force?: boolean }): Promise<void> {
  if (Platform.OS !== "android") return;
  if (typeof __DEV__ !== "undefined" && __DEV__) return;
  const native = getNativeUpdater();
  if (!native) return;
  if (checkInFlight) return;
  if (state.phase === "downloading") return;

  const now = Date.now();
  if (!options?.force && now - lastCheckAt < CHECK_THROTTLE_MS) return;

  checkInFlight = true;
  lastCheckAt = now;
  try {
    const config = readGlassUpdaterConfig();
    const installedVersionCode = native.getInstalledVersionCode() || config.fallbackVersionCode;
    const response = await fetch(`https://api.github.com/repos/${config.repo}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) return;
    const payload: unknown = await response.json();
    const update = parseGitHubGlassRelease(payload, installedVersionCode, config.upstreamSha);
    if (!update) {
      if (state.phase === "available" || state.phase === "error") {
        setState({
          phase: "idle",
          update: null,
          progress: null,
          errorMessage: null,
          dismissedTag: state.dismissedTag,
        });
      }
      return;
    }
    setState({
      phase: "available",
      update,
      progress: null,
      errorMessage: null,
      dismissedTag: state.dismissedTag === update.tagName ? state.dismissedTag : null,
    });
  } catch {
    // Offline or GitHub rate limit: stay silent and retry on next foreground interval.
  } finally {
    checkInFlight = false;
  }
}

export async function startGlassUpdateInstall(): Promise<void> {
  const native = getNativeUpdater();
  const update = state.update;
  if (!native || !update || state.phase === "downloading") return;

  if (state.phase === "permission_required") {
    try {
      const result = await native.installCachedApk(update.fileName, update.expectedSha256);
      setState({
        ...state,
        phase: result === "permission_required" ? "permission_required" : "available",
        progress: null,
        errorMessage: null,
      });
    } catch (error) {
      setState({
        ...state,
        phase: "error",
        progress: null,
        errorMessage: error instanceof Error ? error.message : "Install failed.",
      });
    }
    return;
  }

  setState({
    ...state,
    phase: "downloading",
    progress: 0,
    errorMessage: null,
  });

  const subscription = native.addListener?.("onDownloadProgress", (event) => {
    setState({
      ...state,
      phase: "downloading",
      progress: event.progress >= 0 ? event.progress : null,
    });
  });

  try {
    const result = await native.downloadAndInstallApk(
      update.downloadUrl,
      update.expectedSha256,
      update.fileName,
    );
    setState({
      ...state,
      phase: result === "permission_required" ? "permission_required" : "available",
      progress: null,
      errorMessage: null,
    });
  } catch (error) {
    setState({
      ...state,
      phase: "error",
      progress: null,
      errorMessage: error instanceof Error ? error.message : "Download failed.",
    });
  } finally {
    subscription?.remove();
  }
}

export function installGlassUpdateChecker(): () => void {
  if (Platform.OS !== "android") return () => {};

  const initialTimer = setTimeout(() => {
    void checkForGlassUpdate();
  }, 3_000);

  const appStateSub = AppState.addEventListener("change", (nextState) => {
    if (nextState !== "active") return;
    const native = getNativeUpdater();
    if (state.phase === "permission_required" && state.update && native?.canRequestPackageInstalls()) {
      void startGlassUpdateInstall();
      return;
    }
    void checkForGlassUpdate();
  });

  return () => {
    clearTimeout(initialTimer);
    appStateSub.remove();
  };
}
