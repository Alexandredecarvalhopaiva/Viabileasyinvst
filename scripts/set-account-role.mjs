import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureAccountRoles, assignAccountRole } from '../server/account-roles.mjs';

const [email, role] = process.argv.slice(2);
if (!email || !['user', 'super_admin'].includes(role)) {
  console.error('Uso: npm run account:role -- email user|super_admin');
  process.exit(1);
}
const path = resolve(process.env.DATA_DIR || '.data', 'accounts.sqlite');
if (!existsSync(path)) throw Error('Banco de contas não encontrado. Inicie o projeto primeiro.');
const db = new DatabaseSync(path);
try {
  db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  ensureAccountRoles(db);
  const account = assignAccountRole(db, email, role);
  db.exec('COMMIT');
  console.log(`Perfil persistido: ${account.email} · ${account.role}`);
  if (account.accountStatus === 'pending') console.log('Cadastro pendente: a atribuição do perfil não substitui a aprovação pelo superadministrador.');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally { db.close(); }
