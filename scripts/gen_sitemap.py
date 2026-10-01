"""Genera sitemap.xml con el inicio, el catálogo y una URL por producto.

Lo corre el despliegue (deploy.yml) antes de subir, así el sitemap siempre
refleja el productos.json publicado. A mano: python scripts/gen_sitemap.py
"""
import json
import pathlib
from datetime import date
from urllib.parse import quote
from xml.sax.saxutils import escape

BASE = 'https://distrijam.com.ar/'
raiz = pathlib.Path(__file__).resolve().parent.parent

productos = json.loads((raiz / 'productos.json').read_text(encoding='utf-8'))
hoy = date.today().isoformat()

urls = [(BASE, '1.0'), (BASE + 'catalogo.html', '0.9')]
urls += [(BASE + 'producto.html?id=' + quote(p['id']), '0.7') for p in productos]

lineas = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for url, prioridad in urls:
    lineas.append(f'  <url><loc>{escape(url)}</loc><lastmod>{hoy}</lastmod>'
                  f'<priority>{prioridad}</priority></url>')
lineas.append('</urlset>')

(raiz / 'sitemap.xml').write_text('\n'.join(lineas) + '\n', encoding='utf-8')
print(f'sitemap.xml: {len(urls)} URLs')
