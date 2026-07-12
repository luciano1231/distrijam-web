/* ======================================================
   DISTRIJAM — catalogo.js (Catalog Only)
   ====================================================== */

const IMG_BASE = 'imagenes/Imagenes y tornillos para catalogo 900px';

const CATEGORIES = {
  all: { label: 'Todos', icon: '🔩' },
  arandelas: { label: 'Arandelas', icon: '⭕' },
  autoperforantes: { label: 'Autoperforantes', icon: '🔧' },
  bulones: { label: 'Bulones', icon: '⚙️' },
  clavos: { label: 'Clavos', icon: '📍' },
  ganchos: { label: 'Ganchos', icon: '🪝' },
  pitones: { label: 'Pitones', icon: '⚓' },
  remaches: { label: 'Remaches', icon: '🔩' },
  tarugos: { label: 'Tarugos', icon: '🏗️' },
  tirafondos: { label: 'Tirafondos', icon: '🔩' },
  tuercas: { label: 'Tuercas', icon: '🔩' },
  varillas: { label: 'Varillas Roscadas', icon: '📏' }
};

function getCustomCategories() {
  return JSON.parse(localStorage.getItem('distrijam_categories') || '[]');
}

function getAllCategories() {
  const custom = getCustomCategories();
  const all = { ...CATEGORIES };
  custom.forEach(c => {
    all[c.id] = { label: c.label, image: c.image };
  });
  return all;
}

// ── State ────────────────────────────────────────────
let products = [];
let activeFilter = 'all';
let searchQuery = '';

// ── Load products ─────────────────────────────────────
async function loadProducts() {
  try {
    const response = await fetch('productos.json');
    if (!response.ok) throw new Error('No se pudo cargar productos.json');
    products = await response.json();
  } catch (error) {
    console.error("Error al cargar los productos:", error);
    products = []; 
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
    btn.className = `filter-tab ${activeFilter === key ? 'active' : ''}`;
    btn.dataset.cat = key;
    
    // Render icon or custom image
    let iconHtml = '';
    if (cat.image) {
      iconHtml = `<img src="${cat.image}" alt="${cat.label}" class="cat-logo" style="width:20px; height:20px; object-fit:contain; border-radius:4px; vertical-align:middle; margin-right:4px;" />`;
    } else {
      iconHtml = cat.icon ? `${cat.icon} ` : '';
    }
    
    btn.innerHTML = `${iconHtml}${cat.label} <span class="tab-count">${count}</span>`;
    btn.addEventListener('click', () => { activeFilter = key; renderFilters(); renderProducts(); });
    container.appendChild(btn);
  });
}

// ── Render Products ───────────────────────────────────
function getFilteredProducts() {
  let list = activeFilter === 'all' ? products : products.filter(p => p.category === activeFilter);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
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
        <div class="empty-icon">🔍</div>
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
      <a href="producto.html?id=${p.id}" class="product-card ${inCart ? 'added' : ''}" style="text-decoration:none; color:inherit; display:flex; flex-direction:column;">
        <div class="product-img-wrap">
          <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect width=%22200%22 height=%22200%22 fill=%22%23222%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23555%22 font-size=%2240%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>🔩</text></svg>'">
          <span class="product-cat-badge">${catLabel}</span>
          ${inCart ? '<span class="product-in-cart-badge">✓</span>' : ''}
        </div>
        <div class="product-body" style="flex:1;">
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description}</div>
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

  // Check URL params for pre-selected category
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get('cat');
  if (catParam && CATEGORIES[catParam]) activeFilter = catParam;

  renderFilters();
  renderProducts();

  // Search
  const searchInput = document.getElementById('catalog-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      renderProducts();
    });
  }
});
