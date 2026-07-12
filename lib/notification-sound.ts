/**
 * Petit carillon synthétisé via Web Audio — évite de dépendre d'un fichier
 * son externe (licence, poids, hébergement) pour un simple ping discret.
 * Deux notes courtes et douces, pas de boucle, pas de son strident.
 */
export function playNotificationPing() {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  const now = ctx.currentTime;

  const notes: { freq: number; start: number; duration: number }[] = [
    { freq: 880, start: 0, duration: 0.14 },
    { freq: 1108.73, start: 0.1, duration: 0.22 },
  ];

  notes.forEach(({ freq, start, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.16, now + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + duration + 0.02);
  });

  setTimeout(() => ctx.close().catch(() => {}), 500);
}
