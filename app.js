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
  const icons = { success: '✓', error: '✕', info: '🔩' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || '•'}</span> ${message}`;
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

// ── Dynamic Dropdown Menu for Products ──────────────────
async function initProductDropdown() {
  const dropdownContainer = document.getElementById('dropdown-productos');
  if (!dropdownContainer) return;

  try {
    const response = await fetch('productos.json');
    if (!response.ok) throw new Error('No se pudo cargar productos.json');
    const products = await response.json();

    // Group products by category
    const categoriesMap = {
      arandelas:       { label: 'Arandelas', products: [] },
      autoperforantes: { label: 'Autoperforantes', products: [] },
      bulones:         { label: 'Bulones', products: [] },
      clavos:          { label: 'Clavos', products: [] },
      ganchos:         { label: 'Ganchos', products: [] },
      pitones:         { label: 'Pitones', products: [] },
      remaches:        { label: 'Remaches', products: [] },
      tarugos:         { label: 'Tarugos', products: [] },
      tirafondos:      { label: 'Tirafondos', products: [] },
      tuercas:         { label: 'Tuercas', products: [] },
      varillas:        { label: 'Varillas Roscadas', products: [] }
    };

    // Load custom categories from localStorage
    try {
      const customCats = JSON.parse(localStorage.getItem('distrijam_categories') || '[]');
      customCats.forEach(c => {
        if (!categoriesMap[c.id]) {
          categoriesMap[c.id] = { label: c.label, products: [] };
        }
      });
    } catch (e) {}

    // Load custom products from localStorage
    let allProducts = [...products];
    try {
      const customProds = JSON.parse(localStorage.getItem('distrijam_products') || '[]');
      allProducts = [...customProds, ...allProducts];
    } catch (e) {}

    allProducts.forEach(p => {
      if (categoriesMap[p.category]) {
        categoriesMap[p.category].products.push(p);
      }
    });

    // Generate HTML for categories and submenus
    dropdownContainer.innerHTML = Object.entries(categoriesMap)
      .map(([catId, catData]) => {
        if (catData.products.length === 0) return '';
        
        // Sort products alphabetically
        catData.products.sort((a, b) => a.name.localeCompare(b.name));

        const hasSubmenu = catData.products.length > 0;
        const linkClass = hasSubmenu ? 'dropdown-link' : 'dropdown-link no-submenu';
        const submenuHtml = hasSubmenu
          ? `<ul class="submenu">
              ${catData.products.map(p => `
                <li><a href="producto.html?id=${p.id}" class="submenu-link">${p.name}</a></li>
              `).join('')}
             </ul>`
          : '';

        return `
          <li class="dropdown-item">
            <a href="catalogo.html?cat=${catId}" class="${linkClass}">${catData.label}</a>
            ${submenuHtml}
          </li>
        `;
      }).join('');

  } catch (error) {
    console.error('Error al generar el dropdown de productos:', error);
    // Fallback static list of categories if fetch fails
    const fallbackCategories = {
      arandelas: 'Arandelas',
      autoperforantes: 'Autoperforantes',
      bulones: 'Bulones',
      clavos: 'Clavos',
      ganchos: 'Ganchos',
      pitones: 'Pitones',
      remaches: 'Remaches',
      tarugos: 'Tarugos',
      tirafondos: 'Tirafondos',
      tuercas: 'Tuercas',
      varillas: 'Varillas Roscadas'
    };
    dropdownContainer.innerHTML = Object.entries(fallbackCategories)
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
    const res = await fetch('productos.json');
    if (res.ok) catalog = await res.json();
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
  v1: { short: 'V1', name: 'Clásica',    home: 'index.html',  themeClass: null,       accent: '#C0392B', title: 'Versión 1: Clásica (oscura, roja)' },
  v2: { short: 'V2', name: 'B2B',        home: 'index2.html', themeClass: 'theme-v2', accent: '#1E3A8A', title: 'Versión 2: Corporativa B2B (pizarra y azul)' },
  v3: { short: 'V3', name: 'Industrial', home: 'index3.html', themeClass: 'theme-v3', accent: '#C2700A', title: 'Versión 3: Industrial clara (blanco y ámbar)' },
  v4: { short: 'V4', name: 'Tech',       home: 'index4.html', themeClass: 'theme-v4', accent: '#0F766E', title: 'Versión 4: Tech nocturna (carbón y turquesa)' },
  v5: { short: 'V5', name: 'Cercana',    home: 'index5.html', themeClass: 'theme-v5', accent: '#C2410C', title: 'Versión 5: Cercana (crema y terracota)' },
  v6: { short: 'V6', name: 'Showroom',   home: 'index6.html', themeClass: 'theme-v6', accent: '#C0392B', title: 'Versión 6: Showroom (blanco y rojo de marca)' }
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
  const found = Object.entries(DISTRIJAM_VERSIONS).find(([, cfg]) => cfg.home === file);
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
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

function injectVersionPillStyles() {
  if (document.getElementById('dvp-styles')) return;
  const style = document.createElement('style');
  style.id = 'dvp-styles';
  style.textContent = `
    .distrijam-version-pill{position:fixed;top:14px;right:18px;z-index:99999;
      background:rgba(15,23,42,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      border:1px solid rgba(255,255,255,.2);border-radius:50px;padding:3px 5px;
      display:inline-flex;align-items:center;gap:2px;box-shadow:0 6px 20px rgba(0,0,0,.35);
      font-family:'Inter',-apple-system,sans-serif;user-select:none;animation:dvpFade .3s ease}
    @keyframes dvpFade{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    .distrijam-version-pill .dvp-label{color:#94A3B8;font-size:.68rem;font-weight:700;
      text-transform:uppercase;letter-spacing:.08em;padding:0 8px 0 6px;white-space:nowrap}
    .distrijam-version-pill .dvp-btn{border:none;outline:none;background:transparent;color:#CBD5E1;
      font-size:.73rem;font-weight:600;padding:5px 11px;border-radius:30px;cursor:pointer;
      transition:all .2s ease;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;
      font-family:inherit}
    .distrijam-version-pill .dvp-btn:hover{color:#fff;background:rgba(255,255,255,.1)}
    .distrijam-version-pill .dvp-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
    .distrijam-version-pill .dvp-btn.active{color:#fff;font-weight:700;
      background:var(--dvp-accent,#C0392B);box-shadow:0 2px 8px rgba(0,0,0,.45)}
    .distrijam-version-pill .dvp-btn.active::before{content:'';width:5px;height:5px;background:#fff;
      border-radius:50%;display:inline-block}
    /* Con cinco versiones el nombre completo no entra: sólo lo muestra la activa */
    .distrijam-version-pill .dvp-btn .dvp-name{display:none}
    .distrijam-version-pill .dvp-btn.active .dvp-name{display:inline}
    @media (max-width:760px){
      .distrijam-version-pill .dvp-label{display:none}
      .distrijam-version-pill .dvp-btn.active .dvp-name{display:none}
      .distrijam-version-pill .dvp-btn{padding:6px 9px}
    }
    @media (max-width:640px){
      .distrijam-version-pill{top:auto;bottom:16px;right:50%;transform:translateX(50%)}
    }
    /* En las páginas compartidas la barra superior es fija y arranca en el
       tope, así que se le reserva la esquina que ocupa el selector. */
    @media (min-width:901px){
      body.catalog-page .nav-inner{padding-right:370px}
      body.admin-body .admin-header-bar{padding-right:370px}
    }
    @media (min-width:641px) and (max-width:900px){
      body.catalog-page .nav-inner{padding-right:250px}
      body.admin-body .admin-header-bar{padding-right:250px}
    }
    @media print{.distrijam-version-pill{display:none}}
  `;
  document.head.appendChild(style);
}

function initVersionSwitcher() {
  injectVersionPillStyles();

  const pageFile = currentPageFile();
  const homeVersion = versionOfHomePage(pageFile);

  // En una portada manda la portada; fuera de ella, la preferencia guardada
  let activeVer = homeVersion || localStorage.getItem('distrijam_version') || 'v1';
  if (!DISTRIJAM_VERSIONS[activeVer]) activeVer = 'v1';
  localStorage.setItem('distrijam_version', activeVer);

  if (!document.getElementById('distrijam-version-pill')) {
    const pill = document.createElement('aside');
    pill.className = 'distrijam-version-pill';
    pill.id = 'distrijam-version-pill';
    pill.setAttribute('aria-label', 'Selector de versión del sitio');
    pill.innerHTML = `
      <span class="dvp-label">Versión</span>
      ${Object.entries(DISTRIJAM_VERSIONS).map(([key, cfg]) => `
        <button type="button" class="dvp-btn" data-ver="${key}" title="${cfg.title}"
                style="--dvp-accent:${cfg.accent}">
          ${cfg.short} <span class="dvp-name">${cfg.name}</span>
        </button>
      `).join('')}
    `;
    document.body.appendChild(pill);

    pill.querySelectorAll('.dvp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ver = btn.dataset.ver;
        const cfg = DISTRIJAM_VERSIONS[ver];
        localStorage.setItem('distrijam_version', ver);

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
