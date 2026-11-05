const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const calls=[],ctx={URLSearchParams,AbortController,ClipperLib:require('../dist/vendor/geometry/clipper.js'),
  document:{addEventListener(){}},state:{lot:null,lotConfirmed:true,lookupDirty:false,parcelDirty:false,to:40},render(){},
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
