<?php
/**
 * DISTRIJAM — instalación del receptor de pedidos (se corre una sola vez)
 *
 * Genera la clave que el panel usa para leer los pedidos y la guarda fuera
 * de public_html. La clave NUNCA pasa por el repositorio, que es público:
 * por eso se genera acá y no viene escrita en el código.
 *
 * Reglas para que esta página no sea una puerta abierta:
 *  - Nunca genera nada con sólo visitarla: hace falta enviar el formulario.
 *  - Si ya hay una clave, para cambiarla hay que escribir la actual. Quien
 *    no la tenga no puede rotarla para quedarse con uuna válida.
 *  - Si se perdió la clave, se borra el archivo clave.txt por FTP y se
 *    vuelve a instalar.
 */

const CARPETA_DATOS = '/datos_distrijam';

$dir = dirname(__DIR__) . CARPETA_DATOS;
$archivoClave = $dir . '/clave.txt';

$claveNueva = null;
$seBorro = false;
$error = '';
$yaExiste = is_file($archivoClave);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $puedeGenerar = false;

    if (!$yaExiste) {
        // Primera instalación: no hay nada que proteger todavía
        $puedeGenerar = true;
    } else {
        $actual = trim((string) file_get_contents($archivoClave));
        $enviada = isset($_POST['actual']) ? trim((string) $_POST['actual']) : '';
        if ($enviada !== '' && hash_equals($actual, $enviada)) {
            $puedeGenerar = true;
        } else {
            usleep(500000);
            $error = 'La clave actual no coincide. Si la perdiste, borrá el archivo '
                   . 'clave.txt por FTP y volvé a entrar acá.';
        }
    }

    if ($puedeGenerar) {
        if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
            $error = 'No se pudo crear la carpeta de datos.';
        } else {
            $claveNueva = bin2hex(random_bytes(16));
            if (@file_put_contents($archivoClave, $claveNueva, LOCK_EX) === false) {
                $error = 'No se pudo guardar la clave.';
                $claveNueva = null;
            } else {
                @chmod($archivoClave, 0600);
                $yaExiste = true;
                // Se borra a sí mismo: así no queda una página en internet
                // capaz de generar claves, y no hay que borrarla por FTP.
                $seBorro = @unlink(__FILE__);
            }
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
    label { display: block; font-size: .88rem; font-weight: 600; margin: 16px 0 6px; }
    input[type=text] { width: 100%; box-sizing: border-box; padding: 11px 13px; font-size: .95rem;
                       font-family: ui-monospace, monospace; border: 1px solid #D5D9E0;
                       border-radius: 8px; }
    button { margin-top: 16px; background: #C0392B; color: #fff; border: 0; border-radius: 8px;
             padding: 12px 22px; font-size: .95rem; font-weight: 600; cursor: pointer; }
    code { background: #F0F1F4; padding: 2px 6px; border-radius: 4px; font-size: .88rem; }
  </style>
</head>
<body>
  <div class="caja">
    <h1>Receptor de pedidos</h1>
    <div class="sub">Instalación por única vez.</div>

    <?php if ($error !== ''): ?>
      <div class="error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <?php if ($claveNueva !== null): ?>
      <div class="ok">Listo. El receptor quedó instalado.</div>
      <p><strong>Esta es tu clave. Se muestra una sola vez:</strong></p>
      <div class="clave"><?= htmlspecialchars($claveNueva) ?></div>
      <div class="aviso">
        Copiala ahora. Pegala en el panel, en
        <strong>Pedidos a cotizar → Conectar con el servidor</strong>.
      </div>
      <?php if ($seBorro): ?>
        <div class="ok">Esta página ya se eliminó sola del servidor. No hace falta que hagas nada más.</div>
      <?php else: ?>
        <div class="error">No se pudo eliminar sola. Borrá <code>instalar.php</code> del servidor
          por FTP o desde el administrador de archivos del hosting.</div>
      <?php endif; ?>

    <?php elseif ($yaExiste): ?>
      <div class="ok">Ya hay una clave instalada. Pedidos guardados: <?= $cantidad ?>.</div>
      <p>La clave no se puede volver a mostrar. Para reemplazarla tenés que escribir la actual:</p>
      <form method="post">
        <label for="actual">Clave actual</label>
        <input type="text" id="actual" name="actual" autocomplete="off" spellcheck="false" />
        <button type="submit">Reemplazar por una nueva</button>
      </form>
      <div class="aviso">
        ¿La perdiste? Borrá <code><?= htmlspecialchars($archivoClave) ?></code> por FTP
        o desde el administrador de archivos del hosting, y recargá esta página.
      </div>

    <?php else: ?>
      <p>Todavía no hay clave. Al generarla, el panel va a poder leer los pedidos que
         llegan del catálogo.</p>
      <form method="post">
        <button type="submit">Generar la clave</button>
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
