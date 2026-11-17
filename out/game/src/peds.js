// Pedestrians: they walk the sidewalks, scatter from gunfire, and get back up again. They exist to
// make the street feel inhabited and to make a chase through it messy, so they stay cheap: a point,
// a heading, and a state.

import { TILE, PALETTE } from './config.js';

let nextPedId = 1;

const WALK = 62;
const RUN = 210;

export class Ped {
  constructor({ x, y, angle = 0 }) {
    this.id = nextPedId++;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.state = 'walk';       // walk | flee | idle | down
    this.timer = Math.random() * 3;
    this.speed = WALK;
    this.color = Math.random() < 0.5 ? PALETTE.ped : '#7b8797';
    this.shirt = ['#b0616b', '#5f7fa8', '#7d9a5f', '#a08a5f', '#7a6ba0'][Math.floor(Math.random() * 5)];
    this.radius = 9;
    this.downTimer = 0;
  }

  update(dt, world, { dangerAt = null, playerPos = null } = {}) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) this.state = 'walk';
      return;
    }

    if (dangerAt) {
      const distance = Math.hypot(dangerAt.x - this.x, dangerAt.y - this.y);
      if (distance < 260) {
        this.state = 'flee';
        this.angle = Math.atan2(this.y - dangerAt.y, this.x - dangerAt.x);
      }
    }

    if (this.state === 'flee' && playerPos) {
      const distance = Math.hypot(playerPos.x - this.x, playerPos.y - this.y);
      if (distance > 420) this.state = 'walk';
    }

    if (this.state === 'idle') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'walk';
        this.angle = Math.random() * Math.PI * 2;
      }
      return;
    }

    this.speed = this.state === 'flee' ? RUN : WALK;
    if (this.state === 'walk') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 2 + Math.random() * 4;
        if (Math.random() < 0.35) {
          this.state = 'idle';
          return;
        }
        this.angle += (Math.random() - 0.5) * 1.2;
      }
    }

    const nx = this.x + Math.cos(this.angle) * this.speed * dt;
    const ny = this.y + Math.sin(this.angle) * this.speed * dt;
    if (world.solidAt(nx, ny, this.radius)) {
      // Turn away from the wall: a pedestrian never walks through a shopfront.
      this.angle += Math.PI / 2 + Math.random() * 0.4;
      this.state = 'walk';
      return;
    }
    this.x = nx;
    this.y = ny;
  }

  knockDown() {
    this.state = 'down';
    this.downTimer = 4 + Math.random() * 4;
  }
}

export function spawnPeds(world, count, rng = Math.random) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const point = world.randomRoadPoint(rng);
    // Stand on the kerb rather than the middle of the road.
    const offset = (rng() < 0.5 ? -1 : 1) * (TILE / 2 - 8);
    peds.push(new Ped({ x: point.x + offset, y: point.y + offset, angle: rng() * Math.PI * 2 }));
  }
  return peds;
}
