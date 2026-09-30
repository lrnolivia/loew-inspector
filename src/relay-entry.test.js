import test from "node:test";
import assert from "node:assert/strict";
import { RELAY_EXTENSION_VERSION, augmentToolList, validateLifecycleArguments } from "./relay-entry.js";

test("Relay extension publishes source inventory and exact-head PR action", () => {
  const tools = augmentToolList([{
    name: "relay_source_create_branch",
    description: "old",
    inputSchema: { type: "object" },
    annotations: {},
    securitySchemes: [{ type: "oauth2", scopes: [] }],
    _meta: { existing: true }
  }]);
  const names = tools.map(tool => tool.name);
  assert.ok(names.includes("relay_source_inventory"));
  assert.ok(names.includes("relay_source_pull_request_action"));
  const branch = tools.find(tool => tool.name === "relay_source_create_branch");
  assert.match(branch.description, /exact 40-character commit SHA/);
  assert.equal(branch._meta.existing, true);
  assert.ok(names.includes("relay_runner_cleanup"));
  assert.ok(names.includes("relay_cloud_upload_version"));
  assert.equal(RELAY_EXTENSION_VERSION, "1.5.0");
});

test("server validation rejects unsupported and cross-action PR fields", () => {
  assert.throws(
    () => validateLifecycleArguments("relay_source_inventory", { repo: "x", surprise: true }),
    /Unsupported argument/
  );
  assert.throws(
    () => validateLifecycleArguments("relay_source_pull_request_action", {
      repo: "x", number: 1, action: "ready", expected_head_sha: "a".repeat(40), merge_method: "squash"
    }),
    /does not accept/
  );
  assert.throws(
    () => validateLifecycleArguments("relay_source_pull_request_action", {
      repo: "x", number: 1, action: "update", expected_head_sha: "a".repeat(40)
    }),
    /requires title, body, or base/
  );
});

test("server validation accepts exact-head merge input", () => {
  const args = {
    repo: "loew-inspector",
    number: 32,
    action: "merge",
    expected_head_sha: "b".repeat(40),
    merge_method: "squash"
  };
  assert.equal(validateLifecycleArguments("relay_source_pull_request_action", args), args);
});
