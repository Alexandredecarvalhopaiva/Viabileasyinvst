/** Local QA only: isolated accounts and same-origin viewport fixture, never production data. */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join } from 'node:path';
import { createAccounts } from '../server/accounts.mjs';
const port = Number(process.env.AUDIT_PORT || 4181);
const origin = process.env.AUDIT_ORIGIN || `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), 'viabileasy-ui-'));
const root = resolve('dist');
const reports = [];
const accounts = createAccounts({ origin, dataDir, sendMail: async () => {} });
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json', '.webp':'image/webp' };
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const url = new URL(req.url, origin);
  try {
    if (url.pathname.startsWith('/api/')) return await accounts.handle(req, res, url);
    if (url.pathname === '/__audit-results') {
      if (req.method === 'POST') { let body=''; for await (const chunk of req) body += chunk; reports.push(JSON.parse(body)); }
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(reports));
    }
    if (url.pathname === '/__audit') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Auditoria local · ViabilEasy</title><style>*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#e4eae8;color:#183d37}header{position:sticky;top:0;padding:12px;background:white;z-index:5;display:flex;gap:8px;align-items:center;flex-wrap:wrap}button,select{padding:10px;border:1px solid #aabbaf;border-radius:6px;background:white;color:inherit}#viewport{width:100%;overflow:auto;min-height:80vh;padding:12px}#fixture{border:0;background:white;transform-origin:top left}#output{padding:12px;white-space:pre-wrap;font-size:11px}#frame-space{position:relative}</style><header><strong>QA local</strong><label>Largura <select id="width">${[320,375,390,768,1024,1280,1440,1920,2560,3840].map(w=>`<option ${w===390?'selected':''}>${w}</option>`).join('')}</select></label><label>Altura <select id="height"><option>844</option><option>568</option><option>768</option><option>1080</option></select></label><button id="matrix">Medir 8 larguras</button><button id="fit">Alternar escala</button><button id="measure">Medir tela</button><label>Etapa <input id="phase" value="antes" size="12"></label><span id="status">Preparando…</span></header><div id="viewport"><div id="frame-space"><iframe id="fixture" title="ViabilEasy em revisão" src="/"></iframe></div></div><details><summary>Resultados técnicos</summary><pre id="output"></pre></details><script src="/__audit-client.js"></script></html>`);
    }
    const file = url.pathname === '/__audit-client.js' ? resolve('scripts/ui-audit-client.js') : resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (url.pathname !== '/__audit-client.js' && !file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
    const body = await readFile(file); res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.end(body);
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end(error.message); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
await fetch(origin + '/api/auth/register', { method:'POST', headers:{Origin:origin,'Content-Type':'application/json','X-Viabileasy-Request':'1'}, body:JSON.stringify({name:'Auditoria UI',email:'ui-audit@example.test',password:'ViabilEasy auditoria 2026!'}) });
// Trusted synthetic fixture: this is not the application's public signup flow.
const seed=new DatabaseSync(join(dataDir,'accounts.sqlite'));
seed.prepare("UPDATE users SET account_status='approved' WHERE email=?").run('ui-audit@example.test');seed.close();
console.log(`Auditoria em ${origin}/__audit · banco temporário ${dataDir}`);
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => { accounts.close(); process.exit(0); }));
