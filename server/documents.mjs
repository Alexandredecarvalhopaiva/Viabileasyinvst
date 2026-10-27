import { randomUUID, createHash } from 'node:crypto';

const fail = (status, message) => Object.assign(new Error(message), {status});
const MAX_FILE = 10 * 1024 * 1024;
const categories = ['legislacao','certidao','planta','matricula','outro'];
function text(value, max, label, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail(400, `Confira o campo ${label}.`);
  return value.trim();
}
const fields = 'd.id,d.user_id AS ownerId,u.name AS ownerName,d.scope,d.lot_id AS lotId,d.lot_name AS lotName,d.title,d.issuer,d.reference,d.category,d.source_url AS sourceURL,d.notes,d.filename,d.size,d.sha256,d.created_at AS createdAt';
const metadata = row => ({...row, url:`/api/documents/${row.id}/file`, status:'registered'});
function access(user) { return user.role === 'super_admin' ? {sql:'1=1',params:[]} : {sql:"(d.scope='library' OR d.user_id=?)",params:[user.id]}; }

export function createDocumentStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK(scope IN ('library','lot')), lot_id TEXT, lot_name TEXT,
    title TEXT NOT NULL, issuer TEXT NOT NULL, reference TEXT NOT NULL, category TEXT NOT NULL,
    source_url TEXT NOT NULL, notes TEXT NOT NULL, filename TEXT NOT NULL,
    size INTEGER NOT NULL, sha256 TEXT NOT NULL, pdf BLOB NOT NULL, created_at INTEGER NOT NULL,
    CHECK((scope='library' AND lot_id IS NULL) OR (scope='lot' AND lot_id IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS documents_lot ON documents(user_id,lot_id,created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS documents_unique_file ON documents(user_id,scope,COALESCE(lot_id,''),sha256);`);
  return {
    list(user, {lotId = '', page = '0'} = {}) {
      if (!/^\d{1,5}$/.test(String(page))) throw fail(400, 'Página inválida.');
      const where = access(user), params = [...where.params];
      let sql = where.sql;
      if (lotId) {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(lotId)) throw fail(400, 'Terreno inválido.');
        sql += " AND (d.scope='library' OR (d.user_id=? AND d.lot_id=?))";
        params.push(user.id, lotId);
      }
      const total = db.prepare(`SELECT COUNT(*) AS count FROM documents d WHERE ${sql}`).get(...params).count;
      const documents = db.prepare(`SELECT ${fields} FROM documents d JOIN users u ON u.id=d.user_id WHERE ${sql} ORDER BY d.created_at DESC,d.id LIMIT 25 OFFSET ?`).all(...params, Number(page)*25).map(metadata);
      return {documents,total,page:Number(page),pageSize:25};
    },
    add(user, body) {
      if (!['library','lot'].includes(body.scope)) throw fail(400, 'Selecione o destino do documento.');
      if (body.scope === 'library' && user.role !== 'super_admin') throw fail(403, 'Somente o superadministrador pode cadastrar legislação geral.');
      let lotId = null, lotName = null;
      if (body.scope === 'lot') {
        lotId = text(body.lotId,80,'terreno',true);
        const study = db.prepare('SELECT payload FROM studies WHERE user_id=? AND id=?').get(user.id,lotId);
        if (!study) throw fail(404, 'Salve o estudo na sua conta antes de anexar documentos ao terreno.');
        lotName = JSON.parse(study.payload).lot.name;
      }
      const title = text(body.title,160,'título',true), issuer = text(body.issuer,160,'órgão emissor',true);
      const reference = text(body.reference,250,'número e data'), notes = text(body.notes,1500,'trechos relevantes');
      const filename = text(body.filename,180,'arquivo',true).split(/[\\/]/).pop();
      if (!/\.pdf$/i.test(filename) || !categories.includes(body.category)) throw fail(400, 'Selecione a categoria e um arquivo PDF.');
      let sourceURL = text(body.sourceURL,1500,'link da fonte');
      if (sourceURL) {
        try { const url = new URL(sourceURL); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error(); sourceURL = url.href; }
        catch { throw fail(400, 'Informe um link http ou https válido para a fonte.'); }
      }
      if (typeof body.pdf !== 'string' || body.pdf.length > Math.ceil(MAX_FILE/3)*4) throw fail(413, 'Use um PDF de até 10 MB.');
      if (!body.pdf || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.pdf) || body.pdf.length%4) throw fail(400, 'O arquivo PDF está inválido.');
      const pdf = Buffer.from(body.pdf,'base64');
      if (pdf.length > MAX_FILE) throw fail(413, 'Use um PDF de até 10 MB.');
      if (pdf.subarray(0,5).toString() !== '%PDF-' || !pdf.subarray(-2048).includes(Buffer.from('%%EOF'))) throw fail(400, 'O arquivo não possui a estrutura esperada de um PDF.');
      const quota = db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS size FROM documents WHERE user_id=?').get(user.id);
      if (quota.count >= 100 || quota.size + pdf.length > 100*1024*1024) throw fail(409, 'Sua conta atingiu o limite de 100 documentos ou 100 MB.');
      const sha256 = createHash('sha256').update(pdf).digest('hex'), id = randomUUID();
      if (db.prepare("SELECT id FROM documents WHERE user_id=? AND scope=? AND COALESCE(lot_id,'')=? AND sha256=?").get(user.id,body.scope,lotId||'',sha256)) throw fail(409, 'Este PDF já está cadastrado neste destino.');
      db.prepare('INSERT INTO documents(id,user_id,scope,lot_id,lot_name,title,issuer,reference,category,source_url,notes,filename,size,sha256,pdf,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,body.scope,lotId,lotName,title,issuer,reference,body.category,sourceURL,notes,filename,pdf.length,sha256,pdf,Date.now());
      return metadata(db.prepare(`SELECT ${fields} FROM documents d JOIN users u ON u.id=d.user_id WHERE d.id=?`).get(id));
    },
    file(user, id) {
      const where = access(user);
      const row = db.prepare(`SELECT d.pdf,d.filename FROM documents d WHERE d.id=? AND ${where.sql}`).get(id,...where.params);
      if (!row) throw fail(404, 'Documento não encontrado ou sem acesso.');
      return row;
    }
  };
}
