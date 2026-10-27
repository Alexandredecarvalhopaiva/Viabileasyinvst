import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAccounts } from '../server/accounts.mjs';
import { assignAccountRole } from '../server/account-roles.mjs';

const password = 'senha de teste documental';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
const input = overrides => ({title:'Certidão urbanística',issuer:'Órgão de teste',reference:'123/2026 · página 2',category:'certidao',scope:'lot',lotId:'lote-1',filename:'certidao.pdf',pdf:pdf.toString('base64'),notes:'Consultar os recuos.',...overrides});
const study = name => ({lot:{id:'lote-1',name,area:360,width:12,depth:30},scenario:{floors:6,to:50,efficiency:76,unitArea:70,use:'H3',price:8200,cost:2700,landPrice:2500000,indirect:22,profit:18}});

test('Documentos: persistência, vínculos e autorização dos PDFs', async t => {
  const dataDir = await mkdtemp(join(tmpdir(),'viabileasy-documents-'));
  let origin, accounts;
  const server = createServer((req,res)=>accounts.handle(req,res,new URL(req.url,origin)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  accounts=createAccounts({origin,dataDir});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));accounts.close();await rm(dataDir,{recursive:true,force:true});});
  const call = async (path,method='GET',data,cookie='',extraHeaders={}) => {
    const response=await fetch(origin+path,{method,headers:{Origin:origin,'X-Viabileasy-Request':'1','Content-Type':'application/json',Cookie:cookie,...extraHeaders},...(data?{body:JSON.stringify(data)}:{})});
    const body=response.headers.get('content-type')?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer());
    return {status:response.status,body,headers:response.headers,cookie:response.headers.getSetCookie()[0]?.split(';')[0]};
  };
  let alice=await call('/api/auth/register','POST',{name:'Alice',email:'docs-alice@example.test',password});
  let bob=await call('/api/auth/register','POST',{name:'Bruno',email:'docs-bob@example.test',password});
  // Document tests start with approved fixtures; account approvals have their own suite.
  const fixture=new DatabaseSync(join(dataDir,'accounts.sqlite'));
  fixture.prepare("UPDATE users SET account_status='approved' WHERE email IN (?,?)").run('docs-alice@example.test','docs-bob@example.test');
  fixture.prepare('INSERT INTO credit_wallets(user_id,balance) SELECT id,20 FROM users WHERE email IN (?,?)').run('docs-alice@example.test','docs-bob@example.test');fixture.close();
  alice=await call('/api/auth/login','POST',{email:'docs-alice@example.test',password});
  bob=await call('/api/auth/login','POST',{email:'docs-bob@example.test',password});
  let privateDocument, sharedDocument;
  await t.test('cadastro exige sessão, origem correta e estudo pertencente à conta',async()=>{
    assert.equal((await call('/api/documents')).status,401);
    assert.equal((await call('/api/documents','POST',input())).status,401);
    assert.equal((await call('/api/documents','POST',input(),alice.cookie,{Origin:'https://other.example'})).status,403);
    assert.equal((await call('/api/documents','POST',input(),alice.cookie)).status,404);
    await call('/api/studies/lote-1','PUT',study('Terreno de Bruno'),bob.cookie);
    assert.equal((await call('/api/documents','POST',input(),alice.cookie)).status,404);
    await call('/api/studies/lote-1','PUT',study('Terreno de Alice'),alice.cookie);
  });
  await t.test('PDF e metadados são validados antes do armazenamento',async()=>{
    for(const changes of [{pdf:Buffer.from('<script>alert(1)</script>').toString('base64')},{pdf:'%'},{pdf:Buffer.from('%PDF-1.4 sem fim').toString('base64')},{filename:'arquivo.html'},{sourceURL:'javascript:alert(1)'},{sourceURL:'https://user:password@example.test/'},{title:''},{issuer:''},{category:'fake'}]) {
      assert.equal((await call('/api/documents','POST',input(changes),alice.cookie)).status,400,JSON.stringify(changes));
    }
    const large=Buffer.alloc(10*1024*1024+1,32);
    assert.equal((await call('/api/documents','POST',input({pdf:large.toString('base64')}),alice.cookie)).status,413);
    assert.equal((await call('/api/documents','GET',null,alice.cookie)).body.total,0);
  });
  await t.test('anexo preserva arquivo e referência sem aplicar regras automaticamente',async()=>{
    const result=await call('/api/documents','POST',input({sourceURL:'https://example.test/oficial.pdf'}),alice.cookie);
    assert.equal(result.status,201); privateDocument=result.body.document;
    assert.equal(privateDocument.lotName,'Terreno de Alice');
    assert.equal(privateDocument.status,'registered');
    assert.equal(privateDocument.pdf,undefined);
    assert.equal(privateDocument.size,pdf.length);assert.equal(privateDocument.sha256.length,64);
    const current=(await call('/api/studies','GET',null,alice.cookie)).body.studies[0];
    assert.equal(current.lot.buildingLimit,undefined);assert.equal(current.lot.urbanContext,undefined);
    assert.equal((await call('/api/documents','POST',input(),alice.cookie)).status,409);
  });
  await t.test('arquivo e listagem privados respeitam o dono mesmo com lotes de mesmo ID',async()=>{
    assert.equal((await call('/api/documents','GET',null,bob.cookie)).body.total,0);
    assert.equal((await call(privateDocument.url,'GET',null,bob.cookie)).status,404);
    assert.equal((await call(privateDocument.url)).status,401);
    const file=await call(privateDocument.url,'GET',null,alice.cookie);
    assert.equal(file.status,200);assert.deepEqual(file.body,pdf);
    assert.equal(file.headers.get('content-type'),'application/pdf');
    assert.equal(file.headers.get('cache-control'),'private, no-store');
    assert.match(file.headers.get('content-disposition'),/^attachment;/);
    assert.match(file.headers.get('content-security-policy'),/sandbox/);
    const otherPDF=Buffer.from('%PDF-1.4\nDocumento de Bruno\n%%EOF');
    assert.equal((await call('/api/documents','POST',input({pdf:otherPDF.toString('base64')}),bob.cookie)).status,201);
    assert.equal((await call('/api/documents?lotId=lote-1','GET',null,alice.cookie)).body.total,1);
  });
  await t.test('somente superadmin publica legislação geral; leitura é compartilhada entre contas',async()=>{
    assert.equal((await call('/api/documents','POST',input({scope:'library',role:'super_admin'}),bob.cookie)).status,403);
    const db=new DatabaseSync(join(dataDir,'accounts.sqlite'));assignAccountRole(db,'docs-alice@example.test','super_admin');db.close();
    const result=await call('/api/documents','POST',input({scope:'library',title:'Norma geral de teste',category:'legislacao'}),alice.cookie);
    assert.equal(result.status,201);sharedDocument=result.body.document;
    assert.equal(sharedDocument.lotId,null);
    const visible=(await call('/api/documents','GET',null,bob.cookie)).body;
    assert.equal(visible.total,2);assert.ok(visible.documents.some(d=>d.id===sharedDocument.id));
    assert.ok(!visible.documents.some(d=>d.id===privateDocument.id));
    assert.equal((await call(sharedDocument.url,'GET',null,bob.cookie)).status,200);
    assert.equal((await call('/api/documents','GET',null,alice.cookie)).body.total,3);
    assert.equal((await call('/api/documents?lotId=lote-1','GET',null,alice.cookie)).body.total,2);
    assert.equal((await call('/api/documents?page=-1','GET',null,alice.cookie)).status,400);
  });
  await t.test('documentos e permissões permanecem após reiniciar o servidor',async()=>{
    accounts.close();accounts=createAccounts({origin,dataDir});
    assert.deepEqual((await call(privateDocument.url,'GET',null,alice.cookie)).body,pdf);
    assert.equal((await call(privateDocument.url,'GET',null,bob.cookie)).status,404);
    assert.equal((await call('/api/documents','GET',null,bob.cookie)).body.total,2);
    const db=new DatabaseSync(join(dataDir,'accounts.sqlite'));assignAccountRole(db,'docs-alice@example.test','user');db.close();
    assert.equal((await call('/api/documents','GET',null,alice.cookie)).body.total,2);
    assert.equal((await call('/api/documents','POST',input({scope:'library',pdf:Buffer.from('%PDF-1.4\nNovo\n%%EOF').toString('base64')}),alice.cookie)).status,403);
  });
});
