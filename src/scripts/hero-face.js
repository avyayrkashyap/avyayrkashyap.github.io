// Immerse mode for the hero photo band: a room seen through the band as if it
// were a window (hero-room.js), redrawn from wherever your head is
// (head-coupled perspective), with the camera and its ml5 FaceMesh outlines small in the
// corner (https://docs.ml5js.org/#/reference/facemesh). ml5 and the camera
// load only when "Immerse." is picked, and stop when it's left. The room
// starts flat; "3D." eases its depth in. Swiping across the band, or the
// dots in the strip, change the room.
import { drawRoom, SCENES } from './hero-room.js';

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

// ── Head tracking ── Calibration knobs; tune by feel on your setup.
const VIEW = 1.2; // resting eye distance from the band, in band widths
const GAIN = 0.9; // head travel across the camera frame → eye travel, in band sizes
const REF_EYES = 0.17; // eye-corner gap, as a fraction of the frame width, at the resting distance
const DEPTH = 0.3; // how much leaning in or out counts: 1 is true-to-life (the back wall races away), 0 ignores it
const FLIP = 1; // -1 makes leaning left reveal the left (a camera pan, not a window)
const EASE = 0.2; // how fast the eye follows the head, per frame
const SWIPE = 40; // px of horizontal drag, or of trackpad scroll, that changes the room
const DEPTH_EASE = 0.06; // how fast "3D." brings the depth in or out, per frame

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
  const toggle = card.querySelector('.hero-3d');
  const roomDots = [...card.querySelectorAll('.hero-room-dot')];
  const rtx = roomCanvas.getContext('2d');
  const ptx = preview.getContext('2d');
  let stream, faces = [], frame, on = false, eye = null;
  let depth = 0; // 0 is flat, 1 is the full room; eases toward the toggle
  let room = 0; // index into SCENES

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
    set3d(false);
    depth = 0;
    ptx.clearRect(0, 0, preview.width, preview.height);
  }

  function draw() {
    const [w, h] = fit(roomCanvas, rtx);
    follow(w, h);
    const want = toggle.getAttribute('aria-pressed') === 'true' ? 1 : 0;
    depth = Math.abs(want - depth) < 0.001 ? want : depth + (want - depth) * DEPTH_EASE;
    drawRoom(rtx, w, h, eye, depth, performance.now() / 1000, SCENES[room]);
    drawPreview(getComputedStyle(card).getPropertyValue('--color-text-accent'));
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

  const set3d = (v) => toggle.setAttribute('aria-pressed', String(v));
  toggle.addEventListener('click', () => set3d(toggle.getAttribute('aria-pressed') !== 'true'));

  // Changing room presses the old one flat and grows the new one back out,
  // when 3D is on
  function goTo(n) {
    room = (n + SCENES.length) % SCENES.length;
    roomDots.forEach((d, i) => d.setAttribute('aria-pressed', String(i === room)));
    depth = 0;
  }
  roomDots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

  // A swipe left goes to the next room, right to the one before; a trackpad
  // swipe the same, once per gesture
  let downX = null, wheel = 0, wheelQuiet;
  layer.addEventListener('pointerdown', (e) => (downX = e.clientX));
  layer.addEventListener('pointerup', (e) => {
    const dx = e.clientX - (downX ?? e.clientX);
    downX = null;
    if (Math.abs(dx) > SWIPE) goTo(room + (dx < 0 ? 1 : -1));
  });
  layer.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical: let the page scroll
    e.preventDefault();
    clearTimeout(wheelQuiet);
    wheelQuiet = setTimeout(() => (wheel = 0), 200);
    if (wheel === null) return; // already moved for this gesture
    wheel += e.deltaX;
    if (Math.abs(wheel) > SWIPE) {
      goTo(room + (wheel > 0 ? 1 : -1));
      wheel = null;
    }
  }, { passive: false });

  card.addEventListener('hero-mode', (e) => (e.detail === 'face' ? start() : on && stop()));
});
