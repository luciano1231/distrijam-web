// Pruebas de punta a punta del ABM del catálogo: el panel real contra un
// servidor PHP real, y lo que ve después un cliente en otro navegador.
// Se corre con: sh tests/correr.sh
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2];
const BASE = process.argv[3] || 'http://127.0.0.1:8099/';
const PRODUCTOS = JSON.parse(fs.readFileSync(path.join(ROOT, 'productos.json'), 'utf8'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const erroresJs = [];

// ── Un navegador: sus cookies ──
class Navegador {
  constructor(nombre) { this.nombre = nombre; this.cookies = {}; }
  async fetch(url, opciones = {}) {
    const headers = { ...(opciones.headers || {}) };
    const c = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.Cookie = c;
    const res = await fetch(url, { ...opciones, headers });
    for (const sc of res.headers.getSetCookie()) {
      const [par] = sc.split(';'); const i = par.indexOf('=');
      this.cookies[par.slice(0, i)] = par.slice(i + 1);
    }
    return res;
  }
  async api(accion, cuerpo) {
    const r = await this.fetch(BASE + 'api.php?a=' + accion, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : {});
    return r.json();
  }
  entrar() { return this.api('entrar', { clave: 'prueba123' }); }
}

// ── Abrir una página con sus scripts ──
async function abrir(nav, file, { query = '', confirmar = true } = {}) {
  let html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const p = path.join(ROOT, src.split('?')[0]);
    if (!fs.existsSync(p)) return '';
    return `<script>${fs.readFileSync(p, 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`;
  });
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    const m = String(e.message || e);
    if (!/Could not load img|Not implemented: navigation|Not implemented: window.scrollTo/.test(m)) erroresJs.push(`${file}: ${m}`);
  });
  vc.on('error', (...a) => erroresJs.push(`${file}: ${a.join(' ')}`));
  const dom = new JSDOM(html, {
    url: BASE + file + query,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.confirm = () => (typeof confirmar === 'function' ? confirmar() : confirmar);
      w.alert = () => {};
      w.open = () => null;
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = function () {};
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.fetch = async (url, opciones) => {
        const r = await nav.fetch(new URL(url, w.location.href).href, opciones);
        const texto = await r.text();
        return { ok: r.ok, status: r.status, headers: r.headers, json: async () => JSON.parse(texto), text: async () => texto };
      };
    },
  });
  const pagina = { w: dom.window, d: dom.window.document, nav };
  await sleep(250);
  return pagina;
}

async function hasta(cond, msg, ms = 4000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try { if (await cond()) return; } catch (e) {}
    await sleep(40);
  }
  throw new Error(msg);
}

const toasts = d => [...d.querySelectorAll('.toast')].map(t => t.textContent.trim());
const archivo = (w, nombre, datos, tipo = 'image/png') => new w.File([datos], nombre, { type: tipo });
async function elegir(p, input, files) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new p.w.Event('change'));
  await sleep(120);
}

async function llenarProducto(p, datos) {
  const { d } = p;
  if (datos.nombre !== undefined) d.getElementById('product-name').value = datos.nombre;
  if (datos.categoria !== undefined) d.getElementById('product-category').value = datos.categoria;
  if (datos.descripcion !== undefined) d.getElementById('product-desc').value = datos.descripcion;
  if (datos.imagenes) await elegir(p, d.getElementById('product-image-input'), datos.imagenes.map((b, i) => archivo(p.w, `foto${i}.png`, b)));
  if (datos.medidas) {
    for (let i = d.querySelectorAll('.variant-row').length; i < datos.medidas.length; i++) d.getElementById('btn-add-variant').click();
    const filas = d.querySelectorAll('.variant-row');
    datos.medidas.forEach(([c, m, pr], i) => {
      filas[i].querySelector('.variant-codigo').value = c;
      filas[i].querySelector('.variant-medida').value = m;
      filas[i].querySelector('.variant-presentacion').value = pr;
    });
  }
}
async function guardar(p) {
  p.d.getElementById('add-product-form').requestSubmit();
  await hasta(() => !p.d.getElementById('btn-submit-product').disabled && toasts(p.d).length > 0, 'el guardado no terminó');
  await sleep(150);
}

const publico = async () => new Navegador('x').api('catalogo');
const fila = (p, texto) => [...p.d.querySelectorAll('.admin-product-row')].find(r => r.querySelector('.admin-product-name').textContent === texto);

const resultados = [];
async function prueba(grupo, nombre, fn) {
  try { const det = await fn(); resultados.push({ grupo, nombre, ok: true, det }); }
  catch (e) { resultados.push({ grupo, nombre, ok: false, det: e.message }); }
}
function esperar(c, m) { if (!c) throw new Error(m); }

const NUEVO = { nombre: 'Grampa Omega Test', categoria: 'tuercas', descripcion: 'Grampa de prueba', imagenes: [PNG], medidas: [['', '1/2"', '100 U.'], ['GOT-34', '3/4"', '50 U.']] };

(async () => {
  const admin = new Navegador('admin');
  await admin.entrar();
  const cliente = new Navegador('cliente');
  const base0 = PRODUCTOS.find(p => p.variants.length > 2);
  const base1 = PRODUCTOS.find(p => p.id !== base0.id);

  // ═══════════ Sesión ═══════════
  await prueba('Sesión', 'Sin sesión se ve el login y no el panel', async () => {
    const p = await abrir(cliente, 'admin.html');
    await hasta(() => p.d.getElementById('admin-login').style.display === 'flex', 'no muestra el login');
    esperar(p.d.getElementById('admin-dashboard').style.display !== 'block', 'muestra el panel');
  });

  await prueba('Sesión', 'Logueado: panel con los productos del proveedor', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => p.d.querySelectorAll('.admin-product-row').length === PRODUCTOS.length, `filas: ${p.d.querySelectorAll('.admin-product-row').length}`);
    esperar(p.d.getElementById('stat-total').textContent === String(PRODUCTOS.length), 'total mal');
  });

  // ═══════════ Alta ═══════════
  for (const [caso, cambio, aviso] of [
    ['sin nombre', { nombre: '' }, 'nombre'],
    ['sin categoría', { categoria: '' }, 'categor'],
    ['sin imagen', { imagenes: null }, 'imagen'],
    ['con medida incompleta', { medidas: [['', '1/2"', '']] }, 'medidas'],
    ['con códigos repetidos', { medidas: [['A1', '1', '1'], ['A1', '2', '2']] }, 'repetidos'],
  ]) {
    await prueba('Alta', `El formulario rechaza el alta ${caso} sin ir al servidor`, async () => {
      const p = await abrir(admin, 'admin.html');
      await llenarProducto(p, { ...NUEVO, ...cambio, imagenes: cambio.imagenes === null ? undefined : NUEVO.imagenes });
      p.d.getElementById('add-product-form').requestSubmit();
      await sleep(200);
      esperar(toasts(p.d).some(t => t.toLowerCase().includes(aviso)), `avisos: ${toasts(p.d).join(' | ') || 'ninguno'}`);
      esperar((await publico()).productos.length === 0, 'guardó igual');
    });
  }

  await prueba('Alta', 'Rechaza archivos que no son imagen, de más de 2 MB y más de 4 fotos', async () => {
    const p = await abrir(admin, 'admin.html');
    const input = p.d.getElementById('product-image-input');
    await elegir(p, input, [archivo(p.w, 'a.txt', 'hola', 'text/plain')]);
    await elegir(p, input, [archivo(p.w, 'g.png', new Uint8Array(2.5 * 1024 * 1024))]);
    esperar(p.d.querySelectorAll('.upload-gallery-item').length === 0, 'aceptó un archivo inválido');
    await elegir(p, input, [1, 2, 3].map(i => archivo(p.w, `f${i}.png`, PNG)));
    await elegir(p, input, [4, 5].map(i => archivo(p.w, `f${i}.png`, PNG)));
    esperar(p.d.querySelectorAll('.upload-gallery-item').length === 3, `fotos: ${p.d.querySelectorAll('.upload-gallery-item').length}`);
    const t = toasts(p.d).join(' | ');
    esperar(t.includes('no es una imagen') && t.includes('2MB') && t.includes('hasta 4'), t);
  });

  await prueba('Alta', 'Un error del servidor se muestra y no borra lo cargado', async () => {
    const p = await abrir(admin, 'admin.html');
    await llenarProducto(p, { ...NUEVO, medidas: [[base0.variants[0].id, '1', '1']] });
    await guardar(p);
    esperar(toasts(p.d).some(t => t.includes('ya lo usa')), toasts(p.d).join(' | '));
    esperar(p.d.getElementById('product-name').value === NUEVO.nombre, 'limpió el formulario');
    esperar(p.d.querySelectorAll('.upload-gallery-item').length === 1, 'perdió la foto');
  });

  await prueba('Alta', 'Alta completa desde el panel: lista, estadísticas y formulario limpio', async () => {
    const p = await abrir(admin, 'admin.html');
    await llenarProducto(p, NUEVO);
    await guardar(p);
    esperar(toasts(p.d).some(t => t.includes('agregado')), toasts(p.d).join(' | '));
    await hasta(() => fila(p, NUEVO.nombre), 'no aparece en la lista');
    esperar(p.d.getElementById('stat-custom').textContent === '1', 'personalizados != 1');
    esperar(p.d.getElementById('stat-total').textContent === String(PRODUCTOS.length + 1), 'total mal');
    esperar(p.d.getElementById('product-name').value === '' && p.d.querySelectorAll('.variant-row').length === 1, 'no limpió');
    const prod = (await publico()).productos[0];
    esperar(prod.id === 'grampa-omega-test' && prod.variants[1].id === 'GOT-34', JSON.stringify(prod.variants.map(v => v.id)));
    esperar(prod.image.startsWith('api.php?a=img&f='), `foto: ${prod.image}`);
  });

  await prueba('Alta', 'Un cliente lo ve en la grilla del catálogo', async () => {
    const p = await abrir(cliente, 'catalogo.html');
    await hasta(() => p.d.getElementById('product-grid').textContent.includes(NUEVO.nombre), 'no aparece');
    esperar(p.d.querySelectorAll('.product-card').length === PRODUCTOS.length + 1, `tarjetas: ${p.d.querySelectorAll('.product-card').length}`);
  });

  await prueba('Alta', 'Un cliente lo encuentra con el buscador del catálogo', async () => {
    const p = await abrir(cliente, 'catalogo.html');
    await hasta(() => p.d.querySelectorAll('.product-card').length > 0, 'no cargó');
    const s = p.d.getElementById('catalog-search');
    s.value = 'omega'; s.dispatchEvent(new p.w.Event('input'));
    esperar(p.d.querySelectorAll('.product-card').length === 1 && p.d.getElementById('product-grid').textContent.includes(NUEVO.nombre), 'no lo encuentra');
  });

  await prueba('Alta', 'Un cliente lo ve en el menú desplegable, con enlace a su ficha', async () => {
    const p = await abrir(cliente, 'catalogo.html');
    await hasta(() => [...p.d.querySelectorAll('#dropdown-productos a')].some(a => a.textContent === NUEVO.nombre), 'no está en el menú');
    const a = [...p.d.querySelectorAll('#dropdown-productos a')].find(a => a.textContent === NUEVO.nombre);
    esperar(a.getAttribute('href') === 'producto.html?id=grampa-omega-test', a.getAttribute('href'));
  });

  await prueba('Alta', 'La ficha del producto abre con medidas, foto y se puede pedir', async () => {
    const p = await abrir(cliente, 'producto.html', { query: '?id=grampa-omega-test' });
    await hasta(() => p.d.getElementById('prod-title').textContent === NUEVO.nombre, `título: "${p.d.getElementById('prod-title').textContent}"`);
    esperar(p.d.getElementById('prod-category').textContent === 'Tuercas', p.d.getElementById('prod-category').textContent);
    esperar(p.d.querySelectorAll('#tab-medidas tbody tr').length === 2, 'medidas');
    esperar(p.d.getElementById('prod-image').getAttribute('src').startsWith('api.php?a=img'), 'foto');
    p.d.getElementById('btn-add-to-cart').click();
    await sleep(50);
    esperar(p.w.eval('cart.length') === 1, 'no se pudo agregar al pedido');
  });

  await prueba('Alta', 'La foto subida se descarga como imagen', async () => {
    const prod = (await publico()).productos[0];
    const r = await fetch(BASE + prod.image);
    esperar(r.status === 200 && r.headers.get('content-type') === 'image/png', `${r.status} ${r.headers.get('content-type')}`);
  });

  await prueba('Alta', 'El panel abierto en otra computadora muestra el producto', async () => {
    const otro = new Navegador('admin2'); await otro.entrar();
    const p = await abrir(otro, 'admin.html');
    await hasta(() => fila(p, NUEVO.nombre), 'no lo ve');
  });

  // ═══════════ Modificación ═══════════
  await prueba('Modificación', '✎ en un propio llena el formulario con todos sus datos', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, NUEVO.nombre), 'no está');
    fila(p, NUEVO.nombre).querySelector('.admin-edit-btn').click();
    const d = p.d;
    esperar(d.getElementById('product-form-title').textContent === 'Editar Producto', 'título');
    esperar(d.getElementById('product-name').value === NUEVO.nombre && d.getElementById('product-category').value === 'tuercas' && d.getElementById('product-desc').value === NUEVO.descripcion, 'datos');
    esperar(d.querySelectorAll('.upload-gallery-item').length === 1, 'fotos');
    const filas = [...d.querySelectorAll('.variant-row')].map(r => [r.querySelector('.variant-codigo').value, r.querySelector('.variant-medida').value, r.querySelector('.variant-presentacion').value]);
    esperar(JSON.stringify(filas) === JSON.stringify(NUEVO.medidas), JSON.stringify(filas));
    esperar(d.getElementById('edit-banner').style.display === 'block', 'sin aviso de edición');
  });

  await prueba('Modificación', 'Cancelar la edición vuelve al modo alta', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, NUEVO.nombre), 'no está');
    fila(p, NUEVO.nombre).querySelector('.admin-edit-btn').click();
    p.d.getElementById('cancel-edit').click();
    esperar(p.d.getElementById('product-form-title').textContent === 'Agregar Producto al Catálogo' && p.d.getElementById('product-name').value === '', 'sigue editando');
  });

  await prueba('Modificación', 'Guardar cambios: mismo id, datos nuevos y una medida más', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, NUEVO.nombre), 'no está');
    fila(p, NUEVO.nombre).querySelector('.admin-edit-btn').click();
    await llenarProducto(p, { nombre: 'Grampa Omega Reforzada', categoria: 'bulones', medidas: [...NUEVO.medidas, ['', '1"', '25 U.']] });
    await guardar(p);
    esperar(toasts(p.d).some(t => t.includes('actualizado')), toasts(p.d).join(' | '));
    const pub = (await publico()).productos;
    esperar(pub.length === 1, `productos: ${pub.length}`);
    esperar(pub[0].id === 'grampa-omega-test' && pub[0].name === 'Grampa Omega Reforzada' && pub[0].category === 'bulones' && pub[0].variants.length === 3, JSON.stringify(pub[0]).slice(0, 200));
    esperar(pub[0].variants[0].id === 'grampa-omega-test-1', 'cambió el código generado');
  });

  await prueba('Modificación', 'El cliente ve el cambio en la ficha (mismo enlace)', async () => {
    const p = await abrir(cliente, 'producto.html', { query: '?id=grampa-omega-test' });
    await hasta(() => p.d.getElementById('prod-title').textContent === 'Grampa Omega Reforzada', 'nombre viejo');
    esperar(p.d.getElementById('prod-category').textContent === 'Bulones', 'categoría vieja');
  });

  await prueba('Modificación', '✎ en uno del proveedor: sin medidas, guarda nombre y descripción', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, base0.name), 'no está');
    fila(p, base0.name).querySelector('.admin-edit-btn').click();
    esperar(p.d.getElementById('variants-group').style.display === 'none', 'muestra las medidas');
    esperar(p.d.getElementById('edit-banner').textContent.includes('planilla'), 'sin aviso');
    await llenarProducto(p, { nombre: 'Nombre Corregido', descripcion: 'Descripción corregida' });
    await guardar(p);
    await hasta(() => fila(p, 'Nombre Corregido'), 'no se actualizó la lista');
    esperar(fila(p, 'Nombre Corregido').textContent.includes('Editado'), 'sin marca "Editado"');
    const c = (await publico()).cambios[base0.id];
    esperar(c && c.name === 'Nombre Corregido' && c.description === 'Descripción corregida' && !c.images && !c.category, JSON.stringify(c));
  });

  await prueba('Modificación', 'El cliente ve el producto del proveedor corregido, con sus medidas', async () => {
    const p = await abrir(cliente, 'producto.html', { query: '?id=' + encodeURIComponent(base0.id) });
    await hasta(() => p.d.getElementById('prod-title').textContent === 'Nombre Corregido', `título: ${p.d.getElementById('prod-title').textContent}`);
    esperar(p.d.getElementById('prod-desc').textContent === 'Descripción corregida', 'descripción');
    esperar(p.d.querySelectorAll('#tab-medidas tbody tr').length === base0.variants.length, 'medidas');
  });

  await prueba('Modificación', 'Volver al nombre original y vaciar la descripción quita la marca', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, 'Nombre Corregido'), 'no está');
    fila(p, 'Nombre Corregido').querySelector('.admin-edit-btn').click();
    await llenarProducto(p, { nombre: base0.name, descripcion: '' });
    await guardar(p);
    esperar(!(base0.id in (await publico()).cambios), JSON.stringify((await publico()).cambios[base0.id]));
    await hasta(() => fila(p, base0.name) && !fila(p, base0.name).textContent.includes('Editado'), 'sigue marcado');
  });

  await prueba('Modificación', 'Cambiar la foto de uno del proveedor', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, base1.name), 'no está');
    fila(p, base1.name).querySelector('.admin-edit-btn').click();
    p.d.querySelector('.remove-img-btn').click();
    await llenarProducto(p, { imagenes: [PNG] });
    await guardar(p);
    const c = (await publico()).cambios[base1.id];
    esperar(c && c.images && c.images[0].startsWith('api.php?a=img'), JSON.stringify(c));
    const q = await abrir(cliente, 'catalogo.html');
    await hasta(() => q.d.querySelectorAll('.product-card').length > 0, 'no cargó');
    const card = [...q.d.querySelectorAll('.product-card')].find(a => a.textContent.includes(base1.name));
    esperar(card.querySelector('img').getAttribute('src') === c.images[0], 'el catálogo muestra la foto vieja');
  });

  // ═══════════ Baja ═══════════
  await prueba('Baja', 'Cancelar la confirmación no borra nada', async () => {
    const p = await abrir(admin, 'admin.html', { confirmar: false });
    await hasta(() => fila(p, 'Grampa Omega Reforzada'), 'no está');
    fila(p, 'Grampa Omega Reforzada').querySelector('.admin-delete-btn').click();
    await sleep(300);
    esperar((await publico()).productos.length === 1, 'lo borró');
  });

  await prueba('Baja', 'Eliminar un propio: sale del panel, del catálogo y su ficha da error', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, 'Grampa Omega Reforzada'), 'no está');
    fila(p, 'Grampa Omega Reforzada').querySelector('.admin-delete-btn').click();
    await hasta(() => !fila(p, 'Grampa Omega Reforzada'), 'sigue en la lista');
    esperar(p.d.getElementById('stat-custom').textContent === '0', 'estadística');
    esperar((await publico()).productos.length === 0, 'sigue publicado');
    const f = await abrir(cliente, 'producto.html', { query: '?id=grampa-omega-test' });
    await hasta(() => f.d.getElementById('product-error').style.display === 'block', 'la ficha no da error');
  });

  await prueba('Baja', '👁 oculta uno del proveedor: el cliente deja de verlo', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, base0.name), 'no está');
    fila(p, base0.name).querySelector('.admin-hide-btn').click();
    await hasta(() => fila(p, base0.name).textContent.includes('Oculto'), 'sin marca "Oculto"');
    esperar(p.d.getElementById('stat-total').textContent === String(PRODUCTOS.length - 1), 'total no bajó');
    p.d.querySelector('.admin-tab[data-filter="hidden"]').click();
    esperar(p.d.querySelectorAll('.admin-product-row').length === 1, 'pestaña Ocultos');
    const c = await abrir(cliente, 'catalogo.html');
    await hasta(() => c.d.querySelectorAll('.product-card').length === PRODUCTOS.length - 1, `tarjetas: ${c.d.querySelectorAll('.product-card').length}`);
    esperar(![...c.d.querySelectorAll('#dropdown-productos a')].some(a => a.textContent === base0.name), 'sigue en el menú');
    const f = await abrir(cliente, 'producto.html', { query: '?id=' + encodeURIComponent(base0.id) });
    await hasta(() => f.d.getElementById('product-error').style.display === 'block', 'la ficha sigue abriendo');
  });

  await prueba('Baja', 'El cotizador sigue reconociendo los códigos de un producto oculto', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => p.w.eval('typeof cotCatalogo !== "undefined" && Object.keys(cotCatalogo).length > 0'), 'el cotizador no cargó');
    esperar(p.w.eval(`!!cotCatalogo[${JSON.stringify(base0.variants[0].id)}]`), 'no encuentra el código');
  });

  await prueba('Baja', '↺ lo vuelve a mostrar', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => fila(p, base0.name), 'no está');
    fila(p, base0.name).querySelector('.admin-hide-btn').click();
    await hasta(() => !fila(p, base0.name).textContent.includes('Oculto'), 'sigue oculto');
    const c = await abrir(cliente, 'catalogo.html');
    await hasta(() => c.d.querySelectorAll('.product-card').length === PRODUCTOS.length, 'el cliente no lo ve');
  });

  // ═══════════ Categorías ═══════════
  async function crearCategoria(p, nombre, conImagen = true) {
    p.d.getElementById('cat-name-input').value = nombre;
    const input = p.d.getElementById('cat-image-input');
    Object.defineProperty(input, 'files', { value: conImagen ? [archivo(p.w, 'c.png', PNG)] : [], configurable: true });
    p.d.getElementById('add-category-form').requestSubmit();
    await hasta(() => toasts(p.d).length > 0, 'no respondió');
    await sleep(200);
  }

  await prueba('Categorías', 'Alta: aparece en el panel y en el selector', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => p.d.querySelectorAll('.admin-product-row').length > 0, 'no cargó');
    await crearCategoria(p, 'Grampas');
    esperar(toasts(p.d).some(t => t.includes('creada')), toasts(p.d).join(' | '));
    await hasta(() => [...p.d.querySelectorAll('#product-category option')].some(o => o.value === 'grampas'), 'no está en el selector');
    esperar(p.d.getElementById('admin-category-list').textContent.includes('Grampas'), 'no está en la lista');
  });

  for (const [nombre, aviso, conImg] of [['Grampas', 'Ya existe', true], ['Remaches y Clavos', 'Ya existe', true], ['***', 'letras o números', true], ['Abrazaderas', 'imagen', false]]) {
    await prueba('Categorías', `Rechaza "${nombre}"${conImg ? '' : ' sin imagen'} con aviso`, async () => {
      const p = await abrir(admin, 'admin.html');
      await hasta(() => p.d.querySelectorAll('.admin-product-row').length > 0, 'no cargó');
      await crearCategoria(p, nombre, conImg);
      esperar(toasts(p.d).some(t => t.includes(aviso)), toasts(p.d).join(' | '));
      esperar((await publico()).categorias.length === 1, 'creó otra');
    });
  }

  await prueba('Categorías', 'Producto en la categoría nueva: el cliente la ve como filtro con su producto', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => [...p.d.querySelectorAll('#product-category option')].some(o => o.value === 'grampas'), 'no está en el selector');
    await llenarProducto(p, { ...NUEVO, nombre: 'Grampa U', categoria: 'grampas', medidas: [['', '1', '1']] });
    await guardar(p);
    const c = await abrir(cliente, 'catalogo.html');
    await hasta(() => c.d.querySelector('.filter-tab[data-cat="grampas"]'), 'no hay filtro');
    const tab = c.d.querySelector('.filter-tab[data-cat="grampas"]');
    esperar(tab.querySelector('.tab-count').textContent === '1', `cuenta: ${tab.querySelector('.tab-count').textContent}`);
    esperar(tab.querySelector('img'), 'sin logo');
    tab.click();
    esperar(c.d.querySelectorAll('.product-card').length === 1 && c.d.getElementById('product-grid').textContent.includes('Grampa U'), 'el filtro no muestra el producto');
  });

  await prueba('Categorías', 'catalogo.html?cat=grampas abre filtrado y el menú tiene la categoría', async () => {
    const c = await abrir(cliente, 'catalogo.html', { query: '?cat=grampas' });
    await hasta(() => c.d.querySelector('.filter-tab.active')?.dataset.cat === 'grampas', `activa: ${c.d.querySelector('.filter-tab.active')?.dataset.cat}`);
    esperar([...c.d.querySelectorAll('#dropdown-productos a')].some(a => a.textContent === 'Grampas'), 'no está en el menú');
  });

  await prueba('Categorías', 'La ficha muestra el nombre de la categoría nueva', async () => {
    const f = await abrir(cliente, 'producto.html', { query: '?id=grampa-u' });
    await hasta(() => f.d.getElementById('prod-category').textContent === 'Grampas', `categoría: ${f.d.getElementById('prod-category').textContent}`);
  });

  await prueba('Categorías', 'No deja borrar una categoría con productos y explica por qué', async () => {
    const p = await abrir(admin, 'admin.html');
    await hasta(() => p.d.querySelector('.delete-cat-btn'), 'no hay botón');
    p.d.querySelector('.delete-cat-btn').click();
    await hasta(() => toasts(p.d).length > 0, 'no respondió');
    esperar(toasts(p.d).some(t => t.includes('Grampa U') && t.includes('Cambiales la categoría')), toasts(p.d).join(' | '));
    esperar((await publico()).categorias.length === 1, 'la borró');
  });

  await prueba('Categorías', 'Sin productos sí se borra, y desaparece del sitio', async () => {
    await admin.api('catalogo_producto_borrar', { id: 'grampa-u' });
    const p = await abrir(admin, 'admin.html');
    await hasta(() => p.d.querySelector('.delete-cat-btn'), 'no hay botón');
    p.d.querySelector('.delete-cat-btn').click();
    await hasta(() => toasts(p.d).some(t => t.includes('eliminada')), toasts(p.d).join(' | '));
    esperar((await publico()).categorias.length === 0, 'sigue');
    const c = await abrir(cliente, 'catalogo.html');
    await hasta(() => c.d.querySelectorAll('.filter-tab').length > 0, 'no cargó');
    esperar(!c.d.querySelector('.filter-tab[data-cat="grampas"]'), 'el filtro sigue');
  });

  // ═══════════ Seguridad ═══════════
  await prueba('Seguridad', 'HTML en nombres y descripciones no se ejecuta en ninguna página', async () => {
    const malo = '<img src=x id=xss1 onerror="window.hackeado=1">';
    const r1 = await admin.api('catalogo_imagen', { data: 'data:image/png;base64,' + PNG.toString('base64') });
    await admin.api('catalogo_categoria', { label: '<b id=xss2>Cat</b>', image: r1.url });
    const cats = (await publico()).categorias;
    await admin.api('catalogo_producto', { name: malo, category: cats[0].id, description: malo, images: [r1.url], variants: [{ codigo: '', medida: malo, presentacion: malo }] });
    await admin.api('catalogo_base', { id: base0.id, name: '<i id=xss3>x</i>' });
    const id = (await publico()).productos[0].id;
    const paginas = [
      await abrir(admin, 'admin.html'),
      await abrir(cliente, 'catalogo.html'),
      await abrir(cliente, 'producto.html', { query: '?id=' + encodeURIComponent(id) }),
      await abrir(cliente, 'index.html'),
    ];
    await sleep(800);
    for (const p of paginas) {
      const hit = p.d.querySelector('#xss1, #xss2, #xss3');
      esperar(!hit && !p.w.hackeado, `${p.w.location.pathname}: se insertó ${hit ? hit.id : 'código'}`);
    }
    esperar(paginas[1].d.getElementById('product-grid').textContent.includes('<img src=x'), 'el nombre no se ve como texto');
    // limpieza
    await admin.api('catalogo_producto_borrar', { id });
    await admin.api('catalogo_categoria_borrar', { id: cats[0].id });
    await admin.api('catalogo_base', { id: base0.id, name: base0.name });
  });

  await prueba('Seguridad', 'Con la sesión vencida avisa y no guarda', async () => {
    const nav = new Navegador('vence'); await nav.entrar();
    const p = await abrir(nav, 'admin.html');
    await hasta(() => p.d.querySelectorAll('.admin-product-row').length > 0, 'no cargó');
    await nav.api('salir');
    await llenarProducto(p, NUEVO);
    await guardar(p);
    esperar(toasts(p.d).some(t => t.includes('sesión venció')), toasts(p.d).join(' | '));
    esperar(!(await publico()).productos.some(x => x.name === NUEVO.nombre), 'guardó');
  });

  // ═══════════ General ═══════════
  await prueba('General', 'Sin el servidor (api.php caído) el catálogo sigue mostrando lo del proveedor', async () => {
    const nav = new Navegador('sin-api');
    const orig = nav.fetch.bind(nav);
    nav.fetch = (url, o) => (String(url).includes('api.php') ? Promise.reject(new Error('caído')) : orig(url, o));
    const c = await abrir(nav, 'catalogo.html');
    await hasta(() => c.d.querySelectorAll('.product-card').length === PRODUCTOS.length, `tarjetas: ${c.d.querySelectorAll('.product-card').length}`);
  });

  await prueba('General', 'Ninguna página tiró errores de JavaScript', async () => {
    esperar(erroresJs.length === 0, erroresJs.slice(0, 3).join(' || '));
  });

  let grupo = '';
  for (const r of resultados) {
    if (r.grupo !== grupo) { grupo = r.grupo; console.log(`\n== ${grupo} ==`); }
    console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre}${!r.ok ? '\n        -> ' + r.det : ''}`);
  }
  const ok = resultados.filter(r => r.ok).length;
  console.log(`\nPANEL Y SITIO: ${ok} de ${resultados.length} pruebas OK, ${resultados.length - ok} fallan`);
  process.exit(ok === resultados.length ? 0 : 1);
})();
