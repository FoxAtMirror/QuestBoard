import { useCallback, useEffect, useState } from 'react';
import { AppSettings, ServerInfo } from '@shared/types';

interface Props {
  settings: AppSettings;
  onClose: () => void;
}

/**
 * Панель «Выдать квест с другого устройства»:
 * ссылка + QR + код доступа для локального сервера выдачи.
 */
export default function SharePanel({ settings, onClose }: Props) {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [port, setPort] = useState(settings.serverPort);
  const [copied, setCopied] = useState('');

  const refresh = useCallback(async () => {
    const next = await window.questboard.getServerInfo();
    setInfo(next);
  }, []);

  useEffect(() => {
    void refresh();
    return window.questboard.onServerChanged(() => void refresh());
  }, [refresh]);

  const shareUrl = info ? `${info.lanUrl}/?code=${info.code}` : '';

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  }

  async function toggleServer() {
    await window.questboard.setSettings({ serverEnabled: !settings.serverEnabled });
    await refresh();
  }

  async function regenerate() {
    await window.questboard.regenerateCode();
    await refresh();
  }

  async function applyPort() {
    const value = Math.min(65535, Math.max(1024, Number(port) || 7788));
    setPort(value);
    await window.questboard.setSettings({ serverPort: value });
    await refresh();
  }

  const running = info?.running ?? false;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sheet share">
        <div className="sheet-head">
          <h2>Выдать квест с другого устройства</h2>
          <button type="button" className="wb close" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="check">
          <input type="checkbox" checked={settings.serverEnabled} onChange={() => void toggleServer()} />
          Сервер выдачи квестов {running ? 'работает' : 'выключен'}
        </label>

        {running && info && (
          <>
            <div className="share-qr">
              {info.qr ? <img src={info.qr} alt="QR-код для выдачи квеста" /> : <div className="qr-none">QR недоступен</div>}
            </div>

            <label>
              Ссылка (в той же сети)
              <div className="copy-row">
                <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn" onClick={() => void copy(shareUrl, 'url')}>
                  {copied === 'url' ? '✓' : 'Копировать'}
                </button>
              </div>
            </label>

            <label>
              Код доступа
              <div className="copy-row">
                <input readOnly className="code-input" value={info.code} />
                <button type="button" className="btn" onClick={() => void copy(info.code, 'code')}>
                  {copied === 'code' ? '✓' : 'Копировать'}
                </button>
                <button type="button" className="btn" onClick={() => void regenerate()} title="Новый код">
                  ⟳
                </button>
              </div>
            </label>

            <button
              type="button"
              className="btn primary wide"
              onClick={() => void window.questboard.openExternal(info.lanUrl)}
            >
              Открыть страницу выдачи у себя
            </button>

            <div className="hint-box">
              На другом ПК или телефоне в той же Wi-Fi сети открой ссылку (или отсканируй QR),
              введи код — и квест сразу появится в журнале.
              {info.addresses.length > 1 && (
                <>
                  <br />
                  Другие адреса в сети: {info.addresses.join(', ')}
                </>
              )}
            </div>
          </>
        )}

        {!running && (
          <div className="hint-box">
            Сервер выключен. Включи его, чтобы принимать квесты с других устройств.
          </div>
        )}

        <div className="grid-2">
          <label>
            Порт
            <input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              onBlur={() => void applyPort()}
            />
          </label>
          <label className="check spaced">
            <input
              type="checkbox"
              checked={settings.requireCode}
              onChange={(e) => void window.questboard.setSettings({ requireCode: e.target.checked })}
            />
            Требовать код доступа
          </label>
        </div>

        <div className="hint-box">
          <b>Доступ из интернета.</b> Локальный адрес работает только внутри твоей сети.
          Чтобы выдавать квесты извне, пробрасывай порт через туннель:
          <code>cloudflared tunnel --url http://localhost:{settings.serverPort}</code>
          или <code>ngrok http {settings.serverPort}</code> — и раздавай полученный адрес.
        </div>

        <div className="sheet-foot">
          <button type="button" className="btn primary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
