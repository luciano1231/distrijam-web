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

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const CARPETA_DATOS = '/datos_distrijam';
const MAX_PRECIOS = 3145728; // 3 MB
const MAX_IMAGEN = 2097152;  // 2 MB por foto

function carpeta() {
    return dirname(__DIR__) . CARPETA_DATOS;
}

function salir($codigo, $datos) {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$accion = isset($_GET['a']) ? (string) $_GET['a'] : '';
$metodo = $_SERVER['REQUEST_METHOD'];

/* ─────────────── Catálogo: lectura pública ─────────────── */
/* Lo que se carga desde el panel (productos propios, cambios sobre los del
   proveedor y categorías nuevas) vive fuera de public_html, igual que los
   precios, pero es público: lo pide cada página del catálogo. No hace falta
   sesión para leerlo, sí para escribirlo (más abajo). */

function archivoCatalogo() {
    return carpeta() . '/catalogo.json';
}

function carpetaImagenes() {
    return carpeta() . '/imagenes_catalogo';
}

function leerCatalogo() {
    $vacio = ['productos' => [], 'cambios' => [], 'categorias' => []];
    if (!is_file(archivoCatalogo())) {
        return $vacio;
    }
    $datos = json_decode((string) file_get_contents(archivoCatalogo()), true);
    if (!is_array($datos)) {
        return $vacio;
    }
    foreach ($vacio as $clave => $valor) {
        if (!isset($datos[$clave]) || !is_array($datos[$clave])) {
            $datos[$clave] = $valor;
        }
    }
    return $datos;
}

function catalogoParaEnviar($cat) {
    return [
        'productos' => array_values($cat['productos']),
        'cambios' => (object) $cat['cambios'],
        'categorias' => array_values($cat['categorias']),
    ];
}

if ($accion === 'catalogo' && $metodo === 'GET') {
    salir(200, ['ok' => true] + catalogoParaEnviar(leerCatalogo()));
}

/* Fotos subidas desde el panel */
if ($accion === 'img' && $metodo === 'GET') {
    $nombre = isset($_GET['f']) ? (string) $_GET['f'] : '';
    $tipos = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'];
    if (!preg_match('/^[a-f0-9]{16}\.(jpg|png|webp|gif)$/', $nombre, $m)
        || !is_file(carpetaImagenes() . '/' . $nombre)) {
        salir(404, ['error' => 'Imagen inexistente.']);
    }
    // El nombre es aleatorio y nunca se reutiliza: se puede cachear para siempre
    header('Content-Type: ' . $tipos[$m[1]]);
    header('Cache-Control: public, max-age=31536000, immutable');
    readfile(carpetaImagenes() . '/' . $nombre);
    exit;
}

session_start();

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
            // Se indexa por el CUIT, que es único. El panel manda como clave
            // el CUIT del formulario; si el pedido llegó con uno mal escrito,
            // el panel corrige el pedido antes de guardar.
            $clave = claveCuit(isset($entrante['clave']) && $entrante['clave'] !== ''
                ? $entrante['clave']
                : (isset($entrante['cuit']) ? $entrante['cuit'] : ''));
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

/* ─────────────── Catálogo: ABM (con sesión) ─────────────── */

const CATEGORIAS_BASE = [
    'arandelas' => 'Arandelas',
    'autoperforantes' => 'Autoperforantes',
    'bulones' => 'Bulones',
    'ganchos' => 'Ganchos',
    'pitones' => 'Pitones',
    'remaches-clavos' => 'Remaches y Clavos',
    'tarugos' => 'Tarugos',
    'tirafondos' => 'Tirafondos',
    'tuercas' => 'Tuercas',
    'varillas' => 'Varillas Roscadas',
];

function slug($texto) {
    $t = mb_strtolower((string) $texto, 'UTF-8');
    $t = strtr($t, [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u', 'â' => 'a', 'ê' => 'e',
        'î' => 'i', 'ô' => 'o', 'û' => 'u', 'ç' => 'c',
    ]);
    return trim(preg_replace('/[^a-z0-9]+/', '-', $t), '-');
}

// Texto de un campo: sin caracteres de control y con largo máximo
function campo($datos, $clave, $max) {
    $valor = isset($datos[$clave]) && is_scalar($datos[$clave]) ? (string) $datos[$clave] : '';
    $valor = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', $valor);
    return mb_substr(trim((string) $valor), 0, $max);
}

// Las escrituras del catálogo sólo aceptan JSON: un formulario de otro sitio
// no puede mandar ese tipo de contenido sin permiso del navegador.
function cuerpoCatalogo() {
    exigirSesion();
    $tipo = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (stripos($tipo, 'application/json') === false) {
        salir(415, ['error' => 'Formato inválido.']);
    }
    $cuerpo = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($cuerpo)) {
        salir(400, ['error' => 'Formato inválido.']);
    }
    return $cuerpo;
}

// Un solo cambio a la vez: el bloqueo se libera solo al terminar el pedido
function bloquearCatalogo() {
    $dir = carpeta();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        salir(500, ['error' => 'No se pudo preparar el almacenamiento.']);
    }
    $candado = fopen($dir . '/catalogo.lock', 'c');
    if ($candado === false || !flock($candado, LOCK_EX)) {
        salir(500, ['error' => 'No se pudo bloquear el catálogo.']);
    }
    return $candado;
}

function guardarCatalogo($cat) {
    $temporal = archivoCatalogo() . '.tmp';
    $json = json_encode(catalogoParaEnviar($cat), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if (@file_put_contents($temporal, $json) === false || !@rename($temporal, archivoCatalogo())) {
        salir(500, ['error' => 'No se pudo guardar el catálogo.']);
    }
    @chmod(archivoCatalogo(), 0640);
    limpiarImagenes($cat);
}

function productosBase() {
    $datos = json_decode((string) @file_get_contents(__DIR__ . '/productos.json'), true);
    return is_array($datos) ? $datos : [];
}

function buscarBase($id) {
    foreach (productosBase() as $p) {
        if (isset($p['id']) && $p['id'] === $id) {
            return $p;
        }
    }
    return null;
}

function categoriaExiste($cat, $id) {
    if (isset(CATEGORIAS_BASE[$id])) {
        return true;
    }
    foreach ($cat['categorias'] as $c) {
        if ($c['id'] === $id) {
            return true;
        }
    }
    return false;
}

function indiceProducto($cat, $id) {
    foreach ($cat['productos'] as $i => $p) {
        if ($p['id'] === $id) {
            return $i;
        }
    }
    return -1;
}

// Sólo se aceptan fotos subidas por el panel o archivos del propio sitio
function validarImagenes($lista) {
    if (!is_array($lista)) {
        return [];
    }
    if (count($lista) > 4) {
        salir(400, ['error' => 'Hasta 4 imágenes por producto.']);
    }
    $limpias = [];
    foreach ($lista as $url) {
        $url = is_string($url) ? trim($url) : '';
        if (preg_match('/^api\.php\?a=img&f=([a-f0-9]{16}\.(jpg|png|webp|gif))$/', $url, $m)
            && is_file(carpetaImagenes() . '/' . $m[1])) {
            $limpias[] = $url;
        } elseif (preg_match('~^imagenes/[^?#<>"\']+$~', $url) && strpos($url, '..') === false) {
            $limpias[] = $url;
        } else {
            salir(400, ['error' => 'Una de las imágenes no es válida.']);
        }
    }
    return $limpias;
}

// Las fotos que ya no usa nadie se borran. Se respeta la última hora para no
// llevarse una recién subida de un formulario que todavía no se guardó.
function limpiarImagenes($cat) {
    $usadas = [];
    $anotar = function ($url) use (&$usadas) {
        if (is_string($url) && preg_match('/f=([a-f0-9]{16}\.\w+)$/', $url, $m)) {
            $usadas[$m[1]] = true;
        }
    };
    foreach ($cat['productos'] as $p) {
        foreach ((array) ($p['images'] ?? []) as $u) { $anotar($u); }
    }
    foreach ($cat['cambios'] as $c) {
        foreach ((array) ($c['images'] ?? []) as $u) { $anotar($u); }
    }
    foreach ($cat['categorias'] as $c) {
        $anotar($c['image'] ?? '');
    }
    foreach (glob(carpetaImagenes() . '/*') ?: [] as $ruta) {
        if (!isset($usadas[basename($ruta)]) && filemtime($ruta) < time() - 3600) {
            @unlink($ruta);
        }
    }
}

/* Subir una foto. Se manda de a una para no chocar con el límite de tamaño
   de los pedidos del hosting. */
if ($accion === 'catalogo_imagen' && $metodo === 'POST') {
    // Subida normal de archivo (multipart): es la que dejan pasar los filtros del hosting
    if (isset($_FILES['imagen'])) {
        exigirSesion();
        $f = $_FILES['imagen'];
        if (!is_array($f) || !isset($f['error']) || is_array($f['error'])) {
            salir(400, ['error' => 'La imagen no tiene un formato válido.']);
        }
        if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) {
            salir(413, ['error' => 'La imagen supera los 2 MB.']);
        }
        if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
            salir(400, ['error' => 'La imagen no tiene un formato válido.']);
        }
        $bytes = file_get_contents($f['tmp_name']);
    } else {
        $cuerpo = cuerpoCatalogo();
        $data = isset($cuerpo['data']) && is_string($cuerpo['data']) ? $cuerpo['data'] : '';
        if (!preg_match('/^data:image\/[a-z+]+;base64,(.+)$/s', $data, $m)) {
            salir(400, ['error' => 'La imagen no tiene un formato válido.']);
        }
        $bytes = base64_decode($m[1], true);
    }
    if ($bytes === false || $bytes === '') {
        salir(400, ['error' => 'La imagen no tiene un formato válido.']);
    }
    if (strlen($bytes) > MAX_IMAGEN) {
        salir(413, ['error' => 'La imagen supera los 2 MB.']);
    }
    $info = @getimagesizefromstring($bytes);
    $extensiones = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'];
    if ($info === false || !isset($extensiones[$info[2]])) {
        salir(400, ['error' => 'El archivo no es una imagen JPG, PNG, WEBP o GIF.']);
    }
    $dir = carpetaImagenes();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        salir(500, ['error' => 'No se pudo preparar el almacenamiento.']);
    }
    $nombre = bin2hex(random_bytes(8)) . '.' . $extensiones[$info[2]];
    if (@file_put_contents($dir . '/' . $nombre, $bytes) === false) {
        salir(500, ['error' => 'No se pudo guardar la imagen.']);
    }
    salir(200, ['ok' => true, 'url' => 'api.php?a=img&f=' . $nombre]);
}

/* Alta o modificación de un producto propio */
if ($accion === 'catalogo_producto' && $metodo === 'POST') {
    $cuerpo = cuerpoCatalogo();
    bloquearCatalogo();
    $cat = leerCatalogo();
    $base = productosBase();

    $nombre = campo($cuerpo, 'name', 120);
    if ($nombre === '' || slug($nombre) === '') {
        salir(400, ['error' => 'Ingresá el nombre del producto.']);
    }
    $categoria = campo($cuerpo, 'category', 60);
    if (!categoriaExiste($cat, $categoria)) {
        salir(400, ['error' => 'Seleccioná una categoría válida.']);
    }
    $imagenes = validarImagenes($cuerpo['images'] ?? []);
    if (count($imagenes) === 0) {
        salir(400, ['error' => 'Seleccioná al menos una imagen.']);
    }
    $entrantes = isset($cuerpo['variants']) && is_array($cuerpo['variants']) ? array_values($cuerpo['variants']) : [];
    if (count($entrantes) === 0) {
        salir(400, ['error' => 'Cargá al menos una medida.']);
    }
    if (count($entrantes) > 100) {
        salir(400, ['error' => 'Hasta 100 medidas por producto.']);
    }

    // Edición: se mantiene el id para no romper enlaces ni pedidos guardados
    $id = campo($cuerpo, 'id', 140);
    $indice = -1;
    if ($id !== '') {
        $indice = indiceProducto($cat, $id);
        if ($indice < 0) {
            salir(404, ['error' => 'El producto ya no existe.']);
        }
    } else {
        $ocupados = [];
        foreach ($base as $p) { $ocupados[$p['id']] = true; }
        foreach ($cat['productos'] as $p) { $ocupados[$p['id']] = true; }
        $id = slug($nombre);
        for ($n = 2; isset($ocupados[$id]); $n++) {
            $id = slug($nombre) . '-' . $n;
        }
    }

    // Los códigos de medida identifican el precio: no pueden repetirse
    $codigosUsados = [];
    foreach ($base as $p) {
        foreach ($p['variants'] ?? [] as $v) { $codigosUsados[$v['id']] = $p['name']; }
    }
    foreach ($cat['productos'] as $p) {
        if ($p['id'] === $id) { continue; }
        foreach ($p['variants'] ?? [] as $v) { $codigosUsados[$v['id']] = $p['name']; }
    }

    $variantes = [];
    $propios = [];
    foreach ($entrantes as $i => $v) {
        $v = is_array($v) ? $v : [];
        $medida = campo($v, 'medida', 80);
        $presentacion = campo($v, 'presentacion', 80);
        $codigo = campo($v, 'codigo', 40);
        if ($medida === '' || $presentacion === '') {
            salir(400, ['error' => 'Completá la medida y la presentación de la fila ' . ($i + 1) . '.']);
        }
        if ($codigo !== '' && !preg_match('#^[A-Za-z0-9./_ -]+$#', $codigo)) {
            salir(400, ['error' => "El código \"$codigo\" tiene caracteres no permitidos."]);
        }
        if ($codigo === '') {
            for ($n = $i + 1; ; $n++) {
                $codigo = $id . '-' . $n;
                if (!isset($codigosUsados[$codigo]) && !isset($propios[$codigo])) { break; }
            }
        }
        if (isset($propios[$codigo])) {
            salir(409, ['error' => "El código \"$codigo\" está repetido en este producto."]);
        }
        if (isset($codigosUsados[$codigo])) {
            salir(409, ['error' => "El código \"$codigo\" ya lo usa \"{$codigosUsados[$codigo]}\"."]);
        }
        $propios[$codigo] = true;
        $variantes[] = [
            'id' => $codigo,
            'medida' => $medida,
            'presentacion' => $presentacion,
            'descripcion' => "$nombre $medida $presentacion",
        ];
    }

    $descripcion = campo($cuerpo, 'description', 1500);
    $producto = [
        'id' => $id,
        'name' => $nombre,
        'category' => $categoria,
        'brand' => '',
        'description' => $descripcion !== '' ? $descripcion : "$nombre. Consultá disponibilidad y medidas.",
        'features' => campo($cuerpo, 'features', 1500),
        'applications' => campo($cuerpo, 'applications', 1500),
        'image' => $imagenes[0],
        'images' => $imagenes,
        'variants' => $variantes,
        'creado' => $indice >= 0 ? ($cat['productos'][$indice]['creado'] ?? date('c')) : date('c'),
        'modificado' => date('c'),
    ];

    if ($indice >= 0) {
        $cat['productos'][$indice] = $producto;
    } else {
        $cat['productos'][] = $producto;
    }
    guardarCatalogo($cat);
    salir(200, ['ok' => true, 'producto' => $producto, 'nuevo' => $indice < 0]);
}

/* Baja de un producto propio */
if ($accion === 'catalogo_producto_borrar' && $metodo === 'POST') {
    $cuerpo = cuerpoCatalogo();
    bloquearCatalogo();
    $cat = leerCatalogo();
    $indice = indiceProducto($cat, campo($cuerpo, 'id', 140));
    if ($indice < 0) {
        salir(404, ['error' => 'El producto ya no existe.']);
    }
    array_splice($cat['productos'], $indice, 1);
    guardarCatalogo($cat);
    salir(200, ['ok' => true]);
}

/* Cambios sobre un producto del proveedor: ocultarlo o corregir nombre,
   categoría, descripción y fotos. Las medidas siguen viniendo de la planilla.
   Sólo se guarda lo que difiere del original. */
if ($accion === 'catalogo_base' && $metodo === 'POST') {
    $cuerpo = cuerpoCatalogo();
    bloquearCatalogo();
    $cat = leerCatalogo();
    $id = campo($cuerpo, 'id', 140);
    $original = buscarBase($id);
    if ($original === null) {
        salir(404, ['error' => 'No es un producto del proveedor.']);
    }
    $cambio = isset($cat['cambios'][$id]) ? $cat['cambios'][$id] : [];

    if (array_key_exists('oculto', $cuerpo)) {
        $cambio['oculto'] = $cuerpo['oculto'] === true;
    }
    if (array_key_exists('name', $cuerpo)) {
        $nombre = campo($cuerpo, 'name', 120);
        if ($nombre === '') {
            salir(400, ['error' => 'Ingresá el nombre del producto.']);
        }
        $cambio['name'] = $nombre;
    }
    if (array_key_exists('category', $cuerpo)) {
        $categoria = campo($cuerpo, 'category', 60);
        if (!categoriaExiste($cat, $categoria)) {
            salir(400, ['error' => 'Seleccioná una categoría válida.']);
        }
        $cambio['category'] = $categoria;
    }
    if (array_key_exists('description', $cuerpo)) {
        $cambio['description'] = campo($cuerpo, 'description', 1500);
    }
    if (array_key_exists('images', $cuerpo)) {
        $cambio['images'] = validarImagenes($cuerpo['images']);
    }

    // Lo que coincide con el original (o quedó vacío) no es un cambio
    $originalImagenes = !empty($original['images']) ? $original['images'] : [$original['image'] ?? ''];
    foreach (['name', 'category', 'description'] as $c) {
        if (isset($cambio[$c]) && ($cambio[$c] === '' || $cambio[$c] === ($original[$c] ?? ''))) {
            unset($cambio[$c]);
        }
    }
    if (isset($cambio['images']) && (count($cambio['images']) === 0 || $cambio['images'] === $originalImagenes)) {
        unset($cambio['images']);
    }
    if (empty($cambio['oculto'])) {
        unset($cambio['oculto']);
    }

    if (count($cambio) === 0) {
        unset($cat['cambios'][$id]);
    } else {
        $cat['cambios'][$id] = $cambio;
    }
    guardarCatalogo($cat);
    salir(200, ['ok' => true, 'cambio' => (object) $cambio]);
}

/* Alta de categoría */
if ($accion === 'catalogo_categoria' && $metodo === 'POST') {
    $cuerpo = cuerpoCatalogo();
    bloquearCatalogo();
    $cat = leerCatalogo();
    $nombre = campo($cuerpo, 'label', 40);
    $id = slug($nombre);
    if ($id === '') {
        salir(400, ['error' => 'El nombre de la categoría tiene que tener letras o números.']);
    }
    foreach (CATEGORIAS_BASE as $idBase => $etiqueta) {
        if ($id === $idBase || $id === slug($etiqueta)) {
            salir(409, ['error' => "Ya existe la categoría \"$etiqueta\"."]);
        }
    }
    foreach ($cat['categorias'] as $c) {
        if ($c['id'] === $id) {
            salir(409, ['error' => "Ya existe la categoría \"{$c['label']}\"."]);
        }
    }
    $imagenes = validarImagenes(isset($cuerpo['image']) ? [$cuerpo['image']] : []);
    if (count($imagenes) === 0) {
        salir(400, ['error' => 'Elegí una imagen para la categoría.']);
    }
    $categoria = ['id' => $id, 'label' => $nombre, 'image' => $imagenes[0]];
    $cat['categorias'][] = $categoria;
    guardarCatalogo($cat);
    salir(200, ['ok' => true, 'categoria' => $categoria]);
}

/* Baja de categoría: no se permite si algún producto la usa */
if ($accion === 'catalogo_categoria_borrar' && $metodo === 'POST') {
    $cuerpo = cuerpoCatalogo();
    bloquearCatalogo();
    $cat = leerCatalogo();
    $id = campo($cuerpo, 'id', 60);
    $indice = -1;
    foreach ($cat['categorias'] as $i => $c) {
        if ($c['id'] === $id) { $indice = $i; }
    }
    if ($indice < 0) {
        salir(404, ['error' => 'La categoría ya no existe.']);
    }
    $enUso = [];
    foreach ($cat['productos'] as $p) {
        if ($p['category'] === $id) { $enUso[] = $p['name']; }
    }
    foreach ($cat['cambios'] as $idBase => $c) {
        if (($c['category'] ?? '') === $id) {
            $b = buscarBase($idBase);
            $enUso[] = $b ? $b['name'] : $idBase;
        }
    }
    if (count($enUso) > 0) {
        salir(409, [
            'error' => 'La categoría tiene ' . count($enUso) . ' producto(s): ' . implode(', ', array_slice($enUso, 0, 3))
                . (count($enUso) > 3 ? '…' : '') . '. Cambiales la categoría antes de borrarla.',
        ]);
    }
    array_splice($cat['categorias'], $indice, 1);
    guardarCatalogo($cat);
    salir(200, ['ok' => true]);
}

salir(404, ['error' => 'Acción desconocida.']);
