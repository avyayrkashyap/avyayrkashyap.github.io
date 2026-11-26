// Face mode for the hero photo band: a room seen through the band as if it
// were a window, redrawn from wherever your head is (head-coupled
// perspective), with the camera and its ml5 FaceMesh outlines small in the
// corner (https://docs.ml5js.org/#/reference/facemesh). ml5 and the camera
// load only when "Face." is picked, and stop when it's left.
const ML5 = 'https://unpkg.com/ml5@1/dist/ml5.min.js';
const LINE = 1; // preview outline width, CSS px

// Feature outlines as MediaPipe mesh indices, in order around each shape.
// ml5's own face.lips / face.leftEye etc. mix several segments into one
// list, so they zigzag when joined up; these trace cleanly.
const LOOPS = [
  [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109], // face
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], // right eye
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466], // left eye
  [98, 97, 2, 326, 327, 294, 278, 344, 440, 275, 4, 45, 220, 115, 48, 64], // nose base
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185], // outer lips
  [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191], // inner lips
];
const LINES = [[168, 6, 197, 195, 5, 4]]; // nose bridge, left open

// ── The room ── The band is the room's front face. Sizes are in band
// widths (heights for ROOM.h). Wider and taller than the band, so moving
// your head brings what's past its edges into view.
const ROOM = { w: 1.8, h: 1.5, d: 1.4 };
const GRID = 0.1; // grid spacing on the walls
// Boxes on the floor: x = centre (0 is the middle of the band), z = depth of
// the front face, then size; c picks a colour from COLORS
const ITEMS = [
  { x: -0.72, z: -0.2, w: 0.14, h: 0.5, d: 0.14, c: 0 },
  { x: -0.38, z: -0.85, w: 0.2, h: 0.24, d: 0.2, c: 1 },
  { x: -0.12, z: -0.4, w: 0.1, h: 0.1, d: 0.1, c: 2 },
  { x: 0.08, z: -1.05, w: 0.26, h: 0.12, d: 0.24, c: 0 },
  { x: 0.4, z: -0.6, w: 0.12, h: 0.36, d: 0.12, c: 2 },
  { x: 0.74, z: -0.22, w: 0.18, h: 0.18, d: 0.18, c: 1 },
];
const COLORS = ['--color-text-accent', '#8B5CF6', '--color-error']; // the draw-mode pens

// ── Head tracking ── Calibration knobs; tune by feel on your setup.
const VIEW = 1.2; // resting eye distance from the band, in band widths
const GAIN = 0.9; // head travel across the camera frame → eye travel, in band sizes
const REF_EYES = 0.17; // eye-corner gap, as a fraction of the frame width, at the resting distance
const DEPTH = 0.3; // how much leaning in or out counts: 1 is true-to-life (the back wall races away), 0 ignores it
const FLIP = 1; // -1 makes leaning left reveal the left (a camera pan, not a window)
const EASE = 0.2; // how fast the eye follows the head, per frame

let ml5Loading;
const loadMl5 = () => ml5Loading ??= new Promise((ok, fail) => {
  const s = Object.assign(document.createElement('script'), { src: ML5, onload: ok, onerror: fail });
  document.head.append(s);
});

let model; // one FaceMesh for the whole visit; loading it twice is slow

// Size a canvas's backing store to its box at device resolution; returns its
// CSS size with the context scaled to match
function fit(canvas, ctx) {
  const d = devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) {
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
  }
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return [w, h];
}

document.addEventListener('astro:page-load', () => {
  const card = document.querySelector('.hero-card');
  const layer = card?.querySelector('.hero-face');
  if (!layer) return;
  const video = layer.querySelector('video');
  const roomCanvas = layer.querySelector('.hero-face-room');
  const preview = layer.querySelector('.hero-face-preview');
  const status = layer.querySelector('.hero-face-status');
  const rtx = roomCanvas.getContext('2d');
  const ptx = preview.getContext('2d');
  let stream, faces = [], frame, on = false, eye = null;

  async function start() {
    on = true;
    eye = null;
    draw(); // the room shows straight away, from the middle, while ml5 loads
    status.textContent = 'Loading FaceMesh…';
    try {
      await loadMl5();
      model ??= await ml5.faceMesh({ maxFaces: 1, flipped: false });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (!on) return stop(); // left face mode while we were waiting
      video.srcObject = stream;
      await video.play();
      // FaceMesh sizes its input from these attributes, not the stream; left
      // at 0 it silently finds no faces
      video.width = video.videoWidth;
      video.height = video.videoHeight;
    } catch (err) {
      status.textContent = err?.name === 'NotAllowedError' ? 'Camera blocked.' : 'Could not start the camera.';
      return;
    }
    status.textContent = '';
    model.detectStart(video, (r) => (faces = r));
  }

  function stop() {
    on = false;
    cancelAnimationFrame(frame);
    model?.detectStop();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    faces = [];
    ptx.clearRect(0, 0, preview.width, preview.height);
  }

  function draw() {
    const css = getComputedStyle(card);
    const colors = COLORS.map((v) => (v.startsWith('--') ? css.getPropertyValue(v).trim() : v));
    const [w, h] = fit(roomCanvas, rtx);
    follow(w, h);
    drawRoom(rtx, w, h, eye, colors, css.getPropertyValue('--color-text-strong').trim(), getComputedStyle(layer).backgroundColor);
    drawPreview(colors[0]);
    frame = requestAnimationFrame(draw);
  }

  // Ease the eye toward where the head is: the midpoint between the outer
  // eye corners gives left/right/up/down, their gap gives distance
  function follow(w, h) {
    const rest = { x: 0, y: 0, z: VIEW * w };
    let to = rest;
    const k = faces[0]?.keypoints;
    if (k && video.videoWidth) {
      const a = k[33], b = k[263];
      const nx = (a.x + b.x) / video.videoWidth - 1; // -1..1, in the unmirrored frame
      const ny = (a.y + b.y) / video.videoHeight - 1;
      const gap = Math.hypot(a.x - b.x, a.y - b.y) / video.videoWidth;
      to = {
        // Your right is the frame's left, so x flips to put the eye where you are
        x: -nx * GAIN * w * FLIP,
        y: ny * GAIN * h,
        z: rest.z * Math.min(3, Math.max(0.4, REF_EYES / gap)) ** DEPTH,
      };
    }
    eye ??= to;
    for (const c of 'xyz') eye[c] += (to[c] - eye[c]) * EASE;
  }

  // Camera, cover-fitted, with the face outlines on top
  function drawPreview(accent) {
    const [w, h] = fit(preview, ptx);
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    const s = Math.max(w / vw, h / vh);
    ptx.transform(s, 0, 0, s, (w - vw * s) / 2, (h - vh * s) / 2);
    ptx.drawImage(video, 0, 0);
    ptx.strokeStyle = accent;
    ptx.lineWidth = LINE / s;
    ptx.lineJoin = 'round';
    for (const { keypoints: k } of faces) {
      for (const [ids, close] of [...LOOPS.map((l) => [l, true]), ...LINES.map((l) => [l, false])]) {
        ptx.beginPath();
        ids.forEach((i, n) => ptx[n ? 'lineTo' : 'moveTo'](k[i].x, k[i].y));
        if (close) ptx.closePath();
        ptx.stroke();
      }
    }
  }

  card.addEventListener('hero-mode', (e) => (e.detail === 'face' ? start() : on && stop()));
});

// Every point is projected from the eye onto the band (z = 0), so the room
// shifts the way a real one would behind a window. Coordinates: x right, y
// down, z out of the screen toward you (the room is at z < 0); origin at the
// band's centre, in CSS px.
function drawRoom(ctx, w, h, eye, colors, ink, bg) {
  const { x: ex, y: ey, z: ez } = eye;
  const P = (x, y, z) => {
    const s = ez / (ez - z);
    return [w / 2 + ex + (x - ex) * s, h / 2 + ey + (y - ey) * s];
  };
  const path = (pts, close = true) => {
    ctx.beginPath();
    pts.forEach((p, n) => ctx[n ? 'lineTo' : 'moveTo'](...P(...p)));
    if (close) ctx.closePath();
  };
  const X = (ROOM.w * w) / 2, Y = (ROOM.h * h) / 2, D = ROOM.d * w, step = GRID * w;

  // Walls, each shaded a touch differently so the corners read
  ctx.fillStyle = ink;
  for (const [pts, a] of [
    [[[-X, Y, 0], [X, Y, 0], [X, Y, -D], [-X, Y, -D]], 0.07], // floor
    [[[-X, -Y, 0], [X, -Y, 0], [X, -Y, -D], [-X, -Y, -D]], 0.02], // ceiling
    [[[-X, -Y, 0], [-X, Y, 0], [-X, Y, -D], [-X, -Y, -D]], 0.04], // left
    [[[X, -Y, 0], [X, Y, 0], [X, Y, -D], [X, -Y, -D]], 0.04], // right
  ]) {
    path(pts);
    ctx.globalAlpha = a;
    ctx.fill();
  }

  // Grid: rings around the walls at each depth, then lines running back
  // along the floor, up the back wall and forward along the ceiling (and the
  // same across the side walls)
  ctx.strokeStyle = colors[0];
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.22;
  for (let z = 0; z >= -D - 1; z -= step) {
    path([[-X, -Y, z], [X, -Y, z], [X, Y, z], [-X, Y, z]]);
    ctx.stroke();
  }
  for (let x = -X; x <= X + 1; x += step) {
    path([[x, Y, 0], [x, Y, -D], [x, -Y, -D], [x, -Y, 0]], false);
    ctx.stroke();
  }
  for (let y = -Y; y <= Y + 1; y += step) {
    path([[-X, y, 0], [-X, y, -D], [X, y, -D], [X, y, 0]], false);
    ctx.stroke();
  }

  // Boxes, far to near. ponytail: sorting by front face is enough for boxes
  // that don't overlap in depth; a z-buffer if they ever crowd together.
  ctx.lineWidth = 1;
  ctx.strokeStyle = bg;
  for (const b of [...ITEMS].sort((p, q) => p.z - q.z)) {
    const x0 = (b.x - b.w / 2) * w, x1 = (b.x + b.w / 2) * w;
    const y1 = Y, y0 = Y - b.h * w;
    const z0 = b.z * w, z1 = (b.z - b.d) * w;
    // Only the faces turned toward the eye, darker for the sides
    const faces = [];
    if (ex < x0) faces.push([[[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], 0.35]);
    if (ex > x1) faces.push([[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 0.35]);
    if (ey < y0) faces.push([[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.15]);
    faces.push([[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0]);
    for (const [pts, shade] of faces) {
      path(pts);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors[b.c];
      ctx.fill();
      ctx.globalAlpha = shade;
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
