import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createAccounts } from './server/accounts.mjs';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.json':'application/json' };
const port = Number(process.env.PORT || 4173);
const origin = process.env.APP_URL || `http://127.0.0.1:${port}`;
const accounts = createAccounts({ origin });
const server = createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/')) { await accounts.handle(req, res, url); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const path = decodeURIComponent(url.pathname);
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type':types[extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (res.headersSent) { res.end(); return; }
    res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Não foi possível abrir este recurso.');
  }
});
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  process.stdout.write(`ViabilEasy em ${origin}\n`);
  if (!process.env.GOOGLE_CLIENT_ID) process.stdout.write('Google: configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.\n');
  if (!process.env.SMTP_HOST) process.stdout.write('E-mails locais: .data/mail/ (nenhuma mensagem é enviada para a internet).\n');
});
server.on('error', error => { console.error(`Não foi possível iniciar o servidor: ${error.code}`); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { accounts.close(); process.exit(0); }));
