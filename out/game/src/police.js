// The police: a wanted level that rises with what you do and falls when you stay out of sight, plus
// the cars that come looking. They are cars with a siren and a driver that wants to be near you; the
// arrest itself is a range check while you are on foot.

import { POLICE, PALETTE } from './config.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(world) {
    this.world = world;
    this.stars = 0;
    this.heat = 0;             // seconds until a star decays
    this.cars = [];
    this.spawnTimer = 0;
    this.busted = false;
    this.shotsAtPlayer = 0;
    this.shotTimer = 0;
    this.lastKnown = null;
  }

  addStars(count = 1) {
    this.stars = Math.min(5, this.stars + count);
    this.heat = POLICE.starsDecaySeconds;
  }

  reportGunshot(x, y) {
    this.addStars(1);
    this.lastKnown = { x, y };
  }

  /** Called when the player is seen by a patrol or the chase gets close. */
  reportSighting(x, y) {
    this.lastKnown = { x, y };
    if (this.stars > 0) this.heat = POLICE.starsDecaySeconds;
  }

  update(dt, player, world) {
    if (this.stars === 0) {
      this.cars.forEach((car) => { car.siren = false; });
      this.despawnFar(player);
      return;
    }

    const playerPos = player.position;
    const distance = Math.hypot(playerPos.x - (this.lastKnown?.x ?? 0), playerPos.y - (this.lastKnown?.y ?? 0));
    if (distance < POLICE.sightRange) {
      this.lastKnown = { x: playerPos.x, y: playerPos.y };
      this.heat = POLICE.starsDecaySeconds;
    } else {
      this.heat -= dt;
      if (this.heat <= 0) {
        this.stars = Math.max(0, this.stars - 1);
        this.heat = POLICE.starsDecaySeconds;
      }
    }

    this.spawnTimer -= dt;
    const wanted = Math.min(POLICE.patrolCars, 1 + this.stars);
    if (this.cars.length < wanted && this.spawnTimer <= 0) {
      this.spawnChaseCar(playerPos);
      this.spawnTimer = 1.6;
    }

    for (const car of this.cars) {
      car.siren = true;
      this.driveChase(car, playerPos, dt);
    }

    // Arrest: a patrol car within range while the player is on foot and not moving fast.
    if (player.mode === 'foot') {
      for (const car of this.cars) {
        if (Math.hypot(car.x - playerPos.x, car.y - playerPos.y) < POLICE.arrestRange && Math.abs(car.speed) < 90) {
          this.busted = true;
          return;
        }
      }
    }

    // Shots from the chase, scaled by the wanted level.
    this.shotTimer -= dt;
    if (this.stars >= 3 && this.shotTimer <= 0 && this.cars.length > 0) {
      const shooter = this.cars[0];
      const d = Math.hypot(shooter.x - playerPos.x, shooter.y - playerPos.y);
      if (d < 420) {
        this.shotTimer = 1.4 - this.stars * 0.12;
        if (Math.random() < 0.55) player.damage(6 + this.stars * 2);
      }
    }

    this.despawnFar(player);
  }

  driveChase(car, playerPos, dt) {
    const dx = playerPos.x - car.x;
    const dy = playerPos.y - car.y;
    const target = Math.atan2(dy, dx);
    let diff = target - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    const far = Math.hypot(dx, dy) > 120;
    car.drive({ throttle: far ? 1 : 0.35, steer, handbrake: false }, dt, this.world);
  }

  spawnChaseCar(playerPos) {
    // Come in from off screen, on the nearest road point that is still out of view.
    let point = null;
    for (let i = 0; i < 40; i += 1) {
      const candidate = this.world.randomRoadPoint(Math.random, playerPos, 5);
      const d = Math.hypot(candidate.x - playerPos.x, candidate.y - playerPos.y);
      if (d > 330 && d < 760) { point = candidate; break; }
    }
    if (!point) point = this.world.randomRoadPoint(Math.random, playerPos, 5);
    const angle = Math.atan2(playerPos.y - point.y, playerPos.x - point.x);
    const car = new Car({ x: point.x, y: point.y, angle, color: PALETTE.police, kind: 'police', driver: 'police' });
    car.siren = true;
    this.cars.push(car);
  }

  despawnFar(player) {
    const playerPos = player.position;
    this.cars = this.cars.filter((car) => Math.hypot(car.x - playerPos.x, car.y - playerPos.y) < 2600);
  }

  clear() {
    this.stars = 0;
    this.heat = 0;
    this.busted = false;
    this.cars = [];
    this.lastKnown = null;
  }
}
