export const PROGRESS_CONTRACT_VERSION = "1.7.5";

export function queuedProgress(item) {
  return {
    assignment: item.id,
    state: "queued",
    stage: "queued",
    observed: false,
    last_meaningful_progress_at: null,
    latest_event: null,
    identities: {},
    next_action: item.next_action || null
  };
}

export function progressResponse(project, progress = [], queue = []) {
  return {
    contract_version: PROGRESS_CONTRACT_VERSION,
    observed_progress: true,
    project,
    generated_at: new Date().toISOString(),
    progress,
    queue
  };
}
