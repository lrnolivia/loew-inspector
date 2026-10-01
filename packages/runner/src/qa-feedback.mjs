const ROOT = "feedback/qa/";
const EVENT_LIMIT = 100;
const IDENTITY_FIELDS = ["project", "assignment", "owner", "branch"];

function text(value, max = 500) {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
}

function safeSegment(value) {
  const normalized = text(value, 240);
  return normalized && /^[a-zA-Z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function pad(sequence) {
  return String(sequence).padStart(20, "0");
}

async function readJson(bucket, key) {
  const object = await bucket?.get?.(key);
  if (!object) return null;
  try { return await object.json(); }
  catch { return null; }
}

function identityFromEvidence(evidence = {}) {
  const context = evidence.context || {};
  return {
    project: safeSegment(context.project),
    assignment: safeSegment(context.assignment || context.assignment_id),
    owner: safeSegment(context.owner),
    branch: text(context.branch, 240),
    evidence_id: safeSegment(evidence.evidence_id),
    commit_sha: /^[a-f0-9]{40}$/i.test(context.commit_sha || "") ? context.commit_sha : null,
    pr: Number.isInteger(context.pr_number) && context.pr_number > 0 ? context.pr_number : null,
    deployment_id: text(context.deployment_id, 128)
  };
}

function reviewSnapshot(review = {}) {
  return {
    overall: review.overall || null,
    answers: review.answers && typeof review.answers === "object" ? review.answers : {},
    notes: typeof review.notes === "string" ? review.notes : "",
    disposition: review.disposition || null,
    updated_at: review.updated_at || null,
    disposition_updated_at: review.disposition_updated_at || null
  };
}

function stateKey(project) {
  return ROOT + project + "/state.json";
}

function eventPrefix(project) {
  return ROOT + project + "/events/";
}

function eventKey(project, sequence, evidenceId) {
  return eventPrefix(project) + pad(sequence) + "-" + evidenceId + ".json";
}

function ackKey(project, assignment, eventId) {
  return ROOT + project + "/acks/" + assignment + "/" + eventId + ".json";
}

function applicability(event, target) {
  const conflicts = [];
  const identity = event?.identity || {};
  for (const field of IDENTITY_FIELDS) {
    if (field === "project") {
      if (identity.project !== target.project) conflicts.push(field);
      continue;
    }
    if (field === "assignment") {
      if (!identity.assignment) conflicts.push("missing-assignment");
      else if (identity.assignment !== target.assignment) conflicts.push(field);
      continue;
    }
    if (field === "branch") {
      if (!identity.branch) conflicts.push("missing-branch");
      else if (identity.branch !== target.branch) conflicts.push(field);
      continue;
    }
    if (field === "owner" && identity.owner && target.owner && identity.owner !== target.owner) conflicts.push(field);
  }
  return { safe_to_apply: conflicts.length === 0, conflicts };
}

export async function recordQaFeedback(bucket, evidence, review, now = new Date().toISOString()) {
  if (!bucket?.get || !bucket?.put) throw new Error("Visual evidence R2 binding unavailable.");
  const identity = identityFromEvidence(evidence);
  if (!identity.project || !identity.evidence_id) throw new Error("QA feedback requires trusted project and evidence identity.");

  const key = stateKey(identity.project);
  const state = await readJson(bucket, key) || { schema: 1, last_sequence: 0 };
  const next = Math.max(Number(state.last_sequence || 0) + 1, Date.parse(now) || 1);
  const event = {
    schema: 1,
    event_id: "qaf_" + pad(next) + "_" + identity.evidence_id.slice(4, 16),
    sequence: next,
    created_at: now,
    identity,
    review: reviewSnapshot(review)
  };

  await bucket.put(eventKey(identity.project, next, identity.evidence_id), JSON.stringify(event), {
    httpMetadata: { contentType: "application/json" }
  });
  await bucket.put(key, JSON.stringify({ schema: 1, last_sequence: next, updated_at: now }), {
    httpMetadata: { contentType: "application/json" }
  });
  return event;
}

export async function listQaFeedback(bucket, target = {}) {
  if (!bucket?.list || !bucket?.get) return { available: false, events: [], conflicts: [] };
  const project = safeSegment(target.project);
  const assignment = safeSegment(target.assignment);
  const owner = safeSegment(target.owner);
  const branch = text(target.branch, 240);
  if (!project || !assignment || !branch) return { available: true, events: [], conflicts: [] };

  const listed = await bucket.list({ prefix: eventPrefix(project), limit: EVENT_LIMIT });
  const objects = Array.isArray(listed?.objects) ? listed.objects.slice(0, EVENT_LIMIT) : [];
  const events = [];
  const conflicts = [];

  for (const item of objects.sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
    const event = await readJson(bucket, item.key);
    if (!event || event.identity?.assignment !== assignment) continue;
    if (await bucket.get(ackKey(project, assignment, event.event_id))) continue;
    const check = applicability(event, { project, assignment, owner, branch });
    if (check.safe_to_apply) events.push(event);
    else conflicts.push({ event, conflicts: check.conflicts });
  }

  return { available: true, events, conflicts };
}

export async function consumeQaFeedback(bucket, target = {}, now = new Date().toISOString()) {
  const pending = await listQaFeedback(bucket, target);
  if (!pending.available || !bucket?.put) return { ...pending, acknowledged: [] };
  const acknowledged = [];
  for (const event of pending.events) {
    const key = ackKey(event.identity.project, event.identity.assignment, event.event_id);
    await bucket.put(key, JSON.stringify({
      schema: 1,
      event_id: event.event_id,
      sequence: event.sequence,
      consumed_at: now,
      assignment: event.identity.assignment,
      branch: event.identity.branch
    }), { httpMetadata: { contentType: "application/json" } });
    acknowledged.push(event.event_id);
  }
  return { ...pending, acknowledged };
}
