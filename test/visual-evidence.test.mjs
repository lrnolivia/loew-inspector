import test from "node:test";
import assert from "node:assert/strict";
import { isEvidenceId, metadataKeys, normalizeVisualFilters } from "../src/visual-evidence.mjs";

test("accepts inspector evidence ids only", () => {
  assert.equal(isEvidenceId("vis_88eb03ad-3cc9-44e3-8493-0912850e3653"), true);
  assert.equal(isEvidenceId("../../secret"), false);
  assert.equal(isEvidenceId("worker_123"), false);
});

test("selects capture metadata and excludes session records", () => {
  const keys = metadataKeys([
    { key: "visual/2026/09/29/vis_a1234567.json" },
    { key: "visual/2026/09/29/vis_a1234567.png" },
    { key: "sessions/some-session.json" },
    { key: "other/vis_a1234567.json" }
  ]);
  assert.deepEqual(keys, ["visual/2026/09/29/vis_a1234567.json"]);
});


test("normalizes visual evidence filters", () => {
  assert.deepEqual(normalizeVisualFilters({ project: "field", environment: "qa", pr: "89" }), {
    project: "field",
    environment: "qa",
    pr: 89
  });
  assert.throws(() => normalizeVisualFilters({ environment: "weird" }), /environment/);
  assert.throws(() => normalizeVisualFilters({ project: "../field" }), /filter/);
});
