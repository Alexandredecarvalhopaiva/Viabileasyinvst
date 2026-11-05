// Local integration transport. Auth and RPC requests go to real disposable services.
import https from 'node:https';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {supabaseAPI} from '../../server/pages-supabase.mjs';

const config = JSON.parse(await readFile(process.env.ACCOUNTS_TEST_CONFIG, 'utf8'));
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png'};
const provider = async (url, options) => {
  const path = new URL(url).pathname + new URL(url).search;
  const result = await fetch(path.startsWith('/auth/v1/') ? config.auth + path.slice(8) : config.rest + path.slice(8), options);
  if (!result.ok) {
    const error = await result.clone().json().catch(() => ({}));
    console.error(JSON.stringify({path: path.split('?')[0], status: result.status, code: error.code || error.error_code}));
  }
  return result;
};
const server = https.createServer({key: await readFile(config.key), cert: await readFile(config.cert)}, async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(config.env.APP_URL + req.url, {method: req.method, headers: req.headers,
        ...(!['GET','HEAD'].includes(req.method) ? {body: Buffer.concat(chunks)} : {})});
      const result = await supabaseAPI(request, config.env, provider);
      for (const [key, value] of result.headers) if (key !== 'set-cookie') res.setHeader(key, value);
      res.setHeader('Set-Cookie', result.headers.getSetCookie());
      res.writeHead(result.status);
      res.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const path = resolve('dist', req.url === '/' ? 'index.html' : '.' + new URL(req.url, config.env.APP_URL).pathname);
    if (!path.startsWith(resolve('dist') + '/')) throw Error('Invalid path');
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch {
    res.writeHead(500);
    res.end('Local test transport failed');
  }
});
server.listen(config.port, '127.0.0.1');
