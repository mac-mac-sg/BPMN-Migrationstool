import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
async function run(config,fn){const server=createApp(config);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}}
const post=(body,extra={})=>({method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
test('Homepage, config state and unavailable KI without secret',()=>run({apiKey:''},async url=>{
 assert.equal((await fetch(url)).status,200);
 assert.deepEqual(await (await fetch(url+'/api/health')).json(),{configured:false});
 assert.equal((await fetch(url+'/api/messages',post({}))).status,503);
 assert.equal((await fetch(url+'/.env')).status,404);
}));
test('Proxy authenticates server-side, pins model and rejects foreign origins',()=>run({apiKey:'test-secret',model:'configured-model',upstream:async(url,options)=>{
 assert.equal(options.headers['x-api-key'],'test-secret');const body=JSON.parse(options.body);assert.equal(body.model,'configured-model');assert.equal(body.max_tokens,16000);
 return Response.json({content:[{type:'text',text:'{}'}],stop_reason:'end_turn'});
}},async url=>{
 const payload={model:'client-model',system:'test',messages:[{role:'user',content:'test'}],max_tokens:99999};
 assert.equal((await fetch(url+'/api/messages',post(payload,{Origin:'https://foreign.example'}))).status,403);
 assert.equal((await fetch(url+'/api/messages',post({}))).status,400);
 const r=await fetch(url+'/api/messages',post(payload));assert.equal(r.status,200);assert.equal((await r.text()).includes('test-secret'),false);
}));
test('Network password protects both homepage and API',()=>run({password:'example',apiKey:''},async url=>{
 assert.equal((await fetch(url)).status,401);
 assert.equal((await fetch(url+'/api/health')).status,401);
 assert.equal((await fetch(url,{headers:{Authorization:'Basic '+Buffer.from('marco:example').toString('base64')}})).status,200);
}));
test('Truncated model output is not passed off as complete',()=>run({apiKey:'test',upstream:async()=>Response.json({content:[],stop_reason:'max_tokens'})},async url=>{
 assert.equal((await fetch(url+'/api/messages',post({system:'test',messages:[{role:'user',content:'test'}]}))).status,422);
}));
