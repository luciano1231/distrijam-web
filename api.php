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

salir(404, ['error' => 'Acción desconocida.']);
