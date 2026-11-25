import { PRIORITY_LABEL, Quest, QuestState } from '@shared/types';

interface Props {
  quest: Quest;
  onToggleObjective: (objectiveId: string) => void;
  onSetState: (state: QuestState) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Элемент журнала в духе WoW: без карточки-подложки —
 * название золотом, цели списком, справа уровень и зона.
 */
export default function QuestCard({ quest, onToggleObjective, onSetState, onEdit, onDelete }: Props) {
  const doneCount = quest.objectives.filter((o) => o.done).length;

  return (
    <article className="quest" data-priority={quest.priority} data-state={quest.state}>
      <div className="quest-line">
        <button
          className="quest-title"
          onClick={() => onSetState(quest.state === 'completed' ? 'active' : 'completed')}
          title="Переключить выполнение"
        >
          {quest.title}
        </button>
        <span className="quest-meta-right">
          <span className="quest-level">{quest.level}</span>
          <span className="quest-zone">{quest.zone}</span>
        </span>
      </div>

      {quest.summary && <p className="quest-summary">{quest.summary}</p>}

      {quest.objectives.length > 0 && (
        <ul className="objectives">
          {quest.objectives.map((obj) => (
            <li
              key={obj.id}
              className={obj.done ? 'objective done' : 'objective'}
              onClick={() => onToggleObjective(obj.id)}
            >
              <span className="bullet">{obj.done ? '✦' : '◆'}</span>
              <span className="obj-text">{obj.text}</span>
              {obj.total ? (
                <span className="obj-count">
                  {obj.current ?? 0}/{obj.total}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="quest-foot">
        <span className="giver">{quest.giver}</span>
        <span className="reward">Награда: {quest.reward}</span>
        {quest.dueAt && <span className="due">до {formatDue(quest.dueAt)}</span>}
        <span className={`prio prio-${quest.priority}`}>{PRIORITY_LABEL[quest.priority]}</span>
      </div>

      <div className="quest-actions">
        {quest.state !== 'completed' && (
          <button className="mini" onClick={() => onSetState(quest.state === 'active' ? 'available' : 'active')}>
            {quest.state === 'active' ? 'В ожидании' : 'В работу'}
          </button>
        )}
        {quest.state !== 'completed' && (
          <button className="mini ok" onClick={() => onSetState('completed')}>
            Выполнен
          </button>
        )}
        {quest.state === 'completed' && (
          <button className="mini" onClick={() => onSetState('active')}>
            Вернуть в работу
          </button>
        )}
        <button className="mini" onClick={onEdit}>
          Изменить
        </button>
        <button className="mini danger" onClick={onDelete}>
          Удалить
        </button>
        {quest.objectives.length > 0 && (
          <span className="progress-hint">
            {doneCount}/{quest.objectives.length}
          </span>
        )}
      </div>
    </article>
  );
}

function formatDue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
