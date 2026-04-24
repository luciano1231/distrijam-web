/* ======================================================
   DISTRIJAM — admin.js (Panel de Administración)
   ====================================================== */

const ADMIN_PASSWORD = 'distrijam2024';
const STORAGE_KEY    = 'distrijam_products';
const AUTH_KEY       = 'distrijam_auth';

const CATEGORIES_MAP = {
  autoperforantes: 'Autoperforantes',
  bulones:         'Bulones y Tirafondos',
  tuercas:         'Tuercas y Arandelas',
  tarugos:         'Tarugos',
};

// ── Auth ─────────────────────────────────────────────
function isAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === 'true';
}
function login(password) {
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, 'true');
    return true;
  }
  return false;
}
function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  showLogin();
}

// ── Products (custom ones only) ───────────────────────
function getCustomProducts() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}
function saveCustomProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}
function addProduct(product) {
  const products = getCustomProducts();
  const newProduct = {
    ...product,
    id: Date.now(),
    source: 'custom',
    createdAt: new Date().toISOString(),
  };
  products.push(newProduct);
  saveCustomProducts(products);
  return newProduct;
}
function deleteProduct(id) {
  const products = getCustomProducts().filter(p => p.id !== id);
  saveCustomProducts(products);
}

// ── Default products count (from catalog.js definition) ──
const DEFAULT_COUNT = 32;

// ── UI: Show/hide ─────────────────────────────────────
function showLogin() {
  document.getElementById('admin-login').style.display = 'flex';
  document.getElementById('admin-dashboard').style.display = 'none';
}
function showDashboard() {
  document.getElementById('admin-login').style.display = 'none';
  document.getElementById('admin-dashboard').style.display = 'block';
  renderStats();
  renderProductList('all');
}

// ── Stats ─────────────────────────────────────────────
function renderStats() {
  const custom = getCustomProducts();
  const total  = DEFAULT_COUNT + custom.length;

  document.getElementById('stat-total').textContent    = total;
  document.getElementById('stat-default').textContent  = DEFAULT_COUNT;
  document.getElementById('stat-custom').textContent   = custom.length;

  const cats = {};
  custom.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
  const topCat = Object.entries(cats).sort((a,b) => b[1]-a[1])[0];
  document.getElementById('stat-categories').textContent = topCat
    ? CATEGORIES_MAP[topCat[0]] || topCat[0]
    : '—';
}

// ── Product List ──────────────────────────────────────
let currentListFilter = 'all';

function renderProductList(filter) {
  currentListFilter = filter;
  const container = document.getElementById('admin-product-list');
  const custom     = getCustomProducts();

  // Update tab states
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  let items = [];
  if (filter === 'all') {
    // Show custom products first, then note about default
    items = custom.map(p => ({ ...p, source: 'custom' }));
  } else if (filter === 'custom') {
    items = custom.map(p => ({ ...p, source: 'custom' }));
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="admin-empty-list">
        <div class="icon">📦</div>
        <p>${filter === 'custom'
          ? 'No hay productos personalizados aún.<br>Usá el formulario para agregar el primero.'
          : 'No hay productos que mostrar.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map(p => {
    const catLabel = CATEGORIES_MAP[p.category] || p.category;
    const imgSrc   = p.image || '';
    return `
      <div class="admin-product-row" data-id="${p.id}">
        <img class="admin-product-thumb" src="${imgSrc}" alt="${p.name}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'52\\' height=\\'52\\'><rect width=\\'52\\' height=\\'52\\' fill=\\'%23222\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23555\\' font-size=\\'24\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>🔩</text></svg>'">
        <div class="admin-product-info">
          <div class="admin-product-name">${p.name}</div>
          <div class="admin-product-cat">
            <span class="admin-cat-dot"></span>
            ${catLabel}
            ${p.createdAt ? `<span style="color:var(--text-muted)">· ${new Date(p.createdAt).toLocaleDateString('es-AR')}</span>` : ''}
          </div>
        </div>
        <span class="admin-product-source custom">Personalizado</span>
        <button class="admin-delete-btn" data-id="${p.id}" title="Eliminar producto">✕</button>
      </div>`;
  }).join('');

  // Delete events
  container.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      if (confirm('¿Eliminar este producto del catálogo?')) {
        deleteProduct(id);
        renderStats();
        renderProductList(currentListFilter);
        showToast('Producto eliminado', 'info');
      }
    });
  });
}

// ── Image Upload ──────────────────────────────────────
let selectedImageBase64 = null;

function initImageUpload() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput  = document.getElementById('product-image-input');
  const preview    = document.getElementById('upload-preview');

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen no debe superar 2MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedImageBase64 = e.target.result;
      preview.src = selectedImageBase64;
      uploadArea.classList.add('has-image');
    };
    reader.readAsDataURL(file);
  });
}

// ── Form Submit ───────────────────────────────────────
function handleAddProduct(e) {
  e.preventDefault();
  const name     = document.getElementById('product-name').value.trim();
  const category = document.getElementById('product-category').value;
  const desc     = document.getElementById('product-desc').value.trim();

  if (!name)    { showToast('Ingresá el nombre del producto', 'error'); return; }
  if (!category){ showToast('Seleccioná una categoría', 'error'); return; }
  if (!selectedImageBase64) { showToast('Seleccioná una imagen del producto', 'error'); return; }

  const product = addProduct({
    name,
    category,
    description: desc || `${name}. Consultá disponibilidad y medidas.`,
    image: selectedImageBase64,
  });

  showToast(`✓ "${name}" agregado al catálogo`, 'success');
  renderStats();
  renderProductList(currentListFilter);
  resetForm();
}

function resetForm() {
  document.getElementById('add-product-form').reset();
  selectedImageBase64 = null;
  document.getElementById('upload-area').classList.remove('has-image');
  document.getElementById('upload-preview').src = '';
  document.getElementById('product-name').focus();
}

// ── Toast ─────────────────────────────────────────────
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

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Check existing session
  if (isAuthenticated()) {
    showDashboard();
  } else {
    showLogin();
  }

  // Login form
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pwd = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    if (login(pwd)) {
      errEl.style.display = 'none';
      showDashboard();
    } else {
      errEl.style.display = 'block';
      document.getElementById('login-password').value = '';
      document.getElementById('login-password').focus();
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Add product form
  document.getElementById('add-product-form').addEventListener('submit', handleAddProduct);

  // List filter tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => renderProductList(tab.dataset.filter));
  });

  // Image upload
  initImageUpload();

  // Reset form button
  document.getElementById('btn-reset-form').addEventListener('click', resetForm);

  // Link to catalog
  document.getElementById('view-catalog-btn').addEventListener('click', () => {
    window.open('catalogo.html', '_blank');
  });
});
