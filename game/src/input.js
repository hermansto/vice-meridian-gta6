// Keyboard and mouse, sampled once a frame. The game reads `keys` and `mouse`; nothing else in the
// codebase touches a browser event, which keeps the simulation testable and the render pass cheap.

const DOWN = new Set();
const PRESSED = new Set();

const KEY_ALIASES = {
  arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd', ' ': 'space',
};

function normalise(event) {
  const key = (event.key || '').toLowerCase();
  return KEY_ALIASES[key] || key;
}

export function installInput(canvas) {
  window.addEventListener('keydown', (event) => {
    const key = normalise(event);
    if (['w', 'a', 's', 'd', 'space', 'e', 'f', 'm', 'escape', 'shift'].includes(key)) event.preventDefault();
    if (!DOWN.has(key)) PRESSED.add(key);
    DOWN.add(key);
  });
  window.addEventListener('keyup', (event) => DOWN.delete(normalise(event)));
  window.addEventListener('blur', () => DOWN.clear());

  const mouse = { x: 640, y: 360, worldX: 0, worldY: 0, down: false, clicked: false };
  const onMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
  };
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', (event) => {
    onMove(event);
    mouse.down = true;
    mouse.clicked = true;
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    keys: {
      has: (key) => DOWN.has(key),
      any: (...list) => list.some((key) => DOWN.has(key)),
      pressed: (key) => PRESSED.has(key),
    },
    mouse,
    endFrame() {
      PRESSED.clear();
      mouse.clicked = false;
    },
  };
}
