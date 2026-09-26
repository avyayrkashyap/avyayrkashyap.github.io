// Drives the projects section (src/components/Work.astro). When the section
// scrolls into view the laptop's lid opens, and once it's most of the way up
// the first project is selected.
//
// Changing project spins the laptop a full turn on the spot, and its screen
// swaps to the new project halfway round, while it faces away. The laptop can
// also be handled: its base corners turn it and its lid's top edge opens and
// closes it (see "Handling the laptop" below).
//
// On wide screens the card is pinned inside a tall track and scroll position
// picks the project: the track past the first screen is split into one equal
// step per project. Clicking (or keyboard-focusing) a project scrolls to its
// step, and clicking the selected one follows its link.
//
// Where the layout stacks and nothing pins, hover and keyboard focus select,
// and a tap on an unselected project (no hover on touch) selects it instead
// of following its link.
//
// Re-runs on every ClientRouter navigation, like the other page scripts.
import { DEFAULT_SPRINGS, stepEdge } from './pill-spring.js';

document.addEventListener('astro:page-load', () => {
  const section = document.querySelector('[data-projects]');
  if (!section) return;

  const items = [...section.querySelectorAll('.pj-item')];
  const descs = [...section.querySelectorAll('.pj-desc')];
  const screens = [...section.querySelectorAll('.pj-screen')];
  const sticky = section.querySelector('.pj-sticky');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // How long after the lid starts opening before the first project lights up.
  const INTRO_DELAY = reduceMotion ? 0 : 900;

  let selected = -1;
  let inView = false;
  let introTimer;
  let frame;
  // While a click's smooth scroll is under way, the steps it passes through
  // shouldn't each light up in turn.
  let jumpTarget = null;
  let jumpTimer;

  // The highlight's two edges are separate springs. The edge heading toward
  // the new item is stiff and a touch underdamped, so it races ahead and
  // overshoots slightly; the trailing edge is softer, so it drags behind and
  // then snaps in. The pill stretches in flight, then the tail catches up
  // and it settles onto the item. Retargeting mid-flight (fast scrolling)
  // just keeps the springs going, so motion never jumps. The values live in
  // pill-spring.js; in dev the spring tuner panel edits this copy live.
  //
  // The list runs down the page on desktop and tablet and sideways on
  // phones, so the edges are the pill's start and end along whichever way
  // it runs, read from the list's flex direction.
  const list = section.querySelector('.pj-list');
  const pill = section.querySelector('.pj-pill');
  const SPRINGS = structuredClone(DEFAULT_SPRINGS);
  const edges = {
    start: { x: 0, v: 0, target: 0 },
    end: { x: 0, v: 0, target: 0 },
  };
  let leading = 'end';
  let pillFrame;
  let lastTime;
  let axis;

  const sideways = () => getComputedStyle(list).flexDirection === 'row';

  const renderPill = () => {
    const length = Math.max(8, edges.end.x - edges.start.x);
    if (axis === 'x') {
      pill.style.transform = `translateX(${edges.start.x}px)`;
      pill.style.width = `${length}px`;
      pill.style.height = '';
    } else {
      pill.style.transform = `translateY(${edges.start.x}px)`;
      pill.style.height = `${length}px`;
      pill.style.width = '';
    }
  };

  const stepPill = (time) => {
    // Clamped so a backgrounded tab doesn't come back with one huge step.
    const elapsed = Math.min(0.032, (time - lastTime) / 1000 || 0.016);
    lastTime = time;
    // Small substeps keep very stiff springs stable at any frame rate.
    const substeps = Math.ceil(elapsed * 240);
    let settled = true;
    for (let i = 0; i < substeps; i++) {
      settled = true;
      for (const name of ['start', 'end']) {
        const spring = name === leading ? SPRINGS.lead : SPRINGS.trail;
        if (!stepEdge(edges[name], spring, elapsed / substeps)) settled = false;
      }
    }
    if (settled) {
      edges.start.x = edges.start.target;
      edges.end.x = edges.end.target;
      edges.start.v = edges.end.v = 0;
    }
    renderPill();
    pillFrame = settled ? null : requestAnimationFrame(stepPill);
  };

  const movePill = (index, instant) => {
    const item = items[index];
    const nextAxis = sideways() ? 'x' : 'y';
    // Switching axis (the layout changed under it) can't be animated.
    if (nextAxis !== axis) instant = true;
    axis = nextAxis;
    const offset = axis === 'x' ? item.offsetLeft : item.offsetTop;
    const size = axis === 'x' ? item.offsetWidth : item.offsetHeight;
    edges.start.target = offset;
    edges.end.target = offset + size;
    if (instant || reduceMotion) {
      cancelAnimationFrame(pillFrame);
      pillFrame = null;
      for (const edge of Object.values(edges)) {
        edge.x = edge.target;
        edge.v = 0;
      }
      renderPill();
      return;
    }
    leading = edges.start.target > edges.start.x ? 'end' : 'start';
    if (!pillFrame) {
      lastTime = performance.now();
      pillFrame = requestAnimationFrame(stepPill);
    }
  };

  // Dev only (stripped from builds): a handle for the spring tuner, which
  // edits the springs in place and replays a move without changing the
  // selection.
  if (import.meta.env.DEV) {
    let previewTimer;
    section.pillTuning = {
      springs: SPRINGS,
      preview(rows) {
        if (selected === -1) return;
        clearTimeout(previewTimer);
        const to = Math.max(0, Math.min(items.length - 1, selected + rows));
        movePill(to === selected ? (selected + rows > 0 ? 0 : items.length - 1) : to);
        previewTimer = setTimeout(() => movePill(selected), 900);
      },
    };
  }

  const pinned = () => getComputedStyle(sticky).position === 'sticky';

  // Scroll distance given to each project, and how far into the track we are.
  const track = () => {
    const rect = section.getBoundingClientRect();
    const step = (rect.height - sticky.offsetHeight) / items.length;
    return { step, travelled: -rect.top, top: window.scrollY + rect.top };
  };

  // The screen lags the selection while the laptop spins, so it tracks what's
  // actually showing separately.
  const scene = section.querySelector('.pj-scene');
  const photo = section.querySelector('.pj-photo');
  const SPIN_MS = 1200;
  // How far it eases back from the camera mid-turn, where its corners swing
  // widest. About 6% smaller at the deepest point.
  const SPIN_PULLBACK = 16;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const easeOut = (t) => 1 - (1 - t) ** 3;
  // Settles with a slight overshoot, for letting go of a drag.
  const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
  let shown = -1;
  let spinAngle = 0;
  let tween = null;
  let spinFrame;
  let dragging = null;

  const showScreen = (index) => {
    shown = index;
    screens.forEach((screen, i) => screen.classList.toggle('is-active', i === index));
    syncVideo();
  };

  // Everything that turns the laptop goes through here. The pull-back follows
  // the angle (deepest at 180), and whenever the screen faces away while a
  // different project is waiting, that's the moment to swap it in unseen.
  const setSpin = (angle) => {
    spinAngle = angle;
    const turn = (Math.abs(angle) % 360) / 360;
    scene.style.setProperty('--lp-spin', `${angle}deg`);
    scene.style.setProperty('--lp-z', `${-SPIN_PULLBACK * Math.sin(Math.PI * turn)}cqw`);
    if (shown !== selected && shown !== -1 && Math.cos((angle * Math.PI) / 180) < -0.2) {
      showScreen(selected);
    }
  };

  const stepTween = (time) => {
    const t = Math.min(1, (time - tween.start) / tween.duration);
    setSpin(tween.from + (tween.to - tween.from) * tween.ease(t));
    if (t < 1) {
      spinFrame = requestAnimationFrame(stepTween);
      return;
    }
    // Every tween ends on a whole number of turns, which looks the same as
    // none, so reset to 0 to keep the numbers small.
    setSpin(0);
    const direction = Math.sign(tween.to - tween.from) || 1;
    tween = null;
    // The selection moved on after the swap: go round again for it.
    if (shown !== selected) startSpin(direction);
    else section.classList.remove('is-spinning');
  };

  const turnTo = (to, duration, ease) => {
    cancelAnimationFrame(spinFrame);
    tween = { from: spinAngle, to, duration, ease, start: performance.now() };
    section.classList.add('is-spinning');
    spinFrame = requestAnimationFrame(stepTween);
  };

  // One full turn, eased in and out, swapping the screen on the far side.
  const startSpin = (direction) => turnTo(spinAngle + 360 * direction, SPIN_MS, easeInOut);

  // Later in the list turns one way, earlier the other. Mid-turn or mid-drag
  // the swap happens on its own when the screen next faces away.
  const changeScreen = (index, previous) => {
    if (shown === -1 || reduceMotion) {
      showScreen(index);
      return;
    }
    if (!tween && !dragging) startSpin(index > previous ? 1 : -1);
  };

  // ── Handling the laptop ──
  //
  // Base corners: dragging sideways turns it on the spot, with the front edge
  // following the pointer. Let go past SPIN_THRESHOLD and it carries on
  // round the rest of the turn in that direction; short of that it snaps
  // back to face forward, however fast it was dragged. It's play, not navigation, so the
  // selected project stays put.
  //
  // Lid top edge: dragging down closes the lid and up opens it. Let go and
  // it settles fully shut or back open, whichever it's nearer (or whichever
  // way it was flicked).
  const SPIN_THRESHOLD = 75;
  const LID_OPEN = -72;
  const LID_SHUT = -179.5;
  const LID_WIDEST = -55;
  const FLICK_LID = 0.35;
  let lidAngle = LID_OPEN;
  let lidShut = false;

  const setLid = (angle) => {
    lidAngle = angle;
    scene.style.setProperty('--lp-open', `${angle}deg`);
  };

  const settleLid = (shut) => {
    lidShut = shut;
    section.classList.remove('is-lid-dragging');
    section.classList.add('is-lid-settling');
    section.classList.toggle('is-lid-shut', shut);
    setLid(shut ? LID_SHUT : LID_OPEN);
    syncVideo();
    clearTimeout(settleLid.timer);
    settleLid.timer = setTimeout(() => section.classList.remove('is-lid-settling'), 700);
  };

  const onGripDown = (event) => {
    const grip = event.currentTarget;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    // Keeps the drag coming to this grip even once the pointer leaves it.
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {}
    const box = photo.getBoundingClientRect();
    const kind = grip.dataset.grip;
    if (kind === 'base') {
      cancelAnimationFrame(spinFrame);
      tween = null;
      section.classList.add('is-spinning');
    } else {
      // Grabbed before the intro opened it: it's still shut.
      if (!section.classList.contains('is-open')) {
        lidAngle = LID_SHUT;
        open();
      }
      section.classList.add('is-lid-dragging');
      setLid(lidAngle);
    }
    dragging = {
      kind,
      grip,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: kind === 'base' ? spinAngle : lidAngle,
      // Whole turns it started from, so a snap back lands facing forward.
      base: Math.round(spinAngle / 360) * 360,
      // A full box width of drag is a full turn; three fifths of the box's
      // height takes the lid from open to shut.
      perPx: kind === 'base' ? 360 / box.width : (LID_OPEN - LID_SHUT) / (box.height * 0.6),
      last: { value: kind === 'base' ? spinAngle : lidAngle, time: event.timeStamp },
      velocity: 0,
    };
  };

  const onGripMove = (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const value = dragging.kind === 'base'
      // Front edge follows the pointer: dragging right turns it the negative way.
      ? dragging.from - (event.clientX - dragging.x) * dragging.perPx
      // Down closes (towards LID_SHUT), up opens, within the hinge's range.
      : Math.max(LID_SHUT, Math.min(LID_WIDEST, dragging.from - (event.clientY - dragging.y) * dragging.perPx));
    const dt = event.timeStamp - dragging.last.time;
    if (dt > 0) {
      // Smoothed, so the release reads the flick rather than the last jitter.
      dragging.velocity = dragging.velocity * 0.6 + ((value - dragging.last.value) / dt) * 0.4;
      dragging.last = { value, time: event.timeStamp };
    }
    if (dragging.kind === 'base') setSpin(value);
    else setLid(value);
  };

  const onGripUp = (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    const { kind, base, last } = dragging;
    // Held still before letting go: that's a release, not a flick.
    const velocity = event.timeStamp - last.time > 100 ? 0 : dragging.velocity;
    dragging = null;
    if (kind === 'base') {
      const turned = spinAngle - base;
      if (Math.abs(turned) >= SPIN_THRESHOLD) {
        // On to the next forward-facing point in the drag's direction, which
        // after a long drag may be several turns from where it started.
        const to = (turned > 0 ? Math.ceil : Math.floor)(spinAngle / 360) * 360;
        turnTo(to, Math.max(350, Math.abs(to - spinAngle) * 2.6), easeOut);
      } else {
        turnTo(base, 520, easeOutBack);
      }
    } else {
      const flicked = Math.abs(velocity) > FLICK_LID;
      const shut = flicked ? velocity < 0 : lidAngle < (LID_OPEN + LID_SHUT) / 2;
      settleLid(shut);
    }
  };

  // Moves and the release are heard on the window, not the grip, so a drag
  // always ends on mouse up wherever the pointer is, even if the grip lost
  // its capture. Leaving the window mid-drag counts as letting go too.
  const onBlur = (event) => {
    if (dragging) onGripUp({ pointerId: dragging.pointerId, timeStamp: event.timeStamp });
  };
  section.querySelectorAll('[data-grip]').forEach((grip) => grip.addEventListener('pointerdown', onGripDown));
  window.addEventListener('pointermove', onGripMove);
  window.addEventListener('pointerup', onGripUp);
  window.addEventListener('pointercancel', onGripUp);
  window.addEventListener('blur', onBlur);

  const syncVideo = () => {
    screens.forEach((screen, i) => {
      const video = screen.querySelector('video');
      if (!video) return;
      if (i === shown && inView && !lidShut) video.play().catch(() => {});
      else video.pause();
    });
  };

  const open = () => section.classList.add('is-open');

  // In the sideways list on phones, keep the selected item centred in view.
  // Scrolls the list only, never the page.
  const revealItem = (index) => {
    if (axis !== 'x') return;
    const item = items[index];
    list.scrollTo({
      left: item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  const select = (index) => {
    clearTimeout(introTimer);
    open();
    if (index === selected) return;
    // The first pick fades the pill in where it lands; after that it travels.
    movePill(index, selected === -1);
    const previous = selected;
    selected = index;

    section.classList.add('has-selection');
    items.forEach((item, i) => {
      item.classList.toggle('is-active', i === index);
      if (item.tagName === 'A') {
        if (i === index) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      } else {
        item.setAttribute('aria-pressed', String(i === index));
      }
    });
    descs.forEach((desc, i) => desc.classList.toggle('is-active', i === index));
    changeScreen(index, previous);
    revealItem(index);
  };

  // Pinned: scroll to the middle of a project's step and let the scroll
  // handler take it from there. Selecting right away keeps the click snappy.
  const jumpTo = (index) => {
    const { step, top } = track();
    select(index);
    jumpTarget = Math.round(top + step * (index + 0.5));
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => { jumpTarget = null; }, 1500);
    window.scrollTo({ top: jumpTarget, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const onScroll = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!pinned()) return;
      if (jumpTarget !== null) {
        if (Math.abs(window.scrollY - jumpTarget) > 2) return;
        jumpTarget = null;
      }
      const { step, travelled } = track();
      // Before the card pins, leave the intro to pick the first project.
      if (travelled <= 0) return;
      select(Math.min(items.length - 1, Math.floor(travelled / step)));
    });
  };

  items.forEach((item, i) => {
    item.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse' && !pinned()) select(i);
    });
    // Keyboard focus only: a tap also focuses, and letting that select would
    // make the same tap's click follow the link straight away.
    item.addEventListener('focus', () => {
      if (!item.matches(':focus-visible') || i === selected) return;
      if (pinned()) jumpTo(i);
      else select(i);
    });
    item.addEventListener('click', (event) => {
      if (i === selected) return;
      event.preventDefault();
      if (pinned()) jumpTo(i);
      else select(i);
    });
  });

  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView && selected === -1 && !section.classList.contains('is-open')) {
      open();
      introTimer = setTimeout(() => select(0), INTRO_DELAY);
    }
    syncVideo();
  }, { threshold: 0.45 });
  observer.observe(section.querySelector('.pj-photo'));

  // Crossing a breakpoint moves the items (and may turn the list sideways),
  // so put the pill straight back on the selected one.
  const resizer = new ResizeObserver(() => {
    if (selected === -1) return;
    movePill(selected, true);
    revealItem(selected);
  });
  resizer.observe(list);

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.addEventListener('astro:before-swap', () => {
    observer.disconnect();
    resizer.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pointermove', onGripMove);
    window.removeEventListener('pointerup', onGripUp);
    window.removeEventListener('pointercancel', onGripUp);
    window.removeEventListener('blur', onBlur);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(pillFrame);
    cancelAnimationFrame(spinFrame);
    clearTimeout(introTimer);
    clearTimeout(jumpTimer);
  }, { once: true });
});
