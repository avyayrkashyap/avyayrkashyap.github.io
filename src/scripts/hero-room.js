// The rooms Immerse mode looks into, one at a time (swipe to change): a
// subway car seen standing in its aisle, and your living room. hero-face.js
// decides where the eye is and which room; this draws it from there, in a
// cartoon style with an ink outline round everything.
//
// Four kinds of thing: boxes (stand, TV, table, benches), round columns
// (pillar, lamp, poles), flat panels that face the viewer (screens, scarf,
// flowers, glows) and art painted across a side wall (poster, the car's
// windows and doors). A panel stays a plain rectangle at any eye position,
// so its paint function draws in its own flat coordinates and the projection
// is just a translate and a scale. Every screen, print and ad is drawn in
// code; no logos.

const INK = '#211C18'; // the outline
const OUTLINE = 2.4; // outline width at the band's own depth, CSS px; thins with distance

// ── What the screens show ── Each paints a W×H panel at time t (seconds).

// A soft pool of light: [r, g, b] at strength a in the middle, easing out to
// nothing. It fades to the same colour at zero opacity, not to
// 'transparent' (transparent black), which would drag a grey fringe across
// the wall on its way out.
function glow([r, g, b], a) {
  return (c, W, H) => {
    c.translate(W / 2, H / 2);
    c.scale(W / H, 1);
    const grad = c.createRadialGradient(0, 0, 0, 0, 0, H / 2);
    for (const [at, f] of [[0, 1], [0.35, 0.6], [0.7, 0.18], [1, 0]]) {
      grad.addColorStop(at, `rgba(${r}, ${g}, ${b}, ${a * f})`);
    }
    c.fillStyle = grad;
    c.fillRect(-H / 2, -H / 2, H, H);
  };
}

// The Acquired podcast, playing: its teal and mint wordmark, a live
// waveform, and an episode clock creeping through one of their long ones
const TEAL = '#0E3B3B', MINT = '#2BEFC1';
const EPISODE = 3 * 3600 + 41 * 60 + 9; // seconds
const clock = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, Math.floor(s) % 60]
  .map((n, i) => (i ? String(n).padStart(2, '0') : n)).join(':');

function tv(c, W, H, t) {
  const b = W * 0.012;
  c.fillStyle = '#0B0B0C';
  c.fillRect(0, 0, W, H);
  c.translate(b, b);
  W -= b * 2;
  H -= b * 2;
  c.fillStyle = TEAL;
  c.fillRect(0, 0, W, H);

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = MINT;
  c.font = `800 ${H * 0.15}px "Avenir Next", Montserrat, system-ui, sans-serif`;
  c.letterSpacing = `${H * 0.015}px`;
  c.fillText('ACQUIRED', W / 2, H * 0.36);
  c.letterSpacing = '0px';

  const n = 56, bw = (W * 0.6) / n;
  for (let i = 0; i < n; i++) {
    const a = 0.2 + 0.8 * Math.abs(Math.sin(i * 0.7 + t * 3) * Math.sin(i * 0.31 - t * 1.7));
    const bh = a * H * 0.14;
    c.globalAlpha = 0.45 + a * 0.55;
    c.fillStyle = MINT;
    c.fillRect(W * 0.2 + i * bw, H * 0.6 - bh / 2, bw * 0.55, bh);
  }
  c.globalAlpha = 1;

  // Starts an hour in, then plays on in real time
  const at = (3600 + 12 * 60 + t) % EPISODE;
  c.fillStyle = 'rgba(43, 239, 193, 0.2)';
  c.fillRect(W * 0.2, H * 0.8, W * 0.6, H * 0.012);
  c.fillStyle = MINT;
  c.fillRect(W * 0.2, H * 0.8, W * 0.6 * (at / EPISODE), H * 0.012);
  c.font = `500 ${H * 0.045}px system-ui, sans-serif`;
  c.fillStyle = 'rgba(43, 239, 193, 0.7)';
  c.textAlign = 'left';
  c.fillText(clock(at), W * 0.2, H * 0.87);
  c.textAlign = 'right';
  c.fillText(`-${clock(EPISODE - at)}`, W * 0.8, H * 0.87);
}

// Claude Code in a terminal, typing out the session that built this room
const SESSION = [
  ['✻ Welcome to Claude Code!', '#D97757'],
  ['> make my living room in 3D', '#E8E6E3'],
  ['⏺ Update(src/scripts/hero-room.js)', '#E8E6E3'],
  ['  ⎿  Added a TV, a scarf and Lego flowers', '#8A8986'],
  ['⏺ Done. Lean left to look around.', '#E8E6E3'],
];
const SESSION_CHARS = SESSION.reduce((n, [s]) => n + s.length, 0);

function laptop(c, W, H, t) {
  const b = H * 0.045;
  c.fillStyle = '#2A2A2B';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#1E1D1C';
  c.fillRect(b, b, W - b * 2, H - b * 2);

  const fs = H * 0.062, p = b + W * 0.035;
  c.font = `${fs}px ui-monospace, Menlo, monospace`;
  c.textBaseline = 'middle';
  // Type the session out, hold it, then start over
  let left = Math.floor((t * 22) % (SESSION_CHARS + 80));
  let y = p + fs * 1.2;
  SESSION.forEach(([line, color], i) => {
    if (i === 0) {
      c.strokeStyle = color;
      c.lineWidth = fs * 0.1;
      c.strokeRect(p - fs * 0.5, p, W - (p - fs * 0.5) * 2, fs * 2.4);
    }
    const shown = line.slice(0, Math.max(0, left));
    left -= line.length;
    c.fillStyle = color;
    c.fillText(shown, p, y);
    if (left < 0 && left > -line.length - 1 && Math.floor(t * 2) % 2) {
      c.fillRect(p + c.measureText(shown).width + fs * 0.1, y - fs * 0.5, fs * 0.55, fs);
    }
    y += i === 0 ? fs * 2.6 : fs * 1.9;
  });
}

// A football match on the iPad: striped pitch, ten players, a ball, a score
const PLAYERS = [
  [0.2, 0.5], [0.3, 0.3], [0.3, 0.7], [0.42, 0.45], [0.45, 0.2],
  [0.8, 0.5], [0.7, 0.32], [0.7, 0.68], [0.58, 0.55], [0.56, 0.8],
];

function ipad(c, W, H, t) {
  const b = H * 0.06;
  c.fillStyle = '#0D0D0E';
  c.beginPath();
  c.roundRect(0, 0, W, H, b * 1.4);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = b * 0.5;
  c.stroke();
  c.translate(b, b);
  W -= b * 2;
  H -= b * 2;
  for (let i = 0; i < 10; i++) {
    c.fillStyle = i % 2 ? '#2E8B3E' : '#349A45';
    c.fillRect((W / 10) * i, 0, W / 10 + 0.5, H);
  }
  c.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  c.lineWidth = H * 0.012;
  c.strokeRect(W * 0.04, H * 0.06, W * 0.92, H * 0.88);
  c.beginPath();
  c.moveTo(W / 2, H * 0.06);
  c.lineTo(W / 2, H * 0.94);
  c.moveTo(W / 2 + H * 0.15, H / 2);
  c.arc(W / 2, H / 2, H * 0.15, 0, Math.PI * 2);
  c.stroke();

  PLAYERS.forEach(([fx, fy], i) => {
    c.fillStyle = i < 5 ? '#DA291C' : '#6CABDD';
    c.beginPath();
    c.arc(W * fx + Math.sin(t * 0.9 + i) * W * 0.03, H * fy + Math.cos(t * 0.7 + i * 1.3) * H * 0.05, H * 0.03, 0, Math.PI * 2);
    c.fill();
  });
  c.fillStyle = '#FFF';
  c.beginPath();
  c.arc(W * (0.5 + 0.3 * Math.sin(t * 0.6)), H * (0.5 + 0.25 * Math.sin(t * 1.1)), H * 0.02, 0, Math.PI * 2);
  c.fill();

  c.fillStyle = 'rgba(10, 10, 20, 0.85)';
  c.fillRect(W * 0.05, H * 0.09, W * 0.34, H * 0.11);
  c.fillStyle = '#FFF';
  c.font = `700 ${H * 0.07}px system-ui, sans-serif`;
  c.textBaseline = 'middle';
  c.fillText(`MUN 2–1 MCI  ${45 + (Math.floor(t * 2) % 45)}'`, W * 0.07, H * 0.145);
}

// The Norway scarf: red with navy edges and ends, NORGE down its length
function scarf(c, W, H) {
  const fringe = H * 0.07, body = H - fringe;
  c.fillStyle = '#BA0C2F';
  c.fillRect(0, 0, W, body);
  c.fillStyle = '#00205B';
  c.fillRect(0, 0, W * 0.14, body);
  c.fillRect(W * 0.86, 0, W * 0.14, body);
  c.fillRect(0, 0, W, H * 0.05);
  c.fillRect(0, body - H * 0.06, W, H * 0.04);
  c.save();
  c.translate(W / 2, body * 0.48);
  c.rotate(-Math.PI / 2);
  c.fillStyle = '#FFF';
  c.font = `900 ${W * 0.62}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('NORGE', 0, 0);
  c.restore();
  c.lineWidth = W / 24;
  for (let i = 0; i < 12; i++) {
    c.strokeStyle = i % 2 ? '#00205B' : '#BA0C2F';
    c.beginPath();
    c.moveTo(W * (i + 0.5) / 12, body);
    c.lineTo(W * (i + 0.5) / 12, H);
    c.stroke();
  }
}

// Lego flowers: stems up out of the pot to blocky heads. Each head is
// [x, y] as fractions of the panel, then its petal colour.
function flowers(heads) {
  return (c, W, H) => {
    const u = W * 0.05; // one stud
    // Each stem twice: wide in ink, then green down the middle, for the outline
    for (const [color, width] of [[INK, u * 0.75], ['#2F6B3A', u * 0.4]]) {
      c.strokeStyle = color;
      c.lineWidth = width;
      for (const [fx, fy] of heads) {
        c.beginPath();
        c.moveTo(W / 2 + (fx - 0.5) * W * 0.2, H);
        c.quadraticCurveTo(W / 2, H * 0.6, W * fx, H * fy);
        c.stroke();
      }
    }
    c.strokeStyle = INK;
    c.lineWidth = u * 0.2;
    c.fillStyle = '#3E8A4A';
    for (const [fx, fy] of heads) {
      c.save();
      c.translate(W / 2 + (fx - 0.5) * W * 0.5, H * (fy + 1) / 2);
      c.rotate(fx < 0.5 ? -0.6 : 0.6);
      c.fillRect(-u, -u * 0.4, u * 2, u * 0.8);
      c.strokeRect(-u, -u * 0.4, u * 2, u * 0.8);
      c.restore();
    }
    for (const [fx, fy, color] of heads) {
      c.save();
      c.translate(W * fx, H * fy);
      c.fillStyle = color;
      for (let i = 0; i < 4; i++) {
        c.rotate(Math.PI / 2);
        c.fillRect(-u * 0.6, -u * 1.5, u * 1.2, u * 1.1);
        c.strokeRect(-u * 0.6, -u * 1.5, u * 1.2, u * 1.1);
      }
      c.fillStyle = '#F6C33B';
      c.fillRect(-u * 0.45, -u * 0.45, u * 0.9, u * 0.9);
      c.strokeRect(-u * 0.45, -u * 0.45, u * 0.9, u * 0.9);
      c.restore();
    }
  };
}

// The cube shelf's front: four cubbies, three with fabric bins
function cubbies(c, W, H) {
  for (let i = 0; i < 4; i++) {
    const x = W * (0.02 + i * 0.245), cw = W * 0.225, y = H * 0.1, ch = H * 0.82;
    c.fillStyle = '#140F0C';
    c.fillRect(x, y, cw, ch);
    if (i === 2) {
      // Open: a speaker and a controller
      c.fillStyle = '#E9E7E2';
      c.beginPath();
      c.roundRect(x + cw * 0.15, y + ch * 0.4, cw * 0.22, ch * 0.6, cw * 0.05);
      c.roundRect(x + cw * 0.52, y + ch * 0.72, cw * 0.36, ch * 0.28, ch * 0.1);
      c.fill();
      continue;
    }
    c.fillStyle = '#C9B06A';
    c.fillRect(x + cw * 0.04, y + ch * 0.08, cw * 0.92, ch * 0.92);
    c.fillStyle = 'rgba(0, 0, 0, 0.3)';
    c.fillRect(x + cw * 0.38, y + ch * 0.18, cw * 0.24, ch * 0.08);
  }
}

// The poster on the left wall: a magazine-cover-style print, an original
// illustration (Manhattan at dusk from the water) under a masthead. Painted
// once into its own canvas, then drawn onto the wall in slices.
function poster(c, W, H) {
  c.fillStyle = '#1A1A1A'; // frame
  c.fillRect(0, 0, W, H);
  const f = W * 0.04;
  c.translate(f, f);
  W -= f * 2;
  H -= f * 2;
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#24345E');
  sky.addColorStop(0.55, '#E9876A');
  sky.addColorStop(0.75, '#F6C98B');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);

  c.fillStyle = '#FFF4DA';
  c.beginPath();
  c.arc(W * 0.72, H * 0.3, W * 0.07, 0, Math.PI * 2);
  c.fill();

  // Skyline: towers of varied heights, a few lit windows
  const towers = [[0.02, 0.5], [0.1, 0.38], [0.17, 0.45], [0.23, 0.3], [0.3, 0.42], [0.37, 0.22], [0.42, 0.36], [0.5, 0.44], [0.57, 0.28], [0.64, 0.4], [0.72, 0.47], [0.8, 0.34], [0.88, 0.43], [0.95, 0.5]];
  towers.forEach(([x, top], i) => {
    const tw = W * 0.075, tx = W * x, ty = H * (top + 0.12);
    c.fillStyle = i % 2 ? '#1F2440' : '#2A2F52';
    c.fillRect(tx, ty, tw, H * 0.72 - ty);
    if (i === 5) { // a spire on the tallest
      c.beginPath();
      c.moveTo(tx + tw * 0.3, ty);
      c.lineTo(tx + tw / 2, ty - H * 0.08);
      c.lineTo(tx + tw * 0.7, ty);
      c.fill();
    }
    c.fillStyle = '#F8D58A';
    for (let y = ty + H * 0.03; y < H * 0.7; y += H * 0.04) {
      for (let wx = 0; wx < 3; wx++) {
        if ((i * 7 + wx * 3 + Math.round(y)) % 5 === 0) c.fillRect(tx + tw * (0.15 + wx * 0.27), y, tw * 0.14, H * 0.015);
      }
    }
  });

  // The river, with the lights in it
  c.fillStyle = '#1B2A4A';
  c.fillRect(0, H * 0.72, W, H * 0.28);
  c.fillStyle = 'rgba(248, 213, 138, 0.5)';
  for (let i = 0; i < 18; i++) c.fillRect(W * ((i * 0.137) % 1), H * (0.75 + (i % 6) * 0.04), W * 0.08, H * 0.006);

  // Masthead
  c.fillStyle = '#FFF';
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.font = `${W * 0.13}px Didot, "Bodoni 72", Georgia, serif`;
  c.fillText('THE NEW YORKER', W / 2, H * 0.03, W * 0.92);
}

// ── The subway car ── Its walls rise straight from the floor and curve into
// the ceiling (COVE). Painted along each straight wall, near end to far end
// (u, 0 to 1), floor to where the curve starts (v, 0 to 1): two sets of
// doors, and between them bench backs with windows and ads above, the ads
// beside the windows as in the real thing.
const CAR = { len: 4.5, doors: [[0.02, 0.14], [0.52, 0.64]], benches: [[0.16, 0.5], [0.66, 0.96]] };
const SUBWAY_HW = 0.95; // the car's height, in band widths
const COVE = 0.16; // radius of the curve from wall to ceiling, in band widths
// A tunnel lamp passes every `every` seconds, taking `pass` to cross the
// car, at height v up the wall (the middle of the windows)
const LAMP = { every: 1.8, pass: 0.45, v: 0.66 };
const WALL_V = { back: [0.24, 0.44], band: [0.48, 0.84], door: 0.93, doorWin: [0.5, 0.82] };

// The ads are for my own things
const ADS = [
  { bg: '#F5C84C', fg: INK, big: ['Design is a', 'skillset, not', 'a job.'], small: 'Avyay Kashyap' },
  { bg: '#6B3E26', fg: '#F7E7CF', big: ['Drinks', 'I Sip'], small: 'Hot chocolate in New York, rated.' },
  { bg: '#E9EEF6', fg: '#1A6CF0', big: ['Points Are', 'Really Bad'], small: 'Predict the score.' },
  { bg: INK, fg: '#FFFFFF', big: ['Product', 'designer,', 'New York.'], small: 'avyayrk.com' },
  { bg: '#F2A7C3', fg: INK, big: ['I solve', 'problems that', 'make every', 'day better.'], small: 'Avyay Kashyap' },
  { bg: '#0E3B3B', fg: '#2BEFC1', big: ['Now', 'listening:', 'Acquired'], small: 'Hours of company stories.' },
];

function ad(c, W, H, { bg, fg, big, small }) {
  const r = W * 0.06;
  c.beginPath();
  c.roundRect(0, 0, W, H, r);
  c.fillStyle = bg;
  c.fill();
  c.fillStyle = fg;
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.font = `800 ${W * 0.11}px system-ui, sans-serif`;
  big.forEach((line, i) => c.fillText(line, W * 0.09, H * 0.1 + i * W * 0.13, W * 0.82));
  c.font = `500 ${W * 0.055}px system-ui, sans-serif`;
  c.fillText(small, W * 0.09, H * 0.84, W * 0.82);
  c.strokeStyle = INK;
  c.lineWidth = W * 0.018;
  c.beginPath();
  c.roundRect(c.lineWidth / 2, c.lineWidth / 2, W - c.lineWidth, H - c.lineWidth, r);
  c.stroke();
}

// Along each bench: ad, window, ad, window
function benchSlots(u0, u1) {
  const seg = u1 - u0, gap = seg * 0.016, kinds = ['ad', 'win', 'ad', 'win'], widths = [0.18, 0.28, 0.18, 0.28];
  let u = u0 + gap;
  return kinds.map((kind, i) => {
    const a = u, b = u + widths[i] * seg;
    u = b + gap;
    return { kind, a, b };
  });
}

// Where a stretch of wall [u0, u1] lands across the texture: near to far
// reads left to right on the left wall and right to left on the right
const span = (side, W, u0, u1) => (side < 0 ? [u0 * W, (u1 - u0) * W] : [(1 - u1) * W, (u1 - u0) * W]);
const band = (H, [v0, v1]) => [H * (1 - v1), H * (v1 - v0)];

// Every window on a wall, as texture rects, for the static paint and for the
// tunnel going past in them
function carWindows(side, W, H) {
  const out = [];
  for (const [u0, u1] of CAR.benches) {
    for (const { kind, a, b } of benchSlots(u0, u1)) {
      if (kind !== 'win') continue;
      const [x, w] = span(side, W, a, b), [y, h] = band(H, WALL_V.band);
      out.push([x, y, w, h]);
    }
  }
  for (const [u0, u1] of CAR.doors) {
    const [x, w] = span(side, W, u0, u1), [y, h] = band(H, WALL_V.doorWin);
    out.push([x + w * 0.16, y, w * 0.24, h], [x + w * 0.6, y, w * 0.24, h]);
  }
  return out;
}

const rrect = (c, x, y, w, h, r) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
};

function carWall(side) {
  return {
    paint(c, W, H) {
      c.fillStyle = '#E4E6E3';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#9A9EA3'; // kick plate
      c.fillRect(0, H * 0.95, W, H * 0.05);
      c.strokeStyle = INK;
      c.lineWidth = H * 0.008;
      for (const [u0, u1] of CAR.benches) {
        const [x, w] = span(side, W, u0, u1), [y, h] = band(H, WALL_V.back);
        c.fillStyle = '#8EA0D6'; // the bench's back, soft at the top
        rrect(c, x, y, w, h, [h * 0.5, h * 0.5, 0, 0]);
        c.fill();
        c.stroke();
      }
      for (const [u0, u1] of CAR.doors) {
        const [x, w] = span(side, W, u0, u1), [y, h] = band(H, [0, WALL_V.door]), r = w * 0.08;
        c.fillStyle = '#B9BEC3';
        rrect(c, x + w * 0.06, y, w * 0.44, h, [r, 0, 0, 0]);
        c.fill();
        c.stroke();
        rrect(c, x + w * 0.5, y, w * 0.44, h, [0, r, 0, 0]);
        c.fill();
        c.stroke();
      }
      for (const [x, y, ww, wh] of carWindows(side, W, H)) {
        c.fillStyle = '#15181B';
        rrect(c, x, y, ww, wh, Math.min(ww, wh) * 0.18);
        c.fill();
        c.stroke();
      }
    },
    // The tunnel going by: every so often a single lamp zips past, front to
    // back down the car, trailing a smear of light. Each wall gets its own,
    // half a beat apart.
    live(c, W, H, t) {
      const wins = carWindows(side, W, H);
      c.save();
      c.beginPath();
      for (const [x, y, ww, wh] of wins) c.roundRect(x, y, ww, wh, Math.min(ww, wh) * 0.18);
      c.clip();
      const p = ((t + (side > 0 ? LAMP.every / 2 : 0)) % LAMP.every) / LAMP.pass;
      if (p < 1) {
        // u runs near to far; the lamp comes from the far end toward you
        const u = 1 - p, x = side < 0 ? u * W : (1 - u) * W, y = H * (1 - LAMP.v);
        const dir = side < 0 ? 1 : -1, len = W * 0.12; // the smear trails behind it
        const g = c.createLinearGradient(x, 0, x + dir * len, 0);
        g.addColorStop(0, 'rgba(255, 236, 180, 1)');
        g.addColorStop(1, 'rgba(255, 236, 180, 0)');
        c.fillStyle = g;
        c.fillRect(Math.min(x, x + dir * len), y - H * 0.012, len, H * 0.024);
        const halo = c.createRadialGradient(x, y, 0, x, y, H * 0.09);
        halo.addColorStop(0, 'rgba(255, 244, 210, 0.9)');
        halo.addColorStop(1, 'rgba(255, 244, 210, 0)');
        c.fillStyle = halo;
        c.fillRect(x - H * 0.09, y - H * 0.09, H * 0.18, H * 0.18);
      }
      c.restore();
      c.strokeStyle = INK;
      c.lineWidth = H * 0.008;
      for (const [x, y, ww, wh] of wins) {
        rrect(c, x, y, ww, wh, Math.min(ww, wh) * 0.18);
        c.stroke();
      }
    },
  };
}

// Each ad is its own piece of wall art with its own texture, so its text
// stays sharp up close; painted into the whole wall's texture it was a few
// dozen pixels tall and blurred as soon as it was stretched
function carAds(side) {
  let n = side < 0 ? 0 : 3;
  const wallH = SUBWAY_HW - COVE, [v0, v1] = WALL_V.band;
  return CAR.benches.flatMap(([u0, u1]) => benchSlots(u0, u1).filter((s) => s.kind === 'ad').map(({ a, b }) => {
    const card = ADS[n++ % ADS.length];
    return {
      side, z0: -a * CAR.len, z1: -b * CAR.len, up: v0 * wallH, h: (v1 - v0) * wallH,
      size: [560, 600], paint: (c, W, H) => ad(c, W, H, card),
    };
  }));
}

// The far end of the car: the storm door, with the next car lit up through
// its window, and the sign over it: the A to Chambers St. Only the door and sign are
// painted; the wall round them is the room's own.
function carEnd(c, W, H) {
  c.strokeStyle = INK;
  c.lineWidth = H * 0.008;
  const dw = W * 0.3, dx = (W - dw) / 2, dy = H * 0.18;
  c.fillStyle = '#B9BEC3';
  rrect(c, dx, dy, dw, H - dy, [dw * 0.12, dw * 0.12, 0, 0]);
  c.fill();
  c.stroke();
  const wx = dx + dw * 0.2, wy = H * 0.3, ww = dw * 0.6, wh = H * 0.3;
  c.fillStyle = '#F3F0E2';
  rrect(c, wx, wy, ww, wh, ww * 0.18);
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = '#B4B8BC'; // a pole and the far end of the next car
  c.fillRect(wx + ww * 0.46, wy, ww * 0.07, wh);
  c.restore();
  rrect(c, wx + ww * 0.3, wy + wh * 0.3, ww * 0.4, wh * 0.5, ww * 0.08);
  c.stroke();
  rrect(c, wx, wy, ww, wh, ww * 0.18);
  c.stroke();
  c.fillStyle = '#2B2F33';
  rrect(c, dx, H * 0.06, dw, H * 0.08, H * 0.04);
  c.fill();
  c.beginPath();
  c.arc(dx + dw * 0.14, H * 0.1, H * 0.028, 0, Math.PI * 2);
  c.fillStyle = '#0039A6'; // the A, in its blue
  c.fill();
  c.fillStyle = '#FFF';
  c.font = `700 ${H * 0.038}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('A', dx + dw * 0.14, H * 0.102);
  c.textAlign = 'left';
  c.font = `600 ${H * 0.032}px system-ui, sans-serif`;
  c.fillText('Chambers St', dx + dw * 0.24, H * 0.102, dw * 0.72);
}

// The bench seat's cross-section, out from the wall (in) and up from the
// floor: a slab with a rounded front edge
const SEAT = [[0, 0.215], [0.15, 0.215], [0.185, 0.205], [0.2, 0.185], [0.2, 0.17], [0.19, 0.155], [0.17, 0.15], [0, 0.15]];

// ── The rooms ── room: w and d in band widths; height h in band heights, or
// hw in band widths for a room that keeps its shape on any screen. Each item:
// x = centre, up = bottom edge above the floor, z = depth of the front face
// (all negative, into the room), w/h/d = size; h: 'ceil' runs to the
// ceiling. A box has a colour and maybe a painted front; a panel only a
// paint (outline: true rings it in ink); a column a colour and a radius r,
// floor to ceiling unless it has its own up and h, and a glowing one is lit
// from inside. late: true draws it after everything else (see below). art is
// painted along a side wall (side -1 left, 1 right) from z0 back to z1.
const HOME = {
  room: { w: 1.8, h: 1.5, d: 1.4 },
  walls: { back: '#F2CDB3', side: '#E9C1A5', ceiling: '#E6C3AA', floor: '#CFA47C' },
  floorLines: 0.09, // floorboards
  vignette: true,
  art: [
    // Between the window and the column, so it only shows when you lean
    // right to look left
    { side: -1, z0: -0.3, z1: -0.62, up: 0.14, h: 0.42, size: [960, 1280], strips: 64, paint: poster },
  ],
  items: [
    // Light on the back wall: the TV's red backlight, the lamp's warm spill
    { panel: glow([255, 40, 25], 0.85), x: 0, up: 0.02, z: -1.399, w: 1.1, h: 0.78 },
    { panel: glow([255, 196, 120], 0.6), x: 0.74, up: 0, z: -1.398, w: 0.6, h: 0.8 },
    { column: '#F6DDB4', glow: true, x: 0.74, z: -1.2, r: 0.05, up: 0, h: 0.5 },

    // TV stand, soundbar, TV on its two feet
    { box: '#2B211B', front: cubbies, x: 0, up: 0, z: -1.08, w: 0.62, h: 0.19, d: 0.15 },
    { box: '#121212', x: 0, up: 0.19, z: -1.11, w: 0.3, h: 0.03, d: 0.05 },
    { box: '#2A2A2A', x: -0.2, up: 0.19, z: -1.16, w: 0.015, h: 0.025, d: 0.04 },
    { box: '#2A2A2A', x: 0.2, up: 0.19, z: -1.16, w: 0.015, h: 0.025, d: 0.04 },
    { box: '#0B0B0C', front: tv, x: 0, up: 0.215, z: -1.17, w: 0.52, h: 0.3, d: 0.02 },

    // Lego flowers in a white pot, right of the stand
    { panel: flowers([[0.25, 0.22, '#E2462F'], [0.6, 0.08, '#F08A24'], [0.82, 0.3, '#3C6FD8']]), x: 0.44, up: 0.08, z: -1.06, w: 0.2, h: 0.26 },
    { panel: flowers([[0.42, 0.18, '#F2A7C3'], [0.7, 0.42, '#E2462F'], [0.15, 0.48, '#F6C33B']]), x: 0.44, up: 0.08, z: -1.04, w: 0.2, h: 0.26 },
    { box: '#F5F3EE', x: 0.44, up: 0, z: -1.02, w: 0.07, h: 0.08, d: 0.07 },

    // The pillar, with the scarf hanging down its front
    { column: '#F6EDE3', x: -0.62, z: -0.72, r: 0.12 },
    { panel: scarf, outline: true, x: -0.6, up: 0.1, z: -0.716, w: 0.065, h: 0.5 },

    // Coffee table up close: the laptop on Claude Code, the iPad on EA FC
    { box: '#1C1715', x: 0.02, up: 0, z: -0.04, w: 1, h: 0.06, d: 0.34 },
    { panel: laptop, outline: true, x: -0.1, up: 0.064, z: -0.3, w: 0.24, h: 0.15 },
    { box: '#9A9CA1', x: -0.1, up: 0.06, z: -0.13, w: 0.24, h: 0.005, d: 0.17 },
    { panel: ipad, x: 0.3, up: 0.06, z: -0.2, w: 0.16, h: 0.105 },
  ],
};

const STEEL = '#C9CED3';
const L = CAR.len, BAR = 0.43; // the grab bars run this far out from the middle
const SUBWAY = {
  room: { w: 1.25, hw: SUBWAY_HW, d: L, cove: COVE },
  walls: { back: '#DADCD9', side: '#E4E6E3', ceiling: '#F1F1EE', floor: '#3E3F44' },
  // Two strip lights down the ceiling, where it meets the curve
  ceilingLights: [[-0.44, -0.38], [0.38, 0.44]],
  art: [-1, 1].flatMap((side) => [
    { side, z0: 0, z1: -L, up: 0, h: SUBWAY_HW - COVE, size: [2400, 420], strips: 96, ...carWall(side) },
    ...carAds(side),
  ]),
  items: [
    { panel: carEnd, x: 0, up: 0, z: -L + 0.001, w: 1.25, h: 'ceil' },
    ...[-1, 1].flatMap((side) => CAR.benches.flatMap(([u0, u1]) => [
      { box: '#55575C', x: side * 0.555, up: 0, z: -u0 * L - 0.02, w: 0.14, h: 0.15, d: (u1 - u0) * L - 0.04 },
      { extrude: '#8EA0D6', side, profile: SEAT, z: -u0 * L, d: (u1 - u0) * L },
      // A grab bar for each bench: up from the floor at one end, along over
      // the seat, down at the other, bent round smoothly at the corners
      { tube: STEEL, late: true, r: 0.009, z: -u0 * L, pts: [[side * BAR, 0, -u0 * L], [side * BAR, 0.78, -u0 * L], [side * BAR, 0.78, -u1 * L], [side * BAR, 0, -u1 * L]] },
    ])),
    // And straight poles down the middle, at the doors
    ...CAR.doors.map(([u0, u1]) => {
      const z = -((u0 + u1) / 2) * L;
      return { tube: STEEL, late: true, r: 0.011, z, pts: [[0, 0, z], [0, SUBWAY_HW, z]] };
    }),
  ],
};

// Far to near; ties keep the order above. ponytail: sorting by front face is
// enough while things don't overlap in depth. The car's benches are long and
// its poles stand just in front of them, so the poles go last (late) rather
// than paying for a z-buffer.
export const SCENES = [SUBWAY, HOME]; // the first is where Immerse opens
for (const s of SCENES) s.items.sort((a, b) => (a.late ?? 0) - (b.late ?? 0) || a.z - b.z);

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// A path through pts with each corner swapped for a curve that starts and
// ends r before it
function bend(pts, r) {
  const out = [pts[0]];
  const toward = (from, to) => {
    const d = to.map((v, j) => v - from[j]), l = Math.hypot(...d), m = Math.min(r, l / 2) / l;
    return from.map((v, j) => v + d[j] * m);
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const q = pts[i], a = toward(q, pts[i - 1]), b = toward(q, pts[i + 1]);
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      out.push(a.map((v, j) => (1 - t) ** 2 * v + 2 * (1 - t) * t * q[j] + t * t * b[j]));
    }
  }
  out.push(pts.at(-1));
  return out;
}

// A wall's art lives in its own canvas, painted once; art with a live part
// (the tunnel) is copied to a second canvas each frame and drawn over there
const canvasOf = ([W, H]) => Object.assign(document.createElement('canvas'), { width: W, height: H });
function texture(a, t) {
  if (!a.tex) {
    a.tex = canvasOf(a.size);
    a.paint(a.tex.getContext('2d'), ...a.size);
  }
  if (!a.live) return a.tex;
  a.frame ??= canvasOf(a.size);
  const c = a.frame.getContext('2d');
  c.drawImage(a.tex, 0, 0);
  a.live(c, ...a.size, t);
  return a.frame;
}

// Every point is projected from the eye onto the band (z = 0), so the room
// shifts the way a real one would behind a window. Coordinates: x right, y
// down, z out of the screen toward you (the room is at z < 0); origin at the
// band's centre, in CSS px. k is how much depth there is: at 0 the whole
// room is pressed flat onto its back wall and seen from straight ahead, a
// still picture; toward 1 it grows out toward the viewer and starts
// following their head. t is the time in seconds, for the screens.
export function drawRoom(ctx, w, h, eye, k, t, scene) {
  const { room, walls } = scene;
  const X = (room.w * w) / 2, D = room.d * w;
  const Y = room.hw ? (room.hw * w) / 2 : (room.h * h) / 2;
  const ex = eye.x * k, ey = eye.y * k, ez = eye.z;
  const scale = (z) => ez / (ez + D - (z + D) * k);
  const P = (x, y, z) => {
    const s = scale(z);
    return [w / 2 + ex + (x - ex) * s, h / 2 + ey + (y - ey) * s];
  };
  const path = (pts) => {
    ctx.beginPath();
    pts.forEach((p, n) => ctx[n ? 'lineTo' : 'moveTo'](...P(...p)));
    ctx.closePath();
  };
  // Ink for something at depth z: thinner the further off it is
  const ink = (z) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(0.6, OUTLINE * scale(z));
    ctx.lineJoin = 'round';
  };
  // A panel at depth z projects to a plain rectangle: move to its corner,
  // scale, and let it paint in its own W×H
  const panel = (x, y, z, W, H, paint, outline) => {
    const [px, py] = P(x, y, z), s = scale(z);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    paint(ctx, W, H, t);
    ctx.restore();
    if (!outline) return;
    ink(z);
    ctx.strokeRect(px, py, W * s, H * s);
  };

  // A cylinder, drawn as thin vertical strips across the half of it turned
  // toward the eye (from where the eye's sight lines touch it). The eye is
  // placed in room coordinates: with depth k pressed flat it sits
  // (ez + D) / k - D out. A plain column is shaded by how far each strip
  // turns from the light (front right); a glowing one, the paper lamp, is
  // brightest where it faces you, with paper ribs across it.
  const LIGHT = [0.45, 0.89];
  const column = ({ column: color, glow: lamp, x, z, r, up = 0, h: ht }) => {
    const cx = x * w, cz = (z - r) * w, R = r * w, n = 24;
    const yb = Y - up * w, yt = ht ? yb - ht * w : -Y;
    const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    const eyeZ = k > 0.001 ? (ez + D) / k - D : 1e9;
    const toEye = Math.atan2(eyeZ - cz, ex - cx), dist = Math.hypot(eyeZ - cz, ex - cx);
    if (dist <= R) return;
    const half = Math.acos(R / dist), from = toEye - half, step = (half * 2) / n;
    const at = (a, y) => [cx + R * Math.cos(a), y, cz + R * Math.sin(a)];
    ctx.lineWidth = 0.75;
    for (let i = 0; i < n; i++) {
      const a = from + i * step, b = a + step, m = a + step / 2;
      const nx = Math.cos(m), nz = Math.sin(m);
      path([at(a, yt), at(b, yt), at(b, yb), at(a, yb)]);
      // One solid colour per strip, so overlapping edges don't show as seams
      const lit = lamp
        ? 0.82 + 0.25 * Math.cos(m - toEye)
        : 1 - 0.4 * (1 - Math.max(0, nx * LIGHT[0] + nz * LIGHT[1]));
      ctx.fillStyle = ctx.strokeStyle = `rgb(${rgb.map((v) => Math.min(255, v * lit))})`;
      ctx.fill();
      ctx.stroke();
    }
    const arc = (y) => Array.from({ length: n + 1 }, (_, i) => at(from + i * step, y));
    if (lamp) {
      ctx.strokeStyle = 'rgba(150, 100, 40, 0.25)';
      ctx.lineWidth = 0.75;
      for (let y = yt; y < yb; y += (yb - yt) / 24) {
        ctx.beginPath();
        arc(y).forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](...P(...p)));
        ctx.stroke();
      }
    }
    path([...arc(yt), ...arc(yb).reverse()]);
    ink(z);
    ctx.stroke();
  };

  // A shape pulled along the room's length: profile is its cross-section,
  // out from the side wall and up from the floor, from z back d. Only the
  // faces turned toward the eye are drawn, lit from above, then the front
  // end; ink goes round the front end, along the edges where the shape
  // turns away, and across the far end of what's showing.
  const extrude = ({ extrude: color, side, profile, z, d }) => {
    const rgb = rgbOf(color), z0 = z * w, z1 = (z - d) * w;
    const pts = profile.map(([i, u]) => [side * (X - i * w), Y - u * w]), n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    const shown = pts.map((p, i) => {
      const q = pts[(i + 1) % n], cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2;
      let nx = q[1] - p[1], ny = p[0] - q[0];
      if (nx * (cx - mx) + ny * (cy - my) < 0) [nx, ny] = [-nx, -ny];
      if (nx * (ex - cx) + ny * (ey - cy) <= 0) return false;
      path([[...p, z0], [...q, z0], [...q, z1], [...p, z1]]);
      const lit = 0.72 + 0.28 * Math.max(0, -ny / Math.hypot(nx, ny));
      ctx.fillStyle = ctx.strokeStyle = `rgb(${rgb.map((v) => v * lit)})`;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      return true;
    });
    path(pts.map((p) => [...p, z0]));
    ctx.fillStyle = ctx.strokeStyle = `rgb(${rgb.map((v) => v * 0.9)})`;
    ctx.fill();
    ink(z0);
    ctx.stroke();
    pts.forEach((p, i) => {
      if (shown[i] === shown[(i + n - 1) % n]) return;
      ctx.beginPath();
      ctx.moveTo(...P(...p, z0));
      ctx.lineTo(...P(...p, z1));
      ctx.stroke();
    });
    ink(z1);
    pts.forEach((p, i) => {
      if (!shown[i]) return;
      ctx.beginPath();
      ctx.moveTo(...P(...p, z1));
      ctx.lineTo(...P(...pts[(i + 1) % n], z1));
      ctx.stroke();
    });
  };

  // A steel tube along pts ([x, up, z] in band widths), its corners bent
  // round: ink, then steel, then a shine down the middle, each as a line
  // whose width follows the tube's depth
  const tube = ({ tube: color, r, pts }) => {
    const segs = [];
    const world = bend(pts, 0.1).map(([x, u, z]) => [x * w, Y - u * w, z * w]);
    for (let i = 0; i < world.length - 1; i++) {
      const s = scale((world[i][2] + world[i + 1][2]) / 2);
      segs.push([P(...world[i]), P(...world[i + 1]), 2 * r * w * s, Math.max(0.6, OUTLINE * s)]);
    }
    ctx.lineCap = 'round';
    for (const [style, width] of [[INK, (t, o) => t + o * 2], [color, (t) => t], ['rgba(255, 255, 255, 0.7)', (t) => t * 0.3]]) {
      ctx.strokeStyle = style;
      for (const [a, b, thick, out] of segs) {
        ctx.lineWidth = width(thick, out);
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  };

  // Art along a side wall. Each thin vertical slice of it sits at one depth,
  // so it goes on as a plain scaled rectangle, and side by side the slices
  // make the perspective. Slices are spaced evenly across the screen rather
  // than the wall, so the near end isn't a few coarse steps.
  const wallArt = (a) => {
    if (k < 0.001) return; // pressed flat, a side wall has no width
    const tex = texture(a, t), x = a.side * X;
    const ht = a.h === 'ceil' ? (2 * Y) / w - a.up : a.h;
    const top = Y - (a.up + ht) * w, bottom = Y - a.up * w;
    // The texture reads near to far on the left wall, far to near on the right
    const [zs, ze] = (a.side < 0 ? [a.z0, a.z1] : [a.z1, a.z0]).map((z) => z * w);
    const ss = scale(zs), se = scale(ze), n = a.strips ?? 40;
    ctx.imageSmoothingQuality = 'high';
    let za = zs, ua = 0;
    for (let i = 1; i <= n; i++) {
      const zb = (ez + D - ez / (ss + ((se - ss) * i) / n)) / k - D;
      const ub = (zb - zs) / (ze - zs), zm = (za + zb) / 2;
      const [xa] = P(x, 0, za), [xb] = P(x, 0, zb);
      const [, ya] = P(x, top, zm), [, yb] = P(x, bottom, zm);
      if (xb - xa > 0.05) ctx.drawImage(tex, ua * tex.width, 0, (ub - ua) * tex.width, tex.height, xa, ya, xb - xa + 0.6, yb - ya);
      za = zb;
      ua = ub;
    }
  };

  // The shell. Its cross-section runs up the left wall, across the ceiling
  // and down the right; with a cove the corners at the top are quarter
  // circles, so the walls curve into the ceiling. The back wall is that
  // shape; the rest is it pulled back from the band to the back wall.
  const c = (room.cove ?? 0) * w;
  const corner = (cx, from) => Array.from({ length: 9 }, (_, i) => {
    const a = from + (i / 8) * (Math.PI / 2);
    return [cx + c * Math.cos(a), -Y + c + c * Math.sin(a)];
  });
  const profile = c
    ? [[-X, Y], ...corner(-X + c, Math.PI), ...corner(X - c, Math.PI * 1.5), [X, Y]]
    : [[-X, Y], [-X, -Y], [X, -Y], [X, Y]];
  const side = rgbOf(walls.side), top = rgbOf(walls.ceiling);
  const fill = (color) => {
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke(); // closes the hairline seams between pieces
  };
  path(profile.map(([x, y]) => [x, y, -D]));
  fill(walls.back);
  path([[-X, Y, 0], [X, Y, 0], [X, Y, -D], [-X, Y, -D]]);
  fill(walls.floor);
  for (let i = 0; i < profile.length - 1; i++) {
    const [[x0, y0], [x1, y1]] = [profile[i], profile[i + 1]];
    path([[x0, y0, 0], [x1, y1, 0], [x1, y1, -D], [x0, y0, -D]]);
    // Wall colour going up, blending into the ceiling's round the curve
    // (0 on the straight wall, 1 on the ceiling, in between round the curve)
    const ym = (y0 + y1) / 2;
    const f = c ? Math.min(1, Math.max(0, (c - Y - ym) / c)) : Number(ym <= -Y);
    fill(`rgb(${side.map((v, j) => v + (top[j] - v) * f)})`);
  }
  if (scene.floorLines) {
    ctx.strokeStyle = 'rgba(90, 55, 25, 0.22)';
    ctx.lineWidth = 1;
    for (let x = -X; x <= X; x += scene.floorLines * w) {
      ctx.beginPath();
      ctx.moveTo(...P(x, Y, 0));
      ctx.lineTo(...P(x, Y, -D));
      ctx.stroke();
    }
  }
  for (const [x0, x1] of scene.ceilingLights ?? []) {
    path([[x0 * w, -Y, 0], [x1 * w, -Y, 0], [x1 * w, -Y, -D], [x0 * w, -Y, -D]]);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ink(-D / 2);
    ctx.stroke();
  }
  for (const a of scene.art ?? []) wallArt(a);
  // Ink round the back wall and along the room's corners (the curved ones
  // have no corner to ink)
  ink(-D);
  path(profile.map(([x, y]) => [x, y, -D]));
  ctx.stroke();
  for (const [x, y] of c ? [[X, Y], [-X, Y]] : [[-X, -Y], [X, -Y], [X, Y], [-X, Y]]) {
    ctx.beginPath();
    ctx.moveTo(...P(x, y, 0));
    ctx.lineTo(...P(x, y, -D));
    ctx.stroke();
  }

  for (const it of scene.items) {
    const x0 = (it.x - it.w / 2) * w, x1 = (it.x + it.w / 2) * w;
    const ht = it.h === 'ceil' ? (2 * Y) / w - it.up : it.h;
    const y1 = Y - it.up * w, y0 = Y - (it.up + ht) * w;
    const z0 = it.z * w;
    if (it.column || it.extrude || it.tube) {
      (it.column ? column : it.extrude ? extrude : tube)(it);
      continue;
    }
    if (it.panel) {
      panel(x0, y0, z0, x1 - x0, y1 - y0, it.panel, it.outline);
      continue;
    }
    const z1 = (it.z - it.d) * w;
    // Only the faces turned toward the eye, sides darker than the front
    const faces = [];
    if (ex < x0) faces.push([[[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], 0.3]);
    if (ex > x1) faces.push([[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 0.3]);
    if (ey < y0) faces.push([[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.1]);
    if (ey > y1) faces.push([[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], 0.45]);
    faces.push([[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0]);
    for (const [pts, shade] of faces) {
      path(pts);
      ctx.lineWidth = 0.75;
      ctx.fillStyle = ctx.strokeStyle = it.box;
      ctx.fill();
      ctx.stroke();
      if (!shade) continue;
      ctx.globalAlpha = shade;
      ctx.fillStyle = ctx.strokeStyle = '#000';
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (it.front) panel(x0, y0, z0, x1 - x0, y1 - y0, it.front);
    // Ink round every face, which also draws the edges between them
    ink(z0);
    for (const [pts] of faces) {
      path(pts);
      ctx.stroke();
    }
  }

  if (!scene.vignette) return;
  // Evening light: the corners fall off a little
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  v.addColorStop(0, 'rgba(60, 20, 5, 0)');
  v.addColorStop(1, 'rgba(60, 20, 5, 0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
