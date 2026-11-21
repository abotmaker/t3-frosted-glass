import type {
  RelayAgentActivityAggregateRow,
  RelayAgentActivityAggregateState,
  RelayAgentAwarenessPhase,
} from "@t3tools/contracts/relay";
import type { AgentAwarenessState } from "@t3tools/shared/agentAwareness";

export const TERMINAL_AGENT_ACTIVITY_DISPLAY_TTL_MS = 15 * 60 * 1_000;
const TERMINAL_NOTIFICATION_FRESHNESS_MS = 2 * 60 * 1_000;
const RUNNING_AGENT_ACTIVITY_ROW_TTL_MS = 2 * 60 * 60 * 1_000;
const WAITING_AGENT_ACTIVITY_ROW_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_ACTIVITY_ROWS = 5;
const MAX_SUMMARY_TEXT_LENGTH = 120;
const MAX_STATUS_TEXT_LENGTH = 40;
const MAX_DEEP_LINK_LENGTH = 512;

export function statusForPhase(phase: RelayAgentAwarenessPhase): string {
  switch (phase) {
    case "waiting_for_approval":
      return "Approval";
    case "waiting_for_input":
      return "Input";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "starting":
      return "Connecting";
    case "running":
      return "Working";
    case "stale":
      return "Waiting";
  }
}

export function activityPhasePriority(phase: RelayAgentAwarenessPhase): number {
  if (phase === "waiting_for_approval" || phase === "waiting_for_input") return 0;
  if (phase === "failed") return 1;
  if (phase === "starting" || phase === "running") return 2;
  return 3;
}

export function isTerminalPhase(phase: RelayAgentAwarenessPhase): boolean {
  return phase === "completed" || phase === "failed";
}

function isAttentionPhase(phase: RelayAgentAwarenessPhase): boolean {
  return phase === "waiting_for_approval" || phase === "waiting_for_input";
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength - 3).trimEnd() + "...";
}

function sanitizeDeepLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }
  return truncateText(trimmed, MAX_DEEP_LINK_LENGTH);
}

function parseTimestampMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

export function agentActivityRowExpiresAt(
  row: Pick<RelayAgentActivityAggregateRow, "phase" | "updatedAt">,
): number {
  const updatedAtMs = parseTimestampMs(row.updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return 0;
  }
  if (isTerminalPhase(row.phase)) {
    return updatedAtMs + TERMINAL_AGENT_ACTIVITY_DISPLAY_TTL_MS;
  }
  const ttlMs =
    row.phase === "running" || row.phase === "starting"
      ? RUNNING_AGENT_ACTIVITY_ROW_TTL_MS
      : WAITING_AGENT_ACTIVITY_ROW_TTL_MS;
  return updatedAtMs + ttlMs;
}

function sanitizeRow(row: RelayAgentActivityAggregateRow): RelayAgentActivityAggregateRow {
  return {
    ...row,
    projectTitle: truncateText(row.projectTitle || "Project", MAX_SUMMARY_TEXT_LENGTH),
    threadTitle: truncateText(row.threadTitle || "Thread", MAX_SUMMARY_TEXT_LENGTH),
    modelTitle: truncateText(row.modelTitle || "", MAX_SUMMARY_TEXT_LENGTH),
    status: truncateText(row.status || statusForPhase(row.phase), MAX_STATUS_TEXT_LENGTH),
    deepLink: sanitizeDeepLink(row.deepLink),
  };
}

function rowKey(row: Pick<RelayAgentActivityAggregateRow, "environmentId" | "threadId">): string {
  return JSON.stringify([row.environmentId, row.threadId]);
}

function toAggregateRow(state: AgentAwarenessState): RelayAgentActivityAggregateRow {
  return sanitizeRow({
    environmentId: state.environmentId,
    threadId: state.threadId,
    projectTitle: state.projectTitle,
    threadTitle: state.threadTitle,
    modelTitle: state.modelTitle,
    phase: state.phase,
    status: statusForPhase(state.phase),
    updatedAt: state.updatedAt,
    deepLink: state.deepLink,
  });
}

function isRowLiveOrRecent(row: RelayAgentActivityAggregateRow, nowMs: number): boolean {
  const expiresAt = agentActivityRowExpiresAt(row);
  return expiresAt > nowMs;
}

/**
 * Merges live connected environment states with the authenticated relay snapshot.
 *
 * When a thread exists in both sources, live local WebSocket rows override stale relay
 * entries (or newer timestamps win); relay-only rows from other machines (Mac/Desktop/Web)
 * are preserved alongside local rows.
 */
export function mergeAgentActivityAggregates(input: {
  readonly relayAggregate: RelayAgentActivityAggregateState | null;
  readonly localStates: ReadonlyArray<AgentAwarenessState>;
  readonly liveLocalEnvironmentIds: ReadonlySet<string>;
  readonly nowMs: number;
}): RelayAgentActivityAggregateState | null {
  const merged = new Map<string, RelayAgentActivityAggregateRow>();

  for (const row of input.relayAggregate?.activities ?? []) {
    const sanitized = sanitizeRow(row);
    if (!isRowLiveOrRecent(sanitized, input.nowMs)) continue;
    merged.set(rowKey(sanitized), sanitized);
  }

  // Track which threads are currently represented in live local environments so a
  // thread that already stopped/settled locally drops an outdated relay entry immediately.
  const localRowsByKey = new Map<string, RelayAgentActivityAggregateRow>();
  for (const state of input.localStates) {
    const row = toAggregateRow(state);
    if (!isRowLiveOrRecent(row, input.nowMs)) continue;
    localRowsByKey.set(rowKey(row), row);
  }

  for (const [key, existing] of merged) {
    if (input.liveLocalEnvironmentIds.has(existing.environmentId) && !localRowsByKey.has(key)) {
      // Live local environment already moved past this thread (e.g. settled/archived/cancelled).
      merged.delete(key);
    }
  }

  for (const [key, localRow] of localRowsByKey) {
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, localRow);
      continue;
    }
    const existingMs = parseTimestampMs(existing.updatedAt);
    const localMs = parseTimestampMs(localRow.updatedAt);
    if (
      input.liveLocalEnvironmentIds.has(localRow.environmentId) ||
      !Number.isFinite(existingMs) ||
      (Number.isFinite(localMs) && localMs >= existingMs)
    ) {
      merged.set(key, localRow);
    }
  }

  const allRows = Array.from(merged.values());
  const activeRows = allRows
    .filter((row) => !isTerminalPhase(row.phase))
    .sort((a, b) => {
      const priorityDiff = activityPhasePriority(a.phase) - activityPhasePriority(b.phase);
      if (priorityDiff !== 0) return priorityDiff;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  const recentTerminalRows = allRows
    .filter((row) => isTerminalPhase(row.phase))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (activeRows.length === 0) {
    const newest = recentTerminalRows[0];
    if (!newest) return null;
    return {
      title: "T3 Code",
      subtitle: newest.phase === "failed" ? "Agent work failed" : "Agent work completed",
      activeCount: 0,
      updatedAt: newest.updatedAt,
      activities: recentTerminalRows.slice(0, MAX_ACTIVITY_ROWS),
    };
  }

  const displayedRows = [...activeRows.slice(0, MAX_ACTIVITY_ROWS), ...recentTerminalRows].slice(
    0,
    MAX_ACTIVITY_ROWS,
  );
  const latestUpdatedAt = [...activeRows, ...recentTerminalRows].reduce((latest, row) =>
    row.updatedAt.localeCompare(latest.updatedAt) > 0 ? row : latest,
  ).updatedAt;

  return {
    title: "T3 Code",
    subtitle: "Agent work in progress",
    activeCount: activeRows.length,
    updatedAt: latestUpdatedAt,
    activities: displayedRows,
  };
}

export function buildAndroidActivityData(
  aggregate: RelayAgentActivityAggregateState | null,
): Record<string, string> {
  const rows = [...(aggregate?.activities ?? [])].sort(
    (a, b) => activityPhasePriority(a.phase) - activityPhasePriority(b.phase),
  );
  const activeCount = aggregate?.activeCount ?? 0;
  const attentionCount = rows.filter((row) => activityPhasePriority(row.phase) === 0).length;
  const failed = rows.some((row) => row.phase === "failed");
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const lines = rows.map((row) =>
    [row.status, clean(row.threadTitle), clean(row.projectTitle)].join("\t"),
  );
  const hero = rows[0];
  const title =
    activeCount > 0
      ? `${activeCount} active agent${activeCount === 1 ? "" : "s"}${
          attentionCount
            ? ` · ${attentionCount} need${attentionCount === 1 ? "s" : ""} attention`
            : ""
        }`
      : failed
        ? "Agent work failed"
        : "Agent work completed";
  const expiresAt = Math.max(0, ...rows.map((row) => agentActivityRowExpiresAt(row)));
  return {
    active: String(activeCount > 0),
    activity_chip: activeCount > 0 ? (attentionCount > 0 ? "Review" : "Active") : "",
    activity_title: title,
    activity_phase: hero?.phase ?? "",
    activity_active_count: String(activeCount),
    activity_attention_count: String(attentionCount),
    activity_body: hero
      ? `${hero.status}: ${clean(hero.threadTitle)} · ${clean(hero.projectTitle)}`
      : "",
    ...Object.fromEntries(lines.map((line, index) => [`activity_line_${index}`, line])),
    activity_path: hero?.deepLink ?? "/",
    activity_expires_at: String(expiresAt),
  };
}

function isFreshTerminalNotification(updatedAt: string, nowMs: number): boolean {
  const updatedAtMs = parseTimestampMs(updatedAt);
  return Number.isFinite(updatedAtMs) && nowMs - updatedAtMs <= TERMINAL_NOTIFICATION_FRESHNESS_MS;
}

export function buildAndroidAlertForTransition(input: {
  readonly previousAggregate: RelayAgentActivityAggregateState | null;
  readonly nextAggregate: RelayAgentActivityAggregateState | null;
  readonly nowMs: number;
  readonly notificationsEnabled: boolean;
}): Record<string, string> | null {
  if (!input.notificationsEnabled || !input.previousAggregate || !input.nextAggregate) {
    // Missing baseline is a cold-start replay; never buzz for pre-existing state.
    return null;
  }

  const previouslyAttention = new Set(
    input.previousAggregate.activities
      .filter((row) => isAttentionPhase(row.phase))
      .map(rowKey),
  );
  const attentionRows = input.nextAggregate.activities.filter(
    (row) => isAttentionPhase(row.phase) && !previouslyAttention.has(rowKey(row)),
  );

  let alertRows: ReadonlyArray<RelayAgentActivityAggregateRow> = attentionRows;
  if (alertRows.length === 0) {
    const previousPhases = new Map(
      input.previousAggregate.activities.map((row) => [rowKey(row), row.phase]),
    );
    alertRows = input.nextAggregate.activities.filter((row) => {
      if (!isTerminalPhase(row.phase)) return false;
      const previousPhase = previousPhases.get(rowKey(row));
      return (
        previousPhase !== "completed" &&
        previousPhase !== "failed" &&
        isFreshTerminalNotification(row.updatedAt, input.nowMs)
      );
    });
  }

  const first = alertRows[0];
  if (!first) return null;

  if (alertRows.length === 1) {
    const sanitized = sanitizeRow(first);
    return {
      alert_id: JSON.stringify([
        sanitized.environmentId,
        sanitized.threadId,
        sanitized.phase,
        sanitized.updatedAt,
      ]),
      alert_group: JSON.stringify([sanitized.environmentId, sanitized.threadId]),
      alert_title: sanitized.projectTitle
        ? `${sanitized.status} · ${sanitized.projectTitle}`
        : sanitized.status,
      alert_body: sanitized.threadTitle,
      alert_path: sanitized.deepLink,
    };
  }

  return {
    alert_id: JSON.stringify(
      alertRows
        .map((row) => [row.environmentId, row.threadId, row.phase, row.updatedAt])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ),
    alert_title: `${alertRows.length} agents ${isAttentionPhase(first.phase) ? "need attention" : "finished"}`,
    alert_body: alertRows.map((row) => row.threadTitle).join(", "),
    alert_path: "/",
  };
}

export interface LocalAgentActivityDelivery {
  readonly data: Record<string, string>;
  readonly signature: string;
  readonly hasAlert: boolean;
  readonly isActive: boolean;
}

export function buildLocalAgentActivityPayload(input: {
  readonly deviceId: string;
  readonly userId: string;
  readonly previousAggregate: RelayAgentActivityAggregateState | null;
  readonly nextAggregate: RelayAgentActivityAggregateState | null;
  readonly nowMs: number;
  readonly notificationsEnabled: boolean;
}): LocalAgentActivityDelivery {
  const activityData = buildAndroidActivityData(input.nextAggregate);
  const alertData = buildAndroidAlertForTransition({
    previousAggregate: input.previousAggregate,
    nextAggregate: input.nextAggregate,
    nowMs: input.nowMs,
    notificationsEnabled: input.notificationsEnabled,
  });

  const stableFields: Record<string, string> = {
    t3_kind: "agent_activity",
    device_id: input.deviceId,
    user_id: input.userId,
    ...activityData,
    ...(alertData ?? {}),
  };

  const signature = JSON.stringify(
    Object.entries(stableFields).sort(([a], [b]) => a.localeCompare(b)),
  );

  return {
    data: {
      ...stableFields,
      updated_at: String(input.nowMs),
    },
    signature,
    hasAlert: alertData !== null,
    isActive: activityData.active === "true",
  };
}
