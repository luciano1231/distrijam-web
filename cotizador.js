/* ======================================================
   DISTRIJAM — cotizador.js
   Pedidos a cotizar dentro del panel de administración.

   El sitio no tiene servidor, así que:
   - El pedido llega dentro del mensaje de WhatsApp, codificado. El
     administrador pega ese código acá y se reconstruye el remito.
   - La lista de precios NO se publica: se importa desde la computadora
     del administrador y queda en este navegador. El cliente nunca la ve.
   ====================================================== */

const COT_PRECIOS_KEY = 'distrijam_precios';
const COT_PEDIDOS_KEY = 'distrijam_pedidos';

const EMPRESA = {
  nombre: 'DISTRIJAM',
  rubro: 'Distribuidora mayorista de fijaciones y bulonería',
  direccion: 'Iberá 1740, W3400 Corrientes, Argentina',
  telefono: '0379 400-7195',
  whatsapp: '+54 9 379 400-7195',
  horario: 'Lunes a viernes de 08:00 a 17:00'
};

const DIAS_VALIDEZ = 7;

let cotPrecios = {};
let cotCatalogo = {};   // variantId -> { nombre, medida, presentacion, descripcion }
let cotPedidoAbierto = null;
let cotFiltro = 'todos';

const ESTADOS = {
  pendiente: 'Pendiente',
  cotizado: 'Cotizado',
  enviado: 'Enviado'
};

const money = (n) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 2
}).format(Number(n) || 0);

const fecha = (ts) => new Date(ts).toLocaleDateString('es-AR', {
  day: '2-digit', month: '2-digit', year: 'numeric'
});

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ── Persistencia ─────────────────────────────────── */
function cotLeerPrecios() {
  try { return JSON.parse(localStorage.getItem(COT_PRECIOS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function cotGuardarPrecios(obj) {
  localStorage.setItem(COT_PRECIOS_KEY, JSON.stringify(obj));
}
function cotLeerPedidos() {
  try { return JSON.parse(localStorage.getItem(COT_PEDIDOS_KEY) || '[]'); }
  catch (e) { return []; }
}
function cotGuardarPedidos(lista) {
  localStorage.setItem(COT_PEDIDOS_KEY, JSON.stringify(lista));
}

/* ── Catálogo: resuelve id de variante -> datos del producto ── */
async function cotCargarCatalogo() {
  try {
    const res = await fetch('productos.json');
    if (!res.ok) return;
    const productos = await res.json();
    productos.forEach(p => {
      (p.variants || []).forEach(v => {
        cotCatalogo[v.id] = {
          nombre: p.name,
          medida: v.medida,
          presentacion: v.presentacion,
          descripcion: v.descripcion || `${p.name} ${v.medida}`
        };
      });
    });
  } catch (e) {
    console.warn('No se pudo cargar productos.json para el cotizador:', e);
  }
}

/* ── Código de pedido ─────────────────────────────── */
function cotDecodificar(codigo) {
  let limpio = String(codigo).trim();
  // Tolera que se pegue el mensaje entero de WhatsApp
  const m = limpio.match(/DJ1\.([A-Za-z0-9_-]+)/);
  if (m) limpio = m[1];
  else limpio = limpio.replace(/^DJ1\./, '');

  if (!limpio) throw new Error('El código está vacío.');

  const b64 = limpio.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = b64 + '='.repeat((4 - (b64.length % 4)) % 4);

  let json;
  try {
    const bin = atob(relleno);
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    json = new TextDecoder().decode(bytes);
  } catch (e) {
    throw new Error('El código no es válido o está incompleto.');
  }

  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.i)) throw new Error('El código no contiene un pedido.');
  return data;
}

/* Convierte el payload en el remito que maneja el panel */
function cotDesdePayload(data) {
  const [nombre, cuil, telefono, nota] = data.c || [];
  return {
    ref: data.r || ('R' + Date.now().toString(36).toUpperCase().slice(-7)),
    fecha: data.f || Date.now(),
    cliente: { nombre: nombre || '', cuil: cuil || '', telefono: telefono || '', nota: nota || '' },
    estado: 'pendiente',
    descuento: 0,
    items: data.i.map(([vid, qty]) => {
      const info = cotCatalogo[vid] || {};
      return {
        variantId: vid,
        nombre: info.nombre || vid,
        medida: info.medida || '',
        presentacion: info.presentacion || '',
        qty: Number(qty) || 1,
        // Precio unitario editable. Arranca en la lista importada.
        precio: Number(cotPrecios[vid]) || 0,
        sinPrecio: !(Number(cotPrecios[vid]) > 0)
      };
    })
  };
}

/* ── Totales ──────────────────────────────────────── */
function cotTotales(pedido) {
  const subtotal = pedido.items.reduce((s, it) => s + (Number(it.precio) || 0) * (Number(it.qty) || 0), 0);
  const pct = Math.min(Math.max(Number(pedido.descuento) || 0, 0), 100);
  const descuento = subtotal * (pct / 100);
  return { subtotal, pct, descuento, total: subtotal - descuento };
}

/* ── Lista de precios ─────────────────────────────── */
function cotRenderEstadoPrecios() {
  const el = document.getElementById('cot-price-status');
  if (!el) return;
  const n = Object.keys(cotPrecios).length;
  if (n === 0) {
    el.className = 'cot-price-status cot-price-status--off';
    el.innerHTML = `<strong>Sin lista de precios.</strong> Importá <code>precios.json</code> para ver importes.`;
  } else {
    el.className = 'cot-price-status cot-price-status--on';
    el.innerHTML = `<strong>Lista de precios cargada:</strong> ${n} precios en este navegador.`;
  }
}

function cotImportarPrecios(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const precios = data.precios || data;
      if (typeof precios !== 'object' || Array.isArray(precios)) {
        throw new Error('formato');
      }
      const limpio = {};
      Object.entries(precios).forEach(([k, v]) => {
        const num = Number(v);
        if (num > 0) limpio[k] = num;
      });
      if (Object.keys(limpio).length === 0) throw new Error('vacio');

      cotPrecios = limpio;
      cotGuardarPrecios(cotPrecios);
      cotRenderEstadoPrecios();
      cotRenderLista();
      showToast(`Lista de precios importada: ${Object.keys(limpio).length} precios`, 'success');
    } catch (e) {
      showToast('El archivo no tiene el formato esperado (precios.json)', 'error');
    }
  };
  reader.readAsText(file);
}

/* ── Listado de pedidos ───────────────────────────── */
function cotRenderFiltros(pedidos) {
  const cont = document.getElementById('cot-filtros');
  if (!cont) return;

  const cuenta = { todos: pedidos.length, pendiente: 0, cotizado: 0, enviado: 0 };
  pedidos.forEach(p => { cuenta[p.estado] = (cuenta[p.estado] || 0) + 1; });

  const opciones = [['todos', 'Todos'], ...Object.entries(ESTADOS)];
  cont.innerHTML = opciones.map(([clave, etiqueta]) => `
    <button type="button" class="cot-filtro ${cotFiltro === clave ? 'active' : ''}" data-filtro="${clave}">
      ${etiqueta} <span class="cot-filtro-n">${cuenta[clave] || 0}</span>
    </button>`).join('');

  cont.querySelectorAll('.cot-filtro').forEach(b => {
    b.addEventListener('click', () => {
      cotFiltro = b.dataset.filtro;
      cotRenderLista();
    });
  });
}

function cotCambiarEstado(ref, estado) {
  const lista = cotLeerPedidos();
  const p = lista.find(x => x.ref === ref);
  if (!p) return;
  p.estado = estado;
  cotGuardarPedidos(lista);
  if (cotPedidoAbierto && cotPedidoAbierto.ref === ref) cotPedidoAbierto.estado = estado;
  cotRenderLista();
  showToast(`${ref}: ${ESTADOS[estado].toLowerCase()}`, 'success');
}

function cotRenderLista() {
  const cont = document.getElementById('cot-list');
  if (!cont) return;

  const todos = cotLeerPedidos().sort((a, b) => b.fecha - a.fecha);
  cotRenderFiltros(todos);
  const pedidos = cotFiltro === 'todos' ? todos : todos.filter(p => p.estado === cotFiltro);

  if (todos.length === 0) {
    cont.innerHTML = `
      <div class="cot-empty">
        <div class="cot-empty-icon">🧾</div>
        <p><strong>Todavía no hay pedidos cargados.</strong></p>
        <p>Cuando un cliente envía su pedido por WhatsApp, el mensaje incluye un
           código que empieza con <code>DJ1.</code> Pegalo arriba para abrir el remito.</p>
      </div>`;
    return;
  }

  if (pedidos.length === 0) {
    cont.innerHTML = `<div class="cot-empty"><p>No hay pedidos con ese estado.</p></div>`;
    return;
  }

  cont.innerHTML = pedidos.map(p => {
    const t = cotTotales(p);
    const unidades = p.items.reduce((s, it) => s + it.qty, 0);
    return `
      <article class="cot-card" data-ref="${escapeHtml(p.ref)}">
        <div class="cot-card-main">
          <div class="cot-card-ref">
            <span class="cot-ref">${escapeHtml(p.ref)}</span>
            <span class="cot-estado cot-estado--${escapeHtml(p.estado)}">${ESTADOS[p.estado] || 'Pendiente'}</span>
          </div>
          <div class="cot-card-cliente">
            <strong>${escapeHtml(p.cliente.nombre || 'Sin nombre')}</strong>
            <span>CUIL ${escapeHtml(p.cliente.cuil || '—')}</span>
          </div>
          <div class="cot-card-meta">
            ${fecha(p.fecha)} · ${p.items.length} ítem(s) · ${unidades} unidades
          </div>
        </div>
        <div class="cot-card-side">
          <div class="cot-card-total">${Object.keys(cotPrecios).length ? money(t.total) : '—'}</div>
          <div class="cot-card-actions">
            <label class="sr-only" for="est-${escapeHtml(p.ref)}">Estado del pedido</label>
            <select class="cot-estado-sel" id="est-${escapeHtml(p.ref)}" data-ref="${escapeHtml(p.ref)}">
              ${Object.entries(ESTADOS).map(([c, e]) =>
                `<option value="${c}"${p.estado === c ? ' selected' : ''}>${e}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-primary cot-open" data-ref="${escapeHtml(p.ref)}">Abrir remito</button>
            <button type="button" class="cot-del" data-ref="${escapeHtml(p.ref)}" title="Eliminar pedido">✕</button>
          </div>
        </div>
      </article>`;
  }).join('');

  cont.querySelectorAll('.cot-open').forEach(b => {
    b.addEventListener('click', () => cotAbrir(b.dataset.ref));
  });
  cont.querySelectorAll('.cot-del').forEach(b => {
    b.addEventListener('click', () => cotEliminar(b.dataset.ref));
  });
  cont.querySelectorAll('.cot-estado-sel').forEach(sel => {
    sel.addEventListener('change', () => cotCambiarEstado(sel.dataset.ref, sel.value));
  });
}

function cotEliminar(ref) {
  if (!confirm(`¿Eliminar el pedido ${ref}? Esta acción no se puede deshacer.`)) return;
  cotGuardarPedidos(cotLeerPedidos().filter(p => p.ref !== ref));
  cotRenderLista();
  showToast(`Pedido ${ref} eliminado`, 'info');
}

/* ── Detalle del remito ───────────────────────────── */
function cotAbrir(ref) {
  const pedido = cotLeerPedidos().find(p => p.ref === ref);
  if (!pedido) return;
  cotPedidoAbierto = pedido;
  cotRenderDetalle();
  document.getElementById('cot-modal').classList.add('open');
}

function cotCerrar() {
  document.getElementById('cot-modal').classList.remove('open');
  cotPedidoAbierto = null;
}

function cotRenderDetalle() {
  const p = cotPedidoAbierto;
  if (!p) return;
  const t = cotTotales(p);

  document.getElementById('cot-modal-ref').textContent = p.ref;
  document.getElementById('cot-modal-cliente').innerHTML = `
    <div><span>Cliente</span><strong>${escapeHtml(p.cliente.nombre || '—')}</strong></div>
    <div><span>CUIL</span><strong>${escapeHtml(p.cliente.cuil || '—')}</strong></div>
    <div><span>Teléfono</span><strong>${escapeHtml(p.cliente.telefono || '—')}</strong></div>
    <div><span>Fecha</span><strong>${fecha(p.fecha)}</strong></div>
    ${p.cliente.nota ? `<div class="cot-nota"><span>Nota del cliente</span><strong>${escapeHtml(p.cliente.nota)}</strong></div>` : ''}
  `;

  document.getElementById('cot-modal-items').innerHTML = p.items.map((it, i) => `
    <tr${it.sinPrecio && !it.precio ? ' class="cot-row-warn"' : ''}>
      <td>
        <div class="cot-item-name">${escapeHtml(it.nombre)}</div>
        <div class="cot-item-meta">${escapeHtml(it.medida)}${it.presentacion ? ' · ' + escapeHtml(it.presentacion) : ''}</div>
      </td>
      <td class="cot-td-num">
        <input type="number" min="1" step="1" value="${it.qty}" data-i="${i}" class="cot-input cot-qty" />
      </td>
      <td class="cot-td-num">
        <input type="number" min="0" step="0.01" value="${it.precio || ''}" placeholder="0.00" data-i="${i}" class="cot-input cot-precio" />
      </td>
      <td class="cot-td-num cot-linea" data-line="${i}">${money(it.precio * it.qty)}</td>
    </tr>
  `).join('');

  document.getElementById('cot-desc-input').value = p.descuento || 0;
  cotRenderTotales(t);

  document.querySelectorAll('.cot-qty').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = Number(inp.dataset.i);
      cotPedidoAbierto.items[i].qty = Math.max(1, Number(inp.value) || 1);
      cotActualizar();
    });
  });
  document.querySelectorAll('.cot-precio').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = Number(inp.dataset.i);
      cotPedidoAbierto.items[i].precio = Math.max(0, Number(inp.value) || 0);
      cotActualizar();
    });
  });
}

function cotRenderTotales(t) {
  document.getElementById('cot-subtotal').textContent = money(t.subtotal);
  document.getElementById('cot-descuento').textContent = t.descuento > 0 ? '− ' + money(t.descuento) : money(0);
  document.getElementById('cot-total').textContent = money(t.total);
}

/* Recalcula en vivo sin volver a dibujar toda la tabla */
function cotActualizar() {
  const p = cotPedidoAbierto;
  if (!p) return;
  p.items.forEach((it, i) => {
    const celda = document.querySelector(`.cot-linea[data-line="${i}"]`);
    if (celda) celda.textContent = money(it.precio * it.qty);
  });
  cotRenderTotales(cotTotales(p));
}

function cotGuardarAbierto(estado) {
  const p = cotPedidoAbierto;
  if (!p) return;
  if (estado) p.estado = estado;
  const lista = cotLeerPedidos();
  const idx = lista.findIndex(x => x.ref === p.ref);
  if (idx >= 0) lista[idx] = p; else lista.push(p);
  cotGuardarPedidos(lista);
  cotRenderLista();
}

/* ── Hoja de cotización para imprimir ─────────────── */
function cotImprimir() {
  const p = cotPedidoAbierto;
  if (!p) return;
  const t = cotTotales(p);

  const emitida = new Date();
  const vence = new Date(emitida.getTime() + DIAS_VALIDEZ * 24 * 60 * 60 * 1000);

  const filas = p.items.map(it => `
    <tr>
      <td>
        <div class="pq-item">${escapeHtml(it.nombre)}</div>
        <div class="pq-item-meta">${escapeHtml(it.medida)}${it.presentacion ? ' · ' + escapeHtml(it.presentacion) : ''}</div>
      </td>
      <td class="pq-num">${it.qty}</td>
      <td class="pq-num">${money(it.precio)}</td>
      <td class="pq-num">${money(it.precio * it.qty)}</td>
    </tr>`).join('');

  document.getElementById('cot-print').innerHTML = `
    <div class="pq-sheet">
      <header class="pq-head">
        <div>
          <img class="pq-logo" src="Logo/LogoDistrijamCompleto.png" alt="${EMPRESA.nombre}" />
          <div class="pq-rubro">${EMPRESA.rubro}</div>
        </div>
        <div class="pq-emp">
          <div>${EMPRESA.direccion}</div>
          <div>Tel: ${EMPRESA.telefono} · WhatsApp: ${EMPRESA.whatsapp}</div>
          <div>${EMPRESA.horario}</div>
        </div>
      </header>

      <div class="pq-title">
        <h1>Presupuesto</h1>
        <div class="pq-ref">
          <div><span>Remito</span><strong>${escapeHtml(p.ref)}</strong></div>
          <div><span>Emitido</span><strong>${emitida.toLocaleDateString('es-AR')}</strong></div>
        </div>
      </div>

      <section class="pq-cliente">
        <div><span>Cliente</span><strong>${escapeHtml(p.cliente.nombre || '—')}</strong></div>
        <div><span>CUIL</span><strong>${escapeHtml(p.cliente.cuil || '—')}</strong></div>
        <div><span>Teléfono</span><strong>${escapeHtml(p.cliente.telefono || '—')}</strong></div>
      </section>

      <table class="pq-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th class="pq-num">Cant.</th>
            <th class="pq-num">Precio unit.<br><span class="pq-th-sub">final c/IVA</span></th>
            <th class="pq-num">Subtotal</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <div class="pq-totales">
        <div class="pq-tot-row"><span>Subtotal</span><strong>${money(t.subtotal)}</strong></div>
        ${t.pct > 0 ? `<div class="pq-tot-row pq-desc"><span>Descuento (${t.pct}%)</span><strong>− ${money(t.descuento)}</strong></div>` : ''}
        <div class="pq-tot-row pq-final"><span>Total</span><strong>${money(t.total)}</strong></div>
        <div class="pq-tot-iva">IVA incluido</div>
      </div>

      ${p.cliente.nota ? `<div class="pq-nota"><span>Nota del cliente:</span> ${escapeHtml(p.cliente.nota)}</div>` : ''}

      <footer class="pq-foot">
        <p class="pq-validez">Presupuesto válido por ${DIAS_VALIDEZ} días — hasta el ${vence.toLocaleDateString('es-AR')}.</p>
        <p class="pq-legal">Precios finales expresados en pesos argentinos, con IVA incluido. Sujetos a disponibilidad de stock al momento de confirmar el pedido.</p>
      </footer>
    </div>`;

  cotGuardarAbierto('cotizado');
  document.body.classList.add('cot-printing');

  const limpiar = () => {
    document.body.classList.remove('cot-printing');
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  window.print();
  setTimeout(limpiar, 1500);
}

/* ── Alta de pedido desde el código ───────────────── */
function cotAgregarDesdeCodigo(codigo) {
  let data;
  try {
    data = cotDecodificar(codigo);
  } catch (e) {
    showToast(e.message, 'error', 5000);
    return false;
  }

  const lista = cotLeerPedidos();
  if (lista.some(p => p.ref === data.r)) {
    showToast(`El pedido ${data.r} ya estaba cargado`, 'info');
    cotAbrir(data.r);
    return true;
  }

  const pedido = cotDesdePayload(data);
  lista.push(pedido);
  cotGuardarPedidos(lista);
  cotRenderLista();

  const faltantes = pedido.items.filter(i => i.sinPrecio).length;
  if (faltantes && Object.keys(cotPrecios).length) {
    showToast(`Pedido ${pedido.ref} cargado. ${faltantes} ítem(s) sin precio en la lista.`, 'info', 5000);
  } else {
    showToast(`Pedido ${pedido.ref} cargado`, 'success');
  }
  cotAbrir(pedido.ref);
  return true;
}

/* ── Inicio ───────────────────────────────────────── */
/* Si precios.json está junto al sitio (trabajo local), se toma solo.
   En el servidor ese archivo no se publica, así que ahí no existe y el
   administrador lo importa a mano: es lo que mantiene los precios fuera
   del alcance de los clientes. */
async function cotAutocargarPrecios() {
  if (Object.keys(cotPrecios).length > 0) return;
  try {
    const res = await fetch('precios.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const precios = data.precios || data;
    const limpio = {};
    Object.entries(precios).forEach(([k, v]) => {
      const n = Number(v);
      if (n > 0) limpio[k] = n;
    });
    if (Object.keys(limpio).length) {
      cotPrecios = limpio;
      cotGuardarPrecios(cotPrecios);
    }
  } catch (e) {
    /* Sin archivo local: se importa a mano. */
  }
}

/* Levanta los pedidos que el carrito dejó en la bandeja de este navegador */
function cotRecogerBandeja() {
  let bandeja;
  try {
    bandeja = JSON.parse(localStorage.getItem('distrijam_pedidos_inbox') || '[]');
  } catch (e) {
    return 0;
  }
  if (!Array.isArray(bandeja) || bandeja.length === 0) return 0;

  const pedidos = cotLeerPedidos();
  const conocidos = new Set(pedidos.map(p => p.ref));
  let nuevos = 0;

  bandeja.forEach(payload => {
    if (!payload || !Array.isArray(payload.i)) return;
    if (conocidos.has(payload.r)) return;
    pedidos.push(cotDesdePayload(payload));
    conocidos.add(payload.r);
    nuevos++;
  });

  if (nuevos) cotGuardarPedidos(pedidos);
  return nuevos;
}

async function initCotizador() {
  if (!document.getElementById('cot-section')) return;

  cotPrecios = cotLeerPrecios();
  await cotCargarCatalogo();
  await cotAutocargarPrecios();

  const nuevos = cotRecogerBandeja();

  cotRenderEstadoPrecios();
  cotRenderLista();

  if (nuevos > 0) {
    showToast(`${nuevos} pedido(s) nuevo(s) recibido(s)`, 'success', 5000);
  }

  const form = document.getElementById('cot-paste-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('cot-code-input');
      if (cotAgregarDesdeCodigo(input.value)) input.value = '';
    });
  }

  const fileInput = document.getElementById('cot-price-file');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) cotImportarPrecios(fileInput.files[0]);
      fileInput.value = '';
    });
  }

  const desc = document.getElementById('cot-desc-input');
  if (desc) {
    desc.addEventListener('input', () => {
      if (!cotPedidoAbierto) return;
      cotPedidoAbierto.descuento = Math.min(Math.max(Number(desc.value) || 0, 0), 100);
      cotRenderTotales(cotTotales(cotPedidoAbierto));
    });
  }

  document.querySelectorAll('[data-cot-close]').forEach(b => {
    b.addEventListener('click', cotCerrar);
  });
  document.getElementById('cot-modal').addEventListener('click', (e) => {
    if (e.target.id === 'cot-modal') cotCerrar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cotCerrar();
  });

  const guardar = document.getElementById('cot-save');
  if (guardar) {
    guardar.addEventListener('click', () => {
      cotGuardarAbierto();
      showToast('Cambios guardados', 'success');
    });
  }

  const enviado = document.getElementById('cot-enviado');
  if (enviado) {
    enviado.addEventListener('click', () => {
      if (!cotPedidoAbierto) return;
      cotGuardarAbierto();
      cotCambiarEstado(cotPedidoAbierto.ref, 'enviado');
      cotCerrar();
    });
  }

  const imprimir = document.getElementById('cot-print-btn');
  if (imprimir) imprimir.addEventListener('click', cotImprimir);
}

document.addEventListener('DOMContentLoaded', initCotizador);
