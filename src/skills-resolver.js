function asSet(value){return new Set(Array.isArray(value)?value:[]);}
function rank(manifest,{intent_tags,platform,staff_id,project}){
  let score=0; const reasons=[];
  const tags=asSet(manifest.tags);
  for(const tag of intent_tags) if(tags.has(tag)){score+=4;reasons.push(`tag:${tag}`);}
  if(platform&&manifest.platforms.includes(platform)){score+=3;reasons.push(`platform:${platform}`);}
  if(staff_id&&manifest.staff_affinities.includes(staff_id)){score+=2;reasons.push(`staff:${staff_id}`);}
  if(project&&manifest.origin==="project-private"&&manifest.project===project){score+=5;reasons.push(`project:${project}`);}
  return {score,reasons};
}

export function resolveSkills(registry,{intent_tags=[],platform=null,staff_id=null,project=null,capabilities=[],max_context=8192,max_skills=8}={}){
  const available=asSet(capabilities);
  const accepted=[]; const rejected=[];
  for(const manifest of registry.list()){
    if(manifest.origin==="project-private"&&manifest.project!==project){
      rejected.push({id:manifest.id,reason:"project-mismatch"}); continue;
    }
    const missing=manifest.required_capabilities.filter(x=>!available.has(x));
    if(missing.length){rejected.push({id:manifest.id,reason:"missing-capability",missing});continue;}
    if(platform&&!manifest.platforms.includes("generic")&&!manifest.platforms.includes(platform)){
      rejected.push({id:manifest.id,reason:"platform-mismatch"});continue;
    }
    const ranked=rank(manifest,{intent_tags,platform,staff_id,project});
    if(ranked.score===0){rejected.push({id:manifest.id,reason:"no-intent-match"});continue;}
    accepted.push({manifest,score:ranked.score,reasons:ranked.reasons});
  }
  accepted.sort((a,b)=>b.score-a.score||a.manifest.id.localeCompare(b.manifest.id));
  const selected=[]; let used=0;
  for(const item of accepted){
    if(selected.length>=max_skills) break;
    if(used+item.manifest.context_budget>max_context){rejected.push({id:item.manifest.id,reason:"context-budget"});continue;}
    used+=item.manifest.context_budget;
    selected.push({
      id:item.manifest.id,
      version:item.manifest.version,
      score:item.score,
      reasons:item.reasons,
      context_budget:item.manifest.context_budget,
      extends:item.manifest.extends||null
    });
  }
  return Object.freeze({selected,rejected,context_used:used,context_limit:max_context});
}
