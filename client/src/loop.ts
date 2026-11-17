export interface LoopCallbacks {
  step: (dt: number) => void;
  render: (alpha: number) => void;
}

export function createLoop({ step, render }: LoopCallbacks, fixedStep = 1 / 60) {
  let rafId = 0;
  let running = false;
  let accumulator = 0;
  let lastTime = 0;

  function frame(now: number): void {
    if (!running) return;
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;

    const dt = Math.min(Math.max(0, rawDt), 0.25);
    accumulator += dt;

    while (accumulator >= fixedStep) {
      step(fixedStep);
      accumulator -= fixedStep;
    }

    render(accumulator / fixedStep);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}
