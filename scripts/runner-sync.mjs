import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = new Set(['completed','cancelled','superseded']);
export async function synchronizeProject(project, registration, record, api) {
  const repository = registration.repository;
  if (!/^[a-z0-9-]+$/.test(project) || !/^lrnolivia\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('Invalid registered project');
  const candidates = (record.claims || []).filter(claim => !terminal.has(claim.state) || (record.queue || []).some(item=>item.id===claim.id && item.state==='claimed'));
  const observations=[], recommendations=[];
  for (let offset=0;offset<Math.min(candidates.length,100);offset+=4) {
    const batch=await Promise.all(candidates.slice(offset,offset+4).map(async claim=>{
      const result={assignment:claim.id,owner:claim.owner,branch:claim.branch,record_state:claim.state,execution:'unobserved'};
      try {
        const pulls=claim.pr ? [await api(`/repos/${repository}/pulls/${claim.pr}`)] : await api(`/repos/${repository}/pulls?state=all&head=${encodeURIComponent(repository.split('/')[0]+':'+claim.branch)}&per_page=10`);
        if(!Array.isArray(pulls))throw Error('Invalid PR response');
        const pr=pulls.find(pr=>pr.head?.ref===claim.branch && pr.head?.repo?.full_name===repository && pr.base?.ref===registration.default_branch && pr.base?.repo?.full_name===repository);
        if(!pr){result.source='no_matching_pr';return result;}
        result.pr=pr.number;result.head_sha=pr.head.sha;result.pr_state=pr.merged?'merged':pr.state;
        result.merge_sha=pr.merge_commit_sha || null;
        const [checks,deployments]=await Promise.all([
          api(`/repos/${repository}/commits/${pr.head.sha}/check-runs?per_page=100`),
          api(`/repos/${repository}/deployments?sha=${pr.merged?pr.merge_commit_sha:pr.head.sha}&per_page=10`)
        ]);
        if(!Array.isArray(checks.check_runs)||!Array.isArray(deployments))throw Error('Invalid verification response');
        result.checks={complete:checks.total_count<=100,items:checks.check_runs.map(x=>({name:x.name,status:x.status,conclusion:x.conclusion,head_sha:x.head_sha,url:x.html_url}))};
        result.deployments=await Promise.all(deployments.map(async deployment=>{
          const statuses=await api(`/repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`);
          if(!Array.isArray(statuses))throw Error('Invalid deployment status');
          return {id:deployment.id,sha:deployment.sha,environment:deployment.environment,state:statuses[0]?.state||'unknown',url:statuses[0]?.environment_url||null,runtime_verified:false};
        }));
        result.source='observed';
        const queued=(record.queue||[]).find(item=>item.id===claim.id);
        const exactCompleted=claim.state==='completed' && claim.work_accounted && claim.merged_head_sha===pr.head.sha && claim.merge_commit_sha===pr.merge_commit_sha;
        if(pr.merged && queued?.state==='claimed') {
          const proposal={project,assignment:claim.id,owner:claim.owner,queue_owner:queued.owner,pr:pr.number,head_sha:pr.head.sha,merge_sha:pr.merge_commit_sha,
            action:exactCompleted && queued.owner===claim.owner?'reconcile-completed-queue':'inspect-merged-ownership',non_owning:true};
          result.recommendation={id:'sync_'+digest(proposal),...proposal};
        }
        // Paused, held and cancelled records are never reopened by synchronization.
        return result;
      } catch { return {...result,source:'unavailable',error:'Provider evidence incomplete; preserve coordination and retry on the next sync.'}; }
    }));
    for(const observation of batch){if(observation.recommendation){recommendations.push(observation.recommendation);delete observation.recommendation;}observations.push(observation);}
  }
  return {project,repository,observations,recommendations,truncated:candidates.length>100,model_calls:0,coordination_writes:0,worker_execution:false};
}

async function main() {
  const args=process.argv.slice(2);if(args.length && (args.length!==2||args[0]!=='--out'))throw Error('Usage: node scripts/runner-sync.mjs [--out path]');
  const api=async path=>JSON.parse(execFileSync('gh',['api',path],{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']}));
  const read=async path=>{const file=await api(`/repos/lrnolivia/relay/contents/${path}?ref=main`);return {sha:file.sha,value:JSON.parse(Buffer.from(file.content,'base64').toString('utf8'))};};
  const files=await api('/repos/lrnolivia/relay/contents/projects?ref=main');
  const projects=[];
  for(const file of files.filter(x=>x.type==='file'&&/^[a-z0-9-]+\.json$/.test(x.name))) {
    const project=file.name.slice(0,-5);
    try {
      const registration=(await read('projects/'+file.name)).value;
      if(!registration.managed || registration.coordination?.status!=='enabled')continue;
      const record=await read(registration.coordination.record);
      projects.push({record_sha:record.sha,...await synchronizeProject(project,registration,record.value,api)});
    } catch { projects.push({project,source:'unavailable',recommendations:[],coordination_writes:0}); }
  }
  const report={schema:1,checked_at:new Date().toISOString(),kind:'model-free-provider-sync',model_calls:0,projects};
  const text=JSON.stringify(report,null,2)+'\n';
  if(args[0])await writeFile(args[1],text);else process.stdout.write(text);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
