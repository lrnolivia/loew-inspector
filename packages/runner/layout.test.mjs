import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import worker from '../../apps/mcp/index.js';
import * as nightShift from '../../features/night-shift/index.js';
const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('import-manifest.json', import.meta.url)));
test('Runner imported blobs match exact source provenance', () => {
 for (const file of manifest.files) {
  assert.equal(execFileSync('git', ['hash-object', new URL(file.target, root).pathname], {encoding:'utf8'}).trim(), file.blob, file.target);
 }
});
test('live authority is excluded from Batch 2', () => {
 for (const path of ['coordination','projects','workers','state','assignments','reports']) assert.equal(fs.existsSync(new URL(path, root)), false, path);
});
test('existing MCP implementation and scheduler are shared', () => {
 assert.equal(typeof worker.fetch, 'function');
 assert.equal(typeof nightShift.runWorker, 'function');
});
