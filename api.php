<?php
/**
 * DISTRIJAM — API del panel de administración
 *
 * Todo lo que hay acá exige estar logueado contra el servidor. Eso permite:
 *  - Que el administrador entre con su contraseña y listo: no hay claves que
 *    pegar ni listas que importar en cada navegador.
 *  - Que la lista de precios viva en el servidor pero FUERA de public_html,
 *    de modo que sólo la reciba quien está logueado. Los clientes nunca la ven.
 *
 * La contraseña se guarda hasheada, nunca en el repositorio (que es público).
 */

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const CARPETA_DATOS = '/datos_distrijam';
const MAX_PRECIOS = 3145728; // 3 MB

function carpeta() {
    return dirname(__DIR__) . CARPETA_DATOS;
}

function salir($codigo, $datos) {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function hashGuardado() {
    $archivo = carpeta() . '/clave_admin.txt';
    if (!is_file($archivo)) {
        return null;
    }
    $hash = trim((string) file_get_contents($archivo));
    return $hash === '' ? null : $hash;
}

function estaLogueado() {
    return isset($_SESSION['distrijam_admin']) && $_SESSION['distrijam_admin'] === true;
}

function exigirSesion() {
    if (!estaLogueado()) {
        salir(401, ['error' => 'Sesión no iniciada.']);
    }
}

$accion = isset($_GET['a']) ? (string) $_GET['a'] : '';
$metodo = $_SERVER['REQUEST_METHOD'];

/* ─────────────── Estado de la sesión ─────────────── */
if ($accion === 'estado') {
    salir(200, [
        'ok' => true,
        'logueado' => estaLogueado(),
        'instalado' => hashGuardado() !== null,
    ]);
}

/* ─────────────── Entrar ─────────────── */
if ($accion === 'entrar' && $metodo === 'POST') {
    $hash = hashGuardado();
    if ($hash === null) {
        salir(503, ['error' => 'El panel todavía no está configurado en el servidor.']);
    }

    $cuerpo = json_decode(file_get_contents('php://input'), true);
    $clave = is_array($cuerpo) && isset($cuerpo['clave']) ? (string) $cuerpo['clave'] : '';

    if (!password_verify($clave, $hash)) {
        usleep(600000); // Encarece probar contraseñas
        salir(403, ['error' => 'Contraseña incorrecta.']);
    }

    session_regenerate_id(true);
    $_SESSION['distrijam_admin'] = true;
    salir(200, ['ok' => true]);
}

/* ─────────────── Salir ─────────────── */
if ($accion === 'salir') {
    $_SESSION = [];
    session_destroy();
    salir(200, ['ok' => true]);
}

/* ─────────────── Pedidos ─────────────── */
if ($accion === 'pedidos' && $metodo === 'GET') {
    exigirSesion();

    $archivos = glob(carpeta() . '/pedido_*.json');
    if ($archivos === false) {
        $archivos = [];
    }

    $pedidos = [];
    foreach ($archivos as $ruta) {
        $contenido = @file_get_contents($ruta);
        if ($contenido === false) {
            continue;
        }
        $pedido = json_decode($contenido, true);
        if (is_array($pedido) && isset($pedido['r'])) {
            $pedidos[] = $pedido;
        }
    }

    usort($pedidos, function ($a, $b) {
        return $b['f'] - $a['f'];
    });

    salir(200, ['ok' => true, 'total' => count($pedidos), 'pedidos' => $pedidos]);
}

/* ─────────────── Lista de precios ─────────────── */
if ($accion === 'precios') {
    exigirSesion();
    $archivo = carpeta() . '/precios.json';

    if ($metodo === 'GET') {
        if (!is_file($archivo)) {
            salir(200, ['ok' => true, 'precios' => [], 'vacia' => true]);
        }
        $datos = json_decode((string) file_get_contents($archivo), true);
        $precios = is_array($datos) && isset($datos['precios']) ? $datos['precios'] : [];
        salir(200, [
            'ok' => true,
            'precios' => $precios,
            'actualizada' => is_array($datos) && isset($datos['actualizada']) ? $datos['actualizada'] : null,
        ]);
    }

    if ($metodo === 'POST') {
        $cuerpo = file_get_contents('php://input', false, null, 0, MAX_PRECIOS + 1);
        if ($cuerpo === false || strlen($cuerpo) > MAX_PRECIOS) {
            salir(413, ['error' => 'La lista es demasiado grande.']);
        }

        $datos = json_decode($cuerpo, true);
        $precios = is_array($datos) && isset($datos['precios']) ? $datos['precios'] : $datos;
        if (!is_array($precios) || count($precios) === 0) {
            salir(400, ['error' => 'La lista no tiene el formato esperado.']);
        }

        $limpios = [];
        foreach ($precios as $codigo => $valor) {
            $numero = is_numeric($valor) ? (float) $valor : 0;
            if ($numero > 0 && is_string($codigo) && $codigo !== '') {
                $limpios[$codigo] = round($numero, 2);
            }
        }
        if (count($limpios) === 0) {
            salir(400, ['error' => 'La lista no tiene precios válidos.']);
        }

        $dir = carpeta();
        if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
            salir(500, ['error' => 'No se pudo preparar el almacenamiento.']);
        }

        $guardado = @file_put_contents($archivo, json_encode([
            'actualizada' => date('c'),
            'precios' => $limpios,
        ], JSON_UNESCAPED_UNICODE), LOCK_EX);

        if ($guardado === false) {
            salir(500, ['error' => 'No se pudo guardar la lista.']);
        }
        @chmod($archivo, 0640);

        salir(200, ['ok' => true, 'total' => count($limpios)]);
    }
}

/* ─────────────── Clientes ─────────────── */
/* Los datos fiscales del cliente (dirección, condición de IVA, vendedor)
   no vienen en el pedido: los completa el administrador una vez y quedan
   guardados para los próximos presupuestos de ese mismo CUIT. */

function claveCuit($cuit) {
    return preg_replace('/[^0-9]/', '', (string) $cuit);
}

function leerClientes() {
    $archivo = carpeta() . '/clientes.json';
    if (!is_file($archivo)) {
        return [];
    }
    $datos = json_decode((string) file_get_contents($archivo), true);
    return is_array($datos) ? $datos : [];
}

function guardarClientes($clientes) {
    $dir = carpeta();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        return false;
    }
    $ok = @file_put_contents(
        $dir . '/clientes.json',
        json_encode($clientes, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        LOCK_EX
    );
    if ($ok !== false) {
        @chmod($dir . '/clientes.json', 0640);
    }
    return $ok !== false;
}

if ($accion === 'clientes') {
    exigirSesion();

    if ($metodo === 'GET') {
        salir(200, ['ok' => true, 'clientes' => leerClientes()]);
    }

    if ($metodo === 'POST') {
        $cuerpo = json_decode(file_get_contents('php://input'), true);
        if (!is_array($cuerpo)) {
            salir(400, ['error' => 'Formato inválido.']);
        }

        // Admite uno solo o una tanda (para importar desde otro sistema)
        $entrantes = isset($cuerpo['clientes']) && is_array($cuerpo['clientes'])
            ? $cuerpo['clientes']
            : [$cuerpo];

        $clientes = leerClientes();
        $campos = ['nombre', 'codigo', 'cuit', 'condicion', 'direccion',
                   'localidad', 'provincia', 'telefono', 'vendedor'];
        $guardados = 0;

        foreach ($entrantes as $entrante) {
            if (!is_array($entrante)) {
                continue;
            }
            $clave = claveCuit(isset($entrante['cuit']) ? $entrante['cuit'] : '');
            if ($clave === '') {
                continue;
            }
            $limpio = [];
            foreach ($campos as $campo) {
                $valor = isset($entrante[$campo]) ? (string) $entrante[$campo] : '';
                $limpio[$campo] = mb_substr(trim($valor), 0, 160);
            }
            $clientes[$clave] = $limpio;
            $guardados++;
        }

        if ($guardados === 0) {
            salir(400, ['error' => 'Hace falta al menos un CUIT válido.']);
        }
        if (!guardarClientes($clientes)) {
            salir(500, ['error' => 'No se pudo guardar.']);
        }
        salir(200, ['ok' => true, 'guardados' => $guardados, 'total' => count($clientes)]);
    }
}

/* ─────────────── Número de presupuesto ─────────────── */
/* Correlativo propio, como el del sistema viejo. Se pide una sola vez por
   remito: si ya tiene número, se devuelve el mismo. */
if ($accion === 'numero' && $metodo === 'POST') {
    exigirSesion();

    $cuerpo = json_decode(file_get_contents('php://input'), true);
    $ref = isset($cuerpo['ref']) ? (string) $cuerpo['ref'] : '';
    if (!preg_match('/^[A-Z0-9]{4,16}$/', $ref)) {
        salir(400, ['error' => 'Referencia inválida.']);
    }

    $dir = carpeta();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        salir(500, ['error' => 'No se pudo preparar el almacenamiento.']);
    }

    $archivo = $dir . '/numeros.json';
    $datos = is_file($archivo) ? json_decode((string) file_get_contents($archivo), true) : null;
    if (!is_array($datos)) {
        $datos = ['ultimo' => 0, 'asignados' => []];
    }

    if (isset($datos['asignados'][$ref])) {
        salir(200, ['ok' => true, 'numero' => $datos['asignados'][$ref], 'nuevo' => false]);
    }

    $datos['ultimo'] = (int) $datos['ultimo'] + 1;
    $numero = str_pad((string) $datos['ultimo'], 8, '0', STR_PAD_LEFT);
    $datos['asignados'][$ref] = $numero;

    if (@file_put_contents($archivo, json_encode($datos), LOCK_EX) === false) {
        salir(500, ['error' => 'No se pudo guardar el número.']);
    }

    salir(200, ['ok' => true, 'numero' => $numero, 'nuevo' => true]);
}

salir(404, ['error' => 'Acción desconocida.']);
