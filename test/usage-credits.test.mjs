import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsageCredits } from '../server/usage-credits.mjs';

function fixture(path=':memory:') {
  const db=new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,role TEXT NOT NULL,account_status TEXT NOT NULL); CREATE TABLE IF NOT EXISTS generated(id TEXT PRIMARY KEY)");
  const add=db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?)');
  add.run('admin','super_admin','approved');add.run('alice','user','approved');add.run('bob','user','approved');add.run('pending','user','pending');
  return {db,credits:createUsageCredits(db)};
}
test('Créditos só podem ser liberados pelo superadmin para uma conta aprovada',()=>{
  const {db,credits}=fixture();
  try {
    assert.equal(credits.info('alice').balance,0);
    assert.throws(()=>credits.grant('alice','bob',2,'forged'),{status:403});
    assert.throws(()=>credits.grant('admin','pending',2,'pending'),{status:403});
    for(const amount of [-1,0,1.5,1001,Infinity])assert.throws(()=>credits.grant('admin','alice',amount,'invalid'),{status:400});
    assert.equal(credits.grant('admin','alice',3,'release-1','Liberação de teste').balance,3);
    assert.equal(credits.info('bob').balance,0);
    assert.equal(credits.grant('admin','alice',3,'release-1').duplicate,true);
    assert.equal(credits.info('alice').balance,3);
    assert.throws(()=>credits.grant('admin','alice',4,'release-1'),{status:409});
  }finally{db.close();}
});
test('Um crédito não permite dois usos distintos nem é descontado duas vezes pela mesma operação',()=>{
  const {db,credits}=fixture();
  try {
    credits.grant('admin','alice',1,'release-1');
    const action=()=>db.prepare('INSERT OR IGNORE INTO generated VALUES(?)').run('budget-1');
    const first=credits.withUse('alice','budget-1',action);assert.equal(first.charged,true);assert.equal(first.usage.balance,0);
    const retry=credits.withUse('alice','budget-1',action);assert.equal(retry.charged,false);assert.equal(retry.usage.used,1);
    assert.throws(()=>credits.withUse('alice','budget-2',()=>db.prepare('INSERT INTO generated VALUES(?)').run('budget-2')),{code:'NO_CREDITS'});
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM generated').get().count,1);
    assert.equal(credits.info('alice').balance,0);
  }finally{db.close();}
});
test('Falha na geração desfaz tanto o desconto quanto os registros parciais',()=>{
  const {db,credits}=fixture();
  try {
    credits.grant('admin','alice',1,'release');
    assert.throws(()=>credits.withUse('alice','failed-budget',()=>{db.prepare('INSERT INTO generated VALUES(?)').run('partial');throw Error('Falha sintética');}),/Falha sintética/);
    assert.equal(credits.info('alice').balance,1);assert.equal(credits.info('alice').used,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM generated').get().count,0);
    assert.throws(()=>credits.withUse('pending','pending-budget',()=>{}),{status:403});
  }finally{db.close();}
});
test('Superadministrador utiliza a ferramenta sem saldo e sem consumo de créditos',()=>{
  const {db,credits}=fixture();
  try {
    for(let i=0;i<5;i++)assert.equal(credits.withUse('admin','budget-'+i,()=>({ok:true})).charged,false);
    assert.equal(credits.info('admin').unlimited,true);assert.equal(credits.info('admin').used,0);
    assert.throws(()=>credits.grant('admin','admin',1,'release'),{status:400});
  }finally{db.close();}
});
test('Saldo e proteção contra repetição persistem após reabrir o banco',()=>{
  const dir=mkdtempSync(join(tmpdir(),'viabileasy-credits-')),path=join(dir,'credits.sqlite');
  let current=fixture(path);
  try {
    current.credits.grant('admin','alice',2,'release');current.credits.withUse('alice','budget-1',()=>{});current.db.close();
    current=fixture(path);
    assert.equal(current.credits.info('alice').balance,1);
    assert.equal(current.credits.withUse('alice','budget-1',()=>{}).charged,false);
    assert.equal(current.credits.info('alice').balance,1);
  }finally{current.db.close();rmSync(dir,{recursive:true,force:true});}
});
