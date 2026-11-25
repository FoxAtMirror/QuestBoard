import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppData,
  Quest,
  QuestDraft,
  QuestPriority,
  QuestState,
} from '@shared/types';
import QuestCard from './components/QuestCard';
import QuestForm from './components/QuestForm';
import SettingsPanel from './components/SettingsPanel';
import Toast from './components/Toast';
import { playLevelUp, playQuestComplete, playQuestReceived } from './lib/sound';

type Tab = 'log' | 'objectives' | 'done';
type Panel = null | 'new' | 'edit' | 'settings';

const PRIORITY_ORDER: QuestPriority[] = ['epic', 'high', 'normal', 'low'];

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>('log');
  const [panel, setPanel] = useState<Panel>(null);
  const [editing, setEditing] = useState<Quest | null>(null);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [hotEdge, setHotEdge] = useState(false);

  const reload = useCallback(async () => {
    const next = await window.questboard.getData();
    setData(next);
    setSoundOn(next.settings.soundEnabled);
  }, []);

  useEffect(() => {
    void reload();
    const offData = window.questboard.onDataChanged(() => void reload());
    const offToast = window.questboard.onToast((payload) => setToast(payload));
    const offUi = window.questboard.onUiOpen((name) => setPanel(name === 'settings' ? 'settings' : 'new'));
    return () => {
      offData();
      offToast();
      offUi();
    };
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Режим «сквозных кликов»: окно пропускает мышь, но у левого края есть
  // горячая зона — зашёл в неё, окно оживает и снова реагирует на клики.
  useEffect(() => {
    const enabled = data?.settings?.clickThrough ?? false;
    if (!enabled) {
      void window.questboard.setClickThrough(false);
      setHotEdge(false);
      return;
    }

    let idleTimer = 0;
    const wake = () => {
      window.clearTimeout(idleTimer);
      void window.questboard.setClickThrough(false);
      setHotEdge(true);
      idleTimer = window.setTimeout(() => {
        void window.questboard.setClickThrough(true);
        setHotEdge(false);
      }, 4000);
    };

    const onMove = (e: MouseEvent) => {
      if (e.clientX < 18) wake();
    };
    const onLeave = () => {
      window.clearTimeout(idleTimer);
      void window.questboard.setClickThrough(true);
      setHotEdge(false);
    };

    void window.questboard.setClickThrough(true);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      void window.questboard.setClickThrough(false);
    };
  }, [data?.settings?.clickThrough]);

  const quests = useMemo(() => data?.quests ?? [], [data]);
  const player = data?.player;
  const settings = data?.settings;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (q: Quest) =>
      !needle ||
      q.title.toLowerCase().includes(needle) ||
      q.summary.toLowerCase().includes(needle) ||
      q.giver.toLowerCase().includes(needle) ||
      q.zone.toLowerCase().includes(needle) ||
      q.tags.some((t) => t.toLowerCase().includes(needle));

    const filtered = quests.filter(matches);

    if (tab === 'done') return filtered.filter((q) => q.state === 'completed').sort(sortByCreated);
    if (tab === 'objectives') {
      return filtered
        .filter((q) => q.state === 'active' && q.objectives.length > 0)
        .sort((a, b) => objectiveRatio(a) - objectiveRatio(b));
    }
    return filtered
      .filter((q) => q.state !== 'completed')
      .sort(
        (a, b) =>
          PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || sortByCreated(a, b),
      );
  }, [quests, tab, query]);

  const activeTrack = useMemo(
    () => quests.filter((q) => q.state === 'active' || q.state === 'available').slice(0, 3),
    [quests],
  );

  const counts = useMemo(
    () => ({
      log: quests.filter((q) => q.state !== 'completed').length,
      objectives: quests.filter((q) => q.state === 'active' && q.objectives.length > 0).length,
      done: quests.filter((q) => q.state === 'completed').length,
    }),
    [quests],
  );

  async function handleCreate(draft: QuestDraft) {
    const quest = await window.questboard.createQuest(draft);
    setPanel(null);
    setToast({ title: 'Квест получен!', message: quest.title });
    if (soundOn) playQuestReceived();
  }

  async function handleUpdate(draft: QuestDraft) {
    if (!editing) return;
    // Сохраняем id и отметки выполнения у целей, если текст не менялся
    const quest: Quest = {
      ...editing,
      title: draft.title,
      summary: draft.summary ?? '',
      giver: draft.giver ?? '',
      zone: draft.zone ?? '',
      reward: draft.reward ?? '',
      level: draft.level ?? editing.level,
      priority: draft.priority ?? editing.priority,
      dueAt: draft.dueAt,
      objectives: (draft.objectives ?? []).map((text, index) => ({
        id: editing.objectives[index]?.id ?? `obj_${Math.random().toString(36).slice(2, 10)}`,
        text,
        done: editing.objectives[index]?.text === text ? editing.objectives[index].done : false,
      })),
      updatedAt: new Date().toISOString(),
    };
    await window.questboard.upsertQuest(quest);
    setPanel(null);
    setEditing(null);
  }

  async function handleToggleObjective(quest: Quest, objectiveId: string) {
    const wasCompleted = quest.state === 'completed';
    const allDone =
      quest.objectives.length > 0 && quest.objectives.every((o) => (o.id === objectiveId ? !o.done : o.done));
    await window.questboard.toggleObjective(quest.id, objectiveId);
    if (!wasCompleted && allDone) {
      if (soundOn) playQuestComplete();
      setToast({ title: 'Квест выполнен!', message: quest.title });
    }
  }

  async function handleSetState(quest: Quest, state: QuestState) {
    const leveling = state === 'completed' && quest.state !== 'completed';
    await window.questboard.setQuestState(quest.id, state);
    if (leveling && soundOn) {
      playQuestComplete();
      window.setTimeout(() => playLevelUp(), 450);
      setToast({ title: 'Квест выполнен!', message: `${quest.title} — награда получена` });
    }
  }

  async function handleDelete(quest: Quest) {
    await window.questboard.deleteQuest(quest.id);
  }

  if (!data || !player || !settings) {
    return <div className="boot">Загрузка журнала квестов…</div>;
  }

  const bg = settings.background;

  return (
    <div className={`app bg-${bg} ${hotEdge ? 'hot-edge' : ''}`}>
      <div className="qlog">
        <header className="qlog-head">
          <div className="crest" aria-hidden="true">
            !
          </div>
          <div className="titlebar-text">
            <span className="game">QUESTBOARD</span>
            <span className="sub">Журнал квестов</span>
          </div>
          <div className="window-buttons">
            <button className="wb" onClick={() => window.questboard.hide()} title="Свернуть в трей">
              —
            </button>
            <button className="wb close" onClick={() => window.questboard.hide()} title="Скрыть">
              ✕
            </button>
          </div>
        </header>

        <nav className="tabs">
          <button className={tab === 'log' ? 'tab active' : 'tab'} onClick={() => setTab('log')}>
            Журнал <em>{counts.log}</em>
          </button>
          <button className={tab === 'objectives' ? 'tab active' : 'tab'} onClick={() => setTab('objectives')}>
            Цели <em>{counts.objectives}</em>
          </button>
          {settings.showCompleted && (
            <button className={tab === 'done' ? 'tab active' : 'tab'} onClick={() => setTab('done')}>
              Выполнено <em>{counts.done}</em>
            </button>
          )}
        </nav>

        <div className="toolbar">
          <input
            className="search"
            placeholder="Поиск по квестам…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn primary" onClick={() => setPanel('new')}>
            Выдать квест
          </button>
        </div>

        <main className="scroll">
          {visible.length === 0 ? (
            <div className="empty">
              <div className="empty-mark">?</div>
              <p>
                {tab === 'done'
                  ? 'Выполненных квестов пока нет. Слава отважному герою.'
                  : 'Журнал пуст. Нажмите «Выдать квест», чтобы создать новую задачу.'}
              </p>
            </div>
          ) : (
            visible.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onToggleObjective={(oid) => void handleToggleObjective(quest, oid)}
                onSetState={(state) => void handleSetState(quest, state)}
                onEdit={() => {
                  setEditing(quest);
                  setPanel('edit');
                }}
                onDelete={() => void handleDelete(quest)}
              />
            ))
          )}
        </main>

        {activeTrack.length > 0 && tab !== 'done' && (
          <section className="tracker">
            <div className="tracker-title">Трекер</div>
            {activeTrack.map((q) => (
              <div key={q.id} className="track-row">
                <span className="track-name">{q.title}</span>
                {q.objectives.length > 0 && (
                  <ul className="track-objectives">
                    {q.objectives.slice(0, 3).map((o) => (
                      <li key={o.id} className={o.done ? 'done' : ''}>
                        <span className="bullet">{o.done ? '✦' : '◆'}</span>
                        {o.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        <footer className="playerframe">
          <div className="portrait">{player.name.slice(0, 1).toUpperCase()}</div>
          <div className="player-info">
            <div className="player-name">
              {player.name} <span className="player-level">Ур. {player.level}</span>
            </div>
            <div className="player-class">{player.className}</div>
            <div className="xpbar" title={`${player.xp} / ${player.xpToNext} опыта`}>
              <div className="xpfill" style={{ width: `${Math.min(100, (player.xp / player.xpToNext) * 100)}%` }} />
              <span className="xptext">
                {player.xp} / {player.xpToNext}
              </span>
            </div>
          </div>
          <div className="player-actions">
            <button className="btn icon" onClick={() => setPanel('new')} title="Новый квест">
              +
            </button>
            <button className="btn icon" onClick={() => setPanel('settings')} title="Настройки">
              ⚙
            </button>
          </div>
        </footer>
      </div>

      <div
        className="resize-grip"
        onMouseDown={(e) => {
          e.preventDefault();
          void window.questboard.resizeStart(e.screenY);
          const move = (ev: MouseEvent) => void window.questboard.resizeMove(ev.screenY);
          const up = () => {
            void window.questboard.resizeEnd();
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        }}
      />

      {panel === 'new' && <QuestForm onClose={() => setPanel(null)} onSubmit={handleCreate} />}
      {panel === 'edit' && editing && (
        <QuestForm quest={editing} onClose={() => setPanel(null)} onSubmit={handleUpdate} />
      )}
      {panel === 'settings' && <SettingsPanel settings={settings} player={player} onClose={() => setPanel(null)} />}

      {toast && <Toast data={toast} />}
    </div>
  );
}

function sortByCreated(a: Quest, b: Quest): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function objectiveRatio(q: Quest): number {
  if (q.objectives.length === 0) return 1;
  return q.objectives.filter((o) => o.done).length / q.objectives.length;
}
