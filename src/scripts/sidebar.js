(function () {
    const TICK_COUNT = 18;
    const TICK_STEP = 8;    // 2px height + 6px gap
    const MIN_W = 16;
    const MAX_W = 32;
    const SIGMA = 24;
    const NAV_TOP = 114;  // sidebar-nav top offset within sidebar

    // Y positions of each nav label within the tick field (0 = top tick)
    const NAV_Y = [8, 48, 88, 128];

    // Read elements only when standard structure mounts
    const tickField = document.getElementById('tickField');
    const sidebar = document.querySelector('.sidebar');
    const navLinks = document.querySelectorAll('.nav-link');

    if (!tickField || !sidebar) return;

    // Build ticks
    const ticks = [];
    for (let i = 0; i < TICK_COUNT; i++) {
        const el = document.createElement('div');
        el.className = 'tick';
        tickField.appendChild(el);
        ticks.push(el);
    }

    // Position labels vertically
    navLinks.forEach((link, i) => {
        link.style.top = (NAV_Y[i] - 8) + 'px'; // -8 to center 16px text on tick
    });

    function gaussian(dist) {
        return Math.exp(-0.5 * (dist / SIGMA) ** 2);
    }

    function setWidths(targetY) {
        ticks.forEach((tick, i) => {
            const cy = i * TICK_STEP + 1;
            const g = gaussian(Math.abs(cy - targetY));
            const w = MIN_W + (MAX_W - MIN_W) * g;
            tick.style.width = w + 'px';

            const r = Math.round(117 + (255 - 117) * g);
            const gr = Math.round(163 + (255 - 163) * g);
            const b = Math.round(240 + (255 - 240) * g);
            tick.style.backgroundColor = `rgb(${r}, ${gr}, ${b})`;
        });
    }

    // Derive initial active index from DOM (set by Astro server-side)
    let activeIdx = 0;
    navLinks.forEach((link, i) => {
        if (link.classList.contains('active')) activeIdx = i;
    });
    let hovering = false;

    setWidths(NAV_Y[activeIdx]);

    navLinks.forEach((link, i) => {
        link.addEventListener('mouseenter', () => {
            activeIdx = i;
        });
    });

    sidebar.addEventListener('mousemove', (e) => {
        hovering = true;
        const cursorY = e.clientY - sidebar.getBoundingClientRect().top - NAV_TOP;
        setWidths(cursorY);
    });

    sidebar.addEventListener('mouseleave', () => {
        hovering = false;
        setWidths(NAV_Y[activeIdx]);
    });
})();
