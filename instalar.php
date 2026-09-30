<?php
/**
 * DISTRIJAM — instalación del receptor de pedidos
 *
 * El problema de una página pública que crea claves es que cualquiera puede
 * usarla, y un botón no alcanza: un bot ya envió este formulario una vez.
 * Tampoco sirve protegerla con una contraseña escrita acá, porque el
 * repositorio es público y se leería igual.
 *
 * Por eso la llave es el tiempo: sólo funciona durante los primeros minutos
 * después de que el archivo se sube al servidor. El despliegue lo renueva,
 * así que para volver a habilitarla alcanza con publicar de nuevo.
 *
 * Además, apenas se abre dentro de la ventana, invalida cualquier clave que
 * existiera antes: si alguien consiguió una, deja de servirle.
 */

const CARPETA_DATOS = '/datos_distrijam';
const MINUTOS_VENTANA = 30;

$dir = dirname(__DIR__) . CARPETA_DATOS;
$archivoClave = $dir . '/clave.txt';

$subido = @filemtime(__FILE__);
$edadMinutos = $subido ? (time() - $subido) / 60 : PHP_INT_MAX;
$ventanaAbierta = $edadMinutos <= MINUTOS_VENTANA;
$restan = $ventanaAbierta ? max(1, (int) ceil(MINUTOS_VENTANA - $edadMinutos)) : 0;

$claveNueva = null;
$seBorro = false;
$error = '';

// Dentro de la ventana, cualquier clave anterior deja de valer
if ($ventanaAbierta && is_file($archivoClave) && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    @unlink($archivoClave);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$ventanaAbierta) {
        $error = 'La ventana de instalación ya se cerró.';
    } elseif (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        $error = 'No se pudo crear la carpeta de datos.';
    } else {
        @unlink($archivoClave);
        $claveNueva = bin2hex(random_bytes(16));
        if (@file_put_contents($archivoClave, $claveNueva, LOCK_EX) === false) {
            $error = 'No se pudo guardar la clave.';
            $claveNueva = null;
        } else {
            @chmod($archivoClave, 0600);
            // Se borra a sí mismo: no queda una página capaz de crear claves
            $seBorro = @unlink(__FILE__);
        }
    }
}

$pedidos = is_dir($dir) ? glob($dir . '/pedido_*.json') : [];
$cantidad = is_array($pedidos) ? count($pedidos) : 0;
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Activar el receptor de pedidos — Distrijam</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
           background: #F5F6F8; color: #1A1D21; margin: 0; padding: 40px 20px; line-height: 1.7; }
    .caja { max-width: 620px; margin: 0 auto; background: #fff; border: 1px solid #E1E4E9;
            border-radius: 14px; padding: 32px 34px; }
    h1 { font-size: 1.4rem; margin: 0 0 6px; }
    .sub { color: #565D66; font-size: .92rem; margin-bottom: 24px; }
    .clave { font-family: ui-monospace, monospace; font-size: 1.2rem; font-weight: 700;
             background: #FCEDEB; border: 1px solid #F0C4BE; color: #A5281B;
             padding: 18px; border-radius: 10px; word-break: break-all; margin: 14px 0;
             user-select: all; }
    .aviso { background: #FFF8E6; border: 1px solid #F3DFA8; border-radius: 10px;
             padding: 14px 16px; font-size: .9rem; margin: 18px 0; }
    .ok { background: #E9F7EF; border: 1px solid #B9E3C9; border-radius: 10px;
          padding: 14px 16px; font-size: .9rem; margin: 18px 0; }
    .error { background: #FDECEA; border: 1px solid #F5C2C0; border-radius: 10px;
             padding: 14px 16px; font-size: .9rem; margin: 18px 0; }
    button { margin-top: 12px; background: #C0392B; color: #fff; border: 0; border-radius: 8px;
             padding: 14px 26px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    ol { padding-left: 22px; } li { margin-bottom: 10px; }
    code { background: #F0F1F4; padding: 2px 6px; border-radius: 4px; font-size: .88rem; }
  </style>
</head>
<body>
  <div class="caja">
    <h1>Activar el receptor de pedidos</h1>
    <div class="sub">Se hace una sola vez.</div>

    <?php if ($error !== ''): ?>
      <div class="error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <?php if ($claveNueva !== null): ?>
      <div class="ok">Listo, el receptor quedó activo.</div>
      <p><strong>Copiá esta clave. Se muestra una sola vez:</strong></p>
      <div class="clave"><?= htmlspecialchars($claveNueva) ?></div>
      <div class="aviso">
        Pegala en el panel: <strong>admin.html → Pedidos a cotizar → Conectar con el servidor</strong>.
      </div>
      <?php if ($seBorro): ?>
        <div class="ok">Esta página ya se borró sola del servidor. No tenés que hacer nada más.</div>
      <?php else: ?>
        <div class="error">No pudo borrarse sola. Avisale a quien administra el sitio.</div>
      <?php endif; ?>

    <?php elseif ($ventanaAbierta): ?>
      <p>Al apretar el botón se genera la clave que el panel usa para leer los pedidos.
         Cualquier clave anterior deja de funcionar.</p>
      <?php if ($cantidad > 0): ?>
        <div class="aviso">Hay <?= $cantidad ?> pedido(s) guardado(s). No se borran.</div>
      <?php endif; ?>
      <form method="post">
        <button type="submit">Generar la clave</button>
      </form>
      <div class="sub" style="margin-top:16px;">
        Esta página deja de funcionar en <?= $restan ?> minuto(s).
      </div>

    <?php else: ?>
      <div class="aviso">
        <strong>Esta página ya expiró</strong>, por seguridad: sólo funciona durante los
        primeros <?= MINUTOS_VENTANA ?> minutos después de publicarse.
      </div>
      <p>Pedile a quien administra el sitio que la vuelva a habilitar. Es publicar de nuevo,
         cosa de un par de minutos.</p>
    <?php endif; ?>
  </div>
</body>
</html>
