import test from "node:test";
import assert from "node:assert/strict";
import { sourceAuthStatus } from "./source.js";

test("relay.SOURCE status prefers GitHub App auth", () => {
  assert.equal(sourceAuthStatus({}).auth_mode, "public_read");
  assert.equal(sourceAuthStatus({ RELAY_GITHUB_TOKEN: "x" }).auth_mode, "legacy_token");
  const app = sourceAuthStatus({ RELAY_GITHUB_APP_ID: "1", RELAY_GITHUB_APP_PRIVATE_KEY: "pem" });
  assert.equal(app.auth_mode, "github_app");
  assert.equal(app.write_enabled, true);
  assert.equal(app.legacy_token_configured, false);
});
