import test from "node:test";
import assert from "node:assert/strict";
import { RELAY_CONTEXT_CARD_URI, relayContextCardDescriptor, relayContextCardResource, contextualizeRelayTool } from "./relay-chat-ui.js";

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
      assert.equal(await page.locator('#team').textContent(),'Julian with Roman');
      assert.deepEqual(errors,[]);
      if(bridge==='openai'){await page.getByRole('button',{name:'Open Relay'}).click();assert.equal(await page.evaluate(()=>window.modalRequested),true)}
      await page.close();
    }
  } finally {await browser.close()}
});
