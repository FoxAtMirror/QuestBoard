import { EventEmitter } from 'node:events';
import http from 'node:http';
import os from 'node:os';
import QRCode from 'qrcode';
import { QuestDraft, ServerInfo } from '../../shared/types';
import { Store } from './store';

/**
 * Локальный сервер «выдачи квестов».
 * Задача: человек с другого ПК/телефона (в той же сети или через туннель)
 * открывает ссылку, вводит код и выдаёт нам задачу — она сразу появляется в журнале.
 */
export class QuestServer extends EventEmitter {
  private server: http.Server | null = null;
  private store: Store;
  private port: number;
  private code: string;
  private requireCode: boolean;

  constructor(store: Store, port: number, code: string, requireCode: boolean) {
    super();
    this.store = store;
    this.port = port;
    this.code = code;
    this.requireCode = requireCode;
  }

  get running() {
    return this.server !== null;
  }

  getCode() {
    return this.code;
  }

  setCode(code: string) {
    this.code = code;
  }

  setRequireCode(value: boolean) {
    this.requireCode = value;
  }

  setPort(port: number) {
    this.port = port;
  }

  async start(): Promise<boolean> {
    if (this.server) return true;
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.on('error', (err) => {
        console.error('[server] ошибка:', err);
        this.server = null;
        resolve(false);
      });
      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`[server] слушаю 0.0.0.0:${this.port}, адрес в сети: ${this.lanUrl()}`);
        this.emit('started');
        resolve(true);
      });
    });
  }

  async stop() {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
    this.emit('stopped');
  }

  lanUrl(): string {
    return `http://${this.primaryAddress()}:${this.port}`;
  }

  primaryAddress(): string {
    const addrs = this.addresses();
    // Приоритет: обычный Wi-Fi/ethernet (192.168.x, 10.x), потом 172.16–31.x,
    // и лишь потом виртуальные адаптеры (WSL, Docker, Hyper-V).
    const rank = (ip: string) => {
      if (/^192\.168\./.test(ip)) return 0;
      if (/^10\./.test(ip)) return 1;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
      return 3;
    };
    addrs.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    return addrs[0] ?? '127.0.0.1';
  }

  addresses(): string[] {
    const nets = os.networkInterfaces();
    const out: string[] = [];
    for (const list of Object.values(nets)) {
      for (const net of list ?? []) {
        if (net.family === 'IPv4' && !net.internal) out.push(net.address);
      }
    }
    return out;
  }

  async info(): Promise<ServerInfo> {
    const shareUrl = `${this.lanUrl()}/?code=${this.code}`;
    let qr: string | null = null;
    try {
      qr = await QRCode.toDataURL(shareUrl, { width: 320, margin: 1, color: { dark: '#1a1208', light: '#efe3c4' } });
    } catch {
      qr = null;
    }
    return {
      enabled: true,
      running: this.running,
      port: this.port,
      lanUrl: this.lanUrl(),
      code: this.code,
      qr,
      addresses: this.addresses(),
    };
  }

  /** Проверка кода доступа. Пустой код = доступ без пароля (режим «публичный») */
  private checkCode(req: http.IncomingMessage, url: URL): boolean {
    if (!this.requireCode) return true;
    const provided =
      (req.headers['x-quest-code'] as string | undefined) ||
      url.searchParams.get('code') ||
      '';
    return provided.trim().toUpperCase() === this.code.toUpperCase();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Quest-Code');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/' || url.pathname === '/give') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderGivePage(url.searchParams.get('code') ?? '', this.requireCode));
      return;
    }

    if (url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: this.running, app: 'QuestBoard' }));
      return;
    }

    if (url.pathname === '/api/quests' && req.method === 'GET') {
      if (!this.checkCode(req, url)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Неверный код доступа' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ quests: this.store.quests }));
      return;
    }

    if (url.pathname === '/api/quests' && req.method === 'POST') {
      if (!this.checkCode(req, url)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Неверный код доступа' }));
        return;
      }
      let draft: QuestDraft;
      try {
        const body = await readBody(req);
        draft = body ? (JSON.parse(body) as QuestDraft) : ({ title: '' } as QuestDraft);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Некорректный JSON' }));
        return;
      }
      if (!draft.title || !draft.title.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Нужно название квеста' }));
        return;
      }
      const quest = this.store.createQuest(draft, 'remote');
      this.emit('quest-created', quest);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, quest }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Не найдено' }));
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Страница выдачи квеста: маленькая, мобильная, в том же визуальном языке,
 * что и основное приложение (пергамент + золото).
 */
function renderGivePage(prefillCode: string, requireCode: boolean): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Выдать квест · QuestBoard</title>
<style>
  :root { --gold:#e7c877; --gold-dark:#8a6a2f; --parch:#e3d3ab; --parch-dark:#c9b284; --ink:#2a1d0c; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
    background: radial-gradient(circle at 50% 0%, #3b2c17 0%, #171008 55%, #0a0704 100%);
    font-family: 'Georgia', 'Times New Roman', serif; color:#f0e3c2; }
  .frame { width:100%; max-width:520px; border-radius:10px; padding:3px;
    background: linear-gradient(160deg,#f3e2b0,#8a6a2f 35%,#5b4520 60%,#c9a95f);
    box-shadow: 0 24px 60px rgba(0,0,0,.65), 0 0 0 1px rgba(0,0,0,.5); }
  .sheet { border-radius:8px; padding:22px 22px 26px;
    background: linear-gradient(180deg,#efe2bd 0%, #e0cfa4 60%, #d3bf90 100%);
    color:#2a1d0c; box-shadow: inset 0 0 40px rgba(120,88,40,.35); }
  h1 { margin:0 0 4px; font-size:26px; letter-spacing:.06em; text-transform:uppercase;
    color:#4a3410; text-shadow:0 1px 0 rgba(255,255,255,.4); }
  .sub { margin:0 0 18px; font-size:13px; color:#6b5225; font-style:italic; }
  label { display:block; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#6b5225; margin:12px 0 4px; }
  input, textarea, select { width:100%; padding:9px 10px; border-radius:5px; border:1px solid #8a6a2f;
    background:rgba(255,255,255,.55); color:#2a1d0c; font-family:inherit; font-size:15px; }
  textarea { min-height:70px; resize:vertical; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .code { text-transform:uppercase; letter-spacing:.35em; font-weight:700; }
  button { width:100%; margin-top:20px; padding:13px; border:none; border-radius:6px; cursor:pointer;
    font-family:inherit; font-size:16px; letter-spacing:.1em; text-transform:uppercase; font-weight:700;
    color:#2b1e06; background:linear-gradient(180deg,#f6e3ac,#c9a54e); box-shadow:0 3px 0 #7d5f22, inset 0 1px 0 rgba(255,255,255,.6); }
  button:active { transform:translateY(2px); box-shadow:0 1px 0 #7d5f22; }
  #status { margin-top:14px; font-size:14px; min-height:20px; }
  .ok { color:#2f6b2a; font-weight:700; } .err { color:#a02222; font-weight:700; }
  .hint { margin-top:18px; font-size:12px; color:#6b5225; border-top:1px solid rgba(107,82,37,.35); padding-top:10px; }
</style>
</head>
<body>
<div class="frame"><div class="sheet">
  <h1>Выдать квест</h1>
  <p class="sub">Задание попадёт в журнал на машине владельца.</p>
  <form id="f">
    ${requireCode ? '<label>Код доступа</label><input id="code" class="code" maxlength="8" placeholder="XXXXXX" value="' + escapeHtml(prefillCode) + '" required />' : ''}
    <label>Название квеста *</label>
    <input id="title" required placeholder="Например: Проверить отчёт за неделю" />
    <label>Описание</label>
    <textarea id="summary" placeholder="Что именно нужно сделать"></textarea>
    <div class="row">
      <div><label>Кто выдал</label><input id="giver" placeholder="Имя или позывной" /></div>
      <div><label>Важность</label><select id="priority">
        <option value="normal">Нормальный</option><option value="high">Важный</option>
        <option value="epic">Эпический</option><option value="low">Обычный</option></select></div>
    </div>
    <div class="row">
      <div><label>Уровень</label><input id="level" type="number" min="1" max="100" value="1" /></div>
      <div><label>Зона / проект</label><input id="zone" placeholder="Работа" /></div>
    </div>
    <label>Награда</label>
    <input id="reward" placeholder="Опыт, благодарность, пицца" />
    <label>Цели (по одной на строку)</label>
    <textarea id="objectives" placeholder="Собрать данные&#10;Отправить отчёт"></textarea>
    <button type="submit">Выдать квест</button>
  </form>
  <div id="status"></div>
  <div class="hint">Подключение идёт по локальной сети. Для выдачи извне используйте туннель (cloudflared / ngrok) — см. README.</div>
</div></div>
<script>
  const f = document.getElementById('f');
  const st = document.getElementById('status');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    st.textContent = 'Отправляем…'; st.className = '';
    const code = (document.getElementById('code')?.value || '').trim().toUpperCase();
    const objectives = document.getElementById('objectives').value.split('\\n').filter(s => s.trim());
    const payload = {
      title: document.getElementById('title').value,
      summary: document.getElementById('summary').value,
      giver: document.getElementById('giver').value,
      priority: document.getElementById('priority').value,
      level: Number(document.getElementById('level').value) || 1,
      zone: document.getElementById('zone').value,
      reward: document.getElementById('reward').value,
      objectives,
    };
    try {
      const res = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Quest-Code': code },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      st.className = 'ok';
      st.textContent = '✓ Квест «' + data.quest.title + '» выдан!';
      f.reset();
    } catch (err) {
      st.className = 'err';
      st.textContent = '✗ ' + (err.message || 'Не удалось отправить');
    }
  });
</script>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
