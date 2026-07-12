/* ======================================================
   DISTRIJAM — app.js (shared logic)
   ====================================================== */

// ── Navigation scroll effect ──────────────────────────
const nav = document.querySelector('.nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// ── Mobile hamburger ──────────────────────────────────
const hamburger = document.getElementById('nav-hamburger');
const mobileMenu = document.getElementById('nav-mobile');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
  });
}

// ── Toast notifications ───────────────────────────────
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

// ── Intersection Observer for scroll animations ───────
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -40px 0px' };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

document.querySelectorAll('.reveal').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(32px)';
  el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
  observer.observe(el);
});

// ── Active nav link ───────────────────────────────────
const currentPage = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-link[data-page]').forEach(link => {
  if (link.dataset.page === currentPage) link.classList.add('active');
});

// ── Dynamic Dropdown Menu for Products ──────────────────
async function initProductDropdown() {
  const dropdownContainer = document.getElementById('dropdown-productos');
  if (!dropdownContainer) return;

  try {
    const response = await fetch('productos.json');
    if (!response.ok) throw new Error('No se pudo cargar productos.json');
    const products = await response.json();

    // Group products by category
    const categoriesMap = {
      arandelas:       { label: 'Arandelas', products: [] },
      autoperforantes: { label: 'Autoperforantes', products: [] },
      bulones:         { label: 'Bulones', products: [] },
      clavos:          { label: 'Clavos', products: [] },
      ganchos:         { label: 'Ganchos', products: [] },
      pitones:         { label: 'Pitones', products: [] },
      remaches:        { label: 'Remaches', products: [] },
      tarugos:         { label: 'Tarugos', products: [] },
      tirafondos:      { label: 'Tirafondos', products: [] },
      tuercas:         { label: 'Tuercas', products: [] },
      varillas:        { label: 'Varillas Roscadas', products: [] }
    };

    // Load custom categories from localStorage
    try {
      const customCats = JSON.parse(localStorage.getItem('distrijam_categories') || '[]');
      customCats.forEach(c => {
        if (!categoriesMap[c.id]) {
          categoriesMap[c.id] = { label: c.label, products: [] };
        }
      });
    } catch (e) {}

    // Load custom products from localStorage
    let allProducts = [...products];
    try {
      const customProds = JSON.parse(localStorage.getItem('distrijam_products') || '[]');
      allProducts = [...customProds, ...allProducts];
    } catch (e) {}

    allProducts.forEach(p => {
      if (categoriesMap[p.category]) {
        categoriesMap[p.category].products.push(p);
      }
    });

    // Generate HTML for categories and submenus
    dropdownContainer.innerHTML = Object.entries(categoriesMap)
      .map(([catId, catData]) => {
        if (catData.products.length === 0) return '';
        
        // Sort products alphabetically
        catData.products.sort((a, b) => a.name.localeCompare(b.name));

        const hasSubmenu = catData.products.length > 0;
        const linkClass = hasSubmenu ? 'dropdown-link' : 'dropdown-link no-submenu';
        const submenuHtml = hasSubmenu
          ? `<ul class="submenu">
              ${catData.products.map(p => `
                <li><a href="producto.html?id=${p.id}" class="submenu-link">${p.name}</a></li>
              `).join('')}
             </ul>`
          : '';

        return `
          <li class="dropdown-item">
            <a href="catalogo.html?cat=${catId}" class="${linkClass}">${catData.label}</a>
            ${submenuHtml}
          </li>
        `;
      }).join('');

  } catch (error) {
    console.error('Error al generar el dropdown de productos:', error);
    // Fallback static list of categories if fetch fails
    const fallbackCategories = {
      arandelas: 'Arandelas',
      autoperforantes: 'Autoperforantes',
      bulones: 'Bulones',
      clavos: 'Clavos',
      ganchos: 'Ganchos',
      pitones: 'Pitones',
      remaches: 'Remaches',
      tarugos: 'Tarugos',
      tirafondos: 'Tirafondos',
      tuercas: 'Tuercas',
      varillas: 'Varillas Roscadas'
    };
    dropdownContainer.innerHTML = Object.entries(fallbackCategories)
      .map(([catId, label]) => `
        <li class="dropdown-item">
          <a href="catalogo.html?cat=${catId}" class="dropdown-link no-submenu">${label}</a>
        </li>
      `).join('');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initProductDropdown();
});
