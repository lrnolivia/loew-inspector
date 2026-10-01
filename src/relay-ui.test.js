import test from "node:test";
import assert from "node:assert/strict";
import { RELAY_CONTROL_CENTER_URI, relayControlCenterResource } from "./relay-ui.js";

test("Relay control center is an MCP Apps HTML resource", () => {
  const resource = relayControlCenterResource();
  assert.equal(RELAY_CONTROL_CENTER_URI, "ui://relay/control-center/v4.html");
  assert.notEqual(RELAY_CONTROL_CENTER_URI, "ui://relay/control-center/v2.html");
  assert.equal(resource.uri, RELAY_CONTROL_CENTER_URI);
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");
  assert.deepEqual(resource._meta["openai/ui"].availableDisplayModes, ["inline", "fullscreen"]);
  assert.match(resource.text, /ui\/initialize/);
  assert.match(resource.text, /ui\/notifications\/initialized/);
  assert.match(resource.text, /tools\/call/);
  assert.match(resource.text, /relay_ui_request/);
  assert.match(resource.text, /<div id="root"><\/div>/);
  assert.match(resource.text, /relay 2\.0/);
  assert.match(resource.text, /\/inspector#review/);
  assert.match(resource.text, /Inter/);
  assert.match(resource.text, /Momo Trust Display/);
  assert.doesNotMatch(resource.text, /data-page="projects"/);
});
