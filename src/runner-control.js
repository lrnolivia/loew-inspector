import {
  callRunnerControlCore,
  ControlError,
  DEFAULT_RUNNER_CONTROL_REPOSITORY,
  RUNNER_ENGINE_SHA,
  runnerControlBase,
  runnerControlRepository
} from './runner-control-core.js';
import { callProgress } from './progress-api.js';
import { callResume } from './resume-checkpoints.js';
import { callAssignmentUpdates } from './amendment-sync.js';
import { projectCloudStatus, deployProjectCloudVersion } from './project-cloud.js';

const MUTATIONS = ['queue', 'claim', 'amend', 'rescope', 'heartbeat', 'hold', 'handoff', 'complete'];
const text = (max = 500) => ({ type: 'string', minLength: 1, maxLength: max });
const identity = { ...text(100), pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$' };
const projectSchema = { ...text(80), pattern: '^[a-z0-9-]+$' };
const shaSchema = { type: 'string', pattern: '^[a-f0-9]{40}$' };
const checkpointSchema = { type: 'string', pattern: '^[a-f0-9]{24}$' };
const pathsSchema = { type: 'array', minItems: 1, maxItems: 200, items: text(500), uniqueItems: true };
const resourcesSchema = { type: 'array', maxItems: 100, items: text(200), uniqueItems: true };
const ledgerRefsSchema = { type: 'array', maxItems: 50, items: identity, uniqueItems: true };
const taskClassSchema = { type: 'string', enum: ['design', 'architecture', 'maintenance'] };
const categorySchema = { type: 'string', enum: ['architecture', 'design', 'implementation', 'research', 'qa-verification', 'maintenance', 'release', 'coordination'] };
const labelSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9.-]{0,63}$' },
    value: text(120)
  },
  required: ['key', 'value'],
  additionalProperties: false
};
const labelsSchema = { type: 'array', maxItems: 32, items: labelSchema };
const tagsSchema = { type: 'array', maxItems: 32, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z0-9][a-z0-9._-]{0,63}$' } };
const roleSchema = { type: 'string', minLength: 0, maxLength: 64, pattern: '^(?:|[a-z][a-z0-9-]{0,63})$' };
const supportingRolesSchema = { type: 'array', maxItems: 8, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9-]{0,63}$' } };
const requestProperties = {
  id: identity,
  owner: identity,
  branch: text(200),
  paths: pathsSchema,
  resources: resourcesSchema,
  goal: text(2000),
  acceptance: text(4000),
  next_action: text(2000),
  reason: text(1000),
  task_class: taskClassSchema,
  ledger_refs: ledgerRefsSchema,
  category: categorySchema,
  labels: labelsSchema,
  tags: tagsSchema,
  primary_role: roleSchema,
  supporting_roles: supportingRolesSchema,
  primary_team: { type: ["string", "null"], enum: ["inspector","runner","night-shift","source","cloud","release","skills",null] },
  supporting_teams: { type: "array", maxItems: 6, uniqueItems: true, items: {type:"string",enum:["inspector","runner","night-shift","source","cloud","release","skills"]} },
  primary_staff: { type: ["string", "null"], maxLength: 80 },
  supporting_staff: { type: "array", maxItems: 8, uniqueItems: true, items: text(80) },
  successor: identity,
  pr: { type: 'integer', minimum: 1, maximum: 1000000 },
  work_accounted: { type: 'boolean' },
  evidence: text(4000)
};
const schema = (properties, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
});

const DEFINITIONS = [
  {
    name: 'relay_runner_projects',
    description: 'List current Runner project registrations. No model inference or fabricated runtime state.',
    inputSchema: schema({})
  },
  {
    name: 'relay_runner_project',
    description: 'Resolve one registered project with its current policy, ownership, queue and record revision.',
    inputSchema: schema({ project: projectSchema }, ['project'])
  },
  {
    name: 'relay_runner_assignments',
    description: 'Read claims and queued assignments, including held and expired owner reservations.',
    inputSchema: schema({ project: projectSchema, assignment: identity }, ['project'])
  },
  {
    name: 'relay_runner_progress',
    description: 'Read evidence-derived execution progress for current claims and queued work. Progress is derived from Runner, GitHub and configured Cloud evidence; claim state and next_action prose are context, not proof of execution.',
    inputSchema: schema({ project: projectSchema, assignment: identity }, ['project'])
  },
  {
    name: 'relay_runner_resume',
    description: 'Read compact deterministic resume checkpoints derived passively from canonical Runner, GitHub and Cloud evidence. Unchanged evidence reuses the same checkpoint id, so interrupted chats can resume without model-authored handoffs.',
    inputSchema: schema({ project: projectSchema, assignment: identity }, ['project'])
  },
  {
    name: 'relay_runner_updates',
    description: 'Read only assignment amendments newer than a monotonic cursor plus a bounded caught-up recovery signal derived from canonical resume evidence. No-change reads inject no amendment context; history gaps or scope changes require canonical reconciliation.',
    inputSchema: schema({
      project: projectSchema,
      assignment: identity,
      cursor: { type: 'integer', minimum: 0, maximum: 1000000 },
      checkpoint_id: checkpointSchema,
      recovery_attempts: { type: 'integer', minimum: 0, maximum: 2 }
    }, ['project', 'assignment', 'cursor'])
  },
  {
    name: 'relay_cloud_project',
    description: 'Resolve canonical project-to-Cloudflare Worker authority. A project is writable only when its registration allows writes and the Worker remains in Relay\'s runtime allowlist.',
    inputSchema: schema({ project: projectSchema }, ['project'])
  },
  {
    name: 'relay_cloud_deploy_project_version',
    description: 'Deploy an existing Cloudflare Worker version by canonical Relay project identity. Project registration and the runtime Worker allowlist must both authorize the mutation.',
    inputSchema: schema({ project: projectSchema, version_id: text(128), message: text(1000) }, ['project', 'version_id']),
    mutation: true
  },
  {
    name: 'relay_runner_preflight',
    description: 'Check live ownership, declared paths, branch/PR inventory and canonical policy before work. A pass is admission evidence only.',
    inputSchema: schema({ project: projectSchema, id: identity, owner: identity, paths: pathsSchema }, ['project', 'id', 'owner', 'paths'])
  },
  {
    name: 'relay_runner_audit',
    description: 'Audit branch budget, ownership overlap, expiry, registration and PR scope against Runner policy.',
    inputSchema: schema({ project: projectSchema }, ['project'])
  },
  {
    name: 'relay_runner_coordinate',
    description: 'Perform one SHA-checked Runner queue/claim/amend/rescope/heartbeat/hold/handoff/completion transaction. Amend updates queued or claimed intent with bounded audit history while preserving claimed branch/base identity. On claim, Relay resolves and pins base_sha from the live registered default branch; callers must omit base_sha. Completion requires a verified merged PR. No blind release or takeover.',
    inputSchema: schema({
      project: projectSchema,
      action: { type: 'string', enum: MUTATIONS },
      expected_record_sha: shaSchema,
      request: schema(requestProperties, ['id', 'owner'])
    }, ['project', 'action', 'expected_record_sha', 'request']),
    mutation: true
  }
];

export {
  ControlError,
  DEFAULT_RUNNER_CONTROL_REPOSITORY,
  RUNNER_ENGINE_SHA,
  runnerControlBase,
  runnerControlRepository
};

export const runnerControlTools = DEFINITIONS.map(({ mutation, ...definition }) => ({
  ...definition,
  annotations: {
    readOnlyHint: !mutation,
    destructiveHint: Boolean(mutation),
    idempotentHint: !mutation,
    openWorldHint: true
  }
}));

export function validateControlArguments(value, spec, path = 'arguments') {
  if (Array.isArray(spec.type)) {
    if (value === null && spec.type.includes('null')) return;
    return validateControlArguments(value, { ...spec, type: spec.type.find(t => t !== 'null') }, path);
  }
  if (spec.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ControlError('validation', `${path} must be an object`);
    }
    for (const key of spec.required || []) {
      if (!(key in value)) throw new ControlError('validation', `${path}.${key} is required`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (!spec.properties[key]) {
        if (key === 'base_sha' && path.endsWith('.request')) {
          throw new ControlError('validation', 'base_sha is resolved automatically from live main during claim; omit request.base_sha');
        }
        throw new ControlError('validation', `${path}.${key} is unsupported`);
      }
      validateControlArguments(item, spec.properties[key], `${path}.${key}`);
    }
  } else if (spec.type === 'array') {
    if (
      !Array.isArray(value) ||
      value.length < (spec.minItems || 0) ||
      value.length > spec.maxItems ||
      (spec.uniqueItems && new Set(value).size !== value.length)
    ) {
      throw new ControlError('validation', `${path} has invalid items`);
    }
    value.forEach(item => validateControlArguments(item, spec.items, path));
  } else if (spec.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (spec.minLength || 0) ||
      value.length > (spec.maxLength || Infinity) ||
      (spec.pattern && !new RegExp(spec.pattern).test(value))
    ) {
      throw new ControlError('validation', `${path} is invalid`);
    }
  } else if (spec.type === 'integer') {
    if (!Number.isInteger(value) || value < spec.minimum || value > spec.maximum) {
      throw new ControlError('validation', `${path} is invalid`);
    }
  } else if (spec.type === 'boolean' && typeof value !== 'boolean') {
    throw new ControlError('validation', `${path} must be boolean`);
  }
  if (spec.enum && !spec.enum.includes(value)) {
    throw new ControlError('validation', `${path} is unsupported`);
  }
}

export async function callRunnerControl(name, args, env, apiOverride) {
  const definition = DEFINITIONS.find(item => item.name === name);
  if (!definition) return null;
  validateControlArguments(args, definition.inputSchema);
  if (name === 'relay_runner_progress') {
    const progress = await callProgress(args, env, apiOverride);
    const canonical = await callRunnerControlCore('relay_runner_assignments', args, env, apiOverride);
    const assignments = [...canonical.claims, ...canonical.queue];
    return { ...progress, progress: (progress.progress || []).map(item => {
      const assignment = assignments.find(a => a.id === item.assignment);
      return { ...item, primary_team: assignment?.primary_team || null, supporting_teams: assignment?.supporting_teams || [], primary_staff: assignment?.primary_staff || null, supporting_staff: assignment?.supporting_staff || [], goal: assignment?.goal || null };
    }) };
  }
  if (name === 'relay_runner_resume') return callResume(args, env, apiOverride);
  if (name === 'relay_runner_updates') return callAssignmentUpdates(args, env, apiOverride);
  if (name === 'relay_cloud_project') return projectCloudStatus(env, args.project, apiOverride);
  if (name === 'relay_cloud_deploy_project_version') {
    return deployProjectCloudVersion(env, args.project, args.version_id, args.message, { github: apiOverride });
  }
  return callRunnerControlCore(name, args, env, apiOverride);
}

export function runnerControlError(error) {
  const status = error?.status;
  const code =
    error?.code ||
    (status === 401 ? 'auth' :
      status === 403 ? 'permission' :
      status === 429 ? 'capacity' :
      status >= 500 ? 'provider' :
      error?.name === 'TimeoutError' ? 'timeout' :
      'provider');
  return {
    ok: false,
    namespace: 'relay.RUNNER',
    error: {
      class: code,
      message: error instanceof ControlError ? error.message : 'Runner provider request failed',
      ...(error?.record_sha ? { record_sha: error.record_sha } : {}),
      retryable: false,
      recovery: code === 'uncertain_write'
        ? 'Inspect the current record and claim; never replay blindly.'
        : 'Refresh project policy, record revision and ownership before retrying.'
    },
    checked_at: new Date().toISOString()
  };
}
