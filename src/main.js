// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, upgrade, play,
// paused and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=title|play|boss|over (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BOSS_DOWN, EVENT_DASH, EVENT_ENEMY_SHOOT, EVENT_HIT, EVENT_KILL,
  EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_WAVE_CLEAR,
} from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;

  // A handle for scripted playtests: the world, the screen and the controls.
  window.__lumen = {
    world,
    renderer,
    get screen() { return screen; },
    start: startGame,
    choose,
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    audio.waveStart();
    announce('Playing. Wave 1. 5 hull.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.gameOver();
    audio.stopMusic();
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function choose(n) {
    const choices = world.state.choices;
    if (n < 1 || n > choices.length) return;
    const picked = choices[n - 1];
    world.applyUpgrade(picked.id);
    audio.uiClick();
    const next = world.state.wave + 1;
    world.startWave(next);
    screen = SCREEN_PLAY;
    if (next % 5 === 0) audio.bossAlarm();
    else audio.waveStart();
    announce(`Wave ${next}. Upgrade: ${picked.name}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_DASH) dashQueued = true;
    if (screen === SCREEN_UPGRADE) {
      const digit = input.takeDigit();
      if (digit >= 1) choose(digit);
      const click = input.takeClick();
      if (click) {
        const f = renderer.toField(click.x, click.y);
        const rects = renderer.upgradeCardRects(world.state.choices.length);
        for (let i = 0; i < rects.length; i += 1) {
          const r = rects[i];
          if (f.x >= r.x && f.x <= r.x + r.width && f.y >= r.y && f.y <= r.y + r.height) choose(i + 1);
        }
      }
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function handleEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_ENEMY_SHOOT) audio.enemyShoot();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_KILL) audio.explosion(false);
    if (events & EVENT_BOSS_DOWN) audio.explosion(true);
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_WAVE_CLEAR) {
      world.upgradeChoices();
      // Flush inputs pressed during the fight: a stale click or digit must not
      // pick a card the moment this screen opens.
      input.takeClick();
      input.takeDigit();
      screen = SCREEN_UPGRADE;
      audio.waveStart();
      announce(`Wave ${world.state.wave} cleared. Choose an upgrade.`);
    }
    if (events & EVENT_OVER) endGame();
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      const p = world.state.player;
      const a = world.state.time * 0.4;
      world.step(STEP, { mx: 0, my: 0, aimX: p.x + Math.cos(a) * 100, aimY: p.y + Math.sin(a) * 100, firing: false, dash: false }, true);
      return;
    }
    const move = input.move();
    const aimClient = input.aim();
    const aim = renderer.toField(aimClient.x, aimClient.y);
    const events = world.step(STEP, {
      mx: move.x, my: move.y, aimX: aim.x, aimY: aim.y,
      firing: input.firing(), dash: dashQueued,
    }, false);
    dashQueued = false;
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, audio.isMuted());
  }

  // Leaving the tab pauses a running game rather than letting the swarm fire unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // The title screen's backdrop: a wave drifting by, harmless.
  world.reset();
  world.startWave(1);
  announce('Lumen Drift. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
