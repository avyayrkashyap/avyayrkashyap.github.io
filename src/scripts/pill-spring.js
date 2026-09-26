// Spring maths for the projects list's highlight (see projects.js). Shared
// with the dev-only tuner (src/components/SpringTuner.astro) so its preview
// graph runs the exact code the real pill does.
//
// Each spring has two knobs:
//   stiffness  how hard it pulls toward the target. Higher is faster.
//   damping    a ratio: under 1 overshoots and bounces, 1 settles as fast as
//              possible without overshooting, over 1 creeps in slowly.
//
// The edge heading toward the new item uses `lead`, the other edge `trail`.
// A stiffer lead than trail is what makes the pill stretch in flight.
export const DEFAULT_SPRINGS = {
  lead: { stiffness: 1100, damping: 0.5 },
  trail: { stiffness: 380, damping: 0.8 },
};

// Under these, an edge counts as at rest.
const REST_DISTANCE = 0.2;
const REST_SPEED = 1;

// Advances one edge ({ x, v, target }) by dt seconds. Returns true once it's
// at rest.
export const stepEdge = (edge, { stiffness, damping }, dt) => {
  const force = -stiffness * (edge.x - edge.target) - 2 * damping * Math.sqrt(stiffness) * edge.v;
  edge.v += force * dt;
  edge.x += edge.v * dt;
  return Math.abs(edge.x - edge.target) <= REST_DISTANCE && Math.abs(edge.v) <= REST_SPEED;
};

// Runs a whole move offline: the pill (rowHeight tall) travelling `distance`
// px (negative is up). Returns the edge positions over time plus the numbers
// the tuner reports.
export const simulate = (springs, distance, rowHeight = 48, { dt = 1 / 240, maxTime = 1.5 } = {}) => {
  const top = { x: 0, v: 0, target: distance };
  const bottom = { x: rowHeight, v: 0, target: distance + rowHeight };
  const leadIsBottom = distance > 0;
  const samples = [];
  let maxHeight = rowHeight;
  let settleTime = maxTime;

  for (let t = 0; t <= maxTime; t += dt) {
    const topDone = stepEdge(top, leadIsBottom ? springs.trail : springs.lead, dt);
    const bottomDone = stepEdge(bottom, leadIsBottom ? springs.lead : springs.trail, dt);
    maxHeight = Math.max(maxHeight, bottom.x - top.x);
    samples.push({ t, top: top.x, bottom: bottom.x });
    if (topDone && bottomDone) {
      settleTime = t;
      break;
    }
  }

  return { samples, maxStretch: maxHeight / rowHeight, settleTime };
};
