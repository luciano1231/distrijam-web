// Pruebas integrales del ERP Distrijam contra servidor PHP real:
// Multi-rol, Stock, Disponibilidad pública, Ventas, Etiquetas, Facturación,
// Cuenta Corriente, Recibos, Finanzas, Tareas y Portal Público de Cliente.
const assert = require('assert');

const BASE = process.argv[2] || 'http://127.0.0.1:8098/';
const CLAVE_ADMIN = 'prueba123';

class Navegador {
  constructor() { this.cookies = {}; }
  async pedir(accion, { metodo = 'GET', cuerpo, query = '' } = {}) {
    const headers = {};
    const c = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.Cookie = c;
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + 'api.php?a=' + encodeURIComponent(accion) + query, {
      method: metodo,
      headers,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    for (const sc of res.headers.getSetCookie()) {
      const [par] = sc.split(';');
      const i = par.indexOf('=');
      this.cookies[par.slice(0, i)] = par.slice(i + 1);
    }
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (e) {}
    return { status: res.status, json, texto };
  }
  post(accion, cuerpo) { return this.pedir(accion, { metodo: 'POST', cuerpo }); }
  entrar(clave = CLAVE_ADMIN, usuario = '') {
    return this.post('entrar', usuario ? { usuario, clave } : { clave });
  }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

(async () => {
  const admin = new Navegador();
  const ventas = new Navegador();
  const deposito = new Navegador();
  const anon = new Navegador();

  const productosBase = await (await fetch(BASE + 'productos.json')).json();
  const sku0 = productosBase[0].variants[0].id;
  const sku1 = productosBase[0].variants[1]?.id || sku0;

  test('Login admin legado y creación de usuarios Ventas y Depósito', async () => {
    const r = await admin.entrar();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.rol, 'admin');

    const u1 = await admin.post('usuarios', { usuario: 'vendedor1', nombre: 'Carlos Ventas', rol: 'ventas', clave: 'ventas123', activo: true });
    assert.strictEqual(u1.status, 200);

    const u2 = await admin.post('usuarios', { usuario: 'depo1', nombre: 'Lucas Depo', rol: 'deposito', clave: 'depo1234', activo: true });
    assert.strictEqual(u2.status, 200);

    const lv = await ventas.entrar('ventas123', 'vendedor1');
    assert.strictEqual(lv.status, 200);
    assert.strictEqual(lv.json.rol, 'ventas');

    const ld = await deposito.entrar('depo1234', 'depo1');
    assert.strictEqual(ld.status, 200);
    assert.strictEqual(ld.json.rol, 'deposito');
  });

  test('Control estricto de permisos por rol (401/403)', async () => {
    assert.strictEqual((await anon.pedir('stock')).status, 401);
    assert.strictEqual((await anon.pedir('ventas')).status, 401);
    assert.strictEqual((await deposito.pedir('finanzas')).status, 403);
    assert.strictEqual((await deposito.pedir('usuarios')).status, 403);
    assert.strictEqual((await deposito.pedir('precios')).status, 403);
    assert.strictEqual((await ventas.pedir('finanzas')).status, 403);
    assert.strictEqual((await ventas.post('usuarios', { usuario: 'x', nombre: 'x', rol: 'admin', clave: '123456' })).status, 403);
  });

  test('Stock e interruptor de disponibilidad pública sin filtrar cantidades ni precios', async () => {
    const m = await deposito.post('stock_movimiento', {
      variantId: sku0, tipo: 'ingreso', cantidad: 50, minimo: 10, ubicacion: 'A-12', referencia: 'Compra inicial',
    });
    assert.strictEqual(m.status, 200);
    assert.strictEqual(m.json.stock[sku0].actual, 50);

    // Por defecto oculto
    let cat = await anon.pedir('catalogo');
    assert.strictEqual(cat.json.mostrarDisponibilidad, undefined);

    // Admin habilita disponibilidad pública
    const cfg = await admin.post('config_erp', {
      mostrarDisponibilidadCatalogo: true,
      banco: 'Banco Nación',
      cbu: '0110000000000000000001',
      aliasCbu: 'DISTRIJAM.SA',
    });
    assert.strictEqual(cfg.status, 200);

    cat = await anon.pedir('catalogo');
    assert.strictEqual(cat.json.mostrarDisponibilidad, true);
    assert.strictEqual(cat.json.disponibilidad[sku0], 'disponible');
    assert.strictEqual(cat.texto.includes('"costo"'), false);
    assert.strictEqual(cat.texto.includes('50'), false);
  });

  let shareToken = '';
  let ventaId = '';
  let ventaNum = '';

  test('Cliente, Venta en Cta. Cte., descuento automático de Stock, Tarea en Depósito y Etiquetas', async () => {
    const cli = await ventas.post('clientes', {
      cuit: '30-11223344-5',
      nombre: 'Ferretería Industrial Norte SRL',
      condicion: 'Responsable Inscripto',
      direccion: 'Av. Libertad 450',
      localidad: 'Resistencia',
      provincia: 'Chaco',
      transporte: 'Vía Cargo',
      descuentoHabitual: 10,
      limiteCredito: 500000,
    });
    assert.strictEqual(cli.status, 200);
    shareToken = cli.json.clientes['30112233445'].shareToken;
    assert.ok(/^[a-f0-9]{32}$/.test(shareToken));

    const vta = await ventas.post('venta_crear', {
      clienteClave: '30112233445',
      clienteNombre: 'Ferretería Industrial Norte SRL',
      clienteCuit: '30-11223344-5',
      transporte: 'Vía Cargo',
      condicionVenta: 'ctacte',
      descuentoPct: 10,
      ivaPct: 21,
      bultos: 3,
      crearTareaDeposito: true,
      items: [{ variantId: sku0, nombre: 'Producto Test', medida: 'M8', presentacion: 'Caja x 100', qty: 5, precio: 1000 }],
    });
    assert.strictEqual(vta.status, 200);
    ventaId = vta.json.venta.id;
    ventaNum = vta.json.venta.numero;
    assert.strictEqual(vta.json.venta.total, 5445); // 5000 - 10% = 4500 + 21% = 5445

    // Stock descontado 50 -> 45
    const stk = await deposito.pedir('stock');
    assert.strictEqual(stk.json.stock[sku0].actual, 45);

    // Tarea automática creada para depósito
    const tsk = await deposito.pedir('tareas');
    assert.ok(tsk.json.tareas.some((t) => t.ventaId === ventaId && t.asignadoRol === 'deposito'));

    // Depósito actualiza bultos y marca empaquetado
    const upd = await deposito.post('venta_actualizar', { id: ventaId, estadoLogistico: 'empaquetado', bultos: 4, fragil: true });
    assert.strictEqual(upd.status, 200);
    assert.strictEqual(upd.json.venta.bultos, 4);
    assert.strictEqual(upd.json.venta.estadoLogistico, 'empaquetado');
  });

  test('Facturación, Cobro parcial/total en Cta. Cte. con Recibo X e impacto en Finanzas y Cheques', async () => {
    const fac = await ventas.post('comprobante_crear', {
      tipo: 'factura_a',
      numero: '0001-00000123',
      cae: '74451234567890',
      vtoCae: '2026-12-01',
      ventaId,
      ventaNumero: ventaNum,
      clienteClave: '30112233445',
      clienteNombre: 'Ferretería Industrial Norte SRL',
      clienteCuit: '30-11223344-5',
      neto: 4500,
      ivaPct: 21,
      ivaMonto: 945,
      total: 5445,
    });
    assert.strictEqual(fac.status, 200);

    // Cobro mixto: $2000 efectivo + $3445 cheque
    const cob = await ventas.post('ctacte_cobro', {
      clave: '30112233445',
      mediosPago: [
        { medio: 'efectivo', monto: 2000, referencia: 'Caja mostrador' },
        { medio: 'cheques', monto: 3445, banco: 'Galicia', numeroCheque: '998877', fechaCobroCheque: '2026-12-15' },
      ],
    });
    assert.strictEqual(cob.status, 200);
    assert.strictEqual(cob.json.resumen.saldo, 0);

    // Finanzas refleja $2000 efectivo y $3445 en cheques
    const fin = await admin.pedir('finanzas');
    assert.strictEqual(fin.status, 200);
    assert.strictEqual(fin.json.saldos.efectivo, 2000);
    assert.strictEqual(fin.json.saldos.cheques, 3445);
    assert.strictEqual(fin.json.cheques.length, 1);

    // Acreditar cheque pasa saldo de cheques a banco
    const chId = fin.json.cheques[0].id;
    const ach = await admin.post('finanzas_cheque_estado', { id: chId, estado: 'acreditado' });
    assert.strictEqual(ach.status, 200);
    const fin2 = await admin.pedir('finanzas');
    assert.strictEqual(fin2.json.saldos.cheques, 0);
    assert.strictEqual(fin2.json.saldos.banco, 3445);
  });

  test('Portal público de Estado de Cuenta valida token seguro y protege privacidad', async () => {
    const bad = await anon.pedir('estado_cuenta_publico', { query: '&t=00000000000000000000000000000000' });
    assert.strictEqual(bad.status, 404);

    const ok = await anon.pedir('estado_cuenta_publico', { query: '&t=' + shareToken });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.json.cliente.nombre, 'Ferretería Industrial Norte SRL');
    assert.strictEqual(ok.json.resumen.saldoActual, 0);
    assert.strictEqual(ok.json.empresa.aliasCbu, 'DISTRIJAM.SA');
    assert.ok(ok.json.comprobantes.some((c) => c.numero === '0001-00000123'));
  });

  let passed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('OK   ', t.name);
      passed++;
    } catch (e) {
      console.error('FALLA', t.name, '\n ->', e.stack || e.message);
    }
  }
  console.log(`\nERP: ${passed} de ${tests.length} pruebas OK`);
  process.exit(passed === tests.length ? 0 : 1);
})();
