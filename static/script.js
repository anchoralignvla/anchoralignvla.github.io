// Lazy-attach <source> only when a grid video enters the viewport,
// and pause it again when it leaves. Keeps page load light and prevents
// dozens of parallel byte-range requests from saturating the dev server.
document.addEventListener("DOMContentLoaded", () => {
  // Exclude carousel videos (marked .carousel-vid) — managed by their own logic below.
  const videos = document.querySelectorAll("video.vid[data-src]:not(.carousel-vid)");
  if (!("IntersectionObserver" in window)) {
    videos.forEach(v => {
      const s = document.createElement("source");
      s.src = v.dataset.src;
      s.type = "video/mp4";
      v.appendChild(s);
      v.load();
    });
    return;
  }
  const attach = (v) => {
    if (v.dataset.loaded) return;
    const s = document.createElement("source");
    s.src = v.dataset.src;
    s.type = "video/mp4";
    v.appendChild(s);
    v.load();
    v.dataset.loaded = "1";
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        attach(v);
        v.playbackRate = parseFloat(v.dataset.speed || "1");
        v.play().catch(() => { /* autoplay blocked */ });
      } else {
        v.pause();
      }
    }
  }, { threshold: 0.25, rootMargin: "0px 0px" });
  videos.forEach(v => io.observe(v));

  // Carousels — dropdown selector + prev/next/dot controls.
  document.querySelectorAll(".carousel").forEach(car => {
    const slides = car.querySelectorAll(".carousel-slide");
    const dots   = car.querySelectorAll(".dot");
    const delay  = parseInt(car.dataset.autoplay || "5000", 10);
    const noAdvance = car.hasAttribute("data-noadvance");
    const noSelect  = car.hasAttribute("data-noselect");
    let cur = 0, timer, advancing = false;

    // Build dropdown from slide captions
    const select = document.createElement("select");
    select.className = "pair-select carousel-select";
    slides.forEach((slide, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      const caption = slide.querySelector(".carousel-caption");
      opt.textContent = caption ? caption.childNodes[0].textContent.trim() : `Trial ${i + 1}`;
      select.appendChild(opt);
    });
    if (!noSelect) car.insertAdjacentElement("beforebegin", select);

    const slideVids = (slide) => Array.from(slide.querySelectorAll("video.carousel-vid"));

    // Play every video in the active slide; advance only once all have finished.
    const attachAndPlay = (slide) => {
      if (!slide) return;
      const vids = slideVids(slide);
      if (!vids.length) return;
      let ended = 0;
      const onEnded = () => { ended += 1; if (ended >= vids.length) go(cur + 1); };
      vids.forEach(v => {
        const spd = parseFloat(v.dataset.speed || "1");
        const start = () => { v.playbackRate = spd; v.play().catch(() => {}); };
        v.loop = false;  // play once, then hold on the last frame (no re-looping)
        if (!noAdvance) v.addEventListener("ended", onEnded, { once: true });
        if (!v.dataset.loaded) {
          const s = document.createElement("source");
          s.src = v.dataset.src;
          s.type = "video/mp4";
          v.appendChild(s);
          v.load();
          v.dataset.loaded = "1";
          v.addEventListener("canplay", start, { once: true });
        } else {
          v.currentTime = 0;
          start();
        }
      });
    };

    const pauseSlide = (slide) => slideVids(slide).forEach(v => { v.pause(); });

    const go = (n) => {
      if (advancing) return;
      advancing = true;
      pauseSlide(slides[cur]);
      slides[cur].classList.remove("active");
      dots[cur]?.classList.remove("active");
      cur = (n + slides.length) % slides.length;
      slides[cur].classList.add("active");
      dots[cur]?.classList.add("active");
      attachAndPlay(slides[cur]);
      advancing = false;
    };

    // Sync dropdown with go()
    select.addEventListener("change", e => go(parseInt(e.target.value)));
    const origGo = go;
    const goAndSync = (n) => { origGo(n); select.value = cur; };

    // Manual prev/next/dot — jump immediately, then continue auto-advance from there
    car.querySelector(".prev")?.addEventListener("click", () => { go(cur - 1); select.value = cur; });
    car.querySelector(".next")?.addEventListener("click", () => { go(cur + 1); select.value = cur; });
    dots.forEach((d, i) => d.addEventListener("click", () => { go(i); select.value = cur; }));

    // Start when carousel scrolls into view; pause when out of view.
    const visObs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        attachAndPlay(slides[cur]);
      } else {
        pauseSlide(slides[cur]);
      }
    }, { threshold: 0.3 });
    visObs.observe(car);
  });

  // Side nav is always open (collapse disabled).
  try { localStorage.removeItem("sidenavCollapsed"); } catch (e) {}
  const sidenav = document.getElementById("sidenav");
  if (sidenav) sidenav.classList.remove("collapsed");

  // Sticky side nav: highlight current section + sub-section while scrolling.
  const navLinks = document.querySelectorAll(".sidenav a");
  const linkById = new Map();
  navLinks.forEach(a => {
    const id = a.getAttribute("href").slice(1);
    // When multiple links share an href (e.g. #liberopro), prefer the top-level (non-sub) link.
    if (!linkById.has(id) || !a.classList.contains("sub")) linkById.set(id, a);
  });

  const sections = document.querySelectorAll("section.section");
  const subAnchors = document.querySelectorAll(
    "[id^='rw-'], [id^='lp-'], [id^='lpo-'], [id^='ps-']"
  );

  const setActive = (id, isSub) => {
    navLinks.forEach(a => {
      const sub = a.classList.contains("sub");
      if (isSub ? sub : !sub) a.classList.remove("active");
    });
    const link = linkById.get(id);
    if (link) link.classList.add("active");
  };

  const so = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) setActive(e.target.id, false);
    }
  }, { threshold: 0, rootMargin: "-30% 0px -60% 0px" });
  sections.forEach(s => so.observe(s));

  const ssub = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) setActive(e.target.id, true);
    }
  }, { threshold: 0, rootMargin: "-20% 0px -70% 0px" });
  subAnchors.forEach(s => ssub.observe(s));

  // The last section (BibTeX) can't scroll high enough to reach the active band,
  // so highlight it directly once the page is scrolled to the bottom.
  const activateLastAtBottom = () => {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      const last = sections[sections.length - 1];
      if (last) setActive(last.id, false);
    }
  };
  window.addEventListener("scroll", activateLastAtBottom, { passive: true });
  activateLastAtBottom();

  // Marquee: continuous auto-scroll, pause on hover, manual left/right arrows.
  document.querySelectorAll(".marquee-wrap").forEach(wrap => {
    const m = wrap.querySelector(".marquee");
    const track = wrap.querySelector(".marquee-track");
    if (!track) return;
    let offset = 0, paused = false, manualUntil = 0;
    let half = track.scrollWidth / 2;
    const wrapOff = () => { if (half > 0) offset = ((offset % half) + half) % half; };
    const apply = () => { track.style.transform = `translateX(${-offset}px)`; };
    if (m) {
      m.addEventListener("mouseenter", () => { paused = true; });
      m.addEventListener("mouseleave", () => { paused = false; });
    }
    let last = performance.now();
    const SPEED = 0.4; // px per ~16.7ms frame (~24 px/s)
    const frame = (now) => {
      const dt = now - last; last = now;
      if (!half) half = track.scrollWidth / 2;
      if (!paused && now > manualUntil && half > 0) { offset += SPEED * (dt / 16.67); wrapOff(); apply(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const nudge = (d) => { offset += d * 320; wrapOff(); apply(); manualUntil = performance.now() + 1400; };
    const prev = wrap.querySelector(".marquee-btn.prev");
    const next = wrap.querySelector(".marquee-btn.next");
    if (prev) prev.addEventListener("click", () => nudge(-1));
    if (next) next.addEventListener("click", () => nudge(1));
  });
});
