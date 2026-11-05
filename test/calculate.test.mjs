import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateAnalysis} from '../server/calculate.mjs';
import {supabaseAPI} from '../server/pages-supabase.mjs';
const app='https://viabileasy.pages.dev',env={APP_URL:app,SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic'};
const data=()=>({lot:{area:99999,width:12,depth:30,urbanContext:{zone:'ZH1',mode:'catalog',regime:'ordinary',coastal:'outside',macrozone:'MAD1',roadClass:'local'}},scenario:{floors:6,to:50,unitArea:70,use:'H3',price:8200,cost:2700,profit:18}});
const request=(payload,headers={})=>new Request(app+'/api/calculate',{method:'POST',headers:{Origin:app,'Content-Type':'application/json','X-Viabileasy-Request':'1',Cookie:'__Host-ve_access=synthetic.jwt',...headers},body:JSON.stringify(payload)});
const fetcher=status=>async url=>new Response(JSON.stringify(url.endsWith('/user')?{id:'synthetic',email:'qa@example.test',email_confirmed_at:'2026-10-01',identities:[{provider:'email'}]}:{user:{accountStatus:status}}),{headers:{'Content-Type':'application/json'}});
test('Servidor reconstrói área e mantém versão demonstrativa explícita, sem simular 302 regras',()=>{
 const result=calculateAnalysis(data());assert.equal(result.baseCa,1);assert.equal(result.maxCa,6);assert.equal(result.engine.execution,'server-demonstration');assert.equal(result.engine.validatedRuleCount,0);assert.ok(result.gross<360*6);assert.equal(result.parkingRules.capacity,null);
 assert.throws(()=>calculateAnalysis({...data(),lot:{...data().lot,geometry:{vertices:[[0,0],[12,30],[12,0],[0,30]],front:0}}}));
});
test('Cálculo protegido por autenticação, liberação e origem; não faz consulta normativa externa',async()=>{
 const allowed=await supabaseAPI(request(data()),env,fetcher('approved'));assert.equal(allowed.status,200);const c=await allowed.json();assert.equal(c.schema,'VIABILEASY_ANALYSIS_V1');assert.equal(c.financial.complete,false);assert.match(allowed.headers.get('Cache-Control'),/no-store/);
 for(const status of ['pending','rejected'])assert.equal((await supabaseAPI(request(data()),env,fetcher(status))).status,403);
 const anonymous=request(data(),{Cookie:''});assert.equal((await supabaseAPI(anonymous,env,()=>assert.fail('No session'))).status,401);
 assert.equal((await supabaseAPI(request(data(),{Origin:'https://evil.test'}),env,()=>assert.fail('Invalid origin'))).status,403);
});
test('Cálculo rejeita entradas inválidas e corpo não limitado por Content-Length',async()=>{
 for(const override of [{floors:81},{to:101},{unitArea:0},{price:-1},{finance:{elevatorCost:-1}}]){
  assert.equal((await supabaseAPI(request({...data(),scenario:{...data().scenario,...override}}),env,fetcher('approved'))).status,400);
 }
 assert.equal((await supabaseAPI(request({...data(),extra:'a'.repeat(150001)}),env,fetcher('approved'))).status,413);
});
