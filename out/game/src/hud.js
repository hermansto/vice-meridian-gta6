// The HUD is DOM on top of the canvas: wanted stars, cash, the clock, the objective line, the
// prompt, the toast, the speedometer and the minimap. It only reads the game state each frame.

import { TILE, CITY_COLS, CITY_ROWS, ROAD_EVERY, PALETTE } from './config.js';

const el = (id) => document.getElementById(id);

export class Hud {
  constructor(world) {
    this.world = world;
    this.root = el('hud');
    this.stars = el('stars');
    this.cash = el('cash');
    this.clock = el('clock');
    this.objective = el('objective-text');
    this.objectiveLabel = el('objective-label');
    this.prompt = el('prompt');
    this.toast = el('toast');
    this.speedo = el('speedo');
    this.speedValue = el('speed-value');
    this.district = el('district');
    this.minimap = el('minimap');
    this.map = this.minimap.getContext('2d');
    this.lastStars = -1;
  }

  show(visible) {
    this.root.hidden = !visible;
  }

  update(game) {
    const { player, police, missions, clock } = game;

    if (police.stars !== this.lastStars) {
      this.stars.innerHTML = Array.from({ length: 5 }, (_, index) =>
        `<span class="star ${index < police.stars ? 'on' : ''}">★</span>`).join('');
      this.lastStars = police.stars;
    }

    this.cash.textContent = `$${player.cash.toLocaleString('en-US')}`;
    this.clock.textContent = clock.label();
    this.objective.textContent = missions.objectiveText(player);
    this.objectiveLabel.textContent = missions.active ? missions.active.label : 'NEXT';

    if (game.offer) {
      this.prompt.hidden = false;
      this.prompt.textContent = `F — start ${game.offer.name}`;
    } else if (game.promptText) {
      this.prompt.hidden = false;
      this.prompt.textContent = game.promptText;
    } else {
      this.prompt.hidden = true;
    }

    if (missions.toastTimer > 0 && missions.toast) {
      this.toast.hidden = false;
      this.toast.textContent = missions.toast;
    } else {
      this.toast.hidden = true;
    }

    if (player.car) {
      this.speedo.hidden = false;
      this.speedValue.textContent = String(Math.round(Math.abs(player.car.speed) / 3.2));
    } else {
      this.speedo.hidden = true;
    }

    this.district.textContent = this.world.districtAt(player.position.x, player.position.y);
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.map;
    const size = this.minimap.width;
    const scale = size / (CITY_COLS * TILE);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#10161c';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#2b3641';
    ctx.lineWidth = Math.max(1, TILE * scale * 0.75);
    for (let col = 0; col < CITY_COLS; col += ROAD_EVERY) {
      ctx.beginPath();
      ctx.moveTo(col * TILE * scale, 0);
      ctx.lineTo(col * TILE * scale, size);
      ctx.stroke();
    }
    for (let row = 0; row < CITY_ROWS; row += ROAD_EVERY) {
      ctx.beginPath();
      ctx.moveTo(0, row * TILE * scale);
      ctx.lineTo(size, row * TILE * scale);
      ctx.stroke();
    }

    // Blocks, so the map reads as a city rather than a grid.
    ctx.fillStyle = '#1b2430';
    for (const block of this.world.blocks) {
      ctx.fillRect(block.col * TILE * scale + 1, block.row * TILE * scale + 1, TILE * scale - 2, TILE * scale - 2);
    }

    const marker = game.missions.marker();
    if (marker) {
      const mx = marker.point.x * scale;
      const my = marker.point.y * scale;
      ctx.fillStyle = '#f2b544';
      ctx.beginPath();
      ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(242,181,68,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 7.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const car of game.police.cars) {
      ctx.fillStyle = '#4f8ef7';
      ctx.fillRect(car.x * scale - 1.5, car.y * scale - 1.5, 3, 3);
    }

    const pos = game.player.position;
    const px = pos.x * scale;
    const py = pos.y * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(game.player.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // A ring so the player is findable at a glance on the small map.
    ctx.strokeStyle = 'rgba(242,181,68,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.stroke();
  }
}
