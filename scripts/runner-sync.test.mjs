import test from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeProject } from './runner-sync.mjs';
test('sync is model-free, non-owning, exact-artifact aware and recommendations deduplicate',async()=>{
  const head='a'.repeat(40),merge='b'.repeat(40),registration={repository:'lrnolivia/fixture',default_branch:'main'};
  const record={claims:[{id:'completed',owner:'owner',branch:'fixture/task',state:'completed',pr:1,work_accounted:true,merged_head_sha:head,merge_commit_sha:merge},{id:'held',owner:'other',branch:'fixture/held',state:'held'}],queue:[{id:'completed',owner:'owner',state:'claimed'}]};
  const original=structuredClone(record);
  const api=async path=>{
    if(path.includes('/check-runs'))return {total_count:1,check_runs:[{name:'quality',head_sha:head,status:'completed',conclusion:'success'}]};
    if(path.includes('/deployments'))return [];
    if(path.includes('/pulls?'))return [];
    return {number:1,merged:true,state:'closed',merge_commit_sha:merge,head:{sha:head,ref:'fixture/task',repo:{full_name:registration.repository}},base:{ref:'main',repo:{full_name:registration.repository}}};
  };
  const a=await synchronizeProject('fixture',registration,record,api),b=await synchronizeProject('fixture',registration,record,api);
  assert.deepEqual(record,original);assert.equal(a.model_calls,0);assert.equal(a.coordination_writes,0);
  assert.equal(a.observations[1].record_state,'held');assert.equal(a.observations[1].execution,'unobserved');
  assert.equal(a.recommendations[0].action,'reconcile-completed-queue');assert.equal(a.recommendations[0].id,b.recommendations[0].id);
  record.queue[0].owner='other';
  assert.equal((await synchronizeProject('fixture',registration,record,api)).recommendations[0].action,'inspect-merged-ownership');
  const unavailable=await synchronizeProject('fixture',registration,record,()=>{throw Error('outage');});
  assert.equal(unavailable.recommendations.length,0);assert.equal(unavailable.observations[0].source,'unavailable');
});
