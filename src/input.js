// Keyboard and mouse. Held keys give a movement vector, the mouse gives an aim point
// and a held fire button, and one-shot presses (start, pause, mute, dash, upgrade
// picks) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_DASH = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DASH = new Set(['ShiftLeft', 'ShiftRight']);
const DIGITS = new Set(['Digit1', 'Digit2', 'Digit3']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let digit = 0;
  let mouse = { x: 0, y: 0, down: false };
  let click = null;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code) || RIGHT.has(event.code) || UP.has(event.code) || DOWN.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (DIGITS.has(event.code)) {
      if (!event.repeat) digit = Number(event.code.slice(-1));
    } else {
      return;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  target.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    click = { x: event.clientX, y: event.clientY };
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function axis(neg, pos) {
    let hasNeg = false;
    let hasPos = false;
    for (const code of held) {
      if (neg.has(code)) hasNeg = true;
      if (pos.has(code)) hasPos = true;
    }
    return (hasPos ? 1 : 0) - (hasNeg ? 1 : 0);
  }

  return {
    /** Movement vector, each component -1, 0 or 1. */
    move() {
      return { x: axis(LEFT, RIGHT), y: axis(UP, DOWN) };
    },
    /** The mouse position in client pixels. */
    aim() {
      return { x: mouse.x, y: mouse.y };
    },
    /** True while the mouse button or Space is held. */
    firing() {
      return mouse.down || held.has('Space');
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The upgrade digit (1, 2 or 3) pressed since the last call, or 0. */
    takeDigit() {
      const taken = digit;
      digit = 0;
      return taken;
    },
    /** The last pointer-down in client pixels since the last call, or null. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
  };
}
