// Deterministic admission rules; expired leases retain ownership until reconciliation.
export const occupying = (claim) => claim.state !== 'completed';

export function normalizeScope(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.split('/').some((p, i, parts) => p === '..' || p === '.' || (!p && i < parts.length - 1)) || value.includes('*')) {
    throw new Error('Scopes must be repository-relative files or directory prefixes ending in /. Globs are not supported.');
  }
  return value;
}

export function overlaps(a, b) {
  return a === b || (a.endsWith('/') && b.startsWith(a)) || (b.endsWith('/') && a.startsWith(b));
}

export function covered(file, scopes) {
  return scopes.some((scope) => file === scope || (scope.endsWith('/') && file.startsWith(scope)));
}

export function transition(record, request, policy, now = new Date()) {
  if (record.migration_frozen) throw new Error("Control authority migrated to " + record.migration_frozen.canonical_repository + "; refresh canonical Relay state before writing.");
  const next = structuredClone(record);
  const claims = next.claims;
  const current = claims.find((c) => c.id === request.id);
  if (!request.id || !request.owner) throw new Error('Stable assignment id and owner id are required.');
  if (request.action === 'queue') {
    if (current || next.queue.some((q) => q.id === request.id)) throw new Error('Assignment already exists; resume it.');
    if (!request.goal || !request.acceptance || !request.next_action || !request.paths?.length) throw new Error('Queue requires goal, acceptance, next action and proposed paths.');
    next.queue.push({ id: request.id, owner: request.owner, goal: request.goal, acceptance: request.acceptance,
      next_action: request.next_action, paths: request.paths.map(normalizeScope), resources: request.resources ?? [], state: 'queued', created_at: now.toISOString() });
    next.updated_at = now.toISOString();
    return next;
  }
  if (current && current.owner !== request.owner) throw new Error('Claim belongs to another owner; use an authorized handoff.');
  if (request.action === 'rescope') {
    if (!current || !occupying(current) || !request.paths || !request.resources) throw new Error('Rescope requires the current owner, full paths and full resources.');
    if ((request.branch && request.branch !== current.branch) || (request.base_sha && request.base_sha !== current.base_sha)) throw new Error('Rescope cannot replace the existing task branch or baseline.');
    const reduced = { ...next, claims: claims.filter((c) => c.id !== current.id) };
    const admitted = transition(reduced, { ...current, ...request, action: 'claim' }, policy, now);
    admitted.claims.find((c) => c.id === current.id).created_at = current.created_at;
    return admitted;
  }
  if (request.action === 'claim') {
    if (current) throw new Error('Assignment already exists. Resume/heartbeat the existing claim instead of making another branch.');
    if (!request.branch || !policy.branch_prefixes.some((prefix) => request.branch.startsWith(prefix)) || policy.excluded_branches.includes(request.branch)) throw new Error('Branch is not an allowed implementation branch.');
    if (!request.goal || !request.acceptance || !request.next_action || !request.base_sha) throw new Error('Goal, acceptance, next action and live main SHA are required.');
    const paths = (request.paths ?? []).map(normalizeScope);
    const resources = request.resources ?? [];
    if (!paths.length || resources.some((r) => typeof r !== 'string' || !r)) throw new Error('Explicit paths and valid resource names are required.');
    const active = claims.filter(occupying);
    if (active.length >= policy.max_active_branches) throw new Error('Active branch budget reached. Finish or reconcile existing work before starting another implementation.');
    for (const c of active) {
      if (c.owner === request.owner) throw new Error('Owner already has an active implementation. Finish it or hand it off first.');
      if (c.branch === request.branch) throw new Error('Branch already has an owner.');
      if (paths.some((a) => c.paths.some((b) => overlaps(a, b))) || resources.some((r) => c.resources.includes(r))) throw new Error(`Ownership overlaps ${c.id}. Queue or split the scope; do not create a competing branch.`);
    }
    claims.push({ id: request.id, owner: request.owner, branch: request.branch, paths, resources,
      goal: request.goal, acceptance: request.acceptance, next_action: request.next_action,
      base_sha: request.base_sha, state: 'active', created_at: now.toISOString() });
    const queued = next.queue.find((q) => q.id === request.id);
    if (queued && queued.owner !== request.owner) throw new Error('Queued assignment belongs to another owner.');
    if (queued) queued.state = 'claimed';
  } else {
    if (!current || !occupying(current)) throw new Error('An active claim is required.');
    if (request.action === 'heartbeat') {
      if (!request.next_action) throw new Error('Persist the next action when renewing.');
      current.next_action = request.next_action;
      current.state = 'active';
    } else if (request.action === 'hold') {
      if (!request.next_action) throw new Error('A hold requires a recovery action.');
      current.state = 'held';
      current.next_action = request.next_action;
    } else if (request.action === 'handoff') {
      if (!request.successor || !request.next_action) throw new Error('A handoff requires a successor and next action.');
      if (claims.some((c) => occupying(c) && c.owner === request.successor)) throw new Error('Successor already owns an active implementation.');
      current.owner = request.successor;
      current.next_action = request.next_action;
    } else if (request.action === 'complete') {
      if (request.work_accounted !== true || typeof request.evidence !== 'string' || !request.evidence.trim() || !Number.isInteger(request.pr) || request.pr < 1 || !request.merged_head_sha || !request.merge_commit_sha) throw new Error('Completion requires a verified merged PR, durable disposition of all work/intent/QA, and evidence.');
      Object.assign(current, { state: 'completed', pr: request.pr, merged_head_sha: request.merged_head_sha,
        merge_commit_sha: request.merge_commit_sha, evidence: request.evidence, work_accounted: true, completed_at: now.toISOString() });
    } else throw new Error('Unknown coordination action.');
  }
  const updated = claims.find((c) => c.id === request.id);
  updated.updated_at = now.toISOString();
  updated.lease_until = new Date(now.getTime() + policy.lease_hours * 3600000).toISOString();
  next.updated_at = now.toISOString();
  return next;
}

export function evaluate(record, policy, branches, prs, now = new Date()) {
  const findings = [];
  const active = record.claims.filter(occupying);
  const legacy = new Set(record.legacy_branches);
  if (active.length > policy.max_active_branches) findings.push({ type: 'budget', count: active.length });
  for (const c of active) {
    if (new Date(c.lease_until) <= now) findings.push({ type: 'expired', assignment: c.id, branch: c.branch, action: 'Reconcile or renew; ownership is retained.' });
    if (!branches.some((b) => b.name === c.branch) && now - new Date(c.created_at) > 3600000) findings.push({ type: 'missing_branch', assignment: c.id, branch: c.branch });
  }
  for (let i = 0; i < active.length; i++) for (const b of active.slice(i + 1)) {
    const a = active[i];
    if (a.paths.some((p) => b.paths.some((q) => overlaps(p, q))) || a.resources.some((r) => b.resources.includes(r))) findings.push({ type: 'overlap', assignments: [a.id, b.id] });
  }
  for (const b of branches) {
    if (policy.excluded_branches.includes(b.name)) continue;
    if (!record.claims.some((c) => c.branch === b.name) && !legacy.has(b.name)) findings.push({ type: 'unregistered_branch', branch: b.name });
  }
  for (const pr of prs) {
    if (pr.head.repo?.full_name !== policy.repository) continue;
    const c = active.find((c) => c.branch === pr.head.ref);
    if (!c) continue;
    const outside = pr.files.filter((p) => !covered(p, c.paths));
    if (outside.length) findings.push({ type: 'scope_drift', assignment: c.id, branch: c.branch, pr: pr.number, paths: outside });
  }
  return findings;
}
