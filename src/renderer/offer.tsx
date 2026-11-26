import React from 'react';
import { createRoot } from 'react-dom/client';
import OfferFrame from './components/OfferFrame';
import './styles.css';
import './offer.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');

createRoot(container).render(
  <React.StrictMode>
    <OfferFrame offerId={new URLSearchParams(window.location.search).get('id') ?? ''} />
  </React.StrictMode>,
);
