/* ======================================================
   DISTRIJAM — Modelo M4 "Vitrina"
   ====================================================== */
(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => distrijamEsc(s);
  const src = (p) => encodeURI(p || '');

  const io = 'IntersectionObserver' in window && !reduced
    ? new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    : null;
  const watch = (el) => (io ? io.observe(el) : el.classList.add('is-in'));
  document.querySelectorAll('.m4-reveal').forEach(watch);

  // ── Vitrina: un producto por vez sobre su foto en movimiento ──
  const HERO = [
    { id: 'hexagonal-tipo-2-chapa-perfil-con-arandela', use: 'Techos y chapa', name: 'Hexagonal tipo 2 con arandela', desc: 'Para techar chapa sobre perfil. Trae arandela de goma para que no entre agua.', short: 'Hexagonal T2' },
    { id: 'drywall-tipo-1-aguja', use: 'Construcción en seco', name: 'Drywall tipo 1 punta aguja', desc: 'Une perfiles de steel framing y durlock. Cabeza tanque, entra limpio en chapa fina.', short: 'Drywall T1' },
    { id: 'bulon-cab-redonda-cuello-cuadrado-c-tuerca', use: 'Carpintería y agro', name: 'Bulón cabeza redonda cuello cuadrado', desc: 'Con tuerca incluida. El cuello cuadrado traba en la madera y no gira al ajustar.', short: 'Bulón C.C.' },
    { id: 'tirafondo', use: 'Madera y tirantería', name: 'Tirafondo', desc: 'Cabeza hexagonal para llave. Para tirantes, decks y estructuras de madera pesada.', short: 'Tirafondo' },
    { id: 'tarugo-para-ladrillo-hueco-n-8-con-tope', use: 'Pared hueca', name: 'Tarugo para ladrillo hueco', desc: 'Se abre adentro del ladrillo y agarra donde un tarugo común gira en falso.', short: 'Tarugo hueco' },
  ];
  const IMGS = ['HEX T2', 'DRY T1 AGUJA', 'BULON CABEZ RED CCC', 'TIRAFONDO', 'TARUGO LADRILLO HUECO']
    .map((n) => `imagenes/Fotos Nuevas/${n}.png`);
  const DUR = 6500;
  const copy = $('#m4-copy');
  const slides = [...document.querySelectorAll('.m4-slide')];
  const thumbsBox = $('#m4-thumbs');
  let counts = {};
  let cur = 0;
  let timer = null;

  thumbsBox.innerHTML = HERO.map((h, n) => `
    <button type="button" class="m4-thumb" role="tab" aria-selected="${n === 0}" style="--dur:${DUR}ms" aria-label="${esc(h.name)}">
      <img src="${src(IMGS[n])}" alt="" />
      <span>${esc(h.short)}<small>${esc(h.use)}</small></span><i></i>
    </button>`).join('');
  const thumbs = [...thumbsBox.children];

  function paintCopy(h, n) {
    $('#m4-h-num').textContent = String(n + 1).padStart(2, '0');
    $('#m4-h-use').textContent = h.use;
    $('#m4-h-name').textContent = h.name;
    $('#m4-h-desc').textContent = h.desc;
    $('#m4-h-count').textContent = counts[h.id] || '—';
    $('#m4-h-link').href = `producto.html?id=${encodeURIComponent(h.id)}`;
  }

  function show(n, first) {
    const prev = slides[cur];
    if (n !== cur) {
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      setTimeout(() => prev.classList.remove('is-leaving'), 1700);
    }
    cur = n;
    // Reinicia el movimiento de la foto aunque sea la misma
    slides[n].classList.remove('is-active');
    void slides[n].offsetWidth;
    slides[n].classList.add('is-active');

    thumbs.forEach((t, k) => {
      t.setAttribute('aria-selected', 'false');
      if (k === n) { void t.offsetWidth; t.setAttribute('aria-selected', 'true'); }
    });
    if (first) paintCopy(HERO[n], n);
    else {
      copy.classList.add('is-out');
      setTimeout(() => { paintCopy(HERO[n], n); copy.classList.remove('is-out'); }, 420);
    }
    clearTimeout(timer);
    if (!reduced) timer = setTimeout(() => show((cur + 1) % HERO.length), DUR);
  }
  thumbs.forEach((t, n) => t.addEventListener('click', () => show(n)));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else show(cur); });
  show(0, true);

  // ── Guía: la imagen cambia según el paso que se lee ──
  (function guide() {
    const steps = [...document.querySelectorAll('.m4-step')];
    const imgs = [...document.querySelectorAll('.m4-guide-stage img')];
    const num = $('#m4-g-num');
    const set = (k) => {
      steps.forEach((s, i) => s.classList.toggle('is-on', i === k));
      imgs.forEach((im, i) => im.classList.toggle('is-on', i === k));
      num.textContent = String(k + 1).padStart(2, '0');
    };
    if (!('IntersectionObserver' in window)) return;
    const o = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) set(steps.indexOf(e.target)); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach((s) => o.observe(s));
  })();

  // ── Lo que sale del catálogo ──
  Promise.all([distrijamCatalogo(), distrijamCategorias()]).then(([products, cats]) => {
    products.forEach((p) => { counts[p.id] = (p.variants || []).length; });
    $('#m4-h-count').textContent = counts[HERO[cur].id] || '—';
    $('#m4-total').textContent = products.length;
    buildBento(products, cats);
    buildGrid(products, cats);
  }).catch((err) => console.error('No se pudo cargar el catálogo', err));

  function buildBento(products, cats) {
    const by = {};
    products.forEach((p) => { (by[p.category] = by[p.category] || []).push(p); });
    const ids = Object.keys(cats).filter((id) => by[id]).sort((a, b) => by[b].length - by[a].length);
    const pick = (list) => list.find((p) => p.image && p.image.includes('Fotos Nuevas')) || list.find((p) => p.image) || {};
    $('#m4-bento').innerHTML = ids.map((id, n) => {
      const cls = n === 0 ? 'is-big' : ([3, 6, 9].includes(n) ? 'is-wide' : '');
      const img = pick(by[id]).image;
      return `
      <a class="m4-tile ${cls}" href="catalogo.html?cat=${encodeURIComponent(id)}" style="--d:${(n % 5) * 0.07}s">
        <h3>${esc(cats[id].label)}</h3>
        ${img ? `<img src="${src(img)}" alt="" loading="lazy" decoding="async" />` : ''}
        <p><b aria-hidden="true">→</b>${by[id].length} ${by[id].length === 1 ? 'producto' : 'productos'}</p>
      </a>`;
    }).join('');
    document.querySelectorAll('.m4-tile').forEach(watch);
  }

  function buildGrid(products, cats) {
    const seen = new Set();
    const top = [...products]
      .filter((p) => p.image)
      .sort((a, b) => (b.variants || []).length - (a.variants || []).length)
      .filter((p) => !seen.has(p.image) && seen.add(p.image))
      .slice(0, 8);
    $('#m4-grid').innerHTML = top.map((p, n) => `
      <a class="m4-card" href="producto.html?id=${encodeURIComponent(p.id)}" style="--d:${(n % 4) * 0.07}s">
        <div class="m4-card-media"><img src="${src(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" /></div>
        <div class="m4-card-body">
          <span class="m4-card-cat">${esc(cats[p.category] ? cats[p.category].label : p.category)}</span>
          <h3 class="m4-card-name">${esc(p.name.toLowerCase())}</h3>
          <span class="m4-card-meta">${(p.variants || []).length} medidas</span>
        </div>
      </a>`).join('');
    document.querySelectorAll('.m4-card').forEach(watch);
  }
})();
