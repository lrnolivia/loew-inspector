import test from "node:test";
import assert from "node:assert/strict";
import { latestRootTurn, parseRunnerStatus } from "../src/openai.mjs";

test("parseRunnerStatus uses an explicit Status line", () => {
  assert.equal(parseRunnerStatus("Findings\nWork is not complete.\n\nStatus: CONTINUE"), "CONTINUE");
  assert.equal(parseRunnerStatus("Status: CONTINUE\nMore work\nStatus: COMPLETE"), "COMPLETE");
});

test("parseRunnerStatus rejects loose status words", () => {
  assert.equal(parseRunnerStatus("This is not COMPLETE yet."), null);
  assert.equal(parseRunnerStatus("BLOCKED by nothing, actually."), null);
});

test("latestRootTurn ignores subagent turns", () => {
  const page = {
    data: [
      { id: "sub", subagent_id: "subagent_1" },
      { id: "root", subagent_id: null }
    ]
  };
  assert.equal(latestRootTurn(page).id, "root");
});
