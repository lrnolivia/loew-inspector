import test from "node:test";
import assert from "node:assert/strict";
import { RELAY_CONTEXT_CARD_URI, relayContextCardDescriptor, relayContextCardResource, contextualizeRelayTool } from "./relay-chat-ui.js";

test("Relay 1.8 publishes one compact MCP card resource", () => {
  const descriptor = relayContextCardDescriptor();
  const resource = relayContextCardResource();
  assert.equal(descriptor.uri, RELAY_CONTEXT_CARD_URI);
  assert.equal(resource.uri, RELAY_CONTEXT_CARD_URI);
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");
  assert.match(resource.text, /observed progress|runner/i);
  assert.match(resource.text, /open relay/i);
});

test("contextual tool metadata is additive and keeps schemas intact", () => {
  const original = {
    name: "relay_runner_progress",
    inputSchema: { type: "object", properties: { project: { type: "string" } } },
    _meta: { existing: true }
  };
  const decorated = contextualizeRelayTool(original);
  assert.deepEqual(decorated.inputSchema, original.inputSchema);
  assert.equal(decorated._meta.existing, true);
  assert.equal(decorated._meta.ui.resourceUri, RELAY_CONTEXT_CARD_URI);
  assert.equal(decorated._meta["openai/outputTemplate"], RELAY_CONTEXT_CARD_URI);
});

test("unrelated tools are not forced into contextual UI", () => {
  const tool = { name: "relay_control_status", inputSchema: { type: "object" } };
  assert.equal(contextualizeRelayTool(tool), tool);
});


test("context card opens the fresh control-center resource identity", () => {
  const resource = relayContextCardResource();
  assert.match(resource.text, /ui:\/\/relay\/control-center\/v2\.html/);
  assert.doesNotMatch(resource.text, /ui:\/\/relay\/control-center\/v1\.html/);
});
