/** Pages runtime: password login + HttpOnly sessions, Supabase RPC with the user's JWT.
 * No database password, service-role key, mail provider or Python service is used.
 */
class APIError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const encoder = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json; charset=utf-8'}});
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const cookies = request => Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(part => {
  const split = part.indexOf('='); return split < 0 ? ['', ''] : [part.slice(0, split).trim(), part.slice(split + 1).trim()];
}));
const cookie = (name, value, seconds) => `__Host-ve_${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax${seconds == null ? '' : `; Max-Age=${seconds}`}`;
const clearSession = () => [cookie('access', '', 0), cookie('refresh', '', 0), cookie('remember', '', 0)];
function sessionCookies(tokens, remember = true) {
  if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string'
      || !/^[A-Za-z0-9_.-]{1,3800}$/.test(tokens.access_token) || !/^[A-Za-z0-9_-]{1,3800}$/.test(tokens.refresh_token)) {
    throw new APIError(502, 'Não foi possível iniciar sua sessão. Tente novamente.');
  }
  return [cookie('access', tokens.access_token, remember ? 30 * 86400 : null), cookie('refresh', tokens.refresh_token, remember ? 30 * 86400 : null)];
}
function configuration(env) {
  try {
    const supabase = new URL(env.SUPABASE_URL), app = new URL(env.APP_URL);
    if (supabase.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(supabase.hostname)
        || supabase.origin !== supabase.href.replace(/\/$/, '') || app.protocol !== 'https:'
        || app.origin !== app.href.replace(/\/$/, '') || !env.SUPABASE_PUBLISHABLE_KEY) throw Error();
    return {supabase: supabase.origin, app: app.origin, key: env.SUPABASE_PUBLISHABLE_KEY};
  } catch { throw new APIError(503, 'O acesso ainda está sendo configurado. Tente novamente em instantes.'); }
}
async function boundedJSON(request, maximum) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) throw new APIError(415, 'Envie os dados em JSON.');
  const reader = request.body?.getReader();
  let size = 0; const chunks = [];
  if (reader) while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new APIError(413, 'O arquivo ou os dados excedem o limite permitido.'); }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { throw new APIError(400, 'Os dados enviados são inválidos.'); }
}
export async function supabaseAPI(request, env, fetcher = fetch) {
  const outgoing = [];
  let response;
  try {
    const config = configuration(env), url = new URL(request.url), path = url.pathname, method = request.method;
    const jar = cookies(request);
    // Prevent preview hosts and forged Origin headers from accessing the production session.
    if (url.origin !== config.app) throw new APIError(403, 'Abra o endereço principal do site para acessar sua conta.');
    if (!['GET', 'HEAD'].includes(method) && (request.headers.get('Origin') !== config.app
        || request.headers.get('X-Viabileasy-Request') !== '1')) throw new APIError(403, 'Requisição não autorizada. Recarregue a página.');
    const provider = async (endpoint, {token, body, method = 'GET'} = {}) => {
      const result = await fetcher(config.supabase + endpoint, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {apikey: config.key, ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(body ? {'Content-Type': 'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
      const data = await result.json().catch(() => null);
      return {ok: result.ok, status: result.status, data};
    };
    const rpc = async (operation, payload, token) => {
      const result = await provider(operation === 'ready' ? '/rest/v1/rpc/viabil_ready' : '/rest/v1/rpc/viabil_api',
        {method: 'POST', token, body: operation === 'ready' ? {} : {operation, payload}});
      if (!result.ok || !result.data) throw new APIError(result.status === 401 ? 401 : 503, 'Não foi possível acessar os dados. Tente novamente.');
      if (result.data.error) throw new APIError(result.data.status || 400, result.data.error, result.data.code);
      return result.data;
    };
    let access = jar['__Host-ve_access'];
    const authenticate = async (required = true, allowRefresh = true) => {
      let result = access ? await provider('/auth/v1/user', {token: access}) : null;
      if (result && !result.ok && ![401, 403].includes(result.status)) throw new APIError(503, 'O acesso está temporariamente indisponível.');
      if (!result?.ok && allowRefresh && jar['__Host-ve_refresh']) {
        const refreshed = await provider('/auth/v1/token?grant_type=refresh_token', {method: 'POST', body: {refresh_token: jar['__Host-ve_refresh']}});
        if (refreshed.ok) {
          access = refreshed.data.access_token; outgoing.push(...sessionCookies(refreshed.data, jar['__Host-ve_remember'] !== '0'));
          result = await provider('/auth/v1/user', {token: access});
        } else if (![400, 401, 403].includes(refreshed.status)) throw new APIError(503, 'O acesso está temporariamente indisponível.');
      }
      if (result && !result.ok && ![401, 403].includes(result.status)) throw new APIError(503, 'O acesso está temporariamente indisponível.');
      if (!result?.ok) {
        outgoing.push(...clearSession());
        if (required) throw new APIError(401, 'Sua sessão terminou. Entre novamente para continuar.');
        return null;
      }
      if (!result.data.email || !result.data.email_confirmed_at) throw new APIError(403, 'Solicite ao administrador a validação da sua conta.', 'ACCOUNT_UNVERIFIED');
      return result.data;
    };
    const redirect = target => new Response(null, {status: 303, headers: {Location: target}});
    if (path === '/api/health' && method === 'GET') {
      response = json({status: 'ok', backend: 'cloudflare-supabase', version: '0.16.0'});
    } else if (path === '/api/ready' && method === 'GET') {
      const ready = await rpc('ready', {}, null);
      response = json(ready);
    } else if (path === '/api/auth/login' && method === 'POST') {
      const data = await boundedJSON(request, 8000);
      const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          || typeof data.password !== 'string' || !data.password.length || data.password.length > 128) {
        throw new APIError(400, 'Informe seu e-mail e sua senha.');
      }
      const login = await provider('/auth/v1/token?grant_type=password', {method: 'POST', body: {email, password: data.password}});
      if (!login.ok) {
        if (login.status === 429) throw new APIError(429, 'Muitas tentativas. Aguarde alguns minutos antes de entrar novamente.');
        if (login.data?.error_code === 'email_not_confirmed') throw new APIError(403, 'Solicite ao administrador a validação da sua conta.', 'ACCOUNT_UNVERIFIED');
        if (login.status >= 500 || login.data?.error_code === 'email_provider_disabled') throw new APIError(503, 'O acesso por e-mail está temporariamente indisponível.');
        throw new APIError(401, 'E-mail ou senha incorretos.');
      }
      access = login.data.access_token;
      await authenticate(true, false);
      const result = await rpc('session', {}, access);
      const remember = data.remember === true;
      outgoing.push(...sessionCookies(login.data, remember), cookie('remember', remember ? '1' : '0', remember ? 30 * 86400 : null));
      response = json(result);
    } else if (path.startsWith('/api/auth/google') && env.GOOGLE_LOGIN_ENABLED !== 'true') {
      throw new APIError(404, 'Entre com seu e-mail e senha.');
    } else if (path === '/api/auth/google' && method === 'GET') {
      const verifier = random();
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
      outgoing.push(cookie('pkce', verifier, 600));
      const target = new URL(config.supabase + '/auth/v1/authorize');
      target.search = new URLSearchParams({provider: 'google', redirect_to: config.app + '/api/auth/google/callback',
        code_challenge: challenge, code_challenge_method: 's256', scopes: 'email profile'});
      response = redirect(target.href);
    } else if (path === '/api/auth/google/callback' && method === 'GET') {
      outgoing.push(cookie('pkce', '', 0));
      try {
        const verifier = jar['__Host-ve_pkce'], code = url.searchParams.get('code');
        if (url.searchParams.has('error') || !code || code.length > 2048 || !/^[A-Za-z0-9_-]{43}$/.test(verifier || '')) throw Error();
        const exchange = await provider('/auth/v1/token?grant_type=pkce', {method: 'POST', body: {auth_code: code, code_verifier: verifier}});
        if (!exchange.ok) throw Error();
        access = exchange.data.access_token;
        await authenticate(true, false);
        const session = await rpc('session', {}, access);
        outgoing.push(...sessionCookies(exchange.data));
        const status = session.user?.accountStatus;
        response = redirect(config.app + (status === 'approved' ? '/' : '/?auth_error=approval_' + (status === 'rejected' ? 'rejected' : 'pending')));
      } catch {
        outgoing.push(...clearSession()); response = redirect(config.app + '/?auth_error=google_failed');
      }
    } else if (path === '/api/auth/session' && method === 'GET') {
      const identity = await authenticate(false);
      const result = identity ? await rpc('session', {}, access) : {user: null};
      response = json({...result, googleEnabled: env.GOOGLE_LOGIN_ENABLED === 'true', googleOnly: false,
        passwordEnabled: true, registrationMode: 'admin', passwordRecovery: false});
    } else if (path === '/api/auth/logout' && method === 'POST') {
      await authenticate(false);
      if (access) {
        const result = await provider('/auth/v1/logout?scope=local', {method: 'POST', token: access});
        if (!result.ok && ![401, 403].includes(result.status)) throw new APIError(503, 'Não foi possível sair agora. Tente novamente.');
      }
      outgoing.push(...clearSession(), cookie('pkce', '', 0)); response = json({ok: true});
    } else if (/^\/api\/auth\//.test(path)) {
      throw new APIError(404, 'Para criar ou recuperar sua conta, fale com o administrador.', 'CONTACT_ADMIN');
    } else {
      const routes = [
        ['GET', /^\/api\/usage$/, 'usage'], ['GET', /^\/api\/studies$/, 'studies'],
        ['GET', /^\/api\/studies\/([\w-]{1,80})$/, 'study'],
        ['PUT', /^\/api\/studies\/([\w-]{1,80})$/, 'save-study'],
        ['POST', /^\/api\/studies\/([\w-]{1,80})\/open$/, 'open-study'],
        ['DELETE', /^\/api\/studies\/([\w-]{1,80})$/, 'delete-study'],
        ['PUT', /^\/api\/profile$/, 'profile'], ['PUT', /^\/api\/profile\/photo$/, 'photo'],
        ['GET', /^\/api\/documents$/, 'documents'], ['POST', /^\/api\/documents$/, 'add-document'],
        ['GET', /^\/api\/documents\/([\w-]{1,80})\/file$/, 'file'], ['DELETE', /^\/api\/documents\/([\w-]{1,80})$/, 'delete-document'],
        ['GET', /^\/api\/admin\/overview$/, 'overview'],
        ['POST', /^\/api\/admin\/users\/([\w-]{1,80})\/review$/, 'review'],
        ['POST', /^\/api\/admin\/users\/([\w-]{1,80})\/credits$/, 'credits'],
      ];
      const route = routes.find(([verb, pattern]) => verb === method && pattern.test(path));
      if (!route) throw new APIError(404, 'Recurso não encontrado.');
      await authenticate();
      const data = ['POST', 'PUT'].includes(method) ? await boundedJSON(request, route[2] === 'add-document' ? 15 * 1024 * 1024 : 800000) : {};
      const result = await rpc(route[2], {...data, id: path.match(route[1])[1],
        ...(route[2] === 'documents' ? {page: url.searchParams.get('page') || '0', lotId: url.searchParams.get('lotId') || ''} : {})}, access);
      if (route[2] === 'file') {
        const binary = atob(result.pdf.replace(/\s/g, ''));
        response = new Response(Uint8Array.from(binary, character => character.charCodeAt(0)), {headers: {
          'Content-Type': 'application/pdf', 'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': `attachment; filename="documento.pdf"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        }});
      } else response = json(result, route[2] === 'add-document' ? 201 : 200);
    }
  } catch (error) {
    response = json({error: error instanceof APIError ? error.message : 'Não foi possível concluir agora. Tente novamente.',
      ...(error instanceof APIError && error.code ? {code: error.code} : {})}, error instanceof APIError ? error.status : 503);
  }
  for (const value of outgoing) response.headers.append('Set-Cookie', value);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
