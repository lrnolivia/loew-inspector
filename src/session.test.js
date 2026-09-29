import test from "node:test";
import assert from "node:assert/strict";
import { validateInteractionShape, validateLoewNavigationForTest } from "./session.js";

test("accepts bounded semantic interactions", () => {
  assert.equal(validateInteractionShape({ action: "click", locator: { type: "text", value: "Stroke" } }), true);
  assert.equal(validateInteractionShape({ action: "press", locator: { type: "role", value: "textbox", name: "Width" }, key: "Enter" }), true);
  assert.equal(validateInteractionShape({ action: "scroll", deltaY: 800 }), true);
});

test("rejects arbitrary or unbounded interaction shapes", () => {
  assert.throws(() => validateInteractionShape({ action: "evaluate" }), /Unsupported/);
  assert.throws(() => validateInteractionShape({ action: "click" }), /requires a locator/);
  assert.throws(() => validateInteractionShape({ action: "press", locator: { type: "text", value: "x" }, key: "F12" }), /Unsupported key/);
  assert.throws(() => validateInteractionShape({ action: "scroll", deltaY: 9000 }), /out of range/);
});


test("keeps top-level browser navigation inside loew.fi", () => {
  assert.equal(validateLoewNavigationForTest("https://field.loew.fi/builder/noauth"), true);
  assert.equal(validateLoewNavigationForTest("https://loew.fi/"), true);
  assert.equal(validateLoewNavigationForTest("https://example.com/"), false);
  assert.equal(validateLoewNavigationForTest("http://field.loew.fi/"), false);
});
