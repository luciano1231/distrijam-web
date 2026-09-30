<?php
/**
 * DISTRIJAM — receptor de pedidos
 *
 * POST  /pedidos.php          El catálogo deposita un pedido. Abierto, como
 *                             cualquier formulario de contacto.
 * GET   /pedidos.php?clave=X  El panel lee los pedidos. Requiere la clave que
 *                             genera instalar.php.
 *
 * Los pedidos llevan nombre, teléfono y CUIL, así que se guardan FUERA de
 * public_html: nadie puede pedirlos por URL, sólo este script los lee.
 * Nunca se guardan precios: los pone el panel desde su propia lista.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const CARPETA_DATOS = '/datos_distrijam';
const MAX_CUERPO = 65536;      // 64 KB por pedido
const MAX_ITEMS = 300;
const MAX_TEXTO = 400;

function carpeta() {
    return dirname(__DIR__) . CARPETA_DATOS;
}

function salir($codigo, $datos) {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Recorta y limpia un texto que viene del cliente */
function limpiar($valor) {
    if (!is_string($valor)) {
        return '';
    }
    $valor = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $valor);
    return mb_substr(trim($valor), 0, MAX_TEXTO);
}

/** La referencia se usa como nombre de archivo: sólo letras y números */
function refValida($ref) {
    return is_string($ref) && preg_match('/^[A-Z0-9]{4,16}$/', $ref) === 1;
}

function leerClaveGuardada() {
    $archivo = carpeta() . '/clave.txt';
    if (!is_file($archivo)) {
        return null;
    }
    $clave = trim((string) file_get_contents($archivo));
    return $clave === '' ? null : $clave;
}

/* ─────────────── Recibir un pedido ─────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $cuerpo = file_get_contents('php://input', false, null, 0, MAX_CUERPO + 1);
    if ($cuerpo === false || strlen($cuerpo) > MAX_CUERPO) {
        salir(413, ['error' => 'El pedido es demasiado grande.']);
    }

    $datos = json_decode($cuerpo, true);
    if (!is_array($datos)) {
        salir(400, ['error' => 'Formato inválido.']);
    }

    $ref = isset($datos['r']) ? $datos['r'] : '';
    if (!refValida($ref)) {
        salir(400, ['error' => 'Referencia inválida.']);
    }

    $items = isset($datos['i']) && is_array($datos['i']) ? $datos['i'] : [];
    if (count($items) === 0 || count($items) > MAX_ITEMS) {
        salir(400, ['error' => 'El pedido no tiene ítems válidos.']);
    }

    $limpios = [];
    foreach ($items as $item) {
        if (!is_array($item) || count($item) < 2) {
            continue;
        }
        $vid = limpiar((string) $item[0]);
        $cant = (int) $item[1];
        if ($vid !== '' && $cant > 0 && $cant < 100000) {
            $limpios[] = [$vid, $cant];
        }
    }
    if (count($limpios) === 0) {
        salir(400, ['error' => 'El pedido no tiene ítems válidos.']);
    }

    $cliente = isset($datos['c']) && is_array($datos['c']) ? $datos['c'] : [];
    $registro = [
        'v' => 1,
        'r' => $ref,
        'f' => isset($datos['f']) ? (int) $datos['f'] : (int) round(microtime(true) * 1000),
        'c' => [
            limpiar(isset($cliente[0]) ? $cliente[0] : ''),
            limpiar(isset($cliente[1]) ? $cliente[1] : ''),
            limpiar(isset($cliente[2]) ? $cliente[2] : ''),
            limpiar(isset($cliente[3]) ? $cliente[3] : ''),
        ],
        'i' => $limpios,
        'recibido' => date('c'),
    ];

    $dir = carpeta();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        salir(500, ['error' => 'No se pudo preparar el almacenamiento.']);
    }

    $archivo = $dir . '/pedido_' . $ref . '.json';
    if (is_file($archivo)) {
        salir(200, ['ok' => true, 'ref' => $ref, 'duplicado' => true]);
    }

    $escrito = @file_put_contents(
        $archivo,
        json_encode($registro, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
    if ($escrito === false) {
        salir(500, ['error' => 'No se pudo guardar el pedido.']);
    }

    salir(201, ['ok' => true, 'ref' => $ref]);
}

/* ─────────────── Listar pedidos (panel) ─────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $guardada = leerClaveGuardada();
    if ($guardada === null) {
        salir(503, ['error' => 'El receptor todavía no está instalado. Abrí instalar.php una vez.']);
    }

    $enviada = isset($_GET['clave']) ? (string) $_GET['clave'] : '';
    if (!hash_equals($guardada, $enviada)) {
        // Una pausa corta encarece probar claves al azar
        usleep(400000);
        salir(403, ['error' => 'Clave incorrecta.']);
    }

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

salir(405, ['error' => 'Método no permitido.']);
