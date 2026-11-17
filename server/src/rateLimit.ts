export class TokenBucket {
  #tokens: number;
  readonly #capacity: number;
  readonly #refillPerSec: number;
  #lastRefill: number;

  constructor(capacity = 90, refillPerSec = 60) {
    this.#capacity = capacity;
    this.#tokens = capacity;
    this.#refillPerSec = refillPerSec;
    this.#lastRefill = performance.now();
  }

  consume(cost = 1, now = performance.now()): boolean {
    const elapsedSec = Math.max(0, (now - this.#lastRefill) / 1000);
    this.#tokens = Math.min(this.#capacity, this.#tokens + elapsedSec * this.#refillPerSec);
    this.#lastRefill = now;

    if (this.#tokens >= cost) {
      this.#tokens -= cost;
      return true;
    }
    return false;
  }
}
