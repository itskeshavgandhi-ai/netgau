import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (command, args, options = {}) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...options });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) process.exitCode = code;
  });
  return child;
};

// 1. Build the main + preload bundles, then watch them.
const main = run('node', ['scripts/build-main.mjs', '--watch']);

// 2. Renderer dev server (Vite) — the window loads this URL.
const renderer = run('npx', ['vite', '--port', '5173', '--strictPort']);

// 3. Wait for Vite, then launch Electron pointing at it.
let electron = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  await delay(500);
  try {
    const res = await fetch('http://127.0.0.1:5173/');
    if (res.ok) break;
  } catch {
    /* not up yet */
  }
}

electron = run('npx', ['electron', '.'], { env: { ...process.env, NETGAUGE_DEV_SERVER: 'http://127.0.0.1:5173' } });

const shutdown = () => {
  for (const child of [electron, renderer, main]) child?.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
