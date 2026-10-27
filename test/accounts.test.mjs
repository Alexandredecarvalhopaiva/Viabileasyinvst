import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createAccounts } from '../server/accounts.mjs';
import { assignAccountRole } from '../server/account-roles.mjs';

process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
const password = 'uma senha de teste segura';
const updatedPassword = 'uma nova senha de teste segura';
const hash = text => createHash('sha256').update(text).digest('hex');
const study = (id, name) => ({
  lot: {id,name,area:360,width:12,depth:30,address:'Terreno de teste'},
  scenario: {floors:6,to:50,efficiency:76,unitArea:70,use:'H3',price:8200,cost:2700,landPrice:2500000,indirect:22,profit:18}
});

test('Contas, privacidade e recuperação de acesso', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'viabileasy-auth-'));
  const emails = [];
  let origin = '', nonce = '', identity = { sub:'google-1', email:'google@example.test', email_verified:true, name:'Pessoa Google' };
  const googleClient = {
    generateAuthUrl(options) { nonce = options.nonce; return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({...options,scope:options.scope.join(' ')}); },
    async getToken() { return {tokens:{id_token:'verified-by-google-adapter'}}; },
    async verifyIdToken() { return {getPayload:() => ({...identity,nonce})}; }
  };
  let accounts;
  const server = createServer((req,res) => accounts.handle(req,res,new URL(req.url,origin)));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  accounts = createAccounts({origin,dataDir,sendMail:async mail => emails.push(mail),googleClient});
  t.after(async () => { await new Promise(resolve => server.close(resolve)); accounts.close(); await rm(dataDir,{recursive:true,force:true}); });
  const call = async (path,method='GET',data,cookie='',headers={}) => {
    const res = await fetch(origin+path,{method,redirect:'manual',headers:{Origin:origin,'X-Viabileasy-Request':'1','Content-Type':'application/json',Cookie:cookie,...headers},...(data ? {body:JSON.stringify(data)}:{})});
    const bytes = await res.text();
    let body; try{body=JSON.parse(bytes)}catch{body=bytes}
    return {status:res.status,body,headers:res.headers,cookie:(res.headers.getSetCookie().find(value=>value.startsWith('viabileasy_session=')) || res.headers.getSetCookie()[0])?.split(';')[0]};
  };
  let alice,bob;
  await t.test('recusa acesso anônimo e requisições de outra origem', async () => {
    assert.equal((await call('/api/studies')).status,401);
    assert.equal((await call('/api/auth/session')).body.user,null);
    for (const [path,method,data] of [
      ['/api/studies/guest','PUT',study('guest','Sem login')],
      ['/api/studies/guest/open','POST',{}],
      ['/api/profile','PUT',{name:'Sem login'}],
      ['/api/profile/photo','PUT',{image:null}]
    ]) assert.equal((await call(path,method,data)).status,401,path);
    assert.equal((await call('/api/auth/register','POST',{name:'Alice',email:'alice@example.test',password},'',{Origin:'https://other.example'})).status,403);
  });
  await t.test('cadastro, hash de senha e cookie protegido', async () => {
    alice = await call('/api/auth/register','POST',{name:'Alice',email:'alice@example.test',password,remember:true});
    bob = await call('/api/auth/register','POST',{name:'Bruno',email:'bob@example.test',password,role:'super_admin'});
    assert.equal(alice.status,201); assert.equal(bob.status,201);
    assert.equal(alice.body.user.role,'user'); assert.equal(bob.body.user.role,'user');
    assert.equal(alice.body.user.accountStatus,'pending'); assert.equal(bob.body.user.accountStatus,'pending');
    assert.equal(alice.cookie,undefined); assert.equal(bob.cookie,undefined);
    assert.equal(alice.body.user.password_hash,undefined);
    const inspect = new DatabaseSync(join(dataDir,'accounts.sqlite'));
    const row = inspect.prepare('SELECT password_hash FROM users WHERE email=?').get('alice@example.test');
    assert.notEqual(row.password_hash,password);
    // Approvals are exercised through the API in account-approvals.test.mjs.
    inspect.prepare("UPDATE users SET account_status='approved' WHERE email IN (?,?)").run('alice@example.test','bob@example.test');
    inspect.prepare('INSERT INTO credit_wallets(user_id,balance) SELECT id,20 FROM users WHERE email IN (?,?)').run('alice@example.test','bob@example.test');
    alice=await call('/api/auth/login','POST',{email:'alice@example.test',password,remember:true});
    bob=await call('/api/auth/login','POST',{email:'bob@example.test',password});
    assert.match(alice.headers.get('set-cookie'),/HttpOnly; SameSite=Lax; Max-Age=2592000/);
    assert.equal(inspect.prepare('SELECT hash FROM sessions LIMIT 1').get().hash.includes(alice.cookie.split('=')[1]),false);
    inspect.close();
  });
  await t.test('validação de senha e cadastro duplicado', async () => {
    assert.equal((await call('/api/auth/register','POST',{name:'Outra Alice',email:'ALICE@example.test',password})).status,409);
    assert.equal((await call('/api/auth/register','POST',{name:'Outra Pessoa',email:'weak@example.test',password:'curta'})).status,400);
    assert.equal((await call('/api/auth/login','POST',{email:'alice@example.test',password:'errada'})).status,401);
  });
  await t.test('estudos isolados mesmo com o mesmo identificador', async () => {
    assert.equal((await call('/api/studies/terreno-1','PUT',study('terreno-1','Estudo da Alice'),alice.cookie)).status,200);
    assert.deepEqual((await call('/api/studies','GET',null,bob.cookie)).body.studies,[]);
    await call('/api/studies/terreno-1','PUT',study('terreno-1','Estudo do Bruno'),bob.cookie);
    assert.equal((await call('/api/studies','GET',null,alice.cookie)).body.studies[0].lot.name,'Estudo da Alice');
    assert.equal((await call('/api/studies','GET',null,bob.cookie)).body.studies[0].lot.name,'Estudo do Bruno');
    assert.equal((await call('/api/studies/terreno-2','PUT',study('terreno-1','Inválido'),alice.cookie)).status,400);
  });
  await t.test('nome e foto pertencem à conta', async () => {
    const updated=await call('/api/profile','PUT',{name:'Alice Silva'},alice.cookie);
    assert.equal(updated.body.user.name,'Alice Silva');
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzXkAAAAASUVORK5CYII=';
    assert.equal((await call('/api/profile/photo','PUT',{image:png},alice.cookie)).status,200);
    assert.equal((await call('/api/profile/photo','GET',null,alice.cookie)).status,200);
    assert.equal((await call('/api/profile/photo','GET',null,bob.cookie)).status,404);
    assert.equal((await call('/api/profile/photo','PUT',{image:'data:image/svg+xml;base64,PHN2Zz4='},alice.cookie)).status,400);
    assert.equal((await call('/api/profile/photo','PUT',{image:'data:image/png;base64,PHN2Zz5hbGVydCgxKTwvc3ZnPg=='},alice.cookie)).status,400);
    assert.equal((await call('/api/profile/photo','PUT',{image:null},alice.cookie)).body.user.avatar,null);
  });
  await t.test('dados e sessão sobrevivem ao reinício do módulo', async () => {
    accounts.close();
    // Simulate the pre-recents schema with saved studies already present.
    const legacy = new DatabaseSync(join(dataDir,'accounts.sqlite'));
    legacy.exec('ALTER TABLE studies DROP COLUMN last_opened_at');
    legacy.exec('ALTER TABLE users DROP COLUMN role');
    legacy.close();
    accounts=createAccounts({origin,dataDir,sendMail:async mail=>emails.push(mail),googleClient});
    assert.equal((await call('/api/auth/session','GET',null,alice.cookie)).body.user.name,'Alice Silva');
    assert.equal((await call('/api/auth/session','GET',null,alice.cookie)).body.user.role,'user');
    assert.equal((await call('/api/studies','GET',null,alice.cookie)).body.studies.length,1);
  });
  let reset;
  await t.test('recuperação não revela se o e-mail existe nem devolve o token', async () => {
    const known=await call('/api/auth/forgot-password','POST',{email:'alice@example.test'});
    const unknown=await call('/api/auth/forgot-password','POST',{email:'unknown@example.test'});
    assert.deepEqual(known.body,unknown.body);
    assert.equal(emails.length,1);
    reset=emails[0].text.match(/#reset=([A-Za-z0-9_-]+)/)[1];
    assert.equal(JSON.stringify(known.body).includes(reset),false);
    assert.equal((await call('/api/auth/reset/check','POST',{token:reset})).status,200);
    assert.equal((await call('/api/auth/reset/check','POST',{token:'invalido'})).status,400);
  });
  await t.test('senha nova invalida sessões e o link não pode ser reutilizado', async () => {
    assert.equal((await call('/api/auth/reset-password','POST',{token:reset,password:updatedPassword})).status,200);
    assert.equal((await call('/api/studies','GET',null,alice.cookie)).status,401);
    assert.equal((await call('/api/auth/reset-password','POST',{token:reset,password})).status,400);
    assert.equal((await call('/api/auth/login','POST',{email:'alice@example.test',password})).status,401);
    alice=await call('/api/auth/login','POST',{email:'alice@example.test',password:updatedPassword});
    assert.equal(alice.status,200);
    assert.equal((await call('/api/studies','GET',null,alice.cookie)).body.studies.length,1);
  });
  await t.test('links expirados são recusados', async () => {
    await call('/api/auth/forgot-password','POST',{email:'bob@example.test'});
    const expired=emails.at(-1).text.match(/#reset=([A-Za-z0-9_-]+)/)[1];
    const inspect=new DatabaseSync(join(dataDir,'accounts.sqlite'));
    inspect.prepare('UPDATE resets SET expires_at=0 WHERE hash=?').run(hash(expired));inspect.close();
    assert.equal((await call('/api/auth/reset-password','POST',{token:expired,password:updatedPassword})).status,400);
  });
  await t.test('Google usa PKCE, state, nonce e recusa callback sem cookie', async () => {
    const start=await call('/api/auth/google');
    const url=new URL(start.headers.get('location'));
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.equal(url.searchParams.get('nonce'),nonce);
    const state=url.searchParams.get('state');
    const denied=await call('/api/auth/google/callback?code=test&state='+state);
    assert.equal(denied.headers.get('location'),'/?auth_error=google_expired');
    const success=await call('/api/auth/google/callback?code=test&state='+state,'GET',null,start.cookie);
    assert.equal(success.headers.get('location'),'/?auth_error=approval_pending');
    assert.equal(success.headers.getSetCookie().some(value=>value.startsWith('viabileasy_session=')),false);
    const inspect=new DatabaseSync(join(dataDir,'accounts.sqlite'));
    assert.equal(inspect.prepare('SELECT account_status FROM users WHERE email=?').get('google@example.test').account_status,'pending');
    inspect.prepare("UPDATE users SET account_status='approved' WHERE email=?").run('google@example.test');inspect.close();
    const retry=await call('/api/auth/google'), approvedState=new URL(retry.headers.get('location')).searchParams.get('state');
    const approved=await call('/api/auth/google/callback?code=test&state='+approvedState,'GET',null,retry.cookie);
    assert.equal(approved.headers.get('location'),'/');
    assert.equal((await call('/api/auth/session','GET',null,approved.cookie)).body.user.googleConnected,true);
    const replay=await call('/api/auth/google/callback?code=test&state='+state,'GET',null,start.cookie);
    assert.equal(replay.headers.get('location'),'/?auth_error=google_expired');
  });
  await t.test('Google não vincula e-mail existente sem autenticação prévia', async () => {
    identity={sub:'google-alice',email:'alice@example.test',email_verified:true,name:'Alice'};
    const start=await call('/api/auth/google'), state=new URL(start.headers.get('location')).searchParams.get('state');
    const result=await call('/api/auth/google/callback?code=test&state='+state,'GET',null,start.cookie);
    assert.equal(result.headers.get('location'),'/?auth_error=google_conflict');
  });
  await t.test('vincular Google exige sessão e o mesmo e-mail', async () => {
    assert.equal((await call('/api/auth/google?link=1')).status,401);
    const start=await call('/api/auth/google?link=1','GET',null,alice.cookie), state=new URL(start.headers.get('location')).searchParams.get('state');
    const result=await call('/api/auth/google/callback?code=test&state='+state,'GET',null,alice.cookie+'; '+start.cookie);
    assert.equal(result.headers.get('location'),'/');
    alice.cookie=result.cookie;
    assert.equal((await call('/api/auth/session','GET',null,alice.cookie)).body.user.googleConnected,true);
  });
  await t.test('Google rejeita identidade sem e-mail verificado', async () => {
    identity={sub:'unverified',email:'unverified@example.test',email_verified:false,name:'Inválido'};
    const start=await call('/api/auth/google'), state=new URL(start.headers.get('location')).searchParams.get('state');
    const result=await call('/api/auth/google/callback?code=test&state='+state,'GET',null,start.cookie);
    assert.equal(result.headers.get('location'),'/?auth_error=google_failed');
  });
  await t.test('enquadramento dos recuos e fonte são recuperados junto ao estudo', async () => {
    const input=study('terreno-1','Estudo com recuos');
    input.lot.buildingLimit={maxFloors:8,reference:'Certidão de teste · item 4',url:'https://example.test/fonte',verified:false};
    input.lot.urbanContext={mode:'catalog',zone:'ZH1',coastal:'outside',regime:'ordinary',catalogId:'JP-LC169-2024-RECUOS-v1',ruleSnapshot:{legalValidation:false,source:{title:'LC169/2024 · Anexo IV'},levels:[{floor:1,edgeOffsets:[5,1.5,3,1.5]}]}};
    assert.equal((await call('/api/studies/terreno-1','PUT',input,alice.cookie)).status,200);
    const stored=(await call('/api/studies','GET',null,alice.cookie)).body.studies.find(entry=>entry.lot.id==='terreno-1');
    assert.deepEqual(stored.lot.urbanContext,input.lot.urbanContext);
    assert.deepEqual(stored.lot.buildingLimit,input.lot.buildingLimit);
    assert.equal((await call('/api/studies','GET',null,bob.cookie)).body.studies[0].lot.urbanContext,undefined);
  });
  await t.test('recentes usam a última atividade e abrir não altera o cenário salvo', async () => {
    await call('/api/studies/recente-2','PUT',study('recente-2','Segundo terreno'),alice.cookie);
    await call('/api/studies/recente-3','PUT',study('recente-3','Terceiro terreno'),alice.cookie);
    const inspect=new DatabaseSync(join(dataDir,'accounts.sqlite'));
    inspect.prepare('UPDATE studies SET updated_at=1,last_opened_at=NULL WHERE user_id=? AND id=?').run(alice.body.user.id,'terreno-1');
    inspect.prepare('UPDATE studies SET updated_at=2,last_opened_at=NULL WHERE user_id=? AND id=?').run(alice.body.user.id,'recente-2');
    inspect.prepare('UPDATE studies SET updated_at=3,last_opened_at=NULL WHERE user_id=? AND id=?').run(alice.body.user.id,'recente-3');
    inspect.close();
    let list=(await call('/api/studies','GET',null,alice.cookie)).body.studies;
    assert.deepEqual(list.map(entry=>entry.lot.id),['recente-3','recente-2','terreno-1']);
    const before=list.find(entry=>entry.lot.id==='terreno-1');
    const opened=await call('/api/studies/terreno-1/open','POST',{},alice.cookie);
    assert.equal(opened.status,200);
    assert.equal(opened.body.updatedAt,1);
    assert.ok(opened.body.lastOpenedAt>3);
    list=(await call('/api/studies','GET',null,alice.cookie)).body.studies;
    assert.equal(list[0].lot.id,'terreno-1');
    assert.deepEqual(list[0].scenario,before.scenario);
    assert.deepEqual(list[0].lot,before.lot);
    const saved=await call('/api/studies/recente-2','PUT',study('recente-2','Segundo terreno atualizado'),alice.cookie);
    assert.ok(saved.body.study.updatedAt>3);
    assert.equal((await call('/api/studies','GET',null,alice.cookie)).body.studies[0].lot.id,'recente-2');
  });
  await t.test('acessos recentes ficam isolados por conta e persistem após reinício', async () => {
    const before=(await call('/api/studies','GET',null,alice.cookie)).body.studies;
    assert.equal((await call('/api/studies/recente-3/open','POST',{},bob.cookie)).status,404);
    assert.equal((await call('/api/studies/recente-3/open','POST',{})).status,401);
    assert.equal((await call('/api/studies/terreno-1/open','POST',{},bob.cookie)).status,200);
    assert.deepEqual((await call('/api/studies','GET',null,alice.cookie)).body.studies,before);
    accounts.close();
    accounts=createAccounts({origin,dataDir,sendMail:async mail=>emails.push(mail),googleClient});
    assert.deepEqual((await call('/api/studies','GET',null,alice.cookie)).body.studies,before);
  });
  await t.test('administração recusa anônimos e elevação pelo cadastro ou perfil', async () => {
    assert.equal((await call('/api/admin/overview')).status,401);
    assert.equal((await call('/api/admin/overview','GET',null,bob.cookie)).status,403);
    const forged=await call('/api/profile','PUT',{name:'Bruno',role:'super_admin'},bob.cookie);
    assert.equal(forged.body.user.role,'user');
    assert.equal((await call('/api/admin/overview','GET',null,bob.cookie)).status,403);
  });
  await t.test('perfil administrativo persistente autoriza dados reais sem expor credenciais', async () => {
    const inspect=new DatabaseSync(join(dataDir,'accounts.sqlite'));
    const originalHash=inspect.prepare('SELECT password_hash FROM users WHERE email=?').get('alice@example.test').password_hash;
    assert.throws(()=>assignAccountRole(inspect,'unknown@example.test','super_admin'),/Conta não encontrada/);
    assert.throws(()=>assignAccountRole(inspect,'alice@example.test','owner'),/Perfil inválido/);
    assignAccountRole(inspect,'ALICE@example.test','super_admin');
    assert.equal(inspect.prepare('SELECT password_hash FROM users WHERE email=?').get('alice@example.test').password_hash,originalHash);
    inspect.close();
    accounts.close();
    accounts=createAccounts({origin,dataDir,sendMail:async mail=>emails.push(mail),googleClient});
    const login=await call('/api/auth/login','POST',{email:'alice@example.test',password:updatedPassword});
    assert.equal(login.status,200); assert.equal(login.body.user.role,'super_admin');
    await call('/api/auth/logout','POST',{},login.cookie);
    assert.equal((await call('/api/auth/session','GET',null,alice.cookie)).body.user.role,'super_admin');
    const admin=await call('/api/admin/overview','GET',null,alice.cookie);
    assert.equal(admin.status,200);
    assert.equal(admin.body.totals.users,3);
    assert.equal(admin.body.totals.superAdmins,1);
    assert.equal(admin.body.totals.studies,4);
    assert.equal(admin.body.users.find(u=>u.email==='alice@example.test').studyCount,3);
    assert.ok(admin.body.recentStudies.some(s=>s.ownerEmail==='bob@example.test'));
    assert.equal(JSON.stringify(admin.body).includes('password'),false);
    assert.equal(JSON.stringify(admin.body).includes('google_sub'),false);
    assert.equal((await call('/api/studies','GET',null,alice.cookie)).body.studies.length,3);
    assert.equal((await call('/api/admin/overview','GET',null,bob.cookie)).status,403);
  });
  await t.test('revogação do perfil é respeitada pela sessão já aberta', async () => {
    const inspect=new DatabaseSync(join(dataDir,'accounts.sqlite'));
    assignAccountRole(inspect,'alice@example.test','user');
    inspect.close();
    assert.equal((await call('/api/admin/overview','GET',null,alice.cookie)).status,403);
    assert.equal((await call('/api/auth/session','GET',null,alice.cookie)).body.user.role,'user');
  });
  await t.test('logout revoga a sessão', async () => {
    assert.equal((await call('/api/auth/logout','POST',{},alice.cookie)).status,200);
    assert.equal((await call('/api/studies','GET',null,alice.cookie)).status,401);
  });
});
