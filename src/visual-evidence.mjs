const EVIDENCE_ID = /^vis_[a-zA-Z0-9-]{8,128}$/;
const RUN_ID = /^run_[a-zA-Z0-9._-]{8,128}$/;
const VISUAL_PREFIX = "visual/";
const RUN_PREFIX = "runs/";

export function isEvidenceId(value) {
  return typeof value === "string" && EVIDENCE_ID.test(value);
}

async function listAllObjects(bucket, prefix = VISUAL_PREFIX, maxObjects = 1000) {
  if (!bucket?.list) throw new Error("Visual evidence R2 binding unavailable.");
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: Math.min(1000, maxObjects - objects.length), cursor });
    objects.push(...(page.objects || []));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && objects.length < maxObjects);
  return objects;
}

export function metadataKeys(objects) {
  return objects
    .filter(object => object?.key?.startsWith(VISUAL_PREFIX) && object.key.endsWith(".json") && !object.key.includes("/sessions/"))
    .map(object => object.key);
}

async function readJsonObject(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  try { return await object.json(); }
  catch { return null; }
}

async function findEvidenceMetadataKey(bucket, evidenceId) {
  if (!isEvidenceId(evidenceId)) return null;
  const objects = await listAllObjects(bucket);
  const suffix = "/" + evidenceId + ".json";
  return metadataKeys(objects).find(key => key.endsWith(suffix)) || null;
}

export function normalizeVisualFilters(input = {}) {
  const clean = (value, max = 128) => {
    if (value == null || value === "") return null;
    const text = String(value);
    if (
      text.length > max ||
      !/^[a-zA-Z0-9._:/-]+$/.test(text) ||
      text.includes("..") ||
      text.startsWith("/") ||
      text.startsWith(":")
    ) throw new Error("Invalid visual filter");
    return text;
  };
  const project = clean(input.project, 80);
  const environment = clean(input.environment, 32);
  const run = clean(input.run, 128);
  const pr = input.pr == null || input.pr === "" ? null : Number(input.pr);
  if (environment && !["production","preview","qa","smoke","unknown"].includes(environment)) throw new Error("Invalid visual environment");
  if (run && !RUN_ID.test(run)) throw new Error("Invalid visual run");
  if (pr != null && (!Number.isInteger(pr) || pr < 1 || pr > 1000000)) throw new Error("Invalid visual PR");
  return { project, environment, pr, run };
}

export async function listVisualEvidence(bucket, limit = 60, filters = {}) {
  const selected = normalizeVisualFilters(filters);
  const objects = await listAllObjects(bucket);
  const keys = metadataKeys(objects);
  const records = (await Promise.all(keys.map(key => readJsonObject(bucket, key))))
    .filter(record => record && isEvidenceId(record.evidence_id))
    .filter(record => !selected.project || record.context?.project === selected.project)
    .filter(record => !selected.environment || record.context?.environment === selected.environment)
    .filter(record => !selected.pr || Number(record.context?.pr_number) === selected.pr)
    .filter(record => !selected.run || record.run_id === selected.run)
    .sort((a, b) => String(b.captured_at || "").localeCompare(String(a.captured_at || "")))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 60)))
    .map(record => ({
      ...record,
      screenshot_url: "/api/visual/" + encodeURIComponent(record.evidence_id) + "/image"
    }));
  return { ok: true, count: records.length, filters: selected, evidence: records };
}

export async function getVisualEvidence(bucket, evidenceId) {
  const key = await findEvidenceMetadataKey(bucket, evidenceId);
  if (!key) return null;
  const record = await readJsonObject(bucket, key);
  if (!record) return null;
  return { ...record, screenshot_url: "/api/visual/" + encodeURIComponent(evidenceId) + "/image" };
}

export async function getVisualImage(bucket, evidenceId) {
  const meta = await getVisualEvidence(bucket, evidenceId);
  if (!meta?.screenshot_key) return null;
  const object = await bucket.get(meta.screenshot_key);
  if (!object) return null;
  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType || "image/png",
    size: object.size
  };
}


function accessibilitySignature(value) {
  if (!value || typeof value !== "object") return null;
  return {
    available: Boolean(value.available),
    node_count: Number.isFinite(Number(value.node_count)) ? Number(value.node_count) : null,
    line_count: Number.isFinite(Number(value.line_count)) ? Number(value.line_count) : null,
    bytes: Number.isFinite(Number(value.bytes)) ? Number(value.bytes) : null
  };
}

const DOM_BYTE_RATIO_TOLERANCE = 0.005;
const A11Y_BYTE_RATIO_TOLERANCE = 0.01;

function relativeDeltaExceeded(baseValue, currentValue, ratioTolerance) {
  const baseNumber = Number(baseValue);
  const currentNumber = Number(currentValue);
  if (!Number.isFinite(baseNumber) || !Number.isFinite(currentNumber)) return baseNumber !== currentNumber;
  const scale = Math.max(Math.abs(baseNumber), Math.abs(currentNumber), 1);
  return Math.abs(baseNumber - currentNumber) / scale > ratioTolerance;
}

export function compareEvidenceRecords(base, current) {
  if (!base || !current) throw new Error("Both evidence records are required");
  const sameViewport = Number(base.viewport?.width) === Number(current.viewport?.width) &&
    Number(base.viewport?.height) === Number(current.viewport?.height);
  const domComparable = Boolean(base.dom && current.dom);
  const baseA11y = accessibilitySignature(base.accessibility);
  const currentA11y = accessibilitySignature(current.accessibility);
  const a11yComparable = Boolean(baseA11y && currentA11y);
  const domElementChanged = domComparable &&
    Number(base.dom.element_tag_count) !== Number(current.dom.element_tag_count);
  const domBytesChanged = domComparable &&
    relativeDeltaExceeded(base.dom.html_bytes, current.dom.html_bytes, DOM_BYTE_RATIO_TOLERANCE);
  const domChanged = domComparable && (domElementChanged || domBytesChanged);
  const a11yChanged = a11yComparable && (
    baseA11y.available !== currentA11y.available ||
    (baseA11y.node_count != null && currentA11y.node_count != null
      ? baseA11y.node_count !== currentA11y.node_count
      : baseA11y.line_count !== currentA11y.line_count ||
        relativeDeltaExceeded(baseA11y.bytes, currentA11y.bytes, A11Y_BYTE_RATIO_TOLERANCE))
  );
  const contextMatch = (base.context?.project ?? null) === (current.context?.project ?? null) &&
    (base.context?.surface ?? null) === (current.context?.surface ?? null);
  return {
    result: (!sameViewport || domChanged || a11yChanged) ? "changed" : "pass",
    same_viewport: sameViewport,
    context_match: contextMatch,
    dom: {
      comparable: domComparable,
      changed: domChanged,
      html_bytes_delta: domComparable ? Number(current.dom.html_bytes || 0) - Number(base.dom.html_bytes || 0) : null,
      html_bytes_ratio_tolerance: DOM_BYTE_RATIO_TOLERANCE,
      base: base.dom ?? null,
      current: current.dom ?? null
    },
    accessibility: {
      comparable: a11yComparable,
      changed: a11yChanged,
      bytes_delta: a11yComparable && baseA11y.bytes != null && currentA11y.bytes != null
        ? Number(currentA11y.bytes) - Number(baseA11y.bytes)
        : null,
      bytes_ratio_tolerance: A11Y_BYTE_RATIO_TOLERANCE,
      base: base.accessibility ?? null,
      current: current.accessibility ?? null
    }
  };
}

export async function compareVisualEvidence(bucket, baseId, currentId) {
  const [base, current] = await Promise.all([
    getVisualEvidence(bucket, baseId),
    getVisualEvidence(bucket, currentId)
  ]);
  if (!base || !current) return null;
  return { ok: true, base, current, comparison: compareEvidenceRecords(base, current) };
}


export function isRunId(value) {
  return typeof value === "string" && RUN_ID.test(value);
}

async function listRunObjects(bucket, maxObjects = 200) {
  if (!bucket?.list) throw new Error("Visual evidence R2 binding unavailable.");
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: RUN_PREFIX, limit: Math.min(1000, maxObjects - objects.length), cursor });
    objects.push(...(page.objects || []));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && objects.length < maxObjects);
  return objects.filter(object => object?.key?.startsWith(RUN_PREFIX) && object.key.endsWith(".json"));
}

export async function listVisualRuns(bucket, limit = 20, filters = {}) {
  const selected = normalizeVisualFilters(filters);
  const objects = await listRunObjects(bucket);
  const runs = (await Promise.all(objects.map(object => readJsonObject(bucket, object.key))))
    .filter(run => run && isRunId(run.run_id))
    .filter(run => !selected.project || run.project === selected.project)
    .filter(run => !selected.environment || run.environment === selected.environment)
    .filter(run => !selected.pr || Number(run.pr_number) === selected.pr)
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
  return { ok: true, count: runs.length, filters: selected, runs };
}


export const BASELINE_POLICY = "previous_same_step_same_project_environment";

export function evidenceAssertionState(record) {
  const assertions = Array.isArray(record?.assertions) ? record.assertions : [];
  if (assertions.some(item => item?.status === "fail")) return "failed";
  const trace = Array.isArray(record?.trace) ? record.trace : [];
  if (trace.some(item => item?.status === "failed")) return "failed";
  if (assertions.some(item => item?.status === "pass")) return "pass";
  return "unknown";
}

function baselineCompatible(candidate, current) {
  if (!candidate || !current || candidate.evidence_id === current.evidence_id) return false;
  if (!candidate.run_id || candidate.run_id === current.run_id) return false;
  if (candidate.context?.project !== current.context?.project) return false;
  if (candidate.context?.environment !== current.context?.environment) return false;
  if ((candidate.suite ?? null) !== (current.suite ?? null)) return false;
  if ((candidate.step_id ?? null) !== (current.step_id ?? null)) return false;
  if (evidenceAssertionState(candidate) === "failed") return false;
  const candidateTime = Date.parse(candidate.captured_at || "");
  const currentTime = Date.parse(current.captured_at || "");
  return Number.isFinite(candidateTime) && Number.isFinite(currentTime) && candidateTime < currentTime;
}

export function selectBaselineEvidence(records, current) {
  return records
    .filter(candidate => baselineCompatible(candidate, current))
    .sort((a, b) => String(b.captured_at || "").localeCompare(String(a.captured_at || "")))[0] || null;
}

export function reviewRunRecords(run, allRecords) {
  if (!run || !isRunId(run.run_id)) throw new Error("Invalid visual run");
  const current = allRecords
    .filter(record => record?.run_id === run.run_id && isEvidenceId(record.evidence_id))
    .sort((a, b) => Number(a.step_index || 0) - Number(b.step_index || 0) || String(a.captured_at || "").localeCompare(String(b.captured_at || "")));

  const steps = current.map(record => {
    const assertionState = evidenceAssertionState(record);
    const baseline = selectBaselineEvidence(allRecords, record);
    const comparison = baseline ? compareEvidenceRecords(baseline, record) : null;
    const result = assertionState === "failed" ? "failed" : comparison?.result === "changed" ? "changed" : "pass";
    return {
      step_id: record.step_id || null,
      step_label: record.step_label || record.step_id || "capture",
      step_index: Number(record.step_index || 0),
      current_evidence_id: record.evidence_id,
      baseline_evidence_id: baseline?.evidence_id || null,
      baseline_available: Boolean(baseline),
      assertion_state: assertionState,
      assertions: Array.isArray(record.assertions) ? record.assertions : [],
      comparison,
      result
    };
  });

  const counts = {
    pass: steps.filter(step => step.result === "pass").length,
    changed: steps.filter(step => step.result === "changed").length,
    failed: steps.filter(step => step.result === "failed").length,
    baseline_missing: steps.filter(step => !step.baseline_available).length
  };
  const firstDivergence = steps.find(step => step.result === "failed" || step.result === "changed") || null;
  const result = counts.failed ? "failed" : counts.changed ? "changed" : "pass";

  return {
    run_id: run.run_id,
    result,
    baseline_policy: BASELINE_POLICY,
    counts,
    first_divergence: firstDivergence ? {
      step_id: firstDivergence.step_id,
      step_label: firstDivergence.step_label,
      step_index: firstDivergence.step_index,
      result: firstDivergence.result,
      current_evidence_id: firstDivergence.current_evidence_id,
      baseline_evidence_id: firstDivergence.baseline_evidence_id
    } : null,
    steps
  };
}

export async function reviewVisualRun(bucket, runId) {
  if (!isRunId(runId)) return null;
  const runObject = await bucket.get(RUN_PREFIX + runId + ".json");
  if (!runObject) return null;
  let run;
  try { run = await runObject.json(); } catch { return null; }
  const objects = await listAllObjects(bucket);
  const keys = metadataKeys(objects);
  const records = (await Promise.all(keys.map(key => readJsonObject(bucket, key))))
    .filter(record => record && isEvidenceId(record.evidence_id))
    .map(record => ({ ...record, screenshot_url: "/api/visual/" + encodeURIComponent(record.evidence_id) + "/image" }));
  return { ok: true, run, review: reviewRunRecords(run, records) };
}
