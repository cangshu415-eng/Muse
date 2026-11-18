// The game's rules and state, with no drawing and no browser in it: the player's
// ship, bullets, three enemy kinds plus a boss, pickups, waves, upgrades, score and
// hull. step() advances one fixed step and returns what happened as bit flags, so
// the caller can react (sound, announcements) without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns, except the
// small arrays that grow and shrink with the fight.

import { BULLET, ENEMY, ENEMY_BULLET, FIELD, PICKUP, PLAYER, WAVE } from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_OVER = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_PICKUP = 32;
export const EVENT_BOSS_DOWN = 64;
export const EVENT_DASH = 128;
export const EVENT_ENEMY_SHOOT = 256;

/** The upgrades offered between waves. apply() stacks sensibly when picked twice. */
export const UPGRADES = [
  { id: 'overclock', name: 'Overclocked Cannon', desc: '+25% bullet damage', apply: (s) => { s.stats.damage += 0.25; } },
  { id: 'rapid', name: 'Rapid Cycler', desc: '+20% fire rate', apply: (s) => { s.stats.fireInterval *= 0.83; } },
  { id: 'thrusters', name: 'Ion Thrusters', desc: '+15% move speed', apply: (s) => { s.stats.moveSpeed *= 1.15; } },
  { id: 'hull', name: 'Reinforced Hull', desc: '+1 max hull, restore 1', apply: (s) => { s.maxHp += 1; s.hp = Math.min(s.maxHp, s.hp + 1); } },
  { id: 'twin', name: 'Twin Barrels', desc: '+1 projectile per shot', apply: (s) => { s.stats.projectiles = Math.min(4, s.stats.projectiles + 1); } },
  { id: 'pierce', name: 'Piercing Rounds', desc: 'Bullets pierce +1 enemy', apply: (s) => { s.stats.pierce += 1; } },
  { id: 'dashcap', name: 'Dash Capacitor', desc: '-30% dash cooldown', apply: (s) => { s.stats.dashCooldown *= 0.7; } },
  { id: 'magnet', name: 'Magnet Core', desc: 'Pickups fly to you from 2x as far', apply: (s) => { s.stats.magnet *= 2; } },
  { id: 'nanobots', name: 'Nanobots', desc: 'Regenerate 1 hull every 25s', apply: (s) => { s.stats.regen = s.stats.regen > 0 ? 18 : 25; } },
  { id: 'blast', name: 'Blast Rounds', desc: 'Bullets explode on impact', apply: (s) => { s.stats.blast = true; } },
];

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
    invuln: 0, dashTime: 0, dashCd: 0, dashX: 0, dashY: 0, fireCd: 0, shield: 0, regenT: 0,
  };
  const stats = {
    damage: PLAYER.damage, fireInterval: PLAYER.fireInterval, bulletSpeed: PLAYER.bulletSpeed,
    moveSpeed: PLAYER.maxSpeed, projectiles: 1, pierce: 0, dashCooldown: PLAYER.dashCooldown,
    magnet: PLAYER.magnet, regen: 0, blast: false,
  };
  const state = {
    time: 0, wave: 0, score: 0, kills: 0, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp,
    player, stats, bullets: [], ebullets: [], enemies: [], pickups: [], particles: [], floaters: [],
    spawnQueue: [], spawnTimer: 0, waveActive: false, boss: null,
    shake: 0, flash: 0, banner: null, over: false, choices: [],
  };

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.invuln = 0;
    player.dashTime = 0;
    player.dashCd = 0;
    player.fireCd = 0;
    player.shield = 0;
    player.regenT = 0;
    stats.damage = PLAYER.damage;
    stats.fireInterval = PLAYER.fireInterval;
    stats.bulletSpeed = PLAYER.bulletSpeed;
    stats.moveSpeed = PLAYER.maxSpeed;
    stats.projectiles = 1;
    stats.pierce = 0;
    stats.dashCooldown = PLAYER.dashCooldown;
    stats.magnet = PLAYER.magnet;
    stats.regen = 0;
    stats.blast = false;
    state.time = 0;
    state.wave = 0;
    state.score = 0;
    state.kills = 0;
    state.hp = PLAYER.maxHp;
    state.maxHp = PLAYER.maxHp;
    state.bullets.length = 0;
    state.ebullets.length = 0;
    state.enemies.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.floaters.length = 0;
    state.spawnQueue.length = 0;
    state.spawnTimer = 0;
    state.waveActive = false;
    state.boss = null;
    state.shake = 0;
    state.flash = 0;
    state.banner = null;
    state.over = false;
    state.choices = [];
  }

  function burst(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length >= 420) return;
      const a = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.5 + random() * 0.5), maxLife: life, size: 2 + random() * 3, color,
      });
    }
  }

  function floater(x, y, text, color) {
    if (state.floaters.length >= 24) state.floaters.shift();
    state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  function spawnPoint() {
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = Math.floor(random() * 4);
      let x = 0;
      let y = 0;
      if (edge === 0) { x = 30 + random() * (FIELD.width - 60); y = 30; }
      else if (edge === 1) { x = 30 + random() * (FIELD.width - 60); y = FIELD.height - 30; }
      else if (edge === 2) { x = 30; y = 30 + random() * (FIELD.height - 60); }
      else { x = FIELD.width - 30; y = 30 + random() * (FIELD.height - 60); }
      if (dist2(x, y, player.x, player.y) > 260 * 260) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function makeEnemy(kind) {
    const def = ENEMY[kind];
    const hpMul = 1 + 0.09 * (state.wave - 1);
    const spMul = Math.min(1.5, 1 + 0.025 * (state.wave - 1));
    const p = spawnPoint();
    const enemy = {
      kind, x: p.x, y: p.y, vx: 0, vy: 0,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul, r: def.radius,
      speed: def.speed * spMul, score: def.score,
      t: random() * 10, fireT: 1 + random(), strafe: random() < 0.5 ? -1 : 1, strafeT: 2 + random() * 2,
      angle: 0, patternT: 2.5, patternIdx: 0, burstLeft: 0, burstT: 0,
      charging: 0, chargeVx: 0, chargeVy: 0, flash: 0,
    };
    state.enemies.push(enemy);
    if (kind === 'boss') state.boss = enemy;
    return enemy;
  }

  function buildWave(n) {
    const queue = [];
    if (n % 5 === 0) {
      queue.push('boss');
      const extra = 2 + Math.floor(n / 5);
      for (let i = 0; i < extra; i += 1) queue.push('chaser');
      for (let i = 0; i < Math.floor(n / 2); i += 1) queue.push('shooter');
    } else {
      for (let i = 0; i < 3 + n; i += 1) queue.push('chaser');
      for (let i = 0; i < 1 + Math.floor(n / 2); i += 1) queue.push('shooter');
      if (n >= 2) for (let i = 0; i < 1 + Math.floor(n / 2); i += 1) queue.push('splitter');
    }
    // Shuffle everything after the boss, so the wave never arrives in one clump.
    for (let i = queue.length - 1; i > 1; i -= 1) {
      const j = 1 + Math.floor(random() * i);
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    return queue;
  }

  function startWave(n) {
    state.wave = n;
    state.spawnQueue = buildWave(n);
    state.spawnTimer = 0.6;
    state.waveActive = true;
    state.banner = n % 5 === 0
      ? { text: `WAVE ${n}`, sub: 'WARDEN INCOMING', t: 2.2 }
      : { text: `WAVE ${n}`, sub: '', t: 1.6 };
  }

  function upgradeChoices() {
    const pool = UPGRADES.slice();
    const picks = [];
    while (picks.length < 3 && pool.length > 0) {
      picks.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    }
    state.choices = picks;
    return picks;
  }

  function applyUpgrade(id) {
    const up = UPGRADES.find((u) => u.id === id);
    if (up) up.apply(state);
  }

  function dropPickup(x, y, force) {
    const roll = force || random();
    let kind = null;
    if (force === 'heart' || roll < 0.08) kind = 'heart';
    else if (force === 'shield' || roll < 0.13) kind = 'shield';
    else if (force === 'gem' || roll < 0.23) kind = 'gem';
    if (!kind) return;
    if (state.pickups.length >= 24) return;
    state.pickups.push({ kind, x, y, vx: 0, vy: 0, life: PICKUP.life, t: random() * 10 });
  }

  function killEnemy(enemy, index) {
    state.enemies.splice(index, 1);
    state.score += enemy.score;
    state.kills += 1;
    floater(enemy.x, enemy.y - 10, `+${enemy.score}`, '#eaf2ff');
    const color = enemy.kind === 'boss' ? '#ff2e63' : enemy.kind === 'shooter' ? '#ffb347' : enemy.kind === 'splitter' ? '#c77dff' : '#ff5d5d';
    burst(enemy.x, enemy.y, color, enemy.kind === 'boss' ? 60 : 18, enemy.kind === 'boss' ? 320 : 220, 0.6);
    state.shake = Math.min(1, state.shake + (enemy.kind === 'boss' ? 1 : 0.18));
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const a = random() * Math.PI * 2;
        const mini = makeEnemy('mini');
        mini.x = enemy.x + Math.cos(a) * 20;
        mini.y = enemy.y + Math.sin(a) * 20;
        mini.vx = Math.cos(a) * 180;
        mini.vy = Math.sin(a) * 180;
      }
    }
    if (enemy.kind === 'boss') {
      state.boss = null;
      dropPickup(enemy.x - 30, enemy.y, 'heart');
      dropPickup(enemy.x + 30, enemy.y, 'heart');
      dropPickup(enemy.x, enemy.y - 30, 'gem');
      dropPickup(enemy.x, enemy.y + 30, 'gem');
      state.flash = 0.4;
    } else {
      dropPickup(enemy.x, enemy.y);
    }
  }

  function damagePlayer(amount, fromX, fromY) {
    if (player.invuln > 0 || player.shield > 0 || state.over) return 0;
    state.hp -= amount;
    player.invuln = PLAYER.invulnerable;
    state.shake = Math.min(1, state.shake + 0.55);
    state.flash = 0.25;
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    player.vx += (dx / d) * 420;
    player.vy += (dy / d) * 420;
    burst(player.x, player.y, '#4de8ff', 14, 200, 0.5);
    if (state.hp <= 0) {
      state.hp = 0;
      state.over = true;
      burst(player.x, player.y, '#4de8ff', 70, 340, 0.9);
      burst(player.x, player.y, '#ffffff', 30, 200, 0.7);
      state.shake = 1;
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function fireBullet() {
    const count = stats.projectiles;
    const spread = 0.1;
    for (let i = 0; i < count; i += 1) {
      const off = (i - (count - 1) / 2) * spread;
      const a = player.angle + off;
      const px = player.x + Math.cos(a) * (PLAYER.radius + 6);
      const py = player.y + Math.sin(a) * (PLAYER.radius + 6);
      state.bullets.push({
        x: px, y: py, vx: Math.cos(a) * stats.bulletSpeed, vy: Math.sin(a) * stats.bulletSpeed,
        dmg: stats.damage, pierce: stats.pierce, r: BULLET.radius, life: BULLET.life,
      });
    }
    player.fireCd = stats.fireInterval;
    burst(player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20, '#aef3ff', 3, 120, 0.15);
    return EVENT_SHOOT;
  }

  function stepEnemy(enemy, dt, events) {
    enemy.t += dt;
    if (enemy.flash > 0) enemy.flash -= dt;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;

    if (enemy.kind === 'chaser' || enemy.kind === 'mini') {
      const wob = enemy.kind === 'chaser' ? Math.sin(enemy.t * 3) * 0.4 : 0;
      const tx = nx + -ny * wob;
      const ty = ny + nx * wob;
      enemy.vx += tx * 520 * dt;
      enemy.vy += ty * 520 * dt;
      const sp = Math.hypot(enemy.vx, enemy.vy);
      const max = enemy.speed;
      if (sp > max) { enemy.vx = (enemy.vx / sp) * max; enemy.vy = (enemy.vy / sp) * max; }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.angle = Math.atan2(enemy.vy, enemy.vx);
    } else if (enemy.kind === 'shooter') {
      enemy.strafeT -= dt;
      if (enemy.strafeT <= 0) { enemy.strafe *= -1; enemy.strafeT = 2 + random() * 2; }
      const want = ENEMY.shooter.range;
      const radial = d > want + 40 ? 1 : d < want - 40 ? -1 : 0;
      enemy.vx = (nx * radial + -ny * enemy.strafe * 0.8) * enemy.speed;
      enemy.vy = (ny * radial + nx * enemy.strafe * 0.8) * enemy.speed;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.angle = Math.atan2(dy, dx);
      enemy.fireT -= dt;
      if (enemy.fireT <= 0 && d < 560) {
        enemy.fireT = ENEMY.shooter.fireInterval * (0.9 + random() * 0.3);
        state.ebullets.push({
          x: enemy.x, y: enemy.y, vx: nx * ENEMY_BULLET.speed, vy: ny * ENEMY_BULLET.speed, r: ENEMY_BULLET.radius,
        });
        return events | EVENT_ENEMY_SHOOT;
      }
    } else if (enemy.kind === 'splitter') {
      enemy.vx += nx * 300 * dt;
      enemy.vy += ny * 300 * dt;
      const sp = Math.hypot(enemy.vx, enemy.vy);
      if (sp > enemy.speed) { enemy.vx = (enemy.vx / sp) * enemy.speed; enemy.vy = (enemy.vy / sp) * enemy.speed; }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.angle += dt * 1.5;
    } else if (enemy.kind === 'boss') {
      enemy.patternT -= dt;
      if (enemy.charging > 0) {
        enemy.charging -= dt;
        enemy.x += enemy.chargeVx * dt;
        enemy.y += enemy.chargeVy * dt;
        if (random() < 0.5) state.particles.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, size: 5, color: '#ff2e63' });
      } else {
        const keep = d < 200 ? -1 : 1;
        enemy.vx = nx * keep * enemy.speed;
        enemy.vy = ny * keep * enemy.speed;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        enemy.angle = Math.atan2(dy, dx);
      }
      if (enemy.burstLeft > 0) {
        enemy.burstT -= dt;
        if (enemy.burstT <= 0) {
          enemy.burstT = 0.16;
          enemy.burstLeft -= 1;
          for (let k = -1; k <= 1; k += 1) {
            const a = Math.atan2(dy, dx) + k * 0.22;
            state.ebullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: ENEMY_BULLET.radius });
          }
          events |= EVENT_ENEMY_SHOOT;
        }
      }
      if (enemy.patternT <= 0) {
        enemy.patternT = 2.4;
        const pattern = enemy.patternIdx % 4;
        enemy.patternIdx += 1;
        if (pattern === 0) {
          for (let k = 0; k < 14; k += 1) {
            const a = (k / 14) * Math.PI * 2 + enemy.t;
            state.ebullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: ENEMY_BULLET.radius });
          }
          events |= EVENT_ENEMY_SHOOT;
        } else if (pattern === 1) {
          enemy.burstLeft = 3;
          enemy.burstT = 0;
        } else if (pattern === 2) {
          for (let k = 0; k < 2; k += 1) {
            const m = makeEnemy('chaser');
            m.x = enemy.x + (k === 0 ? -60 : 60);
            m.y = enemy.y;
          }
        } else {
          enemy.charging = 0.55;
          enemy.chargeVx = nx * 540;
          enemy.chargeVy = ny * 540;
          enemy.flash = 0.5;
        }
      }
    }

    enemy.x = Math.min(FIELD.width - 20, Math.max(20, enemy.x));
    enemy.y = Math.min(FIELD.height - 20, Math.max(20, enemy.y));
    return events;
  }

  /**
   * One fixed step. `input` is { mx, my, aimX, aimY, firing, dash } in field
   * coordinates. With `harmless` set (the title screen's backdrop) things drift
   * but nothing touches the player and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.6);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.4);
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }

    // --- player ---
    const mx = input.mx || 0;
    const my = input.my || 0;
    const mag = Math.hypot(mx, my) || 1;
    const nx = mx / mag;
    const ny = my / mag;
    player.angle = Math.atan2((input.aimY ?? player.y) - player.y, (input.aimX ?? player.x) - player.x);
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
    if (player.shield > 0) player.shield = Math.max(0, player.shield - dt);
    if (player.dashCd > 0) player.dashCd = Math.max(0, player.dashCd - dt);
    if (player.fireCd > 0) player.fireCd = Math.max(0, player.fireCd - dt);
    if (stats.regen > 0 && state.hp < state.maxHp) {
      player.regenT += dt;
      if (player.regenT >= stats.regen) {
        player.regenT = 0;
        state.hp += 1;
        floater(player.x, player.y - 24, '+1', '#7dffce');
      }
    }

    if (input.dash && player.dashCd <= 0 && !harmless) {
      const hasDir = mx !== 0 || my !== 0;
      const dx = hasDir ? nx : Math.cos(player.angle);
      const dy = hasDir ? ny : Math.sin(player.angle);
      player.dashTime = PLAYER.dashTime;
      player.dashCd = stats.dashCooldown;
      player.dashX = dx;
      player.dashY = dy;
      player.invuln = Math.max(player.invuln, 0.25);
      events |= EVENT_DASH;
    }
    if (player.dashTime > 0) {
      player.dashTime -= dt;
      player.vx = player.dashX * PLAYER.dashSpeed;
      player.vy = player.dashY * PLAYER.dashSpeed;
      state.particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: 6, color: '#4de8ff' });
    } else {
      player.vx += nx * PLAYER.accel * dt * (mx !== 0 || my !== 0 ? 1 : 0);
      player.vy += ny * PLAYER.accel * dt * (mx !== 0 || my !== 0 ? 1 : 0);
      const damp = Math.pow(0.0015, dt);
      if (mx === 0) player.vx *= damp;
      if (my === 0) player.vy *= damp;
      const sp = Math.hypot(player.vx, player.vy);
      const max = stats.moveSpeed;
      if (sp > max) { player.vx = (player.vx / sp) * max; player.vy = (player.vy / sp) * max; }
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));

    // Thruster sparkle while moving.
    if ((mx !== 0 || my !== 0) && random() < 0.35) {
      state.particles.push({
        x: player.x - Math.cos(player.angle) * 14, y: player.y - Math.sin(player.angle) * 14,
        vx: -player.vx * 0.2 + (random() - 0.5) * 40, vy: -player.vy * 0.2 + (random() - 0.5) * 40,
        life: 0.3, maxLife: 0.3, size: 2.5, color: '#2b9fd8',
      });
    }

    if (input.firing && player.fireCd <= 0 && !harmless) events |= fireBullet();

    // --- spawning ---
    if (state.waveActive && state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = WAVE.spawnInterval;
        makeEnemy(state.spawnQueue.shift());
      }
    }

    // --- enemies ---
    for (let i = 0; i < state.enemies.length; i += 1) {
      events = stepEnemy(state.enemies[i], dt, events);
    }

    // --- player bullets ---
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      let consumed = false;
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const e = state.enemies[j];
        if (dist2(b.x, b.y, e.x, e.y) > (b.r + e.r) * (b.r + e.r)) continue;
        e.hp -= b.dmg;
        e.flash = 0.08;
        burst(b.x, b.y, '#aef3ff', 4, 140, 0.25);
        if (stats.blast) {
          for (let k = state.enemies.length - 1; k >= 0; k -= 1) {
            if (k === j) continue;
            const o = state.enemies[k];
            if (dist2(b.x, b.y, o.x, o.y) < 70 * 70) {
              o.hp -= 1;
              o.flash = 0.08;
              if (o.hp <= 0) killEnemy(o, k);
            }
          }
          burst(b.x, b.y, '#ffd166', 10, 200, 0.35);
        }
        if (e.hp <= 0) {
          killEnemy(e, j);
          events |= EVENT_KILL;
          if (e.kind === 'boss') events |= EVENT_BOSS_DOWN;
        }
        if (b.pierce > 0) {
          b.pierce -= 1;
        } else {
          consumed = true;
        }
        break;
      }
      if (consumed) state.bullets.splice(i, 1);
    }

    // --- enemy bullets ---
    for (let i = state.ebullets.length - 1; i >= 0; i -= 1) {
      const b = state.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        state.ebullets.splice(i, 1);
        continue;
      }
      if (!harmless && dist2(b.x, b.y, player.x, player.y) < (b.r + PLAYER.radius) * (b.r + PLAYER.radius)) {
        state.ebullets.splice(i, 1);
        events |= damagePlayer(1, b.x - b.vx * 0.01, b.y - b.vy * 0.01);
        if (events & EVENT_OVER) return events;
      }
    }

    // --- enemy contact ---
    if (!harmless) {
      for (let i = 0; i < state.enemies.length; i += 1) {
        const e = state.enemies[i];
        if (dist2(e.x, e.y, player.x, player.y) < (e.r + PLAYER.radius - 2) * (e.r + PLAYER.radius - 2)) {
          events |= damagePlayer(1, e.x, e.y);
          if (events & EVENT_OVER) return events;
          // Shove the enemy back so it cannot hit twice in one pass.
          const dx = e.x - player.x;
          const dy = e.y - player.y;
          const d = Math.hypot(dx, dy) || 1;
          e.x += (dx / d) * 26;
          e.y += (dy / d) * 26;
        }
      }
    }

    // --- pickups ---
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const p = state.pickups[i];
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) { state.pickups.splice(i, 1); continue; }
      const d2 = dist2(p.x, p.y, player.x, player.y);
      if (d2 < stats.magnet * stats.magnet) {
        const d = Math.sqrt(d2) || 1;
        p.vx += ((player.x - p.x) / d) * PICKUP.magnetSpeed * dt * 4;
        p.vy += ((player.y - p.y) / d) * PICKUP.magnetSpeed * dt * 4;
      } else {
        p.vx *= Math.pow(0.02, dt);
        p.vy *= Math.pow(0.02, dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (d2 < (PLAYER.radius + PICKUP.radius) * (PLAYER.radius + PICKUP.radius)) {
        state.pickups.splice(i, 1);
        if (p.kind === 'heart') {
          state.hp = Math.min(state.maxHp, state.hp + 1);
          floater(player.x, player.y - 24, '+1 HULL', '#7dffce');
        } else if (p.kind === 'shield') {
          player.shield = 5;
          floater(player.x, player.y - 24, 'SHIELD', '#6ea8ff');
        } else {
          state.score += 150;
          floater(player.x, player.y - 24, '+150', '#7dffce');
        }
        burst(p.x, p.y, p.kind === 'heart' ? '#ff4d6d' : p.kind === 'shield' ? '#6ea8ff' : '#7dffce', 8, 120, 0.4);
        events |= EVENT_PICKUP;
      }
    }

    // --- particles and floaters ---
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) { state.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.05, dt);
      p.vy *= Math.pow(0.05, dt);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }

    // --- wave clear ---
    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0 && !state.over) {
      state.waveActive = false;
      state.score += WAVE.clearBonus * state.wave;
      events |= EVENT_WAVE_CLEAR;
    }
    return events;
  }

  function killPlayer() {
    if (state.over) return;
    state.hp = 0;
    state.over = true;
    burst(player.x, player.y, '#4de8ff', 70, 340, 0.9);
    state.shake = 1;
  }

  reset();
  return { state, reset, step, startWave, upgradeChoices, applyUpgrade, killPlayer };
}
