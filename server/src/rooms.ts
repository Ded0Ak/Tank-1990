import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import {
  asSeq,
  encodeBinarySnapshot,
  Team,
  World,
  type EntityId,
  type PlayerInput,
  type PlayerTeam,
  type Seq,
  type ServerMessage,
} from "@tank1990/shared";
import { MatchLogger } from "./log/matchlog.js";

export interface ConnectedPlayer {
  readonly id: EntityId;
  readonly name: string;
  readonly team: PlayerTeam;
  readonly socket: WebSocket;
  lastProcessedSeq: Seq;
  latestInput: PlayerInput | null;
}

const TICK_RATE = 30;
const TICK_MS = 1000 / TICK_RATE;
const STEP_SEC = 1 / TICK_RATE;

export class Room extends EventEmitter {
  readonly id: string;
  readonly world: World;
  readonly players = new Map<WebSocket, ConnectedPlayer>();
  readonly #logger: MatchLogger;
  #running = false;
  #timer: NodeJS.Timeout | null = null;
  #nextTickAt = 0;

  constructor(id: string, logDir: string) {
    super();
    this.id = id;
    this.world = new World(1990);
    this.#logger = new MatchLogger(logDir, id);
    this.#startLoop();
  }

  #startLoop(): void {
    this.#running = true;
    this.#nextTickAt = performance.now() + TICK_MS;

    const tick = () => {
      if (!this.#running) return;
      this.#stepSimulation();
      this.#nextTickAt += TICK_MS;
      const delay = Math.max(1, this.#nextTickAt - performance.now());
      this.#timer = setTimeout(tick, delay);
    };

    this.#timer = setTimeout(tick, TICK_MS);
  }

  #stepSimulation(): void {
    const inputs = new Map<EntityId, PlayerInput>();
    for (const player of this.players.values()) {
      if (player.latestInput) {
        inputs.set(player.id, player.latestInput);
        player.lastProcessedSeq = player.latestInput.seq;
      }
    }

    this.world.step(STEP_SEC, inputs);

    for (const ev of this.world.events) {
      this.#logger.write({ t: Date.now(), room: this.id, type: ev.type, payload: ev });
    }

    for (const player of this.players.values()) {
      if (player.socket.readyState === player.socket.OPEN && player.socket.bufferedAmount < 65536) {
        const snap = this.world.createSnapshot(player.lastProcessedSeq);
        const bin = encodeBinarySnapshot(snap);
        player.socket.send(bin, { binary: true });
      }
    }
  }

  addPlayer(socket: WebSocket, name: string): ConnectedPlayer {
    const hasP1 = [...this.players.values()].some((p) => p.team === Team.Player1);
    const team: PlayerTeam = hasP1 ? Team.Player2 : Team.Player1;
    const tank = this.world.spawnPlayerTank(team);

    const player: ConnectedPlayer = {
      id: tank.id,
      name,
      team,
      socket,
      lastProcessedSeq: asSeq(0),
      latestInput: null,
    };

    this.players.set(socket, player);
    this.#logger.write({ t: Date.now(), room: this.id, type: "player.joined", payload: { id: tank.id, name, team } });

    this.sendJson(socket, { type: "welcome", playerId: tank.id, team, room: this.id });
    this.broadcastRoster();
    return player;
  }

  removePlayer(socket: WebSocket): void {
    const player = this.players.get(socket);
    if (!player) return;
    this.players.delete(socket);
    this.world.removeEntity(player.id);
    this.#logger.write({ t: Date.now(), room: this.id, type: "player.left", payload: { id: player.id } });
    this.broadcastRoster();

    if (this.players.size === 0) {
      this.emit("empty", this.id);
    }
  }

  handleInput(socket: WebSocket, input: PlayerInput): void {
    const player = this.players.get(socket);
    if (!player) return;
    if ((input.seq as number) >= (player.lastProcessedSeq as number)) {
      player.latestInput = input;
    }
  }

  broadcastRoster(): void {
    const roster = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
    }));
    const msg: ServerMessage = { type: "roster", players: roster };
    for (const p of this.players.values()) {
      this.sendJson(p.socket, msg);
    }
  }

  sendJson(socket: WebSocket, msg: ServerMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  async destroy(): Promise<void> {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
    await this.#logger.close();
  }
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  readonly #logDir: string;
  readonly #maxRooms: number;

  constructor(logDir: string, maxRooms: number) {
    this.#logDir = logDir;
    this.#maxRooms = maxRooms;
  }

  getOrCreate(roomId: string): Room | null {
    let room = this.rooms.get(roomId);
    if (!room) {
      if (this.rooms.size >= this.#maxRooms) return null;
      room = new Room(roomId, this.#logDir);
      room.once("empty", (id: string) => {
        const target = this.rooms.get(id);
        if (target) {
          this.rooms.delete(id);
          void target.destroy();
        }
      });
      this.rooms.set(roomId, room);
    }
    return room;
  }

  listRooms(): { id: string; players: number }[] {
    return [...this.rooms.values()].map((r) => ({ id: r.id, players: r.players.size }));
  }

  async closeAll(): Promise<void> {
    const tasks = [...this.rooms.values()].map((r) => r.destroy());
    this.rooms.clear();
    await Promise.all(tasks);
  }
}
