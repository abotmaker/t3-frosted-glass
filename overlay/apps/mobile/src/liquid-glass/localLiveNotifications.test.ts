import { afterEach, expect, it, vi } from "vite-plus/test";
import { installLocalLiveNotifications } from "./localLiveNotifications";

const harness = vi.hoisted(() => ({
  tick: () => {},
  change: (_state: string) => {},
  fetch: vi.fn(async () => ({ _tag: "Success", value: { aggregate: null } })),
  project: vi.fn(() => null),
  projects: new Map<string, { title: string }>(),
  threads: [{ archivedAt: null, deletedAt: null, lineage: { parentThreadId: null } }],
  nextLocal: () => {},
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppState: {
    currentState: "active",
    addEventListener: (_: string, cb: typeof harness.change) => {
      harness.change = cb;
      return { remove() {} };
    },
  },
}));
vi.mock("expo-notifications", () => ({ getPermissionsAsync: async () => ({ granted: true }) }));
vi.mock("../features/agent-awareness/androidNotifications", () => ({
  supportsLocalAndroidLiveUpdates: () => true,
  getLastAndroidAgentNotificationsConfig: () => ({ deviceId: "d", userId: "u", ongoingEnabled: true }),
  subscribeAndroidAgentNotificationsConfigured: () => () => {},
  addLocalAndroidLiveTickListener: (cb: () => void) => { harness.tick = cb; return () => {}; },
  receiveLocalAndroidAgentActivity: vi.fn(),
  stopLocalAndroidLiveService: vi.fn(),
}));
vi.mock("./localLiveNotificationsBridge", () => ({
  getLocalLiveAuthState: () => ({ tokenProvider: async () => "test-token", identity: "u" }),
  subscribeLocalLiveAuth: () => () => {},
  subscribeLocalLiveWorkArmed: () => () => {},
}));
vi.mock("../features/cloud/publicConfig", () => ({
  resolveCloudPublicConfig: () => ({ relay: { url: "https://example.test" } }),
}));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({ settleAsyncResult: harness.fetch }));
vi.mock("@t3tools/client-runtime/state/connections", () => ({ enabledEnvironmentIds: () => ["env"] }));
vi.mock("@t3tools/client-runtime/relay", () => ({ ManagedRelay: {} }));
vi.mock("../lib/runtime", () => ({ runtime: {} }));
vi.mock("../connection/catalog", () => ({ environmentCatalog: { catalogValueAtom: "catalog" } }));
vi.mock("../state/preferences", () => ({ mobilePreferencesAtom: "preferences" }));
vi.mock("../state/shell", () => ({ environmentShell: { stateValueAtom: () => "shell" } }));
vi.mock("../state/projects", () => ({
  environmentProjects: { projectsAtom: "projects", environmentProjectIndexAtom: () => "projects" },
}));
vi.mock("../state/threads", () => ({
  environmentThreadShells: { quietThreadShellsAtom: "quiet", environmentThreadsAtom: () => "threads" },
}));
vi.mock("../state/atom-registry", () => ({
  appAtomRegistry: {
    get: (atom: string) => {
      if (atom === "threads") return harness.threads;
      if (atom === "projects") return harness.projects;
      if (atom === "shell") return { status: "live" };
      return {};
    },
    subscribe: (atom: string, cb: () => void) => {
      if (atom === "quiet") harness.nextLocal = cb;
      return () => {};
    },
  },
}));
vi.mock("@t3tools/shared/agentAwareness", async (original) => ({
  ...await original<typeof import("@t3tools/shared/agentAwareness")>(),
  projectThreadAwarenessV2: harness.project,
}));

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  vi.useRealTimers();
});

it("hands polling to the service in background and reuses unchanged local projections", async () => {
  vi.useFakeTimers();
  dispose = installLocalLiveNotifications();
  await vi.advanceTimersByTimeAsync(0);
  expect(harness.fetch).toHaveBeenCalledTimes(1);
  expect(harness.project).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(5_000);
  harness.tick();
  expect(harness.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(harness.fetch).toHaveBeenCalledTimes(2);
  expect(harness.project).toHaveBeenCalledTimes(1);

  harness.change("background");
  await vi.advanceTimersByTimeAsync(1_000);
  harness.tick();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(harness.fetch).toHaveBeenCalledTimes(2);
  harness.tick();
  await vi.advanceTimersByTimeAsync(8_000);
  expect(harness.fetch).toHaveBeenCalledTimes(3);

  harness.projects = new Map();
  harness.change("active");
  await vi.advanceTimersByTimeAsync(0);
  expect(harness.fetch).toHaveBeenCalledTimes(4);
  expect(harness.project).toHaveBeenCalledTimes(2);
  harness.threads = [...harness.threads];
  harness.nextLocal();
  await vi.advanceTimersByTimeAsync(150);
  expect(harness.project).toHaveBeenCalledTimes(3);
  expect(harness.fetch).toHaveBeenCalledTimes(4);
});
