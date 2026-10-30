import {supabaseAPI} from '../../server/pages-supabase.mjs';
/** Supabase runs directly on Pages; the old Render adapter remains opt-in for existing deployments. */
export async function proxyAPI(request, env, fetcher = fetch) {
  const unavailable = () => new Response(
    JSON.stringify({error: 'O serviço está temporariamente indisponível. Tente novamente em instantes.'}),
    {status: 503, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}},
  );
  let origin;
  try {
    origin = new URL(env.API_ORIGIN);
    // Only the configured Render origin is allowed, never a target supplied by a visitor.
    if (origin.protocol !== 'https:' || !/^[a-z0-9-]+\.onrender\.com$/.test(origin.hostname)
      || origin.port || origin.username || origin.password || origin.pathname !== '/'
      || origin.search || origin.hash) return unavailable();
  } catch {
    return unavailable();
  }
  const incoming = new URL(request.url);
  origin.pathname = incoming.pathname;
  origin.search = incoming.search;
  const upstream = new Request(origin, request);
  upstream.headers.delete('Host');
  // Do not forward client-supplied proxy chains to Uvicorn's trusted ingress.
  for (const header of ['Forwarded', 'X-Forwarded-For', 'X-Real-IP', 'X-Forwarded-Host']) {
    upstream.headers.delete(header);
  }
  const clientIP = request.headers.get('CF-Connecting-IP');
  if (clientIP) upstream.headers.set('X-Forwarded-For', clientIP);
  upstream.headers.set('X-Forwarded-Proto', 'https');
  try {
    // Do not follow OAuth redirects server-side or cache private API responses.
    const response = await fetcher(upstream, {redirect: 'manual'});
    const result = new Response(response.body, response);
    result.headers.set('Cache-Control', 'no-store');
    return result;
  } catch {
    return unavailable();
  }
}

export function onRequest({request, env}) {
  if (env.BACKEND === 'supabase' || env.SUPABASE_URL) return supabaseAPI(request, env);
  return proxyAPI(request, env);
}
