const fs = require('fs');
const IMG_BASE = 'imagenes/Imagenes y tornillos para catalogo 900px';
const DEFAULT_PRODUCTS = [
  { id: 1, name: 'Tuerca Hexagonal Bicromada M6', category: 'tuercas', description: 'Tuerca hexagonal galvanizada en bicromado amarillo. Alta resistencia a la corrosión. Norma DIN 934.', image: `${IMG_BASE}.jpg` },
  { id: 2, name: 'Tuerca Hexagonal Inoxidable M8', category: 'tuercas', description: 'Tuerca hexagonal en acero inoxidable A2. Ideal para ambientes húmedos y corrosivos. Norma DIN 934.', image: `${IMG_BASE}2.jpg` },
  { id: 3, name: 'Tuerca Hexagonal M10 Zincada', category: 'tuercas', description: 'Tuerca hexagonal zincada en caliente. Resistente al óxido y la corrosión.', image: `${IMG_BASE}3.jpg` },
  { id: 4, name: 'Tuerca Hexagonal M12 Negra', category: 'tuercas', description: 'Tuerca hexagonal acabado negro. Alta resistencia mecánica. Ideal para estructuras metálicas.', image: `${IMG_BASE}4.jpg` },
  { id: 5, name: 'Arandela Plana M6 Zincada', category: 'tuercas', description: 'Arandela plana zincada para distribución de carga. Compatible con tornillos M6. Norma DIN 125.', image: `${IMG_BASE}5.jpg` },
  { id: 6, name: 'Arandela de Presión M8', category: 'tuercas', description: 'Arandela de presión (grower) para evitar el aflojamiento. Acero templado zincado. M8.', image: `${IMG_BASE}6.jpg` },
  { id: 7, name: 'Tuerca Mariposa M6', category: 'tuercas', description: 'Tuerca mariposa para apriete manual. Acero zincado. Sin necesidad de herramientas.', image: `${IMG_BASE}7.jpg` },
  { id: 8, name: 'Arandela Cónica Inoxidable M10', category: 'tuercas', description: 'Arandela cónica en acero inoxidable A2. Para sellado y distribución de cargas.', image: `${IMG_BASE}8.jpg` },
  { id: 9, name: 'Tirafondo Hexagonal 6×40', category: 'bulones', description: 'Tirafondo para madera con cabeza hexagonal. Acero zincado. 6×40mm. Ideal para estructuras de madera.', image: `${IMG_BASE}9.jpg` },
  { id: 10, name: 'Bulón Hexagonal M8×50 Zincado', category: 'bulones', description: 'Bulón de cabeza hexagonal M8×50mm. Acero zincado. Con tuerca y arandela. Norma DIN 933.', image: `${IMG_BASE}10.jpg` },
  { id: 11, name: 'Bulón M10×60 Inoxidable', category: 'bulones', description: 'Bulón hexagonal M10×60mm en acero inoxidable A2. Alta resistencia a la corrosión.', image: `${IMG_BASE}11.jpg` },
  { id: 12, name: 'Tirafondo Cabeza Redonda 8×70', category: 'bulones', description: 'Tirafondo con cabeza redonda para madera. Acero galvanizado. 8×70mm. Rosca gruesa para mayor agarre.', image: `${IMG_BASE}12.jpg` },
  { id: 13, name: 'Bulón M12×80 Alta Resistencia', category: 'bulones', description: 'Bulón hexagonal M12×80mm. Acero de alta resistencia clase 8.8. Bicromado amarillo.', image: `${IMG_BASE}13.jpg` },
  { id: 14, name: 'Tirafondo Hexagonal 10×100', category: 'bulones', description: 'Tirafondo pesado para madera y materiales compuestos. 10×100mm. Acero zincado.', image: `${IMG_BASE}14.jpg` },
  { id: 15, name: 'Bulón Carruaje M10×80', category: 'bulones', description: 'Bulón carruaje (cabeza redonda con cuello cuadrado). M10×80mm. Acero zincado. Norma DIN 603.', image: `${IMG_BASE}15.jpg` },
  { id: 16, name: 'Bulón Allen M8×40 Inoxidable', category: 'bulones', description: 'Bulón de cabeza Allen M8×40mm en acero inoxidable A2. Para uniones visibles de calidad.', image: `${IMG_BASE}16.jpg` },
  { id: 17, name: 'Autoperforante HEX + Arandela 4.8×19', category: 'autoperforantes', description: 'Tornillo autoperforante hexagonal con arandela neoprene integrada. 4.8×19mm. Para chapas.', image: `${IMG_BASE}17.jpg` },
  { id: 18, name: 'Autoperforante Cabeza Plana 4×25', category: 'autoperforantes', description: 'Tornillo autoperforante cabeza plana con ranura Phillips. 4×25mm. Estructuras metálicas livianas.', image: `${IMG_BASE}18.jpg` },
  { id: 19, name: 'Autoperforante Wafer 4.2×13', category: 'autoperforantes', description: 'Autoperforante cabeza wafer con ranura Phillips. 4.2×13mm. Ideal para drywall y perfiles metálicos.', image: `${IMG_BASE}19.jpg` },
  { id: 20, name: 'Autoperforante Inoxidable 4.8×25', category: 'autoperforantes', description: 'Tornillo autoperforante en acero inoxidable A2. 4.8×25mm. Para ambientes corrosivos.', image: `${IMG_BASE}20.jpg` },
  { id: 21, name: 'Autoperforante HEX EPDM 5.5×32', category: 'autoperforantes', description: 'Autoperforante hexagonal con arandela EPDM para sellado. 5.5×32mm. Para techos y cerramientos.', image: `${IMG_BASE}21.jpg` },
  { id: 22, name: 'Autoperforante Cabeza Oval 3.9×25', category: 'autoperforantes', description: 'Autoperforante cabeza oval con ranura Phillips. 3.9×25mm. Acabado zincado. Láminas delgadas.', image: `${IMG_BASE}22.jpg` },
  { id: 23, name: 'Autoperforante Punta Broca 4.8×38', category: 'autoperforantes', description: 'Tornillo autoperforante tipo punta broca para acero de mayor espesor. 4.8×38mm. Bicromado.', image: `${IMG_BASE}23.jpg` },
  { id: 24, name: 'Autoperforante Madera-Metal 5×50', category: 'autoperforantes', description: 'Autoperforante para fijación de madera sobre perfiles de acero. 5×50mm. Alta resistencia.', image: `${IMG_BASE}24.jpg` },
  { id: 25, name: 'Taco Fischer S6', category: 'tarugos', description: 'Taco de nylon S6 para pared. Acepta tornillos de 3 a 5mm. Para mampostería y hormigón.', image: `${IMG_BASE}25.jpg` },
  { id: 26, name: 'Taco Fischer S8', category: 'tarugos', description: 'Taco de nylon S8 reforzado. Para tornillos de 4 a 6mm. Alta capacidad de carga.', image: `${IMG_BASE}26.jpg` },
  { id: 27, name: 'Taco Metálico Expansor M10', category: 'tarugos', description: 'Taco metálico de expansión M10 para hormigón y mampostería. Alta capacidad de carga.', image: `${IMG_BASE}27.jpg` },
  { id: 28, name: 'Taco Químico con Varilla M10', category: 'tarugos', description: 'Taco químico de resina epóxica con varilla roscada M10. Para anclajes de alta resistencia.', image: `${IMG_BASE}28.jpg` },
  { id: 29, name: 'Taco Golpe Nylon 6×35', category: 'tarugos', description: 'Taco golpe de nylon 6×35mm. Instalación rápida. Para colgar objetos livianos.', image: `${IMG_BASE}29.jpg` },
  { id: 30, name: 'Taco Mariposa para Yeso', category: 'tarugos', description: 'Taco mariposa para placa de yeso. Hasta 25kg. Instalación desde el frente.', image: `${IMG_BASE}30.jpg` },
  { id: 31, name: 'Taco Metálico Aro M8', category: 'tarugos', description: 'Taco de expansión metálico tipo aro para hormigón. M8. Instalación a golpe.', image: `${IMG_BASE}31.jpg` },
  { id: 32, name: 'Taco Universal Nylon 10×60', category: 'tarugos', description: 'Taco universal de nylon 10×60mm. Compatible con tornillos de 6 a 8mm. Todo tipo de paredes.', image: `${IMG_BASE}32.jpg` },
];

const formatted = DEFAULT_PRODUCTS.map(p => {
  const stringId = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return {
    id: stringId,
    name: p.name,
    category: p.category,
    image: p.image,
    description: p.description,
    variants: [
      { id: `${stringId}-1`, medida: 'Estándar', presentacion: 'Caja x 100 U.', descripcion: `${p.name} Estándar` },
      { id: `${stringId}-2`, medida: 'Largo', presentacion: 'Caja x 50 U.', descripcion: `${p.name} Largo` }
    ]
  };
});

fs.writeFileSync('productos.json', JSON.stringify(formatted, null, 2));
console.log('Done!');
