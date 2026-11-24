#!/bin/sh
# Pruebas del ABM del catálogo: levanta el sitio en un PHP local con datos
# vacíos y una contraseña de prueba, y corre las dos baterías:
#   api.test.js  -> la API (permisos, validaciones, altas, bajas, cambios)
#   abm.test.js  -> el panel y las páginas, como los usaría una persona
#
# Requisitos: node 18+, PHP 8 (php en el PATH o PHP=/ruta/a/php) y una vez
# `npm install` dentro de tests/.  Uso: sh tests/correr.sh
DIR=$(cd "$(dirname "$0")" && pwd)
SITIO=$(dirname "$DIR")
PHP=${PHP:-php}
PUERTO=${PUERTO:-8098}
TMP=$(mktemp -d)

mkdir -p "$TMP/public_html" "$TMP/datos_distrijam"
cp "$SITIO"/*.html "$SITIO"/*.js "$SITIO"/*.css "$SITIO"/*.php "$SITIO"/productos.json "$TMP/public_html/"
"$PHP" -r 'echo password_hash("prueba123", PASSWORD_DEFAULT);' > "$TMP/datos_distrijam/clave_admin.txt"

"$PHP" -S "127.0.0.1:$PUERTO" -t "$TMP/public_html" > "$TMP/servidor.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1

R=0
node "$DIR/api.test.js" "http://127.0.0.1:$PUERTO/" "$TMP/datos_distrijam" || R=1
rm -rf "$TMP/datos_distrijam/catalogo.json" "$TMP/datos_distrijam/imagenes_catalogo"
node "$DIR/abm.test.js" "$TMP/public_html" "http://127.0.0.1:$PUERTO/" || R=1
rm -rf "$TMP/datos_distrijam"/*.json "$TMP/datos_distrijam/imagenes_catalogo" "$TMP/datos_distrijam/comprobantes_archivos"
node "$DIR/erp.test.js" "http://127.0.0.1:$PUERTO/" || R=1

AVISOS=$(grep -c "PHP \(Warning\|Notice\|Fatal\|Deprecated\)" "$TMP/servidor.log")
echo "Avisos de PHP: $AVISOS"
[ "$AVISOS" = "0" ] || { grep "PHP " "$TMP/servidor.log" | head -5; R=1; }
exit $R
