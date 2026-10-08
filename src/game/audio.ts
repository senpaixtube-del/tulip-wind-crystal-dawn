type Bus = { ctx: AudioContext; master: GainNode; music: GainNode; sfx: GainNode };

function curve(v: number) {
  return v * v;
}

export class GameAudio {
  private bus: Bus | null = null;
  private musicTimer = 0;
  private musicOsc: OscillatorNode[] = [];
  private unlocked = false;
  master = 0.7;
  music = 0.35;
  sfx = 0.8;
  muted = false;

  unlock = () => {
    if (this.unlocked && this.bus?.ctx.state === "running") return;
    const ctx = this.bus?.ctx ?? new AudioContext({ latencyHint: "interactive" });
    if (!this.bus) {
      const master = ctx.createGain();
      const music = ctx.createGain();
      const sfx = ctx.createGain();
      music.connect(master);
      sfx.connect(master);
      master.connect(ctx.destination);
      this.bus = { ctx, master, music, sfx };
    }
    if (ctx.state === "suspended") void ctx.resume();
    this.apply();
    this.unlocked = true;
  };

  setVolumes(master: number, music: number, sfx: number) {
    this.master = master;
    this.music = music;
    this.sfx = sfx;
    this.apply();
  }

  private apply() {
    if (!this.bus) return;
    const t = this.bus.ctx.currentTime;
    const m = this.muted ? 0 : curve(this.master);
    this.bus.master.gain.setTargetAtTime(m, t, 0.03);
    this.bus.music.gain.setTargetAtTime(curve(this.music) * 0.22, t, 0.03);
    this.bus.sfx.gain.setTargetAtTime(curve(this.sfx), t, 0.03);
  }

  resume() {
    if (this.bus?.ctx.state === "suspended") void this.bus.ctx.resume();
  }

  tone(freq: number, dur: number, type: OscillatorType, gain: number, dest: "sfx" | "music" = "sfx") {
    if (!this.bus) return;
    const { ctx } = this.bus;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(dest === "music" ? this.bus.music : this.bus.sfx);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  pickup() {
    this.tone(720 + Math.random() * 80, 0.09, "sine", 0.08);
    this.tone(1080, 0.12, "triangle", 0.04);
  }

  boost() {
    this.tone(180, 0.16, "sawtooth", 0.05);
  }

  shield() {
    this.tone(420, 0.22, "triangle", 0.07);
    this.tone(840, 0.18, "sine", 0.04);
  }

  magnet() {
    this.tone(260, 0.2, "square", 0.03);
  }

  kill() {
    this.tone(90, 0.35, "sawtooth", 0.09);
    this.tone(220, 0.2, "triangle", 0.05);
  }

  death() {
    this.tone(70, 0.55, "sine", 0.1);
    this.tone(140, 0.4, "sawtooth", 0.05);
  }

  click() {
    this.tone(880, 0.05, "square", 0.04);
  }

  startMatch() {
    this.tone(392, 0.18, "triangle", 0.08);
    this.tone(523, 0.22, "triangle", 0.07);
    this.tone(659, 0.28, "sine", 0.06);
  }

  victory() {
    this.tone(523, 0.2, "triangle", 0.08);
    this.tone(659, 0.24, "triangle", 0.07);
    this.tone(784, 0.4, "sine", 0.06);
  }

  tickMusic(dt: number, intense: boolean) {
    if (!this.bus || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = intense ? 0.42 : 0.85;
    const base = intense ? 98 : 82;
    const notes = [0, 3, 5, 7, 10];
    const n = notes[Math.floor(Math.random() * notes.length)]!;
    this.tone(base * Math.pow(2, n / 12), intense ? 0.38 : 0.7, "sine", 0.045, "music");
    this.tone(base * 2 * Math.pow(2, n / 12), 0.3, "triangle", 0.02, "music");
  }

  dispose() {
    for (const o of this.musicOsc) o.stop();
    this.musicOsc = [];
    void this.bus?.ctx.close();
    this.bus = null;
  }
}
