import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const currentBible = fs.readFileSync(new URL("../LOEW_CHAT_BIBLE_CURRENT.md", import.meta.url), "utf8");
const bible = fs.readFileSync(new URL("../LOEW_CHAT_BIBLE.md", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../contracts/manifest.json", import.meta.url), "utf8"));
const nightShift = fs.readFileSync(new URL("../night-shift/CONTRACT.md", import.meta.url), "utf8");
const blockers = fs.readFileSync(new URL("../night-shift/BLOCKER_POLICY.md", import.meta.url), "utf8");

test("universal manifest points to the current Bible", () => {
  assert.equal(manifest.contract, "LOEW_CHAT_BIBLE_CURRENT.md");
  assert.equal(manifest.version, "2026-09-29.2");
  assert.equal(manifest.watchdog.identical_failure_attempts, 2);
  assert.equal(manifest.qa_authority.runner_first, true);
  assert.equal(manifest.qa_authority.project_qa_is_overlay, true);
  assert.equal(manifest.target_resolution.runner_project_registry_first, true);
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

test("Bible keeps QA loop escape and danger-zone law", () => {
  const lower = bible.toLowerCase();
  for (const phrase of [
    "qa self-correction",
    "qa loop watchdog",
    "when to abandon automated qa",
    "danger zone preview",
    "human qa required",
    "browser run",
    "github chromium",
    "automatic promotion",
    "runner-first qa authority"
  ]) {
    assert.ok(lower.includes(phrase), "missing QA invariant: " + phrase);
  }
  assert.ok(bible.includes("DANGER ZONE — HUMAN QA REQUIRED"));
  assert.ok(currentBible.toLowerCase().includes("runner-first qa is law"));
  assert.ok(currentBible.includes("lrnolivia/field"));
  assert.ok(currentBible.includes("/qa/work/<projectId>"));
  assert.ok(currentBible.includes("/builder/noauth"));
});

test("Night Shift policies inherit the universal law", () => {
  assert.ok(nightShift.includes("LOEW_CHAT_BIBLE.md"));
  assert.ok(blockers.toLowerCase().includes("failure fingerprint"));
  assert.ok(blockers.toLowerCase().includes("same fingerprint"));
});
