import test from 'node:test';
import assert from 'node:assert/strict';
import {telemetryModel} from '../public/telemetry-model.js';
import {ctrlHref,workspaceLink} from '../../../packages/shared-ui/workspace-links.js';
test('telemetry counts source events in real half-hour buckets and never invents task percentages',()=>{
 const now=Date.parse('2026-10-03T18:00:00Z'),today=new Date(now-1000).toISOString();
 const event={type:'source-commit',at:today,head_sha:'a'};
 const snapshot={workload:{relay:[{state:'active'},{state:'held'},{state:'completed',completed_at:today},{state:'cancelled'}]},progress:{relay:{progress:[{state:'working',events:[event,event,{type:'runner-heartbeat',at:today},{type:'check-completed',at:'2026-10-03T18:01:00Z'}]}]}}};
 const model=telemetryModel(snapshot,now);assert.equal(model.percent,33);assert.equal(model.events,1);assert.equal(model.bins.at(-1),1);assert.equal(model.projects[0].count,1);assert.equal(telemetryModel(null,now).percent,null);
});
test('workspace links preserve exact project and review identity on ctrl',()=>{
 assert.equal(ctrlHref('/#/runner/relay/one?project=relay'),'https://ctrl.loew.fi/#/runner/relay/one?project=relay');
 assert.equal(ctrlHref('/inspector#review?evidence=vis_exact123'),'https://ctrl.loew.fi/inspector#review?evidence=vis_exact123');
 assert.equal(ctrlHref('/#/today?project=field'),'https://ctrl.loew.fi/#/now?project=field');
 assert.throws(()=>ctrlHref('https://elsewhere.example/runner'));assert.equal(workspaceLink('https://relay.loew.fi/mcp'),'https://relay.loew.fi/mcp');
});
