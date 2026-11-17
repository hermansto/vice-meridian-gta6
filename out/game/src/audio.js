// Sound is synthesised, not loaded: an engine that follows the car's speed, a siren that pans with
// the nearest patrol, a shot, a pickup chime. Nothing here fetches a file, and a browser that blocks
// audio until the first click is handled by resuming on demand.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.siren = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { this.enabled = false; return; }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.ctx.destination);

    // Engine: two detuned saws through a lowpass, gain driven by speed.
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(this.master);
    const a = this.ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 42;
    const b = this.ctx.createOscillator();
    b.type = 'square';
    b.frequency.value = 61;
    a.connect(filter);
    b.connect(filter);
    a.start();
    b.start();
    this.engine = { a, b, gain, filter };

    // Siren: a triangle whose pitch slides, muted until a patrol is close.
    const sirenGain = this.ctx.createGain();
    sirenGain.gain.value = 0;
    sirenGain.connect(this.master);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    osc.connect(sirenGain);
    osc.start();
    this.siren = { osc, gain: sirenGain };
  }

  updateEngine(speed, driving) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const ratio = Math.min(1, Math.abs(speed) / 430);
    this.engine.gain.gain.setTargetAtTime(driving ? 0.12 + ratio * 0.2 : 0, t, 0.08);
    this.engine.a.frequency.setTargetAtTime(38 + ratio * 95, t, 0.1);
    this.engine.b.frequency.setTargetAtTime(56 + ratio * 130, t, 0.1);
    this.engine.filter.frequency.setTargetAtTime(320 + ratio * 900, t, 0.1);
  }

  updateSiren(active, distance) {
    if (!this.ctx || !this.siren) return;
    const t = this.ctx.currentTime;
    const near = Math.max(0, 1 - distance / 1400);
    this.siren.gain.gain.setTargetAtTime(active ? 0.05 + near * 0.09 : 0, t, 0.15);
    if (active) this.siren.osc.frequency.setTargetAtTime(620 + Math.sin(t * 5) * 260, t, 0.05);
  }

  shot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, 2048, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    noise.connect(gain).connect(this.master);
    noise.start(t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  }

  chime(up = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = up ? 660 : 330;
    gain.gain.value = 0.18;
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.frequency.exponentialRampToValueAtTime(up ? 990 : 220, t + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.stop(t + 0.32);
  }
}
