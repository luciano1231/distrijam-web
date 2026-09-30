<?php
/**
 * ARCHIVO TEMPORAL — se elimina inmediatamente después de usarlo.
 *
 * Deja el receptor en cero: borra la clave que se generó sola al visitar el
 * instalador viejo (nadie la conserva y quedó expuesta) y los pedidos de
 * prueba. Sólo borra; no muestra ningún dato de clientes.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (!isset($_GET['t']) || $_GET['t'] !== 'reset-9f3a21') {
    http_response_code(404);
    echo json_encode(['error' => 'No encontrado']);
    exit;
}

$dir = dirname(__DIR__) . '/datos_distrijam';
$borrados = [];

$clave = $dir . '/clave.txt';
if (is_file($clave) && @unlink($clave)) {
    $borrados[] = 'clave.txt';
}

// Sólo las referencias que usamos para probar
foreach (['RSRV001', 'RTEST01', 'RIVA001', 'RLOGO01', 'RA00001', 'RB00002', 'RC00003'] as $ref) {
    $archivo = $dir . '/pedido_' . $ref . '.json';
    if (is_file($archivo) && @unlink($archivo)) {
        $borrados[] = 'pedido_' . $ref;
    }
}

$restantes = glob($dir . '/pedido_*.json');

echo json_encode([
    'borrados'          => $borrados,
    'pedidos_restantes' => is_array($restantes) ? count($restantes) : 0,
    'hay_clave'         => is_file($clave),
], JSON_PRETTY_PRINT);
