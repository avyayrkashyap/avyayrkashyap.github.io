// Live visuals for the Augment case study (src/pages/augment.astro). Re-runs on every ClientRouter navigation
// (astro:page-load fires on the first load too); anything still looping from a previous visit sees its generation
// go stale and stops. Loops only advance while their element is on screen, and reduced motion gets the end states.

// ── Augie: the app's own mascot (voice-app/mascot.js), trimmed to the states shown here ──

const SVG = `<svg class="mascot" viewBox="16 32 96 64" aria-hidden="true">
  <g class="m-all">
    <g class="m-brackets" fill="#fff">
      <g class="m-vl"><g class="m-left"><rect x="16" y="32" width="8" height="64" rx="1"/><rect x="16" y="32" width="24" height="8" rx="1"/><rect x="16" y="88" width="24" height="8" rx="1"/></g></g>
      <g class="m-vr"><g class="m-right"><rect x="104" y="32" width="8" height="64" rx="1"/><rect x="88" y="32" width="24" height="8" rx="1"/><rect x="88" y="88" width="24" height="8" rx="1"/></g></g>
    </g>
    <g class="m-look"><g class="m-eyes"><g class="m-blink" fill="#fff">
      <g class="m-eye-l"><rect x="40.5" y="56.5" width="15" height="15" rx="2.5"/></g>
      <g class="m-eye-r"><rect x="72.5" y="56.5" width="15" height="15" rx="2.5"/></g>
    </g></g></g>
  </g>
</svg>`
const PARTS = { all: '.m-all', brackets: '.m-brackets', left: '.m-left', right: '.m-right', eyes: '.m-eyes', eyeL: '.m-eye-l', eyeR: '.m-eye-r' }
const k = (at, values = {}) => ({ at, ...values })
const SQUASH = { sx: 0.97, sy: 1.03 }, STRETCH = { y: -12, sx: 1.04, sy: 0.97 }
const ANIMS = {
  breathe: { duration: 3800, easing: 'ease-in-out', tracks: { brackets: [k(0), k(0.5, { sx: 1.035, sy: 1.035 }), k(1)] } },
  attentive: { duration: 1000, easing: 'linear', voice: true, tracks: { eyes: [k(0, { sx: 1.15, sy: 1.15 }), k(1, { sx: 1.15, sy: 1.15 })] } },
  typing: { duration: 700, easing: 'ease-in-out', tracks: {
    left: [k(0, { x: 4 }), k(1, { x: 4 })], right: [k(0, { x: -4 }), k(1, { x: -4 })],
    eyes: [k(0, { x: 5, y: -4 }), k(1, { x: 5, y: -4 })],
    eyeL: [k(0), k(0.5, { y: -5 }), k(1)], eyeR: [k(0, { y: -5 }), k(0.5), k(1, { y: -5 })] } },
  hop: { duration: 1500, easing: 'cubic-bezier(.3,.7,.4,1.5)', tracks: {
    all: [k(0), k(0.13, STRETCH), k(0.23, SQUASH), k(0.33), k(0.46, STRETCH), k(0.56, SQUASH), k(0.66), k(1)],
    eyes: [k(0), k(0.1, { y: 3, sy: 0.3 }), k(0.8, { y: 3, sy: 0.3 }), k(1)] } },
  tilt: { duration: 1000, easing: 'ease-in-out', tracks: {
    all: [k(0), k(0.25, { r: -10 }), k(0.7, { r: -10 }), k(1)], eyes: [k(0), k(0.25, { y: 4 }), k(0.7, { y: 4 }), k(1)] } },
  shake: { duration: 600, easing: 'ease-in-out', tracks: {
    all: [k(0), k(0.15, { x: -6, r: -4 }), k(0.35, { x: 6, r: 4 }), k(0.55, { x: -6, r: -4 }), k(0.75, { x: 6, r: 4 }), k(1)] } },
}
// ongoing states repeat their animation; one-off moments (done, quiet, error) play once, then idle between plays
const STATES = { idle: 'breathe', listening: 'attentive', thinking: 'typing', done: 'hop', quiet: 'tilt', error: 'shake' }
const ONE_OFF = { done: true, quiet: true, error: true }

const transform = v => `translate(${v.x ?? 0}px, ${v.y ?? 0}px) rotate(${v.r ?? 0}deg) scale(${v.sx ?? 1}, ${v.sy ?? 1})`
function frames(keys, easing) {
  const sorted = [...keys].sort((a, b) => a.at - b.at)
  if (sorted[0].at > 0) sorted.unshift(k(0))
  if (sorted.at(-1).at < 1) sorted.push(k(1))
  return sorted.map(key => ({ offset: key.at, transform: transform(key), easing }))
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
let mascots = []

function mascot(container) {
  container.innerHTML = SVG
  const el = container.firstElementChild
  const parts = Object.fromEntries(Object.entries(PARTS).map(([track, sel]) => [track, el.querySelector(sel)]))
  let loops = [], once = []
  const run = (anim, repeat) => Object.entries(anim.tracks).map(([track, keys]) =>
    parts[track].animate(frames(keys, anim.easing), { duration: anim.duration, iterations: repeat ? Infinity : 1 }))
  const m = {
    el,
    state(name) {
      loops.forEach(a => a.cancel())
      const anim = ANIMS[STATES[name]]
      loops = reduced() ? [] : run(anim, true)
      el.toggleAttribute('data-voice', !!anim.voice)
      if (!anim.voice) m.level(0)
    },
    react(name) {
      once.forEach(a => a.cancel())
      once = reduced() ? [] : run(ANIMS[STATES[name]], false)
    },
    level: v => el.style.setProperty('--level', v.toFixed(3)),
    look: (x, y) => { el.style.setProperty('--lx', x.toFixed(2)); el.style.setProperty('--ly', y.toFixed(2)) },
    blink() { el.classList.remove('fx-blink'); void el.getBoundingClientRect(); el.classList.add('fx-blink') },
  }
  mascots.push(m)
  return m
}

// ── Looping helpers ──

let gen = 0
const sleep = ms => new Promise(r => setTimeout(r, ms))
const seen = new WeakMap()
let viewer = null
const watch = el => { seen.set(el, false); viewer.observe(el) }
// waits until the element is on screen; false once this page visit is over
async function onScreen(el, g) {
  while (g === gen && !seen.get(el)) await sleep(250)
  return g === gen
}
async function wait(ms, g) {
  await sleep(ms)
  return g === gen
}

// ── Live transcript passes (the hero's note) ──

const PASSES = [
  'Trip to',
  "Trip to Paris. Let's make",
  "Trip to Paris. Let's make it a check list.",
  "Trip to Paris. Let's make it a checklist. First one is book",
  "Trip to Paris. Let's make it a checklist. First one is book flights. Second,",
  "Trip to Paris. Let's make it a checklist. First one is book flights. Second, renew my pass",
  "Trip to Paris. Let's make it a checklist. First one is book flights. Second, renew my passport. And the last one is",
  "Trip to Paris. Let's make it a checklist. First one is book flights. Second, renew my passport. And the last one is find a pet sitter.",
]
const NOTE = { heading: 'Trip to Paris', items: ['Book flights', 'Renew my passport', 'Find a pet sitter'] }

// words unchanged since the last pass are settled ink; the rest stay light (voice-app/app.js drawLive)
function draw(target, text, prev) {
  const words = text.split(' ')
  let n = 0
  while (n < words.length && words[n] === prev[n]) n++
  const tentative = document.createElement('span')
  tentative.className = 'au-tentative'
  tentative.textContent = words.slice(n).join(' ')
  target.replaceChildren(`${words.slice(0, n).join(' ')} `, tentative)
  return words
}

// ── Hero: open from the notch, listen, tidy, paste into Notes, close ──

async function hero(stage, g) {
  const pill = stage.querySelector('.au-pill')
  const line = stage.querySelector('.au-line')
  const box = stage.querySelector('.au-text')
  const side = stage.querySelector('.au-side')
  const notes = stage.querySelector('.au-notes-body')
  const m = mascot(stage.querySelector('[data-mascot]'))
  const open = () => { pill.classList.remove('is-hidden', 'is-leave', 'is-enter'); void pill.offsetWidth; pill.classList.add('is-enter') }
  const fit = () => box.classList.toggle('is-overflow', !line.classList.contains('au-final') && line.offsetHeight > box.clientHeight)
  const pasted = () => {
    const h = document.createElement('p')
    h.className = 'au-doc-h'
    h.textContent = NOTE.heading
    notes.replaceChildren(h, ...NOTE.items.map((text, i) => {
      const p = document.createElement('p')
      p.className = 'au-check'
      p.style.animationDelay = `${0.12 * (i + 1)}s`
      p.textContent = text
      return p
    }))
  }
  m.state('idle')

  if (reduced()) { // the end state, still
    pill.classList.remove('is-hidden')
    line.className = 'au-line au-final'
    line.textContent = `${NOTE.heading} ☐ ${NOTE.items.join(' ☐ ')}`
    side.textContent = 'Pasted'
    pasted()
    return
  }

  while (await onScreen(stage, g)) {
    notes.replaceChildren(Object.assign(document.createElement('span'), { className: 'au-caret' }))
    line.className = 'au-line au-hint'
    line.textContent = 'Listening…'
    side.textContent = '0:00'
    stage.classList.add('is-recording')
    open()
    m.state('listening')
    if (!await wait(700, g)) return

    let prev = [], t = 0
    line.className = 'au-line'
    for (const pass of PASSES) {
      prev = draw(line, pass, prev)
      fit()
      for (let i = 0; i < 6; i++) { // voice level between passes, like a real mic
        m.level(0.25 + Math.random() * 0.6)
        side.textContent = `0:${String(Math.floor((t += 0.19))).padStart(2, '0')}`
        if (!await wait(190, g)) return
      }
    }
    prev = draw(line, PASSES.at(-1), PASSES.at(-1).split(' ')) // the final pass: all ink
    stage.classList.remove('is-recording')
    m.state('thinking')
    side.textContent = 'Tidying…'
    if (!await wait(1500, g)) return

    line.className = 'au-line au-final'
    line.textContent = `${NOTE.heading} ☐ ${NOTE.items.join(' ☐ ')}`
    box.classList.remove('is-overflow')
    side.textContent = 'Pasted'
    m.state('idle')
    m.react('done')
    pasted()
    if (!await wait(3200, g)) return

    pill.classList.remove('is-enter')
    pill.classList.add('is-leave')
    if (!await wait(360, g)) return
    pill.classList.add('is-hidden')
    if (!await wait(1800, g)) return
  }
}

// ── Augie's states: ongoing ones loop; one-off moments replay every few seconds ──

function states(root, g) {
  root.querySelectorAll('.au-state [data-mascot]').forEach(async (slot, i) => {
    const name = slot.dataset.mascot
    const m = mascot(slot)
    if (!ONE_OFF[name]) return m.state(name)
    m.state('idle')
    if (reduced()) return
    await sleep(600 + i * 350)
    while (await onScreen(slot, g)) {
      m.react(name)
      if (!await wait(2600, g)) return
    }
  })
  // the listening one gets a voice to react to
  const listening = mascots.find(m => m.el.closest('.au-state [data-mascot="listening"]'))
  if (listening && !reduced()) (async () => {
    while (await onScreen(listening.el.parentElement, g)) {
      listening.level(Math.random() < 0.25 ? 0 : 0.2 + Math.random() * 0.7)
      if (!await wait(160, g)) return
    }
  })()
}

// ── Router: one spoken note at a time, the signals it sees, the job it picks (voice-app/modules/router.js) ──

const ROUTES = [
  { said: 'Can you send me the deck before Friday?', app: 'Mail', site: '—', box: 'yes', tool: 'type', why: 'Written to someone, with the cursor in a message: typed there.' },
  { said: 'Augie, what’s 18% of 240?', app: 'Finder', site: '—', box: 'no', tool: 'ask', why: 'Called by name, so Augie answers in the pill: 43.2, worked out in code.' },
  { said: 'Will it rain in Paris tomorrow?', app: 'Notes', site: '—', box: 'no', tool: 'weather', why: 'A question about the weather: Augment answers it with a forecast card.' },
  { said: 'What’s the capital of Australia?', app: 'Claude', site: '—', box: 'yes', tool: 'type', why: 'Claude is a chatbot, so the question is typed as a prompt.' },
  { said: 'Search for flights to Lisbon', app: 'Arc', site: 'google.com', box: 'no', tool: 'search', why: '“Search for…” always searches, in the browser in front.' },
  { said: 'Did Liverpool win?', app: 'Safari', site: 'bbc.co.uk', box: 'no', tool: 'scores', why: 'A question about a match: answered from the scoreboard, as a card.' },
]

async function router(root, g) {
  const said = root.querySelector('.au-said')
  const why = root.querySelector('.au-why')
  const sigs = [...root.querySelectorAll('[data-sig]')]
  const tools = [...root.querySelectorAll('.au-tool')]
  if (reduced()) return // the markup already shows the first note, routed
  for (let i = 1; await onScreen(root, g); i++) { // the markup shows ROUTES[0]; start with the next one
    const r = ROUTES[i % ROUTES.length]
    said.textContent = `“${r.said}”`
    sigs.forEach(s => { s.textContent = r[s.dataset.sig] })
    tools.forEach(t => t.classList.remove('is-on'))
    why.textContent = 'Deciding…'
    root.classList.remove('is-new'); void root.offsetWidth; root.classList.add('is-new')
    if (!await wait(1000, g)) return
    tools.forEach(t => t.classList.toggle('is-on', t.dataset.tool === r.tool))
    why.textContent = r.why
    if (!await wait(3200, g)) return
  }
}

// ── Apps: the same note in four apps; cycles until you pick one ──

function apps(root, g) {
  const tabs = [...root.querySelectorAll('.au-app-tab')]
  let picked = false
  const show = id => {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.app === id)))
    root.querySelectorAll('.au-app-panel, .au-app-why').forEach(p => { p.hidden = p.dataset.app !== id })
    // restart the progress bar
    root.classList.remove('is-cycling'); void root.offsetWidth; if (!picked && !reduced()) root.classList.add('is-cycling')
  }
  tabs.forEach(t => t.addEventListener('click', () => { picked = true; root.classList.remove('is-cycling'); show(t.dataset.app) }))
  if (reduced()) return
  ;(async () => {
    let i = 0
    while (!picked && await onScreen(root, g)) {
      show(tabs[i % tabs.length].dataset.app)
      if (!await wait(3600, g)) return
      i++
    }
  })()
}

// ── Harness: the steps light up one at a time, then hold, then replay ──

async function harness(root, g) {
  const steps = [...root.querySelectorAll('.au-step')]
  const set = n => {
    steps.forEach((s, i) => s.classList.toggle('is-on', i < n))
    for (let i = 1; i <= 5; i++) root.classList.toggle(`s${i}`, i <= n)
  }
  if (reduced()) return set(5)
  root.classList.add('is-armed')
  while (await onScreen(root, g)) {
    for (let n = 1; n <= 5; n++) {
      set(n)
      if (!await wait(n === 5 ? 4200 : 1700, g)) return
    }
    set(0)
    if (!await wait(600, g)) return
  }
}

// ── v3: the single-row notch pill, opening and closing ──

async function notch(stage, g) {
  const pill = stage.querySelector('.au-pill')
  const m = mascot(stage.querySelector('[data-mascot]'))
  m.state('listening')
  if (reduced()) { pill.classList.remove('is-hidden'); return }
  while (await onScreen(stage, g)) {
    pill.classList.remove('is-hidden', 'is-leave', 'is-enter'); void pill.offsetWidth; pill.classList.add('is-enter')
    for (let i = 0; i < 14; i++) { m.level(0.2 + Math.random() * 0.7); if (!await wait(170, g)) return }
    pill.classList.remove('is-enter'); pill.classList.add('is-leave')
    if (!await wait(360, g)) return
    pill.classList.add('is-hidden')
    if (!await wait(1100, g)) return
  }
}

// ── Habits for every Augie on the page: eyes follow the pointer, an occasional blink ──

function habits(g) {
  const onMove = e => {
    for (const m of mascots) {
      const b = m.el.getBoundingClientRect()
      const dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2)
      const d = Math.hypot(dx, dy) || 1, pull = Math.min(1, d / 160)
      m.look((dx / d) * 7 * pull, (dy / d) * 4 * pull)
    }
  }
  addEventListener('pointermove', onMove, { passive: true })
  ;(async () => {
    while (g === gen) {
      if (!await wait(2200 + Math.random() * 3000, g)) break
      if (!reduced()) mascots.forEach(m => m.blink())
    }
    removeEventListener('pointermove', onMove)
  })()
}

document.addEventListener('astro:page-load', () => {
  const root = document.querySelector('.au')
  gen++
  mascots = []
  viewer?.disconnect()
  if (!root) return
  const g = gen
  viewer = new IntersectionObserver(entries => entries.forEach(e => seen.set(e.target, e.isIntersecting)), { threshold: 0.25 })

  const el = name => root.querySelector(`[data-au="${name}"]`)
  for (const name of ['hero', 'router', 'apps', 'harness', 'notch']) watch(el(name))
  root.querySelectorAll('.au-state [data-mascot]').forEach(watch)

  hero(el('hero'), g)
  states(root, g)
  router(el('router'), g)
  apps(el('apps'), g)
  harness(el('harness'), g)
  notch(el('notch'), g)
  root.querySelectorAll('.au-oldpill [data-mascot], .au-desk--still [data-mascot], .au-answer [data-mascot]').forEach(slot => mascot(slot).state(slot.dataset.mascot))
  habits(g)
})
