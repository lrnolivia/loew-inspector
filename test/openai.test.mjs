import test from "node:test";
import assert from "node:assert/strict";
import { latestRootTurn } from "../src/openai.mjs";

test("latestRootTurn ignores subagent turns", () => {
  const turn = latestRootTurn({
    data: [
      { id: "sub", subagent_id: "subagent_1", status: "completed" },
      { id: "root", subagent_id: null, status: "failed" }
    ]
  });

  assert.equal(turn.id, "root");
  assert.equal(turn.status, "failed");
});

test("latestRootTurn returns null when no root turn exists", () => {
  assert.equal(
    latestRootTurn({ data: [{ id: "sub", subagent_id: "subagent_1", status: "completed" }] }),
    null
  );
});
