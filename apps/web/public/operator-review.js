import {bindWorkViewer} from "../../../packages/shared-ui/work-viewer.js";
import {evidenceItem} from "../../../packages/shared-ui/work-view-model.js";
import { showLoading } from "./loading.js";
import { brand, featureAccent } from "./brand.js";
import { iconSlot, hydrateProjectIcons } from "./project-icons.js";

import { openQa } from "./qa.js";
import { esc, projectName } from "./operator-projects.js";

let reviewItems = [];
let reviewMode = "needs";
let reviewUi = null;
let cardPreviewMode = "relay";

const cardPreviews = Object.freeze({
  relay: {
    feature: "relay",
    kicker: "relay",
    title: "the release is moving",
    summary: "runner is shipping the last 1.9.9 pieces while inspector keeps the visual work honest.",
    label: "working",
    tone: "info",
    signal: "working",
    metric: "1.9.9",
    metricLabel: "current release",
    staff: "ellis",
    team: "runner",
    progress: null,
    rows: [["source", "v71"], ["checks", "green"]],
    next: "verify the card in a real ChatGPT consumer"
  },
  runner: {
    feature: "runner",
    kicker: "runner reporting",
    title: "runner is moving the release forward",
    summary: "the branch is admitted, checks are green, and the current deployment is being verified.",
    label: "working",
    tone: "good",
    signal: "working",
    metric: "82%",
    metricLabel: "declared milestone",
    staff: "ellis",
    team: "runner",
    progress: 82,
    rows: [["branch", "1.9.9"], ["handoff", "inspector next"]],
    next: "capture the final consumer proof"
  },
  inspector: {
    feature: "inspector",
    kicker: "inspector reporting",
    title: "three screens need your eye",
    summary: "fresh visual evidence is ready. the technical checks passed; these need a human call.",
    label: "needs you",
    tone: "act",
    signal: "attention",
    metric: "3",
    metricLabel: "screens waiting",
    staff: "valentina",
    team: "inspector",
    progress: null,
    rows: [["latest", "just now"], ["review", "visual QA"]],
    next: "open the newest capture"
  },
  "night-shift": {
    feature: "night-shift",
    kicker: "night shift reporting",
    title: "everything boring is still being watched",
    summary: "four automatic checks are running quietly. nothing needs you right now.",
    label: "watching",
    tone: "quiet",
    signal: "external",
    metric: "4",
    metricLabel: "checks watching",
    staff: "relay",
    team: "night shift",
    progress: null,
    rows: [["last pass", "8m ago"], ["next pass", "soon"]],
    next: "leave it alone unless something changes"
  }
});

function renderChatCardPreview() {
  const target = document.querySelector("#chat-card-preview");
  const tabs = document.querySelector("#chat-card-tabs");
  if (!target || !tabs) return;

  tabs.innerHTML = Object.entries(cardPreviews).map(([id, card]) => {
    const active = id === cardPreviewMode;
    return '<button type="button" role="tab" aria-selected="' + active + '" class="' + (active ? "active" : "") + '" data-card-preview="' + esc(id) + '">' + esc(card.feature.replace("-", " ")) + '</button>';
  }).join("");

  const card = cardPreviews[cardPreviewMode] || cardPreviews.relay;
  const accent = featureAccent[card.feature] || featureAccent.relay;
  const rows = card.rows.map(([label, value]) =>
    '<div class="chat-card-row"><strong>' + esc(label) + '</strong><span>' + esc(value) + '</span></div>'
  ).join("");

  target.innerHTML = `
    <article class="chat-card-preview" data-feature="${esc(card.feature)}" data-signal="${esc(card.signal)}" style="--card-accent:${esc(accent)}">
      <section class="chat-card-hero">
        <div class="chat-card-mark" aria-hidden="true"><img src="${esc(brand[card.feature] || brand.relay)}" alt=""></div>
        <div class="chat-card-copy">
          <h3>${esc(card.feature.replace("-", " "))}</h3>
          <strong>${esc(card.title)}</strong>
          <p>${esc(card.summary)}</p>
          <span class="chat-card-staff"><span class="chat-card-avatar" aria-hidden="true"></span><span>${esc(card.staff)}</span><small>${esc(card.team)}</small></span>
        </div>
      </section>
      <aside class="chat-card-insight">
        <span class="chat-card-state" data-tone="${esc(card.tone)}"><span class="status-light" aria-hidden="true"></span><span>${esc(card.label)}</span></span>
        <div class="chat-card-metric">${esc(card.metric)}</div>
        <div class="chat-card-metric-label">${esc(card.metricLabel)}</div>
        ${card.progress == null ? "" : '<div class="chat-card-meter" aria-label="' + esc(card.progress + "% complete") + '"><span style="width:' + card.progress + '%"></span></div>'}
        <div class="chat-card-rows">${rows}</div>
        <p class="chat-card-next">next: ${esc(card.next)}</p>
        <div class="chat-card-actions" aria-label="Preview actions"><button type="button" disabled>refresh</button><button type="button" class="primary" disabled>open relay</button></div>
      </aside>
    </article>
  `;

  tabs.querySelectorAll("[data-card-preview]").forEach(button => {
    button.addEventListener("click", () => {
      cardPreviewMode = button.dataset.cardPreview;
      renderChatCardPreview();
    });
  });
}

async function api(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...options
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { error: text || "Unexpected response." }; }
  if (!response.ok) throw Object.assign(new Error(body.error || "Request failed."), { status: response.status });
  return body;
}

function relative(value) {
  if (!value) return "recently";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "recently";
  const delta = parsed - Date.now();
  const abs = Math.abs(delta);
  const unit = abs < 3_600_000 ? "minute" : abs < 86_400_000 ? "hour" : "day";
  const divisor = unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(delta / divisor), unit);
}

function evidenceKey(item) {
  const context = item.context || {};
  return [
    context.project || item.target_url || "",
    item.step_label || item.step_id || context.surface || "",
    item.viewport?.width || "",
    item.viewport?.height || "",
    context.commit_sha || context.pr_number || item.run_id || ""
  ].join("|");
}

function evidenceTitle(item) {
  const context = item.context || {};
  return item.step_label || context.surface || "Screen review";
}


let viewer=null,loadGeneration=0;
export function bindReviewFilters() {
 renderChatCardPreview();
 const root=document.querySelector('#review-list');
 if(root)viewer=bindWorkViewer(root,{id:'inspector',defaultView:'visual',onOpen:item=>item&&openQa(item.id)});
}
export async function loadReview(ui,projectId='') {
 reviewUi=ui;const gen=++loadGeneration;
 const root=document.querySelector('#review-list'),count=document.querySelector('#review-count');
 root.dataset.summaryState='loading';showLoading(root,'review','Loading captures');
 try {
  const payload=await api('/api/visual');
  const raw=Array.isArray(payload.evidence)?payload.evidence:[],seen=new Set(),sources=[];
  for(const item of raw){const key=evidenceKey(item);if(seen.has(key))continue;seen.add(key);sources.push(item);}
  const prepared=[];
  for(let index=0;index<sources.length;index+=4)prepared.push(...await Promise.all(sources.slice(index,index+4).map(async item=>{
   try{const qa=await api('/api/visual/'+encodeURIComponent(item.evidence_id)+'/qa');return {...item,qaReview:qa.review||null};}catch{return item;}
  })));
  const models=await Promise.all(prepared.map(evidenceItem));if(gen!==loadGeneration)return;
  reviewItems=prepared;viewer?.update(models,{project:projectId,incomplete:raw.length>=60||Boolean(payload.partial||payload.truncated||payload.cursor)});
  count.textContent=String(models.filter(item=>!projectId||item.project===projectId).length)+' loaded captures';
  ui.setConnection('connected','good');

 }catch(error){if(gen!==loadGeneration)return;root.dataset.summaryState='error';root.innerHTML='<div class="operator-empty">Review items could not load. Refresh to try again.</div>';ui.setConnection(error.status===403?'access needed':'couldn’t connect','bad');}
}
