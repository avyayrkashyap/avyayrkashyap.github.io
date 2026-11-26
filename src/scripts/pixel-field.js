// Pixelated photo band at the top of the hero: the current scene is drawn into
// a low-res canvas scaled up with image-rendering: pixelated. The water sways
// gently and clicks on it send a ring outward. Scenes come from the
// .hero-dot buttons or a sideways swipe; switching turns every square of the
// grid away like a tile, in a wave that sweeps the way you swiped, to show
// the next photo lying underneath. --scene-tint follows the theme.
const CELL = 7; // CSS px per pixel
const SPEED = 30; // ring speed, cells per second
const LIFE = 2.6; // seconds a ripple lasts
const WIDTH = 4; // ring thickness, cells
const SQUASH = 2.5; // how flat rings look at the bottom edge; flatter toward the horizon
const NEAR = 1.2; // perspective softness: 0 = true horizon (far rings vanish), higher = more uniform
const FLIP = 0.42; // seconds one square takes to turn away
const SWEEP = 0.75; // seconds the wave takes to cross the band
const JITTER = 0.12; // random lag per square (seconds), so the wave front isn't a ruler
const SWIPE = 40; // reduced motion: px of swipe that switches photos outright
const REACH = 0.6; // share of the band's width a swipe covers to turn every square
const COMMIT = 0.3; // share of the way a swipe has to get for letting go to finish the turn
const BACK = 1.5; // how much faster than forward the squares turn back when it doesn't
const WAVE = SWEEP + JITTER + FLIP; // seconds from the first square starting to the last finishing
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let cleanup;
document.addEventListener('astro:before-swap', () => cleanup?.());

document.addEventListener('astro:page-load', () => {
  cleanup?.();
  const card = document.querySelector('.hero-card');
  const canvas = card?.querySelector('.hero-pixels');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dots = [...card.querySelectorAll('.hero-dot')];
  let w = 0, h = 0, o, img, base, wet, hy = 0, tint, raf = 0, visible = true;
  let ripples = [], scene = null, pending = null, flip = null;

  const scenes = dots.map((dot) => {
    const d = dot.dataset;
    return { dot, src: d.src, horizon: +d.horizon, top: +d.top, zoom: +d.zoom, hour: +d.hour };
  });

  // One Image per photo, loaded on first use
  const files = new Map();
  const ready = async (sc) => {
    if (!files.has(sc.src)) {
      const p = new Image();
      p.src = sc.src;
      files.set(sc.src, p.decode().then(() => p));
    }
    sc.photo = await files.get(sc.src);
    return sc;
  };

  const hex = (name) => {
    let v = getComputedStyle(card).getPropertyValue(name).trim().slice(1);
    if (v.length === 3) v = v.replace(/./g, '$&$&'); // minifier turns #FFFFFF into #fff
    const n = parseInt(v, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const readColors = () => {
    tint = hex('--scene-tint').map((c) => c / 255);
  };

  // Where a scene's photo lands in the band: a cover crop (pushed in by its
  // zoom), centred across, with its 'top' row at the band's top edge (as far
  // as the photo allows).
  // Returns [x, y, width, height] in cells.
  function cover(sc) {
    const p = sc.photo, k = Math.max(w / p.naturalWidth, h / p.naturalHeight) * sc.zoom;
    const pw = p.naturalWidth * k, ph = p.naturalHeight * k;
    return [(w - pw) / 2, clamp(-sc.top * ph, h - ph, 0), pw, ph];
  }

  // A scene's photo at one cell a pixel
  function pixels(sc) {
    o.clearRect(0, 0, w, h);
    const [x, y, pw, ph] = cover(sc);
    o.drawImage(sc.photo, x, y, pw, ph);
    return o.getImageData(0, 0, w, h);
  }

  // Resting on a scene: its pixels, plus the water map (below the waterline)
  function settle() {
    if (!scene?.photo || !w) return;
    base = pixels(scene);
    const [, y, , ph] = cover(scene);
    hy = Math.ceil(y + scene.horizon * ph);
    wet = new Uint8Array(w * h).fill(1, clamp(hy, 0, h) * w);
    kick();
  }

  // A switch is a wave of the old photo's squares turning away, over the next
  // photo lying underneath. flip.at is how far along the wave is (seconds of
  // it, 0 to WAVE). While a swipe holds it (flip.held), the swipe sets it;
  // otherwise it runs on from where it was let go at flip.rate: forward to
  // land on the next photo, or backward to settle back on this one.
  function startFlip(next, dir, held, from) {
    const lag = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, along = dir > 0 ? (w - 1 - x) / (w - 1 || 1) : x / (w - 1 || 1);
      lag[i] = along * SWEEP + Math.random() * JITTER;
    }
    // The water stays calm until it's settled again
    ripples = [];
    wet = new Uint8Array(w * h);
    canvas.width = w * CELL;
    canvas.height = h * CELL;
    flip = { from, to: pixels(next), next, dir, lag, held, at: 0, t0: performance.now() / 1000, rate: 1 };
    kick();
  }

  // What's on screen now (a flip part-way included), for the squares the
  // next flip turns away. A flip that was heading forward counts as landed.
  function takeOver() {
    const from = img.data.slice();
    if (flip && !flip.held && flip.rate > 0) scene = flip.next;
    return from;
  }

  // Back to the low-res canvas on whichever photo the wave ended on
  function endFlip(landed) {
    if (landed) scene = flip.next;
    flip = null;
    pending = null;
    dots.forEach((d) => d.setAttribute('aria-pressed', String(d === scene.dot)));
    canvas.width = w;
    canvas.height = h;
    settle();
  }

  // One frame of a switch, drawn at full size (CELL px a square) so each
  // square can turn: the old photo's square narrows to its edge, shaded as it
  // goes and leaning the way the wave travels, uncovering the next photo
  // beneath. The low-res layer carries the old photo where squares haven't
  // started and the next everywhere else; only the ones mid-turn are then
  // drawn over it one by one.
  // Returns false once the wave has finished, so draw() renders the settled
  // photo that same frame and the band never shows empty.
  function stepFlip(t) {
    const f = flip;
    if (!f.held) {
      const at = f.at + (t - f.t0) * f.rate;
      if (at >= WAVE || at <= 0) return endFlip(at >= WAVE), false;
      f.at = at;
      f.t0 = t;
    }
    const d = img.data, from = f.from, src = f.to.data, [tr, tg, tb] = tint;
    const turning = [];
    for (let i = 0; i < w * h; i++) {
      const p = clamp((f.at - f.lag[i]) / FLIP, 0, 1), q = i * 4;
      if (p > 0 && p < 1) turning.push(i, p);
      if (p === 0) {
        d[q] = from[q]; d[q + 1] = from[q + 1]; d[q + 2] = from[q + 2];
      } else {
        d[q] = src[q] * tr; d[q + 1] = src[q + 1] * tg; d[q + 2] = src[q + 2] * tb;
      }
      d[q + 3] = 255;
    }
    o.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(o.canvas, 0, 0, w * CELL, h * CELL);
    for (let k = 0; k < turning.length; k += 2) {
      const i = turning[k], p = turning[k + 1], q = i * 4;
      const x = (i % w) * CELL, y = Math.floor(i / w) * CELL;
      const c = Math.cos((ease(p) * Math.PI) / 2); // 1 flat, 0 edge-on and gone
      const shade = 0.55 + 0.45 * c;
      const sw = CELL * c;
      ctx.fillStyle = `rgb(${from[q] * shade},${from[q + 1] * shade},${from[q + 2] * shade})`;
      ctx.fillRect(x + (CELL - sw) / 2 - f.dir * (1 - c) * CELL * 0.2, y, sw, CELL);
    }
    return true;
  }

  // Screen cell -> point on the water's surface, seen from just above it.
  // Things shrink with distance (1/e, e = depth below a horizon pushed up by
  // NEAR); units are scaled so one unit is one cell across at the bottom
  // edge and SQUASH cells deep there.
  const depthOf = (y) => y - hy + 0.5 + (h - hy) * NEAR;
  function toWater(x, y) {
    const e = depthOf(y), E = depthOf(h);
    return [((x - w / 2) * E) / e, (SQUASH * E * E) / e];
  }

  // A dot: the wave runs on its own. dir: 1 sweeps it right to left (the
  // next photo), -1 left to right
  async function show(sc, dir = 1) {
    pending = sc;
    dots.forEach((d) => d.setAttribute('aria-pressed', String(d === sc.dot)));
    await ready(sc);
    if (pending !== sc) return; // a later click won
    const from = scene && base ? takeOver() : null;
    if (!from || still || sc === scene) {
      scene = sc;
      flip = null;
      canvas.width = w;
      canvas.height = h;
      settle();
      return;
    }
    startFlip(sc, dir, false, from);
  }

  function draw(now) {
    const t = now / 1000;
    if (flip && stepFlip(t)) return;
    const d = img.data, src = base.data;
    const [tr, tg, tb] = tint;
    ripples = ripples.filter((r) => t - r.t < LIFE);

    for (let y = 0; y < h; y++) {
      const water = y >= hy;
      const depth = water ? (y - hy) / (h - hy || 1) : 0;
      // Idle swell: each water row sways sideways, more toward the viewer
      const sway = water ? Math.sin(y * 0.8 - t * 1.6) * (0.3 + depth * 1.2) + Math.sin(y * 0.23 + t * 0.9) * depth * 0.6 : 0;

      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const isWet = wet[i];
        let sx = isWet ? x + sway : x, sy = y, lift = 0;

        if (isWet && ripples.length) {
          const [X, Z] = toWater(x, y);
          const e = depthOf(y), E = depthOf(h);
          for (const rp of ripples) {
            const age = t - rp.t;
            const gx = X - rp.X, gz = Z - rp.Z;
            const dist = Math.hypot(gx, gz) || 1;
            const off = dist - age * SPEED;
            if (off > -WIDTH * 4 && off < WIDTH * 2) {
              const wv = Math.cos(off * 0.6) * Math.exp(-((off / WIDTH) ** 2)) * (1 - age / LIFE) ** 2;
              // Refract: push the sample outward along the ring, converted
              // back to screen cells (shrinks with distance)
              sx += (gx / dist) * (e / E) * wv * 2.5;
              sy -= (gz / dist) * ((e * e) / (SQUASH * E * E)) * wv * 2.5;
              lift += wv;
            }
          }
          sy = Math.min(h - 1, Math.max(hy, sy));
        }

        let j = Math.round(sy) * w + Math.min(w - 1, Math.max(0, Math.round(sx)));
        if (!wet[j]) j = i;
        const q = j * 4;
        let r = src[q] * tr, g = src[q + 1] * tg, b = src[q + 2] * tb;
        // Crests catch the light, troughs dip
        if (lift > 0) {
          const m = Math.min(lift, 1) * 0.3;
          r += (255 - r) * m; g += (255 - g) * m; b += (255 - b) * m;
        } else {
          r += lift * 25; g += lift * 25; b += lift * 25;
        }

        const p = i * 4;
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function loop(now) {
    // Book the next frame first, so one bad frame can't stall the loop
    raf = visible && !still ? requestAnimationFrame(loop) : 0;
    if (base) draw(now);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  function resize() {
    w = Math.ceil(card.clientWidth / CELL);
    h = Math.ceil(card.clientHeight / CELL);
    canvas.width = w;
    canvas.height = h;
    // Exactly CELL px per pixel (overflowing the band slightly) so the grid
    // overlay lands on pixel edges
    canvas.style.width = `${w * CELL}px`;
    canvas.style.height = `${h * CELL}px`;
    img = ctx.createImageData(w, h);
    // A buffer to compose in
    o = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
    o.imageSmoothingQuality = 'high';
    base = null;
    flip = null;
    settle();
  }

  function onPointer(e) {
    if (e.target.closest('button, .hero-bar, .hero-draw, .hero-face')) return;
    const b = card.getBoundingClientRect();
    const x = (e.clientX - b.left) / CELL, y = (e.clientY - b.top) / CELL;
    if (still || !wet?.[Math.floor(y) * w + Math.floor(x)]) return; // only the water ripples
    const [X, Z] = toWater(x, y);
    ripples.push({ X, Z, t: performance.now() / 1000 });
    kick();
  }

  const at = () => scenes.indexOf(pending ?? scene);
  const onDot = (e) => {
    const i = scenes.findIndex((sc) => sc.dot === e.currentTarget);
    show(scenes[i], i < at() ? -1 : 1);
  };

  // Swipe: a sideways drag (finger or mouse) or two-finger trackpad swipe
  // turns the squares over toward the neighbouring photo that way, as far as
  // it has gone (REACH of the band's width turns them all), and holds them
  // there until it lets go. Then they finish turning if it got COMMIT of the
  // way or was flicked, else turn back. Swiping back past where it started
  // turns toward the other neighbour instead. Vertical drags are left alone:
  // touch-action: pan-y on the card hands them to the page.
  const neighbour = (dir) => scenes[(at() + dir + scenes.length) % scenes.length];
  const turn = (dir) => show(neighbour(dir), dir);

  // dx: px swiped so far, negative to the left. False if the photo that way
  // isn't loaded yet.
  function grab(dx) {
    const dir = dx < 0 ? 1 : -1;
    const from = takeOver();
    pending = null;
    const next = neighbour(dir);
    if (!next.photo) return false;
    startFlip(next, dir, true, from);
    return true;
  }
  function hold(dx) {
    if (!flip?.held || !dx) return;
    const dir = dx < 0 ? 1 : -1;
    if (dir !== flip.dir) {
      const next = neighbour(dir);
      if (!next.photo) return;
      startFlip(next, dir, true, flip.from);
    }
    flip.at = clamp((Math.abs(dx) / (w * CELL * REACH)) * WAVE, 0, WAVE);
    kick();
  }
  // vx: release speed in px/ms, for flicks
  function release(vx) {
    if (!flip?.held) return;
    const flick = Math.abs(vx) > 0.3 && Math.sign(vx) === -flip.dir;
    flip.held = false;
    flip.rate = flip.at > WAVE * COMMIT || flick ? 1 : -BACK;
    flip.t0 = performance.now() / 1000;
    kick();
  }

  const swipe = new AbortController();
  const on = (type, fn, opts) => card.addEventListener(type, fn, { ...opts, signal: swipe.signal });
  let drag = null;
  on('pointerdown', (e) => {
    if (e.button !== 0 || !base || e.target.closest('button, .hero-bar, .hero-draw, .hero-face')) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, lx: e.clientX, t: e.timeStamp, vx: 0 };
    // A mouse can let go outside the card; touches are captured already
    if (e.pointerType === 'mouse') card.setPointerCapture(e.pointerId);
  });
  on('pointermove', (e) => {
    if (e.pointerId !== drag?.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.held) {
      if (Math.hypot(dx, dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) return void (drag = null); // a scroll, not a swipe
      card.classList.add('is-dragging');
      if (still) {
        if (Math.abs(dx) >= SWIPE) {
          drag = null;
          turn(dx < 0 ? 1 : -1);
        }
        return;
      }
      if (!grab(dx)) return;
      drag.held = true;
    }
    if (e.timeStamp > drag.t) drag.vx = (e.clientX - drag.lx) / (e.timeStamp - drag.t);
    drag.lx = e.clientX;
    drag.t = e.timeStamp;
    hold(dx);
  });
  const letGo = (e) => {
    if (e.pointerId !== drag?.id) return;
    // A pause before letting go is a place, not a flick
    if (drag.held) release(e.timeStamp - drag.t > 80 ? 0 : drag.vx);
    card.classList.remove('is-dragging');
    drag = null;
  };
  on('pointerup', letGo);
  on('pointercancel', letGo);
  // Trackpads: the gesture (momentum included) ends after a short quiet spell.
  // A swipe left scrolls right (deltaX > 0), so it counts as dx < 0.
  let wheelEnd = 0, wheel = { dx: 0 };
  on('wheel', (e) => {
    // Vertical scrolls pass through, and so does everything in draw mode
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || !base || card.matches('.is-drawing, .is-face')) return;
    e.preventDefault(); // and keeps the browser from going back/forward
    wheel.dx -= e.deltaX;
    if (still) {
      if (!wheel.done && Math.abs(wheel.dx) >= SWIPE) {
        wheel.done = true;
        turn(wheel.dx < 0 ? 1 : -1);
      }
    } else if (!wheel.held && Math.abs(wheel.dx) >= 6) {
      wheel.held = grab(wheel.dx);
    }
    if (wheel.held) hold(wheel.dx);
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => {
      if (wheel.held) release(0);
      wheel = { dx: 0 };
    }, 150);
  }, { passive: false });

  // Open on the photo shot closest to the visitor's time of day (wrapping
  // around midnight), then fetch the rest so switches start straight away
  const now = new Date();
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const gap = (sc) => {
    const g = Math.abs(sc.hour - hourNow);
    return Math.min(g, 24 - g);
  };
  const first = scenes.reduce((a, b) => (gap(b) < gap(a) ? b : a));

  card.style.setProperty('--cell', `${CELL}px`);
  readColors();
  show(first).then(() => scenes.forEach(ready));
  const sizeObs = new ResizeObserver(resize);
  const themeObs = new MutationObserver(() => { readColors(); kick(); });
  const viewObs = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  sizeObs.observe(card);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  viewObs.observe(card);
  card.addEventListener('pointerdown', onPointer);
  dots.forEach((d) => d.addEventListener('click', onDot));

  cleanup = () => {
    cancelAnimationFrame(raf);
    sizeObs.disconnect();
    themeObs.disconnect();
    viewObs.disconnect();
    card.removeEventListener('pointerdown', onPointer);
    dots.forEach((d) => d.removeEventListener('click', onDot));
    swipe.abort();
    clearTimeout(wheelEnd);
    cleanup = null;
  };
});
