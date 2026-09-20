// Dev-only paragraph editor. Loaded by TextEditor.astro, which Layout only
// renders under import.meta.env.DEV, so none of this reaches a build.
//
// Turn it on, click a paragraph, type. Committing posts the old and new text
// to the dev server, which finds the copy in src/ and rewrites it — so the
// edit lands in the file (and in git), not just in the page. Vite's HMR then
// reloads the page from the patched source.

const ENDPOINT = '/__edit-text';
// A save rewrites a source file, which makes Vite reload the page, which
// re-runs this module. Anything that has to outlive a save — the toggle, the
// undo history, the line confirming what was just written — has to live
// somewhere the reload can't clear.
const STORE = 'tx-editing';
const UNDO_STORE = 'tx-undo';
const STATUS_STORE = 'tx-status';
// Deep enough for a copy pass, shallow enough to stay out of a storage quota
const UNDO_LIMIT = 25;
// Only plain paragraphs: one with inline markup (a <wbr>, an inline logo)
// would lose those children the moment we read it back as text.
const TARGET = 'p';

// The primitives the panel can apply, mirroring the two blocks in global.css.
// Adding one there means adding it here; nothing else reads these lists.
const STYLES = [
  ['type-title', 'Title'],
  ['type-h1', 'H1'],
  ['type-h2', 'H2'],
  ['type-h3', 'H3'],
  ['type-h4', 'H4'],
  ['type-body-md', 'Body M'],
  ['type-body-sm', 'Body S'],
  ['type-body-xs', 'Body XS'],
];

// null is "Auto": no colour class, so the type primitive's own colour stands
const COLORS = [
  [null, 'Auto', null],
  ['text-strong', 'Strong', 'var(--color-text-strong)'],
  ['text-secondary', 'Secondary', 'var(--color-text-secondary)'],
  ['text-disabled', 'Disabled', 'var(--color-text-disabled)'],
  ['text-accent', 'Accent', 'var(--color-text-accent)'],
];

const GROUPS = {
  style: { test: /^type-[a-z0-9-]+$/, items: STYLES },
  color: { test: /^text-(strong|secondary|disabled|accent)$/, items: COLORS },
};

let editing = false;
let active = null;
let original = '';
// What the source said when the paragraph was picked up. Everything after
// that is a trial living in the DOM until a commit writes it, or Esc throws
// it away — so switching between primitives costs nothing and reloads nothing.
let baseline = { style: null, color: null };
// A page teardown blurs whatever is focused, and that focusout would commit
// the paragraph as it stands — so leaving mid-edit, or closing the tab, would
// write a half-finished sentence to the source file. Leaving is never a save.
let unloading = false;

const els = () => ({
  panel: document.getElementById('txPanel'),
  toggle: document.getElementById('txToggle'),
  status: document.getElementById('txStatus'),
  controls: document.getElementById('txControls'),
  styles: document.getElementById('txStyles'),
  colors: document.getElementById('txColors'),
});

// The panel says nothing while things are going well: the chips show which
// primitives the paragraph is wearing, which is the state worth knowing. This
// line is kept for refusals, so anything it does show is worth reading.
function setNote(message, tone = 'error') {
  try {
    sessionStorage.setItem(STATUS_STORE, message ? JSON.stringify({ message, tone }) : '');
  } catch {
    /* the note just won't survive a reload */
  }
  const { status } = els();
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
  status.hidden = !message;
}

const clearNote = () => setNote('');

// A refusal can be followed by the reload an earlier write in the same commit
// triggered, so the note has to be able to outlive it.
function restoreNote() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATUS_STORE) || 'null');
    if (saved?.message) {
      setNote(saved.message, saved.tone);
      return;
    }
  } catch {
    /* nothing worth showing */
  }
  clearNote();
}

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

// ── Undo ──
// Each committed edit is kept as the pair of strings that turns it around
// again, so undoing is just the same patch run backwards through the same
// endpoint. Normalized on the way in: that's the shape the server matched.

function readStack() {
  try {
    const stack = JSON.parse(sessionStorage.getItem(UNDO_STORE) || '[]');
    return Array.isArray(stack) ? stack : [];
  } catch {
    return [];
  }
}

function writeStack(stack) {
  try {
    sessionStorage.setItem(UNDO_STORE, JSON.stringify(stack.slice(-UNDO_LIMIT)));
  } catch {
    /* undo is a convenience, not something to fail an edit over */
  }
}

async function post(payload) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

// A commit can write the wording, the style and the colour, so a step holds
// every operation it took and reverses them together. Otherwise one Enter
// would cost three presses of the shortcut to walk back.
async function undo() {
  const stack = readStack();
  const entry = stack.pop();

  if (!entry) {
    setNote('Nothing to undo.', 'note');
    return;
  }

  // Dropped whether or not it lands: if the file moved on underneath us,
  // replaying this step would fail the same way every time.
  writeStack(stack);
  clearNote();

  // Steps recorded before commits could batch hold a single operation
  const ops = entry.ops ?? [entry];

  try {
    // Last applied, first undone. A class operation carries the wording that
    // was in the file when it ran, which is what finds its element again.
    for (const op of [...ops].reverse()) {
      const result =
        op.kind === 'class'
          ? await post({ action: 'class', original: op.locator, group: op.group, value: op.before })
          : await post({ original: op.after, updated: op.before });

      if (!result.ok) {
        setNote(`${result.error} Dropped that undo step.`);
        return;
      }
    }
  } catch (error) {
    setNote(`Couldn't reach the dev server: ${error.message}`);
  }
}

// Typing somewhere else on the page (the password gate, say) keeps its own
// native undo — this only claims the shortcut when nothing else wants it.
function isTypingTarget(el) {
  return Boolean(
    el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')
  );
}

function isEditable(el) {
  return (
    el &&
    el.matches(TARGET) &&
    !el.closest('[data-tx-ui]') &&
    el.children.length === 0 &&
    el.textContent.trim().length > 0
  );
}

function setMode(on) {
  editing = on;
  try {
    sessionStorage.setItem(STORE, String(on));
  } catch {
    /* private mode: the toggle just won't survive a reload */
  }
  if (!on) cancel();
  document.documentElement.classList.toggle('tx-on', on);
  const { toggle } = els();
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? 'Editing' : 'Off';
  }
  clearNote();
}

// Puts the caret where the click landed. We swallow the click to keep links
// (the homepage cards wrap their copy in an <a>) from navigating, which also
// costs us the browser's own caret placement.
function placeCaret(x, y) {
  try {
    const selection = window.getSelection();
    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
      }
    }
    if (range) {
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch {
    /* caret placement is a nicety; focus alone is enough */
  }
}

function begin(el, x, y) {
  if (active === el) return;
  if (active) commit();

  active = el;
  original = el.textContent;
  el.classList.add('tx-active');
  // plaintext-only keeps pasted rich text from turning into markup we'd then
  // have to strip; Firefox doesn't support it and falls back to true.
  try {
    el.contentEditable = 'plaintext-only';
  } catch {
    el.contentEditable = 'true';
  }
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.focus({ preventScroll: true });
  if (typeof x === 'number') placeCaret(x, y);
  baseline = { style: currentOf(el, 'style'), color: currentOf(el, 'color') };
  reflectControls();
  clearNote();
}

function end() {
  if (!active) return null;
  const el = active;
  // Cleared before the DOM changes: dropping contentEditable blurs the
  // element, and that focusout would otherwise re-enter commit() and post
  // the same edit twice.
  active = null;
  el.contentEditable = 'false';
  el.classList.remove('tx-active');
  reflectControls();
  return el;
}

function cancel() {
  if (!active) return;
  const el = active;
  el.textContent = original;
  setClass(el, 'style', baseline.style);
  setClass(el, 'color', baseline.color);
  end();
  // A teardown cancel must not wipe a refusal that has just been raised
  if (!unloading) clearNote();
}

async function commit() {
  if (!active || unloading) return;

  // Read before end(), and hold our own references: a successful write
  // triggers HMR, which can replace the node while a request is still open.
  const el = active;
  const wasText = normalize(original);
  const nowText = normalize(el.textContent);
  const trial = { style: currentOf(el, 'style'), color: currentOf(el, 'color') };
  const was = baseline;

  end();

  // An empty paragraph is refused server-side, so put it back rather than
  // sending a write that can only fail
  if (!nowText) {
    el.textContent = original;
    return;
  }

  const ops = [];
  if (nowText !== wasText) ops.push({ kind: 'text', before: wasText, after: nowText });
  if (trial.style !== was.style) ops.push({ kind: 'class', group: 'style', before: was.style, after: trial.style });
  if (trial.color !== was.color) ops.push({ kind: 'class', group: 'color', before: was.color, after: trial.color });
  if (!ops.length) return;

  // A class patch finds its element by the copy inside it, so a wording change
  // has to land first and hand the rest its new wording to search for.
  let locator = wasText;
  const done = [];

  try {
    for (const op of ops) {
      const result =
        op.kind === 'text'
          ? await post({ original: locator, updated: op.after })
          : await post({ action: 'class', original: locator, group: op.group, value: op.after });

      if (!result.ok) {
        // Only this operation is put back; anything already written stands
        if (op.kind === 'text') el.textContent = original;
        else setClass(el, op.group, op.before);
        setNote(result.error ?? 'That edit was refused.');
        break;
      }

      if (op.kind === 'text') {
        locator = op.after;
        done.push(op);
      } else {
        done.push({ ...op, locator });
      }
    }
  } catch (error) {
    setNote(`Couldn't reach the dev server: ${error.message}`);
  }

  // However many writes it took, it walks back as one step
  if (done.length) writeStack([...readStack(), { ops: done }]);
}

// ── Style and colour ──

const currentOf = (el, group) => [...el.classList].find((name) => GROUPS[group].test.test(name)) ?? null;

// One primitive per group at a time; null clears the group entirely
function setClass(el, group, value) {
  const current = currentOf(el, group);
  if (current === value) return;
  if (current) el.classList.remove(current);
  if (value) el.classList.add(value);
}

function buildControls() {
  const { styles, colors } = els();
  if (!styles || !colors || styles.childElementCount) return;

  STYLES.forEach(([value, label]) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tx-chip';
    chip.textContent = label;
    chip.dataset.group = 'style';
    chip.dataset.value = value;
    styles.appendChild(chip);
  });

  COLORS.forEach(([value, label, swatch]) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = value ? 'tx-swatch' : 'tx-swatch tx-swatch--auto';
    dot.title = label;
    dot.setAttribute('aria-label', label);
    dot.dataset.group = 'color';
    if (value) dot.dataset.value = value;
    if (swatch) dot.style.setProperty('--color-swatch', swatch);
    colors.appendChild(dot);
  });
}

// Marks whichever primitive the paragraph is already wearing
function reflectControls() {
  const { controls, styles, colors } = els();
  if (!controls) return;

  if (!active) {
    controls.hidden = true;
    return;
  }

  controls.hidden = false;
  [styles, colors].forEach((container) => {
    container?.querySelectorAll('button').forEach((button) => {
      const value = button.dataset.value ?? null;
      button.setAttribute('aria-pressed', String(currentOf(active, button.dataset.group) === value));
    });
  });
}

// Switching a primitive is a trial: it changes the paragraph on screen and
// nothing else, so you can put H2, H3 and Body M side by side without a write
// or a reload between them. Enter writes whatever you settled on.
function trialClass(group, value) {
  if (!active) return;
  setClass(active, group, value);
  reflectControls();
}

document.addEventListener('astro:page-load', () => {
  const { panel, toggle } = els();
  if (!panel) return;

  window.__txAbort?.abort();
  const controller = new AbortController();
  window.__txAbort = controller;
  const { signal } = controller;

  // Mode survives both a route change and the reload a save triggers
  try {
    editing = sessionStorage.getItem(STORE) === 'true';
  } catch {
    /* falls back to whatever the module already had */
  }
  document.documentElement.classList.toggle('tx-on', editing);
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(editing));
    toggle.textContent = editing ? 'Editing' : 'Off';
  }
  restoreNote();

  toggle?.addEventListener('click', () => setMode(!editing), { signal });

  buildControls();
  reflectControls();

  // mousedown is where focus moves, so swallowing it there keeps the caret in
  // the paragraph — otherwise every chip click would blur it and commit.
  const { controls } = els();
  controls?.addEventListener('mousedown', (event) => event.preventDefault(), { signal });
  controls?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-group]');
    if (!button) return;
    trialClass(button.dataset.group, button.dataset.value ?? null);
  }, { signal });

  // Capture phase, so we win the click before a wrapping <a> acts on it
  document.addEventListener(
    'click',
    (event) => {
      if (!editing) return;
      if (event.target.closest('[data-tx-ui]')) return;

      const paragraph = event.target.closest(TARGET);
      if (!paragraph) return;

      event.preventDefault();
      event.stopPropagation();

      if (!isEditable(paragraph)) {
        setNote('That paragraph has inline markup in it, so it has to be edited in the source.');
        return;
      }

      begin(paragraph, event.clientX, event.clientY);
    },
    { capture: true, signal }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      const shortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'e';
      if (shortcut) {
        event.preventDefault();
        setMode(!editing);
        return;
      }

      // Only while the tool is on, and never over a live edit — mid-edit,
      // ⌘Z belongs to the browser's own text undo.
      const undoCombo = (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
      if (undoCombo && editing && !active && !isTypingTarget(event.target)) {
        event.preventDefault();
        undo();
        return;
      }

      if (!active) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commit();
      }
    },
    { signal }
  );

  document.addEventListener('focusout', (event) => {
    if (active && event.target === active) commit();
  }, { signal });

  // Don't carry a half-finished edit across a route change, and don't let the
  // blur that comes with a page teardown write one either. ClientRouter swaps
  // never unload the document, so they only need the cancel.
  document.addEventListener('astro:before-swap', cancel, { signal });
  window.addEventListener('beforeunload', () => { unloading = true; }, { signal });
  window.addEventListener('pagehide', () => { unloading = true; cancel(); }, { signal });
});
