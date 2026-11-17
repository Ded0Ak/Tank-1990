import { assertNever, type SimEvent } from "@tank1990/shared";
import type { GameEventBus } from "./bus.js";

export class RetroAudio {
  #ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (!this.#ctx) {
      this.#ctx = new AudioContext();
    }
    if (this.#ctx.state === "suspended") {
      void this.#ctx.resume();
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  attach(bus: GameEventBus): () => void {
    return bus.onSimEvent((ev) => this.playEvent(ev));
  }

  playEvent(ev: SimEvent): void {
    if (this.muted || !this.#ctx || this.#ctx.state !== "running") return;

    switch (ev.type) {
      case "fired":
        this.#tone(520, 140, 0.08, "square", 0.07);
        break;
      case "brickHit":
        this.#tone(220, 90, 0.07, "triangle", 0.09);
        break;
      case "steelHit":
        this.#tone(980, 740, 0.06, "sine", 0.06);
        break;
      case "tankHit":
        this.#tone(300, 120, 0.12, "sawtooth", 0.09);
        break;
      case "exploded":
        this.#tone(140, 38, ev.big ? 0.35 : 0.18, "sawtooth", 0.15);
        break;
      case "pickup":
        this.#tone(440, 880, 0.16, "square", 0.08);
        break;
      case "baseDestroyed":
        this.#tone(180, 30, 0.65, "sawtooth", 0.2);
        break;
      default:
        assertNever(ev);
    }
  }

  #tone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    gainVal: number
  ): void {
    if (!this.#ctx) return;
    const now = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + durationSec);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.#ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec);
  }
}
