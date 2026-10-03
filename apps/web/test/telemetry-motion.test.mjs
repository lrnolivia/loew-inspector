import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from 'playwright';

test('telemetry updates interpolate without remounts or layout-width animation', () => {
  const component = readFileSync(new URL('../src/components/LiveTelemetry.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.ok(component.includes('useTelemetryMotion('));
  assert.ok(!/strong[^>]*key=/.test(component));
  assert.ok(component.includes('transform:`scaleX('));
  assert.ok(!/transition:width 850ms/.test(css));
  assert.ok(!/animation:telemetry-value/.test(css));
});

test('telemetry browser motion handles interruption, reduced motion and first observations', async () => {
  const source = buildSync({
    stdin: {
      contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{useTelemetryMotion}from'./useTelemetryMotion';
function Probe(){const[target,setTarget]=useState([10,100]);const[enabled,setEnabled]=useState(true);
window.change=setTarget;window.enable=setEnabled;const value=useTelemetryMotion(target,enabled);
return <output data-values={JSON.stringify(value)}>{value.join(',')}</output>;}
createRoot(document.getElementById('root')).render(<Probe/>);`,
      resolveDir: fileURLToPath(new URL('../src/components', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife',
  }).outputFiles[0].text;
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({content:source});
    const values = () => page.locator('output').evaluate(node => JSON.parse(node.dataset.values));
    await page.waitForFunction(() => Boolean(window.change));
    assert.deepEqual(await values(), [10,100]);
    const samples = await page.evaluate(async () => {
      const read=()=>JSON.parse(document.querySelector('output').dataset.values);
      window.change([90,20]);
      await new Promise(resolve=>setTimeout(resolve,180));
      const middle=read();
      window.change([30,60]);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const interrupted=read();
      await new Promise(resolve=>setTimeout(resolve,800));
      return {middle,interrupted,final:read()};
    });
    assert.ok(samples.middle[0]>10 && samples.middle[0]<90);
    assert.ok(samples.middle[1]>20 && samples.middle[1]<100);
    assert.ok(Math.abs(samples.interrupted[0]-samples.middle[0])<15);
    assert.deepEqual(samples.final,[30,60]);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>window.change([70,40]));
    await page.waitForFunction(()=>JSON.parse(document.querySelector('output').dataset.values)[0]===70);
    assert.deepEqual(await values(),[70,40]);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>window.enable(false));
    await page.evaluate(()=>window.change([5,80]));
    await page.waitForFunction(()=>JSON.parse(document.querySelector('output').dataset.values)[0]===5);
    await page.evaluate(()=>{window.change([50,10]);window.enable(true);});
    await page.waitForFunction(()=>JSON.parse(document.querySelector('output').dataset.values)[0]===50);
    assert.deepEqual(await values(),[50,10]);
  } finally { await browser.close(); }
});
