import { githubApiRequest } from './source.js';
import { transition, evaluate, occupying, normalizeScope } from './coordination-engine.js';

export const RUNNER_ENGINE_SHA = 'a987e034544c4ea1956e0ee96ab3bd83b4f7ebd1';
export const DEFAULT_RUNNER_CONTROL_REPOSITORY = 'lrnolivia/relay';

export class ControlError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

export function runnerControlRepository(env = {}) {
  const value = String(env?.RELAY_RUNNER_CONTROL_REPOSITORY || DEFAULT_RUNNER_CONTROL_REPOSITORY).trim();
  if (!/^lrnolivia\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new ControlError('policy', 'Invalid Runner control repository binding');
  }
  return value;
}

export function runnerControlBase(env = {}) {
  return `/repos/${runnerControlRepository(env)}`;
}

const decode = content => Buffer.from(String(content || '').replace(/\s/g, ''), 'base64').toString('utf8');

async function read(api, control, path, ref = 'main') {
  const file = await api(`${control}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (file?.type !== 'file' || file.encoding !== 'base64' || !file.sha || file.truncated) {
    throw new ControlError('provider', 'Runner file response is incomplete');
  }
  return { sha: file.sha, content: decode(file.content) };
}

async function jsonFile(api, control, path, ref) {
  const file = await read(api, control, path, ref);
  return { ...file, value: JSON.parse(file.content) };
}

async function pages(api, path) {
  const items = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(result)) throw new ControlError('provider', 'Incomplete paginated inventory');
    items.push(...result);
    if (result.length < 100) return items;
  }
  throw new ControlError('capacity', 'Inventory exceeds bounded pagination; no partial admission');
}

async function registration(api, control, project) {
  const registered = await jsonFile(api, control, `projects/${project}.json`);
  const r = registered.value;
  if (
    r.id !== project ||
    r.managed !== true ||
    !/^lrnolivia\/[A-Za-z0-9_.-]+$/.test(r.repository || '') ||
    !r.default_branch
  ) {
    throw new ControlError('policy', 'Invalid managed project registration');
  }
  if (
    r.coordination?.status !== 'enabled' ||
    r.coordination.record !== `coordination/${project}.json` ||
    !Number.isInteger(r.coordination.max_active_branches) ||
    !(r.coordination.lease_hours > 0) ||
    !Array.isArray(r.implementation?.branch_prefixes) ||
    !Array.isArray(r.implementation?.excluded_branches)
  ) {
    throw new ControlError('policy', 'Project coordination is not enabled');
  }
  const record = await jsonFile(api, control, r.coordination.record);
  if (
    record.value.project !== project ||
    !Array.isArray(record.value.claims) ||
    !Array.isArray(record.value.queue) ||
    !Array.isArray(record.value.legacy_branches)
  ) {
    throw new ControlError('policy', 'Invalid coordination record');
  }
  return {
    registration: r,
    registrationSha: registered.sha,
    record,
    policy: {
      ...r.coordination,
      repository: r.repository,
      branch_prefixes: r.implementation.branch_prefixes,
      excluded_branches: r.implementation.excluded_branches
    }
  };
}

async function engineGuard(api, control) {
  const engine = await read(api, control, 'src/coordination.mjs');
  if (engine.sha !== RUNNER_ENGINE_SHA) {
    throw new ControlError('policy_drift', 'Runner engine changed; sync the exact canonical module before coordination');
  }
}

async function inventory(api, context) {
  const base = `/repos/${context.registration.repository}`;
  const branches = await pages(api, `${base}/branches`);
  const prs = await pages(api, `${base}/pulls?state=open`);
  for (const pr of prs) {
    const files = await pages(api, `${base}/pulls/${pr.number}/files`);
    pr.files = files.flatMap(file => file.previous_filename ? [file.filename, file.previous_filename] : [file.filename]);
  }
  return {
    branches,
    prs,
    findings: evaluate(context.record.value, context.policy, branches, prs)
  };
}

function preflight(context, request, data) {
  const claim = context.record.value.claims.find(
    item => item.id === request.id && item.owner === request.owner && occupying(item)
  );
  if (!claim || claim.state !== 'active' || !(Date.parse(claim.lease_until) > Date.now())) {
    throw new ControlError('ownership', 'A live active owner claim is required; held/expired reservations cannot be taken over');
  }
  request.paths.forEach(normalizeScope);
  if (request.paths.some(path => !claim.paths.some(scope => path === scope || (scope.endsWith('/') && path.startsWith(scope))))) {
    throw new ControlError('scope', 'Changed paths exceed the claim');
  }
  if (data.findings.some(finding => finding.type === 'budget' || finding.assignment === claim.id || finding.assignments?.includes(claim.id))) {
    throw new ControlError('conflict', 'Coordination preflight failed', { findings: data.findings });
  }
  return claim;
}

function result(context, extra) {
  return {
    ok: true,
    namespace: 'relay.RUNNER',
    project: context.registration.id,
    checked_at: new Date().toISOString(),
    record_sha: context.record.sha,
    policy_sha: context.registrationSha,
    engine_sha: RUNNER_ENGINE_SHA,
    ...extra
  };
}

async function mutate(api, control, controlRepository, context, args) {
  if (context.record.sha !== args.expected_record_sha) {
    throw new ControlError('conflict', 'Record changed; refresh ownership before resubmitting', {
      record_sha: context.record.sha
    });
  }

  const allowed = {
    queue: ['id', 'owner', 'paths', 'resources', 'goal', 'acceptance', 'next_action'],
    claim: ['id', 'owner', 'branch', 'paths', 'resources', 'goal', 'acceptance', 'next_action'],
    rescope: ['id', 'owner', 'paths', 'resources', 'next_action'],
    heartbeat: ['id', 'owner', 'next_action'],
    hold: ['id', 'owner', 'next_action'],
    handoff: ['id', 'owner', 'successor', 'next_action'],
    complete: ['id', 'owner', 'pr', 'work_accounted', 'evidence']
  }[args.action];
  for (const key of Object.keys(args.request)) {
    if (!allowed.includes(key)) throw new ControlError('validation', `request.${key} is unsupported for ${args.action}`);
  }

  const required = {
    queue: ['paths', 'goal', 'acceptance', 'next_action'],
    claim: ['branch', 'paths', 'goal', 'acceptance', 'next_action'],
    rescope: ['paths', 'resources', 'next_action'],
    heartbeat: ['next_action'],
    hold: ['next_action'],
    handoff: ['successor', 'next_action'],
    complete: ['pr', 'work_accounted', 'evidence']
  }[args.action];
  for (const key of required) {
    if (!(key in args.request)) throw new ControlError('validation', `request.${key} is required for ${args.action}`);
  }

  const request = { ...args.request, action: args.action };
  const base = `/repos/${context.registration.repository}`;
  if (request.paths) request.paths.forEach(normalizeScope);

  if (args.action === 'claim') {
    if (context.record.value.legacy_branches.includes(request.branch)) {
      throw new ControlError('ownership', 'Legacy branch remains reserved for recovery');
    }
    if ((await pages(api, `${base}/branches`)).some(branch => branch.name === request.branch)) {
      throw new ControlError('ownership', 'Admission must precede branch creation');
    }
    const head = await api(`${base}/git/ref/heads/${encodeURIComponent(context.registration.default_branch)}`);
    request.base_sha = head.object.sha;
  }

  if (args.action === 'complete') {
    const claim = context.record.value.claims.find(item => item.id === request.id);
    if (!claim) throw new ControlError('ownership', 'Assignment is missing');
    const pr = await api(`${base}/pulls/${request.pr}`);
    if (
      !pr.merged ||
      pr.base.ref !== context.registration.default_branch ||
      pr.base.repo.full_name !== context.registration.repository ||
      pr.head.repo?.full_name !== context.registration.repository ||
      pr.head.ref !== claim.branch
    ) {
      throw new ControlError('policy', 'Completion requires the claimed same-repository PR merged into registered main');
    }
    request.merged_head_sha = pr.head.sha;
    request.merge_commit_sha = pr.merge_commit_sha;
  }

  let next;
  try {
    next = transition(context.record.value, request, context.policy);
  } catch (error) {
    throw new ControlError('policy', error.message);
  }

  const policy = await read(api, control, `projects/${args.project}.json`);
  if (policy.sha !== context.registrationSha) {
    throw new ControlError('policy_drift', 'Project policy changed; refresh before writing');
  }
  await engineGuard(api, control);

  const content = `${JSON.stringify(next, null, 2)}\n`;
  let saved;
  let writeError;
  try {
    saved = await api(`${control}/contents/coordination/${args.project}.json`, {
      method: 'PUT',
      body: {
        branch: 'main',
        sha: context.record.sha,
        message: `coordination: ${args.action} ${args.project}`,
        content: Buffer.from(content).toString('base64')
      }
    });
  } catch (error) {
    writeError = error;
  }

  let verified;
  try {
    verified = await jsonFile(api, control, `coordination/${args.project}.json`);
  } catch {
    throw new ControlError('uncertain_write', 'Write outcome cannot be verified. Read the record before retrying.', {
      expected_record_sha: context.record.sha
    });
  }

  if (verified.content !== content) {
    if (writeError?.status === 409 || writeError?.status === 422) {
      throw new ControlError('conflict', 'Concurrent transaction won; refresh before resubmitting', {
        record_sha: verified.sha
      });
    }
    throw new ControlError('uncertain_write', 'Readback differs from the proposed transaction. Reconcile current record before retrying.', {
      record_sha: verified.sha
    });
  }

  const collection = args.action === 'queue' ? 'queue' : 'claims';
  return result({ ...context, record: verified }, {
    action: args.action,
    claim: verified.value[collection].find(item => item.id === request.id),
    receipt: {
      repository: controlRepository,
      path: `coordination/${args.project}.json`,
      previous_record_sha: context.record.sha,
      record_sha: verified.sha,
      commit_sha: saved?.commit?.sha || null,
      reconciled_after_transport_error: Boolean(writeError),
      recovery: 'Read relay_runner_assignments before another mutation; do not replay a stale revision.'
    }
  });
}

export async function callRunnerControlCore(name, args, env = {}, apiOverride) {
  const api = apiOverride || ((path, options) => githubApiRequest(env, path, options));
  const controlRepository = runnerControlRepository(env);
  const control = runnerControlBase(env);
  if (controlRepository === "lrnolivia/relay" && ["loew-inspector", "loew-runner"].includes(args.project)) args = { ...args, project: "relay" };

  if (name === 'relay_runner_projects') {
    const files = await api(`${control}/contents/projects?ref=main`);
    if (!Array.isArray(files) || files.length >= 1000) {
      throw new ControlError('provider', 'Project listing is incomplete');
    }
    const projects = [];
    for (const file of files.filter(item => item.type === 'file' && /^[a-z0-9-]+\.json$/.test(item.name))) {
      const project = await jsonFile(api, control, `projects/${file.name}`);
      if (project.value.alias_of) continue;
      projects.push({
        id: project.value.id,
        name: project.value.name,
        repository: project.value.repository,
        managed: project.value.managed,
        coordination: project.value.coordination?.status || 'unavailable',
        policy_sha: project.sha
      });
    }
    return { ok: true, checked_at: new Date().toISOString(), projects };
  }

  const context = await registration(api, control, args.project);
  if (name === 'relay_runner_project') {
    return result(context, { registration: context.registration, coordination: context.record.value });
  }
  if (name === 'relay_runner_assignments') {
    const claims = context.record.value.claims
      .filter(item => !args.assignment || item.id === args.assignment)
      .map(item => ({
        ...item,
        reserved: occupying(item),
        lease_expired: occupying(item) && !(Date.parse(item.lease_until) > Date.now())
      }));
    const queue = context.record.value.queue.filter(item => !args.assignment || item.id === args.assignment);
    return result(context, { claims, queue });
  }

  await engineGuard(api, control);
  if (name === 'relay_runner_coordinate') {
    return mutate(api, control, controlRepository, context, args);
  }

  const data = await inventory(api, context);
  if (name === 'relay_runner_preflight') {
    const claim = preflight(context, args, data);
    return result(context, {
      admitted: claim.id,
      owner: claim.owner,
      branch: claim.branch,
      findings: data.findings
    });
  }
  if (name === 'relay_runner_audit') {
    return result(context, {
      active: context.record.value.claims.filter(occupying).length,
      budget: context.policy.max_active_branches,
      total_branches: data.branches.length,
      findings: data.findings,
      clean: data.findings.length === 0
    });
  }
  return null;
}
