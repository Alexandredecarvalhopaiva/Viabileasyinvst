/** Optional npm bridge. All HTTP handling and business logic run in Python. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const virtualenv = fileURLToPath(new URL(process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python', import.meta.url));
const executable = process.env.PYTHON_EXECUTABLE || (existsSync(virtualenv) ? virtualenv : process.platform === 'win32' ? 'python' : 'python3');
const args = process.argv.slice(2);
const child = spawn(executable, args.length ? args : ['-m', 'backend'], { cwd: root, stdio: 'inherit', env: process.env });
child.on('error', () => {
  console.error('Não foi possível iniciar Python. Crie .venv e instale requirements-dev.txt conforme README.md.');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
