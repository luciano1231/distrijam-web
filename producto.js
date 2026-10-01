/* ======================================================
   DISTRIJAM — producto.js
   ====================================================== */

let currentProduct = null;

async function loadProductData() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    showError();
    return;
  }

  try {
    const response = await fetch('productos.json');
    if (!response.ok) throw new Error('Network error');
    const products = await response.json();
    
    currentProduct = products.find(p => p.id === productId);
    
    if (currentProduct) {
      renderProduct(currentProduct);
    } else {
      showError();
    }
  } catch (error) {
    console.error("Error loading product:", error);
    showError();
  }
}

/* Todas las fichas compartían el título "Detalle del Producto" y la misma
   descripción, así que para Google eran páginas iguales. Acá cada producto
   pone su nombre, medidas y categoría en el título, la descripción y el
   enlace canónico, más la ruta Inicio › Catálogo › Producto. */
function actualizarSeoProducto(p, categoria) {
  const base = 'https://distrijam.com.ar/';
  const url = base + 'producto.html?id=' + encodeURIComponent(p.id);
  const medidas = (p.variants || []).map(v => v.medida).filter(Boolean);
  const resumenMedidas = medidas.length
    ? ` Medidas: ${medidas.slice(0, 8).join(', ')}${medidas.length > 8 ? ' y más' : ''}.`
    : '';
  const desc = `${p.name} — ${categoria} por mayor en Distrijam, Corrientes.${resumenMedidas} Pedí cotización por WhatsApp.`;

  document.title = `${p.name} | ${categoria} — Distrijam`;

  const ponerMeta = (selector, crear, valor) => {
    let el = document.head.querySelector(selector);
    if (!el) { el = crear(); document.head.appendChild(el); }
    el.setAttribute(el.tagName === 'LINK' ? 'href' : 'content', valor);
  };
  const meta = (attr, nombre) => () => {
    const m = document.createElement('meta');
    m.setAttribute(attr, nombre);
    return m;
  };

  ponerMeta('meta[name="description"]', meta('name', 'description'), desc);
  ponerMeta('link[rel="canonical"]', () => {
    const l = document.createElement('link');
    l.rel = 'canonical';
    return l;
  }, url);
  ponerMeta('meta[property="og:title"]', meta('property', 'og:title'), document.title);
  ponerMeta('meta[property="og:description"]', meta('property', 'og:description'), desc);
  ponerMeta('meta[property="og:url"]', meta('property', 'og:url'), url);
  if (p.image) ponerMeta('meta[property="og:image"]', meta('property', 'og:image'), base + p.image);

  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: base },
      { '@type': 'ListItem', position: 2, name: 'Catálogo', item: base + 'catalogo.html' },
      { '@type': 'ListItem', position: 3, name: p.name, item: url }
    ]
  });
  document.head.appendChild(ld);
}

function showError() {
  document.getElementById('product-loading').style.display = 'none';
  document.getElementById('product-error').style.display = 'block';
  // Un id que no existe no debe quedar en Google como página vacía
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex';
  document.head.appendChild(robots);
}

function renderProduct(p) {
  document.getElementById('product-loading').style.display = 'none';
  document.getElementById('product-container').style.display = 'block';

  // Fallback to p.image if p.images array doesn't exist
  const images = (p.images && p.images.length > 0) ? p.images : [p.image];
  
  const mainImageEl = document.getElementById('prod-image');
  mainImageEl.src = images[0];
  mainImageEl.alt = p.name;
  
  // Render thumbnails if multiple
  const thumbsContainer = document.getElementById('prod-thumbnails');
  thumbsContainer.innerHTML = '';
  
  if (images.length > 1) {
    images.forEach((imgSrc, idx) => {
      const thumb = document.createElement('img');
      thumb.src = imgSrc;
      thumb.className = `thumb-img ${idx === 0 ? 'active' : ''}`;
      
      thumb.addEventListener('click', () => {
        // Update main image
        mainImageEl.style.opacity = '0.5';
        setTimeout(() => {
          mainImageEl.src = imgSrc;
          mainImageEl.style.opacity = '1';
        }, 150);
        
        // Update active class
        document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
      
      thumbsContainer.appendChild(thumb);
    });
  }
  
  // Set fallback image if broken
  document.getElementById('prod-image').onerror = function() {
    this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%23f5f5f5"/><text x="50%" y="50%" fill="%23ccc" font-size="60" text-anchor="middle" dominant-baseline="middle">🔩</text></svg>';
  };

  const catMap = {
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
  
  document.getElementById('prod-category').textContent = catMap[p.category] || p.category;
  document.getElementById('prod-title').textContent = p.name;
  actualizarSeoProducto(p, catMap[p.category] || p.category);
  document.getElementById('prod-desc').textContent = p.description;
  
  // Set lower tabs content
  document.getElementById('tab-desc-content').textContent = p.features || 'Consulte características técnicas de este producto.';
  
  const tabUsosEl = document.getElementById('tab-usos');
  if (tabUsosEl) {
    const pUsos = tabUsosEl.querySelector('p');
    if (pUsos) pUsos.textContent = p.applications || 'Ideal para usos generales y fijaciones en obra.';
  }

  // Render measures table under Tab Medidas
  const tabMedidasEl = document.getElementById('tab-medidas');
  if (tabMedidasEl) {
    if (p.variants && p.variants.length > 0) {
      tabMedidasEl.innerHTML = `
        <div style="overflow-x:auto;">
          <table class="medidas-table" style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid var(--border);">
                <th style="padding:12px 8px; color:var(--text); font-weight:600;">Medida (Código)</th>
                <th style="padding:12px 8px; color:var(--text); font-weight:600;">Presentación</th>
              </tr>
            </thead>
            <tbody>
              ${p.variants.map(v => `
                <tr style="border-bottom:1px solid var(--border-light);">
                  <td style="padding:12px 8px; color:var(--text-dim);">${v.medida} <span style="font-size:0.8rem; color:var(--text-muted); margin-left:6px;">(${v.id})</span></td>
                  <td style="padding:12px 8px; color:var(--text-dim);">${v.presentacion}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } else {
      tabMedidasEl.innerHTML = `<p>No hay medidas especificadas para este producto.</p>`;
    }
  }

  const selectEl = document.getElementById('prod-variant-select');
  const presEl = document.getElementById('prod-presentacion');
  
  if (p.variants && p.variants.length > 0) {
    selectEl.innerHTML = p.variants.map(v => 
      `<option value="${v.id}">${v.medida}</option>`
    ).join('');
    
    // Update presentacion text on change
    selectEl.addEventListener('change', (e) => {
      const v = p.variants.find(va => va.id === e.target.value);
      if(v) presEl.innerHTML = `<strong>Presentación:</strong> ${v.presentacion}`;
    });
    
    // Trigger initial change
    selectEl.dispatchEvent(new Event('change'));
  } else {
    selectEl.innerHTML = '<option value="">Sin variantes</option>';
    presEl.innerHTML = '';
    selectEl.disabled = true;
  }

  // Add to cart button
  document.getElementById('btn-add-to-cart').addEventListener('click', (e) => {
    e.preventDefault(); // Ensure it doesn't submit or refresh
    try {
      if (p.variants && p.variants.length > 0) {
        addToCart(p, selectEl.value);
      } else {
        showToast('Este producto no tiene medidas disponibles', 'error');
      }
    } catch(err) {
      alert("Error al agregar: " + err.message);
    }
  });

  // Setup tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProductData();
});
