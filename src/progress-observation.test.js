import test from "node:test";
import assert from "node:assert/strict";
import { deriveObservedProgress } from "./progress-observation.js";
const now = new Date("2026-09-30T22:00:00Z");
const claim = { id:"x", state:"active", branch:"relay/x", base_sha:"a".repeat(40), created_at:"2026-09-30T21:59:00Z", updated_at:"2026-09-30T21:59:00Z", next_action:"implement" };
test("reserved claim is not confused with observed work", () => {
  const p=deriveObservedProgress({project:"relay",claim,branch:{name:"relay/x",commit:{sha:claim.base_sha}},checks:[],now});
  assert.equal(p.state,"reserved-but-idle");
});
test("running GitHub check is external wait, not frozen worker", () => {
  const p=deriveObservedProgress({project:"relay",claim,branch:{name:"relay/x",commit:{sha:"b".repeat(40)}},commit:{commit:{committer:{date:"2026-09-30T21:58:00Z"}}},checks:[{name:"test",status:"in_progress",started_at:"2026-09-30T21:59:30Z"}],now});
  assert.equal(p.state,"waiting-on-external-system"); assert.equal(p.external.system,"github");
});
test("stale work becomes officially stale without external activity", () => {
  const old={...claim,created_at:"2026-09-30T21:30:00Z",updated_at:"2026-09-30T21:30:00Z"};
  const p=deriveObservedProgress({project:"relay",claim:old,branch:{name:"relay/x",commit:{sha:"b".repeat(40)}},commit:{commit:{committer:{date:"2026-09-30T21:30:00Z"}}},checks:[],now});
  assert.equal(p.state,"officially-stale");
});

test("cloud identity ignores unrelated newer Relay deployments", () => {
  const merge="c".repeat(40), prHead="b".repeat(40);
  const cloud={
    script:"relay",
    versions:{items:[
      {id:"newer",annotations:{"workers/commit_sha":"d".repeat(40)}},
      {id:"mine",annotations:{"workers/commit_sha":merge}}
    ]},
    deployments:{deployments:[
      {id:"deploy-newer",created_on:"2026-09-30T22:01:00Z",versions:[{version_id:"newer"}]},
      {id:"deploy-mine",created_on:"2026-09-30T21:59:30Z",versions:[{version_id:"mine"}]}
    ]}
  };
  const p=deriveObservedProgress({
    project:"relay",claim,
    pullRequest:{number:60,head:{sha:prHead},merge_commit_sha:merge,created_at:"2026-09-30T21:58:30Z",updated_at:"2026-09-30T21:59:20Z"},
    checks:[],cloud,now
  });
  assert.equal(p.identities.head_sha,prHead);
  assert.equal(p.identities.merge_commit_sha,merge);
  assert.equal(p.identities.cloud_version_id,"mine");
  assert.equal(p.identities.cloud_deployment_id,"deploy-mine");
  assert.equal(p.events.some(event=>event.deployment_id==="deploy-newer"),false);
});
