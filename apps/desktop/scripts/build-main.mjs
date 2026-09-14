import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  // Electron itself must stay external — it is provided by the runtime.
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
  absWorkingDir: root,
};

const watch = process.argv.includes('--watch');

const targets = [
  { entryPoints: ['src/main/index.ts'], outfile: 'build/main/index.js' },
  { entryPoints: ['src/preload/index.ts'], outfile: 'build/preload/index.js' },
];

if (watch) {
  for (const target of targets) {
    const context = await (await import('esbuild')).context({ ...shared, ...target });
    await context.watch();
  }
  console.log('[netgauge] watching main + preload');
} else {
  for (const target of targets) {
    await build({ ...shared, ...target });
  }
}
