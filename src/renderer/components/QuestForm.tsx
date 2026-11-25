import { useMemo, useState } from 'react';
import { PRIORITY_LABEL, Quest, QuestDraft, QuestPriority } from '@shared/types';

interface Props {
  quest?: Quest;
  onClose: () => void;
  onSubmit: (draft: QuestDraft) => void | Promise<void>;
}

/** Модальное окно «Выдать квест» — в пергаментном стиле WoW. */
export default function QuestForm({ quest, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState(quest?.title ?? '');
  const [summary, setSummary] = useState(quest?.summary ?? '');
  const [giver, setGiver] = useState(quest?.giver ?? '');
  const [zone, setZone] = useState(quest?.zone ?? '');
  const [reward, setReward] = useState(quest?.reward ?? '');
  const [level, setLevel] = useState(quest?.level ?? 1);
  const [priority, setPriority] = useState<QuestPriority>(quest?.priority ?? 'normal');
  const [dueAt, setDueAt] = useState(quest?.dueAt ? quest.dueAt.slice(0, 10) : '');
  const [objectives, setObjectives] = useState<string[]>(
    quest?.objectives.map((o) => o.text) ?? [''],
  );
  const [busy, setBusy] = useState(false);

  const isEdit = Boolean(quest);
  const canSubmit = title.trim().length > 0;

  const zones = useMemo(() => ['Работа', 'Дом', 'Учёба', 'Проект', 'Свободное время'], []);

  function addObjective() {
    setObjectives((prev) => [...prev, '']);
  }

  function changeObjective(index: number, value: string) {
    setObjectives((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function removeObjective(index: number) {
    setObjectives((prev) => (prev.length === 1 ? [''] : prev.filter((_, i) => i !== index)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        summary: summary.trim(),
        giver: giver.trim(),
        zone: zone.trim(),
        reward: reward.trim(),
        level: Number(level) || 1,
        priority,
        dueAt: dueAt ? new Date(`${dueAt}T18:00:00`).toISOString() : undefined,
        objectives: objectives.filter((o) => o.trim()).map((o) => o.trim()),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal sheet" onSubmit={submit}>
        <div className="sheet-head">
          <h2>{isEdit ? 'Изменить квест' : 'Выдать квест'}</h2>
          <button type="button" className="wb close" onClick={onClose}>
            ✕
          </button>
        </div>

        <label>
          Название квеста *
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Проверить отчёт за неделю"
          />
        </label>

        <label>
          Описание
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Что именно нужно сделать"
            rows={3}
          />
        </label>

        <div className="grid-2">
          <label>
            Кто выдал
            <input value={giver} onChange={(e) => setGiver(e.target.value)} placeholder="Имя или позывной" />
          </label>
          <label>
            Важность
            <select value={priority} onChange={(e) => setPriority(e.target.value as QuestPriority)}>
              {(Object.keys(PRIORITY_LABEL) as QuestPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid-2">
          <label>
            Уровень
            <input
              type="number"
              min={1}
              max={100}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </label>
          <label>
            Зона
            <input list="zone-list" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Работа" />
            <datalist id="zone-list">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
        </div>

        <label>
          Награда
          <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Опыт, признание, пицца" />
        </label>

        <label>
          Дедлайн
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>

        <label>
          Цели
          <div className="objectives-editor">
            {objectives.map((value, index) => (
              <div className="objective-row" key={index}>
                <span className="bullet">◆</span>
                <input
                  value={value}
                  onChange={(e) => changeObjective(index, e.target.value)}
                  placeholder="Цель квеста"
                />
                <button type="button" className="mini danger" onClick={() => removeObjective(index)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="mini add" onClick={addObjective}>
            + Добавить цель
          </button>
        </label>

        <div className="sheet-foot">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn primary" disabled={!canSubmit || busy}>
            {isEdit ? 'Сохранить' : 'Выдать квест'}
          </button>
        </div>
      </form>
    </div>
  );
}
