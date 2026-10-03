import test from 'node:test';
import assert from 'node:assert/strict';
import { callSkills, skillsTool } from './skills-service.js';
import { SKILL_BUNDLES } from './skills-bundles.js';
import { createSkillsRuntime } from './skills-runtime.js';
import { createSkillRegistry } from './skills-registry.js';
import { augmentToolList } from './relay-entry.js';
const one = () => structuredClone(SKILL_BUNDLES.find(x => x.manifest.id === 'relay.supporting.release'));
test('real authored packs are exposed through one registered tool and byte-verified at read/vendor time', async () => {
 assert.ok(augmentToolList([]).some(x=>x.name===skillsTool.name));
 const catalog = await callSkills({action:'catalog'});assert.equal(catalog.manifests.length,28);
 for(const word of ['engineering','research','documentation','release','qa','accessibility','security','github','cloudflare']) assert.ok(catalog.manifests.some(x=>x.id==='relay.supporting.'+word));
 for(const bundle of SKILL_BUNDLES) {
  const result = await callSkills({action:'audit',id:bundle.manifest.id,capabilities:['figma'],max_context:32768});assert.equal(result.audit[0].integrity_verified,true);
 }
 const exported=await callSkills({action:'vendor',id:one().manifest.id});assert.equal(exported.installed,false);assert.equal(exported.bundles[0].files[0].text,one().text);
 const corrupt=one();corrupt.text+='changed';await assert.rejects(callSkills({action:'read',id:corrupt.manifest.id},[corrupt]),/integrity/);
 await assert.rejects(callSkills({action:'read',id:'relay.platforms.figma'}),/capability/);
});
test('dependency closure is atomic under budget, capabilities, cycles and direct load', async()=>{
 const base=one(),dep=one();dep.manifest.id='relay.dependency';dep.manifest.tags=[];
 base.manifest.dependencies=[dep.manifest.id];
 const rt=createSkillsRuntime({manifests:[base.manifest,dep.manifest],loader:async m=>m.id===base.manifest.id?base:dep});
 const resolved=rt.resolve({intent_tags:['release'],max_context:32768});assert.deepEqual(resolved.selected.map(x=>x.id),['relay.dependency',base.manifest.id]);
 await assert.rejects(rt.load([{id:base.manifest.id}]),/dependency/);
 assert.equal(rt.resolve({intent_tags:['release'],max_context:base.manifest.context_budget}).selected.length,0);
 const gated=structuredClone(dep);gated.manifest.required_capabilities=['missing'];
 const blocked=createSkillsRuntime({manifests:[base.manifest,gated.manifest],loader:async()=>base});assert.equal(blocked.resolve({intent_tags:['release']}).selected.length,0);
 assert.throws(()=>createSkillRegistry([base.manifest]),/missing skill dependency/);
 dep.manifest.dependencies=[base.manifest.id];assert.throws(()=>createSkillRegistry([base.manifest,dep.manifest]),/cyclic/);
});
test('private packs cannot escape project scope and input paths/actions fail closed',async()=>{
 const privateBundle=one();Object.assign(privateBundle.manifest,{origin:'project-private',project:'field'});
 assert.equal((await callSkills({action:'catalog'},[privateBundle])).manifests.length,0);
 await assert.rejects(callSkills({action:'read',id:privateBundle.manifest.id},[privateBundle]),/scope/);
 await assert.rejects(callSkills({action:'exec',id:'../../secrets'}));
 const runtime=createSkillsRuntime({manifests:[privateBundle.manifest],loader:async()=>privateBundle});await assert.rejects(runtime.load([{id:privateBundle.manifest.id}]),/project gate/);
});
