import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSnapshot } from "./evidence.js";

test("summarizes rendered snapshot without returning full page content", () => {
  const summary = summarizeSnapshot({
    content: "<html><head><title>field</title></head><body><main><button>Stroke</button></main></body></html>",
    accessibilityTree: { role: "WebArea", children: [{ role: "button", name: "Stroke" }] }
  });
  assert.equal(summary.title, "field");
  assert.ok(summary.dom.html_bytes > 0);
  assert.ok(summary.dom.element_tag_count >= 6);
  assert.equal(summary.accessibility.available, true);
  assert.ok(summary.accessibility.node_count >= 2);
});
