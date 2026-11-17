export type EntityId = number & { readonly __brand: "EntityId" };
export type Tick = number & { readonly __brand: "Tick" };
export type Seq = number & { readonly __brand: "Seq" };

export function asEntityId(n: number): EntityId {
  return n as EntityId;
}

export function asTick(n: number): Tick {
  return n as Tick;
}

export function asSeq(n: number): Seq {
  return n as Seq;
}

export const Direction = {
  Up: 0,
  Right: 1,
  Down: 2,
  Left: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const TileType = {
  Empty: 0,
  Brick: 1,
  Steel: 2,
  Water: 3,
  Forest: 4,
  Base: 5,
  BaseDestroyed: 6,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const Team = {
  Player1: 0,
  Player2: 1,
  Enemy: 2,
} as const;
export type Team = (typeof Team)[keyof typeof Team];
export type PlayerTeam = typeof Team.Player1 | typeof Team.Player2;

export const PickupKind = {
  Shield: 0,
  RapidFire: 1,
  Repair: 2,
} as const;
export type PickupKind = (typeof PickupKind)[keyof typeof PickupKind];

export interface PlayerInput {
  readonly seq: Seq;
  readonly tick: Tick;
  readonly moveDir: Direction | null;
  readonly fire: boolean;
}

export type EntitySnapshot =
  | {
      readonly kind: "tank";
      readonly id: EntityId;
      readonly team: Team;
      readonly x: number;
      readonly y: number;
      readonly dir: Direction;
      readonly hp: number;
      readonly shield: boolean;
      readonly score: number;
    }
  | {
      readonly kind: "bullet";
      readonly id: EntityId;
      readonly team: Team;
      readonly x: number;
      readonly y: number;
      readonly dir: Direction;
    }
  | {
      readonly kind: "pickup";
      readonly id: EntityId;
      readonly pickupKind: PickupKind;
      readonly x: number;
      readonly y: number;
    };

export interface WorldSnapshot {
  readonly tick: Tick;
  readonly lastProcessedSeq: Seq;
  readonly baseAlive: boolean;
  readonly tiles: readonly number[];
  readonly entities: readonly EntitySnapshot[];
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
