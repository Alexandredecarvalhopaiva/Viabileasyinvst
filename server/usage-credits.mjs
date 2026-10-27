import { randomUUID } from 'node:crypto';

const fail = (status,message,code) => Object.assign(new Error(message),{status,...(code?{code}:{})});
const keyOf = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,180}$/.test(value)) throw fail(400,'Identificação da operação inválida.');
  return value;
};

// Accounting primitives. A caller supplies the server-side operation key and the billable action.
export function createUsageCredits(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS credit_wallets (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0)
  );
  CREATE TABLE IF NOT EXISTS credit_ledger (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('grant','use')),
    operation_key TEXT NOT NULL, delta INTEGER NOT NULL, balance_after INTEGER NOT NULL CHECK(balance_after>=0),
    note TEXT NOT NULL, created_at INTEGER NOT NULL,
    CHECK((kind='grant' AND delta>0) OR (kind='use' AND delta=-1)),
    UNIQUE(user_id,kind,operation_key)
  );
  CREATE INDEX IF NOT EXISTS credit_ledger_user_date ON credit_ledger(user_id,created_at);`);
  const account = id => {
    const row=db.prepare('SELECT id,role,account_status FROM users WHERE id=?').get(id);
    if (!row) throw fail(404,'Conta não encontrada.');
    if (row.account_status !== 'approved') throw fail(403,'A conta precisa estar aprovada para utilizar créditos.');
    return row;
  };
  const balance = id => db.prepare('SELECT balance FROM credit_wallets WHERE user_id=?').get(id)?.balance || 0;
  const info = id => {
    const user=account(id);
    return {unlimited:user.role==='super_admin',balance:balance(id),used:db.prepare("SELECT COUNT(*) AS count FROM credit_ledger WHERE user_id=? AND kind='use'").get(id).count};
  };
  const transaction = action => {
    db.exec('BEGIN IMMEDIATE');
    try {const result=action();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  };
  return {
    info,
    grant(actorId,userId,amount,requestKey,note='') {
      keyOf(requestKey);
      if (!Number.isSafeInteger(amount) || amount<1 || amount>1000) throw fail(400,'Informe de 1 a 1.000 créditos.');
      if (typeof note !== 'string' || note.trim().length>250) throw fail(400,'A identificação da liberação deve ter até 250 caracteres.');
      return transaction(()=>{
        if (account(actorId).role!=='super_admin') throw fail(403,'Somente o superadministrador pode liberar créditos.');
        if (account(userId).role==='super_admin') throw fail(400,'O superadministrador já possui uso sem limite.');
        const previous=db.prepare("SELECT delta FROM credit_ledger WHERE user_id=? AND kind='grant' AND operation_key=?").get(userId,requestKey);
        if (previous) {
          if (previous.delta!==amount) throw fail(409,'Esta operação já foi utilizada para outra quantidade de créditos.');
          return {...info(userId),duplicate:true};
        }
        if (balance(userId)+amount>1000000) throw fail(409,'O saldo máximo desta conta foi atingido.');
        db.prepare('INSERT INTO credit_wallets(user_id,balance) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET balance=balance+excluded.balance').run(userId,amount);
        db.prepare("INSERT INTO credit_ledger VALUES(?,?,?,'grant',?,?,?,?,?)").run(randomUUID(),userId,actorId,requestKey,amount,balance(userId),note.trim(),Date.now());
        return {...info(userId),duplicate:false};
      });
    },
    withUse(userId,operationKey,action,isExisting=()=>false) {
      keyOf(operationKey);
      if (typeof action!=='function') throw fail(400,'Operação de orçamento inválida.');
      return transaction(()=>{
        const user=account(userId);
        let charged=false;
        if (user.role!=='super_admin' && !isExisting()) {
          const previous=db.prepare("SELECT id FROM credit_ledger WHERE user_id=? AND kind='use' AND operation_key=?").get(userId,operationKey);
          if (!previous) {
            const changed=db.prepare('UPDATE credit_wallets SET balance=balance-1 WHERE user_id=? AND balance>0').run(userId);
            if (!changed.changes) throw fail(409,'Seus usos acabaram. Solicite uma nova liberação para iniciar outra análise.','NO_CREDITS');
            db.prepare("INSERT INTO credit_ledger VALUES(?,?,?,'use',?,-1,?,?,?)").run(randomUUID(),userId,userId,operationKey,balance(userId),'Orçamento gerado',Date.now());
            charged=true;
          }
        }
        const result=action();
        if (result && typeof result.then==='function') throw Error('A operação transacional deve ser síncrona.');
        return {result,usage:info(userId),charged};
      });
    }
  };
}
