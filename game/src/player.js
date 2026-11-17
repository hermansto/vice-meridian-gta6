// The player: on foot he walks, aims and fires; behind a wheel the car does the moving and he only
// steers. Health, cash and the current ride live here so a save file and the HUD read one object.

import { ON_FOOT } from './config.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = -Math.PI / 2;
    this.aim = 0;
    this.radius = ON_FOOT.radius;
    this.health = ON_FOOT.health;
    this.cash = 0;
    this.car = null;              // the Car the player is driving, or null
    this.fireCooldown = 0;
    this.bullets = [];
    this.mode = 'foot';
    this.stamina = 1;
    this.shotsFired = 0;
    this.lastShot = 0;
    this.hitFlash = 0;
  }

  get position() {
    return this.car ? { x: this.car.x, y: this.car.y } : { x: this.x, y: this.y };
  }

  enterCar(car) {
    this.car = car;
    car.driver = 'player';
    this.mode = 'car';
  }

  exitCar(world) {
    if (!this.car) return;
    const side = this.car.angle + Math.PI / 2;
    let x = this.car.x + Math.cos(side) * 34;
    let y = this.car.y + Math.sin(side) * 34;
    if (world.solidAt(x, y, this.radius)) {
      x = this.car.x - Math.cos(side) * 34;
      y = this.car.y - Math.sin(side) * 34;
    }
    if (world.solidAt(x, y, this.radius)) {
      x = this.car.x;
      y = this.car.y;
    }
    this.car.driver = 'none';
    this.car = null;
    this.mode = 'foot';
    this.x = x;
    this.y = y;
  }

  updateOnFoot(dt, world, input, mouse, camera) {
    const sprinting = input.keys.has('shift') && this.stamina > 0.05;
    const speed = sprinting ? ON_FOOT.sprint : ON_FOOT.walk;
    this.stamina = Math.max(0, Math.min(1, this.stamina + (sprinting ? -0.45 : 0.28) * dt));

    let dx = 0;
    let dy = 0;
    if (input.keys.any('w')) dy -= 1;
    if (input.keys.any('s')) dy += 1;
    if (input.keys.any('a')) dx -= 1;
    if (input.keys.any('d')) dx += 1;
    const length = Math.hypot(dx, dy) || 1;
    if (dx || dy) {
      this.angle = Math.atan2(dy, dx);
      const nx = this.x + (dx / length) * speed * dt;
      const ny = this.y + (dy / length) * speed * dt;
      const resolved = world.resolve(nx, ny, this.radius);
      this.x = resolved.x;
      this.y = resolved.y;
    }

    // Aim at the cursor, in world space.
    this.aim = Math.atan2(mouse.worldY - this.y, mouse.worldX - this.x);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (mouse.down && this.fireCooldown === 0) {
      this.fireCooldown = 0.16;
      this.shotsFired += 1;
      this.bullets.push({
        x: this.x + Math.cos(this.aim) * 18,
        y: this.y + Math.sin(this.aim) * 18,
        vx: Math.cos(this.aim) * 900,
        vy: Math.sin(this.aim) * 900,
        life: 0.7,
      });
    }
    this.updateBullets(dt, world);
  }

  driveCar(dt, world, input) {
    if (!this.car) return;
    const throttle = (input.keys.any('w') ? 1 : 0) - (input.keys.any('s') ? 1 : 0);
    const steer = (input.keys.any('d') ? 1 : 0) - (input.keys.any('a') ? 1 : 0);
    this.car.drive({ throttle, steer, handbrake: input.keys.has('shift') }, dt, world);
    this.x = this.car.x;
    this.y = this.car.y;
    this.angle = this.car.angle;
    this.aim = this.car.angle;
  }

  updateBullets(dt, world) {
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (world.solidAt(bullet.x, bullet.y, 2)) bullet.life = 0;
    }
    this.bullets = this.bullets.filter((bullet) => bullet.life > 0);
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hitFlash = 0.25;
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(ON_FOOT.health, this.health + amount);
  }
}
