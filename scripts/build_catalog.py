"""
Genera el catálogo del sitio a partir del archivo del proveedor.

Produce DOS archivos, y la separación es deliberada:

  productos.json  -> PÚBLICO. Lo descarga el navegador de cualquier visitante.
                     NUNCA debe contener precios.
  precios.json    -> PRIVADO. Sólo lo usa el panel de administración, que lo
                     importa desde la computadora del administrador. No se
                     publica (está en .gitignore) porque cualquier archivo
                     subido al servidor es visible para cualquiera.
"""

import openpyxl
import re
import json
import os

ARCHIVO = "Archivo del proveedor Distrijam.xlsx"
HOJA = "Productos"

# Columnas de la hoja "Productos" (1-based).
# Ojo: respecto del archivo viejo hay una columna "Imagen" en la 5 que corre
# todo lo que viene después un lugar.
COL_CODIGO = 3
COL_CATEGORIA = 4
COL_PRODUCTO = 6
COL_MARCA = 7
COL_MEDIDA = 8
COL_PRESENTACION = 9
COL_DESC_PAGINA = 10
COL_CARACTERISTICAS = 11
COL_USOS = 12
COL_DESCRIPCION = 13
COL_LISTA_1 = 19          # Precio de venta

# Las categorías del proveedor, normalizadas al id que usa el sitio.
CATEGORIAS = {
    "arandelas":        "arandelas",
    "autoperforantes":  "autoperforantes",
    "bulones":          "bulones",
    "ganchos":          "ganchos",
    "pitones":          "pitones",
    "remaches y clavos": "remaches-clavos",
    "tarugo":           "tarugos",
    "tarugos":          "tarugos",
    "tirafondo":        "tirafondos",
    "tirafondos":       "tirafondos",
    "tuercas":          "tuercas",
    "varillas":         "varillas",
}

TOTAL_IMAGENES = 32

# Filas que el proveedor usa como marca interna y no son productos reales
NO_PUBLICAR = {"este no va"}


def slugify(texto):
    texto = texto.lower()
    texto = re.sub(r'[^a-z0-9]+', '-', texto)
    return texto.strip('-')


def id_categoria(valor, nombre_producto):
    if valor:
        clave = str(valor).strip().lower()
        if clave in CATEGORIAS:
            return CATEGORIAS[clave]

    # Sin categoría utilizable, se deduce del nombre del producto
    p = (nombre_producto or "").upper()
    if any(k in p for k in ('WALL', 'FIX', 'DRY', 'PAM', 'ALAS', 'PHIL', 'PARKER', 'CHIPBOARD')):
        return 'autoperforantes'
    if 'GANCHO' in p: return 'ganchos'
    if 'PITON' in p: return 'pitones'
    if 'CLAVO' in p or 'REMACHE' in p: return 'remaches-clavos'
    if 'TUERCA' in p or 'TCA' in p: return 'tuercas'
    if 'VARILLA' in p: return 'varillas'
    if 'ARANDELA' in p: return 'arandelas'
    if 'BULON' in p: return 'bulones'
    if 'TARUGO' in p: return 'tarugos'
    if 'TIRAFONDO' in p or 'TIR' in p: return 'tirafondos'
    return 'otros'


def texto(celda):
    return str(celda).strip() if celda not in (None, "") else ""


def run():
    if not os.path.exists(ARCHIVO):
        print(f"Error: no se encontró '{ARCHIVO}' en el directorio raíz.")
        return

    print(f"Cargando {ARCHIVO}...")
    wb = openpyxl.load_workbook(ARCHIVO, data_only=True)
    if HOJA not in wb.sheetnames:
        print(f"Error: no se encontró la hoja '{HOJA}'. Hojas: {wb.sheetnames}")
        return

    hoja = wb[HOJA]
    print(f"Procesando {hoja.max_row} filas de la hoja '{HOJA}'...")

    productos = {}
    precios = {}
    sin_precio = 0

    for r in range(2, hoja.max_row + 1):
        nombre = texto(hoja.cell(r, COL_PRODUCTO).value)
        if not nombre or nombre.lower() in NO_PUBLICAR:
            continue

        pid = slugify(nombre)
        if pid not in productos:
            marca = texto(hoja.cell(r, COL_MARCA).value)
            marca = marca.replace("Tel®", "Telé").replace("Tel\xae", "Telé")
            productos[pid] = {
                "id": pid,
                "name": nombre,
                "category": id_categoria(hoja.cell(r, COL_CATEGORIA).value, nombre),
                "brand": marca,
                "description": "",
                "features": "",
                "applications": "",
                "_variantes": {},
            }

        p = productos[pid]

        # Si quedó sin resolver, un renglón posterior puede aportar la categoría
        if p["category"] == "otros":
            resuelta = id_categoria(hoja.cell(r, COL_CATEGORIA).value, nombre)
            if resuelta != "otros":
                p["category"] = resuelta

        if not p["description"]:
            p["description"] = texto(hoja.cell(r, COL_DESC_PAGINA).value)
        if not p["features"]:
            p["features"] = texto(hoja.cell(r, COL_CARACTERISTICAS).value)
        if not p["applications"]:
            p["applications"] = texto(hoja.cell(r, COL_USOS).value)

        codigo = texto(hoja.cell(r, COL_CODIGO).value)
        vid = codigo or f"{pid}-var-{len(p['_variantes']) + 1}"
        medida = texto(hoja.cell(r, COL_MEDIDA).value) or "Estándar"
        presentacion = texto(hoja.cell(r, COL_PRESENTACION).value)
        descripcion = texto(hoja.cell(r, COL_DESCRIPCION).value) or f"{nombre} {medida}"

        if vid not in p["_variantes"]:
            p["_variantes"][vid] = {
                "id": vid,
                "medida": medida,
                "presentacion": presentacion,
                "descripcion": descripcion,
            }
        else:
            v = p["_variantes"][vid]
            if not v["presentacion"] and presentacion:
                v["presentacion"] = presentacion

        # El precio va al archivo privado, indexado por el mismo id de variante
        bruto = hoja.cell(r, COL_LISTA_1).value
        try:
            valor = float(bruto)
        except (TypeError, ValueError):
            valor = 0.0
        if valor > 0:
            precios[vid] = round(valor, 2)
        else:
            sin_precio += 1

    ordenados = sorted(productos.values(), key=lambda x: x["name"])

    print(f"Distribuyendo las {TOTAL_IMAGENES} imágenes entre {len(ordenados)} productos...")
    for idx, p in enumerate(ordenados):
        n = (idx % TOTAL_IMAGENES) + 1
        if n == 1:
            p["image"] = "imagenes/Imagenes y tornillos para catalogo 900px.jpg"
        else:
            p["image"] = f"imagenes/Imagenes y tornillos para catalogo 900px{n}.jpg"

        if not p["description"]:
            p["description"] = f"{p['name']}. Consulte medidas y disponibilidad."
        if not p["features"]:
            p["features"] = "Consulte características técnicas de este producto."
        if not p["applications"]:
            p["applications"] = "Ideal para fijaciones generales y uso industrial según medida."

        p["variants"] = list(p["_variantes"].values())
        del p["_variantes"]

    with open("productos.json", "w", encoding="utf-8") as f:
        json.dump(ordenados, f, indent=2, ensure_ascii=False)

    variantes = sum(len(p["variants"]) for p in ordenados)
    print(f"productos.json -> {len(ordenados)} productos, {variantes} variantes (sin precios)")

    with open("precios.json", "w", encoding="utf-8") as f:
        json.dump({
            "generado": ARCHIVO,
            "columna": "Lista 1",
            "precios": precios,
        }, f, indent=2, ensure_ascii=False)

    print(f"precios.json   -> {len(precios)} precios (PRIVADO, no se publica)")
    if sin_precio:
        print(f"  aviso: {sin_precio} fila(s) sin precio en 'Lista 1'")

    reparto = {}
    for p in ordenados:
        reparto[p["category"]] = reparto.get(p["category"], 0) + 1
    print("\nProductos por categoría:")
    for cat, n in sorted(reparto.items(), key=lambda x: -x[1]):
        print(f"  {cat:18} {n}")


if __name__ == "__main__":
    run()
