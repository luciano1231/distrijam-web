<?php
/**
 * DISTRIJAM — Módulo ERP de la API (Stock, Ventas, Facturación,
 * Cuentas Corrientes, Etiquetas, Tareas, Finanzas, Usuarios y Portal Cliente).
 *
 * Incluido desde api.php. Nunca debe ejecutarse directamente.
 */

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(403);
    exit;
}

const MAX_ARCHIVO_COMPROBANTE = 5242880; // 5 MB para PDF o imagen de factura

/* ─────────────── Utilidades JSON & Bloqueos ─────────────── */

function erpAsegurarDir() {
    $dir = carpeta();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        salir(500, ['error' => 'No se pudo preparar el almacenamiento.']);
    }
    return $dir;
}

function erpBloquear($nombre) {
    $dir = erpAsegurarDir();
    $fp = @fopen($dir . '/' . $nombre . '.lock', 'c');
    if ($fp === false || !flock($fp, LOCK_EX)) {
        salir(500, ['error' => 'No se pudo bloquear el recurso.']);
    }
    return $fp;
}

function erpLeerJson($archivo, $defecto = []) {
    $ruta = carpeta() . '/' . $archivo;
    if (!is_file($ruta)) {
        return $defecto;
    }
    $datos = json_decode((string) @file_get_contents($ruta), true);
    return is_array($datos) ? $datos : $defecto;
}

function erpGuardarJson($archivo, $datos) {
    $dir = erpAsegurarDir();
    $ruta = $dir . '/' . $archivo;
    $tmp = $ruta . '.tmp.' . bin2hex(random_bytes(4));
    $json = json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false || @file_put_contents($tmp, $json) === false || !@rename($tmp, $ruta)) {
        @unlink($tmp);
        salir(500, ['error' => 'No se pudo guardar ' . $archivo . '.']);
    }
    @chmod($ruta, 0640);
}

function erpCuerpoJson() {
    $cuerpo = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($cuerpo)) {
        salir(400, ['error' => 'Formato JSON inválido.']);
    }
    return $cuerpo;
}

function erpId($prefijo = 'id') {
    return $prefijo . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(4));
}

function erpNum($v, $min = null, $max = null) {
    $n = is_numeric($v) ? (float) $v : 0.0;
    if ($min !== null && $n < $min) $n = (float) $min;
    if ($max !== null && $n > $max) $n = (float) $max;
    return round($n, 2);
}

/* ─────────────── Sesiones y Roles ─────────────── */

function erpUsuarioActual() {
    return [
        'usuario' => isset($_SESSION['distrijam_usuario']) ? (string) $_SESSION['distrijam_usuario'] : 'admin',
        'nombre' => isset($_SESSION['distrijam_nombre']) ? (string) $_SESSION['distrijam_nombre'] : 'Administrador',
        'rol' => isset($_SESSION['distrijam_rol']) ? (string) $_SESSION['distrijam_rol'] : 'admin',
    ];
}

function erpRolActual() {
    $u = erpUsuarioActual();
    return $u['rol'];
}

function erpExigirRol($roles) {
    exigirSesion();
    $rol = erpRolActual();
    if (!in_array($rol, $roles, true)) {
        salir(403, ['error' => 'Tu rol (' . $rol . ') no tiene permisos para esta operación.']);
    }
}

/* ─────────────── Configuración ERP ─────────────── */

function erpConfigDefecto() {
    return [
        'empresa' => 'DISTRIJAM S.A.',
        'subtitulo' => 'DISTRIBUIDORA MAYORISTA',
        'direccion' => 'IBERA 1740',
        'localidad' => 'Corrientes',
        'provincia' => 'Corrientes',
        'telefono' => '3794 007195',
        'whatsapp' => '5493794007195',
        'email' => 'autoperforantes@distrijam.com.ar',
        'cuit' => '30-71566968-0',
        'dgr' => '30-71566968-0',
        'inicioActividades' => '01/08/2017',
        'condicionIva' => 'IVA Responsable Inscripto',
        'puntoVenta' => '0001',
        'ivaPct' => 21,
        'diasValidez' => 7,
        'banco' => '',
        'titularCuenta' => 'DISTRIJAM S.A.',
        'cbu' => '',
        'aliasCbu' => '',
        'mostrarDisponibilidadCatalogo' => false,
    ];
}

function erpLeerConfig() {
    $guardada = erpLeerJson('config_erp.json', []);
    return array_merge(erpConfigDefecto(), $guardada);
}

/* ─────────────── Numeradores correlativos ─────────────── */

function erpSiguienteNumero($clave, $largo = 8) {
    $lock = erpBloquear('numeradores');
    $nums = erpLeerJson('numeradores.json', []);
    $sig = ((int) ($nums[$clave] ?? 0)) + 1;
    $nums[$clave] = $sig;
    erpGuardarJson('numeradores.json', $nums);
    flock($lock, LOCK_UN);
    fclose($lock);
    return str_pad((string) $sig, $largo, '0', STR_PAD_LEFT);
}

/* ─────────────── Disponibilidad pública segura ─────────────── */

function erpDisponibilidadPublica() {
    $cfg = erpLeerConfig();
    if (empty($cfg['mostrarDisponibilidadCatalogo'])) {
        return ['mostrarDisponibilidad' => false];
    }
    $stock = erpLeerJson('stock.json', []);
    $mapa = [];
    foreach ($stock as $vid => $row) {
        $actual = (float) ($row['actual'] ?? 0);
        $res = (float) ($row['reservado'] ?? 0);
        $mapa[$vid] = ($actual - $res) > 0 ? 'disponible' : 'consultar';
    }
    return [
        'mostrarDisponibilidad' => true,
        'disponibilidad' => (object) $mapa,
    ];
}

/* ─────────────── Stock: lógica compartida ─────────────── */

function erpAplicarMovimientoStock(&$stock, &$movs, $vid, $tipo, $cantidad, $referencia = '', $usuario = 'admin', $extra = []) {
    $vid = trim((string) $vid);
    if ($vid === '') return null;
    if (!isset($stock[$vid]) || !is_array($stock[$vid])) {
        $stock[$vid] = [
            'actual' => 0,
            'reservado' => 0,
            'minimo' => 0,
            'ubicacion' => '',
            'costo' => 0,
            'actualizado' => date('c'),
        ];
    }

    $anterior = (float) ($stock[$vid]['actual'] ?? 0);
    $cant = (float) $cantidad;
    $nuevo = $anterior;

    if ($tipo === 'ingreso' || $tipo === 'devolucion' || $tipo === 'anulacion_venta') {
        $nuevo = $anterior + abs($cant);
    } elseif ($tipo === 'egreso_venta' || $tipo === 'merma' || $tipo === 'egreso') {
        $nuevo = $anterior - abs($cant);
    } elseif ($tipo === 'ajuste_absoluto') {
        $nuevo = $cant;
    }

    if (array_key_exists('minimo', $extra)) {
        $stock[$vid]['minimo'] = max(0, (float) $extra['minimo']);
    }
    if (array_key_exists('ubicacion', $extra)) {
        $stock[$vid]['ubicacion'] = mb_substr(trim((string) $extra['ubicacion']), 0, 80);
    }
    if (array_key_exists('costo', $extra)) {
        $stock[$vid]['costo'] = max(0, round((float) $extra['costo'], 2));
    }

    $stock[$vid]['actual'] = round($nuevo, 2);
    $stock[$vid]['actualizado'] = date('c');

    if ($tipo !== 'config') {
        $mov = [
            'id' => erpId('mov'),
            'fecha' => date('c'),
            'variantId' => $vid,
            'tipo' => $tipo,
            'cantidad' => round($cant, 2),
            'stockAnterior' => round($anterior, 2),
            'stockResultante' => round($nuevo, 2),
            'referencia' => mb_substr(trim((string) $referencia), 0, 160),
            'usuario' => $usuario,
        ];
        array_unshift($movs, $mov);
        if (count($movs) > 1000) {
            $movs = array_slice($movs, 0, 1000);
        }
        return $mov;
    }
    return null;
}

/* ─────────────── Cuenta Corriente & Finanzas: lógica compartida ─────────────── */

function erpRegistrarMovimientoCtaCte(&$ctacte, $clave, $tipo, $monto, $comprobanteId, $comprobanteLabel, $concepto, $usuario, $extra = []) {
    if ($clave === '') return null;
    if (!isset($ctacte['movimientos']) || !is_array($ctacte['movimientos'])) {
        $ctacte['movimientos'] = [];
    }
    $m = round((float) $monto, 2);
    if ($m <= 0) return null;

    $mov = [
        'id' => erpId('cc'),
        'fecha' => $extra['fecha'] ?? date('c'),
        'clave' => $clave,
        'tipo' => $tipo, // 'debe' | 'haber'
        'monto' => $m,
        'saldoPendiente' => $tipo === 'debe' ? $m : 0.0,
        'estadoPago' => $tipo === 'debe' ? 'pendiente' : 'aplicado',
        'comprobanteId' => $comprobanteId,
        'comprobanteLabel' => $comprobanteLabel,
        'concepto' => mb_substr(trim((string) $concepto), 0, 200),
        'imputaciones' => $extra['imputaciones'] ?? [],
        'usuario' => $usuario,
    ];
    $ctacte['movimientos'][] = $mov;
    return $mov;
}

function erpSaldoCliente($ctacte, $clave) {
    $debe = 0.0;
    $haber = 0.0;
    foreach (($ctacte['movimientos'] ?? []) as $m) {
        if (($m['clave'] ?? '') !== $clave || !empty($m['anulado'])) continue;
        if (($m['tipo'] ?? '') === 'debe') $debe += (float) ($m['monto'] ?? 0);
        elseif (($m['tipo'] ?? '') === 'haber') $haber += (float) ($m['monto'] ?? 0);
    }
    return [
        'debe' => round($debe, 2),
        'haber' => round($haber, 2),
        'saldo' => round($debe - $haber, 2),
    ];
}

function erpRegistrarMovimientoFinanzas(&$fin, $tipo, $cuenta, $categoria, $concepto, $monto, $usuario, $extra = []) {
    if (!isset($fin['movimientos']) || !is_array($fin['movimientos'])) $fin['movimientos'] = [];
    if (!isset($fin['cheques']) || !is_array($fin['cheques'])) $fin['cheques'] = [];

    $m = round((float) $monto, 2);
    if ($m <= 0) return null;

    $mov = [
        'id' => erpId('fin'),
        'fecha' => $extra['fecha'] ?? date('c'),
        'tipo' => $tipo === 'egreso' ? 'egreso' : 'ingreso',
        'cuenta' => in_array($cuenta, ['efectivo', 'banco', 'mercadopago', 'cheques'], true) ? $cuenta : 'efectivo',
        'categoria' => mb_substr((string) $categoria, 0, 60),
        'concepto' => mb_substr(trim((string) $concepto), 0, 200),
        'monto' => $m,
        'clienteClave' => $extra['clienteClave'] ?? '',
        'comprobanteId' => $extra['comprobanteId'] ?? '',
        'usuario' => $usuario,
    ];
    array_unshift($fin['movimientos'], $mov);
    return $mov;
}

/* ─────────────── Portal Público: Estado de Cuenta por Token ─────────────── */

function erpServirEstadoCuentaPublico($token) {
    if (!preg_match('/^[a-f0-9]{32}$/', (string) $token)) {
        salir(404, ['error' => 'Enlace de estado de cuenta inválido o vencido.']);
    }

    $clientes = leerClientes();
    $cliente = null;
    $clave = '';
    foreach ($clientes as $k => $c) {
        if (isset($c['shareToken']) && hash_equals((string) $c['shareToken'], (string) $token)) {
            $cliente = $c;
            $clave = (string) $k;
            break;
        }
    }
    if ($cliente === null) {
        salir(404, ['error' => 'No encontramos una cuenta asociada a este enlace.']);
    }

    $cfg = erpLeerConfig();
    $ctacte = erpLeerJson('ctacte.json', ['movimientos' => []]);
    $comprobantes = erpLeerJson('comprobantes.json', []);
    $ventas = erpLeerJson('ventas.json', []);

    $movs = [];
    $saldoAcum = 0.0;
    $debeTotal = 0.0;
    $haberTotal = 0.0;

    $movsCliente = array_values(array_filter($ctacte['movimientos'] ?? [], function ($m) use ($clave) {
        return ($m['clave'] ?? '') === $clave && empty($m['anulado']);
    }));
    usort($movsCliente, function ($a, $b) {
        return strcmp((string) ($a['fecha'] ?? ''), (string) ($b['fecha'] ?? ''));
    });

    foreach ($movsCliente as $m) {
        $monto = (float) ($m['monto'] ?? 0);
        if (($m['tipo'] ?? '') === 'debe') {
            $debeTotal += $monto;
            $saldoAcum += $monto;
        } else {
            $haberTotal += $monto;
            $saldoAcum -= $monto;
        }
        $movs[] = [
            'id' => $m['id'],
            'fecha' => $m['fecha'],
            'tipo' => $m['tipo'],
            'monto' => round($monto, 2),
            'saldoPendiente' => round((float) ($m['saldoPendiente'] ?? 0), 2),
            'estadoPago' => $m['estadoPago'] ?? '',
            'comprobanteId' => $m['comprobanteId'] ?? '',
            'comprobanteLabel' => $m['comprobanteLabel'] ?? '',
            'concepto' => $m['concepto'] ?? '',
            'saldoAcumulado' => round($saldoAcum, 2),
        ];
    }

    // Comprobantes del cliente (sin datos internos sensibles)
    $compCliente = [];
    foreach ($comprobantes as $comp) {
        if (($comp['clienteClave'] ?? '') !== $clave) continue;
        $cCopy = [
            'id' => $comp['id'],
            'tipo' => $comp['tipo'],
            'numero' => $comp['numero'],
            'fechaEmision' => $comp['fechaEmision'],
            'fechaVto' => $comp['fechaVto'] ?? '',
            'cae' => $comp['cae'] ?? '',
            'vtoCae' => $comp['vtoCae'] ?? '',
            'subtotal' => (float) ($comp['subtotal'] ?? 0),
            'descuentoPct' => (float) ($comp['descuentoPct'] ?? 0),
            'descuentoMonto' => (float) ($comp['descuentoMonto'] ?? 0),
            'neto' => (float) ($comp['neto'] ?? 0),
            'ivaMonto' => (float) ($comp['ivaMonto'] ?? 0),
            'percepcionMonto' => (float) ($comp['percepcionMonto'] ?? 0),
            'total' => (float) ($comp['total'] ?? 0),
            'items' => $comp['items'] ?? [],
            'mediosPago' => $comp['mediosPago'] ?? [],
            'imputaciones' => $comp['imputaciones'] ?? [],
            'ventaNumero' => $comp['ventaNumero'] ?? '',
            'observaciones' => $comp['observaciones'] ?? '',
            'archivoUrl' => !empty($comp['archivo']) ? ('api.php?a=comprobante_pdf&id=' . urlencode($comp['id']) . '&t=' . urlencode($token)) : '',
        ];
        $compCliente[] = $cCopy;
    }

    // También ventas del cliente (por si tienen remito/presupuesto o estado de pago)
    $ventasCliente = [];
    foreach ($ventas as $v) {
        if (($v['clienteClave'] ?? '') !== $clave || ($v['estadoLogistico'] ?? '') === 'anulado') continue;
        $ventasCliente[] = [
            'id' => $v['id'],
            'numero' => $v['numero'],
            'fecha' => $v['fecha'],
            'total' => (float) ($v['total'] ?? 0),
            'estadoPago' => $v['estadoPago'] ?? 'pendiente',
            'estadoLogistico' => $v['estadoLogistico'] ?? '',
            'transporte' => $v['transporte'] ?? '',
            'bultos' => (int) ($v['bultos'] ?? 1),
            'items' => $v['items'] ?? [],
        ];
    }

    salir(200, [
        'ok' => true,
        'empresa' => [
            'nombre' => $cfg['empresa'],
            'subtitulo' => $cfg['subtitulo'],
            'direccion' => $cfg['direccion'],
            'localidad' => $cfg['localidad'],
            'provincia' => $cfg['provincia'],
            'telefono' => $cfg['telefono'],
            'whatsapp' => $cfg['whatsapp'],
            'email' => $cfg['email'],
            'cuit' => $cfg['cuit'],
            'dgr' => $cfg['dgr'],
            'condicionIva' => $cfg['condicionIva'],
            'banco' => $cfg['banco'],
            'titularCuenta' => $cfg['titularCuenta'],
            'cbu' => $cfg['cbu'],
            'aliasCbu' => $cfg['aliasCbu'],
        ],
        'cliente' => [
            'clave' => $clave,
            'nombre' => $cliente['nombre'] ?? '',
            'cuit' => $cliente['cuit'] ?? '',
            'condicion' => $cliente['condicion'] ?? '',
            'direccion' => $cliente['direccion'] ?? '',
            'localidad' => $cliente['localidad'] ?? '',
            'provincia' => $cliente['provincia'] ?? '',
            'codigo' => $cliente['codigo'] ?? '',
        ],
        'resumen' => [
            'debeTotal' => round($debeTotal, 2),
            'haberTotal' => round($haberTotal, 2),
            'saldoActual' => round($debeTotal - $haberTotal, 2),
        ],
        'movimientos' => $movs,
        'comprobantes' => $compCliente,
        'ventas' => $ventasCliente,
    ]);
}

/* ─────────────── Router de acciones ERP ─────────────── */

function erpDespachar($accion, $metodo) {
$uActual = erpUsuarioActual();
$nombreUsuario = $uActual['usuario'];

/* ── Usuarios (solo admin) ── */
if ($accion === 'usuarios') {
    erpExigirRol(['admin']);

    if ($metodo === 'GET') {
        $lista = erpLeerJson('usuarios.json', []);
        $limpia = array_map(function ($u) {
            unset($u['hash']);
            return $u;
        }, $lista);
        salir(200, ['ok' => true, 'usuarios' => array_values($limpia)]);
    }

    if ($metodo === 'POST') {
        $cuerpo = erpCuerpoJson();
        $op = $cuerpo['op'] ?? 'guardar';
        $lock = erpBloquear('usuarios');
        $lista = erpLeerJson('usuarios.json', []);

        if ($op === 'borrar') {
            $id = (string) ($cuerpo['id'] ?? '');
            $lista = array_values(array_filter($lista, fn($u) => ($u['id'] ?? '') !== $id));
            erpGuardarJson('usuarios.json', $lista);
            flock($lock, LOCK_UN); fclose($lock);
            salir(200, ['ok' => true]);
        }

        $username = mb_strtolower(preg_replace('/[^a-zA-Z0-9._-]/', '', (string) ($cuerpo['usuario'] ?? '')));
        $nombre = mb_substr(trim((string) ($cuerpo['nombre'] ?? '')), 0, 80);
        $rol = (string) ($cuerpo['rol'] ?? 'ventas');
        if (!in_array($rol, ['admin', 'ventas', 'deposito'], true)) {
            flock($lock, LOCK_UN); fclose($lock);
            salir(400, ['error' => 'Rol inválido.']);
        }
        if ($username === '' || $username === 'admin' || $nombre === '') {
            flock($lock, LOCK_UN); fclose($lock);
            salir(400, ['error' => 'Completá usuario y nombre (el usuario "admin" está reservado).']);
        }

        $id = (string) ($cuerpo['id'] ?? '');
        $clave = (string) ($cuerpo['clave'] ?? '');
        $idx = -1;
        foreach ($lista as $i => $u) {
            if (($u['id'] ?? '') === $id && $id !== '') $idx = $i;
            elseif (mb_strtolower($u['usuario'] ?? '') === $username && $i !== $idx) {
                flock($lock, LOCK_UN); fclose($lock);
                salir(409, ['error' => 'Ya existe un usuario con ese identificador.']);
            }
        }

        if ($idx < 0 && mb_strlen($clave) < 6) {
            flock($lock, LOCK_UN); fclose($lock);
            salir(400, ['error' => 'La contraseña debe tener al menos 6 caracteres.']);
        }
        if ($clave !== '' && mb_strlen($clave) < 6) {
            flock($lock, LOCK_UN); fclose($lock);
            salir(400, ['error' => 'La nueva contraseña debe tener al menos 6 caracteres.']);
        }

        $registro = [
            'id' => $idx >= 0 ? $lista[$idx]['id'] : erpId('usr'),
            'usuario' => $username,
            'nombre' => $nombre,
            'rol' => $rol,
            'activo' => !isset($cuerpo['activo']) || (bool) $cuerpo['activo'],
            'hash' => $clave !== '' ? password_hash($clave, PASSWORD_DEFAULT) : ($lista[$idx]['hash'] ?? ''),
            'creado' => $idx >= 0 ? ($lista[$idx]['creado'] ?? date('c')) : date('c'),
        ];
        if ($idx >= 0) $lista[$idx] = $registro;
        else $lista[] = $registro;

        erpGuardarJson('usuarios.json', $lista);
        flock($lock, LOCK_UN); fclose($lock);
        unset($registro['hash']);
        salir(200, ['ok' => true, 'usuario' => $registro]);
    }
}

/* ── Configuración ERP ── */
if ($accion === 'config_erp') {
    if ($metodo === 'GET') {
        erpExigirRol(['admin', 'ventas', 'deposito']);
        salir(200, ['ok' => true, 'config' => erpLeerConfig()]);
    }
    if ($metodo === 'POST') {
        erpExigirRol(['admin']);
        $cuerpo = erpCuerpoJson();
        $lock = erpBloquear('config_erp');
        $actual = erpLeerConfig();
        $camposStr = ['empresa', 'subtitulo', 'direccion', 'localidad', 'provincia', 'telefono', 'whatsapp',
                      'email', 'cuit', 'dgr', 'inicioActividades', 'condicionIva', 'puntoVenta',
                      'banco', 'titularCuenta', 'cbu', 'aliasCbu'];
        foreach ($camposStr as $k) {
            if (array_key_exists($k, $cuerpo)) {
                $actual[$k] = mb_substr(trim((string) $cuerpo[$k]), 0, 140);
            }
        }
        if (array_key_exists('ivaPct', $cuerpo)) $actual['ivaPct'] = erpNum($cuerpo['ivaPct'], 0, 50);
        if (array_key_exists('diasValidez', $cuerpo)) $actual['diasValidez'] = max(1, (int) $cuerpo['diasValidez']);
        if (array_key_exists('mostrarDisponibilidadCatalogo', $cuerpo)) {
            $actual['mostrarDisponibilidadCatalogo'] = (bool) $cuerpo['mostrarDisponibilidadCatalogo'];
        }
        erpGuardarJson('config_erp.json', $actual);
        flock($lock, LOCK_UN); fclose($lock);
        salir(200, ['ok' => true, 'config' => $actual]);
    }
}

/* ── Pedidos: guardar cambios y borrar ── */
if ($accion === 'pedido_guardar' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas']);
    $cuerpo = erpCuerpoJson();
    $ref = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($cuerpo['ref'] ?? ''));
    if ($ref === '') salir(400, ['error' => 'Referencia de pedido inválida.']);

    $lock = erpBloquear('pedidos_estado');
    $estados = erpLeerJson('pedidos_estado.json', []);
    $estados[$ref] = [
        'ref' => $ref,
        'fecha' => isset($cuerpo['fecha']) ? (int) $cuerpo['fecha'] : (int) round(microtime(true) * 1000),
        'cliente' => is_array($cuerpo['cliente'] ?? null) ? $cuerpo['cliente'] : [],
        'estado' => mb_substr((string) ($cuerpo['estado'] ?? 'pendiente'), 0, 30),
        'historial' => is_array($cuerpo['historial'] ?? null) ? $cuerpo['historial'] : [],
        'descuento' => erpNum($cuerpo['descuento'] ?? 0, 0, 100),
        'items' => is_array($cuerpo['items'] ?? null) ? $cuerpo['items'] : [],
        'ventaId' => (string) ($cuerpo['ventaId'] ?? ''),
        'actualizado' => date('c'),
    ];
    erpGuardarJson('pedidos_estado.json', $estados);
    flock($lock, LOCK_UN); fclose($lock);
    salir(200, ['ok' => true, 'pedido' => $estados[$ref]]);
}

if ($accion === 'pedido_borrar' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas']);
    $cuerpo = erpCuerpoJson();
    $ref = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($cuerpo['ref'] ?? ''));
    if ($ref === '') salir(400, ['error' => 'Referencia inválida.']);

    $lock = erpBloquear('pedidos_estado');
    $estados = erpLeerJson('pedidos_estado.json', []);
    unset($estados[$ref]);
    erpGuardarJson('pedidos_estado.json', $estados);
    $archivoPedido = carpeta() . '/pedido_' . $ref . '.json';
    if (is_file($archivoPedido)) {
        @unlink($archivoPedido);
    }
    flock($lock, LOCK_UN); fclose($lock);
    salir(200, ['ok' => true]);
}

/* ── Clientes: token público y baja ── */
if ($accion === 'cliente_regenerar_token' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas']);
    $cuerpo = erpCuerpoJson();
    $clave = claveCuit($cuerpo['clave'] ?? ($cuerpo['cuit'] ?? ''));
    if ($clave === '') salir(400, ['error' => 'CUIT inválido.']);

    $lock = erpBloquear('clientes');
    $clientes = leerClientes();
    if (!isset($clientes[$clave])) {
        flock($lock, LOCK_UN); fclose($lock);
        salir(404, ['error' => 'Cliente no encontrado.']);
    }
    $clientes[$clave]['shareToken'] = bin2hex(random_bytes(16));
    guardarClientes($clientes);
    flock($lock, LOCK_UN); fclose($lock);
    salir(200, ['ok' => true, 'shareToken' => $clientes[$clave]['shareToken']]);
}

if ($accion === 'cliente_borrar' && $metodo === 'POST') {
    erpExigirRol(['admin']);
    $cuerpo = erpCuerpoJson();
    $clave = claveCuit($cuerpo['clave'] ?? ($cuerpo['cuit'] ?? ''));
    if ($clave === '') salir(400, ['error' => 'CUIT inválido.']);

    $lock = erpBloquear('clientes');
    $clientes = leerClientes();
    if (!isset($clientes[$clave])) {
        flock($lock, LOCK_UN); fclose($lock);
        salir(404, ['error' => 'Cliente no encontrado.']);
    }
    unset($clientes[$clave]);
    guardarClientes($clientes);
    flock($lock, LOCK_UN); fclose($lock);
    salir(200, ['ok' => true]);
}

/* ── Stock e Inventario ── */
if ($accion === 'stock' && $metodo === 'GET') {
    erpExigirRol(['admin', 'ventas', 'deposito']);
    $stock = erpLeerJson('stock.json', []);
    $movs = erpLeerJson('stock_movimientos.json', []);
    salir(200, [
        'ok' => true,
        'stock' => (object) $stock,
        'movimientos' => array_slice($movs, 0, 300),
    ]);
}

if ($accion === 'stock_movimiento' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas', 'deposito']);
    $cuerpo = erpCuerpoJson();
    $entrantes = isset($cuerpo['items']) && is_array($cuerpo['items']) ? $cuerpo['items'] : [$cuerpo];

    $lock = erpBloquear('stock');
    $stock = erpLeerJson('stock.json', []);
    $movs = erpLeerJson('stock_movimientos.json', []);
    $procesados = 0;

    foreach ($entrantes as $item) {
        if (!is_array($item)) continue;
        $vid = trim((string) ($item['variantId'] ?? ''));
        $tipo = (string) ($item['tipo'] ?? 'ingreso');
        if (!in_array($tipo, ['ingreso', 'egreso', 'ajuste_absoluto', 'merma', 'devolucion', 'config'], true)) {
            continue;
        }
        $extra = [];
        if (array_key_exists('minimo', $item)) $extra['minimo'] = $item['minimo'];
        if (array_key_exists('ubicacion', $item)) $extra['ubicacion'] = $item['ubicacion'];
        if (array_key_exists('costo', $item) && erpRolActual() === 'admin') {
            $extra['costo'] = $item['costo'];
        }
        erpAplicarMovimientoStock(
            $stock, $movs, $vid, $tipo,
            (float) ($item['cantidad'] ?? 0),
            (string) ($item['referencia'] ?? 'Ajuste manual'),
            $nombreUsuario,
            $extra
        );
        $procesados++;
    }

    if ($procesados === 0) {
        flock($lock, LOCK_UN); fclose($lock);
        salir(400, ['error' => 'No se indicaron ítems válidos de stock.']);
    }

    erpGuardarJson('stock.json', $stock);
    erpGuardarJson('stock_movimientos.json', $movs);
    flock($lock, LOCK_UN); fclose($lock);

    salir(200, [
        'ok' => true,
        'procesados' => $procesados,
        'stock' => (object) $stock,
        'movimientos' => array_slice($movs, 0, 100),
    ]);
}

/* ── Ventas ── */
if ($accion === 'ventas' && $metodo === 'GET') {
    erpExigirRol(['admin', 'ventas', 'deposito']);
    $ventas = erpLeerJson('ventas.json', []);
    salir(200, ['ok' => true, 'ventas' => array_values($ventas)]);
}

if ($accion === 'venta_crear' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas']);
    $cuerpo = erpCuerpoJson();
    $itemsRaw = isset($cuerpo['items']) && is_array($cuerpo['items']) ? $cuerpo['items'] : [];
    if (count($itemsRaw) === 0) {
        salir(400, ['error' => 'La venta debe tener al menos un producto.']);
    }

    $cfg = erpLeerConfig();
    $ivaPct = array_key_exists('ivaPct', $cuerpo) ? erpNum($cuerpo['ivaPct'], 0, 50) : (float) $cfg['ivaPct'];
    $descPct = erpNum($cuerpo['descuentoPct'] ?? 0, 0, 100);
    $percepcionMonto = erpNum($cuerpo['percepcionMonto'] ?? 0, 0);

    $items = [];
    $subtotal = 0.0;
    foreach ($itemsRaw as $it) {
        if (!is_array($it)) continue;
        $qty = max(1, (float) ($it['qty'] ?? 1));
        $precio = max(0, round((float) ($it['precio'] ?? 0), 2));
        $linea = round($qty * $precio, 2);
        $subtotal += $linea;
        $items[] = [
            'variantId' => mb_substr((string) ($it['variantId'] ?? ''), 0, 60),
            'nombre' => mb_substr((string) ($it['nombre'] ?? ''), 0, 140),
            'medida' => mb_substr((string) ($it['medida'] ?? ''), 0, 80),
            'presentacion' => mb_substr((string) ($it['presentacion'] ?? ''), 0, 80),
            'qty' => $qty,
            'precio' => $precio,
            'subtotal' => $linea,
        ];
    }

    $subtotal = round($subtotal, 2);
    $descMonto = round($subtotal * ($descPct / 100), 2);
    $neto = round($subtotal - $descMonto, 2);
    $ivaMonto = round($neto * ($ivaPct / 100), 2);
    $total = round($neto + $ivaMonto + $percepcionMonto, 2);

    $cliCuit = trim((string) ($cuerpo['clienteCuit'] ?? ''));
    $cliClave = claveCuit($cuerpo['clienteClave'] ?? $cliCuit);
    $cliNombre = mb_substr(trim((string) ($cuerpo['clienteNombre'] ?? 'Consumidor Final')), 0, 160);
    $condicionVenta = in_array($cuerpo['condicionVenta'] ?? 'ctacte', ['ctacte', 'contado'], true)
        ? $cuerpo['condicionVenta'] : 'ctacte';

    if ($condicionVenta === 'ctacte' && $cliClave === '') {
        salir(400, ['error' => 'Para vender en Cuenta Corriente hace falta el CUIT/CUIL del cliente.']);
    }

    $numVenta = 'VTA-' . erpSiguienteNumero('venta', 8);
    $ventaId = erpId('vta');
    $bultos = max(1, (int) ($cuerpo['bultos'] ?? 1));

    $venta = [
        'id' => $ventaId,
        'numero' => $numVenta,
        'fecha' => date('c'),
        'pedidoRef' => mb_substr((string) ($cuerpo['pedidoRef'] ?? ''), 0, 30),
        'clienteClave' => $cliClave,
        'clienteNombre' => $cliNombre,
        'clienteCuit' => $cliCuit,
        'clienteTelefono' => mb_substr(trim((string) ($cuerpo['clienteTelefono'] ?? '')), 0, 60),
        'vendedor' => mb_substr(trim((string) ($cuerpo['vendedor'] ?? $uActual['nombre'])), 0, 80),
        'condicionVenta' => $condicionVenta,
        'estadoPago' => $condicionVenta === 'contado' ? 'pagado' : 'pendiente',
        'estadoLogistico' => 'pendiente_armado',
        'transporte' => mb_substr(trim((string) ($cuerpo['transporte'] ?? '')), 0, 120),
        'direccionEntrega' => mb_substr(trim((string) ($cuerpo['direccionEntrega'] ?? '')), 0, 200),
        'localidadEntrega' => mb_substr(trim((string) ($cuerpo['localidadEntrega'] ?? '')), 0, 100),
        'provinciaEntrega' => mb_substr(trim((string) ($cuerpo['provinciaEntrega'] ?? '')), 0, 80),
        'bultos' => $bultos,
        'pesoKg' => erpNum($cuerpo['pesoKg'] ?? 0, 0),
        'fragil' => !empty($cuerpo['fragil']),
        'notasDespacho' => mb_substr(trim((string) ($cuerpo['notasDespacho'] ?? '')), 0, 300),
        'detalleBultos' => is_array($cuerpo['detalleBultos'] ?? null) ? $cuerpo['detalleBultos'] : [],
        'items' => $items,
        'subtotal' => $subtotal,
        'descuentoPct' => $descPct,
        'descuentoMonto' => $descMonto,
        'neto' => $neto,
        'ivaPct' => $ivaPct,
        'ivaMonto' => $ivaMonto,
        'percepcionMonto' => $percepcionMonto,
        'total' => $total,
        'comprobantesIds' => [],
        'creadoPor' => $nombreUsuario,
    ];

    // 1. Descontar Stock
    if (empty($cuerpo['noDescontarStock'])) {
        $lockStk = erpBloquear('stock');
        $stock = erpLeerJson('stock.json', []);
        $movs = erpLeerJson('stock_movimientos.json', []);
        foreach ($items as $it) {
            if ($it['variantId'] !== '') {
                erpAplicarMovimientoStock($stock, $movs, $it['variantId'], 'egreso_venta', $it['qty'], $numVenta . ' · ' . $cliNombre, $nombreUsuario);
            }
        }
        erpGuardarJson('stock.json', $stock);
        erpGuardarJson('stock_movimientos.json', $movs);
        flock($lockStk, LOCK_UN); fclose($lockStk);
    }

    // 2. Cuenta Corriente o Contado en Finanzas + Recibo
    if ($condicionVenta === 'ctacte' && $total > 0) {
        $lockCc = erpBloquear('ctacte');
        $ctacte = erpLeerJson('ctacte.json', ['movimientos' => []]);
        erpRegistrarMovimientoCtaCte(
            $ctacte, $cliClave, 'debe', $total,
            $ventaId, $numVenta, 'Venta ' . $numVenta, $nombreUsuario
        );
        erpGuardarJson('ctacte.json', $ctacte);
        flock($lockCc, LOCK_UN); fclose($lockCc);
    } elseif ($condicionVenta === 'contado' && $total > 0) {
        $cuenta = (string) ($cuerpo['cuentaCobro'] ?? 'efectivo');
        $numRec = 'REC-' . $cfg['puntoVenta'] . '-' . erpSiguienteNumero('recibo', 8);
        $recId = erpId('comp');

        $lockComp = erpBloquear('comprobantes');
        $comps = erpLeerJson('comprobantes.json', []);
        array_unshift($comps, [
            'id' => $recId,
            'tipo' => 'recibo_x',
            'puntoVenta' => $cfg['puntoVenta'],
            'numero' => $numRec,
            'fechaEmision' => date('Y-m-d'),
            'creado' => date('c'),
            'clienteClave' => $cliClave,
            'clienteNombre' => $cliNombre,
            'clienteCuit' => $cliCuit,
            'ventaId' => $ventaId,
            'ventaNumero' => $numVenta,
            'total' => $total,
            'mediosPago' => [['medio' => $cuenta, 'monto' => $total, 'referencia' => 'Pago contado ' . $numVenta]],
            'imputaciones' => [['comprobanteLabel' => $numVenta, 'monto' => $total]],
            'observaciones' => 'Cobro contado al confirmar venta ' . $numVenta,
            'creadoPor' => $nombreUsuario,
        ]);
        erpGuardarJson('comprobantes.json', $comps);
        flock($lockComp, LOCK_UN); fclose($lockComp);
        $venta['comprobantesIds'][] = $recId;

        $lockFin = erpBloquear('finanzas');
        $fin = erpLeerJson('finanzas.json', ['movimientos' => [], 'cheques' => []]);
        erpRegistrarMovimientoFinanzas(
            $fin, 'ingreso', $cuenta, 'venta_cobro',
            'Cobro contado ' . $numRec . ' (' . $numVenta . ' · ' . $cliNombre . ')',
            $total, $nombreUsuario,
            ['clienteClave' => $cliClave, 'comprobanteId' => $recId]
        );
        erpGuardarJson('finanzas.json', $fin);
        flock($lockFin, LOCK_UN); fclose($lockFin);
    }

    // 3. Guardar Venta
    $lockVta = erpBloquear('ventas');
    $ventas = erpLeerJson('ventas.json', []);
    array_unshift($ventas, $venta);
    erpGuardarJson('ventas.json', $ventas);
    flock($lockVta, LOCK_UN); fclose($lockVta);

    // 4. Vincular Pedido Web si proviene de cotizador
    if ($venta['pedidoRef'] !== '') {
        $lockPed = erpBloquear('pedidos_estado');
        $estados = erpLeerJson('pedidos_estado.json', []);
        $ref = $venta['pedidoRef'];
        if (!isset($estados[$ref])) {
            $estados[$ref] = ['ref' => $ref, 'historial' => []];
        }
        $estados[$ref]['estado'] = 'enviado';
        $estados[$ref]['ventaId'] = $ventaId;
        $estados[$ref]['ventaNumero'] = $numVenta;
        $estados[$ref]['actualizado'] = date('c');
        erpGuardarJson('pedidos_estado.json', $estados);
        flock($lockPed, LOCK_UN); fclose($lockPed);
    }

    // 5. Crear Tarea automática para Depósito
    if (!isset($cuerpo['crearTareaDeposito']) || !empty($cuerpo['crearTareaDeposito'])) {
        $lockTar = erpBloquear('tareas');
        $tareas = erpLeerJson('tareas.json', []);
        array_unshift($tareas, [
            'id' => erpId('tsk'),
            'titulo' => 'Armar y etiquetar ' . $numVenta . ' · ' . $cliNombre,
            'descripcion' => 'Preparar ' . count($items) . ' ítem(s) (' . $bultos . ' bulto/s)' . ($venta['transporte'] ? ' · Expreso: ' . $venta['transporte'] : ''),
            'categoria' => 'deposito',
            'prioridad' => 'alta',
            'estado' => 'pendiente',
            'asignadoRol' => 'deposito',
            'asignadoUsuario' => '',
            'fechaLimite' => date('Y-m-d'),
            'clienteClave' => $cliClave,
            'ventaId' => $ventaId,
            'ventaNumero' => $numVenta,
            'checklist' => [
                ['texto' => 'Controlar mercadería y cantidades', 'hecho' => false],
                ['texto' => 'Embalar e imprimir etiquetas de cajas', 'hecho' => false],
                ['texto' => 'Despachar / entregar con remito', 'hecho' => false],
            ],
            'creado' => date('c'),
            'actualizado' => date('c'),
            'creadoPor' => $nombreUsuario,
        ]);
        erpGuardarJson('tareas.json', $tareas);
        flock($lockTar, LOCK_UN); fclose($lockTar);
    }

    salir(200, ['ok' => true, 'venta' => $venta]);
}

if ($accion === 'venta_actualizar' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas', 'deposito']);
    $cuerpo = erpCuerpoJson();
    $id = (string) ($cuerpo['id'] ?? '');
    if ($id === '') salir(400, ['error' => 'Falta el ID de la venta.']);

    $lockVta = erpBloquear('ventas');
    $ventas = erpLeerJson('ventas.json', []);
    $idx = -1;
    foreach ($ventas as $i => $v) {
        if (($v['id'] ?? '') === $id) { $idx = $i; break; }
    }
    if ($idx < 0) {
        flock($lockVta, LOCK_UN); fclose($lockVta);
        salir(404, ['error' => 'Venta no encontrada.']);
    }

    $venta = $ventas[$idx];
    $nuevoEstado = $cuerpo['estadoLogistico'] ?? $venta['estadoLogistico'];
    $permitidos = ['pendiente_armado', 'en_preparacion', 'empaquetado', 'despachado', 'entregado', 'anulado'];
    if (!in_array($nuevoEstado, $permitidos, true)) {
        flock($lockVta, LOCK_UN); fclose($lockVta);
        salir(400, ['error' => 'Estado logístico inválido.']);
    }

    if ($nuevoEstado === 'anulado' && ($venta['estadoLogistico'] ?? '') !== 'anulado') {
        if (erpRolActual() !== 'admin') {
            flock($lockVta, LOCK_UN); fclose($lockVta);
            salir(403, ['error' => 'Solo el administrador puede anular una venta.']);
        }
        // Revertir stock
        $lockStk = erpBloquear('stock');
        $stock = erpLeerJson('stock.json', []);
        $movs = erpLeerJson('stock_movimientos.json', []);
        foreach (($venta['items'] ?? []) as $it) {
            if (!empty($it['variantId'])) {
                erpAplicarMovimientoStock($stock, $movs, $it['variantId'], 'anulacion_venta', $it['qty'], 'Anulación ' . $venta['numero'], $nombreUsuario);
            }
        }
        erpGuardarJson('stock.json', $stock);
        erpGuardarJson('stock_movimientos.json', $movs);
        flock($lockStk, LOCK_UN); fclose($lockStk);

        // Anular cargo en ctacte
        $lockCc = erpBloquear('ctacte');
        $ctacte = erpLeerJson('ctacte.json', ['movimientos' => []]);
        foreach ($ctacte['movimientos'] as &$m) {
            if (($m['comprobanteId'] ?? '') === $id) {
                $m['anulado'] = true;
                $m['saldoPendiente'] = 0;
                $m['estadoPago'] = 'anulado';
            }
        }
        unset($m);
        erpGuardarJson('ctacte.json', $ctacte);
        flock($lockCc, LOCK_UN); fclose($lockCc);
        $venta['estadoPago'] = 'anulado';
    }

    $venta['estadoLogistico'] = $nuevoEstado;
    if (array_key_exists('bultos', $cuerpo)) $venta['bultos'] = max(1, (int) $cuerpo['bultos']);
    if (array_key_exists('transporte', $cuerpo)) $venta['transporte'] = mb_substr(trim((string) $cuerpo['transporte']), 0, 120);
    if (array_key_exists('direccionEntrega', $cuerpo)) $venta['direccionEntrega'] = mb_substr(trim((string) $cuerpo['direccionEntrega']), 0, 200);
    if (array_key_exists('localidadEntrega', $cuerpo)) $venta['localidadEntrega'] = mb_substr(trim((string) $cuerpo['localidadEntrega']), 0, 100);
    if (array_key_exists('provinciaEntrega', $cuerpo)) $venta['provinciaEntrega'] = mb_substr(trim((string) $cuerpo['provinciaEntrega']), 0, 80);
    if (array_key_exists('pesoKg', $cuerpo)) $venta['pesoKg'] = erpNum($cuerpo['pesoKg'], 0);
    if (array_key_exists('fragil', $cuerpo)) $venta['fragil'] = (bool) $cuerpo['fragil'];
    if (array_key_exists('notasDespacho', $cuerpo)) $venta['notasDespacho'] = mb_substr(trim((string) $cuerpo['notasDespacho']), 0, 300);
    if (array_key_exists('detalleBultos', $cuerpo) && is_array($cuerpo['detalleBultos'])) $venta['detalleBultos'] = $cuerpo['detalleBultos'];
    $venta['actualizado'] = date('c');

    $ventas[$idx] = $venta;
    erpGuardarJson('ventas.json', $ventas);
    flock($lockVta, LOCK_UN); fclose($lockVta);
    salir(200, ['ok' => true, 'venta' => $venta]);
}

/* ── Facturación y Comprobantes ── */
if ($accion === 'comprobantes' && $metodo === 'GET') {
    erpExigirRol(['admin', 'ventas', 'deposito']);
    $comps = erpLeerJson('comprobantes.json', []);
    if (erpRolActual() === 'deposito') {
        $comps = array_values(array_filter($comps, fn($c) => in_array($c['tipo'] ?? '', ['remito_r', 'presupuesto_x'], true)));
    }
    salir(200, ['ok' => true, 'comprobantes' => array_values($comps)]);
}

if ($accion === 'comprobante_archivo' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas']);
    $dir = carpeta() . '/comprobantes_archivos';
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        salir(500, ['error' => 'No se pudo preparar la carpeta de comprobantes.']);
    }

    if (isset($_FILES['archivo'])) {
        $f = $_FILES['archivo'];
        if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
            salir(400, ['error' => 'No se pudo recibir el archivo.']);
        }
        $bytes = @file_get_contents($f['tmp_name']);
    } else {
        $cuerpo = erpCuerpoJson();
        $data = (string) ($cuerpo['data'] ?? '');
        if (!preg_match('/^data:(application\/pdf|image\/[a-z+]+);base64,(.+)$/s', $data, $m)) {
            salir(400, ['error' => 'Formato de archivo inválido (solo PDF o imagen).']);
        }
        $bytes = base64_decode($m[2], true);
    }

    if ($bytes === false || $bytes === '') salir(400, ['error' => 'Archivo vacío o dañado.']);
    if (strlen($bytes) > MAX_ARCHIVO_COMPROBANTE) salir(413, ['error' => 'El archivo supera los 5 MB.']);

    $ext = '';
    if (strncmp($bytes, '%PDF-', 5) === 0) {
        $ext = 'pdf';
    } else {
        $info = @getimagesizefromstring($bytes);
        $map = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
        if ($info !== false && isset($map[$info[2]])) {
            $ext = $map[$info[2]];
        }
    }
    if ($ext === '') salir(400, ['error' => 'Solo se admiten archivos PDF, JPG, PNG o WEBP.']);

    $nombre = bin2hex(random_bytes(12)) . '.' . $ext;
    if (@file_put_contents($dir . '/' . $nombre, $bytes) === false) {
        salir(500, ['error' => 'No se pudo guardar el archivo.']);
    }
    @chmod($dir . '/' . $nombre, 0640);
    salir(200, ['ok' => true, 'archivo' => $nombre]);
}

if ($accion === 'comprobante_pdf' && $metodo === 'GET') {
    $id = (string) ($_GET['id'] ?? '');
    $token = (string) ($_GET['t'] ?? '');
    $comps = erpLeerJson('comprobantes.json', []);
    $comp = null;
    foreach ($comps as $c) {
        if (($c['id'] ?? '') === $id) { $comp = $c; break; }
    }
    if ($comp === null || empty($comp['archivo'])) {
        salir(404, ['error' => 'Comprobante o archivo adjunto inexistente.']);
    }

    $autorizado = estaLogueado();
    if (!$autorizado && preg_match('/^[a-f0-9]{32}$/', $token)) {
        $clientes = leerClientes();
        $cli = $clientes[$comp['clienteClave'] ?? ''] ?? null;
        if ($cli && isset($cli['shareToken']) && hash_equals((string) $cli['shareToken'], $token)) {
            $autorizado = true;
        }
    }
    if (!$autorizado) {
        salir(401, ['error' => 'No autorizado para descargar este comprobante.']);
    }

    $archivo = (string) $comp['archivo'];
    if (!preg_match('/^[a-f0-9]{24}\.(pdf|jpg|png|webp)$/', $archivo, $m)) {
        salir(404, ['error' => 'Archivo inválido.']);
    }
    $ruta = carpeta() . '/comprobantes_archivos/' . $archivo;
    if (!is_file($ruta)) salir(404, ['error' => 'Archivo no encontrado en el servidor.']);

    $mimes = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
    header('Content-Type: ' . $mimes[$m[1]]);
    header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $comp['numero'] ?: 'comprobante') . '.' . $m[1] . '"');
    header('Cache-Control: private, max-age=3600');
    readfile($ruta);
    exit;
}

if ($accion === 'comprobante_crear' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas']);
    $cuerpo = erpCuerpoJson();
    $tipo = (string) ($cuerpo['tipo'] ?? '');
    $tiposValidos = [
        'presupuesto_x', 'remito_r', 'recibo_x',
        'factura_a', 'factura_b', 'factura_c',
        'nota_credito_a', 'nota_credito_b', 'nota_credito_c',
        'nota_debito_a', 'nota_debito_b', 'nota_debito_c',
    ];
    if (!in_array($tipo, $tiposValidos, true)) {
        salir(400, ['error' => 'Tipo de comprobante inválido.']);
    }

    $cfg = erpLeerConfig();
    $pv = str_pad(preg_replace('/\D/', '', (string) ($cuerpo['puntoVenta'] ?? $cfg['puntoVenta'])), 4, '0', STR_PAD_LEFT);
    $numInput = trim((string) ($cuerpo['numero'] ?? ''));

    if ($numInput === '') {
        $prefMap = [
            'presupuesto_x' => 'PRE', 'remito_r' => 'REM', 'recibo_x' => 'REC',
            'factura_a' => 'FA', 'factura_b' => 'FB', 'factura_c' => 'FC',
            'nota_credito_a' => 'NCA', 'nota_credito_b' => 'NCB', 'nota_credito_c' => 'NCC',
            'nota_debito_a' => 'NDA', 'nota_debito_b' => 'NDB', 'nota_debito_c' => 'NDC',
        ];
        $numero = $prefMap[$tipo] . '-' . $pv . '-' . erpSiguienteNumero('comp_' . $tipo, 8);
    } else {
        $numero = mb_substr($numInput, 0, 40);
    }

    $cliCuit = trim((string) ($cuerpo['clienteCuit'] ?? ''));
    $cliClave = claveCuit($cuerpo['clienteClave'] ?? $cliCuit);
    $cliNombre = mb_substr(trim((string) ($cuerpo['clienteNombre'] ?? '')), 0, 160);
    $ventaId = (string) ($cuerpo['ventaId'] ?? '');
    $ventaNumero = (string) ($cuerpo['ventaNumero'] ?? '');
    $archivo = (string) ($cuerpo['archivo'] ?? '');
    if ($archivo !== '' && !preg_match('/^[a-f0-9]{24}\.(pdf|jpg|png|webp)$/', $archivo)) {
        salir(400, ['error' => 'Referencia de archivo adjunto inválida.']);
    }

    $neto = erpNum($cuerpo['neto'] ?? 0, 0);
    $ivaPct = erpNum($cuerpo['ivaPct'] ?? $cfg['ivaPct'], 0, 50);
    $ivaMonto = array_key_exists('ivaMonto', $cuerpo) ? erpNum($cuerpo['ivaMonto'], 0) : round($neto * ($ivaPct / 100), 2);
    $percep = erpNum($cuerpo['percepcionMonto'] ?? 0, 0);
    $total = array_key_exists('total', $cuerpo) && (float) $cuerpo['total'] > 0
        ? erpNum($cuerpo['total'], 0)
        : round($neto + $ivaMonto + $percep, 2);

    $compId = erpId('comp');
    $comp = [
        'id' => $compId,
        'tipo' => $tipo,
        'puntoVenta' => $pv,
        'numero' => $numero,
        'fechaEmision' => mb_substr((string) ($cuerpo['fechaEmision'] ?? date('Y-m-d')), 0, 20),
        'fechaVto' => mb_substr((string) ($cuerpo['fechaVto'] ?? ''), 0, 20),
        'cae' => mb_substr(preg_replace('/[^0-9]/', '', (string) ($cuerpo['cae'] ?? '')), 0, 20),
        'vtoCae' => mb_substr((string) ($cuerpo['vtoCae'] ?? ''), 0, 20),
        'clienteClave' => $cliClave,
        'clienteNombre' => $cliNombre,
        'clienteCuit' => $cliCuit,
        'clienteCondicion' => mb_substr((string) ($cuerpo['clienteCondicion'] ?? ''), 0, 60),
        'clienteDireccion' => mb_substr((string) ($cuerpo['clienteDireccion'] ?? ''), 0, 200),
        'ventaId' => $ventaId,
        'ventaNumero' => $ventaNumero,
        'items' => is_array($cuerpo['items'] ?? null) ? $cuerpo['items'] : [],
        'subtotal' => erpNum($cuerpo['subtotal'] ?? $neto, 0),
        'descuentoPct' => erpNum($cuerpo['descuentoPct'] ?? 0, 0, 100),
        'descuentoMonto' => erpNum($cuerpo['descuentoMonto'] ?? 0, 0),
        'neto' => $neto,
        'ivaPct' => $ivaPct,
        'ivaMonto' => $ivaMonto,
        'percepcionMonto' => $percep,
        'total' => $total,
        'archivo' => $archivo,
        'observaciones' => mb_substr(trim((string) ($cuerpo['observaciones'] ?? '')), 0, 400),
        'creado' => date('c'),
        'creadoPor' => $nombreUsuario,
    ];

    $lockComp = erpBloquear('comprobantes');
    $comps = erpLeerJson('comprobantes.json', []);
    array_unshift($comps, $comp);
    erpGuardarJson('comprobantes.json', $comps);
    flock($lockComp, LOCK_UN); fclose($lockComp);

    // Vincular con Venta si corresponde
    if ($ventaId !== '') {
        $lockVta = erpBloquear('ventas');
        $ventas = erpLeerJson('ventas.json', []);
        foreach ($ventas as &$v) {
            if (($v['id'] ?? '') === $ventaId) {
                if (!isset($v['comprobantesIds']) || !is_array($v['comprobantesIds'])) $v['comprobantesIds'] = [];
                $v['comprobantesIds'][] = $compId;
                break;
            }
        }
        unset($v);
        erpGuardarJson('ventas.json', $ventas);
        flock($lockVta, LOCK_UN); fclose($lockVta);
    }

    // Impacto en Cuenta Corriente para Facturas libres, Notas de Débito y Notas de Crédito
    $esFactura = strpos($tipo, 'factura_') === 0;
    $esNC = strpos($tipo, 'nota_credito_') === 0;
    $esND = strpos($tipo, 'nota_debito_') === 0;

    if ($cliClave !== '' && $total > 0) {
        $lockCc = erpBloquear('ctacte');
        $ctacte = erpLeerJson('ctacte.json', ['movimientos' => []]);

        if ($esFactura) {
            $yaTieneCargo = false;
            if ($ventaId !== '') {
                foreach ($ctacte['movimientos'] as &$m) {
                    if (($m['comprobanteId'] ?? '') === $ventaId && ($m['tipo'] ?? '') === 'debe' && empty($m['anulado'])) {
                        // Actualizar etiqueta del cargo existente de la venta para mostrar la Factura oficial
                        $m['comprobanteLabel'] = $numero . ' (' . ($m['comprobanteLabel'] ?? '') . ')';
                        $yaTieneCargo = true;
                        break;
                    }
                }
                unset($m);
            }
            if (!$yaTieneCargo && !empty($cuerpo['imputarCtaCte'])) {
                erpRegistrarMovimientoCtaCte($ctacte, $cliClave, 'debe', $total, $compId, $numero, 'Factura ' . $numero, $nombreUsuario);
            }
        } elseif ($esND) {
            erpRegistrarMovimientoCtaCte($ctacte, $cliClave, 'debe', $total, $compId, $numero, 'Nota de Débito ' . $numero, $nombreUsuario);
        } elseif ($esNC) {
            erpRegistrarMovimientoCtaCte($ctacte, $cliClave, 'haber', $total, $compId, $numero, 'Nota de Crédito ' . $numero, $nombreUsuario);
        }

        erpGuardarJson('ctacte.json', $ctacte);
        flock($lockCc, LOCK_UN); fclose($lockCc);
    }

    // Devolución de stock si es Nota de Crédito con devolución
    if ($esNC && !empty($cuerpo['devolverStock']) && count($comp['items']) > 0) {
        $lockStk = erpBloquear('stock');
        $stock = erpLeerJson('stock.json', []);
        $movs = erpLeerJson('stock_movimientos.json', []);
        foreach ($comp['items'] as $it) {
            if (!empty($it['variantId'])) {
                erpAplicarMovimientoStock($stock, $movs, $it['variantId'], 'devolucion', (float) ($it['qty'] ?? 1), 'NC ' . $numero, $nombreUsuario);
            }
        }
        erpGuardarJson('stock.json', $stock);
        erpGuardarJson('stock_movimientos.json', $movs);
        flock($lockStk, LOCK_UN); fclose($lockStk);
    }

    salir(200, ['ok' => true, 'comprobante' => $comp]);
}

/* ── Cuenta Corriente y Recibos ── */
if ($accion === 'ctacte' && $metodo === 'GET') {
    erpExigirRol(['admin', 'ventas']);
    $ctacte = erpLeerJson('ctacte.json', ['movimientos' => []]);
    $saldos = [];
    foreach (($ctacte['movimientos'] ?? []) as $m) {
        if (!empty($m['anulado'])) continue;
        $k = $m['clave'] ?? '';
        if ($k === '') continue;
        if (!isset($saldos[$k])) $saldos[$k] = ['debe' => 0.0, 'haber' => 0.0, 'saldo' => 0.0];
        $monto = (float) ($m['monto'] ?? 0);
        if (($m['tipo'] ?? '') === 'debe') $saldos[$k]['debe'] += $monto;
        else $saldos[$k]['haber'] += $monto;
        $saldos[$k]['saldo'] = round($saldos[$k]['debe'] - $saldos[$k]['haber'], 2);
        $saldos[$k]['debe'] = round($saldos[$k]['debe'], 2);
        $saldos[$k]['haber'] = round($saldos[$k]['haber'], 2);
    }
    salir(200, [
        'ok' => true,
        'movimientos' => array_values($ctacte['movimientos'] ?? []),
        'saldos' => (object) $saldos,
    ]);
}

if ($accion === 'ctacte_ajuste' && $metodo === 'POST') {
    erpExigirRol(['admin']);
    $cuerpo = erpCuerpoJson();
    $clave = claveCuit($cuerpo['clave'] ?? '');
    $tipo = ($cuerpo['tipo'] ?? 'debe') === 'haber' ? 'haber' : 'debe';
    $monto = erpNum($cuerpo['monto'] ?? 0, 0);
    $concepto = trim((string) ($cuerpo['concepto'] ?? 'Saldo inicial / Ajuste'));
    if ($clave === '' || $monto <= 0) {
        salir(400, ['error' => 'Indicá un cliente y un importe válido mayor a cero.']);
    }

    $lockCc = erpBloquear('ctacte');
    $ctacte = erpLeerJson('ctacte.json', ['movimientos' => []]);
    $mov = erpRegistrarMovimientoCtaCte($ctacte, $clave, $tipo, $monto, '', 'AJUSTE', $concepto, $nombreUsuario);
    erpGuardarJson('ctacte.json', $ctacte);
    flock($lockCc, LOCK_UN); fclose($lockCc);
    salir(200, ['ok' => true, 'movimiento' => $mov, 'resumen' => erpSaldoCliente($ctacte, $clave)]);
}

if ($accion === 'ctacte_cobro' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas']);
    $cuerpo = erpCuerpoJson();
    $clave = claveCuit($cuerpo['clave'] ?? '');
    $mediosRaw = isset($cuerpo['mediosPago']) && is_array($cuerpo['mediosPago']) ? $cuerpo['mediosPago'] : [];
    if ($clave === '' || count($mediosRaw) === 0) {
        salir(400, ['error' => 'Indicá el cliente y al menos un medio de pago.']);
    }

    $medios = [];
    $totalCobro = 0.0;
    foreach ($mediosRaw as $mp) {
        if (!is_array($mp)) continue;
        $monto = erpNum($mp['monto'] ?? 0, 0);
        if ($monto <= 0) continue;
        $medio = (string) ($mp['medio'] ?? 'efectivo');
        if (!in_array($medio, ['efectivo', 'banco', 'mercadopago', 'cheques'], true)) $medio = 'efectivo';
        $medios[] = [
            'medio' => $medio,
            'monto' => $monto,
            'referencia' => mb_substr(trim((string) ($mp['referencia'] ?? '')), 0, 120),
            'banco' => mb_substr(trim((string) ($mp['banco'] ?? '')), 0, 80),
            'numeroCheque' => mb_substr(trim((string) ($mp['numeroCheque'] ?? '')), 0, 40),
            'fechaCobroCheque' => mb_substr(trim((string) ($mp['fechaCobroCheque'] ?? '')), 0, 20),
            'libradorCheque' => mb_substr(trim((string) ($mp['libradorCheque'] ?? '')), 0, 120),
        ];
        $totalCobro += $monto;
    }
    $totalCobro = round($totalCobro, 2);
    if ($totalCobro <= 0) {
        salir(400, ['error' => 'El importe total del cobro debe ser mayor a cero.']);
    }

    $cfg = erpLeerConfig();
    $clientes = leerClientes();
    $cli = $clientes[$clave] ?? ['nombre' => ($cuerpo['clienteNombre'] ?? ''), 'cuit' => $clave];
    $numRec = 'REC-' . $cfg['puntoVenta'] . '-' . erpSiguienteNumero('recibo', 8);
    $recId = erpId('comp');

    // Imputar contra movimientos deudores pendientes en ctacte
    $imputacionesIds = isset($cuerpo['imputaciones']) && is_array($cuerpo['imputaciones']) ? $cuerpo['imputaciones'] : [];
    $lockCc = erpBloquear('ctacte');
    $ctacte = erpLeerJson('ctacte.json', ['movimientos' => []]);
    $restante = $totalCobro;
    $imputacionesResumen = [];
    $ventasPagadasIds = [];

    // Ordenar para imputar primero los IDs explícitos, luego FIFO por fecha
    $ordenIndices = [];
    foreach ($ctacte['movimientos'] as $i => $m) {
        if (($m['clave'] ?? '') !== $clave || ($m['tipo'] ?? '') !== 'debe' || !empty($m['anulado']) || (float) ($m['saldoPendiente'] ?? 0) <= 0) {
            continue;
        }
        if (in_array($m['id'], $imputacionesIds, true)) array_unshift($ordenIndices, $i);
        else $ordenIndices[] = $i;
    }

    foreach ($ordenIndices as $i) {
        if ($restante <= 0) break;
        $pend = (float) ($ctacte['movimientos'][$i]['saldoPendiente'] ?? 0);
        $aplicado = min($restante, $pend);
        $nuevoPend = round($pend - $aplicado, 2);
        $ctacte['movimientos'][$i]['saldoPendiente'] = $nuevoPend;
        $ctacte['movimientos'][$i]['estadoPago'] = $nuevoPend <= 0.01 ? 'pagado' : 'parcial';
        if ($nuevoPend <= 0.01) {
            $ctacte['movimientos'][$i]['saldoPendiente'] = 0;
            if (!empty($ctacte['movimientos'][$i]['comprobanteId'])) {
                $ventasPagadasIds[$ctacte['movimientos'][$i]['comprobanteId']] = 'pagado';
            }
        } elseif (!empty($ctacte['movimientos'][$i]['comprobanteId'])) {
            $ventasPagadasIds[$ctacte['movimientos'][$i]['comprobanteId']] = 'parcial';
        }
        $imputacionesResumen[] = [
            'movimientoId' => $ctacte['movimientos'][$i]['id'],
            'comprobanteLabel' => $ctacte['movimientos'][$i]['comprobanteLabel'] ?? '',
            'monto' => round($aplicado, 2),
        ];
        $restante = round($restante - $aplicado, 2);
    }

    $movHaber = erpRegistrarMovimientoCtaCte(
        $ctacte, $clave, 'haber', $totalCobro,
        $recId, $numRec,
        trim((string) ($cuerpo['observaciones'] ?? 'Cobro Recibo ' . $numRec)),
        $nombreUsuario,
        ['imputaciones' => $imputacionesResumen]
    );
    erpGuardarJson('ctacte.json', $ctacte);
    flock($lockCc, LOCK_UN); fclose($lockCc);

    // Actualizar estadoPago en ventas vinculadas
    if (count($ventasPagadasIds) > 0) {
        $lockVta = erpBloquear('ventas');
        $ventas = erpLeerJson('ventas.json', []);
        foreach ($ventas as &$v) {
            if (isset($ventasPagadasIds[$v['id'] ?? ''])) {
                $v['estadoPago'] = $ventasPagadasIds[$v['id']];
            }
        }
        unset($v);
        erpGuardarJson('ventas.json', $ventas);
        flock($lockVta, LOCK_UN); fclose($lockVta);
    }

    // Guardar Recibo X en comprobantes
    $compRecibo = [
        'id' => $recId,
        'tipo' => 'recibo_x',
        'puntoVenta' => $cfg['puntoVenta'],
        'numero' => $numRec,
        'fechaEmision' => mb_substr((string) ($cuerpo['fecha'] ?? date('Y-m-d')), 0, 20),
        'creado' => date('c'),
        'clienteClave' => $clave,
        'clienteNombre' => $cli['nombre'] ?? '',
        'clienteCuit' => $cli['cuit'] ?? $clave,
        'clienteDireccion' => trim(($cli['direccion'] ?? '') . ' ' . ($cli['localidad'] ?? '')),
        'total' => $totalCobro,
        'mediosPago' => $medios,
        'imputaciones' => $imputacionesResumen,
        'saldoPosterior' => erpSaldoCliente($ctacte, $clave)['saldo'],
        'observaciones' => mb_substr(trim((string) ($cuerpo['observaciones'] ?? '')), 0, 300),
        'creadoPor' => $nombreUsuario,
    ];
    $lockComp = erpBloquear('comprobantes');
    $comps = erpLeerJson('comprobantes.json', []);
    array_unshift($comps, $compRecibo);
    erpGuardarJson('comprobantes.json', $comps);
    flock($lockComp, LOCK_UN); fclose($lockComp);

    // Impactar en Finanzas y Cartera de Cheques
    $lockFin = erpBloquear('finanzas');
    $fin = erpLeerJson('finanzas.json', ['movimientos' => [], 'cheques' => []]);
    foreach ($medios as $mp) {
        if ($mp['medio'] === 'cheques') {
            array_unshift($fin['cheques'], [
                'id' => erpId('chq'),
                'numero' => $mp['numeroCheque'] ?: ($mp['referencia'] ?: 'S/N'),
                'banco' => $mp['banco'] ?: 'Banco s/d',
                'librador' => $mp['libradorCheque'] ?: ($cli['nombre'] ?? ''),
                'clienteClave' => $clave,
                'monto' => $mp['monto'],
                'fechaRecepcion' => date('Y-m-d'),
                'fechaCobro' => $mp['fechaCobroCheque'] ?: date('Y-m-d'),
                'estado' => 'en_cartera',
                'reciboNumero' => $numRec,
                'notas' => $mp['referencia'],
            ]);
            erpRegistrarMovimientoFinanzas(
                $fin, 'ingreso', 'cheques', 'venta_cobro',
                'Cheque ' . ($mp['numeroCheque'] ?: '') . ' (' . $numRec . ' · ' . ($cli['nombre'] ?? $clave) . ')',
                $mp['monto'], $nombreUsuario,
                ['clienteClave' => $clave, 'comprobanteId' => $recId]
            );
        } else {
            erpRegistrarMovimientoFinanzas(
                $fin, 'ingreso', $mp['medio'], 'venta_cobro',
                'Cobro ' . $numRec . ' (' . ($cli['nombre'] ?? $clave) . ')' . ($mp['referencia'] ? ' · ' . $mp['referencia'] : ''),
                $mp['monto'], $nombreUsuario,
                ['clienteClave' => $clave, 'comprobanteId' => $recId]
            );
        }
    }
    erpGuardarJson('finanzas.json', $fin);
    flock($lockFin, LOCK_UN); fclose($lockFin);

    salir(200, [
        'ok' => true,
        'recibo' => $compRecibo,
        'movimiento' => $movHaber,
        'resumen' => erpSaldoCliente($ctacte, $clave),
    ]);
}

/* ── Tareas Operativas ── */
if ($accion === 'tareas') {
    erpExigirRol(['admin', 'ventas', 'deposito']);
    if ($metodo === 'GET') {
        salir(200, ['ok' => true, 'tareas' => array_values(erpLeerJson('tareas.json', []))]);
    }
    if ($metodo === 'POST') {
        $cuerpo = erpCuerpoJson();
        $titulo = mb_substr(trim((string) ($cuerpo['titulo'] ?? '')), 0, 140);
        if ($titulo === '') salir(400, ['error' => 'Ingresá un título para la tarea.']);

        $lock = erpBloquear('tareas');
        $tareas = erpLeerJson('tareas.json', []);
        $id = (string) ($cuerpo['id'] ?? '');
        $idx = -1;
        if ($id !== '') {
            foreach ($tareas as $i => $t) {
                if (($t['id'] ?? '') === $id) { $idx = $i; break; }
            }
        }
        $anterior = $idx >= 0 ? $tareas[$idx] : [];
        $estado = (string) ($cuerpo['estado'] ?? ($anterior['estado'] ?? 'pendiente'));
        if (!in_array($estado, ['pendiente', 'en_curso', 'revision', 'completada'], true)) $estado = 'pendiente';
        $prioridad = (string) ($cuerpo['prioridad'] ?? ($anterior['prioridad'] ?? 'media'));
        if (!in_array($prioridad, ['alta', 'media', 'baja'], true)) $prioridad = 'media';

        $checklist = [];
        if (isset($cuerpo['checklist']) && is_array($cuerpo['checklist'])) {
            foreach ($cuerpo['checklist'] as $ch) {
                if (is_array($ch) && trim((string) ($ch['texto'] ?? '')) !== '') {
                    $checklist[] = [
                        'texto' => mb_substr(trim((string) $ch['texto']), 0, 160),
                        'hecho' => !empty($ch['hecho']),
                    ];
                }
            }
        } else {
            $checklist = $anterior['checklist'] ?? [];
        }

        $tarea = [
            'id' => $idx >= 0 ? $anterior['id'] : erpId('tsk'),
            'titulo' => $titulo,
            'descripcion' => mb_substr(trim((string) ($cuerpo['descripcion'] ?? ($anterior['descripcion'] ?? ''))), 0, 600),
            'categoria' => mb_substr((string) ($cuerpo['categoria'] ?? ($anterior['categoria'] ?? 'general')), 0, 40),
            'prioridad' => $prioridad,
            'estado' => $estado,
            'asignadoRol' => mb_substr((string) ($cuerpo['asignadoRol'] ?? ($anterior['asignadoRol'] ?? '')), 0, 30),
            'asignadoUsuario' => mb_substr((string) ($cuerpo['asignadoUsuario'] ?? ($anterior['asignadoUsuario'] ?? '')), 0, 60),
            'fechaLimite' => mb_substr((string) ($cuerpo['fechaLimite'] ?? ($anterior['fechaLimite'] ?? '')), 0, 20),
            'clienteClave' => mb_substr((string) ($cuerpo['clienteClave'] ?? ($anterior['clienteClave'] ?? '')), 0, 30),
            'ventaId' => mb_substr((string) ($cuerpo['ventaId'] ?? ($anterior['ventaId'] ?? '')), 0, 60),
            'ventaNumero' => mb_substr((string) ($cuerpo['ventaNumero'] ?? ($anterior['ventaNumero'] ?? '')), 0, 40),
            'checklist' => $checklist,
            'creado' => $anterior['creado'] ?? date('c'),
            'actualizado' => date('c'),
            'creadoPor' => $anterior['creadoPor'] ?? $nombreUsuario,
        ];

        if ($idx >= 0) $tareas[$idx] = $tarea;
        else array_unshift($tareas, $tarea);

        erpGuardarJson('tareas.json', $tareas);
        flock($lock, LOCK_UN); fclose($lock);
        salir(200, ['ok' => true, 'tarea' => $tarea]);
    }
}

if ($accion === 'tarea_borrar' && $metodo === 'POST') {
    erpExigirRol(['admin', 'ventas', 'deposito']);
    $cuerpo = erpCuerpoJson();
    $id = (string) ($cuerpo['id'] ?? '');
    $lock = erpBloquear('tareas');
    $tareas = erpLeerJson('tareas.json', []);
    $tareas = array_values(array_filter($tareas, fn($t) => ($t['id'] ?? '') !== $id));
    erpGuardarJson('tareas.json', $tareas);
    flock($lock, LOCK_UN); fclose($lock);
    salir(200, ['ok' => true]);
}

/* ── Finanzas y Cartera de Cheques (solo admin) ── */
if ($accion === 'finanzas' && $metodo === 'GET') {
    erpExigirRol(['admin']);
    $fin = erpLeerJson('finanzas.json', ['movimientos' => [], 'cheques' => []]);
    $saldos = ['efectivo' => 0.0, 'banco' => 0.0, 'mercadopago' => 0.0, 'cheques' => 0.0];
    foreach (($fin['movimientos'] ?? []) as $m) {
        $cta = $m['cuenta'] ?? 'efectivo';
        if (!isset($saldos[$cta])) $saldos[$cta] = 0.0;
        $monto = (float) ($m['monto'] ?? 0);
        if (($m['tipo'] ?? 'ingreso') === 'ingreso') $saldos[$cta] += $monto;
        else $saldos[$cta] -= $monto;
    }
    foreach ($saldos as $k => $v) $saldos[$k] = round($v, 2);

    salir(200, [
        'ok' => true,
        'saldos' => $saldos,
        'movimientos' => array_values($fin['movimientos'] ?? []),
        'cheques' => array_values($fin['cheques'] ?? []),
    ]);
}

if ($accion === 'finanzas_movimiento' && $metodo === 'POST') {
    erpExigirRol(['admin']);
    $cuerpo = erpCuerpoJson();
    $monto = erpNum($cuerpo['monto'] ?? 0, 0);
    $concepto = trim((string) ($cuerpo['concepto'] ?? ''));
    if ($monto <= 0 || $concepto === '') {
        salir(400, ['error' => 'Indicá concepto e importe mayor a cero.']);
    }

    $lock = erpBloquear('finanzas');
    $fin = erpLeerJson('finanzas.json', ['movimientos' => [], 'cheques' => []]);
    $mov = erpRegistrarMovimientoFinanzas(
        $fin,
        (string) ($cuerpo['tipo'] ?? 'egreso'),
        (string) ($cuerpo['cuenta'] ?? 'efectivo'),
        (string) ($cuerpo['categoria'] ?? 'otro'),
        $concepto,
        $monto,
        $nombreUsuario,
        ['fecha' => !empty($cuerpo['fecha']) ? (string) $cuerpo['fecha'] : date('c')]
    );
    erpGuardarJson('finanzas.json', $fin);
    flock($lock, LOCK_UN); fclose($lock);
    salir(200, ['ok' => true, 'movimiento' => $mov]);
}

if ($accion === 'finanzas_cheque_estado' && $metodo === 'POST') {
    erpExigirRol(['admin']);
    $cuerpo = erpCuerpoJson();
    $id = (string) ($cuerpo['id'] ?? '');
    $estado = (string) ($cuerpo['estado'] ?? '');
    if (!in_array($estado, ['en_cartera', 'depositado', 'acreditado', 'entregado_proveedor', 'rechazado'], true)) {
        salir(400, ['error' => 'Estado de cheque inválido.']);
    }

    $lock = erpBloquear('finanzas');
    $fin = erpLeerJson('finanzas.json', ['movimientos' => [], 'cheques' => []]);
    $idx = -1;
    foreach ($fin['cheques'] as $i => $ch) {
        if (($ch['id'] ?? '') === $id) { $idx = $i; break; }
    }
    if ($idx < 0) {
        flock($lock, LOCK_UN); fclose($lock);
        salir(404, ['error' => 'Cheque no encontrado.']);
    }
    $anterior = $fin['cheques'][$idx]['estado'] ?? 'en_cartera';
    $monto = (float) ($fin['cheques'][$idx]['monto'] ?? 0);
    $num = $fin['cheques'][$idx]['numero'] ?? '';
    $fin['cheques'][$idx]['estado'] = $estado;
    if (array_key_exists('destino', $cuerpo)) {
        $fin['cheques'][$idx]['destino'] = mb_substr(trim((string) $cuerpo['destino']), 0, 120);
    }

    // Si pasa a acreditado desde cartera/depositado, sale de cartera cheques y entra a banco
    if ($estado === 'acreditado' && in_array($anterior, ['en_cartera', 'depositado'], true) && $monto > 0) {
        erpRegistrarMovimientoFinanzas($fin, 'egreso', 'cheques', 'cheque_acreditado', 'Acreditación cheque #' . $num, $monto, $nombreUsuario);
        erpRegistrarMovimientoFinanzas($fin, 'ingreso', 'banco', 'cheque_acreditado', 'Acreditación cheque #' . $num, $monto, $nombreUsuario);
    } elseif ($estado === 'entregado_proveedor' && $anterior === 'en_cartera' && $monto > 0) {
        $dest = $fin['cheques'][$idx]['destino'] ?? 'Proveedor';
        erpRegistrarMovimientoFinanzas($fin, 'egreso', 'cheques', 'proveedor', 'Endoso cheque #' . $num . ' a ' . $dest, $monto, $nombreUsuario);
    }

    erpGuardarJson('finanzas.json', $fin);
    flock($lock, LOCK_UN); fclose($lock);
    salir(200, ['ok' => true, 'cheque' => $fin['cheques'][$idx]]);
}

if ($accion === 'finanzas_borrar' && $metodo === 'POST') {
    erpExigirRol(['admin']);
    $cuerpo = erpCuerpoJson();
    $id = (string) ($cuerpo['id'] ?? '');
    $lock = erpBloquear('finanzas');
    $fin = erpLeerJson('finanzas.json', ['movimientos' => [], 'cheques' => []]);
    $fin['movimientos'] = array_values(array_filter($fin['movimientos'], fn($m) => ($m['id'] ?? '') !== $id));
    erpGuardarJson('finanzas.json', $fin);
    flock($lock, LOCK_UN); fclose($lock);
    salir(200, ['ok' => true]);
}

/* ── Backup consolidado (solo admin) ── */
if ($accion === 'backup_erp' && $metodo === 'GET') {
    erpExigirRol(['admin']);
    salir(200, [
        'ok' => true,
        'generado' => date('c'),
        'config' => erpLeerConfig(),
        'clientes' => leerClientes(),
        'stock' => erpLeerJson('stock.json', []),
        'stock_movimientos' => erpLeerJson('stock_movimientos.json', []),
        'ventas' => erpLeerJson('ventas.json', []),
        'comprobantes' => erpLeerJson('comprobantes.json', []),
        'ctacte' => erpLeerJson('ctacte.json', ['movimientos' => []]),
        'tareas' => erpLeerJson('tareas.json', []),
        'finanzas' => erpLeerJson('finanzas.json', ['movimientos' => [], 'cheques' => []]),
        'pedidos_estado' => erpLeerJson('pedidos_estado.json', []),
    ]);
}

salir(404, ['error' => 'Acción desconocida.']);
}
