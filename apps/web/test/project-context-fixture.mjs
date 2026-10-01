import http from 'node:http';
import { webAssets } from '../generated.js';

export async function contextFixture({ port = 0 } = {}) {
  const controls = { failField: false, failVisual: false, holdVisual: false, releaseVisual: null };
  const now = new Date().toISOString();
  const projects = [{ id: 'relay', name: 'relay' }, { id: 'field', name: 'field' }];
  const progress = {
    relay: [{ assignment: 'relay-build', goal: 'Make project activity clear', state: 'working', stage: 'implementation', next_action: 'Review the current website fixes', last_meaningful_progress_at: now, events: [] }, { assignment: 'relay-review', goal: 'Review the current website', state: 'waiting-for-human', stage: 'review', waiting_reason: 'A visual decision is waiting', last_meaningful_progress_at: now, events: [] }],
    field: [{ assignment: 'field-check', goal: 'Verify saved project progress', state: 'waiting-on-external-system', stage: 'checks', waiting_reason: 'A check is still running', last_meaningful_progress_at: now, events: [] }]
  };
  const workers = [{ id: 'relay', enabled: true, runtime: { status: 'idle', last_run_at: now, next_run_at: new Date(Date.now() + 3600000).toISOString(), last_summary: 'Website checks recorded.' } }, { id: 'field', enabled: true, runtime: { status: 'failed', last_run_at: now, last_error: 'Project check needs recovery.', last_summary: 'Saved project check reported a problem.' } }];
  const evidence = projects.map((project, index) => ({ evidence_id: 'vis_context-capture-' + project.id, captured_at: now, step_label: project.name + ' current preview', screenshot_url: '/api/visual/vis_context-capture-' + project.id + '/image', context: { project: project.id, environment: 'preview', commit_sha: String(index + 1).repeat(40) } }));
  const requests = [];
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==', 'base64');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push(url.pathname + url.search);
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    const asset = webAssets[url.pathname];
    if (asset) { res.setHeader('Content-Type', asset.type); return res.end(asset.text); }
    if (url.pathname === '/api/projects') return json({ projects });
    if (url.pathname === '/api/workers') return json(workers);
    const detail = url.pathname.match(/^\/api\/projects\/(relay|field)$/);
    if (detail) return json({ project: projects.find(p => p.id === detail[1]), coordination: { claims: progress[detail[1]].map(p => ({ id: p.assignment, state: 'active' })) } });
    if (/^\/api\/projects\/(relay|field)\/icon$/.test(url.pathname)) return json({ status: 'unavailable' });
    const work = url.pathname.match(/^\/api\/progress\/(relay|field)$/);
    if (work) return controls.failField && work[1] === 'field' ? json({ error: 'fixture: field provider unavailable' }, 503) : json({ project: work[1], progress: progress[work[1]].filter(p => !url.searchParams.get('assignment') || p.assignment === url.searchParams.get('assignment')), queue: [] });
    if (url.pathname === '/api/visual') {
      if (controls.holdVisual) await new Promise(resolve => { controls.releaseVisual = resolve; });
      if (controls.failVisual) return json({ error: 'fixture: captures unavailable' }, 503);
      return json({ evidence: evidence.filter(p => !url.searchParams.get('project') || p.context.project === url.searchParams.get('project')) });
    }
    if (url.pathname.endsWith('/image')) { res.setHeader('Content-Type', 'image/png'); return res.end(pixel); }
    if (url.pathname.endsWith('/qa')) return json({ review: null, questions: [] });
    if (url.pathname.endsWith('/live')) return json({ live: { active: false } });
    return json({ error: 'fixture route unavailable' }, 404);
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { origin: 'http://127.0.0.1:' + server.address().port, controls, requests, close: () => new Promise(resolve => server.close(resolve)) };
}
