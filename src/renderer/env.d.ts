/// <reference types="vite/client" />
import type { QuestBoardApi } from '../preload/preload';

declare global {
  interface Window {
    questboard: QuestBoardApi;
  }
}

export {};
