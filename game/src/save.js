// Saving is one JSON blob in localStorage: where the player is, what he owns, which missions are
// done, and the clock. Loading rebuilds the player and the mission board around those facts; the
// city itself is generated from its seed, so it never needs saving.

import { STORAGE_KEY } from './config.js';

export function hasSave() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function writeSave(game) {
  const { player, police, missions, clock } = game;
  const data = {
    version: 1,
    at: Date.now(),
    player: {
      x: player.x,
      y: player.y,
      angle: player.angle,
      health: player.health,
      cash: player.cash,
      mode: player.mode,
      car: player.car ? { x: player.car.x, y: player.car.y, angle: player.car.angle, kind: player.car.kind, color: player.car.color } : null,
    },
    policeStars: police.stars,
    missions: missions.entries.map((entry) => ({ id: entry.id, state: entry.state })),
    active: missions.active ? missions.active.id : null,
    minutes: clock.minutes,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: a browser that refuses storage simply never saves.
  }
}
