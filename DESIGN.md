# Design System — Distrijam S.A.

## Visual World & Mode

- **Surface Mode (ERP & Portal Cliente)**: `Operate` — estación de trabajo industrial B2B con claridad operativa de alto contraste, densidad controlada y precisión tabular.
- **Public Storefront (`index.html`, `catalogo.html`, `producto.html`)**: conserva el sistema de marca existente de Distrijam (fondo claro `#F4F6F8`, tarjetas `#FFFFFF`, acento carmesí `#C0392B`, soporte multi-tema).

## Color System (ERP & Portal)

- **Workspace Ground**: `#F4F5F7` (`--erp-bg`)
- **Surface / Panel**: `#FFFFFF` (`--erp-surface`)
- **Secondary Surface / Table Header**: `#F8FAFC` (`--erp-surface-2`)
- **Navigation Rail (Sidebar)**: `#111318` (`--erp-sidebar`), hover `#1B1F27`, borde `#232833`
- **Borders**: `#E2E8F0` (`--erp-border`), fuerte `#CBD5E1` (`--erp-border-strong`)
- **Text Hierarchy**:
  - Primario: `#0F172A` (`--erp-ink`)
  - Secundario: `#475569` (`--erp-ink-dim`)
  - Atenuado: `#64748B` (`--erp-ink-muted`)
- **Brand & Semantic Accents**:
  - Primario Distrijam: `#C0392B` (`--erp-accent`) / hover `#A93226`
  - Éxito / Disponible / Pagado: `#15803D` (`--erp-ok`) sobre `#15803D1C`
  - Advertencia / Saldo Deudor / Stock Bajo: `#B45309` (`--erp-warn`) sobre `#D977061F`
  - Información / En Curso: `#1D4ED8` (`--erp-info`) sobre `#2563EB1C`
  - Peligro / Crítico / Anulado: `#B91C1C` (`--erp-danger`) sobre `#DC26261A`

## Typography & Numerals

- **Font Family**: `'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Code / SKUs / CUITs / Comprobantes**: `ui-monospace, SFMono-Regular, Menlo, monospace`
- **Tabular Numerals**: `font-variant-numeric: tabular-nums` aplicado en todas las columnas numéricas, precios, stocks, bultos, CUITs y totales.

## Layout & Components

- **Shell ERP**: barra lateral fija de `248px` (colapsable off-canvas en pantallas `<=920px`) + barra superior adhesiva con título directo, omnibar de búsqueda global (`Ctrl+K`), indicadores de conexión y acción primaria `+ Nueva Venta`.
- **Tarjetas y Paneles**: bordes `1px solid #E2E8F0`, radios `8px`–`12px`, sombras suaves con offset vertical real (`0 2px 6px rgba(15, 23, 42, 0.06)`). Sin bordes laterales gruesos coloreados, sin kickers ni texto con gradiente.
- **Impresión & Etiquetas (`erp-print.js`)**:
  - **Documentos A4**: `@page { size: A4; margin: 12mm; }` para Presupuesto X, Remito R, Factura/Nota A-B-C, Recibo Oficial X y Resumen de Cuenta Corriente.
  - **Etiquetas Térmicas (`100 × 150 mm`)**: `@page { size: 100mm 150mm; margin: 0; }`, tipografía de alto contraste, barra invertida de Localidad/Provincia, indicador grande `BULTO X / N`, código de barras Code 128B y QR SVG vectoriales.
  - **Etiquetas A4**: grilla automática de `1`, `2` o `4` etiquetas por carilla con guías de corte punteadas.
