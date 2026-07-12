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

function showError() {
  document.getElementById('product-loading').style.display = 'none';
  document.getElementById('product-error').style.display = 'block';
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
