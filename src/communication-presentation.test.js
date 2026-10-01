import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderHumanFirst, shapeCommunicationResult, shapeToolResult } from "./communication-presentation.js";

test("human-first result preserves exact evidence underneath",()=>{
  const shaped=shapeToolResult({branch:"relay/x",head_sha:"a".repeat(40)},{
    health:"healthy",
    outcome:"the verification pass is complete",
    staff_id:"roman",
    next_step:"continue the release",
    needs_user:false
  });
  assert.equal(shaped.human.responsible_staff.display_name,"Roman");
  assert.equal(shaped.technical_evidence.tool_result.head_sha,"a".repeat(40));
  const text=renderHumanFirst(shaped);
  assert.match(text,/Roman/);
  assert.doesNotMatch(text,/relay\/x/);
  assert.doesNotMatch(text,/aaaaaaaaaa/);
});

test("QA-critical identity stays in human layer while unrelated machine detail stays subordinate",()=>{
  const shaped=shapeCommunicationResult({
    health:"waiting",
    outcome:"the preview is ready",
    staff_id:"margot",
    next_step:"review the preview",
    needs_user:true,
    qa:{
      surface:"Today card",
      intended_result:"pulse reads clearly",
      evidence_identity:"preview 123",
      checks:["pulse is visible","labels are lowercase"]
    },
    technical_evidence:{head_sha:"b".repeat(40)}
  });
  const text=renderHumanFirst(shaped);
  assert.match(text,/preview 123/);
  assert.doesNotMatch(text,/bbbbbbbbbb/);
});

test("communication eval fixtures stay plain-language staff-aware and preserve blockers",async()=>{
  const raw=await readFile(new URL("../test/communication-evals/fixtures.json",import.meta.url),"utf8");
  const fixtures=JSON.parse(raw);
  for(const item of fixtures){
    const shaped=shapeCommunicationResult({...item.human,technical_evidence:item.technical_evidence});
    const rendered=renderHumanFirst(shaped);
    const lower=rendered.toLowerCase();
    for(const expected of item.expect.contains) assert.equal(lower.includes(expected.toLowerCase()),true,item.name+" missing "+expected);
    for(const hidden of item.expect.omits) assert.equal(rendered.includes(hidden),false,item.name+" leaked technical detail");
    assert.deepEqual(shaped.technical_evidence,item.technical_evidence,item.name+" lost technical evidence");
  }
});
