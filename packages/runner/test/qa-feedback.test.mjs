import test from "node:test";
import assert from "node:assert/strict";
import { recordQaFeedback, listQaFeedback, consumeQaFeedback } from "../src/qa-feedback.mjs";

function memoryBucket() {
  const objects = new Map();
  return {
    objects,
    list: async ({ prefix }) => ({ objects: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }),
    get: async key => objects.has(key) ? { json: async () => JSON.parse(objects.get(key)) } : null,
    put: async (key, value) => objects.set(key, value)
  };
}

const evidence = {
  evidence_id: "vis_feedback-12345678",
  context: {
    project: "relay",
    assignment: "relay-2.0-test",
    owner: "relay-2.0-test",
    branch: "relay/2.0-test",
    commit_sha: "a".repeat(40)
  }
};

test("QA feedback events are durable, identity-bound and monotonically ordered", async () => {
  const bucket = memoryBucket();
  const first = await recordQaFeedback(bucket, evidence, { overall: "needs_work", notes: "tighten the header" }, "2026-10-01T08:00:00.000Z");
  const second = await recordQaFeedback(bucket, evidence, { overall: "looks_good", notes: "fixed" }, "2026-10-01T08:00:00.000Z");
  assert.ok(second.sequence > first.sequence);
  assert.equal(first.identity.assignment, "relay-2.0-test");
  assert.equal(first.identity.branch, "relay/2.0-test");
  const pending = await listQaFeedback(bucket, { project: "relay", assignment: "relay-2.0-test", owner: "relay-2.0-test", branch: "relay/2.0-test" });
  assert.deepEqual(pending.events.map(item => item.event_id), [first.event_id, second.event_id]);
});

test("consumption acknowledges matching feedback so it is not delivered repeatedly", async () => {
  const bucket = memoryBucket();
  const event = await recordQaFeedback(bucket, evidence, { notes: "move the control" }, "2026-10-01T08:01:00.000Z");
  const consumed = await consumeQaFeedback(bucket, { project: "relay", assignment: "relay-2.0-test", owner: "relay-2.0-test", branch: "relay/2.0-test" });
  assert.deepEqual(consumed.acknowledged, [event.event_id]);
  const again = await listQaFeedback(bucket, { project: "relay", assignment: "relay-2.0-test", owner: "relay-2.0-test", branch: "relay/2.0-test" });
  assert.equal(again.events.length, 0);
});

test("same-assignment feedback from a stale branch is surfaced as a reconciliation conflict", async () => {
  const bucket = memoryBucket();
  await recordQaFeedback(bucket, evidence, { notes: "old branch note" }, "2026-10-01T08:02:00.000Z");
  const pending = await listQaFeedback(bucket, { project: "relay", assignment: "relay-2.0-test", owner: "relay-2.0-test", branch: "relay/other" });
  assert.equal(pending.events.length, 0);
  assert.equal(pending.conflicts.length, 1);
  assert.deepEqual(pending.conflicts[0].conflicts, ["branch"]);
});

test("feedback without trusted assignment or branch identity is never silently applied", async () => {
  const bucket = memoryBucket();
  await recordQaFeedback(bucket, { evidence_id: "vis_feedback-87654321", context: { project: "relay" } }, { notes: "unbound" }, "2026-10-01T08:03:00.000Z");
  const pending = await listQaFeedback(bucket, { project: "relay", assignment: "relay-2.0-test", owner: "relay-2.0-test", branch: "relay/2.0-test" });
  assert.equal(pending.events.length, 0);
});
