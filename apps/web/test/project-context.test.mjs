import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { contextFixture } from './project-context-fixture.mjs';

async function settle(page, inspector = false) {
  if (inspector) await page.locator('#review-list[data-summary-state="ready"]').waitFor();
  else { await page.locator('.operator-connection[data-tone="good"]').waitFor(); await page.locator('[data-progress-notice]').waitFor({ state: 'detached' }); }
}
async function select(page, id, inspector = false) {
  if (inspector) { const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/visual"); await page.locator(`#project-tabs [data-project-id="${id}"]`).click(); await response; }
  else { await page.getByRole('button', { name: id || 'all projects', exact: true }).click(); await page.getByRole('button', { name: id || 'all projects', exact: true }).and(page.locator('[aria-pressed="true"]')).waitFor(); }
  await settle(page, inspector);
}
async function summary(page, label) { return page.locator('.signal-card').filter({ has: page.locator('.signal-label', { hasText: label }) }).locator('strong').textContent(); }

async function verifySurface(page, feature, count) {
  const cards = page.locator('.signal-card');
  assert.equal(await cards.count(), count);
  const boxes = await cards.evaluateAll(nodes => nodes.map(n => ({ rect: n.getBoundingClientRect().toJSON(), style: getComputedStyle(n), before: getComputedStyle(n, '::before').content })).map(({rect, style, before}) => ({rect, before, borderLeft:style.borderLeftWidth, borderTop:style.borderTopWidth})));
  const grid = await page.locator('.signal-track').boundingBox();
  for (const box of boxes) {
    assert.ok(box.rect.width > 0 && box.rect.height > 0);
    assert.ok(box.rect.x >= grid.x - 1 && box.rect.x + box.rect.width <= grid.x + grid.width + 1, 'every metric fits without carousel scrolling');
    assert.equal(box.before, 'none');
    assert.equal(box.borderLeft, '0px'); assert.equal(box.borderTop, '0px');
  }
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].rect.y > boxes[i-1].rect.y || boxes[i].rect.x > boxes[i-1].rect.x, 'stable accessible reading order');
  assert.equal(await page.locator('.signal-mark svg.relay-glyph').count(), count);
  assert.equal(await page.locator('.signal-mark img').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const order = await page.locator('.workspace-context, .feature-heading:visible, .project-context:visible, .signal-deck:visible').evaluateAll(nodes => nodes.map(n => ({cls:n.className,top:n.getBoundingClientRect().top})));
  assert.ok(order[0].cls.includes('workspace-context') && order[1].cls.includes('feature-heading') && order[2].cls.includes('project-context') && order[3].cls.includes('signal-deck'));
  assert.ok(order[0].top < order[1].top && order[1].top < order[2].top && order[2].top < order[3].top);
  const colors = await page.evaluate(() => ['canvas','surface','contrast','raised','panel-cap'].map(role => getComputedStyle(document.documentElement).getPropertyValue('--color-' + role).trim().toLowerCase()));
  assert.deepEqual(colors, ['#151412','#1c1b19','#211f1d','#292724','#514a45']);
  const iconFile = feature === 'night-shift' ? 'nightshift-icon.png.png' : feature + '-icon.png';
  const canonical = 'data:image/png;base64,' + (await readFile(new URL('../../../icons/' + iconFile, import.meta.url))).toString('base64');
  assert.equal(await page.locator('.feature-heading:visible .feature-mark').getAttribute('src'), canonical);
  assert.match(await page.locator('.feature-heading:visible h1').evaluate(n=>getComputedStyle(n).fontFamily), /Momo Trust Display/);
  assert.equal(await page.locator('.terra-accent span').count(), 5);
  assert.equal(await cards.first().evaluate(n=>getComputedStyle(n).animationName), 'none', 'reduced motion disables mosaic entrance');
}

test('built website scopes every summary and preserves explicit project context through document navigation and history', async () => {
  const fixture = await contextFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 900, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(fixture.origin + '/#/today'); await settle(page);
      assert.equal(await page.getByRole('button',{name:'all projects',exact:true}).getAttribute('aria-pressed'),'true');
      assert.equal(await summary(page,'moving'),'1'); assert.equal(await summary(page,'automatic checks'),'2');
      await verifySurface(page,'today',4); assert.equal(await page.locator('[data-signal-id="needs"] .glyph-review').count(),1,'needs-you uses review rather than error glyph');
      await select(page,'field'); assert.equal(await summary(page,'moving'),'0'); assert.equal(await summary(page,'automatic checks'),'1');
      assert.equal(await page.locator('.attention-card').count(),0); assert.equal(await page.locator('.automation-row').count(),1);
      await page.getByRole('link',{name:/^runner/}).click(); await page.getByRole('heading',{name:'runner',exact:true,level:1}).waitFor(); await settle(page);
      assert.equal(await page.locator('.work-item').count(),1); assert.equal(await summary(page,'waiting for a response'),'1');
      await verifySurface(page,'runner',4); const destination=new URL(await page.locator('.work-item .work-open').first().getAttribute('href'));assert.equal(destination.origin,'https://ctrl.loew.fi');await page.goto(fixture.origin+destination.pathname+destination.search+destination.hash); await page.locator('.work-detail').waitFor({timeout:5000}).catch(async e=>{throw new Error(JSON.stringify({width,url:page.url(),errors,text:await page.locator('body').innerText()}),{cause:e})});
      await page.getByRole('link',{name:'← runner'}).click(); await page.getByRole('heading',{name:'runner',exact:true,level:1}).waitFor(); await settle(page);
      assert.ok(page.url().endsWith('#/runner?project=field'));
      await page.getByRole('link',{name:/^night shift/}).click(); await page.getByRole('heading',{name:'night shift',exact:true,level:1}).waitFor(); await settle(page);
      assert.equal(await summary(page,'included projects'),'1'); assert.equal(await summary(page,'needs attention'),'1'); assert.equal(await page.locator('.work-item').count(),1);
      await verifySurface(page,'night-shift',4); await page.getByRole('link',{name:/^inspector/}).click(); await settle(page,true); assert.ok(page.url().endsWith('/inspector#review?project=field'));
      assert.equal(await page.locator('#inspector-signal-needs').textContent(),'1'); assert.equal(await page.locator('.review-row').count(),1);
      await verifySurface(page,'inspector',2);
      await select(page,'',true); assert.equal(await page.locator('#inspector-signal-needs').textContent(),'2');
      await page.reload(); await settle(page,true); assert.equal(await page.locator('#project-tabs [data-project-id=""]').getAttribute('aria-selected'),'true');
      await select(page,'relay',true); await page.reload(); await settle(page,true); assert.equal(await page.locator('.review-row').count(),1);
      await page.locator('[data-nav="today"]').click(); await settle(page); assert.ok(page.url().endsWith('#/today?project=relay'));
      await select(page,''); assert.equal(await summary(page,'automatic checks'),'2');
      await page.goBack(); await settle(page); assert.equal(await summary(page,'automatic checks'),'1');
      await page.goForward(); await settle(page); assert.equal(await summary(page,'automatic checks'),'2');
      await page.reload(); await settle(page); assert.equal(await page.getByRole('button',{name:'all projects',exact:true}).getAttribute('aria-pressed'),'true');
      assert.deepEqual(errors,[]); await page.close();
    }
    assert.ok(fixture.requests.every(path=> !path.startsWith('/api/progress/') || path.includes('?assignment=')), 'PR106 bounded assignment reads remain intact');
  } finally { await browser.close(); await fixture.close(); }
});

test('partial activity and failed Inspector reads remain honestly labelled instead of all-clear zeros', async () => {
  const fixture = await contextFixture(); fixture.controls.failField = true;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion:'reduce',colorScheme:'dark' });
    await page.goto(fixture.origin + '/#/today');
    await page.locator('[data-progress-notice]').filter({hasText:'Some project activity is unavailable.'}).waitFor();
    assert.equal(await summary(page,'moving'),'1+');
    await select(page,'relay'); assert.equal(await summary(page,'moving'),'1');
    await page.getByRole('button',{name:'field',exact:true}).click();
    await page.locator('[data-progress-notice]').filter({hasText:'Some project activity is unavailable.'}).waitFor();
    assert.equal(await summary(page,'needs you'),'pending'); assert.equal(await page.locator('.clear-card:has-text("You’re clear.")').count(),0);
    fixture.controls.holdVisual = true;
    await page.goto(fixture.origin + '/inspector#review?project=field'); await page.locator('#review-list .content-skeleton').waitFor();
    await page.waitForFunction(()=>document.querySelector('#inspector-signal-needs').textContent==='pending');
    fixture.controls.failVisual = true; fixture.controls.holdVisual = false; fixture.controls.releaseVisual();
    await page.locator('#review-list[data-summary-state="error"]').waitFor();
    await page.waitForFunction(()=>document.querySelector('#inspector-signal-needs').textContent==='unavailable');
    assert.equal(await page.locator('#inspector-signal-visible').textContent(),'unavailable');
  } finally { await browser.close(); await fixture.close(); }
});

// Presentation preferences affect rendering only and survive the existing document boundary.
test('compact navigation, full-height rail and local presentation presets remain usable', async () => {
  const fixture = await contextFixture(), browser = await chromium.launch({headless:true});
  try {
    for (const width of [320,390,900,1024,1440]) {
      const page = await browser.newPage({viewport:{width,height:844},colorScheme:'dark',reducedMotion:'reduce'});
      await page.goto(fixture.origin + '/#/today'); await settle(page);
      const name = page.locator('.operator-brand strong');
      assert.equal(await name.isVisible(), true); assert.equal(await name.textContent(),'relay');
      if(width > 900) {
        await page.mouse.move(width-1,400);
        assert.equal(await page.locator('.operator-nav .nav-copy').first().evaluate(n=>getComputedStyle(n).opacity),'0');
        assert.equal(await page.locator('.operator-brand').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(41, 39, 36)');
        await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
        const rail = await page.locator('.operator-topbar').boundingBox();
        assert.equal(Math.round(rail.y),4); assert.equal(Math.round(rail.height),840);
        await page.evaluate(()=>window.scrollTo(0,0));
      } else {
        const targets = await page.locator('.operator-nav > :is(a,button)').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
        assert.equal(targets.length,4);
        for(const target of targets) { assert.ok(target.width>=60 && target.height>=44); assert.ok(target.x>=0 && target.x+target.width<=width); }
        assert.equal(new Set(targets.map(n=>Math.round(n.y))).size,1,'four routes together');
        if(width<=760) assert.equal(new Set((await page.locator('.signal-card').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().y))))).size,2,'compact overview has two rows');
      }
      const menu = page.locator('.presentation-menu'); await menu.locator('> summary').click();
      await page.locator('[name=preset]').selectOption('rich');
      assert.equal(await page.locator('html').getAttribute('data-presentation-richness'),'rich');
      assert.match(await page.locator('[data-signal-id=moving] .signal-ratio').innerText(),/1 of 3 current work items/);
      assert.match(await page.locator('[data-signal-id=automatic] .signal-ratio').innerText(),/2 of 2 automatic checks/);
      assert.equal(await page.locator('.signal-ratio .ratio-value').first().evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
      await page.locator('.presentation-customize > summary').click();
      await page.locator('[name=motion]').selectOption('calm');
      assert.equal(await page.locator('[data-presentation-state]').textContent(),'Custom');
      await page.locator('[name=nav]').selectOption('bottom');
      await page.keyboard.press('Escape'); assert.equal(await menu.getAttribute('open'),null);
      await page.getByRole('link',{name:/^inspector/}).click(); await settle(page,true);
      assert.equal(await page.locator('html').getAttribute('data-presentation-richness'),'rich');
      assert.equal(await page.locator('html').getAttribute('data-presentation-nav'),'bottom');
      if(width<=900) {
        const nav = await page.locator('.operator-nav').boundingBox(); assert.ok(nav.y>700 && nav.y+nav.height<=845);
        const pill=await page.locator('.operator-nav').evaluate(node=>({radius:getComputedStyle(node).borderRadius,shadow:getComputedStyle(node).boxShadow,rect:node.getBoundingClientRect().toJSON(),targets:[...node.children].map(child=>child.getBoundingClientRect().toJSON()),clearance:parseFloat(getComputedStyle(document.querySelector('.operator-shell')).paddingBottom)}));
        assert.equal(pill.radius,'999px');assert.notEqual(pill.shadow,'none');
        assert.ok(pill.rect.x>=12 && pill.rect.right<=width-12 && 844-pill.rect.bottom>=12,'pill floats clear of viewport edges');
        assert.equal(pill.targets.length,4);assert.ok(pill.targets.every(target=>target.width>=60 && target.height>=44 && target.x>=pill.rect.x && target.right<=pill.rect.right));
        assert.ok(pill.clearance>=pill.rect.height+12,'scroll content clears the floating pill');
        await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
      await page.reload(); await settle(page,true);
      await page.locator('.presentation-menu > summary').click();
      await page.locator('[data-presentation-reset]').click();
      assert.equal(await page.locator('[name=preset]').inputValue(),'approved');
      assert.equal(await page.evaluate(()=>localStorage.getItem('relay-presentation')),null);
      await page.getByRole('button',{name:'Switch to light mode',exact:true}).click(); assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
      assert.equal(await page.locator('#app-settings').count(),0,'Refresh tools is on the Relay connection panel');
      await page.close();
    }
  } finally {await browser.close();await fixture.close();}
});

test('spring motion is finite and ends with sharp readable telemetry', async () => {
  const fixture = await contextFixture(), browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({colorScheme:'dark',reducedMotion:'no-preference'});
    await page.goto(fixture.origin+'/#/today');await settle(page);
    const motion = await page.locator('.signal-card').first().evaluate(node => ({name:getComputedStyle(node).animationName,duration:parseFloat(getComputedStyle(node).animationDuration),fill:getComputedStyle(node).animationFillMode}));
    assert.equal(motion.name,'signal-spring');assert.ok(motion.duration<=.5);assert.equal(motion.fill,'backwards');
    await page.locator('.signal-card').evaluateAll(async nodes=>{await Promise.all(nodes.flatMap(node=>node.getAnimations({subtree:true})).map(animation=>animation.finished));});
    assert.equal(await page.locator('.signal-card').first().evaluate(node=>getComputedStyle(node).filter),'none');
    await page.locator('.presentation-menu > summary').click();await page.locator('.presentation-customize > summary').click();
    await page.locator('[name=motion]').selectOption('calm');
    assert.equal(await page.locator('.signal-card').first().evaluate(node=>getComputedStyle(node).animationName),'none');
  } finally {await browser.close();await fixture.close();}
});

import {projectMembers} from '../../../packages/shared-ui/project-groups.js';
test('Inspector scopes evidence before the API result limit and preserves child identities',async()=>{
 assert.deepEqual(projectMembers('field'),['field']);assert.deepEqual(projectMembers('bazzite-custom'),['bazzite-custom','loew-shell']);assert.deepEqual(projectMembers('rtxforge'),['rtxforge','rtxforge-mfg']);
 const fixture=await contextFixture(),browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await page.goto(fixture.origin+'/inspector#review?project=field');await settle(page,true);assert.ok(fixture.requests.includes('/api/visual?project=field'));assert.equal(await page.locator('[data-work-key]').count(),1);assert.match(await page.locator('[data-work-key]').getAttribute('data-work-key'),/^field\//);await page.close();}finally{await browser.close();await fixture.close();}
});
