import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import { settleAsyncResult } from "@t3tools/client-runtime/state/runtime";
import type { ThreadId } from "@t3tools/contracts";
import type { RelayAgentActivityAggregateState } from "@t3tools/contracts/relay";
import {
  type AgentAwarenessState,
  projectThreadAwarenessV2,
  subagentAwaitsUser,
  type SubagentRequestAwareness,
} from "@t3tools/shared/agentAwareness";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { AsyncResult } from "effect/reactivity";
import * as Notifications from "expo-notifications";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { environmentCatalog } from "../connection/catalog";
import {
  addLocalAndroidLiveTickListener,
  type AndroidAgentNotificationsConfig,
  configureAndroidAgentNotifications,
  getLastAndroidAgentNotificationsConfig,
  receiveLocalAndroidAgentActivity,
  stopLocalAndroidLiveService,
  subscribeAndroidAgentNotificationsConfigured,
  supportsLocalAndroidLiveUpdates,
} from "../features/agent-awareness/androidNotifications";
import { resolveCloudPublicConfig } from "../features/cloud/publicConfig";
import { runtime } from "../lib/runtime";
import { appAtomRegistry } from "../state/atom-registry";
import { mobilePreferencesAtom } from "../state/preferences";
import { environmentProjects } from "../state/projects";
import { environmentShell } from "../state/shell";
import { environmentThreadShells } from "../state/threads";
import { setAppForegroundActive } from "./appForegroundState";
import {
  getLocalLiveAuthState,
  type LocalLiveArmedWork,
  type LocalLiveAuthState,
  subscribeLocalLiveAuth,
  subscribeLocalLiveWorkArmed,
} from "./localLiveNotificationsBridge";
import {
  buildLocalAgentActivityPayload,
  mergeAgentActivityAggregates,
} from "./localLiveNotificationsPayload";

const FOREGROUND_IDLE_POLL_MS = 8_000;
const FOREGROUND_ACTIVE_POLL_MS = 4_000;
const MIN_RELAY_POLL_GAP_MS = 3_000;
const LOCAL_DEBOUNCE_MS = 150;
const ARMED_WORK_TTL_MS = 15_000;
const LOCAL_FALLBACK_DEVICE_ID = "glass-local-device";
const LOCAL_FALLBACK_USER_ID = "glass-local-user";

interface OptimisticArmedEntry {
  readonly state: AgentAwarenessState;
  readonly expiresAt: number;
}

function readLocalThreadAwarenessStates(): {
  readonly states: ReadonlyArray<AgentAwarenessState>;
  readonly liveEnvironmentIds: ReadonlySet<string>;
} {
  const catalog = appAtomRegistry.get(environmentCatalog.catalogValueAtom);
  const envIds = enabledEnvironmentIds(catalog);
  const liveEnvironmentIds = new Set<string>();
  const states: AgentAwarenessState[] = [];

  for (const environmentId of envIds) {
    const shellState = appAtomRegistry.get(environmentShell.stateValueAtom(environmentId));
    if (shellState.status !== "live") {
      continue;
    }
    liveEnvironmentIds.add(environmentId);

    const threads = appAtomRegistry.get(
      environmentThreadShells.environmentThreadsAtom(environmentId),
    );
    const projectIndex = appAtomRegistry.get(
      environmentProjects.environmentProjectIndexAtom(environmentId),
    );

    const subagentRequestsByParent = new Map<string, SubagentRequestAwareness>();
    for (const thread of threads) {
      if (thread.archivedAt !== null || thread.deletedAt !== null) continue;
      const parentId = thread.lineage.parentThreadId;
      if (!parentId || !subagentAwaitsUser(thread)) continue;
      const req = thread.pendingRuntimeRequest;
      if (!req) continue;
      const candidate: SubagentRequestAwareness = {
        requestId: req.id,
        updatedAt: thread.updatedAt,
        waitsForInput: req.kind === "user_input",
      };
      const existing = subagentRequestsByParent.get(parentId);
      if (!existing || DateTime.isGreaterThan(candidate.updatedAt, existing.updatedAt)) {
        subagentRequestsByParent.set(parentId, candidate);
      }
    }

    for (const thread of threads) {
      if (thread.archivedAt !== null || thread.deletedAt !== null) continue;
      const project = projectIndex.get(thread.projectId);
      const awareness = projectThreadAwarenessV2({
        environmentId,
        project: { title: project?.title ?? "Project" },
        thread,
        pendingSubagentRequest: subagentRequestsByParent.get(thread.id) ?? null,
      });
      if (awareness !== null) {
        states.push(awareness);
      }
    }
  }

  return { states, liveEnvironmentIds };
}

function readLiveActivitiesPreferenceEnabled(): boolean {
  const result = appAtomRegistry.get(mobilePreferencesAtom);
  if (AsyncResult.isSuccess(result)) {
    return result.value.liveActivitiesEnabled !== false;
  }
  return true;
}

export function installLocalLiveNotifications(): () => void {
  if (Platform.OS !== "android" || !supportsLocalAndroidLiveUpdates()) {
    return () => {};
  }

  let disposed = false;
  let appState: AppStateStatus = (AppState.currentState ?? "active") as AppStateStatus;
  setAppForegroundActive(appState === "active");
  let authState: LocalLiveAuthState = getLocalLiveAuthState();
  let nativeConfig: AndroidAgentNotificationsConfig | null =
    getLastAndroidAgentNotificationsConfig();
  let permissionGranted = false;
  let latestRelayAggregate: RelayAgentActivityAggregateState | null = null;
  let previousAggregate: RelayAgentActivityAggregateState | null = null;
  let hasBaseline = false;
  let lastDeliveredSignature: string | null = null;
  let lastDeliveredActive = false;
  let relayFetchInFlight = false;
  let lastRelayFetchAt = 0;
  let armedWork: OptimisticArmedEntry | null = null;

  let localDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let foregroundPollTimer: ReturnType<typeof setTimeout> | null = null;

  const hasRelayUrl = () => Boolean(resolveCloudPublicConfig().relay.url);

  const clearTimers = () => {
    if (localDebounceTimer !== null) {
      clearTimeout(localDebounceTimer);
      localDebounceTimer = null;
    }
    if (foregroundPollTimer !== null) {
      clearTimeout(foregroundPollTimer);
      foregroundPollTimer = null;
    }
  };

  const resetDeliveryState = (stopService: boolean) => {
    latestRelayAggregate = null;
    previousAggregate = null;
    hasBaseline = false;
    lastDeliveredSignature = null;
    lastDeliveredActive = false;
    armedWork = null;
    if (stopService) {
      stopLocalAndroidLiveService();
    }
  };

  const ensureNativeIdentity = (
    hasLocalStates: boolean,
    ongoingEnabled: boolean,
  ): AndroidAgentNotificationsConfig | null => {
    if (nativeConfig !== null) {
      if (nativeConfig.ongoingEnabled !== ongoingEnabled) {
        configureAndroidAgentNotifications(
          nativeConfig.deviceId,
          nativeConfig.userId,
          ongoingEnabled,
        );
      }
      return nativeConfig;
    }
    // Direct LAN / Tailscale users who are not signed into T3 Connect still get Live Updates.
    if (!authState.tokenProvider && hasLocalStates && permissionGranted) {
      configureAndroidAgentNotifications(
        LOCAL_FALLBACK_DEVICE_ID,
        LOCAL_FALLBACK_USER_ID,
        ongoingEnabled,
      );
      return nativeConfig;
    }
    return null;
  };

  const scheduleNextForegroundPoll = () => {
    if (foregroundPollTimer !== null) {
      clearTimeout(foregroundPollTimer);
      foregroundPollTimer = null;
    }
    if (disposed || appState !== "active" || !authState.tokenProvider || !hasRelayUrl()) {
      return;
    }
    const interval = lastDeliveredActive ? FOREGROUND_ACTIVE_POLL_MS : FOREGROUND_IDLE_POLL_MS;
    foregroundPollTimer = setTimeout(() => {
      foregroundPollTimer = null;
      void pollRelayAndSync(false);
    }, interval);
  };

  const syncNow = () => {
    if (disposed) return;

    const nowMs = Date.now();
    const ongoingEnabled = readLiveActivitiesPreferenceEnabled();
    const { states: localStates, liveEnvironmentIds } = readLocalThreadAwarenessStates();

    if (armedWork !== null && (nowMs >= armedWork.expiresAt || localStates.some((s) => s.phase !== "completed" && s.phase !== "failed"))) {
      armedWork = null;
    }

    const effectiveLocalStates =
      armedWork !== null ? [...localStates, armedWork.state] : localStates;

    const config = ensureNativeIdentity(effectiveLocalStates.length > 0, ongoingEnabled);
    if (!config || !permissionGranted) {
      if (lastDeliveredActive) {
        stopLocalAndroidLiveService();
        lastDeliveredActive = false;
      }
      return;
    }

    const nextAggregate = mergeAgentActivityAggregates({
      relayAggregate: latestRelayAggregate,
      localStates: effectiveLocalStates,
      liveLocalEnvironmentIds: liveEnvironmentIds,
      nowMs,
    });

    const delivery = buildLocalAgentActivityPayload({
      deviceId: config.deviceId,
      userId: config.userId,
      previousAggregate: hasBaseline ? previousAggregate : null,
      nextAggregate,
      nowMs,
      notificationsEnabled: permissionGranted,
    });

    const activeChanged = delivery.isActive !== lastDeliveredActive;
    const shouldDeliver =
      delivery.signature !== lastDeliveredSignature ||
      delivery.hasAlert ||
      activeChanged;

    previousAggregate = nextAggregate;
    hasBaseline = true;

    if (!shouldDeliver) {
      return;
    }

    lastDeliveredSignature = delivery.signature;
    lastDeliveredActive = delivery.isActive;
    receiveLocalAndroidAgentActivity(delivery.data);

    if (appState === "active") {
      scheduleNextForegroundPoll();
    }
  };

  const scheduleLocalSync = () => {
    if (disposed) return;
    if (localDebounceTimer !== null) return;
    localDebounceTimer = setTimeout(() => {
      localDebounceTimer = null;
      syncNow();
    }, LOCAL_DEBOUNCE_MS);
  };

  const refreshPermission = async (): Promise<boolean> => {
    try {
      const permissions = await Notifications.getPermissionsAsync();
      permissionGranted = permissions.granted;
    } catch {
      permissionGranted = false;
    }
    return permissionGranted;
  };

  const pollRelayAndSync = async (force: boolean): Promise<void> => {
    if (disposed) return;
    const provider = authState.tokenProvider;
    const nowMs = Date.now();

    if (!provider || !hasRelayUrl()) {
      syncNow();
      return;
    }

    if (relayFetchInFlight) return;
    if (!force && nowMs - lastRelayFetchAt < MIN_RELAY_POLL_GAP_MS) {
      syncNow();
      scheduleNextForegroundPoll();
      return;
    }

    relayFetchInFlight = true;
    lastRelayFetchAt = nowMs;
    try {
      const clerkToken = await provider().catch(() => null);
      if (disposed || !clerkToken) {
        syncNow();
        return;
      }
      const result = await settleAsyncResult(() =>
        runtime.runPromiseExit(
          ManagedRelay.ManagedRelayClient.pipe(
            Effect.flatMap((client) => client.getAgentActivitySnapshot({ clerkToken })),
          ),
        ),
      );
      if (disposed) return;
      if (result._tag === "Success") {
        latestRelayAggregate = result.value.aggregate;
      }
      syncNow();
    } finally {
      relayFetchInFlight = false;
      scheduleNextForegroundPoll();
    }
  };

  const handleArmedWork = (work: LocalLiveArmedWork) => {
    if (disposed || !readLiveActivitiesPreferenceEnabled()) return;
    const nowMs = Date.now();
    armedWork = {
      expiresAt: nowMs + ARMED_WORK_TTL_MS,
      state: {
        environmentId: work.environmentId,
        threadId: `__armed__:${work.environmentId}` as ThreadId,
        projectTitle: work.projectTitle || "Project",
        threadTitle: work.threadTitle || "T3 Code",
        phase: "starting",
        headline: "Starting agent",
        modelTitle: "",
        updatedAt: new Date(nowMs).toISOString(),
        deepLink: "/",
      },
    };
    // Run immediately while the app is still in foreground so Android grants FGS start!
    syncNow();
  };

  const unsubAuth = subscribeLocalLiveAuth((next) => {
    const accountChanged = next.identity !== authState.identity || Boolean(next.tokenProvider) !== Boolean(authState.tokenProvider);
    authState = next;
    if (!next.tokenProvider) {
      resetDeliveryState(true);
      clearTimers();
      return;
    }
    if (accountChanged) {
      resetDeliveryState(false);
    }
    void refreshPermission().then(() => pollRelayAndSync(true));
  });

  const unsubConfigured = subscribeAndroidAgentNotificationsConfigured((config) => {
    const identityChanged =
      config?.deviceId !== nativeConfig?.deviceId ||
      config?.userId !== nativeConfig?.userId;
    nativeConfig = config;
    if (!config) {
      resetDeliveryState(true);
      return;
    }
    if (identityChanged) {
      lastDeliveredSignature = null;
      lastDeliveredActive = false;
    }
    scheduleLocalSync();
  });

  const unsubArmed = subscribeLocalLiveWorkArmed(handleArmedWork);

  const unsubNativeTick = addLocalAndroidLiveTickListener(() => {
    // Fired every 5s by T3LiveUpdatesForegroundService while an agent is active,
    // keeping updates alive even when the screen is locked or app is backgrounded.
    void pollRelayAndSync(true);
  });

  // Subscribe to quietThreadShellsAtom rather than threadShellsAtom so 10-30Hz streaming
  // token ticks do not trigger JS-thread notification scans; phase, approval, input, title,
  // and completion transitions still fire immediately.
  const unsubThreadShells = appAtomRegistry.subscribe(
    environmentThreadShells.quietThreadShellsAtom,
    () => {
      scheduleLocalSync();
    },
  );

  const unsubProjects = appAtomRegistry.subscribe(environmentProjects.projectsAtom, () => {
    scheduleLocalSync();
  });

  const unsubPreferences = appAtomRegistry.subscribe(mobilePreferencesAtom, () => {
    scheduleLocalSync();
  });

  const appStateSub = AppState.addEventListener("change", (nextState) => {
    appState = nextState;
    setAppForegroundActive(nextState === "active");
    if (nextState === "active") {
      void refreshPermission().then(() => pollRelayAndSync(true));
    } else if (foregroundPollTimer !== null) {
      clearTimeout(foregroundPollTimer);
      foregroundPollTimer = null;
    }
  });

  // Initial startup sync.
  void refreshPermission().then(() => {
    if (disposed) return;
    if (authState.tokenProvider) {
      void pollRelayAndSync(true);
    } else {
      syncNow();
    }
  });

  return () => {
    disposed = true;
    clearTimers();
    unsubAuth();
    unsubConfigured();
    unsubArmed();
    unsubNativeTick();
    unsubThreadShells();
    unsubProjects();
    unsubPreferences();
    appStateSub.remove();
    stopLocalAndroidLiveService();
  };
}
