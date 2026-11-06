// Draw mode for the hero photo band. "Draw." in the strip swaps the photo for
// a plain surface to draw on (mouse, finger or stylus) and writes a cursive
// hello across it; "Photos." swaps back, keeping the drawing for next time.
// pixel-field.js stands down (no swipes or ripples) while .is-drawing is on.
const WIDTH = 3.5; // pen width, CSS px
const GLOW = 9; // width of the stroke under it that blurs into the glow, CSS px

let cleanup;
document.addEventListener('astro:before-swap', () => cleanup?.());

document.addEventListener('astro:page-load', () => {
  cleanup?.();
  const card = document.querySelector('.hero-card');
  const pad = card?.querySelector('.hero-pad');
  const glow = card?.querySelector('.hero-glow');
  if (!pad || !glow) return;

  const ctx = pad.getContext('2d');
  const gtx = glow.getContext('2d');
  // Every stroke goes to both: sharp on the pad, wide on the blurred glow
  const both = (fn) => { fn(ctx); fn(gtx); };
  const ink = card.querySelector('.hero-ink');
  const modes = [...card.querySelectorAll('.hero-mode')];
  const pens = [...card.querySelectorAll('.hero-pen')];
  let pen = pens[0];
  let line = null; // the stroke being drawn: { id, x, y, mx, my }

  const ac = new AbortController();
  const on = (el, type, fn) => el.addEventListener(type, fn, { signal: ac.signal });

  // Backing store at device resolution. ponytail: a resize clears the
  // drawing; copy the old pixels across if that ever bothers anyone.
  function size() {
    const { width, height } = pad.getBoundingClientRect();
    const d = devicePixelRatio || 1;
    if (pad.width === Math.round(width * d) && pad.height === Math.round(height * d)) return;
    for (const [c, x, w] of [[pad, ctx, WIDTH], [glow, gtx, GLOW]]) {
      c.width = Math.round(width * d);
      c.height = Math.round(height * d);
      x.setTransform(d, 0, 0, d, 0, 0);
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.lineWidth = w;
    }
  }

  // Restart the hello's write-on animation
  function write() {
    ink.classList.remove('is-writing');
    void ink.getBoundingClientRect();
    ink.classList.add('is-writing');
  }

  function setMode(draw) {
    card.classList.toggle('is-drawing', draw);
    modes.forEach((m) => m.setAttribute('aria-pressed', String((m.dataset.mode === 'draw') === draw)));
    if (!draw) return;
    size();
    if (!ink.classList.contains('is-gone')) write();
  }

  modes.forEach((m) => on(m, 'click', () => {
    if (m.getAttribute('aria-pressed') !== 'true') setMode(m.dataset.mode === 'draw');
  }));

  pens.forEach((p) => on(p, 'click', () => {
    pen = p;
    pens.forEach((q) => q.setAttribute('aria-pressed', String(q === p)));
  }));

  on(card.querySelector('.hero-clear'), 'click', () => {
    both((c) => c.clearRect(0, 0, pad.width, pad.height));
    ink.classList.add('is-gone');
  });

  // ── Drawing ── Each move curves through the midpoints between samples,
  // which smooths the line without lagging behind the pointer.
  const at = (e) => {
    const r = pad.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  on(pad, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    // Mice can let go outside the surface; touches and pens are captured already
    if (e.pointerType === 'mouse') pad.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    line = { id: e.pointerId, x, y, mx: x, my: y };
    // The pen colour follows the theme, so read it as each stroke starts
    const color = getComputedStyle(pen).getPropertyValue('--pen').trim();
    both((c) => {
      c.strokeStyle = color;
      c.beginPath(); // a dot for a tap
      c.moveTo(x, y);
      c.lineTo(x, y);
      c.stroke();
    });
  });

  on(pad, 'pointermove', (e) => {
    if (e.pointerId !== line?.id) return;
    // Every sample since the last frame, for smooth fast strokes (the list
    // can be empty, e.g. for synthetic events)
    const samples = e.getCoalescedEvents?.() ?? [];
    for (const c of samples.length ? samples : [e]) {
      const [x, y] = at(c);
      const mx = (line.x + x) / 2, my = (line.y + y) / 2;
      both((c) => {
        c.beginPath();
        c.moveTo(line.mx, line.my);
        c.quadraticCurveTo(line.x, line.y, mx, my);
        c.stroke();
      });
      Object.assign(line, { x, y, mx, my });
    }
  });

  const lift = (e) => {
    if (e.pointerId !== line?.id) return;
    both((c) => { // the last half-segment up to where it let go
      c.beginPath();
      c.moveTo(line.mx, line.my);
      c.lineTo(line.x, line.y);
      c.stroke();
    });
    line = null;
  };
  on(pad, 'pointerup', lift);
  on(pad, 'pointercancel', lift);

  cleanup = () => {
    ac.abort();
    cleanup = null;
  };
});
