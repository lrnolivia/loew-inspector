import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { contextFixture } from './project-context-fixture.mjs';

test('mobile Runner stays within the document and the accent scrolls away', {timeout:30000}, async()=>{
  const fixture=await contextFixture(), browser=await chromium.launch({headless:true});
  try {
    for (const width of [320,390]) {
      const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
      await page.route('**/api/progress/relay?*',async route=>{
        const response=await route.fetch(), body=await response.json();
        for(const item of body.progress||[]) item.next_action='Review '+ 'very-long-unbroken-evidence-identifier'.repeat(30);
        await route.fulfill({json:body});
      });
      await page.goto(fixture.origin+'/#/runner');
      await page.locator('.work-card').first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page has no horizontal overflow at '+width);
      await page.evaluate(()=>window.scrollTo(0,300));
      await page.waitForFunction(()=>scrollY>100);
      assert.ok((await page.locator('.terra-accent').boundingBox()).y<0,'accent scrolls with page');
      await mkdir('qa-evidence/website',{recursive:true});
      await page.screenshot({path:'qa-evidence/website/mobile-'+width+'-'+(await page.locator('.qa-stage').count()?'inspector':'runner')+'.png'});
      await page.close();
    }
  } finally { await browser.close(); await fixture.close(); }
});

test('mobile Inspector exposes all answers and supports real touch pan pinch and fit', {timeout:30000}, async()=>{
  const fixture=await contextFixture(), browser=await chromium.launch({headless:true});
  try {
    for(const width of [320,390]) {
      const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,reducedMotion:'reduce'});
      const evidence={evidence_id:'vis_context-capture-relay',screenshot_url:'/api/visual/vis_context-capture-relay/image',context:{project:'relay'},viewport:{width:1440,height:900}};
      await page.route('**/api/visual/*/qa',route=>route.fulfill({json:{evidence,review:{answers:{},notes:'',overall:null},questions:[{id:'one',prompt:'Does Actual website night-shift-1440 look like what you intended?',reason:'Runner needs your visual judgment, not another automated check.'}]}}));
      await page.goto(fixture.origin+'/inspector#review?evidence='+evidence.evidence_id);
      await page.locator('.qa-answer').first().waitFor();
      await page.waitForFunction(()=>document.querySelector('.qa-camera')?.style.transform.includes('scale('));
      assert.equal(await page.locator('.qa-question-content').evaluate(n=>n.scrollHeight<=n.clientHeight+1),true,'normal question needs no internal scroll');
      const panel=await page.locator('.qa-companion').boundingBox();
      for(const selector of ['[data-qa-answer=yes]','[data-qa-answer=no]','[data-qa-answer=not_sure]','[data-qa-finish]']) {
        const button=page.locator(selector);
        assert.equal(await button.count(),1,selector+' exists');
        const box=await button.boundingBox();
        assert.ok(box.y>=panel.y && box.y+box.height<=panel.y+panel.height+1,selector+' visible in panel');
      }
      assert.ok((await page.getByRole('button',{name:'Hide questions',exact:true}).boundingBox()).width<=48);
      await page.getByRole('button',{name:'Hide questions',exact:true}).click();
      const camera=()=>page.locator('.qa-camera').evaluate(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return {x:m.e,y:m.f,scale:m.a};});
      const before=await camera(), cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:180,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145,y:200,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const moved=await camera();assert.ok(Math.abs(moved.x-before.x-25)<1);assert.ok(Math.abs(moved.y-before.y-20)<1);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:180,id:1},{x:200,y:180,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:100,y:180,id:1},{x:220,y:180,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.ok((await camera()).scale>moved.scale*1.4,'pinch changes zoom');
      await page.getByRole('button',{name:'Fit preview',exact:true}).click();
      assert.ok(Math.abs((await camera()).scale-before.scale)<0.001);
      await page.getByRole('button',{name:'Show questions',exact:true}).click();
      assert.equal(await page.locator('.qa-companion').isVisible(),true);
      await mkdir('qa-evidence/website',{recursive:true});
      await page.screenshot({path:'qa-evidence/website/mobile-'+width+'-'+(await page.locator('.qa-stage').count()?'inspector':'runner')+'.png'});
      await page.close();
    }
  } finally {await browser.close();await fixture.close();}
});
