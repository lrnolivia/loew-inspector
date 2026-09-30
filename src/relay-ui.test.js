import test from "node:test";
import assert from "node:assert/strict";
import { RELAY_CONTROL_CENTER_URI, relayControlCenterResource } from "./relay-ui.js";

test("Relay control center is an MCP Apps HTML resource", () => {
  const resource = relayControlCenterResource();
  assert.equal(RELAY_CONTROL_CENTER_URI, "ui://relay/control-center/v1.html");
  assert.equal(resource.uri, RELAY_CONTROL_CENTER_URI);
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");
  assert.deepEqual(resource._meta["openai/ui"].availableDisplayModes, ["inline", "fullscreen"]);
  assert.match(resource.text, /ui\/initialize/);
  assert.match(resource.text, /ui\/notifications\/initialized/);
  assert.match(resource.text, /tools\/call/);
  assert.match(resource.text, /relay_runner_action/);
  assert.match(resource.text, /relay\.CONTROL/);
  assert.match(resource.text, /relay\.RUNNER/);
  assert.match(resource.text, /relay\.SOURCE/);
  assert.match(resource.text, /relay\.CLOUD/);
  assert.match(resource.text, /relay\.VERIFY/);
});
