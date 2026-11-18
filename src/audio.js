// Synthesised sound: every effect is an oscillator or a burst of filtered noise
// built with WebAudio, so the game ships no audio files. Music is a small step
// sequencer (a bass line with a soft lead) that starts on the first user gesture.

const BASS = [55, 0, 55, 65.41, 55, 0, 82.41, 73.42, 55, 0, 55, 65.41, 98, 82.41, 73.42, 65.41];
const LEAD = [220, 0, 261.63, 0, 329.63, 0, 261.63, 0, 220, 0, 293.66, 0, 329.63, 392, 0, 0];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;
  let lastShot = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.14;
      musicBus.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, freqEnd, dur, type, vol, bus) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd && freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(bus || master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(dur, vol, cutoff) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime;
      const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function musicStep() {
    if (!ctx || muted) return;
    const bass = BASS[step % BASS.length];
    if (bass) tone(bass, bass, 0.24, 'triangle', 0.5, musicBus);
    const lead = LEAD[step % LEAD.length];
    if (lead && step % 2 === 0) tone(lead, lead, 0.2, 'sine', 0.16, musicBus);
    step += 1;
  }

  return {
    unlock() {
      ensure();
    },
    startMusic() {
      if (!ensure() || musicTimer !== null) return;
      musicTimer = window.setInterval(musicStep, 250);
    },
    stopMusic() {
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      const now = performance.now();
      if (now - lastShot < 50) return;
      lastShot = now;
      tone(920, 420, 0.07, 'square', 0.08);
    },
    enemyShoot() {
      tone(340, 180, 0.1, 'square', 0.05);
    },
    explosion(big) {
      noise(big ? 0.5 : 0.3, big ? 0.5 : 0.3, big ? 900 : 1400);
      tone(big ? 180 : 150, 38, big ? 0.45 : 0.3, 'sine', 0.35);
    },
    hit() {
      tone(220, 65, 0.18, 'sawtooth', 0.22);
      noise(0.12, 0.18, 900);
    },
    dash() {
      noise(0.16, 0.16, 2600);
    },
    pickup() {
      tone(660, 660, 0.07, 'sine', 0.16);
      window.setTimeout(() => tone(990, 990, 0.09, 'sine', 0.16), 60);
    },
    heal() {
      tone(520, 780, 0.16, 'sine', 0.18);
    },
    waveStart() {
      tone(262, 262, 0.12, 'triangle', 0.2);
      window.setTimeout(() => tone(392, 392, 0.12, 'triangle', 0.2), 90);
      window.setTimeout(() => tone(523, 523, 0.18, 'triangle', 0.2), 180);
    },
    bossAlarm() {
      tone(440, 440, 0.14, 'square', 0.14);
      window.setTimeout(() => tone(330, 330, 0.14, 'square', 0.14), 160);
      window.setTimeout(() => tone(440, 440, 0.2, 'square', 0.14), 320);
    },
    uiClick() {
      tone(1200, 1200, 0.04, 'square', 0.1);
    },
    gameOver() {
      const notes = [392, 330, 262, 196];
      notes.forEach((freq, i) => window.setTimeout(() => tone(freq, freq * 0.94, 0.22, 'triangle', 0.2), i * 170));
    },
  };
}
