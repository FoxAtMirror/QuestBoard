// Переносит результат сборки из release-new в release.
//
// Зачем: Windows может держать handle на release\win-unpacked\resources\app.asar
// (антивирус, индексатор, файловый watcher). electron-builder сначала удаляет
// старый asar — и падает с EBUSY. Сборка в отдельный каталог обходит это,
// а скрипт копирует свежие файлы на место.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const from = path.join(root, 'release-new');
const to = path.join(root, 'release');

if (!existsSync(from)) {
  console.error('[sync-release] каталога release-new нет — сначала собери через dist:win:alt');
  process.exit(1);
}

mkdirSync(to, { recursive: true });

if (existsSync(path.join(from, 'win-unpacked'))) {
  cpSync(path.join(from, 'win-unpacked'), path.join(to, 'win-unpacked'), {
    recursive: true,
    force: true,
  });
  console.log('[sync-release] win-unpacked обновлён');
}

for (const file of ['QuestBoard-0.1.0-win-x64.exe', 'QuestBoard-0.1.0-win-x64.exe.blockmap']) {
  const src = path.join(from, file);
  if (existsSync(src)) {
    cpSync(src, path.join(to, file), { force: true });
    console.log('[sync-release] скопирован', file);
  }
}

console.log('[sync-release] готово →', to);
