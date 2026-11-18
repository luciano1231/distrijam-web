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
import unicodedata

ARCHIVO = "Archivo del proveedor Google (2).xlsx"
HOJA = "Productos"

# Columnas de la hoja "Productos" (1-based).
# Ojo: respecto del archivo viejo hay una columna "Imagen" en la 5 que corre
# todo lo que viene después un lugar.
COL_CODIGO = 3
COL_CATEGORIA = 4
COL_IMAGEN = 5
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

# Carpetas donde se busca el archivo que figura en la columna "Imagen"
CARPETAS_IMAGENES = ["imagenes/Fotos Productos", "imagenes"]
EXTENSIONES = ["", ".jpg", ".jpeg", ".png", ".webp"]

# Mapeos de nombres de Excel con diferencias respecto a los nombres de archivo en disco
ALIAS_IMAGENES = {
    'buloncabezaredondacuellocuadrado': 'BULON CABEZA REDONDA CON CUELLO CUADRADO.jpg',
    'bulongrado88': 'BULON GRADO 8.jpg',
    'dryfresada4placas': 'FRESADA 4 PLACAS.jpg',
    'ht2max': 'Hexagonal Tipo 2 Maxx.jpg',
    'panframing': 'TEL PAN FRAMING.jpg',
    'tornillotanque': 'TANQUE.jpg',
    'dryt2agujanegro': 'DRY T2 AGUJA.webp',
    'dryt3agujanegro': 'DRY T3 AGUJA.webp',
    'dryt4agujanegro': 'DRY T4 AGUJA.jpg',
    'dryt2mechanegro': 'DRY T2 MECHA.webp',
    'dryt3mechazinc': 'DRY T3 MECHA.jpg',
    'ganchoptejido': 'GANCHO P TEJIDO.webp',
    'ganchoj': 'GANCHO J.webp',
    'hexagonaltipo2puntacaladap17': 'Hexagonal Tipo 2 Punta Calada P17_.jpg',
    'tirafondohexagonal': 'TIRAFONDO.webp',
    'drywallt1agujanegro': 'DRY T1 AGUJA NEGRA.webp',
    'fixmaderadorado': 'FIX Madera dorado.jpg',
    'tuercaautofrenante': 'Tuerca Autofrenante.jpg',
    'tuercagrado2': 'Tuerca Grado 2.jpg',
    'tarugosintope': 'Tarugo sin tope.jpg',
    'telhelix': 'HELIX.jpg',
    'hexagonaltipo2maderamecha': 'HT2 MADERA MECHA.jpg',
    'pitoncontopeabierto': 'PITON ABIERTO CON TOPE.jpg',
    'pitoncontopecerrado': 'PITON CERRADO CON TOPE.webp',
    'pitoncontopeescuadra': 'PITON ESCUADRA CON TOPE.webp',
    'pitonsintopeabierto': 'PITON ABIERTO SIN TOPE.webp',
    'pitonsintopecerrado': 'PITON CERRADO SIN TOPE.webp',
    'pitonsintopeescuadra': 'PITON ESCUADRA SIN TOPE.webp',
    'tuercagrado88': 'TUERCA GRADO 8.webp',
}

def _normalizar_clave(texto):
    s = unicodedata.normalize('NFKD', str(texto))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-zA-Z0-9]', '', s).lower()

_ARCHIVOS_EN_DISCO = None

def _indexar_archivos():
    global _ARCHIVOS_EN_DISCO
    if _ARCHIVOS_EN_DISCO is not None:
        return _ARCHIVOS_EN_DISCO
    _ARCHIVOS_EN_DISCO = {}
    for carpeta in CARPETAS_IMAGENES:
        if os.path.isdir(carpeta):
            for f in os.listdir(carpeta):
                ruta = f"{carpeta}/{f}"
                if os.path.isfile(ruta):
                    stem, _ = os.path.splitext(f)
                    _ARCHIVOS_EN_DISCO[f] = ruta
                    _ARCHIVOS_EN_DISCO[stem] = ruta
                    clave = _normalizar_clave(stem)
                    if clave not in _ARCHIVOS_EN_DISCO:
                        _ARCHIVOS_EN_DISCO[clave] = ruta
    return _ARCHIVOS_EN_DISCO

def resolver_imagen(nombre):
    """Devuelve la ruta relativa real del archivo de la columna Imagen, o None si no existe."""
    if not nombre:
        return None
    nombre_str = str(nombre).strip()
    indice = _indexar_archivos()
    clave = _normalizar_clave(nombre_str)
    if clave in ALIAS_IMAGENES:
        alias_f = ALIAS_IMAGENES[clave]
        if alias_f in indice:
            return indice[alias_f]
    if nombre_str in indice:
        return indice[nombre_str]
    for ext in EXTENSIONES:
        con_ext = f"{nombre_str}{ext}"
        if con_ext in indice:
            return indice[con_ext]
    if clave in indice:
        return indice[clave]
    return None

# Errores de tipeo en la columna "Producto" de la planilla que partirian un producto en dos
CORRECCION_NOMBRES = {
    "TUERCA GRAGO 5 DORADA": "TUERCA GRADO 5 DORADA",
    "TORILLO CAB. TANQUE C/TUERCA": "TORNILLO CAB. TANQUE C/TUERCA",
    "BULON G2": "BULON GRADO 2 ZINCADO",
    "FIX": "FIX MADERA DORADO",
}

# Presentaciones que el proveedor cambio sin actualizar el texto de la planilla
# (se deduce del precio nuevo comparado con las medidas vecinas).
# clave: codigo, valor: (cantidad que dice la planilla, cantidad real)
CORRECCION_PRESENTACION = {
    "040514": ("1 U.", "100 U."),
    "040516": ("1 U.", "100 U."),
    "040518": ("1 U.", "100 U."),
    "040520": ("1 U.", "100 U."),
    "040522": ("1 U.", "10 U."),
    "04011": ("100 U.", "1 U."),
    "04017/8": ("100 U.", "1 U."),
    "04037/8": ("100 U.", "1 U."),
    "04047/8": ("100 U.", "10 U."),
    "09061": ("100 UNID.", "10 UNID."),
    "090611/8": ("100 UNID.", "10 UNID."),
    "090611/4": ("100 UNID.", "10 UNID."),
    "090613/8": ("100 UNID.", "10 UNID."),
    "090611/2": ("100 UNID.", "10 UNID."),
    "09067/8": ("100 UNID.", "10 UNID."),
    "090615/8": ("1 UNID.", "10 UNID."),
    "090617/8": ("1 UNID.", "10 UNID."),
    "09062": ("1 UNID.", "10 UNID."),
    "09071": ("100 UNID.", "10 UNID."),
    "09077/8": ("100 UNID.", "10 UNID."),
}


def corregir_presentacion(codigo, presentacion, descripcion):
    if codigo not in CORRECCION_PRESENTACION:
        return presentacion, descripcion
    vieja, nueva = CORRECCION_PRESENTACION[codigo]
    if presentacion.startswith(vieja):
        presentacion = nueva + presentacion[len(vieja):]
    descripcion = descripcion.replace(f"X {vieja}", f"X {nueva}", 1)
    return presentacion, descripcion


# Codigos mal cargados en la planilla que pisarian a otra variante
# clave: (codigo de la planilla, medida), valor: codigo correcto
CORRECCION_CODIGOS = {
    ("09074MM", "5/32"): "09075/32",
}

# Fotos nuevas (renders de TEL) y su esquema tecnico, en imagenes/Fotos Nuevas.
# Cada nombre de la columna "Imagen" arma la galeria de la ficha: la primera es la
# foto principal. "nueva:X" es un archivo de imagenes/Fotos Nuevas (sin la extension);
# cualquier otro texto se busca como siempre en imagenes/Fotos Productos.
# Las variantes negras siguen con su foto de antes (el render nuevo es zinc) y
# solo suman el esquema.
GALERIAS = {
    "Tornillo con Alas": ["nueva:ALAS", "nueva:ALAS ESQUEMA"],
    "Bulon Cabeza Redonda Cuello Cuadrado": ["nueva:BULON CABEZ RED CCC"],
    "CUT": ["nueva:CUT", "nueva:CUT ESQUEMA"],
    "DECK": ["nueva:DECK MECHA"],
    "DRY T1 AGUJA ZINC": ["nueva:DRY T1 AGUJA", "nueva:DRY T1 AGUJA ESQUEMA"],
    "Drywall T1 Aguja Negro": ["Drywall T1 Aguja Negro", "nueva:DRY T1 AGUJA ESQUEMA"],
    "DRY T1 MECHA ZINC": ["nueva:DRY T1 MECHA", "nueva:DRY T1 MECHA ESQUEMA"],
    "DRY T1 MECHA NEGRO": ["DRY T1 MECHA NEGRO", "nueva:DRY T1 MECHA ESQUEMA"],
    "DRY T2 AGUJA NEGRO": ["nueva:DRY T2 AGUJA", "nueva:DRY T2 AGUJA ESQUEMA"],
    "DRY T2 MECHA ZINC": ["nueva:DRY T2 MECHA", "nueva:DRY T2 MECHA ESQUEMA"],
    "DRY T2 MECHA NEGRO": ["DRY T2 MECHA NEGRO", "nueva:DRY T2 MECHA ESQUEMA"],
    "DRY T3 AGUJA NEGRO": ["nueva:DRY T3 AGUJA", "nueva:DRY T3 AGUJA ESQUEMA"],
    "DRY T3 MECHA ZINC": ["nueva:DRY T3 MECHA", "nueva:DRY T3 MECHA ESQUEMA"],
    "DRY T3 MECHA NEGRO": ["DRY T3 MECHA NEGRO", "nueva:DRY T3 MECHA ESQUEMA"],
    "DRY T4 AGUJA NEGRO": ["nueva:DRY T4 AGUJA", "nueva:DRY T4 AGUJA ESQUEMA"],
    "DRY PCL AGUJA": ["nueva:DRY PCL AGUJA", "nueva:DRY PCL AGUJA ESQUEMA"],
    "DRY PCL MECHA": ["nueva:DRY PCL MECHA", "nueva:DRY PCL MECHA ESQUEMA"],
    "DRY FRESADA 4 PLACAS": ["nueva:FRESADA 4 PLACAS", "nueva:FRESADA 4 PLACAS ESQUEMA"],
    "TEL Helix": ["nueva:HELIX", "nueva:HELIX ESQUEMA"],
    "Hexagonal Tipo 1": ["nueva:HEX T1", "nueva:HEX T1 ESQUEMA"],
    "Hexagonal Tipo 2": ["nueva:HEX T2", "nueva:HEX T2 ESQUEMA"],
    "HT2 MAX": ["nueva:HEX T2 MECHA MAX", "nueva:HEX T2 MECHA MAX ESQUEMA"],
    "Hexagonal Tipo 2 Punta Calada P17": ["nueva:HEX T2 CALADA P17", "nueva:HEX T2 CALADA P17 ESQUEMA"],
    "Hexagonal Tipo 2 Madera-Aguja": ["nueva:HEX T2 MADERA AGUJA", "nueva:HEX T2 MADERA AGUJA ESQUEMA"],
    "Hexagonal Tipo 2 Madera-Mecha": ["nueva:HEX T2 MADERA MECHA", "nueva:HEX T2 MADERA MECHA ESQUEMA"],
    "PANFRAMING": ["nueva:PHIL PANFRAMING", "nueva:PHIL PANFRAMING ESQUEMA"],
    "Parker": ["nueva:PARKER", "nueva:PARKER ESQUEMA"],
    "Phillips mecha": ["nueva:PHIL MECHA", "nueva:PHIL MECHA ESQUEMA"],
    "PHIL ALUMINIO": ["nueva:PHIL ALUMINIO", "nueva:PHIL ALUMINIO ESQUEMA"],
    "PHIL FRESADA": ["nueva:PHIL FRESADA", "nueva:PHIL FRESADA ESQUEMA"],
    "Tarugo con tope": ["nueva:TARUGO CON TOPE", "nueva:TARUGO CON TOPE ESQUEMA"],
    "Tarugo sin tope": ["nueva:TARUGO SIN TOPE", "nueva:TARUGO SIN TOPE ESQUEMA"],
    "Tarugo para ladrillo hueco con tope": ["nueva:TARUGO LADRILLO HUECO", "nueva:TARUGO LADRILLO HUECO ESQUEMA"],
    "Tirafondo hexagonal": ["nueva:TIRAFONDO", "nueva:TIRAFONDO ESQUEMA"],
    "WAFER": ["nueva:WAFER", "nueva:WAFER ESQUEMA"],
    "WALL TORX": ["nueva:WALL B", "nueva:WALL A", "nueva:WALL ESQUEMA"],
    # La planilla pone "CHIPBOARD" y "FIX Madera" a todo: dorado y negro se separan por producto (IMAGEN_FORZADA)
    "CHIPBOARD DORADO": ["nueva:CHIP", "nueva:CHIP ESQUEMA"],
    "CHIPBOARD NEGRO": ["CHIP NEGRO", "nueva:CHIP ESQUEMA"],
    "FIX Madera Dorado": ["nueva:FIX", "nueva:FIX ESQUEMA"],
    "FIX Madera Negro": ["FIX Madera Negro", "nueva:FIX ESQUEMA"],
    "FIX Madera": ["nueva:FIX", "nueva:FIX ESQUEMA"],
}
CARPETA_NUEVAS = "imagenes/Fotos Nuevas"
MAX_GALERIA = 4


def resolver_galeria(nombres):
    """Rutas de las fotos de un producto a partir de los nombres de la columna Imagen.
    Devuelve (rutas, fuentes que no se encontraron)."""
    claves = {_normalizar_clave(k): v for k, v in GALERIAS.items()}
    rutas, faltan = [], []
    for nombre in nombres:
        fuentes = claves.get(_normalizar_clave(nombre))
        if fuentes is None:
            fuentes = [nombre]
        for fuente in fuentes:
            if fuente.startswith("nueva:"):
                ruta = f"{CARPETA_NUEVAS}/{fuente[6:]}.png"
                if not os.path.isfile(ruta):
                    ruta = None
            else:
                ruta = resolver_imagen(fuente)
            if ruta is None:
                faltan.append(fuente)
            elif ruta not in rutas:
                rutas.append(ruta)
    # Primero todas las fotos y al final los esquemas
    rutas.sort(key=lambda r: r.endswith(" ESQUEMA.png"))
    return rutas[:MAX_GALERIA], faltan


# Productos que deben usar una imagen puntual aunque la planilla diga otra
# (clave: id del producto, valor: nombre de la imagen como en la columna "Imagen")
IMAGEN_FORZADA = {
    "chipboard-madera-dorado": "CHIPBOARD DORADO",
    "chipboard-madera-negro": "CHIPBOARD NEGRO",
    "fix-madera-dorado": "FIX Madera Dorado",
    "fix-madera-negro": "FIX Madera Negro",
    "tarugo-para-ladrillo-hueco-n-6-con-tope": "Tarugo para ladrillo hueco con tope",
    "tarugo-para-ladrillo-hueco-n-8-con-tope": "Tarugo para ladrillo hueco con tope",
}

# Filas que el proveedor usa como marca interna y no son productos reales
NO_PUBLICAR = {"este no va"}

# Codigos que siguen en la planilla pero no se publican en el sitio
CODIGOS_EXCLUIDOS = {
    "1201FNAL10X11/2", "1201FNAL8X11/4", "09071/2", "1101FNT1A8X916Z", "1101FNT1M8X1Z",
    "1101FNT1M8X1/2Z", "1101FNT1M8X3/4Z", "1101FNT1M8X916N", "1101FNT1M8X916Z", "1101FNT26X1",
    "1101FNT36X11/2", "1712X4DG", "1701FN10X11/2DG", "1701FN10X11/2NG", "1701FN10X13/4DG",
    "1701FN10X13/4NG", "1701FN10X2DG", "1701FN10X2NG", "1701FN10X21/2DG", "1701FN10X21/2NG",
    "1701FN10X3DG", "1701FN10X3NG", "1701FN6X1DG", "1701FN6X1NG", "1701FN6X11/2DG",
    "1701FN6X11/2NG", "1701FN6X11/4DG", "1701FN6X11/4NG", "1701FN6X13/4DG", "1701FN6X13/4NG",
    "1701FN6X13/8DG", "1701FN6X13/8NG", "1701FN6X15/8DG", "1701FN6X15/8NG", "1701FN6X2DG",
    "1701FN6X2NG", "1701FN6X3/4DG", "1701FN6X3/4NG", "1701FN6X5/8DG", "1701FN6X5/8NG",
    "1701FN8X11/2DG", "1701FN8X11/2NG", "1701FN8X13/4DG", "1701FN8X13/4NG", "1701FN8X2DG",
    "1701FN8X2NG", "1701FN8X21/2DG", "1701FN8X21/2NG", "1701FN8X3/4DG", "1701FN8X3/4NG",
    "100414X1", "100414X11/2", "100414X2", "100414X21/2", "100414X3",
    "1501FNPAF7X7/16", "1201FNAL10X2",
}


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
    excluidos = 0

    for r in range(2, hoja.max_row + 1):
        nombre = texto(hoja.cell(r, COL_PRODUCTO).value)
        if not nombre or nombre.lower() in NO_PUBLICAR:
            continue

        if texto(hoja.cell(r, COL_CODIGO).value) in CODIGOS_EXCLUIDOS:
            excluidos += 1
            continue

        nombre = CORRECCION_NOMBRES.get(nombre, nombre)
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
                "_imagenes": [],
            }

        p = productos[pid]

        # Si quedó sin resolver, un renglón posterior puede aportar la categoría
        if p["category"] == "otros":
            resuelta = id_categoria(hoja.cell(r, COL_CATEGORIA).value, nombre)
            if resuelta != "otros":
                p["category"] = resuelta

        # Una ficha junta las fotos de todos sus renglones (p.ej. variantes zinc y negro)
        nombre_imagen = IMAGEN_FORZADA.get(pid) or texto(hoja.cell(r, COL_IMAGEN).value)
        if nombre_imagen and nombre_imagen not in p["_imagenes"]:
            p["_imagenes"].append(nombre_imagen)
        if not p["description"]:
            p["description"] = texto(hoja.cell(r, COL_DESC_PAGINA).value)
        if not p["features"]:
            p["features"] = texto(hoja.cell(r, COL_CARACTERISTICAS).value)
        if not p["applications"]:
            p["applications"] = texto(hoja.cell(r, COL_USOS).value)

        codigo = texto(hoja.cell(r, COL_CODIGO).value)
        codigo = CORRECCION_CODIGOS.get((codigo, texto(hoja.cell(r, COL_MEDIDA).value)), codigo)
        vid = codigo or f"{pid}-var-{len(p['_variantes']) + 1}"
        medida = texto(hoja.cell(r, COL_MEDIDA).value) or "Estándar"
        presentacion = texto(hoja.cell(r, COL_PRESENTACION).value)
        descripcion = texto(hoja.cell(r, COL_DESCRIPCION).value) or f"{nombre} {medida}"
        presentacion, descripcion = corregir_presentacion(codigo, presentacion, descripcion)

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

        # La columna "Imagen" del Excel manda sobre el reparto automático
        if p["_imagenes"]:
            rutas, faltan = resolver_galeria(p["_imagenes"])
            for f in faltan:
                print(f"  AVISO: no existe el archivo '{f}' ({p['name']})")
            if rutas:
                p["image"] = rutas[0]
                if len(rutas) > 1:
                    p["images"] = rutas
            else:
                print(f"  AVISO: {p['name']} queda con la imagen por defecto")
        del p["_imagenes"]

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
    print(f"  {excluidos} fila(s) omitidas por CODIGOS_EXCLUIDOS")
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
