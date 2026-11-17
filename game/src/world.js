// The city: a deterministic grid of roads and blocks, the buildings that fill the blocks, and the
// collision helpers everything else uses. The layout is generated once from a seed so a saved game
// and a screenshot always show the same streets.

import { TILE, CITY_COLS, CITY_ROWS, ROAD_EVERY, WORLD_W, WORLD_H, PALETTE } from './config.js';

const BUILDING_INSET = 10;

export const DISTRICTS = [
  { name: 'MERIDIAN STRIP', col: 0, row: 0, w: 22, h: 22 },
  { name: 'SALT DOCKS', col: 22, row: 0, w: 22, h: 22 },
  { name: 'PALM HEIGHTS', col: 0, row: 22, w: 22, h: 22 },
  { name: 'COPPER YARD', col: 22, row: 22, w: 22, h: 22 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isRoadCell = (col, row) => col % ROAD_EVERY === 0 || row % ROAD_EVERY === 0;

/** Where a cell starts in world units. */
export const cellX = (col) => col * TILE;
export const cellY = (row) => row * TILE;

export function createWorld(seed = 20261119) {
  const rng = mulberry32(seed);
  const buildings = [];
  const blocks = [];

  for (let row = 0; row < CITY_ROWS; row += 1) {
    for (let col = 0; col < CITY_COLS; col += 1) {
      if (isRoadCell(col, row)) continue;
      const x = cellX(col) + BUILDING_INSET;
      const y = cellY(row) + BUILDING_INSET;
      const w = TILE - BUILDING_INSET * 2;
      const h = TILE - BUILDING_INSET * 2;
      const roll = rng();
      if (roll < 0.16) {
        // A parking lot: drivable, no building, one lamp.
        blocks.push({ col, row, kind: 'lot' });
        continue;
      }
      if (roll < 0.2) {
        // A pocket park: grass, a path, a bench worth drawing.
        blocks.push({ col, row, kind: 'park' });
        continue;
      }
      const floors = roll > 0.88 ? 4 + Math.floor(rng() * 6) : 1 + Math.floor(rng() * 3);
      buildings.push({
        x, y, w, h, col, row, floors,
        color: PALETTE.building[Math.floor(rng() * PALETTE.building.length)],
        lit: rng() < 0.55,
        shop: floors === 1 && rng() < 0.4,
        seed: Math.floor(rng() * 1000),
      });
      blocks.push({ col, row, kind: 'built' });
    }
  }

  const world = {
    width: WORLD_W,
    height: WORLD_H,
    buildings,
    blocks,
    grid: { cols: CITY_COLS, rows: CITY_ROWS },
    isRoad: (col, row) => col >= 0 && row >= 0 && col < CITY_COLS && row < CITY_ROWS && isRoadCell(col, row),
    districtAt(x, y) {
      const col = Math.floor(x / TILE);
      const row = Math.floor(y / TILE);
      const d = DISTRICTS.find((item) => col >= item.col && col < item.col + item.w && row >= item.row && row < item.row + item.h);
      return d ? d.name : 'MERIDIAN';
    },
    /** True when a circle at (x, y) overlaps a building footprint. */
    solidAt(x, y, radius = 0) {
      if (x < radius || y < radius || x > WORLD_W - radius || y > WORLD_H - radius) return true;
      const col = Math.floor(x / TILE);
      const row = Math.floor(y / TILE);
      for (let dc = -1; dc <= 1; dc += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          const b = buildingAt(col + dc, row + dr);
          if (!b) continue;
          const nx = Math.max(b.x, Math.min(x, b.x + b.w));
          const ny = Math.max(b.y, Math.min(y, b.y + b.h));
          if ((x - nx) ** 2 + (y - ny) ** 2 < radius * radius) return true;
        }
      }
      return false;
    },
    /** Slide a moving circle out of the walls, one axis at a time. */
    resolve(x, y, radius) {
      if (!world.solidAt(x, y, radius)) return { x, y, hit: false };
      if (!world.solidAt(x, y - radius, radius)) return { x, y: y, hit: true };
      if (!world.solidAt(x, y + radius, radius)) return { x, y, hit: true };
      if (!world.solidAt(x - radius, y, radius)) return { x, y, hit: true };
      if (!world.solidAt(x + radius, y, radius)) return { x, y, hit: true };
      return { x, y, hit: true, stuck: true };
    },
    /** A point on a road, at least `pad` cells from the excluded point. */
    randomRoadPoint(rng2 = Math.random, avoid = null, pad = 6) {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const col = Math.floor(rng2() * CITY_COLS);
        const row = Math.floor(rng2() * CITY_ROWS);
        if (!isRoadCell(col, row)) continue;
        const x = cellX(col) + TILE / 2;
        const y = cellY(row) + TILE / 2;
        if (avoid && Math.hypot(avoid.x - x, avoid.y - y) < pad * TILE) continue;
        return { x, y };
      }
      return { x: cellX(ROAD_EVERY) + TILE / 2, y: cellY(ROAD_EVERY) + TILE / 2 };
    },
    roadPointAt(col, row) {
      const snappedCol = Math.round(col / ROAD_EVERY) * ROAD_EVERY;
      const snappedRow = Math.round(row / ROAD_EVERY) * ROAD_EVERY;
      return {
        x: cellX(Math.max(ROAD_EVERY, Math.min(CITY_COLS - 1, snappedCol))) + TILE / 2,
        y: cellY(Math.max(ROAD_EVERY, Math.min(CITY_ROWS - 1, snappedRow))) + TILE / 2,
      };
    },
  };

  // Street furniture, generated once: palms on the kerbs, lamps at intersections, hydrants in the lots.
  const props = [];
  for (let row = 0; row < CITY_ROWS; row += 1) {
    for (let col = 0; col < CITY_COLS; col += 1) {
      if (isRoadCell(col, row)) continue;
      const roll = rng();
      const x = cellX(col) + BUILDING_INSET / 2 + rng() * 4;
      const y = cellY(row) + TILE - BUILDING_INSET / 2 - rng() * 4;
      if (roll < 0.3) props.push({ kind: 'palm', x, y, seed: rng() });
      else if (roll < 0.42) props.push({ kind: 'lamp', x, y });
      else if (roll < 0.5) props.push({ kind: 'hydrant', x, y });
    }
  }
  world.props = props;

  const byCell = new Map();
  for (const b of buildings) byCell.set(`${b.col},${b.row}`, b);
  function buildingAt(col, row) {
    return byCell.get(`${col},${row}`) || null;
  }

  world.buildingAt = buildingAt;
  return world;
}
