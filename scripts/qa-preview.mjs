import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const editor = new URL(process.env.EDITOR_URL);
const canvas = new URL(process.env.CANVAS_URL);
const sha = process.env.HEAD_SHA || '';
const requestId = process.env.REQUEST_ID || '';
const suffixes = [
  ['.field-preview.loew.fi', editor],
  ['.canvas-preview.loew.fi', canvas],
];

if (!/^[a-f0-9]{40}$/i.test(sha) || !/^[a-zA-Z0-9._-]{1,80}$/.test(requestId)) {
  throw new Error('A full PR head SHA and safe request ID are required');
}
for (const [suffix, url] of suffixes) {
  if (url.protocol !== 'https:' || !url.hostname.endsWith(suffix) ||
      url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`Invalid Preview URL for ${suffix}`);
  }
}
const editorName = editor.hostname.slice(0, -suffixes[0][0].length);
const canvasName = canvas.hostname.slice(0, -suffixes[1][0].length);
if (!editorName || editorName !== canvasName) {
  throw new Error('Editor and Canvas must use the same Preview deployment name');
}
if (!/^[a-f0-9]{8}$/.test(editorName)) {
  throw new Error('Use matching immutable deployment URLs from the Cloudflare PR comment');
}

const result = {
  request_id: requestId,
  head_sha: sha,
  editor_url: editor.href,
  canvas_url: canvas.href,
  checks: {},
};

async function inspect(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  return {
    status: response.status,
    content_type: response.headers.get('content-type') || '',
    headers: Object.fromEntries([
      'cross-origin-resource-policy', 'cross-origin-opener-policy',
      'cross-origin-embedder-policy', 'origin-agent-cluster', 'cf-ray',
    ].map(key => [key, response.headers.get(key)])),
    body_prefix: (await response.text()).slice(0, 160),
  };
}

await mkdir('qa-evidence', { recursive: true });
let browser;
try {
  result.checks.editor_http = await inspect(new URL('/builder/noauth', editor));
  result.checks.canvas_http = await inspect(canvas);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message.slice(0, 300)));
  page.on('requestfailed', request => browserErrors.push(`${request.url()} ${request.failure()?.errorText}`.slice(0, 300)));
  const response = await page.goto(new URL('/builder/noauth', editor).href, {
    waitUntil: 'domcontentloaded', timeout: 20000,
  });
  await page.waitForTimeout(5000);
  try {
    await page.getByText('Starting canvas', { exact: true }).waitFor({ state: 'hidden', timeout: 15000 });
  } catch { /* Record the unresolved loading state below. */ }
  await page.screenshot({ path: 'qa-evidence/editor.png', fullPage: true });
  result.checks.editor_browser = {
    status: response?.status() ?? 0,
    final_url: page.url(),
    title: await page.title(),
    starting_canvas_visible: await page.getByText('Starting canvas', { exact: true }).isVisible(),
    errors: browserErrors.slice(0, 10),
  };
  const canvasPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const canvasResponse = await canvasPage.goto(canvas.href, {
    waitUntil: 'domcontentloaded', timeout: 20000,
  });
  await canvasPage.screenshot({ path: 'qa-evidence/canvas.png', fullPage: true });
  result.checks.canvas_browser = {
    status: canvasResponse?.status() ?? 0,
    title: await canvasPage.title(),
  };
} finally {
  if (browser) await browser.close();
  console.log('LOEW_QA_RESULT=' + JSON.stringify(result));
}

const canvasHeaders = result.checks.canvas_http.headers;
const passed = result.checks.editor_browser.status === 200 &&
  !result.checks.editor_browser.starting_canvas_visible &&
  result.checks.canvas_http.status === 200 &&
  result.checks.canvas_http.content_type.includes('text/html') &&
  result.checks.canvas_browser.status === 200 &&
  result.checks.canvas_browser.title === 'Canvas Sandbox' &&
  canvasHeaders['cross-origin-resource-policy'] === 'cross-origin' &&
  canvasHeaders['cross-origin-opener-policy'] === 'same-origin' &&
  canvasHeaders['cross-origin-embedder-policy'] === 'credentialless' &&
  canvasHeaders['origin-agent-cluster'] === '?1';

if (!passed) process.exitCode = 1;
