import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, chmodSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import nodemailer from 'nodemailer';
import { ensureAccountRoles } from './account-roles.mjs';
import { createDocumentStore } from './documents.mjs';
import { ensureAccountApprovals, reviewAccount } from './account-approvals.mjs';
import { createUsageCredits } from './usage-credits.mjs';
import AnalysisIdentity from '../dist/analysis-identity.js';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const now = () => Date.now();
const fail = (status, message) => Object.assign(new Error(message), { status });
const emailOf = input => {
  if (typeof input !== 'string' || input.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())) throw fail(400, 'Informe um e-mail válido.');
  return input.trim().toLowerCase();
};
const nameOf = input => {
  if (typeof input !== 'string' || input.trim().length < 2 || input.trim().length > 100) throw fail(400, 'Informe um nome entre 2 e 100 caracteres.');
  return input.trim();
};
const passwordOf = input => {
  if (typeof input !== 'string' || input.length < 12 || input.length > 128) throw fail(400, 'Use uma senha com 12 a 128 caracteres.');
  return input;
};
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return salt + ':' + hash.toString('hex');
}
async function matches(password, encoded) {
  const [salt, hex] = (encoded || ('0'.repeat(32) + ':' + '0'.repeat(128))).split(':');
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(hash, Buffer.from(hex, 'hex'));
}
async function readJSON(req, maxBytes = 800_000) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail(415, 'Envie os dados em JSON.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw fail(413, 'O arquivo ou os dados excedem o limite permitido.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
    return data;
  } catch { throw fail(400, 'Os dados enviados são inválidos.'); }
}
function photoOf(image) {
  if (image === null) return { bytes: null, mime: null };
  if (typeof image !== 'string') throw fail(400, 'Selecione uma imagem PNG, JPEG ou WebP.');
  const match = image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/);
  if (!match) throw fail(400, 'Selecione uma imagem PNG, JPEG ou WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid || bytes.length > 450_000 || bytes.length < 12) throw fail(400, 'Use uma imagem válida de até 450 KB após o ajuste.');
  return { bytes, mime: 'image/' + match[1] };
}
function studyOf(id, input) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || input.lot?.id !== id) throw fail(400, 'Identificação do estudo inválida.');
  const l = input.lot;
  if (typeof l.name !== 'string' || l.name.length > 120 || !Number.isFinite(l.area) || l.area <= 0 || l.area > 1e6) throw fail(400, 'Terreno inválido.');
  if (![l.width, l.depth].every(v => Number.isFinite(v) && v > 0 && v <= 20_000)) throw fail(400, 'Dimensões inválidas.');
  if (l.geometry && (!Array.isArray(l.geometry.vertices) || l.geometry.vertices.length > 120 || l.geometry.vertices.length < 3 || !l.geometry.vertices.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) throw fail(400, 'Geometria inválida.');
  const scenario = {};
  for (const key of ['floors','to','efficiency','unitArea','price','cost','landPrice','indirect','profit']) {
    const v = input.scenario?.[key];
    if (!Number.isFinite(v) || v < 0 || v > 1e12) throw fail(400, 'Cenário inválido.');
    scenario[key] = v;
  }
  if (!Number.isInteger(scenario.floors) || scenario.floors < 1 || scenario.floors > 80 || scenario.unitArea <= 0 || scenario.efficiency <= 0 || scenario.efficiency > 100 || scenario.to > 100) throw fail(400, 'Cenário inválido.');
  if (!['H1','H3','Comercial','Flats','Misto'].includes(input.scenario?.use)) throw fail(400, 'Produto inválido.');
  scenario.use = input.scenario.use;
  const json = JSON.stringify({ lot: l, polygon: input.polygon || null, draft: input.draft || null, context: input.context || null, scenario });
  if (Buffer.byteLength(json) > 150_000) throw fail(413, 'Este estudo excede o tamanho permitido.');
  return json;
}

export function createAccounts({ origin, dataDir = process.env.DATA_DIR || resolve('.data'), sendMail, googleClient } = {}) {
  const appURL = new URL(origin);
  if (process.env.NODE_ENV === 'production' && (appURL.protocol !== 'https:' || !process.env.SMTP_HOST)) throw Error('Produção exige APP_URL HTTPS e SMTP_HOST.');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  const db = new DatabaseSync(resolve(dataDir, 'accounts.sqlite'));
  chmodSync(resolve(dataDir, 'accounts.sqlite'), 0o600);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;" +
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT, google_sub TEXT UNIQUE, photo BLOB, photo_type TEXT, google_photo TEXT, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS resets (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS oauth (hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL, user_id TEXT, session_hash TEXT, expires_at INTEGER NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS studies (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, last_opened_at INTEGER, PRIMARY KEY(user_id,id));" +
    "CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);");
  if (!db.prepare('PRAGMA table_info(studies)').all().some(column => column.name === 'last_opened_at')) {
    db.exec('ALTER TABLE studies ADD COLUMN last_opened_at INTEGER');
  }
  ensureAccountRoles(db);
  ensureAccountApprovals(db);
  const documents = createDocumentStore(db);
  const credits = createUsageCredits(db);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const callback = appURL.origin + '/api/auth/google/callback';
  const google = googleClient || new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, callback);
  const transport = process.env.SMTP_HOST ? nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000
  }) : null;
  const mail = sendMail || (async message => {
    if (transport) return transport.sendMail({ from: process.env.MAIL_FROM, ...message });
    const folder = resolve(dataDir, 'mail');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    await writeFile(resolve(folder, now() + '-' + randomUUID() + '.json'), JSON.stringify(message, null, 2), { mode: 0o600 });
  });
  const cookie = (name, value, age, path = '/') => name + '=' + value + '; Path=' + path + '; HttpOnly; SameSite=Lax' + (appURL.protocol === 'https:' ? '; Secure' : '') + (age !== undefined ? '; Max-Age=' + age : '');
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(p => p.trim().split('=')));
  const sessionHash = req => digest(cookies(req).viabileasy_session || '');
  const sessionUser = req => db.prepare("SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires_at>? AND users.account_status='approved'").get(sessionHash(req), now());
  const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, accountStatus: u.account_status, usage:u.account_status==='approved'?credits.info(u.id):{unlimited:false,balance:0,used:0}, googleConnected: Boolean(u.google_sub), hasPassword: Boolean(u.password_hash), avatar: u.photo ? '/api/profile/photo?v=' + u.updated_at : u.google_photo || null });
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const redirect = (res, path) => { res.writeHead(303, { Location: path, 'Cache-Control': 'no-store' }); res.end(); };
  const transaction = action => { db.exec('BEGIN IMMEDIATE'); try { const result = action(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  function issueSession(req, res, userId, remember = false) {
    const secret = token(), ttl = remember ? 30 * 86400 : 12 * 3600;
    db.prepare('DELETE FROM sessions WHERE hash=?').run(sessionHash(req));
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(secret), userId, now() + ttl * 1000);
    const previous = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [...(previous ? (Array.isArray(previous) ? previous : [previous]) : []), cookie('viabileasy_session', secret, remember ? ttl : undefined)]);
  }
  function rate(key, max, duration) {
    const record = db.prepare('SELECT * FROM limits WHERE key=?').get(key);
    if (record && record.expires_at > now()) {
      if (record.count >= max) throw fail(429, 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
      db.prepare('UPDATE limits SET count=count+1 WHERE key=?').run(key);
    } else db.prepare('INSERT OR REPLACE INTO limits VALUES (?,?,?)').run(key, 1, now() + duration);
  }
  function clean() {
    for (const table of ['sessions','resets','oauth','limits']) db.prepare('DELETE FROM ' + table + ' WHERE expires_at<?').run(now());
  }
  clean();
  const cleaner = setInterval(clean, 10 * 60_000).unref();
  async function googleCallback(req, res, url) {
    const state = url.searchParams.get('state') || '';
    const pending = db.prepare('SELECT * FROM oauth WHERE hash=? AND expires_at>?').get(digest(state), now());
    const browserState = cookies(req).viabileasy_oauth;
    if (!pending || !browserState || !state || !timingSafeEqual(Buffer.from(digest(state)), Buffer.from(digest(browserState)))) return redirect(res, '/?auth_error=google_expired');
    db.prepare('DELETE FROM oauth WHERE hash=?').run(digest(state));
    res.setHeader('Set-Cookie', cookie('viabileasy_oauth', '', 0, '/api/auth/google'));
    if (url.searchParams.has('error')) return redirect(res, '/?auth_error=google_cancelled');
    try {
      const { tokens } = await google.getToken({ code: url.searchParams.get('code'), codeVerifier: pending.verifier, redirect_uri: callback });
      const ticket = await google.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email_verified || payload.nonce !== pending.nonce) throw Error('Invalid identity');
      const email = emailOf(payload.email);
      let user = db.prepare('SELECT * FROM users WHERE google_sub=?').get(payload.sub);
      if (pending.user_id) {
        const current = sessionUser(req);
        if (!current || current.id !== pending.user_id || sessionHash(req) !== pending.session_hash) return redirect(res, '/?auth_error=google_expired');
        if (email !== current.email || (user && user.id !== current.id)) return redirect(res, '/?auth_error=google_email');
        db.prepare('UPDATE users SET google_sub=?,updated_at=? WHERE id=?').run(payload.sub, now(), current.id);
        user = db.prepare('SELECT * FROM users WHERE id=?').get(current.id);
      } else if (!user) {
        if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return redirect(res, '/?auth_error=google_conflict');
        let picture = null;
        try { const p = new URL(payload.picture); if (p.protocol === 'https:' && (p.hostname === 'lh3.googleusercontent.com' || p.hostname.endsWith('.googleusercontent.com'))) picture = p.href; } catch {}
        const id = randomUUID();
        db.prepare("INSERT INTO users(id,email,name,google_sub,google_photo,updated_at,created_at,role,account_status) VALUES(?,?,?,?,?,?,?,'user','pending')").run(id, email, nameOf(payload.name || email.split('@')[0]), payload.sub, picture, now(), now());
        user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
      }
      if (user.account_status !== 'approved') return redirect(res, '/?auth_error=' + (user.account_status === 'rejected' ? 'approval_rejected' : 'approval_pending'));
      issueSession(req, res, user.id, true);
      return redirect(res, '/');
    } catch {
      console.warn('Não foi possível concluir a autenticação Google.');
      return redirect(res, '/?auth_error=google_failed');
    }
  }
  return {
    close() { clearInterval(cleaner); db.close(); transport?.close(); },
    async handle(req, res, url) {
      try {
        const path = url.pathname, method = req.method, ip = req.socket.remoteAddress || 'unknown';
        if (!['GET', 'HEAD'].includes(method)) {
          if (req.headers.origin !== appURL.origin || req.headers['x-viabileasy-request'] !== '1') throw fail(403, 'Requisição não autorizada. Recarregue a página e tente novamente.');
          rate('write:' + ip, 180, 15 * 60_000);
        }
        if (path === '/api/auth/session' && method === 'GET') {
          const user = sessionUser(req);
          return json(res, 200, { user: user ? publicUser(user) : null, googleEnabled });
        }
        if (path === '/api/auth/google' && method === 'GET') {
          if (!googleEnabled) return redirect(res, '/?auth_error=google_unavailable');
          rate('google:' + ip, 30, 15 * 60_000);
          const link = url.searchParams.get('link') === '1', user = sessionUser(req);
          if (link && !user) throw fail(401, 'Entre novamente para conectar sua conta Google.');
          const state = token(), verifier = token(), nonce = token();
          db.prepare('INSERT INTO oauth VALUES(?,?,?,?,?,?)').run(digest(state), verifier, nonce, link ? user.id : null, link ? sessionHash(req) : null, now() + 10 * 60_000);
          res.setHeader('Set-Cookie', cookie('viabileasy_oauth', state, 600, '/api/auth/google'));
          return redirect(res, google.generateAuthUrl({ scope: ['openid','email','profile'], state, nonce, prompt: 'select_account', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }));
        }
        if (path === '/api/auth/google/callback' && method === 'GET') return await googleCallback(req, res, url);
        if (path === '/api/auth/register' && method === 'POST') {
          rate('register:' + ip, 10, 60 * 60_000);
          const body = await readJSON(req), email = emailOf(body.email), name = nameOf(body.name), password = passwordOf(body.password);
          const encoded = await hashPassword(password), id = randomUUID();
          try {
            db.prepare("INSERT INTO users(id,email,name,password_hash,updated_at,created_at,role,account_status) VALUES(?,?,?,?,?,?,'user','pending')").run(id, email, name, encoded, now(), now());
          } catch (e) { if (e.code?.startsWith('ERR_SQLITE')) throw fail(409, 'Não foi possível criar a conta com este e-mail. Tente entrar ou recuperar a senha.'); throw e; }
          return json(res, 201, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)), approvalStatus:'pending', message:'Cadastro recebido. Aguarde a aprovação do superadministrador para acessar as ferramentas.' });
        }
        if (path === '/api/auth/login' && method === 'POST') {
          rate('login:' + ip, 30, 15 * 60_000);
          const body = await readJSON(req), email = emailOf(body.email);
          rate('login-email:' + digest(email), 12, 15 * 60_000);
          if (typeof body.password !== 'string' || body.password.length > 128) throw fail(400, 'E-mail ou senha incorretos.');
          const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
          const valid = await matches(body.password, user?.password_hash);
          if (!user?.password_hash || !valid || db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id)?.password_hash !== user.password_hash) throw fail(401, 'E-mail ou senha incorretos.');
          if (user.account_status !== 'approved') throw Object.assign(fail(403,user.account_status === 'rejected' ? 'Seu cadastro não foi aprovado pelo superadministrador.' : 'Seu cadastro aguarda aprovação do superadministrador.'), {code:user.account_status === 'rejected' ? 'ACCOUNT_REJECTED' : 'ACCOUNT_PENDING'});
          issueSession(req, res, user.id, Boolean(body.remember));
          return json(res, 200, { user: publicUser(user) });
        }
        if (path === '/api/auth/forgot-password' && method === 'POST') {
          rate('forgot:' + ip, 15, 60 * 60_000);
          const body = await readJSON(req), email = emailOf(body.email);
          const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
          const key = 'reset:' + digest(email);
          const recent = db.prepare('SELECT * FROM limits WHERE key=? AND expires_at>?').get(key, now());
          if (user && (!recent || recent.count < 3)) {
            const secret = token(), hash = digest(secret);
            db.prepare('INSERT INTO resets VALUES(?,?,?)').run(hash, user.id, now() + 30 * 60_000);
            const link = appURL.origin + '/#reset=' + secret;
            try {
              await mail({ to: email, subject: 'Redefina sua senha · ViabilEasy', text: 'Olá, ' + user.name + '.\n\nPara criar uma nova senha, abra:\n' + link + '\n\nEste link expira em 30 minutos e só pode ser usado uma vez. Se você não pediu a alteração, ignore esta mensagem.\n\nEquipe ViabilEasy' });
            } catch {
              db.prepare('DELETE FROM resets WHERE hash=?').run(hash);
              console.warn('Falha no envio do e-mail de recuperação. Confira a configuração SMTP.');
            }
          }
          if (!recent) db.prepare('INSERT OR REPLACE INTO limits VALUES(?,?,?)').run(key, 1, now() + 60 * 60_000);
          else db.prepare('UPDATE limits SET count=count+1 WHERE key=?').run(key);
          return json(res, 200, { message: 'Se houver uma conta com esse e-mail, você receberá um link para redefinir sua senha.' });
        }
        if (path === '/api/auth/reset/check' && method === 'POST') {
          rate('reset-check:' + ip, 30, 15 * 60_000);
          const body = await readJSON(req);
          const record = typeof body.token === 'string' && db.prepare('SELECT hash FROM resets WHERE hash=? AND expires_at>?').get(digest(body.token), now());
          if (!record) throw fail(400, 'Este link expirou ou já foi utilizado. Solicite um novo.');
          return json(res, 200, { valid: true });
        }
        if (path === '/api/auth/reset-password' && method === 'POST') {
          rate('reset-use:' + ip, 20, 15 * 60_000);
          const body = await readJSON(req), password = passwordOf(body.password);
          if (typeof body.token !== 'string') throw fail(400, 'Link inválido.');
          const hash = digest(body.token);
          const reset = db.prepare('SELECT * FROM resets WHERE hash=? AND expires_at>?').get(hash, now());
          if (!reset) throw fail(400, 'Este link expirou ou já foi utilizado. Solicite um novo.');
          const encoded = await hashPassword(password);
          transaction(() => {
            const active = db.prepare('SELECT * FROM resets WHERE hash=? AND expires_at>?').get(hash, now());
            if (!active) throw fail(400, 'Este link expirou ou já foi utilizado. Solicite um novo.');
            db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(encoded, now(), active.user_id);
            db.prepare('DELETE FROM resets WHERE user_id=?').run(active.user_id);
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(active.user_id);
            db.prepare('DELETE FROM oauth WHERE user_id=?').run(active.user_id);
          });
          res.setHeader('Set-Cookie', cookie('viabileasy_session', '', 0));
          return json(res, 200, { message: 'Senha atualizada. Entre com sua nova senha.' });
        }
        const user = sessionUser(req);
        if (!user) throw fail(401, 'Sua sessão terminou. Entre novamente para continuar.');
        if (path === '/api/usage' && method === 'GET') return json(res,200,{usage:credits.info(user.id)});
        if (path === '/api/documents' && method === 'GET') return json(res,200,documents.list(user,{lotId:url.searchParams.get('lotId')||'',page:url.searchParams.get('page')||'0'}));
        if (path === '/api/documents' && method === 'POST') return json(res,201,{document:documents.add(user,await readJSON(req,15*1024*1024))});
        const documentFile = path.match(/^\/api\/documents\/([a-f0-9-]{36})\/file$/);
        if (documentFile && method === 'GET') {
          const file = documents.file(user,documentFile[1]);
          res.writeHead(200,{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':"attachment; filename=\"documento.pdf\"; filename*=UTF-8''"+encodeURIComponent(file.filename)});
          return res.end(Buffer.from(file.pdf));
        }
        if (path.startsWith('/api/admin/')) {
          if (user.role !== 'super_admin') throw fail(403, 'Este recurso exige acesso de superadministrador.');
          const grant = path.match(/^\/api\/admin\/users\/([a-f0-9-]{36})\/credits$/);
          if (grant && method === 'POST') {
            const body=await readJSON(req);
            return json(res,200,{usage:credits.grant(user.id,grant[1],body.amount,body.requestKey,body.note||'')});
          }
          const review = path.match(/^\/api\/admin\/users\/([a-f0-9-]{36})\/review$/);
          if (review && method === 'POST') {
            const body = await readJSON(req);
            return json(res,200,{user:reviewAccount(db,user.id,review[1],body.decision)});
          }
          if (path === '/api/admin/overview' && method === 'GET') {
            const totals = {
              users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
              superAdmins: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='super_admin'").get().count,
              studies: db.prepare('SELECT COUNT(*) AS count FROM studies').get().count,
              activeSessions: db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires_at>?').get(now()).count
            };
            totals.pendingUsers = db.prepare("SELECT COUNT(*) AS count FROM users WHERE account_status='pending'").get().count;
            const pendingUsers = db.prepare("SELECT id,email,name,role,created_at AS createdAt FROM users WHERE account_status='pending' ORDER BY created_at,id LIMIT 100").all();
            const users = db.prepare("SELECT u.id,u.email,u.name,u.role,u.account_status AS accountStatus,u.reviewed_at AS reviewedAt,r.name AS reviewerName,u.created_at AS createdAt,COUNT(s.id) AS studyCount,COALESCE(w.balance,0) AS creditBalance,(SELECT COUNT(*) FROM credit_ledger l WHERE l.user_id=u.id AND l.kind='use') AS usedCredits FROM users u LEFT JOIN users r ON r.id=u.reviewed_by LEFT JOIN studies s ON s.user_id=u.id LEFT JOIN credit_wallets w ON w.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC,u.id LIMIT 100").all();
            const recentStudies = db.prepare('SELECT s.id,s.payload,s.updated_at AS updatedAt,u.name AS ownerName,u.email AS ownerEmail FROM studies s JOIN users u ON u.id=s.user_id ORDER BY s.updated_at DESC,s.user_id,s.id LIMIT 20').all().map(({ payload, ...entry }) => ({ ...entry, name: JSON.parse(payload).lot.name }));
            return json(res, 200, { totals, users, pendingUsers, recentStudies });
          }
          throw fail(404, 'Recurso administrativo não encontrado.');
        }
        if (path === '/api/auth/logout' && method === 'POST') {
          db.prepare('DELETE FROM sessions WHERE hash=?').run(sessionHash(req));
          res.setHeader('Set-Cookie', cookie('viabileasy_session', '', 0));
          return json(res, 200, { ok: true });
        }
        if (path === '/api/profile' && method === 'PUT') {
          const body = await readJSON(req), name = nameOf(body.name);
          db.prepare('UPDATE users SET name=?,updated_at=? WHERE id=?').run(name, now(), user.id);
          return json(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
        }
        if (path === '/api/profile/photo' && method === 'PUT') {
          const body = await readJSON(req), photo = photoOf(body.image);
          db.prepare('UPDATE users SET photo=?,photo_type=?,google_photo=NULL,updated_at=? WHERE id=?').run(photo.bytes, photo.mime, now(), user.id);
          return json(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
        }
        if (path === '/api/profile/photo' && method === 'GET') {
          if (!user.photo) throw fail(404, 'Foto não encontrada.');
          res.writeHead(200, { 'Content-Type': user.photo_type, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" });
          return res.end(Buffer.from(user.photo));
        }
        if (path === '/api/studies' && method === 'GET') {
          const studies = db.prepare('SELECT payload,updated_at,last_opened_at FROM studies WHERE user_id=? ORDER BY MAX(updated_at,COALESCE(last_opened_at,0)) DESC,updated_at DESC,id ASC').all(user.id).map(row => ({ ...JSON.parse(row.payload), updatedAt: row.updated_at, lastOpenedAt: row.last_opened_at }));
          return json(res, 200, { studies });
        }
        const opened = path.match(/^\/api\/studies\/([a-zA-Z0-9_-]{1,80})\/open$/);
        if (opened && method === 'POST') {
          await readJSON(req);
          const result = db.prepare('UPDATE studies SET last_opened_at=? WHERE user_id=? AND id=?').run(now(), user.id, opened[1]);
          if (!result.changes) throw fail(404, 'Estudo não encontrado na sua conta.');
          const row = db.prepare('SELECT updated_at,last_opened_at FROM studies WHERE user_id=? AND id=?').get(user.id, opened[1]);
          return json(res, 200, { updatedAt: row.updated_at, lastOpenedAt: row.last_opened_at });
        }
        const match = path.match(/^\/api\/studies\/([a-zA-Z0-9_-]{1,80})$/);
        if (match && method === 'PUT') {
          const data = studyOf(match[1], await readJSON(req));
          const lot=JSON.parse(data).lot, identity=AnalysisIdentity.key(lot), operationKey='study:'+match[1]+':'+digest(identity);
          const saved=credits.withUse(user.id,operationKey,()=>{
            const exists=db.prepare('SELECT id FROM studies WHERE user_id=? AND id=?').get(user.id,match[1]);
            if (!exists && db.prepare('SELECT COUNT(*) AS count FROM studies WHERE user_id=?').get(user.id).count>=500) throw fail(409,'Sua conta atingiu o limite de 500 estudos.');
            const updatedAt=now();
            db.prepare('INSERT INTO studies(user_id,id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(user.id,match[1],data,updatedAt);
            const row=db.prepare('SELECT last_opened_at FROM studies WHERE user_id=? AND id=?').get(user.id,match[1]);
            return {...JSON.parse(data),updatedAt,lastOpenedAt:row.last_opened_at};
          },()=>{const existing=db.prepare('SELECT payload FROM studies WHERE user_id=? AND id=?').get(user.id,match[1]);return Boolean(existing&&AnalysisIdentity.key(JSON.parse(existing.payload).lot)===identity);});
          return json(res,200,{study:saved.result,usage:saved.usage,charged:saved.charged});
        }
        throw fail(404, 'Recurso não encontrado.');
      } catch (error) {
        if (!error.status) console.warn('Falha ao processar uma operação da conta.');
        if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Não foi possível concluir agora. Tente novamente.', ...(['ACCOUNT_PENDING','ACCOUNT_REJECTED','NO_CREDITS'].includes(error.code)?{code:error.code}:{}) });
      }
    }
  };
}
