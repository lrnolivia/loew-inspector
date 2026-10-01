import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {contextFixture} from './project-context-fixture.mjs';
async function settle(page,inspector) {
 if(inspector) await page.locator('#review-list[data-summary-state=ready]').waitFor();
 else {await page.locator('.operator-connection[data-tone=good]').waitFor();await page.locator('[data-progress-notice]').waitFor({state:'detached'});}
}
async function checkClearance(page,desktop) {
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 const geometry=await page.evaluate(desktop=>{
  const bar=document.querySelector(desktop?'.operator-topbar':'.operator-nav'),page=[...document.querySelectorAll('.operator-page')].find(node=>node.getClientRects().length && !node.hidden);
  return {bar:bar.getBoundingClientRect().toJSON(),content:page.getBoundingClientRect().toJSON(),padding:parseFloat(getComputedStyle(document.querySelector('.operator-shell')).paddingBottom),overflow:document.documentElement.scrollWidth>innerWidth};
 },desktop);
 assert.ok(geometry.content.bottom<=geometry.bar.top-12,JSON.stringify(geometry));assert.equal(geometry.overflow,false);
 const lastControl=page.locator('.operator-shell :is(a,button,input,select,summary)').filter({visible:true}).last();
 if(await lastControl.count()) {await lastControl.focus();await lastControl.evaluate(node=>node.scrollIntoView({block:'center'}));const rect=await lastControl.boundingBox();assert.ok(rect.y>=0 && rect.y+rect.height<=geometry.bar.top,'last control fully reachable');}
 await page.evaluate(()=>window.scrollTo(0,0));
}
test('optional desktop layouts retain identity and four destinations; measured dock clearance survives enlarged wrapped text',async()=>{
 const fixture=await contextFixture(),browser=await chromium.launch({headless:true});
 try {
  for(const width of [1024,1440]) for(const inspector of [false,true]) for(const preset of ['desktop-header','desktop-bottom']) {
   const page=await browser.newPage({viewport:{width,height:844},colorScheme:'dark',reducedMotion:'reduce'});
   await page.goto(fixture.origin+(inspector?'/inspector#review':'/#/today'));await settle(page,inspector);
   assert.equal(await page.locator('html').getAttribute('data-presentation-desktop'),'rail');
   await page.mouse.move(width-1,1);
   const brand=await page.locator('.operator-brand').evaluate(node=>({padding:getComputedStyle(node).padding,gap:getComputedStyle(node).gap,width:node.getBoundingClientRect().width}));assert.equal(brand.width,68);assert.equal(brand.gap,'6px');assert.equal(brand.padding,'14px 8px');
   await page.locator('.presentation-menu > summary').click();await page.locator('[name=preset]').selectOption(preset);await page.keyboard.press('Escape');
   const variant=await page.locator('.operator-topbar').evaluate(node=>({rect:node.getBoundingClientRect().toJSON(),brand:node.querySelector('.operator-brand').getBoundingClientRect().toJSON(),targets:[...node.querySelectorAll('.operator-nav > :is(a,button)')].map(item=>item.getBoundingClientRect().toJSON()),title:document.querySelector('.feature-heading').getBoundingClientRect().toJSON()}));
   assert.equal(variant.targets.length,4);assert.ok(variant.targets.every(target=>target.width>=60 && target.height>=44 && target.left>=variant.rect.left && target.right<=variant.rect.right));assert.ok(variant.brand.left>=variant.rect.left && variant.brand.right<=variant.rect.right);assert.ok(variant.title.top>=0);
   if(preset==='desktop-bottom') {
    assert.ok(variant.rect.bottom<=828);await checkClearance(page,true);
    const before=await page.locator('.operator-topbar').boundingBox();
    await page.locator('.operator-nav .nav-copy strong').evaluateAll(nodes=>nodes.forEach(node=>{node.style.fontSize='32px';node.style.lineHeight='1.2';}));
    await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.operator-shell')).paddingBottom)>=document.querySelector('.operator-topbar').getBoundingClientRect().height+32);
    assert.ok((await page.locator('.operator-topbar').boundingBox()).height>before.height);await checkClearance(page,true);
   }
   await page.reload();await settle(page,inspector);assert.equal(await page.locator('[name=preset]').inputValue(),preset);
   await page.locator('.presentation-menu > summary').click();await page.locator('[data-presentation-reset]').click();assert.equal(await page.locator('html').getAttribute('data-presentation-desktop'),'rail');await page.close();
  }
  for(const width of [320,390]) for(const route of ['today','runner','night-shift','inspector']) {
   const inspector=route==='inspector',page=await browser.newPage({viewport:{width,height:844},colorScheme:'dark',reducedMotion:'reduce'});
   await page.goto(fixture.origin+(inspector?'/inspector#review':'/#/'+route));await settle(page,inspector);
   await page.locator('.presentation-menu > summary').click();await page.locator('[name=preset]').selectOption('bottom');await page.keyboard.press('Escape');await checkClearance(page,false);
   // Resize is a deterministic zoom/reflow proxy; actual text enlargement exercises bar-height changes.
   await page.setViewportSize({width:320,height:600});await page.locator('.operator-nav .nav-copy strong').evaluateAll(nodes=>nodes.forEach(node=>{node.style.fontSize='16px';node.style.whiteSpace='normal';node.style.lineHeight='1.25';}));
   await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.operator-shell')).paddingBottom)>=document.querySelector('.operator-nav').getBoundingClientRect().height+28);await checkClearance(page,false);await page.close();
  }
 } finally {await browser.close();await fixture.close();}
});
