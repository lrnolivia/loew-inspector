import test from "node:test";
import assert from "node:assert/strict";
import { createSourceBranch, sourceInventory, sourcePullRequestAction } from "./source-lifecycle.js";

test("inventory returns exact default, branch and open PR heads", async () => {
  const main = "a".repeat(40), branch = "b".repeat(40), pr = "c".repeat(40);
  const request = async (_env, path) => {
    if (path === "/repos/lrnolivia/relay") return { default_branch: "main" };
    if (path.includes("/git/ref/heads/main")) return { object: { sha: main } };
    if (path.includes("/branches?")) return [{ name: "main", commit: { sha: branch }, protected: true }];
    if (path.includes("/pulls?state=open")) return [{ number: 4, title: "x", draft: true, head: { ref: "x", sha: pr }, base: { ref: "main" }, state: "open" }];
    throw new Error("unexpected " + path);
  };
  const got = await sourceInventory({}, { repo: "relay" }, request);
  assert.equal(got.default_head_sha, main);
  assert.equal(got.branches[0].head_sha, branch);
  assert.equal(got.open_pull_requests[0].head_sha, pr);
});

test("branch creation accepts an exact commit SHA and verifies readback", async () => {
  const base = "d".repeat(40);
  let createBody;
  const request = async (_env, path, options = {}) => {
    if (path.endsWith("/git/commits/" + base)) return { sha: base };
    if (path.endsWith("/git/refs") && options.method === "POST") {
      createBody = options.body;
      return { ref: "refs/heads/relay/exact", object: { sha: base } };
    }
    if (path.includes("/git/ref/heads/relay/exact")) return { object: { sha: base } };
    throw new Error("unexpected " + path);
  };
  const got = await createSourceBranch({}, { repo: "relay", branch: "relay/exact", base }, request);
  assert.equal(createBody.sha, base);
  assert.equal(got.head_sha, base);
  assert.equal(got.reconciled_after_transport_error, false);
});

test("branch creation reconciles a provider error after a successful write", async () => {
  const base = "e".repeat(40);
  const request = async (_env, path, options = {}) => {
    if (path.includes("/git/ref/heads/main")) return { object: { sha: base } };
    if (path.endsWith("/git/refs") && options.method === "POST") throw new Error("timeout");
    if (path.includes("/git/ref/heads/relay/reconciled")) return { object: { sha: base } };
    throw new Error("unexpected " + path);
  };
  const got = await createSourceBranch({}, { repo: "relay", branch: "relay/reconciled", base: "main" }, request);
  assert.equal(got.reconciled_after_transport_error, true);
});

test("PR action rejects a changed head before mutation", async () => {
  let calls = 0;
  const request = async () => {
    calls += 1;
    return { state: "open", head: { sha: "0".repeat(40) } };
  };
  await assert.rejects(
    sourcePullRequestAction({}, { repo: "relay", number: 1, action: "update", expected_head_sha: "f".repeat(40), title: "no" }, request),
    /head changed/
  );
  assert.equal(calls, 1);
});

test("ready-for-review revalidates exact head after GraphQL mutation", async () => {
  const head = "1".repeat(40);
  let reads = 0, called = false;
  const request = async (_env, path) => {
    if (!path.endsWith("/pulls/7")) throw new Error("unexpected " + path);
    reads += 1;
    return { state: "open", draft: reads === 1, node_id: "PR_node", head: { sha: head } };
  };
  const graphql = async (_env, _owner, _repo, query, variables) => {
    called = true;
    assert.match(query, /markPullRequestReadyForReview/);
    assert.equal(variables.pullRequestId, "PR_node");
    return {};
  };
  const got = await sourcePullRequestAction({}, { repo: "relay", number: 7, action: "ready", expected_head_sha: head }, request, graphql);
  assert.equal(called, true);
  assert.equal(got.pull_request.draft, false);
});

test("merge rejects a non-green exact head without calling merge", async () => {
  const head = "2".repeat(40);
  let merged = false;
  const request = async (_env, path, options = {}) => {
    if (path.endsWith("/pulls/9")) return { state: "open", draft: false, head: { sha: head } };
    if (path.includes("/check-runs")) return { total_count: 1, check_runs: [{ name: "CI", status: "in_progress", conclusion: null }] };
    if (path.endsWith("/merge") && options.method === "PUT") merged = true;
    throw new Error("unexpected " + path);
  };
  await assert.rejects(
    sourcePullRequestAction({}, { repo: "relay", number: 9, action: "merge", expected_head_sha: head }, request),
    /not green/
  );
  assert.equal(merged, false);
});

test("merge binds provider mutation to the expected green SHA", async () => {
  const head = "3".repeat(40);
  let reads = 0, mergeBody;
  const request = async (_env, path, options = {}) => {
    if (path.endsWith("/pulls/10")) {
      reads += 1;
      return { state: reads === 1 ? "open" : "closed", draft: false, merged_at: reads === 1 ? null : "2026-09-30T00:00:00Z", head: { sha: head } };
    }
    if (path.includes("/check-runs")) return { total_count: 1, check_runs: [{ name: "CI", status: "completed", conclusion: "success" }] };
    if (path.includes("/statuses/")) return [];
    if (path.endsWith("/merge") && options.method === "PUT") {
      mergeBody = options.body;
      return { merged: true, sha: "4".repeat(40) };
    }
    throw new Error("unexpected " + path);
  };
  const got = await sourcePullRequestAction({}, { repo: "relay", number: 10, action: "merge", expected_head_sha: head, merge_method: "squash" }, request);
  assert.equal(mergeBody.sha, head);
  assert.equal(mergeBody.merge_method, "squash");
  assert.equal(got.merge.merged, true);
});
