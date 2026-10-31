/* ======================================================
   DISTRIJAM — admin.js (Panel de Administración)
   ====================================================== */

// La contraseña ya no está acá: la verifica el servidor contra un hash
// guardado fuera de public_html. Antes estaba escrita en este archivo, que
// cualquiera puede leer en el repositorio público.

// Lo cargado desde el panel se guarda en el servidor (api.php) y lo ven todos
// los clientes. Antes quedaba en el localStorage del navegador del
// administrador y nadie más lo veía.
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGEN = 2 * 1024 * 1024;
const MAX_IMAGENES = 4;

const esc = distrijamEsc;

// ── Sesión contra el servidor ─────────────────────────
async function estadoSesion() {
  try {
    const res = await fetch('api.php?a=estado', { cache: 'no-store' });
    return await res.json();
  } catch (e) {
    return { ok: false, logueado: false, instalado: false, sinServidor: true };
  }
}

async function login(password) {
  try {
    const res = await fetch('api.php?a=entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: password })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok === true, error: data.error || 'No se pudo entrar.' };
  } catch (e) {
    return { ok: false, error: 'No hay conexión con el servidor.' };
  }
}

async function logout() {
  try { await fetch('api.php?a=salir'); } catch (e) {}
  location.reload();
}

// ── API del catálogo ──────────────────────────────────
async function apiCatalogo(accion, datos) {
  let res;
  try {
    res = await fetch('api.php?a=' + accion, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
  } catch (e) {
    throw new Error('No hay conexión con el servidor.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('La sesión venció: volvé a entrar al panel.');
  if (!res.ok || data.ok !== true) throw new Error(data.error || 'No se pudo guardar.');
  return data;
}

// Sube las fotos nuevas (data:...) de a una y devuelve todas como URL
async function subirImagenes(lista) {
  const urls = [];
  for (const img of lista) {
    if (img.startsWith('data:')) {
      const r = await apiCatalogo('catalogo_imagen', { data: img });
      urls.push(r.url);
    } else {
      urls.push(img);
    }
  }
  return urls;
}

// ── Datos ─────────────────────────────────────────────
let PRODUCTOS_BASE = [];
let EXTRA = { productos: [], cambios: {}, categorias: [] };
let datosCargados = false;

async function cargarDatos() {
  try {
    const { base, extra } = await distrijamCatalogoCrudo(true);
    PRODUCTOS_BASE = base;
    EXTRA = extra;
    datosCargados = true;
  } catch (e) {
    console.warn('No se pudo leer el catálogo:', e);
    showToast('No se pudo leer el catálogo', 'error');
  }
  renderCategoriesList();
  renderStats();
  renderProductList(currentListFilter);
  const nota = document.getElementById('nota-base-count');
  if (nota) nota.textContent = PRODUCTOS_BASE.length;
}

function todasLasCategorias() {
  const todas = { ...DISTRIJAM_CATEGORIAS };
  EXTRA.categorias.forEach(c => { if (!todas[c.id]) todas[c.id] = c.label; });
  return todas;
}

// Lista unificada para el panel: propios primero, después los del proveedor
function itemsDelPanel() {
  const propios = EXTRA.productos.map(p => ({ ...p, source: 'custom' }));
  const base = PRODUCTOS_BASE.map(p => {
    const c = EXTRA.cambios[p.id];
    return {
      ...distrijamAplicarCambio(p, c),
      source: 'default',
      oculto: !!(c && c.oculto),
      modificado: !!(c && Object.keys(c).some(k => k !== 'oculto')),
    };
  });
  return propios.concat(base);
}

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
  cargarDatos();
}

// ── Stats ─────────────────────────────────────────────
function renderStats() {
  const ocultos = PRODUCTOS_BASE.filter(p => EXTRA.cambios[p.id] && EXTRA.cambios[p.id].oculto).length;
  const custom = EXTRA.productos;

  document.getElementById('stat-total').textContent   = PRODUCTOS_BASE.length - ocultos + custom.length;
  document.getElementById('stat-default').textContent = PRODUCTOS_BASE.length;
  document.getElementById('stat-custom').textContent  = custom.length;

  const cats = {};
  custom.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('stat-categories').textContent =
    topCat ? (todasLasCategorias()[topCat[0]] || topCat[0]) : '—';
}

// ── Product List ──────────────────────────────────────
let currentListFilter = 'all';

const IMG_VACIA = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52'><rect width='52' height='52' fill='%23222'/></svg>";

function renderProductList(filter) {
  currentListFilter = filter;
  const container = document.getElementById('admin-product-list');

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  let items = itemsDelPanel();
  if (filter === 'custom') items = items.filter(p => p.source === 'custom');
  if (filter === 'hidden') items = items.filter(p => p.oculto);

  if (items.length === 0) {
    const vacio = {
      custom: 'No hay productos personalizados aún.<br>Usá el formulario para agregar el primero.',
      hidden: 'No hay productos ocultos.',
    };
    container.innerHTML = `
      <div class="admin-empty-list">
        <div class="icon">📦</div>
        <p>${vacio[filter] || (datosCargados ? 'No hay productos que mostrar.' : 'Cargando productos...')}</p>
      </div>`;
    return;
  }

  const categorias = todasLasCategorias();
  container.innerHTML = items.map(p => {
    const esBase = p.source === 'default';
    const editando = edicion && edicion.id === p.id;
    const etiquetas = [
      esBase ? '<span class="admin-product-source default">Base</span>'
             : '<span class="admin-product-source custom">Personalizado</span>',
      p.modificado ? '<span class="admin-product-source edited">Editado</span>' : '',
      p.oculto ? '<span class="admin-product-source hidden">Oculto</span>' : '',
    ].join('');
    return `
      <div class="admin-product-row${p.oculto ? ' is-hidden' : ''}${editando ? ' is-editing' : ''}" data-id="${esc(p.id)}">
        <img class="admin-product-thumb" src="${esc(p.image || IMG_VACIA)}" alt="${esc(p.name)}" loading="lazy">
        <div class="admin-product-info">
          <div class="admin-product-name">${esc(p.name)}</div>
          <div class="admin-product-cat">
            <span class="admin-cat-dot"></span>
            ${esc(categorias[p.category] || p.category)}
            <span style="color:var(--text-muted)">· ${(p.variants || []).length} medida(s)</span>
          </div>
        </div>
        ${etiquetas}
        <div class="admin-row-actions">
          <button type="button" class="admin-edit-btn" data-id="${esc(p.id)}" title="Editar producto">✎</button>
          ${esBase
            ? `<button type="button" class="admin-hide-btn" data-id="${esc(p.id)}" title="${p.oculto ? 'Mostrar en el sitio' : 'Ocultar del sitio'}">${p.oculto ? '↺' : '👁'}</button>`
            : `<button type="button" class="admin-delete-btn" data-id="${esc(p.id)}" title="Eliminar producto">✕</button>`}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.admin-product-thumb').forEach(img => {
    img.addEventListener('error', () => { img.src = IMG_VACIA; }, { once: true });
  });
  container.querySelectorAll('.admin-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => empezarEdicion(btn.dataset.id));
  });
  container.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => borrarProducto(btn.dataset.id));
  });
  container.querySelectorAll('.admin-hide-btn').forEach(btn => {
    btn.addEventListener('click', () => alternarOculto(btn.dataset.id));
  });
}

async function borrarProducto(id) {
  const p = EXTRA.productos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.name}" del catálogo?`)) return;
  try {
    await apiCatalogo('catalogo_producto_borrar', { id });
    if (edicion && edicion.id === id) resetForm();
    showToast('Producto eliminado', 'info');
    await cargarDatos();
  } catch (e) {
    showToast(esc(e.message), 'error');
  }
}

async function alternarOculto(id) {
  const c = EXTRA.cambios[id];
  const ocultar = !(c && c.oculto);
  try {
    await apiCatalogo('catalogo_base', { id, oculto: ocultar });
    showToast(ocultar ? 'Producto oculto del sitio' : 'Producto visible otra vez', 'info');
    await cargarDatos();
  } catch (e) {
    showToast(esc(e.message), 'error');
  }
}

// ── Image Upload ──────────────────────────────────────
// Cada foto es una URL ya guardada en el servidor o un data: recién elegido
let selectedImages = [];

function initImageUpload() {
  const fileInput = document.getElementById('product-image-input');

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    fileInput.value = '';
    if (!files.length) return;

    if (selectedImages.length + files.length > MAX_IMAGENES) {
      showToast('Podés subir hasta 4 imágenes en total', 'error');
      return;
    }

    files.forEach(file => {
      if (!TIPOS_IMAGEN.includes(file.type)) {
        showToast(`${esc(file.name)} no es una imagen JPG, PNG, WEBP o GIF`, 'error');
        return;
      }
      if (file.size > MAX_IMAGEN) {
        showToast(`La imagen ${esc(file.name)} supera los 2MB`, 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        if (selectedImages.length >= MAX_IMAGENES) return;
        selectedImages.push(e.target.result);
        renderGallery();
      };
      reader.readAsDataURL(file);
    });
  });
}

function renderGallery() {
  const gallery     = document.getElementById('upload-gallery');
  const placeholder = document.getElementById('upload-placeholder');

  gallery.innerHTML = '';
  placeholder.style.display = selectedImages.length === 0 ? 'block' : 'none';

  selectedImages.forEach((src, index) => {
    const item = document.createElement('div');
    item.className = `upload-gallery-item ${index === 0 ? 'main-img' : ''}`;

    const img = document.createElement('img');
    img.src = src;

    const btn = document.createElement('button');
    btn.className = 'remove-img-btn';
    btn.textContent = '✕';
    btn.type = 'button';
    btn.title = 'Eliminar imagen';
    btn.onclick = (e) => {
      e.stopPropagation();
      selectedImages.splice(index, 1);
      renderGallery();
    };

    item.appendChild(img);
    item.appendChild(btn);
    gallery.appendChild(item);
  });
}

// ── Variants Logic ────────────────────────────────────
function initVariants() {
  document.getElementById('btn-add-variant').addEventListener('click', () => addVariantRow());
  addVariantRow();
}

function addVariantRow(v = {}) {
  const container = document.getElementById('variants-container');
  const row = document.createElement('div');
  row.className = 'variant-row';

  row.innerHTML = `
    <input type="text" class="form-input variant-codigo" maxlength="40" placeholder="Código (opcional)" />
    <input type="text" class="form-input variant-medida" maxlength="80" placeholder="Medida (Ej: Estándar, Largo, M8...)" required />
    <input type="text" class="form-input variant-presentacion" maxlength="80" list="presentacion-list" placeholder="Presentación (Ej: Caja x 100 U.)" required />
    <button type="button" class="remove-variant-btn" title="Eliminar medida">✕</button>
  `;
  row.querySelector('.variant-codigo').value = v.codigo || '';
  row.querySelector('.variant-medida').value = v.medida || '';
  row.querySelector('.variant-presentacion').value = v.presentacion || '';

  row.querySelector('.remove-variant-btn').addEventListener('click', () => {
    if (container.children.length > 1) {
      row.remove();
    } else {
      showToast('Debe haber al menos una medida', 'error');
    }
  });

  container.appendChild(row);
}

// ── Alta y edición ────────────────────────────────────
// null: alta de un producto nuevo. { tipo: 'custom'|'base', id }: edición.
let edicion = null;

function empezarEdicion(id) {
  const item = itemsDelPanel().find(p => p.id === id);
  if (!item) return;
  resetForm(false);
  edicion = { tipo: item.source === 'custom' ? 'custom' : 'base', id };

  document.getElementById('product-name').value = item.name;
  document.getElementById('product-category').value = item.category;
  document.getElementById('product-desc').value = item.description || '';
  selectedImages = (item.images && item.images.length ? item.images : [item.image]).filter(Boolean).slice(0, MAX_IMAGENES);
  renderGallery();

  const container = document.getElementById('variants-container');
  container.innerHTML = '';
  if (edicion.tipo === 'custom') {
    item.variants.forEach(v => addVariantRow({
      // Los códigos generados (id-del-producto-N) se dejan vacíos: se regeneran
      codigo: v.id.startsWith(item.id + '-') ? '' : v.id,
      medida: v.medida,
      presentacion: v.presentacion,
    }));
  } else {
    addVariantRow();
  }

  document.getElementById('variants-group').style.display = edicion.tipo === 'base' ? 'none' : '';
  document.getElementById('images-required').style.display = edicion.tipo === 'base' ? 'none' : '';
  document.getElementById('product-form-title').textContent = 'Editar Producto';
  document.getElementById('btn-submit-product').textContent = '✓ Guardar cambios';
  const banner = document.getElementById('edit-banner');
  banner.style.display = 'block';
  banner.innerHTML = edicion.tipo === 'base'
    ? `Editando <strong>${esc(item.name)}</strong> (del proveedor). Las medidas y precios siguen viniendo de la planilla. Dejá un campo vacío para volver al original. <a href="#" id="cancel-edit">Cancelar</a>`
    : `Editando <strong>${esc(item.name)}</strong>. <a href="#" id="cancel-edit">Cancelar</a>`;
  document.getElementById('cancel-edit').addEventListener('click', (e) => { e.preventDefault(); resetForm(); });

  renderProductList(currentListFilter);
  const form = document.getElementById('add-product-form');
  if (form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let guardando = false;

async function handleAddProduct(e) {
  e.preventDefault();
  if (guardando) return;

  const name     = document.getElementById('product-name').value.trim();
  const category = document.getElementById('product-category').value;
  const desc     = document.getElementById('product-desc').value.trim();
  const esBase   = edicion && edicion.tipo === 'base';

  if (!name && !esBase) { showToast('Ingresá el nombre del producto', 'error'); return; }
  if (!category)        { showToast('Seleccioná una categoría', 'error'); return; }
  if (selectedImages.length === 0 && !esBase) { showToast('Seleccioná al menos una imagen', 'error'); return; }

  const variants = [];
  let hasVariantError = false;
  if (!esBase) {
    document.querySelectorAll('.variant-row').forEach(row => {
      const codigo = row.querySelector('.variant-codigo').value.trim();
      const medida = row.querySelector('.variant-medida').value.trim();
      const presentacion = row.querySelector('.variant-presentacion').value.trim();
      if (!medida || !presentacion) hasVariantError = true;
      else variants.push({ codigo, medida, presentacion });
    });
    if (hasVariantError || variants.length === 0) {
      showToast('Completá los campos de todas las medidas', 'error');
      return;
    }
    const codigos = variants.map(v => v.codigo).filter(Boolean);
    if (new Set(codigos).size !== codigos.length) {
      showToast('Hay códigos de medida repetidos', 'error');
      return;
    }
  }

  const boton = document.getElementById('btn-submit-product');
  const textoBoton = boton.textContent;
  guardando = true;
  boton.disabled = true;
  boton.textContent = 'Guardando…';

  try {
    const images = await subirImagenes(selectedImages);
    if (esBase) {
      // El servidor descarta lo que coincide con el original
      const original = PRODUCTOS_BASE.find(p => p.id === edicion.id) || {};
      await apiCatalogo('catalogo_base', {
        id: edicion.id,
        name: name || original.name,
        category,
        description: desc,
        images,
      });
      showToast(`✓ "${esc(name || original.name)}" actualizado`, 'success');
    } else {
      const r = await apiCatalogo('catalogo_producto', {
        id: edicion ? edicion.id : '',
        name,
        category,
        description: desc,
        images,
        variants,
      });
      showToast(r.nuevo ? `✓ "${esc(name)}" agregado al catálogo` : `✓ "${esc(name)}" actualizado`, 'success');
    }
    resetForm();
    await cargarDatos();
  } catch (err) {
    showToast(esc(err.message), 'error');
  } finally {
    guardando = false;
    boton.disabled = false;
    if (boton.textContent === 'Guardando…') boton.textContent = textoBoton;
  }
}

function resetForm(enfocar = true) {
  edicion = null;
  document.getElementById('add-product-form').reset();
  selectedImages = [];
  renderGallery();

  document.getElementById('variants-container').innerHTML = '';
  addVariantRow();

  document.getElementById('variants-group').style.display = '';
  document.getElementById('images-required').style.display = '';
  document.getElementById('product-form-title').textContent = 'Agregar Producto al Catálogo';
  document.getElementById('btn-submit-product').textContent = '+ Agregar al Catálogo';
  document.getElementById('edit-banner').style.display = 'none';
  renderProductList(currentListFilter);

  if (enfocar) document.getElementById('product-name').focus();
}

// ── Toast ─────────────────────────────────────────────
// El mensaje se inserta como HTML: quien lo llama escapa lo que venga de datos
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
  const custom = EXTRA.categorias;
  const elegida = select.value;

  select.innerHTML = '<option value="">Seleccioná una categoría</option>' +
    Object.entries(DISTRIJAM_CATEGORIAS).map(([key, label]) =>
      `<option value="${esc(key)}">${esc(label)}</option>`).join('') +
    (custom.length
      ? `<optgroup label="Personalizadas">${custom.map(c =>
          `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</optgroup>`
      : '');
  select.value = elegida;

  if (custom.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim); font-size:0.85rem; padding:10px;">No hay categorías personalizadas.</div>';
    return;
  }

  container.innerHTML = custom.map(c => `
    <div style="display:flex; align-items:center; gap:10px; background:var(--bg-card-2); padding:10px; border-radius:var(--radius); border:1px solid var(--border);">
      <img src="${esc(c.image)}" alt="${esc(c.label)}" style="width:32px; height:32px; object-fit:contain; border-radius:4px; background:white; padding:2px;" />
      <span style="flex:1; font-weight:600; color:var(--white);">${esc(c.label)}</span>
      <button type="button" class="btn btn-secondary delete-cat-btn" data-id="${esc(c.id)}" style="padding:4px 8px; font-size:0.8rem; border-color:var(--red); color:var(--red);">✕ Eliminar</button>
    </div>
  `).join('');

  container.querySelectorAll('.delete-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta categoría?')) return;
      try {
        await apiCatalogo('catalogo_categoria_borrar', { id: btn.dataset.id });
        showToast('Categoría eliminada', 'info');
        await cargarDatos();
      } catch (e) {
        showToast(esc(e.message), 'error', 6000);
      }
    });
  });
}

function leerComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

async function handleAddCategory(e) {
  e.preventDefault();
  const nameInput = document.getElementById('cat-name-input');
  const fileInput = document.getElementById('cat-image-input');
  const name = nameInput.value.trim();
  const file = fileInput.files[0];

  if (!name) { showToast('Ingresá el nombre de la categoría', 'error'); return; }
  if (!file) { showToast('Elegí una imagen para la categoría', 'error'); return; }
  if (!TIPOS_IMAGEN.includes(file.type)) { showToast('La imagen tiene que ser JPG, PNG, WEBP o GIF', 'error'); return; }
  if (file.size > MAX_IMAGEN) { showToast('La imagen es muy pesada (máx. 2MB)', 'error'); return; }

  try {
    const [image] = await subirImagenes([await leerComoDataUrl(file)]);
    await apiCatalogo('catalogo_categoria', { label: name, image });
    showToast('Categoría creada', 'success');
    nameInput.value = '';
    fileInput.value = '';
    await cargarDatos();
  } catch (err) {
    showToast(esc(err.message), 'error');
  }
}


// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restos del ABM viejo, que guardaba en este navegador
  localStorage.removeItem('distrijam_products');
  localStorage.removeItem('distrijam_categories');

  renderCategoriesList();

  document.getElementById('add-category-form').addEventListener('submit', handleAddCategory);

  // Sesión existente
  const errEl = document.getElementById('login-error');
  estadoSesion().then(estado => {
    if (estado.logueado) {
      showDashboard();
      document.dispatchEvent(new CustomEvent('distrijam:sesion-lista'));
    } else {
      showLogin();
      if (estado.sinServidor) {
        errEl.textContent = 'No hay conexión con el servidor.';
        errEl.style.display = 'block';
      } else if (!estado.instalado) {
        errEl.textContent = 'El panel todavía no está configurado en el servidor.';
        errEl.style.display = 'block';
      }
    }
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const campo = document.getElementById('login-password');
    const boton = e.target.querySelector('button[type=submit]');
    if (boton) { boton.disabled = true; boton.textContent = 'Entrando…'; }

    const r = await login(campo.value);

    if (boton) { boton.disabled = false; boton.textContent = 'Ingresar →'; }

    if (r.ok) {
      errEl.style.display = 'none';
      showDashboard();
      document.dispatchEvent(new CustomEvent('distrijam:sesion-lista'));
    } else {
      errEl.textContent = r.error;
      errEl.style.display = 'block';
      campo.value = '';
      campo.focus();
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
  document.getElementById('btn-reset-form').addEventListener('click', () => resetForm());

  // Link to catalog
  document.getElementById('view-catalog-btn').addEventListener('click', () => {
    window.open('catalogo.html', '_blank');
  });
});
