import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryAPI, territoryURL} from '../server/territory.mjs';
import {onRequest} from '../functions/api/[[path]].js';
const url='https://example.test/api/territory?west=-34.861&south=-7.111&east=-34.8608&north=-7.1108';
const collection={type:'FeatureCollection',features:[],numberMatched:0};
test('Valida recorte e área de consulta, fixa camada/origem e não encaminha credenciais',async()=>{
 const request=new Request(url+'&url=https://attacker.test&typeNames=private',{headers:{Cookie:'private',Authorization:'private'}});
 const response=await territoryAPI(request,async(upstream,options)=>{
  const u=new URL(upstream);assert.equal(u.hostname,'filipeia.joaopessoa.pb.gov.br');assert.equal(u.searchParams.get('typeNames'),'digeoc:zoneamento2024');
  assert.equal(u.searchParams.get('srsName'),'CRS:84');assert.match(u.searchParams.get('bbox'),/CRS84$/);
  assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(options.redirect,'error');
  return Response.json(collection);
 });
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const d=await response.json();assert.equal(d.source.legalValidation,false);assert.match(d.source.retrievedAt,/^20/);
});
test('Falhas, respostas truncadas e HTML retornam pendência sem expor detalhes',async()=>{
 for(const value of [new Response('blocked'),Response.json({...collection,numberMatched:1}),Response.json({features:[]}),Response.json({...collection,features:Array(50).fill({})})]){
  const r=await territoryAPI(new Request(url),async()=>value);assert.equal(r.status,503);
 }
 const r=await territoryAPI(new Request(url),async()=>{throw Error('secret-upstream');});assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret/);
});
test('Corpo sem Content-Length também tem limite de tamanho',async()=>{
 const r=await territoryAPI(new Request(url),async()=>new Response(' '.repeat(4_000_001),{headers:{'Content-Type':'application/json'}}));
 assert.equal(r.status,503);
});
test('Entrada inválida e escrita não acessam o provedor nem dependem do backend de contas',async()=>{
 for(const query of ['', '?west=&south=-7.1&east=-34.8&north=-7.09','?west=NaN&south=1&east=2&north=3','?west=-35&south=-7.3&east=-34.75&north=-7']){
  const r=await territoryAPI(new Request('https://example.test/api/territory'+query),()=>assert.fail('no fetch'));assert.equal(r.status,400);
 }
 assert.equal((await territoryAPI(new Request(url,{method:'POST'}),()=>assert.fail('no fetch'))).status,405);
 assert.throws(()=>territoryURL(new URLSearchParams()));
 const r=await onRequest({request:new Request('https://example.test/api/territory'),env:{}});assert.equal(r.status,400);
});
