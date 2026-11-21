import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { RelayAgentActivityAggregateState } from "@t3tools/contracts/relay";
import type { AgentAwarenessState } from "@t3tools/shared/agentAwareness";
import { describe, expect, it } from "vite-plus/test";

import {
  buildLocalAgentActivityPayload,
  mergeAgentActivityAggregates,
} from "./localLiveNotificationsPayload";

const ENV_LOCAL = "env-local" as EnvironmentId;
const ENV_MAC = "env-mac" as EnvironmentId;
const THREAD_A = "thread-a" as ThreadId;
const THREAD_B = "thread-b" as ThreadId;

function makeLocalState(
  overrides: Partial<AgentAwarenessState> = {},
): AgentAwarenessState {
  return {
    environmentId: ENV_LOCAL,
    threadId: THREAD_A,
    projectTitle: "t3-android",
    threadTitle: "Fix live updates",
    phase: "running",
    headline: "Agent is working",
    modelTitle: "gemini-4",
    updatedAt: "2026-11-21T19:00:00.000Z",
    deepLink: `/threads/${ENV_LOCAL}/${THREAD_A}`,
    ...overrides,
  };
}

describe("localLiveNotificationsPayload", () => {
  const nowMs = Date.parse("2026-11-21T19:00:30.000Z");

  it("merges live local threads and remote relay threads with attention priority first", () => {
    const relayAggregate: RelayAgentActivityAggregateState = {
      title: "T3 Code",
      subtitle: "Agent work in progress",
      activeCount: 2,
      updatedAt: "2026-11-21T19:00:10.000Z",
      activities: [
        {
          environmentId: ENV_LOCAL,
          threadId: THREAD_A,
          projectTitle: "t3-android",
          threadTitle: "Fix live updates",
          modelTitle: "gemini-4",
          phase: "starting",
          status: "Connecting",
          updatedAt: "2026-11-21T18:59:50.000Z",
          deepLink: `/threads/${ENV_LOCAL}/${THREAD_A}`,
        },
        {
          environmentId: ENV_MAC,
          threadId: THREAD_B,
          projectTitle: "mac-studio",
          threadTitle: "Review PR",
          modelTitle: "claude",
          phase: "waiting_for_approval",
          status: "Approval",
          updatedAt: "2026-11-21T19:00:10.000Z",
          deepLink: `/threads/${ENV_MAC}/${THREAD_B}`,
        },
      ],
    };

    const merged = mergeAgentActivityAggregates({
      relayAggregate,
      localStates: [makeLocalState({ phase: "running", updatedAt: "2026-11-21T19:00:20.000Z" })],
      liveLocalEnvironmentIds: new Set([ENV_LOCAL]),
      nowMs,
    });

    expect(merged).not.toBeNull();
    expect(merged!.activeCount).toBe(2);
    expect(merged!.activities[0]).toMatchObject({
      environmentId: ENV_MAC,
      threadId: THREAD_B,
      phase: "waiting_for_approval",
      status: "Approval",
    });
    expect(merged!.activities[1]).toMatchObject({
      environmentId: ENV_LOCAL,
      threadId: THREAD_A,
      phase: "running",
      status: "Working",
    });

    const delivery = buildLocalAgentActivityPayload({
      deviceId: "dev-1",
      userId: "user-1",
      previousAggregate: null,
      nextAggregate: merged,
      nowMs,
      notificationsEnabled: true,
    });

    expect(delivery.isActive).toBe(true);
    expect(delivery.hasAlert).toBe(false); // cold start baseline never buzzes
    expect(delivery.data).toMatchObject({
      t3_kind: "agent_activity",
      device_id: "dev-1",
      user_id: "user-1",
      active: "true",
      activity_chip: "Review",
      activity_phase: "waiting_for_approval",
      activity_active_count: "2",
      activity_attention_count: "1",
      activity_line_0: "Approval\tReview PR\tmac-studio",
      activity_line_1: "Working\tFix live updates\tt3-android",
      activity_path: `/threads/${ENV_MAC}/${THREAD_B}`,
    });
    expect(delivery.data.alert_id).toBeUndefined();
  });

  it("emits an alert on transition into waiting_for_approval or fresh completion", () => {
    const running = mergeAgentActivityAggregates({
      relayAggregate: null,
      localStates: [makeLocalState({ phase: "running" })],
      liveLocalEnvironmentIds: new Set([ENV_LOCAL]),
      nowMs,
    });
    const waitingApproval = mergeAgentActivityAggregates({
      relayAggregate: null,
      localStates: [
        makeLocalState({
          phase: "waiting_for_approval",
          updatedAt: "2026-11-21T19:00:25.000Z",
        }),
      ],
      liveLocalEnvironmentIds: new Set([ENV_LOCAL]),
      nowMs,
    });

    const approvalDelivery = buildLocalAgentActivityPayload({
      deviceId: "dev-1",
      userId: "user-1",
      previousAggregate: running,
      nextAggregate: waitingApproval,
      nowMs,
      notificationsEnabled: true,
    });

    expect(approvalDelivery.hasAlert).toBe(true);
    expect(approvalDelivery.isActive).toBe(true);
    expect(approvalDelivery.data).toMatchObject({
      alert_title: "Approval · t3-android",
      alert_body: "Fix live updates",
      alert_path: `/threads/${ENV_LOCAL}/${THREAD_A}`,
      activity_phase: "waiting_for_approval",
    });

    const completed = mergeAgentActivityAggregates({
      relayAggregate: null,
      localStates: [
        makeLocalState({
          phase: "completed",
          updatedAt: "2026-11-21T19:00:29.000Z",
        }),
      ],
      liveLocalEnvironmentIds: new Set([ENV_LOCAL]),
      nowMs,
    });

    const doneDelivery = buildLocalAgentActivityPayload({
      deviceId: "dev-1",
      userId: "user-1",
      previousAggregate: waitingApproval,
      nextAggregate: completed,
      nowMs,
      notificationsEnabled: true,
    });

    expect(doneDelivery.hasAlert).toBe(true);
    expect(doneDelivery.isActive).toBe(false);
    expect(doneDelivery.data).toMatchObject({
      active: "false",
      activity_phase: "completed",
      activity_line_0: "Done\tFix live updates\tt3-android",
      alert_title: "Done · t3-android",
      alert_body: "Fix live updates",
    });
  });

  it("produces stable signatures across unchanged ticks and clears expired activity", () => {
    const running = mergeAgentActivityAggregates({
      relayAggregate: null,
      localStates: [makeLocalState({ phase: "running" })],
      liveLocalEnvironmentIds: new Set([ENV_LOCAL]),
      nowMs,
    });

    const first = buildLocalAgentActivityPayload({
      deviceId: "dev-1",
      userId: "user-1",
      previousAggregate: running,
      nextAggregate: running,
      nowMs,
      notificationsEnabled: true,
    });
    const second = buildLocalAgentActivityPayload({
      deviceId: "dev-1",
      userId: "user-1",
      previousAggregate: running,
      nextAggregate: running,
      nowMs: nowMs + 5_000,
      notificationsEnabled: true,
    });

    expect(first.signature).toBe(second.signature);
    expect(first.hasAlert).toBe(false);
    expect(second.hasAlert).toBe(false);

    const cleared = buildLocalAgentActivityPayload({
      deviceId: "dev-1",
      userId: "user-1",
      previousAggregate: running,
      nextAggregate: null,
      nowMs: nowMs + 10_000,
      notificationsEnabled: true,
    });
    expect(cleared.isActive).toBe(false);
    expect(cleared.data.active).toBe("false");
    expect(cleared.data.activity_expires_at).toBe("0");
  });

  it("drops stale relay rows for live local environments that already settled", () => {
    const staleRelay: RelayAgentActivityAggregateState = {
      title: "T3 Code",
      subtitle: "Agent work in progress",
      activeCount: 1,
      updatedAt: "2026-11-21T19:00:00.000Z",
      activities: [
        {
          environmentId: ENV_LOCAL,
          threadId: THREAD_A,
          projectTitle: "t3-android",
          threadTitle: "Old run",
          modelTitle: "gemini-4",
          phase: "running",
          status: "Working",
          updatedAt: "2026-11-21T19:00:00.000Z",
          deepLink: `/threads/${ENV_LOCAL}/${THREAD_A}`,
        },
      ],
    };

    const merged = mergeAgentActivityAggregates({
      relayAggregate: staleRelay,
      localStates: [],
      liveLocalEnvironmentIds: new Set([ENV_LOCAL]),
      nowMs,
    });
    expect(merged).toBeNull();
  });
});
