import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFeedbackBrowser, feedbackBindingForEvidence } from './feedback-browser.js';
const request=(body,headers={},method='POST')=>new Request('https://relay.loew.fi/api/feedback/submit',{method,headers:{'Content-Type':'application/json',Origin:'https://relay.loew.fi',...headers},...(method==='POST'?{body}: {})});
test('browser feedback enforces authenticated gateway, same origin and bounded JSON',async()=>{
  assert.equal((await handleFeedbackBrowser(request('{}'),{})).status,403);
  const options={authenticated:true,api:()=>{throw Error('must not reach provider');}};
  assert.equal((await handleFeedbackBrowser(request('{}',{Origin:'https://evil.example'}),{},options)).status,403);
  assert.equal((await handleFeedbackBrowser(request('{'),{},options)).status,400);
  assert.equal((await handleFeedbackBrowser(request('x'.repeat(16385)),{},options)).status,413);
  assert.equal((await handleFeedbackBrowser(request('{"authenticated":true}'),{},options)).status,400);
  assert.equal((await handleFeedbackBrowser(request(null,{},'GET'),{},options)).status,405);
  assert.equal((await feedbackBindingForEvidence({context:{project:'relay'}},{},options.api)).available,false);
});
