import test from "node:test";
import assert from "node:assert/strict";
import { cloudStatus, cloudWriteScripts } from "./cloud.js";

test("relay.CLOUD status is truthful and writes are bounded", () => {
  const empty = cloudStatus({});
  assert.equal(empty.configured, false);
  assert.deepEqual(empty.required_bindings, ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
  assert.deepEqual(cloudWriteScripts({}), ["loew-inspector-gateway"]);
  const ready = cloudStatus({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "b", RELAY_CLOUDFLARE_WRITE_SCRIPTS: "one,two" });
  assert.equal(ready.configured, true);
  assert.deepEqual(ready.write_scripts, ["one", "two"]);
});
