/* ======================================================
   DISTRIJAM — Interacciones de M9 a M13 (se carga después de m5.js)
   ====================================================== */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WA = '5493794007195';

  // Cantidad de medidas de cada producto destacado: [data-count-id="id"]
  const counted = document.querySelectorAll('[data-count-id]');
  if (counted.length && typeof distrijamCatalogo === 'function') {
    distrijamCatalogo().then((products) => {
      const byId = {};
      products.forEach((p) => { byId[p.id] = (p.variants || []).length; });
      counted.forEach((el) => { if (byId[el.dataset.countId]) el.textContent = byId[el.dataset.countId]; });
    }).catch(() => {});
  }

  // ── M9: las historias avanzan solas y se pueden deslizar ──
  (function stories() {
    const box = document.getElementById('m9-stories');
    if (!box) return;
    const cards = [...box.children];
    let cur = 0;
    let timer = null;
    const mobile = () => window.matchMedia('(max-width: 860px)').matches;

    function on(n, scroll) {
      cur = (n + cards.length) % cards.length;
      cards.forEach((c, k) => {
        c.classList.remove('is-on');
        if (k === cur) { void c.offsetWidth; c.classList.add('is-on'); }
      });
      if (scroll && mobile()) box.scrollTo({ left: cards[cur].offsetLeft - 16, behavior: 'smooth' });
      clearTimeout(timer);
      if (!reduced) timer = setTimeout(() => on(cur + 1, true), 4000);
    }

    // Si la persona desliza, la historia activa es la que quedó a la vista
    let t = null;
    box.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const left = box.scrollLeft;
        let best = 0;
        cards.forEach((c, k) => { if (Math.abs(c.offsetLeft - 16 - left) < Math.abs(cards[best].offsetLeft - 16 - left)) best = k; });
        if (best !== cur) on(best, false);
      }, 120);
    }, { passive: true });
    cards.forEach((c, k) => c.addEventListener('mouseenter', () => { if (!mobile()) on(k, false); }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else on(cur, false); });
    on(0, false);
  })();

  // ── M11: lista de pedido que se manda por WhatsApp ──
  (function pedido() {
    const slip = document.getElementById('m11-slip');
    if (!slip) return;
    const chips = slip.querySelector('.m11-chips');
    const medida = slip.querySelector('#m11-medida');
    const out = slip.querySelector('output');
    const list = slip.querySelector('.m11-list');
    const empty = slip.querySelector('.m11-empty');
    const send = slip.querySelector('.m11-send');
    const STEP = [50, 100, 200, 500, 1000, 2500, 5000];
    let linea = chips.querySelector('[aria-pressed="true"]').textContent;
    let q = 1;
    const items = [];

    chips.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      chips.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      linea = b.textContent;
      medida.focus();
    });
    slip.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      q = Math.max(0, Math.min(STEP.length - 1, q + Number(b.dataset.q)));
      out.textContent = STEP[q];
    }));

    function paint() {
      list.innerHTML = items.map((it, k) => `<li><span>${distrijamEsc(it.linea)} ${distrijamEsc(it.medida)}</span><span><b>x ${it.cant}</b> <button type="button" data-del="${k}" aria-label="Quitar">×</button></span></li>`).join('');
      empty.hidden = items.length > 0;
      send.disabled = items.length === 0;
    }
    function add() {
      items.push({ linea, medida: medida.value.trim(), cant: STEP[q] });
      medida.value = '';
      paint();
    }
    slip.querySelector('.m11-add').addEventListener('click', add);
    medida.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (b) { items.splice(Number(b.dataset.del), 1); paint(); }
    });
    send.addEventListener('click', () => {
      const lines = items.map((it) => `• ${it.linea}${it.medida ? ` ${it.medida}` : ''}: ${it.cant} u.`).join('\n');
      const text = `Hola Distrijam, quiero cotizar este pedido:\n${lines}`;
      window.open(`https://wa.me/${WA}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    });
    paint();
  })();

  // ── M13: mazo de tarjetas que se pasa con el dedo ──
  (function deck() {
    const box = document.getElementById('m13-deck');
    if (!box) return;
    const cards = [...box.children];
    const dots = document.querySelector('.m13-dots');
    dots.innerHTML = cards.map(() => '<i></i>').join('');
    const dotEls = [...dots.children];
    let order = cards.map((_, k) => k);

    function layout() {
      order.forEach((k, depth) => {
        const c = cards[k];
        c.dataset.depth = depth;
        c.style.setProperty('--depth', depth);
        c.style.setProperty('--x', '0px');
        c.style.setProperty('--r', '0deg');
        c.setAttribute('aria-hidden', String(depth !== 0));
        c.querySelectorAll('a').forEach((a) => { a.tabIndex = depth === 0 ? 0 : -1; });
      });
      dotEls.forEach((d, k) => d.classList.toggle('is-on', k === order[0]));
    }
    function next(dir) {
      const top = cards[order[0]];
      top.style.setProperty('--x', `${dir * 130}%`);
      top.style.setProperty('--r', `${dir * 18}deg`);
      setTimeout(() => {
        order = dir > 0 ? [...order.slice(1), order[0]] : [order[order.length - 1], ...order.slice(0, -1)];
        layout();
      }, reduced ? 0 : 220);
    }

    // Arrastre con dedo o mouse sobre la tarjeta de arriba
    let startX = 0;
    let dx = 0;
    let dragging = false;
    box.addEventListener('pointerdown', (e) => {
      const top = cards[order[0]];
      if (!top.contains(e.target) || e.target.closest('a')) return;
      dragging = true; startX = e.clientX; dx = 0;
      top.classList.add('is-drag');
      top.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      const top = cards[order[0]];
      top.style.setProperty('--x', `${dx}px`);
      top.style.setProperty('--r', `${dx / 18}deg`);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      cards[order[0]].classList.remove('is-drag');
      if (Math.abs(dx) > 70) next(dx < 0 ? 1 : -1);
      else layout();
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    document.querySelector('[data-deck="prev"]').addEventListener('click', () => next(-1));
    document.querySelector('[data-deck="next"]').addEventListener('click', () => next(1));
    layout();
  })();
})();
