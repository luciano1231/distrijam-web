// ── Shared Cart State & Functions ─────────────────────────
let cart = [];
const WA_NUMBER = '5493794007195';

function loadCart() {
  try {
    const data = sessionStorage.getItem('distrijam_cart');
    cart = data ? JSON.parse(data) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch (e) {
    cart = [];
  }
}

function saveCart() {
  sessionStorage.setItem('distrijam_cart', JSON.stringify(cart));
}

function cartTotal() { 
  return cart.reduce((s, i) => s + i.qty, 0); 
}

function addToCart(product, variantId) {
  try {
    if (!product) return;
    const variant = product.variants.find(v => v.id === variantId);
    if (!variant) {
      showToast('Variante no encontrada', 'error');
      return;
    }

    const existing = cart.find(c => c.variantId === variantId);
    if (existing) {
      existing.qty += 1;
      showToast('Cantidad actualizada', 'info');
    } else {
      cart.push({
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        medida: variant.medida,
        presentacion: variant.presentacion,
        descripcion: variant.descripcion || `${product.name} ${variant.medida}`,
        image: product.image,
        category: product.category,
        qty: 1
      });
      showToast('✓ Agregado al pedido', 'success');
    }
    saveCart();
    renderCart();
    updateFAB();

    // Open the sidebar on mobile if it exists
    const sidebar = document.querySelector('.cart-sidebar');
    if (sidebar && window.innerWidth <= 1024) {
      sidebar.classList.add('open');
    }
  } catch(e) {
    console.error(e);
    alert("Hubo un error al agregar el producto: " + e.message);
  }
}

function changeQty(variantId, delta) {
  const item = cart.find(c => c.variantId === variantId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
  renderCart();
}

function removeFromCart(variantId) {
  cart = cart.filter(c => c.variantId !== variantId);
  saveCart();
  renderCart();
  updateFAB();
  
  // Si estamos en catalogo.js y renderProducts existe, llamarlo para act. la UI
  if (typeof renderProducts === 'function') renderProducts();
}

function clearCart() {
  cart = [];
  saveCart();
  renderCart();
  updateFAB();
  if (typeof renderProducts === 'function') renderProducts();
}

// ── Render Cart ───────────────────────────────────────
function renderCart() {
  const itemsEl = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const footerEl = document.getElementById('cart-footer');
  const badge = document.getElementById('cart-badge');
  if (!itemsEl) return; // Si no hay sidebar en esta página

  const total = cartTotal();

  if(badge) {
    badge.textContent = total;
    badge.style.display = total === 0 ? 'none' : '';
  }

  if (cart.length === 0) {
    itemsEl.innerHTML = '';
    if(emptyEl) emptyEl.style.display = 'flex';
    if(footerEl) footerEl.style.display = 'none';
    return;
  }
  
  if(emptyEl) emptyEl.style.display = 'none';
  if(footerEl) footerEl.style.display = 'block';

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.variantId}">
      <img class="cart-item-img" src="${item.image}" alt="${item.name}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect width=%2248%22 height=%2248%22 fill=%22%23222%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23555%22 font-size=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>🔩</text></svg>'">
      <div class="cart-item-info">
        <div class="cart-item-name" title="${item.name}">${item.name}</div>
        <div class="cart-item-variant">${item.medida}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-action="dec" data-id="${item.variantId}">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${item.variantId}">+</button>
        </div>
      </div>
      <button class="cart-item-remove" data-id="${item.variantId}" title="Quitar">✕</button>
    </div>
  `).join('');

  // Events
  itemsEl.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const vid = btn.dataset.id;
      changeQty(vid, btn.dataset.action === 'inc' ? 1 : -1);
    });
  });
  itemsEl.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.id));
  });

  const elTotalItems = document.getElementById('cart-total-items');
  const elTotalLines = document.getElementById('cart-total-lines');
  if(elTotalItems) elTotalItems.textContent = total;
  if(elTotalLines) elTotalLines.textContent = cart.length;
}

function updateFAB() {
  const fabBadge = document.getElementById('cart-fab-badge');
  if (!fabBadge) return;
  const total = cartTotal();
  fabBadge.textContent = total;
  fabBadge.style.display = total === 0 ? 'none' : '';
}

// Quote Modal Logic
function openQuoteModal() {
  if (cart.length === 0) { showToast('Tu pedido está vacío', 'error'); return; }
  const listEl = document.getElementById('quote-product-list');
  if(!listEl) return;
  
  listEl.innerHTML = cart.map(item => `
    <div class="quote-product-row">
      <span class="name">${item.name} (${item.medida})</span>
      <span class="qty">× ${item.qty}</span>
    </div>
  `).join('');
  document.getElementById('quote-modal').classList.add('open');
}

function formatCUIL(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return digits.slice(0, 2) + '-' + digits.slice(2);
  return digits.slice(0, 2) + '-' + digits.slice(2, 10) + '-' + digits.slice(10);
}

function isValidCUIL(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11;
}

function buildWhatsAppMessage() {
  const name = document.getElementById('quote-name').value.trim() || 'Sin nombre';
  const phone = document.getElementById('quote-phone').value.trim();
  const cuil = document.getElementById('quote-cuil').value.trim();
  const message = document.getElementById('quote-message').value.trim();

  let text = `🔩 *PEDIDO DE COTIZACIÓN — DISTRIJAM*\n`;
  text += `━━━━━━━━━━━━━━━━━━━\n`;
  text += `👤 *Cliente:* ${name}\n`;
  text += `🆔 *CUIL:* ${cuil}\n`;
  if (phone) text += `📱 *Teléfono:* ${phone}\n`;
  text += `\n📋 *Productos solicitados:*\n`;
  cart.forEach(item => {
    text += `  • ${item.descripcion || `${item.name} ${item.medida}`} × ${item.qty} (${item.presentacion})\n`;
  });
  text += `\n📦 *Total:* ${cart.length} ítem(s), ${cartTotal()} unidades`;
  if (message) text += `\n\n💬 *Nota:* ${message}`;
  text += `\n━━━━━━━━━━━━━━━━━━━`;
  return encodeURIComponent(text);
}

function sendWhatsApp() {
  const name = document.getElementById('quote-name').value.trim();
  const cuilInput = document.getElementById('quote-cuil');
  const cuil = cuilInput.value.trim();

  if (!name) {
    showToast('Por favor ingresá tu nombre', 'error');
    document.getElementById('quote-name').focus();
    return;
  }
  if (!cuil || !isValidCUIL(cuil)) {
    showToast('Por favor ingresá un CUIL válido (11 dígitos)', 'error');
    cuilInput.focus();
    cuilInput.classList.add('input-error');
    setTimeout(() => cuilInput.classList.remove('input-error'), 3000);
    return;
  }

  const url = `https://wa.me/${WA_NUMBER}?text=${buildWhatsAppMessage()}`;
  window.open(url, '_blank');
  document.getElementById('quote-modal').classList.remove('open');
  showToast('¡Pedido enviado por WhatsApp! 🎉', 'success', 5000);
}

// ── Init Shared Cart UI ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  renderCart();
  updateFAB();

  const clearBtn = document.getElementById('cart-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (cart.length === 0) return;
      if (confirm('¿Vaciar el pedido?')) clearCart();
    });
  }

  const quoteBtn = document.getElementById('btn-quote');
  if (quoteBtn) quoteBtn.addEventListener('click', openQuoteModal);
  
  const quoteFooterBtn = document.getElementById('btn-quote-footer');
  if (quoteFooterBtn) quoteFooterBtn.addEventListener('click', openQuoteModal);

  const sendWaBtn = document.getElementById('btn-send-whatsapp');
  if (sendWaBtn) sendWaBtn.addEventListener('click', sendWhatsApp);

  const cuilInput = document.getElementById('quote-cuil');
  if (cuilInput) {
    cuilInput.addEventListener('input', () => {
      const pos = cuilInput.selectionStart;
      const oldLen = cuilInput.value.length;
      cuilInput.value = formatCUIL(cuilInput.value);
      const newLen = cuilInput.value.length;
      cuilInput.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen));
    });
  }

  // Modals close logic
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.closeModal);
      if(modal) modal.classList.remove('open');
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
  if (fab && sidebar) {
    fab.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 1024 && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && e.target !== fab) {
          sidebar.classList.remove('open');
        }
      }
    });
  }
});
