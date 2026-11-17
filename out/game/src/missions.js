// Missions: a short chain of three jobs, each with a marker, an objective the HUD can state, a
// condition the main loop can test, and a payout. The chain is what gives the city a reason to be
// crossed; nothing else in the game depends on the order.

import { MISSIONS } from './config.js';

export class MissionBoard {
  constructor(world) {
    this.world = world;
    this.entries = MISSIONS.map((mission) => ({
      ...mission,
      state: 'locked',      // locked | available | active | done
      startPoint: world.roadPointAt(mission.start.col, mission.start.row),
      targetPoint: world.roadPointAt(mission.target.col, mission.target.row),
    }));
    this.entries[0].state = 'available';
    this.active = null;
    this.toast = null;
    this.toastTimer = 0;
  }

  get next() {
    return this.entries.find((entry) => entry.state === 'available') || null;
  }

  /** Offer the mission the player is standing in, if any. */
  offerAt(position, radius = 70) {
    const entry = this.next;
    if (!entry) return null;
    return Math.hypot(entry.startPoint.x - position.x, entry.startPoint.y - position.y) < radius ? entry : null;
  }

  start(entry) {
    entry.state = 'active';
    this.active = entry;
    this.say(`${entry.label}: ${entry.brief}`, 6);
    return entry;
  }

  say(text, seconds = 4) {
    this.toast = text;
    this.toastTimer = seconds;
  }

  /** Called every frame while a mission runs. Returns { done, failed, reason }. */
  update(dt, player, police) {
    if (this.toastTimer > 0) this.toastTimer -= dt;
    const entry = this.active;
    if (!entry) return { done: false, failed: false };

    const position = player.position;
    const toTarget = Math.hypot(entry.targetPoint.x - position.x, entry.targetPoint.y - position.y);

    if (entry.kind === 'deliver-car') {
      if (!player.car) return { done: false, failed: false, hint: 'Get back in the car' };
      if (toTarget < 90) return this.complete(entry, player);
    }

    if (entry.kind === 'collect-on-foot') {
      if (player.mode !== 'foot') return { done: false, failed: false, hint: 'Get out of the car' };
      if (toTarget < 60) return this.complete(entry, player);
    }

    if (entry.kind === 'escape-with-heat') {
      if (police.stars < 3) police.addStars(3 - police.stars);
      if (toTarget < 90) return this.complete(entry, player);
    }

    return { done: false, failed: false };
  }

  complete(entry, player) {
    entry.state = 'done';
    this.active = null;
    player.cash += entry.reward;
    this.say(`${entry.name} done — $${entry.reward}`, 5);
    const next = this.entries.find((item) => item.state === 'locked');
    if (next) next.state = 'available';
    return { done: true, failed: false, reward: entry.reward };
  }

  objectiveText(player) {
    if (!this.active) {
      const next = this.next;
      return next ? `Go to the ${next.label} marker` : 'The strip is yours tonight';
    }
    const position = player.position;
    const to = Math.round(Math.hypot(this.active.targetPoint.x - position.x, this.active.targetPoint.y - position.y) / 8);
    if (this.active.kind === 'collect-on-foot') return `${this.active.name}: collect on foot — ${to} m`;
    if (this.active.kind === 'deliver-car') return `${this.active.name}: deliver the car — ${to} m`;
    return `${this.active.name}: reach the marina with 3 stars — ${to} m`;
  }

  /** The point the HUD should point at (mission start when idle, target when active). */
  marker() {
    if (this.active) return { point: this.active.targetPoint, kind: this.active.kind };
    const next = this.next;
    return next ? { point: next.startPoint, kind: 'start' } : null;
  }
}
