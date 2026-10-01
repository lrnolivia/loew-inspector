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
    await page.keyboard.press('Escape');assert.match(await page.locator(':focus').getAttribute('aria-label'),/^Notifications/);
    await page.goto(fixture.origin+'/inspector');await page.locator('#review-list[data-summary-state="ready"]').waitFor();
    await page.getByRole('button',{name:/^Notifications/}).click();assert.match(await page.locator('.notification-menu').innerText(),/field/);
    await page.keyboard.press('Escape');await page.goto(fixture.origin+'/#/today');
    assert.equal(await page.locator('.notification-toasts .notification-message').count(),0);
    assert.equal(await page.locator('.notification-announcement').evaluate(node=>node.getBoundingClientRect().width),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const timeoutPage=await browser.newPage({viewport:{width:1440,height:900},colorScheme:'dark'});
    await timeoutPage.clock.install();await timeoutPage.goto(fixture.origin+'/#/today');await timeoutPage.locator('.notification-toasts .notification-message').waitFor();
    await timeoutPage.clock.fastForward(11000);
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
  await page.locator('.qa-preview-picker select').selectOption('captured');await page.getByRole('button',{name:'Next',exact:true}).click();
  assert.equal(await page.locator('.qa-preview-picker select').inputValue(),'captured');
  await page.getByRole('button',{name:'Hide questions'}).click();
  for(const selector of ['.qa-exit','.qa-preview-picker','.qa-panel-toggle']) {const rect=await page.locator(selector).boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=320&&rect.y+rect.height<=740);}
  await page.keyboard.press('Escape');await page.locator('.qa-stage').waitFor({state:'detached'});
 }finally{await browser.close();await fixture.close();}
});
