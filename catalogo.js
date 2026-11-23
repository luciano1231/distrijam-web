/* ======================================================
   DISTRIJAM — catalogo.js (Catalog Only)
   ====================================================== */

const IMG_BASE = 'imagenes/Imagenes y tornillos para catalogo 900px';

// Categorías base y las creadas desde el panel (las completa loadProducts)
let categorias = { all: { label: 'Todos' } };

function getAllCategories() {
  return categorias;
}

// ── State ────────────────────────────────────────────
let products = [];
let activeFilter = 'all';
let activeSubFilter = 'all';
let searchQuery = '';

// ── Load products ─────────────────────────────────────
async function loadProducts() {
  try {
    const [lista, cats] = await Promise.all([distrijamCatalogo(), distrijamCategorias()]);
    products = lista;
    categorias = { all: { label: 'Todos' }, ...cats };
  } catch (error) {
    console.error("Error al cargar los productos:", error);
    products = [];
    categorias = { all: { label: 'Todos' } };
    Object.entries(DISTRIJAM_CATEGORIAS).forEach(([id, label]) => { categorias[id] = { label }; });
  }
}

// ── Render Filter Tabs ────────────────────────────────
function renderFilters() {
  const container = document.getElementById('filter-tabs');
  container.innerHTML = '';
  const allCategories = getAllCategories();
  
  Object.entries(allCategories).forEach(([key, cat]) => {
    const count = key === 'all' ? products.length : products.filter(p => p.category === key).length;
    const btn = document.createElement('button');
    // is-empty permite que cada tema atenúe las categorías sin productos
    btn.className = `filter-tab ${activeFilter === key ? 'active' : ''} ${count === 0 ? 'is-empty' : ''}`.trim();
    btn.dataset.cat = key;
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(activeFilter === key));
    
    // Render icon or custom image
    let iconHtml = '';
    if (cat.image) {
      iconHtml = `<img src="${distrijamEsc(cat.image)}" alt="${distrijamEsc(cat.label)}" class="cat-logo" style="width:20px; height:20px; object-fit:contain; border-radius:4px; vertical-align:middle; margin-right:4px;" />`;
    } else {
      iconHtml = cat.icon ? `${cat.icon} ` : '';
    }
    
    btn.innerHTML = `${iconHtml}${distrijamEsc(cat.label)} <span class="tab-count">${count}</span>`;
    btn.addEventListener('click', () => {
      activeFilter = key;
      activeSubFilter = 'all';
      renderFilters();
      renderSubFilters();
      renderProducts();
    });
    container.appendChild(btn);
  });

  // En los temas que muestran los filtros como un riel horizontal, la categoría
  // activa puede quedar fuera de la vista al llegar desde ?cat=
  const active = container.querySelector('.filter-tab.active');
  if (active && container.scrollWidth > container.clientWidth) {
    active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

// ── Render Subcategory Filter Tabs (Autoperforantes TEL) ──
function renderSubFilters() {
  const subContainer = document.getElementById('subfilter-tabs');
  if (!subContainer) return;

  if (activeFilter !== 'autoperforantes' || typeof DISTRIJAM_AUTOPERFORANTES_GRUPOS === 'undefined') {
    subContainer.style.display = 'none';
    subContainer.innerHTML = '';
    return;
  }

  const autoProducts = products.filter(p => p.category === 'autoperforantes');
  const counts = {};
  autoProducts.forEach(p => {
    const g = distrijamGrupoAutoperforante(p);
    if (g) counts[g.id] = (counts[g.id] || 0) + 1;
  });

  const activeGroups = DISTRIJAM_AUTOPERFORANTES_GRUPOS.filter(g => counts[g.id] > 0);
  if (!activeGroups.length) {
    subContainer.style.display = 'none';
    subContainer.innerHTML = '';
    return;
  }

  subContainer.style.display = 'flex';
  subContainer.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `subfilter-tab ${activeSubFilter === 'all' ? 'active' : ''}`.trim();
  allBtn.dataset.sub = 'all';
  allBtn.innerHTML = `Todas las líneas <span class="tab-count">${autoProducts.length}</span>`;
  allBtn.addEventListener('click', () => {
    activeSubFilter = 'all';
    renderSubFilters();
    renderProducts();
  });
  subContainer.appendChild(allBtn);

  activeGroups.forEach(g => {
    const count = counts[g.id] || 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `subfilter-tab ${activeSubFilter === g.id ? 'active' : ''}`.trim();
    btn.dataset.sub = g.id;
    btn.innerHTML = `${distrijamEsc(g.label)} <span class="tab-count">${count}</span>`;
    btn.addEventListener('click', () => {
      activeSubFilter = g.id;
      renderSubFilters();
      renderProducts();
    });
    subContainer.appendChild(btn);
  });

  const activeBtn = subContainer.querySelector('.subfilter-tab.active');
  if (activeBtn && subContainer.scrollWidth > subContainer.clientWidth) {
    activeBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

// ── Render Products ───────────────────────────────────
function getFilteredProducts() {
  let list = activeFilter === 'all' ? products : products.filter(p => p.category === activeFilter);

  if (activeFilter === 'autoperforantes' && activeSubFilter !== 'all' && typeof distrijamGrupoAutoperforante === 'function') {
    list = list.filter(p => {
      const g = distrijamGrupoAutoperforante(p);
      return g && g.id === activeSubFilter;
    });
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => {
      const g = typeof distrijamGrupoAutoperforante === 'function' ? distrijamGrupoAutoperforante(p) : null;
      return p.name.toLowerCase().includes(q)
        || (p.description || '').toLowerCase().includes(q)
        || (g && g.label.toLowerCase().includes(q));
    });
  }

  // En Autoperforantes ordenamos según el orden de familias TEL de la imagen
  if (activeFilter === 'autoperforantes' && typeof DISTRIJAM_AUTOPERFORANTES_GRUPOS !== 'undefined') {
    const orderMap = new Map(DISTRIJAM_AUTOPERFORANTES_GRUPOS.map((g, idx) => [g.id, idx]));
    list = [...list].sort((a, b) => {
      const ga = distrijamGrupoAutoperforante(a);
      const gb = distrijamGrupoAutoperforante(b);
      const ia = ga && orderMap.has(ga.id) ? orderMap.get(ga.id) : 999;
      const ib = gb && orderMap.has(gb.id) ? orderMap.get(gb.id) : 999;
      if (ia !== ib) return ia - ib;
      return a.name.localeCompare(b.name, 'es');
    });
  }

  return list;
}

function renderProductCard(p) {
  const inCart = p.variants && p.variants.some(v => typeof cart !== 'undefined' && cart.some(c => c.variantId === v.id));
  const allCategories = getAllCategories();
  const autoGroup = (p.category === 'autoperforantes' && typeof distrijamGrupoAutoperforante === 'function')
    ? distrijamGrupoAutoperforante(p)
    : null;
  const catLabel = autoGroup ? autoGroup.label : (allCategories[p.category]?.label || p.category);

  return `
    <a href="producto.html?id=${encodeURIComponent(p.id)}" class="product-card ${inCart ? 'added' : ''}" style="text-decoration:none; color:inherit; display:flex; flex-direction:column;">
      <div class="product-img-wrap">
        <img src="${distrijamEsc(p.image)}" alt="${distrijamEsc(p.name)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect width=%22200%22 height=%22200%22 fill=%22%23222%22/><g fill=%22none%22 stroke=%22%23555%22 stroke-width=%221.2%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 transform=%22translate(72 72) scale(2.33333)%22><rect width=%2218%22 height=%2218%22 x=%223%22 y=%223%22 rx=%222%22/><circle cx=%229%22 cy=%229%22 r=%222%22/><path d=%22m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21%22/></g></svg>'">
        <span class="product-cat-badge">${distrijamEsc(catLabel)}</span>
        ${inCart ? '<span class="product-in-cart-badge"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>' : ''}
      </div>
      <div class="product-body" style="flex:1;">
        <div class="product-name">${distrijamEsc(p.name)}</div>
        <div class="product-desc">${distrijamEsc(p.description)}</div>
      </div>
      <div class="product-footer">
        <span class="btn-add-cart btn-select-variant" style="width:100%; display:block; text-align:center;">
          Ver opciones de medida
        </span>
      </div>
    </a>`;
}

function renderProducts() {
  const grid = document.getElementById('product-grid');
  const countEl = document.getElementById('catalog-count');
  const filtered = getFilteredProducts();
  
  if (countEl) countEl.innerHTML = `Mostrando <strong>${filtered.length}</strong> producto${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <div class="empty-icon"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
        <h3>No se encontraron productos</h3>
        <p>Intentá con otra categoría o término de búsqueda.</p>
      </div>`;
    return;
  }

  // Si estamos viendo todos los Autoperforantes, los agrupamos visualmente por línea TEL
  if (activeFilter === 'autoperforantes' && activeSubFilter === 'all' && !searchQuery && typeof distrijamGrupoAutoperforante === 'function') {
    let html = '';
    let lastGroupId = null;
    filtered.forEach(p => {
      const g = distrijamGrupoAutoperforante(p);
      const gid = g ? g.id : 'otros';
      const glabel = g ? g.label : 'OTROS AUTOPERFORANTES';
      if (gid !== lastGroupId) {
        lastGroupId = gid;
        const groupCount = filtered.filter(x => {
          const gx = distrijamGrupoAutoperforante(x);
          return (gx ? gx.id : 'otros') === gid;
        }).length;
        html += `
          <div class="catalog-group-header">
            <span class="catalog-group-title">${distrijamEsc(glabel)}</span>
            <span class="catalog-group-count">${groupCount} ${groupCount === 1 ? 'producto' : 'productos'}</span>
          </div>`;
      }
      html += renderProductCard(p);
    });
    grid.innerHTML = html;
    return;
  }

  grid.innerHTML = filtered.map(renderProductCard).join('');
}

// ── Init Catalog ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();

  // Check URL params for pre-selected category, subcategory, or search query
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get('cat');
  if (catParam && categorias[catParam]) activeFilter = catParam;

  const subParam = urlParams.get('sub');
  if (subParam && activeFilter === 'autoperforantes') {
    activeSubFilter = subParam;
  }

  const searchInput = document.getElementById('catalog-search');
  const qParam = urlParams.get('q');
  if (qParam) {
    searchQuery = qParam;
    if (searchInput) searchInput.value = qParam;
  }

  renderFilters();
  renderSubFilters();
  renderProducts();

  // Search input listener
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      renderProducts();
    });
  }
});
