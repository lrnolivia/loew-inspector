import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { contextFixture } from './project-context-fixture.mjs';
import { splitReviewNotes, joinReviewNotes } from '../public/qa-notes.js';

const marker='Agent-prepared review packet (pending human judgment):';
const packet=marker+'\n'+JSON.stringify({title:'Old guidance',questions:[{prompt:'Check "quoted" text and braces } safely.'}]});
test('Legacy guidance preserves original packet and every human note character',()=>{
  const notes='  Keep my indentation.\n<script>not executable</script>\n';
  const combined=joinReviewNotes(packet,notes), parts=splitReviewNotes(combined);
  assert.equal(parts.prefix,packet);assert.equal(parts.notes,notes);assert.equal(joinReviewNotes(parts.prefix,parts.notes),combined);
  for(const text of ['{"questions":[]}',marker+'\nnot JSON',marker+'\n{"title":"mine"}']) assert.equal(splitReviewNotes(text).notes,text);
});

test('Notifications retain attention after dismiss/timeout and survive Inspector round trips', {timeout:20000},async()=>{
  const fixture=await contextFixture(),browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',colorScheme:'dark'});
    await page.goto(fixture.origin+'/#/today');
    await page.locator('.notification-toasts .notification-message').waitFor();
    assert.match(await page.locator('.notification-toasts').innerText(),/Night Shift · field/);
    await page.getByRole('button',{name:'Dismiss notification',exact:true}).click();
    await page.getByRole('button',{name:/^Notifications/}).click();
    assert.match(await page.locator('.notification-menu').innerText(),/Toast dismissed/);
    assert.match(await page.locator('.notification-menu').innerText(),/Needs attention/);
    const menuRect=await page.locator('.notification-menu').boundingBox();assert.ok(menuRect.x>=0 && menuRect.x+menuRect.width<=390,'mobile menu fits the viewport');
    await page.keyboard.press('Escape');assert.match(await page.locator(':focus').getAttribute('aria-label'),/^Notifications/);
    await page.goto(fixture.origin+'/inspector');await page.locator('#review-list[data-summary-state="ready"]').waitFor();
    await page.getByRole('button',{name:/^Notifications/}).click();assert.match(await page.locator('.notification-menu').innerText(),/field/);
    await page.keyboard.press('Escape');await page.goto(fixture.origin+'/#/today');
    assert.equal(await page.locator('.notification-toasts .notification-message').count(),0);
    assert.equal(await page.locator('.notification-announcement').evaluate(node=>node.getBoundingClientRect().width),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const timeoutPage=await browser.newPage({viewport:{width:1440,height:900},colorScheme:'dark'});
    await timeoutPage.clock.install();await timeoutPage.goto(fixture.origin+'/#/today');await timeoutPage.locator('.notification-toasts .notification-message').waitFor();
    await timeoutPage.locator('.notification-toasts a').focus();await timeoutPage.clock.fastForward(11000);
    assert.equal(await timeoutPage.locator('.notification-toasts .notification-message').count(),1,'focused notification stays available');
    await timeoutPage.locator('.notification-bell').focus();await timeoutPage.clock.fastForward(11000);
    assert.equal(await timeoutPage.locator('.notification-toasts .notification-message').count(),0);
    await timeoutPage.getByRole('button',{name:/^Notifications/}).click();assert.match(await timeoutPage.locator('.notification-menu').innerText(),/Needs attention/);
    await mkdir('/tmp/relay-next-evidence',{recursive:true});await timeoutPage.screenshot({path:'/tmp/relay-next-evidence/notifications-desktop.png'});
  }finally{await browser.close();await fixture.close();}
});

test('Review navigation, exact notes, sequential saves, retry and authorized preview fallback',{timeout:30000},async()=>{
  const fixture=await contextFixture(),browser=await chromium.launch({headless:true});
  let review={answers:{},notes:joinReviewNotes(packet,'Original human note'),overall:null,updated_at:'2026-10-01T00:00:00Z'},fail=false,slow=false,release;
  const writes=[];const evidence={evidence_id:'vis_context-capture-relay',screenshot_url:'/api/visual/vis_context-capture-relay/image',context:{project:'relay'},viewport:{width:1440,height:900}};
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',colorScheme:'dark'});
    await page.route('**/api/visual/*/qa',async route=>{
      if(route.request().method()==='POST'){
        const payload=route.request().postDataJSON();writes.push(payload);
        if(slow)await new Promise(resolve=>release=resolve);
        if(fail)return route.fulfill({status:503,json:{error:'Fixture save unavailable'}});
        review={...payload,updated_at:new Date().toISOString()};return route.fulfill({json:{review}});
      }
      await route.fulfill({json:{evidence,review,questions:[{id:'one',prompt:'Is the first step clear?'},{id:'two',prompt:'Is the result readable?'}]}});
    });
    await page.route('**/api/visual/*/live',route=>route.fulfill({status:503,json:{error:'No authorized live preview'}}));
    await page.goto(fixture.origin+'/inspector#review?evidence='+evidence.evidence_id);
    await page.locator('.qa-question').filter({hasText:'first step'}).waitFor();
    assert.equal(await page.locator('.qa-notes textarea').inputValue(),'Original human note');
    assert.equal(await page.locator('.qa-preview-picker select').inputValue(),'captured');
    assert.match(await page.locator('.qa-preview-state').innerText(),/unavailable/);
    await page.getByRole('button',{name:'Yes, clear',exact:true}).click();
    assert.match(await page.locator('.qa-question').innerText(),/first step/);
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();
    assert.equal(await page.locator('[data-qa-answer=yes]').getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Not sure',exact:true}).first().click();
    await page.getByRole('button',{name:'Looks good',exact:true}).click();
    await page.locator('[data-qa-save-state]').filter({hasText:'Saved'}).waitFor();
    slow=true;await page.locator('.qa-notes textarea').fill('First edit');await page.locator('[data-qa-save-state]').filter({hasText:'Saving'}).waitFor();
    while(!release)await new Promise(resolve=>setTimeout(resolve,20));
    await page.locator('.qa-notes textarea').fill('  Latest exact note\n');slow=false;release();
    await page.locator('[data-qa-save-state]').filter({hasText:'Saved'}).waitFor();assert.equal(splitReviewNotes(review.notes).notes,'  Latest exact note\n');
    fail=true;await page.locator('.qa-notes textarea').fill('Kept during failure');await page.getByRole('button',{name:'Retry save'}).waitFor();
    await page.getByRole('button',{name:'Back',exact:true}).click();assert.match(await page.locator('[data-qa-save-state]').innerText(),/failed/);
    await page.reload();await page.getByRole('button',{name:'Retry save'}).waitFor();assert.equal(await page.locator('.qa-notes textarea').inputValue(),'Kept during failure');
    assert.match(await page.locator('[data-qa-save-state]').innerText(),/Recovered unsaved/);
    fail=false;await page.getByRole('button',{name:'Retry save'}).click();await page.locator('[data-qa-save-state]').filter({hasText:'Saved'}).waitFor();
    await page.getByRole('button',{name:'Hide questions'}).click();assert.equal(await page.locator('.qa-companion').isVisible(),false);
    await page.getByRole('button',{name:'Show questions'}).click();assert.equal(await page.locator('.qa-companion').isVisible(),true);
    await mkdir('/tmp/relay-next-evidence',{recursive:true});await page.screenshot({path:'/tmp/relay-next-evidence/review-mobile.png'});
    if(await page.locator('[data-qa-next]').count())await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Finish',exact:true}).click();await page.locator('.qa-stage').waitFor({state:'detached'});
    assert.equal(splitReviewNotes(review.notes).notes,'Kept during failure');assert.ok(writes.length>=4);
  }finally{release?.();await browser.close();await fixture.close();}
});

test('Authorized Live is preferred while an explicit Captured choice survives question navigation', {timeout:15000},async()=>{
 const fixture=await contextFixture(),browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:320,height:740},colorScheme:'light'});
  const evidence={evidence_id:'vis_context-capture-relay',screenshot_url:'/api/visual/vis_context-capture-relay/image',context:{project:'relay'}};
  await page.route('**/api/visual/*/qa',route=>route.fulfill({json:{evidence,review:{answers:{},notes:'',overall:null},questions:[{id:'first',prompt:'First question'},{id:'last',prompt:'Last question'}]}}));
  await page.route('**/api/visual/*/live',route=>route.fulfill({json:{live:{active:true,embeddable:true,url:fixture.origin+'/authorized-preview'}}}));
  await page.route('**/authorized-preview',route=>route.fulfill({contentType:'text/html',body:'<main>Actual fixture live preview</main>'}));
  await page.goto(fixture.origin+'/inspector#review?evidence='+evidence.evidence_id);await page.locator('.qa-question').waitFor();
  assert.equal(await page.locator('.qa-preview-picker select').inputValue(),'live');
  await page.locator('.qa-preview-state').filter({hasText:/^Live preview$/}).waitFor();
  await page.locator('.qa-preview-picker select').selectOption('captured');await page.getByRole('button',{name:'Next',exact:true}).click();
  assert.equal(await page.locator('.qa-preview-picker select').inputValue(),'captured');
  await page.getByRole('button',{name:'Hide questions'}).click();
  for(const selector of ['.qa-exit','.qa-preview-picker','.qa-panel-toggle']) {const rect=await page.locator(selector).boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=320&&rect.y+rect.height<=740);}
  await page.keyboard.press('Escape');await page.locator('.qa-stage').waitFor({state:'detached'});
 }finally{await browser.close();await fixture.close();}
});

test('A growing failed-save message keeps the desktop panel clear of floating controls', {timeout:15000},async()=>{
 const fixture=await contextFixture(),browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},colorScheme:'dark'});
  const evidence={evidence_id:'vis_context-capture-relay',screenshot_url:'/api/visual/vis_context-capture-relay/image',context:{project:'relay'}};
  await page.route('**/api/visual/*/qa',route=>route.fulfill(route.request().method()==='POST'?{status:503,json:{error:'Fixture unavailable. Responses remain locally recoverable while the provider recovers.'}}:{json:{evidence,review:{answers:{},notes:'',overall:null},questions:[{id:'one',prompt:'Does the review remain usable after a failed save?'}]}}));
  await page.route('**/api/visual/*/live',route=>route.fulfill({json:{live:{active:false}}}));
  await page.goto(fixture.origin+'/inspector#review?evidence='+evidence.evidence_id);await page.locator('.qa-question').waitFor();
  await page.getByRole('button',{name:'Yes, clear',exact:true}).click();await page.getByRole('button',{name:'Looks good',exact:true}).click();
  await page.getByRole('button',{name:'Retry save'}).waitFor();
  await page.locator('.qa-companion').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const panel=await page.locator('.qa-companion').boundingBox(),toggle=await page.locator('.qa-panel-toggle').boundingBox();
  assert.ok(panel.y+panel.height<=toggle.y,'failed-save feedback cannot grow beneath Hide questions');
  await page.getByRole('button',{name:'Retry save'}).click();await page.locator('[data-qa-save-state]').filter({hasText:'failed'}).waitFor();
 }finally{await browser.close();await fixture.close();}
});

test('Reopening during a save cannot replace confirmed responses with an older in-flight GET', {timeout:20000},async()=>{
 const fixture=await contextFixture(),browser=await chromium.launch();
 let review={answers:{},notes:'Old note',overall:null,updated_at:'2026-10-01T00:00:00Z'},holdLive=false,releasePost,releaseGet,postStarted,getStarted,qaReadStarted;
 const postGate=new Promise(resolve=>releasePost=resolve),getGate=new Promise(resolve=>releaseGet=resolve);
 const postSignal=new Promise(resolve=>postStarted=resolve),getSignal=new Promise(resolve=>getStarted=resolve),qaReadSignal=new Promise(resolve=>qaReadStarted=resolve);
 try{
  const page=await browser.newPage({colorScheme:'dark'});
  const evidence={evidence_id:'vis_context-capture-relay',screenshot_url:'/api/visual/vis_context-capture-relay/image',context:{project:'relay'}};
  await page.route('**/api/visual/*/qa',async route=>{
   if(route.request().method()==='POST'){const payload=route.request().postDataJSON();postStarted();await postGate;review={...payload,updated_at:new Date().toISOString()};return route.fulfill({json:{review}});}
   const snapshot=structuredClone(review);if(holdLive)qaReadStarted();
   return route.fulfill({json:{evidence,review:snapshot,questions:[{id:'one',prompt:'Is the result clear?'}]}});
  });
  await page.route('**/api/visual/*/live',async route=>{if(holdLive){getStarted();await getGate;}return route.fulfill({json:{live:{active:false}}});});
  await page.goto(fixture.origin+'/inspector#review?evidence='+evidence.evidence_id);await page.locator('.qa-question').waitFor();
  await page.getByRole('button',{name:'No, needs work',exact:true}).click();await page.getByRole('button',{name:'Needs work',exact:true}).click();await page.locator('.qa-notes textarea').fill('Newest confirmed note');
  await page.getByRole('button',{name:'Exit review'}).click();await postSignal;
  // Exit traverses history asynchronously. Settle that transition before reopening.
  await page.waitForFunction(()=>!history.state?.relayQaToken);
  holdLive=true;await page.locator('[data-review-id="'+evidence.evidence_id+'"]').click();await Promise.all([getSignal,qaReadSignal]);
  releasePost();await page.waitForFunction(id=>sessionStorage.getItem('relay.qa.draft.v1.'+id)===null,evidence.evidence_id);
  releaseGet();await page.locator('.qa-notes textarea').waitFor();
  assert.equal(await page.locator('.qa-notes textarea').inputValue(),'Newest confirmed note');
  assert.equal(await page.locator('[data-qa-answer=no]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-qa-overall=needs_work]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-qa-save-state]').innerText(),'Saved');
  await page.locator('[data-qa-answer=yes]').click();await page.locator('[data-qa-save-state]').filter({hasText:'Saved'}).waitFor();assert.equal(review.notes,'Newest confirmed note','the next write must preserve the confirmed note');
 }finally{releasePost();releaseGet();await browser.close();await fixture.close();}
});

test('Authorized iframe HTTP, framing and network failures fall back without relying on error events', {timeout:25000},async()=>{
 const fixture=await contextFixture(),other=await contextFixture(),browser=await chromium.launch();
 try{
  for(const failure of ['http','framing','network','unverified']){
   const page=await browser.newPage({colorScheme:'dark',viewport:{width:320,height:740}});await page.clock.install();
   await page.addInitScript(()=>{window.__iframeErrors=0;new MutationObserver(()=>{const frame=document.querySelector('[data-qa-live-preview]');if(frame&&!frame.dataset.observed){frame.dataset.observed='true';frame.addEventListener('error',()=>window.__iframeErrors++);}}).observe(document,{subtree:true,childList:true});});
   const evidence={evidence_id:'vis_context-capture-relay',screenshot_url:'/api/visual/vis_context-capture-relay/image',context:{project:'relay'}};
   await page.route('**/api/visual/*/qa',route=>route.fulfill({json:{evidence,review:{answers:{},notes:'',overall:null},questions:[{id:'one',prompt:'Review this capture'}]}}));
   await page.route('**/api/visual/*/live',route=>route.fulfill({json:{live:{active:true,embeddable:true,status:200,url:(failure==='unverified'?other.origin:fixture.origin)+'/broken-preview'}}}));
   await page.route('**/broken-preview',route=>failure==='network'?route.abort('connectionrefused'):route.fulfill({status:failure==='http'?404:200,contentType:'text/html',headers:failure==='framing'?{'Content-Security-Policy':"frame-ancestors 'none'"}:{},body:'<main>Unavailable preview</main>'}));
   await page.goto(fixture.origin+'/inspector#review?evidence='+evidence.evidence_id);await page.locator('.qa-question').waitFor();
   await page.clock.fastForward(9000);
   assert.equal(await page.locator('.qa-preview-picker select').inputValue(),'captured',failure+' must fall back');
   assert.match(await page.locator('.qa-preview-state').innerText(),/unconfirmed/);
   const caption=await page.locator('.qa-preview-state').boundingBox(),panel=await page.locator('.qa-companion').boundingBox(),toggle=await page.locator('.qa-panel-toggle').boundingBox();assert.ok(caption.y>=panel.y+panel.height,'fallback caption stays below the panel');assert.ok(caption.x+caption.width<=toggle.x,'fallback caption stays beside Hide questions');
   assert.equal(await page.evaluate(()=>window.__iframeErrors),0,'browser failure does not provide iframe error proof');
   await page.close();
  }
 }finally{await browser.close();await fixture.close();await other.close();}
});

test('A failed navigation invalidates previously confirmed iframe readiness', {timeout:15000},async()=>{
 const fixture=await contextFixture(),browser=await chromium.launch();
 try{
  const page=await browser.newPage({colorScheme:'dark'});await page.clock.install();
  const evidence={evidence_id:'vis_context-capture-relay',screenshot_url:'/api/visual/vis_context-capture-relay/image',context:{project:'relay'}};
  await page.route('**/api/visual/*/qa',route=>route.fulfill({json:{evidence,review:{answers:{},notes:'',overall:null},questions:[{id:'one',prompt:'Review this capture'}]}}));
  await page.route('**/api/visual/*/live',route=>route.fulfill({json:{live:{active:true,embeddable:true,status:200,url:fixture.origin+'/authorized-preview'}}}));
  await page.route('**/authorized-preview',route=>route.fulfill({contentType:'text/html',body:'<main>Available preview <a href="/broken-preview">Broken destination</a></main>'}));
  await page.route('**/broken-preview',route=>route.fulfill({status:404,contentType:'text/html',body:'<main>Not found</main>'}));
  await page.goto(fixture.origin+'/inspector#review?evidence='+evidence.evidence_id);await page.locator('.qa-preview-state').filter({hasText:/^Live preview$/}).waitFor();
  await page.frameLocator('[data-qa-live-preview]').getByRole('link',{name:'Broken destination'}).click();
  await page.locator('.qa-preview-state').filter({hasText:'Checking live preview'}).waitFor();await page.clock.fastForward(9000);
  assert.equal(await page.locator('.qa-preview-picker select').inputValue(),'captured');assert.match(await page.locator('.qa-preview-state').innerText(),/unconfirmed/);
 }finally{await browser.close();await fixture.close();}
});
