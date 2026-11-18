/* ======================================================
   DISTRIJAM — Modelo M3 "Cine"
   Usa el catálogo compartido de app.js (distrijamCatalogo / distrijamCategorias)
   ====================================================== */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => distrijamEsc(s);
  const src = (p) => encodeURI(p || '');

  // ── Aparición al hacer scroll ─────────────────────────
  const io = 'IntersectionObserver' in window && !reduced
    ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    : null;
  const watch = (el) => (io ? io.observe(el) : el.classList.add('is-in'));
  document.querySelectorAll('.m3-reveal').forEach(watch);

  // ── Hero: fotos que pasan como película ───────────────
  (function reel() {
    const slides = [...document.querySelectorAll('.m3-slide')];
    const bars = $('#m3-reel-bars');
    const num = $('#m3-reel-num');
    const label = $('#m3-reel-label');
    const caption = $('#m3-reel-caption');
    const captions = [
      { t: 'Todo el surtido', href: 'catalogo.html' },
      { t: 'Bulones, tuercas y arandelas', href: 'catalogo.html?cat=bulones' },
      { t: 'Tornillos para madera', href: 'catalogo.html?cat=autoperforantes' },
      { t: 'Autoperforantes con arandela', href: 'catalogo.html?cat=autoperforantes' },
      { t: 'Tuercas', href: 'catalogo.html?cat=tuercas' },
    ];
    const DUR = 6000;
    let i = 0;
    let timer = null;

    bars.innerHTML = slides.map((_, n) =>
      `<button type="button" class="m3-reel-bar" role="tab" aria-label="Foto ${n + 1}" style="--dur:${DUR}ms"><i></i></button>`
    ).join('');
    const barEls = [...bars.children];

    function show(next) {
      const prev = slides[i];
      if (next !== i) {
        prev.classList.remove('is-active');
        prev.classList.add('is-leaving');
        setTimeout(() => prev.classList.remove('is-leaving'), 1700);
      }
      i = next;
      // Reiniciar la animación aunque sea la misma foto
      slides[i].classList.remove('is-active');
      void slides[i].offsetWidth;
      slides[i].classList.add('is-active');

      barEls.forEach((b, n) => {
        b.classList.remove('is-active');
        b.classList.toggle('is-done', n < i);
        b.setAttribute('aria-selected', String(n === i));
      });
      void barEls[i].offsetWidth;
      barEls[i].classList.add('is-active');

      const c = captions[i] || captions[0];
      num.textContent = String(i + 1).padStart(2, '0');
      label.textContent = c.t;
      caption.href = c.href;

      clearTimeout(timer);
      if (!reduced) timer = setTimeout(() => show((i + 1) % slides.length), DUR);
    }

    barEls.forEach((b, n) => b.addEventListener('click', () => show(n)));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(timer);
      else show(i);
    });
    show(0);
  })();

  // ── Cinta de fotos "en obra" ──────────────────────────
  (function film() {
    const pic = (n) => `imagenes/Imagenes y tornillos para catalogo 900px${n === 1 ? '' : n}.jpg`;
    const row = (from, to) => {
      const figs = [];
      for (let n = from; n <= to; n++) figs.push(`<figure><img src="${src(pic(n))}" alt="" loading="lazy" decoding="async" /></figure>`);
      return figs.join('') + figs.join(''); // doble para que el loop no tenga corte
    };
    $('#m3-film-a').innerHTML = row(1, 12);
    $('#m3-film-b').innerHTML = row(13, 24);
  })();

  // ── Números que cuentan ───────────────────────────────
  (function counters() {
    const els = document.querySelectorAll('[data-count]');
    const run = (el) => {
      const end = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || '0', 10);
      const pre = el.dataset.prefix || '';
      const start = end > 1000 && !pre ? end - 60 : 0;
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 1600);
        const v = start + (end - start) * (1 - Math.pow(1 - k, 4));
        el.textContent = pre + v.toFixed(dec);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (reduced || !('IntersectionObserver' in window)) return;
    const o = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { run(e.target); o.unobserve(e.target); } });
    }, { threshold: 0.6 });
    els.forEach((el) => o.observe(el));
  })();

  // ── Parallax del fondo de contacto ────────────────────
  if (!reduced) {
    const bg = $('.m3-cta-bg img');
    const sec = $('.m3-cta');
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const r = sec.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) bg.style.setProperty('--py', `${(r.top / innerHeight) * -60}px`);
        ticking = false;
      });
    }, { passive: true });
  }

  // ── Todo lo que sale del catálogo ─────────────────────
  Promise.all([distrijamCatalogo(), distrijamCategorias()]).then(([products, cats]) => {
    const conFoto = products.filter((p) => p.image);
    $('#m3-total').textContent = products.length;

    buildStrip(conFoto, cats);
    buildGrid(products, cats);
    buildLines(products, cats);
  }).catch((err) => {
    console.error('No se pudo cargar el catálogo', err);
    $('#m3-grid').innerHTML = '<p class="m3-lead">No pudimos cargar los productos. <a href="catalogo.html" style="text-decoration:underline">Abrí el catálogo</a>.</p>';
  });

  const catLabel = (cats, id) => (cats[id] ? cats[id].label : id);
  const medidas = (p) => {
    const n = (p.variants || []).length;
    return n === 1 ? '1 medida' : `${n} medidas`;
  };

  // Una foto por producto distinto, en dos cintas que van en sentido contrario
  function buildStrip(list, cats) {
    const seen = new Set();
    const uniq = list.filter((p) => !seen.has(p.image) && seen.add(p.image));
    const card = (p) => `
      <a class="m3-chip-card" href="producto.html?id=${encodeURIComponent(p.id)}">
        <img src="${src(p.image)}" alt="" loading="lazy" decoding="async" />
        <span>${esc(p.name)}<small>${esc(catLabel(cats, p.category))}</small></span>
      </a>`;
    const half = Math.ceil(uniq.length / 2);
    const a = uniq.slice(0, half).map(card).join('');
    const b = uniq.slice(half).map(card).join('');
    $('#m3-strip-a').innerHTML = a + a;
    $('#m3-strip-b').innerHTML = b + b;
    // Las copias no se leen dos veces ni se recorren con Tab
    document.querySelectorAll('.m3-strip-row').forEach((row) => {
      const kids = [...row.children];
      kids.slice(kids.length / 2).forEach((k) => { k.setAttribute('aria-hidden', 'true'); k.tabIndex = -1; });
    });
  }

  function buildGrid(products, cats) {
    const grid = $('#m3-grid');
    const chips = $('#m3-chips');
    const more = $('#m3-more');
    const catLink = $('#m3-cat-link');
    const PAGE = 8;
    let filter = 'todos';
    let shown = PAGE;

    const counts = {};
    products.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
    const order = Object.keys(cats).filter((id) => counts[id]).sort((x, y) => counts[y] - counts[x]);

    chips.innerHTML = [
      `<button type="button" class="m3-chip" role="tab" data-cat="todos" aria-selected="true">Todos<sup>${products.length}</sup></button>`,
      ...order.map((id) => `<button type="button" class="m3-chip" role="tab" data-cat="${esc(id)}" aria-selected="false">${esc(cats[id].label)}<sup>${counts[id]}</sup></button>`),
    ].join('');

    // Primero los que tienen foto nueva (más lindas), sin repetir la misma foto
    const score = (p) => (p.image && p.image.includes('Fotos Nuevas') ? 0 : 1);
    const ordered = [...products].sort((a, b) => score(a) - score(b));

    function render() {
      const list = filter === 'todos' ? ordered : ordered.filter((p) => p.category === filter);
      grid.innerHTML = list.slice(0, shown).map((p, n) => {
        const alt = /Fotos Nuevas\/.+\.png$/i.test(p.image || '') ? p.image.replace(/\.png$/i, ' ESQUEMA.png') : '';
        return `
        <a class="m3-card" href="producto.html?id=${encodeURIComponent(p.id)}" style="--d:${(n % PAGE) * 0.06}s" ${alt ? `data-alt="${esc(src(alt))}"` : ''}>
          <div class="m3-card-media">
            <span class="m3-card-tag">${esc(catLabel(cats, p.category))}</span>
            <img class="m3-main" src="${src(p.image || 'Logo/logo-distrijam.png')}" alt="${esc(p.name)}" loading="lazy" decoding="async" />
          </div>
          <div class="m3-card-body">
            <h3 class="m3-card-name">${esc(p.name)}</h3>
            <p class="m3-card-meta">${esc(medidas(p))}${p.brand ? ` · ${esc(p.brand)}` : ''}</p>
            <div class="m3-card-go"><span>Ver medidas</span><i aria-hidden="true">→</i></div>
          </div>
        </a>`;
      }).join('');

      grid.querySelectorAll('.m3-card').forEach((card) => {
        watch(card);
        // Al pasar el mouse muestra el esquema, si el producto tiene
        const alt = card.dataset.alt;
        if (alt) {
          const probe = new Image();
          probe.onload = () => {
            const img = document.createElement('img');
            img.className = 'm3-alt';
            img.src = alt;
            img.alt = '';
            card.querySelector('.m3-card-media').appendChild(img);
            card.classList.add('has-alt');
          };
          card.addEventListener('mouseenter', () => { if (!probe.src) probe.src = alt; }, { once: true });
        }
        card.addEventListener('pointermove', (e) => {
          const r = card.getBoundingClientRect();
          card.style.setProperty('--mx', `${e.clientX - r.left}px`);
          card.style.setProperty('--my', `${e.clientY - r.top}px`);
        });
      });

      more.hidden = list.length <= shown;
      catLink.href = filter === 'todos' ? 'catalogo.html' : `catalogo.html?cat=${encodeURIComponent(filter)}`;
      catLink.textContent = filter === 'todos'
        ? 'Abrir el catálogo completo →'
        : `Ver ${catLabel(cats, filter)} en el catálogo →`;
    }

    chips.addEventListener('click', (e) => {
      const b = e.target.closest('.m3-chip');
      if (!b) return;
      chips.querySelectorAll('.m3-chip').forEach((c) => c.setAttribute('aria-selected', String(c === b)));
      filter = b.dataset.cat;
      shown = PAGE;
      render();
    });
    more.addEventListener('click', () => { shown += PAGE; render(); });

    render();
  }

  // Paneles por línea en una grilla común (sin scroll horizontal)
  function buildLines(products, cats) {
    const track = $('#m3-lines-track');

    const by = {};
    products.forEach((p) => { (by[p.category] = by[p.category] || []).push(p); });
    const ids = Object.keys(cats).filter((id) => by[id]).sort((x, y) => by[y].length - by[x].length);

    track.innerHTML = ids.map((id, n) => {
      const list = by[id];
      const hero = list.find((p) => p.image && p.image.includes('Fotos Nuevas')) || list.find((p) => p.image) || {};
      return `
      <a class="m3-line-panel" href="catalogo.html?cat=${encodeURIComponent(id)}" style="--d:${(n % 5) * 0.06}s">
        <span class="m3-line-idx">${String(n + 1).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}</span>
        ${hero.image ? `<img src="${src(hero.image)}" alt="" loading="lazy" decoding="async" />` : ''}
        <div>
          <h3 class="m3-line-name">${esc(cats[id].label)}</h3>
          <p class="m3-line-count"><b aria-hidden="true">→</b>${list.length} ${list.length === 1 ? 'producto' : 'productos'}</p>
        </div>
      </a>`;
    }).join('');

    track.querySelectorAll('.m3-line-panel').forEach(watch);
  }
})();
