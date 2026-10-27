const fail = (status, message) => Object.assign(new Error(message), {status});

export function ensureAccountApprovals(db) {
  let columns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
  if (['account_status','reviewed_at','reviewed_by'].every(column => columns.includes(column))) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    columns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
    if (!columns.includes('account_status')) {
      db.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'pending' CHECK(account_status IN ('pending','approved','rejected'))");
      // Only accounts predating this migration keep their existing access.
      db.exec("UPDATE users SET account_status='approved'");
    }
    if (!columns.includes('reviewed_at')) db.exec('ALTER TABLE users ADD COLUMN reviewed_at INTEGER');
    if (!columns.includes('reviewed_by')) db.exec('ALTER TABLE users ADD COLUMN reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function reviewAccount(db, reviewerId, accountId, decision) {
  if (!['approved','rejected'].includes(decision)) throw fail(400,'Escolha aprovar ou recusar o cadastro.');
  db.exec('BEGIN IMMEDIATE');
  try {
    const reviewer = db.prepare('SELECT role,account_status FROM users WHERE id=?').get(reviewerId);
    if (reviewer?.role !== 'super_admin' || reviewer.account_status !== 'approved') throw fail(403,'Somente o superadministrador ativo pode validar cadastros.');
    if (reviewerId === accountId) throw fail(400,'Você não pode validar o próprio cadastro.');
    const target = db.prepare('SELECT account_status FROM users WHERE id=?').get(accountId);
    if (!target) throw fail(404,'Cadastro não encontrado.');
    if (target.account_status !== 'pending') throw fail(409,'Este cadastro já foi analisado. Atualize a lista.');
    const reviewedAt = Date.now();
    db.prepare('UPDATE users SET account_status=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?').run(decision,reviewerId,reviewedAt,reviewedAt,accountId);
    // Never upgrade a session created before approval into an approved session.
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(accountId);
    const account = db.prepare('SELECT id,name,email,role,account_status AS accountStatus,reviewed_at AS reviewedAt,reviewed_by AS reviewedBy FROM users WHERE id=?').get(accountId);
    db.exec('COMMIT');
    return account;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
