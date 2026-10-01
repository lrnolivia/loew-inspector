import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { contextFixture } from './project-context-fixture.mjs';

async function settle(page, inspector) {
  if(inspector) await page.locator('#review-list[data-summary-state=ready]').waitFor();
  else {await page.locator('.operator-connection[data-tone=good]').waitFor();await page.locator('[data-progress-notice]').waitFor({state:'detached'});}
}

test('site motion bridges moving controls and Inspector effects, with strict mobile budget and global Calm', async () => {
  const fixture=await contextFixture(),browser=await chromium.launch();
  try {
    for(const width of [1440,390,320]) for(const inspector of [false,true]) {
      const page=await browser.newPage({viewport:{width,height:844},colorScheme:'dark',reducedMotion:'no-preference'});
      await page.goto(fixture.origin+(inspector?'/inspector#review':'/#/today'));await settle(page,inspector);
      if(width<=900) {
        assert.ok((await page.locator('.operator-topbar').boundingBox()).height<=140,'compact header with top nav');
        await page.locator('.presentation-menu > summary').click();await page.locator('[name=preset]').selectOption('bottom');await page.keyboard.press('Escape');
        const header=await page.locator('.operator-topbar').boundingBox();assert.ok(header.height<=61,'brand/tools row with bottom nav');
        const brand=await page.locator('.operator-brand').boundingBox(),brush=await page.locator('.presentation-menu > summary').boundingBox();assert.ok(Math.abs(brand.y+brand.height/2-brush.y-brush.height/2)<=2);
      }
      const observed=await page.evaluate(async () => {
        // Real transition events on existing interactive glyph layers.
        const nodes=[...document.querySelectorAll('.signal-mark')];
        // Observe the event itself; wall-clock sampling races under aggregate load.
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>{document.removeEventListener('transitionrun',onRun);reject(Error('Moving glyph transition did not start'));},1500);
          function onRun(event) {if(event.propertyName==='transform' && nodes.includes(event.target)) {clearTimeout(timer);document.removeEventListener('transitionrun',onRun);resolve();}}
          document.addEventListener('transitionrun',onRun);
          for(const node of nodes) {getComputedStyle(node).transform;node.style.transition='transform 300ms';node.style.transform='translateY(-3px)';}
        });
        const effects=nodes.flatMap(node=>node.getAnimations()).filter(a=>a.id==='relay-motion-blur');
        const frames=effects.map(a=>a.effect.getKeyframes());
        const durations=effects.map(a=>a.effect.getTiming().duration);
        await Promise.all(effects.map(a=>a.finished));
        return {count:effects.length,frames,durations,rest:nodes.map(node=>getComputedStyle(node).filter)};
      });
      assert.ok(observed.count>0 && observed.count<=(width<=900?2:4));
      assert.ok(observed.frames.every(frames=>frames.some(frame=>/blur/.test(frame.filter)) && frames.at(-1).filter==='none'));
      assert.ok(observed.durations.every(duration=>duration<=(width<=900?240:400)));
      assert.ok(observed.rest.every(filter=>filter==='none'),'no resting text/filter smear');
      await page.locator('.presentation-menu > summary').click();await page.locator('.presentation-customize > summary').click();await page.locator('[name=motion]').selectOption('calm');
      const calm=await page.evaluate(() => {
        // Important legacy QA animation plus loading/status loops must all stop.
        const edge=document.createElement('div');edge.className='qa-companion qa-edge-wiggle';edge.dataset.docked='left';document.body.append(edge);
        const light=document.createElement('span');light.dataset.signal='working';light.innerHTML='<span class="status-light"></span>';document.body.append(light);
        const skeleton=document.createElement('span');skeleton.className='skeleton-block';document.body.append(skeleton);
        const names=[edge,skeleton,light.firstChild].map(node=>getComputedStyle(node).animationName);names.push(getComputedStyle(light.firstChild,'::after').animationName);
        const result={names,animations:document.getAnimations().filter(a=>a.playState==='running').length};edge.remove();light.remove();skeleton.remove();return result;
      });
      assert.ok(calm.names.every(name=>name==='none'));assert.equal(calm.animations,0);
      await page.locator('[name=motion]').selectOption('full');await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await page.locator('.signal-card').first().evaluate(node=>getComputedStyle(node).animationName),'none');
      assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);
      await page.close();
    }
  } finally {await browser.close();await fixture.close();}
});
