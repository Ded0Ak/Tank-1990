import type { SimEvent } from "@tank1990/shared";

export class GameEventBus extends EventTarget {
  emitSimEvent(event: SimEvent): void {
    this.dispatchEvent(new CustomEvent<SimEvent>("sim", { detail: event }));
  }

  onSimEvent(handler: (event: SimEvent) => void): () => void {
    const listener = (e: Event) => {
      handler((e as CustomEvent<SimEvent>).detail);
    };
    this.addEventListener("sim", listener);
    return () => this.removeEventListener("sim", listener);
  }
}
