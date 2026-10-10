// Lo que no es catálogo de las verticales abiertas desde los accesos de la Home (capturas IMG_9119–9126 del 26-09-2026):
// título, filas de categorías y banners. Las tiendas y los productos salen de la API (`/catalog`).
const v = import.meta.glob('../../assets/v/*.webp', { eager: true, import: 'default' })
const a = (name) => v[`../../assets/v/${name}.webp`]

function catRow(prefix, labels, partialLast = false) {
  return labels.map((label, i) => ({
    id: `${prefix}-${i}`,
    label,
    img: a(`${prefix}-cat${i}`),
    partial: partialLast && i === labels.length - 1,
  }))
}

export const VERTICALS = {
  grocery: {
    title: 'Grocery',
    categoryRows: [catRow('gro', ['Groceries', 'Express', 'Produce', 'Meat & Seafood', 'Drugstore'], true)],
    banners: [
      { id: 'bancoestado', label: 'Promoción BancoEstado', img: a('banner-bancoestado'), toast: 'Promoción válida con Tarjeta Visa BancoEstado' },
      { id: 'bancobice', label: 'Cupón Banco BICE', img: a('banner-bancobice'), toast: 'Cupón BSRAPPISEP26 copiado' },
    ],
  },

  pharmacy: {
    title: 'Pharmacy',
    categoryRows: [
      catRow('pha', ['Beauty', 'Sexual health', 'Pain relief', 'Vitamins and supplements', 'First-aid medical'], true),
      catRow('pha2', ['Personal care', 'Flu and allergies', 'Digestive health', 'Baby care', 'Visual health'], true),
    ],
  },

  retail: {
    title: 'Retail',
    scrollCategories: true,
    categoryRows: [
      catRow('ret', ['Beauty and health', 'Stationery and office', 'Fashion', 'Tools and garden', 'Sex shop']),
      catRow('ret2', ['Technology', 'Decoration and home', 'Flowers and plants', 'Baby and kids accessories', 'Parties']),
    ],
  },

  liquor: {
    title: 'Liquor',
    scrollCategories: true,
    categoryRows: [catRow('liq', ['Beers and ciders', 'Wines', 'Liquors', 'Mixers and drinks', 'Ready to drink'])],
  },

  express: {
    title: 'Express',
    categoryRows: [catRow('exp', ['Specialized', 'Market', 'Kiosk', 'Pets', 'Meat'], true)],
  },

  chocolates: {
    title: 'Chocolates',
    categoryRows: [],
  },
}
