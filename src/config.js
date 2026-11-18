// Every tuning number and colour for Lumen Drift, in one place. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window, so no rule
// below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  accel: 2600,
  maxSpeed: 340,
  fireInterval: 0.16,
  bulletSpeed: 720,
  damage: 1,
  dashSpeed: 980,
  dashTime: 0.16,
  dashCooldown: 2.4,
  invulnerable: 1.2,
  magnet: 90,
  maxHp: 5,
};

export const BULLET = { radius: 4, life: 1.1 };

export const ENEMY = {
  chaser: { radius: 16, hp: 3, speed: 150, score: 50 },
  shooter: { radius: 15, hp: 2, speed: 115, score: 75, range: 300, fireInterval: 2.1 },
  splitter: { radius: 18, hp: 5, speed: 85, score: 100 },
  mini: { radius: 10, hp: 1, speed: 235, score: 25 },
  boss: { radius: 48, hp: 170, speed: 62, score: 1000 },
};

export const ENEMY_BULLET = { radius: 6, speed: 260 };

export const PICKUP = { radius: 12, magnetSpeed: 430, life: 12 };

export const WAVE = { spawnInterval: 0.7, clearBonus: 100 };

export const PALETTE = {
  backdrop: '#05060f',
  sky: '#0a0d24',
  grid: '#141a3a',
  player: '#4de8ff',
  playerCore: '#eafcff',
  bullet: '#aef3ff',
  enemyBullet: '#ff5fa2',
  chaser: '#ff5d5d',
  shooter: '#ffb347',
  splitter: '#c77dff',
  mini: '#ff8fa3',
  boss: '#ff2e63',
  heart: '#ff4d6d',
  heartEmpty: '#3a2b3f',
  gem: '#7dffce',
  shield: '#6ea8ff',
  text: '#eaf2ff',
  muted: '#8b93b8',
  gold: '#ffd166',
  panel: '#12162e',
  panelEdge: '#2c3a6e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen-drift.best';
