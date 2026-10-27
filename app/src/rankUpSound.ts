// The Rank-up's Metal sound (design: Sound), ported from the UI prototype's synthesizer. Web Audio
// synthesis, started by the user's own tap. Heavier with each Tier. Phone speakers drop almost
// everything under about 150 Hz, so the weight lives in driven low-mids: distortion turns a 41 Hz
// kick into harmonics a phone can play. Nothing rings high and tonal, because that reads as a chime.

type FilterSpec = [type: BiquadFilterType, freq: number, q?: number, freq2?: number, time2?: number, freq3?: number, time3?: number];

type Voice = {
  t: number;
  dur: number;
  peak: number;
  a?: number;
  hold?: number;
  swell?: boolean;
  rev?: number;
  drive?: number;
  filters?: FilterSpec[];
  // Oscillator voices.
  type?: OscillatorType;
  f?: number | number[];
  det?: number[];
  // A pitch ratio reached after `ft` seconds.
  f2?: number;
  ft?: number;
  pre?: number;
};

// How a Rank-up sounds: `lvl` is 0 for a Division-up, 1 Silver, 2 Gold, 3 Diamond, 4 Elite.
export type SoundConfig = { lvl: number };

let ac: AudioContext | null = null;
let master: GainNode;
let noise: AudioBuffer;
let reverb: GainNode;
// Everything scheduled goes through these two, so a skip can cut what is still queued.
let dry: GainNode;
let wet: GainNode;
const curves: Record<number, Float32Array<ArrayBuffer>> = {};

// Starts audio from a tap. On iPhones the context is left as "ambient" (the default): the silent
// switch mutes it, but "playback" would pause the user's music.
export function audioInit() {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac = ac ?? new Context();
    if (ac.state !== 'running') void ac.resume();
    if (!master) {
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 6;
      comp.ratio.value = 8;
      comp.attack.value = 0.002;
      comp.release.value = 0.2;
      const clip = shaper(1.3);
      master = ac.createGain();
      master.gain.value = 0.8;
      master.connect(comp);
      comp.connect(clip);
      clip.connect(ac.destination);
      const sr = ac.sampleRate, len = sr * 2.4, ir = ac.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
      }
      const conv = ac.createConvolver();
      conv.buffer = ir;
      reverb = ac.createGain();
      reverb.gain.value = 0.8;
      reverb.connect(conv);
      conv.connect(master);
      newBus();
      noise = ac.createBuffer(1, sr * 2, sr);
      const n = noise.getChannelData(0);
      for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    }
  } catch {
    ac = null;
  }
}

function newBus() {
  dry = ac!.createGain();
  dry.connect(master);
  wet = ac!.createGain();
  wet.connect(reverb);
}

// Cuts every sound still queued or playing, so a skip never leaves sounds without anything to
// show for them.
export function silence() {
  if (!ac || !master) return;
  for (const bus of [dry, wet]) {
    bus.gain.cancelScheduledValues(ac.currentTime);
    bus.gain.setTargetAtTime(0, ac.currentTime, 0.015);
  }
  newBus();
}

export const now = () => (ac ? ac.currentTime : 0);

function env(g: GainNode, t0: number, a: number, peak: number, hold: number, rel: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.setValueAtTime(peak, t0 + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
}

function makeFilter([type, f, Q, f2, t2, f3, t3]: FilterSpec, t0: number) {
  const b = ac!.createBiquadFilter();
  b.type = type;
  b.frequency.setValueAtTime(f, t0);
  if (Q) b.Q.value = Q;
  if (f2 && t2) b.frequency.exponentialRampToValueAtTime(f2, t0 + t2);
  if (f3 && t3) b.frequency.exponentialRampToValueAtTime(f3, t0 + t3);
  return b;
}

function send(g: GainNode, rev?: number) {
  g.connect(dry);
  if (rev) {
    const s = ac!.createGain();
    s.gain.value = rev;
    g.connect(s);
    s.connect(wet);
  }
}

// Soft-clipping drive (tanh), normalised so full scale stays full scale.
function shaper(k: number) {
  const w = ac!.createWaveShaper();
  if (!curves[k]) {
    const c = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const x = i / 1023.5 - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    curves[k] = c;
  }
  w.curve = curves[k];
  w.oversample = '2x';
  return w;
}

// One voice: oscillators (f may be a list, each spread by det cents) through an optional drive,
// filters and an envelope.
function V(o: Voice) {
  if (!ac) return;
  const mix = ac.createGain();
  mix.gain.value = o.pre ?? 1;
  for (const f of [o.f ?? 0].flat()) {
    for (const det of o.det ?? [0]) {
      const n = ac.createOscillator();
      n.type = o.type ?? 'sine';
      n.detune.value = det;
      n.frequency.setValueAtTime(f, o.t);
      if (o.f2) n.frequency.exponentialRampToValueAtTime(f * o.f2, o.t + (o.ft ?? o.dur));
      n.connect(mix);
      n.start(o.t);
      n.stop(o.t + o.dur + 0.1);
    }
  }
  voiceOut(mix, o);
}

// The same, for noise.
function N(o: Voice) {
  if (!ac) return;
  const s = ac.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  s.start(o.t, Math.random() * 1.5);
  s.stop(o.t + o.dur + 0.1);
  voiceOut(s, o);
}

function voiceOut(src: AudioNode, o: Voice) {
  const t0 = o.t, a = o.a ?? 0.004, hold = o.hold ?? 0;
  let node = src;
  if (o.drive) {
    const w = shaper(o.drive);
    node.connect(w);
    node = w;
  }
  for (const spec of o.filters ?? []) {
    const b = makeFilter(spec, t0);
    node.connect(b);
    node = b;
  }
  const g = ac!.createGain();
  if (o.swell) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.peak, t0 + o.dur);
    g.gain.linearRampToValueAtTime(0, t0 + o.dur + 0.03);
  } else env(g, t0, a, o.peak, hold, Math.max(0.02, o.dur - a - hold));
  node.connect(g);
  send(g, o.rev);
}

const semi = (f: number, s: number) => f * Math.pow(2, s / 12);
const E1 = 41.2, E2 = 82.41;

// The kit.
const crunch = (t: number, n: number, span: number, p = 1) => {
  for (let i = 0; i < n; i++) {
    N({ t: t + Math.random() * span, dur: 0.006 + Math.random() * 0.02, peak: 0.35 * p * (0.5 + Math.random() * 0.5), a: 0.001, drive: 4, filters: [['bandpass', 500 + Math.random() * 1800, 3]] });
  }
};
const kick = (t: number, p = 1, f = 150) => {
  V({ f, f2: 0.3, ft: 0.06, t, dur: 0.4, peak: 0.5 * p, a: 0.002, drive: 4, filters: [['lowpass', 3000]] });
  N({ t, dur: 0.015, peak: 0.3 * p, a: 0.001, filters: [['bandpass', 3000, 1]] });
};
const snare = (t: number, p = 1) => {
  N({ t, dur: 0.25, peak: 0.4 * p, a: 0.001, drive: 2, filters: [['bandpass', 1700, 0.7]], rev: 0.35 });
  V({ f: 190, f2: 0.75, ft: 0.06, t, dur: 0.14, peak: 0.3 * p, a: 0.001, drive: 3 });
};
const crash = (t: number, p = 1) => N({ t, dur: 1.3, peak: 0.13 * p, a: 0.002, filters: [['highpass', 3500, 0.5]], rev: 0.25 });
// A power chord (root, fifth, octave) through amp-style distortion and a speaker-cabinet low-pass.
// `mute` is a palm-muted chug.
const gtr = (t: number, root: number, dur: number, p = 1, mute = false) =>
  V({ type: 'sawtooth', f: [root, root * 1.4983, root * 2], det: [-8, 8], t, dur, peak: 0.2 * p, a: 0.003, hold: mute ? 0 : dur * 0.4, pre: 0.5, drive: 20, filters: [['highpass', 90, 0.7], ['lowpass', mute ? 650 : 3600, mute ? 1.2 : 0.8]] });
const subDrone = (t: number, dur: number, hold: number) =>
  V({ type: 'sawtooth', f: E1, det: [-8, 8], t, dur, peak: 0.12, a: 0.003, hold, pre: 0.5, drive: 12, filters: [['lowpass', 900, 0.9]] });

// Elite only: a reversed swell while the cracked badge draws in, just before the drop.
export const sfxSuck = (t: number, dur: number) => N({ t, dur: dur * 0.9, peak: 0.3, swell: true, filters: [['highpass', 600, 0.7, 3000, dur * 0.9]], rev: 0.2 });

// A kick and a palm-muted chug per crack, an open power chord on the shatter, then a riff that
// grows with the Tier.
export const sfx = {
  crack(n: number, K: number, t: number) {
    const p = n / K;
    crunch(t, 5 + n * 3, 0.07, 0.6 + 0.5 * p);
    kick(t, 0.65 + 0.55 * p);
    gtr(t, E2, 0.1 + 0.12 * p, 0.65 + 0.45 * p, true);
  },
  impact(cfg: SoundConfig, t: number) {
    const L = cfg.lvl;
    kick(t, 1.3);
    snare(t, 1);
    crash(t, 0.8 + L * 0.1);
    gtr(t, E2, L === 1 ? 1.5 : 2.2, 1.2);
    if (L >= 4) subDrone(t, 2.4, 0.8);
  },
  payoff(cfg: SoundConfig, t: number) {
    const L = cfg.lvl, s = 0.09;
    if (L < 2) return;
    let tt = t + 0.85;
    const chug = (n: number) => {
      for (let i = 0; i < n; i++) {
        gtr(tt, E2, 0.075, 0.85, true);
        kick(tt, 0.7);
        tt += s;
      }
    };
    const hit = (f: number, dur: number) => {
      gtr(tt, f, dur, 1.05);
      snare(tt, 0.9);
      kick(tt, 1);
      tt += dur;
    };
    if (L === 2) {
      chug(2);
      hit(semi(E2, 3), 0.36);
      hit(E2, 1.3);
      return;
    }
    chug(3);
    hit(semi(E2, 3), 0.27);
    chug(3);
    hit(semi(E2, L >= 4 ? 6 : 5), 0.27);
    if (L >= 4) {
      chug(3);
      hit(semi(E2, 5), 0.27);
    }
    const fin = tt;
    hit(E2, 1.6);
    crash(fin, 1);
    if (L >= 4) {
      subDrone(fin, 1.8, 0.6);
      for (let i = 1; i < 12; i++) kick(fin + i * 0.06, 0.5);
    }
  },
  stamp(t: number) {
    kick(t, 1.1);
    snare(t, 1);
  },
  pip(i: number, t: number) {
    kick(t, 0.6 + i * 0.1);
  },
};
