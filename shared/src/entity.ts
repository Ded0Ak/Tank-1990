import { Vector2 } from "./vector.js";
import {
  asEntityId,
  Direction,
  PickupKind,
  Team,
  type EntityId,
  type EntitySnapshot,
} from "./types.js";

export abstract class Entity {
  readonly id: EntityId;
  pos: Vector2;
  dir: Direction;
  radius: number;
  alive = true;

  constructor(id: EntityId, pos: Vector2, dir: Direction, radius: number) {
    this.id = id;
    this.pos = pos;
    this.dir = dir;
    this.radius = radius;
  }

  abstract toSnapshot(): EntitySnapshot;
}

export class Tank extends Entity {
  readonly team: Team;
  readonly spawnPos: Vector2;
  #hp: number;
  maxHp: number;
  cooldown = 0;
  shieldTimer = 0;
  rapidFireTimer = 0;
  respawnTimer = 0;
  score = 0;
  moveDir: Direction | null = null;

  constructor(id: EntityId, team: Team, spawnPos: Vector2, dir: Direction, maxHp = 2) {
    super(id, spawnPos, dir, 12);
    this.team = team;
    this.spawnPos = spawnPos;
    this.maxHp = maxHp;
    this.#hp = maxHp;
  }

  get hp(): number {
    return this.#hp;
  }

  setHpFromSnapshot(hp: number): void {
    this.#hp = hp;
    this.alive = hp > 0;
  }

  damage(amount: number): boolean {
    if (this.shieldTimer > 0 || !this.alive) return false;
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) {
      this.alive = false;
      this.respawnTimer = 2.5;
      return true;
    }
    return false;
  }

  heal(amount: number): void {
    this.#hp = Math.min(this.maxHp, this.#hp + amount);
  }

  respawn(): void {
    this.pos = this.spawnPos;
    this.dir = this.team === Team.Enemy ? Direction.Down : Direction.Up;
    this.#hp = this.maxHp;
    this.alive = true;
    this.shieldTimer = 2.5;
    this.cooldown = 0;
  }

  toSnapshot(): EntitySnapshot {
    return {
      kind: "tank",
      id: this.id,
      team: this.team,
      x: this.pos.x,
      y: this.pos.y,
      dir: this.dir,
      hp: this.#hp,
      shield: this.shieldTimer > 0,
      score: this.score,
    };
  }
}

export class Bullet extends Entity {
  ownerId: EntityId;
  team: Team;
  ttl: number;

  constructor(
    id: EntityId,
    ownerId: EntityId,
    team: Team,
    pos: Vector2,
    dir: Direction,
    ttl = 2.2
  ) {
    super(id, pos, dir, 3.5);
    this.ownerId = ownerId;
    this.team = team;
    this.ttl = ttl;
  }

  toSnapshot(): EntitySnapshot {
    return {
      kind: "bullet",
      id: this.id,
      team: this.team,
      x: this.pos.x,
      y: this.pos.y,
      dir: this.dir,
    };
  }
}

export class Pickup extends Entity {
  readonly pickupKind: PickupKind;
  ttl = 14;

  constructor(id: EntityId, pickupKind: PickupKind, pos: Vector2) {
    super(id, pos, Direction.Up, 11);
    this.pickupKind = pickupKind;
  }

  toSnapshot(): EntitySnapshot {
    return {
      kind: "pickup",
      id: this.id,
      pickupKind: this.pickupKind,
      x: this.pos.x,
      y: this.pos.y,
    };
  }
}

export function createEntityIdFactory(start = 1): () => EntityId {
  let next = start;
  return () => asEntityId(next++);
}
