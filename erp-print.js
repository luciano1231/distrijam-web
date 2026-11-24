/* ======================================================
   DISTRIJAM — erp-print.js
   Motor de impresión vectorial:
   - Código de barras Code 128B en SVG puro
   - Código QR ISO/IEC 18004 (Byte Mode, Versiones 1-8, ECC L) en SVG puro
   - Etiquetas de Cajas (Térmica 100x150mm y Hoja A4 1/2/4 por carilla)
   - Documentos A4: Presupuesto X, Remito R, Factura/Nota A-B-C,
     Recibo de Cobro X y Resumen de Cuenta Corriente
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
    if (!iso) return new Date().toLocaleDateString('es-AR');
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? String(iso) : dt.toLocaleDateString('es-AR');
  };

  /* ─────────────── Code 128B SVG ─────────────── */
  const C128_PATTERNS = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  ];

  function generarBarcodeSvg(texto, height = 38) {
    const clean = String(texto || 'DISTRIJAM').replace(/[^\x20-\x7E]/g, '').slice(0, 36) || 'DISTRIJAM';
    const codes = [104]; // Start Code B
    let checksum = 104;
    for (let i = 0; i < clean.length; i++) {
      const val = clean.charCodeAt(i) - 32;
      codes.push(val);
      checksum += val * (i + 1);
    }
    codes.push(checksum % 103);
    codes.push(106); // Stop

    let x = 8; // quiet zone
    const bars = [];
    for (const c of codes) {
      const pat = C128_PATTERNS[c] || C128_PATTERNS[0];
      for (let i = 0; i < pat.length; i++) {
        const w = Number(pat[i]);
        if (i % 2 === 0) {
          bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`);
        }
        x += w;
      }
    }
    const totalW = x + 8;
    return `<svg class="dj-barcode-svg" viewBox="0 0 ${totalW} ${height}" width="100%" height="${height}" preserveAspectRatio="none" role="img" aria-label="Código de barras ${esc(clean)}"><rect width="${totalW}" height="${height}" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`;
  }

  /* ─────────────── QR Code SVG (ISO 18004 Byte Mode, V1-V8, ECC L) ─────────────── */
  const QR_GF_EXP = new Uint8Array(512);
  const QR_GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      QR_GF_EXP[i] = x;
      QR_GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) QR_GF_EXP[i] = QR_GF_EXP[i - 255];
  })();

  function qrGfMul(a, b) {
    return (a === 0 || b === 0) ? 0 : QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]];
  }

  function qrRsGenPoly(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = QR_GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= qrGfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function qrRsEncode(data, ecCount) {
    const gen = qrRsGenPoly(ecCount);
    const res = new Uint8Array(data.length + ecCount);
    res.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= qrGfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Versiones 1 a 8 con corrección L: [capacidadBytes, totalCodewords, blocks: [[numBlocks, dataCw, ecCw], ...], alignPos]
  const QR_SPECS = [
    null,
    { ver: 1, cap: 17,  blocks: [[1, 19, 7]],  align: [] },
    { ver: 2, cap: 32,  blocks: [[1, 34, 10]], align: [6, 18] },
    { ver: 3, cap: 53,  blocks: [[1, 55, 15]], align: [6, 22] },
    { ver: 4, cap: 78,  blocks: [[1, 80, 20]], align: [6, 26] },
    { ver: 5, cap: 106, blocks: [[1, 108, 26]], align: [6, 30] },
    { ver: 6, cap: 134, blocks: [[2, 68, 18]], align: [6, 34] },
    { ver: 7, cap: 154, blocks: [[2, 78, 20]], align: [6, 22, 38] },
    { ver: 8, cap: 192, blocks: [[2, 97, 24]], align: [6, 24, 42] },
  ];

  // Format bits precalculados para ECC L (01) y máscaras 0..7 (con máscara 0x5412 aplicada)
  const QR_FORMAT_L = [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976];
  const QR_VERSION_INFO = {
    7: 0x07c94,
    8: 0x085bc,
  };

  function utf8Bytes(str) {
    const s = String(str || 'DISTRIJAM');
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    const bin = unescape(encodeURIComponent(s));
    return Array.from(bin, (ch) => ch.charCodeAt(0));
  }

  function generarQrMatriz(texto) {
    const bytes = utf8Bytes(texto);
    let spec = QR_SPECS.find((s) => s && bytes.length <= s.cap);
    if (!spec) {
      spec = QR_SPECS[8];
      bytes.length = spec.cap;
    }

    const totalDataCw = spec.blocks.reduce((sum, [n, d]) => sum + n * d, 0);
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    pushBits(0b0100, 4); // Byte mode
    pushBits(bytes.length, 8);
    bytes.forEach((b) => pushBits(b, 8));

    const maxBits = totalDataCw * 8;
    const term = Math.min(4, maxBits - bits.length);
    pushBits(0, term);
    while (bits.length % 8 !== 0) bits.push(0);
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < maxBits) {
      pushBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    const dataCw = new Uint8Array(totalDataCw);
    for (let i = 0; i < totalDataCw; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
      dataCw[i] = v;
    }

    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (const [count, dLen, ecLen] of spec.blocks) {
      for (let b = 0; b < count; b++) {
        const slice = dataCw.slice(offset, offset + dLen);
        offset += dLen;
        dataBlocks.push(slice);
        ecBlocks.push(qrRsEncode(slice, ecLen));
      }
    }

    const interleaved = [];
    const maxD = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxD; i++) {
      dataBlocks.forEach((b) => { if (i < b.length) interleaved.push(b[i]); });
    }
    const maxEc = Math.max(...ecBlocks.map((b) => b.length));
    for (let i = 0; i < maxEc; i++) {
      ecBlocks.forEach((b) => { if (i < b.length) interleaved.push(b[i]); });
    }

    const size = spec.ver * 4 + 17;
    const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const func = Array.from({ length: size }, () => new Uint8Array(size));

    const setMod = (r, c, val, isFunc = true) => {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      mat[r][c] = val ? 1 : 0;
      if (isFunc) func[r][c] = 1;
    };

    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const dark = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setMod(r, c, dark, true);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing
    for (let i = 8; i < size - 8; i++) {
      setMod(6, i, i % 2 === 0, true);
      setMod(i, 6, i % 2 === 0, true);
    }

    // Alignment
    const pos = spec.align;
    for (const r of pos) {
      for (const c of pos) {
        if (func[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setMod(r + dr, c + dc, dark, true);
          }
        }
      }
    }

    // Dark module & reserve format/version areas
    setMod(size - 8, 8, true, true);
    for (let i = 0; i < 9; i++) {
      if (!func[8][i]) setMod(8, i, false, true);
      if (!func[i][8]) setMod(i, 8, false, true);
    }
    for (let i = 0; i < 8; i++) {
      setMod(8, size - 1 - i, false, true);
      setMod(size - 1 - i, 8, false, true);
    }
    if (spec.ver >= 7) {
      const vBits = QR_VERSION_INFO[spec.ver];
      for (let i = 0; i < 18; i++) {
        const bit = ((vBits >> i) & 1) === 1;
        const a = Math.floor(i / 3), b = i % 3;
        setMod(a, size - 11 + b, bit, true);
        setMod(size - 11 + b, a, bit, true);
      }
    }

    // Data placement
    let bitIdx = 0;
    const totalDataBits = interleaved.length * 8;
    let up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) {
        const r = up ? size - 1 - i : i;
        for (const c of [col, col - 1]) {
          if (func[r][c]) continue;
          let bit = 0;
          if (bitIdx < totalDataBits) {
            bit = (interleaved[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
          mat[r][c] = bit;
        }
      }
      up = !up;
    }

    // Evaluar máscaras 0..7
    const maskFn = [
      (r, c) => (r + c) % 2 === 0,
      (r) => r % 2 === 0,
      (_r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];

    let bestMask = 0;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      let darkCount = 0;
      let penalty = 0;
      const g = mat.map((row, r) => row.map((v, c) => (func[r][c] ? v : (v ^ (maskFn[m](r, c) ? 1 : 0)))));
      for (let r = 0; r < size; r++) {
        let runR = 1, runC = 1;
        for (let c = 0; c < size; c++) {
          if (g[r][c]) darkCount++;
          if (c > 0) {
            if (g[r][c] === g[r][c - 1]) runR++;
            else { if (runR >= 5) penalty += runR - 2; runR = 1; }
            if (g[c][r] === g[c - 1][r]) runC++;
            else { if (runC >= 5) penalty += runC - 2; runC = 1; }
          }
          if (r < size - 1 && c < size - 1) {
            const sum = g[r][c] + g[r][c + 1] + g[r + 1][c] + g[r + 1][c + 1];
            if (sum === 0 || sum === 4) penalty += 3;
          }
        }
        if (runR >= 5) penalty += runR - 2;
        if (runC >= 5) penalty += runC - 2;
      }
      const ratioDiff = Math.abs((darkCount * 100) / (size * size) - 50);
      penalty += Math.floor(ratioDiff / 5) * 10;
      if (penalty < bestScore) { bestScore = penalty; bestMask = m; }
    }

    const finalMat = mat.map((row, r) => row.map((v, c) => (func[r][c] ? v : (v ^ (maskFn[bestMask](r, c) ? 1 : 0)))));
    const fmt = QR_FORMAT_L[bestMask];
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >> i) & 1;
      if (i < 6) finalMat[8][i] = bit;
      else if (i < 8) finalMat[8][i + 1] = bit;
      else finalMat[8][size - 15 + i] = bit;

      if (i < 8) finalMat[size - 1 - i][8] = bit;
      else if (i < 9) finalMat[15 - i][8] = bit;
      else finalMat[14 - i][8] = bit;
    }

    return finalMat;
  }

  function generarQrSvg(texto, pxSize = 72) {
    const m = generarQrMatriz(texto);
    const n = m.length;
    const quiet = 2;
    const total = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (m[r][c]) d += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
    return `<svg class="dj-qr-svg" viewBox="0 0 ${total} ${total}" width="${pxSize}" height="${pxSize}" shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  /* ─────────────── Impresión en @page dinámico ─────────────── */
  function setPageRule(cssText) {
    let style = document.getElementById('erp-page-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'erp-page-style';
      document.head.appendChild(style);
    }
    style.textContent = cssText;
  }

  function imprimirHtml(html, docTitle, pageCss) {
    const cont = document.getElementById('cot-print');
    if (!cont) return;
    setPageRule(pageCss || '@media print { @page { size: A4; margin: 12mm; } }');
    cont.innerHTML = html;
    document.body.classList.add('cot-printing');

    const originalTitle = document.title;
    if (docTitle) {
      document.title = String(docTitle).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
    }

    const limpiar = () => {
      document.title = originalTitle;
      document.body.classList.remove('cot-printing');
      window.removeEventListener('afterprint', limpiar);
    };
    window.addEventListener('afterprint', limpiar);
    window.print();
    setTimeout(limpiar, 1800);
  }

  /* ─────────────── Etiquetas de Cajas (Térmica 100x150mm y A4) ─────────────── */
  function tarjetaEtiquetaHtml(cfg, bultoIdx, totalBultos, extraClass = '') {
    const codigoTracking = `DJ-${(cfg.ventaNumero || 'ENVIO').replace(/[^A-Z0-9-]/gi, '')}-B${String(bultoIdx).padStart(2, '0')}`;
    const qrPayload = cfg.qrUrl || `${codigoTracking} | ${cfg.clienteNombre || ''} | ${bultoIdx}/${totalBultos}`;
    const qrSvg = generarQrSvg(qrPayload, 56);
    const barSvg = generarBarcodeSvg(codigoTracking, 28);
    const itemsCaja = (cfg.detalleBultos && cfg.detalleBultos[bultoIdx - 1])
      ? String(cfg.detalleBultos[bultoIdx - 1])
      : '';
    const locProv = [cfg.localidad, cfg.provincia].filter(Boolean).join(' · ') || 'CORRIENTES';

    return `
      <div class="etq-card ${extraClass}">
        <div class="etq-top">
          <div class="etq-brand">
            <img src="Logo/LogoDistrijamCompleto.png" alt="Distrijam S.A." class="etq-logo" />
            <div class="etq-remitente">${esc(cfg.empresaNombre || 'DISTRIJAM S.A.')} · ${esc(cfg.empresaDir || 'Iberá 1740, Corrientes')} · Tel. ${esc(cfg.empresaTel || '3794 007195')}</div>
          </div>
          <div class="etq-fecha">${fmtFecha(cfg.fecha)}</div>
        </div>

        <div class="etq-dest">
          <div class="etq-lbl">DESTINATARIO</div>
          <div class="etq-cli-nombre">${esc(cfg.clienteNombre || 'CLIENTE')}</div>
          <div class="etq-cli-dir">${esc(cfg.direccion || 'Retira en depósito / Sin dirección')}</div>
          <div class="etq-loc-bar">${esc(locProv.toUpperCase())}</div>
          <div class="etq-cli-meta">
            ${cfg.cuit ? `<span>CUIT: ${esc(cfg.cuit)}</span>` : ''}
            ${cfg.telefono ? `<span>Tel: ${esc(cfg.telefono)}</span>` : ''}
          </div>
        </div>

        <div class="etq-log-row">
          <div class="etq-transporte">
            <span class="etq-lbl">TRANSPORTE / EXPRESO</span>
            <strong>${esc(cfg.transporte || 'Retira / Envío propio')}</strong>
          </div>
          <div class="etq-doc">
            <span class="etq-lbl">VENTA / REMITO</span>
            <strong>${esc(cfg.ventaNumero || '—')}</strong>
            ${cfg.remitoNumero ? `<small>${esc(cfg.remitoNumero)}</small>` : ''}
          </div>
        </div>

        <div class="etq-bulto-box">
          <div class="etq-bulto-main">
            <span class="etq-bulto-lbl">BULTO / CAJA</span>
            <div class="etq-bulto-num">${bultoIdx} <span>/ ${totalBultos}</span></div>
          </div>
          <div class="etq-flags">
            ${cfg.fragil ? '<span class="etq-fragil">FRÁGIL · MANIPULAR CON CUIDADO</span>' : ''}
            ${Number(cfg.pesoKg) > 0 ? `<span class="etq-peso">Peso aprox: ${Number(cfg.pesoKg).toLocaleString('es-AR')} kg</span>` : ''}
            ${cfg.notas ? `<span class="etq-nota">${esc(cfg.notas)}</span>` : ''}
          </div>
        </div>

        ${itemsCaja ? `<div class="etq-contenido"><strong>Contenido:</strong> ${esc(itemsCaja)}</div>` : ''}

        <div class="etq-foot">
          <div class="etq-bar-wrap">
            ${barSvg}
            <div class="etq-bar-txt">${esc(codigoTracking)}</div>
          </div>
          <div class="etq-qr-wrap">${qrSvg}</div>
        </div>
      </div>`;
  }

  function renderEtiquetasHtml(cfg, formato = 'termica') {
    const total = Math.max(1, Math.min(99, parseInt(cfg.bultos, 10) || 1));
    const cards = [];
    for (let i = 1; i <= total; i++) {
      cards.push(tarjetaEtiquetaHtml(cfg, i, total, formato === 'termica' ? 'etq-card--termica' : 'etq-card--a4'));
    }

    if (formato === 'termica') {
      return `<div class="etq-print-termica">${cards.join('')}</div>`;
    }

    const porHoja = formato === 'a4-1' ? 1 : (formato === 'a4-2' ? 2 : 4);
    const hojas = [];
    for (let i = 0; i < cards.length; i += porHoja) {
      const slice = cards.slice(i, i + porHoja).join('');
      hojas.push(`<div class="etq-a4-sheet etq-a4-${porHoja}">${slice}</div>`);
    }
    return `<div class="etq-print-a4">${hojas.join('')}</div>`;
  }

  function imprimirEtiquetas(cfg, formato = 'termica') {
    const html = renderEtiquetasHtml(cfg, formato);
    const pageCss = formato === 'termica'
      ? '@media print { @page { size: 100mm 150mm; margin: 0; } }'
      : '@media print { @page { size: A4; margin: 7mm; } }';
    const titulo = `Etiquetas ${cfg.ventaNumero || ''} ${cfg.clienteNombre || ''} (${cfg.bultos || 1} bultos)`;
    imprimirHtml(html, titulo, pageCss);
  }

  /* ─────────────── Documentos Comerciales A4 ─────────────── */
  function etiquetaTipoComprobante(tipo) {
    const map = {
      presupuesto_x: { letra: 'X', titulo: 'PRESUPUESTO', sub: 'Documento no válido como Factura', cod: '' },
      remito_r: { letra: 'R', titulo: 'REMITO', sub: 'Documento no válido como Factura', cod: 'Cod. 91' },
      recibo_x: { letra: 'X', titulo: 'RECIBO OFICIAL', sub: 'Comprobante de cobro interno', cod: '' },
      factura_a: { letra: 'A', titulo: 'FACTURA', sub: 'Original', cod: 'Cod. 01' },
      factura_b: { letra: 'B', titulo: 'FACTURA', sub: 'Original', cod: 'Cod. 06' },
      factura_c: { letra: 'C', titulo: 'FACTURA', sub: 'Original', cod: 'Cod. 11' },
      nota_credito_a: { letra: 'A', titulo: 'NOTA DE CRÉDITO', sub: 'Original', cod: 'Cod. 03' },
      nota_credito_b: { letra: 'B', titulo: 'NOTA DE CRÉDITO', sub: 'Original', cod: 'Cod. 08' },
      nota_credito_c: { letra: 'C', titulo: 'NOTA DE CRÉDITO', sub: 'Original', cod: 'Cod. 13' },
      nota_debito_a: { letra: 'A', titulo: 'NOTA DE DÉBITO', sub: 'Original', cod: 'Cod. 02' },
      nota_debito_b: { letra: 'B', titulo: 'NOTA DE DÉBITO', sub: 'Original', cod: 'Cod. 07' },
      nota_debito_c: { letra: 'C', titulo: 'NOTA DE DÉBITO', sub: 'Original', cod: 'Cod. 12' },
    };
    return map[tipo] || { letra: 'X', titulo: String(tipo || 'COMPROBANTE').toUpperCase(), sub: '', cod: '' };
  }

  function imprimirComprobante(comp, empresa = {}, opts = {}) {
    const tipoInfo = etiquetaTipoComprobante(comp.tipo);
    const mostrarPrecios = opts.mostrarPrecios !== false && comp.tipo !== 'remito_r' ? true : Boolean(opts.valorizado);
    const emp = {
      nombre: empresa.empresa || empresa.nombre || 'DISTRIJAM S.A.',
      subtitulo: empresa.subtitulo || 'DISTRIBUIDORA MAYORISTA',
      direccion: empresa.direccion || 'IBERA 1740',
      localidad: empresa.localidad || 'Corrientes',
      telefono: empresa.telefono || '3794 007195',
      email: empresa.email || 'autoperforantes@distrijam.com.ar',
      cuit: empresa.cuit || '30-71566968-0',
      dgr: empresa.dgr || '30-71566968-0',
      inicioActividades: empresa.inicioActividades || '01/08/2017',
      condicionIva: empresa.condicionIva || 'IVA Responsable Inscripto',
      banco: empresa.banco || '',
      cbu: empresa.cbu || '',
      aliasCbu: empresa.aliasCbu || '',
    };

    let cuerpoHtml = '';
    if (comp.tipo === 'recibo_x') {
      const medios = (comp.mediosPago || []).map((m) => `
        <tr>
          <td>${esc((m.medio || '').toUpperCase())}</td>
          <td>${esc(m.banco ? `${m.banco}${m.numeroCheque ? ' · Ch #' + m.numeroCheque : ''}${m.fechaCobroCheque ? ' (Vto ' + fmtFecha(m.fechaCobroCheque) + ')' : ''}` : (m.referencia || '—'))}</td>
          <td class="pq-num"><strong>${money(m.monto)}</strong></td>
        </tr>`).join('') || '<tr><td colspan="3">Sin detalle de medios</td></tr>';

      const imps = (comp.imputaciones || []).map((im) => `
        <tr>
          <td>${esc(im.comprobanteLabel || 'Cuenta Corriente')}</td>
          <td class="pq-num">${money(im.monto)}</td>
        </tr>`).join('') || '<tr><td>Pago a cuenta</td><td class="pq-num">' + money(comp.total) + '</td></tr>';

      cuerpoHtml = `
        <div class="pq-recibo-grid">
          <div>
            <h4 class="pq-sec-h">Medios de pago recibidos</h4>
            <table class="pq-tabla">
              <thead><tr><th>Medio</th><th>Detalle / Referencia</th><th class="pq-num">Importe</th></tr></thead>
              <tbody>${medios}</tbody>
            </table>
          </div>
          <div>
            <h4 class="pq-sec-h">Comprobantes cancelados / imputados</h4>
            <table class="pq-tabla">
              <thead><tr><th>Comprobante</th><th class="pq-num">Aplicado</th></tr></thead>
              <tbody>${imps}</tbody>
            </table>
          </div>
        </div>
        <div class="pq-pie" style="margin-top:32px;">
          <div class="pq-pie-izq">
            ${comp.observaciones ? `<div class="pq-nota"><strong>Observaciones:</strong> ${esc(comp.observaciones)}</div>` : ''}
            ${comp.saldoPosterior !== undefined ? `<div class="pq-validez">Saldo actualizado en Cuenta Corriente: <strong>${money(comp.saldoPosterior)}</strong></div>` : ''}
            ${emp.cbu ? `<div style="margin-top:6px;">Banco: ${esc(emp.banco)} · CBU: ${esc(emp.cbu)}${emp.aliasCbu ? ' · Alias: ' + esc(emp.aliasCbu) : ''}</div>` : ''}
          </div>
          <table class="pq-totales">
            <tr class="pq-total"><td>TOTAL RECIBIDO:</td><td class="pq-num">${money(comp.total)}</td></tr>
          </table>
        </div>
        <div class="pq-firma-box">
          <div class="pq-firma-linea">Firma y sello · ${esc(emp.nombre)}</div>
        </div>`;
    } else {
      const items = comp.items || [];
      const filas = items.map((it) => `
        <tr>
          <td class="pq-cod">${esc(it.variantId || '—')}</td>
          <td>${esc(it.nombre || '')}${it.medida ? ' ' + esc(it.medida) : ''}${it.presentacion ? ' · ' + esc(it.presentacion) : ''}</td>
          <td class="pq-num">${it.qty}</td>
          <td class="pq-uni">Un.</td>
          ${mostrarPrecios ? `
            <td class="pq-num">${money(it.precio)}</td>
            <td class="pq-num pq-iva">${Number(comp.ivaPct ?? 21).toLocaleString('es-AR', { minimumFractionDigits: 2 })}%</td>
            <td class="pq-num">${money((Number(it.precio) || 0) * (Number(it.qty) || 0))}</td>
          ` : ''}
        </tr>`).join('') || `<tr><td colspan="${mostrarPrecios ? 7 : 4}">Concepto general / Sin detalle de artículos</td></tr>`;

      const totalesHtml = mostrarPrecios ? `
        <table class="pq-totales">
          <tr><td>Subtotal:</td><td class="pq-num">${money(comp.subtotal ?? comp.neto)}</td></tr>
          ${Number(comp.descuentoMonto) > 0 ? `<tr><td>Bonif. ${comp.descuentoPct || ''}%:</td><td class="pq-num">− ${money(comp.descuentoMonto)}</td></tr>` : ''}
          <tr class="pq-sep"><td>Neto Gravado:</td><td class="pq-num">${money(comp.neto)}</td></tr>
          <tr><td>IVA ${comp.ivaPct ?? 21}%:</td><td class="pq-num">${money(comp.ivaMonto)}</td></tr>
          ${Number(comp.percepcionMonto) > 0 ? `<tr><td>Percepciones:</td><td class="pq-num">${money(comp.percepcionMonto)}</td></tr>` : ''}
          <tr class="pq-total"><td>TOTAL:</td><td class="pq-num">${money(comp.total)}</td></tr>
        </table>` : `
        <div class="pq-remito-recibo">
          <div><strong>Recibí conforme mercadería en buen estado</strong></div>
          <div class="pq-remito-campos">
            <span>Firma: _______________________</span>
            <span>Aclaración: _______________________</span>
            <span>DNI: ______________ &nbsp; Fecha: ____/____/______</span>
          </div>
        </div>`;

      const qrUrl = comp.cae
        ? `DISTRIJAM|${comp.numero}|CUIT:${emp.cuit}|CAE:${comp.cae}|TOTAL:${comp.total}`
        : `DISTRIJAM|${comp.numero}|${comp.clienteNombre || ''}`;

      cuerpoHtml = `
        <table class="pq-tabla">
          <thead>
            <tr>
              <th class="pq-cod">Cod. Artículo</th>
              <th>Descripción</th>
              <th class="pq-num">Cantidad</th>
              <th class="pq-uni"></th>
              ${mostrarPrecios ? `
                <th class="pq-num">Precio Unit.</th>
                <th class="pq-num">IVA</th>
                <th class="pq-num">Importe</th>
              ` : ''}
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="pq-pie" style="margin-top:42px;">
          <div class="pq-pie-izq">
            ${comp.observaciones ? `<div class="pq-nota"><strong>Observaciones:</strong> ${esc(comp.observaciones)}</div>` : ''}
            ${comp.transporte ? `<div><strong>Transporte / Expreso:</strong> ${esc(comp.transporte)}${comp.bultos ? ` · <strong>Bultos:</strong> ${comp.bultos}` : ''}</div>` : ''}
            ${comp.cae ? `<div class="pq-cae-box"><strong>CAE N°:</strong> ${esc(comp.cae)} &nbsp;·&nbsp; <strong>Vto. CAE:</strong> ${fmtFecha(comp.vtoCae)}</div>` : ''}
            ${comp.tipo === 'presupuesto_x' ? `<div class="pq-validez">Presupuesto válido por ${empresa.diasValidez || 7} días.</div>` : ''}
          </div>
          ${totalesHtml}
        </div>
        ${comp.cae ? `<div style="margin-top:14px; display:flex; align-items:center; gap:12px;">${generarQrSvg(qrUrl, 64)}<span style="font-size:9px; color:#555;">Comprobante registrado en Distrijam S.A.<br>CUIT Emisor: ${esc(emp.cuit)}</span></div>` : ''}`;
    }

    const html = `
      <div class="pq-hoja">
        <header class="pq-cab">
          <div class="pq-marca">
            <img src="Logo/LogoDistrijamCompleto.png" alt="${esc(emp.nombre)}" class="pq-logo" />
            <div class="pq-marca-sub">${esc(emp.subtitulo)}</div>
          </div>
          <div class="pq-novalido">
            <div class="pq-equis">${esc(tipoInfo.letra)}</div>
            ${tipoInfo.cod ? `<div style="font-weight:700;">${esc(tipoInfo.cod)}</div>` : ''}
            <div>${esc(tipoInfo.sub)}</div>
          </div>
          <div class="pq-titulo">
            <div class="pq-titulo-h">${esc(tipoInfo.titulo)}</div>
            <table class="pq-titulo-t">
              <tr><td>Nro.:</td><td><strong>${esc(comp.numero || '—')}</strong></td></tr>
              <tr><td>Fecha:</td><td>${fmtFecha(comp.fechaEmision || comp.fecha)}</td></tr>
              ${comp.ventaNumero ? `<tr><td>Ref. Venta:</td><td>${esc(comp.ventaNumero)}</td></tr>` : ''}
            </table>
          </div>
        </header>
        <section class="pq-empresa">
          <div>
            <div class="pq-emp-nombre">${esc(emp.nombre)}</div>
            <div>${esc(emp.direccion)} · ${esc(emp.localidad)}</div>
            <div>Tel. ${esc(emp.telefono)} · ${esc(emp.email)}</div>
          </div>
          <div class="pq-emp-fiscal">
            <div>CUIT Nro.: ${esc(emp.cuit)}</div>
            <div>Ing. Brutos / DGR: ${esc(emp.dgr)}</div>
            <div>Inicio Actividades: ${esc(emp.inicioActividades)}</div>
            <div class="pq-emp-iva">${esc(emp.condicionIva)}</div>
          </div>
        </section>
        <section class="pq-cliente">
          <div class="pq-cli-izq">
            <div class="pq-cli-nombre">${esc(comp.clienteNombre || 'Consumidor Final')}</div>
            ${comp.clienteDireccion ? `<div>${esc(comp.clienteDireccion)}</div>` : ''}
            <div>${esc(comp.clienteCondicion || '')} ${comp.clienteCuit ? 'CUIT/CUIL: ' + esc(comp.clienteCuit) : ''}</div>
          </div>
          <div class="pq-cli-der">
            ${comp.vendedor ? `<div>Vendedor: ${esc(comp.vendedor)}</div>` : ''}
            ${comp.clienteTelefono ? `<div>Tel.: ${esc(comp.clienteTelefono)}</div>` : ''}
          </div>
        </section>
        ${cuerpoHtml}
      </div>`;

    imprimirHtml(html, `${tipoInfo.titulo} ${comp.numero || ''} ${comp.clienteNombre || ''}`, '@media print { @page { size: A4; margin: 12mm; } }');
  }

  /* ─────────────── Resumen de Cuenta Corriente A4 ─────────────── */
  function imprimirEstadoCuenta(data) {
    const emp = data.empresa || {};
    const cli = data.cliente || {};
    const res = data.resumen || {};
    const movs = data.movimientos || [];

    const filas = movs.map((m) => `
      <tr>
        <td>${fmtFecha(m.fecha)}</td>
        <td class="pq-cod">${esc(m.comprobanteLabel || '—')}</td>
        <td>${esc(m.concepto || '')}</td>
        <td class="pq-num">${m.tipo === 'debe' ? money(m.monto) : '—'}</td>
        <td class="pq-num">${m.tipo === 'haber' ? money(m.monto) : '—'}</td>
        <td class="pq-num"><strong>${money(m.saldoAcumulado)}</strong></td>
      </tr>`).join('') || '<tr><td colspan="6">Sin movimientos registrados.</td></tr>';

    const html = `
      <div class="pq-hoja">
        <header class="pq-cab">
          <div class="pq-marca">
            <img src="Logo/LogoDistrijamCompleto.png" alt="Distrijam S.A." class="pq-logo" />
            <div class="pq-marca-sub">ESTADO DE CUENTA CORRIENTE</div>
          </div>
          <div class="pq-novalido">
            <div class="pq-equis">CC</div>
            <div>Resumen informativo</div>
          </div>
          <div class="pq-titulo">
            <div class="pq-titulo-h">RESUMEN DE CUENTA</div>
            <table class="pq-titulo-t">
              <tr><td>Emitido:</td><td>${new Date().toLocaleDateString('es-AR')}</td></tr>
              <tr><td>CUIT Emisor:</td><td>${esc(emp.cuit || '30-71566968-0')}</td></tr>
            </table>
          </div>
        </header>
        <section class="pq-cliente">
          <div class="pq-cli-izq">
            <div class="pq-cli-nombre">${esc(cli.nombre || 'Cliente')}</div>
            <div>${esc([cli.direccion, cli.localidad, cli.provincia].filter(Boolean).join(' · '))}</div>
            <div>CUIT/CUIL: ${esc(cli.cuit || '—')} · ${esc(cli.condicion || '')}</div>
          </div>
          <div class="pq-cli-der">
            <div><strong>Total Cargos:</strong> ${money(res.debeTotal)}</div>
            <div><strong>Total Abonado:</strong> ${money(res.haberTotal)}</div>
            <div style="font-size:13px; margin-top:4px;"><strong>SALDO ACTUAL: ${money(res.saldoActual)}</strong></div>
          </div>
        </section>
        <table class="pq-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th class="pq-cod">Comprobante</th>
              <th>Concepto</th>
              <th class="pq-num">Debe</th>
              <th class="pq-num">Haber</th>
              <th class="pq-num">Saldo</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        ${emp.cbu ? `
          <div class="pq-nota" style="margin-top:24px;">
            <strong>Datos bancarios para transferencias:</strong>
            ${emp.banco ? esc(emp.banco) + ' · ' : ''}Titular: ${esc(emp.titularCuenta || emp.nombre || 'DISTRIJAM S.A.')} · CBU: <code>${esc(emp.cbu)}</code>${emp.aliasCbu ? ` · Alias: <strong>${esc(emp.aliasCbu)}</strong>` : ''}
          </div>` : ''}
      </div>`;

    imprimirHtml(html, `Estado de Cuenta ${cli.nombre || ''} ${new Date().toLocaleDateString('es-AR')}`, '@media print { @page { size: A4; margin: 12mm; } }');
  }

  global.ErpPrint = {
    generarBarcodeSvg,
    generarQrSvg,
    renderEtiquetasHtml,
    imprimirEtiquetas,
    imprimirComprobante,
    imprimirEstadoCuenta,
    etiquetaTipoComprobante,
  };
})(window);
