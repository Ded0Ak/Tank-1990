import { Arena, ARENA_PX, TILE_SIZE } from "./arena.js";
import { Bullet, createEntityIdFactory, Pickup, Tank, type Entity } from "./entity.js";
import { createPrng } from "./prng.js";
import {
  asSeq,
  asTick,
  Direction,
  PickupKind,
  Team,
  TileType,
  type EntityId,
  type PlayerInput,
  type PlayerTeam,
  type Seq,
  type Tick,
  type WorldSnapshot,
} from "./types.js";
import { Vector2 } from "./vector.js";

export type SimEvent =
  | { readonly type: "fired"; readonly tankId: EntityId; readonly team: Team }
  | { readonly type: "brickHit"; readonly gx: number; readonly gy: number }
  | { readonly type: "steelHit"; readonly x: number; readonly y: number }
  | { readonly type: "tankHit"; readonly tankId: EntityId; readonly x: number; readonly y: number }
  | { readonly type: "exploded"; readonly x: number; readonly y: number; readonly big: boolean }
  | { readonly type: "pickup"; readonly tankId: EntityId; readonly kind: PickupKind }
  | { readonly type: "baseDestroyed" };

const DIR_VECTORS: Record<Direction, Vector2> = {
  [Direction.Up]: new Vector2(0, -1),
  [Direction.Right]: new Vector2(1, 0),
  [Direction.Down]: new Vector2(0, 1),
  [Direction.Left]: new Vector2(-1, 0),
};

const TANK_SPEED = 96;
const BULLET_SPEED = 240;

export class World {
  readonly arena: Arena;
  readonly #entities = new Map<EntityId, Entity>();
  readonly #nextId = createEntityIdFactory(1);
  readonly #rand: () => number;
  tick: Tick = asTick(0);
  events: SimEvent[] = [];
  #botSpawnTimer = 1.0;

  constructor(seed = 1990, stageIndex = 0) {
    this.arena = new Arena(stageIndex);
    this.#rand = createPrng(seed);
  }

  *[Symbol.iterator](): IterableIterator<Entity> {
    yield* this.#entities.values();
  }

  *ofKind<T extends Entity>(ctor: abstract new (...args: never[]) => T): IterableIterator<T> {
    for (const entity of this.#entities.values()) {
      if (entity instanceof ctor && entity.alive) {
        yield entity;
      }
    }
  }

  getEntity(id: EntityId): Entity | undefined {
    return this.#entities.get(id);
  }

  spawnPlayerTank(team: PlayerTeam): Tank {
    const spawnPos =
      team === Team.Player1
        ? new Vector2(4 * TILE_SIZE + 16, 12 * TILE_SIZE + 16)
        : new Vector2(8 * TILE_SIZE + 16, 12 * TILE_SIZE + 16);
    const tank = new Tank(this.#nextId(), team, spawnPos, Direction.Up, 3);
    tank.shieldTimer = 3.0;
    this.#entities.set(tank.id, tank);
    return tank;
  }

  spawnEnemyBot(slotIndex: number): Tank {
    const slots = [
      new Vector2(0 * TILE_SIZE + 16, 0 * TILE_SIZE + 16),
      new Vector2(6 * TILE_SIZE + 16, 0 * TILE_SIZE + 16),
      new Vector2(12 * TILE_SIZE + 16, 0 * TILE_SIZE + 16),
    ];
    const spawnPos = slots[slotIndex % slots.length] ?? new Vector2(16, 16);
    const bot = new Tank(this.#nextId(), Team.Enemy, spawnPos, Direction.Down, 1);
    this.#entities.set(bot.id, bot);
    return bot;
  }

  removeEntity(id: EntityId): void {
    this.#entities.delete(id);
  }

  fireTank(tank: Tank): Bullet | null {
    if (!tank.alive || tank.cooldown > 0) return null;
    const dirVec = DIR_VECTORS[tank.dir];
    const muzzle = tank.pos.add(dirVec.scale(tank.radius + 5));
    const bullet = new Bullet(this.#nextId(), tank.id, tank.team, muzzle, tank.dir);
    this.#entities.set(bullet.id, bullet);
    tank.cooldown = tank.rapidFireTimer > 0 ? 0.22 : 0.45;
    this.events.push({ type: "fired", tankId: tank.id, team: tank.team });
    return bullet;
  }

  step(dt: number, playerInputs: ReadonlyMap<EntityId, PlayerInput>): void {
    this.tick = asTick((this.tick as number) + 1);
    this.events = [];

    let enemyCount = 0;
    for (const t of this.ofKind(Tank)) {
      if (t.team === Team.Enemy) enemyCount++;
    }
    if (enemyCount < 4) {
      this.#botSpawnTimer -= dt;
      if (this.#botSpawnTimer <= 0) {
        const slot = Math.floor(this.#rand() * 3);
        const bot = this.spawnEnemyBot(slot);
        for (const other of this.ofKind(Tank)) {
          if (other.id !== bot.id && other.pos.distanceTo(bot.pos) < 26) {
            this.#entities.delete(bot.id);
            break;
          }
        }
        this.#botSpawnTimer = 2.8;
      }
    }

    for (const entity of this.#entities.values()) {
      if (!(entity instanceof Tank)) continue;

      if (!entity.alive) {
        if (entity.team === Team.Enemy) {
          this.#entities.delete(entity.id);
          continue;
        }
        entity.respawnTimer -= dt;
        if (entity.respawnTimer <= 0 && this.arena.isBaseAlive()) {
          entity.respawn();
        }
        continue;
      }

      entity.cooldown = Math.max(0, entity.cooldown - dt);
      entity.shieldTimer = Math.max(0, entity.shieldTimer - dt);
      entity.rapidFireTimer = Math.max(0, entity.rapidFireTimer - dt);

      let moveDir: Direction | null = null;
      let wantsFire = false;

      if (entity.team === Team.Enemy) {
        const ai = this.#computeBotInput(entity);
        moveDir = ai.moveDir;
        wantsFire = ai.fire;
      } else {
        const inp = playerInputs.get(entity.id);
        if (inp) {
          moveDir = inp.moveDir;
          wantsFire = inp.fire;
        }
      }

      entity.moveDir = moveDir;
      if (moveDir !== null) {
        this.#moveTank(entity, moveDir, dt);
      }
      if (wantsFire) {
        this.fireTank(entity);
      }
    }

    for (const bullet of this.ofKind(Bullet)) {
      bullet.ttl -= dt;
      if (bullet.ttl <= 0) {
        bullet.alive = false;
        continue;
      }

      const delta = DIR_VECTORS[bullet.dir].scale(BULLET_SPEED * dt);
      bullet.pos = bullet.pos.add(delta);

      if (
        bullet.pos.x < 0 ||
        bullet.pos.y < 0 ||
        bullet.pos.x > ARENA_PX ||
        bullet.pos.y > ARENA_PX
      ) {
        bullet.alive = false;
        this.events.push({ type: "steelHit", x: bullet.pos.x, y: bullet.pos.y });
        continue;
      }

      const gx = Math.floor(bullet.pos.x / TILE_SIZE);
      const gy = Math.floor(bullet.pos.y / TILE_SIZE);
      const tile = this.arena.getTile(gx, gy);

      if (tile === TileType.Brick) {
        this.arena.setTile(gx, gy, TileType.Empty);
        bullet.alive = false;
        this.events.push({ type: "brickHit", gx, gy });
        continue;
      }
      if (tile === TileType.Steel) {
        bullet.alive = false;
        this.events.push({ type: "steelHit", x: bullet.pos.x, y: bullet.pos.y });
        continue;
      }
      if (tile === TileType.Base) {
        this.arena.setTile(gx, gy, TileType.BaseDestroyed);
        bullet.alive = false;
        this.events.push({ type: "baseDestroyed" });
        this.events.push({ type: "exploded", x: bullet.pos.x, y: bullet.pos.y, big: true });
        continue;
      }

      for (const otherBullet of this.ofKind(Bullet)) {
        if (
          otherBullet.id !== bullet.id &&
          otherBullet.team !== bullet.team &&
          bullet.pos.distanceTo(otherBullet.pos) < bullet.radius + otherBullet.radius + 2
        ) {
          bullet.alive = false;
          otherBullet.alive = false;
          this.events.push({ type: "steelHit", x: bullet.pos.x, y: bullet.pos.y });
          break;
        }
      }
      if (!bullet.alive) continue;

      for (const tank of this.ofKind(Tank)) {
        if (tank.id === bullet.ownerId) continue;
        const sameFaction =
          (tank.team === Team.Enemy && bullet.team === Team.Enemy) ||
          (tank.team !== Team.Enemy && bullet.team !== Team.Enemy);
        if (sameFaction) continue;

        if (bullet.pos.distanceTo(tank.pos) < bullet.radius + tank.radius) {
          bullet.alive = false;
          const killed = tank.damage(1);
          if (killed) {
            const shooter = this.getEntity(bullet.ownerId);
            if (shooter instanceof Tank) {
              shooter.score += 100;
            }
            this.events.push({ type: "exploded", x: tank.pos.x, y: tank.pos.y, big: true });
            if (tank.team === Team.Enemy && this.#rand() < 0.35) {
              const kinds = [PickupKind.Shield, PickupKind.RapidFire, PickupKind.Repair] as const;
              const pick = kinds[Math.floor(this.#rand() * kinds.length)] ?? PickupKind.Shield;
              const pickup = new Pickup(this.#nextId(), pick, tank.pos);
              this.#entities.set(pickup.id, pickup);
            }
          } else {
            this.events.push({ type: "tankHit", tankId: tank.id, x: tank.pos.x, y: tank.pos.y });
          }
          break;
        }
      }
    }

    for (const pickup of this.ofKind(Pickup)) {
      pickup.ttl -= dt;
      if (pickup.ttl <= 0) {
        pickup.alive = false;
        continue;
      }
      for (const tank of this.ofKind(Tank)) {
        if (tank.team === Team.Enemy) continue;
        if (tank.pos.distanceTo(pickup.pos) < tank.radius + pickup.radius) {
          pickup.alive = false;
          if (pickup.pickupKind === PickupKind.Shield) tank.shieldTimer = 7.0;
          if (pickup.pickupKind === PickupKind.RapidFire) tank.rapidFireTimer = 8.0;
          if (pickup.pickupKind === PickupKind.Repair) tank.heal(1);
          this.events.push({ type: "pickup", tankId: tank.id, kind: pickup.pickupKind });
          break;
        }
      }
    }

    for (const [id, entity] of this.#entities.entries()) {
      if (!entity.alive && !(entity instanceof Tank && entity.team !== Team.Enemy)) {
        this.#entities.delete(id);
      }
    }
  }

  #moveTank(tank: Tank, dir: Direction, dt: number): void {
    if (tank.dir !== dir) {
      const turningHorizontal = dir === Direction.Left || dir === Direction.Right;
      if (turningHorizontal) {
        const snappedY = Math.round((tank.pos.y - 16) / 16) * 16 + 16;
        if (Math.abs(snappedY - tank.pos.y) <= 7) {
          tank.pos = new Vector2(tank.pos.x, snappedY);
        }
      } else {
        const snappedX = Math.round((tank.pos.x - 16) / 16) * 16 + 16;
        if (Math.abs(snappedX - tank.pos.x) <= 7) {
          tank.pos = new Vector2(snappedX, tank.pos.y);
        }
      }
      tank.dir = dir;
    }

    const stepVec = DIR_VECTORS[dir].scale(TANK_SPEED * dt);
    const candidate = tank.pos.add(stepVec);

    if (this.arena.collidesTank(candidate.x, candidate.y, tank.radius)) {
      return;
    }

    for (const other of this.ofKind(Tank)) {
      if (other.id !== tank.id && candidate.distanceTo(other.pos) < tank.radius + other.radius - 1) {
        return;
      }
    }

    tank.pos = candidate;
  }

  #computeBotInput(bot: Tank): { moveDir: Direction; fire: boolean } {
    const changeRoll = this.#rand();
    let dir = bot.dir;
    if (changeRoll < 0.035) {
      if (this.#rand() < 0.45) {
        dir = Direction.Down;
      } else {
        const dirs = [Direction.Up, Direction.Right, Direction.Down, Direction.Left] as const;
        dir = dirs[Math.floor(this.#rand() * dirs.length)] ?? Direction.Down;
      }
    }
    return {
      moveDir: dir,
      fire: this.#rand() < 0.045,
    };
  }

  createSnapshot(lastProcessedSeq: Seq = asSeq(0)): WorldSnapshot {
    const entities = [];
    for (const entity of this.#entities.values()) {
      if (entity.alive) {
        entities.push(entity.toSnapshot());
      }
    }
    return {
      tick: this.tick,
      lastProcessedSeq,
      baseAlive: this.arena.isBaseAlive(),
      tiles: this.arena.tiles.slice(),
      entities,
    };
  }

  applySnapshot(snap: WorldSnapshot): void {
    this.tick = snap.tick;
    for (let i = 0; i < snap.tiles.length && i < this.arena.tiles.length; i++) {
      this.arena.tiles[i] = (snap.tiles[i] ?? TileType.Empty) as TileType;
    }
    const seen = new Set<EntityId>();
    for (const es of snap.entities) {
      seen.add(es.id);
      const existing = this.#entities.get(es.id);
      if (es.kind === "tank") {
        if (existing instanceof Tank) {
          existing.pos = new Vector2(es.x, es.y);
          existing.dir = es.dir;
          existing.setHpFromSnapshot(es.hp);
          existing.shieldTimer = es.shield ? 1.0 : 0;
          existing.score = es.score;
        } else {
          const t = new Tank(es.id, es.team, new Vector2(es.x, es.y), es.dir, 3);
          t.setHpFromSnapshot(es.hp);
          t.shieldTimer = es.shield ? 1.0 : 0;
          t.score = es.score;
          this.#entities.set(es.id, t);
        }
      } else if (es.kind === "bullet") {
        if (existing instanceof Bullet) {
          existing.pos = new Vector2(es.x, es.y);
          existing.dir = es.dir;
        } else {
          const b = new Bullet(es.id, es.id, es.team, new Vector2(es.x, es.y), es.dir);
          this.#entities.set(es.id, b);
        }
      } else if (es.kind === "pickup") {
        if (existing instanceof Pickup) {
          existing.pos = new Vector2(es.x, es.y);
        } else {
          const p = new Pickup(es.id, es.pickupKind, new Vector2(es.x, es.y));
          this.#entities.set(es.id, p);
        }
      }
    }
    for (const id of this.#entities.keys()) {
      if (!seen.has(id)) {
        this.#entities.delete(id);
      }
    }
  }
}
