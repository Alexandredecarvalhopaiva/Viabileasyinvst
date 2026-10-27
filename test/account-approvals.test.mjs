import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, scryptSync, createHash } from 'node:crypto';
import { createAccounts } from '../server/accounts.mjs';
import { assignAccountRole } from '../server/account-roles.mjs';

process.env.GOOGLE_CLIENT_ID='approval-test-client';
process.env.GOOGLE_CLIENT_SECRET='approval-test-secret';
const password='senha segura para aprovação';
test('Configuração local ativa apenas o primeiro superadmin; perfis posteriores mantêm a pendência',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT,role TEXT,updated_at INTEGER,account_status TEXT,reviewed_at INTEGER,reviewed_by TEXT)");
    db.prepare("INSERT INTO users(id,email,name,role,account_status) VALUES(?,?,?,'user','pending')").run('first','first@example.test','Primeiro');
    assert.equal(assignAccountRole(db,'first@example.test','super_admin').accountStatus,'approved');
    db.prepare("INSERT INTO users(id,email,name,role,account_status) VALUES(?,?,?,'user','pending')").run('second','second@example.test','Segundo');
    assert.equal(assignAccountRole(db,'second@example.test','super_admin').accountStatus,'pending');
  } finally {db.close();}
});
test('Novas contas exigem aprovação persistente do superadministrador',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'viabileasy-approvals-')), dbPath=join(dataDir,'accounts.sqlite');
  const adminId=randomUUID(), oldMemberId=randomUUID(), salt='fixture-approval-salt';
  const encoded=salt+':'+scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex');
  const legacy=new DatabaseSync(dbPath);
  legacy.exec('CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT,google_sub TEXT UNIQUE,photo BLOB,photo_type TEXT,google_photo TEXT,updated_at INTEGER NOT NULL,created_at INTEGER NOT NULL,role TEXT NOT NULL DEFAULT \'user\')');
  const seed=legacy.prepare('INSERT INTO users(id,email,name,password_hash,updated_at,created_at,role) VALUES(?,?,?,?,?,?,?)');
  seed.run(adminId,'admin@example.test','Admin anterior',encoded,1,1,'super_admin');
  seed.run(oldMemberId,'legacy@example.test','Conta anterior',encoded,1,1,'user');legacy.close();
  let origin,accounts,nonce;
  const emails=[];
  const googleClient={generateAuthUrl(options){nonce=options.nonce;return 'https://accounts.google.com/auth?'+new URLSearchParams({state:options.state});},async getToken(){return {tokens:{id_token:'test'}};},async verifyIdToken(){return {getPayload:()=>({sub:'approval-google',email:'google-approval@example.test',email_verified:true,name:'Conta Google pendente',nonce})};}};
  const server=createServer((req,res)=>accounts.handle(req,res,new URL(req.url,origin)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  const start=()=>createAccounts({origin,dataDir,sendMail:async mail=>emails.push(mail),googleClient});accounts=start();
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));accounts.close();await rm(dataDir,{recursive:true,force:true});});
  const call=async(path,method='GET',data,cookie='',extra={})=>{
    const response=await fetch(origin+path,{method,redirect:'manual',headers:{Origin:origin,'Content-Type':'application/json','X-Viabileasy-Request':'1',Cookie:cookie,...extra},...(data?{body:JSON.stringify(data)}:{})});
    const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}
    return {status:response.status,body,headers:response.headers,cookie:response.headers.getSetCookie().find(value=>value.startsWith('viabileasy_session='))?.split(';')[0],oauthCookie:response.headers.getSetCookie().find(value=>value.startsWith('viabileasy_oauth='))?.split(';')[0]};
  };
  const inspect=action=>{const db=new DatabaseSync(dbPath);try{return action(db);}finally{db.close();}};
  const review=(id,decision,cookie=admin.cookie,extra={},headers={})=>call('/api/admin/users/'+id+'/review','POST',{decision,...extra},cookie,headers);
  let admin,member,alice,bob,aliceLogin;
  const fakeSecret='sessao-pendente-sintetica', pendingCookie='viabileasy_session='+fakeSecret;
  await t.test('migração preserva contas existentes sem permitir autoaprovação de novos cadastros',async()=>{
    admin=await call('/api/auth/login','POST',{email:'admin@example.test',password});member=await call('/api/auth/login','POST',{email:'legacy@example.test',password});
    assert.equal(admin.status,200);assert.equal(member.status,200);assert.equal(admin.body.user.accountStatus,'approved');
    alice=await call('/api/auth/register','POST',{email:'pending-alice@example.test',name:'Alice pendente',password,role:'super_admin',accountStatus:'approved',account_status:'approved',reviewedBy:adminId});
    bob=await call('/api/auth/register','POST',{email:'pending-bob@example.test',name:'Bruno pendente',password});
    assert.equal(alice.status,201);assert.equal(alice.body.approvalStatus,'pending');assert.equal(alice.body.user.accountStatus,'pending');assert.equal(alice.body.user.role,'user');
    assert.equal(alice.cookie,undefined);assert.equal(bob.cookie,undefined);
    assert.equal((await call('/api/auth/login','POST',{email:alice.body.user.email,password:'errada'})).status,401);
    const blocked=await call('/api/auth/login','POST',{email:alice.body.user.email,password});assert.equal(blocked.status,403);assert.equal(blocked.body.code,'ACCOUNT_PENDING');assert.equal(blocked.cookie,undefined);
  });
  await t.test('pendência bloqueia sessões antigas e todas as ferramentas no servidor',async()=>{
    inspect(db=>db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(fakeSecret).digest('hex'),alice.body.user.id,Date.now()+60000));
    assert.equal((await call('/api/auth/session','GET',null,pendingCookie)).body.user,null);
    for(const [path,method,data] of [['/api/studies','GET'],['/api/documents','GET'],['/api/documents','POST',{}],['/api/profile','PUT',{name:'Alice',accountStatus:'approved'}],['/api/profile/photo','GET'],['/api/admin/overview','GET'],['/api/admin/users/'+alice.body.user.id+'/review','POST',{decision:'approved'}]]) {
      assert.equal((await call(path,method,data,pendingCookie)).status,401,path);
    }
    accounts.close();accounts=start();
    assert.equal(inspect(db=>db.prepare('SELECT account_status FROM users WHERE id=?').get(alice.body.user.id)).account_status,'pending');
    assert.equal((await call('/api/admin/overview','GET',null,admin.cookie)).body.totals.pendingUsers,2);
  });
  await t.test('somente superadmin ativo aprova outra conta; decisão não promove o perfil',async()=>{
    assert.equal((await review(alice.body.user.id,'approved','')).status,401);
    assert.equal((await review(alice.body.user.id,'approved',member.cookie)).status,403);
    assert.equal((await review(alice.body.user.id,'approved',admin.cookie,{},{Origin:'https://other.example'})).status,403);
    const approved=await review(alice.body.user.id,'approved',admin.cookie,{role:'super_admin'});assert.equal(approved.status,200);assert.equal(approved.body.user.role,'user');
  });
  await t.test('aprovação registra responsável, exige novo login e não pode ser repetida',async()=>{
    const row=inspect(db=>db.prepare('SELECT account_status,reviewed_by,reviewed_at,role FROM users WHERE id=?').get(alice.body.user.id));
    assert.equal(row.account_status,'approved');assert.equal(row.role,'user');assert.equal(row.reviewed_by,adminId);assert.ok(row.reviewed_at>1);
    assert.equal((await call('/api/auth/session','GET',null,pendingCookie)).body.user,null);
    assert.equal((await review(alice.body.user.id,'rejected')).status,409);
    assert.equal((await review(adminId,'approved')).status,400);
    assert.equal((await review(randomUUID(),'approved')).status,404);
    assert.equal((await review(bob.body.user.id,'owner')).status,400);
    aliceLogin=await call('/api/auth/login','POST',{email:alice.body.user.email,password});assert.equal(aliceLogin.status,200);assert.equal(aliceLogin.body.user.role,'user');
    assert.equal((await call('/api/studies','GET',null,aliceLogin.cookie)).status,200);
    assert.equal((await call('/api/admin/overview','GET',null,aliceLogin.cookie)).status,403);
    assert.equal(emails.length,0);
  });
  await t.test('recusa permanece bloqueada mesmo após recuperar a senha',async()=>{
    const rejected=await review(bob.body.user.id,'rejected');assert.equal(rejected.status,200);assert.equal(rejected.body.user.accountStatus,'rejected');
    assert.equal((await call('/api/auth/login','POST',{email:bob.body.user.email,password})).body.code,'ACCOUNT_REJECTED');
    await call('/api/auth/forgot-password','POST',{email:bob.body.user.email});
    const token=emails[0].text.match(/#reset=([A-Za-z0-9_-]+)/)[1], updated='nova senha continua bloqueada';
    assert.equal((await call('/api/auth/reset-password','POST',{token,password:updated})).status,200);
    assert.equal((await call('/api/auth/login','POST',{email:bob.body.user.email,password:updated})).body.code,'ACCOUNT_REJECTED');
  });
  await t.test('duas decisões concorrentes não sobrescrevem a primeira análise',async()=>{
    const signup=await call('/api/auth/register','POST',{email:'race@example.test',name:'Pedido concorrente',password});
    const results=await Promise.all([review(signup.body.user.id,'approved'),review(signup.body.user.id,'rejected')]);
    assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  });
  await t.test('Google cria conta pendente e respeita recusa sem emitir sessão',async()=>{
    const first=await call('/api/auth/google'), state=new URL(first.headers.get('location')).searchParams.get('state');
    const callback=await call('/api/auth/google/callback?code=test&state='+state,'GET',null,first.oauthCookie);
    assert.equal(callback.headers.get('location'),'/?auth_error=approval_pending');assert.equal(callback.cookie,undefined);
    const google=inspect(db=>db.prepare('SELECT id,account_status FROM users WHERE google_sub=?').get('approval-google'));
    assert.equal(google.account_status,'pending');assert.equal((await review(google.id,'rejected')).status,200);
    const retry=await call('/api/auth/google'), retryState=new URL(retry.headers.get('location')).searchParams.get('state');
    const denied=await call('/api/auth/google/callback?code=test&state='+retryState,'GET',null,retry.oauthCookie);
    assert.equal(denied.headers.get('location'),'/?auth_error=approval_rejected');assert.equal(denied.cookie,undefined);
  });
  await t.test('aprovações e recusas persistem após reinício e são visíveis na administração',async()=>{
    accounts.close();accounts=start();
    assert.equal((await call('/api/auth/session','GET',null,aliceLogin.cookie)).body.user.accountStatus,'approved');
    const overview=await call('/api/admin/overview','GET',null,admin.cookie);
    assert.equal(overview.body.users.find(u=>u.id===alice.body.user.id).reviewerName,'Admin anterior');
    assert.equal(overview.body.users.find(u=>u.id===bob.body.user.id).accountStatus,'rejected');
    assert.equal(JSON.stringify(overview.body).includes('password_hash'),false);
  });
});
