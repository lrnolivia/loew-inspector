import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { RUNNER_ENGINE_SHA } from './runner-control-core.js';

const sha = 'a'.repeat(40), revision = 'b'.repeat(40);
const root = new URL('../', import.meta.url);
async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'relay-retirement-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const statePath = join(dir, 'state.json');
  const requestPath = join(dir, 'request.json');
  const state = { engine: RUNNER_ENGINE_SHA, revision: sha, writes: 0, head: sha,
    registration: { id: 'relay', repository: 'lrnolivia/relay', managed: true, default_branch: 'main', implementation: { branch_prefixes: ['relay/'], excluded_branches: ['main'] }, coordination: { status: 'enabled', record: 'coordination/relay.json', max_active_branches: 4, lease_hours: 12 } },
    record: { project: 'relay', claims: [{ id: 'old', owner: 'owner', state: 'held', branch: 'relay/old', goal: 'Retain original objective' }], queue: [], legacy_branches: ['main'] }, ...overrides };
  await writeFile(statePath, JSON.stringify(state));
  // Mock only the gh process boundary; run the actual CLI, schema validation and adapter.
  await writeFile(join(dir, 'gh'), `#!${process.execPath}
const fs = require('node:fs');
const file = process.env.RELAY_TEST_STATE;
const s = JSON.parse(fs.readFileSync(file));
const path = process.argv[3];
const method = process.argv[process.argv.indexOf('--method') + 1];
const output = value => process.stdout.write(JSON.stringify(value));
const fail = status => { process.stderr.write('HTTP ' + status); process.exit(1); };
const blob = (value, sha) => ({ type: 'file', encoding: 'base64', sha, content: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64') });
if (path.includes('projects/relay.json')) output(blob(s.registration, '${sha}'));
else if (path.includes('src/coordination.mjs')) output(blob('', s.engine));
else if (path.includes('git/ref/heads/relay%2Fold')) { if (s.headError) fail(s.headError); output({ object: { sha: s.head } }); }
else if (path.includes('coordination/relay.json')) {
  if (method === 'PUT') {
    const body = JSON.parse(fs.readFileSync(0, 'utf8')); s.writes++;
    if (s.conflict) { fs.writeFileSync(file, JSON.stringify(s)); fail(409); }
    if (body.sha !== s.revision) fail(409);
    s.record = JSON.parse(Buffer.from(body.content, 'base64')); s.revision = '${revision}';
    fs.writeFileSync(file, JSON.stringify(s));
    if (s.timeout) fail(504);
    output({ commit: { sha: '${revision}' } });
  } else {
    if (s.unreadable && s.writes) fail(503);
    output(blob(s.writes ? JSON.stringify(s.record, null, 2) + '\\n' : s.record, s.revision));
  }
} else { process.stderr.write('Unexpected endpoint ' + path); process.exit(1); }
`, { mode: 0o755 });
  const request = { expected_record_sha: sha, id: 'old', owner: 'owner', disposition: 'cancelled', operation_id: 'retire-old', reason: 'Abandoned', evidence: 'Writer stopped and work preserved', expected_head_sha: sha };
  return {
    read: async () => JSON.parse(await readFile(statePath, 'utf8')),
    run: async (patch = {}) => {
      await writeFile(requestPath, JSON.stringify({ ...request, ...patch }));
      return spawnSync(process.execPath, ['scripts/coordinate.mjs', 'retire', 'relay', requestPath], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RELAY_TEST_STATE: statePath, RELAY_RUNNER_CONTROL_REPOSITORY: 'lrnolivia/relay' } });
    }
  };
}
test('CLI retirement shares exact CAS/readback and reconciles lost responses without double writes', async t => {
  const f = await fixture(t, { timeout: true });
  const first = await f.run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).receipt.reconciled_after_transport_error, true);
  const replay = await f.run({ expected_record_sha: revision });
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).receipt.replayed, true);
  assert.equal((await f.read()).writes, 1);
});
test('CLI rejects stale revision, forged head, policy drift and permission-denied absence', async t => {
  for (const [options, request] of [[{}, { expected_record_sha: revision }], [{ head: revision }, {}], [{ engine: revision }, {}], [{ headError: 403 }, { expected_head_sha: null }], [{}, { verified_head_sha: sha }]]) {
    const f = await fixture(t, options);
    const result = await f.run(request);
    assert.notEqual(result.status, 0);
    assert.equal((await f.read()).writes, 0);
  }
});
test('CLI writes only once on CAS conflict or unverifiable transport failure', async t => {
  for (const options of [{ conflict: true }, { timeout: true, unreadable: true }]) {
    const f = await fixture(t, options);
    const result = await f.run();
    assert.notEqual(result.status, 0);
    assert.equal((await f.read()).writes, 1);
  }
});
test('candidate engine sync targets the core pin and leaves canonical guard enforced', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-engine-sync-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'scripts')); await mkdir(join(dir, 'src'));
  await copyFile(new URL('../scripts/sync-coordination-engine.mjs', import.meta.url), join(dir, 'scripts/sync-coordination-engine.mjs'));
  const engine = Buffer.from('export const example = "candidate";\n');
  await writeFile(join(dir, 'src/coordination.mjs'), engine);
  await writeFile(join(dir, 'src/runner-control-core.js'), `export const RUNNER_ENGINE_SHA = '${sha}';\n`);
  const result = spawnSync(process.execPath, [join(dir, 'scripts/sync-coordination-engine.mjs'), '--local'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readFile(join(dir, 'src/coordination-engine.js')), engine);
  const hash = createHash('sha1').update(`blob ${engine.length}\0`).update(engine).digest('hex');
  assert.match(await readFile(join(dir, 'src/runner-control-core.js'), 'utf8'), new RegExp(hash));
  const workflow = await readFile(new URL('../.github/workflows/coordination.yml', import.meta.url), 'utf8');
  assert.match(workflow, /options: \[[^\]]*retire/);
  assert.match(workflow, /node scripts\/coordinate.mjs/);
});
