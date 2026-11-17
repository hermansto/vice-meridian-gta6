// Everything the player sees is drawn here, in one pass, in a fixed order: ground, roads, blocks,
// buildings, shadows, cars, people, bullets, markers, weather and vignette. The camera follows the
// player with a little look-ahead and shakes on impact; the canvas is 1280x720 and scaled by CSS.

import { VIEW, TILE, PALETTE, WORLD_W, WORLD_H, ROAD_EVERY, CITY_COLS, CITY_ROWS } from './config.js';

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.camera = { x: world.width / 2, y: world.height / 2, shake: 0 };
    this.time = 0;
  }

  shake(amount = 8) {
    this.camera.shake = Math.max(this.camera.shake, amount);
  }

  updateCamera(player, dt) {
    const target = player.position;
    const leadX = Math.cos(player.angle) * (player.car ? 120 : 40);
    const leadY = Math.sin(player.angle) * (player.car ? 120 : 40);
    const cam = this.camera;
    cam.x += (target.x + leadX - cam.x) * Math.min(1, dt * 4.5);
    cam.y += (target.y + leadY - cam.y) * Math.min(1, dt * 4.5);
    // Keep the camera inside the city: no black void beyond the last street.
    const halfW = VIEW.width / 2 / VIEW.zoom;
    const halfH = VIEW.height / 2 / VIEW.zoom;
    cam.x = Math.max(halfW, Math.min(this.world.width - halfW, cam.x));
    cam.y = Math.max(halfH, Math.min(this.world.height - halfH, cam.y));
    cam.shake *= Math.pow(0.001, dt);
  }

  /** World -> screen, with the camera and the view zoom. */
  toScreen(x, y) {
    const cam = this.camera;
    const shakeX = (Math.random() - 0.5) * cam.shake;
    const shakeY = (Math.random() - 0.5) * cam.shake;
    return {
      x: (x - cam.x) * VIEW.zoom + VIEW.width / 2 + shakeX,
      y: (y - cam.y) * VIEW.zoom + VIEW.height / 2 + shakeY,
    };
  }

  toWorld(screenX, screenY) {
    const cam = this.camera;
    return {
      x: (screenX - VIEW.width / 2) / VIEW.zoom + cam.x,
      y: (screenY - VIEW.height / 2) / VIEW.zoom + cam.y,
    };
  }

  draw(game, dt) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    const night = game.clock.nightness();
    this.drawGround(night);
    this.drawRoads(night);
    this.drawBuildings(night);
    this.drawProps(night);
    this.drawMissionMarker(game);
    this.drawCars(game);
    this.drawPeds(game);
    this.drawBullets(game);
    this.drawPlayer(game);
    this.drawWeather(night, game);
    ctx.restore();
  }

  drawGround(night) {
    const ctx = this.ctx;
    const topLeft = this.toWorld(-80, -80);
    const bottomRight = this.toWorld(VIEW.width + 80, VIEW.height + 80);
    ctx.fillStyle = night > 0.5 ? '#151a20' : PALETTE.asphalt;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Sidewalks: every block gets a kerb, drawn as a lighter cell under the buildings.
    for (const block of this.world.blocks) {
      const x = block.col * TILE;
      const y = block.row * TILE;
      if (x < topLeft.x - TILE || y < topLeft.y - TILE || x > bottomRight.x || y > bottomRight.y) continue;
      const p = this.toScreen(x, y);
      ctx.fillStyle = block.kind === 'lot' ? '#1e242c' : block.kind === 'park' ? '#21372a' : PALETTE.sidewalk;
      ctx.fillRect(p.x, p.y, TILE * VIEW.zoom, TILE * VIEW.zoom);
      if (block.kind === 'lot') {
        ctx.strokeStyle = 'rgba(216,195,122,0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 6, p.y + 6, TILE * VIEW.zoom - 12, TILE * VIEW.zoom - 12);
      }
    }
  }

  drawRoads(night) {
    const ctx = this.ctx;
    const topLeft = this.toWorld(-80, -80);
    const bottomRight = this.toWorld(VIEW.width + 80, VIEW.height + 80);
    const firstCol = Math.max(0, Math.floor(topLeft.x / TILE) - 1);
    const lastCol = Math.min(CITY_COLS - 1, Math.ceil(bottomRight.x / TILE) + 1);
    const firstRow = Math.max(0, Math.floor(topLeft.y / TILE) - 1);
    const lastRow = Math.min(CITY_ROWS - 1, Math.ceil(bottomRight.y / TILE) + 1);

    ctx.fillStyle = night > 0.45 ? '#20272f' : PALETTE.asphaltLit;
    for (let col = firstCol; col <= lastCol; col += 1) {
      if (col % ROAD_EVERY !== 0) continue;
      const p = this.toScreen(col * TILE, 0);
      ctx.fillRect(p.x, 0, TILE * VIEW.zoom, VIEW.height);
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      if (row % ROAD_EVERY !== 0) continue;
      const p = this.toScreen(0, row * TILE);
      ctx.fillRect(0, p.y, VIEW.width, TILE * VIEW.zoom);
    }

    // Centre dashes, only on the visible stretch of each road.
    ctx.strokeStyle = 'rgba(216,195,122,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 18]);
    for (let col = firstCol; col <= lastCol; col += 1) {
      if (col % ROAD_EVERY !== 0) continue;
      const p = this.toScreen(col * TILE + TILE / 2, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, VIEW.height);
      ctx.stroke();
    }
    for (let row = firstRow; row <= lastRow; row += 1) {
      if (row % ROAD_EVERY !== 0) continue;
      const p = this.toScreen(0, row * TILE + TILE / 2);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(VIEW.width, p.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Zebra crossings on the four sides of every intersection in view.
    ctx.fillStyle = 'rgba(232,238,245,0.5)';
    for (let col = firstCol; col <= lastCol; col += 1) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        if (!this.world.isRoad(col, row)) continue;
        if (col % ROAD_EVERY !== 0 || row % ROAD_EVERY !== 0) continue;
        const centre = this.toScreen(col * TILE + TILE / 2, row * TILE + TILE / 2);
        const half = (TILE / 2) * VIEW.zoom;
        for (let stripe = -3; stripe <= 3; stripe += 1) {
          const offset = stripe * 8 * VIEW.zoom;
          ctx.fillRect(centre.x + offset - 2 * VIEW.zoom, centre.y - half - 14 * VIEW.zoom, 3.2 * VIEW.zoom, 9 * VIEW.zoom);
          ctx.fillRect(centre.x + offset - 2 * VIEW.zoom, centre.y + half + 5 * VIEW.zoom, 3.2 * VIEW.zoom, 9 * VIEW.zoom);
          ctx.fillRect(centre.x - half - 14 * VIEW.zoom, centre.y + offset - 2 * VIEW.zoom, 9 * VIEW.zoom, 3.2 * VIEW.zoom);
          ctx.fillRect(centre.x + half + 5 * VIEW.zoom, centre.y + offset - 2 * VIEW.zoom, 9 * VIEW.zoom, 3.2 * VIEW.zoom);
        }
      }
    }
  }

  drawProps(night) {
    const ctx = this.ctx;
    for (const prop of this.world.props) {
      const p = this.toScreen(prop.x, prop.y);
      if (p.x < -30 || p.y < -60 || p.x > VIEW.width + 30 || p.y > VIEW.height + 30) continue;
      if (prop.kind === 'palm') {
        const sway = Math.sin(this.time * 0.8 + prop.seed * 6) * 3;
        ctx.strokeStyle = '#3a3026';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + sway, p.y - 26 * VIEW.zoom);
        ctx.stroke();
        ctx.fillStyle = night > 0.45 ? '#1d3a2c' : '#2b5a3f';
        for (let leaf = 0; leaf < 5; leaf += 1) {
          const angle = -Math.PI / 2 + (leaf - 2) * 0.55 + sway * 0.02;
          ctx.beginPath();
          ctx.ellipse(p.x + sway + Math.cos(angle) * 9, p.y - 27 * VIEW.zoom + Math.sin(angle) * 5, 9 * VIEW.zoom, 3.4 * VIEW.zoom, angle, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (prop.kind === 'lamp') {
        ctx.strokeStyle = '#4a5461';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - 18 * VIEW.zoom);
        ctx.stroke();
        ctx.fillStyle = night > 0.4 ? '#f2c96b' : '#6a7480';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 19 * VIEW.zoom, 2.6 * VIEW.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#a8402f';
        ctx.fillRect(p.x - 2.4, p.y - 5, 4.8, 5);
      }
    }
  }

  drawBuildings(night) {
    const ctx = this.ctx;
    for (const b of this.world.buildings) {
      const p = this.toScreen(b.x, b.y);
      const w = b.w * VIEW.zoom;
      const h = b.h * VIEW.zoom;
      if (p.x + w < -40 || p.y + h < -160 || p.x > VIEW.width + 40 || p.y > VIEW.height + 40) continue;

      const lift = b.floors * 5;
      // The wall behind the roof gives the height its read.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(p.x + 5, p.y + 6, w, h);
      if (lift > 0) {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + w, p.y);
        ctx.lineTo(p.x + w, p.y - lift);
        ctx.lineTo(p.x, p.y - lift);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = b.color;
      ctx.fillRect(p.x, p.y, w, h);
      // A lit top edge and a hard base shadow give each block a readable volume from above.
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(p.x, p.y, w, Math.max(2, h * 0.06));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(p.x, p.y + h - Math.max(2, h * 0.08), w, Math.max(2, h * 0.08));

      // Windows: a grid of dots, lit only after dark.
      const cols = Math.max(2, Math.floor(b.w / 14));
      const rows = Math.max(2, Math.floor(b.h / 14));
      const lit = night > 0.35 && b.lit;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let ry = 0; ry < rows; ry += 1) {
          const on = lit && ((cx * 7 + ry * 13 + b.seed) % 5 === 0);
          ctx.fillStyle = on ? PALETTE.window : 'rgba(20,26,33,0.55)';
          ctx.fillRect(p.x + 4 + cx * (w / cols), p.y + 4 - (lift * ry) / rows, 3, 3);
        }
      }

      if (b.shop) {
        ctx.fillStyle = night > 0.4 ? 'rgba(242,181,68,0.55)' : 'rgba(90,100,116,0.5)';
        ctx.fillRect(p.x + 3, p.y + h - 7, w - 6, 5);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x, p.y, w, h);
      // Rooftop furniture: an AC block or a water tank, so roofs are not flat rectangles.
      if (b.floors > 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(p.x + 7, p.y + 6, w * 0.22, h * 0.2);
        ctx.fillStyle = '#59636f';
        ctx.beginPath();
        ctx.arc(p.x + w * 0.7, p.y + h * 0.62, 5 * VIEW.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.stroke();
        ctx.fillStyle = 'rgba(242,181,68,0.6)';
        ctx.fillRect(p.x + w / 2 - 2, p.y - lift - 4, 4, 4);
      }
    }
  }

  drawMissionMarker(game) {
    const marker = game.missions.marker();
    if (!marker) return;
    const ctx = this.ctx;
    const p = this.toScreen(marker.point.x, marker.point.y);
    const pulse = 1 + Math.sin(this.time * 3) * 0.12;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = 'rgba(242,181,68,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse * VIEW.zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242,181,68,0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse * VIEW.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2b544';
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(marker.kind === 'start' ? 'JOB' : 'GO', 0, -36);
    ctx.restore();
  }

  drawCars(game) {
    const ctx = this.ctx;
    const cars = [...game.traffic, ...game.police.cars];
    if (game.player.car) cars.push(game.player.car);
    for (const car of cars) {
      const p = this.toScreen(car.x, car.y);
      if (p.x < -100 || p.y < -100 || p.x > VIEW.width + 100 || p.y > VIEW.height + 100) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(car.angle);
      const l = car.length * VIEW.zoom * 1.25;
      const w = car.width * VIEW.zoom * 1.25;

      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-l / 2 + 3, -w / 2 + 4, l, w);

      ctx.fillStyle = car.color;
      this.roundRect(ctx, -l / 2, -w / 2, l, w, 5);
      ctx.fill();

      // Windscreen and rear window.
      ctx.fillStyle = 'rgba(20,30,40,0.75)';
      ctx.fillRect(l * 0.05, -w / 2 + 3, l * 0.2, w - 6);
      ctx.fillRect(-l * 0.32, -w / 2 + 4, l * 0.12, w - 8);

      if (car.driver === 'police') {
        ctx.fillStyle = car.siren && Math.sin(this.time * 18) > 0 ? '#e2705f' : '#4f8ef7';
        ctx.fillRect(-2, -w / 2 - 3, 6, 3);
        ctx.fillStyle = 'rgba(79,142,247,0.18)';
        ctx.beginPath();
        ctx.arc(0, 0, 40 * VIEW.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(242,201,107,0.9)';
        ctx.fillRect(l / 2 - 4, -w / 2 + 3, 3, 4);
        ctx.fillRect(l / 2 - 4, w / 2 - 7, 3, 4);
      }
      ctx.restore();
    }
  }

  drawPeds(game) {
    const ctx = this.ctx;
    for (const ped of game.peds) {
      const p = this.toScreen(ped.x, ped.y);
      if (p.x < -30 || p.y < -30 || p.x > VIEW.width + 30 || p.y > VIEW.height + 30) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x + 2, p.y + 4, 7 * VIEW.zoom, 5 * VIEW.zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.state === 'down' ? '#5a6474' : ped.shirt;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7.5 * VIEW.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 3 * VIEW.zoom, 4 * VIEW.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBullets(game) {
    const ctx = this.ctx;
    for (const bullet of game.player.bullets) {
      const p = this.toScreen(bullet.x, bullet.y);
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - bullet.vx * 0.008, p.y - bullet.vy * 0.008);
      ctx.stroke();
    }
  }

  drawPlayer(game) {
    const player = game.player;
    const ctx = this.ctx;
    if (player.car) {
      // Headlight cone while driving, drawn under the car so it reads at night.
      const p = this.toScreen(player.car.x, player.car.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(player.car.angle);
      const gradient = ctx.createLinearGradient(0, 0, 320 * VIEW.zoom, 0);
      gradient.addColorStop(0, 'rgba(242,201,107,0.18)');
      gradient.addColorStop(1, 'rgba(242,201,107,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(320 * VIEW.zoom, -90 * VIEW.zoom);
      ctx.lineTo(320 * VIEW.zoom, 90 * VIEW.zoom);
      ctx.lineTo(0, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    const p = this.toScreen(player.x, player.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(2, 5, 9 * VIEW.zoom, 6 * VIEW.zoom, 0, 0, Math.PI * 2);
    ctx.fill();

    // Halo first, so the player never gets lost against asphalt or a shadow.
    ctx.fillStyle = 'rgba(242,181,68,0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, 26 * VIEW.zoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(player.aim);
    ctx.fillStyle = '#0b0f14';
    ctx.beginPath();
    ctx.arc(0, 0, 14 * VIEW.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 11.5 * VIEW.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6efe3';
    ctx.beginPath();
    ctx.arc(2 * VIEW.zoom, 0, 5 * VIEW.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(9 * VIEW.zoom, -2.6 * VIEW.zoom, 18 * VIEW.zoom, 5.2 * VIEW.zoom);
    ctx.fillStyle = '#d9d2c5';
    ctx.fillRect(9 * VIEW.zoom, -1.6 * VIEW.zoom, 17 * VIEW.zoom, 3.2 * VIEW.zoom);
    if (player.fireCooldown > 0.1) {
      ctx.fillStyle = 'rgba(255,232,160,0.9)';
      ctx.beginPath();
      ctx.arc(20 * VIEW.zoom, 0, 4 * VIEW.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Health pip above the head, only when it is not full.
    if (player.health < 100) {
      const width = 34;
      const ratio = player.health / 100;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x - width / 2, p.y - 24, width, 4);
      ctx.fillStyle = ratio > 0.4 ? '#58d6c4' : '#e2705f';
      ctx.fillRect(p.x - width / 2, p.y - 24, width * ratio, 4);
    }
  }

  drawWeather(night, game) {
    const ctx = this.ctx;
    if (night > 0.05) {
      ctx.fillStyle = `rgba(8, 12, 22, ${night * 0.34})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }

    // Streetlight pools along the roads at night.
    if (night > 0.4) {
      const topLeft = this.toWorld(0, 0);
      const bottomRight = this.toWorld(VIEW.width, VIEW.height);
      const firstCol = Math.max(0, Math.floor(topLeft.x / TILE) - 1);
      const lastCol = Math.min(CITY_COLS - 1, Math.ceil(bottomRight.x / TILE) + 1);
      const firstRow = Math.max(0, Math.floor(topLeft.y / TILE) - 1);
      const lastRow = Math.min(CITY_ROWS - 1, Math.ceil(bottomRight.y / TILE) + 1);
      for (let col = firstCol; col <= lastCol; col += ROAD_EVERY) {
        for (let row = firstRow; row <= lastRow; row += ROAD_EVERY) {
          const p = this.toScreen(col * TILE + TILE / 2, row * TILE + TILE / 2);
          const radius = 90 * VIEW.zoom;
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
          glow.addColorStop(0, `rgba(242,201,107,${0.16 * night})`);
          glow.addColorStop(1, 'rgba(242,201,107,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
        }
      }
    }

    // Damage vignette.
    if (game.player.hitFlash > 0) {
      ctx.fillStyle = `rgba(226,112,95,${game.player.hitFlash * 0.5})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }

    const vignette = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.35, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
