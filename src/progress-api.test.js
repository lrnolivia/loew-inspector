import test from "node:test";
import assert from "node:assert/strict";
import { queuedProgress, progressResponse, PROGRESS_CONTRACT_VERSION } from "./progress-api.js";

test("1.8 consumer contract keeps queued intent separate from observed progress", () => {
  const q = queuedProgress({id:"q",next_action:"later"});
  const response = progressResponse("relay", [], [q]);
  assert.equal(PROGRESS_CONTRACT_VERSION, "1.7.5");
  assert.equal(response.observed_progress, true);
  assert.equal(response.queue[0].observed, false);
});
