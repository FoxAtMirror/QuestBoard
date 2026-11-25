import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  AppData,
  AppSettings,
  DEFAULT_PLAYER,
  DEFAULT_SETTINGS,
  Player,
  Quest,
  QuestDraft,
  QuestObjective,
  QuestState,
} from '../../shared/types';

const DATA_VERSION = 1;

/**
 * Хранилище задач — обычный JSON с атомарной записью (write tmp → rename).
 * Причина: нужен доступ к файлу извне (будущий аддон WoW, синхронизация),
 * никаких нативных зависимостей и полная переносимость между ОС.
 */
export class Store extends EventEmitter {
  private file: string;
  /** Отдельный файл-«зеркало» — читается посторонними инструментами */
  readonly mirrorFile: string;
  private data: AppData;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(file?: string) {
    super();
    this.file = file ?? path.join(app.getPath('userData'), 'questboard.json');
    this.mirrorFile = path.join(app.getPath('userData'), 'quests-live.json');
    this.data = this.load();
  }

  private load(): AppData {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        const parsed = JSON.parse(raw) as AppData;
        return this.migrate(parsed);
      }
    } catch (err) {
      console.error('[store] не удалось прочитать файл данных, начинаем с нуля:', err);
      // Не теряем данные: сохраняем битый файл рядом
      try {
        fs.renameSync(this.file, `${this.file}.broken-${Date.now()}`);
      } catch {
        /* игнорируем */
      }
    }
    return {
      version: DATA_VERSION,
      quests: [],
      player: { ...DEFAULT_PLAYER },
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  private migrate(data: AppData): AppData {
    return {
      version: DATA_VERSION,
      quests: Array.isArray(data.quests) ? data.quests : [],
      player: { ...DEFAULT_PLAYER, ...(data.player ?? {}) },
      settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
    };
  }

  /** Отложенное сохранение — пачка правок не пишет файл на каждый чих */
  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 250);
  }

  saveNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const payload = JSON.stringify(this.data, null, 2);
    const tmp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, payload, 'utf8');
      fs.renameSync(tmp, this.file);
      // зеркало для внешних читателей (аддон, скрипты)
      fs.writeFileSync(this.mirrorFile, JSON.stringify({ quests: this.data.quests, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    } catch (err) {
      console.error('[store] ошибка записи:', err);
    }
  }

  private commit() {
    this.scheduleSave();
    this.emit('changed', this.data);
  }

  // ---------- чтение ----------

  getData(): AppData {
    return this.data;
  }

  get quests(): Quest[] {
    return this.data.quests;
  }

  get settings(): AppSettings {
    return this.data.settings;
  }

  get player(): Player {
    return this.data.player;
  }

  // ---------- изменение ----------

  upsertQuest(quest: Quest): Quest {
    const idx = this.data.quests.findIndex((q) => q.id === quest.id);
    if (idx >= 0) {
      this.data.quests[idx] = { ...quest, updatedAt: new Date().toISOString() };
    } else {
      this.data.quests.push(quest);
    }
    this.commit();
    return quest;
  }

  /** Создаёт квест из черновика (форма «Выдать квест») */
  createQuest(draft: QuestDraft, source: Quest['source'] = 'local'): Quest {
    const now = new Date().toISOString();
    const objectives: QuestObjective[] = (draft.objectives ?? [])
      .filter((t) => t.trim().length > 0)
      .map((text) => ({ id: `obj_${Math.random().toString(36).slice(2, 10)}`, text: text.trim(), done: false }));

    const quest: Quest = {
      id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title: draft.title.trim() || 'Безымянный квест',
      summary: draft.summary?.trim() ?? '',
      giver: draft.giver?.trim() || 'Случайный прохожий',
      level: draft.level && draft.level > 0 ? draft.level : 1,
      zone: draft.zone?.trim() || 'Неизвестная местность',
      objectives,
      reward: draft.reward?.trim() || 'Опыт и признание',
      state: 'available',
      priority: draft.priority ?? 'normal',
      tags: draft.tags ?? [],
      source,
      createdAt: now,
      updatedAt: now,
      dueAt: draft.dueAt || undefined,
    };
    return this.upsertQuest(quest);
  }

  deleteQuest(id: string) {
    this.data.quests = this.data.quests.filter((q) => q.id !== id);
    this.commit();
  }

  setQuestState(id: string, state: QuestState) {
    const quest = this.data.quests.find((q) => q.id === id);
    if (!quest) return;
    quest.state = state;
    quest.completedAt = state === 'completed' ? new Date().toISOString() : undefined;
    quest.updatedAt = new Date().toISOString();
    if (state === 'completed') {
      this.grantXp(quest.rewardXp ?? 25);
    }
    this.commit();
  }

  toggleObjective(questId: string, objectiveId: string) {
    const quest = this.data.quests.find((q) => q.id === questId);
    if (!quest) return;
    const obj = quest.objectives.find((o) => o.id === objectiveId);
    if (!obj) return;
    obj.done = !obj.done;
    // Все цели закрыты → квест выполнен; иначе квест считается взятым в работу
    const allDone = quest.objectives.length > 0 && quest.objectives.every((o) => o.done);
    if (allDone && quest.state !== 'completed') {
      quest.state = 'completed';
      quest.completedAt = new Date().toISOString();
      this.grantXp(quest.rewardXp ?? 25);
    } else if (!allDone) {
      quest.state = 'active';
      quest.completedAt = undefined;
    }
    quest.updatedAt = new Date().toISOString();
    this.commit();
  }

  updateQuest(id: string, patch: Partial<Quest>) {
    const quest = this.data.quests.find((q) => q.id === id);
    if (!quest) return;
    Object.assign(quest, patch, { updatedAt: new Date().toISOString() });
    this.commit();
  }

  updatePlayer(patch: Partial<Player>) {
    this.data.player = { ...this.data.player, ...patch };
    this.commit();
  }

  /** Начисление опыта с автоматическим повышением уровня */
  private grantXp(amount: number) {
    const player = this.data.player;
    player.xp += amount;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level += 1;
      player.xpToNext = Math.round(player.xpToNext * 1.35);
    }
  }

  updateSettings(patch: Partial<AppSettings>) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.commit();
  }
}
