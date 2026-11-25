/**
 * Общие типы для main/preload/renderer.
 * Держим в отдельной папке, чтобы renderer импортировал то же самое, что и бэкенд.
 */

export type QuestState = 'available' | 'active' | 'completed' | 'failed';
export type QuestPriority = 'low' | 'normal' | 'high' | 'epic';
export type QuestSource = 'local' | 'remote';
/**
 * Фон журнала:
 * - transparent — прозрачный, остаётся золотая рамка;
 * - panel — полупрозрачная панель;
 * - solid — сплошной фон;
 * - text — только текст заданий: без рамки, без панели (как парящий текст в игре).
 */
export type BackgroundMode = 'transparent' | 'panel' | 'solid' | 'text';
/**
 * Слой окна:
 * - overlay — как в игре: поверх всех окон, включая полноэкранные игры;
 * - desktop — дополнение рабочего стола: поверх обоев, но под окнами.
 */
export type WindowLayer = 'overlay' | 'desktop';

export interface QuestObjective {
  id: string;
  text: string;
  done: boolean;
  /** Текущий прогресс, если цель числовая (например «собрать 5/10 писем») */
  current?: number;
  total?: number;
}

export interface Quest {
  id: string;
  title: string;
  /** Краткое описание задачи — «описание квеста» в UI */
  summary: string;
  /** Кто выдал: NPC, коллега, система */
  giver: string;
  giverNote?: string;
  /** Рекомендуемый уровень */
  level: number;
  zone: string;
  objectives: QuestObjective[];
  reward: string;
  rewardXp?: number;
  rewardGold?: number;
  state: QuestState;
  priority: QuestPriority;
  tags: string[];
  notes?: string;
  source: QuestSource;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  dueAt?: string;
}

export interface Player {
  name: string;
  className: string;
  level: number;
  xp: number;
  xpToNext: number;
}

export interface AppSettings {
  /** Оверлей поверх всех окон */
  alwaysOnTop: boolean;
  /** Прижать окно к правому краю экрана */
  dockEnabled: boolean;
  dockSide: 'right' | 'left';
  /** Включить локальный сервер выдачи квестов */
  serverEnabled: boolean;
  serverPort: number;
  /** Требовать код доступа при выдаче квеста */
  requireCode: boolean;
  launchAtLogin: boolean;
  /** Прозрачность окна 0.4..1 */
  opacity: number;
  /** Режим фона журнала */
  background: BackgroundMode;
  /** Слой окна: поверх окон (как в игре) или на рабочем столе */
  windowLayer: WindowLayer;
  /** Окно пропускает клики мыши насквозь (режим «вшит в монитор») */
  clickThrough: boolean;
  soundEnabled: boolean;
  /** Показывать выполненные квесты в отдельной вкладке */
  showCompleted: boolean;
  /** Высота окна в % от рабочей области */
  windowHeight: number;}

export interface AppData {
  version: number;
  quests: Quest[];
  player: Player;
  settings: AppSettings;
}

export interface ServerInfo {
  enabled: boolean;
  running: boolean;
  port: number;
  /** http://192.168.x.x:7777 — адрес в локальной сети */
  lanUrl: string;
  /** Код доступа для выдачи квеста */
  code: string;
  /** data:image/png;base64... */
  qr: string | null;
  addresses: string[];
}

export interface QuestDraft {
  title: string;
  summary?: string;
  giver?: string;
  level?: number;
  zone?: string;
  reward?: string;
  /** Сколько опыта даёт квест */
  rewardXp?: number;
  priority?: QuestPriority;
  objectives?: string[];
  dueAt?: string;
  tags?: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  alwaysOnTop: true,
  dockEnabled: true,
  dockSide: 'right',
  serverEnabled: false,
  serverPort: 7788,
  requireCode: true,
  launchAtLogin: false,
  opacity: 1,
  background: 'text',
  windowLayer: 'overlay',
  clickThrough: false,
  soundEnabled: true,
  showCompleted: true,
  windowHeight: 85,
};

export const DEFAULT_PLAYER: Player = {
  name: 'Герой',
  className: 'Искатель',
  level: 1,
  xp: 0,
  xpToNext: 100,
};

export const STATE_LABEL: Record<QuestState, string> = {
  available: 'Доступен',
  active: 'В процессе',
  completed: 'Выполнен',
  failed: 'Провален',
};

export const PRIORITY_LABEL: Record<QuestPriority, string> = {
  low: 'Обычный',
  normal: 'Нормальный',
  high: 'Важный',
  epic: 'Эпический',
};
