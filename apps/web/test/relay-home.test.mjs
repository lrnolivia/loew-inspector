import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { webAssets, contextCardBrandAssets } from '../generated.js';

test('populated Relay connection page works at desktop and mobile sizes without overflow or false refresh claims',async()=>{
 const server=http.createServer((req,res)=>{const asset=webAssets[new URL(req.url,'http://localhost').pathname];res.writeHead(asset?200:404,{'Content-Type':asset?.type||'text/plain'});res.end(asset?.text||'Not found');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));await page.route('https://fonts.gstatic.com/**',route=>route.abort());
  const progress={project:'relay',progress:[{assignment:'fixture-review',goal:'Review the exact Relay connection panel and its responsive behavior',state:'waiting-for-human',waiting_reason:'Visual review of completed implementation',next_action:'Inspect the populated status panel and confirm the connection actions.',last_meaningful_progress_at:'2026-10-03T00:00:00Z',identities:{head_sha:'a'.repeat(40)},events:[{type:'source-commit',at:'2026-10-03T00:00:00Z'}]}]};
  await page.route('**/api/projects',route=>route.fulfill({json:{projects:[{id:'relay',name:'relay',managed:true}]}}));
  await page.route('**/api/workers',route=>route.fulfill({json:[]}));await page.route('**/api/projects/relay',route=>route.fulfill({json:{coordination:{claims:[{id:'fixture-review',state:'active'}]}}}));
  await page.route('**/api/projects/relay/icon',route=>route.fulfill({json:{status:'found',icon:{data_url:contextCardBrandAssets.relay}}}));await page.route('**/api/progress/relay*',route=>route.fulfill({json:progress}));
  await page.route('**/api/relay/*',route=>route.fulfill({json:{ok:true,checked_at:'2026-10-03T00:00:00Z',elapsed_ms:17,server:{version:'fixture'},tools:{count:65,schema_sha256:'b'.repeat(64)},refresh:{message:'Server tool schema checked. Client refresh is not verified.'}}}));
  await page.goto(origin+'/');await page.getByRole('heading',{name:'relay',exact:true}).waitFor();await page.getByText(progress.progress[0].goal,{exact:true}).waitFor();
  for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no overflow at '+width);}
  assert.equal(await page.locator('.telemetry-card').count(),4);
  assert.equal(await page.locator('.relay-home').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(25, 23, 20)');
  assert.match(await page.locator('.relay-current-work').getAttribute('href'),/^https:\/\/ctrl.loew.fi\//);
  await page.getByRole('button',{name:'Check connection',exact:true}).click();await page.getByText('MCP connected',{exact:true}).waitFor();assert.match(await page.getByRole('status').first().textContent(),/17 ms/);
  await page.getByRole('button',{name:'Refresh tools',exact:true}).click();await page.getByRole('heading',{name:'Refresh tools'}).waitFor();assert.match(await page.getByLabel('Refresh tools result').textContent(),/not verified/);
  assert.equal(await page.locator('.presentation-menu #app-settings').count(),0);
  await page.getByRole('button',{name:'Add to AI'}).click();await page.getByRole('heading',{name:'Connect your AI'}).waitFor();
  assert.match(await page.getByLabel('Add Relay to AI').textContent(),/does not install or connect/);
  await page.getByLabel('Add Relay to AI').getByRole('button',{name:'Close',exact:true}).click();await page.getByLabel('Refresh tools result').getByRole('button',{name:'Close',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.relay-main-panel').evaluate(node=>getComputedStyle(node).backgroundImage),'none');
  if(process.env.RELAY_QA_OUTPUT){await fs.mkdir(process.env.RELAY_QA_OUTPUT,{recursive:true});for(const width of [1440,320]){await page.setViewportSize({width,height:1100});await page.screenshot({path:process.env.RELAY_QA_OUTPUT+'/relay-status-'+width+'.png',fullPage:true});}}
  assert.deepEqual(errors,[]);
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
