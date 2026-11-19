/* ═══════════════════════════════════════════════════════════════
   DISTRIJAM — Actualizar la lista de precios desde la planilla
   del sistema (SKU / Descripción / Lista 1).

   - Del archivo solo se toman códigos y precios. Nombres, fotos y
     descripciones del catálogo siguen saliendo de productos.json.
   - Nada se guarda hasta apretar "Guardar". Cancelar descarta todo.
   - Con el panel (api.php y sesión iniciada) guarda en el servidor.
     Sin servidor (prueba local) usa precios.json de la carpeta y
     guarda en este navegador, con opción de descargar el archivo.
   - Lee .xlsx sin librerías: un .xlsx es un zip de XML y el
     navegador ya trae el descompresor (DecompressionStream).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const UMBRAL_SALTO = 0.5;      // cambio de precio de más de ±50 %: se revisa
const UMBRAL_NOMBRE = 0.55;    // parecido de nombres por debajo de esto: se revisa
const CLAVE_LOCAL = 'distrijam_precios_local';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
const pesos = (n) => (n > 0 ? fmtPesos.format(n) : '—');
const pct = (a, b) => (a > 0 && b > 0 ? (b - a) / a : null);
const fmtPct = (x) => (x === null ? '' : (x > 0 ? '+' : '') + (x * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' %');

const estado = {
  modo: 'local',          // 'servidor' | 'local'
  catalogo: new Map(),    // código -> { producto, descripcion }
  actuales: {},           // código -> precio vigente
  meta: null,             // { actualizada, archivo }
  archivo: null,          // { nombre, filas }
  r: null,                // resultado del análisis
  filtroErr: 'pend',
  filtroNue: 'pend',
  anterior: null,         // lista anterior a la última actualización (para deshacer)
  descartados: {},        // código -> { descripcion, precio, fecha }, recordados entre actualizaciones
};
const CLAVE_DESCARTADOS = 'distrijam_descartados_local';
const CLAVE_ANT = 'distrijam_precios_anterior_local';

/* ─────────────── Lectura de .xlsx ─────────────── */

async function leerZip(buffer) {
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No se pudo abrir el archivo como Excel moderno (.xlsx). Si es un Excel viejo (.xls), abrilo en Excel, elegí Guardar como y guardalo como .xlsx o CSV.');
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entradas = {};
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const tam = dv.getUint32(p + 20, true);
    const largoNombre = dv.getUint16(p + 28, true);
    const largoExtra = dv.getUint16(p + 30, true);
    const largoComent = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nombre = dec.decode(new Uint8Array(buffer, p + 46, largoNombre));
    entradas[nombre] = { metodo, tam, local };
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return async (nombre) => {
    const e = entradas[nombre];
    if (!e) return null;
    const ini = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
    const datos = new Uint8Array(buffer, ini, e.tam);
    if (e.metodo === 0) return dec.decode(datos);
    if (e.metodo !== 8) throw new Error('Compresión no soportada en el Excel.');
    const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(flujo).text();
  };
}

const xml = (texto) => new DOMParser().parseFromString(texto, 'application/xml');
const colNum = (ref) => {
  const letras = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

async function leerXlsx(buffer) {
  const abrir = await leerZip(buffer);

  // Primera hoja según el libro (no siempre es sheet1.xml)
  let ruta = 'xl/worksheets/sheet1.xml';
  const libro = await abrir('xl/workbook.xml');
  const rels = await abrir('xl/_rels/workbook.xml.rels');
  if (libro && rels) {
    const hoja = xml(libro).getElementsByTagName('sheet')[0];
    const rid = hoja && (hoja.getAttribute('r:id') || hoja.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    for (const rel of xml(rels).getElementsByTagName('Relationship')) {
      if (rel.getAttribute('Id') === rid) {
        const t = rel.getAttribute('Target').replace(/^\/?(xl\/)?/, '');
        ruta = 'xl/' + t;
      }
    }
  }

  const compartidos = [];
  const sst = await abrir('xl/sharedStrings.xml');
  if (sst) {
    for (const si of xml(sst).getElementsByTagName('si')) {
      let s = '';
      for (const t of si.getElementsByTagName('t')) s += t.textContent;
      compartidos.push(s);
    }
  }

  const hojaXml = await abrir(ruta);
  if (!hojaXml) throw new Error('No se encontró la hoja del Excel.');
  const filas = [];
  for (const row of xml(hojaXml).getElementsByTagName('row')) {
    const fila = [];
    for (const c of row.getElementsByTagName('c')) {
      const tipo = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0];
      let valor = null, numerico = false;
      if (tipo === 's') valor = v ? compartidos[Number(v.textContent)] : null;
      else if (tipo === 'inlineStr') { const t = c.getElementsByTagName('t')[0]; valor = t ? t.textContent : null; }
      else if (v) { valor = v.textContent; numerico = tipo !== 'str' && tipo !== 'b' && tipo !== 'e'; }
      fila[colNum(c.getAttribute('r'))] = { valor, numerico };
    }
    filas.push({ n: Number(row.getAttribute('r')), celdas: fila });
  }
  return filas;
}

function leerCsv(texto) {
  const primera = texto.split(/\r?\n/, 1)[0];
  const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], campo = '', comillas = false, n = 1;
  const cerrarCampo = () => { fila.push({ valor: campo, numerico: false }); campo = ''; };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) cerrarCampo();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      cerrarCampo(); filas.push({ n: n++, celdas: fila }); fila = [];
    } else campo += c;
  }
  if (campo || fila.length) { cerrarCampo(); filas.push({ n, celdas: fila }); }
  return filas;
}

/* ─────────────── De celdas a { código, descripción, precio } ─────────────── */

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

function aNumero(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function aCodigo(celda) {
  if (!celda || celda.valor === null) return '';
  let s = String(celda.valor).trim();
  if (celda.numerico && /e\+?\d+$/i.test(s)) s = BigInt(Math.round(Number(s))).toString();
  else if (celda.numerico && /^\d+\.0+$/.test(s)) s = s.split('.')[0];
  return s;
}

function interpretar(filasCrudas) {
  // Busca la fila de encabezados en las primeras 30
  let fEnc = -1, cCod = -1, cDesc = -1, cPrecio = -1;
  for (let i = 0; i < Math.min(30, filasCrudas.length) && fEnc < 0; i++) {
    const celdas = filasCrudas[i].celdas;
    let cod = -1, desc = -1, precios = [];
    celdas.forEach((c, j) => {
      const t = sinTildes(c && c.valor).toLowerCase().trim();
      if (!t) return;
      if (cod < 0 && /^(sku|cod(igo)?\.?|cod\. ?art(iculo)?|articulo|codigo de articulo)$/.test(t)) cod = j;
      else if (desc < 0 && /descrip|nombre|producto|detalle/.test(t)) desc = j;
      else if (/lista|precio/.test(t)) precios.push({ j, t });
    });
    if (cod >= 0 && precios.length) {
      fEnc = i; cCod = cod; cDesc = desc;
      cPrecio = (precios.find((p) => /lista ?1\b/.test(p.t)) || precios[0]).j;
    }
  }
  if (fEnc < 0) {
    throw new Error('No se encontraron las columnas. El archivo tiene que tener una columna de código (SKU) y una de precio (Lista 1).');
  }

  const filas = [];
  for (const f of filasCrudas.slice(fEnc + 1)) {
    const cel = f.celdas;
    const codigo = aCodigo(cel[cCod]);
    if (!codigo) continue; // títulos de sección (ALAS, ARANDELA…) y filas vacías
    const crudo = cel[cPrecio] ? cel[cPrecio].valor : null;
    filas.push({
      fila: f.n,
      codigo,
      numerico: !!(cel[cCod] && cel[cCod].numerico),
      descripcion: cDesc >= 0 && cel[cDesc] ? String(cel[cDesc].valor ?? '').trim() : '',
      precio: Math.round(aNumero(crudo) * 100) / 100,
    });
  }
  if (!filas.length) throw new Error('El archivo no tiene filas con código.');
  if (filas.length < 10) throw new Error(`El archivo trae solo ${filas.length} productos. Parece que no es la lista de precios completa: fijate que sea el archivo correcto.`);
  return filas;
}

/* ─────────────── Parecido entre nombres ─────────────── */

function normNombre(s) {
  return sinTildes(s).toUpperCase()
    .replace(/\bA\//g, 'ARANDELA ')
    .replace(/\bTAR\./g, 'TARUGO ')
    .replace(/\bTUER\./g, 'TUERCA ')
    .replace(/\bTCA\.?\b/g, 'TUERCA ')
    .replace(/\bUNID\.?|\bU\./g, 'U ')
    .replace(/[^A-Z0-9]/g, '');
}

function parecido(a, b) {
  a = normNombre(a); b = normNombre(b);
  if (!a || !b) return 1;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/* ─────────────── Códigos del archivo que no están en el catálogo ─────────────── */

const GRUPOS = { prueba: 'Prueba / sin precio', caja: 'Caja por mayor (FN)', otro: 'Posible producto nuevo' };

function grupoNuevo(f) {
  if (!(f.precio > 0) || /\b(TEST|NOTA DE CREDITO|APLICADA|PRESETACION|LEDBULB)\b/i.test(sinTildes(f.descripcion))) return 'prueba';
  if (/\bFN\b/i.test(f.descripcion)) return 'caja';
  return 'otro';
}

/* ─────────────── Análisis ─────────────── */

function analizar(filas) {
  const porCodigo = new Map();
  for (const f of filas) {
    const k = f.codigo.toUpperCase();
    if (!porCodigo.has(k)) porCodigo.set(k, []);
    porCodigo.get(k).push(f);
  }
  const usados = new Set();
  const codigos = new Set([...estado.catalogo.keys(), ...Object.keys(estado.actuales)]);

  const r = { cambios: [], iguales: 0, auto: [], menores: [], nuevos: [], errores: [] };

  for (const codigo of codigos) {
    const info = estado.catalogo.get(codigo) || { producto: '', descripcion: '' };
    const anterior = Number(estado.actuales[codigo]) || 0;
    let filasCod = porCodigo.get(codigo.toUpperCase());
    let recuperado = false;

    // Excel le saca el 0 de adelante a los códigos que parecen números
    if (!filasCod && /^0+\d/.test(codigo)) {
      const alt = porCodigo.get(codigo.replace(/^0+/, '').toUpperCase());
      if (alt && alt.some((f) => f.numerico)) { filasCod = alt; recuperado = true; }
    }

    const base = { id: codigo, codigo, producto: info.producto, descCatalogo: info.descripcion, anterior };

    if (!filasCod) {
      r.errores.push({ ...base, tipos: ['falta'], fila: null });
      continue;
    }
    filasCod.forEach((f) => usados.add(f));
    if (recuperado) r.auto.push({ codigo, enArchivo: filasCod[0].codigo, descripcion: filasCod[0].descripcion });

    const tipos = [];
    const distintos = [...new Set(filasCod.map((f) => f.precio))];
    if (distintos.length > 1) tipos.push('duplicado');
    const fila = filasCod[0];
    const nuevo = fila.precio;
    if (!(nuevo > 0) && distintos.length === 1) tipos.push('sin-precio');

    const sim = info.descripcion ? parecido(info.descripcion, fila.descripcion) : 1;
    if (sim < UMBRAL_NOMBRE) tipos.push('nombre');
    else if (info.descripcion && normNombre(info.descripcion) !== normNombre(fila.descripcion)) {
      r.menores.push({ codigo, antes: info.descripcion, ahora: fila.descripcion });
    }

    const v = pct(anterior, nuevo);
    if (v !== null && Math.abs(v) > UMBRAL_SALTO && !tipos.includes('duplicado')) tipos.push('salto');

    if (tipos.length) {
      r.errores.push({ ...base, tipos, fila, filas: filasCod, nuevo, variacion: v, parecido: sim });
    } else if (nuevo !== anterior) {
      r.cambios.push({ codigo, producto: info.producto, descripcion: info.descripcion || fila.descripcion, anterior, nuevo, variacion: v });
    } else {
      r.iguales++;
    }
  }

  for (const f of filas) {
    if (usados.has(f)) continue;
    f.grupo = grupoNuevo(f);
    // Lo que ya se descartó en una actualización anterior no vuelve a preguntarse
    if (estado.descartados[f.codigo]) f.estado = { accion: 'descartar', previo: true };
    r.nuevos.push(f);
  }

  // Sugerencias de reemplazo para los que faltan: códigos sueltos del archivo con nombre parecido
  for (const e of r.errores) {
    if (e.tipos[0] !== 'falta' || !e.descCatalogo) continue;
    e.candidatos = r.nuevos
      .filter((f) => f.precio > 0)
      .map((f) => ({ f, s: parecido(e.descCatalogo, f.descripcion) }))
      .filter((x) => x.s >= 0.6)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.f);
  }

  for (const e of r.errores) e.sugerida = sugerencia(e);
  const ORDEN = ['duplicado', 'salto', 'nombre', 'falta', 'sin-precio'];
  const prio = (e) => Math.min(...e.tipos.map((t) => ORDEN.indexOf(t)));
  r.errores.sort((a, b) => prio(a) - prio(b)); // primero lo que más dinero puede mover
  r.cambios.sort((a, b) => Math.abs(b.variacion ?? 0) - Math.abs(a.variacion ?? 0));
  return r;
}

const TEXTOS = {
  falta: ['No está en el archivo', 'Este código está en el catálogo pero no vino en la planilla. Puede que lo hayan dado de baja o le cambiaron el código.'],
  'sin-precio': ['Viene sin precio', 'El código está en la planilla pero con precio en 0 o vacío.'],
  duplicado: ['Código repetido', 'El código aparece más de una vez con precios distintos. Elegí cuál vale.'],
  nombre: ['Cambió mucho el nombre', 'Mismo código pero el nombre es muy distinto al del catálogo. Fijate que siga siendo el mismo producto antes de tomar el precio. Si no estás seguro, lo más seguro es dejar el precio de antes y consultar.'],
  salto: ['Salto de precio grande', 'El precio cambia más de la mitad. Suele pasar cuando cambia la presentación (por ej. de 100 a 10 unidades) o hay un error de carga. Si no estás seguro, lo más seguro es dejar el precio de antes y consultar con el proveedor.'],
};

// Lo sugerido solo existe cuando no hace falta mirar: si cambió el nombre o el precio salta, decide una persona
function sugerencia(e) {
  if (e.tipos.includes('nombre') || e.tipos.includes('salto') || e.tipos.includes('duplicado')) return null;
  return e.anterior > 0 ? { accion: 'anterior' } : { accion: 'quitar' };
}

function precioResuelto(e) {
  const res = e.resolucion;
  if (!res) return undefined;
  if (res.accion === 'nuevo') return e.nuevo;
  if (res.accion === 'anterior') return e.anterior;
  if (res.accion === 'quitar') return 0;
  return res.valor; // manual, codigo, fila
}

function describirResolucion(e) {
  const res = e.resolucion;
  switch (res.accion) {
    case 'nuevo': return `Toma el precio nuevo: <b>${pesos(e.nuevo)}</b>`;
    case 'anterior': return `Queda el precio de antes: <b>${pesos(e.anterior)}</b>`;
    case 'quitar': return 'Queda <b>sin precio</b> (en el cotizador figura para consultar)';
    case 'manual': return `Precio cargado a mano: <b>${pesos(res.valor)}</b>`;
    case 'codigo': return `Toma el precio del código <span class="ap-cod">${esc(res.codigo)}</span>: <b>${pesos(res.valor)}</b>`;
    case 'fila': return `Toma la fila ${res.fila} del archivo: <b>${pesos(res.valor)}</b>`;
  }
  return '';
}

/* ─────────────── Carga inicial ─────────────── */

async function cargarJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const texto = await res.text();
  let datos = null;
  try { datos = JSON.parse(texto); } catch (e) { /* no es JSON: no hay PHP */ }
  return { res, datos };
}

async function iniciar() {
  // 1) Catálogo público
  try {
    const { datos } = await cargarJson('productos.json');
    for (const p of datos || []) for (const v of p.variants || []) {
      estado.catalogo.set(v.id, { producto: p.name, descripcion: v.descripcion || `${p.name} ${v.medida || ''}` });
    }
  } catch (e) {
    mostrarError('No se pudo leer productos.json. Abrí esta página desde el sitio o con un servidor local.');
    return;
  }

  // 2) Precios vigentes: del servidor si hay panel, si no de la carpeta
  let servidor = null;
  try { servidor = await cargarJson('api.php?a=precios'); } catch (e) { /* sin servidor */ }

  if (servidor && servidor.datos && servidor.datos.ok) {
    estado.modo = 'servidor';
    estado.actuales = servidor.datos.precios || {};
    estado.meta = { actualizada: servidor.datos.actualizada, archivo: servidor.datos.archivo };
    try {
      const { datos } = await cargarJson('api.php?a=catalogo');
      for (const p of (datos && datos.productos) || []) for (const v of p.variants || []) {
        if (!estado.catalogo.has(v.id)) estado.catalogo.set(v.id, { producto: p.name, descripcion: v.descripcion || p.name });
      }
    } catch (e) { /* los productos propios son opcionales */ }
  } else if (servidor && servidor.res.status === 401) {
    mostrarError('Tu sesión del panel se cerró. Entrá de nuevo desde el panel de administración.');
    return;
  } else {
    estado.modo = 'local';
    const guardado = leerLocal();
    if (guardado) {
      estado.actuales = guardado.precios;
      estado.meta = { actualizada: guardado.actualizada, archivo: guardado.archivo, local: true };
    } else {
      try {
        const { res, datos } = await cargarJson('precios.json');
        estado.actuales = (datos && datos.precios) || {};
        const mod = res.headers.get('Last-Modified');
        estado.meta = {
          actualizada: (datos && datos.actualizada) || (mod ? new Date(mod).toISOString() : null),
          archivo: datos && datos.generado,
        };
      } catch (e) { estado.actuales = {}; }
    }
    const m = $('#ap-modo');
    m.hidden = false;
    m.innerHTML = 'Prueba local: se compara contra <b>precios.json</b> de esta carpeta y lo que guardes queda en este navegador. En el sitio real se guarda en el servidor.' +
      (guardado ? ' <button class="ap-link" id="ap-reset-local" type="button">Volver a precios.json</button>' : '');
    const btn = $('#ap-reset-local');
    if (btn) btn.onclick = () => { localStorage.removeItem(CLAVE_LOCAL); location.reload(); };
  }
  if (estado.modo === 'servidor') estado.anterior = (servidor.datos && servidor.datos.anterior) || null;
  else {
    try {
      const a = JSON.parse(localStorage.getItem(CLAVE_ANT) || 'null');
      estado.anterior = a && a.precios ? { actualizada: a.actualizada, archivo: a.archivo, total: Object.keys(a.precios).length } : null;
    } catch (e) { estado.anterior = null; }
  }
  await cargarDescartados();
  pintarDescartados();
  pintarUltima();
}

async function cargarDescartados() {
  let lista = {};
  try {
    if (estado.modo === 'servidor') {
      const { datos } = await cargarJson('api.php?a=descartados');
      if (datos && datos.ok) lista = datos.descartados;
    } else {
      lista = JSON.parse(localStorage.getItem(CLAVE_DESCARTADOS) || '{}');
    }
  } catch (e) { lista = {}; }
  estado.descartados = lista && typeof lista === 'object' && !Array.isArray(lista) ? lista : {};
}

async function persistirDescartados(obj) {
  if (JSON.stringify(obj) === JSON.stringify(estado.descartados)) return;
  if (estado.modo === 'servidor') {
    const res = await fetch('api.php?a=descartados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descartados: obj }),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok || !datos.ok) throw new Error(datos.error || 'No se pudo guardar la lista de descartados.');
  } else {
    localStorage.setItem(CLAVE_DESCARTADOS, JSON.stringify(obj));
  }
  estado.descartados = obj;
}

function leerLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || 'null');
    return d && d.precios ? d : null;
  } catch (e) { return null; }
}

function fechaLarga(iso) {
  const f = new Date(iso);
  if (!iso || isNaN(f)) return 'la lista anterior';
  return f.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) + ', ' + f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function pintarDeshacer() {
  const a = estado.anterior;
  $('#ap-deshacer').hidden = !a;
  $('#ap-deshacer-2').hidden = !a;
  if (a) $('#ap-deshacer-t').innerHTML = `¿Te equivocaste? Podés volver a la lista anterior (<b>${esc(fechaLarga(a.actualizada))}</b>, ${a.total} precios).`;
}

async function deshacerUltima() {
  const a = estado.anterior;
  if (!a) return;
  const ok = await confirmar('¿Volver a la lista anterior?',
    `Los precios vuelven a los del <b>${esc(fechaLarga(a.actualizada))}</b>. La lista de ahora no se pierde: queda guardada y podés volver a ella con este mismo botón.`, 'Sí, volver');
  if (!ok) return;
  try {
    if (estado.modo === 'servidor') {
      const res = await fetch('api.php?a=precios_restaurar', { method: 'POST' });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok || !datos.ok) throw new Error(datos.error || 'No se pudo volver a la lista anterior.');
      const { datos: nuevo } = await cargarJson('api.php?a=precios');
      estado.actuales = nuevo.precios || {};
      estado.meta = { actualizada: nuevo.actualizada, archivo: nuevo.archivo };
      estado.anterior = nuevo.anterior || null;
    } else {
      const ant = JSON.parse(localStorage.getItem(CLAVE_ANT));
      const act = { actualizada: estado.meta && estado.meta.actualizada, archivo: estado.meta && estado.meta.archivo, precios: estado.actuales };
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify(ant));
      localStorage.setItem(CLAVE_ANT, JSON.stringify(act));
      estado.actuales = ant.precios;
      estado.meta = { actualizada: ant.actualizada, archivo: ant.archivo };
      estado.anterior = { actualizada: act.actualizada, archivo: act.archivo, total: Object.keys(act.precios).length };
    }
  } catch (e) {
    mostrarPaso('subir');
    return mostrarError(e.message || 'No se pudo volver a la lista anterior.');
  }
  estado.archivo = null; estado.r = null;
  mostrarPaso('subir');
  pintarUltima();
  const av = $('#ap-aviso-subir');
  av.hidden = false;
  av.textContent = `Listo: los precios volvieron a la lista del ${fechaLarga(estado.meta.actualizada)}`;
}
$('#ap-deshacer-btn').addEventListener('click', deshacerUltima);
$('#ap-deshacer-2').addEventListener('click', deshacerUltima);

function pintarUltima() {
  pintarDeshacer();
  const m = estado.meta;
  if (!m || !m.actualizada) {
    $('#ap-ultima-fecha').textContent = 'Sin registro';
    $('#ap-ultima-det').textContent = `${Object.keys(estado.actuales).length} precios cargados`;
    return;
  }
  const f = new Date(m.actualizada);
  $('#ap-ultima-fecha').textContent = f.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ', ' + f.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const soloDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dias = Math.round((soloDia(new Date()) - soloDia(f)) / 86400000);
  const hace = dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
  $('#ap-ultima-det').textContent = `${hace} · ${Object.keys(estado.actuales).length} precios` + (m.archivo ? ` · ${m.archivo}` : '');
}

/* ─────────────── Subida del archivo ─────────────── */

function mostrarError(t) {
  const el = $('#ap-error');
  el.textContent = t;
  el.hidden = false;
}

async function procesarArchivo(file) {
  $('#ap-error').hidden = true;
  if (!/\.(xlsx|csv|txt)$/i.test(file.name)) {
    mostrarError('Ese tipo de archivo no sirve. Subí el Excel (.xlsx) o un CSV que te pasó el sistema.');
    $('#ap-file').value = '';
    return;
  }
  const drop = $('#ap-drop');
  drop.classList.add('cargando');
  try {
    let crudas;
    if (/\.(csv|txt)$/i.test(file.name)) crudas = leerCsv(await file.text());
    else crudas = await leerXlsx(await file.arrayBuffer());
    const filas = interpretar(crudas);
    estado.archivo = { nombre: file.name, filas };
    estado.r = analizar(filas);
    estado.filtroErr = 'pend';
    pintarRevision();
    mostrarPaso('revisar');
  } catch (e) {
    mostrarError(e.message || 'No se pudo leer el archivo.');
  } finally {
    drop.classList.remove('cargando');
    $('#ap-file').value = '';
  }
}

function mostrarPaso(p) {
  $('#ap-aviso').hidden = true;
  for (const id of ['subir', 'revisar', 'listo']) $('#paso-' + id).hidden = id !== p;
  $('#ap-aviso-subir').hidden = true;
  const orden = ['subir', 'revisar', 'listo'];
  document.querySelectorAll('#ap-pasos li').forEach((li) => {
    const i = orden.indexOf(li.dataset.p);
    li.classList.toggle('on', i === orden.indexOf(p));
    li.classList.toggle('hecho', i < orden.indexOf(p));
  });
  window.scrollTo({ top: 0 });
}

/* ─────────────── Pantalla de revisión ─────────────── */

function pintarRevision() {
  const r = estado.r;
  $('#ap-archivo').textContent = `${estado.archivo.nombre} · ${estado.archivo.filas.length} filas con código`;
  pintarCifras();
  pintarErrores();
  pintarCambios();

  $('#ap-cuenta-auto').textContent = r.auto.length;
  $('#ap-tabla-auto').innerHTML = tabla(['Código del catálogo', 'Como vino en el archivo', 'Descripción'],
    r.auto.map((a) => `<td><span class="ap-cod">${esc(a.codigo)}</span></td><td><span class="ap-cod">${esc(a.enArchivo)}</span></td><td>${esc(a.descripcion)}</td>`));
  $('#bloque-auto').hidden = !r.auto.length;

  $('#ap-cuenta-nom').textContent = r.menores.length;
  $('#ap-tabla-nombres').innerHTML = tabla(['Código', 'En el catálogo', 'En el archivo'],
    r.menores.map((m) => `<td><span class="ap-cod">${esc(m.codigo)}</span></td><td>${esc(m.antes)}</td><td>${esc(m.ahora)}</td>`));
  $('#bloque-nombres').hidden = !r.menores.length;

  estado.filtroNue = 'pend';
  pintarNuevos();

  pintarBarra();
}

function tabla(cabeceras, filas, vacio = 'Nada para mostrar') {
  const th = '<thead><tr>' + cabeceras.map((c, i) => `<th${i >= 2 && /precio|antes|ahora|var|fila/i.test(c) ? ' class="num"' : ''}>${c}</th>`).join('') + '</tr></thead>';
  const tb = filas.length ? filas.map((f) => `<tr>${f}</tr>`).join('') : `<tr class="vacia"><td colspan="${cabeceras.length}">${vacio}</td></tr>`;
  return th + '<tbody>' + tb + '</tbody>';
}

function pintarCifras() {
  const r = estado.r;
  const pend = r.errores.filter((e) => !e.resolucion).length;
  $('#ap-cifras').innerHTML = [
    ...(r.guardados ? [['ok', r.guardados, 'ya guardados']] : []),
    ['', r.cambios.length, 'precios cambian'],
    ['ok', r.iguales, 'quedan igual'],
    [pend ? 'err' : 'ok', pend, pend === 1 ? 'para resolver' : 'para resolver'],
    ['', r.auto.length, 'corregidos solos'],
    ['', r.nuevos.filter((f) => !f.estado).length, 'fuera del catálogo sin decidir'],
  ].map(([c, n, t]) => `<div class="ap-cifra${c ? ' ap-cifra--' + c : ''}"><b>${n.toLocaleString('es-AR')}</b><span>${t}</span></div>`).join('');
  pintarVeredicto();
}

function pintarVeredicto() {
  const r = estado.r;
  const total = estado.catalogo.size || Object.keys(estado.actuales).length || 1;
  const faltan = r.errores.filter((e) => e.tipos.includes('falta')).length;
  const pend = r.errores.filter((e) => !e.resolucion).length;
  const vars = r.cambios.map((c) => Math.abs(c.variacion)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const mediana = vars.length ? vars[Math.floor(vars.length / 2)] : 0;
  const sinCambios = !r.cambios.length && !r.guardados && !r.errores.some((e) => e.variacion != null && e.variacion !== 0);
  let tono, titulo, texto;

  if (!r.guardados && faltan > total * 0.3) {
    tono = 'rojo'; titulo = 'Cuidado: este archivo parece incompleto o no es la lista correcta';
    texto = `Faltan ${faltan} de ${total} productos de la página. Antes de seguir, fijate que sea la planilla completa y no una lista parcial u otra distinta. Si es parcial a propósito, podés usar "Guardar solo lo seguro".`;
  } else if (!r.guardados && vars.length >= 20 && mediana > 0.4) {
    tono = 'rojo'; titulo = 'Los precios cambian muchísimo';
    texto = `La mitad de los precios cambia más de ${Math.round(mediana * 100)} %. Puede ser real, pero también puede ser un error del archivo. Confirmalo con el proveedor antes de guardar.`;
  } else if (pend > 0) {
    tono = 'amarillo'; titulo = `Hay ${pend} ${pend === 1 ? 'cosa' : 'cosas'} para revisar antes de guardar`;
    texto = (sinCambios ? 'Ningún precio cambió respecto de lo que ya está cargado. ' : '') +
      'Mirá los casos de abajo de a uno: en cada uno te explicamos qué pasó y te marcamos la opción más segura. También podés guardar ya lo que no tiene problemas y seguir después.';
  } else if (sinCambios) {
    tono = 'verde'; titulo = 'Este archivo no trae cambios de precio';
    texto = 'Los precios son iguales a los que ya están cargados, así que no hace falta actualizar nada. Si esperabas un aumento, pedile al proveedor la lista nueva.';
  } else {
    tono = 'verde'; titulo = 'Todo en orden';
    texto = `${r.cambios.length + (r.guardados || 0)} ${r.cambios.length + (r.guardados || 0) === 1 ? 'precio se actualiza' : 'precios se actualizan'} y no quedan cosas por revisar. Apretá "Guardar precios nuevos".`;
  }
  $('#ap-veredicto').className = 'ap-ver ap-ver--' + tono;
  $('#ap-veredicto').innerHTML = `<div><b>${esc(titulo)}</b><span>${esc(texto)}</span></div>`;
}

function pintarErrores() {
  const r = estado.r;
  const pend = r.errores.filter((e) => !e.resolucion).length;
  const cuenta = $('#ap-cuenta-err');
  cuenta.textContent = pend || '0';
  cuenta.className = 'ap-cuenta ' + (pend ? 'rojo' : 'verde');
  $('#ap-sugeridas').hidden = !r.errores.some((e) => !e.resolucion && e.sugerida);
  document.querySelectorAll('#ap-filtro-err button').forEach((b) => b.classList.toggle('on', b.dataset.f === estado.filtroErr));

  const lista = r.errores.filter((e) =>
    estado.filtroErr === 'todos' ? true : estado.filtroErr === 'pend' ? !e.resolucion : !!e.resolucion);

  const cont = $('#ap-errores');
  if (!r.errores.length) {
    cont.innerHTML = '<div class="ap-vacio ok">No hay nada para resolver: todos los códigos del catálogo vinieron con precio.</div>';
    return;
  }
  if (!lista.length) {
    cont.innerHTML = estado.filtroErr === 'pend'
      ? '<div class="ap-vacio ok">Todo resuelto. Ya podés guardar.</div>'
      : '<div class="ap-vacio">Todavía no resolviste ninguno.</div>';
    return;
  }
  cont.innerHTML = lista.map(tarjetaError).join('');
}

function tarjetaError(e) {
  const [titulo] = TEXTOS[e.tipos[0]];
  const tipos = e.tipos.map((t) => TEXTOS[t][0]).join(' · ');
  const mensajes = e.tipos.map((t) => TEXTOS[t][1]).join(' ');
  const nombre = e.descCatalogo || (e.fila && e.fila.descripcion) || 'Sin nombre en el catálogo';

  const precios = `<div class="ap-err-precios">
      <small>Antes → archivo</small>
      ${pesos(e.anterior)} → ${e.tipos.includes('falta') ? '—' : pesos(e.nuevo)}
      ${e.variacion != null ? `<small class="${e.variacion > 0 ? 'ap-sube' : 'ap-baja'}">${fmtPct(e.variacion)}</small>` : ''}
    </div>`;

  const cabeza = `<div class="ap-err-top">
      <div>
        <div class="ap-err-tipo">${e.resolucion ? 'Resuelto · ' : ''}${esc(tipos)}</div>
        <div class="ap-err-nom">${esc(nombre)} <span class="ap-cod">${esc(e.codigo)}</span></div>
      </div>
      ${precios}
    </div>`;

  if (e.resolucion) {
    return `<article class="ap-err res" data-id="${esc(e.id)}">${cabeza}
      <div class="ap-resuelto"><span>${describirResolucion(e)}</span><button class="ap-link" data-acc="deshacer" type="button">Cambiar</button></div>
    </article>`;
  }

  const cmp = e.tipos.includes('nombre') || e.tipos.includes('duplicado')
    ? `<dl class="ap-err-cmp">
        <dt>Catálogo</dt><dd>${esc(e.descCatalogo || '—')}</dd>
        ${(e.filas || []).map((f) => `<dt>Archivo, fila ${f.fila}</dt><dd>${esc(f.descripcion)} · ${pesos(f.precio)}</dd>`).join('')}
      </dl>` : '';

  const sug = e.sugerida ? e.sugerida.accion : null;
  const op = (acc, texto, extra = '') => `<button type="button" class="ap-op${sug === acc ? ' sug' : (!sug && acc === 'anterior' ? ' rec' : '')}" data-acc="${acc}" ${extra}>${texto}</button>`;
  const ops = [];
  if (e.tipos.includes('duplicado')) {
    for (const f of e.filas) ops.push(op('fila', `Usar fila ${f.fila}: ${pesos(f.precio)}`, `data-fila="${f.fila}" data-valor="${f.precio}"`));
  } else if (e.nuevo > 0) {
    ops.push(op('nuevo', `Tomar el nuevo (${pesos(e.nuevo)})`));
  }
  if (e.anterior > 0) ops.push(op('anterior', `Dejar el de antes (${pesos(e.anterior)})`));
  ops.push(op('manual-abrir', 'Escribir otro precio'));
  if (e.tipos.includes('falta')) ops.push(op('buscar-abrir', 'Usar otro código del archivo'));
  ops.push(op('quitar', 'Dejar sin precio'));

  const candidatos = (e.candidatos || []).map((f) =>
    `<button type="button" class="ap-sug" data-acc="codigo" data-codigo="${esc(f.codigo)}" data-valor="${f.precio}">
      <span><span class="ap-cod">${esc(f.codigo)}</span> ${esc(f.descripcion)}</span><em>${pesos(f.precio)}</em></button>`).join('');

  return `<article class="ap-err" data-id="${esc(e.id)}">${cabeza}
    <p class="ap-err-msg">${esc(mensajes)}</p>
    ${cmp}
    <div class="ap-err-ops">${ops.join('')}</div>
    <div class="ap-manual" data-panel="manual">
      <input class="ap-input ap-input--precio" type="text" inputmode="decimal" placeholder="Ej: 12.345,67" />
      <button type="button" class="ap-btn ap-btn--sm ap-btn--pri" data-acc="manual">Usar este precio</button>
    </div>
    ${e.tipos.includes('falta') ? `<div class="ap-manual" data-panel="buscar">
      <div class="ap-sugs">
        ${candidatos ? '<span class="ap-nota" style="margin:0">Códigos del archivo con nombre parecido:</span>' + candidatos : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input class="ap-input" type="text" placeholder="Código del archivo" data-buscar />
          <button type="button" class="ap-btn ap-btn--sm" data-acc="codigo-escrito">Buscar</button>
        </div>
        <span class="ap-nota" data-buscar-msg style="margin:0"></span>
      </div>
    </div>` : ''}
  </article>`;
}

function pintarCambios() {
  const q = sinTildes($('#ap-buscar').value).toLowerCase().trim();
  const r = estado.r;
  $('#ap-cuenta-cam').textContent = r.cambios.length;
  const lista = q ? r.cambios.filter((c) => sinTildes(`${c.codigo} ${c.descripcion} ${c.producto}`).toLowerCase().includes(q)) : r.cambios;
  const max = 400;
  const filas = lista.slice(0, max).map((c) => `<td><span class="ap-cod">${esc(c.codigo)}</span></td><td>${esc(c.descripcion)}</td>
    <td class="num">${pesos(c.anterior)}</td><td class="num">${pesos(c.nuevo)}</td>
    <td class="num ${c.variacion > 0 ? 'ap-sube' : 'ap-baja'}">${c.variacion === null ? 'nuevo' : fmtPct(c.variacion)}</td>`);
  if (lista.length > max) filas.push(`<td colspan="5" class="ap-nota">Y ${lista.length - max} más. Buscá por código o nombre para encontrarlos.</td>`);
  $('#ap-tabla-cambios').innerHTML = tabla(['Código', 'Producto', 'Antes', 'Ahora', 'Variación'], filas,
    q ? 'Nada coincide con la búsqueda' : 'No hay cambios de precio pendientes.');
}

function catalogoCodigo(texto) {
  const k = String(texto).trim().toUpperCase();
  if (!k) return null;
  for (const c of estado.catalogo.keys()) if (c.toUpperCase() === k) return c;
  const sinCeros = k.replace(/^0+/, '');
  for (const c of estado.catalogo.keys()) if (c.toUpperCase() === sinCeros) return c;
  return null;
}

function etiquetaEstado(f) {
  const s = f.estado;
  if (!s) return '';
  if (s.accion === 'descartar') return `<span class="ap-estado desc">${s.previo ? 'Descartado antes' : 'Descartado'}</span>`;
  if (s.accion === 'guardar') return '<span class="ap-estado guar">Se guarda el precio</span>';
  return `<span class="ap-estado guar">Vinculado a <span class="ap-cod">${esc(s.codigo)}</span></span>`;
}

function pintarNuevos() {
  const r = estado.r;
  const sinDecidir = r.nuevos.filter((f) => !f.estado).length;
  $('#ap-cuenta-nue').textContent = sinDecidir === r.nuevos.length ? r.nuevos.length : `${sinDecidir} de ${r.nuevos.length}`;
  $('#bloque-nuevos').hidden = !r.nuevos.length;
  document.querySelectorAll('#ap-filtro-nue button').forEach((b) => b.classList.toggle('on', b.dataset.f === estado.filtroNue));

  const cuantos = (g) => r.nuevos.filter((f) => !f.estado && f.grupo === g).length;
  const habilitar = (id, n) => { const b = $(id); b.disabled = !n; b.style.opacity = n ? '' : '.45'; };
  habilitar('#ap-nue-pruebas', cuantos('prueba'));
  habilitar('#ap-nue-cajas', cuantos('caja'));
  habilitar('#ap-nue-descartar', sinDecidir);
  habilitar('#ap-nue-guardar', r.nuevos.filter((f) => !f.estado && f.precio > 0).length);

  const filtro = estado.filtroNue;
  const lista = r.nuevos.map((f, i) => ({ f, i })).filter(({ f }) =>
    filtro === 'todos' ? true :
    filtro === 'pend' ? !f.estado :
    filtro === 'desc' ? f.estado && f.estado.accion === 'descartar' :
    f.estado && f.estado.accion !== 'descartar');

  const cab = '<thead><tr><th>Código</th><th>Descripción</th><th>Tipo</th><th class="num">Precio</th><th>Decisión</th></tr></thead>';
  if (!lista.length) {
    const msg = filtro === 'pend' ? 'No queda nada sin decidir.' : 'Nada para mostrar.';
    $('#ap-tabla-nuevos').innerHTML = cab + `<tbody><tr class="vacia"><td colspan="5">${msg}</td></tr></tbody>`;
    return;
  }
  $('#ap-tabla-nuevos').innerHTML = cab + '<tbody>' + lista.map(({ f, i }) => {
    const botones = f.estado
      ? `${etiquetaEstado(f)} <button class="ap-link" data-nacc="deshacer" type="button">Cambiar</button>`
      : '<button class="ap-btn" data-nacc="descartar" type="button">Descartar</button>' +
        (f.precio > 0 ? '<button class="ap-btn" data-nacc="guardar" type="button" title="Guarda este precio por si más adelante publicás el producto">Guardar precio</button>' : '') +
        (f.precio > 0 ? '<button class="ap-btn" data-nacc="vincular-abrir" type="button" title="Es el mismo producto de un código del catálogo que cambió">Vincular…</button>' : '');
    return `<tr data-i="${i}"${f.estado ? ' class="ap-fila-hecha"' : ''}>
      <td><span class="ap-cod">${esc(f.codigo)}</span></td><td>${esc(f.descripcion)}</td>
      <td><span class="ap-tag ap-tag--${f.grupo}">${GRUPOS[f.grupo]}</span></td>
      <td class="num">${pesos(f.precio)}</td><td class="ap-acc-cel">${botones}</td></tr>`;
  }).join('') + '</tbody>';
}

function decidirNuevos(filtroFn, estadoNuevo) {
  for (const f of estado.r.nuevos) if (!f.estado && filtroFn(f)) f.estado = { ...estadoNuevo };
  pintarCifras(); pintarNuevos(); pintarBarra();
}

function vincular(f, codigoCat) {
  const e = estado.r.errores.find((x) => x.codigo === codigoCat);
  if (e) {
    // El producto del catálogo estaba marcado con error: se resuelve con este código
    resolver(e, { accion: 'codigo', codigo: f.codigo, valor: f.precio });
  } else {
    f.estado = { accion: 'vincular', codigo: codigoCat, via: 'directo' };
    pintarCifras(); pintarNuevos(); pintarBarra();
  }
}

function totales() {
  const r = estado.r;
  let mantenidos = 0, quitados = 0, cambiados = r.cambios.length;
  for (const e of r.errores) {
    if (!e.resolucion) continue;
    const p = precioResuelto(e);
    if (p === 0) quitados++;
    else if (p === e.anterior) mantenidos++;
    else cambiados++;
  }
  return { cambiados, mantenidos, quitados, pendientes: r.errores.filter((e) => !e.resolucion).length };
}

function pintarBarra() {
  const t = totales();
  const btn = $('#ap-aplicar');
  btn.disabled = t.pendientes > 0;
  const parcial = $('#ap-aplicar-parcial');
  const extras = estado.r.nuevos.filter((f) => f.estado && f.estado.accion !== 'descartar').length;
  const descartes = estado.r.nuevos.filter((f) => f.estado && f.estado.accion === 'descartar' && !f.estado.previo).length;
  parcial.hidden = t.pendientes === 0;
  parcial.disabled = t.cambiados + extras + descartes === 0;
  const partes = [`<b>${t.cambiados}</b> ${t.cambiados === 1 ? 'precio cambia' : 'precios cambian'}`];
  if (t.mantenidos) partes.push(`<b>${t.mantenidos}</b> se mantienen`);
  if (t.quitados) partes.push(`<b>${t.quitados}</b> quedan sin precio`);
  const extra = estado.r.nuevos.filter((f) => f.estado && f.estado.accion === 'guardar').length;
  if (extra) partes.push(`<b>${extra}</b> ${extra === 1 ? 'precio extra' : 'precios extra'} de códigos fuera del catálogo`);
  $('#ap-barra-t').innerHTML = t.pendientes
    ? `Faltan resolver <b>${t.pendientes}</b> ${t.pendientes === 1 ? 'producto' : 'productos'}. Podés guardar ya lo seguro (<b>${t.cambiados}</b> ${t.cambiados === 1 ? 'cambio' : 'cambios'}) y seguir después.`
    : partes.join(' · ') + '.';
}

/* ─────────────── Acciones sobre los errores ─────────────── */

function resolver(e, resolucion) {
  // Si antes se había tomado el precio de un código "nuevo" para este producto, se suelta
  for (const f of estado.r.nuevos) if (f.estado && f.estado.via === 'error' && f.estado.codigo === e.codigo) f.estado = undefined;
  e.resolucion = resolucion;
  if (resolucion && resolucion.accion === 'codigo') {
    const f = estado.r.nuevos.find((x) => x.codigo === resolucion.codigo);
    if (f) f.estado = { accion: 'vincular', codigo: e.codigo, via: 'error' };
  }
  pintarCifras();
  pintarErrores();
  pintarNuevos();
  pintarBarra();
}

$('#ap-errores').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-acc]');
  if (!btn) return;
  const card = btn.closest('.ap-err');
  const e = estado.r.errores.find((x) => x.id === card.dataset.id);
  const acc = btn.dataset.acc;

  if (acc === 'manual-abrir' || acc === 'buscar-abrir') {
    const panel = card.querySelector(`[data-panel="${acc === 'manual-abrir' ? 'manual' : 'buscar'}"]`);
    card.querySelectorAll('.ap-manual').forEach((p) => p !== panel && p.classList.remove('on'));
    panel.classList.toggle('on');
    const inp = panel.querySelector('input');
    if (inp) inp.focus();
    return;
  }
  if (acc === 'deshacer') return resolver(e, null);
  if (acc === 'nuevo' || acc === 'anterior' || acc === 'quitar') return resolver(e, { accion: acc });
  if (acc === 'fila') return resolver(e, { accion: 'fila', fila: Number(btn.dataset.fila), valor: Number(btn.dataset.valor) });
  if (acc === 'codigo') return resolver(e, { accion: 'codigo', codigo: btn.dataset.codigo, valor: Number(btn.dataset.valor) });

  if (acc === 'manual') {
    const inp = card.querySelector('[data-panel="manual"] input');
    const valor = Math.round(aNumero(inp.value) * 100) / 100;
    if (!(valor > 0)) { inp.focus(); inp.style.borderColor = 'var(--red)'; return; }
    return resolver(e, { accion: 'manual', valor });
  }
  if (acc === 'codigo-escrito') {
    const inp = card.querySelector('[data-buscar]');
    const msg = card.querySelector('[data-buscar-msg]');
    const buscado = inp.value.trim().toUpperCase();
    const f = estado.archivo.filas.find((x) => x.codigo.toUpperCase() === buscado || x.codigo.toUpperCase() === buscado.replace(/^0+/, ''));
    if (!f) { msg.textContent = 'Ese código no está en el archivo.'; return; }
    if (!(f.precio > 0)) { msg.textContent = `${f.codigo} está en el archivo pero sin precio.`; return; }
    return resolver(e, { accion: 'codigo', codigo: f.codigo, valor: f.precio });
  }
});

$('#ap-errores').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
  const panel = ev.target.closest('.ap-manual');
  const btn = panel && panel.querySelector('[data-acc="manual"], [data-acc="codigo-escrito"]');
  if (btn) { ev.preventDefault(); btn.click(); }
});

$('#ap-filtro-err').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  estado.filtroErr = b.dataset.f;
  pintarErrores();
});

$('#ap-sugeridas').addEventListener('click', () => {
  let n = 0;
  for (const e of estado.r.errores) if (!e.resolucion && e.sugerida) { e.resolucion = { ...e.sugerida }; n++; }
  const quedan = estado.r.errores.filter((e) => !e.resolucion).length;
  pintarCifras(); pintarErrores(); pintarBarra();
  if (quedan) $('#ap-barra-t').innerHTML = `Se resolvieron ${n}. Quedan <b>${quedan}</b> para mirar uno por uno (cambió el nombre o el precio salta mucho).`;
});

let tBuscar;
$('#ap-buscar').addEventListener('input', () => { clearTimeout(tBuscar); tBuscar = setTimeout(pintarCambios, 120); });

/* Lista de descartados (se ve y se edita aunque no haya archivo cargado) */

function pintarDescartados() {
  const q = sinTildes($('#ap-desc-buscar').value).toLowerCase().trim();
  const todos = Object.entries(estado.descartados);
  $('#ap-cuenta-descartados').textContent = todos.length;
  $('#ap-desc-todos').disabled = !todos.length;
  const lista = todos.filter(([c, d]) => !q || sinTildes(`${c} ${d.descripcion}`).toLowerCase().includes(q))
    .sort((a, b) => String(b[1].fecha).localeCompare(String(a[1].fecha)));
  const cab = '<thead><tr><th>Código</th><th>Descripción</th><th class="num">Precio</th><th>Descartado el</th><th></th></tr></thead>';
  if (!lista.length) {
    $('#ap-tabla-descartados').innerHTML = cab + `<tbody><tr class="vacia"><td colspan="5">${todos.length ? 'Nada coincide con la búsqueda.' : 'Todavía no descartaste ningún código.'}</td></tr></tbody>`;
    return;
  }
  $('#ap-tabla-descartados').innerHTML = cab + '<tbody>' + lista.map(([c, d]) => {
    const f = d.fecha ? new Date(d.fecha) : null;
    const fecha = f && !isNaN(f) ? f.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const enCatalogo = catalogoCodigo(c) ? ' <span class="ap-tag ap-tag--catalogo" title="Este código ahora está en el catálogo: conviene sacarlo de la lista">Ya está en el catálogo</span>' : '';
    return `<tr data-cod="${esc(c)}"><td><span class="ap-cod">${esc(c)}</span></td><td>${esc(d.descripcion)}${enCatalogo}</td>
      <td class="num">${pesos(d.precio)}</td><td>${fecha}</td>
      <td class="ap-acc-cel"><button class="ap-btn" data-dacc="sacar" type="button">Sacar de la lista</button></td></tr>`;
  }).join('') + '</tbody>';
}

async function sacarDescartados(codigos) {
  const nueva = { ...estado.descartados };
  for (const c of codigos) delete nueva[c];
  try { await persistirDescartados(nueva); }
  catch (e) { return mostrarError(e.message); }
  $('#ap-error').hidden = true;
  pintarDescartados();
}

$('#ap-tabla-descartados').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-dacc]');
  if (btn) sacarDescartados([btn.closest('tr').dataset.cod]);
});
$('#ap-desc-todos').addEventListener('click', async () => {
  const n = Object.keys(estado.descartados).length;
  if (await confirmar('¿Sacar todos de la lista?', `Se vacía la lista de ${n} descartados. En la próxima actualización van a volver a aparecer para revisarlos.`, 'Sacar todos')) {
    sacarDescartados(Object.keys(estado.descartados));
  }
});
let tDesc;
$('#ap-desc-buscar').addEventListener('input', () => { clearTimeout(tDesc); tDesc = setTimeout(pintarDescartados, 120); });

/* Códigos fuera del catálogo: uno por uno y en bloque */

$('#ap-tabla-nuevos').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-nacc]');
  if (!btn) return;
  const tr = btn.closest('tr');
  const acc = btn.dataset.nacc;

  if (acc === 'vincular' || acc === 'vincular-escrito') {
    const fila = estado.r.nuevos[Number(tr.previousElementSibling.dataset.i)];
    let cat;
    if (acc === 'vincular') cat = btn.dataset.cat;
    else {
      cat = catalogoCodigo(tr.querySelector('[data-cat-input]').value);
      if (!cat) { tr.querySelector('[data-cat-msg]').textContent = 'Ese código no está en el catálogo.'; return; }
    }
    return vincular(fila, cat);
  }

  const f = estado.r.nuevos[Number(tr.dataset.i)];
  if (acc === 'descartar') f.estado = { accion: 'descartar' };
  else if (acc === 'guardar') f.estado = { accion: 'guardar' };
  else if (acc === 'deshacer') {
    const s = f.estado;
    if (s && s.via === 'error') {
      const e = estado.r.errores.find((x) => x.codigo === s.codigo);
      if (e) return resolver(e, null); // el producto vuelve a quedar pendiente arriba
    }
    f.estado = undefined;
  } else if (acc === 'vincular-abrir') {
    const siguiente = tr.nextElementSibling;
    if (siguiente && siguiente.classList.contains('sub')) { siguiente.remove(); return; }
    const sugeridos = [...estado.catalogo.entries()]
      .map(([codigo, info]) => ({ codigo, desc: info.descripcion, s: parecido(f.descripcion, info.descripcion) }))
      .filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 4);
    const sub = document.createElement('tr');
    sub.className = 'sub';
    sub.innerHTML = `<td colspan="5"><div class="ap-sub-in">
      <span class="ap-nota" style="margin:0">Elegí el código del catálogo que reemplaza a <span class="ap-cod">${esc(f.codigo)}</span>:</span>
      ${sugeridos.map((x) => `<button type="button" class="ap-sug" data-nacc="vincular" data-cat="${esc(x.codigo)}"><span><span class="ap-cod">${esc(x.codigo)}</span> ${esc(x.desc)}</span></button>`).join('')}
      <input class="ap-input" type="text" placeholder="Otro código del catálogo" data-cat-input />
      <button type="button" class="ap-btn ap-btn--sm" data-nacc="vincular-escrito">Vincular</button>
      <span class="ap-nota" data-cat-msg style="margin:0"></span></div></td>`;
    tr.after(sub);
    sub.querySelector('input').focus();
    return;
  }
  pintarCifras(); pintarNuevos(); pintarBarra();
});

$('#ap-tabla-nuevos').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
  ev.preventDefault();
  ev.target.closest('tr').querySelector('[data-nacc="vincular-escrito"]').click();
});

$('#ap-filtro-nue').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  estado.filtroNue = b.dataset.f;
  pintarNuevos();
});

$('#ap-nue-pruebas').addEventListener('click', () => decidirNuevos((f) => f.grupo === 'prueba', { accion: 'descartar' }));
$('#ap-nue-cajas').addEventListener('click', () => decidirNuevos((f) => f.grupo === 'caja', { accion: 'descartar' }));
$('#ap-nue-descartar').addEventListener('click', async () => {
  const n = estado.r.nuevos.filter((f) => !f.estado).length;
  if (await confirmar('¿Descartar todos los pendientes?', `Se descartan ${n} códigos del archivo que no están en el catálogo. No cambia ningún precio. Podés deshacerlo uno por uno.`, 'Descartar')) {
    decidirNuevos(() => true, { accion: 'descartar' });
  }
});
$('#ap-nue-guardar').addEventListener('click', async () => {
  const n = estado.r.nuevos.filter((f) => !f.estado && f.precio > 0).length;
  if (await confirmar('¿Guardar el precio de todos los pendientes?', `Se guardan ${n} precios de códigos que hoy no están en la página. No se ven en ningún lado hasta que publiques esos productos. Los que vienen sin precio quedan sin decidir.`, 'Guardar precios')) {
    decidirNuevos((f) => f.precio > 0, { accion: 'guardar' });
  }
});
$('#ap-nue-csv').addEventListener('click', () => {
  const filas = [['codigo', 'descripcion', 'precio', 'tipo', 'decision']].concat(estado.r.nuevos.map((f) =>
    [f.codigo, f.descripcion, String(f.precio).replace('.', ','), GRUPOS[f.grupo], f.estado ? f.estado.accion : 'sin decidir']));
  const csv = '﻿' + filas.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'codigos-fuera-del-catalogo.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ─────────────── Cancelar y guardar ─────────────── */

function confirmar(titulo, texto, si = 'Confirmar') {
  const d = $('#ap-dialog');
  $('#ap-dialog-t').textContent = titulo;
  $('#ap-dialog-p').innerHTML = texto;
  $('#ap-dialog-si').textContent = si;
  d.showModal();
  return new Promise((ok) => d.addEventListener('close', () => ok(d.returnValue === 'si'), { once: true }));
}

async function cancelar() {
  const hay = estado.r.errores.some((e) => e.resolucion);
  const ok = await confirmar('¿Cancelar la actualización?',
    'Se descarta el archivo' + (hay ? ' y lo que corregiste' : '') + '. Los precios quedan como estaban, no se guarda nada.',
    'Sí, cancelar');
  if (!ok) return;
  estado.archivo = null;
  estado.r = null;
  mostrarPaso('subir');
}
$('#ap-cancelar').addEventListener('click', cancelar);
$('#ap-cancelar-2').addEventListener('click', cancelar);

function listaFinal() {
  const final = { ...estado.actuales };
  for (const c of estado.r.cambios) final[c.codigo] = c.nuevo;
  for (const e of estado.r.errores) {
    if (!e.resolucion) continue; // sin resolver: queda el precio de antes
    const p = precioResuelto(e);
    if (p > 0) final[e.codigo] = p;
    else delete final[e.codigo];
  }
  for (const f of estado.r.nuevos) {
    const s = f.estado;
    if (!s || !(f.precio > 0)) continue;
    if (s.accion === 'guardar') final[f.codigo] = f.precio;
    else if (s.accion === 'vincular') final[s.codigo] = f.precio;
  }
  return final;
}

let ultimoGuardado = null;

function descartadosFinal() {
  const hoy = new Date().toISOString();
  const out = { ...estado.descartados };
  for (const f of estado.r.nuevos) {
    if (f.estado && f.estado.accion === 'descartar') {
      if (!out[f.codigo]) out[f.codigo] = { descripcion: f.descripcion, precio: f.precio, fecha: hoy };
    } else delete out[f.codigo]; // estaba descartado y ahora se decidió otra cosa: sale de la lista
  }
  return out;
}

// Después de un guardado parcial: lo ya guardado sale de la pantalla y queda solo lo pendiente
function consolidar() {
  const r = estado.r;
  r.guardados = (r.guardados || 0) + r.cambios.length + r.errores.filter((e) => e.resolucion).length;
  r.cambios = [];
  r.errores = r.errores.filter((e) => !e.resolucion);
  r.nuevos = r.nuevos.filter((f) => !(f.estado && f.estado.accion !== 'descartar'));
  for (const f of r.nuevos) if (f.estado) f.estado.previo = true;
}

async function guardarTodo(parcial) {
  const t = totales();
  if (!parcial && t.pendientes) return;
  const desc = descartadosFinal();
  const nDesc = Object.keys(desc).filter((k) => !estado.descartados[k]).length;
  const nSacados = Object.keys(estado.descartados).filter((k) => !desc[k]).length;

  const partes = [`${t.cambiados} ${t.cambiados === 1 ? 'precio cambia' : 'precios cambian'}`];
  if (t.mantenidos) partes.push(`${t.mantenidos} se mantienen`);
  if (t.quitados) partes.push(`${t.quitados} quedan sin precio`);
  if (nDesc) partes.push(`${nDesc} ${nDesc === 1 ? 'código se suma' : 'códigos se suman'} a la lista de descartados`);
  if (nSacados) partes.push(`${nSacados} ${nSacados === 1 ? 'sale' : 'salen'} de la lista de descartados`);
  const ok = await confirmar(
    parcial ? '¿Guardar solo lo seguro?' : '¿Guardar los precios nuevos?',
    partes.join(', ') + '. ' + (parcial
      ? `Los ${t.pendientes} que faltan resolver quedan con el precio de antes y podés seguir con ellos después.`
      : 'A partir de ahora los presupuestos salen con esta lista.'),
    'Guardar');
  if (!ok) return;

  const botones = [$('#ap-aplicar'), $('#ap-aplicar-parcial')];
  botones.forEach((b) => { b.disabled = true; });
  const precios = listaFinal();
  const archivo = estado.archivo.nombre;
  const actualizada = new Date().toISOString();
  const previa = { actualizada: estado.meta && estado.meta.actualizada, archivo: estado.meta && estado.meta.archivo, precios: estado.actuales };

  try {
    if (estado.modo === 'servidor') {
      const res = await fetch('api.php?a=precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precios, archivo }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok || !datos.ok) throw new Error(datos.error || 'No se pudo guardar en el servidor.');
    } else {
      localStorage.setItem(CLAVE_ANT, JSON.stringify(previa)); // respaldo para poder deshacer
      localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ actualizada, archivo, precios }));
    }
  } catch (err) {
    pintarBarra();
    $('#ap-barra-t').innerHTML = `<span style="color:var(--red)">${esc(err.message)}</span> No se cambió nada, probá de nuevo.`;
    return;
  }

  estado.actuales = precios;
  estado.meta = { actualizada, archivo };
  estado.anterior = { actualizada: previa.actualizada, archivo: previa.archivo, total: Object.keys(previa.precios).length };
  ultimoGuardado = { generado: archivo, columna: 'Lista 1', actualizada, precios };
  pintarUltima();

  // Los precios ya quedaron guardados; si falla la lista de descartados se avisa aparte
  let avisoDesc = '';
  try { await persistirDescartados(desc); pintarDescartados(); }
  catch (err) { avisoDesc = ` Ojo: ${err.message} Los descartes de esta vez no quedaron registrados.`; }

  const cuantos = Object.keys(precios).length;
  if (parcial && t.pendientes) {
    consolidar();
    pintarCifras(); pintarErrores(); pintarCambios(); pintarNuevos(); pintarBarra();
    const av = $('#ap-aviso');
    av.hidden = false;
    av.innerHTML = `Se guardó lo seguro (lista con ${cuantos} precios). Quedan <b>${t.pendientes}</b> por resolver con el precio de antes.` + esc(avisoDesc);
    window.scrollTo({ top: 0 });
    return;
  }

  $('#ap-listo-t').innerHTML = `Se guardó la lista de <b>${esc(archivo)}</b> con ${cuantos} precios. ` +
    (estado.modo === 'servidor' ? 'El cotizador ya la usa.' : 'Como es una prueba local, quedó en este navegador. Podés descargar el precios.json resultante.') + esc(avisoDesc);
  $('#ap-descargar').hidden = estado.modo === 'servidor';
  mostrarPaso('listo');
}

$('#ap-aplicar').addEventListener('click', () => guardarTodo(false));
$('#ap-aplicar-parcial').addEventListener('click', () => guardarTodo(true));

$('#ap-descargar').addEventListener('click', () => {
  if (!ultimoGuardado) return;
  const blob = new Blob([JSON.stringify(ultimoGuardado, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'precios.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#ap-otra').addEventListener('click', () => { estado.archivo = null; estado.r = null; mostrarPaso('subir'); });

/* ─────────────── Zona de carga ─────────────── */

const drop = $('#ap-drop');
$('#ap-file').addEventListener('change', (ev) => ev.target.files[0] && procesarArchivo(ev.target.files[0]));
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (ev) => { const f = ev.dataTransfer.files[0]; if (f) procesarArchivo(f); });
window.addEventListener('beforeunload', (ev) => { if (estado.r && !$('#paso-revisar').hidden) { ev.preventDefault(); ev.returnValue = ''; } });

iniciar();
