# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Administración / Dirección (rol `admin`)**: gestiona precios, finanzas, bancos, cartera de cheques, usuarios, facturación, saldos iniciales y configuración general de Distrijam S.A.
- **Ventas y Facturación (rol `ventas`)**: cotiza pedidos recibidos desde el catálogo web o mostrador, confirma ventas, gestiona clientes y cuentas corrientes, emite presupuestos/remitos/facturas y registra cobros.
- **Depósito y Expedición (rol `deposito`)**: arma pedidos, controla e ingresa stock por SKU/variante, ejecuta tareas asignadas e imprime etiquetas logísticas para cajas en térmica 100×150 mm o A4.
- **Clientes Mayoristas y Ferreterías B2B**: consultan el catálogo público, envían solicitudes de cotización por WhatsApp/web y consultan su Estado de Cuenta y comprobantes a través de un enlace único seguro (`estado-cuenta.html?t=...`).

## Product Purpose

Unificar en una sola plataforma web comercial y operativa todo el flujo de Distrijam S.A.: catálogo público con cotizador web, panel de pedidos, gestión de ventas, control de stock, facturación y comprobantes, cuentas corrientes con portal seguro para clientes, impresión de etiquetas para cajas, gestión de tareas operativas y control financiero de caja, bancos y cheques.

## Positioning

Sistema diseñado a medida para la operatoria real de distribución mayorista de bulonería y fijaciones en Argentina (múltiples variantes por medida/presentación, Listas de Precios importadas desde Excel/CSV sin exponer costos ni precios al público, remitos/presupuestos X/facturas A-B-C, etiquetas por bulto con transporte/expreso y cuentas corrientes compartibles por WhatsApp), corriendo sobre el mismo hosting PHP + JSON privado fuera de `public_html`.

## Operating Context

- **Empresa**: `DISTRIJAM S.A.` — Iberá 1740, Corrientes, Argentina — CUIT `30-71566968-0` — IVA Responsable Inscripto — Tel. `3794 007195`.
- **Entorno técnico**: Hosting compartido (Ferozo) desplegado vía GitHub Actions FTPS a `./public_html/`, con datos sensibles almacenados fuera de `public_html` en `dirname(__DIR__) . '/datos_distrijam'` mediante JSON atómicos con `flock(LOCK_EX)`.
- **Modo dual**: opera contra `api.php` en producción/servidor PHP y soporta fallback local en `localStorage` para vistas previas estáticas sin servidor.

## Capabilities and Constraints

- Precios mayoristas, costos de stock, finanzas y datos fiscales completos jamás se exponen en endpoints públicos ni en `productos.json`.
- El catálogo público puede mostrar opcionalmente disponibilidad (`Disponible` / `Consultar entrega`) sin revelar cantidades exactas ni precios.
- Facturación contempla comprobantes internos (`Presupuesto X`, `Remito R`, `Recibo X`) y registro/control de comprobantes fiscales (`Factura A/B/C`, `Nota de Crédito/Débito A/B/C`) con adjunto PDF y Libro IVA Ventas CSV; la emisión electrónica directa con certificados ARCA/AFIP en vivo queda preparada como evolución futura.
- Retrocompatibilidad estricta con el ABM del catálogo, recepción de pedidos (`pedidos.php`), actualizador de precios (`actualizar-precios.html`) y suite de pruebas automatizadas (`tests/api.test.js`, `tests/abm.test.js`).

## Brand Commitments

- **Identidad visual**: Distrijam S.A. — marca consolidada en torno a rojo carmesí (`#C0392B`), acero grafito (`#111318`) y superficies claras limpias de alta legibilidad industrial, usando el logo oficial `Logo/LogoDistrijamCompleto.png` y tipografía `Inter` con numerales tabulares.

## Evidence on Hand

- Catálogo base en `productos.json` y fotos de producto en `imagenes/`.
- Logos oficiales en `Logo/LogoDistrijamCompleto.png` y `Logo/logo-distrijam.png`.
- Motor de importación de planillas `.xlsx`/`.csv` en `actualizar-precios.html` y `actualizar-precios.js`.
- Receptor de pedidos en `pedidos.php` y panel/cotizador existente en `admin.html`, `admin.js`, `cotizador.js`.

## Product Principles

1. **Un solo flujo sin doble carga**: un pedido web se cotiza, se convierte en venta, descuenta stock, genera tarea de armado en depósito, imprime etiquetas de cajas, impacta cuenta corriente y registra cobros en finanzas.
2. **Privacidad y seguridad por defecto**: cada endpoint verifica sesión y rol; los clientes solo acceden a sus propios comprobantes mediante token criptográfico de 32 caracteres hexadecimales.
3. **Claridad operativa y precisión numérica**: tablas densas pero limpias, numerales tabulares alineados, estados semánticos inequívocos y cero ruido decorativo.
4. **Impresión lista para depósito y mostrador**: documentos A4 y etiquetas térmicas 100×150 mm / A4 con códigos QR y barras Code 128B vectoriales sin dependencias externas.

## Accessibility & Inclusion

- Navegación por teclado completa, foco visible de alto contraste, contraste mínimo WCAG AA (`≥4.5:1` en texto normal), labels explícitos en todos los formularios y soporte responsive para escritorio, tablet de depósito y celular.
