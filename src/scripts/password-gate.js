// Re-run on every ClientRouter navigation, matching the rest of the site's
// astro:page-load pattern. Checks a hashed password client-side — this is a
// soft gate (no backend on a static site can do real auth), just enough to
// keep the page out of casual view and search results until it's ready.
document.addEventListener('astro:page-load', () => {
  const gate = document.getElementById('passwordGate');
  if (!gate) return;

  const protectedEl = document.getElementById('gateProtected');
  const storageKey = gate.dataset.storageKey;
  const expectedHash = gate.dataset.passwordHash;

  function unlock() {
    localStorage.setItem(storageKey, 'true');
    gate.hidden = true;
    if (protectedEl) protectedEl.hidden = false;
  }

  if (localStorage.getItem(storageKey) === 'true') {
    unlock();
    return;
  }

  const form = document.getElementById('gateForm');
  const input = document.getElementById('gateInput');
  const error = document.getElementById('gateError');
  if (!form || !input) return;

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = await sha256(input.value.trim().toLowerCase());
    if (hash === expectedHash) {
      unlock();
      return;
    }

    error.hidden = false;
    form.classList.remove('gate-form--shake');
    void form.offsetWidth; // restart the shake animation on repeat wrong guesses
    form.classList.add('gate-form--shake');
    input.value = '';
    input.focus();
  });
});
