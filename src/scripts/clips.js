// Screen recordings play on their own and loop, rather than waiting for a
// hover. They're started when they scroll into view and paused when they
// leave it: the viewer sees a clip already running whenever one is on screen,
// while a clip further down the page costs nothing until it gets there. They
// ship with preload="none", so play() is also what triggers the download.
//
// Under prefers-reduced-motion the clips stay on their posters and play on
// hover instead, so the content is still reachable without motion nobody
// asked for.
document.addEventListener('astro:page-load', () => {
  const clips = document.querySelectorAll('.exp-clip, .clip');
  if (!clips.length) return;

  // play() rejects if the clip is paused again before the file is ready,
  // which is expected here rather than an error worth surfacing.
  //
  // After an in-site navigation the ClientRouter moves in clips that were
  // parsed in a detached document, and Chromium rejects their source ("URL
  // safety check"). load() re-runs source selection in this document.
  const play = (clip) => {
    if (clip.error || clip.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) clip.load();
    clip.play().catch(() => {});
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    clips.forEach((clip) => {
      const host = clip.closest('.exp-app, .exp-video') || clip;

      host.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        play(clip);
      });

      host.addEventListener('pointerleave', () => clip.pause());
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          play(entry.target);
        } else {
          entry.target.pause();
        }
      });
    },
    { threshold: 0.2 }
  );

  clips.forEach((clip) => observer.observe(clip));
});
