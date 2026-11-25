// `npm run dev:mock` — fake API (:8000, in memory) + Vite (:5173). Ctrl+C stops both.
import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['mock/server.mjs'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];
const stop = () => { procs.forEach(p => p.kill('SIGTERM')); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach(p => p.on('exit', code => { if (code) stop(); }));
