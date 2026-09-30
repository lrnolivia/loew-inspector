import { githubApiRequest } from './source.js';
import { transition, evaluate, occupying, normalizeScope } from './coordination-engine.js';

// Exact generated Runner source. Drift closes admission until the snapshot is synced.
export const RUNNER_ENGINE_SHA = 'e2624d48d2c03c2c3ed20bfc38646dcfc5c690c2';
const CONTROL = '/repos/lrnolivia/loew-runner';
const MUTATIONS = ['queue', 'claim', 'rescope', 'heartbeat', 'hold', 'handoff', 'complete'];
const text = (max = 500) => ({ type: 'string', minLength: 1, maxLength: max });
const identity = { ...text(100), pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$' };
const projectSchema = { ...text(80), pattern: '^[a-z0-9-]+$' };
const shaSchema = { type: 'string', pattern: '^[a-f0-9]{40}$' };
const pathsSchema = { type: 'array', minItems: 1, maxItems: 200, items: text(500), uniqueItems: true };
const resourcesSchema = { type: 'array', maxItems: 100, items: text(200), uniqueItems: true };
const requestProperties = {
  id: identity, owner: identity, branch: text(200), paths: pathsSchema, resources: resourcesSchema,
  goal: text(2000), acceptance: text(4000), next_action: text(2000), successor: identity,
  pr: { type: 'integer', minimum: 1, maximum: 1000000 }, work_accounted: { type: 'boolean' }, evidence: text(4000)
};
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const DEFINITIONS = [
  { name: 'relay_runner_projects', description: 'List current Runner project registrations. No model inference or fabricated runtime state.', inputSchema: schema({}) },
  { name: 'relay_runner_project', description: 'Resolve one registered project with its current policy, ownership, queue and record revision.', inputSchema: schema({ project: projectSchema }, ['project']) },
  { name: 'relay_runner_assignments', description: 'Read claims and queued assignments, including held and expired owner reservations.', inputSchema: schema({ project: projectSchema, assignment: identity }, ['project']) },
  { name: 'relay_runner_preflight', description: 'Check live ownership, declared paths, branch/PR inventory and canonical policy before work. A pass is admission evidence only.', inputSchema: schema({ project: projectSchema, id: identity, owner: identity, paths: pathsSchema }, ['project', 'id', 'owner', 'paths']) },
  { name: 'relay_runner_audit', description: 'Audit branch budget, ownership overlap, expiry, registration and PR scope against Runner policy.', inputSchema: schema({ project: projectSchema }, ['project']) },
  { name: 'relay_runner_coordinate', description: 'Perform one SHA-checked Runner queue/claim/rescope/heartbeat/hold/handoff/completion transaction. Completion requires a verified merged PR. No blind release or takeover.', inputSchema: schema({ project: projectSchema, action: { type: 'string', enum: MUTATIONS }, expected_record_sha: shaSchema, request: schema(requestProperties, ['id', 'owner']) }, ['project', 'action', 'expected_record_sha', 'request']), mutation: true }
];
export const runnerControlTools = DEFINITIONS.map(({ mutation, ...definition }) => ({ ...definition, annotations: { readOnlyHint: !mutation, destructiveHint: Boolean(mutation), idempotentHint: !mutation, openWorldHint: true } }));

export class ControlError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}
// Host schemas are guidance. Every app/chat call is validated again on the server.
export function validateControlArguments(value, spec, path = 'arguments') {
  if (spec.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ControlError('validation', `${path} must be an object`);
    for (const key of spec.required || []) if (!(key in value)) throw new ControlError('validation', `${path}.${key} is required`);
    for (const [key, item] of Object.entries(value)) {
      if (!spec.properties[key]) throw new ControlError('validation', `${path}.${key} is unsupported`);
      validateControlArguments(item, spec.properties[key], `${path}.${key}`);
    }
  } else if (spec.type === 'array') {
    if (!Array.isArray(value) || value.length < (spec.minItems || 0) || value.length > spec.maxItems || (spec.uniqueItems && new Set(value).size !== value.length)) throw new ControlError('validation', `${path} has invalid items`);
    value.forEach(item => validateControlArguments(item, spec.items, path));
  } else if (spec.type === 'string') {
    if (typeof value !== 'string' || value.length < (spec.minLength || 0) || value.length > (spec.maxLength || Infinity) || (spec.pattern && !new RegExp(spec.pattern).test(value))) throw new ControlError('validation', `${path} is invalid`);
  } else if (spec.type === 'integer') {
    if (!Number.isInteger(value) || value < spec.minimum || value > spec.maximum) throw new ControlError('validation', `${path} is invalid`);
  } else if (spec.type === 'boolean' && typeof value !== 'boolean') throw new ControlError('validation', `${path} must be boolean`);
  if (spec.enum && !spec.enum.includes(value)) throw new ControlError('validation', `${path} is unsupported`);
}
function decode(content) { return Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8'); }
async function read(api, path, ref = 'main') {
  const file = await api(`${CONTROL}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (file?.type !== 'file' || file.encoding !== 'base64' || !file.sha || file.truncated) throw new ControlError('provider', 'Runner file response is incomplete');
  return { sha: file.sha, content: decode(file.content) };
}
async function jsonFile(api, path, ref) {
  const file = await read(api, path, ref);
  return { ...file, value: JSON.parse(file.content) };
}
async function registration(api, project) {
  const registered = await jsonFile(api, `projects/${project}.json`);
  const r = registered.value;
  if (r.id !== project || r.managed !== true || !/^lrnolivia\/[a-zA-Z0-9_.-]+$/.test(r.repository) || !r.default_branch) throw new ControlError('policy', 'Invalid managed project registration');
  if (r.coordination?.status !== 'enabled' || r.coordination.record !== `coordination/${project}.json` || !Number.isInteger(r.coordination.max_active_branches) || !(r.coordination.lease_hours > 0) || !Array.isArray(r.implementation?.branch_prefixes) || !Array.isArray(r.implementation?.excluded_branches)) throw new ControlError('policy', 'Project coordination is not enabled');
  const record = await jsonFile(api, r.coordination.record);
  if (record.value.project !== project || !Array.isArray(record.value.claims) || !Array.isArray(record.value.queue) || !Array.isArray(record.value.legacy_branches)) throw new ControlError('policy', 'Invalid coordination record');
  return { registration: r, registrationSha: registered.sha, record, policy: { ...r.coordination, repository: r.repository, branch_prefixes: r.implementation.branch_prefixes, excluded_branches: r.implementation.excluded_branches } };
}
async function engineGuard(api) {
  const engine = await read(api, 'src/coordination.mjs');
  if (engine.sha !== RUNNER_ENGINE_SHA) throw new ControlError('policy_drift', 'Runner engine changed; sync the exact canonical module before coordination');
}
async function pages(api, path) {
  const items = [];
  for (let page = 1; page <= 100; page++) {
    const result = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(result)) throw new ControlError('provider', 'Incomplete paginated inventory');
    items.push(...result);
    if (result.length < 100) return items;
  }
  throw new ControlError('capacity', 'Inventory exceeds bounded pagination; no partial admission');
}
async function inventory(api, context) {
  const base = `/repos/${context.registration.repository}`;
  const branches = await pages(api, `${base}/branches`);
  const prs = await pages(api, `${base}/pulls?state=open`);
  for (const pr of prs) {
    const files = await pages(api, `${base}/pulls/${pr.number}/files`);
    pr.files = files.flatMap(f => f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]);
  }
  return { branches, prs, findings: evaluate(context.record.value, context.policy, branches, prs) };
}
function preflight(context, request, data) {
  const claim = context.record.value.claims.find(c => c.id === request.id && c.owner === request.owner && occupying(c));
  if (!claim || claim.state !== 'active' || !(Date.parse(claim.lease_until) > Date.now())) throw new ControlError('ownership', 'A live active owner claim is required; held/expired reservations cannot be taken over');
  request.paths.forEach(normalizeScope);
  if (request.paths.some(p => !claim.paths.some(s => p === s || (s.endsWith('/') && p.startsWith(s))))) throw new ControlError('scope', 'Changed paths exceed the claim');
  if (data.findings.some(f => f.type === 'budget' || f.assignment === claim.id || f.assignments?.includes(claim.id))) throw new ControlError('conflict', 'Coordination preflight failed', { findings: data.findings });
  return claim;
}
function result(context, extra) { return { ok: true, namespace: 'relay.RUNNER', project: context.registration.id, checked_at: new Date().toISOString(), record_sha: context.record.sha, policy_sha: context.registrationSha, engine_sha: RUNNER_ENGINE_SHA, ...extra }; }
async function mutate(api, context, args) {
  if (context.record.sha !== args.expected_record_sha) throw new ControlError('conflict', 'Record changed; refresh ownership before resubmitting', { record_sha: context.record.sha });
  const allowed = {
    queue: ['id', 'owner', 'paths', 'resources', 'goal', 'acceptance', 'next_action'],
    claim: ['id', 'owner', 'branch', 'paths', 'resources', 'goal', 'acceptance', 'next_action'],
    rescope: ['id', 'owner', 'paths', 'resources', 'next_action'],
    heartbeat: ['id', 'owner', 'next_action'], hold: ['id', 'owner', 'next_action'],
    handoff: ['id', 'owner', 'successor', 'next_action'],
    complete: ['id', 'owner', 'pr', 'work_accounted', 'evidence']
  }[args.action];
  for (const key of Object.keys(args.request)) if (!allowed.includes(key)) throw new ControlError('validation', `request.${key} is unsupported for ${args.action}`);
  const required = {
    queue: ['paths', 'goal', 'acceptance', 'next_action'],
    claim: ['branch', 'paths', 'goal', 'acceptance', 'next_action'],
    rescope: ['paths', 'resources', 'next_action'], heartbeat: ['next_action'], hold: ['next_action'],
    handoff: ['successor', 'next_action'], complete: ['pr', 'work_accounted', 'evidence']
  }[args.action];
  for (const key of required) if (!(key in args.request)) throw new ControlError('validation', `request.${key} is required for ${args.action}`);
  const request = { ...args.request, action: args.action };
  const base = `/repos/${context.registration.repository}`;
  if (request.paths) request.paths.forEach(normalizeScope);
  if (args.action === 'claim') {
    if (context.record.value.legacy_branches.includes(request.branch)) throw new ControlError('ownership', 'Legacy branch remains reserved for recovery');
    if ((await pages(api, `${base}/branches`)).some(b => b.name === request.branch)) throw new ControlError('ownership', 'Admission must precede branch creation');
    const head = await api(`${base}/git/ref/heads/${encodeURIComponent(context.registration.default_branch)}`);
    request.base_sha = head.object.sha;
  }
  if (args.action === 'complete') {
    const claim = context.record.value.claims.find(c => c.id === request.id);
    if (!claim) throw new ControlError('ownership', 'Assignment is missing');
    const pr = await api(`${base}/pulls/${request.pr}`);
    if (!pr.merged || pr.base.ref !== context.registration.default_branch || pr.base.repo.full_name !== context.registration.repository || pr.head.repo?.full_name !== context.registration.repository || pr.head.ref !== claim.branch) throw new ControlError('policy', 'Completion requires the claimed same-repository PR merged into registered main');
    request.merged_head_sha = pr.head.sha;
    request.merge_commit_sha = pr.merge_commit_sha;
  }
  let next;
  try { next = transition(context.record.value, request, context.policy); }
  catch (error) { throw new ControlError('policy', error.message); }
  // Re-read policy/engine immediately before a write to close source drift windows.
  const policy = await read(api, `projects/${args.project}.json`);
  if (policy.sha !== context.registrationSha) throw new ControlError('policy_drift', 'Project policy changed; refresh before writing');
  await engineGuard(api);
  const content = `${JSON.stringify(next, null, 2)}\n`;
  let saved, writeError;
  try {
    saved = await api(`${CONTROL}/contents/coordination/${args.project}.json`, { method: 'PUT', body: { branch: 'main', sha: context.record.sha, message: `coordination: ${args.action} ${args.project}`, content: Buffer.from(content).toString('base64') } });
  } catch (error) { writeError = error; }
  // Readback is mandatory, including when a provider timed out after accepting a write.
  let verified;
  try { verified = await jsonFile(api, `coordination/${args.project}.json`); }
  catch { throw new ControlError('uncertain_write', 'Write outcome cannot be verified. Read the record before retrying.', { expected_record_sha: context.record.sha }); }
  if (verified.content !== content) {
    if (writeError?.status === 409 || writeError?.status === 422) throw new ControlError('conflict', 'Concurrent transaction won; refresh before resubmitting', { record_sha: verified.sha });
    throw new ControlError('uncertain_write', 'Readback differs from the proposed transaction. Reconcile current record before retrying.', { record_sha: verified.sha });
  }
  const collection = args.action === 'queue' ? 'queue' : 'claims';
  return result({ ...context, record: verified }, { action: args.action, claim: verified.value[collection].find(c => c.id === request.id), receipt: { repository: 'lrnolivia/loew-runner', path: `coordination/${args.project}.json`, previous_record_sha: context.record.sha, record_sha: verified.sha, commit_sha: saved?.commit?.sha || null, reconciled_after_transport_error: Boolean(writeError), recovery: 'Read relay_runner_assignments before another mutation; do not replay a stale revision.' } });
}
export async function callRunnerControl(name, args, env, apiOverride) {
  const definition = DEFINITIONS.find(d => d.name === name);
  if (!definition) return null;
  validateControlArguments(args, definition.inputSchema);
  const api = apiOverride || ((path, options) => githubApiRequest(env, path, options));
  if (name === 'relay_runner_projects') {
    const files = await api(`${CONTROL}/contents/projects?ref=main`);
    if (!Array.isArray(files) || files.length >= 1000) throw new ControlError('provider', 'Project listing is incomplete');
    const projects = [];
    for (const file of files.filter(f => f.type === 'file' && /^[a-z0-9-]+\.json$/.test(f.name))) {
      const p = await jsonFile(api, `projects/${file.name}`);
      projects.push({ id: p.value.id, name: p.value.name, repository: p.value.repository, managed: p.value.managed, coordination: p.value.coordination?.status || 'unavailable', policy_sha: p.sha });
    }
    return { ok: true, checked_at: new Date().toISOString(), projects };
  }
  const context = await registration(api, args.project);
  if (name === 'relay_runner_project') return result(context, { registration: context.registration, coordination: context.record.value });
  if (name === 'relay_runner_assignments') {
    const claims = context.record.value.claims.filter(c => !args.assignment || c.id === args.assignment).map(c => ({ ...c, reserved: occupying(c), lease_expired: occupying(c) && !(Date.parse(c.lease_until) > Date.now()) }));
    const queue = context.record.value.queue.filter(q => !args.assignment || q.id === args.assignment);
    return result(context, { claims, queue });
  }
  await engineGuard(api);
  if (name === 'relay_runner_coordinate') return mutate(api, context, args);
  const data = await inventory(api, context);
  if (name === 'relay_runner_preflight') {
    const claim = preflight(context, args, data);
    return result(context, { admitted: claim.id, owner: claim.owner, branch: claim.branch, findings: data.findings });
  }
  return result(context, { active: context.record.value.claims.filter(occupying).length, budget: context.policy.max_active_branches, total_branches: data.branches.length, findings: data.findings, clean: data.findings.length === 0 });
}
export function runnerControlError(error) {
  const status = error?.status;
  const code = error?.code || (status === 401 ? 'auth' : status === 403 ? 'permission' : status === 429 ? 'capacity' : status >= 500 ? 'provider' : error?.name === 'TimeoutError' ? 'timeout' : 'provider');
  // Provider bodies may contain reflected data; only our bounded messages are returned.
  return { ok: false, namespace: 'relay.RUNNER', error: { class: code, message: error instanceof ControlError ? error.message : 'Runner provider request failed', ...(error?.record_sha ? { record_sha: error.record_sha } : {}), retryable: false, recovery: code === 'uncertain_write' ? 'Inspect the current record and claim; never replay blindly.' : 'Refresh project policy, record revision and ownership before retrying.' }, checked_at: new Date().toISOString() };
}
