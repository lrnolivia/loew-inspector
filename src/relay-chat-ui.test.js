import test from "node:test";
import assert from "node:assert/strict";
import { RELAY_CONTEXT_CARD_URI, RELAY_CONTEXT_CARD_TOOL, relayContextCardDescriptor, relayContextCardResource, relayContextCardTool, validateRelayContextCardArguments, contextualizeRelayTool } from "./relay-chat-ui.js";

test("Relay 1.8 publishes one compact MCP card resource", () => {
  const descriptor = relayContextCardDescriptor();
  const resource = relayContextCardResource();
  assert.equal(descriptor.uri, RELAY_CONTEXT_CARD_URI);
  assert.equal(resource.uri, RELAY_CONTEXT_CARD_URI);
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");
  assert.match(resource.text, /observed progress|runner/i);
  assert.match(resource.text, /open relay/i);
});

test("contextual tool metadata is additive and keeps schemas intact", () => {
  const original = {
    name: "relay_runner_progress",
    inputSchema: { type: "object", properties: { project: { type: "string" } } },
    _meta: { existing: true }
  };
  const decorated = contextualizeRelayTool(original);
  assert.deepEqual(decorated.inputSchema, original.inputSchema);
  assert.equal(decorated._meta.existing, true);
  assert.equal(decorated._meta.ui.resourceUri, RELAY_CONTEXT_CARD_URI);
  assert.equal(decorated._meta["openai/outputTemplate"], RELAY_CONTEXT_CARD_URI);
});

test("unrelated tools are not forced into contextual UI", () => {
  const tool = { name: "relay_control_status", inputSchema: { type: "object" } };
  assert.equal(contextualizeRelayTool(tool), tool);
});


test("context card opens the fresh control-center resource identity", () => {
  const resource = relayContextCardResource();
  assert.match(resource.text, /ui:\/\/relay\/control-center\/v2\.html/);
  assert.doesNotMatch(resource.text, /ui:\/\/relay\/control-center\/v1\.html/);
});

test('all conversational lifecycle tools select the compact resource, never the dashboard', () => {
  for(const name of ['relay_runner_coordinate','relay_runner_resume','relay_runner_updates','relay_runner_progress']) {
    const decorated=contextualizeRelayTool({name});
    assert.equal(decorated._meta.ui.resourceUri,RELAY_CONTEXT_CARD_URI);
    assert.doesNotMatch(decorated._meta.ui.resourceUri,/control-center/);
  }
});
test('cards show named teams blockers handoffs QA and subordinate exact evidence', async () => {
  const {contextCardModel}=await import('./relay-chat-ui.js');
  const m=contextCardModel({project:'relay',action:'handoff',claim:{id:'exact-task',owner:'next-owner',primary_staff:'julian',supporting_staff:['roman'],state:'blocked',goal:'Connect the release',next_action:'Fix the failing gate',waiting_reason:'Client still has old schema',branch:'relay/exact'},qa:{intended_result:'New card renders',checks:['Card is compact']}});
  assert.equal(m.team,'Julian with Roman');assert.equal(m.blocker,'Client still has old schema');assert.match(m.handoff,/next-owner/);assert.equal(m.evidence.owner,'next-owner');assert.equal(m.qa.checks[0],'Card is compact');
  assert.equal(contextCardModel({ok:false,error:{message:'Authorization required'}}).label,'Blocked');
  assert.equal(contextCardModel({check_runs:[]}).label,'No checks recorded');
});
test('card actually initializes and receives results without browser-global element collisions', async () => {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  try {
    for(const bridge of ['openai','mcp']) {
      const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      if(bridge==='openai') await page.addInitScript(()=>{window.openai={toolOutput:{project:'relay',claim:{primary_staff:'julian',supporting_staff:['roman'],goal:'Staff routing is ready',state:'active'}},callTool:async()=>({}),requestModal:async()=>{window.modalRequested=true}}});
      await page.goto('data:text/html,'+encodeURIComponent(relayContextCardResource().text));
      if(bridge==='mcp') await page.evaluate(()=>window.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{project:'relay',claim:{primary_staff:'julian',supporting_staff:['roman'],goal:'Staff routing is ready',state:'active'}}}},'*'));
      await assert.doesNotReject(page.locator('#title').filter({hasText:'Staff routing is ready'}).waitFor());
      assert.equal(await page.locator('#team').textContent(),'Julian');
      assert.equal(await page.locator('#staff').getAttribute('title'),'Julian with Roman');
      assert.deepEqual(errors,[]);
      if(bridge==='openai'){await page.getByRole('button',{name:'Open Relay'}).click();assert.equal(await page.evaluate(()=>window.modalRequested),true)}
      await page.close();
    }
  } finally {await browser.close()}
});

test('technical canonical notes remain exact evidence and never become the default human summary',async()=>{
  const {contextCardModel,contextualPresentation}=await import('./relay-chat-ui.js');
  const next='PR #72 merged a015761290cf86ada0c48e0537dbede1ce4e6cb2; deploy Worker version 14b11840-1c72-4402-a5da-e47d33e2ac4d then refresh ChatGPT';
  const data={project:'relay',latest:{assignment:{primary_staff:'julian',supporting_staff:['roman']},identities:{merge_commit_sha:'a'.repeat(40)},next_action:next,state:'working'}};
  const model=contextCardModel(data);assert.doesNotMatch(model.summary,/a015761|PR #72|Worker version/);assert.doesNotMatch(model.next_step,/a015761/);assert.equal(model.evidence.next_action,next);
  assert.equal(contextualPresentation(data).human.staff,'Julian with Roman');
});

test('successful merge receipts tolerate numeric check counts without hiding the write result', async () => {
  const {contextualPresentation}=await import('./relay-chat-ui.js');
  const receipt={ok:true,checks:{check_runs:3,status_contexts:0},merge:{merged:true},pull_request:{number:73,title:'Repair conversational summaries',merged:true,merge_commit_sha:'a'.repeat(40)}};
  const result=contextualPresentation(receipt);
  assert.equal(result.human.what_changed,'The source change is merged.');
  assert.equal(result.pull_request.merge_commit_sha,receipt.pull_request.merge_commit_sha);
  assert.equal(result.merge.merged,true);
});


test('context card is host-transparent and avoids the old framed panel chrome', () => {
  const resource = relayContextCardResource();
  assert.match(resource.text, /html,body\{background:transparent!important\}/);
  assert.match(resource.text, /\.card\{--accent:#b5471f;border:0;padding:8px 2px;background:transparent!important;box-shadow:none\}/);
  assert.match(resource.text, /grid-template-columns:minmax\(0,1fr\) minmax\(230px,38%\)/);
  assert.match(resource.text, /feature-mark/);
  assert.match(resource.text, /status-light/);
  assert.doesNotMatch(resource.text, /\.card\{border:1px solid/);
});

test('finished work does not repeat stale next actions or redundant single status rows', async () => {
  const {contextCardModel}=await import('./relay-chat-ui.js');
  const finished=contextCardModel({
    project:'relay',
    claim:{primary_staff:'julian',state:'completed',goal:'Ship the team foundation',next_action:'Old instruction that should no longer appear'}
  });
  assert.equal(finished.next_step,null);
  assert.deepEqual(finished.rows,[]);

  const duplicated=contextCardModel({
    project:'relay',
    claim:{primary_staff:'julian',state:'active',goal:'Repair the card',next_action:'Keep going'},
    human:{what_changed:'Keep going',next_step:'Keep going'}
  });
  assert.equal(duplicated.next_step,null);
});


test('feature identity drives the giant-notification header and pertinent metric', async () => {
  const {contextCardModel}=await import('./relay-chat-ui.js');
  const runner=contextCardModel({
    project:'relay',
    claim:{primary_team:'runner',primary_staff:'nico',state:'working',goal:'Build the card',progress_percent:50}
  });
  assert.equal(runner.feature,'runner');
  assert.equal(runner.metric,'50%');
  assert.equal(runner.metric_label,'completion');
  assert.equal(runner.signal,'working');

  const verification=contextCardModel({checks:{check_runs:[
    {name:'test',status:'completed',conclusion:'success'},
    {name:'admission',status:'completed',conclusion:'success'}
  ]}});
  assert.equal(verification.feature,'inspector');
  assert.equal(verification.metric,'2/2');
  assert.equal(verification.metric_label,'checks reported');
});
