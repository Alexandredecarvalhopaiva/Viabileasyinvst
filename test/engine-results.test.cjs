const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){let next,id=0,requests=[];const ctx={module:{exports:{}},AbortSignal,AbortController,setTimeout:fn=>{next=fn;return ++id},clearTimeout:value=>{if(value===id)next=null},fetch:(...args)=>new Promise(resolve=>requests.push({args,resolve}))};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/engine-results.js','utf8'),ctx);return {E:ctx.module.exports,requests,hasTimer:()=>Boolean(next),run:()=>{const fn=next;next=null;assert.ok(fn,'Nenhuma consulta agendada');return fn()}}}
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
test('Reconsultar durante uma chamada descarta a resposta antiga mesmo com os mesmos parâmetros',async()=>{
 const s=setup(),lot={id:'lot'},config={floors:6};let renders=0;
 s.E.schedule(lot,config,()=>renders++);const old=s.run();s.E.retry();s.E.schedule(lot,config,()=>renders++);
 assert.equal(s.hasTimer(),true);const current=s.run();
 s.requests[0].resolve(new Response(JSON.stringify(result('obsolete'))));await old;assert.equal(s.E.get(lot,config),null);
 s.requests[1].resolve(new Response(JSON.stringify(result('fresh'))));await current;assert.equal(s.E.get(lot,config).engine.version,'fresh');assert.equal(renders,1);
});
test('Voltar ao cenário já armazenado cancela a consulta agendada do cenário intermediário',async()=>{
 const s=setup(),lot={id:'lot'},a={floors:4},b={floors:6};s.E.schedule(lot,a,()=>{});const first=s.run();s.requests[0].resolve(new Response(JSON.stringify(result('cached'))));await first;
 s.E.schedule(lot,b,()=>assert.fail('Cenário intermediário'));assert.equal(s.hasTimer(),true);
 s.E.schedule(lot,a,()=>{});assert.equal(s.hasTimer(),false);assert.equal(s.E.get(lot,a).engine.version,'cached');
});
test('Finalidade, data, versão e hash cancelam respostas normativas anteriores',async()=>{
 const lot={id:'real-lot'},original={floors:4,use:'H3',analysisDate:'2026-11-05',sourceVersions:{fixture:{version:'v1',hash:'hash-v1'}}};
 for(const next of [{...original,use:'H1'},{...original,analysisDate:'2026-11-06'},
  {...original,sourceVersions:{fixture:{version:'v2',hash:'hash-v1'}}},
  {...original,sourceVersions:{fixture:{version:'v1',hash:'hash-v2'}}}]){
  const s=setup();let renders=0;
  s.E.schedule(lot,original,()=>renders++);const old=s.run();
  s.E.schedule(lot,next,()=>renders++);const current=s.run();
  assert.equal(s.requests[0].args[1].signal.aborted,true);
  s.requests[1].resolve(new Response(JSON.stringify(result('current'))));await current;
  s.requests[0].resolve(new Response(JSON.stringify(result('stale'))));await old;
  assert.equal(s.E.get(lot,next).engine.version,'current');
  assert.equal(s.E.get(lot,original),null);assert.equal(renders,1);
 }
});
