// Productos y tiendas de las verticales transcritos de las capturas IMG_9119–9126 del 26-09-2026.
// Ninguna pantalla los lee: las verticales muestran la API (`/catalog`). Quedan solo para `data/catalog.js`, el índice del
// buscador local y del cerebro local de Mochi, hasta que la etapa 3 los reemplace. Las tiendas no tienen `id`: la
// página de tienda las trata como «no está en el catálogo».
// Lo que la captura no deja ver (texto cortado en el borde o bajo la barra) va marcado como "supuesto".
import logoUnimarc from '../assets/logo-unimarc.webp'
import logoAhumada from '../assets/logo-ahumada.webp'

const v = import.meta.glob('../assets/v/*.webp', { eager: true, import: 'default' })
const a = (name) => v[`../assets/v/${name}.webp`]

const ORANGE_BOLT = 'bolt-orange'

// Precio sin descuento: sin `before` ni `discount` (Express muestra así sus productos).
function product(id, img, price, before, discount, name, size, unit, store, extra = {}) {
  return { id, img, price, before, discount, name, size, unit, ...store, ...extra }
}

// `vertical`: id del prototipo de la tienda (va en los eventos y en los pedidos a rappi-ia).
// `concept`: concepto de rappi-ia cuando el del tema local no calza (un perfume es fragancias, no maquillaje).
const UNIMARC = { store: 'Unimarc', storeLogo: logoUnimarc, eta: 'Sun, 9 AM', etaIcon: 'clock', vertical: 'grocery' }
const AHUMADA = { store: 'Farmacias Ahumada', storeLogo: logoAhumada, eta: 'Sun, 11 AM', etaIcon: 'bolt', vertical: 'pharmacy' }
const CRUZ_VERDE = { store: 'Cruz Verde', storeBadge: '#1d9c3f', eta: '26 min or sched.', etaIcon: 'bolt', vertical: 'pharmacy' }
const RIPLEY = { store: 'Ripley', storeBadge: '#c4007a', eta: 'Sun, 10 AM', etaIcon: 'clock', vertical: 'retail' }
const OXXO = { store: 'OXXO', storeLogo: a('logo-oxxo'), eta: 'Sun, 10 AM', etaIcon: 'bolt', vertical: 'express' }

export const VERTICAL_PRODUCTS = [
  // Detox (Grocery). Tienda, tamaño y nombre completo: supuestos (quedan bajo el borde de la captura).
  product('gro-heineken', a('gro-p0'), '$7.990', '$12.550', '-36%', 'Heineken Cerveza Lager Lata 12 pack', '12 X 350 mL', '$1.90/ml', UNIMARC),
  product('gro-molina', a('gro-p1'), '$7.690', '$9.290', '-17%', 'Castillo de Molina Cabernet Sauvignon', '750 mL', '$10.25/ml', UNIMARC),
  product('gro-cristal', a('gro-p2'), '$12.990', '$17.550', '-26%', 'Cristal Cerveza Lager Botella 12 pack', '12 X 330 mL', '$3.28/ml', UNIMARC, { partial: true }),

  // Beauty Week (Pharmacy)
  product('pha-eucerin', a('pha-p0'), '$7.190', '$14.000', '-49%', 'Eucerin Pomada Reparadora Aquaphor', '1 X 55 mL', '$130.74/ml', AHUMADA),
  product('pha-cerave', a('pha-p1'), '$16.090', '$20.000', '-20%', 'CeraVe Gel Limpiador Espumoso', '1 X 473 mL', '$34.02/ml', AHUMADA),
  product('pha-desmaq', a('pha-p2'), '$1.950', '$2.790', '-30%', 'Beauty Toallitas Desmaquillantes', '1 x 200 Und', '$9.76/und', CRUZ_VERDE, { partial: true }),

  // Beauty Week (Retail)
  product('ret-ck', a('ret-p0'), '$24.990', '$52.990', '-53%', 'Ck In2u Men 50 Edt Ml', '1 Und', '$24990/und', RIPLEY, { concept: 'fragancias' }),
  product('ret-clinique', a('ret-p1'), '$20.900', '$27.900', '-25%', 'Clinique Labial Pop Cheek + Lip Oil', '1 x 7 mL', '$2985.72/ml', RIPLEY),
  product('ret-abgold', a('ret-p2'), '$27.990', '$37.990', '-26%', 'Ab Gold Edt 200 Ml', '1 Und', '$27990/und', RIPLEY, { partial: true, concept: 'fragancias' }),

  // Detox (Express)
  product('exp-sahnenuss', a('exp-p0'), '$3.190', null, null, 'Sahne-Nuss Barra de Chocolate de Almendras', '1 X 90 g', '$35.45/g', OXXO),
  product('exp-kryzpo', a('exp-p1'), '$2.690', null, null, 'Kryzpo Botana Wavy con Sal de Mar', '110 g', '$24.46/g', OXXO),
  product('exp-marcopolo', a('exp-p2'), '$4.090', null, null, 'Marco Polo Papas Fritas Rústicas', '185 g', '$22.11/g', OXXO, { partial: true }),
]

/** Tienda de una vertical (`vertical`: su id) en el formato que usan la página de tienda y el buscador. */
function toStore(store, vertical) {
  return {
    vertical,
    name: store.name,
    img: store.logo,
    logo: true,
    eta: store.eta,
    etaIcon: store.etaIcon === ORANGE_BOLT ? 'bolt' : store.etaIcon,
    deliveryLabel: store.promo,
  }
}

// Por vertical, en el orden en que aparecían las pantallas.
const STORES = {
  liquor: [
    // Ultra Rappido
    { name: 'Rappi Drinks', logo: a('logo-turbolicores'), eta: '10 - 13 min', etaIcon: ORANGE_BOLT, promo: 'Free Service Fee' },
    // Liquors
    { name: 'Copetexpress', logo: a('logo-copetexpress'), eta: 'Desde 24 min or sched.', etaIcon: ORANGE_BOLT, promo: 'Up to 51% Off' },
    { name: 'Botillería Y Minimarket Los Molinos', logo: a('logo-losmolinos'), eta: 'Desde 24 min or sched.', etaIcon: ORANGE_BOLT, promo: '15% Off' },
    { name: 'Liquidos', logo: a('logo-liquidos2'), eta: 'Sun, 11 AM', etaIcon: ORANGE_BOLT, promo: 'Up to 20% Off' },
  ],
  pet: [
    { name: 'PetCity - Atenas', logo: a('logo-petcity'), eta: 'Mon, 9 AM', etaIcon: ORANGE_BOLT, promo: 'Up to 15% Off' },
    { name: 'Tus Mascotas', logo: a('logo-tusmascotas'), eta: 'Sun, 10 AM', etaIcon: ORANGE_BOLT, promo: '$5.000 Off: min $40K' },
    { name: 'SuperZoo', logo: a('logo-superzoo'), eta: 'Sun, 10 AM', etaIcon: ORANGE_BOLT },
  ],
  chocolates: [
    // Chocolate shops
    { name: 'Caramel', logo: a('logo-caramel'), eta: 'Mon, 10 AM', etaIcon: 'clock' },
    { name: 'Dulces Altiro', logo: a('logo-dulcesaltiro'), eta: 'Sun, 11 AM', etaIcon: 'clock' },
    { name: 'Entrelagos', logo: a('logo-entrelagos'), eta: 'Sun, 12 PM', etaIcon: 'clock' },
    // Pastries
    { name: 'AM Dulcería · 1979', logo: a('logo-amdulceria'), eta: 'Sun, 12 PM', etaIcon: 'clock', promo: 'Free Service Fee' },
    { name: 'De Pura Madre', logo: a('logo-purapadre'), eta: 'Sun, 11 AM', etaIcon: 'clock' },
  ],
}

export const VERTICAL_STORES = Object.entries(STORES).flatMap(([vertical, stores]) =>
  stores.map((store) => toStore(store, vertical)),
)
