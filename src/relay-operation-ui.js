export const RELAY_PROGRESS_STATES = Object.freeze({
  queued: { label: "up next", tone: "quiet" },
  "reserved-but-idle": { label: "reserved", tone: "quiet" },
  working: { label: "working", tone: "good" },
  "waiting-on-external-system": { label: "waiting on system", tone: "wait" },
  "waiting-for-human": { label: "waiting for you", tone: "act" },
  blocked: { label: "blocked", tone: "bad" },
  "possibly-stale": { label: "possibly stale", tone: "warn" },
  "officially-stale": { label: "stale", tone: "bad" },
  failed: { label: "failed", tone: "bad" },
  "rolled-back": { label: "rolled back", tone: "warn" },
  complete: { label: "finished", tone: "done" }
});

export function progressStateMeta(state) {
  return RELAY_PROGRESS_STATES[state] || { label: String(state || "recorded").replaceAll("-", " "), tone: "quiet" };
}

export function progressTimestamp(item) {
  return item?.last_meaningful_progress_at || item?.latest_event?.at || item?.worker?.heartbeat_at || null;
}

export function sortObservedProgress(items = []) {
  return [...items].sort((a, b) => Date.parse(progressTimestamp(b) || 0) - Date.parse(progressTimestamp(a) || 0));
}

export function observedProgressSummary(item = {}) {
  const meta = progressStateMeta(item.state);
  const external = item.external?.active ? item.external?.detail || "external work is still running" : null;
  const waiting = item.waiting_reason || null;
  const recovery = item.recovery_action || null;
  const event = item.latest_event?.type ? item.latest_event.type.replaceAll("-", " ") : null;
  return {
    label: meta.label,
    tone: meta.tone,
    stage: String(item.stage || "recorded").replaceAll("-", " "),
    event,
    detail: external || waiting || event || "No newer execution evidence.",
    recovery
  };
}
