// The screenshot scenes behind ?shot=title|play|boss|over. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (kite the nearest enemy at range, aim at it, dash clear of bullets), so
// the frame is what a short game really looks like and the same seed always gives
// the same frame. The end scene's pilot is reckless on purpose, so it is caught
// out and the game-over screen is real.
import { STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TITLE_SECONDS = 9;
const PLAY_SECONDS = 18;
const BOSS_SECONDS = 15;
const END_LIMIT_SECONDS = 150;

function nearestEnemy(state) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Kite at range, aim at the target, dash when something closes in. */
function autopilot(state) {
  const p = state.player;
  const e = nearestEnemy(state);
  if (!e) return { mx: 0, my: 0, aimX: p.x + 100, aimY: p.y, firing: true, dash: false };
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const radial = d < 200 ? 1 : d > 300 ? -1 : 0;
  const strafe = Math.sin(state.time * 1.3) > 0 ? 1 : -1;
  let mx = (dx / d) * radial + (-dy / d) * strafe * 0.7;
  let my = (dy / d) * radial + (dx / d) * strafe * 0.7;
  const m = Math.hypot(mx, my) || 1;
  mx /= m;
  my /= m;
  let dash = false;
  for (const b of state.ebullets) {
    if (Math.hypot(b.x - p.x, b.y - p.y) < 80) { dash = true; break; }
  }
  if (!dash) {
    for (const en of state.enemies) {
      if ((en.kind === 'chaser' || en.kind === 'mini') && Math.hypot(en.x - p.x, en.y - p.y) < 70) {
        dash = true;
        break;
      }
    }
  }
  return { mx, my, aimX: e.x, aimY: e.y, firing: true, dash };
}

/** Run straight at the nearest enemy and never dash: a hurried player. */
function reckless(state) {
  const p = state.player;
  const e = nearestEnemy(state);
  if (!e) return { mx: 0, my: 0, aimX: p.x + 100, aimY: p.y, firing: true, dash: false };
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  return { mx: dx / d, my: dy / d, aimX: e.x, aimY: e.y, firing: true, dash: false };
}

function idleInput(state) {
  const p = state.player;
  const a = state.time * 0.4;
  return { mx: 0, my: 0, aimX: p.x + Math.cos(a) * 100, aimY: p.y + Math.sin(a) * 100, firing: false, dash: false };
}

/**
 * Set `world` to the named scene (title, play, boss or over; any other name is
 * title) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name !== 'play' && name !== 'boss' && name !== 'over') {
    world.startWave(1);
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.step(STEP, idleInput(state), true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'boss') {
    world.startWave(5);
    for (let i = 0; i < BOSS_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(state), false);
      if (state.over) break;
    }
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'over') {
    world.startWave(1);
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      const events = world.step(STEP, reckless(state), false);
      if (events & EVENT_WAVE_CLEAR) {
        world.upgradeChoices();
        world.applyUpgrade(state.choices[0].id);
        world.startWave(state.wave + 1);
      }
      if (events & EVENT_OVER) break;
    }
    if (!state.over) world.killPlayer();
    return { screen: SCREEN_OVER, best: state.score };
  }
  world.startWave(1);
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
    const events = world.step(STEP, autopilot(state), false);
    if (events & EVENT_WAVE_CLEAR) {
      world.upgradeChoices();
      world.applyUpgrade(state.choices[0].id);
      world.startWave(state.wave + 1);
    }
    if (events & EVENT_OVER) break;
  }
  return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
}
