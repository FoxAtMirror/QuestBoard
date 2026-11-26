import { useEffect, useState } from 'react';
import { QuestOffer } from '@shared/types';

/**
 * Окно «Принять квест» в духе WoW:
 * иконка квеста с «!», гравированная плашка названия, текст,
 * цели с жёлтыми маркерами, награда и кнопки в стиле игровых.
 */
export default function OfferFrame({ offerId }: { offerId: string }) {
  const [offer, setOffer] = useState<QuestOffer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!offerId) return;
    void window.questboard.getOffer(offerId).then(setOffer);
  }, [offerId]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    await window.questboard.acceptOffer(offerId);
  }

  async function decline() {
    if (busy) return;
    setBusy(true);
    await window.questboard.declineOffer(offerId);
  }

  if (!offer) {
    return <div className="wow-frame waiting">Предложение квеста…</div>;
  }

  const { draft, source } = offer;
  const objectives = draft.objectives ?? [];

  return (
    <div className="wow-frame">
      <div className="wow-frame-inner">
        <div className="wow-header">
          <div className="wow-quest-icon">
            <span className="icon-mark">!</span>
            {draft.level ? <span className="icon-level">{draft.level}</span> : null}
          </div>
          <div className="wow-heading">
            <div className="wow-title">{draft.title || 'Безымянный квест'}</div>
            <div className="wow-meta">
              {draft.giver || 'Случайный прохожий'}
              {draft.zone ? ` · ${draft.zone}` : ''}
              {source === 'remote' ? ' · выдано удалённо' : ''}
            </div>
          </div>
        </div>

        <div className="wow-content">
          {draft.summary && <p className="wow-text">{draft.summary}</p>}

          {objectives.length > 0 && (
            <>
              <div className="wow-section">Цели</div>
              <ul className="wow-objectives">
                {objectives.map((text, i) => (
                  <li key={i}>
                    <span className="bullet">•</span>
                    {text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="wow-footer">
          <div className="wow-reward">
            <span className="coin" />
            <span className="reward-text">{draft.reward || 'Опыт и признание'}</span>
          </div>
          <div className="wow-buttons">
            <button className="wow-btn accept" onClick={() => void accept()} disabled={busy}>
              Принять квест
            </button>
            <button className="wow-btn" onClick={() => void decline()} disabled={busy}>
              Отказаться
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
