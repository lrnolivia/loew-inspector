import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("evidence workflow offers the stage0 multi-capture suite", async () => {
  const workflow = await readFile(new URL("../.github/workflows/evidence.yml", import.meta.url), "utf8");
  assert.match(workflow, /field\.stage0/);
  assert.match(workflow, /scripts\/evidence-run\.mjs/);
});

test("evidence runner uses one Chromium launch for the suite", async () => {
  const source = await readFile(new URL("./evidence-run.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/chromium\.launch/g) || []).length, 1);
  assert.match(source, /LOEW_EVIDENCE_RESULT=/);
});
