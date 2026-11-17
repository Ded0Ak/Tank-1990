import {
  ARENA_PX,
  Bullet,
  Direction,
  GRID_SIZE,
  Pickup,
  PickupKind,
  Tank,
  Team,
  TILE_SIZE,
  TileType,
  type World,
} from "@tank1990/shared";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export class TankRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #particles: Particle[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.#ctx = ctx;
    this.#setupDpr();
  }

  #setupDpr(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = 520;
    this.#canvas.width = cssSize * dpr;
    this.#canvas.height = cssSize * dpr;
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  spawnExplosion(x: number, y: number, big: boolean): void {
    const count = big ? 22 : 8;
    const colors = ["#f59e0b", "#ef4444", "#fef08a", "#ffffff"];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = (big ? 95 : 55) * (0.4 + ((i * 37) % 10) / 10);
      this.#particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: big ? 0.45 : 0.22,
        color: colors[i % colors.length] ?? "#f59e0b",
      });
    }
  }

  render(world: World, timeSec: number): void {
    const ctx = this.#ctx;
    const scale = 520 / ARENA_PX;

    ctx.save();
    ctx.fillStyle = "#080a0d";
    ctx.fillRect(0, 0, 520, 520);
    ctx.scale(scale, scale);

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      const p = i * TILE_SIZE;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, ARENA_PX);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(ARENA_PX, p);
      ctx.stroke();
    }

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const tile = world.arena.getTile(gx, gy);
        this.#drawTile(ctx, tile, gx * TILE_SIZE, gy * TILE_SIZE, timeSec);
      }
    }

    for (const pickup of world.ofKind(Pickup)) {
      this.#drawPickup(ctx, pickup, timeSec);
    }

    for (const tank of world.ofKind(Tank)) {
      this.#drawTank(ctx, tank, timeSec);
    }

    for (const bullet of world.ofKind(Bullet)) {
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(bullet.pos.x, bullet.pos.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        if (world.arena.getTile(gx, gy) === TileType.Forest) {
          this.#drawForest(ctx, gx * TILE_SIZE, gy * TILE_SIZE);
        }
      }
    }

    for (let i = this.#particles.length - 1; i >= 0; i--) {
      const p = this.#particles[i];
      if (!p) continue;
      p.x += p.vx * (1 / 60);
      p.y += p.vy * (1 / 60);
      p.life -= 1 / 60;
      if (p.life <= 0) {
        this.#particles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    ctx.restore();
  }

  #drawTile(ctx: CanvasRenderingContext2D, tile: TileType, x: number, y: number, timeSec: number): void {
    if (tile === TileType.Brick) {
      ctx.fillStyle = "#b45309";
      ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.beginPath();
      ctx.moveTo(x, y + 16);
      ctx.lineTo(x + TILE_SIZE, y + 16);
      ctx.moveTo(x + 16, y);
      ctx.lineTo(x + 16, y + 16);
      ctx.moveTo(x + 8, y + 16);
      ctx.lineTo(x + 8, y + TILE_SIZE);
      ctx.moveTo(x + 24, y + 16);
      ctx.lineTo(x + 24, y + TILE_SIZE);
      ctx.stroke();
    } else if (tile === TileType.Steel) {
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - 12);
    } else if (tile === TileType.Water) {
      const wave = Math.sin(timeSec * 4 + x * 0.1) > 0;
      ctx.fillStyle = wave ? "#1d4ed8" : "#2563eb";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = "#93c5fd";
      ctx.fillRect(x + (wave ? 4 : 10), y + 10, 12, 2);
      ctx.fillRect(x + (wave ? 14 : 6), y + 22, 10, 2);
    } else if (tile === TileType.Base) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 4);
      ctx.lineTo(x + 28, y + 16);
      ctx.lineTo(x + 22, y + 28);
      ctx.lineTo(x + 10, y + 28);
      ctx.lineTo(x + 4, y + 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(x + 13, y + 12, 6, 6);
    } else if (tile === TileType.BaseDestroyed) {
      ctx.fillStyle = "#450a0a";
      ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 6);
      ctx.lineTo(x + 26, y + 26);
      ctx.moveTo(x + 26, y + 6);
      ctx.lineTo(x + 6, y + 26);
      ctx.stroke();
    }
  }

  #drawForest(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = "rgba(22, 163, 74, 0.82)";
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    ctx.fillStyle = "rgba(74, 222, 128, 0.45)";
    ctx.fillRect(x + 6, y + 6, 8, 8);
    ctx.fillRect(x + 18, y + 16, 8, 8);
  }

  #drawTank(ctx: CanvasRenderingContext2D, tank: Tank, timeSec: number): void {
    ctx.save();
    ctx.translate(tank.pos.x, tank.pos.y);

    if (tank.shieldTimer > 0) {
      ctx.strokeStyle = Math.sin(timeSec * 18) > 0 ? "#38bdf8" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, tank.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    const rotations: Record<Direction, number> = {
      [Direction.Up]: 0,
      [Direction.Right]: Math.PI / 2,
      [Direction.Down]: Math.PI,
      [Direction.Left]: -Math.PI / 2,
    };
    ctx.rotate(rotations[tank.dir]);

    const bodyColor =
      tank.team === Team.Player1
        ? "#facc15"
        : tank.team === Team.Player2
          ? "#4ade80"
          : "#e2e8f0";
    const trackColor =
      tank.team === Team.Player1
        ? "#a16207"
        : tank.team === Team.Player2
          ? "#15803d"
          : "#64748b";

    ctx.fillStyle = trackColor;
    ctx.fillRect(-12, -11, 5, 22);
    ctx.fillRect(7, -11, 5, 22);

    ctx.fillStyle = bodyColor;
    ctx.fillRect(-8, -9, 16, 18);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-2, -15, 4, 12);

    ctx.restore();
  }

  #drawPickup(ctx: CanvasRenderingContext2D, pickup: Pickup, timeSec: number): void {
    if (Math.sin(timeSec * 10) < -0.3) return;
    const { x, y } = pickup.pos;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(x - 10, y - 10, 20, 20);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 10, y - 10, 20, 20);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label =
      pickup.pickupKind === PickupKind.Shield
        ? "S"
        : pickup.pickupKind === PickupKind.RapidFire
          ? "R"
          : "+";
    ctx.fillText(label, x, y + 1);
  }
}
