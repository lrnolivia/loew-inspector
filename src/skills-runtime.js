import { createSkillRegistry } from "./skills-registry.js";
import { auditSkillManifest } from "./skills-audit.js";
import { resolveSkills } from "./skills-resolver.js";

function overlayOrder(registry,selection,{project}){
  const out=[];
  for(const item of selection){
    out.push(item);
    if(project){
      for(const overlay of registry.overlaysFor(item.id,project)){
        if(!out.some(x=>x.id===overlay.id)) out.push({id:overlay.id,version:overlay.version,score:item.score+1,reasons:[...(item.reasons||[]),`overlay:${item.id}`],context_budget:overlay.context_budget,extends:item.id});
      }
    }
  }
  return out;
}

export function createSkillsRuntime({manifests=[],loader}={}){
  if(typeof loader!=="function") throw new Error("skills runtime requires a loader");
  const registry=createSkillRegistry(manifests);
  return Object.freeze({
    registry,
    resolve(context={}){
      const base=resolveSkills(registry,context);
      const selected=overlayOrder(registry,base.selected,context);
      const seen=new Set();
      const final=[]; let used=0;
      for(const item of selected){
        if(seen.has(item.id)) continue;
        const manifest=registry.get(item.id);
        if(!manifest) continue;
        if(used+manifest.context_budget>base.context_limit) continue;
        used+=manifest.context_budget; seen.add(item.id); final.push(item);
      }
      return Object.freeze({...base,selected:final,context_used:used});
    },
    async load(selection,{capabilities=[]}={}){
      const available=new Set(capabilities);
      const out=[];
      for(const item of selection){
        const manifest=registry.get(item.id);
        if(!manifest) throw new Error(`unknown skill: ${item.id}`);
        const audit=auditSkillManifest(manifest);
        if(!audit.ok) throw new Error(`skill audit blocked: ${item.id}`);
        const missing=manifest.required_capabilities.filter(x=>!available.has(x));
        if(missing.length) throw new Error(`skill capability gate failed: ${item.id}`);
        const bundle=await loader(manifest);
        if(!bundle||typeof bundle.text!=="string") throw new Error(`invalid skill bundle: ${item.id}`);
        if(Buffer.byteLength(bundle.text,"utf8")>manifest.context_budget*8) throw new Error(`skill bundle exceeds bounded load budget: ${item.id}`);
        out.push(Object.freeze({manifest,text:bundle.text}));
      }
      return out;
    }
  });
}
