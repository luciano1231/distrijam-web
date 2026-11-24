/* ======================================================
   DISTRIJAM — estado-cuenta.js
   ====================================================== */

'use strict';

(function () {
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

  let dataGlobal = null;
  let activeTab = 'comprobantes';

  function render() {
    const root = document.getElementById('ec-root');
    const d = dataGlobal;
    if (!root || !d) return;

    const cli = d.cliente || {};
    const emp = d.empresa || {};
    const res = d.resumen || {};
    const saldo = Number(res.saldoActual) || 0;

    const btnPrint = document.getElementById('ec-print-resumen');
    if (btnPrint) {
      btnPrint.style.display = '';
      btnPrint.onclick = () => window.ErpPrint && window.ErpPrint.imprimirEstadoCuenta(d);
    }

    const btnWa = document.getElementById('ec-wa-pago');
    if (btnWa && emp.whatsapp) {
      const txt = `Hola Distrijam, soy ${cli.nombre || ''} (CUIT ${cli.cuit || ''}). Les escribo para informar un pago sobre mi Cuenta Corriente (Saldo: ${money(saldo)}).`;
      btnWa.href = `https://wa.me/${emp.whatsapp}?text=${encodeURIComponent(txt)}`;
      btnWa.style.display = '';
    }

    const comps = d.comprobantes || [];
    const movs = [...(d.movimientos || [])].reverse();

    root.innerHTML = `
      <section class="ec-card">
        <div class="ec-cli-head">
          <div>
            <h1>${esc(cli.nombre || 'Cliente')}</h1>
            <div class="ec-cli-meta">
              CUIT / CUIL: <strong>${esc(cli.cuit || '—')}</strong>
              ${cli.condicion ? ` · ${esc(cli.condicion)}` : ''}
              ${cli.localidad ? ` · ${esc([cli.direccion, cli.localidad, cli.provincia].filter(Boolean).join(', '))}` : ''}
            </div>
          </div>
          <div style="font-size:0.8rem; color:#64748B;">Actualizado al ${new Date().toLocaleDateString('es-AR')}</div>
        </div>

        <div class="ec-kpis">
          <div class="ec-kpi ${saldo > 0.01 ? 'ec-kpi--saldo' : 'ec-kpi--ok'}">
            <div class="ec-kpi-lbl">Saldo Actual</div>
            <div class="ec-kpi-val">${saldo <= 0.01 ? 'Al día (' + money(saldo) + ')' : money(saldo)}</div>
          </div>
          <div class="ec-kpi">
            <div class="ec-kpi-lbl">Total Facturado / Cargos</div>
            <div class="ec-kpi-val">${money(res.debeTotal)}</div>
          </div>
          <div class="ec-kpi">
            <div class="ec-kpi-lbl">Total Abonado</div>
            <div class="ec-kpi-val">${money(res.haberTotal)}</div>
          </div>
        </div>
      </section>

      ${emp.cbu || emp.aliasCbu ? `
        <section class="ec-banco">
          <div>
            <strong>Datos bancarios para transferencias (${esc(emp.nombre || 'DISTRIJAM S.A.')})</strong>
            <div style="color:#475569; margin-top:2px;">
              ${emp.banco ? esc(emp.banco) + ' · ' : ''}
              ${emp.cbu ? `CBU: <code id="ec-cbu-val">${esc(emp.cbu)}</code>` : ''}
              ${emp.aliasCbu ? ` · Alias: <strong id="ec-alias-val">${esc(emp.aliasCbu)}</strong>` : ''}
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            ${emp.cbu ? `<button type="button" class="ec-btn ec-btn--sm" data-copy="${esc(emp.cbu)}">Copiar CBU</button>` : ''}
            ${emp.aliasCbu ? `<button type="button" class="ec-btn ec-btn--sm" data-copy="${esc(emp.aliasCbu)}">Copiar Alias</button>` : ''}
          </div>
        </section>` : ''}

      <section class="ec-card">
        <div class="ec-tabs">
          <button type="button" class="${activeTab === 'comprobantes' ? 'active' : ''}" data-tab="comprobantes">Comprobantes (${comps.length})</button>
          <button type="button" class="${activeTab === 'movimientos' ? 'active' : ''}" data-tab="movimientos">Movimientos de Cuenta (${movs.length})</button>
        </div>

        ${activeTab === 'comprobantes' ? (
          comps.length === 0
            ? '<p style="color:#64748B; padding:18px 0;">Aún no hay comprobantes emitidos en tu cuenta.</p>'
            : `<div class="ec-table-wrap"><table class="ec-table">
                <thead><tr><th>Fecha</th><th>Comprobante</th><th>Número</th><th>CAE / Ref.</th><th class="num">Total</th><th class="num">Acciones</th></tr></thead>
                <tbody>
                  ${comps.map((c) => {
                    const tInfo = window.ErpPrint ? window.ErpPrint.etiquetaTipoComprobante(c.tipo) : { titulo: c.tipo };
                    return `<tr>
                      <td>${fmtFecha(c.fechaEmision)}</td>
                      <td><span class="ec-badge">${esc(tInfo.titulo)} ${esc(tInfo.letra || '')}</span></td>
                      <td><strong>${esc(c.numero)}</strong></td>
                      <td>${esc(c.cae || c.ventaNumero || '—')}</td>
                      <td class="num"><strong>${money(c.total)}</strong></td>
                      <td class="num" style="white-space:nowrap;">
                        <button type="button" class="ec-btn ec-btn--sm ec-comp-print" data-id="${esc(c.id)}">Ver / Imprimir</button>
                        ${c.archivoUrl ? `<a class="ec-btn ec-btn--sm" href="${esc(c.archivoUrl)}" target="_blank" rel="noopener">Descargar PDF</a>` : ''}
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table></div>`
        ) : (
          movs.length === 0
            ? '<p style="color:#64748B; padding:18px 0;">No hay movimientos registrados.</p>'
            : `<div class="ec-table-wrap"><table class="ec-table">
                <thead><tr><th>Fecha</th><th>Comprobante</th><th>Concepto</th><th class="num">Debe</th><th class="num">Haber</th><th class="num">Saldo</th></tr></thead>
                <tbody>
                  ${movs.map((m) => `<tr>
                    <td>${fmtFecha(m.fecha)}</td>
                    <td><strong>${esc(m.comprobanteLabel || '—')}</strong></td>
                    <td>${esc(m.concepto || '')}</td>
                    <td class="num">${m.tipo === 'debe' ? money(m.monto) : '—'}</td>
                    <td class="num">${m.tipo === 'haber' ? money(m.monto) : '—'}</td>
                    <td class="num"><strong>${money(m.saldoAcumulado)}</strong></td>
                  </tr>`).join('')}
                </tbody>
              </table></div>`
        )}
      </section>`;

    root.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => { activeTab = b.dataset.tab; render(); });
    });
    root.querySelectorAll('[data-copy]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          const orig = b.textContent;
          b.textContent = '¡Copiado!';
          setTimeout(() => { b.textContent = orig; }, 1600);
        } catch (e) {}
      });
    });
    root.querySelectorAll('.ec-comp-print').forEach((b) => {
      b.addEventListener('click', () => {
        const comp = comps.find((x) => x.id === b.dataset.id);
        if (comp && window.ErpPrint) {
          window.ErpPrint.imprimirComprobante({
            ...comp,
            clienteNombre: cli.nombre,
            clienteCuit: cli.cuit,
            clienteCondicion: cli.condicion,
            clienteDireccion: [cli.direccion, cli.localidad, cli.provincia].filter(Boolean).join(', '),
          }, emp);
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const token = new URLSearchParams(window.location.search).get('t') || '';
    const root = document.getElementById('ec-root');
    if (!token) {
      root.innerHTML = '<div class="ec-card"><h1>Enlace incompleto</h1><p style="margin-top:8px;color:#475569;">Solicitá a Distrijam tu enlace personal de Estado de Cuenta.</p></div>';
      return;
    }
    try {
      const res = await fetch('api.php?a=estado_cuenta_publico&t=' + encodeURIComponent(token), { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        throw new Error((data && data.error) || 'No se pudo cargar el estado de cuenta.');
      }
      dataGlobal = data;
      render();
    } catch (err) {
      root.innerHTML = `<div class="ec-card"><h1>No pudimos abrir este resumen</h1><p style="margin-top:8px;color:#475569;">${esc(err.message)}</p></div>`;
    }
  });
})();
