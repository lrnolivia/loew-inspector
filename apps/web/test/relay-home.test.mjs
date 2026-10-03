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
  let partial=false;
  await page.route('**/api/projects',route=>route.fulfill({json:{projects:[{id:'relay',name:'relay',managed:true},...(partial?[{id:'field',managed:true}]:[])]}}));
  await page.route('**/api/projects/field',route=>route.fulfill({status:503,json:{error:'Fixture provider unavailable'}}));
  await page.route('**/api/workers',route=>route.fulfill({json:[]}));await page.route('**/api/projects/relay',route=>route.fulfill({json:{coordination:{claims:[{id:'fixture-review',state:'active'}]}}}));
  await page.route('**/api/projects/relay/icon',route=>route.fulfill({json:{status:'found',icon:{data_url:contextCardBrandAssets.relay}}}));await page.route('**/api/progress/relay*',route=>route.fulfill({json:progress}));
  await page.route('**/api/relay/*',route=>route.fulfill({json:{ok:true,checked_at:'2026-10-03T00:00:00Z',elapsed_ms:17,server:{version:'fixture'},tools:{count:65,schema_sha256:'b'.repeat(64)},refresh:{message:'Server tool schema checked. Client refresh is not verified.'}}}));
  await page.goto(origin+'/');await page.getByRole('heading',{name:'relay',exact:true}).waitFor();await page.getByText(progress.progress[0].goal,{exact:true}).waitFor();
  for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no overflow at '+width);}
  assert.equal(await page.locator('.telemetry-card').count(),4);
  await page.waitForFunction(()=>[...document.querySelectorAll('.telemetry-feature-badge img')].every(image=>image.complete&&image.naturalWidth>0));
  assert.equal(await page.locator('.telemetry-feature-badge img').count(),2,'contextual brands are real loaded assets');
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
  await page.getByRole('button',{name:'arrange',exact:true}).click();
  await page.getByRole('button',{name:'move activity earlier',exact:true}).click();
  await page.getByRole('button',{name:'done',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('relay.telemetry.order.v1'))),['progress','needs','activity','motion']);
  await page.reload();await page.locator('.live-telemetry[data-complete=true]').waitFor();
  assert.equal(await page.locator('[data-card=activity]').evaluate(el=>getComputedStyle(el).order),'2','saved layout restored');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1440,height:1000});
  const start=await page.locator('.telemetry-progress h3').boundingBox();
  await page.mouse.move(start.x+10,start.y+10);await page.mouse.down();await page.waitForTimeout(550);
  assert.equal(await page.locator('.telemetry-mosaic').getAttribute('data-arranging'),'true','long press enters arranging');
  await page.mouse.up();
  if(process.env.RELAY_QA_OUTPUT)await page.screenshot({path:process.env.RELAY_QA_OUTPUT+'/relay-arranging-1440.png',fullPage:true});

  await page.getByRole('button',{name:'done',exact:true}).click();
  assert.equal(await page.locator('.telemetry-mosaic').getAttribute('data-arranging'),'false');
  assert.deepEqual(errors,[]);
  partial=true;await page.getByRole('button',{name:'Refresh workspace telemetry'}).click();
  await page.locator('.live-telemetry[data-loading=false][data-complete=false]').waitFor();
  assert.equal(await page.locator('.telemetry-needs .telemetry-number').textContent(),'1+');
  assert.match(await page.locator('.telemetry-note').first().textContent(),/Counts with \+ are minimums/);
  assert.equal(await page.locator('.telemetry-ring strong').textContent(),'—','incomplete project coverage cannot claim a global completion percentage');
  assert.equal(await page.locator('.telemetry-attention-list a').count(),1,'available real work stays visible when another provider fails');
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
