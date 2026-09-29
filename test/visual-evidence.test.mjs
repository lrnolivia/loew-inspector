import test from "node:test";
import assert from "node:assert/strict";
import { isEvidenceId, isRunId, metadataKeys, normalizeVisualFilters, compareEvidenceRecords } from "../src/visual-evidence.mjs";

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
    pr: 89,
    run: null
  });
  assert.throws(() => normalizeVisualFilters({ environment: "weird" }), /environment/);
  assert.throws(() => normalizeVisualFilters({ project: "../field" }), /filter/);
});


test("compares structured evidence without claiming pixel equality", () => {
  const base = {
    viewport: { width: 1440, height: 900 },
    context: { project: "field", surface: "editor" },
    dom: { html_bytes: 1000, element_tag_count: 40 },
    accessibility: { available: true, node_count: 25 }
  };
  assert.equal(compareEvidenceRecords(base, structuredClone(base)).result, "pass");
  const changed = compareEvidenceRecords(base, { ...structuredClone(base), dom: { html_bytes: 1010, element_tag_count: 41 } });
  assert.equal(changed.result, "changed");
  assert.equal(changed.dom.changed, true);
});


test("accepts normalized evidence run ids", () => {
  assert.equal(isRunId("run_12345678"), true);
  assert.equal(isRunId("../../run"), false);
});

test("normalizes run filters", () => {
  assert.deepEqual(normalizeVisualFilters({ run: "run_12345678" }), {
    project: null,
    environment: null,
    pr: null,
    run: "run_12345678"
  });
});
