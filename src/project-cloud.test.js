import test from "node:test";
import assert from "node:assert/strict";
import { projectCloudStatus, deployProjectCloudVersion } from "./project-cloud.js";

const registration = cloud => ({ id:"field", managed:true, repository:"lrnolivia/field", cloud });
const apiFor = value => async path => {
  assert.match(path, /projects\/field\.json\?ref=main$/);
  return { type:"file", encoding:"base64", truncated:false, content:Buffer.from(JSON.stringify(value)).toString("base64") };
};

test("project registration and runtime allowlist are both required", async () => {
  const env={RELAY_CLOUDFLARE_WRITE_SCRIPTS:"relay,field"};
  const status=await projectCloudStatus(env,"field",apiFor(registration({provider:"cloudflare",worker:"field",write:true})));
  assert.equal(status.writable,true);
  const denied=await projectCloudStatus({RELAY_CLOUDFLARE_WRITE_SCRIPTS:"relay"},"field",apiFor(registration({provider:"cloudflare",worker:"field",write:true})));
  assert.equal(denied.writable,false);
});
test("non-Worker project is not deployable merely because it is registered", async () => {
  const status=await projectCloudStatus({RELAY_CLOUDFLARE_WRITE_SCRIPTS:"relay"},"field",apiFor(registration(null)));
  assert.equal(status.worker,null); assert.equal(status.writable,false);
});
test("project deploy resolves Worker from registration and preserves runtime safety rail", async () => {
  let called=null;
  const result=await deployProjectCloudVersion(
    {RELAY_CLOUDFLARE_WRITE_SCRIPTS:"relay,field"},"field","11111111-2222-3333-4444-555555555555","ship",
    {github:apiFor(registration({provider:"cloudflare",worker:"field",write:true})),deploy:async(worker,version,message)=>{called={worker,version,message};return {ok:true,script:worker,version_id:version};}}
  );
  assert.deepEqual(called,{worker:"field",version:"11111111-2222-3333-4444-555555555555",message:"ship"});
  assert.equal(result.project,"field");
});
