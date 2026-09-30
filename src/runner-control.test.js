import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { callRunnerControl, runnerControlTools, runnerControlError, RUNNER_ENGINE_SHA, runnerControlRepository } from './runner-control.js';
const sha = 'a'.repeat(40);
const newSha = 'b'.repeat(40);
const defaultRequest = { id: 'task', owner: 'worker', branch: 'loew-inspector/task', paths: ['src/'], resources: ['relay-control'], goal: 'Native tools', acceptance: 'Policy enforced', next_action: 'Implement' };
function fixture(options = {}) {
  let record = { schema: 1, project: 'loew-inspector', claims: options.claims || [], queue: [], legacy_branches: ['main', 'old-task'] };
  let revision = sha;
  const writes = [];
  const calls = [];
  const registration = { id: 'loew-inspector', repository: 'lrnolivia/loew-inspector', managed: true, default_branch: 'main', implementation: { branch_prefixes: ['loew-inspector/'], excluded_branches: ['main'] }, coordination: { status: 'enabled', record: 'coordination/loew-inspector.json', max_active_branches: 4, lease_hours: 12 } };
  const file = (value, revision = sha) => ({ type: 'file', sha: revision, encoding: 'base64', content: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64') });
  const api = async (path, request) => {
    calls.push(path);
    if (path.includes('src/coordination.mjs')) return file('', options.engineSha || RUNNER_ENGINE_SHA);
    if (path.includes('projects/loew-inspector.json')) return file(registration);
    if (path.includes('coordination/loew-inspector.json')) {
      if (request?.method === 'PUT') {
        writes.push(request);
        if (options.conflict) { revision = newSha; throw Object.assign(new Error('Conflict'), { status: 409 }); }
        record = JSON.parse(Buffer.from(request.body.content, 'base64').toString('utf8'));
        revision = newSha;
        if (options.timeout) throw Object.assign(new Error('Timed out'), { name: 'TimeoutError' });
        return { commit: { sha: 'c'.repeat(40) } };
      }
      if (options.readbackUnavailable && writes.length) throw new Error('outage');
      // Preserve exact serialization used by the writer on readback.
      return writes.length ? file(`${JSON.stringify(record, null, 2)}\n`, revision) : file(record, revision);
    }
    if (path.includes('/branches?')) return options.branches || [];
    if (path.includes('/git/ref/heads/main')) return { object: { sha } };
    if (path.includes('/pulls?state=open')) return [];
    if (path.endsWith('/pulls/9')) return options.pr || { merged: false };
    throw new Error(`Unexpected path ${path}`);
  };
  return { api, writes, calls, get record() { return record; } };
}
const coordinate = (f, action, request = defaultRequest, expected_record_sha = sha) => callRunnerControl('relay_runner_coordinate', { project: 'loew-inspector', action, request, expected_record_sha }, {}, f.api);
const claim = (extra = {}) => ({ ...defaultRequest, state: 'active', base_sha: sha, created_at: new Date().toISOString(), lease_until: new Date(Date.now() + 3600000).toISOString(), ...extra });

test('generated policy is byte-exact Runner source with correct Git blob provenance', async () => {
  const source = await readFile(new URL('./coordination-engine.js', import.meta.url));
  const hash = createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
  assert.equal(hash, RUNNER_ENGINE_SHA);
});
test('definitions describe reads and bounded writes with strict server validation', async () => {
  assert.equal(runnerControlTools.length, 6);
  const f = fixture();
  await assert.rejects(coordinate(f, 'release'), /unsupported/);
  await assert.rejects(coordinate(f, 'claim', { ...defaultRequest, merged_head_sha: sha }), /unsupported/);
  await assert.rejects(coordinate(f, 'claim', { ...defaultRequest, paths: ['../secrets'] }), /Scopes/);
  assert.equal(f.writes.length, 0);
});
test('claim derives live base and writes only Runner coordination with exact CAS and readback receipt', async () => {
  const f = fixture();
  const result = await coordinate(f, 'claim');
  assert.equal(result.claim.base_sha, sha);
  assert.equal(result.receipt.previous_record_sha, sha);
  assert.equal(result.record_sha, newSha);
  assert.equal(result.receipt.commit_sha, 'c'.repeat(40));
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].body.sha, sha);
  assert.equal(f.writes[0].body.branch, 'main');
});
test('held and expired reservations deny overlapping paths and semantic resources', async () => {
  for (const c of [claim({ id: 'existing', owner: 'other', branch: 'loew-inspector/other', state: 'held' }), claim({ id: 'existing', owner: 'other', branch: 'loew-inspector/other', lease_until: '2000-01-01' })]) {
    const f = fixture({ claims: [c] });
    await assert.rejects(coordinate(f, 'claim'), /Ownership overlaps/);
    await assert.rejects(coordinate(f, 'claim', { ...defaultRequest, paths: ['other/file'] }), /Ownership overlaps/);
    assert.equal(f.writes.length, 0);
  }
});
test('owner cannot take another claim; branch budget and duplicate identities enforced', async () => {
  const f = fixture({ claims: [claim({ owner: 'other' })] });
  await assert.rejects(coordinate(f, 'heartbeat', { id: 'task', owner: 'worker', next_action: 'Renew' }), /another owner/);
  const full = fixture({ claims: Array.from({ length: 4 }, (_, i) => claim({ id: `existing-${i}`, owner: `owner-${i}`, branch: `loew-inspector/${i}`, paths: [`other-${i}/`], resources: [] })) });
  await assert.rejects(coordinate(full, 'claim'), /budget reached/);
  const duplicate = fixture({ claims: [claim()] });
  await assert.rejects(coordinate(duplicate, 'claim'), /already exists/);
});
test('stale revision and concurrent CAS conflict never automatically resubmit', async () => {
  const stale = fixture();
  await assert.rejects(coordinate(stale, 'claim', defaultRequest, newSha), /Record changed/);
  assert.equal(stale.writes.length, 0);
  const race = fixture({ conflict: true });
  await assert.rejects(coordinate(race, 'claim'), error => error.code === 'conflict');
  assert.equal(race.writes.length, 1);
});
test('timeout after successful write is reconciled through exact readback without duplicate write', async () => {
  const f = fixture({ timeout: true });
  const result = await coordinate(f, 'claim');
  assert.equal(result.ok, true);
  assert.equal(result.receipt.reconciled_after_transport_error, true);
  assert.equal(f.writes.length, 1);
  await assert.rejects(coordinate(f, 'claim'), /Record changed/);
  assert.equal(f.writes.length, 1);
});
test('unavailable readback reports uncertainty instead of success or retry', async () => {
  const f = fixture({ timeout: true, readbackUnavailable: true });
  await assert.rejects(coordinate(f, 'claim'), error => error.code === 'uncertain_write');
  assert.equal(f.writes.length, 1);
});
test('changed canonical engine fails closed before write', async () => {
  const f = fixture({ engineSha: newSha });
  await assert.rejects(coordinate(f, 'claim'), error => error.code === 'policy_drift');
  assert.equal(f.writes.length, 0);
});
test('existing and frozen legacy branches cannot be repurposed as new admission', async () => {
  const f = fixture({ branches: [{ name: defaultRequest.branch }] });
  await assert.rejects(coordinate(f, 'claim'), /precede branch/);
  const legacy = fixture();
  await assert.rejects(coordinate(legacy, 'claim', { ...defaultRequest, branch: 'old-task' }), /reserved/);
});
test('completion uses provider merged identity and denies unmerged or wrong branch', async () => {
  const request = { id: 'task', owner: 'worker', pr: 9, evidence: 'https://github.com/lrnolivia/loew-inspector/pull/9', work_accounted: true };
  const pr = { merged: true, base: { ref: 'main', repo: { full_name: 'lrnolivia/loew-inspector' } }, head: { ref: defaultRequest.branch, sha, repo: { full_name: 'lrnolivia/loew-inspector' } }, merge_commit_sha: newSha };
  const f = fixture({ claims: [claim()], pr });
  const result = await coordinate(f, 'complete', request);
  assert.equal(result.claim.state, 'completed');
  assert.equal(result.claim.merge_commit_sha, newSha);
  const wrong = fixture({ claims: [claim()], pr: { ...pr, head: { ...pr.head, ref: 'wrong' } } });
  await assert.rejects(coordinate(wrong, 'complete', request), /claimed same-repository PR/);
  assert.equal(wrong.writes.length, 0);
  const notMerged = fixture({ claims: [claim()] });
  await assert.rejects(coordinate(notMerged, 'complete', request), /claimed same-repository PR/);
});
test('preflight requires current owner, active lease and complete scoped paths', async () => {
  const args = { project: 'loew-inspector', id: 'task', owner: 'worker', paths: ['src/index.js'] };
  const f = fixture({ claims: [claim()], branches: [{ name: defaultRequest.branch }] });
  assert.equal((await callRunnerControl('relay_runner_preflight', args, {}, f.api)).admitted, 'task');
  await assert.rejects(callRunnerControl('relay_runner_preflight', { ...args, paths: ['other/file'] }, {}, f.api), /exceed/);
  const expired = fixture({ claims: [claim({ lease_until: '2000-01-01' })] });
  await assert.rejects(callRunnerControl('relay_runner_preflight', args, {}, expired.api), /live active/);
});
test('assignment lookup tells the truth about held and expired owner reservation', async () => {
  const f = fixture({ claims: [claim({ state: 'held', lease_until: '2000-01-01' })] });
  const result = await callRunnerControl('relay_runner_assignments', { project: 'loew-inspector', assignment: 'task' }, {}, f.api);
  assert.equal(result.claims[0].reserved, true);
  assert.equal(result.claims[0].lease_expired, true);
});
test('provider failure classification never echoes provider secrets', () => {
  const result = runnerControlError(Object.assign(new Error('token secret'), { status: 403 }));
  assert.equal(result.error.class, 'permission');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});


test('Runner control authority is configurable for Relay migration and validates owner scope', async () => {
  const f = fixture();
  const env = { RELAY_RUNNER_CONTROL_REPOSITORY: 'lrnolivia/relay' };
  const result = await callRunnerControl('relay_runner_project', { project: 'loew-inspector' }, env, f.api);
  assert.equal(result.ok, true);
  assert.ok(f.calls.some(path => path.startsWith('/repos/lrnolivia/relay/contents/projects/loew-inspector.json')));
  assert.equal(runnerControlRepository(env), 'lrnolivia/relay');
  assert.throws(
    () => runnerControlRepository({ RELAY_RUNNER_CONTROL_REPOSITORY: 'other/relay' }),
    /Invalid Runner control repository binding/
  );
});
