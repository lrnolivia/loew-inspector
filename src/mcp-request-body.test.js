import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import worker from "./relay-entry.js";

test("complete source payloads over 16 KB reach guarded tool validation in both entry paths", async t => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "source-body-limit";
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = encode({ alg: "RS256", kid }) + "." + encode({
    iss: "https://loewfi.cloudflareaccess.com",
    aud: ["7d90e5b24c6c74b4bd0fb36699e0a65a3aa25057763986ca1b8ce1a52d528819"],
    exp: Math.floor(Date.now() / 1000) + 600
  });
  const token = payload + "." + sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url");
  let providerCalls = 0;
  t.mock.method(globalThis, "fetch", async url => {
    if (String(url) === "https://loewfi.cloudflareaccess.com/cdn-cgi/access/certs") {
      return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid }] });
    }
    providerCalls++;
    throw new Error("No external writes allowed in this regression");
  });
  for (const name of ["relay_source_commit_files", "relay_source_edit_text"]) {
    const response = await worker.fetch(new Request("https://relay.loew.fi/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-access-jwt-assertion": token },
      body: JSON.stringify({ jsonrpc: "2.0", id: name, method: "tools/call",
        params: { name, arguments: { content: "x".repeat(40000) } } })
    }), {});
    assert.equal(response.status, 200, name + " must reach the existing argument validator");
    const body = await response.json();
    assert.equal(body.result?.isError, true, "invalid write arguments remain refused");
  }
  assert.equal(providerCalls, 0);
});
