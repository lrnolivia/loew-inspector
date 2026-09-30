export const PROGRESS_POLICY = Object.freeze({
  heartbeat_target_ms: 5 * 60 * 1000,
  possibly_stale_ms: 10 * 60 * 1000,
  officially_stale_ms: 20 * 60 * 1000
});

export function freshness(timestamp, now = new Date(), policy = PROGRESS_POLICY) {
  const ms = Date.parse(timestamp || "");
  if (!Number.isFinite(ms)) return { state: "unknown", age_ms: null };
  const age = Math.max(0, now.getTime() - ms);
  if (age >= policy.officially_stale_ms) return { state: "stale", age_ms: age };
  if (age >= policy.possibly_stale_ms) return { state: "possibly-stale", age_ms: age };
  if (age > policy.heartbeat_target_ms) return { state: "delayed", age_ms: age };
  return { state: "fresh", age_ms: age };
}
