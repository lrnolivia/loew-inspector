import test from "node:test";
import assert from "node:assert/strict";
import { RELAY_CONTEXT_CARD_URI, RELAY_CONTEXT_CARD_TOOL, relayContextCardDescriptor, relayContextCardResource, relayContextCardTool, validateRelayContextCardArguments, contextualizeRelayTool, isContextualRelayTool } from "./relay-chat-ui.js";

test("Relay publishes one versioned compact MCP card resource", () => {
  const descriptor = relayContextCardDescriptor();
  const resource = relayContextCardResource();
  assert.equal(RELAY_CONTEXT_CARD_URI, "ui://relay/context-card/v8.html");
  assert.equal(descriptor.uri, RELAY_CONTEXT_CARD_URI);
  assert.equal(resource.uri, RELAY_CONTEXT_CARD_URI);
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");
  assert.match(resource.text, /observed progress|runner/i);
  assert.match(resource.text, /open relay/i);
  assert.match(resource.text, /qa-media/);
  assert.match(resource.text, /ui\/initialize/);
  assert.match(resource.text, /ui\/notifications\/initialized/);
  assert.doesNotMatch(resource.text, /notifyIntrinsicHeight/);
  assert.match(resource.text, /openai:set_globals/);
  assert.match(resource.text, /toolOutput/);
  assert.match(resource.text, /relay_runner_progress/);
  assert.deepEqual(resource._meta.ui.csp.resourceDomains,['https://relay.loew.fi']);
});

test("data tools keep their schemas and do not claim the render template", () => {
  const original = {
    name: "relay_runner_progress",
    inputSchema: { type: "object", properties: { project: { type: "string" } } },
    _meta: { existing: true }
  };
  const decorated = contextualizeRelayTool(original);
  assert.equal(decorated, original);
  assert.deepEqual(decorated.inputSchema, original.inputSchema);
  assert.equal(decorated._meta.existing, true);
  assert.equal(decorated._meta.ui, undefined);
  assert.equal(isContextualRelayTool(original.name), true);
});

test("dedicated launcher owns the MCP Apps mount contract", () => {
  const tool=relayContextCardTool();
  assert.equal(tool.name,RELAY_CONTEXT_CARD_TOOL);
  assert.equal(tool._meta.ui.resourceUri,RELAY_CONTEXT_CARD_URI);
  assert.equal(tool._meta["openai/outputTemplate"],RELAY_CONTEXT_CARD_URI);
  assert.equal(tool.annotations.readOnlyHint,true);
  assert.equal(tool.inputSchema.additionalProperties,false);
  assert.deepEqual(validateRelayContextCardArguments({project:"relay",assignment:"relay-1.9.9-chatgpt-native-experience-20261001"}),{project:"relay",assignment:"relay-1.9.9-chatgpt-native-experience-20261001"});
  assert.deepEqual(validateRelayContextCardArguments({project:"relay",evidence_id:"vis_abcdefgh",show_qa:true}),{project:"relay",evidence_id:"vis_abcdefgh",show_qa:true});
  assert.throws(()=>validateRelayContextCardArguments({project:"relay",evidence_id:"bad"}),/Invalid card evidence id/);
  assert.throws(()=>validateRelayContextCardArguments({project:"relay",surprise:true}),/Unsupported card argument/);
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

test('only the dedicated render tool owns the compact resource', () => {
  for(const name of ['relay_runner_coordinate','relay_runner_resume','relay_runner_updates','relay_runner_progress']) {
    const tool={name};
    assert.equal(contextualizeRelayTool(tool),tool);
    assert.equal(isContextualRelayTool(name),true);
  }
  const renderer=contextualizeRelayTool(relayContextCardTool());
  assert.equal(renderer._meta.ui.resourceUri,RELAY_CONTEXT_CARD_URI);
  assert.doesNotMatch(renderer._meta.ui.resourceUri,/control-center/);
});
test('cards show named teams blockers handoffs QA and subordinate exact evidence', async () => {
  const {contextCardModel}=await import('./relay-chat-ui.js');
  const m=contextCardModel({project:'relay',action:'handoff',claim:{id:'exact-task',owner:'next-owner',primary_staff:'julian',supporting_staff:['roman'],state:'blocked',goal:'Connect the release',next_action:'Fix the failing gate',waiting_reason:'Client still has old schema',branch:'relay/exact'},qa:{intended_result:'New card renders',checks:['Card is compact']}});
  assert.equal(m.team,'Julian with Roman');assert.equal(m.blocker,'Client still has old schema');assert.match(m.handoff,/next-owner/);assert.equal(m.evidence.owner,'next-owner');assert.equal(m.qa.checks[0],'Card is compact');
  assert.equal(contextCardModel({ok:false,error:{message:'Authorization required'}}).label,'Blocked');
  assert.equal(contextCardModel({check_runs:[]}).label,'No checks recorded');
});
test('card initializes the standard MCP Apps bridge even when window.openai exists', async () => {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.addInitScript(()=>{window.openai={requestModal:async()=>{}}});
    const widgetUrl='data:text/html,'+encodeURIComponent(relayContextCardResource().text);
    await page.setContent(`<!doctype html><script>
      window.seenInitialize=false;
      window.addEventListener('message',event=>{
        const frame=document.getElementById('widget');
        const message=event.data;
        if(event.source!==frame?.contentWindow||message?.jsonrpc!=='2.0')return;
        if(message.method==='ui/initialize'){
          window.seenInitialize=true;
          frame.contentWindow.postMessage({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2026-01-26'}},'*');
        } else if(message.method==='ui/notifications/initialized'){
          frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{project:'relay'}},'*');
          frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{project:'relay',claim:{primary_staff:'julian',supporting_staff:['roman'],goal:'Staff routing is ready',state:'active'}}}},'*');
        }
      });
    <\/script><iframe id="widget" src="${widgetUrl}"></iframe>`);
    const frame=page.frameLocator('#widget');
    await frame.locator('#title').filter({hasText:'Staff routing is ready'}).waitFor();
    assert.equal(await page.evaluate(()=>window.seenInitialize),true);
    assert.equal(await frame.locator('#team').textContent(),'Julian');
    assert.equal(await frame.locator('#staff').getAttribute('title'),'Julian with Roman');
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


test('card can reuse the latest stored Inspector QA screenshot through standard tools/call', async () => {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const widgetUrl='data:text/html,'+encodeURIComponent(relayContextCardResource().text);
    await page.setContent(`<!doctype html><script>
      window.addEventListener('message',event=>{
        const frame=document.getElementById('widget');
        const message=event.data;
        if(event.source!==frame?.contentWindow||message?.jsonrpc!=='2.0')return;
        if(message.method==='ui/initialize'){
          frame.contentWindow.postMessage({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2026-01-26'}},'*');
        } else if(message.method==='ui/notifications/initialized'){
          frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{project:'relay',show_qa:true}},'*');
          frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{project:'relay',claim:{primary_staff:'julian',goal:'Visual proof is ready',state:'active'}}}},'*');
        } else if(message.method==='tools/call'){
          const path=message.params?.arguments?.path;
          let structuredContent={status:404};
          if(path==='/api/visual?project=relay') structuredContent={status:200,body:{evidence:[{evidence_id:'vis_abcdefgh',step_label:'Relay card preview'}]}};
          if(path==='/api/visual/vis_abcdefgh/image') structuredContent={status:200,content_type:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlQZQAAAABJRU5ErkJggg=='};
          frame.contentWindow.postMessage({jsonrpc:'2.0',id:message.id,result:{structuredContent,content:[{type:'text',text:JSON.stringify(structuredContent)}]}},'*');
        }
      });
    <\/script><iframe id="widget" src="${widgetUrl}"></iframe>`);
    const frame=page.frameLocator('#widget');
    await frame.locator('#qa-media').waitFor({state:'visible'});
    assert.equal(await frame.locator('#qa-media-id').textContent(),'vis_abcdefgh');
    assert.equal(await frame.locator('#qa-media-caption').textContent(),'Relay card preview');
    assert.match(await frame.locator('#qa-media-image').getAttribute('src'),/^data:image\/png;base64,/);
  } finally { await browser.close(); }
});
