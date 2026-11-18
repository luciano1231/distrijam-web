/* ======================================================
   DISTRIJAM — app.js (shared logic)
   ====================================================== */

// ── Navigation scroll effect ──────────────────────────
const nav = document.querySelector('.nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// ── Mobile hamburger ──────────────────────────────────
const hamburger = document.getElementById('nav-hamburger');
const mobileMenu = document.getElementById('nav-mobile');
if (hamburger && mobileMenu) {
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.setAttribute('aria-controls', 'nav-mobile');

  const setMenu = (open) => {
    mobileMenu.classList.toggle('open', open);
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  };

  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(!mobileMenu.classList.contains('open'));
  });

  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setMenu(false));
  });

  document.addEventListener('click', (e) => {
    if (!mobileMenu.contains(e.target) && !hamburger.contains(e.target)) setMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
}

// ── Toast notifications ───────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const ico = d => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const icons = {
    success: ico('<path d="M20 6 9 17l-5-5"/>'),
    error: ico('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    info: ico('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>')
  };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ── Intersection Observer for scroll animations ───────
(function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  const show = (el) => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sin soporte del observador o con animaciones reducidas, se muestra todo
  if (reducedMotion || !('IntersectionObserver' in window)) {
    items.forEach(show);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        show(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  items.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(32px)';
    el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    observer.observe(el);
  });

  // Red de seguridad: si el observador nunca dispara, el contenido igual aparece
  setTimeout(() => {
    items.forEach(el => {
      if (el.style.opacity === '0') show(el);
    });
  }, 2500);
})();

// ── Active nav link ───────────────────────────────────
const currentPage = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-link[data-page]').forEach(link => {
  if (link.dataset.page === currentPage) link.classList.add('active');
});

// ── Catálogo compartido ───────────────────────────────
// El catálogo es productos.json (lo genera la planilla del proveedor) más lo
// que se carga desde el panel, que el servidor entrega en api.php?a=catalogo:
// productos propios, cambios sobre los del proveedor y categorías nuevas.
// Todas las páginas lo leen por acá para ver lo mismo.
const DISTRIJAM_CATEGORIAS = {
  arandelas:         'Arandelas',
  autoperforantes:   'Autoperforantes',
  bulones:           'Bulones',
  ganchos:           'Ganchos',
  pitones:           'Pitones',
  'remaches-clavos': 'Remaches y Clavos',
  tarugos:           'Tarugos',
  tirafondos:        'Tirafondos',
  tuercas:           'Tuercas',
  varillas:          'Varillas Roscadas',
};

function distrijamEsc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let _distrijamCrudo = null;

// { base: productos.json, extra: { productos, cambios, categorias } }
function distrijamCatalogoCrudo(recargar = false) {
  if (!_distrijamCrudo || recargar) {
    _distrijamCrudo = Promise.all([
      fetch('productos.json').then(r => {
        if (!r.ok) throw new Error('No se pudo cargar productos.json');
        return r.json();
      }),
      // Sin servidor (vista previa local) el catálogo sigue andando con lo base
      fetch('api.php?a=catalogo', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([base, extra]) => ({
      base: Array.isArray(base) ? base : [],
      extra: {
        productos: Array.isArray(extra && extra.productos) ? extra.productos : [],
        cambios: (extra && extra.cambios && typeof extra.cambios === 'object') ? extra.cambios : {},
        categorias: Array.isArray(extra && extra.categorias) ? extra.categorias : [],
      },
    }));
    _distrijamCrudo.catch(() => { _distrijamCrudo = null; });
  }
  return _distrijamCrudo;
}

// Un producto del proveedor con los cambios hechos desde el panel
function distrijamAplicarCambio(p, c) {
  if (!c) return p;
  const imagenes = Array.isArray(c.images) && c.images.length ? c.images : null;
  return {
    ...p,
    name: c.name || p.name,
    category: c.category || p.category,
    description: c.description || p.description,
    image: imagenes ? imagenes[0] : p.image,
    images: imagenes || p.images,
  };
}

function distrijamCombinar({ base, extra }, { incluirOcultos = false } = {}) {
  const lista = [];
  base.forEach(p => {
    const c = extra.cambios[p.id];
    if (c && c.oculto && !incluirOcultos) return;
    lista.push(distrijamAplicarCambio(p, c));
  });
  extra.productos.forEach(p => lista.push(p));
  return lista.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// Productos visibles en el sitio
async function distrijamCatalogo(opciones) {
  return distrijamCombinar(await distrijamCatalogoCrudo(), opciones);
}

// { id: { label, image? } } con las categorías base y las creadas en el panel
async function distrijamCategorias() {
  const { extra } = await distrijamCatalogoCrudo();
  const todas = {};
  Object.entries(DISTRIJAM_CATEGORIAS).forEach(([id, label]) => { todas[id] = { label }; });
  extra.categorias.forEach(c => {
    if (!todas[c.id]) todas[c.id] = { label: c.label, image: c.image };
  });
  return todas;
}

// ── Dynamic Dropdown Menu for Products ──────────────────
async function initProductDropdown() {
  const dropdownContainer = document.getElementById('dropdown-productos');
  if (!dropdownContainer) return;

  try {
    const [products, categorias] = await Promise.all([distrijamCatalogo(), distrijamCategorias()]);

    const porCategoria = {};
    products.forEach(p => {
      if (categorias[p.category]) (porCategoria[p.category] = porCategoria[p.category] || []).push(p);
    });

    dropdownContainer.innerHTML = Object.entries(categorias)
      .filter(([catId]) => porCategoria[catId])
      .map(([catId, cat]) => `
          <li class="dropdown-item">
            <a href="catalogo.html?cat=${encodeURIComponent(catId)}" class="dropdown-link">${distrijamEsc(cat.label)}</a>
            <ul class="submenu">
              ${porCategoria[catId].map(p => `
                <li><a href="producto.html?id=${encodeURIComponent(p.id)}" class="submenu-link">${distrijamEsc(p.name)}</a></li>
              `).join('')}
            </ul>
          </li>
        `).join('');

  } catch (error) {
    console.error('Error al generar el dropdown de productos:', error);
    dropdownContainer.innerHTML = Object.entries(DISTRIJAM_CATEGORIAS)
      .map(([catId, label]) => `
        <li class="dropdown-item">
          <a href="catalogo.html?cat=${catId}" class="dropdown-link no-submenu">${label}</a>
        </li>
      `).join('');
  }
}

// ── Buscador de portada con sugerencias ───────────────
// Compartido por todas las versiones: requiere #hero-search-input y #search-suggestions
async function initHeroSearch() {
  const input = document.getElementById('hero-search-input');
  const box = document.getElementById('search-suggestions');
  if (!input || !box) return;

  let catalog = [];
  try {
    catalog = await distrijamCatalogo();
  } catch (err) {
    console.warn('No se pudo precargar productos para la búsqueda:', err);
  }

  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  let activeIndex = -1;

  const close = () => {
    box.style.display = 'none';
    box.innerHTML = '';
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
  };

  const render = () => {
    const query = input.value.trim().toLowerCase();
    if (query.length < 2) return close();

    const matches = catalog.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.category && p.category.toLowerCase().includes(query)) ||
      (p.variants || []).some(v => (v.medida || '').toLowerCase().includes(query))
    ).slice(0, 6);

    if (matches.length === 0) {
      box.innerHTML = `<div class="suggestion-empty">Sin coincidencias directas. Presioná “Buscar” para ver todo el catálogo.</div>`;
    } else {
      box.innerHTML = matches.map((p, i) => `
        <a class="suggestion-item" role="option" data-index="${i}"
           href="producto.html?id=${encodeURIComponent(p.id)}">
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <div class="suggestion-meta">${escapeHtml(p.variants && p.variants[0] ? p.variants[0].medida : '')}</div>
          </div>
          <span class="suggestion-cat">${escapeHtml(p.category || '')}</span>
        </a>
      `).join('');
    }
    box.style.display = 'block';
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'true');
  };

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) render(); });

  // Navegación por teclado dentro de las sugerencias
  input.addEventListener('keydown', (e) => {
    const items = [...box.querySelectorAll('.suggestion-item')];
    if (!items.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = e.key === 'ArrowDown'
        ? (activeIndex + 1) % items.length
        : (activeIndex - 1 + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      window.location.href = items[activeIndex].href;
    } else if (e.key === 'Escape') {
      close();
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !box.contains(e.target)) close();
  });
}

// ── Año dinámico en el footer ─────────────────────────
function initDynamicYear() {
  document.querySelectorAll('[data-current-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initProductDropdown();
  initVersionSwitcher();
  initHeroSearch();
  initBackToTop();
  initDynamicYear();
});

// ── Universal Version Switcher (V1 a V4) ──────────────
const DISTRIJAM_VERSIONS = {
  m1: { short: 'M1', name: 'Portal E-Commerce', home: 'modelos/index-m1.html', themeClass: 'theme-m1', accent: '#D92D20', title: 'Nuevo Modelo M1: Portal Comercial B2B & Vitrina en Vivo' },
  m2: { short: 'M2', name: 'Dark Inmersivo', home: 'modelos/index-m2.html', themeClass: 'theme-m2', accent: '#E11D48', title: 'Nuevo Modelo M2: Corporativo Inmersivo en Pizarra y Cristal' },
  m3: { short: 'M3', name: 'Cine', home: 'modelos/index-m3.html', themeClass: 'theme-m2', accent: '#D92D20', title: 'Nuevo Modelo M3: Cine (productos primero, fotos en movimiento)' },
  m4: { short: 'M4', name: 'Vitrina', home: 'modelos/index-m4.html', themeClass: 'theme-m1', accent: '#D92D20', title: 'Nuevo Modelo M4: Vitrina (claro, un producto protagonista por vez)' },
  m5: { short: 'M5', name: 'Muro', home: 'modelos/index-m5.html', themeClass: 'theme-m2', accent: '#E5352A', title: 'Nuevo Modelo M5: Muro (muro de fotos y explorador de productos)' },
  v1: { short: 'V1', name: 'Clásica',   home: 'index.html',  themeClass: null,       accent: '#C0392B', title: 'Versión 1: Clásica (oscura, roja)' },
  v2: { short: 'V2', name: 'B2B',        home: 'index2.html', themeClass: 'theme-v2', accent: '#1E3A8A', title: 'Versión 2: Corporativa B2B (pizarra y azul)' },
  v3: { short: 'V3', name: 'Industrial', home: 'index3.html', themeClass: 'theme-v3', accent: '#C2700A', title: 'Versión 3: Industrial clara (blanco y ámbar)' },
  v4: { short: 'V4', name: 'Tech',       home: 'index4.html', themeClass: 'theme-v4', accent: '#0F766E', title: 'Versión 4: Tech nocturna (carbón y turquesa)' },
  v5: { short: 'V5', name: 'Cercana',    home: 'index5.html', themeClass: 'theme-v5', accent: '#C2410C', title: 'Versión 5: Cercana (crema y terracota)' },
  v6: { short: 'V6', name: 'Showroom',   home: 'index6.html', themeClass: 'theme-v6', accent: '#C0392B', title: 'Versión 6: Showroom (blanco y rojo de marca)' },
  g1: { short: 'G1', name: 'Titanium',   home: 'index-g1.html', themeClass: 'theme-g1', accent: '#F59E0B', title: 'Modelo G1: Titanium Forge & Luxury Dark' },
  g2: { short: 'G2', name: 'Nordic',     home: 'index-g2.html', themeClass: 'theme-g2', accent: '#1D4ED8', title: 'Modelo G2: Nordic Clean & Neo-Cobalt' },
  g3: { short: 'G3', name: 'Apex',       home: 'index-g3.html', themeClass: 'theme-g3', accent: '#E11D48', title: 'Modelo G3: Apex Obsidian & Precision Crimson' }
};

const DISTRIJAM_ALL_THEME_CLASSES = Object.values(DISTRIJAM_VERSIONS)
  .map(v => v.themeClass)
  .filter(Boolean);

const DISTRIJAM_ALL_HOMES = Object.values(DISTRIJAM_VERSIONS).map(v => v.home);

function currentPageFile() {
  const file = window.location.pathname.split('/').pop();
  return file === '' ? 'index.html' : file;
}

function versionOfHomePage(file) {
  // Los modelos nuevos viven en /modelos/: se compara sólo el nombre del archivo
  const found = Object.entries(DISTRIJAM_VERSIONS).find(([, cfg]) => cfg.home.split('/').pop() === file);
  return found ? found[0] : null;
}

// Aplica el tema sin pintar la versión anterior: se usa también antes del DOMContentLoaded
function applyDistrijamTheme(ver) {
  const cfg = DISTRIJAM_VERSIONS[ver] || DISTRIJAM_VERSIONS.v1;
  const root = document.documentElement;
  const body = document.body;

  DISTRIJAM_ALL_THEME_CLASSES.forEach(cls => {
    root.classList.remove(cls);
    if (body) body.classList.remove(cls);
  });

  if (cfg.themeClass) {
    root.classList.add(cfg.themeClass);
    if (body) body.classList.add(cfg.themeClass);
  }

  root.dataset.distrijamVersion = ver;

  // Los enlaces al inicio apuntan al home de la versión activa
  const homeSelector = DISTRIJAM_ALL_HOMES.map(h => `a[href="${h}"]`).join(', ');
  document.querySelectorAll(homeSelector).forEach(link => {
    if (link.closest('.distrijam-version-pill')) return;
    if (link.dataset.keepHref === 'true') return;
    link.href = cfg.home;
  });

  // Los anclajes de secciones internas también siguen a la versión activa
  document.querySelectorAll('a[data-home-anchor]').forEach(link => {
    link.href = `${cfg.home}#${link.dataset.homeAnchor}`;
  });

  document.querySelectorAll('.dvp-btn').forEach(btn => {
    const isActive = btn.dataset.ver === ver;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'true' : 'false');
  });

  // El botoncito muestra sólo la versión activa ("V1")
  const toggle = document.querySelector('.distrijam-version-pill .dvp-toggle');
  if (toggle) {
    toggle.textContent = cfg.short;
    toggle.title = `Versión: ${cfg.short} ${cfg.name} — tocá para cambiar`;
  }
}

function injectVersionPillStyles() {
  if (document.getElementById('dvp-styles')) return;
  const style = document.createElement('style');
  style.id = 'dvp-styles';
  // Un puntito casi invisible en la esquina de abajo a la izquierda, por
  // debajo de "volver arriba": no compite con la página y al tocarlo
  // despliega la lista de versiones.
  style.textContent = `
    .distrijam-version-pill{position:fixed;left:4px;bottom:4px;z-index:99999;
      font-family:'Inter',-apple-system,sans-serif;user-select:none}
    .distrijam-version-pill .dvp-toggle{position:relative;width:16px;height:16px;padding:0;border:0;
      background:transparent;cursor:pointer;font-size:0;color:transparent;display:block}
    .distrijam-version-pill .dvp-toggle::after{content:'';position:absolute;left:5px;top:5px;
      width:6px;height:6px;border-radius:50%;background:#94A3B8;opacity:.18;
      transition:opacity .2s ease,transform .2s ease}
    .distrijam-version-pill .dvp-toggle:hover::after,
    .distrijam-version-pill .dvp-toggle:focus-visible::after,
    .distrijam-version-pill.open .dvp-toggle::after{opacity:.8;transform:scale(1.3)}
    .distrijam-version-pill .dvp-toggle:focus-visible{outline:1px solid #94A3B8;outline-offset:0;border-radius:50%}
    .distrijam-version-pill .dvp-menu{position:absolute;left:4px;bottom:22px;min-width:170px;
      background:rgba(15,23,42,.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:5px;
      box-shadow:0 10px 28px rgba(0,0,0,.4);display:none;flex-direction:column;gap:2px}
    .distrijam-version-pill.open .dvp-menu{display:flex}
    .distrijam-version-pill .dvp-btn{border:none;background:transparent;color:#CBD5E1;
      font-size:.75rem;font-weight:600;padding:7px 10px;border-radius:7px;cursor:pointer;
      display:flex;align-items:center;gap:8px;white-space:nowrap;text-align:left;font-family:inherit}
    .distrijam-version-pill .dvp-btn:hover{color:#fff;background:rgba(255,255,255,.08)}
    .distrijam-version-pill .dvp-btn:focus-visible{outline:2px solid #fff;outline-offset:-2px}
    .distrijam-version-pill .dvp-btn::before{content:'';width:7px;height:7px;border-radius:50%;
      background:var(--dvp-accent,#C0392B);flex-shrink:0}
    .distrijam-version-pill .dvp-btn.active{color:#fff;font-weight:700;background:rgba(255,255,255,.1)}
    .distrijam-version-pill .dvp-btn .dvp-short{color:#94A3B8;min-width:20px}
    .distrijam-version-pill .dvp-btn.active .dvp-short{color:#fff}
    @media print{.distrijam-version-pill{display:none}}
  `;
  document.head.appendChild(style);
}

function initVersionSwitcher() {
  injectVersionPillStyles();

  const pageFile = currentPageFile();
  const homeVersion = versionOfHomePage(pageFile);

  // En una portada manda la portada; fuera de ella, la preferencia guardada
  const urlVer = new URLSearchParams(window.location.search).get('ver');
  let activeVer = urlVer || homeVersion || localStorage.getItem('distrijam_version') || 'v1';
  if (!DISTRIJAM_VERSIONS[activeVer]) activeVer = 'v1';
  localStorage.setItem('distrijam_version', activeVer);

  if (!document.getElementById('distrijam-version-pill')) {
    const pill = document.createElement('aside');
    pill.className = 'distrijam-version-pill';
    pill.id = 'distrijam-version-pill';
    pill.setAttribute('aria-label', 'Selector de versión del sitio');
    pill.innerHTML = `
      <button type="button" class="dvp-toggle" aria-haspopup="true" aria-expanded="false"
              aria-controls="dvp-menu" title="Cambiar versión del sitio"></button>
      <div class="dvp-menu" id="dvp-menu" role="menu">
        ${Object.entries(DISTRIJAM_VERSIONS).map(([key, cfg]) => `
          <button type="button" class="dvp-btn" role="menuitem" data-ver="${key}" title="${cfg.title}"
                  style="--dvp-accent:${cfg.accent}">
            <span class="dvp-short">${cfg.short}</span> ${cfg.name}
          </button>
        `).join('')}
      </div>
    `;
    document.body.appendChild(pill);

    const toggle = pill.querySelector('.dvp-toggle');
    const abrir = (si) => {
      pill.classList.toggle('open', si);
      toggle.setAttribute('aria-expanded', String(si));
    };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      abrir(!pill.classList.contains('open'));
    });
    document.addEventListener('click', (e) => {
      if (!pill.contains(e.target)) abrir(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && pill.classList.contains('open')) {
        abrir(false);
        toggle.focus();
      }
    });

    pill.querySelectorAll('.dvp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ver = btn.dataset.ver;
        const cfg = DISTRIJAM_VERSIONS[ver];
        localStorage.setItem('distrijam_version', ver);
        abrir(false);

        // En una portada se navega a la portada de esa versión; en páginas
        // compartidas (catálogo, producto, admin) sólo se cambia el tema.
        if (versionOfHomePage(currentPageFile())) {
          window.location.href = cfg.home;
        } else {
          applyDistrijamTheme(ver);
          if (typeof showToast === 'function') {
            showToast(`Cambiado a ${cfg.short} ${cfg.name}`, 'success');
          }
        }
      });
    });
  }

  applyDistrijamTheme(activeVer);
}

// ── Botón volver arriba ───────────────────────────────
function initBackToTop() {
  if (document.getElementById('dj-back-to-top')) return;

  const style = document.createElement('style');
  style.textContent = `
    #dj-back-to-top{position:fixed;left:20px;bottom:20px;z-index:9990;width:44px;height:44px;
      border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(15,23,42,.9);
      color:#fff;display:grid;place-items:center;cursor:pointer;opacity:0;visibility:hidden;
      transform:translateY(10px);transition:opacity .25s ease,transform .25s ease,visibility .25s;
      box-shadow:0 6px 18px rgba(0,0,0,.3)}
    #dj-back-to-top.show{opacity:1;visibility:visible;transform:translateY(0)}
    #dj-back-to-top:hover{background:#0F172A}
    @media print{#dj-back-to-top{display:none}}
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'dj-back-to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Volver arriba');
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);

  window.addEventListener('scroll', () => {
    btn.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });
}
