import { useState } from 'react';
import { AppSettings, Player } from '@shared/types';

interface Props {
  settings: AppSettings;
  player: Player;
  onClose: () => void;
}

/** Панель настроек: внешний вид, поведение оверлея и герой. */
export default function SettingsPanel({ settings, player, onClose }: Props) {
  const [name, setName] = useState(player.name);
  const [className, setClassName] = useState(player.className);
  const [busy, setBusy] = useState(false);

  async function patch(patchValue: Partial<AppSettings>) {
    setBusy(true);
    try {
      await window.questboard.setSettings(patchValue);
    } finally {
      setBusy(false);
    }
  }

  async function savePlayer() {
    await window.questboard.updatePlayer({ name: name.trim() || 'Герой', className: className.trim() || 'Искатель' });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sheet settings">
        <div className="sheet-head">
          <h2>Настройки</h2>
          <button type="button" className="wb close" onClick={onClose}>
            ✕
          </button>
        </div>

        <h3>Внешний вид</h3>
        <label className="radio-group">
          Фон журнала
          <div className="radios">
            {(
              [
                ['text', 'Только текст заданий — без рамки и панели'],
                ['transparent', 'Прозрачный — только рамка'],
                ['panel', 'Полупрозрачная панель'],
                ['solid', 'Сплошной фон'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="radio">
                <input
                  type="radio"
                  name="background"
                  checked={settings.background === value}
                  onChange={() => void patch({ background: value })}
                />
                {label}
              </label>
            ))}
          </div>
        </label>

        <label className="range">
          Непрозрачность окна — {Math.round(settings.opacity * 100)}%
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={settings.opacity}
            onChange={(e) => void patch({ opacity: Number(e.target.value) })}
          />
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.clickThrough}
            onChange={(e) => void patch({ clickThrough: e.target.checked })}
          />
          Сквозные клики (мышь проходит сквозь окно; у края появляется зона оживления)
        </label>

        <h3>Поведение</h3>
        <label className="radio-group">
          Слой окна
          <div className="radios">
            <label className="radio">
              <input
                type="radio"
                name="windowLayer"
                checked={settings.windowLayer === 'overlay'}
                onChange={() => void patch({ windowLayer: 'overlay' })}
              />
              Поверх окон — как игровой оверлей
            </label>
            <label className="radio">
              <input
                type="radio"
                name="windowLayer"
                checked={settings.windowLayer === 'desktop'}
                onChange={() => void patch({ windowLayer: 'desktop' })}
              />
              На рабочем столе — под окнами, поверх обоев
            </label>
          </div>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.alwaysOnTop}
            onChange={(e) => void patch({ alwaysOnTop: e.target.checked })}
          />
          Всегда поверх других окон
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.dockEnabled}
            onChange={(e) => void patch({ dockEnabled: e.target.checked })}
          />
          Прижимать к краю экрана
        </label>

        <label className="radio-group">
          Сторона экрана
          <div className="radios">
            <label className="radio">
              <input
                type="radio"
                name="dockSide"
                checked={settings.dockSide === 'right'}
                onChange={() => void patch({ dockSide: 'right', dockEnabled: true })}
              />
              Справа
            </label>
            <label className="radio">
              <input
                type="radio"
                name="dockSide"
                checked={settings.dockSide === 'left'}
                onChange={() => void patch({ dockSide: 'left', dockEnabled: true })}
              />
              Слева
            </label>
          </div>
        </label>

        <label className="range">
          Высота окна — {settings.windowHeight}%
          <input
            type="range"
            min={40}
            max={100}
            step={5}
            value={settings.windowHeight}
            onChange={(e) => void patch({ windowHeight: Number(e.target.value) })}
          />
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => void patch({ soundEnabled: e.target.checked })}
          />
          Звуки (получение и выполнение квестов)
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={settings.launchAtLogin}
            onChange={(e) => void patch({ launchAtLogin: e.target.checked })}
          />
          Запускать вместе с системой
        </label>

        <h3>Герой</h3>
        <div className="grid-2">
          <label>
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void savePlayer()} />
          </label>
          <label>
            Класс
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              onBlur={() => void savePlayer()}
              placeholder="Искатель"
            />
          </label>
        </div>

        <div className="sheet-foot">
          <button type="button" className="btn" onClick={() => void window.questboard.openDataFolder()}>
            Папка данных
          </button>
          <button type="button" className="btn primary" onClick={onClose} disabled={busy}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
