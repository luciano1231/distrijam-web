<?php
/**
 * ARCHIVO TEMPORAL DE DIAGNÓSTICO — se elimina apenas confirmemos el resultado.
 *
 * Los pedidos llevan nombre, teléfono y CUIL del cliente, así que no pueden
 * guardarse en una carpeta accesible desde la web. Acá se prueba si el sitio
 * puede escribir FUERA de public_html, que es donde tienen que ir.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function probarEscritura($carpeta) {
    $existe = is_dir($carpeta) || @mkdir($carpeta, 0750, true);
    if (!$existe) {
        return ['existe' => false, 'escribe' => false];
    }
    $prueba = $carpeta . '/_prueba.txt';
    $escribe = @file_put_contents($prueba, 'ok') !== false;
    if ($escribe) {
        @unlink($prueba);
    }
    return ['existe' => true, 'escribe' => $escribe];
}

echo json_encode([
    'php'            => PHP_VERSION,
    'ruta_sitio'     => __DIR__,
    'fuera_del_sitio' => probarEscritura(dirname(__DIR__) . '/datos_distrijam'),
    'dentro_del_sitio' => probarEscritura(__DIR__ . '/_datos'),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
