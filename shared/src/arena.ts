import { TileType } from "./types.js";

export const GRID_SIZE = 13;
export const TILE_SIZE = 32;
export const ARENA_PX = GRID_SIZE * TILE_SIZE;

const STAGE_LAYOUTS: readonly (readonly number[])[] = [
  // Stage 1: Classic Fortress
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
    0, 1, 0, 1, 0, 1, 2, 1, 0, 1, 0, 1, 0,
    0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0,
    0, 4, 4, 0, 0, 1, 1, 1, 0, 0, 4, 4, 0,
    2, 0, 0, 3, 3, 0, 0, 0, 3, 3, 0, 0, 2,
    0, 1, 0, 0, 0, 1, 2, 1, 0, 0, 0, 1, 0,
    0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
    0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0,
    0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0,
    0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 5, 1, 0, 0, 0, 0, 0,
  ],
  // Stage 2: River Crossing
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 2, 0, 1, 1, 0, 0, 0, 1, 1, 0, 2, 0,
    0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 0, 1, 0,
    0, 4, 4, 4, 0, 1, 1, 1, 0, 4, 4, 4, 0,
    3, 3, 0, 3, 3, 0, 0, 0, 3, 3, 0, 3, 3,
    0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0,
    0, 1, 1, 0, 0, 4, 4, 4, 0, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0,
    0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0,
    0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 0, 1, 0,
    0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 5, 1, 0, 0, 0, 0, 0,
  ],
];

export class Arena {
  readonly tiles: TileType[];

  constructor(stageIndex = 0, initialTiles?: readonly number[]) {
    if (initialTiles) {
      this.tiles = initialTiles.slice(0, GRID_SIZE * GRID_SIZE) as TileType[];
    } else {
      const template = STAGE_LAYOUTS[stageIndex % STAGE_LAYOUTS.length] ?? STAGE_LAYOUTS[0]!;
      this.tiles = template.slice() as TileType[];
    }
  }

  getTile(gx: number, gy: number): TileType {
    if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) {
      return TileType.Steel;
    }
    return this.tiles[gy * GRID_SIZE + gx] ?? TileType.Steel;
  }

  setTile(gx: number, gy: number, tile: TileType): void {
    if (gx >= 0 && gy >= 0 && gx < GRID_SIZE && gy < GRID_SIZE) {
      this.tiles[gy * GRID_SIZE + gx] = tile;
    }
  }

  isBaseAlive(): boolean {
    return this.getTile(6, 12) === TileType.Base;
  }

  collidesTank(cx: number, cy: number, half: number): boolean {
    if (cx - half < 0 || cy - half < 0 || cx + half > ARENA_PX || cy + half > ARENA_PX) {
      return true;
    }
    const minGx = Math.floor((cx - half + 0.01) / TILE_SIZE);
    const maxGx = Math.floor((cx + half - 0.01) / TILE_SIZE);
    const minGy = Math.floor((cy - half + 0.01) / TILE_SIZE);
    const maxGy = Math.floor((cy + half - 0.01) / TILE_SIZE);

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const t = this.getTile(gx, gy);
        if (
          t === TileType.Brick ||
          t === TileType.Steel ||
          t === TileType.Water ||
          t === TileType.Base ||
          t === TileType.BaseDestroyed
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
