(() => {
  const card = document.querySelector('.hero .hero-feature-visualizer');
  const hint = document.querySelector('.hero .visualizer-hint');
  if (!card || !hint) return;

  let dismissed = false;
  let showTimer;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    window.clearTimeout(showTimer);
    hint.dataset.state = 'dismissed';
    if (hint.hidden) return;
    window.setTimeout(() => { hint.hidden = true; }, 180);
  };

  // A click also covers keyboard activation and a completed touch tap.
  card.addEventListener('click', dismiss, { once: true });

  // Let the existing card entrance finish before introducing the help cue.
  showTimer = window.setTimeout(() => {
    if (dismissed) return;
    hint.hidden = false;
    hint.dataset.state = 'visible';
  }, 1650);
})();
