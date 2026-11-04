const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){let next,requests=[];const ctx={module:{exports:{}},AbortSignal,setTimeout:fn=>{next=fn;return 1},clearTimeout:()=>{},fetch:(...args)=>new Promise(resolve=>requests.push({args,resolve}))};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/engine-results.js','utf8'),ctx);return {E:ctx.module.exports,requests,run:()=>next()}}
const result=label=>({schema:'VIABILEASY_ANALYSIS_V1',engine:{version:label},floorPlates:[],pendings:[],gross:100,financial:{complete:false},setbackRule:{}});
test('Respostas atrasadas não substituem o cenário atual e exportação lê o mesmo resultado',async()=>{
 const s=setup(),lot={id:'same-lot'},a={floors:4},b={floors:6};let renders=0;
 s.E.schedule(lot,a,()=>renders++);const first=s.run();s.E.schedule(lot,b,()=>renders++);const second=s.run();
 s.requests[1].resolve(new Response(JSON.stringify(result('current'))));await second;
 s.requests[0].resolve(new Response(JSON.stringify(result('stale'))));await first;
 assert.equal(s.E.get(lot,b).engine.version,'current');assert.equal(s.E.get(lot,a),null);assert.equal(renders,1);
 assert.equal(s.E.get({...lot,area:999},b),null);
});
test('Falha não mantém cálculo antigo nem causa repetição automática; retry é explícito',async()=>{
 const s=setup(),lot={id:'lot'},config={floors:6};s.E.schedule(lot,config,()=>{});const call=s.run();s.requests[0].resolve(new Response('{}',{status:503}));await call;
 assert.equal(s.E.get(lot,config),null);assert.match(s.E.error,/indisponível/);s.E.schedule(lot,config,()=>assert.fail('No retry'));assert.equal(s.requests.length,1);
 s.E.retry();s.E.schedule(lot,config,()=>{});const retry=s.run();s.requests[1].resolve(new Response(JSON.stringify(result('retry'))));await retry;assert.equal(s.E.get(lot,config).engine.version,'retry');
});
