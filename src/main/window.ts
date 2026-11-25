import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { AppSettings } from '../../shared/types';

const WINDOW_WIDTH = 420;

let mainWindow: BrowserWindow | null = null;

/**
 * Окно-оверлей журнала квестов.
 *
 * Поведение — как игровой интерфейс, а не как обычное окно:
 *  - нет кнопки на панели задач и нет пункта в Alt+Tab (тип окна toolbar/panel);
 *  - не перехватывает фокус при появлении (showInactive);
 *  - в режиме «overlay» поднимается выше остальных окон (screen-saver),
 *    поэтому виден даже поверх полноэкранной игры;
 *  - в режиме «desktop» садится на слой рабочего стола — поверх обоев,
 *    но под обычными окнами.
 */
export function createMainWindow(settings: AppSettings): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;

  const height = Math.round(workArea.height * (settings.windowHeight / 100));
  const x = settings.dockSide === 'right' ? workArea.x + workArea.width - WINDOW_WIDTH : workArea.x;

  const isDesktopLayer = settings.windowLayer === 'desktop';
  // Windows/Linux: 'toolbar' — служебное окно без кнопки на панели задач и без Alt+Tab.
  // macOS: 'panel' — маленькая плашка, которая перекрывает полноэкранные приложения.
  const winType = process.platform === 'darwin' ? 'panel' : isDesktopLayer ? 'desktop' : 'toolbar';

  mainWindow = new BrowserWindow({
    x,
    y: workArea.y,
    width: WINDOW_WIDTH,
    height,
    minWidth: 340,
    minHeight: 420,
    type: winType as 'toolbar',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: 'QuestBoard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  if (!isDesktopLayer) {
    // Уровень screen-saver — выше любых других «всегда поверх» окон (в т.ч. полноэкранных игр)
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    mainWindow.setAlwaysOnTop(false);
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // showInactive — журнал появляется, не отбирая фокус у активного окна
  mainWindow.once('ready-to-show', () => {
    mainWindow?.showInactive();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // При изменении размеров пользователем держим правый край на месте
  mainWindow.on('resized', () => {
    if (settings.dockEnabled) dockToEdge(mainWindow!, settings.dockSide);
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** Прижать окно к краю рабочей области (по умолчанию — правый) */
export function dockToEdge(win: BrowserWindow, side: 'right' | 'left' = 'right') {
  const bounds = win.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const height = Math.min(workArea.height, bounds.height);
  const x = side === 'right' ? workArea.x + workArea.width - bounds.width : workArea.x;
  win.setBounds({ x, y: workArea.y, width: bounds.width, height });
}

export function applySettingsToWindow(win: BrowserWindow, settings: AppSettings) {
  const isDesktopLayer = settings.windowLayer === 'desktop';
  win.setAlwaysOnTop(settings.alwaysOnTop && !isDesktopLayer, isDesktopLayer ? 'normal' : 'screen-saver');
  win.setVisibleOnAllWorkspaces(!isDesktopLayer, { visibleOnFullScreen: true });
  win.setOpacity(Math.min(1, Math.max(0.4, settings.opacity)));
  win.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
  if (settings.dockEnabled) {
    dockToEdge(win, settings.dockSide);
  }
}
