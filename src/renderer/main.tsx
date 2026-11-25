import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installMockApi } from './mock';
import './styles.css';

// Если окно открыли в обычном браузере (а не в Electron) — подставляем мок API
if (!window.questboard) installMockApi();

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
