import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const bible = fs.readFileSync(new URL("../LOEW_CHAT_BIBLE.md", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../contracts/manifest.json", import.meta.url), "utf8"));
const nightShift = fs.readFileSync(new URL("../night-shift/CONTRACT.md", import.meta.url), "utf8");
const blockers = fs.readFileSync(new URL("../night-shift/BLOCKER_POLICY.md", import.meta.url), "utf8");

test("universal manifest points to the current Bible", () => {
  assert.equal(manifest.contract, "LOEW_CHAT_BIBLE.md");
  assert.equal(manifest.version, "2026-09-27.1");
  assert.equal(manifest.watchdog.identical_failure_attempts, 2);
});

test("Bible keeps core recovery invariants", () => {
  const lower = bible.toLowerCase();
  for (const phrase of [
    "mandatory bootstrap for every invocation",
    "failure fingerprint",
    "bounded retry budget",
    "loop watchdog",
    "pre-mutation sanity gate",
    "post-mutation sanity gate",
    "blocked assignment as a scheduling event",
    "third identical retry"
  ]) {
    assert.ok(lower.includes(phrase), "missing invariant: " + phrase);
  }
});

test("Night Shift policies inherit the universal law", () => {
  assert.ok(nightShift.includes("LOEW_CHAT_BIBLE.md"));
  assert.ok(blockers.toLowerCase().includes("failure fingerprint"));
  assert.ok(blockers.toLowerCase().includes("same fingerprint"));
});
