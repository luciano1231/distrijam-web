<?php
/**
 * ARCHIVO TEMPORAL DE DIAGNÓSTICO — se elimina apenas confirmemos el resultado.
 *
 * Responde qué versión de PHP corre el hosting y si el sitio puede escribir
 * archivos, que es lo que hace falta para guardar los pedidos entrantes.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$carpeta = __DIR__ . '/_datos';
$existe = is_dir($carpeta) || @mkdir($carpeta, 0775);

$puedeEscribir = false;
if ($existe) {
    $prueba = $carpeta . '/_prueba.txt';
    $puedeEscribir = @file_put_contents($prueba, 'ok') !== false;
    if ($puedeEscribir) {
        @unlink($prueba);
    }
}

echo json_encode([
    'php'            => PHP_VERSION,
    'json'           => function_exists('json_encode'),
    'carpeta_creada' => $existe,
    'puede_escribir' => $puedeEscribir,
    'ruta'           => __DIR__,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
