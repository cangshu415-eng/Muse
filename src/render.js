// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. Neon shapes with a soft glow, canvas text for the HUD
// and the panels. Text that holds a number is rebuilt only when the number
// changes, so a frame allocates nothing.
import { FIELD, FONT, PALETTE, PLAYER } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 780, top: 150, line: 32, bottom: 76 };
const CARD = { width: 320, height: 158, gap: 24, top: 300 };
const HEART_SIZE = 22;

const stars = (() => {
  const rand = createRandom(1337);
  const list = [];
  for (let i = 0; i < 110; i += 1) {
    list.push({ x: rand() * FIELD.width, y: rand() * FIELD.height, r: 0.6 + rand() * 1.6, p: rand() * Math.PI * 2, layer: 0.3 + rand() * 0.7 });
  }
  return list;
})();

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const finalLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function heart(x, y, size, filled) {
    const s = size / 10;
    context.beginPath();
    context.moveTo(x, y + 3.4 * s);
    context.bezierCurveTo(x - 5 * s, y - 1 * s, x - 3.4 * s, y - 5 * s, x, y - 2 * s);
    context.bezierCurveTo(x + 3.4 * s, y - 5 * s, x + 5 * s, y - 1 * s, x, y + 3.4 * s);
    context.closePath();
    context.fillStyle = filled ? PALETTE.heart : PALETTE.heartEmpty;
    context.fill();
  }

  function glow(color, blur) {
    context.shadowColor = color;
    context.shadowBlur = blur;
  }

  function noGlow() {
    context.shadowBlur = 0;
  }

  function drawBackground(state) {
    const g = context.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, PALETTE.sky);
    g.addColorStop(1, PALETTE.backdrop);
    context.fillStyle = g;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.globalAlpha = 0.5;
    context.beginPath();
    for (let x = 0; x <= FIELD.width; x += 80) {
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
    }
    context.stroke();
    context.globalAlpha = 1;
    for (const s of stars) {
      const tw = 0.45 + 0.55 * Math.sin(state.time * 1.4 + s.p);
      const sx = (s.x - state.time * 6 * s.layer + FIELD.width) % FIELD.width;
      context.globalAlpha = tw * 0.8;
      context.fillStyle = '#cfe4ff';
      context.fillRect(sx, s.y, s.r, s.r);
    }
    context.globalAlpha = 1;
  }

  function drawShip(x, y, angle, radius, color, core) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    glow(color, 16);
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(radius + 6, 0);
    context.lineTo(-radius * 0.8, radius * 0.75);
    context.lineTo(-radius * 0.4, 0);
    context.lineTo(-radius * 0.8, -radius * 0.75);
    context.closePath();
    context.fill();
    noGlow();
    context.fillStyle = core;
    context.beginPath();
    context.arc(2, 0, radius * 0.28, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawEnemy(e) {
    const flashing = e.flash > 0;
    const color = e.kind === 'boss' ? PALETTE.boss : e.kind === 'shooter' ? PALETTE.shooter : e.kind === 'splitter' ? PALETTE.splitter : e.kind === 'mini' ? PALETTE.mini : PALETTE.chaser;
    context.save();
    context.translate(e.x, e.y);
    glow(flashing ? '#ffffff' : color, e.kind === 'boss' ? 26 : 14);
    context.fillStyle = flashing ? '#ffffff' : color;
    if (e.kind === 'chaser' || e.kind === 'mini') {
      context.rotate(e.angle);
      context.beginPath();
      context.moveTo(e.r + 4, 0);
      context.lineTo(-e.r * 0.8, e.r * 0.8);
      context.lineTo(-e.r * 0.4, 0);
      context.lineTo(-e.r * 0.8, -e.r * 0.8);
      context.closePath();
      context.fill();
    } else if (e.kind === 'shooter') {
      context.rotate(e.angle);
      context.beginPath();
      context.moveTo(e.r + 4, 0);
      context.lineTo(0, e.r);
      context.lineTo(-e.r - 4, 0);
      context.lineTo(0, -e.r);
      context.closePath();
      context.fill();
      noGlow();
      context.fillStyle = '#fff3d6';
      context.beginPath();
      context.arc(0, 0, 4, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'splitter') {
      context.rotate(e.angle);
      context.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        const px = Math.cos(a) * e.r;
        const py = Math.sin(a) * e.r;
        if (k === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      noGlow();
      context.fillStyle = '#f3e8ff';
      context.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        const px = Math.cos(a) * e.r * 0.45;
        const py = Math.sin(a) * e.r * 0.45;
        if (k === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
    } else if (e.kind === 'boss') {
      context.rotate(e.angle + Math.sin(e.t * 0.8) * 0.15);
      context.beginPath();
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        const px = Math.cos(a) * e.r;
        const py = Math.sin(a) * e.r;
        if (k === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      noGlow();
      context.strokeStyle = '#ff8fb0';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, e.r * 0.62, e.t, e.t + Math.PI * 1.5);
      context.stroke();
      context.fillStyle = '#ffd6e2';
      context.beginPath();
      context.arc(0, 0, 10, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    noGlow();
    if ((e.kind === 'splitter' || e.kind === 'boss') && e.hp < e.maxHp) {
      const w = e.kind === 'boss' ? 110 : 40;
      const y = e.y - e.r - 14;
      context.fillStyle = '#2a2140';
      context.fillRect(e.x - w / 2, y, w, 6);
      context.fillStyle = color;
      context.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 6);
    }
  }

  function drawField(state) {
    drawBackground(state);

    // Pickups.
    for (const p of state.pickups) {
      const bob = Math.sin(p.t * 3) * 3;
      const blink = p.life < 3 ? (Math.floor(p.life * 6) % 2 === 0 ? 1 : 0.25) : 1;
      context.globalAlpha = blink;
      if (p.kind === 'heart') {
        glow(PALETTE.heart, 12);
        heart(p.x, p.y + bob, 20, true);
      } else if (p.kind === 'shield') {
        glow(PALETTE.shield, 12);
        context.strokeStyle = PALETTE.shield;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(p.x, p.y + bob, 11, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = '#dbeafe';
        context.beginPath();
        context.arc(p.x, p.y + bob, 4, 0, Math.PI * 2);
        context.fill();
      } else {
        glow(PALETTE.gem, 12);
        context.fillStyle = PALETTE.gem;
        context.save();
        context.translate(p.x, p.y + bob);
        context.rotate(Math.PI / 4);
        context.fillRect(-7, -7, 14, 14);
        context.restore();
      }
      noGlow();
      context.globalAlpha = 1;
    }

    // Enemy bullets.
    for (const b of state.ebullets) {
      glow(PALETTE.enemyBullet, 12);
      context.fillStyle = PALETTE.enemyBullet;
      context.beginPath();
      context.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      context.fill();
      noGlow();
      context.fillStyle = '#ffd6e8';
      context.beginPath();
      context.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2);
      context.fill();
    }

    // Enemies.
    for (const e of state.enemies) drawEnemy(e);

    // Player bullets.
    context.globalCompositeOperation = 'lighter';
    for (const b of state.bullets) {
      glow(PALETTE.bullet, 10);
      context.strokeStyle = PALETTE.bullet;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
      noGlow();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    context.globalCompositeOperation = 'source-over';

    // Player ship, with a faint ring so it reads at a glance.
    const pl = state.player;
    if (!state.over && (pl.invuln === 0 || Math.floor(pl.invuln * 10) % 2 === 1)) {
      context.globalAlpha = 0.16 + 0.06 * Math.sin(state.time * 4);
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(pl.x, pl.y, PLAYER.radius + 10, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
      drawShip(pl.x, pl.y, pl.angle, PLAYER.radius, PALETTE.player, PALETTE.playerCore);
    }
    if (pl.shield > 0 && !state.over) {
      context.strokeStyle = 'rgba(110,168,255,0.8)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(pl.x, pl.y, PLAYER.radius + 10 + Math.sin(state.time * 6) * 2, 0, Math.PI * 2);
      context.stroke();
    }

    // Particles.
    context.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';

    // Floating score text.
    context.textBaseline = 'alphabetic';
    for (const f of state.floaters) {
      context.globalAlpha = Math.min(1, f.life / 0.4);
      text(f.text, f.x, f.y, 18, f.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, muted) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 26, PALETTE.text, 'left');
    text(waveLabel(state.wave), FIELD.width / 2, 18, 26, PALETTE.text, 'center');
    const firstHeart = FIELD.width - 24 - state.maxHp * (HEART_SIZE + 6) + 6;
    for (let i = 0; i < state.maxHp; i += 1) {
      heart(firstHeart + i * (HEART_SIZE + 6) + HEART_SIZE / 2, 30, HEART_SIZE, i < state.hp);
    }
    if (state.boss) {
      const w = 420;
      const x = (FIELD.width - w) / 2;
      const y = 56;
      text('WARDEN', FIELD.width / 2, y - 2, 16, PALETTE.boss, 'center');
      context.fillStyle = '#2a2140';
      context.fillRect(x, y + 18, w, 10);
      context.fillStyle = PALETTE.boss;
      context.fillRect(x, y + 18, w * Math.max(0, state.boss.hp / state.boss.maxHp), 10);
    }
    // Dash cooldown.
    const dw = 120;
    const dx = (FIELD.width - dw) / 2;
    const dy = FIELD.height - 26;
    const ready = state.player.dashCd <= 0;
    context.fillStyle = '#1c2342';
    context.fillRect(dx, dy, dw, 7);
    context.fillStyle = ready ? PALETTE.player : '#3d6a80';
    context.fillRect(dx, dy, dw * (ready ? 1 : 1 - state.player.dashCd / state.stats.dashCooldown), 7);
    text(ready ? 'DASH READY [SHIFT]' : 'DASH…', FIELD.width / 2, dy - 22, 13, ready ? PALETTE.player : PALETTE.muted, 'center');
    if (muted) text('MUTED [M]', FIELD.width - 24, FIELD.height - 30, 14, PALETTE.muted, 'right');
    if (state.banner) {
      const a = Math.min(1, state.banner.t / 0.5);
      context.globalAlpha = a;
      text(state.banner.text, FIELD.width / 2, 150, 54, PALETTE.gold, 'center');
      if (state.banner.sub) text(state.banner.sub, FIELD.width / 2, 210, 22, PALETTE.boss, 'center');
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(8,10,24,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 82, 48, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 23, PALETTE.gold, 'center');
  }

  function drawUpgradeCards(choices) {
    context.fillStyle = 'rgba(8,10,24,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text('WAVE CLEARED', FIELD.width / 2, 150, 44, PALETTE.gold, 'center');
    text('Choose an upgrade', FIELD.width / 2, 196, 22, PALETTE.text, 'center');
    const total = choices.length * CARD.width + (choices.length - 1) * CARD.gap;
    const startX = (FIELD.width - total) / 2;
    for (let i = 0; i < choices.length; i += 1) {
      const c = choices[i];
      const x = startX + i * (CARD.width + CARD.gap);
      const y = CARD.top;
      context.fillStyle = PALETTE.panel;
      context.fillRect(x, y, CARD.width, CARD.height);
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      context.strokeRect(x, y, CARD.width, CARD.height);
      text(`[${i + 1}]`, x + CARD.width / 2, y + 44, 22, PALETTE.gold, 'center');
      text(c.name, x + CARD.width / 2, y + 84, 21, PALETTE.text, 'center');
      text(c.desc, x + CARD.width / 2, y + 120, 17, PALETTE.muted, 'center');
    }
    text('Press 1, 2 or 3 — or click a card', FIELD.width / 2, CARD.top + CARD.height + 56, 20, PALETTE.muted, 'center');
  }

  /** The upgrade cards' rectangles in field coordinates, for click picking. */
  function upgradeCardRects(count) {
    const total = count * CARD.width + (count - 1) * CARD.gap;
    const startX = (FIELD.width - total) / 2;
    const rects = [];
    for (let i = 0; i < count; i += 1) {
      rects.push({ x: startX + i * (CARD.width + CARD.gap), y: CARD.top, width: CARD.width, height: CARD.height });
    }
    return rects;
  }

  const TITLE_LINES = [
    'Survive the swarm. Clear waves, pick upgrades, face the Warden.',
    'Move  WASD / Arrows      Aim  Mouse      Fire  Click or Space',
    'Dash  Shift      Pickups heal, shield and score.  Pause  P.  Mute  M.',
    '',
  ];
  const PAUSED_LINES = ['The swarm waits for you.'];
  const OVER_LINES = ['', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, muted) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sh = state.shake * state.shake * 14;
    const ox = sh === 0 ? 0 : Math.sin(state.time * 91) * sh;
    const oy = sh === 0 ? 0 : Math.cos(state.time * 113) * sh;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + ox * view.scale, view.y + oy * view.scale);
    drawField(state);
    if (state.flash > 0) {
      context.fillStyle = `rgba(255,60,90,${(state.flash * 0.3).toFixed(3)})`;
      context.fillRect(-20, -20, FIELD.width + 40, FIELD.height + 40);
    }
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[3] = bestLabel(best);
      drawPanel('LUMEN DRIFT', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      drawHud(state, muted);
      drawUpgradeCards(state.choices);
      return;
    }
    drawHud(state, muted);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P or Esc to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = bestLabel(best);
      drawPanel('GAME OVER', OVER_LINES, 'Press Space or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    upgradeCardRects,
    /** Convert client pixels to field coordinates. */
    toField(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.scale,
        y: (clientY - rect.top - view.y) / view.scale,
      };
    },
  };
}
