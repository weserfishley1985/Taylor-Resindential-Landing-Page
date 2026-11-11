(() => {
  const gallery = document.querySelector('#buildings .coldformed-gallery');
  if (!gallery) return;

  const stage = gallery.querySelector('.coldformed-gallery-stage');
  const photos = [...gallery.querySelectorAll('.coldformed-gallery-photo')];
  const dots = [...gallery.querySelectorAll('.coldformed-gallery-dots button')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const step = Math.PI * 2 / photos.length;
  const fullTurnMs = 36000;
  let phase = 0;
  let lastFrame = 0;
  let radius = 0;
  let inView = true;
  let tween = null;
  let activeIndex = -1;
  let hoverPaused = false;
  photos.forEach(photo => photo.removeAttribute('aria-hidden'));

  const updateRadius = () => { radius = stage.clientWidth * .32; };
  const currentIndex = () => {
    let best = 0;
    for (let i = 1; i < photos.length; i++) {
      if (Math.cos(phase + i * step) > Math.cos(phase + best * step)) best = i;
    }
    return best;
  };

  const render = () => {
    photos.forEach((photo, i) => {
      const angle = phase + i * step;
      const depth = (Math.cos(angle) + 1) / 2;
      const x = Math.sin(angle) * radius;
      const scale = .68 + .32 * depth;
      const yaw = -Math.sin(angle) * 17;
      photo.style.transform = `translate3d(calc(-50% + ${x.toFixed(2)}px), -50%, ${(depth * 70).toFixed(2)}px) scale(${scale.toFixed(3)}) rotateY(${yaw.toFixed(2)}deg)`;
      photo.style.zIndex = String(Math.round(depth * 100) + 1);
    });
    const active = currentIndex();
    if (active !== activeIndex) {
      dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === active)));
      activeIndex = active;
    }
  };

  const frame = time => {
    const elapsed = lastFrame ? Math.min(time - lastFrame, 64) : 0;
    lastFrame = time;
    if (inView && !document.hidden) {
      if (hoverPaused) {
        if (tween) tween.start += elapsed;
      } else if (tween) {
        const progress = Math.min((time - tween.start) / 650, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        phase = tween.from + (tween.to - tween.from) * ease;
        if (progress === 1) tween = null;
      } else if (!reducedMotion.matches) {
        phase -= elapsed * Math.PI * 2 / fullTurnMs;
      }
      render();
    }
    requestAnimationFrame(frame);
  };

  const goTo = index => {
    const targetIndex = (index + photos.length) % photos.length;
    let target = -targetIndex * step;
    while (target - phase > Math.PI) target -= Math.PI * 2;
    while (phase - target > Math.PI) target += Math.PI * 2;
    if (reducedMotion.matches) {
      phase = target;
      render();
    } else {
      tween = { from: phase, to: target, start: performance.now() };
    }
  };

  gallery.querySelector('.coldformed-gallery-prev').addEventListener('click', () => goTo(currentIndex() - 1));
  gallery.querySelector('.coldformed-gallery-next').addEventListener('click', () => goTo(currentIndex() + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
  photos.forEach((photo, i) => {
    photo.addEventListener('click', () => goTo(i));
    photo.addEventListener('pointerenter', () => { hoverPaused = true; });
    photo.addEventListener('pointerleave', () => { hoverPaused = false; });
  });
  new ResizeObserver(() => { updateRadius(); render(); }).observe(stage);
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    lastFrame = 0;
  }, { threshold: .05 }).observe(gallery);

  updateRadius();
  render();
  requestAnimationFrame(frame);
})();
