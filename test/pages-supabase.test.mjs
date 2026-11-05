import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAPI} from '../server/pages-supabase.mjs';
import {onRequest} from '../functions/api/[[path]].js';
const app = 'https://viabileasy.pages.dev';
const env = {BACKEND:'supabase',APP_URL:app,SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const identity = {id:'test-user',email:'person@example.test',email_confirmed_at:'2026-10-30T00:00:00Z',identities:[{provider:'email'}]};
const tokens = {access_token:'synthetic.jwt.access',refresh_token:'synthetic-refresh',expires_in:3600};
const cookie = '__Host-ve_access=synthetic.jwt.access; __Host-ve_refresh=synthetic-refresh';
const response = (data, status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const request = (path,method='GET',data,extra={}) => new Request(app+path,{method,headers:{Cookie:cookie,
  ...(method==='GET'?{}:{Origin:app,'X-Viabileasy-Request':'1','Content-Type':'application/json'}),...extra},
  ...(data ? {body:JSON.stringify(data)} : {})});

test('Supabase mode fails closed for missing or unsafe config, preview origins and CSRF',async()=>{
  for(const overrides of [{SUPABASE_URL:''},{APP_URL:''},{SUPABASE_PUBLISHABLE_KEY:''},
    {SUPABASE_URL:'https://attacker.test'},{SUPABASE_URL:'https://project.supabase.co/path'},
    {APP_URL:'http://viabileasy.pages.dev'}]){
    const res=await supabaseAPI(request('/api/auth/session'),{...env,...overrides},()=>assert.fail('Must not fetch'));
    assert.equal(res.status,503);
  }
  const preview=await supabaseAPI(new Request('https://preview.viabileasy.pages.dev/api/auth/session',{headers:{Cookie:cookie}}),env,()=>assert.fail('Must not fetch'));
  assert.equal(preview.status,403);
  for(const extra of [{Origin:'https://evil.test'},{'X-Viabileasy-Request':''}]){
    const denied=await supabaseAPI(request('/api/profile','PUT',{name:'Test'},extra),env,()=>assert.fail('Must not fetch'));
    assert.equal(denied.status,403);
  }
});

test('PKCE challenge corresponds to an HttpOnly verifier; redirect targets Supabase Google Auth',async()=>{
  const start=await supabaseAPI(request('/api/auth/google'),{...env,GOOGLE_LOGIN_ENABLED:'true'},()=>assert.fail('Browser redirect only'));
  assert.equal(start.status,303);
  const set=start.headers.getSetCookie()[0];
  assert.match(set,/HttpOnly; Secure; SameSite=Lax/);
  const verifier=set.match(/__Host-ve_pkce=([^;]+)/)[1];
  const target=new URL(start.headers.get('Location'));
  assert.equal(target.origin,env.SUPABASE_URL);
  assert.equal(target.searchParams.get('provider'),'google');
  assert.equal(target.searchParams.get('redirect_to'),app+'/api/auth/google/callback');
  const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
  assert.equal(target.searchParams.get('code_challenge'),challenge);
  const callback=await supabaseAPI(request('/api/auth/google/callback?code=one-time-code','GET',null,{Cookie:`__Host-ve_pkce=${verifier}`}),{...env,GOOGLE_LOGIN_ENABLED:'true'},async(url,options)=>{
    if(url.includes('/token?')){
      assert.deepEqual(JSON.parse(options.body),{auth_code:'one-time-code',code_verifier:verifier});
      return response(tokens);
    }
    if(url.endsWith('/user'))return response(identity);
    assert.equal(url,env.SUPABASE_URL+'/rest/v1/rpc/viabil_api');
    assert.equal(options.headers.Authorization,'Bearer '+tokens.access_token);
    return response({user:{id:identity.id,accountStatus:'pending'}});
  });
  assert.equal(callback.status,303);
  assert.equal(callback.headers.get('Location'),app+'/?auth_error=approval_pending');
  assert.equal(callback.headers.getSetCookie().length,3);
  assert.doesNotMatch(await callback.text(),/synthetic/);
});

test('Callback without matching browser verifier cannot exchange or establish a session',async()=>{
  const res=await supabaseAPI(request('/api/auth/google/callback?code=stolen'),{...env,GOOGLE_LOGIN_ENABLED:'true'},()=>assert.fail('Must not exchange'));
  assert.equal(res.headers.get('Location'),app+'/?auth_error=google_failed');
  assert.ok(res.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
});

test('Session exposes only application data and refreshes expired tokens on the server',async()=>{
  const visited=[];
  const res=await supabaseAPI(request('/api/auth/session'),env,async(url,options)=>{
    visited.push(url);
    if(url.endsWith('/user'))return options.headers.Authorization===`Bearer ${tokens.access_token}`&&visited.length>2?response(identity):response({},401);
    if(url.includes('refresh_token')){
      assert.equal(JSON.parse(options.body).refresh_token,'synthetic-refresh');return response(tokens);
    }
    return response({user:{id:identity.id,accountStatus:'approved'}});
  });
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{user:{id:identity.id,accountStatus:'approved'},googleEnabled:false,googleOnly:false,passwordEnabled:true,registrationMode:'admin',passwordRecovery:false,passwordMaxBytes:72});
  assert.equal(res.headers.getSetCookie().length,2);
  assert.match(res.headers.get('Cache-Control'),/no-store/);
});

test('Transient auth failure does not clear valid cookies or disclose provider diagnostics',async()=>{
  const res=await supabaseAPI(request('/api/auth/session'),env,async()=>response({error:'private-provider-diagnostic'},500));
  assert.equal(res.status,503);assert.equal(res.headers.getSetCookie().length,0);
  assert.doesNotMatch(await res.text(),/private-provider/);
});

test('Anonymous session works; protected routes require a verified account without depending on Google',async()=>{
  const anon=await supabaseAPI(request('/api/auth/session','GET',null,{Cookie:''}),env,()=>assert.fail('No session'));
  assert.equal((await anon.json()).user,null);
  const denied=await supabaseAPI(request('/api/studies','GET',null,{Cookie:''}),env,()=>assert.fail('Must not call database'));
  assert.equal(denied.status,401);
  const password=await supabaseAPI(request('/api/studies'),env,async()=>response({identities:[{provider:'email'}]}));
  assert.equal(password.status,403);
});

test('Study requests use the verified user JWT and URL identifier, never caller-supplied owner or ID',async()=>{
  const res=await supabaseAPI(request('/api/studies/actual-lot','PUT',{id:'forged-lot',user_id:'another-user',lot:{id:'actual-lot'}}),env,async(url,options)=>{
    if(url.endsWith('/user'))return response(identity);
    const body=JSON.parse(options.body);
    assert.equal(body.operation,'save-study');assert.equal(body.payload.id,'actual-lot');
    assert.equal(options.headers.Authorization,'Bearer '+tokens.access_token);
    return response({error:'Sem créditos',status:409,code:'NO_CREDITS'});
  });
  assert.equal(res.status,409);assert.equal((await res.json()).code,'NO_CREDITS');
});

test('PDF download remains private and binary, with attachment disposition',async()=>{
  const bytes=Buffer.from('%PDF-1.4\n\x00\xff\n%%EOF','latin1');
  const res=await supabaseAPI(request('/api/documents/doc-123/file'),env,async(url)=>{
    if(url.endsWith('/user'))return response(identity);
    return response({pdf:bytes.toString('base64'),filename:'certidão.pdf'});
  });
  assert.equal(res.status,200);assert.equal(res.headers.get('Content-Type'),'application/pdf');
  assert.match(res.headers.get('Content-Disposition'),/attachment/);
  assert.match(res.headers.get('Content-Security-Policy'),/sandbox/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes);
});

test('Request limits apply without Content-Length; invalid JSON is rejected',async()=>{
  for(const [body,status]of [[JSON.stringify({name:'x'.repeat(800001)}),413],['[]',400],['bad json',400]]){
    const req=new Request(app+'/api/profile',{method:'PUT',body,headers:{Origin:app,Cookie:cookie,'X-Viabileasy-Request':'1','Content-Type':'application/json'}});
    const res=await supabaseAPI(req,env,async(url)=>{assert.ok(url.endsWith('/user'));return response(identity);});
    assert.equal(res.status,status);
  }
});

test('Readiness calls only the dedicated anonymous readiness function',async()=>{
  const res=await supabaseAPI(request('/api/ready','GET',null,{Cookie:''}),env,async(url,options)=>{
    assert.equal(url,env.SUPABASE_URL+'/rest/v1/rpc/viabil_ready');
    assert.equal(options.headers.Authorization,undefined);assert.equal(options.body,'{}');
    return response({status:'ready'});
  });
  assert.deepEqual(await res.json(),{status:'ready'});
});

test('Logout revokes the Supabase session and clears local cookies; login validates fields',async()=>{
  const res=await supabaseAPI(request('/api/auth/logout','POST',{}),env,async(url)=>{
    if(url.endsWith('/user'))return response(identity);
    assert.match(url,/\/logout\?scope=local$/);return new Response(null,{status:204});
  });
  assert.equal(res.status,200);assert.ok(res.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
  const password=await supabaseAPI(request('/api/auth/login','POST',{}),env,()=>assert.fail('No password login'));
  assert.equal(password.status,400);
});

test('Pages selects Supabase mode even when a legacy Render origin exists',async()=>{
  const res=await onRequest({request:request('/api/health'),env:{...env,API_ORIGIN:'https://old.onrender.com'}});
  assert.equal((await res.json()).backend,'cloudflare-supabase');
});

test('Email/password login establishes HttpOnly cookies and never returns credentials or provider tokens',async()=>{
  for(const remember of [false,true]){
    const res=await supabaseAPI(request('/api/auth/login','POST',{email:' Person@Example.Test ',password:'synthetic-password-only',remember}),env,async(url,options)=>{
      if(url.includes('grant_type=password')){
        assert.deepEqual(JSON.parse(options.body),{email:'person@example.test',password:'synthetic-password-only'});
        return response(tokens);
      }
      if(url.endsWith('/user'))return response(identity);
      assert.equal(JSON.parse(options.body).operation,'session');
      return response({user:{id:identity.id,accountStatus:'approved'}});
    });
    assert.equal(res.status,200);
    const values=res.headers.getSetCookie();
    assert.equal(values.length,3);
    assert.ok(values.every(value=>/HttpOnly; Secure; SameSite=Lax/.test(value)));
    assert.ok(values.every(value=>remember ? value.includes('Max-Age=2592000') : !value.includes('Max-Age=')));
    assert.doesNotMatch(await res.text(),/synthetic|refresh_token|access_token|password/);
  }
});

test('Invalid credentials and provider failures create no session and disclose no provider details',async()=>{
  for(const [status,error_code,expected]of [[400,'invalid_credentials',401],[429,'over_request_rate_limit',429],[500,'private_error',503],[400,'email_not_confirmed',403]]){
    const res=await supabaseAPI(request('/api/auth/login','POST',{email:'person@example.test',password:'synthetic-password-only'}),env,async(url)=>{
      assert.match(url,/grant_type=password/);
      return response({error_code,msg:'private diagnostic'},status);
    });
    assert.equal(res.status,expected);
    assert.equal(res.headers.getSetCookie().length,0);
    assert.doesNotMatch(await res.text(),/private diagnostic|synthetic-password/);
  }
});

test('Pending users can authenticate but application approval still gates tool access',async()=>{
  const res=await supabaseAPI(request('/api/auth/login','POST',{email:'person@example.test',password:'synthetic-password-only'}),env,async(url)=>{
    if(url.includes('grant_type=password'))return response(tokens);
    if(url.endsWith('/user'))return response(identity);
    return response({user:{id:identity.id,accountStatus:'pending'}});
  });
  assert.equal(res.status,200);
  assert.equal((await res.json()).user.accountStatus,'pending');
});

test('Google and self-service mail endpoints are disabled by default',async()=>{
  for(const [path,method]of [['/api/auth/google','GET'],['/api/auth/register','POST'],['/api/auth/forgot-password','POST']]){
    const res=await supabaseAPI(request(path,method,method==='POST'?{}:undefined),env,()=>assert.fail('Must not call a provider'));
    assert.equal(res.status,404);
  }
});

test('Refreshing a browser-only password session does not turn it into a persistent session',async()=>{
  let attempts=0;
  const res=await supabaseAPI(request('/api/auth/session','GET',null,{Cookie:cookie+'; __Host-ve_remember=0'}),env,async(url)=>{
    if(url.endsWith('/user'))return ++attempts===1?response({},401):response(identity);
    if(url.includes('grant_type=refresh_token'))return response(tokens);
    return response({user:{id:identity.id,accountStatus:'approved'}});
  });
  assert.equal(res.status,200);
  assert.ok(res.headers.getSetCookie().every(value=>!value.includes('Max-Age=')));
});

const adminSession = '00000000-0000-4000-8000-000000000001';
const adminToken = 'header.' + Buffer.from(JSON.stringify({session_id: adminSession})).toString('base64url') + '.signature';
const managedEnv = {...env, SUPABASE_SECRET_KEY: 'sb_secret_synthetic_test'};
const adminRequest = (path, data) => request(path, 'POST', data, {Cookie: '__Host-ve_access=' + adminToken});

test('Managed account creation is authorized first and its server secret stays out of responses', async () => {
  let storedHash;
  const res = await supabaseAPI(adminRequest('/api/admin/users', {name: 'Nova Pessoa', email: ' New@Example.Test ', requestKey: 'create-1', role: 'super_admin', balance: 1000}), managedEnv, async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return response(identity);
    const data = JSON.parse(options.body);
    if (url.endsWith('/viabil_api')) {
      assert.equal(data.operation, 'account-admin');
      assert.equal(options.headers.Authorization, 'Bearer ' + adminToken);
      return response({user: {id: 'admin-id'}});
    }
    assert.equal(options.headers.apikey, managedEnv.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.Authorization, undefined);
    if (url.endsWith('/admin/users')) {
      assert.equal(data.email, 'new@example.test');
      assert.equal(data.email_confirm, false);
      assert.equal(data.password.length, 43);
      assert.equal(data.app_metadata.viabil_actor, 'admin-id');
      assert.equal(data.role, undefined);
      return response({id: 'new-id'});
    }
    assert.equal(data.payload.sessionId, adminSession);
    if (data.operation === 'lookup') return response({userId: null});
    assert.equal(data.operation, 'provision');
    assert.match(data.payload.hash, /^[a-f0-9]{64}$/);
    storedHash = data.payload.hash;
    return response({user: {id: 'new-id', role: 'user', accountStatus: 'pending'}, expiresAt: 1});
  });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.delivery, 'manual');
  const token = new URL(data.accessLink).hash.slice('#reset='.length);
  assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex'), storedHash);
  assert.doesNotMatch(JSON.stringify(data), /sb_secret|password|access_token|refresh_token/);
});

test('Ordinary and anonymous users cannot reach account provisioning or private link generation', async () => {
  for (const path of ['/api/admin/users', '/api/admin/users/person/access-link']) {
    let calls = 0;
    const denied = await supabaseAPI(adminRequest(path, {requestKey: 'forged'}), managedEnv, async (url) => {
      calls++;
      if (url.endsWith('/auth/v1/user')) return response(identity);
      assert.ok(url.endsWith('/viabil_api'));
      return response({error: 'Acesso restrito', status: 403});
    });
    assert.equal(denied.status, 403);
    assert.equal(calls, 2);
    const anonymous = await supabaseAPI(request(path, 'POST', {}, {Cookie: ''}), managedEnv, () => assert.fail('No provider call'));
    assert.equal(anonymous.status, 401);
  }
});

test('Password definition consumes the link before changing provider credentials and returning to login', async () => {
  const operations = [];
  const res = await supabaseAPI(request('/api/auth/reset-password', 'POST', {token: 'x'.repeat(43), password: 'Senha individual de teste'}), managedEnv, async (url, options) => {
    const data = JSON.parse(options.body);
    if (url.endsWith('/admin/users/person-id')) {
      operations.push('provider-password');
      assert.equal(options.method, 'PUT');
      assert.equal(data.email_confirm, true);
      return response({id: 'person-id'});
    }
    operations.push(data.operation);
    assert.match(data.payload.hash, /^[a-f0-9]{64}$/);
    assert.equal(data.payload.password, undefined);
    return response(data.operation === 'consume' ? {userId: 'person-id'} : {ok: true});
  });
  assert.equal(res.status, 200);
  assert.deepEqual(operations, ['consume', 'provider-password', 'complete']);
  assert.ok(res.headers.getSetCookie().every(value => value.includes('Max-Age=0')));
  assert.doesNotMatch(await res.text(), /Senha individual|xxxxxxxx|access_token/);
});

test('Provider password failure leaves the account closed and does not complete activation', async () => {
  const operations = [];
  const res = await supabaseAPI(request('/api/auth/reset-password', 'POST', {token: 'x'.repeat(43), password: 'Senha individual de teste'}), managedEnv, async (url, options) => {
    if (url.endsWith('/admin/users/person-id')) return response({error: 'private diagnostic'}, 500);
    const data = JSON.parse(options.body);
    operations.push(data.operation);
    return response({userId: 'person-id'});
  });
  assert.equal(res.status, 503);
  assert.deepEqual(operations, ['consume']);
  assert.doesNotMatch(await res.text(), /private diagnostic|Senha individual/);
});

test('Malformed links and passwords beyond the real provider limit cannot consume a link', async () => {
  for (const data of [{token: 'broken', password: 'valid test password'}, {token: 'x'.repeat(43), password: 'a'.repeat(73)}, {token: 'x'.repeat(43), password: 'á'.repeat(37)}]) {
    const res = await supabaseAPI(request('/api/auth/reset-password', 'POST', data), managedEnv, () => assert.fail('Must validate before consuming'));
    assert.equal(res.status, 400);
  }
});
