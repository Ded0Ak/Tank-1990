import { describe, expect, it } from "vitest";
import {
  asSeq,
  asTick,
  decodeBinarySnapshot,
  Direction,
  encodeBinarySnapshot,
  parseClientMessage,
  Team,
  Vector2,
  World,
  type PlayerInput,
} from "../shared/src/index.js";
import { TokenBucket } from "../server/src/rateLimit.js";

describe("Tank 1990 Core", () => {
  it("Vector2 operations do not mutate source vector", () => {
    const a = new Vector2(10, 20);
    const b = a.add(new Vector2(5, -5));
    expect(a.x).toBe(10);
    expect(a.y).toBe(20);
    expect(b.x).toBe(15);
    expect(b.y).toBe(15);
  });

  it("World simulation is deterministic for identical seed and inputs", () => {
    const w1 = new World(42);
    const w2 = new World(42);
    const t1 = w1.spawnPlayerTank(Team.Player1);
    const t2 = w2.spawnPlayerTank(Team.Player1);

    for (let i = 1; i <= 120; i++) {
      const inp: PlayerInput = {
        seq: asSeq(i),
        tick: asTick(i),
        moveDir: i < 60 ? Direction.Up : Direction.Right,
        fire: i % 30 === 0,
      };
      w1.step(1 / 60, new Map([[t1.id, inp]]));
      w2.step(1 / 60, new Map([[t2.id, inp]]));
    }

    expect(w1.createSnapshot()).toEqual(w2.createSnapshot());
  });

  it("Binary snapshot codec round-trips WorldSnapshot cleanly", () => {
    const world = new World(1990);
    const p1 = world.spawnPlayerTank(Team.Player1);
    world.fireTank(p1);
    world.step(1 / 60, new Map());

    const snap = world.createSnapshot(asSeq(7));
    const binBuf = encodeBinarySnapshot(snap);
    const decoded = decodeBinarySnapshot(binBuf);

    expect(decoded.tick).toBe(snap.tick);
    expect(decoded.lastProcessedSeq).toBe(snap.lastProcessedSeq);
    expect(decoded.baseAlive).toBe(true);
    expect(decoded.entities.length).toBe(snap.entities.length);
  });

  it("parseClientMessage rejects malformed input payloads", () => {
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage({ type: "input", input: { seq: -1, tick: 1, moveDir: 0, fire: false } })).toBeNull();
    expect(parseClientMessage({ type: "join", room: "   ", name: "Bob" })).toBeNull();
  });

  it("TokenBucket rate limiter enforces burst limit", () => {
    const bucket = new TokenBucket(3, 10);
    expect(bucket.consume(1, 1000)).toBe(true);
    expect(bucket.consume(1, 1000)).toBe(true);
    expect(bucket.consume(1, 1000)).toBe(true);
    expect(bucket.consume(1, 1000)).toBe(false);
    expect(bucket.consume(1, 1200)).toBe(true);
  });
});
