/**
 * AudioManager — lightweight UI/feedback tones (V1.9 §24).
 *
 * No audio files at all: every sound is a short synthesized tone via the Web
 * Audio API, so there is zero licensing risk (spec's own "반드시 원본/라이선스
 * 안전한 사운드만 사용" — a locally-generated oscillator has no license to
 * worry about) and zero asset loading cost. Nothing here is persisted —
 * SaveData never stores audio runtime (spec §29).
 *
 * Autoplay-safe (spec §24): the AudioContext is created lazily and only
 * resumed after the first real user gesture, via unlock(), which Game wires
 * to the canvas's first pointerdown. Every play call is wrapped so a browser
 * that refuses/throws on audio never takes the game down with it — stability
 * over the feature, per the spec's own instruction.
 */
export type NoticeTone = "critical" | "warning" | "important" | "success" | "info";

export class AudioManager {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  /** One-shot guard so unlock() only ever wires/resumes once. */
  private unlocking = false;

  /** Call once on the first pointerdown/touchstart (spec §24's autoplay rule). */
  unlock(): void {
    if (this.unlocked || this.unlocking) return;
    this.unlocking = true;
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.unlocked = true;
    } catch {
      // Web Audio unavailable/blocked — the game plays on silently.
      this.ctx = null;
    }
  }

  playClick(): void {
    this.tone(880, 0.03, 0.05, "square");
  }

  playConstruction(): void {
    this.tone(440, 0.05, 0.09, "triangle");
    this.tone(660, 0.06, 0.07, "triangle", 0.05);
  }

  playTakeoff(): void {
    this.sweep(220, 660, 0.35, 0.08);
  }

  playLanding(): void {
    this.sweep(520, 260, 0.3, 0.07);
  }

  /** One tone per notice priority tier (spec §25) — never for every frame a
   * condition stays true, only when Game actually calls showNotice(). */
  playNotice(tone: NoticeTone): void {
    switch (tone) {
      case "critical":
        this.tone(200, 0.09, 0.09, "sawtooth");
        this.tone(160, 0.12, 0.08, "sawtooth", 0.09);
        break;
      case "warning":
        this.tone(320, 0.08, 0.07, "square");
        break;
      case "important":
        this.tone(520, 0.07, 0.07, "triangle");
        this.tone(780, 0.07, 0.06, "triangle", 0.06);
        break;
      case "success":
        this.tone(660, 0.06, 0.06, "sine");
        this.tone(880, 0.08, 0.06, "sine", 0.05);
        break;
      case "info":
        this.tone(520, 0.05, 0.04, "sine");
        break;
    }
  }

  // --------------------------------------------------------------- internals

  private tone(
    freq: number,
    duration: number,
    gain: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const start = ctx.currentTime + delay;
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(gain, start + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch {
      // Never let a synthesis error interrupt gameplay.
    }
  }

  private sweep(fromFreq: number, toFreq: number, duration: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "triangle";
      const start = ctx.currentTime;
      osc.frequency.setValueAtTime(fromFreq, start);
      osc.frequency.linearRampToValueAtTime(toFreq, start + duration);
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(gain, start + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch {
      // Never let a synthesis error interrupt gameplay.
    }
  }
}
