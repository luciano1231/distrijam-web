<?php
/**
 * DISTRIJAM — instalación del receptor de pedidos (se corre una sola vez)
 *
 * Genera la clave que el panel usa para leer los pedidos y la guarda fuera
 * de public_html. La clave se muestra una única vez y NUNCA pasa por el
 * repositorio: por eso se genera acá y no viene escrita en el código.
 */

const CARPETA_DATOS = '/datos_distrijam';

$dir = dirname(__DIR__) . CARPETA_DATOS;
$archivoClave = $dir . '/clave.txt';

$mensaje = '';
$clave = null;
$yaExiste = is_file($archivoClave);
$regenerar = isset($_POST['regenerar']);

if (!$yaExiste || $regenerar) {
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        $mensaje = 'No se pudo crear la carpeta de datos en ' . htmlspecialchars($dir);
    } else {
        $clave = bin2hex(random_bytes(16));
        if (@file_put_contents($archivoClave, $clave, LOCK_EX) === false) {
            $mensaje = 'No se pudo guardar la clave.';
            $clave = null;
        } else {
            @chmod($archivoClave, 0600);
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
  <title>Instalación del receptor de pedidos — Distrijam</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
           background: #F5F6F8; color: #1A1D21; margin: 0; padding: 40px 20px; line-height: 1.7; }
    .caja { max-width: 640px; margin: 0 auto; background: #fff; border: 1px solid #E1E4E9;
            border-radius: 14px; padding: 32px 34px; }
    h1 { font-size: 1.4rem; margin: 0 0 6px; }
    .sub { color: #565D66; font-size: .92rem; margin-bottom: 26px; }
    .clave { font-family: ui-monospace, monospace; font-size: 1.15rem; font-weight: 700;
             background: #FCEDEB; border: 1px solid #F0C4BE; color: #A5281B;
             padding: 16px 18px; border-radius: 10px; word-break: break-all; margin: 14px 0; }
    .aviso { background: #FFF8E6; border: 1px solid #F3DFA8; border-radius: 10px;
             padding: 14px 16px; font-size: .9rem; margin: 18px 0; }
    .ok { background: #E9F7EF; border: 1px solid #B9E3C9; border-radius: 10px;
          padding: 14px 16px; font-size: .9rem; margin: 18px 0; }
    .error { background: #FDECEA; border: 1px solid #F5C2C0; border-radius: 10px;
             padding: 14px 16px; font-size: .9rem; margin: 18px 0; }
    ol { padding-left: 20px; } li { margin-bottom: 8px; }
    button { background: #C0392B; color: #fff; border: 0; border-radius: 8px;
             padding: 11px 20px; font-size: .92rem; font-weight: 600; cursor: pointer; }
    code { background: #F0F1F4; padding: 2px 6px; border-radius: 4px; font-size: .88rem; }
  </style>
</head>
<body>
  <div class="caja">
    <h1>Receptor de pedidos</h1>
    <div class="sub">Instalación por única vez.</div>

    <?php if ($mensaje !== ''): ?>
      <div class="error"><?= htmlspecialchars($mensaje) ?></div>
    <?php endif; ?>

    <?php if ($clave !== null): ?>
      <div class="ok">Listo. El receptor quedó instalado.</div>
      <p><strong>Esta es tu clave. Se muestra una sola vez:</strong></p>
      <div class="clave"><?= htmlspecialchars($clave) ?></div>
      <div class="aviso">
        Copiala y pegala en el panel, en <strong>Pedidos a cotizar → Conectar con el servidor</strong>.
        Si la perdés, volvé a esta página y generá una nueva.
      </div>
      <p><strong>Ahora borrá este archivo del servidor</strong> (<code>instalar.php</code>)
         para que nadie más pueda generar claves.</p>

    <?php elseif ($yaExiste): ?>
      <div class="ok">El receptor ya está instalado y hay <?= $cantidad ?> pedido(s) guardado(s).</div>
      <p>La clave no se puede volver a mostrar. Si la perdiste, generá una nueva:
         el panel te va a pedir que la cargues de nuevo.</p>
      <form method="post">
        <button type="submit" name="regenerar" value="1">Generar una clave nueva</button>
      </form>
    <?php endif; ?>

    <hr style="border:0;border-top:1px solid #E1E4E9;margin:26px 0;">
    <p style="font-size:.85rem;color:#565D66;">
      Los pedidos se guardan en <code><?= htmlspecialchars($dir) ?></code>, fuera de la carpeta
      pública del sitio, así que no se pueden pedir por URL.
    </p>
  </div>
</body>
</html>
