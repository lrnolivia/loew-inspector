import {mkdir,writeFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {webAssets,webBuildId} from '../generated.js';
import {createRetainedBundle} from '../retained-bundle.mjs';
import {storeRetainedBundle,getRetainedBundle} from '../../../src/retained-preview.js';
import {contextFixture} from './project-context-fixture.mjs';
import {retainedStorageFixture} from './retained-storage-fixture.mjs';

test('retained exact builds remain interactive, isolated, navigable and human-reviewable', {timeout:120000},async()=>{
 const sourceSha='a'.repeat(40),bucket=retainedStorageFixture();
 const {bundle,sha256}=await createRetainedBundle({webAssets,sourceSha,buildId:webBuildId,createdAt:'2026-10-02T08:00:00.000Z'});
 const stored=await storeRetainedBundle(bucket,bundle);assert.equal(stored.sha256,sha256);
 let currentPage;const pageErrors=[];
 const fixture=await contextFixture({retained:{bucket,id:stored.id,source_sha:sourceSha}}),browser=await chromium.launch();
 try{
  // Serve the retained document at the real hostname without contacting production.
  // Its opaque sandbox must stay in the saved build, not take the public ctrl redirect.
  const archived=await browser.newPage();
  await archived.route('https://relay.loew.fi/**',async route=>{
   const url=new URL(route.request().url());
   const response=await fetch(fixture.origin+url.pathname+url.search);
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await archived.route('https://ctrl.loew.fi/**',route=>route.abort());
  await archived.goto('https://relay.loew.fi/api/retained-preview/'+stored.id+'/view?entry=app#/today');
  await archived.locator('.work-viewer[data-summary-state=ready]').waitFor();
  assert.match(archived.url(),/\/api\/retained-preview\//);
  assert.equal(await archived.evaluate(()=>window.origin),'null');
  await archived.getByRole('link',{name:/^runner/}).click();
  await archived.getByRole('heading',{name:'runner',exact:true,level:1}).waitFor();
  assert.match(archived.url(),/\/api\/retained-preview\//);
  await archived.close();
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900},colorScheme:'dark',reducedMotion:'reduce'});currentPage=page;page.on('pageerror',error=>pageErrors.push(error.message));
   await page.goto(fixture.origin+'/inspector#review');assert.equal(await page.evaluate(()=>Boolean(window.__retainedFixture)),false);await page.evaluate(()=>localStorage.setItem('host-secret','host-only'));await page.locator('#review-list[data-summary-state=ready]').waitFor();
   const open=()=>page.locator('[data-review-id="vis_context-capture-relay"]').click();await open();
   const frame=page.frameLocator('[data-qa-retained-preview]');await frame.locator('.feature-heading h1').filter({hasText:'today'}).waitFor();
   await page.locator('.qa-preview-state').filter({hasText:'sample data · ready'}).waitFor();
   assert.equal(await page.locator('[data-qa-retained-preview]').getAttribute('sandbox'),'allow-scripts');
   await mkdir('qa-evidence/website',{recursive:true});await page.screenshot({path:'qa-evidence/website/retained-review-'+width+'.png'});
   const isolation=await frame.locator('body').evaluate(async()=>{
    const violations=[];let resolveViolations;const observed=new Promise(resolve=>{resolveViolations=resolve;});
    const onViolation=event=>{violations.push(event.effectiveDirective);if(violations.includes('connect-src')&&violations.includes('img-src'))resolveViolations();};
    window.addEventListener('securitypolicyviolation',onViolation);
    let parentBlocked=false,cookieBlocked=false,topBlocked=false;
    try{void parent.document.body;}catch{parentBlocked=true;}
    try{void document.cookie;}catch{cookieBlocked=true;}
    try{top.location.href='/forbidden-top';}catch{topBlocked=true;}
    let beacon;try{beacon=navigator.sendBeacon('/forbidden-beacon','preview');}catch{beacon=false;}
    const image=new Image();image.src=location.origin+'/forbidden-image';
    localStorage.setItem('preview-only','yes');
    await Promise.race([observed,new Promise(resolve=>setTimeout(resolve,1000))]);window.removeEventListener('securitypolicyviolation',onViolation);
    return {origin:window.origin,urlOrigin:location.origin,parentBlocked,cookieBlocked,topBlocked,beacon,violations,storage:localStorage.getItem('preview-only'),hostSecret:localStorage.getItem('host-secret'),secure:isSecureContext};
   });
   assert.equal(isolation.origin,'null',JSON.stringify(isolation));assert.equal(isolation.urlOrigin,fixture.origin);assert.ok(isolation.parentBlocked&&isolation.cookieBlocked);assert.equal(isolation.storage,'yes');assert.equal(isolation.hostSecret,null);assert.ok(isolation.violations.includes('connect-src')&&isolation.violations.includes('img-src'),JSON.stringify(isolation));assert.ok(page.url().startsWith(fixture.origin+'/inspector'));
   await frame.locator('.work-viewer[data-summary-state=ready]').waitFor();
   const requestsBefore=fixture.requests.filter(path=>path==='/api/work-review').length;
   await frame.locator('[data-select-visible]').check();await frame.locator('[data-bulk=completed]').click();await frame.locator('[data-confirm]').click();
   await frame.locator('.work-results .empty-card').waitFor();assert.ok(await frame.locator('body').evaluate(()=>window.__retainedFixture.reviewRecordCount()>0));
   assert.equal(fixture.reviews.values.size,0,'synthetic review cannot write host review storage');
   assert.equal(fixture.requests.filter(path=>path==='/api/work-review').length,requestsBefore,'child mutations never reached host APIs');
   assert.equal(fixture.requests.some(path=>path.startsWith('/forbidden')),false,'CSP prevents fallback network requests');
   await frame.locator('a[data-feature=inspector]').click();await frame.locator('.feature-heading h1').filter({hasText:'inspector'}).waitFor();
   await page.locator('.qa-preview-state').filter({hasText:'sample data · ready'}).waitFor();
   assert.match(await page.locator('[data-qa-retained-preview]').getAttribute('src'),/entry=inspector/);
   await page.locator('[data-retained-review]').click();await page.locator('[data-retained-review]').filter({hasText:'Reopen build review'}).waitFor();
   assert.equal((await getRetainedBundle(bucket,stored.id)).state,'approved');
   await page.locator('.qa-preview-state').filter({hasText:'sample data · ready'}).waitFor();await page.screenshot({path:'qa-evidence/website/retained-approved-'+width+'.png'});
   await page.locator('[data-retained-review]').click();await page.locator('[data-retained-review]').filter({hasText:'Approve this build'}).waitFor();assert.equal((await getRetainedBundle(bucket,stored.id)).state,'pending');
   await page.locator('.qa-exit').click();await page.locator('.qa-stage').waitFor({state:'detached'});await open();
   await frame.locator('.work-viewer[data-summary-state=ready]').waitFor();assert.equal(await frame.locator('body').evaluate(()=>window.__retainedFixture.reviewRecordCount()),0,'preview changes reset when reopened');
   await page.locator('.qa-exit').click();await page.close();
  }
 }catch(error){
  let diagnostics={pageErrors};
  if(currentPage&&!currentPage.isClosed()){
   diagnostics.frames=await Promise.all(currentPage.frames().map(async frame=>{try{return await frame.evaluate(()=>({url:location.href,origin:window.origin,ready:document.readyState,text:document.body?.innerText?.slice(0,2000)}));}catch(cause){return {error:cause.message};}}));
   await mkdir('qa-evidence/website',{recursive:true});await currentPage.screenshot({path:'qa-evidence/website/retained-failure.png'});await writeFile('qa-evidence/website/retained-failure.json',JSON.stringify(diagnostics,null,2));
  }
  throw Error(error.message+'\nRetained diagnostics: '+JSON.stringify(diagnostics));
 }finally{await browser.close();await fixture.close();}
});
