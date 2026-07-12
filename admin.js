/* ======================================================
   DISTRIJAM — admin.js (Panel de Administración)
   ====================================================== */

const ADMIN_PASSWORD = 'distrijam2024';
const STORAGE_KEY    = 'distrijam_products';
const AUTH_KEY       = 'distrijam_auth';

const CATEGORIES_MAP = {
  arandelas:       'Arandelas',
  autoperforantes: 'Autoperforantes',
  bulones:         'Bulones',
  clavos:          'Clavos',
  ganchos:         'Ganchos',
  pitones:         'Pitones',
  remaches:        'Remaches',
  tarugos:         'Tarugos',
  tirafondos:      'Tirafondos',
  tuercas:         'Tuercas',
  varillas:        'Varillas Roscadas',
};

// ── Categories (Dynamic) ──────────────────────────────
function getCustomCategories() {
  return JSON.parse(localStorage.getItem('distrijam_categories') || '[]');
}
function saveCustomCategories(cats) {
  localStorage.setItem('distrijam_categories', JSON.stringify(cats));
}
function getAllCategories() {
  const custom = getCustomCategories();
  const all = { ...CATEGORIES_MAP };
  custom.forEach(c => {
    all[c.id] = c.label;
  });
  return all;
}

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
  const customCats = getCustomCategories();
  const catLabel = getAllCategories()[topCat[0]] || topCat[0];
  document.getElementById('stat-categories').textContent = topCat ? catLabel : '—';
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

  const allCategories = getAllCategories();
  container.innerHTML = items.map(p => {
    const catLabel = allCategories[p.category] || p.category;
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
let selectedImagesBase64 = [];

function initImageUpload() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput  = document.getElementById('product-image-input');
  const gallery    = document.getElementById('upload-gallery');
  const placeholder = document.getElementById('upload-placeholder');

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    if (!files.length) return;
    
    // Check max limit (4 images)
    if (selectedImagesBase64.length + files.length > 4) {
      showToast('Podés subir hasta 4 imágenes en total', 'error');
      return;
    }

    files.forEach(file => {
      if (file.size > 2 * 1024 * 1024) {
        showToast(`La imagen ${file.name} supera los 2MB`, 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        selectedImagesBase64.push(e.target.result);
        renderGallery();
      };
      reader.readAsDataURL(file);
    });
    
    // Reset file input so same file can be selected again if needed
    fileInput.value = '';
  });
}

function renderGallery() {
  const gallery    = document.getElementById('upload-gallery');
  const placeholder = document.getElementById('upload-placeholder');
  
  gallery.innerHTML = '';
  
  if (selectedImagesBase64.length === 0) {
    placeholder.style.display = 'block';
    return;
  }
  
  placeholder.style.display = 'none';
  
  selectedImagesBase64.forEach((base64, index) => {
    const isMain = index === 0;
    const item = document.createElement('div');
    item.className = `upload-gallery-item ${isMain ? 'main-img' : ''}`;
    
    const img = document.createElement('img');
    img.src = base64;
    
    const btn = document.createElement('button');
    btn.className = 'remove-img-btn';
    btn.innerHTML = '✕';
    btn.type = 'button';
    btn.title = 'Eliminar imagen';
    btn.onclick = (e) => {
      e.stopPropagation();
      selectedImagesBase64.splice(index, 1);
      renderGallery();
    };
    
    item.appendChild(img);
    item.appendChild(btn);
    gallery.appendChild(item);
  });
}

// ── Variants Logic ────────────────────────────────────
function initVariants() {
  const btnAddVariant = document.getElementById('btn-add-variant');
  btnAddVariant.addEventListener('click', () => addVariantRow());
  
  // Agregar una variante vacía por defecto
  addVariantRow();
}

function addVariantRow() {
  const container = document.getElementById('variants-container');
  const row = document.createElement('div');
  row.className = 'variant-row';
  
  row.innerHTML = `
    <input type="text" class="form-input variant-medida" placeholder="Medida (Ej: Estándar, Largo, M8...)" required />
    <input type="text" class="form-input variant-presentacion" list="presentacion-list" placeholder="Presentación (Ej: Caja x 100 U.)" required />
    <button type="button" class="remove-variant-btn" title="Eliminar medida">✕</button>
  `;
  
  row.querySelector('.remove-variant-btn').addEventListener('click', () => {
    if (container.children.length > 1) {
      row.remove();
    } else {
      showToast('Debe haber al menos una medida', 'error');
    }
  });
  
  container.appendChild(row);
}

// ── Form Submit ───────────────────────────────────────
function handleAddProduct(e) {
  e.preventDefault();
  const name     = document.getElementById('product-name').value.trim();
  const category = document.getElementById('product-category').value;
  const desc     = document.getElementById('product-desc').value.trim();

  if (!name)    { showToast('Ingresá el nombre del producto', 'error'); return; }
  if (!category){ showToast('Seleccioná una categoría', 'error'); return; }
  if (selectedImagesBase64.length === 0) { showToast('Seleccioná al menos una imagen', 'error'); return; }

  // Recopilar variantes
  const variantRows = document.querySelectorAll('.variant-row');
  const variants = [];
  
  // Generar ID base para el producto
  const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  const finalId = `${baseId}-${Date.now().toString().slice(-4)}`; // para evitar colisiones
  
  let hasVariantError = false;
  variantRows.forEach((row, index) => {
    const medida = row.querySelector('.variant-medida').value.trim();
    const presentacion = row.querySelector('.variant-presentacion').value.trim();
    
    if (!medida || !presentacion) {
      hasVariantError = true;
    } else {
      variants.push({
        id: `${finalId}-${index + 1}`,
        medida,
        presentacion,
        descripcion: `${name} ${medida}`
      });
    }
  });

  if (hasVariantError || variants.length === 0) {
    showToast('Completá los campos de todas las medidas', 'error');
    return;
  }

  const product = addProduct({
    id: finalId, // override del id numérico por defecto
    name,
    category,
    description: desc || `${name}. Consultá disponibilidad y medidas.`,
    image: selectedImagesBase64[0], // fallback para compatibilidad
    images: selectedImagesBase64,
    variants: variants
  });

  showToast(`✓ "${name}" agregado al catálogo`, 'success');
  renderStats();
  renderProductList(currentListFilter);
  resetForm();
}

function resetForm() {
  document.getElementById('add-product-form').reset();
  selectedImagesBase64 = [];
  renderGallery();
  
  const variantsContainer = document.getElementById('variants-container');
  variantsContainer.innerHTML = '';
  addVariantRow();
  
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

// ── Category Management ───────────────────────────────
function renderCategoriesList() {
  const select = document.getElementById('product-category');
  const container = document.getElementById('admin-category-list');
  const custom = getCustomCategories();
  
  // Re-build select
  select.innerHTML = '<option value="">Seleccioná una categoría</option>';
  Object.entries(CATEGORIES_MAP).forEach(([key, label]) => {
    select.innerHTML += `<option value="${key}">${label}</option>`;
  });
  
  if (custom.length > 0) {
    select.innerHTML += `<optgroup label="Personalizadas"></optgroup>`;
    const group = select.querySelector('optgroup');
    custom.forEach(c => {
      group.innerHTML += `<option value="${c.id}">${c.label}</option>`;
    });
  }

  // Build List
  if (custom.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim); font-size:0.85rem; padding:10px;">No hay categorías personalizadas.</div>';
    return;
  }
  
  container.innerHTML = custom.map(c => `
    <div style="display:flex; align-items:center; gap:10px; background:var(--bg-card-2); padding:10px; border-radius:var(--radius); border:1px solid var(--border);">
      <img src="${c.image}" alt="${c.label}" style="width:32px; height:32px; object-fit:contain; border-radius:4px; background:white; padding:2px;" />
      <span style="flex:1; font-weight:600; color:var(--white);">${c.label}</span>
      <button type="button" class="btn btn-secondary delete-cat-btn" data-id="${c.id}" style="padding:4px 8px; font-size:0.8rem; border-color:var(--red); color:var(--red);">✕ Eliminar</button>
    </div>
  `).join('');
  
  container.querySelectorAll('.delete-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if(confirm('¿Eliminar esta categoría? Los productos que la usan seguirán existiendo pero su categoría podría no verse bien.')) {
        const id = btn.dataset.id;
        saveCustomCategories(getCustomCategories().filter(c => c.id !== id));
        renderCategoriesList();
      }
    });
  });
}

function handleAddCategory(e) {
  e.preventDefault();
  const nameInput = document.getElementById('cat-name-input');
  const fileInput = document.getElementById('cat-image-input');
  
  const name = nameInput.value.trim();
  const file = fileInput.files[0];
  
  if(!name || !file) return;
  if(file.size > 2*1024*1024) { showToast('La imagen es muy pesada', 'error'); return; }
  
  const reader = new FileReader();
  reader.onload = (ev) => {
    const cats = getCustomCategories();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if(cats.find(c => c.id === id) || CATEGORIES_MAP[id]) {
      showToast('Ya existe una categoría con ese nombre', 'error');
      return;
    }
    cats.push({ id, label: name, image: ev.target.result });
    saveCustomCategories(cats);
    showToast('Categoría creada', 'success');
    nameInput.value = '';
    fileInput.value = '';
    renderCategoriesList();
  };
  reader.readAsDataURL(file);
}


// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderCategoriesList();
  
  document.getElementById('add-category-form').addEventListener('submit', handleAddCategory);

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
  
  // Variants
  initVariants();

  // Reset form button
  document.getElementById('btn-reset-form').addEventListener('click', resetForm);

  // Link to catalog
  document.getElementById('view-catalog-btn').addEventListener('click', () => {
    window.open('catalogo.html', '_blank');
  });
});
