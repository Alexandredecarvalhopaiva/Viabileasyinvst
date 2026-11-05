const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const calls=[],ctx={URLSearchParams,AbortController,ClipperLib:require('../dist/vendor/geometry/clipper.js'),
  document:{addEventListener(){}},state:{lot:null,lotConfirmed:true,lookupDirty:false,parcelDirty:false,to:40},render(){},
  esc:value=>String(value??''),number:value=>String(value),icon:()=>'',SetbackRules:{catalog:{id:'fixture'},minimum:()=>null},
  fetch(url,options){return new Promise(resolve=>calls.push({url,options,resolve}));}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/urban-lookup.js','utf8')+'\nthis.U=UrbanLookup;',ctx);
 vm.runInContext(fs.readFileSync('dist/urban-lookup-ui.js','utf8'),ctx);return {ctx,calls};
}
const rect=(w,s,e,n)=>[[w,s],[e,s],[e,n],[w,n],[w,s]];
const lot=(x=-34.861)=>({custom:true,lat:-7.1109,lng:x+.0001,geometry:{geographic:rect(x,-7.111,x+.0002,-7.1108),front:0,back:2}});
const response=zone=>({ok:true,json:async()=>({source:{layer:'digeoc:zoneamento2024'},features:[{properties:{sigla:zone},geometry:{type:'Polygon',coordinates:[rect(-34.9,-7.2,-34.8,-7.01)]}}]})});
test('Resposta atrasada de outro lote não sobrescreve a zona ou a ocupação atual',async()=>{
 const {ctx,calls}=harness();ctx.state.lot=lot();const first=ctx.refreshUrbanLookup();
 ctx.state.lot=lot(-34.87);const second=ctx.refreshUrbanLookup();
 assert.equal(calls[0].options.signal.aborted,true);
 calls[1].resolve(response('ZH2'));await second;
 calls[0].resolve(response('ZH1'));await first;
 assert.equal(ctx.state.lot.urbanContext.zone,'ZH2');assert.equal(ctx.state.to,55);
});
test('Reabrir snapshot não faz nova consulta nem substitui ocupação ajustada; retry mantém hipótese',async()=>{
 const {ctx,calls}=harness();const l=ctx.state.lot=lot();
 let p=ctx.refreshUrbanLookup();calls[0].resolve(response('ZH2'));await p;
 ctx.state.to=35;await ctx.refreshUrbanLookup();assert.equal(calls.length,1);assert.equal(ctx.state.to,35);
 p=ctx.refreshUrbanLookup(true);calls[1].resolve(response('ZH2'));await p;assert.equal(ctx.state.to,35);
 assert.equal(l.territory.status,'identified');
});
test('Erro de rede em atualização não deixa enquadramento automático antigo aplicado',async()=>{
 const {ctx,calls}=harness();ctx.state.lot=lot();
 let p=ctx.refreshUrbanLookup();calls[0].resolve(response('ZH1'));await p;
 p=ctx.refreshUrbanLookup(true);calls[1].resolve({ok:false});await p;
 assert.equal(ctx.state.lot.territory.status,'error');assert.equal(ctx.state.lot.urbanContext,undefined);
});
test('Sem localização não consulta nem inventa zona; edição durante consulta descarta resposta',async()=>{
 const {ctx,calls}=harness();ctx.state.lot={custom:true,width:20,depth:30};
 await ctx.refreshUrbanLookup();assert.equal(calls.length,0);assert.equal(ctx.state.lot.territory.status,'no_location');
 ctx.state.lot=lot();const p=ctx.refreshUrbanLookup();ctx.state.parcelDirty=true;
 calls[0].resolve(response('ZH1'));await p;assert.equal(ctx.state.lot.urbanContext,undefined);
});
test('Primeira consulta preserva exceção manual herdada e registra divergência',async()=>{
 const {ctx,calls}=harness();ctx.state.lot=lot();
 ctx.state.lot.urbanContext={origin:'territory',mode:'manual',zone:'ZH1',front:7,reference:'Certidão confirmada'};
 const pending=ctx.refreshUrbanLookup();
 calls[0].resolve(response('ZH2'));await pending;
 assert.equal(ctx.state.lot.urbanContext.mode,'manual');
 assert.equal(ctx.state.lot.urbanContext.front,7);
 assert.equal(ctx.state.lot.territory.contextConflict,true);
 assert.equal(ctx.state.to,40);
});
test('Falha tardia durante edição preserva o snapshot anterior',async()=>{
 const {ctx,calls}=harness();ctx.state.lot=lot();
 let pending=ctx.refreshUrbanLookup();calls[0].resolve(response('ZH1'));await pending;
 pending=ctx.refreshUrbanLookup(true);ctx.state.parcelDirty=true;
 calls[1].resolve({ok:false});await pending;
 assert.equal(ctx.state.lot.urbanContext.zone,'ZH1');
 assert.equal(ctx.state.lot.territory.status,'identified');
});
test('Consulta descartada por edição permite retry e conserva snapshot confirmado',async()=>{
 const {ctx,calls}=harness();ctx.state.lot=lot();
 let pending=ctx.refreshUrbanLookup();calls[0].resolve(response('ZH1'));await pending;
 pending=ctx.refreshUrbanLookup(true);ctx.state.lookupDirty=true;
 calls[1].resolve(response('ZH2'));await pending;
 assert.equal(ctx.state.lot.territory.status,'identified');
 assert.equal(ctx.state.lot.territory.zone,'ZH1');
 ctx.state.lookupDirty=false;await ctx.refreshUrbanLookup();
 assert.equal(calls.length,2);
 pending=ctx.refreshUrbanLookup(true);calls[2].resolve(response('ZH2'));await pending;
 assert.equal(ctx.state.lot.territory.zone,'ZH2');
});
test('Ocupação ajustada durante primeira consulta continua hipótese do usuário',async()=>{
 const {ctx,calls}=harness();ctx.state.lot=lot();
 const pending=ctx.refreshUrbanLookup();ctx.state.to=35;
 calls[0].resolve(response('ZH2'));await pending;
 assert.equal(ctx.state.to,35);
 assert.equal(ctx.state.lot.territory.occupation.to,55);
 assert.notEqual(ctx.state.lot.territory.occupationApplied,true);
});
test('Ponto só apresenta zona sugerida, sem percentuais na tela ou relatório',async()=>{
 const {ctx,calls}=harness();ctx.state.lot={custom:true,lat:-7.11,lng:-34.86};
 const pending=ctx.refreshUrbanLookup();calls[0].resolve(response('ZH2'));await pending;
 assert.match(ctx.urbanLookupPanel(),/Zona sugerida/);
 assert.doesNotMatch(ctx.urbanLookupPanel(),/55%|5%/);
 assert.doesNotMatch(ctx.urbanLookupReport(),/55%|5%/);
});
test('Coordenadas conhecidas fora do recorte mostram falta de cobertura',async()=>{
 const {ctx,calls}=harness();ctx.state.lot={custom:true,lat:-8,lng:-35};
 await ctx.refreshUrbanLookup();
 assert.equal(calls.length,0);
 assert.equal(ctx.state.lot.territory.status,'outside_coverage');
 assert.match(ctx.urbanLookupPanel(),/Sem cobertura/);
});
test('Fonte do snapshot permanece estável quando o catálogo corrente muda',async()=>{
 const {ctx,calls}=harness();ctx.state.lot=lot();
 const pending=ctx.refreshUrbanLookup();calls[0].resolve(response('ZH2'));await pending;
 const original=ctx.state.lot.territory.occupation.source.title;
 ctx.U.catalog.title='CATÁLOGO NOVO';ctx.U.catalog.url='https://example.test/nova-versao';
 assert.equal(ctx.state.lot.territory.occupation.source.title,original);
 assert.match(ctx.urbanLookupReport(),/LC 169/);
 assert.doesNotMatch(ctx.urbanLookupReport(),/CATÁLOGO NOVO|nova-versao/);
 assert.doesNotMatch(ctx.urbanLookupPanel(),/CATÁLOGO NOVO|nova-versao/);
});
test('Link da fonte salva aceita somente HTTP e HTTPS',()=>{
 const {ctx}=harness();
 assert.equal(ctx.urbanSourceLink({title:'Referência salva',url:'javascript:alert(1)'}),'Referência salva');
 assert.match(ctx.urbanSourceLink({title:'Fonte',url:'https://example.test/v1'}),/href="https:\/\/example.test\/v1"/);
});
