// Сборка main- и preload-процессов Electron в бандл esbuild'ом.
// Кладём рядом с renderer-сборкой, чтобы electron-builder забирал всё из корня пакета.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

rmSync('dist-electron', { recursive: true, force: true });

await build({
  ...shared,
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist-electron/main.js',
});

await build({
  ...shared,
  entryPoints: ['src/preload/preload.ts'],
  outfile: 'dist-electron/preload.js',
});

console.log('[build-electron] готово: dist-electron/main.js, dist-electron/preload.js');
