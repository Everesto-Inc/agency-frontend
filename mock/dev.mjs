// `npm run dev:mock` — fake API (:8000, in memory) + Vite (:5173). Ctrl+C stops both.
import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['mock/server.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }), // no shell (works on every OS)
];
const stop = () => { procs.forEach(p => p.kill('SIGTERM')); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach(p => p.on('exit', code => { if (code) stop(); }));
