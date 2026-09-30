<?php
/**
 * DISTRIJAM — configuración del panel (se hace una sola vez)
 *
 * Define la contraseña del administrador. Se guarda hasheada y fuera de
 * public_html: nunca pasa por el repositorio, que es público.
 *
 * Esta página no puede protegerse con una contraseña escrita en el código
 * (se leería en el repositorio) ni con un simple botón (un bot ya envió el
 * formulario una vez). Por eso la llave es el tiempo: sólo funciona durante
 * los primeros minutos tras publicarse, y el despliegue renueva la ventana.
 */

const CARPETA_DATOS = '/datos_distrijam';
const MINUTOS_VENTANA = 30;
const MIN_LARGO = 8;

$dir = dirname(__DIR__) . CARPETA_DATOS;
$archivoHash = $dir . '/clave_admin.txt';

$subido = @filemtime(__FILE__);
$edad = $subido ? (time() - $subido) / 60 : PHP_INT_MAX;
$ventanaAbierta = $edad <= MINUTOS_VENTANA;
$restan = $ventanaAbierta ? max(1, (int) ceil(MINUTOS_VENTANA - $edad)) : 0;

$listo = false;
$seBorro = false;
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $clave = isset($_POST['clave']) ? (string) $_POST['clave'] : '';
    $repetir = isset($_POST['repetir']) ? (string) $_POST['repetir'] : '';

    if (!$ventanaAbierta) {
        $error = 'La ventana de configuración ya se cerró.';
    } elseif (mb_strlen($clave) < MIN_LARGO) {
        $error = 'La contraseña tiene que tener al menos ' . MIN_LARGO . ' caracteres.';
    } elseif ($clave !== $repetir) {
        $error = 'Las dos contraseñas no coinciden.';
    } elseif (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        $error = 'No se pudo crear la carpeta de datos.';
    } else {
        $hash = password_hash($clave, PASSWORD_DEFAULT);
        if (@file_put_contents($archivoHash, $hash, LOCK_EX) === false) {
            $error = 'No se pudo guardar la contraseña.';
        } else {
            @chmod($archivoHash, 0600);
            // Ya no hace falta la clave suelta del esquema anterior
            @unlink($dir . '/clave.txt');
            $listo = true;
            $seBorro = @unlink(__FILE__);
        }
    }
}

$yaConfigurado = is_file($archivoHash);
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Configurar el panel — Distrijam</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
           background: #F5F6F8; color: #1A1D21; margin: 0; padding: 40px 20px; line-height: 1.7; }
    .caja { max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #E1E4E9;
            border-radius: 14px; padding: 32px 34px; }
    h1 { font-size: 1.4rem; margin: 0 0 6px; }
    .sub { color: #565D66; font-size: .92rem; margin-bottom: 24px; }
    .aviso { background: #FFF8E6; border: 1px solid #F3DFA8; border-radius: 10px;
             padding: 14px 16px; font-size: .9rem; margin: 18px 0; }
    .ok { background: #E9F7EF; border: 1px solid #B9E3C9; border-radius: 10px;
          padding: 14px 16px; font-size: .95rem; margin: 18px 0; }
    .error { background: #FDECEA; border: 1px solid #F5C2C0; border-radius: 10px;
             padding: 14px 16px; font-size: .9rem; margin: 18px 0; }
    label { display: block; font-size: .9rem; font-weight: 600; margin: 18px 0 6px; }
    input[type=password] { width: 100%; box-sizing: border-box; padding: 13px;
                           font-size: 1rem; border: 1px solid #D5D9E0; border-radius: 8px; }
    button { margin-top: 20px; background: #C0392B; color: #fff; border: 0; border-radius: 8px;
             padding: 14px 26px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    code { background: #F0F1F4; padding: 2px 6px; border-radius: 4px; font-size: .88rem; }
  </style>
</head>
<body>
  <div class="caja">
    <h1>Configurar el panel</h1>
    <div class="sub">Se hace una sola vez.</div>

    <?php if ($error !== ''): ?>
      <div class="error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <?php if ($listo): ?>
      <div class="ok">
        <strong>Listo.</strong> Ya podés entrar al panel con esa contraseña, en
        <code>admin.html</code>. No hay nada más que configurar: los pedidos y
        los precios se cargan solos al entrar.
      </div>
      <?php if ($seBorro): ?>
        <div class="ok">Esta página se borró sola del servidor.</div>
      <?php else: ?>
        <div class="error">No pudo borrarse sola. Avisale a quien administra el sitio.</div>
      <?php endif; ?>

    <?php elseif ($ventanaAbierta): ?>
      <?php if ($yaConfigurado): ?>
        <div class="aviso">Ya hay una contraseña configurada. Si seguís, queda reemplazada.</div>
      <?php endif; ?>
      <p>Elegí la contraseña con la que vas a entrar al panel de administración.</p>
      <form method="post" autocomplete="off">
        <label for="clave">Contraseña nueva</label>
        <input type="password" id="clave" name="clave" required minlength="<?= MIN_LARGO ?>" />
        <label for="repetir">Repetila</label>
        <input type="password" id="repetir" name="repetir" required minlength="<?= MIN_LARGO ?>" />
        <button type="submit">Guardar contraseña</button>
      </form>
      <div class="sub" style="margin-top:18px;">
        Esta página deja de funcionar en <?= $restan ?> minuto(s).
      </div>

    <?php else: ?>
      <div class="aviso">
        <strong>Esta página expiró</strong>, por seguridad: sólo funciona durante los
        primeros <?= MINUTOS_VENTANA ?> minutos después de publicarse.
      </div>
      <p>Pedile a quien administra el sitio que la habilite de nuevo. Es publicar otra vez,
         cosa de dos minutos.</p>
    <?php endif; ?>
  </div>
</body>
</html>
