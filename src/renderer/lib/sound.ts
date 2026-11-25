/**
 * Звуки, синтезированные на лету через Web Audio.
 * Никаких внешних ассетов — только генераторы, поэтому работает офлайн.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, duration: number, gain = 0.18, type: OscillatorType = 'triangle') {
  const audio = context();
  if (!audio) return;
  const osc = audio.createOscillator();
  const vol = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.currentTime + start);
  vol.gain.setValueAtTime(0.0001, audio.currentTime + start);
  vol.gain.exponentialRampToValueAtTime(gain, audio.currentTime + start + 0.02);
  vol.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + duration);
  osc.connect(vol).connect(audio.destination);
  osc.start(audio.currentTime + start);
  osc.stop(audio.currentTime + start + duration + 0.05);
}

/** Квест выполнен — восходящая фанфара */
export function playQuestComplete() {
  tone(523.25, 0, 0.18, 0.16, 'triangle');
  tone(659.25, 0.12, 0.2, 0.16, 'triangle');
  tone(783.99, 0.24, 0.34, 0.18, 'triangle');
  tone(1046.5, 0.38, 0.5, 0.12, 'sine');
}

/** Новый квест получен — короткий «дзинь» */
export function playQuestReceived() {
  tone(880, 0, 0.14, 0.12, 'sine');
  tone(1174.66, 0.09, 0.26, 0.1, 'sine');
}

/** Уровень повышен */
export function playLevelUp() {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 0.35, 0.16, 'triangle'));
}
