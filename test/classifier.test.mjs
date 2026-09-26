import test from "node:test";
import assert from "node:assert/strict";
import { classifyInstallLog } from "../scripts/classify-install.mjs";

test("classifies lockfile mismatch", () => {
  assert.equal(classifyInstallLog("npm ERR! code EUSAGE\nnpm ci can only install"), "lockfile");
});

test("classifies peer dependency conflict", () => {
  assert.equal(classifyInstallLog("npm ERR! code ERESOLVE unable to resolve dependency tree"), "peer-dependency");
});

test("classifies network trouble", () => {
  assert.equal(classifyInstallLog("npm ERR! code EAI_AGAIN registry.npmjs.org"), "registry-network");
});

test("leaves unknown failures unclassified", () => {
  assert.equal(classifyInstallLog("something strange happened"), "unclassified");
});
