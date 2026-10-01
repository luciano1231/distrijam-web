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
  nombre: 'DISTRIJAM S.A.',
  direccion: 'IBERA 1740',
  localidad: 'Corrientes',
  telefono: '3794 007195',
  email: 'autoperforantes@distrijam.com.ar',
  web: '',
  cuit: '30-71566968-0',
  dgr: '30-71566968-0',
  inicioActividades: '01/08/2017',
  condicionIva: 'IVA Responsable Inscripto'
};

// Campos fiscales del cliente que el pedido no trae y completa el admin
const CAMPOS_CLIENTE = [
  ['nombre', 'Razón social'],
  ['codigo', 'Código'],
  ['cuit', 'CUIT'],
  ['condicion', 'Condición IVA'],
  ['direccion', 'Dirección'],
  ['localidad', 'Localidad'],
  ['provincia', 'Provincia'],
  ['vendedor', 'Vendedor']
];

let cotClientes = {};

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
        descripcionLarga: info.descripcion || '',
        qty: Number(qty) || 1,
        // Precio unitario editable. Arranca en la lista importada.
        precio: Number(cotPrecios[vid]) || 0,
        sinPrecio: !(Number(cotPrecios[vid]) > 0)
      };
    })
  };
}

/* ── Clientes ─────────────────────────────────────── */
const soloDigitos = (v) => String(v || '').replace(/[^0-9]/g, '');

async function cotCargarClientes() {
  try {
    const res = await fetch('api.php?a=clientes', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (res.ok && data && data.ok) cotClientes = data.clientes || {};
  } catch (e) {
    /* Se sigue con los datos que trae el pedido. */
  }
}

/* Completa los datos fiscales con lo guardado para ese CUIT */
function cotDatosCliente(pedido) {
  const guardado = cotClientes[soloDigitos(pedido.cliente.cuil)] || {};
  return {
    nombre: guardado.nombre || pedido.cliente.nombre || '',
    codigo: guardado.codigo || '',
    cuit: guardado.cuit || pedido.cliente.cuil || '',
    condicion: guardado.condicion || '',
    direccion: guardado.direccion || '',
    localidad: guardado.localidad || '',
    provincia: guardado.provincia || '',
    vendedor: guardado.vendedor || ''
  };
}

async function cotGuardarCliente() {
  const datos = {};
  CAMPOS_CLIENTE.forEach(([campo]) => {
    const inp = document.getElementById('cli-' + campo);
    datos[campo] = inp ? inp.value.trim() : '';
  });

  if (soloDigitos(datos.cuit) === '') {
    showToast('Hace falta el CUIT para guardar el cliente', 'error');
    return;
  }

  try {
    const res = await fetch('api.php?a=clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok || !r.ok) {
      showToast(r.error || 'No se pudo guardar el cliente', 'error');
      return;
    }
    cotClientes[soloDigitos(datos.cuit)] = datos;
    showToast('Cliente guardado', 'success');
  } catch (e) {
    showToast('No hay conexión con el servidor', 'error');
  }
}

/* Número correlativo de presupuesto, igual que el sistema anterior */
async function cotNumeroPresupuesto(ref) {
  try {
    const res = await fetch('api.php?a=numero', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref })
    });
    const r = await res.json().catch(() => ({}));
    return r && r.numero ? r.numero : null;
  } catch (e) {
    return null;
  }
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
    el.innerHTML = `<strong>Sin lista de precios.</strong> Subí <code>precios.json</code> una vez.`;
  } else {
    el.className = 'cot-price-status cot-price-status--on';
    el.innerHTML = `<strong>Precios cargados:</strong> ${n} artículos.`;
  }
}

/* Sube la lista al servidor: queda disponible en cualquier navegador desde
   el que se administre, sin volver a importarla. */
function cotImportarPrecios(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    let precios;
    try {
      const data = JSON.parse(reader.result);
      precios = data.precios || data;
      if (typeof precios !== 'object' || Array.isArray(precios)) throw new Error('formato');
    } catch (e) {
      showToast('El archivo no tiene el formato esperado (precios.json)', 'error', 5000);
      return;
    }

    try {
      const res = await fetch('api.php?a=precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precios })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        showToast(data.error || 'No se pudo guardar la lista en el servidor', 'error', 5000);
        return;
      }

      await cotCargarPreciosDelServidor();
      cotRenderEstadoPrecios();
      cotRenderLista();
      showToast(`Lista guardada en el servidor: ${data.total} precios`, 'success', 5000);
    } catch (e) {
      showToast('No hay conexión con el servidor', 'error');
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

  // Datos fiscales editables: se guardan por CUIT y se reusan la próxima vez
  const datos = cotDatosCliente(p);
  document.getElementById('cot-modal-cliente').innerHTML = `
    <div class="cot-cli-cab">
      <span>Datos del cliente</span>
      <button type="button" class="cot-cli-save" id="cot-cli-guardar">Guardar cliente</button>
    </div>
    <div class="cot-cli-campos">
      ${CAMPOS_CLIENTE.map(([campo, etiqueta]) => `
        <label>
          <span>${etiqueta}</span>
          <input type="text" id="cli-${campo}" value="${escapeHtml(datos[campo])}" autocomplete="off" />
        </label>`).join('')}
    </div>
    <div class="cot-cli-pie">
      Del pedido: ${escapeHtml(p.cliente.telefono || 'sin teléfono')} ·
      ${fecha(p.fecha)}${p.cliente.nota ? ' · Nota: ' + escapeHtml(p.cliente.nota) : ''}
    </div>`;

  const btnCli = document.getElementById('cot-cli-guardar');
  if (btnCli) btnCli.addEventListener('click', cotGuardarCliente);

  document.getElementById('cot-modal-items').innerHTML = p.items.map((it, i) => `
    <tr${it.sinPrecio && !it.precio ? ' class="cot-row-warn"' : ''}>
      <td class="cot-td-cod">${escapeHtml(it.variantId)}</td>
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
/* La descripción del proveedor suele traer ya la presentación ("X 100 UNID."),
   así que sólo se agrega cuando falta, para no repetirla. */
function descripcionDeLinea(it) {
  const base = it.descripcionLarga || (it.nombre + (it.medida ? ' ' + it.medida : ''));
  const pres = (it.presentacion || '').trim();
  if (!pres) return base;
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(base).includes(norm(pres)) ? base : base + ' · ' + pres;
}

async function cotImprimir() {
  const p = cotPedidoAbierto;
  if (!p) return;
  const t = cotTotales(p);

  // Toma lo que el admin haya escrito recién, sin obligarlo a guardar antes
  const cli = {};
  CAMPOS_CLIENTE.forEach(([campo]) => {
    const inp = document.getElementById('cli-' + campo);
    cli[campo] = inp ? inp.value.trim() : '';
  });

  const numero = (await cotNumeroPresupuesto(p.ref)) || p.ref;
  const emitida = new Date();
  const vence = new Date(emitida.getTime() + DIAS_VALIDEZ * 24 * 60 * 60 * 1000);

  const filas = p.items.map(it => `
    <tr>
      <td class="pq-cod">${escapeHtml(it.variantId)}</td>
      <td>${escapeHtml(descripcionDeLinea(it))}</td>
      <td class="pq-num">${it.qty}</td>
      <td class="pq-uni">Unidad</td>
      <td class="pq-num">${money(it.precio)}</td>
      <td class="pq-num pq-iva">0,00%</td>
      <td class="pq-num">0,00</td>
      <td class="pq-num">${money(it.precio * it.qty)}</td>
    </tr>`).join('');

  const lineaCliente2 = [cli.direccion, cli.localidad, cli.provincia]
    .filter(Boolean).join(' · ');

  document.getElementById('cot-print').innerHTML = `
    <div class="pq-hoja">
      <header class="pq-cab">
        <div class="pq-marca">
          <img src="Logo/LogoDistrijamCompleto.png" alt="${escapeHtml(EMPRESA.nombre)}" class="pq-logo" />
          <div class="pq-marca-sub">DISTRIBUIDORA MAYORISTA</div>
        </div>

        <div class="pq-novalido">
          <div class="pq-equis">X</div>
          <div>Documento no válido<br>como Factura</div>
        </div>

        <div class="pq-titulo">
          <div class="pq-titulo-h">PRESUPUESTO</div>
          <table class="pq-titulo-t">
            <tr><td>Nro.:</td><td><strong>${escapeHtml(numero)}</strong></td></tr>
            <tr><td>Fecha:</td><td>${emitida.toLocaleDateString('es-AR')}</td></tr>
          </table>
        </div>
      </header>

      <section class="pq-empresa">
        <div>
          <div class="pq-emp-nombre">${escapeHtml(EMPRESA.nombre)}</div>
          <div>${escapeHtml(EMPRESA.direccion)}</div>
          <div>${escapeHtml(EMPRESA.localidad)}</div>
          <div>Tel. ${escapeHtml(EMPRESA.telefono)}</div>
          <div>email: ${escapeHtml(EMPRESA.email)}</div>
        </div>
        <div class="pq-emp-fiscal">
          <div>CUIT Nro.: ${escapeHtml(EMPRESA.cuit)}</div>
          <div>DGR Nro.: ${escapeHtml(EMPRESA.dgr)}</div>
          <div>Inicio Actividades: ${escapeHtml(EMPRESA.inicioActividades)}</div>
          <div class="pq-emp-iva">${escapeHtml(EMPRESA.condicionIva)}</div>
        </div>
      </section>

      <section class="pq-cliente">
        <div class="pq-cli-izq">
          <div class="pq-cli-nombre">${escapeHtml(cli.nombre || p.cliente.nombre || '—')}
            ${cli.codigo ? '<span class="pq-cli-cod">(Cod. ' + escapeHtml(cli.codigo) + ')</span>' : ''}</div>
          ${lineaCliente2 ? '<div>' + escapeHtml(lineaCliente2) + '</div>' : ''}
          <div>${escapeHtml(cli.condicion || '')} ${escapeHtml(cli.cuit || p.cliente.cuil || '')}</div>
        </div>
        <div class="pq-cli-der">
          ${cli.vendedor ? '<div>Vendedor: ' + escapeHtml(cli.vendedor) + '</div>' : ''}
          ${p.cliente.telefono ? '<div>Tel.: ' + escapeHtml(p.cliente.telefono) + '</div>' : ''}
        </div>
      </section>

      <table class="pq-tabla">
        <thead>
          <tr>
            <th class="pq-cod">Cod. Artículo</th>
            <th>Descripción</th>
            <th class="pq-num">Cantidad</th>
            <th class="pq-uni"></th>
            <th class="pq-num">Precio Unit.</th>
            <th class="pq-num">IVA</th>
            <th class="pq-num">% Bonif.</th>
            <th class="pq-num">Importe</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <div class="pq-pie">
        <div class="pq-pie-izq">
          ${p.cliente.nota ? '<div class="pq-nota"><strong>Nota del cliente:</strong> ' + escapeHtml(p.cliente.nota) + '</div>' : ''}
          <div class="pq-validez">Presupuesto válido por ${DIAS_VALIDEZ} días — hasta el ${vence.toLocaleDateString('es-AR')}.</div>
        </div>

        <table class="pq-totales">
          <tr><td>Subtotal:</td><td class="pq-num">${money(t.subtotal)}</td></tr>
          <tr><td>Bonif.: ${t.pct > 0 ? t.pct.toLocaleString('es-AR') + '%' : ''}</td>
              <td class="pq-num">${money(t.descuento)}</td></tr>
          <tr><td>Recargo:</td><td class="pq-num">0,00</td></tr>
          <tr class="pq-sep"><td>Subtotal:</td><td class="pq-num">${money(t.total)}</td></tr>
          <tr><td>IVA:</td><td class="pq-num">0,00</td></tr>
          <tr><td>Percep.:</td><td class="pq-num">0,00</td></tr>
          <tr class="pq-total"><td>TOTAL:</td><td class="pq-num">${money(t.total)}</td></tr>
        </table>
      </div>
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
/* ── Servidor ─────────────────────────────────────── */
function cotRenderEstadoServidor(texto, estado) {
  const el = document.getElementById('cot-server-status');
  if (!el) return;
  el.className = 'cot-price-status cot-price-status--' + estado;
  el.innerHTML = texto;
}

/* Trae del servidor los pedidos que todavía no están en este navegador.
   No hace falta ninguna clave: alcanza con la sesión del panel. */
async function cotTraerDelServidor(avisar) {
  try {
    const res = await fetch('api.php?a=pedidos', { cache: 'no-store' });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.ok) {
      const motivo = data && data.error ? data.error : 'No se pudo conectar.';
      cotRenderEstadoServidor('<strong>Servidor:</strong> ' + escapeHtml(motivo), 'off');
      if (avisar) showToast(motivo, 'error', 5000);
      return 0;
    }

    const pedidos = cotLeerPedidos();
    const conocidos = new Set(pedidos.map(p => p.ref));
    let nuevos = 0;

    (data.pedidos || []).forEach(payload => {
      if (!payload || !Array.isArray(payload.i) || conocidos.has(payload.r)) return;
      pedidos.push(cotDesdePayload(payload));
      conocidos.add(payload.r);
      nuevos++;
    });

    if (nuevos) cotGuardarPedidos(pedidos);
    cotRenderEstadoServidor(
      `<strong>Conectado:</strong> ${data.total} pedido(s) en el servidor.`, 'on');
    return nuevos;
  } catch (e) {
    cotRenderEstadoServidor('<strong>Servidor:</strong> sin respuesta.', 'off');
    if (avisar) showToast('No se pudo conectar con el servidor', 'error');
    return 0;
  }
}

/* Los precios viven en el servidor, fuera de public_html, y sólo se
   entregan a quien tiene sesión abierta. Así el administrador los ve sin
   importar nada y los clientes no pueden pedirlos. */
async function cotCargarPreciosDelServidor() {
  try {
    const res = await fetch('api.php?a=precios', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) return false;

    const precios = data.precios || {};
    const limpio = {};
    Object.entries(precios).forEach(([k, v]) => {
      const n = Number(v);
      if (n > 0) limpio[k] = n;
    });

    cotPrecios = limpio;
    cotGuardarPrecios(cotPrecios);
    return true;
  } catch (e) {
    return false;
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

let cotIniciado = false;

async function initCotizador() {
  if (cotIniciado) return;
  if (!document.getElementById('cot-section')) return;
  cotIniciado = true;

  try {
    cotPrecios = cotLeerPrecios();
    await cotCargarCatalogo();
    await cotCargarPreciosDelServidor();
    await cotCargarClientes();
  } catch (e) {
    console.error('Cotizador: fallo al cargar catálogo o precios', e);
  }

  let nuevos = 0;
  try {
    nuevos = cotRecogerBandeja();
    nuevos += await cotTraerDelServidor(false);
  } catch (e) {
    console.error('Cotizador: fallo al traer pedidos', e);
    cotRenderEstadoServidor('<strong>Error al traer pedidos.</strong> ' + escapeHtml(e.message), 'off');
  }

  cotRenderEstadoPrecios();
  cotRenderLista();

  if (nuevos > 0) {
    showToast(`${nuevos} pedido(s) nuevo(s) recibido(s)`, 'success', 5000);
  }

  const actualizar = document.getElementById('cot-actualizar');
  if (actualizar) {
    actualizar.addEventListener('click', async () => {
      const n = await cotTraerDelServidor(true);
      cotRenderLista();
      showToast(n > 0 ? `${n} pedido(s) nuevo(s)` : 'No hay pedidos nuevos', n > 0 ? 'success' : 'info');
    });
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

// El panel avisa cuando hay sesión: recién ahí el servidor entrega
// pedidos y precios. Igual se intenta al cargar, por si el aviso no llega
// (sesión ya abierta, o un error que corta el arranque del panel): sin esa
// segunda vía el cotizador quedaba esperando para siempre.
document.addEventListener('distrijam:sesion-lista', initCotizador);

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const panel = document.getElementById('admin-dashboard');
    const visible = panel && getComputedStyle(panel).display !== 'none';
    if (visible) initCotizador();
  }, 600);
});
