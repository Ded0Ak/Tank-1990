import { GRID_SIZE } from "./arena.js";
import {
  asEntityId,
  asSeq,
  asTick,
  assertNever,
  Direction,
  type EntityId,
  type EntitySnapshot,
  type PickupKind,
  type PlayerInput,
  type Team,
  type WorldSnapshot,
} from "./types.js";

export type ClientMessage =
  | { readonly type: "join"; readonly room: string; readonly name: string }
  | { readonly type: "input"; readonly input: PlayerInput }
  | { readonly type: "ping"; readonly clientTime: number };

export type ServerMessage =
  | { readonly type: "welcome"; readonly playerId: EntityId; readonly team: Team; readonly room: string }
  | { readonly type: "roster"; readonly players: readonly { id: EntityId; name: string; team: Team }[] }
  | { readonly type: "pong"; readonly clientTime: number; readonly serverTime: number }
  | { readonly type: "snapshot"; readonly snapshot: WorldSnapshot }
  | { readonly type: "shutdown"; readonly reason: string };

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const type = obj["type"];

  if (type === "join") {
    const room = typeof obj["room"] === "string" ? obj["room"].trim().slice(0, 24) : "";
    const name = typeof obj["name"] === "string" ? obj["name"].trim().slice(0, 20) : "";
    if (!room || !name) return null;
    return { type: "join", room, name };
  }

  if (type === "input") {
    const inp = obj["input"];
    if (typeof inp !== "object" || inp === null) return null;
    const i = inp as Record<string, unknown>;
    const seq = i["seq"];
    const tick = i["tick"];
    const moveDir = i["moveDir"];
    const fire = i["fire"];

    if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return null;
    if (typeof tick !== "number" || !Number.isInteger(tick) || tick < 0) return null;
    if (
      moveDir !== null &&
      moveDir !== Direction.Up &&
      moveDir !== Direction.Right &&
      moveDir !== Direction.Down &&
      moveDir !== Direction.Left
    ) {
      return null;
    }
    if (typeof fire !== "boolean") return null;

    return {
      type: "input",
      input: {
        seq: asSeq(seq),
        tick: asTick(tick),
        moveDir,
        fire,
      },
    };
  }

  if (type === "ping") {
    const clientTime = obj["clientTime"];
    if (typeof clientTime !== "number" || !Number.isFinite(clientTime)) return null;
    return { type: "ping", clientTime };
  }

  return null;
}

const MAGIC = 0x54;
const VERSION = 1;
const PACKET_SNAPSHOT = 0x10;
const TILE_BYTES = Math.ceil((GRID_SIZE * GRID_SIZE) / 2);
const HEADER_BYTES = 12;
const ENTITY_STRIDE = 10;

export function encodeBinarySnapshot(snap: WorldSnapshot): ArrayBuffer {
  const count = Math.min(255, snap.entities.length);
  const totalBytes = HEADER_BYTES + TILE_BYTES + count * ENTITY_STRIDE;
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);

  view.setUint8(0, MAGIC);
  view.setUint8(1, VERSION);
  view.setUint8(2, PACKET_SNAPSHOT);
  view.setUint8(3, count);
  view.setUint32(4, snap.tick as number, true);
  view.setUint32(8, snap.lastProcessedSeq as number, true);

  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 2) {
    const lo = (snap.tiles[i] ?? 0) & 0x0f;
    const hi = (snap.tiles[i + 1] ?? 0) & 0x0f;
    view.setUint8(HEADER_BYTES + (i >> 1), lo | (hi << 4));
  }

  let offset = HEADER_BYTES + TILE_BYTES;
  for (let i = 0; i < count; i++) {
    const e = snap.entities[i];
    if (!e) continue;
    view.setUint16(offset, e.id as number, true);
    const baseBit = snap.baseAlive ? 1 << 5 : 0;

    if (e.kind === "tank") {
      view.setUint8(offset + 2, 1);
      const flags = (e.dir & 0x03) | ((e.team & 0x03) << 2) | (e.shield ? 1 << 4 : 0) | baseBit;
      view.setUint8(offset + 3, flags);
      view.setUint16(offset + 4, Math.max(0, Math.round(e.x * 10)), true);
      view.setUint16(offset + 6, Math.max(0, Math.round(e.y * 10)), true);
      view.setUint8(offset + 8, Math.max(0, Math.min(255, e.hp)));
      view.setUint8(offset + 9, Math.max(0, Math.min(255, Math.floor(e.score / 100))));
    } else if (e.kind === "bullet") {
      view.setUint8(offset + 2, 2);
      const flags = (e.dir & 0x03) | ((e.team & 0x03) << 2) | baseBit;
      view.setUint8(offset + 3, flags);
      view.setUint16(offset + 4, Math.max(0, Math.round(e.x * 10)), true);
      view.setUint16(offset + 6, Math.max(0, Math.round(e.y * 10)), true);
      view.setUint8(offset + 8, 1);
      view.setUint8(offset + 9, 0);
    } else if (e.kind === "pickup") {
      view.setUint8(offset + 2, 3);
      const flags = (e.pickupKind & 0x03) | baseBit;
      view.setUint8(offset + 3, flags);
      view.setUint16(offset + 4, Math.max(0, Math.round(e.x * 10)), true);
      view.setUint16(offset + 6, Math.max(0, Math.round(e.y * 10)), true);
      view.setUint8(offset + 8, 1);
      view.setUint8(offset + 9, 0);
    } else {
      assertNever(e);
    }
    offset += ENTITY_STRIDE;
  }

  return buf;
}

export function decodeBinarySnapshot(buf: ArrayBuffer): WorldSnapshot {
  if (buf.byteLength < HEADER_BYTES + TILE_BYTES) {
    throw new Error("Binary snapshot buffer too small");
  }
  const view = new DataView(buf);
  const magic = view.getUint8(0);
  const version = view.getUint8(1);
  const packetType = view.getUint8(2);
  if (magic !== MAGIC || version !== VERSION || packetType !== PACKET_SNAPSHOT) {
    throw new Error("Invalid binary snapshot header");
  }

  const count = view.getUint8(3);
  const expectedSize = HEADER_BYTES + TILE_BYTES + count * ENTITY_STRIDE;
  if (buf.byteLength < expectedSize) {
    throw new Error("Truncated binary snapshot");
  }

  const tick = asTick(view.getUint32(4, true));
  const lastProcessedSeq = asSeq(view.getUint32(8, true));

  const tiles: number[] = new Array(GRID_SIZE * GRID_SIZE);
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 2) {
    const packed = view.getUint8(HEADER_BYTES + (i >> 1));
    tiles[i] = packed & 0x0f;
    if (i + 1 < GRID_SIZE * GRID_SIZE) {
      tiles[i + 1] = (packed >> 4) & 0x0f;
    }
  }

  let baseAlive = true;
  const entities: EntitySnapshot[] = [];
  let offset = HEADER_BYTES + TILE_BYTES;

  for (let i = 0; i < count; i++) {
    const id = asEntityId(view.getUint16(offset, true));
    const kindCode = view.getUint8(offset + 2);
    const flags = view.getUint8(offset + 3);
    baseAlive = ((flags >> 5) & 1) === 1;
    const x = view.getUint16(offset + 4, true) / 10;
    const y = view.getUint16(offset + 6, true) / 10;
    const hp = view.getUint8(offset + 8);
    const score = view.getUint8(offset + 9) * 100;

    if (kindCode === 1) {
      entities.push({
        kind: "tank",
        id,
        dir: (flags & 0x03) as Direction,
        team: ((flags >> 2) & 0x03) as Team,
        shield: ((flags >> 4) & 1) === 1,
        x,
        y,
        hp,
        score,
      });
    } else if (kindCode === 2) {
      entities.push({
        kind: "bullet",
        id,
        dir: (flags & 0x03) as Direction,
        team: ((flags >> 2) & 0x03) as Team,
        x,
        y,
      });
    } else if (kindCode === 3) {
      entities.push({
        kind: "pickup",
        id,
        pickupKind: (flags & 0x03) as PickupKind,
        x,
        y,
      });
    }
    offset += ENTITY_STRIDE;
  }

  return {
    tick,
    lastProcessedSeq,
    baseAlive,
    tiles,
    entities,
  };
}
