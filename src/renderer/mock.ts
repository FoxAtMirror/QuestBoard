import {
  AppData,
  DEFAULT_PLAYER,
  DEFAULT_SETTINGS,
  Quest,
  QuestDraft,
  QuestState,
  ServerInfo,
} from '@shared/types';

/**
 * Мок API для предпросмотра интерфейса в обычном браузере (npm run dev:renderer).
 * В приложении всегда работает настоящий preload-мост — этот код используется,
 * только если окно открыли вне Electron.
 */

const now = new Date().toISOString();

function demoData(): AppData {
  const quests: Quest[] = [
    {
      id: 'q1',
      title: 'Отчёт по спринту',
      summary: 'Собрать метрики по задачам спринта и закрыть невыполненные.',
      giver: 'Менеджер проекта',
      level: 12,
      zone: 'Работа',
      objectives: [
        { id: 'o1', text: 'Собрать метрики по задачам', done: true },
        { id: 'o2', text: 'Закрыть невыполненные', done: false },
      ],
      reward: 'Опыт и признание',
      state: 'active',
      priority: 'high',
      tags: [],
      source: 'local',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q2',
      title: 'Обновить документацию',
      summary: 'Актуализировать гайд по новому API.',
      giver: 'Тихий голос в чате',
      level: 8,
      zone: 'Проект',
      objectives: [{ id: 'o3', text: 'Переписать раздел про авторизацию', done: false }],
      reward: 'Пицца',
      state: 'available',
      priority: 'normal',
      tags: [],
      source: 'local',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'q3',
      title: 'Починить релиз-пайплайн',
      summary: 'Сборка падает на шаге публикации.',
      giver: 'Система',
      level: 25,
      zone: 'Инфраструктура',
      objectives: [
        { id: 'o4', text: 'Найти причину падения', done: false },
        { id: 'o5', text: 'Починить и задокументировать', done: false },
      ],
      reward: 'Эпический квест',
      state: 'available',
      priority: 'epic',
      tags: [],
      source: 'local',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    version: 1,
    quests,
    player: { ...DEFAULT_PLAYER, name: 'Влад', level: 7, xp: 320, xpToNext: 500 },
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function installMockApi() {
  if (window.questboard) return;
  let data = demoData();
  const listeners = { data: new Set<() => void>(), toast: new Set<(p: { title: string; message: string }) => void>() };

  const notify = () => listeners.data.forEach((cb) => cb());

  window.questboard = {
    getData: async () => data,
    createQuest: async (draft: QuestDraft) => {
      const quest: Quest = {
        id: `q_${Math.random().toString(36).slice(2, 8)}`,
        title: draft.title,
        summary: draft.summary ?? '',
        giver: draft.giver ?? 'Случайный прохожий',
        level: draft.level ?? 1,
        zone: draft.zone ?? 'Неизвестная местность',
        objectives: (draft.objectives ?? []).map((text, i) => ({ id: `o${i}`, text, done: false })),
        reward: draft.reward ?? 'Опыт и признание',
        state: 'available',
        priority: draft.priority ?? 'normal',
        tags: draft.tags ?? [],
        source: 'local',
        createdAt: now,
        updatedAt: now,
      };
      data.quests.push(quest);
      notify();
      return quest;
    },
    upsertQuest: async (quest: Quest) => {
      const idx = data.quests.findIndex((q) => q.id === quest.id);
      if (idx >= 0) data.quests[idx] = quest;
      else data.quests.push(quest);
      notify();
      return quest;
    },
    deleteQuest: async (id: string) => {
      data.quests = data.quests.filter((q) => q.id !== id);
      notify();
    },
    setQuestState: async (id: string, state: QuestState) => {
      const quest = data.quests.find((q) => q.id === id);
      if (quest) quest.state = state;
      notify();
    },
    toggleObjective: async (questId: string, objectiveId: string) => {
      const quest = data.quests.find((q) => q.id === questId);
      const obj = quest?.objectives.find((o) => o.id === objectiveId);
      if (obj) obj.done = !obj.done;
      notify();
    },
    updatePlayer: async (patch) => {
      data.player = { ...data.player, ...patch };
      notify();
    },
    getSettings: async () => data.settings,
    setSettings: async (patch) => {
      data.settings = { ...data.settings, ...patch };
      notify();
      return data.settings;
    },
    getServerInfo: async (): Promise<ServerInfo> => ({
      enabled: false,
      running: false,
      port: data.settings.serverPort,
      lanUrl: 'http://192.168.0.1:7788',
      code: 'DEMO1',
      qr: null,
      addresses: [],
    }),
    regenerateCode: async () => window.questboard.getServerInfo(),
    openDataFolder: async () => undefined,
    openExternal: async (url: string) => {
      window.open(url);
    },
    hide: async () => undefined,
    setClickThrough: async () => undefined,
    resizeStart: async () => undefined,
    resizeMove: async () => undefined,
    resizeEnd: async () => undefined,
    onDataChanged: (cb) => {
      listeners.data.add(cb);
      return () => {
        listeners.data.delete(cb);
      };
    },
    onToast: (cb) => {
      listeners.toast.add(cb);
      return () => {
        listeners.toast.delete(cb);
      };
    },
    onUiOpen: () => () => undefined,
    onServerChanged: () => () => undefined,
  };

  console.info('[questboard] мок API активен — предпросмотр в браузере');
}
