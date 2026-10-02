import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { relayContextCardResource, relayStatusCardResource, contextCardModel } from './relay-chat-ui.js';
import { styleContextCard } from './relay-context-card-style.js';
import { contextCardBrandAssets } from '../apps/web/generated.js';

test('context styling preserves the byte-exact legacy consumer control', () => {
  assert.equal(createHash('sha256').update(relayStatusCardResource().text).digest('hex'), 'b6ac2036387ead1d9e9bd861c510752ec6c6fc9d0ae112e793932075fb0b332b');
  assert.doesNotMatch(relayStatusCardResource().text, /data-context-card-parity|CARD_BRAND_ASSETS/);
});
test('context card embeds canonical artwork and Momo without external fonts', () => {
  const html = relayContextCardResource().text;
  for (const name of ['relay','runner','inspector','night-shift']) assert.ok(html.includes(contextCardBrandAssets[name]));
  assert.match(html, /data:font\/woff;base64,/);
  assert.match(html, /SIL OPEN FONT LICENSE Version 1.1/);
  assert.match(html, /font-family:"Momo Trust Display"/);
  assert.match(html, /id="feature-kicker"[^>]*hidden aria-hidden="true"/);
  assert.ok(html.indexOf('id="diag"') > html.indexOf('<details id="details"'));
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.ok(Buffer.byteLength(html) < 512 * 1024, 'self-contained card remains bounded');
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /visibilitychange/);
});
test('no reported percentage is represented as unknown, never invented zero', () => {
  for (const value of [undefined,null,'',' ',false,true,{},'unknown',-1,101,Infinity]) {
    const model = contextCardModel({project:'relay', progress_percent:value});
    assert.equal(model.percent,null,JSON.stringify(value));
    assert.notEqual(model.metric,'0%');
  }
  assert.equal(contextCardModel({project:'relay',progress_percent:0}).percent,0);
  assert.equal(contextCardModel({project:'relay',progress_percent:'42'}).percent,42);
});
test('asset omissions fail the build instead of shipping broken brand images', () => {
  assert.throws(() => styleContextCard('',{}), /Missing bundled card brand/);
  assert.throws(() => styleContextCard('',{...contextCardBrandAssets,relay:'https://untrusted.example/icon.png'}), /Missing bundled card brand/);
});
