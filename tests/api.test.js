// Pruebas de la API del ABM del catálogo contra un servidor PHP real.
// Se corre con: sh tests/correr.sh
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const DATOS = process.argv[3];
const CLAVE = 'prueba123';

// PNG de 1x1 y uno "grande" (cabecera PNG válida + relleno)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const dataUrl = (buf, tipo = 'image/png') => `data:${tipo};base64,${buf.toString('base64')}`;

class Navegador {
  constructor() { this.cookies = {}; }
  async pedir(accion, { metodo = 'GET', cuerpo, tipo = 'application/json', crudo } = {}) {
    const headers = {};
    const c = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.Cookie = c;
    if (tipo && (cuerpo !== undefined || crudo !== undefined)) headers['Content-Type'] = tipo;
    const res = await fetch(BASE + 'api.php?a=' + accion, {
      method: metodo, headers,
      body: crudo !== undefined ? crudo : (cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined),
    });
    for (const sc of res.headers.getSetCookie()) {
      const [par] = sc.split(';'); const i = par.indexOf('=');
      this.cookies[par.slice(0, i)] = par.slice(i + 1);
    }
    const texto = await res.text();
    let json = null; try { json = JSON.parse(texto); } catch (e) {}
    return { status: res.status, json, headers: res.headers, texto };
  }
  post(accion, cuerpo, extra = {}) { return this.pedir(accion, { metodo: 'POST', cuerpo, ...extra }); }
  async entrar(clave = CLAVE) { return this.post('entrar', { clave }); }
}

const resultados = [];
async function prueba(grupo, nombre, fn) {
  try { const d = await fn(); resultados.push({ grupo, nombre, ok: true, d }); }
  catch (e) { resultados.push({ grupo, nombre, ok: false, d: e.message }); }
}
function esperar(c, m) { if (!c) throw new Error(m); }
function status(r, s, m = '') { esperar(r.status === s, `${m}esperaba ${s}, vino ${r.status} ${r.texto.slice(0, 160)}`); }

const publico = async () => (await new Navegador().pedir('catalogo')).json;

(async () => {
  const admin = new Navegador();
  const anonimo = new Navegador();
  const productosBase = await (await fetch(BASE + 'productos.json')).json();
  const base0 = productosBase[0];

  // ═══════════ Sesión y permisos ═══════════
  await prueba('Permisos', 'El catálogo público se lee sin sesión', async () => {
    const r = await anonimo.pedir('catalogo');
    status(r, 200);
    esperar(Array.isArray(r.json.productos) && typeof r.json.cambios === 'object' && Array.isArray(r.json.categorias), 'formato inesperado');
  });

  for (const accion of ['catalogo_imagen', 'catalogo_producto', 'catalogo_producto_borrar', 'catalogo_base', 'catalogo_categoria', 'catalogo_categoria_borrar']) {
    await prueba('Permisos', `Sin sesión, ${accion} responde 401 y no cambia nada`, async () => {
      const antes = JSON.stringify(await publico());
      const r = await anonimo.post(accion, { id: base0.id, oculto: true, name: 'X', label: 'X' });
      status(r, 401);
      esperar(JSON.stringify(await publico()) === antes, 'el catálogo cambió');
    });
  }

  await prueba('Permisos', 'Contraseña incorrecta: 403', async () => {
    status(await new Navegador().entrar('mala'), 403);
  });

  await prueba('Permisos', 'Contraseña correcta: entra', async () => {
    status(await admin.entrar(), 200);
  });

  await prueba('Permisos', 'Escritura con un tipo de contenido que no es JSON: 415', async () => {
    const r = await admin.post('catalogo_base', undefined, { crudo: JSON.stringify({ id: base0.id, oculto: true }), tipo: 'text/plain' });
    status(r, 415);
  });

  await prueba('Permisos', 'Cuerpo que no es JSON: 400', async () => {
    status(await admin.post('catalogo_producto', undefined, { crudo: 'esto no es json' }), 400);
  });

  // ═══════════ Imágenes ═══════════
  let img1, img2;
  await prueba('Imágenes', 'Sube una PNG válida y se puede descargar', async () => {
    const r = await admin.post('catalogo_imagen', { data: dataUrl(PNG) });
    status(r, 200);
    img1 = r.json.url;
    esperar(/^api\.php\?a=img&f=[a-f0-9]{16}\.png$/.test(img1), `url: ${img1}`);
    const g = await fetch(BASE + img1);
    esperar(g.status === 200 && g.headers.get('content-type') === 'image/png', `descarga: ${g.status} ${g.headers.get('content-type')}`);
    esperar(Buffer.from(await g.arrayBuffer()).equals(PNG), 'el archivo descargado no es el mismo');
    img2 = (await admin.post('catalogo_imagen', { data: dataUrl(PNG) })).json.url;
  });

  await prueba('Imágenes', 'Rechaza un archivo que no es imagen aunque diga image/png', async () => {
    const r = await admin.post('catalogo_imagen', { data: dataUrl(Buffer.from('<?php echo "hola"; ?>')) });
    status(r, 400);
  });

  await prueba('Imágenes', 'Rechaza una imagen de más de 2 MB', async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(2.2 * 1024 * 1024)]);
    status(await admin.post('catalogo_imagen', { data: dataUrl(grande) }), 413);
  });

  // Es la forma que usa el panel: un archivo real, no texto base64 dentro de un JSON
  const subirArchivo = (nav, bytes, nombre = 'imagen') => {
    const f = new FormData();
    f.append('imagen', new Blob([bytes]), nombre);
    return nav.pedir('catalogo_imagen', { metodo: 'POST', crudo: f, tipo: null });
  };
  await prueba('Imágenes', 'Sube una PNG como archivo (multipart) y es idéntica al descargarla', async () => {
    const r = await subirArchivo(admin, PNG);
    status(r, 200);
    esperar(/^api\.php\?a=img&f=[a-f0-9]{16}\.png$/.test(r.json.url), `url: ${r.json.url}`);
    const g = await fetch(BASE + r.json.url);
    esperar(Buffer.from(await g.arrayBuffer()).equals(PNG), 'el archivo descargado no es el mismo');
  });
  await prueba('Imágenes', 'La subida como archivo exige sesión, y rechaza lo que no es imagen o pesa más de 2 MB', async () => {
    status(await subirArchivo(anonimo, PNG), 401);
    status(await subirArchivo(admin, Buffer.from('<?php echo "hola"; ?>'), 'x.png'), 400);
    status(await subirArchivo(admin, Buffer.concat([PNG, Buffer.alloc(2.2 * 1024 * 1024)])), 413);
  });

  await prueba('Imágenes', 'Rechaza un data: mal formado', async () => {
    status(await admin.post('catalogo_imagen', { data: 'hola' }), 400);
    status(await admin.post('catalogo_imagen', { data: 'data:image/png;base64,@@@' }), 400);
  });

  await prueba('Imágenes', 'No permite leer archivos fuera de la carpeta de fotos', async () => {
    for (const f of ['../clave_admin.txt', '..%2Fclave_admin.txt', 'clave_admin.txt', 'aaaaaaaaaaaaaaaa.php']) {
      const r = await fetch(BASE + 'api.php?a=img&f=' + f);
      esperar(r.status === 404, `${f} -> ${r.status}`);
      esperar(!(await r.text()).includes('$2y$'), `${f} filtró la contraseña`);
    }
  });

  // ═══════════ Alta de productos ═══════════
  const valido = () => ({ name: 'Grampa Omega', category: 'tuercas', description: 'Grampa de prueba', images: [img1], variants: [{ medida: '1/2"', presentacion: '100 U.' }, { codigo: 'GO-3/4', medida: '3/4"', presentacion: '50 U.' }] });

  for (const [caso, cambio, msg] of [
    ['sin nombre', { name: '' }, 'nombre'],
    ['con nombre de solo espacios', { name: '   ' }, 'nombre'],
    ['con nombre de solo símbolos', { name: '***' }, 'nombre'],
    ['sin categoría', { category: '' }, 'categor'],
    ['con categoría inexistente', { category: 'inventada' }, 'categor'],
    ['sin imágenes', { images: [] }, 'im[aá]gen'],
    ['con 5 imágenes', { images: [img1, img1, img1, img1, img1] }, '4'],
    ['con imagen externa', { images: ['https://otro.com/x.png'] }, 'im[aá]gen'],
    ['con imagen javascript:', { images: ['javascript:alert(1)'] }, 'im[aá]gen'],
    ['con ruta que sale de la carpeta', { images: ['imagenes/../api.php'] }, 'im[aá]gen'],
    ['con foto subida inexistente', { images: ['api.php?a=img&f=0123456789abcdef.png'] }, 'im[aá]gen'],
    ['sin medidas', { variants: [] }, 'medida'],
    ['con medida sin presentación', { variants: [{ medida: '1', presentacion: '' }] }, 'fila 1'],
    ['con código con caracteres raros', { variants: [{ codigo: '<b>', medida: '1', presentacion: '1' }] }, 'caracteres'],
  ]) {
    await prueba('Alta', `Rechaza el alta ${caso}`, async () => {
      const r = await admin.post('catalogo_producto', { ...valido(), ...cambio });
      esperar(r.status === 400, `vino ${r.status}`);
      esperar(new RegExp(msg, 'i').test(r.json.error || ''), `mensaje: ${r.json.error}`);
      esperar((await publico()).productos.length === 0, 'igual guardó algo');
    });
  }

  await prueba('Alta', 'Rechaza un código de medida que ya usa un producto del proveedor', async () => {
    const codigo = base0.variants[0].id;
    const r = await admin.post('catalogo_producto', { ...valido(), variants: [{ codigo, medida: '1', presentacion: '1' }] });
    status(r, 409);
    esperar(r.json.error.includes(base0.name), r.json.error);
  });

  await prueba('Alta', 'Rechaza códigos repetidos dentro del mismo producto', async () => {
    const r = await admin.post('catalogo_producto', { ...valido(), variants: [{ codigo: 'X1', medida: '1', presentacion: '1' }, { codigo: 'X1', medida: '2', presentacion: '1' }] });
    status(r, 409);
  });

  let creado;
  await prueba('Alta', 'Alta válida: id legible, códigos y datos correctos, visible para todos', async () => {
    const r = await admin.post('catalogo_producto', valido());
    status(r, 200);
    creado = r.json.producto;
    esperar(creado.id === 'grampa-omega', `id: ${creado.id}`);
    esperar(creado.variants[0].id === 'grampa-omega-1' && creado.variants[1].id === 'GO-3/4', `códigos: ${creado.variants.map(v => v.id)}`);
    esperar(creado.image === img1 && creado.images.length === 1, 'imagen mal guardada');
    const pub = await publico();
    esperar(pub.productos.length === 1 && pub.productos[0].id === 'grampa-omega', 'el público no lo ve');
  });

  await prueba('Alta', 'Mismo nombre otra vez: id distinto (no pisa el anterior)', async () => {
    const r = await admin.post('catalogo_producto', { ...valido(), variants: [{ medida: '1', presentacion: '1' }] });
    status(r, 200);
    esperar(r.json.producto.id === 'grampa-omega-2', `id: ${r.json.producto.id}`);
    esperar((await publico()).productos.length === 2, 'no quedaron 2');
  });

  await prueba('Alta', 'Un id que coincide con uno del proveedor no lo pisa', async () => {
    const r = await admin.post('catalogo_producto', { ...valido(), name: base0.name, variants: [{ medida: '1', presentacion: '1' }] });
    status(r, 200);
    esperar(r.json.producto.id === base0.id + '-2', `id: ${r.json.producto.id}`);
  });

  await prueba('Alta', 'Acentos y eñes generan un id prolijo', async () => {
    const r = await admin.post('catalogo_producto', { ...valido(), name: 'Ménsula Añeja Ü', variants: [{ medida: '1', presentacion: '1' }] });
    esperar(r.json.producto.id === 'mensula-aneja-u', `id: ${r.json.producto.id}`);
  });

  await prueba('Alta', 'El HTML en el nombre se guarda como texto, sin tocar', async () => {
    const r = await admin.post('catalogo_producto', { ...valido(), name: '<img src=x onerror=alert(1)>', variants: [{ medida: '1', presentacion: '1' }] });
    status(r, 200);
    esperar(r.json.producto.name === '<img src=x onerror=alert(1)>', r.json.producto.name);
  });

  await prueba('Alta', 'Textos larguísimos se recortan', async () => {
    const r = await admin.post('catalogo_producto', { ...valido(), name: 'L'.repeat(500), description: 'd'.repeat(5000), variants: [{ medida: 'm'.repeat(300), presentacion: '1' }] });
    status(r, 200);
    const p = r.json.producto;
    esperar(p.name.length === 120 && p.description.length === 1500 && p.variants[0].medida.length === 80, `${p.name.length}/${p.description.length}/${p.variants[0].medida.length}`);
  });

  // ═══════════ Modificación ═══════════
  await prueba('Modificación', 'Editar cambia los datos y conserva id y fecha de alta', async () => {
    const r = await admin.post('catalogo_producto', { ...valido(), id: 'grampa-omega', name: 'Grampa Omega Reforzada', category: 'bulones', images: [img2, img1] });
    status(r, 200);
    const p = r.json.producto;
    esperar(p.id === 'grampa-omega' && p.name === 'Grampa Omega Reforzada' && p.category === 'bulones', JSON.stringify(p).slice(0, 120));
    esperar(p.creado === creado.creado, 'cambió la fecha de alta');
    esperar(p.images[0] === img2, 'no cambió la foto principal');
    esperar(r.json.nuevo === false, 'lo marcó como nuevo');
    const pub = await publico();
    esperar(pub.productos.filter(x => x.id === 'grampa-omega').length === 1, 'se duplicó');
  });

  await prueba('Modificación', 'Editar puede conservar sus propios códigos', async () => {
    const r = await admin.post('catalogo_producto', { ...valido(), id: 'grampa-omega' });
    status(r, 200, 'no dejó reusar sus códigos: ');
  });

  await prueba('Modificación', 'Editar no puede tomar un código de otro producto propio', async () => {
    const otro = (await publico()).productos.find(p => p.id === 'grampa-omega-2');
    const r = await admin.post('catalogo_producto', { ...valido(), id: 'grampa-omega', variants: [{ codigo: otro.variants[0].id, medida: '1', presentacion: '1' }] });
    status(r, 409);
  });

  await prueba('Modificación', 'Editar un producto que no existe: 404', async () => {
    status(await admin.post('catalogo_producto', { ...valido(), id: 'no-existe' }), 404);
  });

  // ═══════════ Baja ═══════════
  await prueba('Baja', 'Borrar un producto propio', async () => {
    status(await admin.post('catalogo_producto_borrar', { id: 'grampa-omega-2' }), 200);
    esperar(!(await publico()).productos.some(p => p.id === 'grampa-omega-2'), 'sigue publicado');
    esperar((await publico()).productos.some(p => p.id === 'grampa-omega'), 'borró otro');
  });

  await prueba('Baja', 'Borrar dos veces: 404 la segunda', async () => {
    status(await admin.post('catalogo_producto_borrar', { id: 'grampa-omega-2' }), 404);
  });

  await prueba('Baja', 'No se puede borrar un producto del proveedor con esa acción', async () => {
    status(await admin.post('catalogo_producto_borrar', { id: base0.id }), 404);
  });

  // ═══════════ Productos del proveedor ═══════════
  await prueba('Proveedor', 'Ocultar y volver a mostrar', async () => {
    status(await admin.post('catalogo_base', { id: base0.id, oculto: true }), 200);
    esperar((await publico()).cambios[base0.id]?.oculto === true, 'no quedó oculto');
    status(await admin.post('catalogo_base', { id: base0.id, oculto: false }), 200);
    esperar(!(base0.id in (await publico()).cambios), 'quedó un cambio vacío');
  });

  await prueba('Proveedor', 'Editar nombre, categoría, descripción y foto', async () => {
    const r = await admin.post('catalogo_base', { id: base0.id, name: 'Nombre Corregido', category: 'bulones', description: 'Nueva', images: [img1] });
    status(r, 200);
    const c = (await publico()).cambios[base0.id];
    esperar(c.name === 'Nombre Corregido' && c.category === 'bulones' && c.description === 'Nueva' && c.images[0] === img1, JSON.stringify(c));
  });

  await prueba('Proveedor', 'Acepta las fotos propias del sitio (imagenes/...)', async () => {
    const otra = productosBase.find(p => p.image !== base0.image).image;
    const r = await admin.post('catalogo_base', { id: base0.id, images: [otra] });
    status(r, 200);
    esperar(((await publico()).cambios[base0.id] || {}).images?.[0] === otra, 'no guardó la foto');
  });

  await prueba('Proveedor', 'Volver los campos al original borra el cambio', async () => {
    const r = await admin.post('catalogo_base', { id: base0.id, name: base0.name, category: base0.category, description: '', images: [] });
    status(r, 200);
    esperar(!(base0.id in (await publico()).cambios), JSON.stringify((await publico()).cambios[base0.id]));
  });

  await prueba('Proveedor', 'Ocultar no borra la edición, y mostrar tampoco', async () => {
    await admin.post('catalogo_base', { id: base0.id, name: 'Editado' });
    await admin.post('catalogo_base', { id: base0.id, oculto: true });
    await admin.post('catalogo_base', { id: base0.id, oculto: false });
    const c = (await publico()).cambios[base0.id];
    esperar(c && c.name === 'Editado' && !c.oculto, JSON.stringify(c));
    await admin.post('catalogo_base', { id: base0.id, name: base0.name });
  });

  await prueba('Proveedor', 'Rechaza id inexistente, categoría inválida y nombre vacío', async () => {
    status(await admin.post('catalogo_base', { id: 'no-existe', oculto: true }), 404, 'id: ');
    status(await admin.post('catalogo_base', { id: base0.id, category: 'inventada' }), 400, 'categoría: ');
    status(await admin.post('catalogo_base', { id: base0.id, name: '  ' }), 400, 'nombre: ');
    status(await admin.post('catalogo_base', { id: base0.id, images: ['https://x.com/a.png'] }), 400, 'imagen: ');
  });

  // ═══════════ Categorías ═══════════
  await prueba('Categorías', 'Alta de categoría', async () => {
    const r = await admin.post('catalogo_categoria', { label: 'Grampas', image: img1 });
    status(r, 200);
    esperar(r.json.categoria.id === 'grampas', r.json.categoria.id);
    esperar((await publico()).categorias.some(c => c.id === 'grampas'), 'no es pública');
  });

  for (const [nombre, st] of [['grampas', 409], ['GRAMPAS', 409], ['Tuercas', 409], ['Remaches y Clavos', 409], ['Varillas Roscadas', 409], ['remaches-clavos', 409], ['***', 400], ['', 400]]) {
    await prueba('Categorías', `Rechaza "${nombre}" (${st})`, async () => {
      status(await admin.post('catalogo_categoria', { label: nombre, image: img1 }), st);
    });
  }

  await prueba('Categorías', 'Rechaza una categoría sin imagen o con imagen externa', async () => {
    status(await admin.post('catalogo_categoria', { label: 'Abrazaderas' }), 400, 'sin imagen: ');
    status(await admin.post('catalogo_categoria', { label: 'Abrazaderas', image: 'https://x.com/a.png' }), 400, 'externa: ');
  });

  await prueba('Categorías', 'Acentos: "Ménsulas" -> mensulas', async () => {
    const r = await admin.post('catalogo_categoria', { label: 'Ménsulas', image: img1 });
    esperar(r.json.categoria && r.json.categoria.id === 'mensulas', r.texto);
  });

  await prueba('Categorías', 'Un producto puede usar la categoría nueva', async () => {
    status(await admin.post('catalogo_producto', { ...valido(), name: 'Grampa U', category: 'grampas', variants: [{ medida: '1', presentacion: '1' }] }), 200);
  });

  await prueba('Categorías', 'No deja borrar una categoría con productos propios', async () => {
    const r = await admin.post('catalogo_categoria_borrar', { id: 'grampas' });
    status(r, 409);
    esperar(r.json.error.includes('Grampa U'), r.json.error);
  });

  await prueba('Categorías', 'No deja borrar una categoría usada por un producto del proveedor', async () => {
    await admin.post('catalogo_base', { id: base0.id, category: 'mensulas' });
    const r = await admin.post('catalogo_categoria_borrar', { id: 'mensulas' });
    status(r, 409);
    await admin.post('catalogo_base', { id: base0.id, category: base0.category });
  });

  await prueba('Categorías', 'Borra una categoría sin uso; la segunda vez da 404', async () => {
    status(await admin.post('catalogo_categoria_borrar', { id: 'mensulas' }), 200);
    status(await admin.post('catalogo_categoria_borrar', { id: 'mensulas' }), 404);
  });

  await prueba('Categorías', 'Las categorías base no se pueden borrar', async () => {
    status(await admin.post('catalogo_categoria_borrar', { id: 'tuercas' }), 404);
  });

  // ═══════════ Robustez ═══════════
  await prueba('Robustez', '10 altas simultáneas: no se pierde ninguna', async () => {
    const antes = (await publico()).productos.length;
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      admin.post('catalogo_producto', { ...valido(), name: `Paralelo ${i}`, variants: [{ medida: '1', presentacion: '1' }] })));
    esperar(rs.every(r => r.status === 200), `estados: ${rs.map(r => r.status)}`);
    const despues = (await publico()).productos.length;
    esperar(despues === antes + 10, `había ${antes}, quedaron ${despues}`);
  });

  await prueba('Robustez', '5 altas simultáneas con el mismo nombre: ids distintos', async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () =>
      admin.post('catalogo_producto', { ...valido(), name: 'Repetido', variants: [{ medida: '1', presentacion: '1' }] })));
    const ids = rs.map(r => r.json.producto.id);
    esperar(new Set(ids).size === 5, `ids: ${ids}`);
  });

  await prueba('Robustez', 'Las fotos que nadie usa se borran (pasada una hora)', async () => {
    const huerfana = (await admin.post('catalogo_imagen', { data: dataUrl(PNG) })).json.url;
    const archivo = path.join(DATOS, 'imagenes_catalogo', huerfana.split('f=')[1]);
    const usada = path.join(DATOS, 'imagenes_catalogo', img1.split('f=')[1]);
    const viejo = new Date(Date.now() - 2 * 3600 * 1000);
    fs.utimesSync(archivo, viejo, viejo); fs.utimesSync(usada, viejo, viejo);
    await admin.post('catalogo_base', { id: base0.id, oculto: false });
    esperar(!fs.existsSync(archivo), 'la foto huérfana sigue');
    esperar(fs.existsSync(usada), 'borró una foto en uso');
  });

  await prueba('Robustez', 'Una foto recién subida y todavía sin usar no se borra', async () => {
    const nueva = (await admin.post('catalogo_imagen', { data: dataUrl(PNG) })).json.url;
    await admin.post('catalogo_base', { id: base0.id, oculto: false });
    esperar(fs.existsSync(path.join(DATOS, 'imagenes_catalogo', nueva.split('f=')[1])), 'la borró');
  });

  await prueba('Robustez', 'El catálogo queda fuera de public_html', async () => {
    esperar(fs.existsSync(path.join(DATOS, 'catalogo.json')), 'no está en datos_distrijam');
    const r = await fetch(BASE + 'catalogo.json');
    esperar(r.status === 404, `catalogo.json accesible por web: ${r.status}`);
  });

  await prueba('Robustez', 'Un catalogo.json dañado no rompe el sitio', async () => {
    const ruta = path.join(DATOS, 'catalogo.json');
    const copia = fs.readFileSync(ruta);
    fs.writeFileSync(ruta, '{roto');
    const r = await new Navegador().pedir('catalogo');
    fs.writeFileSync(ruta, copia);
    status(r, 200);
    esperar(r.json.productos.length === 0, 'devolvió basura');
  });

  // ═══════════ Cierre de sesión ═══════════
  await prueba('Permisos', 'Después de salir, ya no puede escribir', async () => {
    await admin.pedir('salir');
    status(await admin.post('catalogo_producto', valido()), 401);
  });

  let grupo = '';
  for (const r of resultados) {
    if (r.grupo !== grupo) { grupo = r.grupo; console.log(`\n== ${grupo} ==`); }
    console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre}${!r.ok || (r.d && typeof r.d === 'string') ? '\n        -> ' + r.d : ''}`);
  }
  const ok = resultados.filter(r => r.ok).length;
  console.log(`\nAPI: ${ok} de ${resultados.length} pruebas OK, ${resultados.length - ok} fallan`);
  process.exitCode = ok === resultados.length ? 0 : 1;
})();
