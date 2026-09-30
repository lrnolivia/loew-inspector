import test from "node:test";
import assert from "node:assert/strict";
import { callRunnerCleanup, validateRunnerCleanupArguments } from "./runner-cleanup.js";
import { RUNNER_ENGINE_SHA } from "./runner-control.js";

const head = "a".repeat(40);
const merge = "b".repeat(40);
const other = "c".repeat(40);

function completed(extra = {}) {
  return {
    id: "done-task",
    owner: "worker",
    branch: "loew-inspector/done-task",
    paths: ["src/file.js"],
    resources: ["cleanup-test"],
    goal: "done",
    acceptance: "done",
    next_action: "done",
    base_sha: other,
    state: "completed",
    created_at: "2026-09-30T00:00:00.000Z",
    updated_at: "2026-09-30T01:00:00.000Z",
    lease_until: "2026-09-30T13:00:00.000Z",
    pr: 9,
    merged_head_sha: head,
    merge_commit_sha: merge,
    evidence: "https://github.com/lrnolivia/loew-inspector/pull/9",
    work_accounted: true,
    completed_at: "2026-09-30T01:00:00.000Z",
    ...extra
  };
}

function active(extra = {}) {
  return {
    id: "active-task",
    owner: "other",
    branch: "loew-inspector/active-task",
    paths: ["other/"],
    resources: [],
    goal: "active",
    acceptance: "active",
    next_action: "active",
    base_sha: other,
    state: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lease_until: new Date(Date.now() + 3600000).toISOString(),
    ...extra
  };
}

function fixture(options = {}) {
  const registration = {
    id: "loew-inspector",
    name: "loew inspector",
    repository: "lrnolivia/loew-inspector",
    managed: true,
    default_branch: "main",
    implementation: {
      branch_prefixes: ["loew-inspector/"],
      excluded_branches: ["main"]
    },
    coordination: {
      status: "enabled",
      record: "coordination/loew-inspector.json",
      max_active_branches: 4,
      lease_hours: 12
    }
  };
  const record = {
    schema: 1,
    project: "loew-inspector",
    claims: options.claims || [completed()],
    queue: [],
    legacy_branches: options.legacy || ["main"]
  };
  const branches = new Map([
    ["main", "d".repeat(40)],
    ["loew-inspector/done-task", options.branchHead || head]
  ]);
  for (const [name, sha] of Object.entries(options.extraBranches || {})) branches.set(name, sha);
  const deletes = [];
  const calls = [];
  const file = (value, sha = "e".repeat(40)) => ({
    type: "file",
    sha,
    encoding: "base64",
    content: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64")
  });
  const pr = options.pr || {
    number: 9,
    merged: true,
    base: { ref: "main", repo: { full_name: "lrnolivia/loew-inspector" } },
    head: {
      ref: "loew-inspector/done-task",
      sha: head,
      repo: { full_name: "lrnolivia/loew-inspector" }
    },
    merge_commit_sha: merge
  };

  const api = async (path, request = {}) => {
    calls.push({ path, request });
    if (path.includes("/contents/projects/loew-inspector.json")) return file(registration, "f".repeat(40));
    if (path.includes("/contents/coordination/loew-inspector.json")) {
      const value = typeof options.recordOnReread === "function" ? options.recordOnReread(record, calls) : record;
      return file(value, "1".repeat(40));
    }
    if (path.includes("/contents/src/coordination.mjs")) return file("", options.engineSha || RUNNER_ENGINE_SHA);
    if (path.includes("/repos/lrnolivia/loew-inspector/branches?")) {
      return [...branches.entries()].map(([name, sha]) => ({ name, commit: { sha } }));
    }
    if (path.endsWith("/repos/lrnolivia/loew-inspector/pulls/9")) return pr;
    if (path.includes("/git/ref/heads/loew-inspector/done-task")) {
      if (!branches.has("loew-inspector/done-task")) throw Object.assign(new Error("Not Found"), { status: 404 });
      return { object: { sha: branches.get("loew-inspector/done-task") } };
    }
    if (path.includes("/git/refs/heads/loew-inspector/done-task") && request.method === "DELETE") {
      deletes.push("loew-inspector/done-task");
      branches.delete("loew-inspector/done-task");
      return null;
    }
    throw new Error(`Unexpected path ${path}`);
  };
  return { api, deletes, calls, record, branches };
}

test("cleanup requires an explicit bounded mode", () => {
  assert.throws(() => validateRunnerCleanupArguments({ project: "loew-inspector" }), /mode/);
  assert.throws(() => validateRunnerCleanupArguments({ project: "loew-inspector", mode: "all" }), /dry_run or execute/);
  assert.throws(() => validateRunnerCleanupArguments({ project: "loew-inspector", mode: "execute", branch: "x" }), /Unsupported argument/);
});

test("dry-run reports exact eligible completion without deleting", async () => {
  const f = fixture();
  const result = await callRunnerCleanup({ project: "loew-inspector", mode: "dry_run" }, {}, f.api);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "dry_run");
  assert.equal(result.eligible.length, 1);
  assert.equal(result.eligible[0].merged_head_sha, head);
  assert.deepEqual(result.deleted, []);
  assert.deepEqual(f.deletes, []);
});

test("execute revalidates completion and exact head then verifies deletion", async () => {
  const f = fixture();
  const result = await callRunnerCleanup({ project: "loew-inspector", mode: "execute" }, {}, f.api);
  assert.deepEqual(result.deleted, ["loew-inspector/done-task"]);
  assert.equal(f.branches.has("loew-inspector/done-task"), false);
  assert.equal(f.deletes.length, 1);
  const coordinationReads = f.calls.filter(call => call.path.includes("/contents/coordination/loew-inspector.json"));
  assert.ok(coordinationReads.length >= 2);
  const prReads = f.calls.filter(call => call.path.endsWith("/pulls/9"));
  assert.ok(prReads.length >= 2);
});

test("post-merge commits are retained and never deleted", async () => {
  const f = fixture({ branchHead: other });
  const result = await callRunnerCleanup({ project: "loew-inspector", mode: "execute" }, {}, f.api);
  assert.deepEqual(result.deleted, []);
  assert.equal(result.retained.some(item => item.reason === "post_merge_commits"), true);
  assert.deepEqual(f.deletes, []);
});

test("active ownership on a completed branch retains the branch", async () => {
  const f = fixture({
    claims: [
      completed(),
      active({ branch: "loew-inspector/done-task", paths: ["other/"], resources: ["other"] })
    ]
  });
  const result = await callRunnerCleanup({ project: "loew-inspector", mode: "execute" }, {}, f.api);
  assert.deepEqual(result.deleted, []);
  assert.equal(result.retained.some(item => item.reason === "active_ownership"), true);
});

test("changed merged evidence fails closed before deletion", async () => {
  const f = fixture({
    pr: {
      number: 9,
      merged: true,
      base: { ref: "main", repo: { full_name: "lrnolivia/loew-inspector" } },
      head: { ref: "loew-inspector/done-task", sha: other, repo: { full_name: "lrnolivia/loew-inspector" } },
      merge_commit_sha: merge
    }
  });
  await assert.rejects(
    callRunnerCleanup({ project: "loew-inspector", mode: "execute" }, {}, f.api),
    /Merged evidence changed/
  );
  assert.deepEqual(f.deletes, []);
});

test("Runner engine drift fails closed", async () => {
  const f = fixture({ engineSha: other });
  await assert.rejects(
    callRunnerCleanup({ project: "loew-inspector", mode: "dry_run" }, {}, f.api),
    /Runner engine changed/
  );
  assert.deepEqual(f.deletes, []);
});
