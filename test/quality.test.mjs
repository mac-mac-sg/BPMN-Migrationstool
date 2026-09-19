import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../public/quality.js',import.meta.url),'utf8')+'\nglobalThis.q=ProcessQuality;',ctx);const q=ctx.q;
const model=(nodes,edges)=>({lanes:[{id:'l',name:'Team'}],nodes:nodes.map(([id,type])=>({id,type,lane:'l',label:id})),edges:edges.map(([source,target,label],i)=>({id:'e'+i,source,target,label}))});
test('disconnected branch is reported without inventing a gateway or connection',()=>{
 const m=model([['s','startEvent'],['a','userTask'],['z','userTask'],['e','endEvent']],[['s','a'],['a','e']]);const before=JSON.stringify(m);assert.ok(q.inspect(m).some(f=>f.code==='unreachable'&&f.nodeId==='z'));assert.equal(JSON.stringify(m),before);
});
test('rework layering puts the review before its decision and retains backward flow',()=>{
 const m=model([['s','startEvent'],['a','userTask'],['g','exclusiveGateway'],['b','userTask'],['e','endEvent']],[['s','a'],['a','g'],['g','b','Nein'],['b','a'],['g','e','Ja']]);const {col,back}=q.layers(m);assert.ok(col.s<col.a&&col.a<col.g&&col.g<col.b);assert.ok(back.has('e3'));assert.equal(q.inspect(m).filter(f=>f.level==='error').length,0);
});
test('parallel paths align and merge after both branches',()=>{
 const m=model([['s','startEvent'],['g','parallelGateway'],['a','userTask'],['b','userTask'],['j','parallelGateway'],['e','endEvent']],[['s','g'],['g','a'],['g','b'],['a','j'],['b','j'],['j','e']]);const {col}=q.layers(m);assert.equal(col.a,col.b);assert.ok(col.j>col.a);assert.equal(q.inspect(m).filter(f=>f.level==='error').length,0);
});
test('boundary timeout is reachable; multiple starts are retained',()=>{
 const m=model([['s','startEvent'],['s2','startEvent'],['a','userTask'],['x','userTask'],['e','endEvent']],[['s','a'],['s2','a'],['a','e'],['x','e']]);m.nodes[2].boundaryEvents=[{id:'timer',type:'timer',target:'x'}];const before=JSON.stringify(m);assert.equal(q.inspect(m).filter(f=>f.level==='error').length,0);assert.equal(JSON.stringify(m),before);
});
test('missing conditions and closed cycles are reported',()=>{
 const m=model([['s','startEvent'],['g','exclusiveGateway'],['a','userTask'],['e','endEvent']],[['s','g'],['g','a'],['g','e','Nein'],['a','a']]);const f=q.inspect(m);assert.ok(f.some(x=>x.code==='conditions'));assert.ok(f.some(x=>x.code==='no-end'&&x.nodeId==='a'));
});
test('ambiguous IDs and broken references fail without repair',()=>{
 const m=model([['s','startEvent'],['e','endEvent']],[['s','absent']]);assert.throws(()=>q.assertModel(m));m.edges[0].target='e';m.nodes[1].id='s';assert.throws(()=>q.assertModel(m));
});
