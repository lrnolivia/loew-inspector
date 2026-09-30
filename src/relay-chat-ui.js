export const RELAY_CONTEXT_CARD_URI = "ui://relay/context-card/v1.html";
const CONTROL_URI = "ui://relay/control-center/v1.html";

const CONTEXTUAL_TOOLS = new Set([
  "relay_runner_project",
  "relay_runner_assignments",
  "relay_runner_progress",
  "relay_runner_preflight",
  "relay_source_inventory",
  "relay_source_pull_request",
  "relay_source_checks",
  "relay_source_pull_request_action",
  "relay_cloud_worker",
  "relay_cloud_project",
  "relay_cloud_deploy_version",
  "relay_cloud_deploy_project_version",
  "relay_verify_browser_snapshot",
  "relay_verify_browser_screenshot",
  "relay_verify_evidence_plan",
  "relay_verify_browser_capture"
]);

export function relayContextCardDescriptor() {
  return {
    uri: RELAY_CONTEXT_CARD_URI,
    name: "relay-context-card",
    title: "Relay contextual status card",
    description: "Compact observed state for Runner, Source, Cloud and Inspector results.",
    mimeType: "text/html;profile=mcp-app"
  };
}

export function contextualizeRelayTool(tool) {
  if (!tool || !CONTEXTUAL_TOOLS.has(tool.name)) return tool;
  const meta = tool._meta || {};
  return {
    ...tool,
    _meta: {
      ...meta,
      ui: { ...(meta.ui || {}), resourceUri: RELAY_CONTEXT_CARD_URI, visibility: meta.ui?.visibility || ["model","app"] },
      "openai/outputTemplate": RELAY_CONTEXT_CARD_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": meta["openai/toolInvocation/invoking"] || "Checking Relay…",
      "openai/toolInvocation/invoked": meta["openai/toolInvocation/invoked"] || "Relay updated."
    }
  };
}

function cardHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--bg:#f3eee7;--panel:#fffaf4;--ink:#25211e;--muted:#716960;--line:#d9cec1;--good:#57734f;--wait:#8c6a37;--bad:#9b4d48;--shadow:0 8px 24px rgba(49,39,28,.10)}
@media(prefers-color-scheme:dark){:root{--bg:#171513;--panel:#24211e;--ink:#f5efe7;--muted:#b8afa5;--line:#4b443d;--good:#a8c49c;--wait:#d5b477;--bad:#dc928a;--shadow:0 10px 26px rgba(0,0,0,.28)}}
*{box-sizing:border-box}body{margin:0;padding:10px;background:transparent;color:var(--ink);font:13px/1.42 Inter,ui-sans-serif,system-ui,sans-serif}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:var(--shadow);overflow:hidden}
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}h1{margin:3px 0 0;font-size:17px;line-height:1.15}.state{flex:0 0 auto;border:1px solid color-mix(in srgb,currentColor 30%,transparent);border-radius:999px;padding:5px 8px;font-size:11px;font-weight:650}.state[data-tone=good]{color:var(--good)}.state[data-tone=wait],.state[data-tone=warn]{color:var(--wait)}.state[data-tone=bad]{color:var(--bad)}
.summary{margin:12px 0;color:var(--muted)}.rows{display:grid;gap:7px}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border-radius:12px;background:color-mix(in srgb,var(--bg) 72%,transparent)}.row strong{font-size:12px}.row span{min-width:0;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ids{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.id{max-width:100%;padding:4px 7px;border:1px solid var(--line);border-radius:8px;color:var(--muted);font:10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.actions{display:flex;gap:8px;margin-top:14px}.actions button{min-height:38px;border:1px solid var(--line);border-bottom-width:3px;border-radius:11px;padding:0 12px;background:color-mix(in srgb,var(--bg) 78%,var(--panel));color:var(--ink);font-weight:650;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}.actions button:hover{transform:translateY(-1px)}.actions button:active{transform:translateY(1px);border-bottom-width:1px}.actions button.primary{background:#5e5046;color:#fff;border-color:#5e5046}.actions button[hidden]{display:none}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body><main class="card" id="card"><div class="top"><div><div class="eyebrow" id="kind">relay</div><h1 id="title">current state</h1></div><span class="state" id="state">recorded</span></div><p class="summary" id="summary">Loading the exact Relay result…</p><div class="rows" id="rows"></div><div class="ids" id="ids"></div><div class="actions"><button id="refresh" hidden>refresh</button><button id="open" class="primary">open relay</button></div></main>
<script>
const CONTROL_URI=${JSON.stringify(CONTROL_URI)};
const meta={queued:["up next","quiet"],"reserved-but-idle":["reserved","quiet"],working:["working","good"],"waiting-on-external-system":["waiting on system","wait"],"waiting-for-human":["waiting for you","wait"],blocked:["blocked","bad"],"possibly-stale":["possibly stale","warn"],"officially-stale":["stale","bad"],failed:["failed","bad"],"rolled-back":["rolled back","warn"],complete:["finished","good"],completed:["finished","good"],active:["active","good"],held:["held","wait"]};
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const when=v=>{if(!v)return"";const d=Date.parse(v);if(!Number.isFinite(d))return"";const m=Math.round((d-Date.now())/60000);if(Math.abs(m)<60)return new Intl.RelativeTimeFormat(undefined,{numeric:"auto"}).format(m,"minute");const h=Math.round(m/60);if(Math.abs(h)<48)return new Intl.RelativeTimeFormat(undefined,{numeric:"auto"}).format(h,"hour");return new Date(d).toLocaleDateString()};
function identities(v){const i=v?.identities||v?.receipt?.identities||{};return [["branch",i.branch],["head",i.head_sha||i.pr_head_sha],["pr",i.pr?"#"+i.pr:null],["merge",i.merge_commit_sha],["version",i.cloud_version_id||v?.version_id],["deployment",i.cloud_deployment_id||v?.deployment?.id],["evidence",v?.evidence_id||v?.evidence?.evidence_id]].filter(x=>x[1])}
function tone(s){return(meta[s]||[s||"recorded","quiet"])}
function model(data){
 if(data?.observed_progress||data?.contract_version==="1.7.5"){
   const p=Array.isArray(data.progress)?data.progress:[];const first=p[0]||{};const st=tone(first.state||"queued");
   return {kind:"runner · observed progress",title:first.assignment||data.project||"project progress",state:st[0],tone:st[1],summary:first.external?.active?(first.external.detail||"external work is still running"):first.waiting_reason||first.latest_event?.type?.replaceAll("-"," ")||"No newer execution evidence.",rows:p.slice(0,3).map(x=>[x.assignment||"work",tone(x.state)[0]+(x.stage?" · "+String(x.stage).replaceAll("-"," "):"")+(when(x.last_meaningful_progress_at)?" · "+when(x.last_meaningful_progress_at):"")]),ids:identities(first),refresh:true};
 }
 if(Array.isArray(data?.claims)){const live=data.claims.filter(x=>x.state!=="completed");const first=live[0]||data.claims[0]||{};const st=tone(first.state);return {kind:"runner",title:first.goal||first.id||"assignments",state:st[0],tone:st[1],summary:first.next_action||"Runner coordination state.",rows:live.slice(0,3).map(x=>[x.id,tone(x.state)[0]]),ids:identities(first)}}
 if(data?.checks?.check_runs||data?.check_runs){const checks=data.checks?.check_runs||data.check_runs||[];const running=checks.find(x=>x.status!=="completed");const failed=checks.find(x=>x.conclusion&&!["success","neutral","skipped"].includes(x.conclusion));const s=failed?"failed":running?"waiting-on-external-system":"complete";return {kind:"source · checks",title:"github checks",state:tone(s)[0],tone:tone(s)[1],summary:failed?(failed.name+" failed"):running?(running.name+" is "+running.status):"Checks are complete.",rows:checks.slice(0,4).map(x=>[x.name,x.conclusion||x.status]),ids:[]}}
 if(data?.pull_request||data?.number&&data?.head){const pr=data.pull_request||data;const s=pr.merged?"complete":pr.draft?"reserved-but-idle":"working";return {kind:"source · pull request",title:"PR #"+pr.number+" · "+(pr.title||"source change"),state:tone(s)[0],tone:tone(s)[1],summary:pr.merged?"Merged to "+(pr.base?.ref||"main"):pr.draft?"Draft is still being prepared.":"Review is active.",rows:[],ids:[["head",pr.head?.sha],["merge",pr.merge_commit_sha]].filter(x=>x[1])}}
 if(data?.script&&(data?.deployments||data?.version_id)){const dep=data.deployment||data.deployments?.deployments?.[0]||data.deployments?.[0];return {kind:"cloud",title:data.script,state:"deployed",tone:"good",summary:dep?"Production deployment is recorded.":"Worker state is available.",rows:[],ids:[["version",data.version_id||dep?.versions?.[0]?.version_id],["deployment",dep?.id]].filter(x=>x[1])}}
 if(data?.evidence_id||data?.evidence){const e=data.evidence||data;return {kind:"inspector",title:e.step_label||e.context?.surface||"visual evidence",state:data.review?.overall?"reviewed":"ready for review",tone:data.review?.overall?"good":"wait",summary:e.context?.project?e.context.project+" · "+(e.context.environment||"capture"):"Exact visual evidence is available.",rows:[],ids:[["evidence",e.evidence_id||data.evidence_id]].filter(x=>x[1])}}
 const s=tone(data?.state||data?.claim?.state||"recorded");return {kind:data?.namespace||"relay",title:data?.project||data?.script||data?.claim?.id||"current state",state:s[0],tone:s[1],summary:data?.error?.message||data?.message||"Exact Relay result recorded.",rows:[],ids:identities(data?.claim||data)}
}
function render(data){const m=model(data||{});kind.textContent=m.kind;title.textContent=m.title;state.textContent=m.state;state.dataset.tone=m.tone;summary.textContent=m.summary;rows.innerHTML=(m.rows||[]).map(r=>'<div class="row"><strong>'+esc(r[0])+'</strong><span>'+esc(r[1])+'</span></div>').join("");ids.innerHTML=(m.ids||[]).map(r=>'<span class="id">'+esc(r[0])+' · '+esc(r[1])+'</span>').join("");refresh.hidden=!m.refresh}
async function refreshProgress(){const oa=window.openai;if(!oa?.callTool||!oa?.toolInput?.project)return;refresh.disabled=true;try{const out=await oa.callTool("relay_runner_progress",oa.toolInput);render(out?.structuredContent||out)}finally{refresh.disabled=false}}
refresh.addEventListener("click",refreshProgress);
open.addEventListener("click",async()=>{const oa=window.openai;if(oa?.requestModal){await oa.requestModal({template:CONTROL_URI});return}if(oa?.callTool)await oa.callTool("relay_ui_control_center",{})});
window.addEventListener("openai:set_globals",e=>{if(e.detail?.globals?.toolOutput)render(e.detail.globals.toolOutput)});
render(window.openai?.toolOutput||{});
</script></body></html>`;
}

export function relayContextCardResource() {
  return {
    uri: RELAY_CONTEXT_CARD_URI,
    mimeType: "text/html;profile=mcp-app",
    text: cardHtml(),
    _meta: {
      ui: { prefersBorder: false },
      "openai/widgetDescription": "Compact Relay status derived from the exact tool result. Open Relay for the full shared control surface.",
      "openai/ui": { availableDisplayModes: ["inline"] }
    }
  };
}
