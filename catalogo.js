/* ======================================================
   DISTRIJAM — catalogo.js (Products, Cart & Quote logic)
   ====================================================== */

const IMG_BASE = 'imagenes/Imagenes y tornillos para catalogo 900px';
const WA_NUMBER = '5493794007195';

// ── Default Products ─────────────────────────────────
const DEFAULT_PRODUCTS = [
  // Tuercas y Arandelas (1-8)
  { id: 1, name: 'Tuerca Hexagonal Bicromada M6', category: 'tuercas', description: 'Tuerca hexagonal galvanizada en bicromado amarillo. Alta resistencia a la corrosión. Norma DIN 934.', image: `${IMG_BASE}.jpg` },
  { id: 2, name: 'Tuerca Hexagonal Inoxidable M8', category: 'tuercas', description: 'Tuerca hexagonal en acero inoxidable A2. Ideal para ambientes húmedos y corrosivos. Norma DIN 934.', image: `${IMG_BASE}2.jpg` },
  { id: 3, name: 'Tuerca Hexagonal M10 Zincada', category: 'tuercas', description: 'Tuerca hexagonal zincada en caliente. Resistente al óxido y la corrosión.', image: `${IMG_BASE}3.jpg` },
  { id: 4, name: 'Tuerca Hexagonal M12 Negra', category: 'tuercas', description: 'Tuerca hexagonal acabado negro. Alta resistencia mecánica. Ideal para estructuras metálicas.', image: `${IMG_BASE}4.jpg` },
  { id: 5, name: 'Arandela Plana M6 Zincada', category: 'tuercas', description: 'Arandela plana zincada para distribución de carga. Compatible con tornillos M6. Norma DIN 125.', image: `${IMG_BASE}5.jpg` },
  { id: 6, name: 'Arandela de Presión M8', category: 'tuercas', description: 'Arandela de presión (grower) para evitar el aflojamiento. Acero templado zincado. M8.', image: `${IMG_BASE}6.jpg` },
  { id: 7, name: 'Tuerca Mariposa M6', category: 'tuercas', description: 'Tuerca mariposa para apriete manual. Acero zincado. Sin necesidad de herramientas.', image: `${IMG_BASE}7.jpg` },
  { id: 8, name: 'Arandela Cónica Inoxidable M10', category: 'tuercas', description: 'Arandela cónica en acero inoxidable A2. Para sellado y distribución de cargas.', image: `${IMG_BASE}8.jpg` },
  // Bulones y Tirafondos (9-16)
  { id: 9, name: 'Tirafondo Hexagonal 6×40', category: 'bulones', description: 'Tirafondo para madera con cabeza hexagonal. Acero zincado. 6×40mm. Ideal para estructuras de madera.', image: `${IMG_BASE}9.jpg` },
  { id: 10, name: 'Bulón Hexagonal M8×50 Zincado', category: 'bulones', description: 'Bulón de cabeza hexagonal M8×50mm. Acero zincado. Con tuerca y arandela. Norma DIN 933.', image: `${IMG_BASE}10.jpg` },
  { id: 11, name: 'Bulón M10×60 Inoxidable', category: 'bulones', description: 'Bulón hexagonal M10×60mm en acero inoxidable A2. Alta resistencia a la corrosión.', image: `${IMG_BASE}11.jpg` },
  { id: 12, name: 'Tirafondo Cabeza Redonda 8×70', category: 'bulones', description: 'Tirafondo con cabeza redonda para madera. Acero galvanizado. 8×70mm. Rosca gruesa para mayor agarre.', image: `${IMG_BASE}12.jpg` },
  { id: 13, name: 'Bulón M12×80 Alta Resistencia', category: 'bulones', description: 'Bulón hexagonal M12×80mm. Acero de alta resistencia clase 8.8. Bicromado amarillo.', image: `${IMG_BASE}13.jpg` },
  { id: 14, name: 'Tirafondo Hexagonal 10×100', category: 'bulones', description: 'Tirafondo pesado para madera y materiales compuestos. 10×100mm. Acero zincado.', image: `${IMG_BASE}14.jpg` },
  { id: 15, name: 'Bulón Carruaje M10×80', category: 'bulones', description: 'Bulón carruaje (cabeza redonda con cuello cuadrado). M10×80mm. Acero zincado. Norma DIN 603.', image: `${IMG_BASE}15.jpg` },
  { id: 16, name: 'Bulón Allen M8×40 Inoxidable', category: 'bulones', description: 'Bulón de cabeza Allen M8×40mm en acero inoxidable A2. Para uniones visibles de calidad.', image: `${IMG_BASE}16.jpg` },
  // Autoperforantes (17-24)
  { id: 17, name: 'Autoperforante HEX + Arandela 4.8×19', category: 'autoperforantes', description: 'Tornillo autoperforante hexagonal con arandela neoprene integrada. 4.8×19mm. Para chapas.', image: `${IMG_BASE}17.jpg` },
  { id: 18, name: 'Autoperforante Cabeza Plana 4×25', category: 'autoperforantes', description: 'Tornillo autoperforante cabeza plana con ranura Phillips. 4×25mm. Estructuras metálicas livianas.', image: `${IMG_BASE}18.jpg` },
  { id: 19, name: 'Autoperforante Wafer 4.2×13', category: 'autoperforantes', description: 'Autoperforante cabeza wafer con ranura Phillips. 4.2×13mm. Ideal para drywall y perfiles metálicos.', image: `${IMG_BASE}19.jpg` },
  { id: 20, name: 'Autoperforante Inoxidable 4.8×25', category: 'autoperforantes', description: 'Tornillo autoperforante en acero inoxidable A2. 4.8×25mm. Para ambientes corrosivos.', image: `${IMG_BASE}20.jpg` },
  { id: 21, name: 'Autoperforante HEX EPDM 5.5×32', category: 'autoperforantes', description: 'Autoperforante hexagonal con arandela EPDM para sellado. 5.5×32mm. Para techos y cerramientos.', image: `${IMG_BASE}21.jpg` },
  { id: 22, name: 'Autoperforante Cabeza Oval 3.9×25', category: 'autoperforantes', description: 'Autoperforante cabeza oval con ranura Phillips. 3.9×25mm. Acabado zincado. Láminas delgadas.', image: `${IMG_BASE}22.jpg` },
  { id: 23, name: 'Autoperforante Punta Broca 4.8×38', category: 'autoperforantes', description: 'Tornillo autoperforante tipo punta broca para acero de mayor espesor. 4.8×38mm. Bicromado.', image: `${IMG_BASE}23.jpg` },
  { id: 24, name: 'Autoperforante Madera-Metal 5×50', category: 'autoperforantes', description: 'Autoperforante para fijación de madera sobre perfiles de acero. 5×50mm. Alta resistencia.', image: `${IMG_BASE}24.jpg` },
  // Tarugos (25-32)
  { id: 25, name: 'Taco Fischer S6', category: 'tarugos', description: 'Taco de nylon S6 para pared. Acepta tornillos de 3 a 5mm. Para mampostería y hormigón.', image: `${IMG_BASE}25.jpg` },
  { id: 26, name: 'Taco Fischer S8', category: 'tarugos', description: 'Taco de nylon S8 reforzado. Para tornillos de 4 a 6mm. Alta capacidad de carga.', image: `${IMG_BASE}26.jpg` },
  { id: 27, name: 'Taco Metálico Expansor M10', category: 'tarugos', description: 'Taco metálico de expansión M10 para hormigón y mampostería. Alta capacidad de carga.', image: `${IMG_BASE}27.jpg` },
  { id: 28, name: 'Taco Químico con Varilla M10', category: 'tarugos', description: 'Taco químico de resina epóxica con varilla roscada M10. Para anclajes de alta resistencia.', image: `${IMG_BASE}28.jpg` },
  { id: 29, name: 'Taco Golpe Nylon 6×35', category: 'tarugos', description: 'Taco golpe de nylon 6×35mm. Instalación rápida. Para colgar objetos livianos.', image: `${IMG_BASE}29.jpg` },
  { id: 30, name: 'Taco Mariposa para Yeso', category: 'tarugos', description: 'Taco mariposa para placa de yeso. Hasta 25kg. Instalación desde el frente.', image: `${IMG_BASE}30.jpg` },
  { id: 31, name: 'Taco Metálico Aro M8', category: 'tarugos', description: 'Taco de expansión metálico tipo aro para hormigón. M8. Instalación a golpe.', image: `${IMG_BASE}31.jpg` },
  { id: 32, name: 'Taco Universal Nylon 10×60', category: 'tarugos', description: 'Taco universal de nylon 10×60mm. Compatible con tornillos de 6 a 8mm. Todo tipo de paredes.', image: `${IMG_BASE}32.jpg` },
];

const CATEGORIES = {
  all: { label: 'Todos', icon: '🔩' },
  autoperforantes: { label: 'Autoperforantes', icon: '🔧' },
  bulones: { label: 'Bulones y Tirafondos', icon: '⚙️' },
  tuercas: { label: 'Tuercas y Arandelas', icon: '🔩' },
  tarugos: { label: 'Tarugos', icon: '🏗️' },
};

// ── State ────────────────────────────────────────────
let products = [];
let cart = [];
let activeFilter = 'all';
let searchQuery = '';

// ── Load products (default + admin-added) ─────────────
function loadProducts() {
  const custom = JSON.parse(localStorage.getItem('distrijam_products') || '[]');
  products = [...DEFAULT_PRODUCTS, ...custom];
}

// ── Cart persistence ──────────────────────────────────
function loadCart() {
  cart = JSON.parse(sessionStorage.getItem('distrijam_cart') || '[]');
}
function saveCart() {
  sessionStorage.setItem('distrijam_cart', JSON.stringify(cart));
}
function cartTotal() { return cart.reduce((s, i) => s + i.qty, 0); }

// ── Render Filter Tabs ────────────────────────────────
function renderFilters() {
  const container = document.getElementById('filter-tabs');
  container.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const count = key === 'all' ? products.length : products.filter(p => p.category === key).length;
    const btn = document.createElement('button');
    btn.className = `filter-tab ${activeFilter === key ? 'active' : ''}`;
    btn.dataset.cat = key;
    btn.innerHTML = `${cat.label} <span class="tab-count">${count}</span>`;
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
  countEl.innerHTML = `Mostrando <strong>${filtered.length}</strong> producto${filtered.length !== 1 ? 's' : ''}`;

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
    const inCart = cart.some(c => c.id === p.id);
    const catLabel = CATEGORIES[p.category]?.label || p.category;
    return `
      <div class="product-card ${inCart ? 'added' : ''}" data-id="${p.id}">
        <div class="product-img-wrap">
          <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'><rect width=\\'200\\' height=\\'200\\' fill=\\'%23222\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23555\\' font-size=\\'40\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>🔩</text></svg>'">
          <span class="product-cat-badge">${catLabel}</span>
          <span class="product-in-cart-badge">✓</span>
        </div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description}</div>
        </div>
        <div class="product-footer">
          <button class="btn-add-cart ${inCart ? 'in-cart' : ''}" data-id="${p.id}" id="add-btn-${p.id}">
            ${inCart ? '✓ Agregado' : '+ Agregar al pedido'}
          </button>
          <button class="btn-quick-view" data-id="${p.id}" title="Ver detalle">🔍</button>
        </div>
      </div>`;
  }).join('');

  // Event delegation
  grid.querySelectorAll('.btn-add-cart').forEach(btn => {
    btn.addEventListener('click', () => toggleCart(parseInt(btn.dataset.id)));
  });
  grid.querySelectorAll('.btn-quick-view').forEach(btn => {
    btn.addEventListener('click', () => openQuickView(parseInt(btn.dataset.id)));
  });
}

// ── Cart Operations ───────────────────────────────────
function toggleCart(id) {
  const existing = cart.find(c => c.id === id);
  if (existing) {
    cart = cart.filter(c => c.id !== id);
    showToast('Producto quitado del pedido', 'info');
  } else {
    const product = products.find(p => p.id === id);
    cart.push({ id, name: product.name, image: product.image, category: product.category, qty: 1 });
    showToast('✓ Agregado al pedido', 'success');
  }
  saveCart();
  renderProducts();
  renderCart();
  updateFAB();
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  saveCart();
  renderProducts();
  renderCart();
  updateFAB();
}

function clearCart() {
  cart = [];
  saveCart();
  renderProducts();
  renderCart();
  updateFAB();
}

// ── Render Cart ───────────────────────────────────────
function renderCart() {
  const itemsEl = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const footerEl = document.getElementById('cart-footer');
  const badge = document.getElementById('cart-badge');
  const total = cartTotal();

  badge.textContent = total;
  badge.style.display = total === 0 ? 'none' : '';

  if (cart.length === 0) {
    itemsEl.innerHTML = '';
    emptyEl.style.display = 'flex';
    footerEl.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  footerEl.style.display = 'block';

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.id}">
      <img class="cart-item-img" src="${item.image}" alt="${item.name}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'48\\' height=\\'48\\'><rect width=\\'48\\' height=\\'48\\' fill=\\'%23222\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23555\\' font-size=\\'20\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>🔩</text></svg>'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
        </div>
      </div>
      <button class="cart-item-remove" data-id="${item.id}" title="Quitar">✕</button>
    </div>
  `).join('');

  // Events
  itemsEl.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      changeQty(id, btn.dataset.action === 'inc' ? 1 : -1);
    });
  });
  itemsEl.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.id)));
  });

  document.getElementById('cart-total-items').textContent = total;
  document.getElementById('cart-total-lines').textContent = cart.length;
}

function updateFAB() {
  const fab = document.getElementById('cart-fab');
  const fabBadge = document.getElementById('cart-fab-badge');
  const total = cartTotal();
  fabBadge.textContent = total;
  fabBadge.style.display = total === 0 ? 'none' : '';
}

// ── Quick View Modal ──────────────────────────────────
function openQuickView(id) {
  const p = products.find(pr => pr.id === id);
  if (!p) return;
  const catLabel = CATEGORIES[p.category]?.label || p.category;
  const inCart = cart.some(c => c.id === id);
  document.getElementById('qv-category').textContent = catLabel;
  document.getElementById('qv-name').textContent = p.name;
  document.getElementById('qv-desc').textContent = p.description;
  document.getElementById('qv-img').src = p.image;
  document.getElementById('qv-img').alt = p.name;
  const addBtn = document.getElementById('qv-add-btn');
  addBtn.textContent = inCart ? '✓ Está en tu pedido' : '+ Agregar al pedido';
  addBtn.className = `btn btn-primary ${inCart ? 'in-cart' : ''}`;
  addBtn.onclick = () => { toggleCart(id); openQuickView(id); };
  document.getElementById('qv-modal').classList.add('open');
}

// ── Quote Modal ───────────────────────────────────────
function openQuoteModal() {
  if (cart.length === 0) { showToast('Tu pedido está vacío', 'error'); return; }
  const listEl = document.getElementById('quote-product-list');
  listEl.innerHTML = cart.map(item => `
    <div class="quote-product-row">
      <span class="name">${item.name}</span>
      <span class="qty">× ${item.qty}</span>
    </div>
  `).join('');
  document.getElementById('quote-modal').classList.add('open');
}

function buildWhatsAppMessage() {
  const name = document.getElementById('quote-name').value.trim() || 'Sin nombre';
  const phone = document.getElementById('quote-phone').value.trim();
  const message = document.getElementById('quote-message').value.trim();

  let text = `🔩 *PEDIDO DE COTIZACIÓN — DISTRIJAM*\n`;
  text += `━━━━━━━━━━━━━━━━━━━\n`;
  text += `👤 *Cliente:* ${name}\n`;
  if (phone) text += `📱 *Teléfono:* ${phone}\n`;
  text += `\n📋 *Productos solicitados:*\n`;
  cart.forEach(item => {
    text += `  • ${item.name} × ${item.qty} unidades\n`;
  });
  text += `\n📦 *Total:* ${cart.length} producto${cart.length !== 1 ? 's' : ''}, ${cartTotal()} unidades`;
  if (message) text += `\n\n💬 *Nota:* ${message}`;
  text += `\n━━━━━━━━━━━━━━━━━━━`;
  return encodeURIComponent(text);
}

function sendWhatsApp() {
  const name = document.getElementById('quote-name').value.trim();
  if (!name) {
    showToast('Por favor ingresá tu nombre', 'error');
    document.getElementById('quote-name').focus();
    return;
  }
  const url = `https://wa.me/${WA_NUMBER}?text=${buildWhatsAppMessage()}`;
  window.open(url, '_blank');
  document.getElementById('quote-modal').classList.remove('open');
  showToast('¡Pedido enviado por WhatsApp! 🎉', 'success', 5000);
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  loadCart();

  // Check URL params for pre-selected category
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get('cat');
  if (catParam && CATEGORIES[catParam]) activeFilter = catParam;

  renderFilters();
  renderProducts();
  renderCart();
  updateFAB();

  // Search
  const searchInput = document.getElementById('catalog-search');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderProducts();
  });

  // Clear cart
  document.getElementById('cart-clear-btn').addEventListener('click', () => {
    if (cart.length === 0) return;
    if (confirm('¿Vaciar el pedido?')) clearCart();
  });

  // Quote button
  document.getElementById('btn-quote').addEventListener('click', openQuoteModal);
  document.getElementById('btn-quote-footer').addEventListener('click', openQuoteModal);

  // WhatsApp send
  document.getElementById('btn-send-whatsapp').addEventListener('click', sendWhatsApp);

  // Modal closes
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.closeModal).classList.remove('open');
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // Mobile FAB
  const fab = document.getElementById('cart-fab');
  const sidebar = document.querySelector('.cart-sidebar');
  fab.addEventListener('click', () => sidebar.classList.toggle('open'));

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 1024 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && e.target !== fab) {
        sidebar.classList.remove('open');
      }
    }
  });
});

// Toast (re-declared if not in app.js)
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
