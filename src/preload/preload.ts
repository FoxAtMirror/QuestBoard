import { contextBridge, ipcRenderer } from 'electron';
import { AppData, AppSettings, Player, Quest, QuestDraft, ServerInfo } from '../../shared/types';

/**
 * Мост main → renderer. Renderer работает в изолированном контексте,
 * поэтому наружу торчит только этот минимальный API.
 */
const api = {
  getData: (): Promise<AppData> => ipcRenderer.invoke('quests:list'),
  createQuest: (draft: QuestDraft): Promise<Quest> => ipcRenderer.invoke('quests:create', draft),
  upsertQuest: (quest: Quest): Promise<Quest> => ipcRenderer.invoke('quests:upsert', quest),
  deleteQuest: (id: string): Promise<void> => ipcRenderer.invoke('quests:delete', id),
  setQuestState: (id: string, state: Quest['state']): Promise<void> =>
    ipcRenderer.invoke('quests:setState', id, state),
  toggleObjective: (questId: string, objectiveId: string): Promise<void> =>
    ipcRenderer.invoke('quests:toggleObjective', questId, objectiveId),
  updatePlayer: (patch: Partial<Player>): Promise<void> => ipcRenderer.invoke('player:update', patch),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch),
  getServerInfo: (): Promise<ServerInfo> => ipcRenderer.invoke('server:info'),
  regenerateCode: (): Promise<ServerInfo> => ipcRenderer.invoke('server:regenerateCode'),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('app:openDataFolder'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
  hide: (): Promise<void> => ipcRenderer.invoke('app:hide'),

  /** Пропускать клики мыши сквозь окно */
  setClickThrough: (enabled: boolean): Promise<void> => ipcRenderer.invoke('window:clickThrough', enabled),
  /** Ресайз окна перетаскиванием «уголка» */
  resizeStart: (screenY: number): Promise<void> => ipcRenderer.invoke('window:resizeStart', screenY),
  resizeMove: (screenY: number): Promise<void> => ipcRenderer.invoke('window:resizeMove', screenY),
  resizeEnd: (): Promise<void> => ipcRenderer.invoke('window:resizeEnd'),

  // события от main
  onDataChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('data:changed', listener);
    return () => {
      ipcRenderer.removeListener('data:changed', listener);
    };
  },
  onToast: (cb: (payload: { title: string; message: string }) => void) => {
    const listener = (_e: unknown, payload: { title: string; message: string }) => cb(payload);
    ipcRenderer.on('toast', listener);
    return () => {
      ipcRenderer.removeListener('toast', listener);
    };
  },
  onUiOpen: (cb: (panel: string) => void) => {
    const listener = (_e: unknown, panel: string) => cb(panel);
    ipcRenderer.on('ui:open', listener);
    return () => {
      ipcRenderer.removeListener('ui:open', listener);
    };
  },
  onServerChanged: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('server:changed', listener);
    return () => {
      ipcRenderer.removeListener('server:changed', listener);
    };
  },
};

contextBridge.exposeInMainWorld('questboard', api);

export type QuestBoardApi = typeof api;
