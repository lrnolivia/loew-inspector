import test from "node:test";
import assert from "node:assert/strict";
import { RELAY_EXTENSION_VERSION, augmentToolList, augmentResourceList, augmentSkillList, validateLifecycleArguments } from "./relay-entry.js";
import { QA_SKILL_URI } from "./qa-skill.js";
import { LOEW_NAMING_SKILL_URI } from "./loew-naming-skill.js";
import { RELAY_CONTEXT_CARD_URI } from "./relay-chat-ui.js";

test("Relay extension publishes source inventory and exact-head PR action", () => {
  const tools = augmentToolList([{
    name: "relay_source_create_branch",
    description: "old",
    inputSchema: { type: "object" },
    annotations: {},
    securitySchemes: [{ type: "oauth2", scopes: [] }],
    _meta: { existing: true }
  }, {
    name: "relay_source_update_file",
    description: "legacy token text",
    inputSchema: { type: "object" },
    annotations: {},
    securitySchemes: [{ type: "oauth2", scopes: [] }]
  }]);
  const names = tools.map(tool => tool.name);
  assert.ok(names.includes("relay_source_inventory"));
  assert.ok(names.includes("relay_source_pull_request_action"));
  const branch = tools.find(tool => tool.name === "relay_source_create_branch");
  assert.match(branch.description, /exact 40-character commit SHA/);
  assert.equal(branch._meta.existing, true);
  assert.ok(names.includes("relay_runner_cleanup"));
  assert.ok(names.includes("relay_cloud_upload_version"));
  assert.equal(tools.find(tool => tool.name === "relay_source_update_file").description.includes("GitHub App preferred"), true);
  assert.equal(RELAY_EXTENSION_VERSION, "1.9.1");
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
    repo: "relay",
    number: 32,
    action: "merge",
    expected_head_sha: "b".repeat(40),
    merge_method: "squash"
  };
  assert.equal(validateLifecycleArguments("relay_source_pull_request_action", args), args);
});


test("Relay extension appends native QA and loew naming skills once", () => {
  const resources = augmentResourceList([{ uri: "skill://relay/existing/SKILL.md" }]);
  const skills = augmentSkillList([{ uri: "skill://relay/existing/SKILL.md" }]);
  assert.equal(resources.filter(item => item.uri === RELAY_CONTEXT_CARD_URI).length, 1);
  for (const uri of [QA_SKILL_URI, LOEW_NAMING_SKILL_URI]) {
    assert.equal(resources.filter(item => item.uri === uri).length, 1);
    assert.equal(skills.filter(item => item.uri === uri).length, 1);
  }

  const resourcesAgain = augmentResourceList(resources);
  const skillsAgain = augmentSkillList(skills);
  assert.equal(resourcesAgain.filter(item => item.uri === RELAY_CONTEXT_CARD_URI).length, 1);
  for (const uri of [QA_SKILL_URI, LOEW_NAMING_SKILL_URI]) {
    assert.equal(resourcesAgain.filter(item => item.uri === uri).length, 1);
    assert.equal(skillsAgain.filter(item => item.uri === uri).length, 1);
  }
});
