import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright';
import {webAssets} from '../generated.js';
test('Shift retries the same durable intent and never presents a queued job as a process',async()=>{
 const server=http.createServer((req,res)=>{const asset=webAssets[new URL(req.url,'http://localhost').pathname];res.writeHead(asset?200:404,{'Content-Type':asset?.type||'text/plain'});res.end(asset?.text||'');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage();
 const row={assignment:'fixture',owner:'fixture-owner',branch:'relay/fixture',goal:'Synthetic execution request',state:'active',lease_until:'2099-01-01T00:00:00Z',job:null};let attempts=[];
 try{
  await page.route('**/api/**',async route=>{const url=new URL(route.request().url());let value={};
   if(url.pathname==='/api/projects')value={projects:[{id:'relay'}]};
   else if(url.pathname==='/api/workers')value=[];
   else if(url.pathname==='/api/projects/relay')value={coordination:{claims:[]}};
   else if(url.pathname==='/api/execution/jobs')value={rows:[row],next_cursor:null};
   else if(url.pathname==='/api/progress/relay')value={progress:[{assignment:'fixture',identities:{head_sha:'a'.repeat(40)}}]};
   else if(url.pathname==='/api/execution/request'){
    const args=route.request().postDataJSON();attempts.push(args);
    if(attempts.length===1)return route.fulfill({status:503,json:{error:'Synthetic uncertain response'}});
    row.job={id:'job_'+'b'.repeat(64),revision:2,state:args.action==='cancel'?'cancelled':'queued',observed_state:args.action==='cancel'?'cancelled':'queued'};value={ok:true,job:row.job};
   }
   await route.fulfill({json:value});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#/night-shift`);
  await page.getByLabel('Admitted work').selectOption('fixture');await page.getByLabel('Next bounded action').fill('Synthetic fixture only; do not start an executor.');
  await page.getByRole('button',{name:'Shift',exact:true}).click();await page.getByRole('alert').filter({hasText:'Synthetic uncertain response'}).waitFor();
  await page.getByRole('button',{name:'Shift',exact:true}).click();await page.getByText('No process start receipt.',{exact:false}).waitFor();assert.deepEqual(attempts[0],attempts[1]);
  await page.getByRole('button',{name:'Cancel execution',exact:true}).click();await page.locator('.execution-receipt>strong').filter({hasText:'cancelled'}).waitFor();assert.equal(attempts[2].action,'cancel');assert.equal(await page.locator('.execution-receipt').textContent().then(x=>x.includes('Executor fixture')),false);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
