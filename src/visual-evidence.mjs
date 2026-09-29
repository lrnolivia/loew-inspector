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


export function compareEvidenceRecords(base, current) {
  if (!base || !current) throw new Error("Both evidence records are required");
  const sameViewport = Number(base.viewport?.width) === Number(current.viewport?.width) &&
    Number(base.viewport?.height) === Number(current.viewport?.height);
  const domComparable = Boolean(base.dom && current.dom);
  const a11yComparable = Boolean(base.accessibility && current.accessibility);
  const domChanged = domComparable && (
    Number(base.dom.html_bytes) !== Number(current.dom.html_bytes) ||
    Number(base.dom.element_tag_count) !== Number(current.dom.element_tag_count)
  );
  const a11yChanged = a11yComparable && (
    Number(base.accessibility.node_count) !== Number(current.accessibility.node_count) ||
    Boolean(base.accessibility.available) !== Boolean(current.accessibility.available)
  );
  const contextMatch = (base.context?.project ?? null) === (current.context?.project ?? null) &&
    (base.context?.surface ?? null) === (current.context?.surface ?? null);
  return {
    result: (!sameViewport || domChanged || a11yChanged) ? "changed" : "pass",
    same_viewport: sameViewport,
    context_match: contextMatch,
    dom: { comparable: domComparable, changed: domChanged, base: base.dom ?? null, current: current.dom ?? null },
    accessibility: { comparable: a11yComparable, changed: a11yChanged, base: base.accessibility ?? null, current: current.accessibility ?? null }
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
