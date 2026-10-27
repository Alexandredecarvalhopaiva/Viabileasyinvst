export function ensureAccountRoles(db) {
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','super_admin'))");
  }
}

// Administrative operation available only to the local operator, never via public signup/profile.
export function assignAccountRole(db, email, role) {
  if (!['user', 'super_admin'].includes(role)) throw Error('Perfil inválido. Use user ou super_admin.');
  const account = db.prepare('SELECT id FROM users WHERE email=?').get(String(email).trim().toLowerCase());
  if (!account) throw Error('Conta não encontrada. Cadastre o acesso antes de atribuir um perfil.');
  db.prepare('UPDATE users SET role=?,updated_at=? WHERE id=?').run(role, Date.now(), account.id);
  const approvalsEnabled = db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'account_status');
  // Initial installation only: a trusted local operator must be able to activate its first admin.
  // With an active superadmin, assigning a role never approves a pending account.
  if (approvalsEnabled && role === 'super_admin' && !db.prepare("SELECT id FROM users WHERE role='super_admin' AND account_status='approved' LIMIT 1").get()) {
    db.prepare("UPDATE users SET account_status='approved',reviewed_at=?,reviewed_by=id WHERE id=? AND account_status='pending'").run(Date.now(),account.id);
  }
  const result = db.prepare('SELECT id,email,name,role FROM users WHERE id=?').get(account.id);
  if (approvalsEnabled) result.accountStatus = db.prepare('SELECT account_status FROM users WHERE id=?').get(account.id).account_status;
  return result;
}
