import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAccounts } from '../server/accounts.mjs';
import { assignAccountRole } from '../server/account-roles.mjs';

const password='senha de teste para usos';
const study=(id,changes={})=>({lot:{id,name:'Terreno de teste',area:360,width:12,depth:30,...changes},scenario:{floors:6,to:50,efficiency:76,unitArea:70,use:'H3',price:8200,cost:2700,landPrice:2500000,indirect:22,profit:18}});
test('Usos por usuário são liberados pelo superadmin e consumidos no servidor',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'viabileasy-usage-api-'));
  let origin,accounts;
  const server=createServer((req,res)=>accounts.handle(req,res,new URL(req.url,origin)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  accounts=createAccounts({origin,dataDir});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));accounts.close();await rm(dataDir,{recursive:true,force:true});});
  const call=async(path,method='GET',data,cookie='',extra={})=>{
    const response=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json','X-Viabileasy-Request':'1',Cookie:cookie,...extra},...(data?{body:JSON.stringify(data)}:{})});
    return {status:response.status,body:await response.json(),cookie:response.headers.getSetCookie()[0]?.split(';')[0]};
  };
  const signup=await call('/api/auth/register','POST',{name:'Usuário',email:'use@example.test',password});
  const other=await call('/api/auth/register','POST',{name:'Outra conta',email:'other@example.test',password});
  const pending=await call('/api/auth/register','POST',{name:'Pendente',email:'pending@example.test',password});
  await call('/api/auth/register','POST',{name:'Admin de teste',email:'admin@example.test',password});
  const fixture=new DatabaseSync(join(dataDir,'accounts.sqlite'));
  fixture.prepare("UPDATE users SET account_status='approved' WHERE email IN (?,?,?)").run('use@example.test','other@example.test','admin@example.test');
  assignAccountRole(fixture,'admin@example.test','super_admin');fixture.close();
  const admin=await call('/api/auth/login','POST',{email:'admin@example.test',password});
  let user=await call('/api/auth/login','POST',{email:'use@example.test',password});
  const otherLogin=await call('/api/auth/login','POST',{email:'other@example.test',password});
  const grant=(amount,requestKey,cookie=admin.cookie,target=signup.body.user.id,extra={})=>call('/api/admin/users/'+target+'/credits','POST',{amount,requestKey},cookie,extra);
  await t.test('aprovação não libera usos automaticamente e saldo zero bloqueia nova análise',async()=>{
    assert.equal(signup.body.user.usage.balance,0);assert.equal(user.body.user.usage.balance,0);
    const blocked=await call('/api/studies/first','PUT',study('first'),user.cookie);
    assert.equal(blocked.status,409);assert.equal(blocked.body.code,'NO_CREDITS');
    assert.equal((await call('/api/studies','GET',null,user.cookie)).body.studies.length,0);
    assert.equal((await call('/api/usage','GET',null,user.cookie)).body.usage.balance,0);
  });
  await t.test('só o superadmin libera usos e apenas para uma conta aprovada',async()=>{
    assert.equal((await grant(2,'forged',user.cookie)).status,403);
    assert.equal((await grant(2,'pending',admin.cookie,pending.body.user.id)).status,403);
    assert.equal((await grant(2,'origin',admin.cookie,signup.body.user.id,{Origin:'https://other.example'})).status,403);
    for(const amount of [0,-1,1.5,1001])assert.equal((await grant(amount,'invalid')).status,400);
    assert.equal((await grant(2,'release-1')).body.usage.balance,2);
    const repeat=await grant(2,'release-1');assert.equal(repeat.body.usage.balance,2);assert.equal(repeat.body.usage.duplicate,true);
    assert.equal((await grant(3,'release-1')).status,409);
    assert.equal((await call('/api/usage','GET',null,otherLogin.cookie)).body.usage.balance,0);
  });
  await t.test('nova análise usa uma unidade; repetição e premissas do mesmo estudo não consomem outra',async()=>{
    const invalid=study('invalid');invalid.scenario.efficiency=0;
    assert.equal((await call('/api/studies/invalid','PUT',invalid,user.cookie)).status,400);
    assert.equal((await call('/api/usage','GET',null,user.cookie)).body.usage.balance,2);
    const first=await call('/api/studies/first','PUT',study('first'),user.cookie);
    assert.equal(first.status,200);assert.equal(first.body.charged,true);assert.equal(first.body.usage.balance,1);
    const repeat=await call('/api/studies/first','PUT',study('first'),user.cookie);assert.equal(repeat.body.charged,false);assert.equal(repeat.body.usage.balance,1);
    const edit=study('first',{name:'Novo nome'});edit.scenario.price=9000;edit.scenario.floors=8;
    assert.equal((await call('/api/studies/first','PUT',edit,user.cookie)).body.charged,false);
    assert.equal((await call('/api/usage','GET',null,user.cookie)).body.usage.balance,1);
  });
  await t.test('trocar a geometria do mesmo ID exige outro uso; saldo não pode vir do navegador',async()=>{
    const changed=await call('/api/studies/first','PUT',study('first',{area:400,width:20,depth:20}),user.cookie);
    assert.equal(changed.body.charged,true);assert.equal(changed.body.usage.balance,0);
    const forged={...study('second'),usage:{balance:999,unlimited:true},credits:999};
    assert.equal((await call('/api/studies/second','PUT',forged,user.cookie)).body.code,'NO_CREDITS');
    assert.equal((await call('/api/studies/first','PUT',study('first'),otherLogin.cookie)).body.code,'NO_CREDITS');
    const revisit=await call('/api/studies/first','PUT',study('first'),user.cookie);assert.equal(revisit.body.charged,false);assert.equal(revisit.body.usage.balance,0);
    assert.equal((await call('/api/studies','GET',null,user.cookie)).body.studies.length,1);
  });
  await t.test('dois pedidos concorrentes não ultrapassam o último uso disponível',async()=>{
    await grant(1,'release-2');
    const results=await Promise.all(['concurrent-a','concurrent-b'].map(id=>call('/api/studies/'+id,'PUT',study(id),user.cookie)));
    assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
    const usage=(await call('/api/usage','GET',null,user.cookie)).body.usage;
    assert.equal(usage.balance,0);assert.equal(usage.used,3);
    const overview=(await call('/api/admin/overview','GET',null,admin.cookie)).body.users.find(row=>row.id===signup.body.user.id);
    assert.equal(overview.creditBalance,0);assert.equal(overview.usedCredits,3);
  });
  await t.test('superadmin continua sem limite e saldo/consumo sobrevivem ao reinício',async()=>{
    assert.equal(admin.body.user.usage.unlimited,true);
    for(let i=0;i<3;i++)assert.equal((await call('/api/studies/admin-'+i,'PUT',study('admin-'+i),admin.cookie)).body.charged,false);
    accounts.close();accounts=createAccounts({origin,dataDir});
    const usage=(await call('/api/usage','GET',null,user.cookie)).body.usage;assert.equal(usage.balance,0);assert.equal(usage.used,3);
    assert.equal((await grant(2,'release-1')).body.usage.balance,0);
    user=await call('/api/auth/login','POST',{email:'use@example.test',password});assert.equal(user.body.user.usage.balance,0);
  });
});
