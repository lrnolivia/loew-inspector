import test from 'node:test';
import assert from 'node:assert/strict';
import { mandatoryRepairsForPull, compareSatisfiesRepair } from '../lib/shared-repairs.mjs';

const pull = { base: { ref: 'main' } };

test('selects only resolved mandatory repairs applicable to the pull base', () => {
  const ledger = {
    repairs: [
      { id: 'required', status: 'resolved', mandatory_baseline: true, canonical_repair_sha: 'a'.repeat(40), scope: { repository: 'lrnolivia/field', base_branch: 'main', applies_to_open_prs: true } },
      { id: 'optional', status: 'resolved', mandatory_baseline: false, canonical_repair_sha: 'b'.repeat(40), scope: { repository: 'lrnolivia/field', base_branch: 'main' } },
      { id: 'wrong-base', status: 'resolved', mandatory_baseline: true, canonical_repair_sha: 'c'.repeat(40), scope: { repository: 'lrnolivia/field', base_branch: 'release' } },
      { id: 'open-incident', status: 'active', mandatory_baseline: true, canonical_repair_sha: 'd'.repeat(40), scope: { repository: 'lrnolivia/field', base_branch: 'main' } },
    ],
  };
  assert.deepEqual(
    mandatoryRepairsForPull(ledger, pull, 'lrnolivia/field').map((repair) => repair.id),
    ['required']
  );
});

test('accepts only ancestry compare states', () => {
  assert.equal(compareSatisfiesRepair({ status: 'ahead' }), true);
  assert.equal(compareSatisfiesRepair({ status: 'identical' }), true);
  assert.equal(compareSatisfiesRepair({ status: 'diverged' }), false);
  assert.equal(compareSatisfiesRepair({ status: 'behind' }), false);
});
