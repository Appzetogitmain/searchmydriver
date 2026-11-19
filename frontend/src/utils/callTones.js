/**
 * Ringtone (incoming) and ringback (outgoing) sounds for app calls.
 * Both fail silently: browsers may block audio until the user has
 * interacted with the page, and a call must still work without sound.
 */

let ringtone = null;
let ringback = null; // { ctx, timer }

export function startRingtone() {
  stopRingtone();
  try {
    ringtone = new Audio('/audio/alert_.mp3');
    ringtone.loop = true;
    ringtone.play().catch(() => {});
  } catch {
    ringtone = null;
  }
  try {
    navigator.vibrate?.([800, 600, 800, 600, 800]);
  } catch {
    /* ignore */
  }
}

export function stopRingtone() {
  if (ringtone) {
    try {
      ringtone.pause();
      ringtone.src = '';
    } catch {
      /* ignore */
    }
    ringtone = null;
  }
  try {
    navigator.vibrate?.(0);
  } catch {
    /* ignore */
  }
}

/** Indian-style ringback: 400 Hz, 0.4s on / 0.2s off / 0.4s on / 2s off. */
export function startRingback() {
  stopRingback();
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const burst = () => {
      const now = ctx.currentTime;
      [0, 0.6].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 400;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.4);
      });
    };
    burst();
    ringback = { ctx, timer: setInterval(burst, 3000) };
  } catch {
    ringback = null;
  }
}

export function stopRingback() {
  if (ringback) {
    clearInterval(ringback.timer);
    ringback.ctx.close().catch(() => {});
    ringback = null;
  }
}

export function stopAllTones() {
  stopRingtone();
  stopRingback();
}
