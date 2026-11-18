/* ======================================================
   DISTRIJAM — Modelo M5 "Muro"
   ====================================================== */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => distrijamEsc(s);
  const src = (p) => encodeURI(p || '');

  const io = 'IntersectionObserver' in window && !reduced
    ? new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 })
    : null;
  document.querySelectorAll('.m5-reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('is-in')));

  // ── Muro de fotos: cada tanto una baldosa cambia de foto ──
  (function wall() {
    const wallEl = $('#m5-wall');
    const photo = (n) => `imagenes/Imagenes y tornillos para catalogo 900px${n === 1 ? '' : n}.jpg`;
    const PHOTOS = Array.from({ length: 32 }, (_, k) => photo(k + 1));
    const PRODUCTS = ['HEX T2', 'DRY T1 AGUJA', 'BULON CABEZ RED CCC', 'TIRAFONDO', 'TARUGO CON TOPE', 'PARKER', 'HELIX', 'FIX', 'CHIP', 'DECK MECHA', 'PHIL MECHA', 'ALAS']
      .map((n) => `imagenes/Fotos Nuevas/${n}.png`);
    const TILES = 24;
    let pPhoto = 0;
    let pProd = 0;
    const nextFor = (isProd) => (isProd ? PRODUCTS[pProd++ % PRODUCTS.length] : PHOTOS[pPhoto++ % PHOTOS.length]);

    const tiles = [];
    for (let k = 0; k < TILES; k++) {
      const isProd = k % 5 === 2;
      const t = document.createElement('div');
      t.className = `m5-tile${isProd ? ' is-product' : ''}`;
      const a = new Image();
      a.alt = '';
      a.decoding = 'async';
      a.src = src(nextFor(isProd));
      a.className = 'is-on';
      const b = new Image();
      b.alt = '';
      b.decoding = 'async';
      t.append(a, b);
      wallEl.appendChild(t);
      tiles.push({ el: t, imgs: [a, b], on: 0, isProd });
    }

    if (reduced) return;

    function swap() {
      const t = tiles[Math.floor(Math.random() * tiles.length)];
      const off = t.imgs[1 - t.on];
      off.onload = () => {
        t.imgs[t.on].classList.remove('is-on');
        off.classList.add('is-on');
        t.on = 1 - t.on;
        t.el.classList.remove('is-flash');
        void t.el.offsetWidth;
        t.el.classList.add('is-flash');
      };
      off.src = src(nextFor(t.isProd));
    }
    let timer = setInterval(swap, 1100);
    document.addEventListener('visibilitychange', () => {
      clearInterval(timer);
      if (!document.hidden) timer = setInterval(swap, 1100);
    });

    // El muro se corre con el mouse y se acerca al bajar
    if (window.matchMedia('(hover: hover)').matches) {
      window.addEventListener('pointermove', (e) => {
        if (window.scrollY > innerHeight) return;
        wallEl.style.setProperty('--wx', `${(e.clientX / innerWidth - 0.5) * -24}px`);
        wallEl.style.setProperty('--wy', `${(e.clientY / innerHeight - 0.5) * -24}px`);
      }, { passive: true });
    }
    window.addEventListener('scroll', () => {
      const k = Math.min(1, window.scrollY / innerHeight);
      wallEl.style.setProperty('--ws', String(1 + k * 0.1));
    }, { passive: true });
  })();

  // ── Tarjetas apiladas: la de abajo se achica cuando la tapa la siguiente ──
  (function stack() {
    const cards = [...document.querySelectorAll('.m5-chapter')];
    if (reduced || cards.length < 2) return;
    let ticking = false;
    const update = () => {
      cards.forEach((c, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const stuck = parseFloat(getComputedStyle(next).top) || 0;
        const d = next.getBoundingClientRect().top - stuck;
        const k = Math.min(1, Math.max(0, 1 - d / c.offsetHeight));
        c.style.setProperty('--s', String(1 - k * 0.06));
        c.style.setProperty('--b', String(1 - k * 0.45));
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  // ── Explorador de productos ──
  Promise.all([distrijamCatalogo(), distrijamCategorias()]).then(([products, cats]) => {
    const by = {};
    products.forEach((p) => { (by[p.category] = by[p.category] || []).push(p); });

    document.querySelectorAll('[data-count-cat]').forEach((el) => {
      el.textContent = el.dataset.countCat.split(',').reduce((n, id) => n + (by[id] ? by[id].length : 0), 0);
    });

    const ids = Object.keys(cats).filter((id) => by[id]).sort((a, b) => by[b].length - by[a].length);
    const tabs = $('#m5-tabs');
    const list = $('#m5-list');
    const preview = $('#m5-preview');
    let current = null;

    tabs.innerHTML = ids.map((id, n) =>
      `<button type="button" class="m5-tab" role="tab" data-cat="${esc(id)}" aria-selected="${n === 0}">${esc(cats[id].label)}<sup>${by[id].length}</sup></button>`
    ).join('');

    function paint(p) {
      $('#m5-p-img').src = src(p.image || 'Logo/logo-distrijam.png');
      $('#m5-p-img').alt = p.name;
      $('#m5-p-cat').textContent = cats[p.category] ? cats[p.category].label : p.category;
      $('#m5-p-name').textContent = p.name;
      $('#m5-p-desc').textContent = p.description || '';
      const medidas = [...new Set((p.variants || []).map((v) => v.medida).filter(Boolean))];
      const MAX = 18;
      $('#m5-p-sizes').innerHTML = medidas.slice(0, MAX).map((m) => `<span>${esc(m)}</span>`).join('')
        + (medidas.length > MAX ? `<em>y ${medidas.length - MAX} más</em>` : '');
      $('#m5-p-link').href = `producto.html?id=${encodeURIComponent(p.id)}`;
      $('#m5-p-wa').href = `https://wa.me/5493794007195?text=${encodeURIComponent(`Hola Distrijam, quiero cotizar: ${p.name}`)}`;
    }

    function select(p, btn) {
      if (current === p) return;
      current = p;
      list.querySelectorAll('.m5-item').forEach((b) => b.setAttribute('aria-current', String(b === btn)));
      if (reduced) { paint(p); return; }
      preview.classList.add('is-swap');
      clearTimeout(select.t);
      select.t = setTimeout(() => { paint(p); requestAnimationFrame(() => preview.classList.remove('is-swap')); }, 220);
    }

    function showCat(id) {
      const items = by[id] || [];
      list.innerHTML = items.map((p, n) => `
        <li><button type="button" class="m5-item" data-n="${n}">
          <img src="${src(p.image || 'Logo/logo-distrijam.png')}" alt="" loading="lazy" decoding="async" />
          <span>${esc(p.name)}<small>${(p.variants || []).length} medidas</small></span><i aria-hidden="true">→</i>
        </button></li>`).join('');
      list.scrollTop = 0;
      current = null;
      const btns = [...list.querySelectorAll('.m5-item')];
      btns.forEach((b) => {
        const p = items[+b.dataset.n];
        b.addEventListener('click', () => select(p, b));
        b.addEventListener('mouseenter', () => { if (window.matchMedia('(hover: hover)').matches) select(p, b); });
      });
      if (items[0]) select(items[0], btns[0]);
    }

    tabs.addEventListener('click', (e) => {
      const t = e.target.closest('.m5-tab');
      if (!t) return;
      tabs.querySelectorAll('.m5-tab').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
      showCat(t.dataset.cat);
    });

    if (ids[0]) showCat(ids[0]);
  }).catch((err) => {
    console.error('No se pudo cargar el catálogo', err);
    $('#m5-p-name').textContent = 'No pudimos cargar los productos';
  });
})();
