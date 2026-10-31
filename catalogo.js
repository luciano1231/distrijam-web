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
    btn.addEventListener('click', () => { activeFilter = key; renderFilters(); renderProducts(); });
    container.appendChild(btn);
  });

  // En los temas que muestran los filtros como un riel horizontal, la categoría
  // activa puede quedar fuera de la vista al llegar desde ?cat=
  const active = container.querySelector('.filter-tab.active');
  if (active && container.scrollWidth > container.clientWidth) {
    active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}

// ── Render Products ───────────────────────────────────
function getFilteredProducts() {
  let list = activeFilter === 'all' ? products : products.filter(p => p.category === activeFilter);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  }
  return list;
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

  grid.innerHTML = filtered.map(p => {
    // Un producto está "en carrito" si alguna de sus variantes lo está
    // 'cart' array is globally available from cart.js
    const inCart = p.variants && p.variants.some(v => typeof cart !== 'undefined' && cart.some(c => c.variantId === v.id));
    const allCategories = getAllCategories();
    const catLabel = allCategories[p.category]?.label || p.category;
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
  }).join('');
}

// ── Init Catalog ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();

  // Check URL params for pre-selected category or search query
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get('cat');
  if (catParam && categorias[catParam]) activeFilter = catParam;

  const searchInput = document.getElementById('catalog-search');
  const qParam = urlParams.get('q');
  if (qParam) {
    searchQuery = qParam;
    if (searchInput) searchInput.value = qParam;
  }

  renderFilters();
  renderProducts();

  // Search input listener
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      renderProducts();
    });
  }
});
