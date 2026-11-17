// Cars: the driving model the player feels, the traffic that fills the streets, and the parking that
// makes a lot worth robbing. Every car is a rectangle with a heading, a speed and a little lateral
// slide, which is enough for a chase to read well from above.

import { DRIVE, PALETTE, TILE } from './config.js';

let nextCarId = 1;

export class Car {
  constructor({ x, y, angle = 0, color = PALETTE.civilianCar[0], kind = 'sedan', driver = 'traffic' }) {
    this.id = nextCarId++;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.steer = 0;
    this.slide = 0;
    this.color = color;
    this.kind = kind;
    this.driver = driver;           // 'player' | 'traffic' | 'police' | 'parked' | 'none'
    this.length = kind === 'van' ? 70 : kind === 'police' ? 62 : 56;
    this.width = kind === 'van' ? 30 : 28;
    this.health = 100;
    this.siren = false;
    this.wrecked = false;
    this.turnIntent = 0;
    this.laneOffset = 0;
  }

  get forwardX() { return Math.cos(this.angle); }
  get forwardY() { return Math.sin(this.angle); }

  /** Driver input: throttle -1..1, steer -1..1, handbrake bool. */
  drive(input, dt, world) {
    const throttle = input.throttle || 0;
    const steerInput = input.steer || 0;
    const handbrake = !!input.handbrake;

    if (throttle > 0) this.speed += DRIVE.accel * throttle * dt;
    else if (throttle < 0) this.speed -= DRIVE.brake * dt;
    else this.speed *= 1 - DRIVE.drag * dt;

    if (this.speed > DRIVE.maxSpeed) this.speed = DRIVE.maxSpeed;
    if (this.speed < -DRIVE.maxReverse) this.speed = -DRIVE.maxReverse;

    const speedRatio = Math.min(1, Math.abs(this.speed) / 220);
    const turn = steerInput * DRIVE.turnRate * speedRatio * dt * (this.speed < 0 ? -1 : 1);
    this.angle += turn;
    this.steer = steerInput;

    // Lateral slide: a handbrake turn keeps some of the old heading, which is what makes a drift.
    const grip = handbrake ? DRIVE.handbrakeGrip : DRIVE.grip;
    this.slide += (steerInput * Math.abs(this.speed) * 0.9 - this.slide) * Math.min(1, grip * dt);
    if (handbrake) this.speed *= 1 - 0.9 * dt;

    const nx = this.x + this.forwardX * this.speed * dt + Math.cos(this.angle + Math.PI / 2) * this.slide * dt;
    const ny = this.y + this.forwardY * this.speed * dt + Math.sin(this.angle + Math.PI / 2) * this.slide * dt;

    const resolved = world.resolve(nx, ny, this.width * 0.6);
    if (resolved.hit) {
      this.speed *= resolved.stuck ? -0.15 : 0.55;
      this.health -= Math.abs(this.speed) * 0.02;
      if (this.health <= 0) this.wrecked = true;
    }
    this.x = resolved.x;
    this.y = resolved.y;
    return resolved.hit;
  }

  /** Traffic: drive straight down the road, brake for whatever is ahead, turn at intersections. */
  driveTraffic(dt, world, aheadClear, rng) {
    if (this.wrecked) return;
    if (this.turnIntent === 0 && rng() < 0.012) this.turnIntent = rng() < 0.5 ? -1 : 1;
    const targetSpeed = aheadClear ? 170 : 40;
    const throttle = this.speed < targetSpeed ? 1 : -0.6;
    const steer = this.turnIntent * 0.55;
    this.drive({ throttle, steer, handbrake: false }, dt, world);

    // Once the heading is close to a road axis, straighten out and forget the turn.
    if (this.turnIntent !== 0 && Math.abs(this.speed) > 40) {
      const snapped = Math.round(this.angle / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(this.angle - snapped) < 0.08) {
        this.angle = snapped;
        this.turnIntent = 0;
      }
    }
  }

  contains(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    const cos = Math.cos(-this.angle);
    const sin = Math.sin(-this.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) < this.length / 2 && Math.abs(ly) < this.width / 2;
  }
}

export function spawnTraffic(world, count, rng = Math.random) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const point = world.randomRoadPoint(rng);
    const horizontal = Math.round(point.y / TILE) % 5 === 0;
    const angle = horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const kind = rng() < 0.12 ? 'van' : 'sedan';
    const color = rng() < 0.1 ? PALETTE.taxi : PALETTE.civilianCar[Math.floor(rng() * PALETTE.civilianCar.length)];
    cars.push(new Car({ x: point.x, y: point.y, angle, color, kind, driver: 'traffic' }));
  }
  return cars;
}

/** Parked cars in the lots: the free cars a player can take without breaking a window. */
export function spawnParked(world, count, rng = Math.random) {
  const cars = [];
  const lots = world.blocks.filter((b) => b.kind === 'lot');
  for (let i = 0; i < Math.min(count, lots.length); i += 1) {
    const lot = lots[Math.floor((i / lots.length) * lots.length)];
    const color = PALETTE.civilianCar[Math.floor(rng() * PALETTE.civilianCar.length)];
    cars.push(new Car({
      x: lot.col * TILE + TILE / 2 + (rng() - 0.5) * 20,
      y: lot.row * TILE + TILE / 2 + (rng() - 0.5) * 20,
      angle: rng() * Math.PI * 2,
      color,
      kind: rng() < 0.2 ? 'van' : 'sedan',
      driver: 'parked',
    }));
  }
  return cars;
}
