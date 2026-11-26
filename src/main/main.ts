import { app, BrowserWindow, globalShortcut, ipcMain, shell, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Store } from './store';
import { QuestServer } from './server';
import { applySettingsToWindow, createMainWindow, getMainWindow } from './window';
import { AppSettings, Player, Quest, QuestDraft, ServerInfo } from '../../shared/types';

const isDev = process.env.NODE_ENV === 'development';
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

let store: Store;
let server: QuestServer;
let tray: Tray | null = null;
let quitting = false;

/** Состояние ресайза окна перетаскиванием уголка */
const resizeState = { startY: 0, startHeight: 0 };

/** Генерируем код доступа: 6 символов без двусмысленных (0/O, 1/I) */
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Код живёт рядом с данными, чтобы не терялся при перезапуске */
function loadOrCreateCode(): string {
  const file = path.join(app.getPath('userData'), 'access-code.txt');
  try {
    if (fs.existsSync(file)) {
      const code = fs.readFileSync(file, 'utf8').trim();
      if (code.length >= 4) return code;
    }
  } catch {
    /* игнорируем */
  }
  const code = generateCode();
  try {
    fs.writeFileSync(file, code, 'utf8');
  } catch {
    /* игнорируем */
  }
  return code;
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'tray.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();
  try {
    tray = new Tray(image.resize({ width: 16, height: 16 }));
  } catch {
    tray = null;
    return;
  }
  tray.setToolTip('QuestBoard — журнал квестов');
  refreshTrayMenu();
  tray.on('click', () => toggleWindow());
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Показать / скрыть журнал', click: () => toggleWindow() },
      {
        label: 'Слой: на рабочем столе (за окнами)',
        type: 'checkbox',
        checked: store?.settings.windowLayer === 'desktop',
        click: (item) => {
          store.updateSettings({ windowLayer: item.checked ? 'desktop' : 'overlay' });
          recreateWindow();
          refreshTrayMenu();
        },
      },
      { type: 'separator' },
      { label: 'Выход', click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

function toggleWindow() {
  const win = getMainWindow();
  if (!win) return;
  if (win.isVisible()) win.hide();
  else {
    win.show();
    win.focus();
  }
}

function setupIpc() {
  ipcMain.handle('quests:list', () => store.getData());

  ipcMain.handle('quests:create', (_e, draft: QuestDraft) => store.createQuest(draft, 'local'));

  ipcMain.handle('quests:upsert', (_e, quest: Quest) => store.upsertQuest(quest));

  ipcMain.handle('quests:delete', (_e, id: string) => store.deleteQuest(id));

  ipcMain.handle('quests:setState', (_e, id: string, state: Quest['state']) => store.setQuestState(id, state));

  ipcMain.handle('quests:toggleObjective', (_e, questId: string, objectiveId: string) =>
    store.toggleObjective(questId, objectiveId),
  );

  ipcMain.handle('player:update', (_e, patch: Partial<Player>) => store.updatePlayer(patch));

  ipcMain.handle('settings:get', () => store.settings);

  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => {
    store.updateSettings(patch);
    const win = getMainWindow();
    if (win) applySettingsToWindow(win, store.settings);
    if (patch.launchAtLogin !== undefined) {
      applyLaunchAtLogin(patch.launchAtLogin);
    }
    if (patch.windowLayer !== undefined) {
      // Слой задаётся типом окна — приходится пересоздавать
      recreateWindow();
      refreshTrayMenu();
    }
    if (patch.serverEnabled !== undefined || patch.serverPort !== undefined) {
      void restartServer();
    }
    return store.settings;
  });

  ipcMain.handle('server:info', async (): Promise<ServerInfo> => server.info());

  ipcMain.handle('server:regenerateCode', async () => {
    const code = generateCode();
    server.setCode(code);
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'access-code.txt'), code, 'utf8');
    } catch {
      /* игнорируем */
    }
    return server.info();
  });

  ipcMain.handle('app:openDataFolder', () => {
    void shell.openPath(app.getPath('userData'));
  });

  ipcMain.handle('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  ipcMain.handle('app:hide', () => getMainWindow()?.hide());

  ipcMain.handle('window:clickThrough', (_e, enabled: boolean) => {
    getMainWindow()?.setIgnoreMouseEvents(enabled, { forward: true });
  });

  ipcMain.handle('window:resizeStart', (_e, screenY: number) => {
    const win = getMainWindow();
    if (!win) return;
    resizeState.startY = screenY;
    resizeState.startHeight = win.getBounds().height;
  });

  ipcMain.handle('window:resizeMove', (_e, screenY: number) => {
    const win = getMainWindow();
    if (!win) return;
    const { workArea } = screen.getDisplayMatching(win.getBounds());
    const delta = resizeState.startY - screenY;
    const height = Math.min(workArea.height, Math.max(320, resizeState.startHeight + delta));
    const bounds = win.getBounds();
    const side = store.settings.dockSide;
    const x = side === 'right' ? workArea.x + workArea.width - bounds.width : workArea.x;
    win.setBounds({ x, y: workArea.y, width: bounds.width, height });
  });

  ipcMain.handle('window:resizeEnd', () => {
    resizeState.startY = 0;
    resizeState.startHeight = 0;
  });
}

/** Глобальные хоткеи: как в игре — журнал вызывается одной комбинацией клавиш */
function registerHotkeys() {
  try {
    globalShortcut.register('CommandOrControl+Alt+Q', () => toggleWindow());
    globalShortcut.register('CommandOrControl+Alt+N', () => {
      const win = getMainWindow();
      if (!win) return;
      win.showInactive();
      win.webContents.send('ui:open', 'new');
    });
  } catch (err) {
    console.error('[hotkeys] не удалось зарегистрировать:', err);
  }
}

/** Сообщить интерфейсу, что состояние сервера изменилось */
function notifyServerChanged() {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) win.webContents.send('server:changed');
}

/** Пересоздать окно — нужно при смене слоя (оверлей ↔ рабочий стол) */
function recreateWindow() {
  const old = getMainWindow();
  if (old && !old.isDestroyed()) old.destroy();
  const win = createMainWindow(store.settings);
  applySettingsToWindow(win, store.settings);
}

/** Автозапуск приложения вместе с системой */
function applyLaunchAtLogin(enabled: boolean) {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch (err) {
    console.error('[autostart] не удалось изменить настройку автозапуска:', err);
  }
}

/**
 * Автотест хранилища: создание квеста → закрытие целей → выполнение → опыт.
 * Запускается переменной окружения QUESTBOARD_SELFTEST=1.
 */
function runSelfTest() {
  const results: string[] = [];
  const check = (name: string, ok: boolean) => results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}`);

  const quest = store.createQuest(
    {
      title: 'Тестовый квест',
      summary: 'Проверка механики',
      giver: 'Самотест',
      objectives: ['Первая цель', 'Вторая цель'],
      rewardXp: 40,
    },
    'local',
  );
  check('квест создан', store.quests.some((q) => q.id === quest.id));
  check('цели созданы', quest.objectives.length === 2);

  const xpBefore = store.player.xp;
  store.toggleObjective(quest.id, quest.objectives[0].id);
  check('цель отмечается выполненной', store.quests.find((q) => q.id === quest.id)!.objectives[0].done);
  check('квест в работе после первой цели', store.quests.find((q) => q.id === quest.id)!.state === 'active');

  store.toggleObjective(quest.id, quest.objectives[1].id);
  const finished = store.quests.find((q) => q.id === quest.id)!;
  check('все цели закрыты — квест выполнен', finished.state === 'completed');
  check('начислен опыт', store.player.xp !== xpBefore || store.player.level > 1);

  store.setQuestState(quest.id, 'active');
  check('квест возвращается в работу', store.quests.find((q) => q.id === quest.id)!.state === 'active');

  store.deleteQuest(quest.id);
  check('квест удаляется', !store.quests.some((q) => q.id === quest.id));

  console.log('\n[selftest]\n' + results.join('\n'));
  app.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
}

async function restartServer() {
  const { serverEnabled, serverPort, requireCode } = store.settings;
  await server.stop();
  server.setPort(serverPort);
  server.setRequireCode(requireCode);
  if (serverEnabled) {
    const ok = await server.start();
    if (!ok) console.error('[server] не удалось занять порт', serverPort);
  }
  notifyServerChanged();
}

function bootstrap() {
  if (process.env.QUESTBOARD_SELFTEST === '1') {
    // Самотест работает на временном файле — реальные данные не трогаем
    store = new Store(path.join(app.getPath('temp'), `questboard-selftest-${Date.now()}.json`));
    runSelfTest();
    return;
  }

  store = new Store();
  server = new QuestServer(store, store.settings.serverPort, loadOrCreateCode(), store.settings.requireCode);

  const win = createMainWindow(store.settings);
  applySettingsToWindow(win, store.settings);

  setupIpc();

  // Слушаем текущее окно, а не конкретный экземпляр — окно может пересоздаваться
  // при смене слоя (оверлей ↔ рабочий стол).
  store.on('changed', () => {
    const current = getMainWindow();
    if (current && !current.isDestroyed()) current.webContents.send('data:changed');
  });

  server.on('quest-created', (quest: Quest) => {
    // всплывающее уведомление в стиле WoW
    const current = getMainWindow();
    if (current && !current.isDestroyed()) {
      current.webContents.send('toast', { title: 'Новый квест!', message: quest.title });
    }
  });

  server.on('started', notifyServerChanged);
  server.on('stopped', notifyServerChanged);

  createTray();
  registerHotkeys();

  if (store.settings.serverEnabled) {
    void server.start();
  }

  // Служебный режим: снимок окна для визуальной проверки (QUESTBOARD_SHOT=path.png)
  const shotPath = process.env.QUESTBOARD_SHOT;
  if (shotPath) {
    let done = false;
    const capture = async () => {
      if (done) return;
      done = true;
      try {
        // Служебно открыть панель перед снимком (QUESTBOARD_PANEL=share|settings|new)
        const panel = process.env.QUESTBOARD_PANEL;
        if (panel) {
          win.webContents.send('ui:open', panel);
          await new Promise((r) => setTimeout(r, 700));
        }
        const image = await win.webContents.capturePage();
        fs.writeFileSync(shotPath, image.toPNG());
        console.log('[shot] сохранено:', shotPath);
        // Проверка прозрачности: альфа в углу и в зоне текста
        const size = image.getSize();
        const bmp = image.toBitmap();
        const alphaAt = (x: number, y: number) => bmp[(y * size.width + x) * 4 + 3];
        console.log(
          '[shot] альфа:',
          JSON.stringify({
            угол: alphaAt(2, 2),
            пустая_середина: alphaAt(Math.floor(size.width / 2), Math.floor(size.height * 0.75)),
            верх_текста: alphaAt(Math.floor(size.width / 2), 120),
          }),
        );
        console.log(
          '[shot] окно:',
          JSON.stringify({
            bounds: win.getBounds(),
            visible: win.isVisible(),
            focused: win.isFocused(),
            alwaysOnTop: win.isAlwaysOnTop(),
            layer: store.settings.windowLayer,
            taskbarSkipped: true,
          }),
        );
      } catch (err) {
        console.error('[shot] ошибка:', err);
      }
      app.quit();
    };
    win.webContents.on('did-finish-load', () => setTimeout(capture, 900));
    win.webContents.on('did-fail-load', (_e, code, desc) => console.error('[load] ошибка', code, desc));
    setTimeout(capture, 6000);
  }
}

// Один экземпляр: второй запуск просто поднимает окно
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    bootstrap();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const win = createMainWindow(store.settings);
        applySettingsToWindow(win, store.settings);
      }
    });
  });

  app.on('window-all-closed', () => {
    // Приложение живёт в трее — закрытие окна его не убивает
    if (process.platform !== 'darwin') {
      // на macOS стандартное поведение — остаётся в доке
    }
  });

  app.on('before-quit', () => {
    quitting = true;
    globalShortcut.unregisterAll();
    store?.saveNow();
  });
}

// Ссылки открываем во внешнем браузере
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
});

export { isDev, DEV_URL, quitting };
