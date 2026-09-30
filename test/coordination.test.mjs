import test from 'node:test';
import assert from 'node:assert/strict';
import { transition, evaluate, overlaps, covered } from '../src/coordination.mjs';

const now = new Date('2026-09-30T15:00:00Z');
const policy = { repository: 'lrnolivia/field', max_active_branches: 2, lease_hours: 12, branch_prefixes: ['field/'], excluded_branches: ['main', 'field/control'] };
const empty = () => ({ claims: [], queue: [], legacy_branches: ['old-recovery'] });
const request = (id, paths = [`src/${id}/`]) => ({ action: 'claim', id, owner: id, branch: `field/${id}`, paths, resources: [], goal: 'Fix behavior', acceptance: 'Preserve behavior', next_action: 'Inspect', base_sha: 'abc' });
const claim = (record, id, paths) => transition(record, request(id, paths), policy, now);

test('atomic admission rules leave the input revision unchanged', () => {
  const record = empty();
  const result = claim(record, 'a');
  assert.equal(record.claims.length, 0);
  assert.equal(result.claims[0].lease_until, '2026-10-01T03:00:00.000Z');
});
test('cap includes held and expired claims', () => {
  let record = claim(claim(empty(), 'a'), 'b');
  record = transition(record, { action: 'hold', id: 'a', owner: 'a', next_action: 'Recover' }, policy, now);
  assert.throws(() => transition(record, request('c'), policy, new Date('2026-10-05')), /budget/);
});
test('file/directory intersections block writers without false sibling matches', () => {
  assert.equal(overlaps('src/a/', 'src/a/file.ts'), true);
  assert.equal(overlaps('src/a/', 'src/another/file.ts'), false);
  assert.equal(covered('src/a/file.ts', ['src/a/']), true);
  assert.equal(covered('src/a/file.ts', ['src/a']), false);
  assert.throws(() => claim(claim(empty(), 'a', ['src/canvas/']), 'b', ['src/canvas/Camera.ts']), /overlaps/);
});
test('shared semantic resources block even across disjoint paths', () => {
  const record = transition(empty(), { ...request('a'), resources: ['camera'] }, policy, now);
  assert.throws(() => transition(record, { ...request('b'), resources: ['camera'] }, policy, now), /overlaps/);
});
test('same task, branch and owner cannot acquire duplicate work', () => {
  const record = claim(empty(), 'a');
  assert.throws(() => claim(record, 'a'), /already exists/);
  assert.throws(() => transition(record, { ...request('b'), owner: 'a' }, policy, now), /Owner already/);
  assert.throws(() => transition(record, { ...request('b'), branch: 'field/a' }, policy, now), /Branch already/);
});
test('expired claim stays reserved and only its owner can renew', () => {
  const record = claim(empty(), 'a');
  assert.throws(() => transition(record, { action: 'heartbeat', id: 'a', owner: 'b', next_action: 'Steal' }, policy, now), /another owner/);
  assert.throws(() => claim(record, 'b', ['src/a/']), /overlaps/);
  const renewed = transition(record, { action: 'heartbeat', id: 'a', owner: 'a', next_action: 'Resume' }, policy, new Date('2026-10-05'));
  assert.equal(renewed.claims.length, 1);
});
test('handoff retains branch and assignment while rejecting busy successors', () => {
  const record = claim(empty(), 'a');
  const result = transition(record, { action: 'handoff', id: 'a', owner: 'a', successor: 'c', next_action: 'Continue' }, policy, now);
  assert.equal(result.claims[0].branch, 'field/a');
  assert.equal(result.claims[0].owner, 'c');
  assert.throws(() => transition(claim(record, 'b'), { action: 'handoff', id: 'a', owner: 'a', successor: 'b', next_action: 'Continue' }, policy, now), /already owns/);
});
test('rescope checks conflicts and preserves task identity', () => {
  const record = claim(claim(empty(), 'a'), 'b');
  assert.throws(() => transition(record, { action: 'rescope', id: 'a', owner: 'a', paths: ['src/b/'], resources: [] }, policy, now), /overlaps/);
  assert.throws(() => transition(record, { action: 'rescope', id: 'a', owner: 'a', branch: 'field/continuation', paths: ['src/c/'], resources: [] }, policy, now), /cannot replace/);
  assert.equal(transition(record, { action: 'rescope', id: 'a', owner: 'a', paths: ['src/c/'], resources: [] }, policy, now).claims.length, 2);
});
test('queue consumes no slot and rejects duplicate task IDs', () => {
  const record = transition(empty(), { ...request('a'), action: 'queue' }, policy, now);
  assert.equal(record.claims.length, 0);
  assert.equal(record.queue[0].branch, undefined);
  assert.throws(() => transition(record, { ...request('a'), action: 'queue' }, policy, now), /already exists/);
  assert.equal(claim(record, 'a').queue[0].state, 'claimed');
});
test('completion requires proof and a true boolean disposition', () => {
  const record = claim(empty(), 'a');
  assert.throws(() => transition(record, { action: 'complete', id: 'a', owner: 'a' }, policy, now), /Completion requires/);
  const proof = { action: 'complete', id: 'a', owner: 'a', pr: 1, merged_head_sha: 'abc', merge_commit_sha: 'def', evidence: 'docs/field/completion.md', work_accounted: true };
  assert.throws(() => transition(record, { ...proof, work_accounted: 'false' }, policy, now), /Completion requires/);
  assert.equal(claim(transition(record, proof, policy, now), 'b').claims.length, 2);
});
test('invalid scope traversal and unsupported globs fail admission', () => {
  for (const path of ['/tmp/file', '../src', 'src/../file', 'src/./file', 'src//file', 'src/*']) assert.throws(() => claim(empty(), 'a', [path]), /Scopes must/);
});
test('audit distinguishes frozen legacy from unregistered new work and scope drift', () => {
  const record = claim(empty(), 'a');
  const findings = evaluate(record, policy, [{ name: 'main' }, { name: 'old-recovery' }, { name: 'field/a' }, { name: 'field/new' }],
    [{ number: 12, head: { ref: 'field/a', repo: { full_name: 'lrnolivia/field' } }, files: ['src/outside.ts'] }], new Date('2026-10-05'));
  assert.deepEqual(findings.map((f) => f.type), ['expired', 'unregistered_branch', 'scope_drift']);
  assert.equal(findings[1].branch, 'field/new');
});
