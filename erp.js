/* ======================================================
   DISTRIJAM — erp.js
   Sistema Integral ERP:
   Resumen, Ventas, Etiquetas de Cajas, Facturación,
   Clientes y Cuentas Corrientes, Stock, Tareas, Finanzas
   y Configuración Multi-Rol.
   ====================================================== */

'use strict';

(function (global) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const money = (n) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2
  }).format(Number(n) || 0);

  const fmtFecha = (iso) => {
    if (!iso) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? String(iso) : dt.toLocaleDateString('es-AR');
  };

  const fmtFechaHora = (iso) => {
    if (!iso) return '—';
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime())
      ? String(iso)
      : dt.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const soloDigitos = (v) => String(v || '').replace(/[^0-9]/g, '');
  const hoyISO = () => new Date().toISOString().slice(0, 10);

  const LOCAL_SCOPE = (() => {
    const p = (window.location.pathname || '').split('/').filter(Boolean);
    return (p.length >= 2 && p[0] !== 'modelos') ? ('_' + p[0]) : '';
  })();
  const LOCAL_KEY = 'distrijam_erp_local_v1' + LOCAL_SCOPE;

  const VIEW_TITLES = {
    resumen: 'Resumen Operativo',
    ventas: 'Ventas y Cotizador',
    etiquetas: 'Etiquetas para Cajas',
    facturacion: 'Facturación y Comprobantes',
    clientes: 'Clientes y Estado de Cuentas',
    stock: 'Stock e Inventario',
    productos: 'Productos y Catálogo',
    tareas: 'Tareas Operativas',
    finanzas: 'Finanzas, Caja y Cheques',
    config: 'Configuración y Usuarios',
  };

  const ROL_VIEWS = {
    admin: Object.keys(VIEW_TITLES),
    ventas: ['resumen', 'ventas', 'etiquetas', 'facturacion', 'clientes', 'stock', 'productos', 'tareas'],
    deposito: ['resumen', 'etiquetas', 'stock', 'tareas', 'ventas'],
  };

  const ESTADOS_LOGISTICOS = {
    pendiente_armado: { label: 'Pendiente armado', cls: 'warn' },
    en_preparacion: { label: 'En preparación', cls: 'info' },
    empaquetado: { label: 'Empaquetado', cls: 'info' },
    despachado: { label: 'Despachado', cls: 'ok' },
    entregado: { label: 'Entregado', cls: 'ok' },
    anulado: { label: 'Anulado', cls: 'danger' },
  };

  const TIPOS_COMPROBANTE = {
    presupuesto_x: 'Presupuesto X',
    remito_r: 'Remito R',
    recibo_x: 'Recibo X',
    factura_a: 'Factura A',
    factura_b: 'Factura B',
    factura_c: 'Factura C',
    nota_credito_a: 'Nota de Crédito A',
    nota_credito_b: 'Nota de Crédito B',
    nota_credito_c: 'Nota de Crédito C',
    nota_debito_a: 'Nota de Débito A',
    nota_debito_b: 'Nota de Débito B',
    nota_debito_c: 'Nota de Débito C',
  };

  const state = {
    iniciado: false,
    modoLocal: false,
    user: { usuario: 'admin', nombre: 'Administrador', rol: 'admin' },
    activeView: 'resumen',
    config: {
      empresa: 'DISTRIJAM S.A.',
      subtitulo: 'DISTRIBUIDORA MAYORISTA',
      direccion: 'IBERA 1740',
      localidad: 'Corrientes',
      provincia: 'Corrientes',
      telefono: '3794 007195',
      whatsapp: '5493794007195',
      email: 'autoperforantes@distrijam.com.ar',
      cuit: '30-71566968-0',
      dgr: '30-71566968-0',
      inicioActividades: '01/08/2017',
      condicionIva: 'IVA Responsable Inscripto',
      puntoVenta: '0001',
      ivaPct: 21,
      diasValidez: 7,
      banco: '',
      titularCuenta: 'DISTRIJAM S.A.',
      cbu: '',
      aliasCbu: '',
      mostrarDisponibilidadCatalogo: false,
    },
    productos: [],
    variantes: [],       // [{ variantId, productId, nombre, medida, presentacion, category }]
    variantesMap: {},    // variantId -> obj
    precios: {},         // variantId -> number
    stock: {},           // variantId -> { actual, reservado, minimo, ubicacion, costo }
    stockMovs: [],
    clientes: {},
    ventas: [],
    comprobantes: [],
    ctacte: { movimientos: [], saldos: {} },
    tareas: [],
    finanzas: { saldos: { efectivo: 0, banco: 0, mercadopago: 0, cheques: 0 }, movimientos: [], cheques: [] },
    usuarios: [],

    // UI filters
    ventaSearch: '',
    ventaEstadoFiltro: 'todos',
    factTipoFiltro: 'todos',
    factSearch: '',
    factMes: '',
    cliSearch: '',
    cliSoloDeudores: false,
    cliSeleccionado: null,
    stkSearch: '',
    stkCat: 'all',
    stkFiltro: 'todos',
    stkTab: 'inventario',
    tskModo: 'kanban',
    tskCat: 'todos',
    finTab: 'movimientos',
    finCuenta: 'todos',
    etqFormato: 'termica',
    etqVentaId: '',
    etqDraft: {
      clienteNombre: '',
      direccion: '',
      localidad: 'Corrientes',
      provincia: 'Corrientes',
      telefono: '',
      cuit: '',
      transporte: '',
      ventaNumero: '',
      remitoNumero: '',
      bultos: 1,
      pesoKg: 0,
      fragil: false,
      notas: '',
      detalleBultos: [],
      fecha: hoyISO(),
    },
  };

  /* ─────────────── Persistencia Local Fallback & API ─────────────── */
  function leerLocal() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function guardarLocal() {
    if (!state.modoLocal) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({
        config: state.config,
        stock: state.stock,
        stockMovs: state.stockMovs,
        clientes: state.clientes,
        ventas: state.ventas,
        comprobantes: state.comprobantes,
        ctacte: state.ctacte,
        tareas: state.tareas,
        finanzas: state.finanzas,
        usuarios: state.usuarios,
      }));
    } catch (e) {}
  }

  async function apiGet(accion) {
    if (state.modoLocal) return null;
    const res = await fetch('api.php?a=' + encodeURIComponent(accion), { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      if (res.status === 403 || res.status === 401) throw Object.assign(new Error(data.error || 'No autorizado'), { status: res.status });
      throw new Error(data.error || 'Error de servidor');
    }
    return data;
  }

  async function apiPost(accion, body) {
    if (state.modoLocal) {
      return { ok: true, local: true };
    }
    const res = await fetch('api.php?a=' + encodeURIComponent(accion), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo completar la operación.');
    return data;
  }

  function notify(msg, type = 'info') {
    if (typeof global.showToast === 'function') global.showToast(esc(msg), type);
  }

  /* ─────────────── Carga de Datos ─────────────── */
  async function cargarCatalogoYPrecios() {
    try {
      const lista = await distrijamCatalogo({ incluirOcultos: true });
      state.productos = lista;
      state.variantes = [];
      state.variantesMap = {};
      lista.forEach((p) => {
        (p.variants || []).forEach((v) => {
          const obj = {
            variantId: v.id,
            productId: p.id,
            nombre: p.name,
            medida: v.medida || '',
            presentacion: v.presentacion || '',
            category: p.category || '',
          };
          state.variantes.push(obj);
          state.variantesMap[v.id] = obj;
        });
      });
    } catch (e) {}

    if (typeof global.cotPrecios === 'object' && Object.keys(global.cotPrecios).length) {
      state.precios = global.cotPrecios;
    } else if (!state.modoLocal) {
      try {
        const d = await apiGet('precios');
        if (d && d.precios) state.precios = d.precios;
      } catch (e) {}
    }
  }

  async function cargarTodoErp() {
    await cargarCatalogoYPrecios();

    if (state.modoLocal) {
      const loc = leerLocal();
      if (loc.config) state.config = { ...state.config, ...loc.config };
      if (loc.stock) state.stock = loc.stock;
      if (loc.stockMovs) state.stockMovs = loc.stockMovs;
      if (loc.clientes) state.clientes = loc.clientes;
      if (loc.ventas) state.ventas = loc.ventas;
      if (loc.comprobantes) state.comprobantes = loc.comprobantes;
      if (loc.ctacte) state.ctacte = loc.ctacte;
      if (loc.tareas) state.tareas = loc.tareas;
      if (loc.finanzas) state.finanzas = loc.finanzas;
      if (loc.usuarios) state.usuarios = loc.usuarios;
      renderAll();
      return;
    }

    const rol = state.user.rol || 'admin';
    const tareas = [
      apiGet('config_erp').then((d) => { state.config = { ...state.config, ...(d.config || {}) }; }).catch(() => {}),
      apiGet('stock').then((d) => { state.stock = d.stock || {}; state.stockMovs = d.movimientos || []; }).catch(() => {}),
      apiGet('clientes').then((d) => { state.clientes = d.clientes || {}; }).catch(() => {}),
      apiGet('ventas').then((d) => { state.ventas = d.ventas || []; }).catch(() => {}),
      apiGet('comprobantes').then((d) => { state.comprobantes = d.comprobantes || []; }).catch(() => {}),
      apiGet('tareas').then((d) => { state.tareas = d.tareas || []; }).catch(() => {}),
    ];

    if (rol === 'admin' || rol === 'ventas') {
      tareas.push(apiGet('ctacte').then((d) => {
        state.ctacte = { movimientos: d.movimientos || [], saldos: d.saldos || {} };
      }).catch(() => {}));
    }
    if (rol === 'admin') {
      tareas.push(apiGet('finanzas').then((d) => {
        state.finanzas = {
          saldos: d.saldos || { efectivo: 0, banco: 0, mercadopago: 0, cheques: 0 },
          movimientos: d.movimientos || [],
          cheques: d.cheques || [],
        };
      }).catch(() => {}));
      tareas.push(apiGet('usuarios').then((d) => { state.usuarios = d.usuarios || []; }).catch(() => {}));
    }

    await Promise.all(tareas);
    if (typeof global.cotClientes === 'object') {
      global.cotClientes = state.clientes;
      if (typeof global.cotRenderClientes === 'function') global.cotRenderClientes();
    }
    renderAll();
  }

  /* ─────────────── Navegación & Shell ─────────────── */
  function aplicarPermisosPorRol() {
    const rol = state.user.rol || 'admin';
    const permitidas = ROL_VIEWS[rol] || ROL_VIEWS.admin;
    document.querySelectorAll('#erp-nav .erp-nav-item').forEach((btn) => {
      const ok = permitidas.includes(btn.dataset.view);
      btn.style.display = ok ? '' : 'none';
    });

    const btnNueva = document.getElementById('erp-btn-nueva-venta');
    if (btnNueva) btnNueva.style.display = (rol === 'deposito') ? 'none' : '';

    const nomEl = document.getElementById('erp-user-nombre');
    const rolEl = document.getElementById('erp-user-rol');
    if (nomEl) nomEl.textContent = state.user.nombre || state.user.usuario || 'Administrador';
    if (rolEl) rolEl.textContent = rol.toUpperCase();

    if (!permitidas.includes(state.activeView)) {
      cambiarVista(permitidas[0]);
    }
  }

  function cambiarVista(view) {
    const rol = state.user.rol || 'admin';
    const permitidas = ROL_VIEWS[rol] || ROL_VIEWS.admin;
    if (!permitidas.includes(view)) view = permitidas[0];

    state.activeView = view;
    document.querySelectorAll('#erp-nav .erp-nav-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    document.querySelectorAll('.erp-view').forEach((sec) => {
      sec.classList.toggle('active', sec.dataset.view === view);
    });
    const titleEl = document.getElementById('erp-view-title');
    if (titleEl) titleEl.textContent = VIEW_TITLES[view] || 'Sistema ERP';

    const sb = document.getElementById('erp-sidebar');
    if (sb) sb.classList.remove('open');

    renderVistaActiva();
  }

  function actualizarContadoresSidebar() {
    const pedidosPend = (typeof global.cotLeerPedidos === 'function' ? global.cotLeerPedidos() : [])
      .filter((p) => p.estado === 'pendiente').length;
    const porEtiquetar = state.ventas.filter((v) => ['pendiente_armado', 'en_preparacion'].includes(v.estadoLogistico)).length;
    const stockBajo = state.variantes.filter((v) => {
      const s = state.stock[v.variantId];
      return s && s.minimo > 0 && s.actual <= s.minimo;
    }).length;
    const tareasAbiertas = state.tareas.filter((t) => t.estado !== 'completada').length;

    const setBadge = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n;
      el.style.display = n > 0 ? '' : 'none';
    };
    setBadge('nav-badge-ventas', pedidosPend);
    setBadge('nav-badge-etiquetas', porEtiquetar);
    setBadge('nav-badge-stock', stockBajo);
    setBadge('nav-badge-tareas', tareasAbiertas);
  }

  function renderAll() {
    actualizarContadoresSidebar();
    renderVistaActiva();
  }

  function renderVistaActiva() {
    switch (state.activeView) {
      case 'resumen': renderResumen(); break;
      case 'ventas': renderVentas(); break;
      case 'etiquetas': renderEtiquetas(); break;
      case 'facturacion': renderFacturacion(); break;
      case 'clientes': renderClientes(); break;
      case 'stock': renderStock(); break;
      case 'tareas': renderTareas(); break;
      case 'finanzas': renderFinanzas(); break;
      case 'config': renderConfig(); break;
      default: break;
    }
  }

  /* ─────────────── Modal Genérico ERP ─────────────── */
  function abrirModal({ title, bodyHtml, footHtml, wide = false, onMount }) {
    const overlay = document.getElementById('erp-modal-overlay');
    const box = document.getElementById('erp-modal-box');
    const t = document.getElementById('erp-modal-title');
    const b = document.getElementById('erp-modal-body');
    const f = document.getElementById('erp-modal-foot');
    if (!overlay || !box || !t || !b || !f) return;

    box.classList.toggle('erp-modal--wide', Boolean(wide));
    t.textContent = title || '';
    b.innerHTML = bodyHtml || '';
    f.innerHTML = footHtml || '<button type="button" class="erp-btn" id="erp-m-cerrar">Cerrar</button>';
    overlay.classList.add('open');

    const closeBtn = f.querySelector('#erp-m-cerrar');
    if (closeBtn) closeBtn.addEventListener('click', cerrarModal);
    if (typeof onMount === 'function') onMount(b, f);
  }

  function cerrarModal() {
    const overlay = document.getElementById('erp-modal-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  /* ─────────────── VISTA 1: RESUMEN ─────────────── */
  function renderResumen() {
    const root = document.getElementById('erp-resumen-root');
    if (!root) return;

    const mesActual = new Date().toISOString().slice(0, 7);
    const ventasMes = state.ventas.filter((v) => v.estadoLogistico !== 'anulado' && String(v.fecha || '').startsWith(mesActual));
    const totalVentasMes = ventasMes.reduce((s, v) => s + (Number(v.total) || 0), 0);
    const totalPorCobrar = Object.values(state.ctacte.saldos || {}).reduce((s, x) => s + Math.max(0, Number(x.saldo) || 0), 0);
    const deudoresCount = Object.values(state.ctacte.saldos || {}).filter((x) => (Number(x.saldo) || 0) > 1).length;
    const porArmar = state.ventas.filter((v) => ['pendiente_armado', 'en_preparacion'].includes(v.estadoLogistico));
    const stockCritico = state.variantes.filter((v) => {
      const s = state.stock[v.variantId];
      return s && s.minimo > 0 && s.actual <= s.minimo;
    });
    const tareasPend = state.tareas.filter((t) => t.estado !== 'completada');
    const pedidosWeb = (typeof global.cotLeerPedidos === 'function' ? global.cotLeerPedidos() : [])
      .filter((p) => p.estado !== 'enviado').slice(0, 5);

    const esAdmin = state.user.rol === 'admin';
    const saldoCajaTotal = esAdmin
      ? Object.values(state.finanzas.saldos || {}).reduce((s, n) => s + (Number(n) || 0), 0)
      : 0;

    root.innerHTML = `
      <div class="erp-kpi-grid">
        <div class="erp-kpi erp-kpi--accent">
          <div class="erp-kpi-lbl">Ventas del mes</div>
          <div class="erp-kpi-val">${state.user.rol === 'deposito' ? `${ventasMes.length} pedidos` : money(totalVentasMes)}</div>
          <div class="erp-kpi-meta">${ventasMes.length} operación(es) confirmada(s)</div>
        </div>
        <div class="erp-kpi">
          <div class="erp-kpi-lbl">${state.user.rol === 'deposito' ? 'Pedidos por preparar' : 'Por cobrar en Cta. Cte.'}</div>
          <div class="erp-kpi-val">${state.user.rol === 'deposito' ? porArmar.length : money(totalPorCobrar)}</div>
          <div class="erp-kpi-meta">${state.user.rol === 'deposito' ? 'Pendientes de armado/empaque' : `${deudoresCount} cliente(s) con saldo`}</div>
        </div>
        <div class="erp-kpi ${stockCritico.length ? 'erp-kpi--warn' : 'erp-kpi--ok'}">
          <div class="erp-kpi-lbl">Alertas de Stock Mínimo</div>
          <div class="erp-kpi-val">${stockCritico.length}</div>
          <div class="erp-kpi-meta">${state.variantes.length} SKUs en catálogo</div>
        </div>
        <div class="erp-kpi">
          <div class="erp-kpi-lbl">${esAdmin ? 'Disponibilidad Caja / Bancos' : 'Tareas Abiertas'}</div>
          <div class="erp-kpi-val">${esAdmin ? money(saldoCajaTotal) : tareasPend.length}</div>
          <div class="erp-kpi-meta">${esAdmin ? `${tareasPend.length} tarea(s) abierta(s)` : 'Pendientes o en curso'}</div>
        </div>
      </div>

      <div class="erp-grid-2">
        <div class="erp-panel">
          <div class="erp-panel-head">
            <div>
              <h2>Despacho y Pedidos en Curso</h2>
              <p class="erp-panel-sub">Ventas listas para preparar, etiquetar o entregar.</p>
            </div>
            <button type="button" class="erp-btn erp-btn--sm" data-goto="etiquetas">Ir a Etiquetas</button>
          </div>
          ${porArmar.length === 0
            ? `<div class="erp-empty"><strong>Sin pendientes de despacho</strong>No hay ventas esperando armado en depósito.</div>`
            : `<div class="erp-table-wrap"><table class="erp-table">
                <thead><tr><th>Venta</th><th>Cliente</th><th>Bultos</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  ${porArmar.slice(0, 6).map((v) => {
                    const st = ESTADOS_LOGISTICOS[v.estadoLogistico] || ESTADOS_LOGISTICOS.pendiente_armado;
                    return `<tr>
                      <td class="erp-mono"><strong>${esc(v.numero)}</strong></td>
                      <td>${esc(v.clienteNombre)}<br><small style="color:var(--erp-ink-muted);">${esc(v.transporte || 'Retira / Propio')}</small></td>
                      <td class="num">${v.bultos || 1}</td>
                      <td><span class="erp-badge erp-badge--${st.cls}">${st.label}</span></td>
                      <td class="num"><button type="button" class="erp-btn erp-btn--sm erp-go-etq" data-id="${esc(v.id)}">Etiquetas</button></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table></div>`}
        </div>

        <div class="erp-panel">
          <div class="erp-panel-head">
            <div>
              <h2>Cotizaciones Web Recientes</h2>
              <p class="erp-panel-sub">Solicitudes recibidas desde el catálogo online.</p>
            </div>
            <button type="button" class="erp-btn erp-btn--sm" data-goto="ventas">Ver Cotizador</button>
          </div>
          ${pedidosWeb.length === 0
            ? `<div class="erp-empty"><strong>Sin cotizaciones pendientes</strong>Todos los pedidos web fueron procesados.</div>`
            : `<div class="erp-table-wrap"><table class="erp-table">
                <thead><tr><th>Ref.</th><th>Cliente</th><th>Ítems</th><th></th></tr></thead>
                <tbody>
                  ${pedidosWeb.map((p) => `<tr>
                    <td class="erp-mono">${esc(p.ref)}</td>
                    <td>${esc(p.cliente?.nombre || 'Sin nombre')}<br><small style="color:var(--erp-ink-muted);">${fmtFechaHora(p.fecha)}</small></td>
                    <td class="num">${(p.items || []).length}</td>
                    <td class="num"><button type="button" class="erp-btn erp-btn--sm erp-open-cot" data-ref="${esc(p.ref)}">Cotizar</button></td>
                  </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>
      </div>

      <div class="erp-grid-2">
        <div class="erp-panel">
          <div class="erp-panel-head">
            <div>
              <h2>Reposición de Stock</h2>
              <p class="erp-panel-sub">Artículos por debajo o en el límite del stock mínimo.</p>
            </div>
            <button type="button" class="erp-btn erp-btn--sm" data-goto="stock">Ver Inventario</button>
          </div>
          ${stockCritico.length === 0
            ? `<div class="erp-empty"><strong>Stock saludable</strong>Ningún SKU con mínimo configurado está en nivel crítico.</div>`
            : `<div class="erp-table-wrap"><table class="erp-table">
                <thead><tr><th>SKU</th><th>Producto</th><th class="num">Actual</th><th class="num">Mínimo</th></tr></thead>
                <tbody>
                  ${stockCritico.slice(0, 6).map((v) => {
                    const s = state.stock[v.variantId];
                    return `<tr>
                      <td class="erp-mono">${esc(v.variantId)}</td>
                      <td>${esc(v.nombre)} <small style="color:var(--erp-ink-muted);">${esc(v.medida)}</small></td>
                      <td class="num"><span class="erp-badge erp-badge--danger">${s.actual}</span></td>
                      <td class="num">${s.minimo}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table></div>`}
        </div>

        <div class="erp-panel">
          <div class="erp-panel-head">
            <div>
              <h2>Tareas Activas</h2>
              <p class="erp-panel-sub">Pendientes para hoy y seguimiento por sector.</p>
            </div>
            <button type="button" class="erp-btn erp-btn--sm" data-goto="tareas">Ir a Tareas</button>
          </div>
          ${tareasPend.length === 0
            ? `<div class="erp-empty"><strong>Todo al día</strong>No hay tareas pendientes en el tablero.</div>`
            : `<div class="erp-table-wrap"><table class="erp-table">
                <thead><tr><th>Tarea</th><th>Sector</th><th>Prioridad</th></tr></thead>
                <tbody>
                  ${tareasPend.slice(0, 6).map((t) => `<tr>
                    <td><strong>${esc(t.titulo)}</strong></td>
                    <td><span class="erp-badge erp-badge--neutral">${esc((t.asignadoRol || t.categoria || 'general').toUpperCase())}</span></td>
                    <td><span class="erp-badge erp-badge--${t.prioridad === 'alta' ? 'danger' : (t.prioridad === 'media' ? 'warn' : 'info')}">${esc(t.prioridad)}</span></td>
                  </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>
      </div>`;

    root.querySelectorAll('[data-goto]').forEach((b) => {
      b.addEventListener('click', () => cambiarVista(b.dataset.goto));
    });
    root.querySelectorAll('.erp-go-etq').forEach((b) => {
      b.addEventListener('click', () => abrirEtiquetasDeVenta(b.dataset.id));
    });
    root.querySelectorAll('.erp-open-cot').forEach((b) => {
      b.addEventListener('click', () => {
        cambiarVista('ventas');
        setVentasSubtab('cotizador');
        if (typeof global.cotAbrir === 'function') global.cotAbrir(b.dataset.ref);
      });
    });
  }

  /* ─────────────── VISTA 2: VENTAS Y COTIZADOR ─────────────── */
  function setVentasSubtab(tab) {
    document.querySelectorAll('#erp-ventas-tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.vtab === tab);
    });
    const cotEl = document.getElementById('erp-vtab-cotizador');
    const confEl = document.getElementById('erp-vtab-confirmadas');
    if (cotEl) cotEl.style.display = tab === 'cotizador' ? '' : 'none';
    if (confEl) confEl.style.display = tab === 'confirmadas' ? '' : 'none';
  }

  function renderVentas() {
    const root = document.getElementById('erp-ventas-root');
    if (!root) return;

    const q = state.ventaSearch.trim().toLowerCase();
    let lista = state.ventas.filter((v) => {
      if (state.ventaEstadoFiltro !== 'todos' && v.estadoLogistico !== state.ventaEstadoFiltro) return false;
      if (!q) return true;
      return [v.numero, v.clienteNombre, v.clienteCuit, v.transporte, v.pedidoRef]
        .some((x) => String(x || '').toLowerCase().includes(q));
    });

    const esAdmin = state.user.rol === 'admin';
    const esDeposito = state.user.rol === 'deposito';

    root.innerHTML = `
      <div class="erp-panel">
        <div class="erp-panel-head">
          <div>
            <h2>Ventas Confirmadas</h2>
            <p class="erp-panel-sub">Historial operativo con descuento de stock, logística, facturación y cobros.</p>
          </div>
          ${esDeposito ? '' : '<button type="button" class="erp-btn erp-btn--pri" id="erp-vta-new-btn">+ Nueva Venta Directa</button>'}
        </div>

        <div class="erp-toolbar">
          <input type="search" class="erp-input" id="erp-vta-search" value="${esc(state.ventaSearch)}" placeholder="Buscar por N° venta, cliente, CUIT o transporte..." style="flex:1; min-width:220px;" />
          <select class="erp-select" id="erp-vta-estado">
            <option value="todos"${state.ventaEstadoFiltro === 'todos' ? ' selected' : ''}>Todos los estados</option>
            ${Object.entries(ESTADOS_LOGISTICOS).map(([k, v]) => `<option value="${k}"${state.ventaEstadoFiltro === k ? ' selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>

        ${lista.length === 0
          ? `<div class="erp-empty"><strong>No hay ventas registradas con ese filtro</strong>Confirmá una cotización web o creá una nueva venta directa.</div>`
          : `<div class="erp-table-wrap"><table class="erp-table">
              <thead>
                <tr>
                  <th>N° Venta</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Condición</th>
                  <th>Pago</th>
                  <th>Logística</th>
                  <th class="num">Bultos</th>
                  ${esDeposito ? '' : '<th class="num">Total</th>'}
                  <th class="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${lista.map((v) => {
                  const pagoCls = v.estadoPago === 'pagado' ? 'ok' : (v.estadoPago === 'parcial' ? 'info' : (v.estadoPago === 'anulado' ? 'danger' : 'warn'));
                  return `<tr>
                    <td class="erp-mono"><strong>${esc(v.numero)}</strong>${v.pedidoRef ? `<div style="font-size:0.7rem;color:var(--erp-ink-muted);">Ped. ${esc(v.pedidoRef)}</div>` : ''}</td>
                    <td>${fmtFecha(v.fecha)}</td>
                    <td><strong>${esc(v.clienteNombre)}</strong><div style="font-size:0.74rem;color:var(--erp-ink-muted);">${esc(v.clienteCuit || '')}</div></td>
                    <td>${v.condicionVenta === 'contado' ? 'Contado' : 'Cuenta Cte.'}</td>
                    <td><span class="erp-badge erp-badge--${pagoCls}">${esc((v.estadoPago || 'pendiente').toUpperCase())}</span></td>
                    <td>
                      <select class="erp-select erp-vta-log-sel" data-id="${esc(v.id)}" style="height:30px; font-size:0.76rem;" ${v.estadoLogistico === 'anulado' ? 'disabled' : ''}>
                        ${Object.entries(ESTADOS_LOGISTICOS).map(([k, info]) => {
                          if (k === 'anulado' && !esAdmin && v.estadoLogistico !== 'anulado') return '';
                          return `<option value="${k}"${v.estadoLogistico === k ? ' selected' : ''}>${info.label}</option>`;
                        }).join('')}
                      </select>
                    </td>
                    <td class="num">${v.bultos || 1}</td>
                    ${esDeposito ? '' : `<td class="num"><strong>${money(v.total)}</strong></td>`}
                    <td class="num" style="white-space:nowrap;">
                      <button type="button" class="erp-btn erp-btn--sm erp-vta-etq" data-id="${esc(v.id)}" title="Imprimir etiquetas de cajas">Etiquetas</button>
                      <button type="button" class="erp-btn erp-btn--sm erp-vta-rem" data-id="${esc(v.id)}" title="Imprimir Remito R">Remito</button>
                      ${esDeposito ? '' : `<button type="button" class="erp-btn erp-btn--sm erp-vta-fac" data-id="${esc(v.id)}" title="Emitir o registrar factura">Facturar</button>`}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table></div>`}
      </div>`;

    const btnNew = document.getElementById('erp-vta-new-btn');
    if (btnNew) btnNew.addEventListener('click', () => abrirModalVenta());
    const sInp = document.getElementById('erp-vta-search');
    if (sInp) sInp.addEventListener('input', () => { state.ventaSearch = sInp.value; renderVentas(); });
    const eSel = document.getElementById('erp-vta-estado');
    if (eSel) eSel.addEventListener('change', () => { state.ventaEstadoFiltro = eSel.value; renderVentas(); });

    root.querySelectorAll('.erp-vta-log-sel').forEach((sel) => {
      sel.addEventListener('change', async () => {
        if (sel.value === 'anulado' && !confirm('¿Anular esta venta? Se devolverá el stock y se anulará el cargo en cuenta corriente.')) {
          renderVentas();
          return;
        }
        try {
          if (state.modoLocal) {
            const v = state.ventas.find((x) => x.id === sel.dataset.id);
            if (v) v.estadoLogistico = sel.value;
            guardarLocal();
          } else {
            await apiPost('venta_actualizar', { id: sel.dataset.id, estadoLogistico: sel.value });
            await cargarTodoErp();
          }
          notify('Estado logístico actualizado', 'success');
          renderAll();
        } catch (err) {
          notify(err.message, 'error');
          renderVentas();
        }
      });
    });

    root.querySelectorAll('.erp-vta-etq').forEach((b) => {
      b.addEventListener('click', () => abrirEtiquetasDeVenta(b.dataset.id));
    });
    root.querySelectorAll('.erp-vta-rem').forEach((b) => {
      b.addEventListener('click', () => emitirOImprimirRemitoDeVenta(b.dataset.id));
    });
    root.querySelectorAll('.erp-vta-fac').forEach((b) => {
      b.addEventListener('click', () => {
        const v = state.ventas.find((x) => x.id === b.dataset.id);
        if (v) abrirModalComprobante({ venta: v, tipoInicial: 'factura_a' });
      });
    });
  }

  function emitirOImprimirRemitoDeVenta(ventaId) {
    const v = state.ventas.find((x) => x.id === ventaId);
    if (!v) return;
    const cli = state.clientes[v.clienteClave] || {};
    const comp = {
      tipo: 'remito_r',
      numero: `REM-${state.config.puntoVenta || '0001'}-${(v.numero || '').replace(/\D/g, '')}`,
      fechaEmision: String(v.fecha || '').slice(0, 10),
      ventaNumero: v.numero,
      clienteNombre: v.clienteNombre,
      clienteCuit: v.clienteCuit,
      clienteCondicion: cli.condicion || '',
      clienteDireccion: [v.direccionEntrega || cli.direccion, v.localidadEntrega || cli.localidad, v.provinciaEntrega || cli.provincia].filter(Boolean).join(' · '),
      clienteTelefono: v.clienteTelefono || cli.telefono || '',
      vendedor: v.vendedor || '',
      transporte: v.transporte || '',
      bultos: v.bultos || 1,
      items: v.items || [],
      observaciones: v.notasDespacho || '',
    };
    ErpPrint.imprimirComprobante(comp, state.config, { valorizado: false });
  }

  function abrirModalVenta(pedido = null, cliDatos = null) {
    const draft = {
      pedidoRef: pedido ? pedido.ref : '',
      clienteClave: cliDatos ? soloDigitos(cliDatos.cuit) : '',
      clienteNombre: (cliDatos && cliDatos.nombre) || (pedido && pedido.cliente?.nombre) || '',
      clienteCuit: (cliDatos && cliDatos.cuit) || (pedido && pedido.cliente?.cuil) || '',
      clienteTelefono: (pedido && pedido.cliente?.telefono) || '',
      transporte: '',
      direccionEntrega: (cliDatos && cliDatos.direccion) || '',
      localidadEntrega: (cliDatos && cliDatos.localidad) || '',
      provinciaEntrega: (cliDatos && cliDatos.provincia) || '',
      descuentoPct: pedido ? (Number(pedido.descuento) || 0) : 0,
      ivaPct: Number(state.config.ivaPct ?? 21),
      percepcionMonto: 0,
      condicionVenta: 'ctacte',
      cuentaCobro: 'efectivo',
      bultos: 1,
      crearTareaDeposito: true,
      items: pedido ? (pedido.items || []).map((it) => ({
        variantId: it.variantId,
        nombre: it.nombre,
        medida: it.medida,
        presentacion: it.presentacion,
        qty: Number(it.qty) || 1,
        precio: Number(it.precio) || 0,
      })) : [],
    };

    if (draft.clienteClave && state.clientes[draft.clienteClave]) {
      const c = state.clientes[draft.clienteClave];
      draft.transporte = c.transporte || '';
      draft.direccionEntrega = c.direccionEntrega || c.direccion || draft.direccionEntrega;
      draft.localidadEntrega = c.localidad || draft.localidadEntrega;
      draft.provinciaEntrega = c.provincia || draft.provinciaEntrega;
      if (!pedido && Number(c.descuentoHabitual) > 0) draft.descuentoPct = Number(c.descuentoHabitual);
    }

    const calcTotales = () => {
      const sub = draft.items.reduce((s, it) => s + (Number(it.precio) || 0) * (Number(it.qty) || 0), 0);
      const desc = sub * ((Number(draft.descuentoPct) || 0) / 100);
      const neto = sub - desc;
      const iva = neto * ((Number(draft.ivaPct) || 0) / 100);
      const total = neto + iva + (Number(draft.percepcionMonto) || 0);
      return { sub, desc, neto, iva, total };
    };

    abrirModal({
      title: pedido ? `Confirmar Venta · Pedido ${pedido.ref}` : 'Nueva Venta',
      wide: true,
      bodyHtml: `
        <div class="erp-field-row">
          <div class="erp-field erp-ac-wrap">
            <label for="nv-cli-search">Buscar cliente guardado (nombre o CUIT)</label>
            <input type="text" class="erp-input" id="nv-cli-search" placeholder="Escribí para autocompletar..." autocomplete="off" />
            <div class="erp-ac-list" id="nv-cli-ac" style="display:none;"></div>
          </div>
          <div class="erp-field">
            <label for="nv-condicion">Condición de Venta</label>
            <select class="erp-select" id="nv-condicion">
              <option value="ctacte">Cuenta Corriente (genera saldo pendiente)</option>
              <option value="contado">Contado (cobra y emite Recibo X ahora)</option>
            </select>
          </div>
        </div>

        <div id="nv-alerta-credito" style="display:none; margin-bottom:12px; padding:10px 12px; border-radius:8px; background:var(--erp-warn-soft); color:var(--erp-warn); font-size:0.82rem; font-weight:600;"></div>

        <div class="erp-field-row-3">
          <div class="erp-field">
            <label for="nv-cli-nombre">Razón Social / Cliente *</label>
            <input type="text" class="erp-input" id="nv-cli-nombre" value="${esc(draft.clienteNombre)}" required />
          </div>
          <div class="erp-field">
            <label for="nv-cli-cuit">CUIT / CUIL *</label>
            <input type="text" class="erp-input" id="nv-cli-cuit" value="${esc(draft.clienteCuit)}" placeholder="XX-XXXXXXXX-X" />
          </div>
          <div class="erp-field">
            <label for="nv-cli-tel">Teléfono</label>
            <input type="text" class="erp-input" id="nv-cli-tel" value="${esc(draft.clienteTelefono)}" />
          </div>
        </div>

        <div class="erp-field-row-3">
          <div class="erp-field">
            <label for="nv-transporte">Transporte / Expreso</label>
            <input type="text" class="erp-input" id="nv-transporte" value="${esc(draft.transporte)}" placeholder="Ej: Vía Cargo, Cruz del Sur..." />
          </div>
          <div class="erp-field">
            <label for="nv-dir">Dirección de Entrega</label>
            <input type="text" class="erp-input" id="nv-dir" value="${esc(draft.direccionEntrega)}" />
          </div>
          <div class="erp-field">
            <label for="nv-loc">Localidad / Provincia</label>
            <input type="text" class="erp-input" id="nv-loc" value="${esc([draft.localidadEntrega, draft.provinciaEntrega].filter(Boolean).join(', '))}" />
          </div>
        </div>

        <div class="erp-field erp-ac-wrap">
          <label for="nv-prod-search">Agregar artículo por código SKU, nombre o medida</label>
          <input type="text" class="erp-input" id="nv-prod-search" placeholder="Buscar producto para agregar al detalle..." autocomplete="off" />
          <div class="erp-ac-list" id="nv-prod-ac" style="display:none;"></div>
        </div>

        <div class="erp-table-wrap" style="margin-bottom:14px;">
          <table class="erp-table">
            <thead>
              <tr><th>SKU</th><th>Producto</th><th class="num">Stock</th><th class="num">Cant.</th><th class="num">Precio Unit.</th><th class="num">Subtotal</th><th></th></tr>
            </thead>
            <tbody id="nv-items-body"></tbody>
          </table>
        </div>

        <div class="erp-field-row-3">
          <div class="erp-field">
            <label for="nv-desc">Bonificación (%)</label>
            <input type="number" step="0.5" min="0" max="100" class="erp-input" id="nv-desc" value="${draft.descuentoPct}" />
          </div>
          <div class="erp-field">
            <label for="nv-iva">IVA (%)</label>
            <input type="number" step="0.5" min="0" max="50" class="erp-input" id="nv-iva" value="${draft.ivaPct}" />
          </div>
          <div class="erp-field">
            <label for="nv-bultos">Bultos / Cajas estimadas</label>
            <input type="number" min="1" class="erp-input" id="nv-bultos" value="${draft.bultos}" />
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 14px; background:var(--erp-surface-2); border:1px solid var(--erp-border); border-radius:8px;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="display:flex; align-items:center; gap:7px; font-size:0.82rem; font-weight:600;">
              <input type="checkbox" id="nv-crear-tarea" checked /> Crear tarea automática de armado para Depósito
            </label>
            <div id="nv-cuenta-wrap" style="display:none;">
              <label style="font-size:0.78rem; margin-right:6px;">Cuenta de cobro contado:</label>
              <select class="erp-select" id="nv-cuenta" style="height:30px;">
                <option value="efectivo">Efectivo / Caja</option>
                <option value="banco">Banco / Transferencia</option>
                <option value="mercadopago">MercadoPago</option>
              </select>
            </div>
          </div>
          <div id="nv-totales-box" class="erp-num" style="text-align:right; font-size:0.86rem;"></div>
        </div>`,
      footHtml: `
        <button type="button" class="erp-btn" id="nv-cancel">Cancelar</button>
        <button type="button" class="erp-btn erp-btn--pri" id="nv-confirm">Confirmar Venta</button>`,
      onMount: (body, foot) => {
        const renderItems = () => {
          const tb = body.querySelector('#nv-items-body');
          if (!draft.items.length) {
            tb.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--erp-ink-muted); padding:18px;">Buscá arriba para agregar productos a la venta.</td></tr>';
          } else {
            tb.innerHTML = draft.items.map((it, i) => {
              const stk = getStock(it.variantId);
              return `<tr>
                <td class="erp-mono">${esc(it.variantId)}</td>
                <td><strong>${esc(it.nombre)}</strong><div style="font-size:0.74rem;color:var(--erp-ink-muted);">${esc(it.medida)} · ${esc(it.presentacion)}</div></td>
                <td class="num"><span class="erp-badge erp-badge--${stk >= it.qty ? 'ok' : (stk > 0 ? 'warn' : 'danger')}">${stk}</span></td>
                <td class="num"><input type="number" min="1" class="erp-input nv-qty" data-i="${i}" value="${it.qty}" style="width:74px; text-align:right; height:30px;" /></td>
                <td class="num"><input type="number" min="0" step="0.01" class="erp-input nv-prc" data-i="${i}" value="${it.precio}" style="width:105px; text-align:right; height:30px;" /></td>
                <td class="num"><strong>${money(it.qty * it.precio)}</strong></td>
                <td class="num"><button type="button" class="erp-btn erp-btn--sm erp-btn--danger nv-del" data-i="${i}">✕</button></td>
              </tr>`;
            }).join('');
          }

          tb.querySelectorAll('.nv-qty').forEach((inp) => {
            inp.addEventListener('input', () => {
              draft.items[Number(inp.dataset.i)].qty = Math.max(1, Number(inp.value) || 1);
              renderTotales();
              const tr = inp.closest('tr');
              if (tr) tr.children[5].innerHTML = `<strong>${money(draft.items[Number(inp.dataset.i)].qty * draft.items[Number(inp.dataset.i)].precio)}</strong>`;
            });
          });
          tb.querySelectorAll('.nv-prc').forEach((inp) => {
            inp.addEventListener('input', () => {
              draft.items[Number(inp.dataset.i)].precio = Math.max(0, Number(inp.value) || 0);
              renderTotales();
              const tr = inp.closest('tr');
              if (tr) tr.children[5].innerHTML = `<strong>${money(draft.items[Number(inp.dataset.i)].qty * draft.items[Number(inp.dataset.i)].precio)}</strong>`;
            });
          });
          tb.querySelectorAll('.nv-del').forEach((b) => {
            b.addEventListener('click', () => {
              draft.items.splice(Number(b.dataset.i), 1);
              renderItems();
              renderTotales();
            });
          });
        };

        const checkCredito = () => {
          const al = body.querySelector('#nv-alerta-credito');
          const cuit = soloDigitos(body.querySelector('#nv-cli-cuit').value);
          const cli = state.clientes[cuit];
          const cond = body.querySelector('#nv-condicion').value;
          if (!al || cond !== 'ctacte' || !cli || !(Number(cli.limiteCredito) > 0)) {
            if (al) al.style.display = 'none';
            return;
          }
          const saldoActual = Number(state.ctacte.saldos?.[cuit]?.saldo || 0);
          const { total } = calcTotales();
          if (saldoActual + total > Number(cli.limiteCredito)) {
            al.textContent = `Atención: Saldo actual (${money(saldoActual)}) + esta venta (${money(total)}) supera el límite de crédito (${money(cli.limiteCredito)}).`;
            al.style.display = 'block';
          } else {
            al.style.display = 'none';
          }
        };

        const renderTotales = () => {
          const t = calcTotales();
          body.querySelector('#nv-totales-box').innerHTML = `
            <div>Subtotal: ${money(t.sub)} ${t.desc > 0 ? `· Bonif: −${money(t.desc)}` : ''} · IVA: ${money(t.iva)}</div>
            <div style="font-size:1.15rem; font-weight:800; color:var(--erp-ink); margin-top:2px;">TOTAL: ${money(t.total)}</div>`;
          checkCredito();
        };

        renderItems();
        renderTotales();

        body.querySelector('#nv-condicion').addEventListener('change', (e) => {
          body.querySelector('#nv-cuenta-wrap').style.display = e.target.value === 'contado' ? 'block' : 'none';
          checkCredito();
        });
        body.querySelector('#nv-desc').addEventListener('input', (e) => { draft.descuentoPct = Number(e.target.value) || 0; renderTotales(); });
        body.querySelector('#nv-iva').addEventListener('input', (e) => { draft.ivaPct = Number(e.target.value) || 0; renderTotales(); });

        // Autocomplete cliente
        const cliInput = body.querySelector('#nv-cli-search');
        const cliAc = body.querySelector('#nv-cli-ac');
        cliInput.addEventListener('input', () => {
          const q = cliInput.value.trim().toLowerCase();
          if (q.length < 2) { cliAc.style.display = 'none'; return; }
          const hits = Object.entries(state.clientes).filter(([k, c]) =>
            k.includes(q.replace(/\D/g, '') || '___') || String(c.nombre || '').toLowerCase().includes(q)
          ).slice(0, 8);
          if (!hits.length) { cliAc.style.display = 'none'; return; }
          cliAc.innerHTML = hits.map(([k, c]) => `
            <button type="button" class="erp-ac-opt" data-k="${esc(k)}">
              <span><strong>${esc(c.nombre)}</strong> <small>${esc(c.cuit || k)}</small></span>
              <small>${esc(c.localidad || '')}</small>
            </button>`).join('');
          cliAc.style.display = 'block';
          cliAc.querySelectorAll('.erp-ac-opt').forEach((opt) => {
            opt.addEventListener('click', () => {
              const c = state.clientes[opt.dataset.k];
              if (!c) return;
              body.querySelector('#nv-cli-nombre').value = c.nombre || '';
              body.querySelector('#nv-cli-cuit').value = c.cuit || opt.dataset.k;
              body.querySelector('#nv-cli-tel').value = c.telefono || '';
              body.querySelector('#nv-transporte').value = c.transporte || '';
              body.querySelector('#nv-dir').value = c.direccionEntrega || c.direccion || '';
              body.querySelector('#nv-loc').value = [c.localidad, c.provincia].filter(Boolean).join(', ');
              if (Number(c.descuentoHabitual) > 0) {
                draft.descuentoPct = Number(c.descuentoHabitual);
                body.querySelector('#nv-desc').value = draft.descuentoPct;
                renderTotales();
              }
              cliAc.style.display = 'none';
              cliInput.value = '';
              checkCredito();
            });
          });
        });

        // Autocomplete producto
        const prodInput = body.querySelector('#nv-prod-search');
        const prodAc = body.querySelector('#nv-prod-ac');
        prodInput.addEventListener('input', () => {
          const q = prodInput.value.trim().toLowerCase();
          if (q.length < 2) { prodAc.style.display = 'none'; return; }
          const hits = state.variantes.filter((v) =>
            v.variantId.toLowerCase().includes(q) ||
            v.nombre.toLowerCase().includes(q) ||
            v.medida.toLowerCase().includes(q)
          ).slice(0, 12);
          if (!hits.length) { prodAc.style.display = 'none'; return; }
          prodAc.innerHTML = hits.map((v) => {
            const p = Number(state.precios[v.variantId]) || 0;
            return `<button type="button" class="erp-ac-opt" data-vid="${esc(v.variantId)}">
              <span><strong>${esc(v.nombre)}</strong> <small>${esc(v.medida)} (${esc(v.variantId)})</small></span>
              <span class="erp-num">Stock ${getStock(v.variantId)} · <strong>${p ? money(p) : 's/p'}</strong></span>
            </button>`;
          }).join('');
          prodAc.style.display = 'block';
          prodAc.querySelectorAll('.erp-ac-opt').forEach((opt) => {
            opt.addEventListener('click', () => {
              const v = state.variantesMap[opt.dataset.vid];
              if (!v) return;
              const ya = draft.items.find((x) => x.variantId === v.variantId);
              if (ya) ya.qty += 1;
              else draft.items.push({
                variantId: v.variantId,
                nombre: v.nombre,
                medida: v.medida,
                presentacion: v.presentacion,
                qty: 1,
                precio: Number(state.precios[v.variantId]) || 0,
              });
              prodAc.style.display = 'none';
              prodInput.value = '';
              renderItems();
              renderTotales();
            });
          });
        });

        foot.querySelector('#nv-cancel').addEventListener('click', cerrarModal);
        foot.querySelector('#nv-confirm').addEventListener('click', async () => {
          const cliNombre = body.querySelector('#nv-cli-nombre').value.trim();
          const cliCuit = body.querySelector('#nv-cli-cuit').value.trim();
          const cond = body.querySelector('#nv-condicion').value;
          if (!cliNombre) { notify('Ingresá el nombre del cliente.', 'error'); return; }
          if (cond === 'ctacte' && !soloDigitos(cliCuit)) { notify('Para Cuenta Corriente hace falta el CUIT/CUIL.', 'error'); return; }
          if (!draft.items.length) { notify('Agregá al menos un producto.', 'error'); return; }

          const locParts = body.querySelector('#nv-loc').value.split(',').map((s) => s.trim());
          const payload = {
            pedidoRef: draft.pedidoRef,
            clienteClave: soloDigitos(cliCuit),
            clienteNombre: cliNombre,
            clienteCuit: cliCuit,
            clienteTelefono: body.querySelector('#nv-cli-tel').value.trim(),
            transporte: body.querySelector('#nv-transporte').value.trim(),
            direccionEntrega: body.querySelector('#nv-dir').value.trim(),
            localidadEntrega: locParts[0] || '',
            provinciaEntrega: locParts[1] || '',
            condicionVenta: cond,
            cuentaCobro: body.querySelector('#nv-cuenta').value,
            descuentoPct: draft.descuentoPct,
            ivaPct: draft.ivaPct,
            bultos: Math.max(1, parseInt(body.querySelector('#nv-bultos').value, 10) || 1),
            crearTareaDeposito: body.querySelector('#nv-crear-tarea').checked,
            items: draft.items,
          };

          const btn = foot.querySelector('#nv-confirm');
          btn.disabled = true;
          btn.textContent = 'Confirmando...';
          try {
            let ventaCreada;
            if (state.modoLocal) {
              const t = calcTotales();
              ventaCreada = {
                ...payload,
                id: 'vta_' + Date.now(),
                numero: 'VTA-' + String(state.ventas.length + 1).padStart(8, '0'),
                fecha: new Date().toISOString(),
                estadoPago: cond === 'contado' ? 'pagado' : 'pendiente',
                estadoLogistico: 'pendiente_armado',
                subtotal: t.sub, descuentoMonto: t.desc, neto: t.neto, ivaMonto: t.iva, total: t.total,
              };
              state.ventas.unshift(ventaCreada);
              payload.items.forEach((it) => {
                if (!state.stock[it.variantId]) state.stock[it.variantId] = { actual: 0, reservado: 0, minimo: 0, ubicacion: '', costo: 0 };
                state.stock[it.variantId].actual = Math.max(0, state.stock[it.variantId].actual - it.qty);
              });
              guardarLocal();
            } else {
              const res = await apiPost('venta_crear', payload);
              ventaCreada = res.venta;
              await cargarTodoErp();
            }

            if (pedido && typeof global.cotCambiarEstado === 'function') {
              global.cotCambiarEstado(pedido.ref, 'enviado');
            }
            cerrarModal();
            notify(`Venta ${ventaCreada.numero} confirmada`, 'success');
            cambiarVista('ventas');
            setVentasSubtab('confirmadas');
            renderAll();
          } catch (err) {
            notify(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Confirmar Venta';
          }
        });
      },
    });
  }

  /* ─────────────── VISTA 3: ETIQUETAS DE CAJAS ─────────────── */
  function cargarVentaEnEtiquetas(ventaId) {
    const v = state.ventas.find((x) => x.id === ventaId);
    if (!v) return;
    const cli = state.clientes[v.clienteClave] || {};
    state.etqVentaId = v.id;
    state.etqDraft = {
      clienteNombre: v.clienteNombre || cli.nombre || '',
      direccion: v.direccionEntrega || cli.direccionEntrega || cli.direccion || '',
      localidad: v.localidadEntrega || cli.localidad || 'Corrientes',
      provincia: v.provinciaEntrega || cli.provincia || 'Corrientes',
      telefono: v.clienteTelefono || cli.telefono || '',
      cuit: v.clienteCuit || cli.cuit || '',
      transporte: v.transporte || cli.transporte || '',
      ventaNumero: v.numero || '',
      remitoNumero: `REM-${state.config.puntoVenta || '0001'}-${(v.numero || '').replace(/\D/g, '')}`,
      bultos: Math.max(1, parseInt(v.bultos, 10) || 1),
      pesoKg: Number(v.pesoKg) || 0,
      fragil: Boolean(v.fragil),
      notas: v.notasDespacho || '',
      detalleBultos: Array.isArray(v.detalleBultos) ? [...v.detalleBultos] : [],
      fecha: String(v.fecha || '').slice(0, 10) || hoyISO(),
    };
  }

  function abrirEtiquetasDeVenta(ventaId) {
    cargarVentaEnEtiquetas(ventaId);
    cambiarVista('etiquetas');
  }

  function renderEtiquetas() {
    const root = document.getElementById('erp-etiquetas-root');
    if (!root) return;

    const d = state.etqDraft;
    const ventasCola = state.ventas.filter((v) => v.estadoLogistico !== 'anulado');
    const cfgPrint = {
      ...d,
      empresaNombre: state.config.empresa,
      empresaDir: `${state.config.direccion}, ${state.config.localidad}`,
      empresaTel: state.config.telefono,
    };

    const previewHtml = global.ErpPrint ? global.ErpPrint.renderEtiquetasHtml(cfgPrint, state.etqFormato) : '';

    let detalleInputs = '';
    for (let i = 0; i < Math.min(12, Math.max(1, d.bultos)); i++) {
      detalleInputs += `
        <div class="erp-field" style="margin-bottom:8px;">
          <label>Contenido Caja ${i + 1} (opcional)</label>
          <input type="text" class="erp-input etq-det-inp" data-idx="${i}" value="${esc(d.detalleBultos[i] || '')}" placeholder="Ej: 10 cajas T1 mecha + 5 cajas tarugos N°8" />
        </div>`;
    }

    root.innerHTML = `
      <div class="erp-grid-split">
        <div class="erp-panel">
          <div class="erp-panel-head">
            <div>
              <h2>Configurar Etiquetas de Despacho</h2>
              <p class="erp-panel-sub">Elegí una venta confirmada o cargá los datos de envío manualmente.</p>
            </div>
          </div>

          <div class="erp-field">
            <label for="etq-venta-sel">Cargar desde Venta Confirmada</label>
            <select class="erp-select" id="etq-venta-sel">
              <option value="">— Carga manual libre —</option>
              ${ventasCola.map((v) => `<option value="${esc(v.id)}"${state.etqVentaId === v.id ? ' selected' : ''}>${esc(v.numero)} · ${esc(v.clienteNombre)} (${v.bultos || 1} bulto/s · ${ESTADOS_LOGISTICOS[v.estadoLogistico]?.label || ''})</option>`).join('')}
            </select>
          </div>

          <div class="erp-field">
            <label for="etq-cli">Destinatario / Razón Social *</label>
            <input type="text" class="erp-input" id="etq-cli" value="${esc(d.clienteNombre)}" />
          </div>

          <div class="erp-field">
            <label for="etq-dir">Dirección de entrega</label>
            <input type="text" class="erp-input" id="etq-dir" value="${esc(d.direccion)}" />
          </div>

          <div class="erp-field-row">
            <div class="erp-field">
              <label for="etq-loc">Localidad</label>
              <input type="text" class="erp-input" id="etq-loc" value="${esc(d.localidad)}" />
            </div>
            <div class="erp-field">
              <label for="etq-prov">Provincia</label>
              <input type="text" class="erp-input" id="etq-prov" value="${esc(d.provincia)}" />
            </div>
          </div>

          <div class="erp-field-row">
            <div class="erp-field">
              <label for="etq-tel">Teléfono</label>
              <input type="text" class="erp-input" id="etq-tel" value="${esc(d.telefono)}" />
            </div>
            <div class="erp-field">
              <label for="etq-cuit">CUIT / CUIL</label>
              <input type="text" class="erp-input" id="etq-cuit" value="${esc(d.cuit)}" />
            </div>
          </div>

          <div class="erp-field-row">
            <div class="erp-field">
              <label for="etq-transp">Transporte / Expreso</label>
              <input type="text" class="erp-input" id="etq-transp" value="${esc(d.transporte)}" placeholder="Ej: Vía Cargo / Expreso Demonte" />
            </div>
            <div class="erp-field">
              <label for="etq-vta-num">N° Venta / Remito</label>
              <input type="text" class="erp-input" id="etq-vta-num" value="${esc(d.ventaNumero)}" />
            </div>
          </div>

          <div class="erp-field-row">
            <div class="erp-field">
              <label>Cantidad de Cajas (Bultos)</label>
              <div style="display:flex; gap:6px; align-items:center;">
                <button type="button" class="erp-btn" id="etq-bulto-menos">−</button>
                <input type="number" min="1" max="99" class="erp-input erp-num" id="etq-bultos" value="${d.bultos}" style="width:74px; text-align:center;" />
                <button type="button" class="erp-btn" id="etq-bulto-mas">+</button>
              </div>
            </div>
            <div class="erp-field">
              <label for="etq-peso">Peso Total aprox. (kg)</label>
              <input type="number" min="0" step="0.5" class="erp-input" id="etq-peso" value="${d.pesoKg}" />
            </div>
          </div>

          <div class="erp-field">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="etq-fragil" ${d.fragil ? 'checked' : ''} /> Marcar como FRÁGIL / Manipular con cuidado
            </label>
          </div>

          <div class="erp-field">
            <label for="etq-notas">Indicaciones de entrega</label>
            <input type="text" class="erp-input" id="etq-notas" value="${esc(d.notas)}" placeholder="Ej: Entregar en depósito posterior de 8 a 16 hs" />
          </div>

          <details style="margin-bottom:14px;">
            <summary style="cursor:pointer; font-size:0.82rem; font-weight:600; color:var(--erp-ink-dim);">Detallar contenido de cada caja (opcional)</summary>
            <div style="margin-top:10px;">${detalleInputs}</div>
          </details>

          <div class="erp-field">
            <label for="etq-formato">Formato de Impresión</label>
            <select class="erp-select" id="etq-formato">
              <option value="termica"${state.etqFormato === 'termica' ? ' selected' : ''}>Térmica autoadhesiva (100 × 150 mm · 1 por etiqueta)</option>
              <option value="a4-4"${state.etqFormato === 'a4-4' ? ' selected' : ''}>Hoja A4 común · 4 etiquetas por hoja</option>
              <option value="a4-2"${state.etqFormato === 'a4-2' ? ' selected' : ''}>Hoja A4 común · 2 etiquetas por hoja</option>
              <option value="a4-1"${state.etqFormato === 'a4-1' ? ' selected' : ''}>Hoja A4 común · 1 etiqueta grande</option>
            </select>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px; margin-top:14px;">
            <button type="button" class="erp-btn erp-btn--pri" id="etq-imprimir" style="width:100%;">Imprimir Etiquetas (${d.bultos} bulto${d.bultos > 1 ? 's' : ''})</button>
            ${state.etqVentaId ? '<button type="button" class="erp-btn" id="etq-guardar-empaquetado" style="width:100%;">Guardar bultos y marcar venta como Empaquetada</button>' : ''}
          </div>
        </div>

        <div>
          <div class="erp-panel" style="padding:16px 18px;">
            <div class="erp-panel-head" style="margin-bottom:12px;">
              <div>
                <h3>Vista Previa en Vivo (${state.etqFormato === 'termica' ? 'Rollo Térmico 100×150 mm' : 'Hoja A4'})</h3>
                <p class="erp-panel-sub">Incluye código de barras Code 128B y QR únicos por cada caja.</p>
              </div>
            </div>
            <div class="etq-preview-stage" id="etq-preview-stage">${previewHtml}</div>
          </div>
        </div>
      </div>`;

    const refreshPreviewOnly = () => {
      const stage = document.getElementById('etq-preview-stage');
      if (stage && global.ErpPrint) {
        stage.innerHTML = global.ErpPrint.renderEtiquetasHtml({
          ...state.etqDraft,
          empresaNombre: state.config.empresa,
          empresaDir: `${state.config.direccion}, ${state.config.localidad}`,
          empresaTel: state.config.telefono,
        }, state.etqFormato);
      }
      const btn = document.getElementById('etq-imprimir');
      if (btn) btn.textContent = `Imprimir Etiquetas (${state.etqDraft.bultos} bulto${state.etqDraft.bultos > 1 ? 's' : ''})`;
    };

    const bindInput = (id, key, transform = (v) => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        state.etqDraft[key] = transform(el.value);
        refreshPreviewOnly();
      });
    };

    bindInput('etq-cli', 'clienteNombre');
    bindInput('etq-dir', 'direccion');
    bindInput('etq-loc', 'localidad');
    bindInput('etq-prov', 'provincia');
    bindInput('etq-tel', 'telefono');
    bindInput('etq-cuit', 'cuit');
    bindInput('etq-transp', 'transporte');
    bindInput('etq-vta-num', 'ventaNumero');
    bindInput('etq-peso', 'pesoKg', (v) => Number(v) || 0);
    bindInput('etq-notas', 'notas');

    document.getElementById('etq-fragil')?.addEventListener('change', (e) => {
      state.etqDraft.fragil = e.target.checked;
      refreshPreviewOnly();
    });
    document.getElementById('etq-bultos')?.addEventListener('input', (e) => {
      state.etqDraft.bultos = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
      refreshPreviewOnly();
    });
    document.getElementById('etq-bulto-menos')?.addEventListener('click', () => {
      state.etqDraft.bultos = Math.max(1, state.etqDraft.bultos - 1);
      renderEtiquetas();
    });
    document.getElementById('etq-bulto-mas')?.addEventListener('click', () => {
      state.etqDraft.bultos = Math.min(99, state.etqDraft.bultos + 1);
      renderEtiquetas();
    });
    document.getElementById('etq-formato')?.addEventListener('change', (e) => {
      state.etqFormato = e.target.value;
      renderEtiquetas();
    });
    document.getElementById('etq-venta-sel')?.addEventListener('change', (e) => {
      if (e.target.value) cargarVentaEnEtiquetas(e.target.value);
      else state.etqVentaId = '';
      renderEtiquetas();
    });
    root.querySelectorAll('.etq-det-inp').forEach((inp) => {
      inp.addEventListener('input', () => {
        state.etqDraft.detalleBultos[Number(inp.dataset.idx)] = inp.value;
        refreshPreviewOnly();
      });
    });

    document.getElementById('etq-imprimir')?.addEventListener('click', () => {
      if (!global.ErpPrint) return;
      global.ErpPrint.imprimirEtiquetas({
        ...state.etqDraft,
        empresaNombre: state.config.empresa,
        empresaDir: `${state.config.direccion}, ${state.config.localidad}`,
        empresaTel: state.config.telefono,
      }, state.etqFormato);
    });

    document.getElementById('etq-guardar-empaquetado')?.addEventListener('click', async () => {
      if (!state.etqVentaId) return;
      try {
        if (state.modoLocal) {
          const v = state.ventas.find((x) => x.id === state.etqVentaId);
          if (v) {
            v.estadoLogistico = 'empaquetado';
            v.bultos = state.etqDraft.bultos;
            v.transporte = state.etqDraft.transporte;
            v.pesoKg = state.etqDraft.pesoKg;
            v.fragil = state.etqDraft.fragil;
            v.notasDespacho = state.etqDraft.notas;
            v.detalleBultos = state.etqDraft.detalleBultos;
          }
          guardarLocal();
        } else {
          await apiPost('venta_actualizar', {
            id: state.etqVentaId,
            estadoLogistico: 'empaquetado',
            bultos: state.etqDraft.bultos,
            transporte: state.etqDraft.transporte,
            direccionEntrega: state.etqDraft.direccion,
            localidadEntrega: state.etqDraft.localidad,
            provinciaEntrega: state.etqDraft.provincia,
            pesoKg: state.etqDraft.pesoKg,
            fragil: state.etqDraft.fragil,
            notasDespacho: state.etqDraft.notas,
            detalleBultos: state.etqDraft.detalleBultos,
          });
          await cargarTodoErp();
        }
        notify('Bultos guardados y venta marcada como Empaquetada', 'success');
        renderAll();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  }

  /* ─────────────── VISTA 4: FACTURACIÓN Y COMPROBANTES ─────────────── */
  function renderFacturacion() {
    const root = document.getElementById('erp-facturacion-root');
    if (!root) return;

    const q = state.factSearch.trim().toLowerCase();
    const lista = state.comprobantes.filter((c) => {
      if (state.factTipoFiltro === 'facturas' && !String(c.tipo || '').startsWith('factura_')) return false;
      if (state.factTipoFiltro === 'notas' && !String(c.tipo || '').startsWith('nota_')) return false;
      if (state.factTipoFiltro === 'remitos' && c.tipo !== 'remito_r') return false;
      if (state.factTipoFiltro === 'recibos' && c.tipo !== 'recibo_x') return false;
      if (state.factTipoFiltro === 'presupuestos' && c.tipo !== 'presupuesto_x') return false;
      if (state.factMes && !String(c.fechaEmision || '').startsWith(state.factMes)) return false;
      if (!q) return true;
      return [c.numero, c.clienteNombre, c.clienteCuit, c.cae, c.ventaNumero]
        .some((x) => String(x || '').toLowerCase().includes(q));
    });

    const facNeto = lista.filter((c) => String(c.tipo || '').startsWith('factura_')).reduce((s, c) => s + (Number(c.neto) || 0), 0);
    const facIva = lista.filter((c) => String(c.tipo || '').startsWith('factura_')).reduce((s, c) => s + (Number(c.ivaMonto) || 0), 0);
    const facTotal = lista.filter((c) => String(c.tipo || '').startsWith('factura_')).reduce((s, c) => s + (Number(c.total) || 0), 0);
    const recTotal = lista.filter((c) => c.tipo === 'recibo_x').reduce((s, c) => s + (Number(c.total) || 0), 0);

    root.innerHTML = `
      <div class="erp-kpi-grid">
        <div class="erp-kpi"><div class="erp-kpi-lbl">Neto Facturado (filtro)</div><div class="erp-kpi-val">${money(facNeto)}</div></div>
        <div class="erp-kpi"><div class="erp-kpi-lbl">IVA Débito Fiscal</div><div class="erp-kpi-val">${money(facIva)}</div></div>
        <div class="erp-kpi erp-kpi--accent"><div class="erp-kpi-lbl">Total Facturas A/B/C</div><div class="erp-kpi-val">${money(facTotal)}</div></div>
        <div class="erp-kpi erp-kpi--ok"><div class="erp-kpi-lbl">Recibos de Cobro</div><div class="erp-kpi-val">${money(recTotal)}</div></div>
      </div>

      <div class="erp-panel">
        <div class="erp-panel-head">
          <div>
            <h2>Comprobantes y Facturación</h2>
            <p class="erp-panel-sub">Facturas A/B/C, Notas de Crédito y Débito, Remitos R, Recibos X y Presupuestos.</p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="erp-btn" id="erp-fac-csv">Exportar Libro IVA (CSV)</button>
            <button type="button" class="erp-btn erp-btn--pri" id="erp-fac-new">+ Registrar / Emitir Comprobante</button>
          </div>
        </div>

        <div class="erp-toolbar">
          <input type="search" class="erp-input" id="erp-fac-search" value="${esc(state.factSearch)}" placeholder="Buscar por N°, cliente, CUIT o CAE..." style="flex:1; min-width:220px;" />
          <select class="erp-select" id="erp-fac-tipo">
            <option value="todos"${state.factTipoFiltro === 'todos' ? ' selected' : ''}>Todos los comprobantes</option>
            <option value="facturas"${state.factTipoFiltro === 'facturas' ? ' selected' : ''}>Facturas A / B / C</option>
            <option value="notas"${state.factTipoFiltro === 'notas' ? ' selected' : ''}>Notas Crédito / Débito</option>
            <option value="remitos"${state.factTipoFiltro === 'remitos' ? ' selected' : ''}>Remitos R</option>
            <option value="recibos"${state.factTipoFiltro === 'recibos' ? ' selected' : ''}>Recibos X</option>
            <option value="presupuestos"${state.factTipoFiltro === 'presupuestos' ? ' selected' : ''}>Presupuestos X</option>
          </select>
          <input type="month" class="erp-input" id="erp-fac-mes" value="${esc(state.factMes)}" />
        </div>

        ${lista.length === 0
          ? `<div class="erp-empty"><strong>Sin comprobantes</strong>Emití un remito, recibo o registrá una factura para comenzar.</div>`
          : `<div class="erp-table-wrap"><table class="erp-table">
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Número</th><th>Cliente</th><th>CAE / Ref.</th><th class="num">Total</th><th class="num">Acciones</th></tr>
              </thead>
              <tbody>
                ${lista.map((c) => `<tr>
                  <td>${fmtFecha(c.fechaEmision)}</td>
                  <td><span class="erp-badge erp-badge--neutral">${esc(TIPOS_COMPROBANTE[c.tipo] || c.tipo)}</span></td>
                  <td class="erp-mono"><strong>${esc(c.numero)}</strong></td>
                  <td>${esc(c.clienteNombre || '—')}<div style="font-size:0.74rem;color:var(--erp-ink-muted);">${esc(c.clienteCuit || '')}</div></td>
                  <td class="erp-mono">${esc(c.cae || c.ventaNumero || '—')}</td>
                  <td class="num"><strong>${money(c.total)}</strong></td>
                  <td class="num" style="white-space:nowrap;">
                    <button type="button" class="erp-btn erp-btn--sm erp-comp-print" data-id="${esc(c.id)}">Imprimir PDF</button>
                    ${c.archivo ? `<a class="erp-btn erp-btn--sm" href="api.php?a=comprobante_pdf&id=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">Adjunto</a>` : ''}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
      </div>`;

    document.getElementById('erp-fac-search')?.addEventListener('input', (e) => { state.factSearch = e.target.value; renderFacturacion(); });
    document.getElementById('erp-fac-tipo')?.addEventListener('change', (e) => { state.factTipoFiltro = e.target.value; renderFacturacion(); });
    document.getElementById('erp-fac-mes')?.addEventListener('change', (e) => { state.factMes = e.target.value; renderFacturacion(); });
    document.getElementById('erp-fac-new')?.addEventListener('click', () => abrirModalComprobante());
    document.getElementById('erp-fac-csv')?.addEventListener('click', () => exportarLibroIvaCsv(lista));
    root.querySelectorAll('.erp-comp-print').forEach((b) => {
      b.addEventListener('click', () => {
        const c = state.comprobantes.find((x) => x.id === b.dataset.id);
        if (c && global.ErpPrint) global.ErpPrint.imprimirComprobante(c, state.config);
      });
    });
  }

  function exportarLibroIvaCsv(lista) {
    const filas = [['Fecha', 'Tipo', 'Punto Venta', 'Numero', 'Cliente', 'CUIT', 'CAE', 'Neto', 'IVA', 'Percepciones', 'Total']];
    lista.forEach((c) => {
      filas.push([
        c.fechaEmision || '',
        TIPOS_COMPROBANTE[c.tipo] || c.tipo,
        c.puntoVenta || '',
        c.numero || '',
        c.clienteNombre || '',
        c.clienteCuit || '',
        c.cae || '',
        Number(c.neto || 0).toFixed(2),
        Number(c.ivaMonto || 0).toFixed(2),
        Number(c.percepcionMonto || 0).toFixed(2),
        Number(c.total || 0).toFixed(2),
      ]);
    });
    descargarCsv(`libro-iva-distrijam-${hoyISO()}.csv`, filas);
  }

  function abrirModalComprobante(opts = {}) {
    const v = opts.venta || null;
    const cli = v ? (state.clientes[v.clienteClave] || {}) : {};
    let archivoSubido = '';

    abrirModal({
      title: v ? `Emitir / Registrar Comprobante · ${v.numero}` : 'Registrar o Emitir Comprobante',
      wide: true,
      bodyHtml: `
        <div class="erp-field-row-3">
          <div class="erp-field">
            <label for="cmp-tipo">Tipo de Comprobante</label>
            <select class="erp-select" id="cmp-tipo">
              <option value="factura_a"${opts.tipoInicial === 'factura_a' ? ' selected' : ''}>Factura A</option>
              <option value="factura_b">Factura B</option>
              <option value="factura_c">Factura C</option>
              <option value="nota_credito_a">Nota de Crédito A</option>
              <option value="nota_credito_b">Nota de Crédito B</option>
              <option value="nota_debito_a">Nota de Débito A</option>
              <option value="remito_r">Remito R (Entrega)</option>
              <option value="presupuesto_x">Presupuesto X</option>
            </select>
          </div>
          <div class="erp-field">
            <label for="cmp-numero">Número (vacío = correlativo auto.)</label>
            <input type="text" class="erp-input" id="cmp-numero" placeholder="Ej: 0001-00004521 o vacío" />
          </div>
          <div class="erp-field">
            <label for="cmp-fecha">Fecha de Emisión</label>
            <input type="date" class="erp-input" id="cmp-fecha" value="${hoyISO()}" />
          </div>
        </div>

        <div class="erp-field-row-3">
          <div class="erp-field">
            <label for="cmp-cli-nom">Cliente / Razón Social *</label>
            <input type="text" class="erp-input" id="cmp-cli-nom" value="${esc(v ? v.clienteNombre : '')}" />
          </div>
          <div class="erp-field">
            <label for="cmp-cli-cuit">CUIT / CUIL</label>
            <input type="text" class="erp-input" id="cmp-cli-cuit" value="${esc(v ? v.clienteCuit : '')}" />
          </div>
          <div class="erp-field">
            <label for="cmp-venta-sel">Vincular con Venta</label>
            <select class="erp-select" id="cmp-venta-sel">
              <option value="">— Sin venta vinculada —</option>
              ${state.ventas.filter((x) => x.estadoLogistico !== 'anulado').map((x) => `<option value="${esc(x.id)}"${v && v.id === x.id ? ' selected' : ''}>${esc(x.numero)} · ${esc(x.clienteNombre)} (${money(x.total)})</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="erp-field-row">
          <div class="erp-field">
            <label for="cmp-cae">CAE (ARCA/AFIP, si es fiscal)</label>
            <input type="text" class="erp-input" id="cmp-cae" placeholder="14 dígitos (opcional)" />
          </div>
          <div class="erp-field">
            <label for="cmp-vto-cae">Vencimiento CAE</label>
            <input type="date" class="erp-input" id="cmp-vto-cae" />
          </div>
        </div>

        <div class="erp-field-row-3">
          <div class="erp-field">
            <label for="cmp-neto">Neto Gravado ($)</label>
            <input type="number" step="0.01" class="erp-input" id="cmp-neto" value="${v ? v.neto : 0}" />
          </div>
          <div class="erp-field">
            <label for="cmp-iva">IVA ($)</label>
            <input type="number" step="0.01" class="erp-input" id="cmp-iva" value="${v ? v.ivaMonto : 0}" />
          </div>
          <div class="erp-field">
            <label for="cmp-total">Total ($)</label>
            <input type="number" step="0.01" class="erp-input" id="cmp-total" value="${v ? v.total : 0}" />
          </div>
        </div>

        <div class="erp-field">
          <label for="cmp-file">Adjuntar PDF o imagen oficial (opcional, máx. 5 MB)</label>
          <input type="file" class="erp-input" id="cmp-file" accept="application/pdf,image/jpeg,image/png,image/webp" style="padding-top:6px;" />
          <small id="cmp-file-st" style="color:var(--erp-ink-muted);"></small>
        </div>

        <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:0.82rem;">
            <input type="checkbox" id="cmp-imputar-cc" ${v ? '' : 'checked'} /> Impactar en Cuenta Corriente (si es libre)
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:0.82rem;">
            <input type="checkbox" id="cmp-dev-stock" /> Devolver stock (solo Notas de Crédito)
          </label>
        </div>

        <div class="erp-field">
          <label for="cmp-obs">Observaciones</label>
          <textarea class="erp-textarea" id="cmp-obs"></textarea>
        </div>`,
      footHtml: `
        <button type="button" class="erp-btn" id="cmp-cancel">Cancelar</button>
        <button type="button" class="erp-btn erp-btn--pri" id="cmp-save">Guardar Comprobante</button>`,
      onMount: (body, foot) => {
        const recalc = () => {
          const neto = Number(body.querySelector('#cmp-neto').value) || 0;
          const iva = Number(body.querySelector('#cmp-iva').value) || 0;
          body.querySelector('#cmp-total').value = (neto + iva).toFixed(2);
        };
        body.querySelector('#cmp-neto').addEventListener('input', () => {
          const neto = Number(body.querySelector('#cmp-neto').value) || 0;
          body.querySelector('#cmp-iva').value = (neto * ((Number(state.config.ivaPct) || 21) / 100)).toFixed(2);
          recalc();
        });
        body.querySelector('#cmp-iva').addEventListener('input', recalc);

        body.querySelector('#cmp-venta-sel').addEventListener('change', (e) => {
          const selV = state.ventas.find((x) => x.id === e.target.value);
          if (!selV) return;
          body.querySelector('#cmp-cli-nom').value = selV.clienteNombre || '';
          body.querySelector('#cmp-cli-cuit').value = selV.clienteCuit || '';
          body.querySelector('#cmp-neto').value = selV.neto || 0;
          body.querySelector('#cmp-iva').value = selV.ivaMonto || 0;
          body.querySelector('#cmp-total').value = selV.total || 0;
        });

        body.querySelector('#cmp-file').addEventListener('change', async (e) => {
          const f = e.target.files[0];
          const st = body.querySelector('#cmp-file-st');
          if (!f || state.modoLocal) return;
          st.textContent = 'Subiendo archivo...';
          try {
            const fd = new FormData();
            fd.append('archivo', f);
            const r = await fetch('api.php?a=comprobante_archivo', { method: 'POST', body: fd });
            const d = await r.json();
            if (!r.ok || !d.ok) throw new Error(d.error || 'Error');
            archivoSubido = d.archivo;
            st.textContent = `Archivo adjunto listo (${f.name})`;
          } catch (err) {
            st.textContent = err.message;
          }
        });

        foot.querySelector('#cmp-cancel').addEventListener('click', cerrarModal);
        foot.querySelector('#cmp-save').addEventListener('click', async () => {
          const selV = state.ventas.find((x) => x.id === body.querySelector('#cmp-venta-sel').value);
          const payload = {
            tipo: body.querySelector('#cmp-tipo').value,
            numero: body.querySelector('#cmp-numero').value.trim(),
            fechaEmision: body.querySelector('#cmp-fecha').value,
            clienteNombre: body.querySelector('#cmp-cli-nom').value.trim(),
            clienteCuit: body.querySelector('#cmp-cli-cuit').value.trim(),
            clienteClave: soloDigitos(body.querySelector('#cmp-cli-cuit').value),
            clienteCondicion: cli.condicion || '',
            clienteDireccion: cli.direccion || '',
            ventaId: selV ? selV.id : '',
            ventaNumero: selV ? selV.numero : '',
            items: selV ? selV.items : [],
            cae: body.querySelector('#cmp-cae').value.trim(),
            vtoCae: body.querySelector('#cmp-vto-cae').value,
            neto: Number(body.querySelector('#cmp-neto').value) || 0,
            ivaPct: Number(state.config.ivaPct || 21),
            ivaMonto: Number(body.querySelector('#cmp-iva').value) || 0,
            total: Number(body.querySelector('#cmp-total').value) || 0,
            archivo: archivoSubido,
            imputarCtaCte: body.querySelector('#cmp-imputar-cc').checked,
            devolverStock: body.querySelector('#cmp-dev-stock').checked,
            observaciones: body.querySelector('#cmp-obs').value.trim(),
          };

          try {
            let creado;
            if (state.modoLocal) {
              creado = { ...payload, id: 'cmp_' + Date.now(), numero: payload.numero || ('CMP-' + (state.comprobantes.length + 1)) };
              state.comprobantes.unshift(creado);
              guardarLocal();
            } else {
              const r = await apiPost('comprobante_crear', payload);
              creado = r.comprobante;
              await cargarTodoErp();
            }
            cerrarModal();
            notify(`Comprobante ${creado.numero} guardado`, 'success');
            renderAll();
          } catch (err) {
            notify(err.message, 'error');
          }
        });
      },
    });
  }

  /* ─────────────── VISTA 5: CLIENTES Y ESTADO DE CUENTAS ─────────────── */
  function renderClientes() {
    const root = document.getElementById('erp-clientes-root');
    if (!root) return;

    if (state.cliSeleccionado && state.clientes[state.cliSeleccionado]) {
      renderLegajoCliente(root, state.cliSeleccionado);
      return;
    }

    const q = state.cliSearch.trim().toLowerCase();
    const lista = Object.entries(state.clientes).map(([clave, c]) => {
      const s = state.ctacte.saldos?.[clave] || { debe: 0, haber: 0, saldo: 0 };
      const ventasCli = state.ventas.filter((v) => v.clienteClave === clave && v.estadoLogistico !== 'anulado').length;
      return { clave, ...c, saldo: Number(s.saldo) || 0, ventasCli };
    }).filter((c) => {
      if (state.cliSoloDeudores && c.saldo <= 0.01) return false;
      if (!q) return true;
      return [c.nombre, c.cuit, c.clave, c.localidad, c.transporte, c.vendedor]
        .some((x) => String(x || '').toLowerCase().includes(q));
    }).sort((a, b) => b.saldo - a.saldo || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

    const totalDeuda = lista.reduce((s, c) => s + Math.max(0, c.saldo), 0);

    root.innerHTML = `
      <div class="erp-panel">
        <div class="erp-panel-head">
          <div>
            <h2>Clientes y Cuentas Corrientes</h2>
            <p class="erp-panel-sub">Saldos en tiempo real, cobros con Recibo X y enlace único de Estado de Cuenta para enviar por WhatsApp.</p>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="erp-badge erp-badge--warn">Total por cobrar: ${money(totalDeuda)}</span>
            <button type="button" class="erp-btn erp-btn--pri" id="erp-cli-new">+ Nuevo Cliente</button>
          </div>
        </div>

        <div class="erp-toolbar">
          <input type="search" class="erp-input" id="erp-cli-q" value="${esc(state.cliSearch)}" placeholder="Buscar cliente por razón social, CUIT, localidad o transporte..." style="flex:1; min-width:240px;" />
          <label style="display:flex; align-items:center; gap:6px; font-size:0.82rem; font-weight:600; cursor:pointer;">
            <input type="checkbox" id="erp-cli-deudores" ${state.cliSoloDeudores ? 'checked' : ''} /> Solo con saldo pendiente
          </label>
        </div>

        ${lista.length === 0
          ? `<div class="erp-empty"><strong>No hay clientes que coincidan</strong>Creá uno nuevo o esperá a recibir pedidos del catálogo.</div>`
          : `<div class="erp-table-wrap"><table class="erp-table">
              <thead>
                <tr><th>Razón Social</th><th>CUIT</th><th>Localidad / Transporte</th><th class="num">Ventas</th><th class="num">Saldo Cta. Cte.</th><th class="num">Acciones</th></tr>
              </thead>
              <tbody>
                ${lista.map((c) => `<tr>
                  <td><strong>${esc(c.nombre || 'Sin nombre')}</strong>${c.descuentoHabitual ? `<div style="font-size:0.72rem;color:var(--erp-ok);">Dto. habitual ${c.descuentoHabitual}%</div>` : ''}</td>
                  <td class="erp-mono">${esc(c.cuit || c.clave)}</td>
                  <td>${esc(c.localidad || '—')}<div style="font-size:0.74rem;color:var(--erp-ink-muted);">${esc(c.transporte || '')}</div></td>
                  <td class="num">${c.ventasCli}</td>
                  <td class="num"><span class="erp-badge erp-badge--${c.saldo > 0.01 ? 'warn' : (c.saldo < -0.01 ? 'info' : 'ok')}">${money(c.saldo)}</span></td>
                  <td class="num" style="white-space:nowrap;">
                    <button type="button" class="erp-btn erp-btn--sm erp-cli-ver" data-clave="${esc(c.clave)}">Estado de Cuenta</button>
                    <button type="button" class="erp-btn erp-btn--sm erp-cli-cobrar" data-clave="${esc(c.clave)}">Cobrar</button>
                    <button type="button" class="erp-btn erp-btn--sm erp-cli-edit" data-clave="${esc(c.clave)}">Editar</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
      </div>`;

    document.getElementById('erp-cli-q')?.addEventListener('input', (e) => { state.cliSearch = e.target.value; renderClientes(); });
    document.getElementById('erp-cli-deudores')?.addEventListener('change', (e) => { state.cliSoloDeudores = e.target.checked; renderClientes(); });
    document.getElementById('erp-cli-new')?.addEventListener('click', () => abrirModalCliente());

    root.querySelectorAll('.erp-cli-ver').forEach((b) => {
      b.addEventListener('click', () => { state.cliSeleccionado = b.dataset.clave; renderClientes(); });
    });
    root.querySelectorAll('.erp-cli-cobrar').forEach((b) => {
      b.addEventListener('click', () => abrirModalCobro(b.dataset.clave));
    });
    root.querySelectorAll('.erp-cli-edit').forEach((b) => {
      b.addEventListener('click', () => abrirModalCliente(b.dataset.clave));
    });
  }

  function renderLegajoCliente(root, clave) {
    const cli = state.clientes[clave];
    if (!cli) { state.cliSeleccionado = null; renderClientes(); return; }

    const movs = (state.ctacte.movimientos || [])
      .filter((m) => m.clave === clave && !m.anulado)
      .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));

    let saldoAcum = 0;
    let debeTotal = 0;
    let haberTotal = 0;
    const filas = movs.map((m) => {
      const monto = Number(m.monto) || 0;
      if (m.tipo === 'debe') { debeTotal += monto; saldoAcum += monto; }
      else { haberTotal += monto; saldoAcum -= monto; }
      return { ...m, saldoAcum };
    });

    const urlPortal = cli.shareToken
      ? new URL(`estado-cuenta.html?t=${encodeURIComponent(cli.shareToken)}`, global.location.href).href
      : '';
    const telWa = typeof global.cotNumeroWhatsApp === 'function' ? global.cotNumeroWhatsApp(cli.telefono) : '';
    const msgWa = `Hola ${cli.nombre || ''}, te compartimos tu resumen de Cuenta Corriente en Distrijam S.A.\nSaldo actual: ${money(saldoAcum)}\nPodés ver tus comprobantes y movimientos acá:\n${urlPortal}`;

    root.innerHTML = `
      <div class="erp-panel">
        <div class="erp-panel-head">
          <div style="display:flex; align-items:center; gap:12px;">
            <button type="button" class="erp-btn erp-btn--sm" id="cli-volver">← Todos los clientes</button>
            <div>
              <h2>${esc(cli.nombre)}</h2>
              <p class="erp-panel-sub">CUIT ${esc(cli.cuit || clave)} · ${esc(cli.condicion || 'Sin condición IVA')} · ${esc([cli.direccion, cli.localidad, cli.provincia].filter(Boolean).join(', '))}</p>
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="erp-btn" id="cli-editar-leg">Editar Legajo</button>
            <button type="button" class="erp-btn erp-btn--pri" id="cli-cobrar-btn">+ Registrar Cobro (Recibo X)</button>
          </div>
        </div>

        <div class="erp-kpi-grid">
          <div class="erp-kpi"><div class="erp-kpi-lbl">Total Cargos (Debe)</div><div class="erp-kpi-val">${money(debeTotal)}</div></div>
          <div class="erp-kpi erp-kpi--ok"><div class="erp-kpi-lbl">Total Abonado (Haber)</div><div class="erp-kpi-val">${money(haberTotal)}</div></div>
          <div class="erp-kpi ${saldoAcum > 0.01 ? 'erp-kpi--warn' : 'erp-kpi--ok'}"><div class="erp-kpi-lbl">Saldo Actual</div><div class="erp-kpi-val">${money(saldoAcum)}</div></div>
          <div class="erp-kpi"><div class="erp-kpi-lbl">Límite de Crédito</div><div class="erp-kpi-val">${Number(cli.limiteCredito) > 0 ? money(cli.limiteCredito) : 'Sin límite'}</div></div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:18px;">
          <button type="button" class="erp-btn" id="cli-print-cc">Imprimir Resumen PDF (A4)</button>
          ${urlPortal ? `<button type="button" class="erp-btn" id="cli-copy-link">Copiar Link Estado de Cuenta</button>` : ''}
          ${urlPortal ? `<a class="erp-btn" href="${esc(urlPortal)}" target="_blank" rel="noopener">Abrir Vista del Cliente</a>` : ''}
          ${urlPortal ? `<a class="erp-btn erp-btn--wa" href="https://wa.me/${telWa}?text=${encodeURIComponent(msgWa)}" target="_blank" rel="noopener">Enviar Estado por WhatsApp</a>` : ''}
          ${state.user.rol === 'admin' ? `<button type="button" class="erp-btn" id="cli-ajuste-cc">Cargar Saldo Inicial / Ajuste</button>` : ''}
        </div>

        ${filas.length === 0
          ? `<div class="erp-empty"><strong>Sin movimientos en Cuenta Corriente</strong>Al confirmar ventas en Cuenta Corriente o registrar cobros aparecerán aquí.</div>`
          : `<div class="erp-table-wrap"><table class="erp-table">
              <thead><tr><th>Fecha</th><th>Comprobante</th><th>Concepto</th><th class="num">Debe</th><th class="num">Haber</th><th class="num">Saldo</th><th>Estado</th></tr></thead>
              <tbody>
                ${[...filas].reverse().map((m) => `<tr>
                  <td>${fmtFecha(m.fecha)}</td>
                  <td class="erp-mono"><strong>${esc(m.comprobanteLabel || '—')}</strong></td>
                  <td>${esc(m.concepto || '')}</td>
                  <td class="num">${m.tipo === 'debe' ? money(m.monto) : '—'}</td>
                  <td class="num">${m.tipo === 'haber' ? money(m.monto) : '—'}</td>
                  <td class="num"><strong>${money(m.saldoAcum)}</strong></td>
                  <td><span class="erp-badge erp-badge--${m.estadoPago === 'pagado' || m.estadoPago === 'aplicado' ? 'ok' : (m.estadoPago === 'parcial' ? 'info' : 'warn')}">${esc((m.estadoPago || '').toUpperCase())}</span></td>
                </tr>`).join('')}
              </tbody>
            </table></div>`}
      </div>`;

    document.getElementById('cli-volver')?.addEventListener('click', () => { state.cliSeleccionado = null; renderClientes(); });
    document.getElementById('cli-editar-leg')?.addEventListener('click', () => abrirModalCliente(clave));
    document.getElementById('cli-cobrar-btn')?.addEventListener('click', () => abrirModalCobro(clave));
    document.getElementById('cli-print-cc')?.addEventListener('click', () => {
      if (!global.ErpPrint) return;
      global.ErpPrint.imprimirEstadoCuenta({
        empresa: state.config,
        cliente: cli,
        resumen: { debeTotal, haberTotal, saldoActual: saldoAcum },
        movimientos: filas,
      });
    });
    document.getElementById('cli-copy-link')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(urlPortal);
        notify('Enlace copiado al portapapeles', 'success');
      } catch (e) {
        prompt('Copiá este enlace para el cliente:', urlPortal);
      }
    });
    document.getElementById('cli-ajuste-cc')?.addEventListener('click', () => abrirModalAjusteCtaCte(clave));
  }

  function abrirModalCliente(clave = '') {
    const c = clave ? (state.clientes[clave] || {}) : {};
    abrirModal({
      title: clave ? `Editar Cliente · ${c.nombre || clave}` : 'Nuevo Cliente',
      wide: true,
      bodyHtml: `
        <div class="erp-field-row-3">
          <div class="erp-field"><label>Razón Social *</label><input type="text" class="erp-input" id="mcli-nom" value="${esc(c.nombre || '')}" /></div>
          <div class="erp-field"><label>CUIT / CUIL *</label><input type="text" class="erp-input" id="mcli-cuit" value="${esc(c.cuit || clave)}" ${clave ? 'readonly' : ''} /></div>
          <div class="erp-field"><label>Condición IVA</label>
            <select class="erp-select" id="mcli-iva">
              ${['Responsable Inscripto', 'Monotributo', 'Exento', 'Consumidor Final', 'No Responsable'].map((o) => `<option value="${o}"${c.condicion === o ? ' selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="erp-field-row-3">
          <div class="erp-field"><label>Teléfono / WhatsApp</label><input type="text" class="erp-input" id="mcli-tel" value="${esc(c.telefono || '')}" /></div>
          <div class="erp-field"><label>Email</label><input type="email" class="erp-input" id="mcli-email" value="${esc(c.email || '')}" /></div>
          <div class="erp-field"><label>Vendedor asignado</label><input type="text" class="erp-input" id="mcli-vend" value="${esc(c.vendedor || '')}" /></div>
        </div>
        <div class="erp-field-row-3">
          <div class="erp-field"><label>Dirección Fiscal</label><input type="text" class="erp-input" id="mcli-dir" value="${esc(c.direccion || '')}" /></div>
          <div class="erp-field"><label>Localidad</label><input type="text" class="erp-input" id="mcli-loc" value="${esc(c.localidad || '')}" /></div>
          <div class="erp-field"><label>Provincia</label><input type="text" class="erp-input" id="mcli-prov" value="${esc(c.provincia || '')}" /></div>
        </div>
        <div class="erp-field-row">
          <div class="erp-field"><label>Dirección de Entrega (si difiere)</label><input type="text" class="erp-input" id="mcli-dirent" value="${esc(c.direccionEntrega || '')}" /></div>
          <div class="erp-field"><label>Transporte / Expreso Habitual</label><input type="text" class="erp-input" id="mcli-transp" value="${esc(c.transporte || '')}" /></div>
        </div>
        <div class="erp-field-row-3">
          <div class="erp-field"><label>Descuento Habitual (%)</label><input type="number" step="0.5" min="0" max="100" class="erp-input" id="mcli-dto" value="${c.descuentoHabitual || 0}" /></div>
          <div class="erp-field"><label>Límite de Crédito ($)</label><input type="number" step="100" min="0" class="erp-input" id="mcli-lim" value="${c.limiteCredito || 0}" /></div>
          <div class="erp-field"><label>Plazo Cta. Cte. (días)</label><input type="number" min="0" class="erp-input" id="mcli-plazo" value="${c.plazoDias ?? 30}" /></div>
        </div>
        <div class="erp-field"><label>Notas internas</label><textarea class="erp-textarea" id="mcli-notas">${esc(c.notas || '')}</textarea></div>`,
      footHtml: `<button type="button" class="erp-btn" id="mcli-cancel">Cancelar</button><button type="button" class="erp-btn erp-btn--pri" id="mcli-save">Guardar Cliente</button>`,
      onMount: (body, foot) => {
        foot.querySelector('#mcli-cancel').addEventListener('click', cerrarModal);
        foot.querySelector('#mcli-save').addEventListener('click', async () => {
          const cuit = body.querySelector('#mcli-cuit').value.trim();
          const k = clave || soloDigitos(cuit);
          const nombre = body.querySelector('#mcli-nom').value.trim();
          if (!k || !nombre) { notify('Completá Razón Social y CUIT válido.', 'error'); return; }
          const payload = {
            clave: k, cuit, nombre,
            condicion: body.querySelector('#mcli-iva').value,
            telefono: body.querySelector('#mcli-tel').value.trim(),
            email: body.querySelector('#mcli-email').value.trim(),
            vendedor: body.querySelector('#mcli-vend').value.trim(),
            direccion: body.querySelector('#mcli-dir').value.trim(),
            localidad: body.querySelector('#mcli-loc').value.trim(),
            provincia: body.querySelector('#mcli-prov').value.trim(),
            direccionEntrega: body.querySelector('#mcli-dirent').value.trim(),
            transporte: body.querySelector('#mcli-transp').value.trim(),
            descuentoHabitual: Number(body.querySelector('#mcli-dto').value) || 0,
            limiteCredito: Number(body.querySelector('#mcli-lim').value) || 0,
            plazoDias: parseInt(body.querySelector('#mcli-plazo').value, 10) || 30,
            notas: body.querySelector('#mcli-notas').value.trim(),
          };
          try {
            if (state.modoLocal) {
              state.clientes[k] = { ...state.clientes[k], ...payload, shareToken: state.clientes[k]?.shareToken || ('local' + Date.now()) };
              guardarLocal();
            } else {
              await apiPost('clientes', payload);
              await cargarTodoErp();
            }
            cerrarModal();
            notify('Cliente guardado', 'success');
            renderAll();
          } catch (err) {
            notify(err.message, 'error');
          }
        });
      },
    });
  }

  function abrirModalAjusteCtaCte(clave) {
    abrirModal({
      title: 'Cargar Saldo Inicial / Ajuste de Cuenta',
      bodyHtml: `
        <div class="erp-field-row">
          <div class="erp-field"><label>Tipo de Movimiento</label>
            <select class="erp-select" id="aj-tipo">
              <option value="debe">Cargo / Saldo Deudor (Debe)</option>
              <option value="haber">Crédito a favor (Haber)</option>
            </select>
          </div>
          <div class="erp-field"><label>Importe ($)</label><input type="number" step="0.01" min="0.01" class="erp-input" id="aj-monto" /></div>
        </div>
        <div class="erp-field"><label>Concepto</label><input type="text" class="erp-input" id="aj-concepto" value="Saldo inicial histórico" /></div>`,
      footHtml: `<button type="button" class="erp-btn" id="aj-cancel">Cancelar</button><button type="button" class="erp-btn erp-btn--pri" id="aj-ok">Guardar Ajuste</button>`,
      onMount: (body, foot) => {
        foot.querySelector('#aj-cancel').addEventListener('click', cerrarModal);
        foot.querySelector('#aj-ok').addEventListener('click', async () => {
          const monto = Number(body.querySelector('#aj-monto').value) || 0;
          if (monto <= 0) { notify('Ingresá un importe mayor a cero.', 'error'); return; }
          try {
            await apiPost('ctacte_ajuste', {
              clave,
              tipo: body.querySelector('#aj-tipo').value,
              monto,
              concepto: body.querySelector('#aj-concepto').value.trim(),
            });
            await cargarTodoErp();
            cerrarModal();
            notify('Ajuste registrado', 'success');
            renderAll();
          } catch (err) {
            notify(err.message, 'error');
          }
        });
      },
    });
  }

  function abrirModalCobro(clave) {
    const cli = state.clientes[clave] || {};
    const pendientes = (state.ctacte.movimientos || [])
      .filter((m) => m.clave === clave && m.tipo === 'debe' && !m.anulado && Number(m.saldoPendiente) > 0);
    const medios = [{ medio: 'efectivo', monto: '', referencia: '', banco: '', numeroCheque: '', fechaCobroCheque: '' }];

    abrirModal({
      title: `Registrar Cobro (Recibo X) · ${cli.nombre || clave}`,
      wide: true,
      bodyHtml: `
        <div id="cob-pend-wrap" style="margin-bottom:14px;">
          ${pendientes.length ? `
            <div style="font-size:0.78rem; font-weight:700; margin-bottom:6px; color:var(--erp-ink-dim);">Comprobantes con saldo pendiente (marcá los que querés cancelar primero):</div>
            <div class="erp-table-wrap"><table class="erp-table">
              <thead><tr><th></th><th>Comprobante</th><th>Fecha</th><th class="num">Total</th><th class="num">Pendiente</th></tr></thead>
              <tbody>
                ${pendientes.map((p) => `<tr>
                  <td><input type="checkbox" class="cob-imp-chk" value="${esc(p.id)}" checked /></td>
                  <td class="erp-mono">${esc(p.comprobanteLabel)}</td>
                  <td>${fmtFecha(p.fecha)}</td>
                  <td class="num">${money(p.monto)}</td>
                  <td class="num"><strong>${money(p.saldoPendiente)}</strong></td>
                </tr>`).join('')}
              </tbody>
            </table></div>` : '<div style="font-size:0.82rem; color:var(--erp-ink-muted);">Sin cargos pendientes específicos: el cobro quedará como pago a cuenta.</div>'}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:0.84rem;">Medios de Pago</strong>
          <button type="button" class="erp-btn erp-btn--sm" id="cob-add-mp">+ Agregar Medio</button>
        </div>
        <div id="cob-mps"></div>

        <div class="erp-field" style="margin-top:10px;">
          <label>Observaciones del Recibo</label>
          <input type="text" class="erp-input" id="cob-obs" placeholder="Opcional" />
        </div>`,
      footHtml: `<strong id="cob-tot-lbl" class="erp-num" style="margin-right:auto;">Total Recibo: $ 0,00</strong><button type="button" class="erp-btn" id="cob-cancel">Cancelar</button><button type="button" class="erp-btn erp-btn--pri" id="cob-save">Emitir Recibo X</button>`,
      onMount: (body, foot) => {
        const renderMedios = () => {
          const cont = body.querySelector('#cob-mps');
          cont.innerHTML = medios.map((m, i) => `
            <div style="padding:10px; border:1px solid var(--erp-border); border-radius:8px; margin-bottom:8px; background:var(--erp-surface-2);">
              <div class="erp-field-row-3">
                <div class="erp-field" style="margin:0;">
                  <label>Medio</label>
                  <select class="erp-select cob-mp-tipo" data-i="${i}">
                    <option value="efectivo"${m.medio === 'efectivo' ? ' selected' : ''}>Efectivo</option>
                    <option value="banco"${m.medio === 'banco' ? ' selected' : ''}>Transferencia / Banco</option>
                    <option value="mercadopago"${m.medio === 'mercadopago' ? ' selected' : ''}>MercadoPago</option>
                    <option value="cheques"${m.medio === 'cheques' ? ' selected' : ''}>Cheque</option>
                  </select>
                </div>
                <div class="erp-field" style="margin:0;">
                  <label>Importe ($)</label>
                  <input type="number" step="0.01" min="0" class="erp-input cob-mp-monto" data-i="${i}" value="${m.monto}" placeholder="0.00" />
                </div>
                <div class="erp-field" style="margin:0;">
                  <label>Referencia / Comprobante</label>
                  <input type="text" class="erp-input cob-mp-ref" data-i="${i}" value="${esc(m.referencia)}" placeholder="Opcional" />
                </div>
              </div>
              ${m.medio === 'cheques' ? `
                <div class="erp-field-row-3" style="margin-top:8px;">
                  <div class="erp-field" style="margin:0;"><label>Banco</label><input type="text" class="erp-input cob-mp-bco" data-i="${i}" value="${esc(m.banco)}" /></div>
                  <div class="erp-field" style="margin:0;"><label>N° Cheque</label><input type="text" class="erp-input cob-mp-nch" data-i="${i}" value="${esc(m.numeroCheque)}" /></div>
                  <div class="erp-field" style="margin:0;"><label>Fecha de Cobro</label><input type="date" class="erp-input cob-mp-fch" data-i="${i}" value="${esc(m.fechaCobroCheque || hoyISO())}" /></div>
                </div>` : ''}
            </div>`).join('');

          const updTotal = () => {
            const sum = medios.reduce((s, x) => s + (Number(x.monto) || 0), 0);
            foot.querySelector('#cob-tot-lbl').textContent = `Total Recibo: ${money(sum)}`;
          };
          updTotal();

          cont.querySelectorAll('.cob-mp-tipo').forEach((s) => s.addEventListener('change', () => { medios[Number(s.dataset.i)].medio = s.value; renderMedios(); }));
          cont.querySelectorAll('.cob-mp-monto').forEach((inp) => inp.addEventListener('input', () => { medios[Number(inp.dataset.i)].monto = inp.value; updTotal(); }));
          cont.querySelectorAll('.cob-mp-ref').forEach((inp) => inp.addEventListener('input', () => { medios[Number(inp.dataset.i)].referencia = inp.value; }));
          cont.querySelectorAll('.cob-mp-bco').forEach((inp) => inp.addEventListener('input', () => { medios[Number(inp.dataset.i)].banco = inp.value; }));
          cont.querySelectorAll('.cob-mp-nch').forEach((inp) => inp.addEventListener('input', () => { medios[Number(inp.dataset.i)].numeroCheque = inp.value; }));
          cont.querySelectorAll('.cob-mp-fch').forEach((inp) => inp.addEventListener('input', () => { medios[Number(inp.dataset.i)].fechaCobroCheque = inp.value; }));
        };

        renderMedios();
        body.querySelector('#cob-add-mp').addEventListener('click', () => {
          medios.push({ medio: 'banco', monto: '', referencia: '', banco: '', numeroCheque: '', fechaCobroCheque: '' });
          renderMedios();
        });
        foot.querySelector('#cob-cancel').addEventListener('click', cerrarModal);
        foot.querySelector('#cob-save').addEventListener('click', async () => {
          const validos = medios.filter((m) => Number(m.monto) > 0);
          if (!validos.length) { notify('Ingresá al menos un importe mayor a cero.', 'error'); return; }
          const imps = [...body.querySelectorAll('.cob-imp-chk:checked')].map((c) => c.value);
          try {
            const res = await apiPost('ctacte_cobro', {
              clave,
              clienteNombre: cli.nombre || '',
              mediosPago: validos,
              imputaciones: imps,
              observaciones: body.querySelector('#cob-obs').value.trim(),
            });
            await cargarTodoErp();
            cerrarModal();
            notify(`Recibo ${res.recibo?.numero || ''} emitido`, 'success');
            renderAll();
            if (res.recibo && global.ErpPrint && confirm('¿Imprimir el Recibo X ahora?')) {
              global.ErpPrint.imprimirComprobante(res.recibo, state.config);
            }
          } catch (err) {
            notify(err.message, 'error');
          }
        });
      },
    });
  }

  /* ─────────────── VISTA 6: STOCK E INVENTARIO ─────────────── */
  function getStock(vid) {
    const s = state.stock[vid];
    return s ? (Number(s.actual) || 0) : 0;
  }

  function renderStock() {
    const root = document.getElementById('erp-stock-root');
    if (!root) return;

    const esAdmin = state.user.rol === 'admin';
    const puedeEditar = esAdmin || state.user.rol === 'deposito';
    const q = state.stkSearch.trim().toLowerCase();

    const rows = state.variantes.filter((v) => {
      if (state.stkCat !== 'all' && v.category !== state.stkCat) return false;
      const s = state.stock[v.variantId] || { actual: 0, minimo: 0 };
      if (state.stkFiltro === 'bajo' && !(s.minimo > 0 && s.actual <= s.minimo)) return false;
      if (state.stkFiltro === 'sin' && s.actual > 0) return false;
      if (state.stkFiltro === 'con' && s.actual <= 0) return false;
      if (!q) return true;
      return v.variantId.toLowerCase().includes(q) || v.nombre.toLowerCase().includes(q) || v.medida.toLowerCase().includes(q);
    });

    const totalConStock = state.variantes.filter((v) => getStock(v.variantId) > 0).length;
    const bajoMin = state.variantes.filter((v) => {
      const s = state.stock[v.variantId];
      return s && s.minimo > 0 && s.actual <= s.minimo;
    }).length;
    const valorizado = state.variantes.reduce((sum, v) => {
      const s = state.stock[v.variantId];
      if (!s || s.actual <= 0) return sum;
      const ref = Number(s.costo) > 0 ? Number(s.costo) : (Number(state.precios[v.variantId]) || 0);
      return sum + s.actual * ref;
    }, 0);

    root.innerHTML = `
      <div class="erp-kpi-grid">
        <div class="erp-kpi"><div class="erp-kpi-lbl">Variantes / SKUs</div><div class="erp-kpi-val">${state.variantes.length}</div></div>
        <div class="erp-kpi erp-kpi--ok"><div class="erp-kpi-lbl">Con Stock (>0)</div><div class="erp-kpi-val">${totalConStock}</div></div>
        <div class="erp-kpi ${bajoMin ? 'erp-kpi--warn' : ''}"><div class="erp-kpi-lbl">Bajo Mínimo</div><div class="erp-kpi-val">${bajoMin}</div></div>
        <div class="erp-kpi"><div class="erp-kpi-lbl">Valorización Estimada</div><div class="erp-kpi-val">${state.user.rol === 'deposito' ? '—' : money(valorizado)}</div></div>
      </div>

      <div class="erp-panel">
        <div class="erp-panel-head">
          <div>
            <h2>Control de Stock e Inventario</h2>
            <p class="erp-panel-sub">Ingresos de mercadería, ajustes de inventario, mínimos y ubicación en depósito.</p>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            ${esAdmin ? `
              <label style="display:flex; align-items:center; gap:7px; font-size:0.8rem; font-weight:600; padding:6px 10px; border:1px solid var(--erp-border); border-radius:7px; background:var(--erp-surface-2); cursor:pointer;">
                <input type="checkbox" id="stk-pub-toggle" ${state.config.mostrarDisponibilidadCatalogo ? 'checked' : ''} />
                Mostrar disponibilidad en Catálogo Web
              </label>` : ''}
            <button type="button" class="erp-btn" id="stk-csv">Exportar CSV</button>
          </div>
        </div>

        <div class="erp-seg">
          <button type="button" class="${state.stkTab === 'inventario' ? 'active' : ''}" data-stktab="inventario">Inventario por SKU</button>
          <button type="button" class="${state.stkTab === 'movs' ? 'active' : ''}" data-stktab="movs">Historial de Movimientos</button>
        </div>

        ${state.stkTab === 'inventario' ? `
          <div class="erp-toolbar">
            <input type="search" class="erp-input" id="stk-q" value="${esc(state.stkSearch)}" placeholder="Buscar código SKU, producto o medida..." style="flex:1; min-width:220px;" />
            <select class="erp-select" id="stk-cat">
              <option value="all">Todas las categorías</option>
              ${Object.entries(DISTRIJAM_CATEGORIAS || {}).map(([k, l]) => `<option value="${k}"${state.stkCat === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}
            </select>
            <select class="erp-select" id="stk-filt">
              <option value="todos"${state.stkFiltro === 'todos' ? ' selected' : ''}>Todos</option>
              <option value="con"${state.stkFiltro === 'con' ? ' selected' : ''}>Con stock</option>
              <option value="bajo"${state.stkFiltro === 'bajo' ? ' selected' : ''}>Bajo mínimo</option>
              <option value="sin"${state.stkFiltro === 'sin' ? ' selected' : ''}>Sin stock (0)</option>
            </select>
          </div>

          <div class="erp-table-wrap"><table class="erp-table">
            <thead>
              <tr>
                <th>Código SKU</th>
                <th>Producto / Medida</th>
                <th>Ubicación</th>
                <th class="num">Actual</th>
                <th class="num">Mínimo</th>
                ${state.user.rol === 'deposito' ? '' : '<th class="num">Precio Lista</th>'}
                <th class="num">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${rows.slice(0, 200).map((v) => {
                const s = state.stock[v.variantId] || { actual: 0, minimo: 0, ubicacion: '' };
                const badgeCls = s.minimo > 0 && s.actual <= s.minimo ? 'danger' : (s.actual > 0 ? 'ok' : 'neutral');
                return `<tr>
                  <td class="erp-mono">${esc(v.variantId)}</td>
                  <td><strong>${esc(v.nombre)}</strong><div style="font-size:0.74rem;color:var(--erp-ink-muted);">${esc(v.medida)} · ${esc(v.presentacion)}</div></td>
                  <td>${esc(s.ubicacion || '—')}</td>
                  <td class="num"><span class="erp-badge erp-badge--${badgeCls}">${s.actual}</span></td>
                  <td class="num">${s.minimo || 0}</td>
                  ${state.user.rol === 'deposito' ? '' : `<td class="num">${state.precios[v.variantId] ? money(state.precios[v.variantId]) : '—'}</td>`}
                  <td class="num" style="white-space:nowrap;">
                    ${puedeEditar ? `<button type="button" class="erp-btn erp-btn--sm stk-mov-btn" data-vid="${esc(v.variantId)}">Mover / Editar</button>` : 'Solo lectura'}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>
          ${rows.length > 200 ? `<p style="font-size:0.78rem; color:var(--erp-ink-muted); margin-top:8px;">Mostrando primeros 200 de ${rows.length} ítems. Usá el buscador para filtrar más rápido.</p>` : ''}
        ` : `
          <div class="erp-table-wrap"><table class="erp-table">
            <thead><tr><th>Fecha</th><th>SKU</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Stock Final</th><th>Referencia</th><th>Usuario</th></tr></thead>
            <tbody>
              ${(state.stockMovs || []).slice(0, 150).map((m) => `<tr>
                <td>${fmtFechaHora(m.fecha)}</td>
                <td class="erp-mono">${esc(m.variantId)}</td>
                <td><span class="erp-badge erp-badge--neutral">${esc(m.tipo)}</span></td>
                <td class="num">${m.cantidad}</td>
                <td class="num"><strong>${m.stockResultante}</strong></td>
                <td>${esc(m.referencia || '')}</td>
                <td>${esc(m.usuario || '')}</td>
              </tr>`).join('') || '<tr><td colspan="7" style="text-align:center; padding:24px;">Sin movimientos registrados aún.</td></tr>'}
            </tbody>
          </table></div>`}
      </div>`;

    root.querySelectorAll('[data-stktab]').forEach((b) => {
      b.addEventListener('click', () => { state.stkTab = b.dataset.stktab; renderStock(); });
    });
    document.getElementById('stk-q')?.addEventListener('input', (e) => { state.stkSearch = e.target.value; renderStock(); });
    document.getElementById('stk-cat')?.addEventListener('change', (e) => { state.stkCat = e.target.value; renderStock(); });
    document.getElementById('stk-filt')?.addEventListener('change', (e) => { state.stkFiltro = e.target.value; renderStock(); });

    document.getElementById('stk-pub-toggle')?.addEventListener('change', async (e) => {
      try {
        state.config.mostrarDisponibilidadCatalogo = e.target.checked;
        if (state.modoLocal) guardarLocal();
        else await apiPost('config_erp', { mostrarDisponibilidadCatalogo: e.target.checked });
        notify(e.target.checked ? 'Disponibilidad visible en el catálogo web' : 'Disponibilidad oculta del catálogo web', 'success');
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    document.getElementById('stk-csv')?.addEventListener('click', () => {
      const csv = [['Codigo', 'Producto', 'Medida', 'Presentacion', 'Ubicacion', 'Stock Actual', 'Minimo']];
      rows.forEach((v) => {
        const s = state.stock[v.variantId] || {};
        csv.push([v.variantId, v.nombre, v.medida, v.presentacion, s.ubicacion || '', s.actual || 0, s.minimo || 0]);
      });
      descargarCsv(`stock-distrijam-${hoyISO()}.csv`, csv);
    });

    root.querySelectorAll('.stk-mov-btn').forEach((b) => {
      b.addEventListener('click', () => abrirModalStock(b.dataset.vid));
    });
  }

  function abrirModalStock(vid) {
    const v = state.variantesMap[vid] || { nombre: vid, medida: '' };
    const s = state.stock[vid] || { actual: 0, minimo: 0, ubicacion: '', costo: 0 };
    const esAdmin = state.user.rol === 'admin';

    abrirModal({
      title: `Stock · ${v.nombre} (${vid})`,
      bodyHtml: `
        <div style="margin-bottom:14px; font-size:0.86rem; color:var(--erp-ink-dim);">
          Medida: <strong>${esc(v.medida || '—')}</strong> · Stock actual: <strong class="erp-num">${s.actual}</strong>
        </div>
        <div class="erp-field-row">
          <div class="erp-field"><label>Tipo de operación</label>
            <select class="erp-select" id="mstk-tipo">
              <option value="ingreso">Ingreso de mercadería (+)</option>
              <option value="ajuste_absoluto">Fijar conteo físico exacto (=)</option>
              <option value="merma">Egreso / Merma (−)</option>
              <option value="config">Solo actualizar Mínimo / Ubicación</option>
            </select>
          </div>
          <div class="erp-field"><label>Cantidad</label><input type="number" step="1" min="0" class="erp-input" id="mstk-cant" value="0" /></div>
        </div>
        <div class="erp-field-row-3">
          <div class="erp-field"><label>Stock Mínimo</label><input type="number" min="0" class="erp-input" id="mstk-min" value="${s.minimo || 0}" /></div>
          <div class="erp-field"><label>Ubicación (Estantería)</label><input type="text" class="erp-input" id="mstk-ubi" value="${esc(s.ubicacion || '')}" placeholder="Ej: Pasillo B - Est 4" /></div>
          ${esAdmin ? `<div class="erp-field"><label>Costo Reposición ($)</label><input type="number" step="0.01" min="0" class="erp-input" id="mstk-costo" value="${s.costo || 0}" /></div>` : ''}
        </div>
        <div class="erp-field"><label>Referencia / Motivo</label><input type="text" class="erp-input" id="mstk-ref" placeholder="Ej: Remito proveedor #4412" /></div>`,
      footHtml: `<button type="button" class="erp-btn" id="mstk-cancel">Cancelar</button><button type="button" class="erp-btn erp-btn--pri" id="mstk-save">Guardar</button>`,
      onMount: (body, foot) => {
        foot.querySelector('#mstk-cancel').addEventListener('click', cerrarModal);
        foot.querySelector('#mstk-save').addEventListener('click', async () => {
          const payload = {
            variantId: vid,
            tipo: body.querySelector('#mstk-tipo').value,
            cantidad: Number(body.querySelector('#mstk-cant').value) || 0,
            minimo: Number(body.querySelector('#mstk-min').value) || 0,
            ubicacion: body.querySelector('#mstk-ubi').value.trim(),
            referencia: body.querySelector('#mstk-ref').value.trim() || 'Movimiento manual',
          };
          if (esAdmin) payload.costo = Number(body.querySelector('#mstk-costo').value) || 0;
          try {
            if (state.modoLocal) {
              const cur = state.stock[vid] || { actual: 0, minimo: 0, ubicacion: '', costo: 0 };
              if (payload.tipo === 'ingreso') cur.actual += payload.cantidad;
              else if (payload.tipo === 'ajuste_absoluto') cur.actual = payload.cantidad;
              else if (payload.tipo === 'merma') cur.actual -= payload.cantidad;
              cur.minimo = payload.minimo;
              cur.ubicacion = payload.ubicacion;
              if (esAdmin) cur.costo = payload.costo;
              state.stock[vid] = cur;
              guardarLocal();
            } else {
              await apiPost('stock_movimiento', payload);
              await cargarTodoErp();
            }
            cerrarModal();
            notify('Stock actualizado', 'success');
            renderAll();
          } catch (err) {
            notify(err.message, 'error');
          }
        });
      },
    });
  }

  /* ─────────────── VISTA 8: TAREAS ─────────────── */
  function renderTareas() {
    const root = document.getElementById('erp-tareas-root');
    if (!root) return;

    const filtradas = state.tareas.filter((t) => state.tskCat === 'todos' || t.categoria === state.tskCat);
    const cols = [
      ['pendiente', 'Pendiente'],
      ['en_curso', 'En Curso'],
      ['revision', 'En Revisión'],
      ['completada', 'Completada'],
    ];

    root.innerHTML = `
      <div class="erp-panel">
        <div class="erp-panel-head">
          <div>
            <h2>Tareas Operativas</h2>
            <p class="erp-panel-sub">Seguimiento de armado en depósito, cobranzas, reposición y compras.</p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <div class="erp-seg" style="margin:0;">
              <button type="button" class="${state.tskModo === 'kanban' ? 'active' : ''}" data-tmodo="kanban">Tablero Kanban</button>
              <button type="button" class="${state.tskModo === 'lista' ? 'active' : ''}" data-tmodo="lista">Lista</button>
            </div>
            <button type="button" class="erp-btn erp-btn--pri" id="tsk-new">+ Nueva Tarea</button>
          </div>
        </div>

        <div class="erp-toolbar">
          <select class="erp-select" id="tsk-cat-filt">
            <option value="todos">Todos los sectores</option>
            <option value="deposito"${state.tskCat === 'deposito' ? ' selected' : ''}>Depósito / Armado</option>
            <option value="ventas"${state.tskCat === 'ventas' ? ' selected' : ''}>Ventas</option>
            <option value="cobranzas"${state.tskCat === 'cobranzas' ? ' selected' : ''}>Cobranzas</option>
            <option value="stock"${state.tskCat === 'stock' ? ' selected' : ''}>Compras / Stock</option>
            <option value="general"${state.tskCat === 'general' ? ' selected' : ''}>General</option>
          </select>
        </div>

        ${state.tskModo === 'kanban' ? `
          <div class="erp-kanban">
            ${cols.map(([cId, cLbl]) => {
              const items = filtradas.filter((t) => t.estado === cId);
              return `<div class="erp-kanban-col">
                <div class="erp-kanban-head"><span>${cLbl}</span><span class="erp-badge erp-badge--neutral">${items.length}</span></div>
                ${items.map((t) => `
                  <div class="erp-task-card">
                    <div style="display:flex; justify-content:space-between; gap:6px; align-items:center;">
                      <span class="erp-badge erp-badge--${t.prioridad === 'alta' ? 'danger' : (t.prioridad === 'media' ? 'warn' : 'info')}">${esc(t.prioridad)}</span>
                      <span style="font-size:0.7rem; color:var(--erp-ink-muted);">${esc((t.asignadoRol || t.categoria || '').toUpperCase())}</span>
                    </div>
                    <div class="erp-task-title">${esc(t.titulo)}</div>
                    ${t.descripcion ? `<div class="erp-task-desc">${esc(t.descripcion)}</div>` : ''}
                    ${(t.checklist || []).map((ch, idx) => `
                      <label style="display:flex; align-items:center; gap:6px; font-size:0.76rem; margin-bottom:3px; cursor:pointer;">
                        <input type="checkbox" class="tsk-chk" data-id="${esc(t.id)}" data-idx="${idx}" ${ch.hecho ? 'checked' : ''} />
                        <span style="${ch.hecho ? 'text-decoration:line-through; color:var(--erp-ink-muted);' : ''}">${esc(ch.texto)}</span>
                      </label>`).join('')}
                    <div class="erp-task-foot">
                      <select class="erp-select tsk-est-sel" data-id="${esc(t.id)}" style="height:28px; font-size:0.74rem; flex:1;">
                        ${cols.map(([k, l]) => `<option value="${k}"${t.estado === k ? ' selected' : ''}>${l}</option>`).join('')}
                      </select>
                      ${t.ventaId ? `<button type="button" class="erp-btn erp-btn--sm tsk-etq" data-vid="${esc(t.ventaId)}">Etiquetas</button>` : ''}
                      <button type="button" class="erp-btn erp-btn--sm erp-btn--danger tsk-del" data-id="${esc(t.id)}" title="Eliminar">✕</button>
                    </div>
                  </div>`).join('')}
              </div>`;
            }).join('')}
          </div>
        ` : `
          <div class="erp-table-wrap"><table class="erp-table">
            <thead><tr><th>Tarea</th><th>Sector</th><th>Prioridad</th><th>Fecha límite</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              ${filtradas.map((t) => `<tr>
                <td><strong>${esc(t.titulo)}</strong><div style="font-size:0.76rem;color:var(--erp-ink-muted);">${esc(t.descripcion || '')}</div></td>
                <td>${esc(t.categoria || 'general')}</td>
                <td><span class="erp-badge erp-badge--${t.prioridad === 'alta' ? 'danger' : 'warn'}">${esc(t.prioridad)}</span></td>
                <td>${fmtFecha(t.fechaLimite)}</td>
                <td>
                  <select class="erp-select tsk-est-sel" data-id="${esc(t.id)}" style="height:30px;">
                    ${cols.map(([k, l]) => `<option value="${k}"${t.estado === k ? ' selected' : ''}>${l}</option>`).join('')}
                  </select>
                </td>
                <td class="num"><button type="button" class="erp-btn erp-btn--sm erp-btn--danger tsk-del" data-id="${esc(t.id)}">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table></div>`}
      </div>`;

    root.querySelectorAll('[data-tmodo]').forEach((b) => b.addEventListener('click', () => { state.tskModo = b.dataset.tmodo; renderTareas(); }));
    document.getElementById('tsk-cat-filt')?.addEventListener('change', (e) => { state.tskCat = e.target.value; renderTareas(); });
    document.getElementById('tsk-new')?.addEventListener('click', () => abrirModalTarea());

    root.querySelectorAll('.tsk-est-sel').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const t = state.tareas.find((x) => x.id === sel.dataset.id);
        if (!t) return;
        t.estado = sel.value;
        if (!state.modoLocal) await apiPost('tareas', t);
        else guardarLocal();
        renderAll();
      });
    });

    root.querySelectorAll('.tsk-chk').forEach((chk) => {
      chk.addEventListener('change', async () => {
        const t = state.tareas.find((x) => x.id === chk.dataset.id);
        if (!t || !t.checklist?.[Number(chk.dataset.idx)]) return;
        t.checklist[Number(chk.dataset.idx)].hecho = chk.checked;
        if (!state.modoLocal) await apiPost('tareas', t);
        else guardarLocal();
        renderTareas();
      });
    });

    root.querySelectorAll('.tsk-etq').forEach((b) => b.addEventListener('click', () => abrirEtiquetasDeVenta(b.dataset.vid)));
    root.querySelectorAll('.tsk-del').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta tarea?')) return;
        if (state.modoLocal) {
          state.tareas = state.tareas.filter((t) => t.id !== b.dataset.id);
          guardarLocal();
        } else {
          await apiPost('tarea_borrar', { id: b.dataset.id });
          await cargarTodoErp();
        }
        renderAll();
      });
    });
  }

  function abrirModalTarea() {
    abrirModal({
      title: 'Nueva Tarea Operativa',
      bodyHtml: `
        <div class="erp-field"><label>Título *</label><input type="text" class="erp-input" id="mtsk-tit" placeholder="Ej: Llamar a Ferretería Norte por pago" /></div>
        <div class="erp-field"><label>Descripción</label><textarea class="erp-textarea" id="mtsk-desc"></textarea></div>
        <div class="erp-field-row-3">
          <div class="erp-field"><label>Sector / Categoría</label>
            <select class="erp-select" id="mtsk-cat">
              <option value="deposito">Depósito</option>
              <option value="ventas">Ventas</option>
              <option value="cobranzas">Cobranzas</option>
              <option value="stock">Stock / Compras</option>
              <option value="general">General</option>
            </select>
          </div>
          <div class="erp-field"><label>Prioridad</label>
            <select class="erp-select" id="mtsk-prio">
              <option value="alta">Alta</option>
              <option value="media" selected>Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <div class="erp-field"><label>Fecha límite</label><input type="date" class="erp-input" id="mtsk-fecha" value="${hoyISO()}" /></div>
        </div>`,
      footHtml: `<button type="button" class="erp-btn" id="mtsk-cancel">Cancelar</button><button type="button" class="erp-btn erp-btn--pri" id="mtsk-save">Crear Tarea</button>`,
      onMount: (body, foot) => {
        foot.querySelector('#mtsk-cancel').addEventListener('click', cerrarModal);
        foot.querySelector('#mtsk-save').addEventListener('click', async () => {
          const titulo = body.querySelector('#mtsk-tit').value.trim();
          if (!titulo) { notify('Ingresá un título.', 'error'); return; }
          const payload = {
            titulo,
            descripcion: body.querySelector('#mtsk-desc').value.trim(),
            categoria: body.querySelector('#mtsk-cat').value,
            prioridad: body.querySelector('#mtsk-prio').value,
            fechaLimite: body.querySelector('#mtsk-fecha').value,
            estado: 'pendiente',
          };
          if (state.modoLocal) {
            state.tareas.unshift({ ...payload, id: 'tsk_' + Date.now(), checklist: [] });
            guardarLocal();
          } else {
            await apiPost('tareas', payload);
            await cargarTodoErp();
          }
          cerrarModal();
          notify('Tarea creada', 'success');
          renderAll();
        });
      },
    });
  }

  /* ─────────────── VISTA 9: FINANZAS Y CAJA ─────────────── */
  function renderFinanzas() {
    const root = document.getElementById('erp-finanzas-root');
    if (!root) return;

    const s = state.finanzas.saldos || {};
    const movs = (state.finanzas.movimientos || []).filter((m) => state.finCuenta === 'todos' || m.cuenta === state.finCuenta);
    const cheques = state.finanzas.cheques || [];

    root.innerHTML = `
      <div class="erp-kpi-grid">
        <div class="erp-kpi"><div class="erp-kpi-lbl">Efectivo / Caja</div><div class="erp-kpi-val">${money(s.efectivo)}</div></div>
        <div class="erp-kpi"><div class="erp-kpi-lbl">Banco / Transferencias</div><div class="erp-kpi-val">${money(s.banco)}</div></div>
        <div class="erp-kpi"><div class="erp-kpi-lbl">MercadoPago</div><div class="erp-kpi-val">${money(s.mercadopago)}</div></div>
        <div class="erp-kpi erp-kpi--accent"><div class="erp-kpi-lbl">Cheques en Cartera</div><div class="erp-kpi-val">${money(s.cheques)}</div></div>
      </div>

      <div class="erp-panel">
        <div class="erp-panel-head">
          <div>
            <h2>Finanzas, Caja y Cartera de Cheques</h2>
            <p class="erp-panel-sub">Ingresos por cobros, pagos a proveedores, gastos fijos y acreditación de valores.</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="erp-btn" id="fin-csv">Exportar CSV</button>
            <button type="button" class="erp-btn erp-btn--pri" id="fin-new">+ Nuevo Movimiento</button>
          </div>
        </div>

        <div class="erp-seg">
          <button type="button" class="${state.finTab === 'movimientos' ? 'active' : ''}" data-ftab="movimientos">Movimientos de Caja y Bancos</button>
          <button type="button" class="${state.finTab === 'cheques' ? 'active' : ''}" data-ftab="cheques">Cartera de Cheques (${cheques.length})</button>
        </div>

        ${state.finTab === 'movimientos' ? `
          <div class="erp-toolbar">
            <select class="erp-select" id="fin-cta-filt">
              <option value="todos">Todas las cuentas</option>
              <option value="efectivo"${state.finCuenta === 'efectivo' ? ' selected' : ''}>Efectivo</option>
              <option value="banco"${state.finCuenta === 'banco' ? ' selected' : ''}>Banco</option>
              <option value="mercadopago"${state.finCuenta === 'mercadopago' ? ' selected' : ''}>MercadoPago</option>
              <option value="cheques"${state.finCuenta === 'cheques' ? ' selected' : ''}>Cheques</option>
            </select>
          </div>
          <div class="erp-table-wrap"><table class="erp-table">
            <thead><tr><th>Fecha</th><th>Cuenta</th><th>Categoría</th><th>Concepto</th><th class="num">Ingreso</th><th class="num">Egreso</th><th></th></tr></thead>
            <tbody>
              ${movs.slice(0, 150).map((m) => `<tr>
                <td>${fmtFecha(m.fecha)}</td>
                <td><span class="erp-badge erp-badge--neutral">${esc(m.cuenta)}</span></td>
                <td>${esc(m.categoria || '—')}</td>
                <td>${esc(m.concepto)}</td>
                <td class="num" style="color:var(--erp-ok); font-weight:600;">${m.tipo === 'ingreso' ? money(m.monto) : '—'}</td>
                <td class="num" style="color:var(--erp-danger); font-weight:600;">${m.tipo === 'egreso' ? money(m.monto) : '—'}</td>
                <td class="num"><button type="button" class="erp-btn erp-btn--sm erp-btn--danger fin-del" data-id="${esc(m.id)}">✕</button></td>
              </tr>`).join('') || '<tr><td colspan="7" style="text-align:center; padding:24px;">Sin movimientos financieros registrados.</td></tr>'}
            </tbody>
          </table></div>
        ` : `
          <div class="erp-table-wrap"><table class="erp-table">
            <thead><tr><th>N° Cheque</th><th>Banco / Librador</th><th>Vto. Cobro</th><th class="num">Importe</th><th>Estado</th></tr></thead>
            <tbody>
              ${cheques.map((ch) => `<tr>
                <td class="erp-mono"><strong>#${esc(ch.numero)}</strong></td>
                <td>${esc(ch.banco)}<div style="font-size:0.74rem;color:var(--erp-ink-muted);">${esc(ch.librador || '')}</div></td>
                <td>${fmtFecha(ch.fechaCobro)}</td>
                <td class="num"><strong>${money(ch.monto)}</strong></td>
                <td>
                  <select class="erp-select chq-est-sel" data-id="${esc(ch.id)}" style="height:30px;">
                    ${['en_cartera', 'depositado', 'acreditado', 'entregado_proveedor', 'rechazado'].map((e) => `<option value="${e}"${ch.estado === e ? ' selected' : ''}>${e.replace('_', ' ')}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('') || '<tr><td colspan="5" style="text-align:center; padding:24px;">No hay cheques registrados.</td></tr>'}
            </tbody>
          </table></div>`}
      </div>`;

    root.querySelectorAll('[data-ftab]').forEach((b) => b.addEventListener('click', () => { state.finTab = b.dataset.ftab; renderFinanzas(); }));
    document.getElementById('fin-cta-filt')?.addEventListener('change', (e) => { state.finCuenta = e.target.value; renderFinanzas(); });
    document.getElementById('fin-new')?.addEventListener('click', () => abrirModalMovimientoFin());
    document.getElementById('fin-csv')?.addEventListener('click', () => {
      const csv = [['Fecha', 'Tipo', 'Cuenta', 'Categoria', 'Concepto', 'Monto']];
      movs.forEach((m) => csv.push([fmtFecha(m.fecha), m.tipo, m.cuenta, m.categoria, m.concepto, m.monto]));
      descargarCsv(`finanzas-distrijam-${hoyISO()}.csv`, csv);
    });

    root.querySelectorAll('.fin-del').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este movimiento financiero?')) return;
        await apiPost('finanzas_borrar', { id: b.dataset.id });
        await cargarTodoErp();
      });
    });

    root.querySelectorAll('.chq-est-sel').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          await apiPost('finanzas_cheque_estado', { id: sel.dataset.id, estado: sel.value });
          await cargarTodoErp();
          notify('Estado de cheque actualizado', 'success');
        } catch (err) {
          notify(err.message, 'error');
        }
      });
    });
  }

  function abrirModalMovimientoFin() {
    abrirModal({
      title: 'Registrar Movimiento de Caja / Banco',
      bodyHtml: `
        <div class="erp-field-row-3">
          <div class="erp-field"><label>Tipo</label>
            <select class="erp-select" id="mfin-tipo"><option value="egreso">Egreso / Gasto</option><option value="ingreso">Ingreso</option></select>
          </div>
          <div class="erp-field"><label>Cuenta</label>
            <select class="erp-select" id="mfin-cta">
              <option value="efectivo">Efectivo</option>
              <option value="banco">Banco</option>
              <option value="mercadopago">MercadoPago</option>
            </select>
          </div>
          <div class="erp-field"><label>Categoría</label>
            <select class="erp-select" id="mfin-cat">
              <option value="proveedor">Pago a Proveedor</option>
              <option value="flete_logistica">Flete / Expreso</option>
              <option value="impuestos">Impuestos / ARCA / DGR</option>
              <option value="sueldos">Sueldos</option>
              <option value="servicios">Servicios / Alquiler</option>
              <option value="retiro">Retiro</option>
              <option value="ajuste">Aporte / Ajuste</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <div class="erp-field-row">
          <div class="erp-field"><label>Importe ($) *</label><input type="number" step="0.01" min="0.01" class="erp-input" id="mfin-monto" /></div>
          <div class="erp-field"><label>Concepto *</label><input type="text" class="erp-input" id="mfin-conc" placeholder="Ej: Pago flete Vía Cargo" /></div>
        </div>`,
      footHtml: `<button type="button" class="erp-btn" id="mfin-cancel">Cancelar</button><button type="button" class="erp-btn erp-btn--pri" id="mfin-save">Registrar</button>`,
      onMount: (body, foot) => {
        foot.querySelector('#mfin-cancel').addEventListener('click', cerrarModal);
        foot.querySelector('#mfin-save').addEventListener('click', async () => {
          const monto = Number(body.querySelector('#mfin-monto').value) || 0;
          const concepto = body.querySelector('#mfin-conc').value.trim();
          if (monto <= 0 || !concepto) { notify('Ingresá concepto e importe válido.', 'error'); return; }
          await apiPost('finanzas_movimiento', {
            tipo: body.querySelector('#mfin-tipo').value,
            cuenta: body.querySelector('#mfin-cta').value,
            categoria: body.querySelector('#mfin-cat').value,
            monto,
            concepto,
          });
          await cargarTodoErp();
          cerrarModal();
          notify('Movimiento registrado', 'success');
        });
      },
    });
  }

  /* ─────────────── VISTA 10: CONFIGURACIÓN Y USUARIOS ─────────────── */
  function renderConfig() {
    const root = document.getElementById('erp-config-root');
    if (!root) return;
    const c = state.config;

    root.innerHTML = `
      <div class="erp-grid-2">
        <div class="erp-panel">
          <div class="erp-panel-head">
            <div>
              <h2>Datos de Empresa y Facturación</h2>
              <p class="erp-panel-sub">Se muestran en presupuestos, remitos, recibos y portal de cuenta corriente.</p>
            </div>
          </div>
          <form id="cfg-form">
            <div class="erp-field-row">
              <div class="erp-field"><label>Razón Social</label><input class="erp-input" id="cfg-emp" value="${esc(c.empresa)}" /></div>
              <div class="erp-field"><label>CUIT</label><input class="erp-input" id="cfg-cuit" value="${esc(c.cuit)}" /></div>
            </div>
            <div class="erp-field-row">
              <div class="erp-field"><label>Dirección</label><input class="erp-input" id="cfg-dir" value="${esc(c.direccion)}" /></div>
              <div class="erp-field"><label>Localidad</label><input class="erp-input" id="cfg-loc" value="${esc(c.localidad)}" /></div>
            </div>
            <div class="erp-field-row-3">
              <div class="erp-field"><label>Punto de Venta</label><input class="erp-input" id="cfg-pv" value="${esc(c.puntoVenta)}" /></div>
              <div class="erp-field"><label>IVA por defecto (%)</label><input type="number" class="erp-input" id="cfg-iva" value="${c.ivaPct}" /></div>
              <div class="erp-field"><label>Validez Presup. (días)</label><input type="number" class="erp-input" id="cfg-val" value="${c.diasValidez}" /></div>
            </div>
            <div class="erp-field-row-3">
              <div class="erp-field"><label>Banco</label><input class="erp-input" id="cfg-bco" value="${esc(c.banco || '')}" placeholder="Ej: Banco Galicia" /></div>
              <div class="erp-field"><label>CBU</label><input class="erp-input" id="cfg-cbu" value="${esc(c.cbu || '')}" /></div>
              <div class="erp-field"><label>Alias CBU</label><input class="erp-input" id="cfg-alias" value="${esc(c.aliasCbu || '')}" /></div>
            </div>
            <div style="display:flex; gap:10px; justify-content:space-between; flex-wrap:wrap; margin-top:10px;">
              <a class="erp-btn" href="api.php?a=backup_erp" target="_blank" rel="noopener">Descargar Backup JSON</a>
              <button type="submit" class="erp-btn erp-btn--pri">Guardar Configuración</button>
            </div>
          </form>
        </div>

        <div class="erp-panel">
          <div class="erp-panel-head">
            <div>
              <h2>Usuarios y Roles del Sistema</h2>
              <p class="erp-panel-sub">Creá accesos separados para Ventas y Depósito.</p>
            </div>
            <button type="button" class="erp-btn erp-btn--pri erp-btn--sm" id="usr-new">+ Nuevo Usuario</button>
          </div>
          <div class="erp-table-wrap"><table class="erp-table">
            <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr><td class="erp-mono"><strong>admin</strong></td><td>Administrador Principal</td><td><span class="erp-badge erp-badge--info">ADMIN</span></td><td><span class="erp-badge erp-badge--ok">Activo</span></td><td></td></tr>
              ${state.usuarios.map((u) => `<tr>
                <td class="erp-mono"><strong>${esc(u.usuario)}</strong></td>
                <td>${esc(u.nombre)}</td>
                <td><span class="erp-badge erp-badge--neutral">${esc(String(u.rol).toUpperCase())}</span></td>
                <td><span class="erp-badge erp-badge--${u.activo ? 'ok' : 'danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td class="num"><button type="button" class="erp-btn erp-btn--sm erp-btn--danger usr-del" data-id="${esc(u.id)}">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      </div>`;

    document.getElementById('cfg-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await apiPost('config_erp', {
        empresa: document.getElementById('cfg-emp').value.trim(),
        cuit: document.getElementById('cfg-cuit').value.trim(),
        direccion: document.getElementById('cfg-dir').value.trim(),
        localidad: document.getElementById('cfg-loc').value.trim(),
        puntoVenta: document.getElementById('cfg-pv').value.trim(),
        ivaPct: Number(document.getElementById('cfg-iva').value) || 21,
        diasValidez: parseInt(document.getElementById('cfg-val').value, 10) || 7,
        banco: document.getElementById('cfg-bco').value.trim(),
        cbu: document.getElementById('cfg-cbu').value.trim(),
        aliasCbu: document.getElementById('cfg-alias').value.trim(),
      });
      await cargarTodoErp();
      notify('Configuración guardada', 'success');
    });

    document.getElementById('usr-new')?.addEventListener('click', () => {
      abrirModal({
        title: 'Nuevo Usuario del Sistema',
        bodyHtml: `
          <div class="erp-field-row">
            <div class="erp-field"><label>Usuario (sin espacios) *</label><input class="erp-input" id="musr-u" placeholder="ej: ventas1" /></div>
            <div class="erp-field"><label>Nombre completo *</label><input class="erp-input" id="musr-n" placeholder="ej: Juan Pérez" /></div>
          </div>
          <div class="erp-field-row">
            <div class="erp-field"><label>Rol</label>
              <select class="erp-select" id="musr-r">
                <option value="ventas">Ventas (Cotizador, Ventas, Clientes, Facturación)</option>
                <option value="deposito">Depósito (Stock, Tareas, Etiquetas de Cajas)</option>
                <option value="admin">Administrador Total</option>
              </select>
            </div>
            <div class="erp-field"><label>Contraseña (mín. 6 caracteres) *</label><input type="password" class="erp-input" id="musr-p" /></div>
          </div>`,
        footHtml: `<button type="button" class="erp-btn" id="musr-cancel">Cancelar</button><button type="button" class="erp-btn erp-btn--pri" id="musr-save">Crear Usuario</button>`,
        onMount: (body, foot) => {
          foot.querySelector('#musr-cancel').addEventListener('click', cerrarModal);
          foot.querySelector('#musr-save').addEventListener('click', async () => {
            try {
              await apiPost('usuarios', {
                usuario: body.querySelector('#musr-u').value.trim(),
                nombre: body.querySelector('#musr-n').value.trim(),
                rol: body.querySelector('#musr-r').value,
                clave: body.querySelector('#musr-p').value,
                activo: true,
              });
              await cargarTodoErp();
              cerrarModal();
              notify('Usuario creado', 'success');
            } catch (err) {
              notify(err.message, 'error');
            }
          });
        },
      });
    });

    root.querySelectorAll('.usr-del').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este usuario?')) return;
        await apiPost('usuarios', { op: 'borrar', id: b.dataset.id });
        await cargarTodoErp();
      });
    });
  }

  /* ─────────────── Utilidades ─────────────── */
  function descargarCsv(nombre, filas) {
    const csvText = '\uFEFF' + filas.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ─────────────── Omnibar Global (Ctrl+K) ─────────────── */
  function initOmnibar() {
    const inp = document.getElementById('erp-global-search');
    const resBox = document.getElementById('erp-omni-results');
    if (!inp || !resBox) return;

    const cerrar = () => { resBox.style.display = 'none'; };

    const mostrar = () => {
      const q = inp.value.trim().toLowerCase();
      if (q.length < 2) { cerrar(); return; }
      const rect = inp.getBoundingClientRect();
      resBox.style.top = (rect.bottom + 6) + 'px';
      resBox.style.left = Math.max(12, Math.min(rect.left, global.innerWidth - 432)) + 'px';

      const hitsCli = Object.entries(state.clientes).filter(([k, c]) =>
        k.includes(q.replace(/\D/g, '') || '___') || String(c.nombre || '').toLowerCase().includes(q)
      ).slice(0, 4);
      const hitsVta = state.ventas.filter((v) =>
        String(v.numero || '').toLowerCase().includes(q) || String(v.clienteNombre || '').toLowerCase().includes(q)
      ).slice(0, 4);
      const hitsSku = state.variantes.filter((v) =>
        v.variantId.toLowerCase().includes(q) || v.nombre.toLowerCase().includes(q)
      ).slice(0, 4);

      if (!hitsCli.length && !hitsVta.length && !hitsSku.length) {
        resBox.innerHTML = '<div style="padding:14px; font-size:0.82rem; color:var(--erp-ink-muted); text-align:center;">Sin resultados para "' + esc(q) + '"</div>';
      } else {
        resBox.innerHTML = [
          hitsCli.length ? `<div class="erp-omni-group">Clientes</div>` + hitsCli.map(([k, c]) => `<button type="button" class="erp-omni-item" data-type="cli" data-id="${esc(k)}"><span>${esc(c.nombre)}</span><small>${esc(c.cuit || k)}</small></button>`).join('') : '',
          hitsVta.length ? `<div class="erp-omni-group">Ventas</div>` + hitsVta.map((v) => `<button type="button" class="erp-omni-item" data-type="vta" data-id="${esc(v.id)}"><span>${esc(v.numero)} · ${esc(v.clienteNombre)}</span><small>${money(v.total)}</small></button>`).join('') : '',
          hitsSku.length ? `<div class="erp-omni-group">Productos / SKUs</div>` + hitsSku.map((s) => `<button type="button" class="erp-omni-item" data-type="sku" data-id="${esc(s.variantId)}"><span>${esc(s.nombre)} · ${esc(s.medida)}</span><small>Stock ${getStock(s.variantId)}</small></button>`).join('') : '',
        ].join('');
      }
      resBox.style.display = 'block';

      resBox.querySelectorAll('.erp-omni-item').forEach((b) => {
        b.addEventListener('click', () => {
          cerrar();
          inp.value = '';
          if (b.dataset.type === 'cli') { state.cliSeleccionado = b.dataset.id; cambiarVista('clientes'); }
          else if (b.dataset.type === 'vta') { abrirEtiquetasDeVenta(b.dataset.id); }
          else if (b.dataset.type === 'sku') { state.stkSearch = b.dataset.id; cambiarVista('stock'); }
        });
      });
    };

    inp.addEventListener('input', mostrar);
    document.addEventListener('click', (e) => {
      if (!inp.contains(e.target) && !resBox.contains(e.target)) cerrar();
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inp.focus();
      }
    });
  }

  /* ─────────────── Boot ─────────────── */
  function initErp(detail = {}) {
    if (state.iniciado) return;
    if (!document.getElementById('erp-nav')) return;
    state.iniciado = true;

    if (detail && detail.modoLocal) state.modoLocal = true;
    state.user = {
      usuario: detail?.usuario || 'admin',
      nombre: detail?.nombre || 'Administrador',
      rol: detail?.rol || 'admin',
    };

    aplicarPermisosPorRol();

    document.querySelectorAll('#erp-nav .erp-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => cambiarVista(btn.dataset.view));
    });

    document.querySelectorAll('#erp-ventas-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => setVentasSubtab(btn.dataset.vtab));
    });

    document.getElementById('erp-menu-toggle')?.addEventListener('click', () => {
      document.getElementById('erp-sidebar')?.classList.toggle('open');
    });

    document.getElementById('erp-btn-nueva-venta')?.addEventListener('click', () => abrirModalVenta());
    document.getElementById('erp-modal-close')?.addEventListener('click', cerrarModal);
    document.getElementById('erp-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'erp-modal-overlay') cerrarModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cerrarModal();
    });

    initOmnibar();
    cargarTodoErp();
  }

  document.addEventListener('distrijam:sesion-lista', (e) => initErp(e.detail || {}));

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const panel = document.getElementById('admin-dashboard');
      const visible = panel && getComputedStyle(panel).display !== 'none';
      if (visible && !state.iniciado) initErp({});
    }, 700);
  });

  global.Erp = {
    getStock,
    confirmarPedidoComoVenta: (pedido, cliDatos) => abrirModalVenta(pedido, cliDatos),
    recargar: cargarTodoErp,
    cambiarVista,
  };
})(window);
