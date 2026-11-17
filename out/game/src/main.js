// The game loop and the state machine: title, playing, paused, busted. Everything else is a module
// this file wires together; it owns the clock, the spawn counts and the keyboard shortcuts that are
// not movement (enter a car, start a job, pause, save).

import { VIEW, TILE, PALETTE } from './config.js';
import { createWorld } from './world.js';
import { installInput } from './input.js';
import { spawnTraffic, spawnParked, Car } from './vehicles.js';
import { spawnPeds, Ped } from './peds.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { MissionBoard } from './missions.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { hasSave, writeSave, readSave, clearSave } from './save.js';

const canvas = document.getElementById('screen');
const world = createWorld();
const input = installInput(canvas);
const renderer = new Renderer(canvas, world);
const hud = new Hud(world);
const audio = new Audio();

const clock = {
  minutes: 9.5 * 60,                   // 09:30, a bright first look
  advance(dt) {
    this.minutes = (this.minutes + dt * 2.2) % (24 * 60);   // a game day in ~11 minutes
  },
  get hour() { return Math.floor(this.minutes / 60); },
  label() {
    const h = String(Math.floor(this.minutes / 60)).padStart(2, '0');
    const m = String(Math.floor(this.minutes % 60)).padStart(2, '0');
    return `${h}:${m}`;
  },
  /** 0 at noon, 1 at midnight, with two soft shoulders. */
  nightness() {
    const h = this.minutes / 60;
    if (h >= 20 || h < 5) return 1;
    if (h >= 18) return (h - 18) / 2;
    if (h < 7) return 1 - (h - 5) / 2;
    return 0;
  },
};

const game = {
  state: 'title',                       // title | playing | paused | over
  player: new Player(world.width / 2, world.height / 2),
  police: new Police(world),
  missions: new MissionBoard(world),
  traffic: [],
  parked: [],
  peds: [],
  clock,
  offer: null,
  promptText: '',
  time: 0,
};

function resetWorld() {
  const spawn = world.roadPointAt(18, 18);
  game.player = new Player(spawn.x, spawn.y);
  game.police = new Police(world);
  game.missions = new MissionBoard(world);
  game.traffic = spawnTraffic(world, 42);
  game.parked = spawnParked(world, 18);
  // One car within reach of the spawn, so the first thing a new player can do is take it.
  game.parked.push(new Car({
    x: spawn.x + 54,
    y: spawn.y + 8,
    angle: 0,
    color: '#6b5a4a',
    kind: 'sedan',
    driver: 'parked',
  }));
  game.peds = spawnPeds(world, 110);
  // A handful of people and cars around the spawn, so the first frame is a street and not a car park.
  for (let i = 0; i < 14; i += 1) {
    game.peds.push(new Ped({
      x: spawn.x + (Math.random() - 0.5) * 520,
      y: spawn.y + (Math.random() - 0.5) * 380,
      angle: Math.random() * Math.PI * 2,
    }));
  }
  clock.minutes = 9.5 * 60;
  renderer.camera.x = spawn.x;
  renderer.camera.y = spawn.y;
  game.state = 'playing';
  game.offer = null;
  document.getElementById('hud').hidden = false;
  document.getElementById('title').hidden = true;
}

function resumeFromSave() {
  const save = readSave();
  if (!save) return false;
  resetWorld();
  game.player.x = save.player.x;
  game.player.y = save.player.y;
  game.player.angle = save.player.angle;
  game.player.health = save.player.health;
  game.player.cash = save.player.cash;
  if (save.player.car) {
    const car = new Car({ ...save.player.car, driver: 'player' });
    game.player.enterCar(car);
  }
  clock.minutes = save.minutes ?? 9.5 * 60;
  game.police.stars = save.policeStars ?? 0;
  for (const entry of save.missions || []) {
    const target = game.missions.entries.find((item) => item.id === entry.id);
    if (target) target.state = entry.state;
  }
  if (save.active) {
    const active = game.missions.entries.find((item) => item.id === save.active && item.state === 'active');
    game.missions.active = active || null;
  }
  renderer.camera.x = game.player.x;
  renderer.camera.y = game.player.y;
  return true;
}

function nearestCar(range = 78) {
  const pos = game.player.position;
  let best = null;
  let bestDistance = range;
  for (const car of [...game.parked, ...game.traffic, ...game.police.cars]) {
    if (car.driver === 'police') continue;
    const distance = Math.hypot(car.x - pos.x, car.y - pos.y);
    if (distance < bestDistance) {
      best = car;
      bestDistance = distance;
    }
  }
  return best;
}

function steal(car) {
  if (!car) return;
  game.player.enterCar(car);
  if (car.driver === 'traffic') {
    game.police.addStars(1);
    audio.chime(false);
  }
  car.driver = 'player';
  game.promptText = '';
}

function busted() {
  game.state = 'over';
  game.police.busted = false;
  document.getElementById('go-title').textContent = 'Busted';
  document.getElementById('go-text').textContent = `The stripes took you in. You kept $${Math.max(0, game.player.cash - 250)} of the take.`;
  game.player.cash = Math.max(0, game.player.cash - 250);
  document.getElementById('gameover').hidden = false;
  hud.show(false);
}

function wasted() {
  game.state = 'over';
  document.getElementById('go-title').textContent = 'Wasted';
  document.getElementById('go-text').textContent = 'You woke up on the kerb with empty pockets and a headache.';
  game.player.cash = Math.max(0, Math.round(game.player.cash * 0.7));
  document.getElementById('gameover').hidden = false;
  hud.show(false);
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    document.getElementById('pause').hidden = false;
  } else if (game.state === 'paused') {
    game.state = 'playing';
    document.getElementById('pause').hidden = true;
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
  frame.last = now;

  if (game.state === 'playing') update(dt);
  if (game.state === 'playing' || game.state === 'paused' || game.state === 'over') renderer.draw(game, game.state === 'playing' ? dt : 0);
  if (game.state === 'playing') hud.update(game);
  input.endFrame();
  requestAnimationFrame(frame);
}

function update(dt) {
  game.time += dt;
  clock.advance(dt);

  const player = game.player;
  const mouse = input.mouse;
  const view = renderer.camera;
  mouse.worldX = (mouse.x - VIEW.width / 2) / VIEW.zoom + view.x;
  mouse.worldY = (mouse.y - VIEW.height / 2) / VIEW.zoom + view.y;

  if (input.keys.pressed('escape')) togglePause();
  if (game.state !== 'playing') return;

  if (player.mode === 'car') player.driveCar(dt, world, input);
  else player.updateOnFoot(dt, world, input, mouse, renderer.camera);

  // Enter / exit a car.
  if (input.keys.pressed('e')) {
    if (player.car) {
      player.exitCar(world);
    } else {
      steal(nearestCar(80));
    }
  }

  // Missions.
  const offer = game.missions.offerAt(player.position, 82);
  game.offer = offer;
  if (offer && input.keys.pressed('f')) {
    game.missions.start(offer);
    audio.chime(true);
  }
  const result = game.missions.update(dt, player, game.police);
  if (result.done) audio.chime(true);

  // Gunfire: make noise, get heat, and hurt whoever is in front.
  if (player.shotsFired > 0) {
    player.shotsFired = 0;
    audio.shot();
    game.police.reportGunshot(player.position.x, player.position.y);
    renderer.shake(4);
    for (const ped of game.peds) {
      if (Math.hypot(ped.x - player.x, ped.y - player.y) < 60) ped.knockDown();
    }
  }

  // Traffic and pedestrians.
  for (const car of game.traffic) {
    const ahead = !game.traffic.some((other) => other !== car
      && Math.hypot(other.x - car.x, other.y - car.y) < 90
      && Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y) > 0);
    car.driveTraffic(dt, world, ahead, Math.random);
  }
  const danger = player.mode === 'foot' && player.shotsFired ? player.position : null;
  for (const ped of game.peds) {
    ped.update(dt, world, { dangerAt: game.police.stars > 0 ? player.position : danger, playerPos: player.position });
  }

  game.police.update(dt, player, world);
  if (game.police.busted) busted();
  if (player.health <= 0) wasted();
  player.hitFlash = Math.max(0, player.hitFlash - dt);

  // Audio follows the car and the nearest patrol.
  const nearest = game.police.cars.reduce((min, car) => {
    const d = Math.hypot(car.x - player.position.x, car.y - player.position.y);
    return Math.min(min, d);
  }, Infinity);
  audio.updateEngine(player.car ? player.car.speed : 0, !!player.car);
  audio.updateSiren(game.police.stars > 0, nearest === Infinity ? 4000 : nearest);

  if (input.keys.pressed('m')) {
    // A quick map: zoom the camera out for a moment.
    renderer.camera.shake = 0;
  }

  renderer.updateCamera(player, dt);
  game.promptText = player.car ? '' : (nearestCar(80) ? 'E — take the car' : '');
}

// ---- UI wiring ----
document.getElementById('btn-new').addEventListener('click', () => {
  clearSave();
  audio.ensure();
  resetWorld();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  audio.ensure();
  if (!resumeFromSave()) resetWorld();
});
document.getElementById('btn-help').addEventListener('click', () => { document.getElementById('help').hidden = false; });
document.getElementById('btn-help-close').addEventListener('click', () => { document.getElementById('help').hidden = true; });
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-save').addEventListener('click', () => {
  const ok = writeSave(game);
  document.getElementById('btn-save').textContent = ok ? 'Saved' : 'Cannot save here';
  setTimeout(() => { document.getElementById('btn-save').textContent = 'Save game'; }, 1600);
});
document.getElementById('btn-quit').addEventListener('click', () => {
  game.state = 'title';
  document.getElementById('pause').hidden = true;
  document.getElementById('hud').hidden = true;
  document.getElementById('title').hidden = false;
  document.getElementById('btn-continue').hidden = !hasSave();
});
document.getElementById('btn-respawn').addEventListener('click', () => {
  document.getElementById('gameover').hidden = true;
  const spawn = world.roadPointAt(18, 18);
  game.player.x = spawn.x;
  game.player.y = spawn.y;
  game.player.health = 100;
  if (game.player.car) game.player.exitCar(world);
  game.police.clear();
  game.state = 'playing';
  hud.show(true);
});
document.getElementById('btn-go-title').addEventListener('click', () => {
  document.getElementById('gameover').hidden = true;
  game.state = 'title';
  document.getElementById('title').hidden = false;
  document.getElementById('btn-continue').hidden = !hasSave();
});

document.getElementById('btn-continue').hidden = !hasSave();
window.addEventListener('resize', () => {
  const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
  canvas.style.width = `${VIEW.width * scale}px`;
  canvas.style.height = `${VIEW.height * scale}px`;
});
window.dispatchEvent(new Event('resize'));

// A hook for the maker's screenshots and for poking at the world in a console.
window.__game = game;
window.__world = world;

requestAnimationFrame(frame);
