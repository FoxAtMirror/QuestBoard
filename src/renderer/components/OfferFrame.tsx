import { useEffect, useState } from 'react';
import { QuestOffer } from '@shared/types';

/**
 * Окно «Принять квест» в духе WoW: каменная рамка, золотое название,
 * цели с красными маркерами, награда и кнопки «Принять» / «Отказать».
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
    return <div className="offer-frame waiting">Предложение квеста…</div>;
  }

  const { draft, source } = offer;
  const objectives = draft.objectives ?? [];

  return (
    <div className="offer-frame">
      <div className="offer-head">
        <div className="offer-mark">!</div>
        <div className="offer-headings">
          <div className="offer-title">{draft.title || 'Безымянный квест'}</div>
          <div className="offer-sub">
            {draft.giver || 'Случайный прохожий'}
            {draft.level ? ` · Ур. ${draft.level}` : ''}
            {draft.zone ? ` · ${draft.zone}` : ''}
            {source === 'remote' ? ' · выдано удалённо' : ''}
          </div>
        </div>
      </div>

      <div className="offer-body">
        {draft.summary && <p className="offer-text">{draft.summary}</p>}

        {objectives.length > 0 && (
          <>
            <div className="offer-section">Цели</div>
            <ul className="offer-objectives">
              {objectives.map((text, i) => (
                <li key={i}>
                  <span className="bullet">◆</span>
                  {text}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="offer-section">Награда</div>
        <div className="offer-reward">{draft.reward || 'Опыт и признание'}</div>
      </div>

      <div className="offer-foot">
        <button className="btn primary" onClick={() => void accept()} disabled={busy}>
          Принять
        </button>
        <button className="btn" onClick={() => void decline()} disabled={busy}>
          Отказаться
        </button>
      </div>
    </div>
  );
}
