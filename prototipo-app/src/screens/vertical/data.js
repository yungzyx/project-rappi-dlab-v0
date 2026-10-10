// Lo que no es catálogo de las verticales abiertas desde los accesos de la Home (capturas IMG_9119–9126 del 26-09-2026):
// título, filas de categorías y banners. Las tiendas y los productos salen de la API (`/catalog`).
const v = import.meta.glob('../../assets/v/*.webp', { eager: true, import: 'default' })
const a = (name) => v[`../../assets/v/${name}.webp`]

// Cada categoría es `[etiqueta de la captura (en inglés), consulta en español]`: tocarla busca esa consulta en el
// catálogo, con la vertical de la pantalla.
function catRow(prefix, items, partialLast = false) {
  return items.map(([label, query], i) => ({
    id: `${prefix}-${i}`,
    label,
    query,
    img: a(`${prefix}-cat${i}`),
    partial: partialLast && i === items.length - 1,
  }))
}

export const VERTICALS = {
  grocery: {
    title: 'Grocery',
    categoryRows: [
      catRow(
        'gro',
        [
          ['Groceries', 'despensa'],
          ['Express', 'snacks'],
          ['Produce', 'frutas y verduras'],
          ['Meat & Seafood', 'carnes y pescados'],
          ['Drugstore', 'medicamentos'],
        ],
        true,
      ),
    ],
    banners: [
      { id: 'bancoestado', label: 'Promoción BancoEstado', img: a('banner-bancoestado'), toast: 'Promoción válida con Tarjeta Visa BancoEstado' },
      { id: 'bancobice', label: 'Cupón Banco BICE', img: a('banner-bancobice'), toast: 'Cupón BSRAPPISEP26 copiado' },
    ],
  },

  pharmacy: {
    title: 'Pharmacy',
    categoryRows: [
      catRow(
        'pha',
        [
          ['Beauty', 'belleza'],
          ['Sexual health', 'salud sexual'],
          ['Pain relief', 'analgésicos'],
          ['Vitamins and supplements', 'vitaminas'],
          ['First-aid medical', 'primeros auxilios'],
        ],
        true,
      ),
      catRow(
        'pha2',
        [
          ['Personal care', 'cuidado personal'],
          ['Flu and allergies', 'resfrío y alergias'],
          ['Digestive health', 'salud digestiva'],
          ['Baby care', 'cuidado del bebé'],
          ['Visual health', 'salud visual'],
        ],
        true,
      ),
    ],
  },

  retail: {
    title: 'Retail',
    scrollCategories: true,
    categoryRows: [
      catRow('ret', [
        ['Beauty and health', 'belleza'],
        ['Stationery and office', 'útiles de oficina'],
        ['Fashion', 'ropa'],
        ['Tools and garden', 'herramientas y jardín'],
        ['Sex shop', 'sex shop'],
      ]),
      catRow('ret2', [
        ['Technology', 'tecnología'],
        ['Decoration and home', 'decoración del hogar'],
        ['Flowers and plants', 'flores y plantas'],
        ['Baby and kids accessories', 'accesorios para bebé'],
        ['Parties', 'fiesta'],
      ]),
    ],
  },

  liquor: {
    title: 'Liquor',
    scrollCategories: true,
    categoryRows: [
      catRow('liq', [
        ['Beers and ciders', 'cerveza'],
        ['Wines', 'vino'],
        ['Liquors', 'licores'],
        ['Mixers and drinks', 'bebidas'],
        ['Ready to drink', 'cócteles'],
      ]),
    ],
  },

  express: {
    title: 'Express',
    categoryRows: [
      catRow(
        'exp',
        [
          ['Specialized', 'productos especiales'],
          ['Market', 'mercado'],
          ['Kiosk', 'kiosco'],
          ['Pets', 'mascotas'],
          ['Meat', 'carne'],
        ],
        true,
      ),
    ],
  },

  chocolates: {
    title: 'Chocolates',
    categoryRows: [],
  },
}
